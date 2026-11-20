import { useCallback, useEffect, useState } from 'react'
import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router'
import { PageShell } from '@/components/site/page-shell'
import { Button } from '@/components/ui/button'
import { ChatThread } from '@/components/chat-thread'
import { OrderPanel } from '@/components/order-panel'
import { SignOut } from '@/components/sign-out'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { listSupportChats, readSupportChat, sendSupportChat } from '@/lib/chat.functions'
import { getServerUser } from '@/lib/identity.functions'
import { statusMeta } from '@/lib/orders'
import { listStaffOrders } from '@/lib/orders.functions'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const user = await getServerUser()
    if (!user) throw redirect({ to: '/account', search: { next: '/admin' } })
    if (!user.isAdmin) throw redirect({ to: '/dashboard' })
  },
  loader: () => listStaffOrders(),
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({
    meta: [{ title: 'Staff dashboard — SpeedyEssays' }, { name: 'robots', content: 'noindex' }],
  }),
  component: Admin,
})

function Admin() {
  const orders = Route.useLoaderData()
  const router = useRouter()
  const [selectedOrder, setSelectedOrder] = useState('')
  const order = orders.find((item) => item.code === selectedOrder) ?? orders[0]
  const [loadedAt, setLoadedAt] = useState('')
  const [error, setError] = useState(false)

  return (
    <PageShell>
      <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-4xl font-semibold">Staff dashboard</h1>
          <nav className="flex gap-2" aria-label="Staff actions">
            <Button variant="outline" asChild>
              <Link to="/dashboard">Customer portal</Link>
            </Button>
            <SignOut />
          </nav>
        </header>
        <Tabs defaultValue="orders">
          <TabsList>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="support">Website chat</TabsTrigger>
          </TabsList>
          <TabsContent value="orders" className="mt-4">
            <div className="mb-3 flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  setError(false)
                  try {
                    await router.invalidate()
                    setLoadedAt(new Date().toLocaleTimeString())
                  } catch {
                    setError(true)
                  }
                }}
              >
                Refresh orders
              </Button>
              {loadedAt && (
                <span role="status" className="text-sm text-muted-foreground">
                  Updated at {loadedAt}
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
                <div className="space-y-2" aria-label="Customer orders">
                  {orders.map((item) => (
                    <button
                      type="button"
                      key={item.code}
                      aria-pressed={item.code === order.code}
                      onClick={() => setSelectedOrder(item.code)}
                      className={`block w-full rounded-lg border p-3 text-left text-sm ${item.code === order.code ? 'border-primary bg-secondary' : 'bg-card'}`}
                    >
                      <span className="block font-semibold">
                        {item.code} · {statusMeta[item.status]?.label ?? item.status}
                      </span>
                      <span className="block break-words">{item.title}</span>
                      <span className="block break-all text-xs text-muted-foreground">
                        {item.clientEmail}
                        {item.awaitingReply ? ' · Awaiting reply' : ''}
                      </span>
                    </button>
                  ))}
                </div>
                <OrderPanel key={order.code} order={order} staff />
              </div>
            ) : (
              <p className="rounded-xl border bg-card p-6">
                Orders will appear here when customers place them.
              </p>
            )}
          </TabsContent>
          <TabsContent value="support" className="mt-4">
            <SupportInbox />
          </TabsContent>
        </Tabs>
      </div>
    </PageShell>
  )
}

function SupportInbox() {
  const [selected, setSelected] = useState('')
  const [chats, setChats] = useState<Awaited<ReturnType<typeof listSupportChats>> | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        if (!document.hidden) {
          const rows = await listSupportChats()
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
  }, [])

  const id = chats?.find((chat) => chat.id === selected)?.id ?? chats?.[0]?.id
  return (
    <section className="space-y-3" aria-label="Website chat inbox">
      {error && (
        <p role="status" className="text-destructive">
          Conversations couldn’t load. Retrying…
        </p>
      )}
      {chats === null && !error && <p role="status">Loading conversations…</p>}
      {chats?.length === 0 && <p>No website messages yet.</p>}
      {id && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="space-y-2">
            {chats?.map((chat) => (
              <button
                type="button"
                key={chat.id}
                aria-pressed={chat.id === id}
                onClick={() => setSelected(chat.id)}
                className={`block w-full rounded-lg border p-3 text-left text-sm ${chat.id === id ? 'border-primary bg-secondary' : 'bg-card'}`}
              >
                <span className="block font-semibold">
                  Visitor {chat.id.slice(0, 8)}
                  {chat.sender === 'visitor' ? ' · Awaiting reply' : ''}
                </span>
                <span className="block truncate">{chat.latest}</span>
              </button>
            ))}
          </div>
          <div className="min-w-0 rounded-xl border bg-card p-5">
            <SupportConversation key={id} id={id} />
          </div>
        </div>
      )}
    </section>
  )
}

function SupportConversation({ id }: { id: string }) {
  const load = useCallback(() => readSupportChat({ data: { id } }), [id])
  const send = useCallback((body: string) => sendSupportChat({ data: { id, body } }), [id])
  return (
    <ChatThread load={load} send={send} ownSender="agent" otherLabel="Visitor" emptyText="No messages yet." />
  )
}
