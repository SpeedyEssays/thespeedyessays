import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Search } from "lucide-react";
import { UnreadBadge } from "@/components/chat-indicators";
import { OrderDeadline } from "@/components/order-deadline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { statusMeta, type OrderStatus, type OrderView } from "@/lib/orders";
import { formatUSD } from "@/lib/pricing";
import { cn } from "@/lib/utils";

const statusLabels = {
  all: "All statuses",
  "awaiting-payment": "Awaiting payment",
  "in-progress": "In progress",
  revision: "In revision",
  completed: "Completed",
  approved: "Approved",
  cancelled: "Cancelled",
  other: "Other orders",
} as const;

type StatusFilter = keyof typeof statusLabels;

const statusGroups: Record<OrderStatus, Exclude<StatusFilter, "all">> = {
  "awaiting-payment": "awaiting-payment",
  paid: "in-progress",
  "writer-assigned": "in-progress",
  "in-progress": "in-progress",
  "draft-ready": "in-progress",
  revision: "revision",
  completed: "completed",
  approved: "approved",
  cancelled: "cancelled",
};

const statusTones = {
  muted: "bg-muted text-muted-foreground",
  warn: "border-accent/50 bg-accent/15",
  info: "border-chat-support-border bg-chat-support text-primary dark:text-foreground",
  ok: "border-success/25 bg-success/10 text-success dark:text-emerald-300",
};

const ordersPerPage = 12;

export function CustomerOrderTable({
  orders,
  unreadByOrder,
  now,
}: {
  orders: OrderView[];
  unreadByOrder?: Record<string, number>;
  now: number | null;
}) {
  const searchId = useId();
  const statusId = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const needle = query.trim().toLowerCase();
  const matches = orders.filter(
    (order) =>
      (status === "all" ||
        (statusGroups[order.status] ?? "other") === status) &&
      (order.code.toLowerCase().includes(needle) ||
        order.title.toLowerCase().includes(needle)),
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / ordersPerPage));
  const currentPage = Math.min(page, pageCount);
  const offset = (currentPage - 1) * ordersPerPage;
  const visibleOrders = matches.slice(offset, offset + ordersPerPage);

  if (!orders.length) {
    return (
      <p className="rounded-xl border bg-card p-5 text-sm">
        Your orders will appear here after you place one.
      </p>
    );
  }

  return (
    <section className="space-y-3" aria-label="Your orders">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-60 sm:max-w-xs">
          <Label htmlFor={searchId} className="mb-1.5">
            Find an order
          </Label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
            />
            <Input
              id={searchId}
              type="search"
              className="bg-card pl-9"
              placeholder="Order number or title"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div>
          <Label htmlFor={statusId} className="mb-1.5">
            Status
          </Label>
          <select
            id={statusId}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as StatusFilter);
              setPage(1);
            }}
          >
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {visibleOrders.length ? (
        <Table
          className="table-fixed text-left"
          containerProps={{ className: "rounded-xl border bg-card" }}
        >
          <TableCaption className="sr-only">Your orders</TableCaption>
          <TableHeader className="bg-secondary text-xs">
            <TableRow className="hover:bg-secondary">
              <TableHead
                scope="col"
                className="w-[43%] px-3 font-semibold sm:w-[34%]"
              >
                Order
              </TableHead>
              <TableHead
                scope="col"
                className="w-[34%] font-semibold sm:w-[18%]"
              >
                Status
              </TableHead>
              <TableHead
                scope="col"
                className="hidden w-[22%] font-semibold sm:table-cell"
              >
                Deadline
              </TableHead>
              <TableHead
                scope="col"
                aria-label="Total in USD"
                className="w-[23%] pr-3 text-right font-semibold sm:w-[13%]"
              >
                Total <span className="hidden lg:inline">(USD)</span>
              </TableHead>
              <TableHead
                scope="col"
                className="hidden w-[13%] px-3 text-right font-semibold sm:table-cell"
              >
                Messages
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleOrders.map((order) => {
              const meta = statusMeta[order.status];
              const unread = unreadByOrder?.[order.code];
              return (
                <TableRow
                  key={order.code}
                  className="focus-within:bg-secondary/45"
                >
                  <th
                    scope="row"
                    className="px-3 py-3 text-left align-top font-normal"
                  >
                    <Link
                      to="/dashboard"
                      search={{ order: order.code }}
                      hash="customer-order-details"
                      aria-label={`Open order ${order.code} ${order.title}`}
                      className="group block min-w-0 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="flex items-center gap-1 text-xs font-semibold text-primary dark:text-foreground">
                        {order.code}
                        <ChevronRight
                          aria-hidden="true"
                          className="size-3.5 shrink-0"
                        />
                      </span>
                      <span className="mt-0.5 line-clamp-2 wrap-anywhere font-medium group-hover:underline">
                        {order.title}
                      </span>
                    </Link>
                    {Boolean(unread) && (
                      <div className="mt-1.5 sm:hidden">
                        <UnreadBadge count={unread} />
                      </div>
                    )}
                  </th>
                  <TableCell className="py-3 align-top whitespace-normal">
                    <Badge
                      variant="outline"
                      className={cn(
                        "max-w-full justify-start rounded-full whitespace-normal wrap-anywhere",
                        statusTones[meta?.tone ?? "muted"],
                      )}
                    >
                      {meta?.label ?? order.status}
                    </Badge>
                    <div className="mt-1.5 text-xs sm:hidden">
                      <OrderDeadline order={order} now={now} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden py-3 align-top text-xs whitespace-normal sm:table-cell">
                    <OrderDeadline order={order} now={now} />
                  </TableCell>
                  <TableCell className="py-3 pr-3 text-right align-top text-xs font-semibold whitespace-normal wrap-anywhere tabular-nums sm:text-sm">
                    {formatUSD(order.price)}
                  </TableCell>
                  <TableCell className="hidden px-3 py-3 text-right align-top sm:table-cell">
                    {unread ? (
                      <UnreadBadge count={unread} />
                    ) : (
                      <span className="text-muted-foreground">
                        <span className="sr-only">No unread messages</span>
                        <span aria-hidden="true">—</span>
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <p role="status" className="rounded-xl border bg-card p-5 text-sm">
          No orders match your search or status filter.
        </p>
      )}
      {pageCount > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p role="status" className="text-sm text-muted-foreground">
            Showing {offset + 1}–{offset + visibleOrders.length} of{" "}
            {matches.length} orders
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
