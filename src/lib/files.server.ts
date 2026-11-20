import { createHash } from 'node:crypto'
import { getStore } from '@netlify/blobs'

export function orderFileStore() {
  const connection = process.env.NETLIFY_DB_URL
  if (!connection) throw new Error('File storage is unavailable.')
  // Netlify provides a different database endpoint for deploy preview branches.
  // Use the endpoint, without credentials, to isolate their blob namespaces.
  const database = new URL(connection)
  const scope = createHash('sha256')
    .update(database.host + database.pathname)
    .digest('hex')
    .slice(0, 24)
  return getStore({ name: `order-files-${scope}`, consistency: 'strong' })
}
