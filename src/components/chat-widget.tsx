import { useEffect, useRef, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatThread } from '@/components/chat-thread'
import { markVisitorChatRead, readVisitorChat, sendVisitorChat } from '@/lib/chat.functions'

const load = () => readVisitorChat()
const send = (body: string) => sendVisitorChat({ data: { body } })
const markRead = (through: number) => markVisitorChatRead({ data: { through } })
const greeting = 'Hi! Let us know how we can help.'
const greetingDismissed = 'se-chat-greeting-dismissed'

export function SupportChat({ onRead }: { onRead?: () => void }) {
  return (
    <ChatThread
      load={load}
      send={send}
      markRead={markRead}
      onRead={onRead}
      ownSender="visitor"
      otherLabel="Support"
      emptyText={greeting}
    />
  )
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [showGreeting, setShowGreeting] = useState(false)
  const greetingTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    try {
      if (sessionStorage.getItem(greetingDismissed)) return
    } catch {
      // The greeting still works when browser storage is unavailable.
    }
    greetingTimer.current = window.setTimeout(() => setShowGreeting(true), 900)
    return () => window.clearTimeout(greetingTimer.current)
  }, [])

  function dismissGreeting() {
    window.clearTimeout(greetingTimer.current)
    setShowGreeting(false)
    try {
      sessionStorage.setItem(greetingDismissed, '1')
    } catch {
      // The user can still close the greeting for this page.
    }
  }

  return (
    <div className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">
      {showGreeting && !open && (
        <aside
          aria-label="Live chat greeting"
          className="mb-2 flex max-w-[calc(100vw-2rem)] items-start gap-2 rounded-xl border bg-card py-2 pr-1 pl-3 shadow-lg"
        >
          <p className="self-center text-sm">{greeting}</p>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Dismiss chat greeting"
            onClick={dismissGreeting}
          >
            <X />
          </Button>
        </aside>
      )}
      {open && (
        <aside
          id="support-chat"
          aria-label="Live chat"
          className="mb-3 max-h-[calc(100dvh-5rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-card p-4 shadow-xl"
        >
          <h2 className="mb-3 text-lg font-semibold">Live chat</h2>
          <SupportChat />
        </aside>
      )}
      <Button
        type="button"
        className="ml-auto flex rounded-full shadow-lg"
        aria-expanded={open}
        aria-controls={open ? 'support-chat' : undefined}
        onClick={() => {
          dismissGreeting()
          setOpen(!open)
        }}
      >
        {open ? <X /> : <MessageCircle />} {open ? 'Close chat' : 'Live chat'}
      </Button>
    </div>
  )
}
