import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../../db";
import { discountCodes } from "../../db/schema";
import {
  findOfferRecipientEmail,
  listOfferRecipients,
} from "./customers.server";
import { discountCodeInput } from "./discount-codes";
import { sendGmail } from "./gmail-sender.server";
import { requireAdmin } from "./identity.functions";
import { offerCampaignRequest } from "./offer-campaign.server";
import { renderOfferEmail } from "./offer-email.server";
import { orderEmailConfig } from "./order-email.server";

const offerInput = z.object({
  requestId: z.uuid(),
  headline: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^\r\n]+$/),
  message: z.string().trim().min(1).max(1200),
  discountCode: discountCodeInput.optional(),
});

async function prepareOfferEmail(data: z.infer<typeof offerInput>) {
  const config = orderEmailConfig();
  if (!config)
    throw new Error("Connect the Gmail sender before sending offer emails.");
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
  return {
    sender: config.sender,
    email: renderOfferEmail(
      { ...data, discount: discount ?? null },
      config.origin,
    ),
  };
}

export const sendOfferEmail = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    offerInput.extend({
      userId: z.string().min(1).max(128),
      expectedRecipient: z.email().max(320),
    }),
  )
  .handler(async ({ data }) => {
    const to = await findOfferRecipientEmail(data.userId);
    if (!to || to !== data.expectedRecipient)
      throw new Error(
        "The customer’s confirmed email is unavailable or changed. Select them again.",
      );
    const { sender, email } = await prepareOfferEmail(data);
    const result = await sendGmail(sender, {
      ...email,
      id: `offer:${data.requestId}`,
      to,
    });
    if (result === "quota")
      throw new Error("Gmail has reached its daily sending limit.");
    if (result !== "queued")
      throw new Error(
        "Gmail couldn’t confirm this email. Try again here to reuse the same request.",
      );
    return { ok: true };
  });

export const queueOfferCampaign = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(offerInput)
  .handler(async ({ data }) => {
    const { email } = await prepareOfferEmail(data);
    const recipients = await listOfferRecipients();
    if (!recipients.length)
      throw new Error("There are no customers with confirmed email addresses.");
    const campaign = await offerCampaignRequest("start", {
      id: data.requestId,
      recipients,
      email,
    });
    if (!campaign) throw new Error("The campaign is unavailable. Try again.");
    return campaign;
  });

export const getOfferCampaignProgress = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(() => offerCampaignRequest("status"));

export const resumeOfferCampaign = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(() => offerCampaignRequest("resume"));
