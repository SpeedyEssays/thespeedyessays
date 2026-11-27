export const orderRequestKinds = ["cancellation", "refund"] as const;
export type OrderRequestKind = (typeof orderRequestKinds)[number];

export const orderRequestStatuses = [
  "pending",
  "approved",
  "declined",
] as const;
export type OrderRequestStatus = (typeof orderRequestStatuses)[number];

export const orderRequestLabels: Record<OrderRequestKind, string> = {
  cancellation: "Cancellation",
  refund: "Refund",
};

export function canCancelImmediately(order: {
  status: string;
  paidAt: Date | string | null;
  deliveredAt: Date | string | null;
}) {
  return (
    !order.paidAt &&
    !order.deliveredAt &&
    !["completed", "approved", "cancelled"].includes(order.status)
  );
}
