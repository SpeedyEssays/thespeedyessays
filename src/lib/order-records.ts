// Server-side helpers for reading orders. Only import
// this module from server function handlers and API routes.
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'

import { getDb } from '../../db'
import { orderFiles, orderMessages, orders } from '../../db/schema'
import {
  canCustomerReadFile,
  orderCode,
  orderIdFromCode,
  type AdminOrderView,
  type FileKind,
  type OrderStatus,
  type OrderView,
} from './orders'

type OrderRow = typeof orders.$inferSelect
type FileRow = typeof orderFiles.$inferSelect

function toView(row: OrderRow, files: FileRow[], staff = false): OrderView {
  return {
    id: row.id,
    code: orderCode(row.id),
    title: row.topic,
    type: row.type,
    service: row.service,
    subject: row.subject,
    level: row.level,
    style: row.style,
    sources: row.sources,
    pages: row.pages,
    wordCount: row.wordCount,
    slideCount: row.slideCount,
    dueAt: (row.agreedDueAt ?? row.dueAt).toISOString(),
    agreedDueAt: row.agreedDueAt?.toISOString() ?? null,
    placedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    price: row.priceCents / 100,
    paymentMethod: row.paymentMethod,
    checkoutStarted: !!row.paymentReference,
    paidAt: row.paidAt?.toISOString() ?? null,
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    status: row.status as OrderStatus,
    originalityScore: row.originalityScore,
    instructions: row.instructions,
    files: files
      .filter(
        (f) =>
          f.orderId === row.id &&
          (staff || canCustomerReadFile(f.kind, row.deliveredAt)),
      )
      .map((f) => ({
        id: f.id,
        kind: f.kind as FileKind,
        name: f.name,
        size: f.size,
        createdAt: f.createdAt.toISOString(),
      })),
  }
}

async function filesFor(ids: number[]) {
  if (ids.length === 0) return []
  return getDb()
    .select()
    .from(orderFiles)
    .where(inArray(orderFiles.orderId, ids))
    .orderBy(asc(orderFiles.createdAt))
}

export async function listOrdersForUser(userId: string) {
  const rows = await getDb()
    .select()
    .from(orders)
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt))
  const files = await filesFor(rows.map((r) => r.id))
  return rows.map((r) => toView(r, files))
}

export async function listAllOrders(
  customerId?: string,
): Promise<AdminOrderView[]> {
  const rows = await getDb()
    .select({
      order: orders,
      lastSender: sql<string | null>`(
        select message.sender from ${orderMessages} message
        where message.order_id = ${orders}."id" order by message.id desc limit 1
      )`,
    })
    .from(orders)
    .where(customerId ? eq(orders.userId, customerId) : undefined)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(500)
  const files = await filesFor(rows.map(({ order }) => order.id))
  return rows.map(({ order, lastSender }) => ({
    ...toView(order, files, true),
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
