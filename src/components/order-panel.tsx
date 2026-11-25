import { useCallback, useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ChatThread } from '@/components/chat-thread'
import { OrderFeedbackForm } from '@/components/order-feedback-form'
import { AddFilePreview, OrderFileUpload } from '@/components/order-file-upload'
import {
  approveOrder,
  getOrderMessages,
  markOrderMessagesRead,
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
import { assignmentTypeLabel, formatOrderLength, formatUSD, orderServices } from '@/lib/pricing'
import { orderLanguages, orderSoftware } from '@/lib/order-requirements'
import { refreshPayment, startCheckout } from '@/lib/payments.functions'

export function OrderPanel({
  order,
  staff = false,
  checkout = false,
  allowApproval = false,
  replyNotice,
  onRead,
}: {
  order: OrderView
  staff?: boolean
  checkout?: boolean
  allowApproval?: boolean
  replyNotice?: string
  onRead?: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState('')
  const [showRevision, setShowRevision] = useState(false)
  const [expiredDeadline, setExpiredDeadline] = useState<number | null>(null)
  const deadline = orderRevisionDeadline(order)
  const revisionExpired = order.revisionStatus === 'expired' ||
    (order.revisionStatus === 'available' && deadline !== null && expiredDeadline === deadline)
  const canRevise = order.revisionStatus === 'available' && !revisionExpired

  useEffect(() => {
    if (order.revisionStatus !== 'available' || deadline === null) return
    const timer = window.setTimeout(() => setExpiredDeadline(deadline), Math.max(0, deadline - Date.now()))
    return () => window.clearTimeout(timer)
  }, [deadline, order.revisionStatus])

  const load = useCallback(
    () => getOrderMessages({ data: { code: order.code } }),
    [order.code],
  )
  const send = useCallback(
    (body: string) =>
      sendOrderMessage({ data: { code: order.code, body, asSupport: staff } }),
    [order.code, staff],
  )
  const markRead = useCallback(
    (through: number) =>
      markOrderMessagesRead({ data: { code: order.code, through, asSupport: staff } }),
    [order.code, staff],
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
  const active = !['cancelled', 'completed', 'approved'].includes(order.status)
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
    allowApproval &&
    order.status === 'completed' &&
    Boolean(order.deliveredAt) &&
    staffFiles.some((file) => file.kind === 'final')
  const hasPreview = staffFiles.some((file) => file.kind === 'final' && file.access === 'preview')

  return (
    <section
      className="min-w-0 space-y-6 rounded-xl border bg-card p-5 sm:p-6"
      aria-label={order.code}
    >
      <div>
        <p className="text-sm font-medium">
          {order.code} · {statusMeta[order.status]?.label ?? order.status}
        </p>
        <h2 className="mt-2 break-words text-2xl font-semibold">
          {order.title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {assignmentTypeLabel(order.type)} · {order.subject} · {order.level} · {order.style} ·{' '}
          {formatOrderLength(order.pages, order.wordCount, order.slideCount)}
        </p>
        {order.service !== 'writing' && (
          <p className="mt-1 text-sm">{orderServices[order.service].label}</p>
        )}
        {order.language && <p className="mt-1 text-sm">Language · {orderLanguages[order.language]}</p>}
        {order.software && (
          <p className="mt-1 break-words text-sm">
            Software · {order.softwareDetails || orderSoftware[order.software]}
            {order.softwareFeeCents > 0 && ` (+${formatUSD(order.softwareFeeCents / 100)} USD)`}
          </p>
        )}
        <p className="mt-1 text-sm">
          {formatUSD(order.price)} USD ·{' '}
          {!staff &&
          checkout &&
          order.status === 'awaiting-payment' &&
          !order.agreedDueAt
            ? 'Deadline starts after payment'
            : `Due ${order.dueAt.slice(0, 16).replace('T', ' ')} UTC`}
        </p>
        {order.instructions && (
          <p className="mt-3 whitespace-pre-wrap break-words text-sm">
            {order.instructions}
          </p>
        )}
      </div>
      {!staff && checkout && payable && (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const { url } = await startCheckout({
                  data: { code: order.code },
                })
                window.location.assign(url)
              })
            }
          >
            Pay {formatUSD(order.price)} USD
          </Button>
          {order.checkoutStarted && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const { paid } = await refreshPayment({
                    data: { code: order.code },
                  })
                  if (!paid)
                    throw new Error('Payment has not been confirmed yet.')
                  await router.invalidate()
                  setNotice('Payment confirmed.')
                })
              }
            >
              Check payment status
            </Button>
          )}
        </div>
      )}
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
        {!staff && active && <OrderFileUpload code={order.code} staff={false} />}
      </section>
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
                  onClick={() => setShowRevision((open) => !open)}
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
                  void run(async () => {
                    await requestRevision({
                      data: { code: order.code, deliveryVersion: order.deliveryVersion, notes: revision },
                    })
                    setRevision('')
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
                <Button size="sm" variant="destructive" type="submit" disabled={busy}>
                  Send revision request
                </Button>
              </form>
            )}
          </div>
        )}
      </section>
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
      {!staff && allowApproval && order.approvedAt && (
        <OrderFeedbackForm code={order.code} feedback={order.feedback} />
      )}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">
          {staff ? 'Customer messages' : 'Order messages'}
        </h3>
        <ChatThread
          load={load}
          send={send}
          markRead={markRead}
          onRead={onRead}
          ownSender={staff ? 'support' : 'client'}
          ownLabel={staff ? 'Support' : 'You'}
          otherLabel={staff ? 'Customer' : 'Support'}
          emptyText="No messages on this order yet."
          replyNotice={replyNotice}
        />
      </section>
    </section>
  )
}

function OrderFileList({ files, code, staff }: { files: OrderFileView[]; code: string; staff: boolean }) {
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
