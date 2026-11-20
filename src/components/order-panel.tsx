import { useCallback, useRef, useState, type FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChatThread } from '@/components/chat-thread'
import { uploadOrderFile } from '@/lib/files.functions'
import {
  getOrderMessages,
  requestRevision,
  sendOrderMessage,
  updateOrderStatus,
} from '@/lib/orders.functions'
import {
  checkOrderFile,
  formatBytes,
  orderFileAccept,
  statusMeta,
  type FileKind,
  type OrderView,
} from '@/lib/orders'
import { formatUSD } from '@/lib/pricing'
import { refreshPayment, startCheckout } from '@/lib/payments.functions'

export function OrderPanel({
  order,
  staff = false,
  checkout = false,
}: {
  order: OrderView
  staff?: boolean
  checkout?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState('')
  const [kind, setKind] = useState<FileKind>(staff ? 'final' : 'brief')
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadId = useRef<string | null>(null)
  const load = useCallback(() => getOrderMessages({ data: { code: order.code } }), [order.code])
  const send = useCallback(
    (body: string) => sendOrderMessage({ data: { code: order.code, body, asSupport: staff } }),
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
      setProblem(error instanceof Error ? error.message : 'The update failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const file = fileInput.current?.files?.[0]
    if (!file || !checkOrderFile(file)) {
      setProblem('Choose a supported file up to 4 MB.')
      return
    }
    const data = new FormData()
    data.set('code', order.code)
    data.set('kind', kind)
    data.set('file', file)
    uploadId.current ??= crypto.randomUUID()
    data.set('uploadId', uploadId.current)
    void run(async () => {
      await uploadOrderFile({ data })
      if (fileInput.current) fileInput.current.value = ''
      uploadId.current = null
    }, 'File uploaded.')
  }

  const payable = order.status === 'awaiting-payment'
  const active = !!order.paidAt && !['cancelled', 'completed'].includes(order.status)

  return (
    <section className="min-w-0 space-y-6 rounded-xl border bg-card p-5 sm:p-6" aria-label={order.code}>
      <div>
        <p className="text-sm font-medium">
          {order.code} · {statusMeta[order.status]?.label ?? order.status}
        </p>
        <h2 className="mt-2 break-words text-2xl font-semibold">{order.title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {order.type} · {order.subject} · {order.level} · {order.style} · {order.pages} pages
        </p>
        <p className="mt-1 text-sm">
          {formatUSD(order.price)} USD ·{' '}
          {order.paidAt
            ? `Due ${new Date(order.dueAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`
            : 'Deadline starts after payment'}
        </p>
        {order.instructions && (
          <p className="mt-3 whitespace-pre-wrap break-words text-sm">{order.instructions}</p>
        )}
      </div>
      {!staff && payable && (
        <div>
          {checkout ? (
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const { url } = await startCheckout({ data: { code: order.code } })
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
                      const { paid } = await refreshPayment({ data: { code: order.code } })
                      if (!paid) throw new Error('Payment has not been confirmed yet.')
                      await router.invalidate()
                      setNotice('Payment confirmed.')
                    })
                  }
                >
                  Check payment status
                </Button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Online checkout is unavailable. Contact support about this order.
            </p>
          )}
        </div>
      )}
      <section>
        <h3 className="text-lg font-semibold">Files</h3>
        {order.files.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">No files uploaded yet.</p>
        )}
        <ul className="mt-2 space-y-2">
          {order.files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {file.kind === 'brief'
                    ? 'Customer brief'
                    : file.kind === 'report'
                      ? 'Originality report'
                      : file.kind === 'final'
                        ? 'Final copy'
                        : 'Draft'}{' '}
                  · {formatBytes(file.size)}
                </p>
              </div>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/files/${file.id}`}>Download</a>
              </Button>
            </li>
          ))}
        </ul>
        {(staff ? active : payable) && (
          <form className="mt-4 space-y-2" onSubmit={upload}>
            <Label htmlFor="order-upload">
              {staff ? 'Upload deliverable' : 'Upload a brief or supporting file'} (up to 4 MB)
            </Label>
            {staff && (
              <select
                aria-label="File type"
                className="ml-2 rounded border bg-background px-2 py-1 text-sm"
                value={kind}
                disabled={busy}
                onChange={(event) => {
                  setKind(event.target.value as FileKind)
                  uploadId.current = null
                }}
              >
                <option value="final">Final copy</option>
                <option value="paper">Draft</option>
                <option value="report">Originality report</option>
              </select>
            )}
            <Input
              ref={fileInput}
              id="order-upload"
              type="file"
              accept={orderFileAccept}
              required
              disabled={busy}
              onChange={() => {
                uploadId.current = null
              }}
            />
            <Button variant="outline" size="sm" disabled={busy}>
              Upload file
            </Button>
          </form>
        )}
      </section>
      {staff && active && (
        <div className="flex flex-wrap gap-2">
          {(['in-progress', 'draft-ready', 'completed'] as const)
            .filter((status) => status !== order.status)
            .map((status) => (
              <Button
                key={status}
                size="sm"
                variant={status === 'completed' ? 'default' : 'outline'}
                disabled={busy}
                onClick={() =>
                  void run(
                    () => updateOrderStatus({ data: { code: order.code, status } }),
                    `Updated to ${statusMeta[status].label.toLowerCase()}.`,
                  )
                }
              >
                {status === 'completed'
                  ? 'Mark as delivered'
                  : `Mark ${statusMeta[status].label.toLowerCase()}`}
              </Button>
            ))}
        </div>
      )}
      {staff && payable && !order.checkoutStarted && (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(
              () => updateOrderStatus({ data: { code: order.code, status: 'cancelled' } }),
              'Order cancelled.',
            )
          }
        >
          Cancel unpaid order
        </Button>
      )}
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
      {!staff && ['draft-ready', 'completed'].includes(order.status) && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              await requestRevision({ data: { code: order.code, notes: revision } })
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
        <h3 className="text-lg font-semibold">{staff ? 'Customer messages' : 'Order messages'}</h3>
        <ChatThread
          load={load}
          send={send}
          ownSender={staff ? 'support' : 'client'}
          otherLabel={staff ? 'Customer' : 'SpeedyEssays support'}
          emptyText="No messages on this order yet."
        />
      </section>
    </section>
  )
}
