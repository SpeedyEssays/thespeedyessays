import { createServerFn } from '@tanstack/react-start'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import { customerProfiles } from '../../db/schema'
import {
  findCustomerAccount,
  readCustomerProfile,
  searchCustomerAccounts,
} from './customers.server'
import { requireAdmin, requireCustomer } from './identity.functions'

const customerId = z.string().min(1).max(128)

export const listStaffCustomers = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .validator(z.object({ query: z.string().trim().max(200) }))
  .handler(({ data }) => searchCustomerAccounts(data.query))

export const getStaffCustomer = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .validator(customerId)
  .handler(async ({ data }) => {
    const account = await findCustomerAccount(data)
    if (!account) throw new Error('Customer account not found.')
    return { ...account, ...(await readCustomerProfile(data)) }
  })

export const getMyDisplayName = createServerFn({ method: 'GET' })
  .middleware([requireCustomer])
  .handler(
    async ({ context }) =>
      (await readCustomerProfile(context.user.id)).displayName,
  )

export const updateStaffCustomer = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(
    z.object({
      id: customerId,
      displayName: z.string().trim().max(100),
      supportNotes: z.string().trim().max(5000),
      revision: z.number().int().nonnegative(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!(await findCustomerAccount(data.id)))
      throw new Error('Customer account not found.')

    const values = {
      displayName: data.displayName || null,
      supportNotes: data.supportNotes,
      updatedBy: context.user.id,
      updatedAt: new Date(),
    }
    const db = getDb()
    const [saved] =
      data.revision === 0
        ? await db
            .insert(customerProfiles)
            .values({ userId: data.id, ...values })
            .onConflictDoNothing({ target: customerProfiles.userId })
            .returning()
        : await db
            .update(customerProfiles)
            .set({ ...values, revision: sql`${customerProfiles.revision} + 1` })
            .where(
              and(
                eq(customerProfiles.userId, data.id),
                eq(customerProfiles.revision, data.revision),
              ),
            )
            .returning()
    if (!saved)
      throw new Error('This profile changed. Refresh it and try again.')
    return { revision: saved.revision }
  })
