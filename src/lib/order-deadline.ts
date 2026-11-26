const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export const MAX_DEADLINE_EXTENSION_HOURS = 14 * 24;
export const newDeadlineRequired =
  "The order deadline has passed. Choose a new deadline from 1 hour to 14 days.";

export function deadlineInHours(from: Date, hours: number) {
  return new Date(from.getTime() + hours * HOUR_MS);
}

export function isDeadlinePast(dueAt: Date | string, now: number) {
  return new Date(dueAt).getTime() <= now;
}

export function hasOpenDeadline(status: string) {
  return (
    status !== "completed" && status !== "approved" && status !== "cancelled"
  );
}

export function staffDeadlineRequired(
  order: { status: string; dueAt: Date | string },
  target: string,
  now: number,
) {
  return (
    order.status !== target &&
    hasOpenDeadline(target) &&
    (target === "revision" || !hasOpenDeadline(order.status)) &&
    isDeadlinePast(order.dueAt, now)
  );
}

export function formatDeadlineDistance(milliseconds: number) {
  const minutes = Math.floor(milliseconds / MINUTE_MS);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  function part(value: number, unit: string) {
    return value === 0 ? "" : `${value} ${unit}${value === 1 ? "" : "s"}`;
  }
  if (days)
    return [part(days, "day"), part(hours % 24, "hour")]
      .filter(Boolean)
      .join(" ");
  if (hours)
    return [part(hours, "hour"), part(minutes % 60, "minute")]
      .filter(Boolean)
      .join(" ");
  return part(minutes, "minute") || "less than a minute";
}
