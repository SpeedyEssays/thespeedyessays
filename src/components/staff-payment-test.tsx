import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  startUsdPaymentTest,
  verifyUsdPaymentTest,
} from "@/lib/payment-test.functions";

export function StaffPaymentTest({ reference }: { reference?: string }) {
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!reference) return;
    let active = true;
    void verifyUsdPaymentTest({ data: reference }).then(
      ({ paid }) => {
        if (active)
          setStatus(
            paid
              ? "$20.00 USD test payment confirmed."
              : "Paystack has not confirmed this test payment yet.",
          );
      },
      () => {
        if (active)
          setError(
            "Could not verify the test payment. Check Paystack Test Mode → Transactions.",
          );
      },
    );
    return () => {
      active = false;
    };
  }, [reference]);

  async function start() {
    setStarting(true);
    setError("");
    try {
      const { url } = await startUsdPaymentTest();
      window.location.assign(url);
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Could not open Paystack Test Mode.",
      );
      setStarting(false);
    }
  }

  return (
    <section className="max-w-xl space-y-4 rounded-2xl border bg-card p-6">
      <h2 className="text-2xl font-semibold">Paystack test checkout</h2>
      <p className="text-sm text-muted-foreground">
        Use a Paystack test card to simulate a $20.00 USD payment. No money
        moves and customer orders are unaffected.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => void start()} disabled={starting}>
          {starting ? "Opening Paystack…" : "Start USD test"}
        </Button>
        <Button asChild variant="outline">
          <a
            href="https://paystack.com/docs/v2/ke/developer-tools/integration/test-payments"
            target="_blank"
            rel="noreferrer"
          >
            Paystack test cards
          </a>
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm font-medium">
          {status}
        </p>
      )}
      {reference && !status && !error && (
        <p role="status" className="text-sm">
          Checking the test payment…
        </p>
      )}
    </section>
  );
}
