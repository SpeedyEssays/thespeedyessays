import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, exists, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'

import { getDb } from '../../db'
import { customerNotifications, orderFiles, orderMessages, orders, staffAvatars } from '../../db/schema'
import { readCustomerProfile } from './customers.server'
import { requireAdmin, requireUser } from './identity.functions'
import {
  findAccessibleOrder,
  listAllOrders,
  listOrdersForUser,
} from './order-records'
import {
  MAX_SOFTWARE_DETAILS,
  orderLanguageIds,
  orderSoftwareIds,
  SOFTWARE_FEE_CENTS,
} from './order-requirements'
import {
  approvalFileKinds,
  canChangeUnpaidQuote,
  customerRevisionStatus,
  orderCode,
  orderRevisionDeadline,
  orderStatuses,
  staffOrderStatuses,
  statusMeta,
  type OrderMessageView,
} from './orders'
import {
  academicLevels,
  assignmentTypes,
  deadlines,
  estimatePrice,
  formattingStyles,
  MAX_ORDER_PAGES,
  MAX_ORDER_SLIDES,
  MAX_ORDER_WORDS,
  orderServiceIds,
  PRESENTATION_TYPE,
} from './pricing'
import { supportNameRequired } from './support-name'

const levelIds = academicLevels.map((l) => l.id) as [string, ...string[]]
const deadlineIds = deadlines.map((d) => d.id) as [string, ...string[]]

const createOrderInput = z.object({
  type: z.enum(assignmentTypes),
  service: z.enum(orderServiceIds).default('writing'),
  language: z.enum(orderLanguageIds).default('en-US'),
  software: z.enum(orderSoftwareIds).nullable().optional(),
  softwareDetails: z.string().trim().max(MAX_SOFTWARE_DETAILS).optional(),
  subject: z.string().trim().min(1).max(80),
  topic: z.string().trim().min(4).max(300),
  level: z.enum(levelIds),
  style: z.enum(formattingStyles),
  sources: z.coerce.number().int().min(0).max(100),
  pages: z.number().int().min(0).max(MAX_ORDER_PAGES),
  wordCount: z.number().int().min(1).max(MAX_ORDER_WORDS).optional(),
  slideCount: z.number().int().min(1).max(MAX_ORDER_SLIDES).optional(),
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
}).refine(
  ({ slideCount, type, pages, wordCount }) => slideCount === undefined
    ? pages >= 1
    : type === PRESENTATION_TYPE && pages === 0 && wordCount === undefined,
  { message: 'Choose a valid page, word or slide count for this assignment.' },
).refine(
  ({ software, softwareDetails }) => software !== 'other' || Boolean(softwareDetails),
  { message: 'Enter the software you need.', path: ['softwareDetails'] },
)

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
      wordCount: data.wordCount,
      slideCount: data.slideCount,
      service: data.service,
      software: data.software,
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
        service: data.service,
        language: data.language,
        software: data.software,
        softwareDetails: data.software === 'other' ? data.softwareDetails : null,
        softwareFeeCents: Math.round(quote.softwareFee * 100),
        subject: data.subject,
        topic: data.topic,
        level: level.label,
        style: data.style,
        sources: data.sources,
        pages: quote.pages,
        wordCount: data.wordCount,
        slideCount: quote.slideCount,
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
      status: z.enum(staffOrderStatuses),
      currentStatus: z.enum(orderStatuses),
      deliveryVersion: z.number().int().nonnegative().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const order = await findAccessibleOrder(data.code, context.user)
    if (!order) throw new Error('Order not found.')
    const { status } = data
    if (status === order.status && status !== 'completed') return { ok: true }
    if (order.status !== data.currentStatus ||
      (data.deliveryVersion !== undefined && data.deliveryVersion !== order.deliveryVersion))
      throw new Error('The order was updated elsewhere. Refresh and try again.')
    if (status === 'cancelled' && !canChangeUnpaidQuote({
      paidAt: order.paidAt,
      checkoutStarted: Boolean(order.paymentReference),
    })) {
      throw new Error('Only unpaid orders with no checkout in progress can be cancelled here.')
    }
    if ((status === 'paid' && !order.paidAt) || (status === 'awaiting-payment' && order.paidAt))
      throw new Error('Choose a status that matches the recorded payment.')

    const fileKind = status === 'completed' ? 'final' : status === 'draft-ready' ? 'paper' : null
    const now = new Date()
    await getDb().transaction(async (tx) => {
      const pendingDelivery = and(
        eq(orderFiles.orderId, order.id),
        inArray(orderFiles.kind, approvalFileKinds),
        isNull(orderFiles.deliveredAt),
      )
      const redelivery = status === 'completed' && order.status === 'completed'
      const pendingFiles = tx.select({ id: orderFiles.id }).from(orderFiles).where(pendingDelivery)
      if (redelivery && !(await pendingFiles.limit(1)).length) return
      const file = fileKind && tx.select({ id: orderFiles.id }).from(orderFiles).where(
        and(eq(orderFiles.orderId, order.id), eq(orderFiles.kind, fileKind)),
      )
      const [updated] = await tx.update(orders)
        .set({
          status,
          updatedAt: now,
          ...(order.status === 'approved' && !order.approvedAt ? { approvedAt: order.updatedAt } : {}),
          ...(status === 'completed'
            ? { deliveredAt: now, deliveryVersion: sql`${orders.deliveryVersion} + 1` }
            : {}),
        })
        .where(and(
          eq(orders.id, order.id),
          eq(orders.status, data.currentStatus),
          eq(orders.deliveryVersion, order.deliveryVersion),
          status === 'paid' ? isNotNull(orders.paidAt) : undefined,
          status === 'cancelled' || status === 'awaiting-payment' ? isNull(orders.paidAt) : undefined,
          status === 'cancelled' ? isNull(orders.paymentReference) : undefined,
          file ? exists(file) : undefined,
        ))
        .returning({ id: orders.id })
      if (!updated) {
        if (file && !(await file.limit(1)).length)
          throw new Error(fileKind === 'final'
            ? 'Upload a final copy before marking this order delivered.'
            : 'Upload a draft before marking this order draft ready.')
        throw new Error('The order was updated elsewhere. Refresh and try again.')
      }
      if (status === 'completed') {
        const [needsPreview] = await tx.select({ id: orderFiles.id })
          .from(orderFiles)
          .where(and(pendingDelivery, isNull(orderFiles.previewBlobKey)))
          .limit(1)
        if (needsPreview) throw new Error('Add a watermarked preview to each new final or soft copy before delivery.')
        await tx.update(orderFiles).set({ deliveredAt: now }).where(pendingDelivery)
      }
      const reopened = order.status === 'cancelled'
      const code = orderCode(order.id)
      await tx.insert(customerNotifications).values({
        userId: order.userId,
        orderId: order.id,
        kind: 'notice',
        title: reopened ? `Order ${code} reopened` : `Order ${code} · ${statusMeta[status].label}`,
        body: status === 'completed'
          ? 'Your final delivery is ready. Open your order to review it. Approve to unlock the clean copy, or request a revision within 14 days.'
          : `The status of your order is now ${statusMeta[status].label.toLowerCase()}.`,
        senderName: context.user.supportName,
      })
    })
    return { ok: true }
  })

