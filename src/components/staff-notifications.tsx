import { useEffect, useRef, useState, type FormEvent } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getStaffCustomer,
  listStaffCustomers,
} from "@/lib/customers.functions";
import { sendCustomerNotification } from "@/lib/notifications.functions";
import { notificationKinds } from "@/lib/portal-notifications";

type Recipient = Awaited<ReturnType<typeof listStaffCustomers>>[number];
type ManualNotificationKind = (typeof notificationKinds)[number];

export function StaffNotifications({
  customerId,
  orderCode,
}: {
  customerId?: string;
  orderCode?: string;
}) {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<Recipient[] | null>(null);
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [loadingRecipient, setLoadingRecipient] = useState(Boolean(customerId));
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [kind, setKind] = useState<ManualNotificationKind>("notice");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const lastRequest = useRef<{ payload: string; id: string } | null>(null);
  const linkedOrder = recipient?.id === customerId ? orderCode : undefined;

  useEffect(() => {
    if (!customerId) return;
    let active = true;
    void getStaffCustomer({ data: customerId })
      .then(
        (account) => {
          if (active) setRecipient((current) => current ?? account);
        },
        () => {
          if (active)
            setSearchError(
              "The selected account couldn’t load. Search for the customer below.",
            );
        },
      )
      .finally(() => {
        if (active) setLoadingRecipient(false);
      });
    return () => {
      active = false;
    };
  }, [customerId]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching) return;
    setSearching(true);
    setSearchError("");
    try {
      setAccounts(await listStaffCustomers({ data: { query } }));
    } catch {
      setSearchError("Customer accounts couldn’t load. Try again.");
    } finally {
      setSearching(false);
    }
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !recipient || !title.trim() || !body.trim()) return;
    const data = {
      userId: recipient.id,
      kind,
      title: title.trim(),
      body: body.trim(),
      orderCode: linkedOrder,
    };
    const payload = JSON.stringify(data);
    if (lastRequest.current?.payload !== payload)
      lastRequest.current = { payload, id: crypto.randomUUID() };
    setBusy(true);
    setProblem("");
    setNotice("");
    try {
      await sendCustomerNotification({
        data: { ...data, requestId: lastRequest.current.id },
      });
      setNotice(`Sent to ${recipient.email} in the customer portal.`);
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
          Send an update or offer to a customer’s Notifications &amp; offers
          inbox.
        </p>
      </header>
      <div className="space-y-5 p-5 sm:p-6">
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => void search(event)}
        >
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="recipient-search">Find a customer</Label>
            <Input
              id="recipient-search"
              type="search"
              placeholder="Name or email"
              maxLength={200}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline" disabled={searching || busy}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </form>
        {searchError && (
          <p role="alert" className="text-sm text-destructive">
            {searchError}
          </p>
        )}
        {accounts?.length === 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            No customers match this search.
          </p>
        )}
        {accounts && accounts.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="notice-recipient">Customer search results</Label>
            <select
              id="notice-recipient"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={
                accounts.some((account) => account.id === recipient?.id)
                  ? recipient?.id
                  : ""
              }
              onChange={(event) =>
                setRecipient(
                  accounts.find(
                    (account) => account.id === event.target.value,
                  ) ?? null,
                )
              }
              disabled={busy}
            >
              <option value="">Choose a customer</option>
              {accounts.map((account) => {
                const name = account.displayName || account.accountName;
                return (
                  <option key={account.id} value={account.id}>
                    {name ? `${name} · ${account.email}` : account.email}
                  </option>
                );
              })}
            </select>
          </div>
        )}
        <form
          className="space-y-4 border-t pt-5"
          onSubmit={(event) => void send(event)}
        >
          <p className="break-words text-sm font-medium">
            {recipient
              ? `To ${recipient.email}`
              : loadingRecipient
                ? "Loading selected customer…"
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
            disabled={busy || !recipient || !title.trim() || !body.trim()}
          >
            <Send />{" "}
            {busy
              ? "Sending…"
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
