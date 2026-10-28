import { CreditCard, Lock, ShieldCheck } from 'lucide-react'

import { cn } from '@/lib/utils'

const processors = ['Visa', 'Mastercard', 'Amex', 'PayPal', 'Stripe', 'Apple Pay']

export function PaymentBadges({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
        <Lock className="size-3.5" /> 256-bit SSL encrypted
      </span>
      {!compact && (
        <span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold text-muted-foreground">
          <ShieldCheck className="size-3.5" /> PCI-DSS compliant
        </span>
      )}
      {processors.map((p) => (
        <span
          key={p}
          className="inline-flex items-center gap-1 rounded-md border bg-card px-2.5 py-1 text-xs font-semibold tracking-wide text-foreground/80"
        >
          {p === 'Visa' && <CreditCard className="size-3.5" />}
          {p}
        </span>
      ))}
    </div>
  )
}
