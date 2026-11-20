import { drizzle } from 'drizzle-orm/netlify-db'
import * as schema from './schema'

const connect = () => drizzle({ schema })
let connection: ReturnType<typeof connect> | undefined

export function getDb() {
  return (connection ??= connect())
}
