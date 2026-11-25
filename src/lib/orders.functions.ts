import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, exists, isNotNull, isNull, lte, ne, sql } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '../../db'
import { orderFiles, orderMessages, orders } from '../../db/schema'
import { readCustomerProfile } from './customers.server'
import { requireAdmin, requireUser } from './identity.functions'
import {
  findAccessibleOrder,
  listAllOrders,
  listOrdersForUser,
} from './order-records'
import {
  orderCode,
  REVISION_WINDOW_DAYS,
  revisionRequestStatuses,
  type OrderMessageView,
} from './orders'
import {
  academicLevels,
  assignmentTypes,
  deadlines,
  estimatePrice,
  formattingStyles,
} from './pricing'
import { supportNameRequired } from './support-name'

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
  extras: z.object({
    topWriter: z.boolean().optional(),
    draftPreview: z.boolean().optional(),
    abstractPage: z.boolean().optional(),
  }),
  instructions: z.string().max(20000),
  submissionId: z.uuid(),
  agree: z.literal(true),
  hasFiles: z.boolean(),
})

export const createOrder = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(createOrderInput)
  .handler(async ({ data, context }) => {
    if (data.instructions.trim().length < 20 && !data.hasFiles) {
      throw new Error(
        'Add at least a sentence of instructions or upload your prompt.',
      )
    }
    const level = academicLevels.find((l) => l.id === data.level)!
    const deadline = deadlines.find((d) => d.id === data.deadline)!
    // Never trust a client-side total: recompute from the shared price table.
    const quote = estimatePrice({
      level: level.id,
      deadline: deadline.id,
      pages: data.pages,
      extras: data.extras,
    })

    const profile = await readCustomerProfile(context.user.id)
    const [row] = await getDb()
      .insert(orders)
      .values({
        userId: context.user.id,
        submissionId: data.submissionId,
        clientEmail: context.user.email,
        clientName: profile.displayName ?? context.user.name,
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
        paymentMethod: 'paystack',
        priceCents: Math.round(quote.total * 100),
      })
      .onConflictDoNothing({ target: orders.submissionId })
      .returning()

    const [existing] = row
      ? []
      : await getDb()
          .select()
          .from(orders)
          .where(
            and(
              eq(orders.submissionId, data.submissionId),
              eq(orders.userId, context.user.id),
            ),
          )
    const saved = row ?? existing
    if (!saved)
      throw new Error(
        'Could not save the order. Start a new order and try again.',
      )
    return { code: orderCode(saved.id) }
  })

export const listMyOrders = createServerFn({ method: 'GET' })
  .middleware([requireUser])
  .handler(({ context }) => listOrdersForUser(context.user.id))

export const listStaffOrders = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .validator(
    z.object({ customerId: z.string().min(1).max(128).optional() }).optional(),
  )
  .handler(({ data }) => listAllOrders(data?.customerId))

export const updateOrderStatus = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(
    z.object({
      code: z.string().max(20),
      status: z.enum(['in-progress', 'draft-ready', 'completed', 'cancelled']),
    }),
  )
  .handler(async ({ data, context }) => {
    const order = await findAccessibleOrder(data.code, context.user)
    if (!order) throw new Error('Order not found.')
    if (data.status === 'cancelled') {
      if (order.status !== 'awaiting-payment' || order.paymentReference) {
        throw new Error(
          'This order cannot be cancelled here because checkout has already started or the order was paid.',
        )
      }
    } else {
      if (
        ![
          'awaiting-payment',
          'paid',
          'writer-assigned',
          'in-progress',
          'draft-ready',
          'revision',
        ].includes(order.status)
      ) {
        throw new Error('This order is not ready for a fulfilment update.')
      }
      if (data.status === 'completed' || data.status === 'draft-ready') {
        const [paper] = await getDb()
          .select({ id: orderFiles.id })
          .from(orderFiles)
          .where(
            and(
              eq(orderFiles.orderId, order.id),
              eq(
                orderFiles.kind,
                data.status === 'completed' ? 'final' : 'paper',
              ),
            ),
          )
          .limit(1)
        if (!paper)
          throw new Error(
            data.status === 'completed'
              ? 'Upload a final copy before marking this order delivered.'
              : 'Upload a draft before marking this order draft ready.',
          )
      }
    }
    const now = new Date()
    const [updated] = await getDb()
      .update(orders)
      .set({
        status: data.status,
        updatedAt: now,
        deliveredAt: data.status === 'completed' ? now : order.deliveredAt,
      })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.status, order.status),
          ...(data.status === 'cancelled'
            ? [isNull(orders.paymentReference)]
            : []),
        ),
      )
      .returning({ id: orders.id })
    if (!updated)
      throw new Error('The order was updated elsewhere. Refresh and try again.')
    return { ok: true }
  })

