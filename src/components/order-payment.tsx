import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { refreshPayment, startCheckout } from "@/lib/payments.functions";
import { formatUSD } from "@/lib/pricing";
import { payOrderFromWallet } from "@/lib/wallet.functions";

export function OrderPayment({
  code,
  checkoutStarted = false,
  wallet,
}: {
  code: string;
  checkoutStarted?: boolean;
  wallet?: { balanceCents: number; priceCents: number };
}) {
  const router = useRouter();
  const [action, setAction] = useState<"open" | "check" | "wallet" | null>(
    null,
  );
  const [problem, setProblem] = useState("");

  async function pay(next: "open" | "check" | "wallet") {
    if (action) return;
    setAction(next);
    setProblem("");
    try {
      if (next === "open") {
        const { url } = await startCheckout({ data: { code } });
        window.location.assign(url);
      } else if (next === "wallet" && wallet) {
        await payOrderFromWallet({
          data: { code, expectedCents: wallet.priceCents },
        });
        await router.invalidate();
      } else {
        const { paid } = await refreshPayment({ data: { code } });
        if (paid) {
          await router.invalidate();
        } else {
          setProblem("Paystack hasn’t confirmed the payment yet.");
        }
      }
    } catch (error) {
      setProblem(
        next !== "check" && error instanceof Error
          ? error.message
          : "We couldn’t check the payment status. Your order is saved.",
      );
    } finally {
      setAction(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={action !== null}
          onClick={() => void pay("open")}
        >
          {action === "open" ? "Opening checkout…" : "Complete payment"}
        </Button>
        {checkoutStarted && (
          <Button
            type="button"
            variant="outline"
            disabled={action !== null}
            onClick={() => void pay("check")}
          >
            {action === "check" ? "Checking…" : "Check payment status"}
          </Button>
        )}
        {wallet && !checkoutStarted && (
          <Button
            type="button"
            variant="outline"
            disabled={
              action !== null || wallet.balanceCents < wallet.priceCents
            }
            onClick={() => void pay("wallet")}
          >
            {action === "wallet"
              ? "Paying…"
              : `Pay ${formatUSD(wallet.priceCents / 100)} from wallet`}
          </Button>
        )}
      </div>
      {wallet && !checkoutStarted && (
        <p className="text-sm text-muted-foreground">
          Wallet balance {formatUSD(wallet.balanceCents / 100)} USD ·{" "}
          <Link
            to="/dashboard"
            search={{ tab: "wallet" }}
            className="font-medium underline underline-offset-2"
          >
            Open wallet
          </Link>
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem} Please{" "}
          <Link
            to="/dashboard"
            search={{ tab: "chat", order: code }}
            className="underline underline-offset-2"
          >
            contact support
          </Link>{" "}
          with order {code} if you need help.
        </p>
      )}
    </div>
  );
}
