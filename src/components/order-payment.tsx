import { useState } from "react";
import { Link, useRouter } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { refreshPayment, startCheckout } from "@/lib/payments.functions";

export function OrderPayment({
  code,
  checkoutStarted = false,
}: {
  code: string;
  checkoutStarted?: boolean;
}) {
  const router = useRouter();
  const [action, setAction] = useState<"open" | "check" | null>(null);
  const [problem, setProblem] = useState("");

  async function pay(next: "open" | "check") {
    if (action) return;
    setAction(next);
    setProblem("");
    try {
      if (next === "open") {
        const { url } = await startCheckout({ data: { code } });
        window.location.assign(url);
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
        next === "open" && error instanceof Error
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
      </div>
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
