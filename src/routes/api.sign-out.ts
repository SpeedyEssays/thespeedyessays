import { createFileRoute } from '@tanstack/react-router'
import { signOutBrowserSession } from '@/lib/session.server'
import { useSupabase } from '@/lib/supabase-config'

export const Route = createFileRoute('/api/sign-out')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const headers = { 'Cache-Control': 'private, no-store' }
        if (!useSupabase) return new Response(null, { status: 404, headers })
        if (request.headers.get('origin') !== new URL(request.url).origin) {
          return new Response(null, { status: 403, headers })
        }
        try {
          await signOutBrowserSession()
        } catch {
          // The browser cookies are cleared even if the upstream revoke fails.
        }
        return new Response(null, {
          status: 303,
          headers: { ...headers, Location: '/' },
        })
      },
    },
  },
})
