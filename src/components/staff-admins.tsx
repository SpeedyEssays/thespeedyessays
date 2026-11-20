import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { grantPortalAdmin, listPortalAdmins } from '@/lib/staff.functions'

export function StaffAdmins() {
  const [admins, setAdmins] = useState<Awaited<
    ReturnType<typeof listPortalAdmins>
  > | null>(null)
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void listPortalAdmins().then(
      (list) => {
        if (active) setAdmins(list)
      },
      () => {
        if (active)
          setProblem(
            'Admin accounts couldn’t load. Refresh the page to try again.',
          )
      },
    )
    return () => {
      active = false
    }
  }, [])

  async function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setProblem('')
    setNotice('')
    try {
      const result = await grantPortalAdmin({ data: email.trim() })
      setEmail('')
      setNotice(`Staff access is active for ${result.email}.`)
      setAdmins(await listPortalAdmins())
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : 'Staff access couldn’t be updated.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="grid gap-5 lg:grid-cols-2" aria-label="Admin accounts">
      <form
        className="self-start space-y-3 rounded-xl border bg-card p-5"
        onSubmit={(event) => void grant(event)}
      >
        <h2 className="text-2xl font-semibold">Add an admin</h2>
        <p className="text-sm text-muted-foreground">
          Use the email on a confirmed SpeedyEssays account. Admins can view all
          orders and customer chats.
        </p>
        <div className="space-y-2">
          <Label htmlFor="grant-email">Account email</Label>
          <Input
            type="email"
            id="grant-email"
            autoComplete="off"
            maxLength={320}
            value={email}
            required
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Grant admin access'}
        </Button>
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
        {notice && (
          <p role="status" className="break-all text-sm">
            {notice}
          </p>
        )}
      </form>
      <div className="self-start rounded-xl border bg-card p-5">
        <h2 className="text-2xl font-semibold">Current admins</h2>
        {admins === null && !problem && (
          <p role="status" className="mt-3 text-sm">
            Loading admins…
          </p>
        )}
        {admins && (
          <ul className="mt-3 space-y-2 text-sm">
            {admins.map((admin) => (
              <li
                className="flex flex-wrap justify-between gap-2 rounded-md border px-3 py-2"
                key={admin.email}
              >
                <span className="break-all">{admin.email}</span>
                <span className="text-muted-foreground">
                  {admin.canManageStaff ? 'Owner' : 'Admin'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