const orderDetailsInput = z.object({
  code: z.string().max(20),
  revision: z.number().int().nonnegative(),
  topic: z.string().trim().min(4).max(300),
  subject: z.string().trim().min(1).max(80),
  style: z.string().trim().min(1).max(80),
  sources: z.number().int().min(0).max(100),
  instructions: z.string().trim().max(20000),
  agreedDueAt: z.iso.datetime().nullable(),
})

export const updateStaffOrderDetails = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(orderDetailsInput)
  .handler(async ({ data, context }) => {
    const { code, revision, agreedDueAt, ...details } = data
    const order = await findAccessibleOrder(code, context.user)
    if (!order || order.status === 'cancelled')
      throw new Error('This order is unavailable.')
    const deadline = agreedDueAt ? new Date(agreedDueAt) : null
    if (deadline && !Number.isFinite(deadline.getTime()))
      throw new Error('Choose a valid deadline.')
    const changed = [
      details.topic !== order.topic && 'topic',
      details.subject !== order.subject && 'subject',
      details.style !== order.style && 'citation style',
      details.sources !== order.sources && 'source count',
      details.instructions !== order.instructions && 'instructions',
      deadline?.toISOString() !== order.agreedDueAt?.toISOString() &&
        'agreed deadline',
    ].filter(Boolean)
    if (order.detailsRevision !== revision)
      throw new Error('This order changed. Refresh it and try again.')
    if (!changed.length) return { ok: true }

    await getDb().transaction(async (tx) => {
      const [saved] = await tx
        .update(orders)
        .set({
          ...details,
          agreedDueAt: deadline,
          detailsRevision: sql`${orders.detailsRevision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.detailsRevision, revision),
            ne(orders.status, 'cancelled'),
          ),
        )
        .returning({ id: orders.id })
      if (!saved)
        throw new Error('This order changed. Refresh it and try again.')
      await tx.insert(orderMessages).values({
        orderId: order.id,
        sender: 'support',
        supportName: context.user.supportName,
        body: `Support updated the order: ${changed.join(', ')}. See Order details for the current brief.`,
      })
    })
    return { ok: true }
  })

export const getOrderMessages = createServerFn({ method: 'GET' })
  .middleware([requireUser])
  .validator(z.object({ code: z.string().max(20) }))
  .handler(async ({ data, context }): Promise<OrderMessageView[]> => {
    const order = await findAccessibleOrder(data.code, context.user)
    if (!order) throw new Error('Order not found.')
    const rows = await getDb()
      .select()
      .from(orderMessages)
      .where(eq(orderMessages.orderId, order.id))
      .orderBy(desc(orderMessages.id))
      .limit(200)
    return rows.reverse().map((m) => ({
      id: m.id,
      sender: m.sender as OrderMessageView['sender'],
      supportName: m.supportName,
      body: m.body,
      at: m.createdAt.toISOString(),
      readAt: m.readAt?.toISOString() ?? null,
    }))
  })

export const markOrderMessagesRead = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(
    z.object({
      code: z.string().max(20),
      through: z.number().int().positive().max(2147483647),
      asSupport: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.asSupport && !context.user.isAdmin)
      throw new Error('Admin access required.')
    const order = await findAccessibleOrder(data.code, {
      id: context.user.id,
      isAdmin: data.asSupport,
    })
    if (!order) throw new Error('Order not found.')
    await getDb()
      .update(orderMessages)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(orderMessages.orderId, order.id),
          eq(orderMessages.sender, data.asSupport ? 'client' : 'support'),
          lte(orderMessages.id, data.through),
          isNull(orderMessages.readAt),
        ),
      )
    return { ok: true }
  })

export const sendOrderMessage = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(
    z.object({
      code: z.string().max(20),
      body: z.string().trim().min(1).max(5000),
      asSupport: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    if (data.asSupport && !context.user.isAdmin)
      throw new Error('Admin access required.')
    const supportName = data.asSupport ? context.user.supportName : null
    if (data.asSupport && !supportName) throw new Error(supportNameRequired)
    const order = await findAccessibleOrder(data.code, {
      ...context.user,
      isAdmin: data.asSupport === true,
    })
    if (!order) throw new Error('Order not found.')
    await getDb().transaction(async (tx) => {
      await tx
        .insert(orderMessages)
        .values({
          orderId: order.id,
          sender: data.asSupport ? 'support' : 'client',
          supportName,
          body: data.body,
        })
      await tx
        .update(orders)
        .set({ updatedAt: new Date() })
        .where(eq(orders.id, order.id))
    })
    return { ok: true }
  })

export const approveOrder = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(z.object({ code: z.string().max(20) }))
  .handler(async ({ data, context }) => {
    if (context.user.isAdmin)
      throw new Error('Only the customer can approve this order.')
    const order = await findAccessibleOrder(data.code, context.user)
    if (!order) throw new Error('Order not found.')
    if (order.status === 'approved') return { ok: true }

    const db = getDb()
    const finalCopy = db
      .select({ id: orderFiles.id })
      .from(orderFiles)
      .where(
        and(eq(orderFiles.orderId, order.id), eq(orderFiles.kind, 'final')),
      )
    const [approved] = await db
      .update(orders)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(
        and(
          eq(orders.id, order.id),
          eq(orders.userId, context.user.id),
          eq(orders.status, 'completed'),
          isNotNull(orders.deliveredAt),
          exists(finalCopy),
        ),
      )
      .returning({ id: orders.id })
    if (!approved) {
      throw new Error(
        'The order must be completed with a delivered final copy. Refresh the order and try again.',
      )
    }
    return { ok: true }
  })

export const requestRevision = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(
    z.object({
      code: z.string().max(20),
      notes: z.string().trim().min(10).max(5000),
    }),
  )
  .handler(async ({ data, context }) => {
    const order = await findAccessibleOrder(data.code, {
      ...context.user,
      isAdmin: false,
    })
    if (!order) throw new Error('Order not found.')
    const delivered = order.deliveredAt ?? order.updatedAt
    if (
      (order.status === 'completed' || order.status === 'approved') &&
      Date.now() > delivered.getTime() + REVISION_WINDOW_DAYS * 86400000
    ) {
      throw new Error('The 14-day revision window has ended.')
    }
    if (!revisionRequestStatuses.includes(order.status)) {
      throw new Error('Revisions open once your draft is delivered.')
    }
    await getDb().transaction(async (tx) => {
      const [updated] = await tx
        .update(orders)
        .set({ status: 'revision', updatedAt: new Date() })
        .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
        .returning({ id: orders.id })
      if (!updated)
        throw new Error(
          'An order update is already in progress. Refresh and try again.',
        )
      await tx.insert(orderMessages).values({
        orderId: order.id,
        sender: 'client',
        body: `Revision request: ${data.notes}`,
      })
    })
    return { ok: true }
  })
