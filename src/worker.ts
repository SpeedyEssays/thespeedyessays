import app from '@tanstack/react-start/server-entry'
import { withWorkerDatabase } from '../db'

type Environment = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string; REUSE_DATABASE_CONNECTIONS?: boolean }

export default {
  fetch(request: Request, env: Environment) {
    return withWorkerDatabase(
      env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL,
      async () => app.fetch(request),
      env.REUSE_DATABASE_CONNECTIONS === true,
    )
  },
}
