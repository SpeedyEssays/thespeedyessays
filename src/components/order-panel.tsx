import { useCallback, useId, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UnreadBadge } from '@/components/chat-indicators'
import { ChatThread } from '@/components/chat-thread'
import { CustomerOrderRequests } from '@/components/customer-order-requests'
import { DeadlineDurationField } from '@/components/deadline-duration-field'
import { OrderDeadline } from '@/components/order-deadline'
import { OrderFeedbackForm } from '@/components/order-feedback-form'
import { AddFilePreview, OrderFileUpload } from '@/components/order-file-upload'
import { OrderPayment } from '@/components/order-payment'
import { OrderTip } from '@/components/order-tip'
import { RemoveFromPortal } from '@/components/remove-from-portal'
import { removeStaffFile } from '@/lib/files.functions'
import { isDeadlinePast } from '@/lib/order-deadline'
import { canLeaveOrderTip } from '@/lib/order-tip'
import {
  approveOrder,
  getOrderMessages,
  markOrderMessagesRead,
  removeOrderReply,
  requestRevision,
  sendOrderMessage,
} from '@/lib/orders.functions'
import {
  canCheckout,
  fileKindLabels,
  fileRequiresApproval,
  formatBytes,
  orderRevisionDeadline,
  staffFileKinds,
  statusMeta,
  type OrderFileView,
  type OrderView,
} from '@/lib/orders'
import { assignmentTypeLabel, deadlines, formatOrderLength, formatUSD, orderServices } from '@/lib/pricing'
import { orderLanguages, orderSoftware } from '@/lib/order-requirements'

