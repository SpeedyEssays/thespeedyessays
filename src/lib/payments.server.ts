import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import { orderFiles, orders } from '../../db/schema'

export const currency = 'USD'
export const paymentReferenceSchema = z.string().regex(/^se-[0-9a-f-]{36}$/)

export class PaystackRequestError extends Error {
  constructor(
    readonly status: number,
    readonly reason: 'currency' | 'credentials' | 'channels' | 'unknown',
  ) {
    super(
      'The payment provider could not complete this request. Try again or contact support.',
    )
  }
}

export function paystackConfig() {
  const key = process.env.PAYSTACK_SECRET_KEY
  const origin = process.env.PAYSTACK_CALLBACK_ORIGIN || process.env.SITE_ORIGIN
  if (!key?.startsWith('sk_live_') || !origin || !URL.canParse(origin))
    return null
  const url = new URL(origin)
  if (url.protocol !== 'https:' || url.origin !== origin) {
    return null
  }
  return { key, origin }
}

export async function requireOrderPaymentBrief(
  db: Pick<ReturnType<typeof getDb>, 'select'>,
  order: Pick<typeof orders.$inferSelect, 'id' | 'instructions'>,
) {
  if (order.instructions.length >= 20) return
  const [brief] = await db.select({ id: orderFiles.id })
    .from(orderFiles)
    .where(and(eq(orderFiles.orderId, order.id), eq(orderFiles.kind, 'brief')))
    .limit(1)
  if (!brief) throw new Error('Upload your brief in the dashboard before paying.')
}

export async function paystackRequest(
  path: string,
  key: string,
  body?: object,
) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  })
  const result = z
    .object({
      status: z.boolean(),
      data: z.unknown().optional(),
      code: z.string().nullish(),
      message: z.string().nullish(),
    })
    .safeParse(await response.json().catch(() => null))
  if (!response.ok || !result.success || !result.data.status) {
    const detail = result.success
      ? [result.data.code, result.data.message].join(' ')
      : ''
    let reason: PaystackRequestError['reason'] = 'unknown'
    if (
      /currency.{0,48}not[ _](?:currently[ _])?(?:supported|enabled)|unsupported[ _]currency/i.test(
        detail,
      )
    ) {
      reason = 'currency'
    } else if (
      response.status === 401 ||
      /invalid[ _](?:authorization[ _]|secret[ _]|api[ _])?key/i.test(detail)
    ) {
      reason = 'credentials'
    } else if (/no[ _]active[ _](?:payment[ _])?channels?/i.test(detail)) {
      reason = 'channels'
    }
    throw new PaystackRequestError(response.status, reason)
  }
  return result.data.data
}

export async function initializePaystackCheckout(
  key: string,
  input: {
    email: string
    amount: number
    reference: string
    callback_url: string
  },
  cancelUrl = input.callback_url,
) {
  const result = z
    .object({
      authorization_url: z.url(),
      reference: z.literal(input.reference),
    })
    .parse(
      await paystackRequest('/transaction/initialize', key, {
        ...input,
        currency,
        metadata: { cancel_action: cancelUrl },
      }),
    )
  if (
    new URL(result.authorization_url).origin !== 'https://checkout.paystack.com'
  ) {
    throw new Error(
      'The payment provider returned an invalid checkout address.',
    )
  }
  return result.authorization_url
}

export async function reconcilePayment(
  reference: string,
  requireSuccess = false,
) {
  const config = paystackConfig()
  if (!config) throw new Error('Checkout is unavailable.')
  const db = getDb()
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentReference, reference))
  if (!order) return false
  if (order.paidAt) return true
  if (!await verifyUSDCharge(config.key, reference, order.priceCents, requireSuccess)) return false
  const now = new Date()
  // A checkout can settle just after cancellation. Record its payment so the
  // customer can request a refund, while leaving the order cancelled.
  const [recorded] = await db
    .update(orders)
    .set({
      status: sql`case when ${orders.status} = 'awaiting-payment' then 'in-progress' else ${orders.status} end`,
      paidAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(orders.id, order.id),
        eq(orders.paymentReference, reference),
        eq(orders.priceCents, order.priceCents),
        isNull(orders.paidAt),
      ),
    )
    .returning({ id: orders.id })
  if (recorded) return true
  const [current] = await db
    .select({ paidAt: orders.paidAt })
    .from(orders)
    .where(and(eq(orders.id, order.id), eq(orders.paymentReference, reference)))
  return Boolean(current?.paidAt)
}

export async function verifyUSDCharge(
  key: string, reference: string, amountCents: number, requireSuccess = false,
) {
  const result = z
    .object({
      domain: z.literal('live'),
      reference: z.string(),
      amount: z.number().int(),
      currency: z.string(),
      status: z.string(),
    })
    .parse(
      await paystackRequest(
        `/transaction/verify/${encodeURIComponent(reference)}`,
        key,
      ),
    )
  if (result.status !== 'success') {
    if (requireSuccess)
      throw new Error('Payment confirmation is still pending.')
    return false
  }
  if (
    result.reference !== reference ||
    result.amount !== amountCents ||
    result.currency !== currency
  ) {
    throw new Error('The payment does not match the order.')
  }
  return true
}

export async function verifyPaystackRefund(id: string, reference: string, paidCents: number) {
  const config = paystackConfig()
  if (!config) throw new Error('Paystack is unavailable. Try verifying the refund again later.')
  const [refundData, chargeData] = await Promise.all([
    paystackRequest(`/refund/${encodeURIComponent(id)}`, config.key),
    paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, config.key),
  ])
  const refund = z.object({
    id: z.number().int().positive(), transaction: z.number().int().positive(),
    domain: z.literal('live'), currency: z.literal(currency),
    amount: z.number().int().positive(), status: z.string(),
  }).safeParse(refundData).data
  const charge = z.object({
    id: z.number().int().positive(), reference: z.literal(reference),
    domain: z.literal('live'), currency: z.literal(currency), amount: z.literal(paidCents),
  }).safeParse(chargeData).data
  if (!refund || !charge || String(refund.id) !== id || refund.transaction !== charge.id)
    throw new Error('That refund does not match this order’s payment.')
  if (refund.status !== 'processed')
    throw new Error('Paystack has not confirmed the refund as processed yet.')
  return { id: String(refund.id), amountCents: refund.amount }
}

function matchesSignature(expected: Buffer, value: string) {
  return /^[a-f0-9]{128}$/i.test(value) && timingSafeEqual(expected, Buffer.from(value, 'hex'))
}

export function verifyPaystackSignature(headers: Headers, body: Buffer, now = Date.now()) {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET
  if (secret) {
    const fields = new URLSearchParams(
      (headers.get('paystack-signature') ?? '')
        .split(',')
        .map((part) => part.trim())
        .join('&'),
    )
    const timestamps = fields.getAll('t')
    const timestamp = timestamps[0]
    if (timestamps.length !== 1 || !/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300)
      return false
    const expected = createHmac('sha512', secret).update(`${timestamp}.`).update(body).digest()
    return fields.getAll('v1').some((entry) => matchesSignature(expected, entry.split(':')[1] ?? ''))
  }
  const key = process.env.PAYSTACK_SECRET_KEY
  const signature = headers.get('x-paystack-signature')
  return !!key && !!signature && matchesSignature(createHmac('sha512', key).update(body).digest(), signature)
}
