import { useRef, useState } from 'react'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, FileUp, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PortalShell } from '@/components/portal-shell'
import { OrderLengthField, OrderServiceField, PaperTypeField } from '@/components/order-options'
import { OrderLanguageField, OrderSoftwareField } from '@/components/order-requirement-fields'
import { getServerUser } from '@/lib/identity.functions'
import { uploadOrderFile } from '@/lib/files.functions'
import { createOrder } from '@/lib/orders.functions'
import { isCheckoutAvailable } from '@/lib/payments.functions'
import { checkOrderFile, MAX_ORDER_FILES_PER_UPLOAD, orderFileAccept } from '@/lib/orders'
import {
  orderLanguages,
  orderSoftware,
  orderSoftwareIds,
  selectedSoftware,
  softwareSelectionError,
  type OrderLanguage,
  type OrderSoftware,
  type SoftwareSelection,
} from '@/lib/order-requirements'
import {
  academicLevels,
  assignmentTypes,
  assignmentTypeLabel,
  deadlines,
  estimatePrice,
  extraPrices,
  formatUSD,
  formatOrderLength,
  formattingStyles,
  lengthForAssignment,
  maxOrderLength,
  orderServiceIds,
  orderServices,
  parseOrderLength,
  PRESENTATION_TYPE,
  quoteLength,
  type AcademicLevelId,
  type AssignmentType,
  type DeadlineId,
  type Extras,
  type OrderLength,
  type OrderService,
} from '@/lib/pricing'
import { useCustomerActivity } from '@/lib/use-customer-activity'
import { cn } from '@/lib/utils'

type OrderSearch = {
  level?: AcademicLevelId
  deadline?: DeadlineId
  type?: AssignmentType
  service?: OrderService
  pages?: number
  words?: number
  slides?: number
  software?: OrderSoftware
}

export const Route = createFileRoute('/order')({
  validateSearch: (search: Record<string, unknown>): OrderSearch => ({
    level: academicLevels.some((l) => l.id === search.level) ? (search.level as AcademicLevelId) : undefined,
    deadline: deadlines.some((d) => d.id === search.deadline) ? (search.deadline as DeadlineId) : undefined,
    type: assignmentTypes.find((type) => type === search.type),
    service: orderServiceIds.find((service) => service === search.service),
    software: orderSoftwareIds.find((software) => software === search.software),
    pages: parseOrderLength(search.pages, 'pages'),
    words: parseOrderLength(search.words, 'words'),
    slides: search.type === PRESENTATION_TYPE
      ? parseOrderLength(search.slides, 'slides')
      : undefined,
  }),
  beforeLoad: async ({ location }) => {
    const user = await getServerUser()
    if (!user) throw redirect({ to: '/account', search: { next: location.href } })
    return { user }
  },
  loader: () => isCheckoutAvailable(),
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  head: () => ({ meta: [{ title: 'Place an order — SpeedyEssays' }] }),
  component: OrderPage,
})

const subjects = ['Nursing', 'Business', 'History', 'Psychology', 'Economics', 'English Literature', 'Sociology', 'Biology', 'Law', 'Computer Science', 'Other']

const steps = ['Assignment', 'Length & deadline', 'Instructions', 'Review'] as const

type FormState = {
  type: AssignmentType
  service: OrderService
  language: OrderLanguage
  software: SoftwareSelection
  softwareDetails: string
  subject: string
  topic: string
  level: AcademicLevelId
  style: string
  sources: string
  length: OrderLength
  deadline: DeadlineId
  extras: Extras
  instructions: string
  files: File[]
  agree: boolean
}

