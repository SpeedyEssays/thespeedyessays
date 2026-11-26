import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Clock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DiscountCodeField } from '@/components/discount-code-field'
import { OrderLengthField, OrderServiceField, PaperTypeField, SpeakerNotesField } from '@/components/order-options'
import { OrderSoftwareField } from '@/components/order-requirement-fields'
import { selectedSoftware, type SoftwareSelection } from '@/lib/order-requirements'
import { minimumDiscountMessage, type DiscountQuote } from '@/lib/discount-codes'
import {
  academicLevels, deadlines, estimatePrice, formatUSD, lengthForAssignment, maxOrderLength,
  MIN_CHECKOUT_CENTS, parseOrderLength, PRESENTATION_TYPE, quoteLength,
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
  const [software, setSoftware] = useState<SoftwareSelection>('none')
  const [speakerNotes, setSpeakerNotes] = useState(false)
  const [discount, setDiscount] = useState<DiscountQuote | null>(null)
  const validLength = parseOrderLength(length.amount, length.unit) !== undefined
  const input = { level, service, software: selectedSoftware(software), ...quoteLength(length),
    extras: { speakerNotes }, discountPercent: discount?.percent }
  const quote = estimatePrice({ ...input, deadline })
  const relaxed = estimatePrice({ ...input, deadline: '14d' })
  const isSlideQuote = length.unit === 'slides'
  const belowMinimum = Boolean(discount && Math.round(quote.total * 100) < MIN_CHECKOUT_CENTS)
  const canContinue = validLength && software !== '' && !belowMinimum

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
          onChange={(next) => {
            setLength(next)
            if (next.unit === 'slides') setType(PRESENTATION_TYPE)
          }}
          quote={quote}
          error={validLength ? undefined : `Enter 1 to ${maxOrderLength(length.unit).toLocaleString('en-US')} ${length.unit}.`}
        />
        {isSlideQuote && <SpeakerNotesField id="calc-speaker-notes" checked={speakerNotes} onChange={setSpeakerNotes} />}
        <OrderSoftwareField id="calc-software" value={software} onChange={setSoftware} fee={quote.softwareRate} />
        <DiscountCodeField id="calc-discount" discount={discount} onChange={setDiscount} />
        {belowMinimum && <p role="alert" className="text-sm text-destructive">{minimumDiscountMessage}</p>}
      </div>

      <div className="mt-8 flex flex-col gap-4 rounded-xl bg-secondary p-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Estimated total</p>
          <p className="font-display text-4xl font-semibold tabular-nums" aria-live="polite">
            {validLength && !belowMinimum ? formatUSD(quote.total) : '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatUSD(isSlideQuote ? quote.perSlide : quote.perPage)} per {isSlideQuote ? 'slide' : 'page'}
            {canContinue && Math.round(relaxed.total * 100) >= MIN_CHECKOUT_CENTS && quote.total > relaxed.total && <> · save {formatUSD(quote.total - relaxed.total)} with a 14-day deadline</>}
          </p>
          {quote.softwareFee > 0 && (
            <p className="text-xs text-muted-foreground">
              Includes {formatUSD(quote.softwareFee)} for software work
            </p>
          )}
          {quote.speakerNotesFee > 0 && <p className="text-xs text-muted-foreground">Includes {formatUSD(quote.speakerNotesFee)} for speaker notes</p>}
          {quote.discount > 0 && !belowMinimum && <p className="text-xs text-muted-foreground">Discount −{formatUSD(quote.discount)}</p>}
        </div>
        {canContinue ? (
          <Button size="lg" asChild>
            <Link to="/order" search={{
              level,
              deadline,
              type,
              service,
              software: input.software ?? undefined,
              pages: length.unit === 'pages' ? quote.pages : undefined,
              words: input.wordCount,
              slides: input.slideCount,
              speakerNotes: isSlideQuote && speakerNotes ? true : undefined,
              discount: discount?.code,
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
