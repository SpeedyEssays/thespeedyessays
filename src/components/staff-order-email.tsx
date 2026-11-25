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
  checkOrderEmailConnection,
  getOrderEmailDetails,
  notifyOrderCustomer,
} from "@/lib/order-email.functions";
import type { AdminOrderView } from "@/lib/orders";

type Details = Awaited<ReturnType<typeof getOrderEmailDetails>>;
type Outcome = Awaited<ReturnType<typeof notifyOrderCustomer>>;
type Connection = Awaited<ReturnType<typeof checkOrderEmailConnection>>;
type PortalError = "portal-error";

const problems: Record<Exclude<Outcome, "queued"> | PortalError, string> = {
  setup:
    "Email sending needs to be connected in Cloudflare. Ask the site owner to check the Gmail sender settings.",
  "credentials-rejected":
    "The Gmail sender rejected the connection. Check that Cloudflare and Apps Script use the same connection key.",
  unavailable: "This order has no confirmed customer email available.",
  "not-delivered": "Mark the order delivered before sending a delivery email.",
  "recipient-changed":
    "The customer’s email address changed. Review the updated address before sending.",
  "rate-limited":
    "Gmail has reached its daily sending limit. Try again when the quota resets.",
  "deployment-access":
    "Google is asking Cloudflare to sign in. In Apps Script, edit the web app deployment and set Execute as to Me and Who has access to Anyone.",
  "deployment-missing":
    "Google could not find the deployed email script. Check that the Cloudflare URL ends in /exec and that the active Apps Script version contains doPost.",
  "reply-missing":
    "Google ran the script, but its result link was unavailable. Check Gmail Sent before retrying an email.",
  "invalid-reply":
    "Google returned an unexpected response. Open Apps Script Executions to check the latest doPost run.",
  "google-busy":
    "Google is temporarily limiting requests to Apps Script. Try Check connection again in a minute.",
  "timed-out":
    "Google did not reply within 25 seconds. Check the latest doPost run in Apps Script Executions.",
  "transport-error":
    "Cloudflare could not reach the Apps Script service. Check that the deployed web app is available, then run Check connection again.",
  "sender-script-error":
    "Apps Script returned an error. Run setUpEmailSender in the editor and check that the execution log shows Sender ready.",
  busy: "The Gmail sender is handling another email. Wait a moment and try again.",
  "portal-error":
    "The staff portal did not return a result. Refresh the order and check the connection again.",
  rejected:
    "The Gmail sender rejected this email. Review the recipient and message, then try again.",
  unconfirmed:
    "The Gmail sender did not confirm the request. Retrying this email here reuses the same request to help prevent duplicates.",
};

export function StaffOrderEmail({ order }: { order: AdminOrderView }) {
  const id = useId();
  const [details, setDetails] = useState<Details | "error" | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [selected, setSelected] = useState<OrderEmailKind | null>(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<Outcome | PortalError | null>(null);
  const [connection, setConnection] = useState<Connection | PortalError | null>(
    null,
  );
  const [activity, setActivity] = useState<"sending" | "checking" | null>(null);
  const busy = activity !== null;
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

  async function checkConnection() {
    if (sending.current) return;

    sending.current = true;
    setActivity("checking");
    setOutcome(null);
    setConnection(null);
    try {
      setConnection(await checkOrderEmailConnection());
    } catch {
      setConnection("portal-error");
    } finally {
      sending.current = false;
      setActivity(null);
    }
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
    setActivity("sending");
    setOutcome(null);
    setConnection(null);

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
      setOutcome("portal-error");
    } finally {
      sending.current = false;
      setActivity(null);
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
        {connection &&
          (connection === "connected" ? (
            <p className="text-sm text-success" role="status">
              The Gmail sender is connected.
            </p>
          ) : (
            <p className="text-sm text-destructive" role="alert">
              {connection === "unconfirmed"
                ? "The Gmail sender couldn’t confirm the connection. Try the check again."
                : problems[connection]}
            </p>
          ))}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!ready || busy} size="sm" type="submit">
            {activity === "sending" ? "Sending…" : "Send email"}
          </Button>
          <Button
            disabled={busy}
            size="sm"
            type="button"
            variant="outline"
            onClick={() => void checkConnection()}
          >
            {activity === "checking" ? "Checking…" : "Check connection"}
          </Button>
        </div>
      </form>
    </section>
  );
}
