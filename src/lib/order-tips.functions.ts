import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { orders, orderTips } from "../../db/schema";
import { requireCustomer } from "./identity.functions";
import { canLeaveOrderTip } from "./order-tip";
import { reconcileOrderTip } from "./order-tips.server";
import { orderIdFromCode } from "./orders";
import {
  initializePaystackCheckout,
  paystackConfig,
  PaystackRequestError,
} from "./payments.server";
import { formatUSD, MIN_CHECKOUT_CENTS } from "./pricing";
import { MAX_WALLET_CENTS } from "./wallet";
import { postWalletEntry } from "./wallet.server";

const orderInput = z.object({ code: z.string().max(20) });
const tipAmount = z.number().int().min(1).max(MAX_WALLET_CENTS);

function ownedOrder(code: string, userId: string) {
  const id = orderIdFromCode(code);
  if (!id) throw new Error("Order not found.");
  return and(eq(orders.id, id), eq(orders.userId, userId));
}

export const payOrderTipFromWallet = createServerFn({ method: "POST" })
  .middleware([requireCustomer])
  .validator(orderInput.extend({ amountCents: tipAmount }))
  .handler(async ({ data, context }) => {
    const userId = context.user.id;
    await getDb().transaction(async (tx) => {
      const [order] = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(ownedOrder(data.code, userId))
        .for("update");
      if (!order) throw new Error("Order not found.");
      const [tip] = await tx
        .select()
        .from(orderTips)
        .where(eq(orderTips.orderId, order.id));
      if (tip?.paidAt) return;
      if (tip)
        throw new Error(
          "An online tip checkout is already in progress. Open it to finish the payment.",
        );
      if (!canLeaveOrderTip(order.status))
        throw new Error("You can leave a tip once the order is complete.");

      await postWalletEntry(tx, {
        userId,
        eventKey: `tip:${order.id}`,
        kind: "order-tip",
        amountCents: -data.amountCents,
        description: `Tip for order ${data.code}.`,
      });
      await tx.insert(orderTips).values({
        orderId: order.id,
        amountCents: data.amountCents,
        method: "wallet",
        paidAt: new Date(),
      });
    });
    return { ok: true };
  });

export const startOrderTipCheckout = createServerFn({ method: "POST" })
  .middleware([requireCustomer])
  .validator(
    orderInput.extend({
      amountCents: tipAmount.min(MIN_CHECKOUT_CENTS).optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const config = paystackConfig();
    if (!config)
      throw new Error("Online tip payments are unavailable right now.");
    const db = getDb();
    const tip = await db.transaction(async (tx) => {
      const [order] = await tx
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(ownedOrder(data.code, context.user.id))
        .for("update");
      if (!order) throw new Error("Order not found.");
      const [existing] = await tx
        .select()
        .from(orderTips)
        .where(eq(orderTips.orderId, order.id));
      if (existing?.paidAt) return existing;
      if (
        existing &&
        data.amountCents !== undefined &&
        data.amountCents !== existing.amountCents
      )
        throw new Error(
          "A tip with a different amount is awaiting payment. Open that checkout to continue.",
        );
      if (existing?.paymentUrl) return existing;
      if (!canLeaveOrderTip(order.status))
        throw new Error("You can leave a tip once the order is complete.");
      if (existing) return existing;
      if (data.amountCents === undefined)
        throw new Error(
          `Enter a tip of at least ${formatUSD(MIN_CHECKOUT_CENTS / 100)} USD for online checkout.`,
        );

      const [saved] = await tx
        .insert(orderTips)
        .values({
          orderId: order.id,
          amountCents: data.amountCents,
          method: "online",
          reference: `se-tip-${randomUUID()}`,
        })
        .returning();
      return saved;
    });
    if (tip.paidAt) return { url: null };
    const { reference } = tip;
    if (!reference) throw new Error("This tip checkout is unavailable.");

    const callback = new URL("/dashboard", config.origin);
    callback.searchParams.set("order", data.code);
    const cancel = new URL(callback);
    callback.searchParams.set("tipCheckout", "return");
    cancel.searchParams.set("tipCheckout", "closed");
    const matchesReference = eq(orderTips.reference, reference);
    try {
      if (tip.paymentUrl) {
        return {
          url: (await reconcileOrderTip(reference)) ? null : tip.paymentUrl,
        };
      }
      const url = await initializePaystackCheckout(
        config.key,
        {
          reference,
          amount: tip.amountCents,
          email: context.user.email,
          callback_url: callback.href,
        },
        cancel.href,
      );
      const [updated] = await db
        .update(orderTips)
        .set({ paymentUrl: url })
        .where(and(matchesReference, isNull(orderTips.paidAt)))
        .returning({ orderId: orderTips.orderId });
      return { url: updated ? url : null };
    } catch (error) {
      if (
        !tip.paymentUrl &&
        error instanceof PaystackRequestError &&
        error.reason !== "unknown"
      ) {
        // A rejected initialization has no checkout link to reuse.
        await db
          .delete(orderTips)
          .where(
            and(
              matchesReference,
              isNull(orderTips.paymentUrl),
              isNull(orderTips.paidAt),
            ),
          );
      }
      const [current] = await db
        .select()
        .from(orderTips)
        .where(matchesReference);
      if (current?.paidAt) return { url: null };
      if (current?.paymentUrl) return { url: current.paymentUrl };
      if (!current)
        throw new Error(
          "Online tip checkout is unavailable. You can pay from your wallet or try again later.",
          { cause: error },
        );
      throw new Error(
        "Couldn’t open tip checkout. Retry the payment or contact support.",
        { cause: error },
      );
    }
  });

export const checkOrderTip = createServerFn({ method: "POST" })
  .middleware([requireCustomer])
  .validator(orderInput)
  .handler(async ({ data, context }) => {
    const [tip] = await getDb()
      .select({ reference: orderTips.reference, paidAt: orderTips.paidAt })
      .from(orderTips)
      .innerJoin(orders, eq(orderTips.orderId, orders.id))
      .where(ownedOrder(data.code, context.user.id));
    if (!tip) throw new Error("Tip not found.");
    return {
      paid:
        Boolean(tip.paidAt) ||
        (tip.reference ? await reconcileOrderTip(tip.reference) : false),
    };
  });
