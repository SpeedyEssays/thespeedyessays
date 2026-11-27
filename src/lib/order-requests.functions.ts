import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { customerNotifications, orderRequests, orders } from "../../db/schema";
import { requireAdmin, requireCustomer } from "./identity.functions";
import {
  canCancelImmediately,
  orderRequestKinds,
  orderRequestLabels,
} from "./order-requests";
import { orderCode, orderIdFromCode } from "./orders";
import { verifyPaystackRefund } from "./payments.server";
import { formatUSD } from "./pricing";
import { MAX_WALLET_CENTS } from "./wallet";
import { notifyWalletCredit, postWalletEntry } from "./wallet.server";

function viewRequest(request: typeof orderRequests.$inferSelect) {
  return {
    id: request.id,
    code: orderCode(request.orderId),
    kind: request.kind,
    status: request.status,
    reason: request.reason,
    staffNote: request.staffNote,
    amountCents: request.amountCents,
    createdAt: request.createdAt.toISOString(),
  };
}

export const listCustomerOrderRequests = createServerFn({ method: "GET" })
  .middleware([requireCustomer])
  .validator(z.object({ code: z.string().max(20) }))
  .handler(async ({ data, context }) => {
    const id = orderIdFromCode(data.code);
    if (!id) return [];
    const rows = await getDb()
      .select({ request: orderRequests })
      .from(orderRequests)
      .innerJoin(orders, eq(orders.id, orderRequests.orderId))
      .where(and(eq(orders.id, id), eq(orders.userId, context.user.id)))
      .orderBy(
        sql`${orderRequests.status} = 'pending' desc`,
        desc(orderRequests.createdAt),
      )
      .limit(25);
    return rows.map(({ request }) => viewRequest(request));
  });

export const requestOrderChange = createServerFn({ method: "POST" })
  .middleware([requireCustomer])
  .validator(
    z.object({
      code: z.string().max(20),
      requestId: z.uuid(),
      kind: z.enum(orderRequestKinds),
      reason: z.string().trim().min(1).max(3000),
    }),
  )
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
      const [existing] = await tx
        .select()
        .from(orderRequests)
        .where(eq(orderRequests.id, data.requestId));
      if (existing) {
        if (existing.orderId !== id || existing.kind !== data.kind)
          throw new Error("This request is unavailable.");
        return viewRequest(existing);
      }
      const [pending] = await tx
        .select()
        .from(orderRequests)
        .where(
          and(
            eq(orderRequests.orderId, id),
            eq(orderRequests.kind, data.kind),
            eq(orderRequests.status, "pending"),
          ),
        );
      if (pending) return viewRequest(pending);

      const cancellation = data.kind === "cancellation";
      if (cancellation && order.status === "cancelled")
        throw new Error("This order is already cancelled.");
      if (
        !cancellation &&
        (!order.paidAt || order.refundedCents >= order.priceCents)
      )
        throw new Error("There is no confirmed payment left to refund.");
      const immediate = cancellation && canCancelImmediately(order);
      const now = new Date();
      const [saved] = await tx
        .insert(orderRequests)
        .values({
          id: data.requestId,
          orderId: id,
          kind: data.kind,
          reason: data.reason,
          status: immediate ? "approved" : "pending",
          reviewedAt: immediate ? now : null,
        })
        .returning();
      if (immediate) {
        await tx
          .update(orders)
          .set({ status: "cancelled", updatedAt: now })
          .where(eq(orders.id, id));
        await tx.insert(customerNotifications).values({
          userId: order.userId,
          orderId: id,
          kind: "notice",
          title: `Order ${orderCode(id)} cancelled`,
          body: "Your cancellation reason was saved with the order.",
        });
      }
      return viewRequest(saved);
    });
  });

export const listStaffOrderRequests = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(z.object({ code: z.string().max(20).optional() }).optional())
  .handler(async ({ data }) => {
    const id = data?.code ? orderIdFromCode(data.code) : null;
    if (data?.code && !id) return [];
    const rows = await getDb()
      .select({ request: orderRequests, order: orders })
      .from(orderRequests)
      .innerJoin(orders, eq(orders.id, orderRequests.orderId))
      .where(id ? eq(orderRequests.orderId, id) : undefined)
      .orderBy(
        sql`${orderRequests.status} = 'pending' desc`,
        desc(orderRequests.createdAt),
      )
      .limit(100);
    return rows.map(({ request, order }) => ({
      ...viewRequest(request),
      title: order.topic,
      email: order.clientEmail,
      paid: Boolean(order.paidAt),
      paymentReference: order.paymentReference,
      paymentMethod: order.paymentMethod,
      remainingCents: order.paidAt ? order.priceCents - order.refundedCents : 0,
    }));
  });

