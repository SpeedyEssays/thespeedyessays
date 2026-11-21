import { createServerFn } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import { requireStaffManager } from './identity.functions'
import { supportNameInput } from './support-name'

type AdminAccount = {
  email: string
  canManageStaff: boolean
  supportName: string | null
}

const adminNameInput = z.object({
  email: z.email().max(320),
  supportName: supportNameInput,
})

function activeStaffManager(id: string) {
  return sql`exists (
    select 1 from auth.users actor where actor.id = ${id}::uuid
      and actor.email_confirmed_at is not null
      and actor.deleted_at is null
      and (actor.banned_until is null or actor.banned_until <= now())
      and actor.raw_app_meta_data->'roles' @> '["admin","staff_manager"]'::jsonb
  )`
}

export const listPortalAdmins = createServerFn({ method: 'GET' })
  .middleware([requireStaffManager])
  .handler(async () => {
    const { rows } = await getDb().execute<AdminAccount>(sql`
      select email, raw_app_meta_data->'roles' ? 'staff_manager' as "canManageStaff",
        raw_app_meta_data->>'support_name' as "supportName"
      from auth.users
      where email is not null
        and email_confirmed_at is not null
        and deleted_at is null
        and (banned_until is null or banned_until <= now())
        and raw_app_meta_data->'roles' @> '["admin"]'::jsonb
      order by "canManageStaff" desc, lower(email)
      limit 200`)
    return rows
  })

export const grantPortalAdmin = createServerFn({ method: 'POST' })
  .middleware([requireStaffManager])
  .validator(adminNameInput)
  .handler(async ({ context, data }) => {
    const roles = sql`case when jsonb_typeof(raw_app_meta_data->'roles') = 'array'
      then raw_app_meta_data->'roles' else '[]'::jsonb end`
    const { rows } = await getDb().execute<{ email: string }>(sql`
      update auth.users
      set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{roles}',
        case when (${roles}) ? 'admin' then (${roles}) else (${roles}) || '["admin"]'::jsonb end)
        || jsonb_build_object('support_name', ${data.supportName}::text),
        updated_at = now()
      where id = (
        select id from auth.users where lower(email) = ${data.email.toLowerCase()}
          and email_confirmed_at is not null and deleted_at is null
          and (banned_until is null or banned_until <= now())
      )
        and ${activeStaffManager(context.user.id)}
      returning email`)
    if (!rows.length)
      throw new Error(
        'Use the email address of an active, confirmed SpeedyEssays account.',
      )
    return rows[0]
  })

export const updatePortalAdminName = createServerFn({ method: 'POST' })
  .middleware([requireStaffManager])
  .validator(adminNameInput)
  .handler(async ({ context, data }) => {
    const { rows } = await getDb().execute<{ email: string }>(sql`
      update auth.users
      set raw_app_meta_data = raw_app_meta_data
        || jsonb_build_object('support_name', ${data.supportName}::text),
        updated_at = now()
      where lower(email) = ${data.email.toLowerCase()}
        and email_confirmed_at is not null and deleted_at is null
        and (banned_until is null or banned_until <= now())
        and raw_app_meta_data->'roles' @> '["admin"]'::jsonb
        and ${activeStaffManager(context.user.id)}
      returning email`)
    if (!rows.length) throw new Error('Choose an active admin account.')
    return rows[0]
  })
