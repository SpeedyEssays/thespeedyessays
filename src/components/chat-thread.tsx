import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { LocalTime } from './local-time'

type Message = {
  id: number
  sender: string
  supportName: string | null
  body: string
  at: string
}

export function ChatThread({
  load,
  send,
  ownSender,
  ownLabel = 'You',
  otherLabel,
  emptyText,
  replyNotice,
}: {
  load: () => Promise<Message[]>
  send: (body: string) => Promise<unknown>
  ownSender: string
  ownLabel?: string
  otherLabel: string
  emptyText: string
  replyNotice?: string
}) {
  const [messages, setMessages] = useState<Message[] | null>(null)
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const [sendError, setSendError] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const lastMessageId = messages?.at(-1)?.id

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
            setMessages((current) =>
              !current || (rows.at(-1)?.id ?? 0) >= (current.at(-1)?.id ?? 0)
                ? rows
                : current,
            )
            setLoadError(false)
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
    if (!body.trim() || pending) return
    setPending(true)
    setSendError(false)
    try {
      await send(body)
      setBody('')
      try {
        const rows = await load()
        setMessages((current) =>
          !current || (rows.at(-1)?.id ?? 0) >= (current.at(-1)?.id ?? 0)
            ? rows
            : current,
        )
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
          {messages?.map((message) => (
            <li
              key={message.id}
              className={`rounded-md p-2 ${message.sender === ownSender ? 'bg-secondary' : 'bg-card'}`}
            >
              <div className="mb-0.5 flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-xs font-semibold">
                  {message.supportName
                    ? `${message.supportName} Support`
                    : message.sender === ownSender
                      ? ownLabel
                      : otherLabel}
                </p>
                <LocalTime at={message.at} className="text-xs text-muted-foreground" />
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">
                {message.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
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
          <Textarea
            aria-label="Message"
            placeholder="Write a message"
            rows={2}
            maxLength={3000}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            required
          />
          <Button disabled={pending || !body.trim()} size="sm">
            {pending ? 'Sending…' : 'Send message'}
          </Button>
        </form>
      )}
    </div>
  )
}