export const resolveOrderRequest = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      id: z.uuid(),
      decision: z.enum(["approved", "declined"]),
      note: z.string().trim().max(2000),
      amountCents: z.number().int().min(1).max(MAX_WALLET_CENTS).optional(),
      providerRefundId: z
        .string()
        .regex(/^[1-9][0-9]{0,15}$/)
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = getDb();
    const [entry] = await db
      .select({ request: orderRequests, order: orders })
      .from(orderRequests)
      .innerJoin(orders, eq(orders.id, orderRequests.orderId))
      .where(eq(orderRequests.id, data.id));
    if (!entry) throw new Error("Request not found.");
    if (entry.request.status === data.decision) return { ok: true };
    if (entry.request.status !== "pending")
      throw new Error("This request has already been reviewed.");
    if (data.decision === "declined" && !data.note)
      throw new Error("Enter a reason for declining the request.");

    const refunding =
      data.decision === "approved" && entry.request.kind === "refund";
    const walletRefund = entry.order.paymentMethod === "wallet";
    const proof =
      refunding && !walletRefund
        ? await verifiedRefund(entry.order, data.providerRefundId)
        : null;
    const refundCents = refunding
      ? (proof?.amountCents ?? data.amountCents)
      : null;

    return db.transaction(async (tx) => {
      const id = entry.order.id;
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, id))
        .for("update");
      const [request] = await tx
        .select()
        .from(orderRequests)
        .where(eq(orderRequests.id, data.id));
      if (!order || !request) throw new Error("Request not found.");
      if (request.status === data.decision) return { ok: true };
      if (request.status !== "pending")
        throw new Error("This request has already been reviewed.");
      const now = new Date();
      const code = orderCode(id);

      if (refunding) {
        const remaining = order.priceCents - order.refundedCents;
        if (
          !order.paidAt ||
          order.paymentMethod !== entry.order.paymentMethod ||
          order.paymentReference !== entry.order.paymentReference
        )
          throw new Error(
            "The payment changed. Refresh the request before reviewing it.",
          );
        if (!refundCents || refundCents > remaining)
          throw new Error("Enter a refund within the remaining paid amount.");
        if (proof) {
          const [recorded] = await tx
            .select({ id: orderRequests.id })
            .from(orderRequests)
            .where(eq(orderRequests.providerRefundId, proof.id));
          if (recorded)
            throw new Error("This Paystack refund was already recorded.");
        } else {
          await postWalletEntry(tx, {
            userId: order.userId,
            eventKey: `order-refund:${request.id}`,
            kind: "order-refund",
            amountCents: refundCents,
            description: `Refund for ${code}.`,
            createdBy: context.user.id,
          });
          await notifyWalletCredit(
            tx,
            order.userId,
            refundCents,
            `Refund credited for ${code}`,
            "Your order refund is available in your wallet.",
          );
        }
        await tx
          .update(orders)
          .set({
            refundedCents: order.refundedCents + refundCents,
            status: refundCents === remaining ? "cancelled" : order.status,
            updatedAt: now,
          })
          .where(eq(orders.id, id));
      } else if (data.decision === "approved") {
        await tx
          .update(orders)
          .set({ status: "cancelled", updatedAt: now })
          .where(eq(orders.id, id));
      }
      await tx
        .update(orderRequests)
        .set({
          status: data.decision,
          staffNote: data.note || null,
          reviewedBy: context.user.id,
          reviewedAt: now,
          amountCents: refundCents ?? null,
          providerRefundId: proof?.id ?? null,
        })
        .where(eq(orderRequests.id, request.id));
      if (!refunding || !walletRefund) {
        const message = refundCents
          ? `${formatUSD(refundCents / 100)} USD was refunded to your original payment method.`
          : data.decision === "approved"
            ? "Your order was cancelled."
            : "Support declined this request.";
        await tx.insert(customerNotifications).values({
          userId: order.userId,
          orderId: id,
          kind: "notice",
          senderName: context.user.supportName,
          title: `${orderRequestLabels[request.kind]} ${data.decision} for ${code}`,
          body: [message, data.note].filter(Boolean).join("\n\n"),
        });
      }
      return { ok: true };
    });
  });

async function verifiedRefund(
  order: typeof orders.$inferSelect,
  refundId: string | undefined,
) {
  if (
    !order.paidAt ||
    order.paymentMethod !== "paystack" ||
    !order.paymentReference
  )
    throw new Error("There is no verified Paystack payment for this order.");
  if (!refundId)
    throw new Error("Enter the processed refund ID from Paystack.");
  return verifyPaystackRefund(
    refundId,
    order.paymentReference,
    order.priceCents,
  );
}
