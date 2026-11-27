import { createHash } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import { orderFiles, orderMessages, orders } from '../../db/schema'
import { requireAdmin, requireUser } from './identity.functions'
import { readOrderFile, writeOrderFile } from './files.server'
import { checkOrderFile, fileKinds, fileRequiresApproval, MAX_FILE_BYTES, staffFileKinds } from './orders'
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
    const staff = context.user.isAdmin
    if (staff && order.status === 'cancelled') throw new Error('This order was cancelled.')
    if (staff && data.kind === 'brief') throw new Error('Choose a staff delivery type.')
    if (!staff && data.kind !== 'brief') {
      throw new Error('Only staff can upload deliverables.')
    }
    if (data.kind === 'speaker-notes' && !/\.docx$/i.test(data.file.name)) {
      throw new Error('Upload speaker notes as a Word (.docx) document.')
    }
    const needsPreview = fileRequiresApproval(data.kind)
    if (needsPreview && !data.preview) {
      throw new Error('Prepare a watermarked PDF preview before uploading this file.')
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
      if (!current || (staff && current.status === 'cancelled')) throw new Error('This order is unavailable.')
      const [attachment] = await tx.insert(orderFiles)
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
        .returning()
      if (attachment) {
        await tx.update(orders).set({ filesRevision: sql`${orders.filesRevision} + 1` })
          .where(eq(orders.id, order.id))
        if (!staff) {
          await tx.insert(orderMessages).values({
            orderId: order.id,
            sender: 'client',
            fileUploaded: true,
            body: `New file uploaded\n${name}`,
          })
        }
      }
    })
    return { ok: true }
  })

export const removeStaffFile = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(z.object({ fileId: z.number().int().positive().max(2147483647) }))
  .handler(async ({ data, context }) => {
    await getDb().transaction(async (tx) => {
      const staffFile = and(eq(orderFiles.id, data.fileId), inArray(orderFiles.kind, staffFileKinds))
      const [file] = await tx.select({ orderId: orderFiles.orderId }).from(orderFiles).where(staffFile)
      if (!file) throw new Error('Staff file not found.')
      const [order] = await tx.select({ status: orders.status }).from(orders)
        .where(eq(orders.id, file.orderId)).for('update')
      if (!order) throw new Error('Order not found.')
      const [removed] = await tx.update(orderFiles)
        .set({ removedAt: new Date(), removedBy: context.user.id })
        .where(and(staffFile, isNull(orderFiles.removedAt)))
        .returning({ deliveredAt: orderFiles.deliveredAt, kind: orderFiles.kind })
      if (removed) {
        const changedDelivery = removed.deliveredAt && order.status === 'completed' && fileRequiresApproval(removed.kind)
        await tx.update(orders).set({
          filesRevision: sql`${orders.filesRevision} + 1`,
          ...(changedDelivery ? { deliveryVersion: sql`${orders.deliveryVersion} + 1` } : {}),
        })
          .where(eq(orders.id, file.orderId))
      }
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
    const [file] = await db.select().from(orderFiles)
      .where(and(eq(orderFiles.id, data.fileId), isNull(orderFiles.removedAt)))
    if (!file || !fileRequiresApproval(file.kind)) throw new Error('Final copy not found.')
    if (file.previewBlobKey) return { ok: true }
    const bytes = await readPreview(data.preview)
    const digest = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
    const key = `${file.blobKey}.preview-${digest.slice(0, 24)}.pdf`
    await storeFile(key, bytes)
    await db.update(orderFiles).set({ previewBlobKey: key })
      .where(and(eq(orderFiles.id, file.id), isNull(orderFiles.previewBlobKey), isNull(orderFiles.removedAt)))
    return { ok: true }
  })
