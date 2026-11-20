import * as netlify from '@netlify/identity'
import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig, useSupabase } from './supabase-config'

function auth() {
  const { url, key } = supabaseConfig()
  return createBrowserClient(url, key).auth
}

export async function login(email: string, password: string) {
  if (!useSupabase) return netlify.login(email, password)
  const { error } = await auth().signInWithPassword({ email, password })
  if (error) throw error
}

export async function signup(email: string, password: string, data: { full_name: string }) {
  if (!useSupabase) return netlify.signup(email, password, data)
  const { error } = await auth().signUp({
    email,
    password,
    options: { data, emailRedirectTo: new URL('/account', window.location.origin).href },
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

export async function recoverPassword(token: string, password: string) {
  if (!useSupabase) return netlify.recoverPassword(token, password)
  const { error } = await auth().updateUser({ password })
  if (error) throw error
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

export async function readSupabaseAccountLink(): Promise<'reset' | 'signed-in' | null> {
  if (!useSupabase) return null
  const url = new URL(window.location.href)
  const type = url.searchParams.get('type')
  const token_hash = url.searchParams.get('token_hash')
  const code = url.searchParams.get('code')
  const flaggedRecovery = type === 'recovery' || url.searchParams.get('recovery') === 'true'
  if (!token_hash && !code && !flaggedRecovery) return null

  if (token_hash && (type === 'email' || type === 'signup' || type === 'invite' || type === 'recovery')) {
    const { error } = await auth().verifyOtp({ type, token_hash })
    if (error) throw error
  } else if (code || flaggedRecovery) {
    // The browser client handles PKCE automatically. Await its initialization.
    const { data, error } = await auth().getSession()
    if (error || !data.session) throw new Error('Invalid or expired account link.')
  } else {
    throw new Error('Invalid account link.')
  }

  window.history.replaceState(window.history.state, '', url.pathname)
  return flaggedRecovery || type === 'invite' ? 'reset' : 'signed-in'
}

export const { acceptInvite, handleAuthCallback } = netlify
