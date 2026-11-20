import app from '@tanstack/react-start/server-entry'
import { withWorkerDatabase } from '../db'

type Environment = { HYPERDRIVE?: { connectionString: string }; DATABASE_URL?: string }

export default {
  fetch(request: Request, env: Environment) {
    return withWorkerDatabase(env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL, async () => app.fetch(request))
  },
}
