import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { customerGreeting, supportSenderLabel, withoutCustomerGreeting } from '@/lib/customer-greeting'
import { LocalTime } from './local-time'
import { RemoveFromPortal } from './remove-from-portal'
import { StaffAvatar } from './staff-avatar'

type Message = {
  id: number
  sender: string
  supportName: string | null
  supportAvatarId?: string | null
  body: string
  at: string
  readAt?: string | null
  fileUploaded?: boolean
}

function mergeMessages(current: Message[] | null, rows: Message[]) {
  if (!current) return rows
  const seen = new Map(current.map(({ id, readAt }) => [id, readAt]))
  return rows.map((row) => ({
    ...row,
    readAt: row.readAt ?? seen.get(row.id) ?? row.readAt,
  }))
}

export function ChatThread({
  load,
  send,
  markRead,
  onRead,
  removeReply,
  ownSender,
  ownLabel = 'You',
  otherLabel,
  emptyText,
  replyNotice,
}: {
  load: () => Promise<Message[]>
  send: (body: string) => Promise<unknown>
  markRead?: (through: number) => Promise<unknown>
  onRead?: () => void
  removeReply?: (id: number) => Promise<unknown>
  ownSender: string
  ownLabel?: string
  otherLabel: string
  emptyText: string
  replyNotice?: string
}) {
  const composingAsSupport = ownSender === 'agent' || ownSender === 'support'
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [body, setBody] = useState('')
  const draft = composingAsSupport ? withoutCustomerGreeting(body) : body.trim()
  const [pending, setPending] = useState(false)
  const [sendError, setSendError] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [inView, setInView] = useState(false)
  const [readError, setReadError] = useState(false)
  const [reading, setReading] = useState(false)
  const [markedThrough, setMarkedThrough] = useState(0)
  const log = useRef<HTMLDivElement>(null)
  const markPending = useRef(false)
  const latestLoad = useRef(0)
  const lastMessageId = messages?.at(-1)?.id
  const unreadThrough = messages?.reduce<number | undefined>(
    (latest, message) =>
      message.sender !== ownSender && message.readAt === null ? message.id : latest,
    undefined,
  )

  const confirmRead = useCallback(async (through: number) => {
    if (!markRead || markPending.current || through <= markedThrough) return
    markPending.current = true
    setReading(true)
    setReadError(false)
    try {
      await markRead(through)
      setMarkedThrough(through)
      onRead?.()
    } catch {
      setReadError(true)
    } finally {
      markPending.current = false
      setReading(false)
    }
  }, [markRead, markedThrough, onRead])

  useEffect(() => {
    if (!markRead || !log.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting && entry.intersectionRatio >= 0.25)
    }, { threshold: 0.25 })
    observer.observe(log.current)
    return () => observer.disconnect()
  }, [markRead])

  useEffect(() => {
    if (!inView || readError || reading || !unreadThrough) return
    const frame = requestAnimationFrame(() => {
      if (!document.hidden && document.hasFocus()) void confirmRead(unreadThrough)
    })
    return () => cancelAnimationFrame(frame)
  }, [messages, inView, readError, reading, unreadThrough, confirmRead])

  useEffect(() => {
    if (lastMessageId && log.current)
      log.current.scrollTop = log.current.scrollHeight
  }, [lastMessageId])

  const refresh = useCallback(async (isActive: () => boolean = () => true) => {
    const request = ++latestLoad.current
    try {
      const rows = await load()
      if (!isActive() || request !== latestLoad.current) return
      setMessages((current) => mergeMessages(current, rows))
      setLoadError(false)
      setReadError(false)
    } catch {
      if (isActive() && request === latestLoad.current) setLoadError(true)
    }
  }, [load])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      if (!document.hidden) await refresh(() => active)
      if (active) timer = setTimeout(poll, 6000)
    }
    void poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [refresh])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft || pending) return
    setPending(true)
    setSendError(false)
    try {
      await send(draft)
      setBody('')
      if (unreadThrough) void confirmRead(unreadThrough)
      await refresh()
    } catch {
      setSendError(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-3">
      <div
        ref={log}
        className="max-h-72 overflow-auto rounded-lg border bg-muted/30 p-3"
        role="log"
        aria-label="Conversation"
      >
        {messages === null && !loadError && (
          <p className="text-sm text-muted-foreground">Loading messages…</p>
        )}
        {messages?.length === 0 && (
          <p className="text-sm text-muted-foreground">{emptyText}</p>
        )}
        <ol className="space-y-3">
          {messages?.map((message) => {
            const ownMessage = message.sender === ownSender
            const fromSupport = message.sender === 'agent' || message.sender === 'support'
            const label = message.fileUploaded ? 'File upload' : fromSupport
              ? supportSenderLabel(message.supportName) : ownMessage ? ownLabel : otherLabel
            return (
              <li
                key={message.id}
                className={`w-fit min-w-32 max-w-[94%] rounded-lg border px-3 py-2 ${
                  fromSupport ? 'border-chat-support-border bg-chat-support' : 'border-chat-customer-border bg-chat-customer'
                } ${ownMessage ? 'ml-auto rounded-tr-sm' : 'mr-auto rounded-tl-sm'}`}
              >
                <div className="mb-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="flex min-w-0 items-center gap-2">
                    {fromSupport && <StaffAvatar avatarId={message.supportAvatarId} name={message.supportName} />}
                    <p className="break-words text-xs font-semibold">{label}</p>
                  </div>
                  <LocalTime at={message.at} className="text-xs text-muted-foreground" />
                </div>
                {fromSupport && <p className="mb-2 text-sm">{customerGreeting}</p>}
                <p className="wrap-anywhere whitespace-pre-wrap text-sm leading-relaxed">
                  {fromSupport ? withoutCustomerGreeting(message.body) : message.body}
                </p>
                {ownMessage && message.readAt !== undefined && (
                  <p className={`mt-1 text-right text-xs ${
                    message.readAt
                      ? 'font-semibold text-sky-700 dark:text-sky-300'
                      : 'text-muted-foreground'
                  }`}>
                    {message.readAt ? 'Read' : 'Delivered'}
                  </p>
                )}
                {removeReply && fromSupport && ownMessage && (
                  <div className="mt-2 flex justify-end">
                    <RemoveFromPortal item="message" onRemove={async () => {
                      await removeReply(message.id)
                      setMessages((current) => current?.filter(({ id }) => id !== message.id) ?? null)
                      onRead?.()
                      void refresh()
                    }} />
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      </div>
      {markRead && unreadThrough && unreadThrough > markedThrough && lastMessageId && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={reading}
          onClick={() => void confirmRead(lastMessageId)}
        >
          Mark as read
        </Button>
      )}
      {readError && (
        <p className="text-sm text-destructive" role="status">
          Couldn’t mark the messages as read. Try again.
        </p>
      )}
      {loadError && (
        <p className="text-sm text-destructive" role="status">
          Messages couldn’t load. Retrying…
        </p>
      )}
      {sendError && (
        <p className="text-sm text-destructive" role="alert">
          Message couldn’t be sent. Please try again.
        </p>
      )}
      {replyNotice ? (
        <p className="text-sm text-muted-foreground">{replyNotice}</p>
      ) : (
        <form onSubmit={submit} className="space-y-2">
          {composingAsSupport && <p className="text-sm font-medium">{customerGreeting}</p>}
          <Textarea
            aria-label="Message"
            placeholder="Write a message"
            className="max-h-48 overflow-y-auto"
            rows={2}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          <Button disabled={pending || !draft} size="sm">
            {pending ? 'Sending…' : 'Send message'}
          </Button>
        </form>
      )}
    </div>
  )
}
