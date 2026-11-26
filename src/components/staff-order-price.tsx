import { useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  canChangeUnpaidQuote,
  canCheckout,
  type AdminOrderView,
} from "@/lib/orders";
import { offerOrderPrice } from "@/lib/orders.functions";
import { formatUSD, MIN_CHECKOUT_CENTS } from "@/lib/pricing";

export function StaffOrderPrice({
  order,
  onSaved,
}: {
  order: AdminOrderView;
  onSaved: (message: string) => Promise<unknown>;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const lastRequest = useRef<{ cents: number; id: string } | null>(null);
  const current = Math.round(order.price * 100);
  const eligible =
    canCheckout(order) &&
    canChangeUnpaidQuote(order) &&
    current > MIN_CHECKOUT_CENTS;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !eligible) return;
    const cents = Math.round(Number(amount) * 100);
    if (
      !/^\d+(?:\.\d{1,2})?$/.test(amount) ||
      cents < MIN_CHECKOUT_CENTS ||
      cents >= current
    ) {
      setProblem(
        `Enter a price from ${formatUSD(MIN_CHECKOUT_CENTS / 100)} to ${formatUSD((current - 1) / 100)} USD.`,
      );
      return;
    }
    if (lastRequest.current?.cents !== cents)
      lastRequest.current = { cents, id: crypto.randomUUID() };
    setBusy(true);
    setProblem("");
    try {
      await offerOrderPrice({
        data: {
          code: order.code,
          expectedCents: current,
          priceCents: cents,
          requestId: lastRequest.current.id,
        },
      });
      await onSaved(
        `Special price of ${formatUSD(cents / 100)} USD sent to the customer portal.`,
      );
      setAmount("");
      lastRequest.current = null;
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Couldn’t send this price offer. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!canCheckout(order)) return null;

  return (
    <form
      aria-label="Offer a special price"
      className="space-y-3 rounded-xl border bg-card p-4"
      onSubmit={(event) => void send(event)}
    >
      <h3 className="font-sans text-base font-semibold">
        Offer a special price
      </h3>
      <p className="text-sm text-muted-foreground">
        Current total {formatUSD(order.price)} USD.
      </p>
      {eligible ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="offered-price">New total (USD)</Label>
            <Input
              id="offered-price"
              type="number"
              inputMode="decimal"
              min={MIN_CHECKOUT_CENTS / 100}
              max={(current - 1) / 100}
              step="0.01"
              value={amount}
              disabled={busy}
              onChange={(event) => {
                setAmount(event.target.value);
                setProblem("");
              }}
              required
            />
          </div>
          <Button type="submit" disabled={busy || !amount}>
            {busy ? "Sending…" : "Save price & notify customer"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {order.checkoutStarted
            ? "Checkout is open at the current total."
            : "This order is at the checkout minimum."}
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
