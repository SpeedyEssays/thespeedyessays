import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { orders, walletTopUps } from "../../db/schema";
import { findCustomerAccount } from "./customers.server";
import { emailSiteOrigin } from "./gmail-sender.server";
import { requireAdmin, requireCustomer } from "./identity.functions";
import { canCheckout, orderCode, orderIdFromCode } from "./orders";
import {
  initializePaystackCheckout,
  paystackConfig,
  requireOrderPaymentBrief,
} from "./payments.server";
import { MIN_CHECKOUT_CENTS } from "./pricing";
import { MAX_WALLET_CENTS, walletReferencePattern } from "./wallet";
import { reconcileWalletTopUp } from "./wallet-payments.server";
import {
  ensureWallet,
  notifyWalletCredit,
  postWalletEntry,
  readWallet,
  walletBalance,
} from "./wallet.server";

const customerId = z.string().min(1).max(128);
const amount = z.number().int().min(1).max(MAX_WALLET_CENTS);
const topUpReference = z.string().regex(walletReferencePattern);

export const getMyWalletBalance = createServerFn({ method: "GET" })
  .middleware([requireCustomer])
  .handler(({ context }) => walletBalance(context.user.id));

export const getMyWallet = createServerFn({ method: "GET" })
  .middleware([requireCustomer])
  .handler(async ({ context }) => {
    const userId = context.user.id;
    const db = getDb();
    await ensureWallet(db, userId);
    const wallet = await readWallet(userId);
    return {
      ...wallet,
      referralUrl: wallet.referralCode
        ? new URL(
            `/refer/${wallet.referralCode}`,
            emailSiteOrigin() ?? getRequestUrl().origin,
          ).href
        : null,
      canTopUp: Boolean(paystackConfig()),
    };
  });

export const getStaffWallet = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(z.object({ userId: customerId }))
  .handler(async ({ data }) => {
    if (!(await findCustomerAccount(data.userId)))
      throw new Error("Customer account not found.");
    const { balanceCents, entries } = await readWallet(data.userId);
    return { balanceCents, entries };
  });

export const grantWalletReward = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      userId: customerId,
      requestId: z.uuid(),
      amountCents: amount,
      reason: z.string().trim().min(1).max(500),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!(await findCustomerAccount(data.userId)))
      throw new Error("Customer account not found.");
    return getDb().transaction(async (tx) => {
      if (
        await postWalletEntry(tx, {
          userId: data.userId,
          eventKey: `reward:${data.userId}:${data.requestId}`,
          kind: "staff-reward",
          amountCents: data.amountCents,
          description: data.reason,
          createdBy: context.user.id,
        })
      ) {
        await notifyWalletCredit(
          tx,
          data.userId,
          data.amountCents,
          "You received a support reward",
          data.reason,
        );
      }
      return { ok: true };
    });
  });

export const payOrderFromWallet = createServerFn({ method: "POST" })
  .middleware([requireCustomer])
  .validator(z.object({ code: z.string().max(20), expectedCents: amount }))
  .handler(async ({ data, context }) => {
    const id = orderIdFromCode(data.code);
    if (!id) throw new Error("Order not found.");
    return getDb().transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.userId, context.user.id)))
        .for("update");
      if (!order) throw new Error("Order not found.");
      if (order.paidAt && order.paymentMethod === "wallet") return { ok: true };
      if (!canCheckout(order))
        throw new Error("This order no longer has a payment due.");
      if (order.paymentReference)
        throw new Error("Use the existing checkout to avoid a second payment.");
      if (order.priceCents !== data.expectedCents)
        throw new Error("The order price changed. Refresh it before paying.");
      await requireOrderPaymentBrief(tx, order);
      const posted = await postWalletEntry(tx, {
        userId: order.userId,
        eventKey: `order-payment:${id}`,
        kind: "order-payment",
        amountCents: -order.priceCents,
        description: `Payment for ${orderCode(id)}.`,
      });
      if (!posted)
        throw new Error("A wallet payment already exists for this order.");
      const now = new Date();
      await tx
        .update(orders)
        .set({
          paidAt: now,
          updatedAt: now,
          paymentMethod: "wallet",
          status:
            order.status === "awaiting-payment" ? "in-progress" : order.status,
        })
        .where(eq(orders.id, id));
      return { ok: true };
    });
  });

export const startWalletTopUp = createServerFn({ method: "POST" })
  .middleware([requireCustomer])
  .validator(
    z.union([
      z.object({
        requestId: z.uuid(),
        amountCents: amount.min(MIN_CHECKOUT_CENTS),
      }),
      z.object({ reference: topUpReference }),
    ]),
  )
  .handler(async ({ data, context }) => {
    const config = paystackConfig();
    if (!config)
      throw new Error("Online wallet top-ups are unavailable right now.");
    const userId = context.user.id;
    const db = getDb();
    const reference =
      "reference" in data ? data.reference : `se-wallet-${data.requestId}`;
    if ("amountCents" in data) {
      await ensureWallet(db, userId);
      await db
        .insert(walletTopUps)
        .values({ reference, userId, amountCents: data.amountCents })
        .onConflictDoNothing();
    }
    const owner = and(
      eq(walletTopUps.reference, reference),
      eq(walletTopUps.userId, userId),
    );
    const [topUp] = await db.select().from(walletTopUps).where(owner);
    if (
      !topUp ||
      ("amountCents" in data && topUp.amountCents !== data.amountCents)
    )
      throw new Error("This top-up is unavailable. Start a new one.");
    const callback = new URL("/dashboard?tab=wallet", config.origin);
    callback.searchParams.set("walletReference", reference);
    if (
      topUp.paidAt ||
      (topUp.paymentUrl && (await reconcileWalletTopUp(reference)))
    )
      return { url: callback.href };
    if (topUp.paymentUrl) return { url: topUp.paymentUrl };
    const cancel = new URL(callback);
    cancel.searchParams.set("paymentExit", "closed");
    try {
      const url = await initializePaystackCheckout(
        config.key,
        {
          reference,
          amount: topUp.amountCents,
          email: context.user.email,
          callback_url: callback.href,
        },
        cancel.href,
      );
      await db.update(walletTopUps).set({ paymentUrl: url }).where(owner);
      return { url };
    } catch {
      const [current] = await db.select().from(walletTopUps).where(owner);
      if (current?.paidAt) return { url: callback.href };
      if (current?.paymentUrl) return { url: current.paymentUrl };
      throw new Error(
        "Couldn’t open top-up checkout. You can retry this top-up.",
      );
    }
  });

export const refreshWalletTopUp = createServerFn({ method: "POST" })
  .middleware([requireCustomer])
  .validator(z.object({ reference: topUpReference }))
  .handler(async ({ data, context }) => {
    const [topUp] = await getDb()
      .select({ paidAt: walletTopUps.paidAt })
      .from(walletTopUps)
      .where(
        and(
          eq(walletTopUps.reference, data.reference),
          eq(walletTopUps.userId, context.user.id),
        ),
      );
    if (!topUp) throw new Error("Top-up not found.");
    return {
      paid:
        Boolean(topUp.paidAt) || (await reconcileWalletTopUp(data.reference)),
    };
  });
