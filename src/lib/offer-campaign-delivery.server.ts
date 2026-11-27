import { z } from "zod";
import { withWorkerDatabase } from "../../db";
import { findOfferRecipientEmail } from "./customers.server";
import { gmailSenderConfig, sendGmail } from "./gmail-sender.server";
import type { OfferCampaignInput } from "./offer-campaign.server";
import type { OfferCampaignProgress } from "./offer-campaign";

const day = 24 * 60 * 60 * 1000;
const retryDelay = 60 * 1000;
const recipientBatchSize = 500;
// Leave part of the consumer Gmail quota available for account and order emails.
const dailyCampaignLimit = 80;
const latestKey = "latest-campaign";
const recentSendsKey = "campaign-send-times";
const emailInput = z.email().max(320);

type Campaign = OfferCampaignProgress & {
  email: OfferCampaignInput["email"] | null;
  attempts: number;
};

type StorageTransaction = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  setAlarm(time: number): Promise<void>;
};
type CampaignStorage = StorageTransaction & {
  transaction<T>(
    callback: (transaction: StorageTransaction) => Promise<T>,
  ): Promise<T>;
};
type Environment = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  REUSE_DATABASE_CONNECTIONS?: boolean;
};

const campaignKey = (id: string) => `campaign:${id}`;
const recipientsKey = (id: string, batch: number) =>
  `recipients:${id}:${batch}`;

function progress(
  campaign: Campaign | undefined,
): OfferCampaignProgress | null {
  if (!campaign) return null;
  const { id, total, sent, skipped, status, nextAttemptAt } = campaign;
  return { id, total, sent, skipped, status, nextAttemptAt };
}

export class OfferCampaignDelivery {
  private readonly storage: CampaignStorage;

  constructor(
    state: { storage: CampaignStorage },
    private readonly env: Environment,
  ) {
    this.storage = state.storage;
  }

  async fetch(request: Request) {
    const { pathname } = new URL(request.url);
    if (request.method === "GET" && pathname === "/status")
      return Response.json(progress(await this.latest(this.storage)));
    if (request.method !== "POST") return new Response(null, { status: 405 });
    if (pathname === "/resume") {
      const resumed = await this.storage.transaction(async (tx) => {
        const campaign = await this.latest(tx);
        if (campaign?.status !== "paused") return campaign;
        const next: Campaign = { ...campaign, status: "sending", attempts: 0 };
        await tx.put(campaignKey(next.id), next);
        await tx.setAlarm(Date.now());
        return next;
      });
      return Response.json(progress(resumed));
    }
    if (pathname !== "/start") return new Response(null, { status: 404 });
    const input = (await request.json()) as OfferCampaignInput;
    const campaign = await this.storage.transaction(async (tx) => {
      const previous = await tx.get<Campaign>(campaignKey(input.id));
      if (previous) return previous;
      const active = await this.latest(tx);
      if (active && active.status !== "complete") return null;

      const next: Campaign = {
        id: input.id,
        total: input.recipients.length,
        sent: 0,
        skipped: 0,
        status: "sending",
        nextAttemptAt: null,
        attempts: 0,
        email: input.email,
      };
      for (let start = 0; start < next.total; start += recipientBatchSize) {
        await tx.put(
          recipientsKey(next.id, start / recipientBatchSize),
          input.recipients.slice(start, start + recipientBatchSize),
        );
      }
      await tx.put(campaignKey(next.id), next);
      await tx.put(latestKey, next.id);
      await tx.setAlarm(Date.now());
      return next;
    });
    return campaign
      ? Response.json(progress(campaign))
      : new Response(null, { status: 409 });
  }

  async alarm() {
    const campaign = await this.latest(this.storage);
    if (!campaign?.email || campaign.status === "paused") return;

    const now = Date.now();
    const sends = (
      (await this.storage.get<number[]>(recentSendsKey)) ?? []
    ).filter((at) => at > now - day);
    if (sends.length >= dailyCampaignLimit) {
      await this.pauseUntil(campaign, Math.min(...sends) + day + 1000);
      return;
    }

    const config = gmailSenderConfig();
    if (!config) {
      await this.pauseUntil(campaign, null);
      return;
    }
    const index = campaign.sent + campaign.skipped;
    const key = recipientsKey(
      campaign.id,
      Math.floor(index / recipientBatchSize),
    );
    const batch = await this.storage.get<string[]>(key);
    const userId = batch?.[index % recipientBatchSize];
    if (!userId) throw new Error("The campaign recipient could not be loaded.");

    let result: Awaited<ReturnType<typeof sendGmail>> | "skipped";
    try {
      const email = await withWorkerDatabase(
        this.env.HYPERDRIVE?.connectionString ?? this.env.DATABASE_URL,
        () => findOfferRecipientEmail(userId),
        this.env.REUSE_DATABASE_CONNECTIONS === true,
      );
      const to = emailInput.safeParse(email).data;
      result = to
        ? await sendGmail(config, {
            ...campaign.email,
            id: `campaign:${campaign.id}:${userId}`,
            to,
          })
        : "skipped";
    } catch {
      result = "unavailable";
    }
    if (result === "quota") {
      await this.pauseUntil(campaign, Date.now() + 60 * retryDelay);
      return;
    }
    if (result !== "queued" && result !== "skipped") {
      const attempts = campaign.attempts + 1;
      await this.pauseUntil(
        { ...campaign, attempts },
        attempts < 4 ? Date.now() + retryDelay : null,
      );
      return;
    }

    const sent = result === "queued";
    const complete = index + 1 === campaign.total;
    await this.storage.transaction(async (tx) => {
      await tx.put<Campaign>(campaignKey(campaign.id), {
        ...campaign,
        status: complete ? "complete" : "sending",
        email: complete ? null : campaign.email,
        sent: campaign.sent + Number(sent),
        skipped: campaign.skipped + Number(!sent),
        attempts: 0,
        nextAttemptAt: null,
      });
      if (sent) await tx.put(recentSendsKey, [...sends, Date.now()]);
      if (complete || (index + 1) % recipientBatchSize === 0)
        await tx.delete(key);
      if (!complete) await tx.setAlarm(Date.now() + 1000);
    });
  }

  private async latest(storage: StorageTransaction) {
    const id = await storage.get<string>(latestKey);
    return id ? storage.get<Campaign>(campaignKey(id)) : undefined;
  }

  private async pauseUntil(campaign: Campaign, nextAttemptAt: number | null) {
    await this.storage.transaction(async (tx) => {
      await tx.put<Campaign>(campaignKey(campaign.id), {
        ...campaign,
        status: nextAttemptAt === null ? "paused" : "waiting",
        nextAttemptAt,
      });
      if (nextAttemptAt !== null) await tx.setAlarm(nextAttemptAt);
    });
  }
}
