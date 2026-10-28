import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CreditCard, FileUp, Lock, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PageShell } from '@/components/site/page-shell'
import { PaymentBadges } from '@/components/site/trust-badges'
import {
  academicLevels,
  assignmentTypes,
  deadlines,
  estimatePrice,
  extraPrices,
  formatUSD,
  formattingStyles,
  type AcademicLevelId,
  type DeadlineId,
  type Extras,
} from '@/lib/pricing'
import { cn } from '@/lib/utils'

type OrderSearch = { level?: AcademicLevelId; deadline?: DeadlineId; pages?: number }

export const Route = createFileRoute('/order')({
  validateSearch: (search: Record<string, unknown>): OrderSearch => ({
    level: academicLevels.some((l) => l.id === search.level) ? (search.level as AcademicLevelId) : undefined,
    deadline: deadlines.some((d) => d.id === search.deadline) ? (search.deadline as DeadlineId) : undefined,
    pages: Number.isFinite(Number(search.pages)) && Number(search.pages) > 0 ? Number(search.pages) : undefined,
  }),
  head: () => ({ meta: [{ title: 'Place an order — SpeedyEssays' }] }),
  component: OrderPage,
})

const subjects = ['Nursing', 'Business', 'History', 'Psychology', 'Economics', 'English Literature', 'Sociology', 'Biology', 'Law', 'Computer Science', 'Other']

const steps = ['Assignment', 'Length & deadline', 'Instructions', 'Review & pay'] as const

type FormState = {
  type: string
  subject: string
  topic: string
  level: AcademicLevelId
  style: string
  sources: string
  pages: number
  deadline: DeadlineId
  extras: Extras
  instructions: string
  files: File[]
  email: string
  payment: 'card' | 'paypal'
  agree: boolean
}

