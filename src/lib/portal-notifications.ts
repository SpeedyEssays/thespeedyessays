export const notificationKinds = ["notice", "offer"] as const;
export type NotificationKind =
  | (typeof notificationKinds)[number]
  | "payment-reminder"
  | "price-offer"
  | "wallet-credit";
