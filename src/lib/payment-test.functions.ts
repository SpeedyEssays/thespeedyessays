import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireAdmin } from "./identity.functions";
import {
  currency,
  initializePaystackCheckout,
  paystackRequest,
  PaystackRequestError,
} from "./payments.server";

const testAmount = 2000;
const testReference = z.string().regex(/^se-test-[0-9a-f-]{36}$/);

const testRejectionMessage = {
  currency:
    "Paystack has not enabled USD for this test account. Ask Paystack to enable USD in Test Mode.",
  credentials:
    "Paystack rejected the Test Secret Key. Copy the key from the correct Paystack business in Test Mode and update PAYSTACK_TEST_SECRET_KEY in Cloudflare.",
  channels:
    "Paystack has no active method for this USD test. Check Cards under Paystack Dashboard → Settings → Preferences.",
};

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
    try {
      return {
        url: await initializePaystackCheckout(key, {
          email: context.user.email,
          amount: testAmount,
          reference,
          callback_url: callback.href,
        }),
      };
    } catch (error) {
      if (!(error instanceof PaystackRequestError)) throw error;
      throw new Error(
        error.reason === "unknown"
          ? `Paystack declined to open the USD test (HTTP ${error.status}). Check your test account settings or contact Paystack support.`
          : testRejectionMessage[error.reason],
        { cause: error },
      );
    }
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
