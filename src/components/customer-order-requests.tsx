import { useCallback, useRef, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LocalTime } from "@/components/local-time";
import {
  listCustomerOrderRequests,
  requestOrderChange,
} from "@/lib/order-requests.functions";
import {
  canCancelImmediately,
  orderRequestLabels,
  type OrderRequestKind,
} from "@/lib/order-requests";
import type { OrderView } from "@/lib/orders";
import { formatUSD } from "@/lib/pricing";
import { useInboxData } from "@/lib/use-inbox-data";

export function CustomerOrderRequests({
  order,
  onChange,
}: {
  order: OrderView;
  onChange?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<OrderRequestKind | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [problem, setProblem] = useState("");
  const retry = useRef<{
    kind: OrderRequestKind;
    reason: string;
    id: string;
  } | null>(null);
  const load = useCallback(
    () => listCustomerOrderRequests({ data: { code: order.code } }),
    [order.code],
  );
  const { data: requests, error, refresh } = useInboxData(load, 30_000, open);
  const pending = (type: OrderRequestKind) =>
    requests?.some(
      (entry) => entry.kind === type && entry.status === "pending",
    );
  const canCancel = order.status !== "cancelled" && !pending("cancellation");
  const canRefund =
    Boolean(order.paidAt) &&
    order.refundedCents < Math.round(order.price * 100) &&
    !pending("refund");
  const direct = canCancelImmediately(order);

  async function send(event: FormEvent) {
    event.preventDefault();
    const value = reason.trim();
    if (busy || !kind || !value) return;
    if (retry.current?.kind !== kind || retry.current.reason !== value)
      retry.current = { kind, reason: value, id: crypto.randomUUID() };
    setBusy(true);
    setProblem("");
    setFeedback("");
    try {
      const request = await requestOrderChange({
        data: {
          code: order.code,
          kind,
          reason: value,
          requestId: retry.current.id,
        },
      });
      setFeedback(
        request.status === "approved" && kind === "cancellation"
          ? "Order cancelled. Your reason was saved."
          : `${orderRequestLabels[kind]} request sent to support.`,
      );
      setKind(null);
      setReason("");
      retry.current = null;
      refresh();
      onChange?.();
      await router.invalidate();
    } catch (failure) {
      setProblem(
        failure instanceof Error
          ? failure.message
          : "Couldn’t save the request. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <details
      className="rounded-lg border bg-background"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
        Cancellation and refund options
      </summary>
      <div className="space-y-4 border-t px-4 py-4">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !canCancel}
            onClick={() => {
              setKind("cancellation");
              setProblem("");
              setFeedback("");
              setReason("");
            }}
          >
            {direct ? "Cancel order" : "Request cancellation"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !canRefund}
            onClick={() => {
              setKind("refund");
              setProblem("");
              setFeedback("");
              setReason("");
            }}
          >
            Request a refund
          </Button>
        </div>
        {!order.paidAt && (
          <p className="text-sm text-muted-foreground">
            Refunds are available once a payment is confirmed.
          </p>
        )}
        {kind && (
          <form className="space-y-3" onSubmit={(event) => void send(event)}>
            <p className="text-sm text-muted-foreground">
              {kind === "refund"
                ? "Support will review your request and reply here."
                : direct
                  ? "This will cancel the order immediately."
                  : "Support will review your cancellation request."}
            </p>
            <div className="space-y-2">
              <Label htmlFor="order-request-reason">
                {kind === "refund"
                  ? "Reason for refund"
                  : "Reason for cancellation"}
              </Label>
              <Textarea
                id="order-request-reason"
                rows={3}
                value={reason}
                maxLength={3000}
                required
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={
                  kind === "cancellation" && direct ? "destructive" : "default"
                }
                disabled={busy || !reason.trim()}
              >
                {busy
                  ? "Saving…"
                  : kind === "cancellation" && direct
                    ? "Confirm cancellation"
                    : "Send request"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => setKind(null)}
              >
                Go back
              </Button>
            </div>
          </form>
        )}
        {problem && (
          <p className="text-sm text-destructive" role="alert">
            {problem}
          </p>
        )}
        {feedback && (
          <p className="text-sm text-success" role="status">
            {feedback}
          </p>
        )}
        {error && (
          <p className="text-sm text-destructive">
            Request history couldn’t load. Retrying…
          </p>
        )}
        {requests && requests.length > 0 && (
          <ul className="space-y-2 border-t pt-3">
            {requests.map((request) => (
              <li
                key={request.id}
                className="space-y-1 rounded-lg border bg-card p-3 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">
                    {orderRequestLabels[request.kind]} ·{" "}
                    {request.status === "pending"
                      ? "Under review"
                      : request.status === "approved"
                        ? "Approved"
                        : "Declined"}
                  </p>
                  <LocalTime
                    at={request.createdAt}
                    className="text-xs text-muted-foreground"
                  />
                </div>
                <p className="wrap-anywhere whitespace-pre-wrap text-muted-foreground">
                  {request.reason}
                </p>
                {request.amountCents && (
                  <p className="font-medium">
                    {formatUSD(request.amountCents / 100)} USD refunded
                  </p>
                )}
                {request.staffNote && (
                  <p className="wrap-anywhere whitespace-pre-wrap">
                    Support · {request.staffNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
