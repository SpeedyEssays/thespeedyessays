import { Clock } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { formatDeadlineDistance, hasOpenDeadline } from "@/lib/order-deadline";
import type { OrderView } from "@/lib/orders";
import { cn } from "@/lib/utils";

export function OrderDeadline({
  order,
  now,
  showDate = false,
}: {
  order: Pick<OrderView, "dueAt" | "deliveredAt" | "status">;
  now: number | null;
  showDate?: boolean;
}) {
  const due = Date.parse(order.dueAt);
  if (!Number.isFinite(due)) return null;
  const open = hasOpenDeadline(order.status);
  const delivered = order.deliveredAt && Date.parse(order.deliveredAt);
  let label = "Deadline";
  let tone = "text-muted-foreground";
  if (order.status === "cancelled") {
    label = "Deadline closed";
  } else if (
    !open &&
    typeof delivered === "number" &&
    Number.isFinite(delivered)
  ) {
    label =
      delivered > due
        ? `Delivered ${formatDeadlineDistance(delivered - due)} late`
        : "Delivered on time";
    tone = delivered > due ? "text-destructive" : "text-success";
  } else if (open && now !== null) {
    const remaining = due - now;
    label =
      remaining > 0
        ? `Due in ${formatDeadlineDistance(remaining)}`
        : `Overdue by ${formatDeadlineDistance(-remaining)}`;
    tone = remaining > 0 ? "text-success" : "text-destructive";
  }
  const utcDate = `${order.dueAt.slice(0, 16).replace("T", " ")} UTC`;
  return (
    <span className="block" title={utcDate}>
      <span
        className={cn("inline-flex items-center gap-1.5 font-semibold", tone)}
      >
        <Clock aria-hidden="true" className="size-3.5 shrink-0" />
        {label}
      </span>
      {(showDate || label === "Deadline") && (
        <span className="block text-xs text-muted-foreground">
          {now === null ? (
            <time dateTime={order.dueAt}>{utcDate}</time>
          ) : (
            <LocalTime at={order.dueAt} />
          )}
        </span>
      )}
    </span>
  );
}
