import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { walletTopUps } from "../../db/schema";
import { paystackConfig, verifyUSDCharge } from "./payments.server";
import { notifyWalletCredit, postWalletEntry } from "./wallet.server";

export async function reconcileWalletTopUp(
  reference: string,
  requireSuccess = false,
) {
  const config = paystackConfig();
  if (!config) throw new Error("Online top-ups are unavailable.");
  const db = getDb();
  const [topUp] = await db
    .select()
    .from(walletTopUps)
    .where(eq(walletTopUps.reference, reference));
  if (!topUp) return false;
  if (topUp.paidAt) return true;
  if (
    !(await verifyUSDCharge(
      config.key,
      reference,
      topUp.amountCents,
      requireSuccess,
    ))
  )
    return false;

  await db.transaction(async (tx) => {
    const [recorded] = await tx
      .update(walletTopUps)
      .set({ paidAt: new Date() })
      .where(
        and(eq(walletTopUps.reference, reference), isNull(walletTopUps.paidAt)),
      )
      .returning({
        userId: walletTopUps.userId,
        amountCents: walletTopUps.amountCents,
      });
    if (!recorded) return;
    if (
      await postWalletEntry(tx, {
        userId: recorded.userId,
        eventKey: reference,
        kind: "top-up",
        amountCents: recorded.amountCents,
        description: "Confirmed Paystack top-up.",
      })
    ) {
      await notifyWalletCredit(
        tx,
        recorded.userId,
        recorded.amountCents,
        "Wallet top-up confirmed",
        "Your updated balance is ready to use.",
      );
    }
  });
  return true;
}
