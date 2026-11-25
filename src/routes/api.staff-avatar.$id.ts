import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../../db";
import { staffAvatars } from "../../db/schema";

export const Route = createFileRoute("/api/staff-avatar/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = z.uuid().safeParse(params.id);
        if (id.success) {
          const [avatar] = await getDb()
            .select({ jpeg: staffAvatars.jpeg })
            .from(staffAvatars)
            .where(eq(staffAvatars.id, id.data));
          if (avatar) {
            return new Response(Uint8Array.from(avatar.jpeg), {
              headers: {
                "Content-Type": "image/jpeg",
                "Cache-Control": "private, max-age=300",
                "Cross-Origin-Resource-Policy": "same-origin",
                "X-Content-Type-Options": "nosniff",
              },
            });
          }
        }
        return new Response(null, {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      },
    },
  },
});
