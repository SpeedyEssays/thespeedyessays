import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../../db";
import { discountCodes } from "../../db/schema";
import { findCustomerAccount } from "./customers.server";
import { discountCodeInput } from "./discount-codes";
import { sendGmail } from "./gmail-sender.server";
import { requireAdmin } from "./identity.functions";
import { renderOfferEmail } from "./offer-email.server";
import { orderEmailConfig, orderEmailRecipient } from "./order-email.server";

export const sendOfferEmail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      requestId: z.uuid(),
      userId: z.string().min(1).max(128),
      expectedRecipient: z.email().max(320),
      headline: z
        .string()
        .trim()
        .min(1)
        .max(100)
        .regex(/^[^\r\n]+$/),
      message: z.string().trim().min(1).max(1200),
      discountCode: discountCodeInput.optional(),
    }),
  )
  .handler(async ({ data }) => {
    const config = orderEmailConfig();
    if (!config)
      throw new Error("Connect the Gmail sender before sending offer emails.");
    const account = await findCustomerAccount(data.userId);
    const email =
      account &&
      (await orderEmailRecipient({
        userId: account.id,
        clientEmail: account.email,
      }));
    if (!email || email !== data.expectedRecipient)
      throw new Error(
        "The customer’s confirmed email is unavailable or changed. Select them again.",
      );

    const [discount] = data.discountCode
      ? await getDb()
          .select({ code: discountCodes.code, percent: discountCodes.percent })
          .from(discountCodes)
          .where(
            and(
              eq(discountCodes.code, data.discountCode),
              eq(discountCodes.active, true),
            ),
          )
      : [];
    if (data.discountCode && !discount)
      throw new Error(
        "This discount code is unavailable. Choose an active code.",
      );

    const emailContent = renderOfferEmail(
      { ...data, discount: discount ?? null },
      config.origin,
    );
    const result = await sendGmail(config.sender, {
      ...emailContent,
      id: `offer:${data.requestId}`,
      to: email,
    });
    if (result === "quota")
      throw new Error("Gmail has reached its daily sending limit.");
    if (result !== "queued")
      throw new Error(
        "Gmail couldn’t confirm this email. Try again here to reuse the same request.",
      );
    return { ok: true };
  });
