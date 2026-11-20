import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  grantPortalAdmin,
  listPortalAdmins,
  updatePortalAdminName,
} from '@/lib/staff.functions'
import { supportNameInput } from '@/lib/support-name'

export function StaffAdmins() {
  const router = useRouter()
  const [admins, setAdmins] = useState<Awaited<
    ReturnType<typeof listPortalAdmins>
  > | null>(null)
  const [email, setEmail] = useState('')
  const [supportName, setSupportName] = useState('')
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

  async function save(
    name: string,
    action: (supportName: string) => Promise<string>,
  ) {
    if (busy) return
    setProblem('')
    setNotice('')
    const parsed = supportNameInput.safeParse(name)
    if (!parsed.success) {
      setProblem('Enter one first name, such as Marvin.')
      return
    }
    setBusy(true)
    try {
      setNotice(await action(parsed.data))
      setAdmins(await listPortalAdmins())
      await router.invalidate()
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : 'Admin details couldn’t be saved.',
      )
    } finally {
      setBusy(false)
    }
  }

  function grant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void save(supportName, async (name) => {
      await grantPortalAdmin({
        data: { email: email.trim(), supportName: name },
      })
      setEmail('')
      setSupportName('')
      return `Staff access is active. Replies will show ${name} Support.`
    })
  }

  function rename(event: FormEvent<HTMLFormElement>, email: string) {
    event.preventDefault()
    const name = String(
      new FormData(event.currentTarget).get('supportName') ?? '',
    )
    void save(name, async (supportName) => {
      await updatePortalAdminName({ data: { email, supportName } })
      return `New replies will show ${supportName} Support.`
    })
  }

  return (
    <section className="grid gap-5 lg:grid-cols-2" aria-label="Admin accounts">
      {problem && (
        <p role="alert" className="text-sm text-destructive lg:col-span-2">
          {problem}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm lg:col-span-2">
          {notice}
        </p>
      )}
      <form
        className="self-start space-y-3 rounded-xl border bg-card p-5"
        onSubmit={grant}
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
        <div className="space-y-2">
          <Label htmlFor="grant-name">Support name</Label>
          <Input
            id="grant-name"
            placeholder="Marvin"
            autoComplete="off"
            maxLength={40}
            value={supportName}
            required
            onChange={(event) => setSupportName(event.target.value)}
            disabled={busy}
          />
          <p className="text-xs text-muted-foreground">
            Enter the first name customers should see on replies.
          </p>
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Grant admin access'}
        </Button>
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
                className="space-y-2 rounded-md border px-3 py-2"
                key={admin.email}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {admin.supportName
                      ? `${admin.supportName} Support`
                      : 'Set a support name'}
                  </p>
                  <span className="text-muted-foreground">
                    {admin.canManageStaff ? 'Owner' : 'Admin'}
                  </span>
                </div>
                <p className="break-all text-muted-foreground">{admin.email}</p>
                <details>
                  <summary className="cursor-pointer">Edit name</summary>
                  <form
                    className="mt-2 flex flex-wrap items-center gap-2"
                    onSubmit={(event) => rename(event, admin.email)}
                  >
                    <Input
                      key={admin.supportName}
                      aria-label={`Support name for ${admin.email}`}
                      name="supportName"
                      autoComplete="off"
                      maxLength={40}
                      defaultValue={admin.supportName ?? ''}
                      className="w-auto min-w-0 flex-1"
                      required
                      disabled={busy}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                    >
                      Save name
                    </Button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
