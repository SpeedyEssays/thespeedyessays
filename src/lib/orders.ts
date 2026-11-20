// Order vocabulary shared by the client dashboard, the admin console and the
// server functions that persist orders.

export const orderStatuses = [
  'awaiting-payment',
  'writer-assigned',
  'in-progress',
  'draft-ready',
  'revision',
  'completed',
  'cancelled',
] as const

export type OrderStatus = (typeof orderStatuses)[number]

export const statusMeta: Record<OrderStatus, { label: string; tone: 'muted' | 'info' | 'warn' | 'ok'; progress: number }> = {
  'awaiting-payment': { label: 'Awaiting payment', tone: 'warn', progress: 5 },
  'writer-assigned': { label: 'Writer assigned', tone: 'info', progress: 20 },
  'in-progress': { label: 'In progress', tone: 'info', progress: 55 },
  'draft-ready': { label: 'Draft ready', tone: 'info', progress: 80 },
  revision: { label: 'In revision', tone: 'warn', progress: 85 },
  completed: { label: 'Completed', tone: 'ok', progress: 100 },
  cancelled: { label: 'Cancelled', tone: 'muted', progress: 0 },
}

export const orderTimeline: { status: OrderStatus; label: string }[] = [
  { status: 'awaiting-payment', label: 'Order placed' },
  { status: 'writer-assigned', label: 'Writer assigned' },
  { status: 'in-progress', label: 'Writing' },
  { status: 'draft-ready', label: 'Draft review' },
  { status: 'completed', label: 'Delivered' },
]

export const fileKinds = ['brief', 'paper', 'report'] as const
export type FileKind = (typeof fileKinds)[number]

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const REVISION_WINDOW_DAYS = 14

const CODE_OFFSET = 48000

export function orderCode(id: number) {
  return `SE-${id + CODE_OFFSET}`
}

export function orderIdFromCode(code: string) {
  const match = /^SE-(\d+)$/.exec(code.trim().toUpperCase())
  if (!match) return null
  const id = Number(match[1]) - CODE_OFFSET
  return id > 0 ? id : null
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export type OrderFileView = { id: number; kind: FileKind; name: string; size: number; createdAt: string }

export type OrderView = {
  id: number
  code: string
  title: string
  type: string
  subject: string
  level: string
  style: string
  sources: number
  pages: number
  dueAt: string
  placedAt: string
  updatedAt: string
  price: number
  paymentMethod: string
  status: OrderStatus
  originalityScore: number | null
  instructions: string
  files: OrderFileView[]
}

export type AdminOrderView = OrderView & { clientEmail: string; clientName: string | null; awaitingReply: boolean }

export type OrderMessageView = { id: number; sender: 'client' | 'support'; body: string; at: string }
