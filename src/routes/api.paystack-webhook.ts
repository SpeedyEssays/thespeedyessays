import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { paymentReferenceSchema, reconcilePayment, verifyPaystackSignature } from '@/lib/payments.server'

const successfulCharge = z.object({
  event: z.literal('charge.success'),
  data: z.object({ reference: paymentReferenceSchema }),
})

export const Route = createFileRoute('/api/paystack-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = Buffer.from(await request.arrayBuffer())
        if (body.length > 65536 || !verifyPaystackSignature(request.headers, body))
          return new Response(null, { status: 401 })
        let payload: unknown
        try {
          payload = JSON.parse(body.toString('utf8'))
        } catch {
          return new Response(null, { status: 400 })
        }
        const event = successfulCharge.safeParse(payload)
        if (!event.success) return new Response(null, { status: 200 })
        try {
          await reconcilePayment(event.data.data.reference, true)
          return new Response(null, { status: 200 })
        } catch {
          return new Response(null, { status: 503 })
        }
      },
    },
  },
})
