import * as netlify from '@netlify/identity'
import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig, useSupabase } from './supabase-config'

function auth() {
  const { url, key } = supabaseConfig()
  return createBrowserClient(url, key, { auth: { detectSessionInUrl: false } })
    .auth
}

export async function isGoogleSignInEnabled(signal?: AbortSignal) {
  if (!useSupabase) return false
  try {
    const { url, key } = supabaseConfig()
    const response = await fetch(new URL('/auth/v1/settings', url), {
      headers: { apikey: key },
      cache: 'no-store',
      signal,
    })
    if (!response.ok) return false
    const settings = await response.json()
    return settings?.external?.google === true
  } catch {
    return false
  }
}

export async function signInWithGoogle(next: string) {
  const redirect = new URL('/account', window.location.origin)
  redirect.searchParams.set('google', 'true')
  if (next !== '/dashboard') redirect.searchParams.set('next', next)

  const { error } = await auth().signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirect.href,
      queryParams: { prompt: 'select_account' },
    },
  })
  if (error) throw error
}

export async function login(email: string, password: string) {
  if (!useSupabase) return netlify.login(email, password)
  const { error } = await auth().signInWithPassword({ email, password })
  if (error) throw error
}

export async function signup(
  email: string,
  password: string,
  data: { full_name: string },
) {
  if (!useSupabase) return netlify.signup(email, password, data)
  const { error } = await auth().signUp({
    email,
    password,
    options: {
      data,
      emailRedirectTo: new URL('/account', window.location.origin).href,
    },
  })
  if (error) throw error
}

export async function requestPasswordRecovery(email: string) {
  if (!useSupabase) return netlify.requestPasswordRecovery(email)
  const { error } = await auth().resetPasswordForEmail(email, {
    redirectTo: new URL('/account?recovery=true', window.location.origin).href,
  })
  if (error) throw error
}

export async function recoverPassword(
  token: string,
  password: string,
  recoveryUserId?: string,
) {
  if (!useSupabase) {
    await netlify.recoverPassword(token, password)
    return false
  }
  const client = auth()
  const current = await client.getUser()
  if (
    !recoveryUserId ||
    current.error ||
    current.data.user?.id !== recoveryUserId
  ) {
    throw Object.assign(new Error('The recovery session has changed.'), {
      code: 'recovery_session_changed',
    })
  }
  const { data, error } = await client.updateUser({ password })
  if (error) throw error
  const roles = data.user.app_metadata.roles
  return Array.isArray(roles) && roles.includes('admin')
}

export async function logout() {
  if (!useSupabase) return netlify.logout()
  const { error } = await auth().signOut({ scope: 'local' })
  if (error) throw error
}

export async function refreshBrowserSession() {
  if (!useSupabase) return netlify.getUser()
  return auth().getSession()
}

const accountEmailLinkTypes = [
  'email',
  'signup',
  'invite',
  'magiclink',
  'email_change',
  'recovery',
] as const

export type AccountEmailLinkType = (typeof accountEmailLinkTypes)[number]

type AccountLink =
  | { mode: 'reset'; userId: string; email?: string }
  | { mode: 'signed-in' }
  | { mode: 'verify-email'; type: AccountEmailLinkType }
  | { mode: 'email-change'; pending: boolean }
  | null

export async function readSupabaseAccountLink(
  { confirmEmailLink = false }: { confirmEmailLink?: boolean } = {},
): Promise<AccountLink> {
  if (!useSupabase) return null
  const url = new URL(window.location.href)
  const params = url.searchParams
  const fragment = new URLSearchParams(url.hash.slice(1))
  const emailParams = fragment.has('token_hash') ? fragment : params
  const hash = emailParams.get('token_hash')
  const type = accountEmailLinkTypes.find(
    (value) => value === emailParams.get('type'),
  )
  const code = params.get('code')
  const google = params.get('google') === 'true'
  const recovery = params.get('recovery') === 'true'
  const authError = [params, fragment].some(
    (part) => part.has('error') || part.has('error_code'),
  )
  if (!hash && !code && !google && !recovery && !authError) return null
  if (hash && type && !confirmEmailLink) return { mode: 'verify-email', type }

  try {
    const client = auth()
    if (hash && type) {
      const { data, error } = await client.verifyOtp({ type, token_hash: hash })
      if (error) throw error
      if (type === 'email_change') {
        // With secure email changes, Supabase accepts the first link without issuing a session.
        return { mode: 'email-change', pending: !data.session }
      }
      if (!data.session || !data.user) throw new Error('Invalid account link.')
      return type === 'invite' || type === 'recovery'
        ? { mode: 'reset', userId: data.user.id, email: data.user.email }
        : { mode: 'signed-in' }
    }
    if (!code) throw new Error('Invalid or expired account link.')
    const flowId = params.get('sb_flow_id')
    const { data, error } = await client.exchangeCodeForSession(
      code,
      flowId ? { flowId } : undefined,
    )
    if (error) throw error
    if (!data.session || !data.user)
      throw new Error('Invalid or expired account link.')
    return recovery ||
      ('redirectType' in data && data.redirectType === 'recovery')
      ? { mode: 'reset', userId: data.user.id, email: data.user.email }
      : { mode: 'signed-in' }
  } finally {
    for (const key of [
      'code',
      'sb_flow_id',
      'token_hash',
      'type',
      'error',
      'error_code',
      'error_description',
      'google',
      'recovery',
    ]) {
      params.delete(key)
    }
    window.history.replaceState(
      window.history.state,
      '',
      url.pathname + url.search,
    )
  }
}

export const { acceptInvite, handleAuthCallback } = netlify
