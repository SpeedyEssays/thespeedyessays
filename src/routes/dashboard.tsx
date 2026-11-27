import { useEffect, useState } from 'react'
import {
  createFileRoute,
  Link,
  redirect,
  useRouter,
} from '@tanstack/react-router'
import { ArrowLeft, Bell, MessageSquare, Package, Plus, Wallet } from 'lucide-react'
import { PortalShell } from '@/components/portal-shell'
import { UnreadBadge } from '@/components/chat-indicators'
import { SupportChat } from '@/components/chat-widget'
import { CustomerNotifications } from '@/components/customer-notifications'
import { CustomerOrderTable } from '@/components/customer-order-table'
import { CustomerWallet } from '@/components/customer-wallet'
import { Button } from '@/components/ui/button'
import { OrderPanel } from '@/components/order-panel'
import { getMyDisplayName } from '@/lib/customers.functions'
import { getCustomerInboxCounts } from '@/lib/chat.functions'
import { getServerUser } from '@/lib/identity.functions'
import { listMyOrders } from '@/lib/orders.functions'
import { isCheckoutAvailable, refreshPayment } from '@/lib/payments.functions'
import { formatUSD } from '@/lib/pricing'
import { getMyWallet, getMyWalletBalance } from '@/lib/wallet.functions'
import { walletReferencePattern } from '@/lib/wallet'
import { canCheckout } from '@/lib/orders'
import { useCustomerActivity } from '@/lib/use-customer-activity'
import { useInboxData } from '@/lib/use-inbox-data'
import { useOrderClock } from '@/lib/use-order-clock'

export const Route = createFileRoute('/dashboard')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { order?: string; reference?: string; walletReference?: string; paymentExit?: 'closed'; tipCheckout?: 'return' | 'closed'; tab?: 'chat' | 'notifications' | 'wallet' } => ({
    tab: search.tab === 'chat' || search.tab === 'notifications' || search.tab === 'wallet' ? search.tab : undefined,
    walletReference: typeof search.walletReference === 'string' && walletReferencePattern.test(search.walletReference) ? search.walletReference : undefined,
    order: typeof search.order === 'string' ? search.order : undefined,
    paymentExit: search.paymentExit === 'closed' ? 'closed' : undefined,
    tipCheckout: search.tipCheckout === 'return' || search.tipCheckout === 'closed' ? search.tipCheckout : undefined,
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
    if (user.isAdmin)
      throw redirect({ to: '/account', search: { next: location.href, denied: true } })
    return { user }
  },
  loaderDeps: ({ search }) => ({ walletTab: search.tab === 'wallet' }),
  loader: async ({ deps }) => {
    const [orders, displayName, wallet, balanceCents, canPayTipOnline] = await Promise.all([
      listMyOrders(),
      getMyDisplayName(),
      deps.walletTab ? getMyWallet() : null,
      deps.walletTab ? null : getMyWalletBalance(),
      isCheckoutAvailable(),
    ])
    return { orders, displayName, wallet, balanceCents: wallet?.balanceCents ?? balanceCents ?? 0, canPayTipOnline }
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
  const { orders, displayName, wallet, balanceCents, canPayTipOnline } = Route.useLoaderData()
  const now = useOrderClock()
  const { order, reference, walletReference, paymentExit, tipCheckout, tab } = Route.useSearch()
  const router = useRouter()
  const [paymentNotice, setPaymentNotice] = useState('')
  const [verifying, setVerifying] = useState(false)
  const selected = order ? orders.find((item) => item.code === order) : undefined

  async function checkPayment() {
    if (!reference) return
    setVerifying(true)
    setPaymentNotice('')
    try {
      const { paid } = await refreshPayment({ data: { reference } })
      await router.invalidate()
      setPaymentNotice(
        paid ? 'Payment confirmed.' : 'The payment is still awaiting confirmation.',
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
        setPaymentNotice(paid ? 'Payment confirmed.' : 'The payment is still awaiting confirmation.')
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
            search={{}}
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
        <Button variant={tab === 'wallet' ? 'default' : 'ghost'} asChild>
          <Link to="/dashboard" search={{ tab: 'wallet' }} aria-current={tab === 'wallet' ? 'page' : undefined}>
            <Wallet /> Wallet · {formatUSD(balanceCents / 100)}
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
      {tab === 'wallet' && wallet ? (
        <CustomerWallet wallet={wallet} reference={walletReference} checkoutClosed={paymentExit === 'closed'} />
      ) : tab === 'notifications' ? (
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
            {selected ? (
              <Button variant="ghost" size="sm" className="-ml-2" asChild>
                <Link to="/dashboard" search={{}}><ArrowLeft /> Back to orders</Link>
              </Button>
            ) : <h2 className="text-2xl font-semibold">My orders</h2>}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void router.invalidate()}
            >
              Refresh orders
            </Button>
          </div>
          {order && !selected && <p role="status" className="mb-3 text-sm text-muted-foreground">That order isn’t available. You can choose an order below.</p>}
          <div hidden={Boolean(selected)}>
            <CustomerOrderTable orders={orders} unreadByOrder={counts?.orders} now={now} />
          </div>
          {selected && (
            <OrderPanel
              key={selected.code}
              order={selected}
              now={now}
              walletBalanceCents={balanceCents}
              canPayTipOnline={canPayTipOnline}
              tipCheckout={tipCheckout}
              unreadMessages={counts?.orders[selected.code]}
              onRead={refreshUnread}
            />
          )}
        </>
      )}
    </PortalShell>
  )
}
