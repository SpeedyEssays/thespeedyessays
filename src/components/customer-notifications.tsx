import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, CreditCard, Gift } from "lucide-react";

import { LocalTime } from "@/components/local-time";
import { OrderPayment } from "@/components/order-payment";
import { Button } from "@/components/ui/button";
import {
  listMyNotifications,
  markNotificationsRead,
} from "@/lib/notifications.functions";
import { formatUSD } from "@/lib/pricing";
import { useInboxData } from "@/lib/use-inbox-data";
import { cn } from "@/lib/utils";

export function CustomerNotifications({
  unread,
  onRead,
}: {
  unread: number;
  onRead: () => void;
}) {
  const [page, setPage] = useState(0);
  return (
    <section
      className="max-w-3xl overflow-hidden rounded-2xl border bg-card"
      aria-labelledby="customer-notifications"
    >
      <header className="flex items-center gap-3 border-b bg-secondary/70 p-5 sm:px-6">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
          <Bell className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2
            id="customer-notifications"
            className="text-xl font-semibold sm:text-2xl"
          >
            Notifications &amp; offers
          </h2>
          <p className="text-sm text-muted-foreground">
            Order updates and offers from your support team.
          </p>
        </div>
      </header>
      <NotificationPage
        key={page}
        page={page}
        setPage={setPage}
        unread={unread}
        onRead={onRead}
      />
    </section>
  );
}

function NotificationPage({
  page,
  setPage,
  unread,
  onRead,
}: {
  page: number;
  setPage: (page: number) => void;
  unread: number;
  onRead: () => void;
}) {
  const load = useCallback(
    () => listMyNotifications({ data: { page } }),
    [page],
  );
  const { data, error, refresh } = useInboxData(load, 15_000);
  const [busy, setBusy] = useState(false);
  const [markError, setMarkError] = useState(false);

  async function markRead(id?: string) {
    setBusy(true);
    setMarkError(false);
    try {
      await markNotificationsRead({ data: { id } });
      refresh();
      onRead();
    } catch {
      setMarkError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 p-4 sm:p-6">
      {error && (
        <p role="status" className="text-sm text-destructive">
          Updates couldn’t load. Retrying…
        </p>
      )}
      {markError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t mark notifications as read. Try again.
        </p>
      )}
      {!data && !error && (
        <p role="status" className="py-4 text-sm text-muted-foreground">
          Loading notifications…
        </p>
      )}
      {data && !data.entries.length && (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          You’re all caught up. New updates will appear here.
        </p>
      )}
      {(unread > 0 || data?.entries.some((entry) => !entry.readAt)) && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void markRead()}
          >
            <CheckCheck /> Mark all as read
          </Button>
        </div>
      )}
      {data && data.entries.length > 0 && (
        <ul className="space-y-3">
          {data.entries.map((entry) => {
            const paymentReminder = entry.kind === "payment-reminder";
            const Icon = paymentReminder
              ? CreditCard
              : entry.kind === "offer"
                ? Gift
                : Bell;
            return (
              <li
                key={entry.id}
                className={cn(
                  "flex gap-3 rounded-xl border p-4",
                  entry.readAt
                    ? "bg-card"
                    : "border-primary/25 bg-secondary/40",
                )}
              >
                <div
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg",
                    entry.kind === "offer" ? "bg-accent/30" : "bg-muted",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {paymentReminder
                        ? "Payment reminder"
                        : entry.kind === "offer"
                          ? "Offer"
                          : "Update"}
                    </span>
                    {!entry.readAt && (
                      <span className="rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground">
                        New
                      </span>
                    )}
                    <LocalTime at={entry.createdAt} />
                  </div>
                  <h3 className="break-words font-sans text-base font-semibold tracking-normal">
                    {entry.title}
                  </h3>
                  {entry.payment ? (
                    <div className="space-y-1 text-sm">
                      <p className="break-words">{entry.payment.topic}</p>
                      <p className="font-medium">
                        {entry.payment.paid
                          ? "Payment confirmed"
                          : entry.payment.payable
                            ? "Amount due"
                            : "Order cancelled"}
                        {" · "}
                        {formatUSD(entry.payment.amount)} USD
                      </p>
                    </div>
                  ) : !paymentReminder ? (
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {entry.body}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      This order is no longer available.
                    </p>
                  )}
                  {entry.payment?.payable && entry.orderCode && (
                    <OrderPayment code={entry.orderCode} />
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {entry.senderName && (
                      <span className="break-words text-xs text-muted-foreground">
                        From {entry.senderName} Support
                      </span>
                    )}
                    {entry.orderCode && (
                      <Link
                        to="/dashboard"
                        search={{ order: entry.orderCode }}
                        className="text-sm font-medium text-primary underline underline-offset-2"
                      >
                        View {entry.orderCode}
                      </Link>
                    )}
                    {!entry.readAt && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void markRead(entry.id)}
                      >
                        Mark as read
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {(page > 0 || data?.hasMore) && (
        <nav
          className="flex justify-between gap-2 pt-2"
          aria-label="Notification pages"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!data?.hasMore}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
