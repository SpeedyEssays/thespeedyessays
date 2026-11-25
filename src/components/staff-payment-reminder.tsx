import { useRef, useState } from "react";
import { CreditCard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { sendPaymentReminder } from "@/lib/notifications.functions";

export function StaffPaymentReminder({ code }: { code: string }) {
  const requestId = useRef<string | null>(null);
  const [status, setStatus] = useState<"ready" | "sending" | "sent">("ready");
  const [error, setError] = useState("");

  async function send() {
    if (status !== "ready") return;
    requestId.current ??= crypto.randomUUID();
    setStatus("sending");
    setError("");
    try {
      await sendPaymentReminder({
        data: { code, requestId: requestId.current },
      });
      setStatus("sent");
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : "Couldn’t send the reminder. Try again.",
      );
      setStatus("ready");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={status !== "ready"}
        onClick={() => void send()}
      >
        <CreditCard />{" "}
        {status === "sending" ? "Sending…" : "Send payment reminder"}
      </Button>
      {status === "sent" && (
        <p role="status" className="text-sm text-success">
          Payment reminder for {code} sent to the customer portal.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
