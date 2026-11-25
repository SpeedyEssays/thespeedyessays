import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../../db";
import { customerNotifications } from "../../db/schema";
import { findCustomerAccount } from "./customers.server";
import { requireAdmin, requireUser } from "./identity.functions";
import { findAccessibleOrder } from "./order-records";
import { orderCode } from "./orders";
import { notificationKinds } from "./portal-notifications";

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .validator(z.object({ page: z.number().int().min(0).max(10000) }))
  .handler(async ({ data, context }) => {
    const pageSize = 20;
    const rows = await getDb()
      .select({
        id: customerNotifications.id,
        orderId: customerNotifications.orderId,
        kind: customerNotifications.kind,
        title: customerNotifications.title,
        body: customerNotifications.body,
        senderName: customerNotifications.senderName,
        createdAt: customerNotifications.createdAt,
        readAt: customerNotifications.readAt,
      })
      .from(customerNotifications)
      .where(eq(customerNotifications.userId, context.user.id))
      .orderBy(
        desc(customerNotifications.createdAt),
        desc(customerNotifications.id),
      )
      .limit(pageSize + 1)
      .offset(pageSize * data.page);
    return {
      entries: rows.slice(0, pageSize).map((row) => ({
        ...row,
        orderCode: row.orderId ? orderCode(row.orderId) : null,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
      })),
      hasMore: rows.length > pageSize && data.page < 10000,
    };
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireUser])
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
