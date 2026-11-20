import { getCookies, setCookie, setResponseHeader } from '@tanstack/react-start/server'
import { getUser as getNetlifyUser } from '@netlify/identity'
import { createServerClient } from '@supabase/ssr'
import { supabaseConfig, useSupabase } from './supabase-config'

export type SessionUser = { id: string; name: string | null; email: string; isAdmin: boolean }

export async function readSessionUser(): Promise<SessionUser | null> {
  setResponseHeader('Cache-Control', 'private, no-store')
  if (!useSupabase) {
    const user = await getNetlifyUser()
    return user
      ? {
          id: user.id,
          name: user.name ?? null,
          email: user.email ?? '',
          isAdmin: !!user.roles?.includes('admin'),
        }
      : null
  }

  const { url, key } = supabaseConfig()
  const auth = createServerClient(url, key, {
    cookies: {
      getAll: () => Object.entries(getCookies()).map(([name, value]) => ({ name, value })),
      setAll: (cookies) =>
        cookies.forEach(({ name, value, options }) => setCookie(name, value, { ...options, secure: true })),
    },
  }).auth
  const { data, error } = await auth.getUser()
  if (error || !data.user?.email || !data.user.email_confirmed_at) return null

  const { id, email, user_metadata, app_metadata } = data.user
  return {
    id,
    email,
    name: typeof user_metadata.full_name === 'string' ? user_metadata.full_name : null,
    isAdmin: Array.isArray(app_metadata.roles) && app_metadata.roles.includes('admin'),
  }
}
