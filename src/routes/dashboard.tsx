import { useEffect, useState } from 'react'
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { Bell, MessageSquare, Package, Plus } from 'lucide-react'
import { PortalShell } from '@/components/portal-shell'
import { UnreadBadge } from '@/components/chat-indicators'
import { SupportChat } from '@/components/chat-widget'
import { CustomerNotifications } from '@/components/customer-notifications'
import { Button } from '@/components/ui/button'
import { OrderDeadline } from '@/components/order-deadline'
import { OrderPanel } from '@/components/order-panel'
import { getMyDisplayName } from '@/lib/customers.functions'
import { getCustomerInboxCounts } from '@/lib/chat.functions'
import { getServerUser } from '@/lib/identity.functions'
import { listMyOrders } from '@/lib/orders.functions'
import { refreshPayment } from '@/lib/payments.functions'
import { canCheckout, statusMeta, type OrderStatus, type OrderView } from '@/lib/orders'
import { useCustomerActivity } from '@/lib/use-customer-activity'
import { useInboxData } from '@/lib/use-inbox-data'
import { useOrderClock } from '@/lib/use-order-clock'

const orderGroupLabels = {
  'awaiting-payment': 'Orders awaiting payment',
  'in-progress': 'Orders in progress',
  revision: 'Orders in revision',
  completed: 'Completed orders',
  approved: 'Approved orders',
  cancelled: 'Cancelled orders',
  other: 'Other orders',
} as const

const orderGroupByStatus: Record<OrderStatus, keyof typeof orderGroupLabels> = {
  'awaiting-payment': 'awaiting-payment',
  paid: 'in-progress',
  'writer-assigned': 'in-progress',
  'in-progress': 'in-progress',
  'draft-ready': 'in-progress',
  revision: 'revision',
  completed: 'completed',
  approved: 'approved',
  cancelled: 'cancelled',
}

