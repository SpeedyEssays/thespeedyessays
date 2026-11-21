import { createHash } from 'node:crypto'
import { getStore } from '@netlify/blobs'
import { createClient } from '@supabase/supabase-js'
import { supabaseConfig, useSupabase } from './supabase-config'

function netlifyStore() {
  const connection = process.env.NETLIFY_DB_URL
  if (!connection) throw new Error('File storage is unavailable.')
  // A preview database has a separate blob namespace from production.
  const database = new URL(connection)
  const scope = createHash('sha256')
    .update(database.host + database.pathname)
    .digest('hex')
    .slice(0, 24)
  return getStore({ name: `order-files-${scope}`, consistency: 'strong' })
}

function privateBucket() {
  const { url } = supabaseConfig()
  const key = process.env.SUPABASE_STORAGE_SECRET_KEY
  if (!key) throw new Error('Private file storage is not configured.')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from('order-files')
}

async function getPrivateBlob(key: string) {
  const { data, error } = await privateBucket().download(key)
  if (error && !['404', 'NoSuchKey', 'not_found'].includes(error.statusCode ?? '')) {
    throw new Error('The file could not be read.')
  }
  return data
}

export async function writeOrderFile(key: string, bytes: ArrayBuffer) {
  if (!useSupabase) return (await netlifyStore().set(key, bytes, { onlyIfNew: true })).modified
  const { error } = await privateBucket().upload(key, bytes, {
    contentType: 'application/octet-stream',
    upsert: false,
  })
  if (!error) return true
  if (error.statusCode === '409' || ('error' in error && error.error === 'Duplicate')) return false
  throw new Error('The file could not be saved.')
}

export async function readOrderFile(key: string) {
  if (!useSupabase) return netlifyStore().get(key, { type: 'arrayBuffer' })
  return (await getPrivateBlob(key))?.arrayBuffer() ?? null
}

export async function streamOrderFile(key: string) {
  if (!useSupabase) return netlifyStore().get(key, { type: 'stream' })
  return (await getPrivateBlob(key))?.stream() ?? null
}
