import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
  onSaved,
}: {
  order: AdminOrderView;
  onSaved: (message: string) => Promise<unknown>;
}) {
  const reopened = order.status === "cancelled";
  const [target, setTarget] = useState<OrderStatus>(
    reopened ? "awaiting-payment" : order.status,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
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
    target !== order.status &&
    fileNeeded &&
    !order.files.some((file) => file.kind === fileNeeded);
  const canSave =
    target !== "approved" &&
    target !== order.status &&
    choices.includes(target) &&
    !missingFile;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canSave) return;
    setBusy(true);
    setProblem("");
    try {
      await updateOrderStatus({
        data: { code: order.code, status: target, currentStatus: order.status },
      });
      await onSaved(reopened ? "Order reopened." : "Order status saved.");
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
          {busy ? "Saving…" : reopened ? "Reopen order" : "Save status"}
        </Button>
      </div>
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
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </form>
  );
}
