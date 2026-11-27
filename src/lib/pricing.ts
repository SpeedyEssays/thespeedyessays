// Pricing model shared by the homepage calculator and the order form.
// The academic level, service and deadline determine the billable page rate.

import type { OrderSoftware } from './order-requirements'

export const academicLevels = [
  { id: 'high-school', label: 'High School', rate: 5, slideRate: 3.7, softwareFee: 40 },
  { id: 'undergraduate', label: 'Undergraduate', rate: 8, slideRate: 5.9, softwareFee: 55 },
  { id: 'masters', label: "Master's", rate: 12, slideRate: 8.9, softwareFee: 70 },
  { id: 'phd', label: 'PhD', rate: 18, slideRate: 13.3, softwareFee: 85 },
] as const

export const deadlines = [
  { id: '14d', label: '14 days', hours: 336, multiplier: 1 },
  { id: '7d', label: '7 days', hours: 168, multiplier: 1.12 },
  { id: '3d', label: '3 days', hours: 72, multiplier: 1.35 },
  { id: '48h', label: '48 hours', hours: 48, multiplier: 1.6 },
  { id: '24h', label: '24 hours', hours: 24, multiplier: 1.95 },
  { id: '8h', label: '8 hours', hours: 8, multiplier: 2.6 },
] as const

export const PRESENTATION_TYPE = 'Presentation / Slides'

export const assignmentTypeGroups = [
  {
    label: 'Essays and coursework',
    types: [
      'Essay',
      'Research Paper',
      'Term Paper',
      'Reflection Paper',
      'Coursework',
      'Discussion Post',
      'Article Critique / Review',
      'Book Review',
      'Book Report',
      '1-Page Summary',
      'Abstract Page',
    ],
  },
  {
    label: 'Research and reports',
    types: [
      'Dissertation / Thesis',
      'Dissertation Chapter',
      'Research Proposal',
      'Literature Review',
      'Systematic Review',
      'Annotated Bibliography',
      'Case Study',
      'Lab Report',
      'Report',
      'Technical Report',
      'Capstone Project',
      'Policy Brief',
    ],
  },
  {
    label: 'Applications and business',
    types: [
      'Admission Essay',
      'Scholarship Essay',
      'Statement of Purpose',
      'Resume / CV',
      'Cover Letter',
      'Business Plan',
      'Project Proposal',
      'Marketing Plan',
      'Memo',
    ],
  },
  {
    label: 'Creative work and presentations',
    types: ['Creative Writing', PRESENTATION_TYPE, 'Speech', 'Script'],
  },
  {
    label: 'Problems and quizzes',
    types: ['Problems (Math, Physics, etc.)', 'Multiple-Choice Questions / Quizzes'],
  },
] as const

export type AssignmentType = (typeof assignmentTypeGroups)[number]['types'][number]

export const assignmentTypes = assignmentTypeGroups.flatMap<AssignmentType>((group) => group.types)

export function assignmentTypeLabel(type: string) {
  if (type === 'Essay') return 'Essay (any type)'
  if (type === 'Admission Essay') return 'Admission Essay / Personal Statement'
  return type
}

export const orderServices = {
  writing: { label: 'Writing from scratch', rate: 1 },
  editing: { label: 'Editing', rate: 0.75 },
  proofreading: { label: 'Proofreading', rate: 0.65 },
  revision: { label: 'Revision', rate: 0.8 },
  humanizing: { label: 'Humanizing AI Content', rate: 0.75 },
} as const

export type OrderService = keyof typeof orderServices
export const orderServiceIds = Object.keys(orderServices) as OrderService[]

export const formattingStyles = ['APA 7', 'MLA 9', 'Chicago', 'Harvard', 'IEEE', 'Not required'] as const

export const WORDS_PER_PAGE = 275
export const MAX_ORDER_PAGES = 10_000
export const MAX_ORDER_WORDS = MAX_ORDER_PAGES * WORDS_PER_PAGE
export const MAX_ORDER_SLIDES = 10_000
export const SPEAKER_NOTES_FEE = 10
export const MIN_CHECKOUT_CENTS = 200

export type LengthUnit = 'pages' | 'words' | 'slides'
export type OrderLength = { unit: LengthUnit; amount: string }

export function maxOrderLength(unit: LengthUnit) {
  if (unit === 'slides') return MAX_ORDER_SLIDES
  return unit === 'words' ? MAX_ORDER_WORDS : MAX_ORDER_PAGES
}

export function parseOrderLength(value: unknown, unit: LengthUnit) {
  const amount = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(amount) && amount >= 1 && amount <= maxOrderLength(unit) ? amount : undefined
}

export function quoteLength({ unit, amount }: OrderLength) {
  const count = parseOrderLength(amount, unit)
  return {
    pages: unit === 'pages' ? (count ?? 1) : 1,
    wordCount: unit === 'words' ? count : undefined,
    slideCount: unit === 'slides' ? count : undefined,
  }
}

