import { useCallback, useState } from 'react'
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { Bell, CreditCard, Gift, MessageSquare, Package, Shield, Star, UserRound, Users } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { OnlineDot, UnreadBadge } from '@/components/chat-indicators'
import { ChatThread } from '@/components/chat-thread'
import { OrderDeadline } from '@/components/order-deadline'
import { OrderPanel } from '@/components/order-panel'
import { PortalShell } from '@/components/portal-shell'
import { StaffAdmins } from '@/components/staff-admins'
import { StaffCampaigns } from '@/components/staff-campaigns'
import { StaffCustomerPresence } from '@/components/staff-customer-presence'
import { StaffCustomers } from '@/components/staff-customers'
import { StaffOrderDetails } from '@/components/staff-order-details'
import { StaffOrderEmail } from '@/components/staff-order-email'
import { StaffOrderPrice } from '@/components/staff-order-price'
import { StaffFeedback } from '@/components/staff-feedback'
import { StaffNotifications } from '@/components/staff-notifications'
import { StaffOrderStatus } from '@/components/staff-order-status'
import { StaffPaymentReminder } from '@/components/staff-payment-reminder'
import { StaffPaymentTest } from '@/components/staff-payment-test'
import { StaffProfile } from '@/components/staff-profile'
import {
  getStaffInboxCounts,
  listSupportChats,
  markSupportChatRead,
  readSupportChat,
  sendSupportChat,
} from '@/lib/chat.functions'
import { getServerUser } from '@/lib/identity.functions'
import { listDiscountCodes } from '@/lib/discount-codes.functions'
import { hasOpenDeadline, isDeadlinePast } from '@/lib/order-deadline'
import { canCheckout, orderStatuses, statusMeta, type AdminOrderView, type OrderStatus } from '@/lib/orders'
import { listStaffOrders } from '@/lib/orders.functions'
import { formatUSD } from '@/lib/pricing'
import { getMyStaffAvatar } from '@/lib/staff-avatar.functions'
import { recordStaffActivity } from '@/lib/staff-presence.functions'
import { supportNameRequired } from '@/lib/support-name'
import { useVisibleActivity } from '@/lib/use-customer-activity'
import { useInboxData } from '@/lib/use-inbox-data'
import { useOrderClock } from '@/lib/use-order-clock'
import { cn } from '@/lib/utils'

const searchSchema = z.object({
  tab: z
    .enum(['chat', 'orders', 'customers', 'feedback', 'notifications', 'campaigns', 'admins', 'payment-test', 'profile'])
    .optional()
    .catch(undefined),
  customer: z.string().min(1).max(128).optional().catch(undefined),
  order: z.string().max(20).optional().catch(undefined),
  chat: z.uuid().optional().catch(undefined),
  testRef: z.string().regex(/^se-test-[0-9a-f-]{36}$/).optional().catch(undefined),
})

const staffPages = [
  { key: 'chat', label: 'Website chat', Icon: MessageSquare },
  { key: 'orders', label: 'Orders', Icon: Package },
  { key: 'customers', label: 'Customers', Icon: Users },
  { key: 'feedback', label: 'Feedback', Icon: Star },
  { key: 'notifications', label: 'Notifications', Icon: Bell },
  { key: 'campaigns', label: 'Campaigns', Icon: Gift },
  { key: 'profile', label: 'My profile', Icon: UserRound },
  { key: 'payment-test', label: 'Payment test', Icon: CreditCard },
  { key: 'admins', label: 'Admins', Icon: Shield },
] as const

