import { createServerFn } from '@tanstack/react-start'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import { requireStaffManager } from './identity.functions'

type AdminAccount = { email: string; canManageStaff: boolean }

export const listPortalAdmins = createServerFn({ method: 'GET' })
  .middleware([requireStaffManager])
  .handler(async () => {
    const { rows } = await getDb().execute<AdminAccount>(sql`
      select email, raw_app_meta_data->'roles' ? 'staff_manager' as "canManageStaff"
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
  .validator(z.email().max(320))
  .handler(async ({ context, data }) => {
    const roles = sql`case when jsonb_typeof(raw_app_meta_data->'roles') = 'array'
      then raw_app_meta_data->'roles' else '[]'::jsonb end`
    const { rows } = await getDb().execute<{ email: string }>(sql`
      update auth.users
      set raw_app_meta_data = jsonb_set(coalesce(raw_app_meta_data, '{}'::jsonb), '{roles}',
        case when (${roles}) ? 'admin' then (${roles}) else (${roles}) || '["admin"]'::jsonb end),
        updated_at = now()
      where id = (
        select id from auth.users where lower(email) = ${data.toLowerCase()}
          and email_confirmed_at is not null and deleted_at is null
          and (banned_until is null or banned_until <= now())
      )
        and exists (
          select 1 from auth.users actor where actor.id = ${context.user.id}::uuid
            and actor.email_confirmed_at is not null
            and actor.deleted_at is null
            and (actor.banned_until is null or actor.banned_until <= now())
            and actor.raw_app_meta_data->'roles' @> '["admin","staff_manager"]'::jsonb
        )
      returning email`)
    if (!rows.length)
      throw new Error(
        'Use the email address of an active, confirmed SpeedyEssays account.',
      )
    return rows[0]
  })
