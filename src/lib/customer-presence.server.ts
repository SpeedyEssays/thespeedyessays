import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { customerPresence } from "../../db/schema";

export const activeCustomer = sql<boolean>`${customerPresence.lastSeenAt} >= now() - interval '90 seconds'`;

export async function touchCustomerPresence(userId: string) {
  await getDb()
    .insert(customerPresence)
    .values({ userId, lastSeenAt: sql`now()` })
    .onConflictDoUpdate({
      target: customerPresence.userId,
      set: { lastSeenAt: sql`excluded.last_seen_at` },
      // Several tabs can report activity for the same customer.
      setWhere: sql`${customerPresence.lastSeenAt} < excluded.last_seen_at - interval '15 seconds'`,
    });
}

export async function readCustomerPresence(userId: string) {
  const [presence] = await getDb()
    .select({
      lastSeenAt: customerPresence.lastSeenAt,
      online: activeCustomer,
    })
    .from(customerPresence)
    .where(eq(customerPresence.userId, userId))
    .limit(1);
  return {
    online: presence?.online ?? false,
    lastSeenAt: presence?.lastSeenAt.toISOString() ?? null,
  };
}
