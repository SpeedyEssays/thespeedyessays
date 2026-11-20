import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle as drizzleNetlify } from 'drizzle-orm/netlify-db'
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

function connectNetlify() {
  return drizzleNetlify({ schema })
}

let netlify: ReturnType<typeof connectNetlify> | undefined
type Database = ReturnType<typeof connectNetlify> | ReturnType<typeof connectPostgres>

function connectPostgres(pool: Pool) {
  return drizzlePostgres({ client: pool, schema })
}

type WorkerRequest = { connectionString?: string; reuseConnections: boolean; pool?: Pool; db?: Database }
let sharedPostgres: ReturnType<typeof connectPostgres> | undefined
const workerRequest = new AsyncLocalStorage<WorkerRequest>()

export function withWorkerDatabase<T>(
  connectionString: string | undefined,
  run: () => Promise<T>,
  reuseConnections = false,
) {
  return workerRequest.run({ connectionString, reuseConnections }, async () => {
    try {
      return await run()
    } finally {
      await workerRequest.getStore()?.pool?.end()
    }
  })
}

export function getDb(): Database {
  const request = workerRequest.getStore()
  if (!request) return (netlify ??= connectNetlify())
  if (!request.connectionString) throw new Error('A database connection has not been configured.')
  if (request.reuseConnections) {
    if (!sharedPostgres) {
      const pool = new Pool({
        connectionString: request.connectionString,
        max: 4,
        connectionTimeoutMillis: 8000,
      })
      pool.on('error', () => console.warn('An idle database connection closed.'))
      sharedPostgres = connectPostgres(pool)
    }
    return sharedPostgres
  }
  request.pool ??= new Pool({ connectionString: request.connectionString, max: 1 })
  return (request.db ??= connectPostgres(request.pool))
}
