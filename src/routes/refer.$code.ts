import { createFileRoute } from "@tanstack/react-router";
import { setCookie } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { walletAccounts } from "../../db/schema";
import { referralCookie } from "@/lib/wallet";

export const Route = createFileRoute("/refer/$code")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const destination = new URL("/account?signup=true", request.url);
        const code = z.uuid().safeParse(params.code).data;
        if (code) {
          const [referrer] = await getDb()
            .select({ userId: walletAccounts.userId })
            .from(walletAccounts)
            .where(eq(walletAccounts.referralCode, code));
          if (referrer) {
            destination.searchParams.set("ref", code);
            setCookie(referralCookie, code, {
              httpOnly: true,
              sameSite: "lax",
              secure: destination.protocol === "https:",
              path: "/",
              maxAge: 30 * 24 * 60 * 60,
            });
          }
        }
        return new Response(null, {
          status: 302,
          headers: {
            Location: destination.href,
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});
