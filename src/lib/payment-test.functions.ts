import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireAdmin } from "./identity.functions";
import {
  currency,
  initializePaystackCheckout,
  paystackRequest,
} from "./payments.server";

const testAmount = 2000;
const testReference = z.string().regex(/^se-test-[0-9a-f-]{36}$/);

function testKey() {
  const key = process.env.PAYSTACK_TEST_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) {
    throw new Error(
      "Add your Paystack Test Secret Key in Cloudflare as PAYSTACK_TEST_SECRET_KEY.",
    );
  }
  return key;
}

export const startUsdPaymentTest = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const key = testKey();
    const reference = `se-test-${randomUUID()}`;
    const callback = new URL("/admin", getRequestUrl().origin);
    callback.searchParams.set("tab", "payment-test");
    callback.searchParams.set("testRef", reference);
    return {
      url: await initializePaystackCheckout(key, {
        email: context.user.email,
        amount: testAmount,
        reference,
        callback_url: callback.href,
      }),
    };
  });

export const verifyUsdPaymentTest = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(testReference)
  .handler(async ({ data: reference, context }) => {
    const result = z
      .object({
        domain: z.literal("test"),
        reference: z.literal(reference),
        amount: z.literal(testAmount),
        currency: z.literal(currency),
        status: z.string(),
        customer: z.object({ email: z.string() }),
      })
      .parse(
        await paystackRequest(
          `/transaction/verify/${encodeURIComponent(reference)}`,
          testKey(),
        ),
      );
    if (
      result.customer.email.toLowerCase() !== context.user.email.toLowerCase()
    ) {
      throw new Error("This test payment belongs to another staff account.");
    }
    return { paid: result.status === "success" };
  });
