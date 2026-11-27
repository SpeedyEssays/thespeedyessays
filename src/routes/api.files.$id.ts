import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { orderFiles, orders } from '../../db/schema'
import { streamOrderFile } from '@/lib/files.server'
import { customerFileAccess } from '@/lib/orders'
import { readSessionUser } from '@/lib/session.server'

function fileNotFound() {
  return new Response('File not found.', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store' },
  })
}

export async function serveOrderFile(request: Request, fileId: string) {
  const user = await readSessionUser()
  const id = Number(fileId)
  if (!user || !/^[1-9]\d*$/.test(fileId) || id > 2147483647) return fileNotFound()

  const [record] = await getDb()
    .select({ file: orderFiles, owner: orders.userId })
    .from(orderFiles)
    .innerJoin(orders, eq(orderFiles.orderId, orders.id))
    .where(eq(orderFiles.id, id))
  if (!record || record.file.removedAt || (!user.isAdmin && record.owner !== user.id)) return fileNotFound()

  const { file } = record
  const access = user.isAdmin ? 'original' : customerFileAccess(file)
  if (access === 'pending' || access === 'locked') return fileNotFound()

  const inline = new URL(request.url).searchParams.get('preview') === '1'
  const preview = inline || access === 'preview'
  const key = preview ? file.previewBlobKey : file.blobKey
  if (!key) return fileNotFound()
  const stream = await streamOrderFile(key)
  if (!stream) return fileNotFound()

  const name = preview ? `${file.name.replace(/\.[^.]+$/, '')}-preview.pdf` : file.name
  const filename = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16)}`)
  const disposition = inline ? 'inline' : 'attachment'
  return new Response(stream, {
    headers: {
      'Content-Type': preview ? 'application/pdf' : 'application/octet-stream',
      'Content-Disposition': `${disposition}; filename*=UTF-8''${filename}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export const Route = createFileRoute('/api/files/$id')({
  server: {
    handlers: {
      GET: ({ request, params }) => serveOrderFile(request, params.id),
    },
  },
})