function OrderPage() {
  const search = Route.useSearch()
  const [step, setStep] = useState(0)
  const [placed, setPlaced] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<FormState>({
    type: 'Essay',
    subject: '',
    topic: '',
    level: search.level ?? 'undergraduate',
    style: 'APA 7',
    sources: '5',
    pages: Math.min(200, search.pages ?? 3),
    deadline: search.deadline ?? '7d',
    extras: {},
    instructions: '',
    files: [],
    email: '',
    payment: 'card',
    agree: false,
  })
  const quote = estimatePrice(form)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: '' }))
  }

  function validate(s: number) {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (!form.subject) e.subject = 'Choose a subject'
      if (form.topic.trim().length < 4) e.topic = 'Add a topic or working title'
    }
    if (s === 2 && form.instructions.trim().length < 20 && form.files.length === 0) {
      e.instructions = 'Add at least a sentence of instructions or upload your prompt'
    }
    if (s === 3) {
      if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address'
      if (!form.agree) e.agree = 'Please accept the terms to continue'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function next() {
    if (!validate(step)) return
    if (step < steps.length - 1) {
      setStep(step + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      const id = `SE-${48300 + Math.floor(Math.random() * 600)}`
      setPlaced(id)
      toast.success(`Order ${id} created`)
    }
  }

  if (placed) {
    return (
      <PageShell>
        <div className="mx-auto max-w-reading px-4 py-20 text-center sm:px-6">
          <CheckCircle2 className="mx-auto size-14 text-success" />
          <h1 className="mt-6 text-4xl font-semibold">Order {placed} received</h1>
          <p className="mt-4 text-muted-foreground">
            We’ve saved your brief and sent a confirmation to <span className="font-medium text-foreground">{form.email}</span>.
            Once payment of <span className="font-medium text-foreground">{formatUSD(quote.total)}</span> is confirmed, a{' '}
            {academicLevels.find((l) => l.id === form.level)?.label} {form.subject} specialist is assigned — usually within 15 minutes.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild>
              <Link to="/dashboard">Go to my dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <div className="paper-grain border-b">
        <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
          <h1 className="text-3xl font-semibold sm:text-4xl">Place your order</h1>
          <p className="mt-2 text-muted-foreground">Takes about 4 minutes. Your price updates as you go.</p>
          <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Order steps">
            {steps.map((label, i) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={i > step}
                  onClick={() => setStep(i)}
                  className="group w-full text-left disabled:cursor-not-allowed"
                  aria-current={i === step ? 'step' : undefined}
                >
                  <span className={cn('block h-1.5 rounded-full', i <= step ? 'bg-primary' : 'bg-border')} />
                  <span className="mt-2 flex items-center gap-1.5 text-xs font-medium sm:text-sm">
                    <span
                      className={cn(
                        'grid size-5 place-items-center rounded-full text-[10px]',
                        i < step ? 'bg-primary text-primary-foreground' : i === step ? 'border-2 border-primary' : 'border text-muted-foreground',
                      )}
                    >
                      {i < step ? <Check className="size-3" /> : i + 1}
                    </span>
                    <span className={cn('hidden sm:inline', i > step && 'text-muted-foreground')}>{label}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mx-auto grid max-w-content gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_22rem]">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            next()
          }}
          className="rounded-2xl border bg-card p-6 sm:p-8"
        >
          <h2 className="mb-6 text-2xl font-semibold">{steps[step]}</h2>

          {step === 0 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Type of assignment" id="type">
                <Select value={form.type} onValueChange={(v) => set('type', v)}>
                  <SelectTrigger id="type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {assignmentTypes.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Subject" id="subject" error={errors.subject}>
                <Select value={form.subject} onValueChange={(v) => set('subject', v)}>
                  <SelectTrigger id="subject" className="w-full" aria-invalid={!!errors.subject}>
                    <SelectValue placeholder="Select a subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Topic or working title" id="topic" error={errors.topic} className="sm:col-span-2">
                <Input
                  id="topic"
                  value={form.topic}
                  aria-invalid={!!errors.topic}
                  onChange={(e) => set('topic', e.target.value)}
                  placeholder="e.g. The impact of nurse staffing ratios on patient outcomes"
                />
              </Field>
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-sm font-medium">Academic level</legend>
                <RadioGroup
                  value={form.level}
                  onValueChange={(v) => set('level', v as AcademicLevelId)}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-4"
                >
                  {academicLevels.map((l) => (
                    <Label
                      key={l.id}
                      htmlFor={`level-${l.id}`}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md border p-3 font-medium',
                        form.level === l.id && 'border-primary bg-secondary',
                      )}
                    >
                      <RadioGroupItem id={`level-${l.id}`} value={l.id} />
                      {l.label}
                    </Label>
                  ))}
                </RadioGroup>
              </fieldset>
              <Field label="Formatting style" id="style">
                <Select value={form.style} onValueChange={(v) => set('style', v)}>
                  <SelectTrigger id="style" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formattingStyles.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Number of sources" id="sources">
                <Input id="sources" type="number" min={0} max={100} value={form.sources} onChange={(e) => set('sources', e.target.value)} />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <Field label="Pages" id="pages" hint={`≈ ${quote.words.toLocaleString()} words, double-spaced`}>
                <Input
                  id="pages"
                  type="number"
                  min={1}
                  max={200}
                  value={form.pages}
                  onChange={(e) => set('pages', Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                  className="max-w-32"
                />
              </Field>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Deadline</legend>
                <RadioGroup
                  value={form.deadline}
                  onValueChange={(v) => set('deadline', v as DeadlineId)}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                >
                  {deadlines.map((d) => {
                    const price = estimatePrice({ ...form, deadline: d.id, extras: {} }).base
                    return (
                      <Label
                        key={d.id}
                        htmlFor={`dl-${d.id}`}
                        className={cn(
                          'flex cursor-pointer items-center justify-between gap-2 rounded-md border p-3',
                          form.deadline === d.id && 'border-primary bg-secondary',
                        )}
                      >
                        <span className="flex items-center gap-2 font-medium">
                          <RadioGroupItem id={`dl-${d.id}`} value={d.id} />
                          {d.label}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">{formatUSD(price)}</span>
                      </Label>
                    )
                  })}
                </RadioGroup>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Optional extras</legend>
                <div className="space-y-2">
                  {(Object.keys(extraPrices) as (keyof typeof extraPrices)[]).map((key) => {
                    const extra = extraPrices[key]
                    return (
                      <Label key={key} htmlFor={`x-${key}`} className="flex cursor-pointer items-start gap-3 rounded-md border p-3">
                        <Checkbox
                          id={`x-${key}`}
                          checked={!!form.extras[key]}
                          onCheckedChange={(c) => set('extras', { ...form.extras, [key]: c === true })}
                          className="mt-0.5"
                        />
                        <span className="flex-1">
                          <span className="block font-medium">{extra.label}</span>
                          <span className="block text-xs font-normal text-muted-foreground">{extra.description}</span>
                        </span>
                        <span className="text-sm font-medium">{'percent' in extra ? `+${extra.percent * 100}%` : `+${formatUSD(extra.flat)}`}</span>
                      </Label>
                    )
                  })}
                </div>
              </fieldset>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <Field
                label="Paper instructions"
                id="instructions"
                error={errors.instructions}
                hint="Include your thesis, required readings, rubric criteria — anything your professor expects."
              >
                <Textarea
                  id="instructions"
                  rows={8}
                  value={form.instructions}
                  aria-invalid={!!errors.instructions}
                  onChange={(e) => set('instructions', e.target.value)}
                  placeholder="Paste your prompt here or describe what you need…"
                />
              </Field>
              <div>
                <p className="mb-2 text-sm font-medium">Upload prompt, rubric or reading materials</p>
                <label
                  htmlFor="files"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    set('files', [...form.files, ...Array.from(e.dataTransfer.files)])
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/40 px-6 py-10 text-center transition-colors hover:bg-muted motion-reduce:transition-none"
                >
                  <FileUp className="size-8 text-muted-foreground" />
                  <span className="mt-3 text-sm font-medium">Drag files here or click to browse</span>
                  <span className="mt-1 text-xs text-muted-foreground">PDF, DOCX, PPTX, images · up to 25 MB each</span>
                  <input
                    id="files"
                    type="file"
                    multiple
                    className="sr-only"
                    accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.png,.jpg,.jpeg"
                    onChange={(e) => set('files', [...form.files, ...Array.from(e.target.files ?? [])])}
                  />
                </label>
                {form.files.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {form.files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                        <Paperclip className="size-4 text-muted-foreground" />
                        <span className="flex-1 truncate">{f.name}</span>
                        <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${f.name}`}
                          onClick={() => set('files', form.files.filter((_, j) => j !== i))}
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <dl className="grid gap-x-6 gap-y-3 rounded-xl bg-muted/50 p-5 text-sm sm:grid-cols-2">
                <Summary label="Assignment" value={`${form.type} · ${form.subject}`} />
                <Summary label="Topic" value={form.topic} />
                <Summary label="Level" value={academicLevels.find((l) => l.id === form.level)?.label} />
                <Summary label="Style" value={`${form.style} · ${form.sources} sources`} />
                <Summary label="Length" value={`${form.pages} pages (≈ ${quote.words.toLocaleString()} words)`} />
                <Summary label="Deadline" value={deadlines.find((d) => d.id === form.deadline)?.label} />
                <Summary label="Attachments" value={form.files.length ? `${form.files.length} file(s)` : 'None'} />
              </dl>
              <Field label="Email for order updates" id="email" error={errors.email} hint="Never shared with your writer.">
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  aria-invalid={!!errors.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="you@university.edu"
                />
              </Field>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Payment method</legend>
                <RadioGroup value={form.payment} onValueChange={(v) => set('payment', v as FormState['payment'])} className="grid gap-2 sm:grid-cols-2">
                  <Label htmlFor="pay-card" className={cn('flex cursor-pointer items-center gap-3 rounded-md border p-4', form.payment === 'card' && 'border-primary bg-secondary')}>
                    <RadioGroupItem id="pay-card" value="card" />
                    <CreditCard className="size-5" />
                    <span>
                      <span className="block font-medium">Credit or debit card</span>
                      <span className="block text-xs font-normal text-muted-foreground">Visa, Mastercard, Amex via Stripe</span>
                    </span>
                  </Label>
                  <Label htmlFor="pay-paypal" className={cn('flex cursor-pointer items-center gap-3 rounded-md border p-4', form.payment === 'paypal' && 'border-primary bg-secondary')}>
                    <RadioGroupItem id="pay-paypal" value="paypal" />
                    <span className="font-display text-lg font-bold italic">P</span>
                    <span>
                      <span className="block font-medium">PayPal</span>
                      <span className="block text-xs font-normal text-muted-foreground">Pay with your PayPal balance or card</span>
                    </span>
                  </Label>
                </RadioGroup>
              </fieldset>
              <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/5 p-4 text-sm">
                <Lock className="mt-0.5 size-4 shrink-0 text-success" />
                <p>
                  You’ll be redirected to {form.payment === 'card' ? 'Stripe' : 'PayPal'}’s secure checkout. Your payment is protected by
                  256-bit SSL encryption and our{' '}
                  <Link to="/policies/$slug" params={{ slug: 'money-back-guarantee' }} className="font-medium underline">
                    money-back guarantee
                  </Link>
                  .
                </p>
              </div>
              <div>
                <Label htmlFor="agree" className="flex items-start gap-3 font-normal">
                  <Checkbox id="agree" checked={form.agree} onCheckedChange={(c) => set('agree', c === true)} aria-invalid={!!errors.agree} />
                  <span>
                    I agree to the{' '}
                    <Link to="/policies/$slug" params={{ slug: 'revision-policy' }} className="underline">revision policy</Link>,{' '}
                    <Link to="/policies/$slug" params={{ slug: 'money-back-guarantee' }} className="underline">refund terms</Link> and{' '}
                    <Link to="/policies/$slug" params={{ slug: 'privacy-policy' }} className="underline">privacy policy</Link>.
                  </span>
                </Label>
                {errors.agree && <p className="mt-1 text-sm text-destructive">{errors.agree}</p>}
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 border-t pt-6">
            <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
              <ArrowLeft /> Back
            </Button>
            <Button type="submit" size="lg">
              {step === steps.length - 1 ? (
                <>
                  <Lock /> Pay {formatUSD(quote.total)} securely
                </>
              ) : (
                <>
                  Continue <ArrowRight />
                </>
              )}
            </Button>
          </div>
        </form>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border bg-card p-6">
            <h2 className="text-lg font-semibold">Order summary</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <Row label={`${quote.pages} page${quote.pages > 1 ? 's' : ''} × ${formatUSD(quote.perPage)}`} value={formatUSD(quote.base)} />
              {quote.extras > 0 && <Row label="Extras" value={formatUSD(quote.extras)} />}
              <Row label="Originality report" value="Free" />
              <Row label="Title page & bibliography" value="Free" />
              <Row label="Revisions (14 days)" value="Free" />
            </dl>
            <div className="mt-4 flex items-baseline justify-between border-t pt-4">
              <span className="font-medium">Total</span>
              <span className="font-display text-3xl font-semibold tabular-nums">{formatUSD(quote.total)}</span>
            </div>
            <PaymentBadges compact className="mt-5" />
          </div>
        </aside>
      </div>
    </PageShell>
  )
}

function Field({
  label,
  id,
  error,
  hint,
  className,
  children,
}: {
  label: string
  id: string
  error?: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Summary({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || '—'}</dd>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-medium tabular-nums', value === 'Free' && 'text-success')}>{value}</dd>
    </div>
  )
}
