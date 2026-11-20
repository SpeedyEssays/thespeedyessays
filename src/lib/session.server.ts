import {
  deleteCookie,
  getCookies,
  setCookie,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { getUser as getNetlifyUser } from '@netlify/identity'
import { createServerClient } from '@supabase/ssr'
import { supabaseConfig, useSupabase } from './supabase-config'
import { supportNameInput } from './support-name'

export const supportChatCookie = 'se_support'

export type SessionUser = {
  id: string
  name: string | null
  email: string
  isAdmin: boolean
  canManageStaff: boolean
  supportName: string | null
}

export async function readSessionUser(): Promise<SessionUser | null> {
  setResponseHeader('Cache-Control', 'private, no-store')
  if (!useSupabase) {
    const user = await getNetlifyUser()
    if (!user) return null
    const isAdmin = !!user.roles?.includes('admin')
    const supportName = supportNameInput.safeParse(
      user.name?.trim().split(/\s+/, 1)[0],
    )
    return {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? '',
      isAdmin,
      canManageStaff: false,
      supportName: isAdmin && supportName.success ? supportName.data : null,
    }
  }

  const auth = supabaseServerAuth()
  const { data, error } = await auth.getUser()
  if (error || !data.user?.email || !data.user.email_confirmed_at) return null

  const { id, email, user_metadata, app_metadata } = data.user
  const roles = Array.isArray(app_metadata.roles) ? app_metadata.roles : []
  const isAdmin = roles.includes('admin')
  const supportName = supportNameInput.safeParse(app_metadata.support_name)
  return {
    id,
    email,
    name:
      typeof user_metadata.full_name === 'string'
        ? user_metadata.full_name
        : null,
    isAdmin,
    canManageStaff: isAdmin && roles.includes('staff_manager'),
    supportName: isAdmin && supportName.success ? supportName.data : null,
  }
}

function supabaseServerAuth() {
  const { url, key } = supabaseConfig()
  return createServerClient(url, key, {
    cookies: {
      getAll: () =>
        Object.entries(getCookies()).map(([name, value]) => ({ name, value })),
      setAll: (cookies) =>
        cookies.forEach(({ name, value, options }) =>
          setCookie(name, value, { ...options, secure: true }),
        ),
    },
  }).auth
}

export async function signOutBrowserSession() {
  const { url } = supabaseConfig()
  const cookie = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`
  const authCookies = Object.keys(getCookies()).filter(
    (name) =>
      name === cookie ||
      name.startsWith(`${cookie}.`) ||
      name.startsWith(`${cookie}-`),
  )
  try {
    if (authCookies.length)
      await supabaseServerAuth().signOut({ scope: 'local' })
  } finally {
    for (const name of [...authCookies, supportChatCookie]) {
      deleteCookie(name, { path: '/', secure: true, sameSite: 'lax' })
    }
  }
}
