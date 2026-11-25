import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { customerGreeting, supportSenderLabel, withoutCustomerGreeting } from '@/lib/customer-greeting'
import { LocalTime } from './local-time'

type Message = {
  id: number
  sender: string
  supportName: string | null
  body: string
  at: string
  readAt?: string | null
}

function mergeMessages(current: Message[] | null, rows: Message[]) {
  if (!current) return rows
  if ((rows.at(-1)?.id ?? 0) < (current.at(-1)?.id ?? 0)) return current
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

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      try {
        if (!document.hidden) {
          const rows = await load()
          if (active) {
            setMessages((current) => mergeMessages(current, rows))
            setLoadError(false)
            setReadError(false)
          }
        }
      } catch {
        if (active) setLoadError(true)
      } finally {
        if (active) timer = setTimeout(poll, 6000)
      }
    }
    void poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [load])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!draft || pending) return
    setPending(true)
    setSendError(false)
    try {
      await send(draft)
      setBody('')
      if (unreadThrough) void confirmRead(unreadThrough)
      try {
        const rows = await load()
        setMessages((current) => mergeMessages(current, rows))
        setLoadError(false)
      } catch {
        setLoadError(true)
      }
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
            const label = fromSupport
              ? supportSenderLabel(message.supportName)
              : ownMessage ? ownLabel : otherLabel
            return (
              <li key={message.id} className={`rounded-md p-2 ${ownMessage ? 'bg-secondary' : 'bg-card'}`}>
                <div className="mb-0.5 flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-xs font-semibold">{label}</p>
                  <LocalTime at={message.at} className="text-xs text-muted-foreground" />
                </div>
                {fromSupport && <p className="mb-2 text-sm">{customerGreeting}</p>}
                <p className="whitespace-pre-wrap break-words text-sm">
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
            rows={2}
            maxLength={3000}
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
