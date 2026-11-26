import { eq, sql } from 'drizzle-orm'
import { getDb } from '../../db'
import { customerProfiles } from '../../db/schema'
import { useSupabase } from './supabase-config'

type AccountRow = {
  id: string
  email: string
  accountName: string | null
  displayName: string | null
}

export function customerAccountSource() {
  return useSupabase
    ? sql`select id::text as id, email,
          left(nullif(trim(raw_user_meta_data->>'full_name'), ''), 100) as name
        from auth.users
        where deleted_at is null and email is not null
          and not (coalesce(raw_app_meta_data->'roles', '[]'::jsonb) ? 'admin')`
    : sql`select distinct on (user_id) user_id as id, client_email as email, client_name as name
        from public.orders order by user_id, id desc`
}

async function findAccounts(query: string, id?: string) {
  const result = await getDb().execute<AccountRow>(sql`
    select account.id, account.email, account.name as "accountName", profile.display_name as "displayName"
    from (${customerAccountSource()}) account
    left join public.customer_profiles profile on profile.user_id = account.id
    where ${
      id
        ? sql`account.id = ${id}`
        : sql`position(lower(${query}) in lower(concat_ws(' ', account.email, account.name, profile.display_name))) > 0`
    }
    order by lower(account.email), account.id
    limit ${id ? 1 : 50}`)
  return result.rows
}

export function searchCustomerAccounts(query: string) {
  return findAccounts(query)
}

export async function findCustomerAccount(id: string) {
  const [account] = await findAccounts('', id)
  return account ?? null
}

export async function readCustomerProfile(id: string) {
  const [profile] = await getDb()
    .select({
      displayName: customerProfiles.displayName,
      supportNotes: customerProfiles.supportNotes,
      revision: customerProfiles.revision,
    })
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, id))
  return profile ?? { displayName: null, supportNotes: '', revision: 0 }
}
