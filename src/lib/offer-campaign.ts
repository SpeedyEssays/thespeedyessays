export type OfferCampaignProgress = {
  id: string;
  total: number;
  sent: number;
  skipped: number;
  status: "sending" | "waiting" | "paused" | "complete";
  nextAttemptAt: number | null;
};
