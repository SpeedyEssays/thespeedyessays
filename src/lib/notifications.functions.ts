import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../../db";
import { customerNotifications, orders } from "../../db/schema";
import { customerAccountSource, findCustomerAccount } from "./customers.server";
import { requireAdmin, requireCustomer } from "./identity.functions";
import { findAccessibleOrder } from "./order-records";
import { canCheckout, orderCode, orderIdFromCode } from "./orders";
import { notificationKinds } from "./portal-notifications";

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireCustomer])
  .validator(z.object({ page: z.number().int().min(0).max(10000) }))
  .handler(async ({ data, context }) => {
    const pageSize = 20;
    const rows = await getDb()
      .select({
        id: customerNotifications.id,
        kind: customerNotifications.kind,
        title: customerNotifications.title,
        body: customerNotifications.body,
        senderName: customerNotifications.senderName,
        createdAt: customerNotifications.createdAt,
        readAt: customerNotifications.readAt,
        order: {
          id: orders.id,
          topic: orders.topic,
          priceCents: orders.priceCents,
          paidAt: orders.paidAt,
          status: orders.status,
        },
      })
      .from(customerNotifications)
      .leftJoin(
        orders,
        and(
          eq(orders.id, customerNotifications.orderId),
          eq(orders.userId, customerNotifications.userId),
        ),
      )
      .where(eq(customerNotifications.userId, context.user.id))
      .orderBy(
        desc(customerNotifications.createdAt),
        desc(customerNotifications.id),
      )
      .limit(pageSize + 1)
      .offset(pageSize * data.page);
    return {
      entries: rows.slice(0, pageSize).map(({ order, ...row }) => ({
        ...row,
        orderCode: order ? orderCode(order.id) : null,
        payment:
          order &&
          (row.kind === "payment-reminder" || row.kind === "price-offer")
            ? {
                topic: order.topic,
                amount: order.priceCents / 100,
                paid: Boolean(order.paidAt),
                payable: canCheckout(order),
              }
            : null,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
      })),
      hasMore: rows.length > pageSize && data.page < 10000,
    };
  });

export const sendPaymentReminder = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(z.object({ code: z.string().max(20), requestId: z.uuid() }))
  .handler(async ({ data, context }) => {
    const id = orderIdFromCode(data.code);
    if (!id) throw new Error("Order not found.");
    return getDb().transaction(async (tx) => {
      const [order] = await tx
        .select({
          userId: orders.userId,
          status: orders.status,
          paidAt: orders.paidAt,
        })
        .from(orders)
        .where(eq(orders.id, id))
        .for("update");
      if (!order) throw new Error("Order not found.");
      const [original] = await tx
        .select({
          userId: customerNotifications.userId,
          orderId: customerNotifications.orderId,
          kind: customerNotifications.kind,
        })
        .from(customerNotifications)
        .where(eq(customerNotifications.id, data.requestId));
      if (
        original?.kind === "payment-reminder" &&
        original.orderId === id &&
        original.userId === order.userId
      ) {
        return { ok: true };
      }
      if (!canCheckout(order)) {
        throw new Error("This order no longer has a payment due.");
      }
      const [sent] = await tx
        .insert(customerNotifications)
        .values({
          id: data.requestId,
          userId: order.userId,
          orderId: id,
          kind: "payment-reminder",
          title: `Payment reminder for ${orderCode(id)}`,
          body: "Use Complete payment to pay the balance on your order.",
          senderName: context.user.supportName,
        })
        .onConflictDoNothing({ target: customerNotifications.id })
        .returning();
      if (!sent)
        throw new Error("Couldn’t send this reminder. Refresh and try again.");
      return { ok: true };
    });
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireCustomer])
  .validator(z.object({ id: z.uuid().optional() }))
  .handler(async ({ data, context }) => {
    await getDb()
      .update(customerNotifications)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(customerNotifications.userId, context.user.id),
          isNull(customerNotifications.readAt),
          data.id ? eq(customerNotifications.id, data.id) : undefined,
        ),
      );
    return { ok: true };
  });

export const sendCustomerNotification = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      requestId: z.uuid(),
      userId: z.string().min(1).max(128),
      orderCode: z.string().max(20).optional(),
      kind: z.enum(notificationKinds),
      title: z.string().trim().min(1).max(140),
      body: z.string().trim().min(1).max(5000),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!(await findCustomerAccount(data.userId)))
      throw new Error("Customer account not found.");
    const order = data.orderCode
      ? await findAccessibleOrder(data.orderCode, {
          id: data.userId,
          isAdmin: false,
        })
      : null;
    if (data.orderCode && !order)
      throw new Error("That order does not belong to this customer.");
    const db = getDb();
    const [sent] = await db
      .insert(customerNotifications)
      .values({
        id: data.requestId,
        userId: data.userId,
        orderId: order?.id,
        kind: data.kind,
        title: data.title,
        body: data.body,
        senderName: context.user.supportName,
      })
      .onConflictDoNothing({ target: customerNotifications.id })
      .returning();
    if (!sent) {
      const [original] = await db
        .select({ id: customerNotifications.id })
        .from(customerNotifications)
        .where(
          and(
            eq(customerNotifications.id, data.requestId),
            eq(customerNotifications.userId, data.userId),
            eq(customerNotifications.kind, data.kind),
            eq(customerNotifications.title, data.title),
            eq(customerNotifications.body, data.body),
            order
              ? eq(customerNotifications.orderId, order.id)
              : isNull(customerNotifications.orderId),
          ),
        );
      if (!original)
        throw new Error(
          "This notification has changed. Review it and send again.",
        );
    }
    return { ok: true };
  });

export const broadcastCustomerNotification = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      requestId: z.uuid(),
      kind: z.enum(notificationKinds),
      title: z.string().trim().min(1).max(140),
      body: z.string().trim().min(1).max(5000),
    }),
  )
  .handler(({ data, context }) =>
    getDb().transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('speedyessays:notifications'), hashtext(${data.requestId}))`,
      );
      const {
        rows: [previous],
      } = await tx.execute<{ count: number; matches: boolean | null }>(sql`
      select count(*)::int as count, bool_and(kind = ${data.kind} and title = ${data.title} and body = ${data.body}) as matches
      from ${customerNotifications} where broadcast_id = ${data.requestId}::uuid
    `);
      if (previous.count) {
        if (!previous.matches)
          throw new Error(
            "This announcement has changed. Review it and send again.",
          );
        return { count: previous.count };
      }
      const {
        rows: [delivered],
      } = await tx.execute<{ count: number }>(sql`
      with sent as (
        insert into ${customerNotifications} (broadcast_id, user_id, kind, title, body, sender_name)
        select ${data.requestId}::uuid, customer.id, ${data.kind}, ${data.title}, ${data.body}, ${context.user.supportName}
        from (${customerAccountSource()}) customer
        returning id
      )
      select count(*)::int as count from sent
    `);
      return { count: delivered.count };
    }),
  );
