export const orderEmailKinds = [
  "action-needed",
  "clarification",
  "delivered",
] as const;
export const orderEmailNoteLimit = 1200;

export type OrderEmailKind = (typeof orderEmailKinds)[number];

export const orderEmailTemplates = {
  "action-needed": {
    label: "Action needed",
    subject: "Action needed for order",
    heading: "Your order needs your attention",
    body: "Open your order for details. If you have a question, reply under Order messages.",
    button: "Open your order",
  },
  clarification: {
    label: "Clarification needed",
    subject: "Clarification needed for order",
    heading: "We have a question about your order",
    body: "Please open your order and reply under Order messages so our team can continue.",
    button: "Reply in your order",
  },
  delivered: {
    label: "Order delivered",
    subject: "Your completed order is ready",
    heading: "Your final copy is ready",
    body: "We’ve delivered your order. Open your customer portal to review and download the final copy.",
    button: "View your delivery",
  },
} satisfies Record<
  OrderEmailKind,
  {
    label: string;
    subject: string;
    heading: string;
    body: string;
    button: string;
  }
>;

export function orderEmailSubject(kind: OrderEmailKind, code: string) {
  return kind === "delivered"
    ? `SpeedyEssays · ${orderEmailTemplates[kind].subject} (${code})`
    : `SpeedyEssays · ${orderEmailTemplates[kind].subject} ${code}`;
}

export function canSendDeliveryEmail(order: {
  status: string;
  deliveredAt: string | Date | null;
}) {
  return (
    Boolean(order.deliveredAt) &&
    (order.status === "completed" || order.status === "approved")
  );
}
