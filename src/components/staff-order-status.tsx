import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DeadlineDurationField } from "@/components/deadline-duration-field";
import { hasOpenDeadline, staffDeadlineRequired } from "@/lib/order-deadline";
import {
  canChangeUnpaidQuote,
  staffOrderStatuses,
  statusMeta,
  type AdminOrderView,
  type OrderStatus,
} from "@/lib/orders";
import { updateOrderStatus } from "@/lib/orders.functions";

export function StaffOrderStatus({
  order,
  now,
  onSaved,
}: {
  order: AdminOrderView;
  now: number | null;
  onSaved: (message: string) => Promise<unknown>;
}) {
  const [target, setTarget] = useState<OrderStatus>(
    order.status === "cancelled" ? "awaiting-payment" : order.status,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [deadlineHours, setDeadlineHours] = useState<number>();
  const reopened = !hasOpenDeadline(order.status) && hasOpenDeadline(target);
  const needsDeadline =
    now !== null && staffDeadlineRequired(order, target, now);
  const undelivered = order.files.filter((file) => file.access === "pending");
  const deliverAgain =
    target === "completed" &&
    order.status === "completed" &&
    undelivered.length > 0;
  const needsPreview =
    target === "completed" && undelivered.some((file) => !file.hasPreview);
  const choices = staffOrderStatuses.filter((status) => {
    if (status === order.status) return true;
    if (status === "cancelled") return canChangeUnpaidQuote(order);
    if (status === "paid") return Boolean(order.paidAt);
    if (status === "awaiting-payment") return !order.paidAt;
    return true;
  });
  const fileNeeded =
    target === "completed"
      ? "final"
      : target === "draft-ready"
        ? "paper"
        : null;
  const missingFile =
    (target !== order.status || deliverAgain) &&
    fileNeeded &&
    !order.files.some((file) => file.kind === fileNeeded);
  const canSave =
    target !== "approved" &&
    (target !== order.status || deliverAgain) &&
    choices.includes(target) &&
    !missingFile &&
    !needsPreview &&
    (!needsDeadline || deadlineHours !== undefined);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canSave) return;
    setBusy(true);
    setProblem("");
    try {
      await updateOrderStatus({
        data: {
          code: order.code,
          status: target,
          currentStatus: order.status,
          deliveryVersion: order.deliveryVersion,
          ...(needsDeadline ? { deadlineHours } : {}),
        },
      });
      await onSaved(
        target === "completed"
          ? "Delivery sent."
          : reopened
            ? "Order reopened."
            : "Order status saved.",
      );
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Couldn’t update this order. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="space-y-3 rounded-xl border bg-card p-4"
      onSubmit={(event) => void save(event)}
    >
      <Label htmlFor="staff-order-status" className="font-semibold">
        Change order status
      </Label>
      <div className="flex flex-wrap gap-2">
        <select
          id="staff-order-status"
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
          value={target}
          disabled={busy}
          onChange={(event) => {
            setTarget(event.target.value as OrderStatus);
            setDeadlineHours(undefined);
            setProblem("");
          }}
        >
          {order.status === "approved" && (
            <option value="approved">Approved by customer</option>
          )}
          {choices.map((status) => (
            <option key={status} value={status}>
              {status === "completed"
                ? "Completed (delivered)"
                : statusMeta[status].label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={busy || !canSave}>
          {busy
            ? "Saving…"
            : deliverAgain
              ? "Deliver new files"
              : target === "completed"
                ? "Mark as delivered"
                : reopened
                  ? "Reopen order"
                  : "Save status"}
        </Button>
      </div>
      {needsDeadline && (
        <DeadlineDurationField
          key={target}
          id="reopen-duration"
          description="The saved deadline has passed. Set a new turnaround to continue this order."
          disabled={busy}
          onChange={setDeadlineHours}
        />
      )}
      {reopened && (
        <p className="text-xs text-muted-foreground">
          Reopen this order to keep its number, files and messages.
        </p>
      )}
      {missingFile && (
        <p className="text-xs text-muted-foreground">
          {fileNeeded === "final"
            ? "Upload the final copy before marking this order delivered."
            : "Upload a draft before marking this order draft ready."}
        </p>
      )}
      {needsPreview && (
        <p className="text-xs text-muted-foreground">
          Use Add preview beside each new final or soft copy before delivering
          it.
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </form>
  );
}
