import { createHash } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import { orderFiles, orders } from '../../db/schema'
import { requireAdmin, requireUser } from './identity.functions'
import { readOrderFile, writeOrderFile } from './files.server'
import { checkOrderFile, fileKinds, fileRequiresApproval, MAX_FILE_BYTES } from './orders'
import { findAccessibleOrder } from './order-records'

const previewInput = z.file().refine(
  (file) => file.type === 'application/pdf' && file.size > 5 && file.size <= MAX_FILE_BYTES,
  'Choose a PDF preview no larger than 4 MB.',
)

const uploadInput = z.object({
  code: z.string().max(20),
  uploadId: z.uuid(),
  kind: z.enum(fileKinds),
  file: z.file().refine(checkOrderFile, 'Choose a supported file up to 4 MB.'),
  preview: previewInput.optional(),
})

async function readPreview(file: File) {
  const bytes = await file.arrayBuffer()
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-')
    throw new Error('The preview could not be saved. Choose a valid PDF.')
  return bytes
}

async function storeFile(key: string, bytes: ArrayBuffer) {
  if (await writeOrderFile(key, bytes)) return
  const existing = await readOrderFile(key)
  if (!existing || !Buffer.from(existing).equals(Buffer.from(bytes)))
    throw new Error('This upload was already used for a different file. Select it again.')
}

export const uploadOrderFile = createServerFn({ method: 'POST' })
  .middleware([requireUser])
  .validator((form: FormData) => uploadInput.parse(Object.fromEntries(form)))
  .handler(async ({ data, context }) => {
    const order = await findAccessibleOrder(data.code, context.user)
    if (!order) throw new Error('Order not found.')
    if (order.status === 'cancelled')
      throw new Error('This order was cancelled.')
    if (data.kind !== 'brief' && !context.user.isAdmin) {
      throw new Error('Only staff can upload deliverables.')
    }
    const needsPreview = fileRequiresApproval(data.kind)
    if (needsPreview && !data.preview) {
      throw new Error('Prepare a watermarked PDF preview before uploading this file.')
    }
    if (
      !context.user.isAdmin &&
      ['completed', 'approved'].includes(order.status)
    ) {
      throw new Error('Message support to add files to a delivered order.')
    }
    const blobKey = `${order.id}/${data.kind}/${data.uploadId}`
    const previewBlobKey = needsPreview ? `${blobKey}.preview.pdf` : null
    const preview = previewBlobKey && data.preview ? await readPreview(data.preview) : null
    const bytes = await data.file.arrayBuffer()
    await storeFile(blobKey, bytes)
    if (previewBlobKey && preview) await storeFile(previewBlobKey, preview)
    const name = Array.from(data.file.name, (char) =>
      char < ' ' || char.charCodeAt(0) === 127 ? '_' : char,
    ).join('')
    await getDb().transaction(async (tx) => {
      // Serialize the attachment with delivery so it belongs to one delivery version.
      const [current] = await tx.select({ status: orders.status }).from(orders)
        .where(eq(orders.id, order.id)).for('update')
      if (!current || current.status === 'cancelled') throw new Error('This order is unavailable.')
      if (!context.user.isAdmin && ['completed', 'approved'].includes(current.status))
        throw new Error('Message support to add files to a delivered order.')
      await tx.insert(orderFiles)
        .values({
          orderId: order.id,
          kind: data.kind,
          name,
          size: data.file.size,
          contentType: 'application/octet-stream',
          blobKey,
          previewBlobKey,
        })
        .onConflictDoNothing({ target: orderFiles.blobKey })
    })
    return { ok: true }
  })

export const addOrderFilePreview = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator((form: FormData) => z.object({
    fileId: z.coerce.number().int().min(1).max(2147483647),
    preview: previewInput,
  }).parse(Object.fromEntries(form)))
  .handler(async ({ data }) => {
    const db = getDb()
    const [file] = await db.select().from(orderFiles).where(eq(orderFiles.id, data.fileId))
    if (!file || !fileRequiresApproval(file.kind)) throw new Error('Final copy not found.')
    if (file.previewBlobKey) return { ok: true }
    const bytes = await readPreview(data.preview)
    const digest = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
    const key = `${file.blobKey}.preview-${digest.slice(0, 24)}.pdf`
    await storeFile(key, bytes)
    await db.update(orderFiles).set({ previewBlobKey: key })
      .where(and(eq(orderFiles.id, file.id), isNull(orderFiles.previewBlobKey)))
    return { ok: true }
  })
