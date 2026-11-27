import { AsyncLocalStorage } from "node:async_hooks";
import type { GmailMessage } from "./gmail-sender.server";
import type { OfferCampaignProgress } from "./offer-campaign";

export type OfferCampaignBinding = {
  getByName(name: string): { fetch(request: Request): Promise<Response> };
};

export type OfferCampaignInput = {
  id: string;
  recipients: string[];
  email: Pick<GmailMessage, "subject" | "text" | "html">;
};

const workerBinding = new AsyncLocalStorage<OfferCampaignBinding | undefined>();

export function withOfferCampaignBinding<T>(
  binding: OfferCampaignBinding | undefined,
  run: () => T,
) {
  return workerBinding.run(binding, run);
}

export async function offerCampaignRequest(
  action: "start" | "status" | "resume",
  input?: OfferCampaignInput,
) {
  const binding = workerBinding.getStore();
  if (!binding) {
    throw new Error(
      "All-customer email delivery is unavailable. Contact the site owner.",
    );
  }
  const response = await binding.getByName("customer-offers").fetch(
    new Request(`https://offer-email.internal/${action}`, {
      method: action === "status" ? "GET" : "POST",
      ...(input
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }
        : {}),
    }),
  );
  if (response.status === 409)
    throw new Error("An all-customer campaign is already in progress.");
  if (!response.ok)
    throw new Error(
      "The campaign could not be saved. Try again here to reuse the same request.",
    );
  return (await response.json()) as OfferCampaignProgress | null;
}
