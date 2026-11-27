import {
  and,
  desc,
  eq,
  gte,
  isNull,
  lt,
  ne,
  notExists,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import {
  customerNotifications,
  orders,
  walletAccounts,
  walletEntries,
  walletTopUps,
} from "../../db/schema";
import { formatUSD } from "./pricing";
import { useSupabase } from "./supabase-config";
import { REFERRAL_REWARD_CENTS } from "./wallet";

type WalletDb = Pick<
  ReturnType<typeof getDb>,
  "select" | "insert" | "update" | "execute"
>;

export async function ensureWallet(db: WalletDb, userId: string) {
  await db.insert(walletAccounts).values({ userId }).onConflictDoNothing();
}

export async function walletBalance(userId: string) {
  const [wallet] = await getDb()
    .select({ cents: walletAccounts.balanceCents })
    .from(walletAccounts)
    .where(eq(walletAccounts.userId, userId));
  return wallet?.cents ?? 0;
}

export async function readWallet(userId: string) {
  const db = getDb();
  const [wallet] = await db
    .select({
      balanceCents: walletAccounts.balanceCents,
      referralCode: walletAccounts.referralCode,
    })
    .from(walletAccounts)
    .where(eq(walletAccounts.userId, userId));
  const [entries, topUps] = await Promise.all([
    db
      .select({
        id: walletEntries.id,
        kind: walletEntries.kind,
        amountCents: walletEntries.amountCents,
        description: walletEntries.description,
        createdAt: walletEntries.createdAt,
      })
      .from(walletEntries)
      .where(eq(walletEntries.userId, userId))
      .orderBy(desc(walletEntries.createdAt), desc(walletEntries.id))
      .limit(50),
    db
      .select({
        reference: walletTopUps.reference,
        amountCents: walletTopUps.amountCents,
      })
      .from(walletTopUps)
      .where(and(eq(walletTopUps.userId, userId), isNull(walletTopUps.paidAt)))
      .orderBy(desc(walletTopUps.createdAt))
      .limit(20),
  ]);
  return {
    balanceCents: wallet?.balanceCents ?? 0,
    referralCode: wallet?.referralCode ?? null,
    entries: entries.map((entry) => ({
      ...entry,
      createdAt: entry.createdAt.toISOString(),
    })),
    topUps,
  };
}

// The entry and balance always change in the same transaction.
export async function postWalletEntry(
  db: WalletDb,
  entry: typeof walletEntries.$inferInsert,
) {
  await ensureWallet(db, entry.userId);
  const [inserted] = await db
    .insert(walletEntries)
    .values(entry)
    .onConflictDoNothing({ target: walletEntries.eventKey })
    .returning();
  if (!inserted) return false;
  const [updated] = await db
    .update(walletAccounts)
    .set({
      balanceCents: sql`${walletAccounts.balanceCents} + ${entry.amountCents}`,
    })
    .where(
      and(
        eq(walletAccounts.userId, entry.userId),
        entry.amountCents < 0
          ? gte(walletAccounts.balanceCents, -entry.amountCents)
          : undefined,
      ),
    )
    .returning({ cents: walletAccounts.balanceCents });
  if (!updated)
    throw new Error("Your wallet balance is too low for this payment.");
  return true;
}

export async function notifyWalletCredit(
  db: WalletDb,
  userId: string,
  amountCents: number,
  title: string,
  description: string,
) {
  await db.insert(customerNotifications).values({
    userId,
    kind: "wallet-credit",
    title,
    body: `${formatUSD(amountCents / 100)} USD was credited to your wallet. ${description}`,
  });
}

export async function captureFirstOrderReferral(
  db: WalletDb,
  userId: string,
  cookie: string | undefined,
) {
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('speedyessays:order-placement'), hashtext(${userId}))`,
  );
  const [prior] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.userId, userId))
    .limit(1);
  if (prior) return;

  // The metadata is an invitation code supplied by the customer. Account age
  // and the referrer's identity come from the database.
  const invited = useSupabase
    ? (
        await db.execute<{ createdAt: Date; code: string | null }>(sql`
        select created_at as "createdAt", raw_user_meta_data->>'speedy_referral' as code
        from auth.users where id = ${userId}::uuid
      `)
      ).rows[0]
    : null;
  const code =
    z.uuid().safeParse(invited?.code).data ?? z.uuid().safeParse(cookie).data;
  if (!code) return;
  const [referrer] = await db
    .select({ userId: walletAccounts.userId })
    .from(walletAccounts)
    .where(
      and(
        eq(walletAccounts.referralCode, code),
        ne(walletAccounts.userId, userId),
        invited ? lt(walletAccounts.createdAt, invited.createdAt) : undefined,
      ),
    );
  if (!referrer) return;
  await db
    .insert(walletAccounts)
    .values({ userId, referredBy: referrer.userId })
    .onConflictDoUpdate({
      target: walletAccounts.userId,
      set: { referredBy: referrer.userId },
      setWhere: and(
        isNull(walletAccounts.referredBy),
        notExists(
          db
            .select({ id: orders.id })
            .from(orders)
            .where(eq(orders.userId, userId)),
        ),
      ),
    });
}

export async function rewardApprovedReferral(
  db: WalletDb,
  buyerId: string,
  orderId: number,
) {
  const [buyer] = await db
    .select({ referredBy: walletAccounts.referredBy })
    .from(walletAccounts)
    .where(eq(walletAccounts.userId, buyerId));
  if (!buyer?.referredBy) return;
  const awarded = await postWalletEntry(db, {
    eventKey: `referral:${orderId}`,
    userId: buyer.referredBy,
    kind: "referral-reward",
    amountCents: REFERRAL_REWARD_CENTS,
    description: "A friend you referred approved an order.",
  });
  if (awarded) {
    await notifyWalletCredit(
      db,
      buyer.referredBy,
      REFERRAL_REWARD_CENTS,
      "You earned a referral reward",
      "A friend you referred approved an order.",
    );
  }
}
