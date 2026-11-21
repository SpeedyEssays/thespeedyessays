import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { readSessionUser } from './session.server'

export type { SessionUser } from './session.server'

export const getServerUser = createServerFn({ method: 'GET' }).handler(() => readSessionUser())

export const requireUser = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const user = await readSessionUser()
  if (!user) throw new Error('Please sign in to continue.')
  return next({ context: { user } })
})

export const requireAdmin = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const user = await readSessionUser()
  if (!user?.isAdmin) throw new Error('Admin access required.')
  return next({ context: { user } })
})

export const requireStaffManager = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const user = await readSessionUser()
  if (!user?.canManageStaff) throw new Error('Only the site owner can manage staff access.')
  return next({ context: { user } })
})
