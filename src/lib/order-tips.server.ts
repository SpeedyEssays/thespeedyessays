import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../../db";
import { orderTips } from "../../db/schema";
import { paystackConfig, verifyUSDCharge } from "./payments.server";

export async function reconcileOrderTip(
  reference: string,
  requireSuccess = false,
) {
  const db = getDb();
  const matchesReference = eq(orderTips.reference, reference);
  const [tip] = await db.select().from(orderTips).where(matchesReference);
  if (!tip) return false;
  if (tip.paidAt) return true;

  const config = paystackConfig();
  if (!config) throw new Error("Online tip payments are unavailable.");
  if (
    !(await verifyUSDCharge(
      config.key,
      reference,
      tip.amountCents,
      requireSuccess,
    ))
  )
    return false;

  await db
    .update(orderTips)
    .set({ paidAt: new Date() })
    .where(and(matchesReference, isNull(orderTips.paidAt)));
  return true;
}