export const Route = createFileRoute('/dashboard')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { order?: string; reference?: string; paymentExit?: 'closed'; tab?: 'chat' | 'notifications' } => ({
    tab: search.tab === 'chat' || search.tab === 'notifications' ? search.tab : undefined,
    order: typeof search.order === 'string' ? search.order : undefined,
    paymentExit: search.paymentExit === 'closed' ? 'closed' : undefined,
    reference:
      typeof search.reference === 'string' &&
      /^se-[0-9a-f-]{36}$/.test(search.reference)
        ? search.reference
        : typeof search.trxref === 'string' &&
            /^se-[0-9a-f-]{36}$/.test(search.trxref)
          ? search.trxref
          : undefined,
  }),
  beforeLoad: async ({ location }) => {
    const user = await getServerUser()
    if (!user)
      throw redirect({ to: '/account', search: { next: location.href } })
    return { user }
  },
  loader: async () => {
    const [orders, displayName] = await Promise.all([
      listMyOrders(),
      getMyDisplayName(),
    ])
    return { orders, displayName }
  },
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({
    meta: [
      { title: 'Customer portal — SpeedyEssays' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: Dashboard,
})

function Dashboard() {
  const { user } = Route.useRouteContext()
  useCustomerActivity(!user.isAdmin)
  const { data: counts, refresh: refreshUnread } = useInboxData(getCustomerInboxCounts)
  const { orders, displayName } = Route.useLoaderData()
  const now = useOrderClock()
  const { order, reference, paymentExit, tab } = Route.useSearch()
  const router = useRouter()
  const [paymentNotice, setPaymentNotice] = useState('')
  const [verifying, setVerifying] = useState(false)
  const selected = orders.find((item) => item.code === order) ?? orders[0]

  async function checkPayment() {
    if (!reference) return
    setVerifying(true)
    setPaymentNotice('')
    try {
      const { paid } = await refreshPayment({ data: { reference } })
      await router.invalidate()
      setPaymentNotice(
        paid ? 'Payment confirmed.' : 'Paystack hasn’t confirmed the payment yet.',
      )
    } catch {
      setPaymentNotice(
        'Payment confirmation is temporarily unavailable. Please refresh the status or contact support.',
      )
    } finally {
      setVerifying(false)
    }
  }

  useEffect(() => {
    if (!reference) return
    let active = true
    void refreshPayment({ data: { reference } }).then(
      ({ paid }) => {
        if (!active) return
        setPaymentNotice(paid ? 'Payment confirmed.' : 'Paystack hasn’t confirmed the payment yet.')
        void router.invalidate()
      },
      () => {
        if (active) setPaymentNotice('Payment confirmation is still pending. Please refresh the status or contact support.')
      },
    )
    return () => { active = false }
  }, [reference, router])

  return (
    <PortalShell>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-5 sm:p-6">
        <div>
          <h1 className="text-3xl font-semibold sm:text-4xl">Customer portal</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="break-all text-sm text-muted-foreground">
              {displayName || user.name || user.email}
            </p>
            <UnreadBadge count={(counts?.website ?? 0) + (counts?.ordersTotal ?? 0) + (counts?.notifications ?? 0)} />
          </div>
        </div>
        <Button asChild>
          <Link to="/order"><Plus /> New order</Link>
        </Button>
      </header>
      <nav
        className="mb-6 flex flex-wrap gap-2 border-b pb-3"
        aria-label="Customer portal"
      >
        <Button variant={tab ? 'ghost' : 'default'} asChild>
          <Link
            to="/dashboard"
            search={{ order }}
            aria-current={tab ? undefined : 'page'}
          >
            <Package /> My orders <UnreadBadge count={counts?.ordersTotal} />
          </Link>
        </Button>
        <Button variant={tab === 'chat' ? 'default' : 'ghost'} asChild>
          <Link
            to="/dashboard"
            search={{ tab: 'chat', order }}
            aria-current={tab === 'chat' ? 'page' : undefined}
          >
            <MessageSquare /> Live chat <UnreadBadge count={counts?.website} />
          </Link>
        </Button>
        <Button variant={tab === 'notifications' ? 'default' : 'ghost'} asChild>
          <Link
            to="/dashboard"
            search={{ tab: 'notifications', order }}
            aria-current={tab === 'notifications' ? 'page' : undefined}
          >
            <Bell /> Notifications &amp; offers <UnreadBadge count={counts?.notifications} />
          </Link>
        </Button>
      </nav>
      {tab === 'notifications' ? (
        <CustomerNotifications unread={counts?.notifications ?? 0} onRead={refreshUnread} />
      ) : tab === 'chat' ? (
        <section
          className="max-w-2xl rounded-xl border bg-card p-5 sm:p-6"
          aria-label="Live chat"
        >
          <h2 className="mb-3 text-2xl font-semibold">Live chat</h2>
          <SupportChat onRead={refreshUnread} />
        </section>
      ) : (
        <>
          {paymentExit === 'closed' && selected && selected.code === order && canCheckout(selected) && (
            <p role="status" className="mb-5 rounded-lg border bg-card p-3 text-sm">
              Checkout closed. Your order is saved. Select Complete payment to try again or{' '}
              <Link to="/dashboard" search={{ tab: 'chat', order }} className="font-medium underline underline-offset-2">
                contact support
              </Link>{' '}
              for help.
            </p>
          )}
          {reference && (
            <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
              <Button
                size="sm"
                variant="outline"
                disabled={verifying}
                onClick={() => void checkPayment()}
              >
                Refresh payment status
              </Button>
              {paymentNotice && (
                <p role="status" className="text-sm">
                  {paymentNotice}
                </p>
              )}
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-2xl font-semibold">My orders</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void router.invalidate()}
            >
              Refresh orders
            </Button>
          </div>
          {selected ? (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <CustomerOrderList orders={orders} selected={selected.code} unreadByOrder={counts?.orders} now={now} />
              <OrderPanel
                key={selected.code}
                order={selected}
                now={now}
                onRead={refreshUnread}
              />
            </div>
          ) : (
            <p className="rounded-xl border bg-card p-6">
              Your orders will appear here after you place one.
            </p>
          )}
        </>
      )}
    </PortalShell>
  )
}

function CustomerOrderList({
  orders,
  selected,
  unreadByOrder,
  now,
}: {
  orders: OrderView[]
  selected: string
  unreadByOrder?: Record<string, number>
  now: number | null
}) {
  const groups = Object.entries(orderGroupLabels)
    .map(([key, label]) => ({
      label,
      orders: orders.filter(
        (item) => (orderGroupByStatus[item.status] ?? 'other') === key,
      ),
    }))
    .filter((group) => group.orders.length > 0)

  return (
    <nav aria-label="Your orders" className="space-y-5">
      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <h3 className="text-sm font-sans font-semibold tracking-normal">
            {group.label}
          </h3>
          {group.orders.map((item) => (
            <Link
              className={`block rounded-lg border p-3 text-sm ${item.code === selected ? 'border-primary bg-secondary' : 'bg-card'}`}
              key={item.code}
              to="/dashboard"
              search={{ order: item.code }}
              aria-current={item.code === selected ? 'true' : undefined}
            >
              <span className="flex flex-wrap items-center gap-2 font-semibold">
                <span>{item.code} · {statusMeta[item.status]?.label ?? item.status}</span>
                <UnreadBadge count={unreadByOrder?.[item.code]} />
              </span>
              <span className="block break-words">{item.title}</span>
              <span className="mt-1 block text-xs">
                <OrderDeadline order={item} now={now} />
              </span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
