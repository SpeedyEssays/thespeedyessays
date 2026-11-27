import { useCallback, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  listStaffOrderRequests,
  resolveOrderRequest,
} from "@/lib/order-requests.functions";
import { orderRequestLabels } from "@/lib/order-requests";
import { formatUSD } from "@/lib/pricing";
import { useInboxData } from "@/lib/use-inbox-data";
import { parseUSDCents } from "@/lib/wallet";

type OrderRequest = Awaited<ReturnType<typeof listStaffOrderRequests>>[number];

export function StaffOrderRequests({ code }: { code?: string }) {
  const load = useCallback(
    () => listStaffOrderRequests({ data: { code } }),
    [code],
  );
  const { data, error, refresh } = useInboxData(load, 15_000);
  const [includeReviewed, setIncludeReviewed] = useState(Boolean(code));
  const requests = data?.filter(
    (request) => includeReviewed || request.status === "pending",
  );
  return (
    <section aria-labelledby="staff-order-requests" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="staff-order-requests" className="text-2xl font-semibold">
          Cancellation and refund requests
        </h2>
        {code && (
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin" search={{ tab: "requests" }}>
              All order requests
            </Link>
          </Button>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeReviewed}
            onChange={(event) => setIncludeReviewed(event.target.checked)}
          />
          Show reviewed requests
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          Requests couldn’t load. Retrying…
        </p>
      )}
      {data === null && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading requests…
        </p>
      )}
      {requests?.length === 0 && (
        <p className="rounded-lg border bg-card p-5 text-sm text-muted-foreground">
          {includeReviewed
            ? "There are no cancellation or refund requests yet."
            : "No requests are waiting for review."}
        </p>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-2">
        {requests?.map((request) => (
          <RequestCard key={request.id} request={request} onSaved={refresh} />
        ))}
      </div>
    </section>
  );
}

function RequestCard({
  request,
  onSaved,
}: {
  request: OrderRequest;
  onSaved: () => void;
}) {
  const [decision, setDecision] = useState<"approved" | "declined">("approved");
  const [amount, setAmount] = useState(
    (request.remainingCents / 100).toFixed(2),
  );
  const [refundId, setRefundId] = useState("");
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const refund = request.kind === "refund";
  const wallet = request.paymentMethod === "wallet";
  const approveRefund = refund && decision === "approved";
  const amountCents = parseUSDCents(amount);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setProblem("");
    try {
      await resolveOrderRequest({
        data: {
          id: request.id,
          decision,
          note,
          ...(approveRefund && wallet && amountCents ? { amountCents } : {}),
          ...(approveRefund && !wallet
            ? { providerRefundId: refundId.trim() }
            : {}),
        },
      });
      onSaved();
    } catch (failure) {
      setProblem(
        failure instanceof Error
          ? failure.message
          : "Couldn’t save this decision. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          {orderRequestLabels[request.kind]} · {request.code}
        </h3>
        <span className="rounded-full border bg-secondary px-2 py-1 text-xs capitalize">
          {request.status}
        </span>
      </div>
      <div className="space-y-1 text-sm">
        <Link
          to="/admin"
          search={{ tab: "orders", order: request.code }}
          className="font-medium underline underline-offset-2"
        >
          {request.title}
        </Link>
        <p className="break-all text-muted-foreground">{request.email}</p>
        <LocalTime
          at={request.createdAt}
          className="text-xs text-muted-foreground"
        />
      </div>
      <p className="wrap-anywhere whitespace-pre-wrap rounded-md border bg-background p-3 text-sm">
        {request.reason}
      </p>
      {request.amountCents && (
        <p className="text-sm font-medium">
          {formatUSD(request.amountCents / 100)} USD refunded
        </p>
      )}
      {request.staffNote && (
        <p className="wrap-anywhere whitespace-pre-wrap text-sm">
          Support · {request.staffNote}
        </p>
      )}
      {request.status === "pending" && (
        <form
          className="space-y-3 border-t pt-3"
          onSubmit={(event) => void save(event)}
        >
          {request.paid && (
            <p className="text-sm text-muted-foreground">
              {formatUSD(request.remainingCents / 100)} USD{" "}
              {refund ? "remaining to refund" : "paid balance"} ·{" "}
              {wallet ? "Wallet" : "Paystack"}
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor={`decision-${request.id}`}>Decision</Label>
            <select
              id={`decision-${request.id}`}
              disabled={busy}
              value={decision}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              onChange={(event) =>
                setDecision(event.target.value as typeof decision)
              }
            >
              <option value="approved">
                {refund
                  ? wallet
                    ? "Refund to wallet"
                    : "Verify Paystack refund"
                  : "Approve cancellation"}
              </option>
              <option value="declined">Decline request</option>
            </select>
          </div>
          {approveRefund && wallet && (
            <div className="space-y-2">
              <Label htmlFor={`refund-amount-${request.id}`}>
                Refund amount in USD
              </Label>
              <Input
                id={`refund-amount-${request.id}`}
                inputMode="decimal"
                value={amount}
                required
                disabled={busy}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          )}
          {approveRefund && !wallet && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Process the refund in Paystack, then enter its processed refund
                ID.
              </p>
              {request.paymentReference && (
                <p className="wrap-anywhere text-xs">
                  Transaction {request.paymentReference}
                </p>
              )}
              <Label htmlFor={`refund-id-${request.id}`}>
                Paystack refund ID
              </Label>
              <Input
                id={`refund-id-${request.id}`}
                inputMode="numeric"
                pattern="[1-9][0-9]{0,15}"
                value={refundId}
                required
                disabled={busy}
                onChange={(event) => setRefundId(event.target.value)}
              />
            </div>
          )}
          {request.kind === "cancellation" &&
            request.paid &&
            decision === "approved" && (
              <p className="text-xs text-muted-foreground">
                Review any refund separately so the payment is returned through
                its original method.
              </p>
            )}
          <div className="space-y-2">
            <Label htmlFor={`review-note-${request.id}`}>
              {decision === "declined"
                ? "Reason for declining"
                : "Message to customer (optional)"}
            </Label>
            <Textarea
              id={`review-note-${request.id}`}
              rows={2}
              value={note}
              maxLength={2000}
              disabled={busy}
              required={decision === "declined"}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <Button
            size="sm"
            disabled={
              busy ||
              (approveRefund &&
                wallet &&
                (!amountCents || amountCents > request.remainingCents))
            }
          >
            {busy ? "Saving…" : "Save decision"}
          </Button>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
        </form>
      )}
    </article>
  );
}
