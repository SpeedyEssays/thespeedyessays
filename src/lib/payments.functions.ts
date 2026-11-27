import { randomUUID } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import { orderFiles, orders } from '../../db/schema'
import { requireCustomer } from './identity.functions'
import { findAccessibleOrder } from './order-records'
import { canCheckout, orderCode } from './orders'
import {
  initializePaystackCheckout,
  paymentReferenceSchema,
  paystackConfig,
  reconcilePayment,
} from './payments.server'

export const isCheckoutAvailable = createServerFn({ method: 'GET' }).handler(() => !!paystackConfig())

export const startCheckout = createServerFn({ method: 'POST' })
  .middleware([requireCustomer])
  .validator(z.object({ code: z.string().max(20) }))
  .handler(async ({ data, context }) => {
    const config = paystackConfig()
    if (!config)
      throw new Error('Online checkout is unavailable right now. Your order is saved.')
    const customer = { ...context.user, isAdmin: false }
    const order = await findAccessibleOrder(data.code, customer)
    if (!order) throw new Error('Order not found.')
    const callback = new URL('/dashboard', config.origin)
    callback.searchParams.set('order', orderCode(order.id))
    if (order.paidAt) return { url: callback.href }
    if (!canCheckout(order)) throw new Error('This order is no longer eligible for payment.')
    const db = getDb()
    if (order.instructions.length < 20) {
      const [brief] = await db
        .select({ id: orderFiles.id })
        .from(orderFiles)
        .where(and(eq(orderFiles.orderId, order.id), eq(orderFiles.kind, 'brief')))
        .limit(1)
      if (!brief) throw new Error('Upload your brief in the dashboard before paying.')
    }
    if (order.paymentUrl && order.paymentReference) {
      // Reopen the same transaction so a retry cannot create a second charge.
      const paid = await reconcilePayment(order.paymentReference)
      return { url: paid ? callback.href : order.paymentUrl }
    }
    const reference = order.paymentReference ?? `se-${randomUUID()}`
    if (!order.paymentReference) {
      const [reserved] = await db
        .update(orders)
        .set({ paymentReference: reference, paymentMethod: 'paystack' })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.priceCents, order.priceCents),
            ne(orders.status, 'cancelled'),
            isNull(orders.paidAt),
            isNull(orders.paymentReference),
          ),
        )
        .returning({ id: orders.id })
      if (!reserved) throw new Error('The order changed while opening checkout. Refresh and try again.')
    }
    const cancel = new URL(callback)
    cancel.searchParams.set('paymentExit', 'closed')
    try {
      const url = await initializePaystackCheckout(
        config.key,
        {
          email: order.clientEmail,
          amount: order.priceCents,
          reference,
          callback_url: callback.href,
        },
        cancel.href,
      )
      await db
        .update(orders)
        .set({ paymentUrl: url })
        .where(and(eq(orders.id, order.id), eq(orders.paymentReference, reference)))
      return { url }
    } catch {
      const current = await findAccessibleOrder(data.code, customer)
      if (current?.paidAt) return { url: callback.href }
      if (current?.paymentUrl) return { url: current.paymentUrl }
      // Keep this reference on uncertain failures so a retry cannot charge another transaction.
      throw new Error('Couldn’t open checkout. Your order is saved.')
    }
  })

export const refreshPayment = createServerFn({ method: 'POST' })
  .middleware([requireCustomer])
  .validator(
    z.union([z.object({ reference: paymentReferenceSchema }), z.object({ code: z.string().max(20) })]),
  )
  .handler(async ({ data, context }) => {
    const user = { ...context.user, isAdmin: false }
    const order =
      'code' in data
        ? await findAccessibleOrder(data.code, user)
        : (
            await getDb()
              .select()
              .from(orders)
              .where(and(eq(orders.paymentReference, data.reference), eq(orders.userId, user.id)))
          )[0]
    if (!order?.paymentReference) return { paid: false }
    return { paid: await reconcilePayment(order.paymentReference) }
  })
