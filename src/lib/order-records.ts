// Server-side helpers for reading orders from Netlify Database. Only import
// this module from server function handlers and API routes.
import { and, asc, desc, eq, inArray } from 'drizzle-orm'

import { db } from '../../db'
import { orderFiles, orderMessages, orders } from '../../db/schema'
import { orderCode, orderIdFromCode, type AdminOrderView, type FileKind, type OrderStatus, type OrderView } from './orders'

type OrderRow = typeof orders.$inferSelect
type FileRow = typeof orderFiles.$inferSelect

function toView(row: OrderRow, files: FileRow[]): OrderView {
  return {
    id: row.id,
    code: orderCode(row.id),
    title: row.topic,
    type: row.type,
    subject: row.subject,
    level: row.level,
    style: row.style,
    sources: row.sources,
    pages: row.pages,
    dueAt: row.dueAt.toISOString(),
    placedAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    price: row.priceCents / 100,
    paymentMethod: row.paymentMethod,
    status: row.status as OrderStatus,
    originalityScore: row.originalityScore,
    instructions: row.instructions,
    files: files
      .filter((f) => f.orderId === row.id)
      .map((f) => ({ id: f.id, kind: f.kind as FileKind, name: f.name, size: f.size, createdAt: f.createdAt.toISOString() })),
  }
}

async function filesFor(ids: number[]) {
  if (ids.length === 0) return []
  return db.select().from(orderFiles).where(inArray(orderFiles.orderId, ids)).orderBy(asc(orderFiles.createdAt))
}

export async function listOrdersForUser(userId: string) {
  const rows = await db.select().from(orders).where(eq(orders.userId, userId)).orderBy(desc(orders.createdAt))
  const files = await filesFor(rows.map((r) => r.id))
  return rows.map((r) => toView(r, files))
}

export async function listAllOrders(): Promise<AdminOrderView[]> {
  const rows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(500)
  const ids = rows.map((r) => r.id)
  const files = await filesFor(ids)
  const lastSenders = new Map<number, string>()
  if (ids.length) {
    const msgs = await db
      .select({ orderId: orderMessages.orderId, sender: orderMessages.sender })
      .from(orderMessages)
      .where(inArray(orderMessages.orderId, ids))
      .orderBy(asc(orderMessages.createdAt))
    for (const m of msgs) lastSenders.set(m.orderId, m.sender)
  }
  return rows.map((r) => ({
    ...toView(r, files),
    clientEmail: r.clientEmail,
    clientName: r.clientName,
    awaitingReply: lastSenders.get(r.id) === 'client',
  }))
}

// Returns the order row when the user owns it (or is an admin), else null.
export async function findAccessibleOrder(code: string, user: { id: string; isAdmin: boolean }) {
  const id = orderIdFromCode(code)
  if (!id) return null
  const [row] = await db
    .select()
    .from(orders)
    .where(user.isAdmin ? eq(orders.id, id) : and(eq(orders.id, id), eq(orders.userId, user.id)))
  return row ?? null
}
