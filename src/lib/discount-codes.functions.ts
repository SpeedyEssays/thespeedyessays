import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../../db";
import { discountCodes } from "../../db/schema";
import { discountCodeInput } from "./discount-codes";
import { requireAdmin } from "./identity.functions";

export const lookupDiscountCode = createServerFn({ method: "POST" })
  .validator(discountCodeInput)
  .handler(async ({ data: code }) => {
    const [discount] = await getDb()
      .select({ code: discountCodes.code, percent: discountCodes.percent })
      .from(discountCodes)
      .where(and(eq(discountCodes.code, code), eq(discountCodes.active, true)));
    return discount ?? null;
  });

export const listDiscountCodes = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(() =>
    getDb()
      .select({
        code: discountCodes.code,
        percent: discountCodes.percent,
        active: discountCodes.active,
      })
      .from(discountCodes)
      .orderBy(desc(discountCodes.createdAt), discountCodes.code),
  );

export const createDiscountCode = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      code: discountCodeInput,
      percent: z.number().int().min(1).max(99),
    }),
  )
  .handler(async ({ data }) => {
    const [created] = await getDb()
      .insert(discountCodes)
      .values(data)
      .onConflictDoNothing({ target: discountCodes.code })
      .returning();
    if (!created) throw new Error("That discount code already exists.");
    return { ok: true };
  });

export const setDiscountCodeActive = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ code: discountCodeInput, active: z.boolean() }))
  .handler(async ({ data }) => {
    const [updated] = await getDb()
      .update(discountCodes)
      .set({ active: data.active })
      .where(eq(discountCodes.code, data.code))
      .returning();
    if (!updated) throw new Error("Discount code not found.");
    return { ok: true };
  });