const orderDetailsInput = z.object({
  code: z.string().max(20),
  revision: z.number().int().nonnegative(),
  topic: z.string().trim().min(4).max(300),
  subject: z.string().trim().min(1).max(80),
  style: z.string().trim().min(1).max(80),
  sources: z.number().int().min(0).max(100),
  language: z.enum(orderLanguageIds).nullable().optional(),
  software: z.enum(orderSoftwareIds).nullable().optional(),
  softwareDetails: z.string().trim().max(MAX_SOFTWARE_DETAILS).optional(),
  instructions: z.string().trim().max(20000),
  agreedDueAt: z.iso.datetime().nullable(),
})

export const updateStaffOrderDetails = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(orderDetailsInput)
  .handler(async ({ data, context }) => {
    const { code, revision, agreedDueAt, language, software, softwareDetails, ...details } = data
    const order = await findAccessibleOrder(code, context.user)
    if (!order) throw new Error('This order is unavailable.')
    if (order.detailsRevision !== revision)
      throw new Error('This order changed. Refresh it and try again.')
    const nextLanguage = language === undefined ? order.language : language
    const nextSoftware = software === undefined ? order.software : software
    const nextSoftwareDetails = nextSoftware === 'other'
      ? softwareDetails ?? order.softwareDetails
      : null
    if (nextSoftware === 'other' && !nextSoftwareDetails)
      throw new Error('Enter the software needed for this order.')
    const softwareChanged = nextSoftware !== order.software || nextSoftwareDetails !== order.softwareDetails
    if (softwareChanged && !canChangeUnpaidQuote({
      paidAt: order.paidAt,
      checkoutStarted: Boolean(order.paymentReference),
    })) throw new Error('The software selection is locked once checkout starts.')
    const softwareFeeCents = nextSoftware
      ? order.software ? order.softwareFeeCents : SOFTWARE_FEE_CENTS
      : 0
    const deadline = agreedDueAt ? new Date(agreedDueAt) : null
    if (deadline && !Number.isFinite(deadline.getTime()))
      throw new Error('Choose a valid deadline.')
    const changed = [
      details.topic !== order.topic && 'topic',
      details.subject !== order.subject && 'subject',
      details.style !== order.style && 'citation style',
      details.sources !== order.sources && 'source count',
      details.instructions !== order.instructions && 'instructions',
      nextLanguage !== order.language && 'language',
      softwareChanged && 'software requirements',
      deadline?.toISOString() !== order.agreedDueAt?.toISOString() &&
        'agreed deadline',
    ].filter(Boolean)
    if (!changed.length) return { ok: true }

    await getDb().transaction(async (tx) => {
      const [saved] = await tx
        .update(orders)
        .set({
          ...details,
          language: nextLanguage,
          ...(softwareChanged ? {
            software: nextSoftware,
            softwareDetails: nextSoftwareDetails,
            softwareFeeCents,
            priceCents: order.priceCents - order.softwareFeeCents + softwareFeeCents,
          } : {}),
          agreedDueAt: deadline,
          detailsRevision: sql`${orders.detailsRevision} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.detailsRevision, revision),
            softwareChanged ? isNull(orders.paidAt) : undefined,
            softwareChanged ? isNull(orders.paymentReference) : undefined,
          ),
        )
        .returning({ id: orders.id })
      if (!saved)
        throw new Error('This order changed. Refresh it and try again.')
      await tx.insert(orderMessages).values({
        orderId: order.id,
        sender: 'support',
        supportName: context.user.supportName,
        supportUserId: context.user.id,
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
      .select({
        id: orderMessages.id,
        sender: orderMessages.sender,
        supportName: orderMessages.supportName,
        supportAvatarId: staffAvatars.id,
        body: orderMessages.body,
        createdAt: orderMessages.createdAt,
        readAt: orderMessages.readAt,
      })
      .from(orderMessages)
      .leftJoin(staffAvatars, eq(staffAvatars.userId, orderMessages.supportUserId))
      .where(eq(orderMessages.orderId, order.id))
      .orderBy(desc(orderMessages.id))
      .limit(200)
    return rows.reverse().map((m) => ({
      id: m.id,
      sender: m.sender as OrderMessageView['sender'],
      supportName: m.supportName,
      supportAvatarId: m.supportAvatarId,
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
          supportUserId: data.asSupport ? context.user.id : null,
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
  .validator(z.object({ code: z.string().max(20), deliveryVersion: z.number().int().nonnegative() }))
  .handler(async ({ data, context }) => {
    const order = await findAccessibleOrder(data.code, { id: context.user.id, isAdmin: false })
    if (!order) throw new Error('Order not found.')
    if (data.deliveryVersion !== order.deliveryVersion)
      throw new Error('A newer delivery is available. Refresh the order to review it.')
    if (order.status === 'approved') return { ok: true }

    await getDb().transaction(async (tx) => {
      const finalCopy = tx.select({ id: orderFiles.id }).from(orderFiles).where(and(
        eq(orderFiles.orderId, order.id),
        eq(orderFiles.kind, 'final'),
        isNotNull(orderFiles.deliveredAt),
      ))
      const [approved] = await tx.update(orders)
        .set({
          status: 'approved',
          approvedAt: sql`coalesce(${orders.approvedAt}, now())`,
          updatedAt: sql`now()`,
        })
        .where(and(
          eq(orders.id, order.id),
          eq(orders.userId, context.user.id),
          eq(orders.status, 'completed'),
          eq(orders.deliveryVersion, data.deliveryVersion),
          isNotNull(orders.deliveredAt),
          exists(finalCopy),
        ))
        .returning({ id: orders.id })
      if (!approved) {
        const [current] = await tx.select({ status: orders.status, version: orders.deliveryVersion })
          .from(orders).where(and(eq(orders.id, order.id), eq(orders.userId, context.user.id)))
        if (current?.status === 'approved' && current.version === data.deliveryVersion) return
        throw new Error('The delivery changed. Refresh the order and review it before approving.')
      }
      await tx.update(orderFiles).set({ releasedAt: sql`now()` }).where(and(
        eq(orderFiles.orderId, order.id),
        inArray(orderFiles.kind, approvalFileKinds),
        isNotNull(orderFiles.deliveredAt),
        isNull(orderFiles.releasedAt),
      ))
    })
    return { ok: true }
  })

export const requestRevision = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator(
    z.object({
      code: z.string().max(20),
      deliveryVersion: z.number().int().nonnegative(),
      notes: z.string().trim().min(10).max(5000),
    }),
  )
  .handler(async ({ data, context }) => {
    const order = await findAccessibleOrder(data.code, {
      ...context.user,
      isAdmin: false,
    })
    if (!order) throw new Error('Order not found.')
    if (data.deliveryVersion !== order.deliveryVersion)
      throw new Error('A newer delivery is available. Refresh the order to review it.')
    const revisionStatus = customerRevisionStatus(order)
    if (revisionStatus === 'expired')
      throw new Error('The 14-day revision window has ended. Contact support for help.')
    if (revisionStatus === 'unavailable')
      throw new Error('Revisions open once your draft is delivered.')
    const deadline = orderRevisionDeadline(order)
    await getDb().transaction(async (tx) => {
      const [updated] = await tx
        .update(orders)
        .set({
          status: 'revision',
          updatedAt: new Date(),
          ...(order.status === 'approved' && !order.approvedAt ? { approvedAt: order.updatedAt } : {}),
        })
        .where(and(
          eq(orders.id, order.id),
          eq(orders.userId, context.user.id),
          eq(orders.status, order.status),
          eq(orders.deliveryVersion, data.deliveryVersion),
          deadline === null ? undefined : sql`clock_timestamp() < to_timestamp(${deadline / 1000}::double precision)`,
        ))
        .returning({ id: orders.id })
      if (!updated && customerRevisionStatus(order) === 'expired')
        throw new Error('The 14-day revision window has ended. Contact support for help.')
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
