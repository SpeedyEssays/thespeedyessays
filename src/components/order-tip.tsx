import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { orderTipPercentages } from "@/lib/order-tip";
import {
  checkOrderTip,
  payOrderTipFromWallet,
  startOrderTipCheckout,
} from "@/lib/order-tips.functions";
import type { OrderView } from "@/lib/orders";
import { formatUSD, MIN_CHECKOUT_CENTS } from "@/lib/pricing";
import { parseUSDCents } from "@/lib/wallet";

export function OrderTip({
  code,
  priceCents,
  tip,
  walletBalanceCents,
  canPayOnline,
  checkout,
}: {
  code: string;
  priceCents: number;
  tip: OrderView["tip"];
  walletBalanceCents: number;
  canPayOnline: boolean;
  checkout?: "return" | "closed";
}) {
  const router = useRouter();
  const [percent, setPercent] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [action, setAction] = useState<"open" | "wallet" | "check" | null>(
    null,
  );
  const [problem, setProblem] = useState("");
  const pending = Boolean(tip && !tip.paidAt);
  const centsAt = (rate: number) =>
    Math.max(1, Math.round((priceCents * rate) / 100));
  const amountCents =
    percent === null ? parseUSDCents(custom) : centsAt(percent);

  useEffect(() => {
    if (checkout !== "return" || !pending) return;
    let active = true;
    void checkOrderTip({ data: { code } }).then(
      ({ paid }) => {
        if (active && paid) void router.invalidate();
      },
      () => {
        if (active)
          setProblem("We couldn’t check this tip payment. Please try again.");
      },
    );
    return () => {
      active = false;
    };
  }, [checkout, code, pending, router]);

  async function pay(next: "open" | "wallet" | "check") {
    if (action) return;
    setAction(next);
    setProblem("");
    try {
      if (next === "open") {
        const { url } = await startOrderTipCheckout({
          data: {
            code,
            amountCents: tip ? undefined : (amountCents ?? undefined),
          },
        });
        if (url) {
          window.location.assign(url);
          return;
        }
      } else if (next === "wallet" && amountCents) {
        await payOrderTipFromWallet({ data: { code, amountCents } });
      } else {
        const { paid } = await checkOrderTip({ data: { code } });
        if (!paid) {
          setProblem("The tip payment is still awaiting confirmation.");
          return;
        }
      }
      await router.invalidate();
    } catch (error) {
      setProblem(
        next === "check" || !(error instanceof Error)
          ? "We couldn’t check this tip payment. Please try again."
          : error.message,
      );
      if (next === "open") void router.invalidate();
    } finally {
      setAction(null);
    }
  }

  return (
    <section
      className="space-y-3 rounded-lg border bg-background p-4"
      aria-labelledby="order-tip-title"
    >
      <h3 id="order-tip-title" className="text-lg font-semibold">
        {tip?.paidAt ? "Tip received" : "Leave a tip"}
      </h3>
      {tip?.paidAt ? (
        <p role="status" className="text-sm text-success">
          Thank you for tipping {formatUSD(tip.amountCents / 100)} USD.
        </p>
      ) : tip ? (
        <>
          <p className="text-sm text-muted-foreground">
            {formatUSD(tip.amountCents / 100)} USD ·{" "}
            {checkout === "closed"
              ? "Checkout closed"
              : "Awaiting payment confirmation"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={action !== null || !canPayOnline}
              onClick={() => void pay("open")}
            >
              {action === "open" ? "Opening checkout…" : "Continue tip payment"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={action !== null || !canPayOnline}
              onClick={() => void pay("check")}
            >
              {action === "check" ? "Checking…" : "Check tip payment"}
            </Button>
          </div>
          {!canPayOnline && (
            <p className="text-sm text-muted-foreground">
              Online checkout is unavailable right now.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Thank the team for your order with an optional tip.
          </p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Tip percentage"
          >
            {orderTipPercentages.map((rate) => (
              <Button
                type="button"
                size="sm"
                variant={percent === rate ? "default" : "outline"}
                key={rate}
                aria-pressed={percent === rate}
                disabled={action !== null}
                onClick={() => {
                  setPercent(rate);
                  setCustom("");
                  setProblem("");
                }}
              >
                {rate}% · {formatUSD(centsAt(rate) / 100)}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom-order-tip">Custom tip in USD</Label>
            <Input
              id="custom-order-tip"
              className="w-36"
              inputMode="decimal"
              placeholder="5.00"
              value={custom}
              disabled={action !== null}
              onChange={(event) => {
                setCustom(event.target.value);
                setPercent(null);
                setProblem("");
              }}
            />
            {custom && !amountCents && (
              <p className="text-sm text-destructive">
                Enter an amount with up to two decimal places.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void pay("wallet")}
              disabled={
                action !== null ||
                !amountCents ||
                walletBalanceCents < amountCents
              }
            >
              {action === "wallet"
                ? "Sending tip…"
                : amountCents
                  ? `Tip ${formatUSD(amountCents / 100)} from wallet`
                  : "Tip from wallet"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void pay("open")}
              disabled={
                action !== null ||
                !canPayOnline ||
                !amountCents ||
                amountCents < MIN_CHECKOUT_CENTS
              }
            >
              {action === "open"
                ? "Opening checkout…"
                : amountCents
                  ? `Tip ${formatUSD(amountCents / 100)} online`
                  : "Tip online"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Wallet balance {formatUSD(walletBalanceCents / 100)} USD ·{" "}
            {canPayOnline
              ? `Online minimum ${formatUSD(MIN_CHECKOUT_CENTS / 100)} USD.`
              : "Online checkout is unavailable right now."}
          </p>
        </>
      )}
      {problem && (
        <p className="text-sm text-destructive" role="alert">
          {problem}
        </p>
      )}
    </section>
  );
}
