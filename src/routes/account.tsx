import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import {
  acceptInvite,
  handleAuthCallback,
  login,
  readSupabaseAccountLink,
  recoverPassword,
  requestPasswordRecovery,
  signup,
} from '@/lib/account-client'
import { useSupabase } from '@/lib/supabase-config'

import { PageShell } from '@/components/site/page-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'login' | 'signup' | 'forgot' | 'reset' | 'invite'

function accountDestination(next: unknown) {
  if (typeof next !== 'string' || !/^\/(dashboard|order|admin)(?:\?|$)/.test(next)) return '/dashboard'
  return next
}

export const Route = createFileRoute('/account')({
  validateSearch: (search: Record<string, unknown>): { next?: string; signup?: boolean } => ({
    next: typeof search.next === 'string' ? accountDestination(search.next) : undefined,
    signup: search.signup === true ? true : undefined,
  }),
  head: () => ({ meta: [{ title: 'Your account — SpeedyEssays' }, { name: 'robots', content: 'noindex' }] }),
  remountDeps: ({ search }) => search.signup,
  component: Account,
})

function Account() {
  const { next = '/dashboard', signup: startSignup } = Route.useSearch()
  const [mode, setMode] = useState<Mode>(startSignup ? 'signup' : 'login')
  const [pending, setPending] = useState(false)
  const [ready, setReady] = useState(false)
  const [problem, setProblem] = useState('')
  const [notice, setNotice] = useState('')
  const [token, setToken] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => {
      if (useSupabase) {
        void readSupabaseAccountLink()
          .then((result) => {
            if (result === 'signed-in') window.location.replace(next)
            else {
              if (result === 'reset') setMode('reset')
              setReady(true)
            }
          })
          .catch(() => {
            setProblem('This account link could not be verified. Check whether it has expired and try signing in.')
            setReady(true)
          })
        return
      }
      const hash = new URLSearchParams(window.location.hash.slice(1))
      const recovery = hash.get('recovery_token')
      const invitation = hash.get('invite_token')
      if (recovery || invitation) {
        setToken(recovery ?? invitation ?? '')
        setMode(recovery ? 'reset' : 'invite')
        window.history.replaceState(
          window.history.state,
          '',
          window.location.pathname + window.location.search,
        )
        setReady(true)
        return
      }
      if (!hash.has('confirmation_token') && !hash.has('access_token') && !hash.has('email_change_token')) {
        setReady(true)
        return
      }
      void handleAuthCallback()
        .then((result) => {
          if (result?.user) window.location.replace(next)
          else setReady(true)
        })
        .catch(() => {
          setProblem(
            'This account link could not be verified. Check whether it has expired and try signing in.',
          )
          setReady(true)
        })
    }, 0)
    return () => clearTimeout(timer)
  }, [next])

  function switchMode(value: Mode) {
    setMode(value)
    setPassword('')
    setProblem('')
    setNotice('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setProblem('')
    setNotice('')
    try {
      if (mode === 'signup') {
        await signup(email.trim(), password, { full_name: name.trim() })
        setMode('login')
        setPassword('')
        setNotice('Check your email for a confirmation link, then sign in.')
      } else if (mode === 'forgot') {
        await requestPasswordRecovery(email.trim())
        setNotice('If this email has an account, you’ll receive a password reset link.')
      } else {
        if (mode === 'reset') await recoverPassword(token, password)
        else if (mode === 'invite') await acceptInvite(token, password)
        else await login(email.trim(), password)
        window.location.assign(next)
      }
    } catch {
      setProblem(
        mode === 'login'
          ? 'Sign-in failed. Check your email and password, and confirm your email if you just registered.'
          : 'We couldn’t complete this request. Check your details or request a new link and try again.',
      )
    } finally {
      setPending(false)
    }
  }

  const title = {
    login: 'Sign in',
    signup: 'Create an account',
    forgot: 'Reset your password',
    reset: 'Set a new password',
    invite: 'Accept your invitation',
  }[mode]

  return (
    <PageShell>
      <main className="mx-auto max-w-md px-4 py-14 sm:px-6">
        <h1 className="text-4xl font-semibold">{title}</h1>
        {ready ? (
          <form onSubmit={submit} className="mt-6 space-y-4 rounded-xl border bg-card p-6">
            {mode === 'signup' && (
              <div className="space-y-2">
                <Label htmlFor="account-name">Full name</Label>
                <Input
                  id="account-name"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={100}
                />
              </div>
            )}
            {mode !== 'reset' && mode !== 'invite' && (
              <div className="space-y-2">
                <Label htmlFor="account-email">Email</Label>
                <Input
                  id="account-email"
                  autoComplete="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
            )}
            {mode !== 'forgot' && (
              <div className="space-y-2">
                <Label htmlFor="account-password">Password</Label>
                <Input
                  id="account-password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  type="password"
                  value={password}
                  minLength={mode === 'login' ? undefined : 8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
            )}
            {problem && (
              <p role="alert" className="text-sm text-destructive">
                {problem}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
            <Button className="w-full" disabled={pending}>
              {pending ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : title}
            </Button>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {mode !== 'login' && (
                <button type="button" className="underline" onClick={() => switchMode('login')}>
                  Sign in
                </button>
              )}
              {mode === 'login' && (
                <button type="button" className="underline" onClick={() => switchMode('signup')}>
                  Create an account
                </button>
              )}
              {mode === 'login' && (
                <button type="button" className="underline" onClick={() => switchMode('forgot')}>
                  Forgot password?
                </button>
              )}
              <Link to="/" className="underline">
                Home
              </Link>
            </div>
          </form>
        ) : (
          <p className="mt-4" role="status">
            Opening account page…
          </p>
        )}
      </main>
    </PageShell>
  )
}