function OrderPage() {
  const search = Route.useSearch()
  const checkout = Route.useLoaderData()
  const [step, setStep] = useState(0)
  const { user } = Route.useRouteContext()
  useCustomerActivity(!user.isAdmin)
  const [placed, setPlaced] = useState<{ code: string; failedFiles: string[] } | null>(null)
  const submission = useRef<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState<FormState>({
    type: search.type ?? 'Essay',
    service: search.service ?? 'writing',
    language: 'en-US',
    software: search.software ?? 'none',
    softwareDetails: '',
    subject: '',
    topic: '',
    level: search.level ?? 'undergraduate',
    style: 'APA 7',
    sources: '5',
    length: search.slides !== undefined
      ? { unit: 'slides', amount: String(search.slides) }
      : search.words !== undefined
        ? { unit: 'words', amount: String(search.words) }
        : search.pages !== undefined
          ? { unit: 'pages', amount: String(search.pages) }
          : lengthForAssignment(search.type ?? 'Essay', { unit: 'pages', amount: '3' }),
    deadline: search.deadline ?? '7d',
    extras: {},
    instructions: '',
    files: [],
    agree: false,
  })
  const length = quoteLength(form.length)
  const software = selectedSoftware(form.software)
  const quote = estimatePrice({ ...form, ...length, software })
  const unitPrice = quote.slideCount === undefined ? quote.perPage : quote.perSlide
  const validLength = parseOrderLength(form.length.amount, form.length.unit) !== undefined

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: '' }))
  }

  function selectAssignment(type: AssignmentType) {
    setForm((previous) => ({
      ...previous,
      type,
      length: lengthForAssignment(type, previous.length),
    }))
    setErrors((previous) => ({ ...previous, length: '' }))
  }

  function validate(s: number) {
    const e: Record<string, string> = {}
    if (s === 0) {
      if (!form.subject) e.subject = 'Choose a subject'
      if (form.topic.trim().length < 4) e.topic = 'Add a topic or working title'
      const softwareError = softwareSelectionError(form.software, form.softwareDetails)
      if (softwareError) e.software = softwareError
    }
    if (s === 1 && !validLength)
      e.length = `Enter 1 to ${maxOrderLength(form.length.unit).toLocaleString('en-US')} ${form.length.unit}.`
    if (s === 2 && form.instructions.trim().length < 20 && form.files.length === 0) {
      e.instructions = 'Add at least a sentence of instructions or upload your prompt'
    }
    if (s === 3) {
      if (!form.agree) e.agree = 'Please accept the terms to continue'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function addFiles(files: File[]) {
    if (files.some((file) => !checkOrderFile(file)) || form.files.length + files.length > MAX_ORDER_FILES_PER_UPLOAD) {
      toast.error('Choose up to eight supported files, no larger than 4 MB each.')
      return
    }
    set('files', [...form.files, ...files])
  }

  async function next() {
    if (busy || !validate(step)) return
    if (step < steps.length - 1) {
      setStep(step + 1)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setBusy(true)
    submission.current ??= crypto.randomUUID()
    try {
      const { code } = await createOrder({ data: {
        type: form.type,
        service: form.service,
        language: form.language,
        software,
        softwareDetails: software === 'other' ? form.softwareDetails : undefined,
        style: form.style as (typeof formattingStyles)[number],
        topic: form.topic,
        subject: form.subject,
        pages: quote.pages,
        wordCount: length.wordCount,
        slideCount: length.slideCount,
        level: form.level,
        deadline: form.deadline,
        sources: Number(form.sources),
        instructions: form.instructions,
        extras: form.extras,
        agree: true,
        hasFiles: form.files.length > 0,
        submissionId: submission.current,
      } })
      const failedFiles: string[] = []
      for (const file of form.files) {
        const data = new FormData()
        data.set('code', code)
        data.set('kind', 'brief')
        data.set('uploadId', crypto.randomUUID())
        data.set('file', file)
        try {
          await uploadOrderFile({ data })
        } catch {
          failedFiles.push(file.name)
        }
      }
      setPlaced({ code, failedFiles })
    } catch {
      toast.error('Your order couldn’t be saved. Check your details or try again.')
    } finally {
      setBusy(false)
    }
  }

  if (placed) {
    return (
      <PortalShell>
        <div className="mx-auto max-w-reading px-4 py-20 text-center sm:px-6">
          <CheckCircle2 className="mx-auto size-14 text-success" />
          <h1 className="mt-6 text-4xl font-semibold">Order {placed.code} saved</h1>
          <p className="mt-4 text-muted-foreground">
            Open your order in the customer portal to view its status, messages and files.
          </p>
          {placed.failedFiles.length > 0 && <p className="mt-3 text-sm text-destructive" role="alert">These attachments could not be uploaded. Please add them from the order in your customer portal. {placed.failedFiles.join(', ')}</p>}
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild>
              <Link to="/dashboard" search={{ order: placed.code }}>Open my order</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </PortalShell>
    )
  }

  return (
    <PortalShell>
      <div className="paper-grain border-b">
        <div className="mx-auto max-w-content px-4 py-10 sm:px-6">
          <h1 className="text-3xl font-semibold sm:text-4xl">Place your order</h1>
          <p className="mt-2 text-muted-foreground">Takes about 4 minutes. Your price updates as you go.</p>
          <ol className="mt-8 grid grid-cols-4 gap-2" aria-label="Order steps">
            {steps.map((label, i) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={busy || i > step}
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
              <OrderServiceField id="service" value={form.service} onChange={(service) => set('service', service)} />
              <PaperTypeField id="type" value={form.type} onChange={selectAssignment} />
              <OrderLanguageField
                id="order-language"
                value={form.language}
                onChange={(language) => { if (language) set('language', language) }}
              />
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
              <div className="sm:col-span-2">
                <OrderSoftwareField
                  id="order-software"
                  value={form.software}
                  onChange={(value) => set('software', value)}
                  details={{ value: form.softwareDetails, onChange: (value) => {
                    set('softwareDetails', value)
                    setErrors((previous) => ({ ...previous, software: '' }))
                  } }}
                  error={errors.software}
                />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <OrderLengthField
                id="order-length"
                length={form.length}
                onChange={(value) => set('length', value)}
                quote={quote}
                allowSlides={form.type === PRESENTATION_TYPE}
                error={errors.length}
              />
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Deadline</legend>
                <RadioGroup
                  value={form.deadline}
                  onValueChange={(v) => set('deadline', v as DeadlineId)}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                >
                  {deadlines.map((d) => {
                    const price = estimatePrice({ ...form, ...length, software, deadline: d.id, extras: {} }).total
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
                        <span className="text-xs text-muted-foreground tabular-nums">{validLength ? formatUSD(price) : '—'}</span>
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
                    addFiles(Array.from(e.dataTransfer.files))
                  }}
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed bg-muted/40 px-6 py-10 text-center transition-colors hover:bg-muted motion-reduce:transition-none"
                >
                  <FileUp className="size-8 text-muted-foreground" />
                  <span className="mt-3 text-sm font-medium">Drag files here or click to browse</span>
                  <span className="mt-1 text-xs text-muted-foreground">Documents, spreadsheets, images, media and archives · up to 4 MB each</span>
                  <input
                    id="files"
                    type="file"
                    multiple
                    className="sr-only"
                    accept={orderFileAccept}
                    onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
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
                <Summary label="Assignment" value={`${assignmentTypeLabel(form.type)} · ${form.subject}`} />
                <Summary label="Service" value={orderServices[form.service].label} />
                <Summary label="Topic" value={form.topic} />
                <Summary label="Level" value={academicLevels.find((l) => l.id === form.level)?.label} />
                <Summary label="Language" value={orderLanguages[form.language]} />
                <Summary label="Software" value={software === 'other' ? form.softwareDetails.trim() : software ? orderSoftware[software] : 'None required'} />
                <Summary label="Style" value={`${form.style} · ${form.sources} sources`} />
                <Summary label="Length" value={formatOrderLength(quote.pages, length.wordCount, quote.slideCount)} />
                <Summary label="Deadline" value={deadlines.find((d) => d.id === form.deadline)?.label} />
                <Summary label="Attachments" value={form.files.length ? `${form.files.length} file(s)` : 'None'} />
              </dl>
              <p className="text-sm">
                Ordering as <span className="font-medium">{user.email}</span>.{' '}
                {checkout ? 'Open the saved order to check out.' : 'You can view the order and contact support after placing it.'}
              </p>
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
            <Button type="button" variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={busy || step === 0}>
              <ArrowLeft /> Back
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {step === steps.length - 1 ? (
                <>
                  {busy ? 'Placing order…' : 'Place order'}
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
              <Row label="Service" value={orderServices[form.service].label} />
              {validLength && (
                <Row
                  label={`${formatOrderLength(quote.pages, null, quote.slideCount)} × ${formatUSD(unitPrice)}`}
                  value={formatUSD(quote.base)}
                />
              )}
              {quote.extras > 0 && <Row label="Extras" value={formatUSD(quote.extras)} />}
              {quote.softwareFee > 0 && <Row label="Software work" value={formatUSD(quote.softwareFee)} />}
              <Row label="Originality report" value="Free" />
              <Row label="Title page & bibliography" value="Free" />
              <Row label="Revisions (14 days)" value="Free" />
            </dl>
            <div className="mt-4 flex items-baseline justify-between border-t pt-4">
              <span className="font-medium">Total</span>
              <span className="font-display text-3xl font-semibold tabular-nums">{validLength ? formatUSD(quote.total) : '—'}</span>
            </div>
          </div>
        </aside>
      </div>
    </PortalShell>
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
