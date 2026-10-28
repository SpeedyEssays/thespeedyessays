import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Check,
  Clock,
  Download,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Logo } from '@/components/site/site-header'
import {
  demoClient,
  messagesByOrder,
  orderTimeline,
  orders,
  statusMeta,
  type Message,
  type Order,
} from '@/lib/fixtures'
import { formatUSD } from '@/lib/pricing'
import { cn } from '@/lib/utils'

export const Route = createFileRoute('/dashboard')({
  validateSearch: (search: Record<string, unknown>): { order?: string } => ({
    order: typeof search.order === 'string' ? search.order : undefined,
  }),
  head: () => ({ meta: [{ title: 'My orders — SpeedyEssays' }] }),
  component: Dashboard,
})

const toneClass = {
  muted: 'bg-muted text-muted-foreground',
  info: 'bg-primary/10 text-primary',
  warn: 'bg-accent/25 text-accent-foreground',
  ok: 'bg-success/15 text-success',
} as const

const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

function Dashboard() {
  const { order: selectedId } = Route.useSearch()
  const navigate = Route.useNavigate()
  const active = orders.filter((o) => o.status !== 'completed')
  const history = orders.filter((o) => o.status === 'completed')
  const selected = orders.find((o) => o.id === selectedId) ?? active[0] ?? orders[0]
  const select = (id: string) => navigate({ search: { order: id }, replace: true })

  return (
    <div className="flex min-h-screen bg-muted/40">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar p-5 text-sidebar-foreground lg:flex">
        <div className="[&_a]:text-sidebar-foreground [&_span.bg-primary]:bg-sidebar-primary [&_span.bg-primary]:text-sidebar-primary-foreground">
          <Logo />
        </div>
        <nav className="mt-10 space-y-1 text-sm">
          <SideLink icon={LayoutDashboard} label="My orders" active />
          <SideLink icon={MessageSquare} label="Messages" badge={2} />
          <SideLink icon={FileCheck2} label="Originality reports" />
          <SideLink icon={UserRound} label="Account" />
        </nav>
        <div className="mt-auto rounded-lg bg-sidebar-accent p-4 text-sm">
          <p className="text-sidebar-foreground/70">Account balance</p>
          <p className="font-display text-2xl font-semibold">{formatUSD(demoClient.balance)}</p>
          <p className="mt-1 text-xs text-sidebar-foreground/60">Applied automatically to your next order</p>
        </div>
        <Link to="/" className="mt-4 flex items-center gap-2 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground">
          <LogOut className="size-4" /> Back to website
        </Link>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-between gap-4 border-b bg-background px-4 py-4 sm:px-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="hidden lg:block">
            <p className="text-sm text-muted-foreground">Welcome back,</p>
            <h1 className="text-2xl font-semibold">{demoClient.name}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden gap-1 sm:inline-flex">
              <ShieldCheck className="text-success" /> Private session
            </Badge>
            <Button asChild>
              <Link to="/order">
                <Plus /> New order
              </Link>
            </Button>
          </div>
        </header>

        <div className="space-y-6 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Active orders" value={active.length} icon={Clock} />
            <Stat label="Completed" value={history.length} icon={Check} />
            <Stat label="Avg. originality" value={`${avg(history.map((o) => o.originalityScore ?? 0))}%`} icon={FileCheck2} />
          </div>

          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
              <TabsTrigger value="history">Order history ({history.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="active" className="mt-4">
              {active.length === 0 ? (
                <div className="rounded-xl border border-dashed bg-card p-10 text-center">
                  <p className="font-medium">No active orders</p>
                  <p className="mt-1 text-sm text-muted-foreground">Your next paper is a few clicks away.</p>
                  <Button className="mt-4" asChild>
                    <Link to="/order">Place an order</Link>
                  </Button>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {active.map((o) => (
                    <OrderCard key={o.id} order={o} selected={o.id === selected.id} onSelect={() => select(o.id)} />
                  ))}
                </div>
              )}
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <div className="overflow-x-auto rounded-xl border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Originality</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((o) => (
                      <TableRow
                        key={o.id}
                        onClick={() => select(o.id)}
                        className={cn('cursor-pointer', o.id === selected.id && 'bg-secondary')}
                      >
                        <TableCell className="font-medium">{o.id}</TableCell>
                        <TableCell className="max-w-xs truncate">{o.title}</TableCell>
                        <TableCell>{dayFmt.format(new Date(o.deadline))}</TableCell>
                        <TableCell className="text-success">{o.originalityScore}% original</TableCell>
                        <TableCell className="text-right tabular-nums">{formatUSD(o.price)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>

          <OrderDetail key={selected.id} order={selected} />
        </div>
      </div>
    </div>
  )
}

function OrderCard({ order, selected, onSelect }: { order: Order; selected: boolean; onSelect: () => void }) {
  const meta = statusMeta[order.status]
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-xl border bg-card p-5 text-left transition-shadow hover:shadow-md motion-reduce:transition-none',
        selected && 'ring-2 ring-primary',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">{order.id}</span>
        <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', toneClass[meta.tone])}>{meta.label}</span>
      </div>
      <p className="mt-2 line-clamp-2 font-semibold">{order.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {order.type} · {order.level} · {order.pages} pages
      </p>
      <Progress value={order.progress} className="mt-4 h-1.5" />
      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3.5" /> Due {dateFmt.format(new Date(order.deadline))} UTC
      </p>
    </button>
  )
}

function OrderDetail({ order }: { order: Order }) {
  const [messages, setMessages] = useState<Message[]>(messagesByOrder[order.id] ?? [])
  const [draft, setDraft] = useState('')
  const currentStep = Math.max(
    0,
    orderTimeline.findIndex((s) => s.status === (order.status === 'revision' ? 'draft-ready' : order.status)),
  )
  const canRevise = order.status === 'completed' || order.status === 'draft-ready'

  function send() {
    const body = draft.trim()
    if (!body) return
    setMessages((m) => [...m, { id: crypto.randomUUID(), from: 'client', body, at: new Date().toISOString() }])
    setDraft('')
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]" aria-labelledby="order-detail">
      <div className="space-y-6 rounded-xl border bg-card p-6">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">
            {order.id} · {order.subject}
          </p>
          <h2 id="order-detail" className="mt-1 text-2xl font-semibold">{order.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {order.type} · {order.level} · {order.style} · {order.pages} pages · {formatUSD(order.price)}
          </p>
        </div>

        <ol className="grid grid-cols-5 gap-2">
          {orderTimeline.map((s, i) => (
            <li key={s.status} className="text-center">
              <span
                className={cn(
                  'mx-auto grid size-8 place-items-center rounded-full border-2 text-xs font-semibold',
                  i < currentStep || order.status === 'completed'
                    ? 'border-primary bg-primary text-primary-foreground'
                    : i === currentStep
                      ? 'border-primary text-primary'
                      : 'text-muted-foreground',
                )}
              >
                {i < currentStep || order.status === 'completed' ? <Check className="size-4" /> : i + 1}
              </span>
              <span className="mt-2 block text-[11px] leading-tight text-muted-foreground sm:text-xs">{s.label}</span>
            </li>
          ))}
        </ol>

        <div>
          <h3 className="mb-3 font-sans text-sm font-semibold tracking-normal">Files</h3>
          <ul className="divide-y rounded-lg border">
            {order.files.map((f) => (
              <li key={f.name} className="flex items-center gap-3 px-4 py-3 text-sm">
                {f.kind === 'report' ? <FileCheck2 className="size-5 text-success" /> : <FileText className="size-5 text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{f.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {f.kind === 'brief' ? 'Your upload' : f.kind === 'report' ? 'Originality report' : 'From your writer'} · {f.size}
                  </span>
                </span>
                <Button variant="outline" size="sm" onClick={() => toast.success(`Downloading ${f.name}`)}>
                  <Download /> Download
                </Button>
              </li>
            ))}
          </ul>
        </div>

        {order.originalityScore !== undefined && (
          <div className="flex items-center gap-4 rounded-lg border border-success/30 bg-success/5 p-4">
            <span className="font-display text-3xl font-semibold text-success">{order.originalityScore}%</span>
            <p className="text-sm">
              <span className="font-semibold">Original content.</span>{' '}
              <span className="text-muted-foreground">Scanned against 90+ billion web pages and academic databases.</span>
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          <RevisionDialog order={order} disabled={!canRevise} />
          <p className="text-xs text-muted-foreground">
            {order.revisionsLeftUntil
              ? `Free revisions available until ${dayFmt.format(new Date(order.revisionsLeftUntil))}`
              : canRevise
                ? 'Free revisions for 14 days after delivery'
                : 'Revisions open once your draft is delivered'}
          </p>
        </div>
      </div>

      <div className="flex h-[34rem] flex-col rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h3 className="font-sans text-sm font-semibold tracking-normal">Chat with {order.writerAlias}</h3>
            <p className="text-xs text-muted-foreground">Anonymous & monitored by our quality team</p>
          </div>
          <ShieldCheck className="size-5 text-success" />
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hello to your writer.</p>}
          {messages.map((m) => (
            <div key={m.id} className={cn('flex flex-col', m.from === 'client' ? 'items-end' : 'items-start')}>
              <span className="mb-1 text-[11px] text-muted-foreground">
                {m.from === 'client' ? 'You' : m.from === 'writer' ? order.writerAlias : 'Support team'} · {dateFmt.format(new Date(m.at))}
              </span>
              <p
                className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                  m.from === 'client' && 'bg-primary text-primary-foreground',
                  m.from === 'writer' && 'bg-muted',
                  m.from === 'support' && 'border border-accent/50 bg-accent/10',
                )}
              >
                {m.body}
              </p>
            </div>
          ))}
        </div>
        <form
          className="flex gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <Textarea
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Message your writer… (no personal contact details)"
            aria-label="Message your writer"
            className="min-h-10 resize-none"
          />
          <Button type="submit" size="icon" aria-label="Send message">
            <Send />
          </Button>
        </form>
      </div>
    </section>
  )
}

function RevisionDialog({ order, disabled }: { order: Order; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={disabled}>
          <RefreshCcw /> Request revision
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a free revision</DialogTitle>
          <DialogDescription>
            Tell {order.writerAlias} what to change in {order.id}. Revisions within your original instructions are always free.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rev-notes">What should be changed?</Label>
          <Textarea
            id="rev-notes"
            rows={5}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Expand the discussion section and add two more recent sources."
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={notes.trim().length < 10}
            onClick={() => {
              setOpen(false)
              setNotes('')
              toast.success(`Revision requested for ${order.id}`, { description: 'Your writer has been notified.' })
            }}
          >
            Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Stat({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: typeof Clock }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-card p-5">
      <span className="grid size-10 place-items-center rounded-lg bg-secondary text-primary">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-display text-2xl font-semibold">{value}</p>
      </div>
    </div>
  )
}

function SideLink({ icon: Icon, label, active, badge }: { icon: typeof Clock; label: string; active?: boolean; badge?: number }) {
  return (
    <span
      className={cn(
        'flex items-center gap-3 rounded-md px-3 py-2',
        active ? 'bg-sidebar-accent font-semibold' : 'text-sidebar-foreground/75',
      )}
    >
      <Icon className="size-4" />
      {label}
      {badge ? (
        <span className="ml-auto rounded-full bg-sidebar-primary px-1.5 text-xs font-semibold text-sidebar-primary-foreground">{badge}</span>
      ) : null}
    </span>
  )
}

function avg(values: number[]) {
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0
}
