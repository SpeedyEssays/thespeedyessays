import { useEffect, useState } from 'react'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { SignOut } from '@/components/sign-out'
import { PageShell } from '@/components/site/page-shell'
import { Button } from '@/components/ui/button'
import { OrderPanel } from '@/components/order-panel'
import { getServerUser } from '@/lib/identity.functions'
import { listMyOrders } from '@/lib/orders.functions'
import { isCheckoutAvailable, refreshPayment } from '@/lib/payments.functions'
import { statusMeta } from '@/lib/orders'

export const Route = createFileRoute('/dashboard')({
  validateSearch: (search: Record<string, unknown>): { order?: string; reference?: string } => ({
    order: typeof search.order === 'string' ? search.order : undefined,
    reference:
      typeof search.reference === 'string' && /^se-[0-9a-f-]{36}$/.test(search.reference)
        ? search.reference
        : typeof search.trxref === 'string' && /^se-[0-9a-f-]{36}$/.test(search.trxref)
          ? search.trxref
          : undefined,
  }),
  beforeLoad: async ({ location }) => {
    const user = await getServerUser()
    if (!user) throw redirect({ to: '/account', search: { next: location.href } })
    return { user }
  },
  loader: async () => {
    const [orders, checkout] = await Promise.all([listMyOrders(), isCheckoutAvailable()])
    return { orders, checkout }
  },
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({ meta: [{ title: 'My orders — SpeedyEssays' }, { name: 'robots', content: 'noindex' }] }),
  component: Dashboard,
})

function Dashboard() {
  const { user } = Route.useRouteContext()
  const { orders, checkout } = Route.useLoaderData()
  const { order, reference } = Route.useSearch()
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
      setPaymentNotice(paid ? 'Payment confirmed.' : 'Payment has not been confirmed yet.')
    } catch {
      setPaymentNotice('Payment confirmation is temporarily unavailable. Try refreshing the status shortly.')
    } finally {
      setVerifying(false)
    }
  }

  useEffect(() => {
    if (!reference) return
    void refreshPayment({ data: { reference } }).then(
      () => router.invalidate(),
      () => setPaymentNotice('Payment confirmation is still pending. You can refresh the status below.'),
    )
  }, [reference, router])

  return (
    <PageShell>
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-semibold">My orders</h1>
            <p className="mt-2 break-all text-sm text-muted-foreground">{user.name || user.email}</p>
          </div>
          <nav className="flex flex-wrap items-start gap-2" aria-label="Account actions">
            {user.isAdmin && (
              <Button variant="outline" asChild>
                <Link to="/admin">Staff dashboard</Link>
              </Button>
            )}
            <Button asChild>
              <Link to="/order">New order</Link>
            </Button>
            <Button variant="outline" onClick={() => void router.invalidate()}>
              Refresh orders
            </Button>
            <SignOut />
          </nav>
        </header>
        {reference && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
            <Button size="sm" variant="outline" disabled={verifying} onClick={() => void checkPayment()}>
              Refresh payment status
            </Button>
            {paymentNotice && (
              <p role="status" className="text-sm">
                {paymentNotice}
              </p>
            )}
          </div>
        )}
        {selected ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <nav aria-label="Your orders" className="space-y-2">
              {orders.map((item) => (
                <Link
                  className={`block rounded-lg border p-3 text-sm ${item.code === selected.code ? 'border-primary bg-secondary' : 'bg-card'}`}
                  key={item.code}
                  to="/dashboard"
                  search={{ order: item.code }}
                  aria-current={item.code === selected.code ? 'true' : undefined}
                >
                  <span className="block font-semibold">
                    {item.code} · {statusMeta[item.status]?.label ?? item.status}
                  </span>
                  <span className="block break-words">{item.title}</span>
                </Link>
              ))}
            </nav>
            <OrderPanel key={selected.code} order={selected} checkout={checkout} />
          </div>
        ) : (
          <p className="rounded-xl border bg-card p-6">Your orders will appear here after you place one.</p>
        )}
      </div>
    </PageShell>
  )
}
