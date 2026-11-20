import { Link } from '@tanstack/react-router'

import { Logo } from './site-header'
import { PaymentBadges } from './trust-badges'

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t bg-primary text-primary-foreground">
      <div className="mx-auto grid max-w-content gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
        <div className="space-y-4 md:col-span-2">
          <div className="[&_a]:text-primary-foreground [&_span.bg-primary]:bg-accent [&_span.bg-primary]:text-accent-foreground">
            <Logo />
          </div>
          <p className="max-w-sm text-sm text-primary-foreground/70">
            Custom academic writing support from vetted, degree-holding writers. Every paper is original, confidential, and
            delivered with a free originality report.
          </p>
          <PaymentBadges className="[&>span]:border-primary-foreground/20 [&>span]:bg-transparent [&>span]:text-primary-foreground/80" />
        </div>
        <div>
          <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal">Clients</h2>
          <ul className="space-y-2 text-sm text-primary-foreground/70">
            <li><Link to="/order" className="hover:text-primary-foreground">Place an order</Link></li>
            <li><Link to="/dashboard" className="hover:text-primary-foreground">Customer portal</Link></li>
            <li><Link to="/samples" className="hover:text-primary-foreground">Sample papers</Link></li>
            <li><Link to="/" hash="pricing" className="hover:text-primary-foreground">Pricing</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-sans text-sm font-semibold tracking-normal">Policies</h2>
          <ul className="space-y-2 text-sm text-primary-foreground/70">
            <li><Link to="/policies/$slug" params={{ slug: 'money-back-guarantee' }} className="hover:text-primary-foreground">Money-back guarantee</Link></li>
            <li><Link to="/policies/$slug" params={{ slug: 'revision-policy' }} className="hover:text-primary-foreground">Revision policy</Link></li>
            <li><Link to="/policies/$slug" params={{ slug: 'privacy-policy' }} className="hover:text-primary-foreground">Privacy &amp; confidentiality</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-foreground/10">
        <div className="mx-auto flex max-w-content flex-wrap justify-between gap-3 px-4 py-5 text-xs text-primary-foreground/70 sm:px-6">
          <p>© {new Date().getFullYear()} SpeedyEssays. Papers are provided as model references for research and study purposes.</p>
          <Link to="/admin" preload={false} className="font-medium underline hover:text-primary-foreground">Staff portal</Link>
        </div>
      </div>
    </footer>
  )
}