export function OrderPanel({
  order,
  now,
  staff = false,
  replyNotice,
  onRead,
  walletBalanceCents,
  canPayTipOnline = false,
  tipCheckout,
  unreadMessages,
}: {
  order: OrderView
  now: number | null
  staff?: boolean
  replyNotice?: string
  onRead?: () => void
  walletBalanceCents?: number
  canPayTipOnline?: boolean
  tipCheckout?: 'return' | 'closed'
  unreadMessages?: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState('')
  const [showRevision, setShowRevision] = useState(false)
  const [revisionHours, setRevisionHours] = useState<number>()
  const revisionWindowEnds = orderRevisionDeadline(order)
  const revisionExpired = order.revisionStatus === 'expired' ||
    (order.revisionStatus === 'available' && revisionWindowEnds !== null && now !== null && now >= revisionWindowEnds)
  const canRevise = order.revisionStatus === 'available' && !revisionExpired
  const needsRevisionDeadline = now !== null && isDeadlinePast(order.dueAt, now)
  const observedFiles = useRef(order.filesRevision)

  const load = useCallback(async () => {
    const thread = await getOrderMessages({ data: { code: order.code, includeFilesRevision: true } })
    if (Array.isArray(thread)) return thread
    const { messages, filesRevision } = thread
    if (filesRevision > Math.max(order.filesRevision, observedFiles.current)) {
      observedFiles.current = filesRevision
      void router.invalidate()
    }
    return messages
  }, [order.code, order.filesRevision, router])
  const send = useCallback(
    (body: string) =>
      sendOrderMessage({ data: { code: order.code, body } }),
    [order.code],
  )
  const markRead = useCallback(
    (through: number) =>
      markOrderMessagesRead({ data: { code: order.code, through } }),
    [order.code],
  )

  async function run(action: () => Promise<unknown>, message?: string) {
    setBusy(true)
    setProblem('')
    setNotice('')
    try {
      await action()
      if (message) {
        setNotice(message)
        await router.invalidate()
      }
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : 'The update failed. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  const payable = canCheckout(order)
  const turnaround = deadlines.find((option) => option.id === order.deadlineOption)?.label
  const length = formatOrderLength(order.pages, order.wordCount, order.slideCount)
  const language = order.language && orderLanguages[order.language]
  const software = order.software && `${order.softwareDetails || orderSoftware[order.software]}${
    order.softwareFeeCents > 0 ? ` (+${formatUSD(order.softwareFeeCents / 100)} USD)` : ''
  }`
  const customerFiles = order.files.filter((file) => file.kind === 'brief')
  const staffFiles = order.files.filter((file) => file.kind !== 'brief')
  const deliveries = staffFileKinds
    .map((type) => ({
      type,
      files: staffFiles.filter((file) => file.kind === type),
    }))
    .filter(({ files }) => files.length > 0)
  const otherFiles = staffFiles.filter((file) => !fileKindLabels[file.kind])
  const showApproval =
    !staff &&
    order.status === 'completed' &&
    Boolean(order.deliveredAt) &&
    staffFiles.some((file) => file.kind === 'final')
  const hasPreview = staffFiles.some((file) => file.kind === 'final' && file.access === 'preview')

  const tipAvailable = Boolean(order.tip) || canLeaveOrderTip(order.status)
  const reviewDelivery = showApproval || canRevise || (order.status === 'approved' && staffFiles.length > 0)
  const [tab, setTab] = useState(tipCheckout ? 'actions' : reviewDelivery ? 'files' : 'overview')

  const details = (
    <div className="space-y-2">
      <h3 className="text-base font-semibold">Order details</h3>
      <OrderDetailTable details={[
        ['Assignment', assignmentTypeLabel(order.type)],
        ['Subject', order.subject],
        ['Academic level', order.level],
        ['Service', orderServices[order.service].label],
        ['Citation style', order.style],
        ['Length', length],
        ['Sources', order.sources],
        ['Language', language || '—'],
        ['Software', software || 'None'],
        ...(staff ? [['Selected turnaround', turnaround ?? order.deadlineOption] as const] : []),
        ...(order.speakerNotes ? [['Speaker notes', 'Separate Word document'] as const] : []),
      ]} />
    </div>
  )

  const uploads = (
    <section
      aria-labelledby="customer-files"
      className="space-y-3 rounded-lg border bg-background p-4"
    >
      <h3 id="customer-files" className="text-lg font-semibold">
        {staff ? 'Customer uploads' : 'Your uploads'}
      </h3>
      {customerFiles.length > 0 ? (
        <OrderFileList files={customerFiles} code={order.code} staff={staff} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {staff
            ? 'The customer hasn’t uploaded any files yet.'
            : 'You haven’t uploaded any files yet.'}
        </p>
      )}
      {!staff && <OrderFileUpload code={order.code} staff={false} />}
    </section>
  )

  const deliveredFiles = (
    <section
      aria-labelledby="staff-files"
      className="space-y-4 rounded-lg border bg-background p-4"
    >
      <h3 id="staff-files" className="text-lg font-semibold">
        {staff ? 'Files for customer' : 'Files from support'}
      </h3>
      {staffFiles.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {staff
            ? 'No files for this customer yet.'
            : 'Files from support will appear here.'}
        </p>
      )}
      {deliveries.map(({ type, files }) => (
        <div key={type} className="space-y-2">
          <h4 className="text-sm font-semibold">{fileKindLabels[type]}</h4>
          <OrderFileList files={files} code={order.code} staff={staff} />
        </div>
      ))}
      {otherFiles.length > 0 && <OrderFileList files={otherFiles} code={order.code} staff={staff} />}
      {staff && order.status !== 'cancelled' && <OrderFileUpload code={order.code} staff />}
      {!staff && (showApproval || canRevise || revisionExpired) && (
        <div className="space-y-3 border-t pt-4">
          {showApproval && (
            <p className="text-sm text-muted-foreground">
              {hasPreview
                ? 'Review the watermarked preview, then approve to unlock the clean copy.'
                : 'Approve the order to unlock the clean copy. You can message support for a preview.'}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {showApproval && (
              <Button
                className="bg-success text-white hover:bg-success/90"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => approveOrder({ data: { code: order.code, deliveryVersion: order.deliveryVersion } }),
                    'Order approved. Your clean files are ready to download.',
                  )
                }
              >
                Approve order
              </Button>
            )}
            {canRevise && (
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                aria-expanded={showRevision}
                onClick={() => {
                  setShowRevision((open) => !open)
                  setRevisionHours(undefined)
                }}
              >
                Request a revision
              </Button>
            )}
          </div>
          {revisionExpired && (
            <p className="text-sm text-muted-foreground">
              The 14-day revision window has ended. Contact support in Order messages for help.
            </p>
          )}
          {canRevise && showRevision && (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (busy || (needsRevisionDeadline && revisionHours === undefined)) return
                void run(async () => {
                  await requestRevision({
                    data: {
                      code: order.code,
                      deliveryVersion: order.deliveryVersion,
                      notes: revision,
                      ...(needsRevisionDeadline ? { deadlineHours: revisionHours } : {}),
                    },
                  })
                  setRevision('')
                  setRevisionHours(undefined)
                  setShowRevision(false)
                }, 'Revision requested.')
              }}
            >
              <Label htmlFor="revision-notes">What needs to change?</Label>
              <Textarea
                id="revision-notes"
                minLength={10}
                maxLength={5000}
                rows={3}
                value={revision}
                onChange={(event) => setRevision(event.target.value)}
                required
              />
              {needsRevisionDeadline && (
                <DeadlineDurationField
                  id="revision-duration"
                  description="The order deadline has passed. Set a turnaround for your revision."
                  disabled={busy}
                  onChange={setRevisionHours}
                />
              )}
              <Button
                size="sm"
                variant="destructive"
                type="submit"
                disabled={busy || (needsRevisionDeadline && revisionHours === undefined)}
              >
                Send revision request
              </Button>
            </form>
          )}
        </div>
      )}
    </section>
  )

  const fileActionStatus = (
    <>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
    </>
  )

  const messages = (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">
        {staff ? 'Customer messages' : 'Order messages'}
      </h3>
      <ChatThread
        load={load}
        send={send}
        markRead={markRead}
        onRead={onRead}
        removeReply={staff ? (messageId) => removeOrderReply({ data: { code: order.code, messageId } }) : undefined}
        ownSender={staff ? 'support' : 'client'}
        ownLabel={staff ? 'Support' : 'You'}
        otherLabel={staff ? 'Customer' : 'Support'}
        emptyText="No messages on this order yet."
        replyNotice={replyNotice}
      />
    </section>
  )

  return (
    <section
      id={staff ? undefined : 'customer-order-details'}
      className="min-w-0 scroll-mt-4 space-y-6 rounded-xl border bg-card p-5 sm:p-6"
      aria-label={order.code}
    >
      <div>
        <p className="text-sm font-medium">
          {order.code} · {statusMeta[order.status]?.label ?? order.status}
        </p>
        <h2 className="mt-2 wrap-anywhere text-2xl font-semibold">
          {order.title}
        </h2>
        <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-2 rounded-lg border bg-background px-3 py-2 text-sm">
          <div>
            <OrderDeadline order={order} now={now} showDate />
            {turnaround && !staff && <p className="mt-1 text-xs text-muted-foreground">Selected turnaround · {turnaround}</p>}
          </div>
          <div>
            <p className="font-semibold">
              {order.priceAdjustment && (
                <del className="mr-2 font-normal text-muted-foreground">{formatUSD(order.priceAdjustment.originalCents / 100)}</del>
              )}
              {formatUSD(order.price)} USD
            </p>
            {order.refundedCents > 0 && (
              <p className="mt-1 text-xs font-medium text-success">{formatUSD(order.refundedCents / 100)} USD refunded</p>
            )}
            {(order.paidAt || payable) && (
              <p className={`text-xs font-medium ${order.paidAt ? 'text-success' : 'text-muted-foreground'}`}>
                {order.paidAt ? 'Payment confirmed' : 'Payment due'}
              </p>
            )}
          </div>
        </div>
        {staff && (
          <div className="mt-4">
            {details}
            {order.instructions && (
              <div className="mt-3">
                <h3 className="mb-1 text-base font-semibold">Instructions</h3>
                <p className="whitespace-pre-wrap break-words text-sm">{order.instructions}</p>
              </div>
            )}
          </div>
        )}
      </div>
      {staff ? (
        <>
          {uploads}
          {deliveredFiles}
          {order.tip?.paidAt && (
            <p className="rounded-lg border bg-background p-4 text-sm font-medium">
              Tip received · {formatUSD(order.tip.amountCents / 100)} USD
            </p>
          )}
          {messages}
        </>
      ) : (
        <>
          {payable && (
            <OrderPayment code={order.code} checkoutStarted={order.checkoutStarted}
              wallet={walletBalanceCents === undefined ? undefined : { balanceCents: walletBalanceCents, priceCents: Math.round(order.price * 100) }} />
          )}
          <Tabs value={tab} onValueChange={setTab} className="gap-4">
            <TabsList aria-label="Order sections" className="grid w-full grid-cols-2 gap-1 group-data-[orientation=horizontal]/tabs:h-auto sm:flex sm:w-fit">
              <TabsTrigger value="overview" className="min-h-9 whitespace-normal">Overview</TabsTrigger>
              <TabsTrigger value="files" className="min-h-9 whitespace-normal">Files &amp; approval</TabsTrigger>
              <TabsTrigger value="messages" className="min-h-9 flex-wrap whitespace-normal">
                Messages <UnreadBadge count={unreadMessages} />
              </TabsTrigger>
              <TabsTrigger value="actions" className="min-h-9 whitespace-normal">Requests &amp; feedback</TabsTrigger>
            </TabsList>
            <TabsContent forceMount hidden={tab !== 'overview'} value="overview" className="min-w-0 space-y-4">
              {order.instructions && <OrderInstructions instructions={order.instructions} />}
              {details}
            </TabsContent>
            <TabsContent forceMount hidden={tab !== 'files'} value="files" className="min-w-0 space-y-4">
              <div className="grid items-start gap-4 lg:grid-cols-2">
                {deliveredFiles}
                {uploads}
              </div>
              {fileActionStatus}
              {tipAvailable && !order.tip?.paidAt && (
                <Button type="button" variant="outline" size="sm" onClick={() => setTab('actions')}>
                  {order.tip ? 'View tip payment' : 'Leave a tip'}
                </Button>
              )}
            </TabsContent>
            <TabsContent forceMount hidden={tab !== 'messages'} value="messages" className="min-w-0">
              {messages}
            </TabsContent>
            <TabsContent forceMount hidden={tab !== 'actions'} value="actions" className="min-w-0 space-y-4">
              <CustomerOrderRequests order={order} onChange={onRead} />
              {order.approvedAt && (
                <OrderFeedbackForm code={order.code} feedback={order.feedback} />
              )}
              {tipAvailable && (
                <OrderTip code={order.code} priceCents={Math.round(order.price * 100)} tip={order.tip}
                  walletBalanceCents={walletBalanceCents ?? 0} canPayOnline={canPayTipOnline} checkout={tipCheckout} />
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </section>
  )
}

function OrderInstructions({ instructions }: { instructions: string }) {
  const contentId = useId()
  const [expanded, setExpanded] = useState(false)
  const lines = instructions.trim().split('\n', 6)
  const preview = Array.from(lines.slice(0, 5).join('\n'))
  const collapsible = lines.length > 5 || preview.length > 360
  return (
    <section className="space-y-2 rounded-lg border bg-background p-4">
      <h3 className="text-base font-semibold">Instructions</h3>
      <p id={contentId} className="whitespace-pre-wrap wrap-anywhere text-sm">
        {expanded || !collapsible ? instructions : `${preview.slice(0, 360).join('').trimEnd()}…`}
      </p>
      {collapsible && (
        <Button type="button" variant="outline" size="sm" aria-controls={contentId}
          aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
          {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </section>
  )
}

function OrderDetailTable({ details }: { details: ReadonlyArray<readonly [string, string | number]> }) {
  return (
    <dl className="grid overflow-hidden rounded-lg border bg-background sm:grid-cols-2">
      {details.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-0.5 border-b border-r px-3 py-2 text-sm">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="break-words font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function OrderFileList({ files, code, staff }: { files: OrderFileView[]; code: string; staff: boolean }) {
  const router = useRouter()
  return (
    <ul className="space-y-2">
      {files.map((file) => {
        const protectedFile = fileRequiresApproval(file.kind)
        const href = `/api/files/${file.id}`
        const previewLink = file.hasPreview && (staff || file.access === 'preview')
        const originalLink = staff || file.access === 'original'
        return (
          <li key={file.id} className="space-y-2 rounded-md border bg-card px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}
                  {file.access === 'pending' && ' · Waiting for delivery'}
                  {file.access === 'preview' && ' · Watermarked preview'}
                  {file.access === 'locked' && ' · Preview needed'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {previewLink && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`${href}?preview=1`} target="_blank" rel="noopener" aria-label={`Open preview of ${file.name}`}>
                      Open preview
                    </a>
                  </Button>
                )}
                {originalLink && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={href} aria-label={`Download ${file.name}`}>
                      {protectedFile ? staff ? 'Download original' : 'Download clean copy' : 'Download'}
                    </a>
                  </Button>
                )}
                {staff && staffFileKinds.some((kind) => kind === file.kind) && (
                  <RemoveFromPortal item="file" name={file.name} onRemove={async () => {
                    await removeStaffFile({ data: { fileId: file.id } })
                    await router.invalidate()
                  }} />
                )}
              </div>
            </div>
            {staff && protectedFile && !file.hasPreview && file.access !== 'original' && (
              <AddFilePreview file={file} code={code} />
            )}
          </li>
        )
      })}
    </ul>
  )
}
