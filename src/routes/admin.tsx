import { useCallback, useEffect, useState } from 'react'
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { MessageSquare, Package, Shield, Users } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { ChatThread } from '@/components/chat-thread'
import { OrderPanel } from '@/components/order-panel'
import { PortalShell } from '@/components/portal-shell'
import { StaffAdmins } from '@/components/staff-admins'
import { StaffCustomers } from '@/components/staff-customers'
import { StaffOrderDetails } from '@/components/staff-order-details'
import {
  listSupportChats,
  readSupportChat,
  sendSupportChat,
} from '@/lib/chat.functions'
import { getServerUser } from '@/lib/identity.functions'
import { statusMeta, type AdminOrderView } from '@/lib/orders'
import { listStaffOrders } from '@/lib/orders.functions'
import { cn } from '@/lib/utils'

const searchSchema = z.object({
  tab: z
    .enum(['chat', 'orders', 'customers', 'admins'])
    .optional()
    .catch(undefined),
  customer: z.string().min(1).max(128).optional().catch(undefined),
  order: z.string().max(20).optional().catch(undefined),
  chat: z.uuid().optional().catch(undefined),
})

const staffPages = [
  { key: 'chat', label: 'Website chat', Icon: MessageSquare },
  { key: 'orders', label: 'Orders', Icon: Package },
  { key: 'customers', label: 'Customers', Icon: Users },
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
    return { canManageStaff: user.canManageStaff }
  },
  loaderDeps: ({ search }) => ({ tab: search.tab, customer: search.customer }),
  loader: ({ deps }) =>
    deps.tab === 'orders'
      ? listStaffOrders({ data: { customerId: deps.customer } })
      : [],
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
  const { tab = 'chat', customer, chat } = Route.useSearch()
  const orders = Route.useLoaderData()
  const { canManageStaff } = Route.useRouteContext()
  return (
    <PortalShell>
      <h1 className="mb-5 text-4xl font-semibold">Staff portal</h1>
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
              </Link>
            </Button>
          ))}
      </nav>
      {tab === 'chat' && <SupportInbox key={chat ?? 'inbox'} focus={chat} />}
      {tab === 'customers' && <StaffCustomers selected={customer} />}
      {tab === 'admins' && canManageStaff && <StaffAdmins />}
      {tab === 'orders' && <StaffOrders orders={orders} customer={customer} />}
    </PortalShell>
  )
}

function StaffOrders({
  orders,
  customer,
}: {
  orders: AdminOrderView[]
  customer?: string
}) {
  const { order: selected } = Route.useSearch()
  const router = useRouter()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLowerCase()
  const matching = orders.filter((order) =>
    [order.code, order.title, order.clientName, order.clientEmail].some(
      (value) => value?.toLowerCase().includes(needle),
    ),
  )
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
    <section aria-label="Customer orders">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          aria-label="Search orders"
          type="search"
          placeholder="Search by order number, topic or customer"
          className="w-full max-w-sm rounded-md border bg-card px-3 py-2 text-sm"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
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
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <nav className="space-y-2" aria-label="Order list">
            {matching.map((item) => (
              <Link
                to="/admin"
                search={{ tab: 'orders', customer, order: item.code }}
                key={item.code}
                aria-current={item.code === order.code ? 'true' : undefined}
                className={cn(
                  'block rounded-lg border p-3 text-sm',
                  item.code === order.code
                    ? 'border-primary bg-secondary'
                    : 'bg-card',
                )}
              >
                <span className="block font-semibold">
                  {item.code} · {statusMeta[item.status]?.label ?? item.status}
                </span>
                <span className="block break-words">{item.title}</span>
                <span className="block break-all text-xs text-muted-foreground">
                  {item.clientEmail}
                  {item.awaitingReply ? ' · Awaiting reply' : ''}
                </span>
              </Link>
            ))}
          </nav>
          <div className="min-w-0 space-y-3" key={order.code}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="break-all text-sm text-muted-foreground">
                {order.clientEmail}
              </p>
              <Button size="sm" variant="outline" asChild>
                <Link
                  to="/admin"
                  search={{ tab: 'customers', customer: order.clientId }}
                >
                  Customer profile
                </Link>
              </Button>
            </div>
            {order.status !== 'cancelled' && (
              <StaffOrderDetails
                key={order.detailsRevision}
                order={order}
                onSaved={async () => {
                  setNotice('Order details saved.')
                  await router.invalidate()
                }}
              />
            )}
            <OrderPanel order={order} staff />
          </div>
        </div>
      ) : (
        <p className="rounded-xl border bg-card p-6">
          {needle ? 'No matching orders.' : 'No orders yet.'}
        </p>
      )}
    </section>
  )
}

function SupportInbox({ focus }: { focus?: string }) {
  const [selected, setSelected] = useState(focus ?? '')
  const [chats, setChats] = useState<Awaited<
    ReturnType<typeof listSupportChats>
  > | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        if (!document.hidden) {
          const rows = await listSupportChats({ data: { focus } })
          if (active) {
            setChats(rows)
            setError(false)
          }
        }
      } catch {
        if (active) setError(true)
      } finally {
        if (active) timer = setTimeout(poll, 7000)
      }
    }
    void poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [focus])

  const chat = chats?.find((item) => item.id === selected) ?? chats?.[0]
  return (
    <section className="space-y-3" aria-label="Website chat inbox">
      {error && (
        <p role="status" className="text-destructive">
          Conversations couldn’t load. Retrying…
        </p>
      )}
      {chats === null && !error && <p role="status">Loading conversations…</p>}
      {chats?.length === 0 && (
        <p className="rounded-xl border bg-card p-5">
          No website chats yet. You can also start a chat from Customers.
        </p>
      )}
      {chat && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-2" aria-label="Conversations">
            {chats?.map((item) => (
              <button
                type="button"
                key={item.id}
                aria-pressed={item.id === chat.id}
                onClick={() => setSelected(item.id)}
                className={cn(
                  'block w-full rounded-lg border p-3 text-left text-sm',
                  item.id === chat.id
                    ? 'border-primary bg-secondary'
                    : 'bg-card',
                )}
              >
                <span className="block break-words font-semibold">
                  {item.name || item.email || `Visitor ${item.id.slice(0, 8)}`}
                  {item.sender === 'visitor' ? ' · Awaiting reply' : ''}
                </span>
                <span className="block truncate">
                  {item.latest ?? 'Start a conversation'}
                </span>
              </button>
            ))}
          </div>
          <div className="min-w-0 rounded-xl border bg-card p-5">
            <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="break-all text-lg font-semibold">
                {chat.name || chat.email || 'Website visitor'}
              </h2>
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
            />
          </div>
        </div>
      )}
    </section>
  )
}

function SupportConversation({
  id,
  customer,
}: {
  id: string
  customer: boolean
}) {
  const load = useCallback(() => readSupportChat({ data: { id } }), [id])
  const send = useCallback(
    (body: string) => sendSupportChat({ data: { id, body } }),
    [id],
  )
  return (
    <ChatThread
      load={load}
      send={send}
      ownSender="agent"
      otherLabel={customer ? 'Customer' : 'Visitor'}
      emptyText="No messages yet."
    />
  )
}
