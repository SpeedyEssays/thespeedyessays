// Server-side helpers for reading orders. Only import
// this module from server function handlers and API routes.
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm'

import { getDb } from '../../db'
import { orderFeedback, orderFiles, orderMessages, orders, orderTips } from '../../db/schema'
import {
  customerFileAccess,
  customerRevisionStatus,
  orderCode,
  orderIdFromCode,
  type AdminOrderView,
  type FileKind,
  type OrderFeedbackView,
  type OrderFileView,
  type OrderStatus,
  type OrderView,
} from './orders'

type OrderRow = typeof orders.$inferSelect
type FileRow = typeof orderFiles.$inferSelect
type TipRow = Pick<typeof orderTips.$inferSelect, 'amountCents' | 'paidAt'>

export function feedbackView(row: typeof orderFeedback.$inferSelect): OrderFeedbackView {
  return {
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toView(
  row: OrderRow,
  files: FileRow[],
  tip: TipRow | null,
  staff = false,
  feedback: OrderFeedbackView | null = null,
): OrderView {
  return {
    id: row.id,
    code: orderCode(row.id),
    title: row.topic,
    type: row.type,
    service: row.service,
    language: row.language,
    software: row.software,
    softwareDetails: row.softwareDetails,
    softwareFeeCents: row.softwareFeeCents,
    subject: row.subject,
    level: row.level,
    style: row.style,
    sources: row.sources,
    pages: row.pages,
    wordCount: row.wordCount,
    slideCount: row.slideCount,
    speakerNotes: row.slideCount != null && row.extras.speakerNotes === true,
    deadlineOption: row.deadlineOption,
    dueAt: (row.agreedDueAt ?? row.dueAt).toISOString(),
    agreedDueAt: row.agreedDueAt?.toISOString() ?? null,
    placedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    price: row.priceCents / 100,
    refundedCents: row.refundedCents,
    priceAdjustment: row.priceAdjustment,
    paymentMethod: row.paymentMethod,
    checkoutStarted: !!row.paymentReference,
    paidAt: row.paidAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    deliveryVersion: row.deliveryVersion,
    filesRevision: row.filesRevision,
    revisionStatus: customerRevisionStatus(row),
    approvedAt: (row.approvedAt ?? (row.status === 'approved' ? row.updatedAt : null))?.toISOString() ?? null,
    feedback,
    tip: tip ? { amountCents: tip.amountCents, paidAt: tip.paidAt?.toISOString() ?? null } : null,
    status: row.status as OrderStatus,
    originalityScore: row.originalityScore,
    instructions: row.instructions,
    files: files
      .filter((f) => f.orderId === row.id)
      .map<OrderFileView>((f) => ({
        id: f.id,
        kind: f.kind as FileKind,
        name: f.name,
        size: f.size,
        createdAt: f.createdAt.toISOString(),
        access: customerFileAccess(f),
        hasPreview: Boolean(f.previewBlobKey),
      }))
      .filter((file) => staff || file.access !== 'pending'),
  }
}

async function filesFor(ids: number[]) {
  if (ids.length === 0) return []
  return getDb()
    .select()
    .from(orderFiles)
    .where(and(inArray(orderFiles.orderId, ids), isNull(orderFiles.removedAt)))
    .orderBy(asc(orderFiles.createdAt))
}

export async function listOrdersForUser(userId: string) {
  const rows = await getDb()
    .select({ order: orders, tip: { amountCents: orderTips.amountCents, paidAt: orderTips.paidAt } })
    .from(orders)
    .leftJoin(orderTips, eq(orderTips.orderId, orders.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
  if (!rows.length) return []
  const ids = rows.map(({ order }) => order.id)
  const [files, feedback] = await Promise.all([
    filesFor(ids),
    getDb().select().from(orderFeedback).where(inArray(orderFeedback.orderId, ids)),
  ])
  const byOrder = new Map(feedback.map((row) => [row.orderId, feedbackView(row)]))
  return rows.map(({ order, tip }) => toView(order, files, tip, false, byOrder.get(order.id)))
}

export async function listAllOrders(
  customerId?: string,
): Promise<AdminOrderView[]> {
  const rows = await getDb()
    .select({
      order: orders,
      tip: { amountCents: orderTips.amountCents, paidAt: orderTips.paidAt },
      lastSender: sql<string | null>`(
        select message.sender from ${orderMessages} message
        where message.order_id = ${orders}."id" and message.removed_at is null and not message.file_uploaded
        order by message.id desc limit 1
      )`,
    })
    .from(orders)
    .leftJoin(orderTips, eq(orderTips.orderId, orders.id))
    .where(customerId ? eq(orders.userId, customerId) : undefined)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(500)
  const files = await filesFor(rows.map(({ order }) => order.id))
  return rows.map(({ order, tip, lastSender }) => ({
    ...toView(order, files, tip, true),
    clientId: order.userId,
    clientEmail: order.clientEmail,
    clientName: order.clientName,
    awaitingReply: lastSender === 'client',
    detailsRevision: order.detailsRevision,
  }))
}

// Returns the order row when the user owns it (or is an admin), else null.
export async function findAccessibleOrder(
  code: string,
  user: { id: string; isAdmin: boolean },
) {
  const id = orderIdFromCode(code)
  if (!id) return null
  const [row] = await getDb()
    .select()
    .from(orders)
    .where(
      user.isAdmin
        ? eq(orders.id, id)
        : and(eq(orders.id, id), eq(orders.userId, user.id)),
    )
  return row ?? null
}
