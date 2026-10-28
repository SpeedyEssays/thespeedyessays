// Pricing model shared by the homepage calculator and the order form.
// Price = base per-page rate for the academic level × deadline multiplier × pages.

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

export const assignmentTypes = [
  'Essay',
  'Research Paper',
  'Term Paper',
  'Case Study',
  'Literature Review',
  'Lab Report',
  'Dissertation Chapter',
  'Admission Essay',
  'Annotated Bibliography',
  'Coursework',
] as const

export const formattingStyles = ['APA 7', 'MLA 9', 'Chicago', 'Harvard', 'IEEE', 'Not required'] as const

export const WORDS_PER_PAGE = 275

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
  extras?: Extras
}) {
  const level = academicLevels.find((l) => l.id === input.level) ?? academicLevels[1]
  const deadline = deadlines.find((d) => d.id === input.deadline) ?? deadlines[0]
  const pages = Math.max(1, Math.min(200, Math.round(input.pages)))
  const perPage = round(level.rate * deadline.multiplier)
  const base = round(perPage * pages)

  let extras = 0
  if (input.extras?.topWriter) extras += base * extraPrices.topWriter.percent
  if (input.extras?.draftPreview) extras += extraPrices.draftPreview.flat
  if (input.extras?.abstractPage) extras += extraPrices.abstractPage.flat
  extras = round(extras)

  return { perPage, pages, base, extras, total: round(base + extras), words: pages * WORDS_PER_PAGE }
}

export function formatUSD(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

function round(n: number) {
  return Math.round(n * 100) / 100
}
