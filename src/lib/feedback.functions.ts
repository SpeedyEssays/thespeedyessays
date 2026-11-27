import { createServerFn } from "@tanstack/react-start";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../../db";
import { orderFeedback, orders } from "../../db/schema";
import { requireAdmin, requireCustomer } from "./identity.functions";
import { feedbackView, findAccessibleOrder } from "./order-records";
import { orderCode, orderIdFromCode } from "./orders";

export const saveOrderFeedback = createServerFn({ method: "POST" })
  .middleware([requireCustomer])
  .validator(
    z.object({
      code: z.string().max(20),
      rating: z.number().int().min(0).max(5),
      comment: z.string().trim().max(5000),
    }),
  )
  .handler(async ({ data, context }) => {
    const order = await findAccessibleOrder(data.code, {
      id: context.user.id,
      isAdmin: false,
    });
    if (!order || (!order.approvedAt && order.status !== "approved"))
      throw new Error("Approve this order before leaving feedback.");
    const { rating, comment } = data;
    const [saved] = await getDb()
      .insert(orderFeedback)
      .values({ orderId: order.id, rating, comment })
      .onConflictDoUpdate({
        target: orderFeedback.orderId,
        set: {
          rating,
          comment,
          updatedAt: sql`case
            when ${orderFeedback.rating} = ${rating} and ${orderFeedback.comment} = ${comment}
              then ${orderFeedback.updatedAt}
            else now()
          end`,
        },
      })
      .returning();
    return feedbackView(saved);
  });

export const listStaffFeedback = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(
    z.object({
      query: z.string().trim().max(200),
      page: z.number().int().min(0).max(10000),
    }),
  )
  .handler(async ({ data }) => {
    const pageSize = 20;
    const orderId = orderIdFromCode(data.query);
    const rows = await getDb()
      .select({
        feedback: orderFeedback,
        title: orders.topic,
        clientEmail: orders.clientEmail,
        clientName: orders.clientName,
      })
      .from(orderFeedback)
      .innerJoin(orders, eq(orders.id, orderFeedback.orderId))
      .where(
        orderId
          ? eq(orders.id, orderId)
          : data.query
            ? sql`
        position(lower(${data.query}) in lower(concat_ws(' ', ${orders.clientEmail},
          ${orders.clientName}, ${orders.topic}))) > 0
      `
            : undefined,
      )
      .orderBy(desc(orderFeedback.updatedAt), desc(orderFeedback.orderId))
      .limit(pageSize + 1)
      .offset(pageSize * data.page);
    return {
      entries: rows.slice(0, pageSize).map(({ feedback, ...order }) => ({
        ...feedbackView(feedback),
        ...order,
        code: orderCode(feedback.orderId),
      })),
      hasMore: rows.length > pageSize && data.page < 10000,
    };
  });
