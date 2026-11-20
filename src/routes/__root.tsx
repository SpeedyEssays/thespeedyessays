import { useEffect } from 'react'
import { HeadContent, Scripts, createRootRoute, useLocation } from '@tanstack/react-router'

import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { NotFoundPage } from '@/components/error-pages'
import { ChatWidget } from '@/components/chat-widget'

import { useSupabase } from '@/lib/supabase-config'

import '../styles.css'

const siteName = 'SpeedyEssays — Expert Academic Writing Help'
const siteDescription = 'Custom academic papers from vetted degree-holding writers. Instant pricing, free plagiarism reports, free revisions, and a money-back guarantee.'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: siteName,
      },
      {
        name: 'description',
        content: siteDescription,
      },
      {
        property: 'og:title',
        content: siteName,
      },
      {
        property: 'og:description',
        content: siteDescription,
      },
      {
        property: 'og:type',
        content: 'website',
      },
      {
        name: 'twitter:card',
        content: 'summary_large_image',
      },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Instrument+Sans:wght@400;500;600;700&display=swap',
      },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFoundPage,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const showPublicChat = useLocation({
    select: ({ pathname, search }) =>
      pathname !== '/admin' && pathname !== '/dashboard' &&
      !(pathname === '/account' && 'next' in search && typeof search.next === 'string' && /^\/admin(?:\?|$)/.test(search.next)),
  })
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <IdentityEmailRedirect />
        {showPublicChat && <ChatWidget />}
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}

function IdentityEmailRedirect() {
  useEffect(() => {
    const { pathname, hash } = window.location
    if (['/order', '/dashboard', '/admin'].includes(pathname)) {
      void import('@/lib/account-client').then(({ refreshBrowserSession }) => refreshBrowserSession()).catch(() => {})
    }
    if (useSupabase || pathname === '/account') return
    const params = new URLSearchParams(hash.slice(1))
    if (['confirmation_token', 'recovery_token', 'invite_token', 'email_change_token', 'access_token'].some((key) => params.has(key))) {
      window.location.replace(`/account${hash}`)
    }
  }, [])

  return null
}
