import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import {
  acceptInvite,
  handleAuthCallback,
  isGoogleSignInEnabled,
  login,
  readSupabaseAccountLink,
  recoverPassword,
  requestPasswordRecovery,
  resendSignupConfirmation,
  signInWithGoogle,
  signup,
  type AccountEmailLinkType,
} from '@/lib/account-client'
import { customerAccountOnly, staffAccountOnly } from '@/lib/portal-access'
import { useSupabase } from '@/lib/supabase-config'

import { PageShell } from '@/components/site/page-shell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Mode = 'login' | 'signup' | 'forgot' | 'resend' | 'reset' | 'invite'

const emailLinkActions: Record<AccountEmailLinkType, string> = {
  email: 'Confirm email address',
  signup: 'Confirm email address',
  invite: 'Accept invitation',
  magiclink: 'Sign in with email link',
  email_change: 'Confirm email change',
  recovery: 'Continue to reset password',
}

function accountError(mode: Mode, error: unknown) {
  const details = error as { code?: string; status?: number } | null | undefined
  const code = details?.code
  const status = details?.status
  if (
    status === 429 ||
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit'
  ) {
    return 'Too many requests. Wait a few minutes before trying again.'
  }
  if (
    (mode === 'signup' || mode === 'forgot' || mode === 'resend') &&
    ((status !== undefined && status >= 500) ||
      code === 'unexpected_failure' ||
      code === 'request_timeout' ||
      code === 'email_address_not_authorized')
  ) {
    return 'Account emails are temporarily unavailable. Please try again later.'
  }
  if ((mode === 'signup' || mode === 'reset') && code === 'weak_password') {
    return 'Choose a stronger password of at least 8 characters.'
  }
  if (mode === 'reset') {
    if (code === 'same_password')
      return 'Choose a password different from your current one.'
    if (code === 'recovery_session_changed' || code === 'session_not_found') {
      return 'This reset session has ended. Request a new link from the sign-in page.'
    }
  }
  if (mode === 'login') {
    if (code === 'email_not_confirmed')
      return 'Confirm your email address before signing in.'
    if (code === 'invalid_credentials')
      return 'The email or password is incorrect. Use Forgot password? if you need a new password.'
    return 'Sign-in failed. Check your email and password and try again.'
  }
  return 'We couldn’t complete this request. Check your details or request a new link.'
}

function accountDestination(next: unknown) {
  if (
    typeof next !== 'string' ||
    !/^\/(dashboard|order|admin)(?:\?|$)/.test(next)
  )
    return '/dashboard'
  return next
}

