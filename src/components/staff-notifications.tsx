import { useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  StaffCustomerPicker,
  type StaffRecipient,
} from "@/components/staff-customer-picker";
import {
  broadcastCustomerNotification,
  sendCustomerNotification,
} from "@/lib/notifications.functions";
import { notificationKinds } from "@/lib/portal-notifications";

type ManualNotificationKind = (typeof notificationKinds)[number];

export function StaffNotifications({
  customerId,
  orderCode,
}: {
  customerId?: string;
  orderCode?: string;
}) {
  const [allCustomers, setAllCustomers] = useState(false);
  const [recipient, setRecipient] = useState<StaffRecipient | null>(null);
  const [kind, setKind] = useState<ManualNotificationKind>("notice");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const lastRequest = useRef<{ payload: string; id: string } | null>(null);
  const linkedOrder =
    !allCustomers && recipient?.id === customerId ? orderCode : undefined;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || (!allCustomers && !recipient) || !title.trim() || !body.trim())
      return;
    const data = {
      kind,
      title: title.trim(),
      body: body.trim(),
    };
    const payload = JSON.stringify({
      ...data,
      audience: allCustomers ? "all" : recipient?.id,
      orderCode: linkedOrder,
    });
    if (lastRequest.current?.payload !== payload)
      lastRequest.current = { payload, id: crypto.randomUUID() };
    setBusy(true);
    setProblem("");
    setNotice("");
    try {
      const requestId = lastRequest.current.id;
      if (allCustomers) {
        const { count } = await broadcastCustomerNotification({
          data: { ...data, requestId },
        });
        setNotice(
          count === 0
            ? "There are no customer accounts to notify."
            : `Sent to ${count.toLocaleString("en-US")} ${count === 1 ? "customer" : "customers"} in the portal.`,
        );
      } else if (recipient) {
        await sendCustomerNotification({
          data: {
            ...data,
            requestId,
            userId: recipient.id,
            orderCode: linkedOrder,
          },
        });
        setNotice(`Sent to ${recipient.email} in the customer portal.`);
      }
      setTitle("");
      setBody("");
      lastRequest.current = null;
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Couldn’t send the notification. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="max-w-3xl overflow-hidden rounded-2xl border bg-card"
      aria-labelledby="staff-notifications"
    >
      <header className="border-b bg-secondary/70 px-5 py-4 sm:px-6">
        <h2 id="staff-notifications" className="text-2xl font-semibold">
          Send a notification
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send an update or offer to one customer or to all customer inboxes.
        </p>
      </header>
      <div className="space-y-5 p-5 sm:p-6">
        <fieldset disabled={busy} className="flex flex-wrap gap-3">
          <legend className="mb-2 text-sm font-medium">Recipients</legend>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <input
              name="notification-audience"
              type="radio"
              checked={!allCustomers}
              onChange={() => setAllCustomers(false)}
            />
            One customer
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <input
              name="notification-audience"
              type="radio"
              checked={allCustomers}
              onChange={() => setAllCustomers(true)}
            />
            All customers
          </label>
        </fieldset>
        {!allCustomers && (
          <StaffCustomerPicker
            recipient={recipient}
            setRecipient={setRecipient}
            customerId={customerId}
            disabled={busy}
          />
        )}
        <form
          className="space-y-4 border-t pt-5"
          onSubmit={(event) => void send(event)}
        >
          <p className="break-words text-sm font-medium">
            {allCustomers
              ? "To all customer accounts · Portal notification"
              : recipient
                ? `To ${recipient.email}`
                : "Choose a recipient to send a notification."}
            {linkedOrder && (
              <span className="ml-2 text-muted-foreground">
                · Linked to {linkedOrder}
              </span>
            )}
          </p>
          <fieldset disabled={busy} className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="notice-kind">Type</Label>
              <select
                id="notice-kind"
                className="h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value as ManualNotificationKind)
                }
              >
                <option value="notice">Notification</option>
                <option value="offer">Offer</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notice-title">Title</Label>
              <Input
                id="notice-title"
                required
                maxLength={140}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notice-body">Message</Label>
              <Textarea
                id="notice-body"
                required
                rows={5}
                maxLength={5000}
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </div>
          </fieldset>
          <Button
            type="submit"
            disabled={
              busy ||
              (!allCustomers && !recipient) ||
              !title.trim() ||
              !body.trim()
            }
          >
            <Send />{" "}
            {busy
              ? "Sending…"
              : allCustomers
                ? "Send to all customers"
                : kind === "offer"
                  ? "Send offer"
                  : "Send notification"}
          </Button>
          {notice && (
            <p
              role="status"
              className="break-words text-sm font-medium text-success"
            >
              {notice}
            </p>
          )}
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
