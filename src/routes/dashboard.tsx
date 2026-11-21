import { useEffect, useState } from 'react'
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { PortalShell } from '@/components/portal-shell'
import { SupportChat } from '@/components/chat-widget'
import { Button } from '@/components/ui/button'
import { OrderPanel } from '@/components/order-panel'
import { getMyDisplayName } from '@/lib/customers.functions'
import { getServerUser } from '@/lib/identity.functions'
import { listMyOrders } from '@/lib/orders.functions'
import { isCheckoutAvailable, refreshPayment } from '@/lib/payments.functions'
import { statusMeta, type OrderStatus, type OrderView } from '@/lib/orders'
import { useCustomerActivity } from '@/lib/use-customer-activity'

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
  ): { order?: string; reference?: string; tab?: 'chat' } => ({
    tab: search.tab === 'chat' ? 'chat' : undefined,
    order: typeof search.order === 'string' ? search.order : undefined,
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
    const [orders, checkout, displayName] = await Promise.all([
      listMyOrders(),
      isCheckoutAvailable(),
      getMyDisplayName(),
    ])
    return { orders, checkout, displayName }
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
  const { orders, checkout, displayName } = Route.useLoaderData()
  const { order, reference, tab } = Route.useSearch()
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
        paid ? 'Payment confirmed.' : 'Payment has not been confirmed yet.',
      )
    } catch {
      setPaymentNotice(
        'Payment confirmation is temporarily unavailable. Try refreshing the status shortly.',
      )
    } finally {
      setVerifying(false)
    }
  }

  useEffect(() => {
    if (!reference) return
    void refreshPayment({ data: { reference } }).then(
      () => router.invalidate(),
      () =>
        setPaymentNotice(
          'Payment confirmation is still pending. You can refresh the status below.',
        ),
    )
  }, [reference, router])

  return (
    <PortalShell>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Customer portal</h1>
          <p className="mt-2 break-all text-sm text-muted-foreground">
            {displayName || user.name || user.email}
          </p>
        </div>
        <Button asChild>
          <Link to="/order">New order</Link>
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
            My orders
          </Link>
        </Button>
        <Button variant={tab === 'chat' ? 'default' : 'ghost'} asChild>
          <Link
            to="/dashboard"
            search={{ tab: 'chat', order }}
            aria-current={tab === 'chat' ? 'page' : undefined}
          >
            Live chat
          </Link>
        </Button>
      </nav>
      {tab === 'chat' ? (
        <section
          className="max-w-2xl rounded-xl border bg-card p-5 sm:p-6"
          aria-label="Live chat"
        >
          <h2 className="mb-3 text-2xl font-semibold">Live chat</h2>
          <SupportChat />
        </section>
      ) : (
        <>
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
              <CustomerOrderList orders={orders} selected={selected.code} />
              <OrderPanel
                key={selected.code}
                order={selected}
                checkout={checkout}
                allowApproval={!user.isAdmin}
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
}: {
  orders: OrderView[]
  selected: string
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
              <span className="block font-semibold">
                {item.code} · {statusMeta[item.status]?.label ?? item.status}
              </span>
              <span className="block break-words">{item.title}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
