import { createServerFn } from '@tanstack/react-start'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '../../db'
import { orderMessages, orders } from '../../db/schema'
import { requireUser } from './identity.functions'
import { findAccessibleOrder, listOrdersForUser } from './order-records'
import { orderCode, type OrderMessageView } from './orders'
import { academicLevels, assignmentTypes, deadlines, estimatePrice, formattingStyles } from './pricing'

const levelIds = academicLevels.map((l) => l.id) as [string, ...string[]]
const deadlineIds = deadlines.map((d) => d.id) as [string, ...string[]]

const createOrderInput = z.object({
  type: z.enum(assignmentTypes),
  subject: z.string().trim().min(1).max(80),
  topic: z.string().trim().min(4).max(300),
  level: z.enum(levelIds),
  style: z.enum(formattingStyles),
  sources: z.coerce.number().int().min(0).max(100),
  pages: z.number().int().min(1).max(200),
  deadline: z.enum(deadlineIds),
  extras: z.object({ topWriter: z.boolean().optional(), draftPreview: z.boolean().optional(), abstractPage: z.boolean().optional() }),
  instructions: z.string().max(20000),
  payment: z.enum(['card', 'paypal']),
  hasFiles: z.boolean(),
})

export const createOrder = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(createOrderInput)
  .handler(async ({ data, context }) => {
    if (data.instructions.trim().length < 20 && !data.hasFiles) {
      throw new Error('Add at least a sentence of instructions or upload your prompt.')
    }
    const level = academicLevels.find((l) => l.id === data.level)!
    const deadline = deadlines.find((d) => d.id === data.deadline)!
    // Never trust a client-side total: recompute from the shared price table.
    const quote = estimatePrice({ level: level.id, deadline: deadline.id, pages: data.pages, extras: data.extras })

    const [row] = await db
      .insert(orders)
      .values({
        userId: context.user.id,
        clientEmail: context.user.email,
        clientName: context.user.name,
        type: data.type,
        subject: data.subject,
        topic: data.topic,
        level: level.label,
        style: data.style,
        sources: data.sources,
        pages: quote.pages,
        deadlineOption: deadline.id,
        dueAt: new Date(Date.now() + deadline.hours * 3600 * 1000),
        extras: data.extras,
        instructions: data.instructions.trim(),
        paymentMethod: data.payment,
        priceCents: Math.round(quote.total * 100),
      })
      .returning()

    await db.insert(orderMessages).values({
      orderId: row.id,
      sender: 'support',
      body: `Thanks for your order! We’ve received your brief for “${row.topic}”. Our team will confirm the details and send your ${data.payment === 'card' ? 'card' : 'PayPal'} payment link here shortly. Reply in this thread any time.`,
    })

    return { code: orderCode(row.id), total: quote.total }
  })

export const listMyOrders = createServerFn({ method: 'GET' })
  .middleware([requireUser])
  .handler(({ context }) => listOrdersForUser(context.user.id))

export const getOrderMessages = createServerFn({ method: 'GET' })
  .middleware([requireUser])
  .validator(z.object({ code: z.string().max(20) }))
  .handler(async ({ data, context }): Promise<OrderMessageView[]> => {
    const order = await findAccessibleOrder(data.code, context.user)
    if (!order) throw new Error('Order not found.')
    const rows = await db.select().from(orderMessages).where(eq(orderMessages.orderId, order.id)).orderBy(asc(orderMessages.createdAt))
    return rows.map((m) => ({ id: m.id, sender: m.sender as OrderMessageView['sender'], body: m.body, at: m.createdAt.toISOString() }))
  })

export const sendOrderMessage = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(z.object({ code: z.string().max(20), body: z.string().trim().min(1).max(5000), asSupport: z.boolean().optional() }))
  .handler(async ({ data, context }) => {
    if (data.asSupport && !context.user.isAdmin) throw new Error('Admin access required.')
    const order = await findAccessibleOrder(data.code, context.user)
    if (!order) throw new Error('Order not found.')
    await db.insert(orderMessages).values({ orderId: order.id, sender: data.asSupport ? 'support' : 'client', body: data.body })
    await db.update(orders).set({ updatedAt: new Date() }).where(eq(orders.id, order.id))
    return { ok: true }
  })

export const requestRevision = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(z.object({ code: z.string().max(20), notes: z.string().trim().min(10).max(5000) }))
  .handler(async ({ data, context }) => {
    const order = await findAccessibleOrder(data.code, { ...context.user, isAdmin: false })
    if (!order) throw new Error('Order not found.')
    if (order.status !== 'draft-ready' && order.status !== 'completed') {
      throw new Error('Revisions open once your draft is delivered.')
    }
    await db.update(orders).set({ status: 'revision', updatedAt: new Date() }).where(eq(orders.id, order.id))
    await db.insert(orderMessages).values({ orderId: order.id, sender: 'client', body: `Revision request: ${data.notes}` })
    return { ok: true }
  })