export const Route = createFileRoute('/admin')({
  validateSearch: (search) => searchSchema.parse(search),
  beforeLoad: async ({ location, search }) => {
    const user = await getServerUser()
    if (!user)
      throw redirect({ to: '/account', search: { next: location.href } })
    if (!user.isAdmin) {
      throw redirect({
        to: '/account',
        search: { next: '/admin', denied: true },
      })
    }
    if (search.tab === 'admins' && !user.canManageStaff) {
      throw redirect({ to: '/admin', search: { tab: 'chat' } })
    }
    return { canManageStaff: user.canManageStaff, supportName: user.supportName }
  },
  loaderDeps: ({ search }) => ({ tab: search.tab, customer: search.customer }),
  loader: async ({ deps }) => ({
    orders: deps.tab === 'orders'
      ? await listStaffOrders({ data: { customerId: deps.customer } })
      : [],
    avatarId: deps.tab === 'profile' ? await getMyStaffAvatar() : null,
    discounts: deps.tab === 'campaigns' ? await listDiscountCodes() : [],
  }),
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({
    meta: [
      { title: 'Staff portal — SpeedyEssays' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Admin,
})

function Admin() {
  const { tab = 'chat', customer, chat, order, testRef } = Route.useSearch()
  const { orders, avatarId, discounts } = Route.useLoaderData()
  const { canManageStaff, supportName } = Route.useRouteContext()
  useVisibleActivity(recordStaffActivity, Boolean(supportName))
  const { data: counts, refresh: refreshUnread } = useInboxData(getStaffInboxCounts)
  const online = new Set(counts?.onlineCustomers)
  return (
    <PortalShell>
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-semibold">Staff portal</h1>
          <UnreadBadge count={(counts?.website ?? 0) + (counts?.ordersTotal ?? 0)} />
        </div>
        {supportName && (
          <p className="mt-2 text-sm text-muted-foreground">
            Replying as {supportName} Support:
          </p>
        )}
      </header>
      <nav
        className="mb-6 flex flex-wrap gap-2 border-b pb-3"
        aria-label="Staff portal"
      >
        {staffPages
          .filter(({ key }) => key !== 'admins' || canManageStaff)
          .map(({ key, label, Icon }) => (
            <Button
              key={key}
              variant={tab === key ? 'default' : 'ghost'}
              asChild
            >
              <Link
                to="/admin"
                search={{ tab: key }}
                aria-current={tab === key ? 'page' : undefined}
              >
                <Icon /> {label}
                {key === 'chat' && <UnreadBadge count={counts?.website} />}
                {key === 'orders' && <UnreadBadge count={counts?.ordersTotal} />}
              </Link>
            </Button>
          ))}
      </nav>
      {tab === 'chat' && (
        <SupportInbox key={chat ?? 'inbox'} focus={chat} online={online} onRead={refreshUnread} />
      )}
      {tab === 'customers' && (
        <StaffCustomers selected={customer} unreadByCustomer={counts?.customers} online={online} />
      )}
      {tab === 'admins' && canManageStaff && <StaffAdmins />}
      {tab === 'feedback' && <StaffFeedback />}
      {tab === 'campaigns' && <StaffCampaigns key={customer ?? 'all'} codes={discounts} customerId={customer} />}
      {tab === 'profile' && <StaffProfile avatarId={avatarId} supportName={supportName} />}
      {tab === 'payment-test' && <StaffPaymentTest key={testRef ?? 'new'} reference={testRef} />}
      {tab === 'notifications' && <StaffNotifications key={`${customer ?? ''}:${order ?? ''}`} customerId={customer} orderCode={order} />}
      {tab === 'orders' && (
        <StaffOrders
          orders={orders}
          customer={customer}
          unreadByOrder={counts?.orders}
          onRead={refreshUnread}
        />
      )}
    </PortalShell>
  )
}

function StaffOrders({
  orders,
  customer,
  unreadByOrder,
  onRead,
}: {
  orders: AdminOrderView[]
  customer?: string
  unreadByOrder?: Record<string, number>
  onRead: () => void
}) {
  const { order: selected } = Route.useSearch()
  const { supportName } = Route.useRouteContext()
  const router = useRouter()
  const now = useOrderClock()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<OrderStatus | 'all' | 'overdue'>('all')
  const needle = query.trim().toLowerCase()
  const matching = orders.filter((order) => {
    if (filter === 'overdue') {
      if (
        now === null ||
        !hasOpenDeadline(order.status) ||
        !isDeadlinePast(order.dueAt, now)
      )
        return false
    } else if (filter !== 'all' && order.status !== filter) {
      return false
    }
    return [order.code, order.title, order.clientName, order.clientEmail].some(
      (value) => value?.toLowerCase().includes(needle),
    )
  })
  const order = matching.find((item) => item.code === selected) ?? matching[0]

  async function refresh() {
    setError(false)
    setRefreshing(true)
    try {
      await router.invalidate()
      setNotice('Orders refreshed.')
    } catch {
      setError(true)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <section aria-label="Customer orders" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Search orders"
          type="search"
          placeholder="Search by order number, topic or customer"
          className="w-full max-w-sm rounded-md border bg-card px-3 py-2 text-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Filter orders by status"
          className="h-9 rounded-md border bg-card px-3 text-sm"
          value={filter}
          onChange={(event) => setFilter(event.target.value as typeof filter)}
        >
          <option value="all">All statuses</option>
          <option value="overdue">Overdue</option>
          {orderStatuses.map((status) => (
            <option key={status} value={status}>
              {statusMeta[status].label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          {refreshing ? 'Refreshing…' : 'Refresh orders'}
        </Button>
        {customer && (
          <Button size="sm" variant="outline" asChild>
            <Link to="/admin" search={{ tab: 'orders' }}>
              All orders
            </Link>
          </Button>
        )}
        {notice && (
          <span role="status" className="text-sm text-muted-foreground">
            {notice}
          </span>
        )}
        {error && (
          <span role="alert" className="text-sm text-destructive">
            Orders couldn’t refresh.
          </span>
        )}
      </div>
      {order ? (
        <>
          <Table
            className="min-w-[47rem] border-separate border-spacing-0 text-left"
            containerProps={{
              className: 'max-h-96 overflow-auto rounded-xl border bg-card',
              role: 'region',
              'aria-label': 'Order list',
              tabIndex: 0,
            }}
          >
            <TableCaption className="sr-only">Customer orders</TableCaption>
            <TableHeader className="sticky top-0 z-10 bg-secondary text-xs">
              <TableRow className="hover:bg-secondary">
                {[
                  'Order',
                  'Customer',
                  'Status',
                  'Deadline',
                  'Total (USD)',
                  'Messages',
                ].map((label) => (
                  <TableHead
                    key={label}
                    scope="col"
                    className="border-b px-3 font-semibold"
                  >
                    {label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {matching.map((item) => (
                <TableRow
                  key={item.code}
                  className={cn(
                    '[&>td]:border-b [&>th]:border-b',
                    item.code === order.code
                      ? 'bg-secondary/65'
                      : 'hover:bg-secondary/35',
                  )}
                >
                  <th
                    scope="row"
                    className="w-1/4 px-3 py-2.5 align-top font-normal"
                  >
                    <Link
                      to="/admin"
                      search={{ tab: 'orders', customer, order: item.code }}
                      hash="staff-order-detail"
                      aria-current={
                        item.code === order.code ? 'true' : undefined
                      }
                      className="block rounded-sm text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      <span className="font-semibold">{item.code}</span>
                      <span className="block break-words text-xs text-muted-foreground">
                        {item.title}
                      </span>
                    </Link>
                  </th>
                  <TableCell className="w-1/5 px-3 py-2.5 align-top whitespace-normal">
                    {item.clientName && (
                      <span className="block break-words font-medium">
                        {item.clientName}
                      </span>
                    )}
                    <span className="block break-all text-xs text-muted-foreground">
                      {item.clientEmail}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top whitespace-normal">
                    <span className="inline-block rounded-md border bg-card px-2 py-0.5 text-xs font-medium">
                      {statusMeta[item.status]?.label ?? item.status}
                    </span>
                  </TableCell>
                  <TableCell className="min-w-40 px-3 py-2.5 align-top text-xs whitespace-normal">
                    <OrderDeadline order={item} now={now} />
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top font-medium tabular-nums">
                    {formatUSD(item.price)}
                  </TableCell>
                  <TableCell className="px-3 py-2.5 align-top text-xs">
                    <UnreadBadge count={unreadByOrder?.[item.code]} />
                    {item.awaitingReply && (
                      <span className="block font-medium">Awaiting reply</span>
                    )}
                    {!unreadByOrder?.[item.code] && !item.awaitingReply && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <section
            id="staff-order-detail"
            aria-label={`Selected order ${order.code}`}
            className="scroll-mt-4 space-y-3"
            key={order.code}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
              <div>
                {order.clientName && (
                  <p className="break-words text-sm font-semibold">
                    {order.clientName}
                  </p>
                )}
                <p className="break-all text-sm text-muted-foreground">
                  {order.clientEmail}
                </p>
                <StaffCustomerPresence userId={order.clientId} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="xl:hidden"
                  asChild
                >
                  <a href="#staff-order-actions">Order actions</a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link
                    to="/admin"
                    search={{ tab: 'customers', customer: order.clientId }}
                  >
                    Customer profile
                  </Link>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link
                    to="/admin"
                    search={{
                      tab: 'notifications',
                      customer: order.clientId,
                      order: order.code,
                    }}
                  >
                    <Bell /> Send notification
                  </Link>
                </Button>
              </div>
            </div>
            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <OrderPanel
                order={order}
                now={now}
                staff
                replyNotice={supportName ? undefined : supportNameRequired}
                onRead={onRead}
              />
              <aside
                id="staff-order-actions"
                aria-label="Order actions"
                className="min-w-0 scroll-mt-4 space-y-3"
              >
                <StaffOrderStatus
                  key={`${order.status}:${order.checkoutStarted}`}
                  order={order}
                  now={now}
                  onSaved={async (message) => {
                    await router.invalidate()
                    setNotice(message)
                  }}
                />
                <StaffOrderDetails
                  key={order.detailsRevision}
                  order={order}
                  onSaved={async () => {
                    setNotice('Order details saved.')
                    await router.invalidate()
                  }}
                />
                {canCheckout(order) && (
                  <StaffPaymentReminder code={order.code} />
                )}
                <StaffOrderPrice
                  order={order}
                  onSaved={async (message) => {
                    await router.invalidate()
                    setNotice(message)
                  }}
                />
                <StaffOrderEmail order={order} />
              </aside>
            </div>
          </section>
        </>
      ) : (
        <p className="rounded-xl border bg-card p-6">
          {needle || filter !== 'all'
            ? 'No matching orders.'
            : 'No orders yet.'}
        </p>
      )}
    </section>
  )
}

function SupportInbox({
  focus,
  online,
  onRead,
}: {
  focus?: string
  online: ReadonlySet<string>
  onRead: () => void
}) {
  const [selected, setSelected] = useState(focus ?? '')
  const [marking, setMarking] = useState(false)
  const [markError, setMarkError] = useState(false)
  const load = useCallback(() => listSupportChats({ data: { focus } }), [focus])
  const { data: chats, error, refresh } = useInboxData(load, 7000)
  const chat = chats?.find((item) => item.id === selected)
  const refreshAfterRead = useCallback(() => {
    refresh()
    onRead()
  }, [refresh, onRead])

  async function markConversation(id: string) {
    setMarking(true)
    setMarkError(false)
    try {
      await markSupportChatRead({ data: { id } })
      refreshAfterRead()
    } catch {
      setMarkError(true)
    } finally {
      setMarking(false)
    }
  }
  return (
    <section className="space-y-3" aria-label="Website chat inbox">
      {error && (
        <p role="status" className="text-destructive">
          Conversations couldn’t load. Retrying…
        </p>
      )}
      {chats === null && !error && <p role="status">Loading conversations…</p>}
      {markError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn’t mark the conversation as read. Try again.
        </p>
      )}
      {chats?.length === 0 && (
        <p className="rounded-xl border bg-card p-5">
          No website chats yet. You can also start a chat from Customers.
        </p>
      )}
      {Boolean(chats?.length) && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-2" aria-label="Conversations">
            {chats?.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'rounded-lg border',
                  item.id === chat?.id
                    ? 'border-primary bg-secondary'
                    : 'bg-card',
                )}
              >
                <button
                  type="button"
                  aria-pressed={item.id === chat?.id}
                  onClick={() => setSelected(item.id)}
                  className="block w-full rounded-lg p-3 text-left text-sm"
                >
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {item.userId && online.has(item.userId) && <OnlineDot />}
                    <span className="min-w-0 break-words">
                      {item.name || item.email || `Visitor ${item.id.slice(0, 8)}`}
                    </span>
                    <UnreadBadge count={item.unread} />
                  </span>
                  <span className="block truncate">
                    {item.latest ?? 'Start a conversation'}
                  </span>
                  {item.sender === 'visitor' && (
                    <span className="block text-xs text-muted-foreground">
                      Awaiting reply
                    </span>
                  )}
                </button>
                {item.unread > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mx-2 mb-2"
                    disabled={marking}
                    onClick={() => void markConversation(item.id)}
                  >
                    Mark as read
                  </Button>
                )}
              </div>
            ))}
          </div>
          {chat ? <div className="min-w-0 rounded-xl border bg-card p-5">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="break-all text-lg font-semibold">
                  {chat.name || chat.email || 'Website visitor'}
                </h2>
                {chat.userId && (
                  <StaffCustomerPresence key={chat.userId} userId={chat.userId} />
                )}
              </div>
              {chat.userId && (
                <Button size="sm" variant="outline" asChild>
                  <Link
                    to="/admin"
                    search={{ tab: 'customers', customer: chat.userId }}
                  >
                    Customer profile
                  </Link>
                </Button>
              )}
            </header>
            <SupportConversation
              key={chat.id}
              id={chat.id}
              customer={Boolean(chat.userId)}
              onRead={refreshAfterRead}
            />
          </div> : (
            <p className="self-start rounded-xl border bg-card p-5">
              Select a conversation to read or reply.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function SupportConversation({
  id,
  customer,
  onRead,
}: {
  id: string
  customer: boolean
  onRead: () => void
}) {
  const { supportName } = Route.useRouteContext()
  const load = useCallback(() => readSupportChat({ data: { id } }), [id])
  const send = useCallback(
    (body: string) => sendSupportChat({ data: { id, body } }),
    [id],
  )
  const markRead = useCallback(
    (through: number) => markSupportChatRead({ data: { id, through } }),
    [id],
  )
  return (
    <ChatThread
      load={load}
      send={send}
      markRead={markRead}
      onRead={onRead}
      ownSender="agent"
      ownLabel="Support"
      otherLabel={customer ? 'Customer' : 'Visitor'}
      emptyText="No messages yet."
      replyNotice={supportName ? undefined : supportNameRequired}
    />
  )
}
