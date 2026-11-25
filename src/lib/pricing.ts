// Pricing model shared by the homepage calculator and the order form.
// The academic level, service and deadline determine the billable page rate.

export const academicLevels = [
  { id: 'high-school', label: 'High School', rate: 5 },
  { id: 'undergraduate', label: 'Undergraduate', rate: 8 },
  { id: 'masters', label: "Master's", rate: 12 },
  { id: 'phd', label: 'PhD', rate: 18 },
] as const

export const deadlines = [
  { id: '14d', label: '14 days', hours: 336, multiplier: 1 },
  { id: '7d', label: '7 days', hours: 168, multiplier: 1.12 },
  { id: '3d', label: '3 days', hours: 72, multiplier: 1.35 },
  { id: '48h', label: '48 hours', hours: 48, multiplier: 1.6 },
  { id: '24h', label: '24 hours', hours: 24, multiplier: 1.95 },
  { id: '8h', label: '8 hours', hours: 8, multiplier: 2.6 },
] as const

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
    types: ['Creative Writing', 'Presentation / Slides', 'Speech', 'Script'],
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

export type LengthUnit = 'pages' | 'words'
export type OrderLength = { unit: LengthUnit; amount: string }

export function maxOrderLength(unit: LengthUnit) {
  return unit === 'pages' ? MAX_ORDER_PAGES : MAX_ORDER_WORDS
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
  }
}

export function formatOrderLength(pages: number, wordCount?: number | null) {
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
  service?: OrderService
  extras?: Extras
}) {
  const level = academicLevels.find((l) => l.id === input.level) ?? academicLevels[1]
  const deadline = deadlines.find((d) => d.id === input.deadline) ?? deadlines[0]
  const wordCount = parseOrderLength(input.wordCount, 'words')
  const pages = wordCount === undefined
    ? (parseOrderLength(input.pages, 'pages') ?? 1)
    : Math.ceil(wordCount / WORDS_PER_PAGE)
  const service = orderServices[input.service ?? 'writing']
  const perPage = round(level.rate * deadline.multiplier * service.rate)
  const base = round(perPage * pages)

  let extras = 0
  if (input.extras?.topWriter) extras += base * extraPrices.topWriter.percent
  if (input.extras?.draftPreview) extras += extraPrices.draftPreview.flat
  if (input.extras?.abstractPage) extras += extraPrices.abstractPage.flat
  extras = round(extras)

  return {
    perPage,
    pages,
    base,
    extras,
    total: round(base + extras),
    words: wordCount ?? pages * WORDS_PER_PAGE,
  }
}

export function formatUSD(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function round(n: number) {
  return Math.round(n * 100) / 100
}
