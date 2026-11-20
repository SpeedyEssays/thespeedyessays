import { createFileRoute } from '@tanstack/react-router'
import { getUser } from '@netlify/identity'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { orderFiles, orders } from '../../db/schema'
import { orderFileStore } from '@/lib/files.server'
import { isAdmin } from '@/lib/identity.functions'

function fileNotFound() {
  return new Response('File not found.', { status: 404, headers: { 'Cache-Control': 'private, no-store' } })
}

export const Route = createFileRoute('/api/files/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const user = await getUser()
        const id = Number(params.id)
        if (!user || !/^[1-9]\d*$/.test(params.id) || id > 2147483647) {
          return fileNotFound()
        }
        const [record] = await getDb()
          .select({ file: orderFiles, owner: orders.userId, deliveredAt: orders.deliveredAt })
          .from(orderFiles)
          .innerJoin(orders, eq(orderFiles.orderId, orders.id))
          .where(eq(orderFiles.id, id))
        if (
          !record ||
          (!isAdmin(user) &&
            (record.owner !== user.id || (record.file.kind === 'final' && !record.deliveredAt)))
        ) {
          return fileNotFound()
        }
        const stream = await orderFileStore().get(record.file.blobKey, { type: 'stream' })
        if (!stream) return fileNotFound()
        const filename = encodeURIComponent(record.file.name).replace(
          /['()*]/g,
          (c) => `%${c.charCodeAt(0).toString(16)}`,
        )
        return new Response(stream, {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        })
      },
    },
  },
})
