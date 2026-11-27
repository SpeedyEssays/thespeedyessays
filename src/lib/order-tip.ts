export const orderTipPercentages = [5, 10, 15, 20] as const;
export const orderTipReferencePattern = /^se-tip-[0-9a-f-]{36}$/;

export function canLeaveOrderTip(status: string) {
  return status === "completed" || status === "approved";
}
