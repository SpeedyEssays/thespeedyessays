import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { OnlineDot, UnreadBadge } from '@/components/chat-indicators'
import { StaffCustomerPresence } from '@/components/staff-customer-presence'
import { StaffCustomerWallet } from '@/components/staff-customer-wallet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { openCustomerChat } from '@/lib/chat.functions'
import {
  getStaffCustomer,
  listStaffCustomers,
  updateStaffCustomer,
} from '@/lib/customers.functions'

type Customers = Awaited<ReturnType<typeof listStaffCustomers>>
type Customer = Awaited<ReturnType<typeof getStaffCustomer>>

export function StaffCustomers({
  selected,
  unreadByCustomer,
  online,
}: {
  selected?: string
  unreadByCustomer?: Record<string, number>
  online: ReadonlySet<string>
}) {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [customers, setCustomers] = useState<Customers | null>(null)
  const [problem, setProblem] = useState('')
  const [searchCount, setSearchCount] = useState(0)

  useEffect(() => {
    let active = true
    void listStaffCustomers({ data: { query } }).then(
      (rows) => {
        if (active) setCustomers(rows)
      },
      () => {
        if (active)
          setProblem('Customer accounts couldn’t load. Try the search again.')
      },
    )
    return () => {
      active = false
    }
  }, [query, searchCount])

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setProblem('')
    setCustomers(null)
    setQuery(input.trim())
    setSearchCount((count) => count + 1)
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <section className="space-y-3" aria-label="Find a customer">
        <form onSubmit={search} className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor="customer-search" className="mb-2">
              Search by name or email
            </Label>
            <Input
              id="customer-search"
              type="search"
              maxLength={200}
              value={input}
              onChange={(event) => setInput(event.target.value)}
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        {customers === null && !problem && (
          <p role="status">Loading customer accounts…</p>
        )}
        {customers?.length === 0 && <p>No matching accounts.</p>}
        {customers?.length === 50 && (
          <p className="text-sm text-muted-foreground">
            Showing the first 50 results. Search for a specific account.
          </p>
        )}
        {customers?.map((customer) => (
          <Link
            key={customer.id}
            to="/admin"
            search={{ tab: 'customers', customer: customer.id }}
            aria-current={selected === customer.id ? 'true' : undefined}
            className={`block rounded-lg border p-3 text-sm ${selected === customer.id ? 'border-primary bg-secondary' : 'bg-card'}`}
          >
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              {online.has(customer.id) && <OnlineDot />}
              <span className="min-w-0 break-words">
                {customer.displayName || customer.accountName || customer.email}
              </span>
              <UnreadBadge count={unreadByCustomer?.[customer.id]} />
            </span>
            {(customer.displayName || customer.accountName) && (
              <span className="block break-all text-xs text-muted-foreground">
                {customer.email}
              </span>
            )}
          </Link>
        ))}
      </section>
      {selected ? (
        <CustomerDetails
          key={selected}
          id={selected}
          unread={unreadByCustomer?.[selected]}
          onSaved={(profile) =>
            setCustomers(
              (rows) =>
                rows?.map((row) =>
                  row.id === profile.id
                    ? { ...row, displayName: profile.displayName }
                    : row,
                ) ?? null,
            )
          }
        />
      ) : (
        <p className="self-start rounded-xl border bg-card p-5 text-sm">
          Select an account to see its orders or contact the customer.
        </p>
      )}
    </div>
  )
}

function CustomerDetails({
  id,
  unread,
  onSaved,
}: {
  id: string
  unread?: number
  onSaved: (profile: Customer) => void
}) {
  const navigate = useNavigate()
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [version, setVersion] = useState(0)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    void getStaffCustomer({ data: id }).then(
      (value) => {
        if (active) setCustomer(value)
      },
      () => {
        if (active) setProblem('Customer details couldn’t load.')
      },
    )
    return () => {
      active = false
    }
  }, [id, version])

  async function run(action: () => Promise<unknown>) {
    setProblem('')
    setNotice('')
    setBusy(true)
    try {
      await action()
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : 'Unable to update this account.',
      )
    } finally {
      setBusy(false)
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!customer || busy) return
    const form = new FormData(event.currentTarget)
    void run(async () => {
      const displayName = String(form.get('displayName') ?? '').trim()
      const supportNotes = String(form.get('supportNotes') ?? '').trim()
      const { revision } = await updateStaffCustomer({
        data: { id, displayName, supportNotes, revision: customer.revision },
      })
      const profile = {
        ...customer,
        displayName: displayName || null,
        supportNotes,
        revision,
      }
      setCustomer(profile)
      onSaved(profile)
      setNotice('Customer profile saved.')
    })
  }

  return (
    <section
      className="min-w-0 self-start rounded-xl border bg-card p-5 sm:p-6"
      aria-label="Customer account"
    >
      {!customer && !problem && <p role="status">Loading customer account…</p>}
      {customer && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words text-2xl font-semibold">
              {customer.displayName || customer.accountName || 'Customer account'}
            </h2>
            <UnreadBadge count={unread} />
          </div>
          <p className="mt-1 break-all text-sm text-muted-foreground">
            {customer.email}
          </p>
          <StaffCustomerPresence userId={id} />
          <div className="my-4 flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link to="/admin" search={{ tab: 'orders', customer: id }}>
                View orders
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/admin" search={{ tab: 'notifications', customer: id }}>
                Send notification
              </Link>
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const { id: chat } = await openCustomerChat({ data: id })
                  await navigate({
                    to: '/admin',
                    search: { tab: 'chat', chat },
                  })
                })
              }
            >
              Open website chat
            </Button>
          </div>
          <form key={customer.revision} onSubmit={save} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="customer-name">Customer display name</Label>
              <Input
                id="customer-name"
                name="displayName"
                defaultValue={
                  customer.displayName ?? customer.accountName ?? ''
                }
                maxLength={100}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-notes">Internal support notes</Label>
              <Textarea
                id="customer-notes"
                name="supportNotes"
                defaultValue={customer.supportNotes}
                rows={4}
                maxLength={5000}
                disabled={busy}
              />
            </div>
            <Button type="submit" disabled={busy}>
              Save customer profile
            </Button>
          </form>
          <div className="mt-4"><StaffCustomerWallet key={id} userId={id} /></div>
        </>
      )}
      {problem && (
        <div className="mt-3 flex items-center gap-3">
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setCustomer(null)
              setProblem('')
              setVersion((value) => value + 1)
            }}
          >
            Reload account
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
    </section>
  )
}
