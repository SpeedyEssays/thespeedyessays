import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '../../db'
import { orderFiles } from '../../db/schema'
import { requireUser } from './identity.functions'
import { readOrderFile, writeOrderFile } from './files.server'
import { checkOrderFile, fileKinds } from './orders'
import { findAccessibleOrder } from './order-records'

const uploadInput = z.object({
  code: z.string().max(20),
  uploadId: z.uuid(),
  kind: z.enum(fileKinds),
  file: z.file().refine(checkOrderFile, 'Choose a supported file up to 4 MB.'),
})

export const uploadOrderFile = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator((form: FormData) => uploadInput.parse(Object.fromEntries(form)))
  .handler(async ({ data, context }) => {
    const order = await findAccessibleOrder(data.code, context.user)
    if (!order) throw new Error('Order not found.')
    if (order.status === 'cancelled') throw new Error('This order was cancelled.')
    if (data.kind !== 'brief' && (!context.user.isAdmin || !order.paidAt)) {
      throw new Error('Only staff can upload deliverables for paid orders.')
    }
    const blobKey = `${order.id}/${data.kind}/${data.uploadId}`
    const bytes = await data.file.arrayBuffer()
    const saved = await writeOrderFile(blobKey, bytes)
    const name = Array.from(data.file.name, (char) =>
      char < ' ' || char.charCodeAt(0) === 127 ? '_' : char,
    ).join('')
    if (!saved) {
      const existing = await readOrderFile(blobKey)
      if (!existing || !Buffer.from(existing).equals(Buffer.from(bytes))) {
        throw new Error('This upload was already used for a different file. Select it again.')
      }
    }
    await getDb()
      .insert(orderFiles)
      .values({
        orderId: order.id,
        kind: data.kind,
        name,
        size: data.file.size,
        contentType: 'application/octet-stream',
        blobKey,
      })
      .onConflictDoNothing({ target: orderFiles.blobKey })
    return { ok: true }
  })