export function changeLengthUnit(length: OrderLength, unit: LengthUnit): OrderLength {
  if (unit === length.unit) return length
  const count = parseOrderLength(length.amount, length.unit)
  const wholeUnits = count === undefined ? 1
    : length.unit === 'words' ? Math.ceil(count / WORDS_PER_PAGE) : count
  return { unit, amount: String(unit === 'words' ? wholeUnits * WORDS_PER_PAGE : wholeUnits) }
}

export function lengthForAssignment(type: AssignmentType, length: OrderLength): OrderLength {
  if (type === PRESENTATION_TYPE) return changeLengthUnit(length, 'slides')
  return length.unit === 'slides' ? changeLengthUnit(length, 'pages') : length
}

export function formatOrderLength(
  pages: number,
  wordCount?: number | null,
  slideCount?: number | null,
) {
  if (slideCount != null)
    return `${slideCount.toLocaleString('en-US')} ${slideCount === 1 ? 'slide' : 'slides'}`
  const unit = pages === 1 ? 'page' : 'pages'
  const pageCount = pages.toLocaleString('en-US')
  if (wordCount != null)
    return `${wordCount.toLocaleString('en-US')} ${wordCount === 1 ? 'word' : 'words'} (${pageCount} billable ${unit})`
  return `${pageCount} ${unit}`
}

export type AcademicLevelId = (typeof academicLevels)[number]['id']
export type DeadlineId = (typeof deadlines)[number]['id']

export type Extras = {
  topWriter?: boolean
  draftPreview?: boolean
  abstractPage?: boolean
  speakerNotes?: boolean
}

export type PriceAdjustment =
  | { kind: 'discount-code'; originalCents: number; code: string; percent: number }
  | { kind: 'special-price'; originalCents: number }

export function softwareWorkFee(level: string, deadline: string) {
  const rate = academicLevels.find((item) => item.id === level || item.label === level) ?? academicLevels[1]
  const timing = deadlines.find((item) => item.id === deadline) ?? deadlines[0]
  return round(rate.softwareFee * timing.multiplier)
}

export function discountedTotalCents(subtotalCents: number, percent: number) {
  return subtotalCents - Math.round(subtotalCents * percent / 100)
}

export const extraPrices = {
  topWriter: { label: 'Top-rated writer', description: 'Assigned from our top 10% by rating', percent: 0.2 },
  draftPreview: { label: 'Draft preview', description: 'See a partial draft at 50% of the deadline', flat: 3.99 },
  abstractPage: { label: 'Abstract page', description: 'A one-page summary of your paper', flat: 8.99 },
} as const

export function estimatePrice(input: {
  level: AcademicLevelId
  deadline: DeadlineId
  pages: number
  wordCount?: number
  slideCount?: number
  service?: OrderService
  software?: OrderSoftware | null
  extras?: Extras
  discountPercent?: number
}) {
  const level = academicLevels.find((l) => l.id === input.level) ?? academicLevels[1]
  const deadline = deadlines.find((d) => d.id === input.deadline) ?? deadlines[0]
  const wordCount = parseOrderLength(input.wordCount, 'words')
  const slideCount = parseOrderLength(input.slideCount, 'slides')
  const pages = slideCount !== undefined ? 0
    : wordCount === undefined ? (parseOrderLength(input.pages, 'pages') ?? 1)
      : Math.ceil(wordCount / WORDS_PER_PAGE)
  const service = orderServices[input.service ?? 'writing']
  const rate = level.rate * deadline.multiplier * service.rate
  const perPage = round(rate)
  const perSlide = round(level.slideRate * deadline.multiplier * service.rate)
  const base = round(slideCount === undefined ? perPage * pages : perSlide * slideCount)

  let extras = 0
  if (input.extras?.topWriter) extras += base * extraPrices.topWriter.percent
  if (input.extras?.draftPreview) extras += extraPrices.draftPreview.flat
  if (input.extras?.abstractPage) extras += extraPrices.abstractPage.flat
  extras = round(extras)
  const softwareRate = softwareWorkFee(level.id, deadline.id)
  const softwareFee = input.software ? softwareRate : 0
  const speakerNotesFee = slideCount !== undefined && input.extras?.speakerNotes ? SPEAKER_NOTES_FEE : 0
  const subtotalCents = Math.round((base + extras + softwareFee + speakerNotesFee) * 100)
  const totalCents = discountedTotalCents(subtotalCents, input.discountPercent ?? 0)

  return {
    perPage,
    perSlide,
    pages,
    slideCount,
    base,
    extras,
    softwareRate,
    softwareFee,
    speakerNotesFee,
    subtotal: subtotalCents / 100,
    discount: (subtotalCents - totalCents) / 100,
    total: totalCents / 100,
    words: slideCount === undefined ? (wordCount ?? pages * WORDS_PER_PAGE) : 0,
  }
}

export function formatUSD(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function round(n: number) {
  return Math.round(n * 100) / 100
}
