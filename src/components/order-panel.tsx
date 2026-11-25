import { useCallback, useRef, useState, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChatThread } from '@/components/chat-thread'
import { OrderFeedbackForm } from '@/components/order-feedback-form'
import { uploadOrderFile } from '@/lib/files.functions'
import {
  approveOrder,
  getOrderMessages,
  markOrderMessagesRead,
  requestRevision,
  sendOrderMessage,
} from '@/lib/orders.functions'
import {
  canCheckout,
  canCustomerReadFile,
  checkOrderFile,
  fileKindLabels,
  formatBytes,
  MAX_ORDER_FILES_PER_UPLOAD,
  orderFileAccept,
  revisionRequestStatuses,
  staffFileKinds,
  statusMeta,
  type FileKind,
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
  const [kind, setKind] = useState<FileKind>(staff ? 'final' : 'brief')
  const fileInput = useRef<HTMLInputElement>(null)
  const [filesToUpload, setFilesToUpload] = useState<
    { file: File; id: string }[]
  >([])
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

  function selectFiles(files: File[]) {
    setNotice('')
    if (
      files.length > MAX_ORDER_FILES_PER_UPLOAD ||
      files.some((file) => !checkOrderFile(file))
    ) {
      setProblem(
        'Choose up to eight supported files, each no larger than 4 MB.',
      )
      setFilesToUpload([])
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    setProblem('')
    setFilesToUpload(files.map((file) => ({ file, id: crypto.randomUUID() })))
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!filesToUpload.length || busy) return
    setBusy(true)
    setProblem('')
    setNotice('')
    try {
      const failed: typeof filesToUpload = []
      for (const selection of filesToUpload) {
        const data = new FormData()
        data.set('code', order.code)
        data.set('kind', kind)
        data.set('file', selection.file)
        data.set('uploadId', selection.id)
        try {
          await uploadOrderFile({ data })
        } catch {
          failed.push(selection)
        }
      }
      setFilesToUpload(failed)
      if (fileInput.current) fileInput.current.value = ''
      if (failed.length) {
        setProblem(
          `Couldn’t upload: ${failed.map(({ file }) => file.name).join(', ')}. You can retry these files.`,
        )
      }
      if (failed.length !== filesToUpload.length) {
        const uploaded = filesToUpload.length - failed.length
        setNotice(
          uploaded === 1 ? 'File uploaded.' : `${uploaded} files uploaded.`,
        )
        await router.invalidate()
      }
    } catch {
      setProblem('Files were saved. Refresh the order to update the list.')
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
  const uploadForm = (staff ? order.status !== 'cancelled' : active) && (
    <form className="space-y-2" onSubmit={(event) => void upload(event)}>
      {staff && (
        <div className="space-y-2">
          <Label htmlFor="order-file-type">File type</Label>
          <select
            id="order-file-type"
            className="block rounded border bg-background px-2 py-1 text-sm"
            value={kind}
            disabled={busy}
            onChange={(event) => setKind(event.target.value as FileKind)}
          >
            {staffFileKinds.map((type) => (
              <option key={type} value={type}>
                {fileKindLabels[type]}
              </option>
            ))}
          </select>
        </div>
      )}
      <Label htmlFor="order-upload">
        {staff ? 'Choose files for this customer' : 'Choose supporting files'}
      </Label>
      <Input
        ref={fileInput}
        id="order-upload"
        type="file"
        accept={orderFileAccept}
        multiple
        disabled={busy}
        onChange={(event) => selectFiles(Array.from(event.target.files ?? []))}
      />
      <p className="text-xs text-muted-foreground">
        Up to eight files at a time, 4 MB each.
        {staff &&
          !canCustomerReadFile(kind, order.deliveredAt) &&
          ' These files become visible when you mark the order delivered.'}
      </p>
      {filesToUpload.length > 0 && (
        <p className="break-words text-sm">
          {filesToUpload.map(({ file }) => file.name).join(', ')}
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        type="submit"
        disabled={busy || !filesToUpload.length}
      >
        {busy ? 'Uploading…' : 'Upload files'}
      </Button>
    </form>
  )

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
          <OrderFileList files={customerFiles} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {staff
              ? 'The customer hasn’t uploaded any files yet.'
              : 'You haven’t uploaded any files yet.'}
          </p>
        )}
        {!staff && uploadForm}
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
            {staff && !canCustomerReadFile(type, order.deliveredAt) && (
              <p className="text-xs text-muted-foreground">
                Visible to the customer after delivery.
              </p>
            )}
            <OrderFileList files={files} />
          </div>
        ))}
        {otherFiles.length > 0 && <OrderFileList files={otherFiles} />}
        {staff && uploadForm}
        {showApproval && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                () => approveOrder({ data: { code: order.code } }),
                'Order approved. You can leave feedback below.',
              )
            }
          >
            Approve order
          </Button>
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
      {!staff && revisionRequestStatuses.includes(order.status) && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              await requestRevision({
                data: { code: order.code, notes: revision },
              })
              setRevision('')
            }, 'Revision requested.')
          }}
        >
          <Label htmlFor="revision-notes">Revision notes</Label>
          <Input
            id="revision-notes"
            minLength={10}
            maxLength={3000}
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            required
          />
          <Button size="sm" variant="outline" disabled={busy}>
            Request a revision
          </Button>
        </form>
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

function OrderFileList({ files }: { files: OrderFileView[] }) {
  return (
    <ul className="space-y-2">
      {files.map((file) => (
        <li
          key={file.id}
          className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2"
        >
          <div className="min-w-0">
            <p className="break-words text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatBytes(file.size)}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/api/files/${file.id}`}
              aria-label={`Download ${file.name}`}
            >
              Download
            </a>
          </Button>
        </li>
      ))}
    </ul>
  )
}
