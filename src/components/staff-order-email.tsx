import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  canSendDeliveryEmail,
  orderEmailKinds,
  orderEmailNoteLimit,
  orderEmailSubject,
  orderEmailTemplates,
  type OrderEmailKind,
} from "@/lib/order-email";
import {
  getOrderEmailDetails,
  notifyOrderCustomer,
} from "@/lib/order-email.functions";
import type { AdminOrderView } from "@/lib/orders";

type Details = Awaited<ReturnType<typeof getOrderEmailDetails>>;
type Outcome = Awaited<ReturnType<typeof notifyOrderCustomer>>;

const problems: Record<Exclude<Outcome, "queued">, string> = {
  setup:
    "Email sending needs to be connected in Render. Ask the site owner to check the Mailjet settings.",
  unavailable: "This order has no confirmed customer email available.",
  "not-delivered": "Mark the order delivered before sending a delivery email.",
  "recipient-changed":
    "The customer’s email address changed. Review the updated address before sending.",
  "rate-limited":
    "Mailjet is limiting sends. Try the same email again in a few minutes.",
  rejected:
    "Mailjet rejected the email. Check the sender settings or the Mailjet activity log.",
  unconfirmed:
    "Mailjet did not confirm the request. Retrying this same email here uses the same request to help prevent duplicates.",
};

export function StaffOrderEmail({ order }: { order: AdminOrderView }) {
  const id = useId();
  const [details, setDetails] = useState<Details | "error" | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [selected, setSelected] = useState<OrderEmailKind | null>(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const request = useRef<{ signature: string; id: string } | null>(null);
  const canDeliver = canSendDeliveryEmail(order);
  const kind =
    selected === "delivered" && !canDeliver
      ? "action-needed"
      : (selected ?? (canDeliver ? "delivered" : "action-needed"));
  const template = orderEmailTemplates[kind];

  useEffect(() => {
    let active = true;
    void getOrderEmailDetails({ data: { code: order.code } }).then(
      (data) => {
        if (active) setDetails(data);
      },
      () => {
        if (active) setDetails("error");
      },
    );
    return () => {
      active = false;
    };
  }, [order.code, refreshCount]);

  function refreshRecipient() {
    setDetails(null);
    setRefreshCount((previous) => previous + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !details ||
      details === "error" ||
      details.status !== "ready" ||
      sending.current
    )
      return;

    const { recipient } = details;
    const message = note.trim();
    const signature = JSON.stringify([order.code, kind, recipient, message]);
    if (request.current?.signature !== signature) {
      request.current = { signature, id: crypto.randomUUID() };
    }
    sending.current = true;
    setBusy(true);
    setOutcome(null);

    try {
      const result = await notifyOrderCustomer({
        data: {
          code: order.code,
          kind,
          expectedRecipient: recipient,
          note: message,
          requestId: request.current.id,
        },
      });
      setOutcome(result);
      if (result === "queued") {
        request.current = null;
        setNote("");
      }
      if (result === "recipient-changed" || result === "unavailable")
        refreshRecipient();
    } catch {
      setOutcome("unconfirmed");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const ready =
    details !== null && details !== "error" && details.status === "ready";
  return (
    <section
      aria-labelledby={id + "-heading"}
      className="rounded-xl border bg-card p-4"
    >
      <h2 id={id + "-heading"} className="text-base font-semibold">
        Email customer
      </h2>
      {ready && (
        <p className="mt-1 break-all text-sm text-muted-foreground">
          To {details.recipient}
        </p>
      )}
      {details === null && (
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          Checking email setup…
        </p>
      )}
      {details === "error" && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-sm text-destructive" role="alert">
            Email settings couldn’t load.
          </p>
          <Button size="sm" variant="outline" onClick={refreshRecipient}>
            Try again
          </Button>
        </div>
      )}
      {details && details !== "error" && details.status !== "ready" && (
        <p className="mt-2 text-sm text-muted-foreground">
          {problems[details.status]}
        </p>
      )}
      <form className="mt-3 space-y-3" onSubmit={(event) => void submit(event)}>
        <div className="space-y-1.5">
          <Label htmlFor={id + "-template"}>Email template</Label>
          <select
            id={id + "-template"}
            value={kind}
            onChange={(event) =>
              setSelected(event.target.value as OrderEmailKind)
            }
            disabled={busy}
            className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:max-w-xs"
          >
            {orderEmailKinds.map((option) => (
              <option
                key={option}
                value={option}
                disabled={option === "delivered" && !canDeliver}
              >
                {orderEmailTemplates[option].label}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-md bg-muted/50 p-3 text-sm">
          <p className="font-medium">{orderEmailSubject(kind, order.code)}</p>
          <p className="mt-1 text-muted-foreground">{template.body}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id + "-note"}>Message from support (optional)</Label>
          <Textarea
            id={id + "-note"}
            rows={2}
            maxLength={orderEmailNoteLimit}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={busy}
          />
        </div>
        {outcome &&
          (outcome === "queued" ? (
            <p className="text-sm text-success" role="status">
              Email queued for delivery.
            </p>
          ) : (
            <p className="text-sm text-destructive" role="alert">
              {problems[outcome]}
            </p>
          ))}
        <Button disabled={!ready || busy} size="sm" type="submit">
          {busy ? "Sending…" : "Send email"}
        </Button>
      </form>
    </section>
  );
}
