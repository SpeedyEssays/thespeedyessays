import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// In-site support chat. The replies are scripted for now; a later milestone
// connects this panel to a live-chat provider (Tawk.to / Zendesk).

type ChatLine = { from: 'agent' | 'you'; text: string }

const quickQuestions = [
  'How fast can you deliver?',
  'Is my order confidential?',
  'Can I change my deadline?',
]

const scripted: Record<string, string> = {
  'How fast can you deliver?': 'We deliver in as little as 8 hours for short papers. Use the price calculator to compare deadlines — urgent orders are prioritised automatically.',
  'Is my order confidential?': 'Completely. Writers only see an anonymous order ID, and we never share your name, email or university.',
  'Can I change my deadline?': 'Yes — tell me your order number and the new deadline and I’ll update it right away. Extending a deadline never costs extra.',
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [lines, setLines] = useState<ChatLine[]>([
    { from: 'agent', text: 'Hi! I’m Elena from the SpeedyEssays support team. Ask me anything about pricing, deadlines or an existing order.' },
  ])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines, open])

  function ask(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    setLines((l) => [...l, { from: 'you', text: trimmed }])
    setDraft('')
    const reply =
      scripted[trimmed] ??
      'Thanks — a support specialist is picking this up now. Typical response time is under 2 minutes, day or night.'
    setTimeout(() => setLines((l) => [...l, { from: 'agent', text: reply }]), 700)
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
      {open && (
        <div
          role="dialog"
          aria-label="Live chat with support"
          className="flex h-[28rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
        >
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <div>
              <p className="text-sm font-semibold">Live support</p>
              <p className="flex items-center gap-1.5 text-xs text-primary-foreground/70">
                <span className="size-2 rounded-full bg-success" /> Online 24/7 · replies in ~2 min
              </p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Close chat"
              className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </div>
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {lines.map((line, i) => (
              <p
                key={i}
                className={cn(
                  'max-w-[85%] rounded-lg px-3 py-2 text-sm',
                  line.from === 'agent' ? 'bg-muted' : 'ml-auto bg-primary text-primary-foreground',
                )}
              >
                {line.text}
              </p>
            ))}
            {lines.length === 1 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {quickQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    className="rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-secondary motion-reduce:transition-none"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
          <form
            className="flex gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault()
              ask(draft)
            }}
          >
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type your message…" aria-label="Message" />
            <Button type="submit" size="icon" aria-label="Send message">
              <Send />
            </Button>
          </form>
        </div>
      )}
      <Button
        size="lg"
        onClick={() => setOpen((o) => !o)}
        className="h-12 rounded-full bg-accent px-5 text-accent-foreground shadow-lg hover:bg-accent/90"
        aria-expanded={open}
      >
        <MessageCircle className="size-5" />
        {open ? 'Close chat' : 'Chat with us 24/7'}
      </Button>
    </div>
  )
}
