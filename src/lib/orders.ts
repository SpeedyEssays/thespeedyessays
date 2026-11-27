// Order vocabulary shared by the client dashboard, the admin console and the
// server functions that persist orders.

import type { OrderService, PriceAdjustment } from './pricing'
import type { OrderLanguage, OrderSoftware } from './order-requirements'

export const orderStatuses = [
  'awaiting-payment',
  'paid',
  'writer-assigned',
  'in-progress',
  'draft-ready',
  'revision',
  'completed',
  'approved',
  'cancelled',
] as const

export type OrderStatus = (typeof orderStatuses)[number]
export const staffOrderStatuses = orderStatuses.filter((status) => status !== 'approved')

export const statusMeta: Record<
  OrderStatus,
  { label: string; tone: 'muted' | 'info' | 'warn' | 'ok'; progress: number }
> = {
  'awaiting-payment': { label: 'Awaiting payment', tone: 'warn', progress: 5 },
  paid: { label: 'Paid', tone: 'ok', progress: 10 },
  'writer-assigned': { label: 'Writer assigned', tone: 'info', progress: 20 },
  'in-progress': { label: 'In progress', tone: 'info', progress: 55 },
  'draft-ready': { label: 'Draft ready', tone: 'info', progress: 80 },
  revision: { label: 'In revision', tone: 'warn', progress: 85 },
  completed: { label: 'Completed', tone: 'ok', progress: 100 },
  approved: { label: 'Approved', tone: 'ok', progress: 100 },
  cancelled: { label: 'Cancelled', tone: 'muted', progress: 0 },
}

export const orderTimeline: { status: OrderStatus; label: string }[] = [
  { status: 'awaiting-payment', label: 'Order placed' },
  { status: 'writer-assigned', label: 'Writer assigned' },
  { status: 'in-progress', label: 'Writing' },
  { status: 'draft-ready', label: 'Draft review' },
  { status: 'completed', label: 'Delivered' },
]

export const staffFileKinds = [
  'final',
  'paper',
  'soft-copy',
  'speaker-notes',
  'report',
  'material',
] as const
export const fileKinds = ['brief', ...staffFileKinds] as const
export type FileKind = (typeof fileKinds)[number]

export const fileKindLabels: Record<FileKind, string> = {
  brief: 'Customer brief',
  paper: 'Draft',
  final: 'Final copy',
  'soft-copy': 'Soft copy',
  'speaker-notes': 'Speaker notes (Word)',
  report: 'Originality report',
  material: 'Supporting file',
}

export const approvalFileKinds = ['final', 'soft-copy', 'speaker-notes'] as const

export function fileRequiresApproval(kind: string) {
  return approvalFileKinds.some((type) => type === kind)
}

export function customerFileAccess(file: {
  kind: string
  deliveredAt: Date | null
  releasedAt: Date | null
  previewBlobKey: string | null
}) {
  if (!fileRequiresApproval(file.kind) || file.releasedAt) return 'original'
  if (!file.deliveredAt) return 'pending'
  return file.previewBlobKey ? 'preview' : 'locked'
}

export const revisionRequestStatuses = ['draft-ready', 'completed', 'approved']

type RevisionOrder = {
  status: string
  deliveredAt: Date | string | null
  updatedAt: Date | string
}

export function orderRevisionDeadline(order: RevisionOrder) {
  const delivered = order.deliveredAt ??
    (order.status === 'completed' || order.status === 'approved' ? order.updatedAt : null)
  return delivered === null ? null : new Date(delivered).getTime() + REVISION_WINDOW_DAYS * 86_400_000
}

export function customerRevisionStatus(order: RevisionOrder, now = Date.now()) {
  if (!revisionRequestStatuses.includes(order.status)) return 'unavailable'
  const deadline = orderRevisionDeadline(order)
  return deadline !== null && now >= deadline ? 'expired' : 'available'
}

export function canCheckout(order: {
  status: string
  paidAt: Date | string | null
}) {
  return !order.paidAt && order.status !== 'cancelled'
}

export function canChangeUnpaidQuote(order: {
  paidAt: Date | string | null
  checkoutStarted: boolean
}) {
  return !order.paidAt && !order.checkoutStarted
}

export const MAX_ORDER_FILES_PER_UPLOAD = 8
export const MAX_FILE_BYTES = 4 * 1024 * 1024
export const REVISION_WINDOW_DAYS = 14

const CODE_OFFSET = 48000

export function orderCode(id: number) {
  return `SE-${id + CODE_OFFSET}`
}

export function orderIdFromCode(code: string) {
  const match = /^SE-(\d+)$/.exec(code.trim().toUpperCase())
  if (!match) return null
  const id = Number(match[1]) - CODE_OFFSET
  return Number.isSafeInteger(id) && id > 0 && id <= 2147483647 ? id : null
}

export function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export type OrderFileView = {
  id: number
  kind: FileKind
  name: string
  size: number
  createdAt: string
  access: ReturnType<typeof customerFileAccess>
  hasPreview: boolean
}

export type OrderFeedbackView = {
  rating: number
  comment: string
  createdAt: string
  updatedAt: string
}

export type OrderView = {
  id: number
  code: string
  title: string
  type: string
  service: OrderService
  language: OrderLanguage | null
  software: OrderSoftware | null
  softwareDetails: string | null
  softwareFeeCents: number
  subject: string
  level: string
  style: string
  sources: number
  pages: number
  wordCount: number | null
  slideCount: number | null
  speakerNotes: boolean
  deadlineOption: string
  dueAt: string
  agreedDueAt: string | null
  placedAt: string
  updatedAt: string
  price: number
  refundedCents: number
  priceAdjustment: PriceAdjustment | null
  paymentMethod: string
  paidAt: string | null
  deliveredAt: string | null
  deliveryVersion: number
  filesRevision: number
  revisionStatus: ReturnType<typeof customerRevisionStatus>
  approvedAt: string | null
  feedback: OrderFeedbackView | null
  tip: { amountCents: number; paidAt: string | null } | null
  checkoutStarted: boolean
  status: OrderStatus
  originalityScore: number | null
  instructions: string
  files: OrderFileView[]
}

export type AdminOrderView = OrderView & {
  clientId: string
  clientEmail: string
  clientName: string | null
  awaitingReply: boolean
  detailsRevision: number
}

export type OrderMessageView = {
  id: number
  sender: 'client' | 'support'
  supportName: string | null
  supportAvatarId: string | null
  body: string
  at: string
  readAt: string | null
  fileUploaded: boolean
}

const allowedUploadExtensions = [
  'pdf',
  'doc',
  'docx',
  'odt',
  'rtf',
  'txt',
  'md',
  'ppt',
  'pptx',
  'odp',
  'xls',
  'xlsx',
  'ods',
  'csv',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'tif',
  'tiff',
  'heic',
  'mp3',
  'm4a',
  'wav',
  'mp4',
  'mov',
  'webm',
  'zip',
  '7z',
  'rar',
]
export const orderFileAccept = allowedUploadExtensions
  .map((extension) => `.${extension}`)
  .join(',')

export function checkOrderFile(file: File) {
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase() ?? ''
  return (
    file.name.length <= 200 &&
    file.size > 0 &&
    file.size <= MAX_FILE_BYTES &&
    allowedUploadExtensions.includes(extension)
  )
}
