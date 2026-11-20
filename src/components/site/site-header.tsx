import { Link } from '@tanstack/react-router'
import { Menu, PenLine } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

function NavLinks({ className }: { className?: string }) {
  return (
    <>
      <Link to="/" hash="pricing" className={className}>Pricing</Link>
      <Link to="/samples" className={className}>Samples</Link>
      <Link to="/" hash="reviews" className={className}>Reviews</Link>
      <Link to="/policies/$slug" params={{ slug: 'money-back-guarantee' }} className={className}>Guarantees</Link>
    </>
  )
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
      <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
        <PenLine className="size-4" />
      </span>
      Speedy<span className="italic opacity-70">Essays</span>
    </Link>
  )
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-content items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex">
          <NavLinks className="text-muted-foreground transition-colors hover:text-foreground motion-reduce:transition-none" />
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Button variant="ghost" asChild>
            <Link to="/dashboard">Sign in</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/account" search={{ signup: true }}>Sign up</Link>
          </Button>
          <Button asChild>
            <Link to="/order">Order now</Link>
          </Button>
        </div>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="p-6">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription className="sr-only">Site navigation</SheetDescription>
            <nav className="mt-4 flex flex-col gap-4 text-base font-medium">
              <NavLinks />
              <Link to="/dashboard">Client dashboard</Link>
              <Link to="/account" search={{ signup: true }}>Sign up</Link>
              <Button asChild className="mt-2">
                <Link to="/order">Order now</Link>
              </Button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  )
}
