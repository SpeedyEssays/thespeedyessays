import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { getUser, type User } from '@netlify/identity'

export type SessionUser = { id: string; name: string | null; email: string; isAdmin: boolean }

// Admins are assigned the `admin` role in the Netlify Identity dashboard.
export function isAdmin(user: Pick<User, 'roles'> | null | undefined) {
  return !!user?.roles?.includes('admin')
}

function toSessionUser(user: User): SessionUser {
  return { id: user.id, name: user.name ?? null, email: user.email ?? '', isAdmin: isAdmin(user) }
}

export const getServerUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SessionUser | null> => {
    setResponseHeader('Cache-Control', 'private, no-store')
    const user = await getUser()
    return user ? toSessionUser(user) : null
  },
)

export const requireUser = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  setResponseHeader('Cache-Control', 'private, no-store')
  const user = await getUser()
  if (!user) throw new Error('Please sign in to continue.')
  return next({ context: { user: toSessionUser(user) } })
})

export const requireAdmin = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  setResponseHeader('Cache-Control', 'private, no-store')
  const user = await getUser()
  if (!user || !isAdmin(user)) throw new Error('Admin access required.')
  return next({ context: { user: toSessionUser(user) } })
})
