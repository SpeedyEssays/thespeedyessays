import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Clock, FileText, Minus, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { academicLevels, deadlines, estimatePrice, formatUSD, type AcademicLevelId, type DeadlineId } from '@/lib/pricing'
import { cn } from '@/lib/utils'

import { PaymentBadges } from './trust-badges'

export function PricingCalculator({ className }: { className?: string }) {
  const [level, setLevel] = useState<AcademicLevelId>('undergraduate')
  const [deadline, setDeadline] = useState<DeadlineId>('7d')
  const [pages, setPages] = useState(3)
  const quote = estimatePrice({ level, deadline, pages })
  const relaxed = estimatePrice({ level, deadline: '14d', pages })

  return (
    <div className={cn('rounded-2xl border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8', className)}>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold">Instant price estimate</h2>
        <span className="text-xs font-medium text-muted-foreground">No sign-up needed</span>
      </div>

      <div className="space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Academic level</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {academicLevels.map((l) => (
              <button
                key={l.id}
                type="button"
                aria-pressed={level === l.id}
                onClick={() => setLevel(l.id)}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none',
                  level === l.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary',
                )}
              >
                {l.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Clock className="size-4 text-muted-foreground" /> Deadline
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {deadlines.map((d) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={deadline === d.id}
                onClick={() => setDeadline(d.id)}
                className={cn(
                  'rounded-md border px-2 py-2 text-sm font-medium transition-colors motion-reduce:transition-none',
                  deadline === d.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary',
                  d.hours <= 24 && deadline !== d.id && 'border-accent/60',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <Label htmlFor="calc-pages" className="mb-2 flex items-center gap-1.5">
            <FileText className="size-4 text-muted-foreground" /> Pages
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              ≈ {quote.words.toLocaleString()} words · double-spaced
            </span>
          </Label>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" aria-label="Fewer pages" onClick={() => setPages((p) => Math.max(1, p - 1))}>
              <Minus />
            </Button>
            <input
              id="calc-pages"
              type="range"
              min={1}
              max={40}
              value={pages}
              onChange={(e) => setPages(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer accent-[var(--primary)]"
            />
            <Button variant="outline" size="icon" aria-label="More pages" onClick={() => setPages((p) => Math.min(40, p + 1))}>
              <Plus />
            </Button>
            <span className="w-10 text-center text-lg font-semibold tabular-nums">{pages}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-4 rounded-xl bg-secondary p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Estimated total</p>
          <p className="font-display text-4xl font-semibold tabular-nums" aria-live="polite">
            {formatUSD(quote.total)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatUSD(quote.perPage)} per page
            {quote.total > relaxed.total && <> · save {formatUSD(quote.total - relaxed.total)} with a 14-day deadline</>}
          </p>
        </div>
        <Button size="lg" asChild>
          <Link to="/order" search={{ level, deadline, pages }}>
            Continue to order <ArrowRight />
          </Link>
        </Button>
      </div>
      <PaymentBadges className="mt-5" />
    </div>
  )
}
