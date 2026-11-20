import type { ReactNode } from 'react'
import { Logo } from '@/components/site/site-header'
import { SignOut } from '@/components/sign-out'

export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-content items-center justify-between px-4 sm:px-6">
          <Logo />
          <SignOut />
        </div>
      </header>
      <main className="mx-auto max-w-content px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  )
}
