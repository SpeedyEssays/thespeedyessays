import {
  gmailSenderConfig,
  sendGmail,
  type GmailMessage,
} from "./gmail-sender.server";

const maxWait = 10 * 60 * 1000;
const retryDelay = 60 * 1000;
const jobKey = "account-email";

type Delivery = { messages: GmailMessage[]; createdAt: number };
type StoredDelivery = Delivery | "done";
type StorageTransaction = {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  setAlarm(time: number): Promise<void>;
};
type DeliveryStorage = StorageTransaction & {
  delete(key: string): Promise<boolean>;
  transaction<T>(
    apply: (transaction: StorageTransaction) => Promise<T>,
  ): Promise<T>;
};

// Each signed Supabase webhook has its own private Durable Object.
export class AuthEmailDelivery {
  private readonly storage: DeliveryStorage;

  constructor(state: { storage: DeliveryStorage }) {
    this.storage = state.storage;
  }

  async fetch(request: Request) {
    const messages = (await request.json()) as GmailMessage[];
    await this.storage.transaction(async (transaction) => {
      if (await transaction.get(jobKey)) return;
      const createdAt = Date.now();
      await transaction.put(jobKey, { messages, createdAt });
      await transaction.setAlarm(createdAt);
    });
    return new Response(null, { status: 204 });
  }

  async alarm() {
    const delivery = await this.storage.get<StoredDelivery>(jobKey);
    if (delivery === "done") {
      await this.storage.delete(jobKey);
      return;
    }
    if (!delivery) return;

    if (Date.now() - delivery.createdAt >= maxWait) {
      console.warn("An account email expired while waiting for Gmail.");
      await this.updateDelivery(null);
      return;
    }

    const config = gmailSenderConfig();
    const pending: GmailMessage[] = [];
    for (const message of delivery.messages) {
      const result = config ? await sendGmail(config, message) : "unavailable";
      if (result !== "queued") {
        pending.push(message);
        console.warn(
          `Account email is waiting for Gmail delivery (${result}).`,
        );
      }
    }
    await this.updateDelivery(
      pending.length
        ? { messages: pending, createdAt: delivery.createdAt }
        : null,
    );
  }

  private async updateDelivery(delivery: Delivery | null) {
    await this.storage.transaction(async (transaction) => {
      await transaction.put(jobKey, delivery ?? "done");
      await transaction.setAlarm(
        Date.now() + (delivery ? retryDelay : maxWait),
      );
    });
  }
}
