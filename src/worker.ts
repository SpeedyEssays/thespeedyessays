import app from "@tanstack/react-start/server-entry";
import { withWorkerDatabase } from "../db";
import { receiveAuthEmail } from "./lib/auth-email.server";

export { AuthEmailDelivery } from "./lib/auth-email-delivery.server";

type Environment = {
  HYPERDRIVE?: { connectionString: string };
  DATABASE_URL?: string;
  REUSE_DATABASE_CONNECTIONS?: boolean;
  AUTH_EMAIL_DELIVERY?: {
    getByName(id: string): { fetch(request: Request): Promise<Response> };
  };
};

export default {
  fetch(request: Request, env: Environment) {
    if (new URL(request.url).pathname === "/api/auth-email") {
      const delivery = env.AUTH_EMAIL_DELIVERY;
      return receiveAuthEmail(
        request,
        delivery &&
          (async (id, messages) => {
            const saved = await delivery.getByName(id).fetch(
              new Request("https://auth-email.internal/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(messages),
              }),
            );
            if (!saved.ok)
              throw new Error("Account email could not be queued.");
          }),
      );
    }
    return withWorkerDatabase(
      env.HYPERDRIVE?.connectionString ?? env.DATABASE_URL,
      async () => app.fetch(request),
      env.REUSE_DATABASE_CONNECTIONS === true,
    );
  },
};
