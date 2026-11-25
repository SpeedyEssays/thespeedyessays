import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { staffPresence } from "../../db/schema";
import { requireAdmin } from "./identity.functions";
import { supportNameInput } from "./support-name";
import { useSupabase } from "./supabase-config";

export const recordStaffActivity = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context: { user } }) => {
    if (!user.supportName) return null;
    await getDb()
      .insert(staffPresence)
      .values({
        userId: user.id,
        supportName: user.supportName,
        lastSeenAt: sql`now()`,
      })
      .onConflictDoUpdate({
        target: staffPresence.userId,
        set: {
          supportName: sql`excluded.support_name`,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
        setWhere: sql`${staffPresence.lastSeenAt} < excluded.last_seen_at - interval '15 seconds'
          or ${staffPresence.supportName} <> excluded.support_name`,
      });
    return null;
  });

export const getOnlineSupport = createServerFn({ method: "GET" }).handler(
  async () => {
    const [staff] = await getDb()
      .select({ name: staffPresence.supportName })
      .from(staffPresence)
      .where(
        and(
          sql`${staffPresence.lastSeenAt} >= now() - interval '90 seconds'`,
          useSupabase
            ? sql`exists (
        select 1 from auth.users u
        where u.id = ${staffPresence.userId}::uuid
          and u.deleted_at is null and u.email_confirmed_at is not null
          and jsonb_typeof(u.raw_app_meta_data->'roles') = 'array'
          and (u.raw_app_meta_data->'roles') ? 'admin'
          and btrim(u.raw_app_meta_data->>'support_name') = ${staffPresence.supportName}
      )`
            : undefined,
        ),
      )
      .orderBy(desc(staffPresence.lastSeenAt), staffPresence.userId)
      .limit(1);
    setResponseHeader("Cache-Control", "public, max-age=10");
    return { name: supportNameInput.safeParse(staff?.name).data ?? null };
  },
);
