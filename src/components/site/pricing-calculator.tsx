import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Clock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { OrderLengthField, OrderServiceField, PaperTypeField } from '@/components/order-options'
import {
  academicLevels, deadlines, estimatePrice, formatUSD, lengthForAssignment, maxOrderLength,
  parseOrderLength, PRESENTATION_TYPE, quoteLength,
  type AcademicLevelId, type AssignmentType, type DeadlineId, type OrderLength, type OrderService,
} from '@/lib/pricing'
import { cn } from '@/lib/utils'

import { PaymentBadges } from './trust-badges'

export function PricingCalculator({ className }: { className?: string }) {
  const [level, setLevel] = useState<AcademicLevelId>('undergraduate')
  const [deadline, setDeadline] = useState<DeadlineId>('7d')
  const [type, setType] = useState<AssignmentType>('Essay')
  const [service, setService] = useState<OrderService>('writing')
  const [length, setLength] = useState<OrderLength>({ unit: 'pages', amount: '3' })
  const validLength = parseOrderLength(length.amount, length.unit) !== undefined
  const input = { level, service, ...quoteLength(length) }
  const quote = estimatePrice({ ...input, deadline })
  const relaxed = estimatePrice({ ...input, deadline: '14d' })
  const isSlideQuote = length.unit === 'slides'

  return (
    <div className={cn('rounded-2xl border bg-card p-6 shadow-xl shadow-primary/5 sm:p-8', className)}>
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold">Instant price estimate</h2>
        <span className="text-xs font-medium text-muted-foreground">No sign-up needed</span>
      </div>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <OrderServiceField id="calc-service" value={service} onChange={setService} />
          <PaperTypeField id="calc-type" value={type} onChange={(value) => {
            setType(value)
            setLength((previous) => lengthForAssignment(value, previous))
          }} />
        </div>
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

        <OrderLengthField
          id="calc-length"
          length={length}
          onChange={setLength}
          quote={quote}
          allowSlides={type === PRESENTATION_TYPE}
          error={validLength ? undefined : `Enter 1 to ${maxOrderLength(length.unit).toLocaleString('en-US')} ${length.unit}.`}
        />
      </div>

      <div className="mt-8 flex flex-col gap-4 rounded-xl bg-secondary p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Estimated total</p>
          <p className="font-display text-4xl font-semibold tabular-nums" aria-live="polite">
            {validLength ? formatUSD(quote.total) : '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatUSD(isSlideQuote ? quote.perSlide : quote.perPage)} per {isSlideQuote ? 'slide' : 'page'}
            {validLength && quote.total > relaxed.total && <> · save {formatUSD(quote.total - relaxed.total)} with a 14-day deadline</>}
          </p>
        </div>
        {validLength ? (
          <Button size="lg" asChild>
            <Link to="/order" search={{
              level,
              deadline,
              type,
              service,
              pages: length.unit === 'pages' ? quote.pages : undefined,
              words: input.wordCount,
              slides: input.slideCount,
            }}>
              Continue to order <ArrowRight />
            </Link>
          </Button>
        ) : (
          <Button size="lg" disabled>Continue to order <ArrowRight /></Button>
        )}
      </div>
      <PaymentBadges className="mt-5" />
    </div>
  )
}
