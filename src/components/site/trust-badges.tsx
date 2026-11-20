import { Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PaymentBadges({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="inline-flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
        <Lock className="size-3.5" /> Hosted checkout
      </span>
    </div>
  )
}
