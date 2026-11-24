import app from "@tanstack/react-start/server-entry";
import { withWorkerDatabase } from "../db";
import {
  deliverAuthEmails,
  receiveAuthEmail,
  type AuthEmailJob,
} from "./lib/auth-email.server";

type Environment = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  REUSE_DATABASE_CONNECTIONS?: boolean;
  AUTH_EMAIL_QUEUE?: {
    sendBatch(messages: { body: AuthEmailJob }[]): Promise<void>;
  };
};

export default {
  fetch(request: Request, env: Environment) {
    if (new URL(request.url).pathname === "/api/auth-email") {
      return receiveAuthEmail(request, env.AUTH_EMAIL_QUEUE);
    }
    return withWorkerDatabase(
      env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL,
      async () => app.fetch(request),
      env.REUSE_DATABASE_CONNECTIONS === true,
    );
  },
  queue(batch: { messages: Parameters<typeof deliverAuthEmails>[0] }) {
    return deliverAuthEmails(batch.messages);
  },
};