export const Route = createFileRoute('/account')({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    next?: string
    signup?: boolean
    denied?: boolean
    google?: boolean
    ref?: string
  } => ({
    next:
      typeof search.next === 'string'
        ? accountDestination(search.next)
        : undefined,
    signup: search.signup === true ? true : undefined,
    denied: search.denied === true ? true : undefined,
    google: search.google === true ? true : undefined,
    ref: z.uuid().safeParse(search.ref).data,
  }),
  head: () => ({
    meta: [
      { title: 'Your account — SpeedyEssays' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  remountDeps: ({ search }) => [search.signup, search.next, search.ref],
  component: Account,
})

function Account() {
  const {
    next = '/dashboard',
    signup: startSignup,
    denied,
    google: googleCallback,
    ref,
  } = Route.useSearch()
  const staff = /^\/admin(?:\?|$)/.test(next)
  const [mode, setMode] = useState<Mode>(
    startSignup && !staff && !denied ? 'signup' : 'login',
  )
  const [emailLink, setEmailLink] = useState<AccountEmailLinkType | null>(null)
  const [pending, setPending] = useState<'email' | 'google' | null>(null)
  const [googleEnabled, setGoogleEnabled] = useState(false)
  const [ready, setReady] = useState(false)
  const [problem, setProblem] = useState('')
  const [notice, setNotice] = useState('')
  const [token, setToken] = useState('')
  const [recovery, setRecovery] = useState<{
    userId: string
    email?: string
  } | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  useEffect(() => {
    function openAccountLink() {
      if (useSupabase) {
        void readSupabaseAccountLink()
          .then((result) => {
            if (result?.mode === 'signed-in') {
              window.location.replace(next)
              return
            }
            if (result?.mode === 'reset') {
              setRecovery(result)
              setMode('reset')
            }
            setEmailLink(result?.mode === 'verify-email' ? result.type : null)
            setReady(true)
          })
          .catch(() => {
            setEmailLink(null)
            setProblem(
              googleCallback
                ? 'Google sign-in didn’t finish. Try again or sign in with email.'
                : 'This account link is expired or was opened in a different browser. Use Forgot password? to send a new link, then open the latest email in this browser.',
            )
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
      if (
        !hash.has('confirmation_token') &&
        !hash.has('access_token') &&
        !hash.has('email_change_token')
      ) {
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
    }

    function checkEmailFragment() {
      const fragment = new URLSearchParams(window.location.hash.slice(1))
      if (fragment.has('token_hash')) openAccountLink()
      else setEmailLink(null)
    }

    const timer = setTimeout(openAccountLink, 0)
    if (useSupabase) window.addEventListener('hashchange', checkEmailFragment)
    return () => {
      clearTimeout(timer)
      if (useSupabase) window.removeEventListener('hashchange', checkEmailFragment)
    }
  }, [googleCallback, next])

  useEffect(() => {
    if (!useSupabase || staff) return
    const controller = new AbortController()
    void isGoogleSignInEnabled(controller.signal).then((enabled) => {
      if (!controller.signal.aborted) setGoogleEnabled(enabled)
    })
    return () => controller.abort()
  }, [staff])

  function switchMode(value: Mode) {
    setMode(value)
    setPassword('')
    setProblem('')
    setNotice('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending('email')
    setProblem('')
    setNotice('')
    try {
      if (mode === 'signup') {
        await signup(email.trim(), password, {
          full_name: name.trim(),
          ...(ref ? { speedy_referral: ref } : {}),
        })
        setMode('login')
        setPassword('')
        setNotice('Check your email for a confirmation link, then sign in.')
      } else if (mode === 'forgot') {
        await requestPasswordRecovery(email.trim())
        setNotice(
          'If the email has an account, we’ll send a password reset link. Open the latest email to reset your password.',
        )
      } else if (mode === 'resend') {
        await resendSignupConfirmation(email.trim())
        setNotice(
          'If your account is awaiting confirmation, a new link is on its way. Open the latest email to confirm your address.',
        )
      } else {
        if (mode === 'reset') {
          const restoredStaff = await recoverPassword(
            token,
            password,
            recovery?.userId,
          )
          window.location.replace(restoredStaff ? '/admin' : next)
          return
        }
        if (mode === 'invite') await acceptInvite(token, password)
        else await login(email.trim(), password)
        window.location.assign(next)
      }
    } catch (error) {
      setProblem(accountError(mode, error))
    } finally {
      setPending(null)
    }
  }

  async function continueWithGoogle() {
    if (pending) return
    setPending('google')
    setProblem('')
    setNotice('')
    try {
      await signInWithGoogle(next)
    } catch {
      setProblem(
        'Google sign-in couldn’t start. Try again or sign in with email.',
      )
      setPending(null)
    }
  }

  async function confirmEmailLink() {
    if (pending) return
    setPending('email')
    setProblem('')
    setNotice('')
    try {
      const result = await readSupabaseAccountLink({ confirmEmailLink: true })
      if (result?.mode === 'signed-in') {
        window.location.replace(next)
        return
      }
      if (result?.mode === 'reset') {
        setRecovery(result)
        setMode('reset')
      } else if (result?.mode === 'email-change') {
        setMode('login')
        setNotice(
          result.pending
            ? 'This address is confirmed. Open the confirmation email at your other address to finish the change.'
            : 'Your email address has been updated. Use the new address to sign in.',
        )
      } else {
        throw new Error('Invalid account link.')
      }
    } catch {
      setMode('login')
      setProblem(
        emailLink === 'recovery'
          ? 'This password reset link has expired or been used. Select Forgot password? for a new link.'
          : 'This email link has expired or been used. Open the latest email or request a new link.',
      )
    } finally {
      setEmailLink(null)
      setPending(null)
    }
  }

  const title = emailLink
    ? emailLinkActions[emailLink]
    : {
        login: staff ? 'Staff sign in' : 'Sign in',
        signup: 'Create an account',
        forgot: 'Reset your password',
        resend: 'Resend confirmation email',
        reset: 'Set a new password',
        invite: 'Accept your invitation',
      }[mode]

  return (
    <PageShell>
      <main className="mx-auto max-w-md px-4 py-14 sm:px-6">
        <h1 className="text-4xl font-semibold">{title}</h1>
        {denied ? (
          <div className="mt-4 space-y-3 rounded-lg border border-destructive/30 bg-card p-4" role="alert">
            <p className="text-sm font-medium text-destructive">
              {staff ? customerAccountOnly : staffAccountOnly}
            </p>
            <p className="text-sm text-muted-foreground">
              {staff ? 'Use a staff email to sign in here.' : 'Use a customer email to sign in here.'}
            </p>
            <Button size="sm" variant="outline" asChild>
              <Link to={staff ? '/dashboard' : '/admin'}>
                {staff ? 'Open Customer Portal' : 'Open Staff Portal'}
              </Link>
            </Button>
          </div>
        ) : staff && (
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in with your staff account to see customer chats and orders.
          </p>
        )}
        {emailLink ? (
          <div className="mt-6 space-y-4 rounded-xl border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              Select the button below to use your one-time email link.
            </p>
            <Button
              className="w-full"
              disabled={pending !== null}
              onClick={() => void confirmEmailLink()}
            >
              {pending ? 'Please wait…' : title}
            </Button>
          </div>
        ) : ready ? (
          <form
            onSubmit={submit}
            className="mt-6 space-y-4 rounded-xl border bg-card p-6"
          >
            {mode === 'reset' && recovery?.email && (
              <p className="break-all text-sm text-muted-foreground">
                New password for {recovery.email}
              </p>
            )}
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
            {mode !== 'forgot' && mode !== 'resend' && (
              <div className="space-y-2">
                <Label htmlFor="account-password">
                  {mode === 'reset' ? 'New password' : 'Password'}
                </Label>
                <Input
                  id="account-password"
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  type="password"
                  name="password"
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
            <Button
              type="submit"
              className="w-full"
              disabled={pending !== null}
            >
              {pending === 'email'
                ? 'Please wait…'
                : mode === 'forgot'
                  ? 'Send reset link'
                  : mode === 'resend'
                    ? 'Send confirmation email'
                    : title}
            </Button>
            {!staff &&
              googleEnabled &&
              (mode === 'login' || mode === 'signup') && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full gap-2.5 border-[#747775] bg-white text-[#1f1f1f] hover:bg-[#f8faff] hover:text-[#1f1f1f]"
                  disabled={pending !== null}
                  onClick={() => void continueWithGoogle()}
                >
                  <img src="/img/google-g.png" alt="" width={18} height={18} />
                  {pending === 'google'
                    ? 'Opening Google…'
                    : 'Continue with Google'}
                </Button>
              )}
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              {mode !== 'login' && (
                <button
                  type="button"
                  className="underline"
                  disabled={pending !== null}
                  onClick={() => switchMode('login')}
                >
                  Sign in
                </button>
              )}
              {mode === 'login' && !staff && (
                <button
                  type="button"
                  className="underline"
                  disabled={pending !== null}
                  onClick={() => switchMode('signup')}
                >
                  Create an account
                </button>
              )}
              {mode === 'login' && (
                <button
                  type="button"
                  className="underline"
                  disabled={pending !== null}
                  onClick={() => switchMode('forgot')}
                >
                  Forgot password?
                </button>
              )}
              {mode === 'login' && useSupabase && !staff && (
                <button
                  type="button"
                  className="underline"
                  disabled={pending !== null}
                  onClick={() => switchMode('resend')}
                >
                  Resend confirmation
                </button>
              )}
              <Link to={staff ? '/dashboard' : '/'} className="underline">
                {staff ? 'Customer portal' : 'Home'}
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
