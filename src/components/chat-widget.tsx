import { useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatThread } from '@/components/chat-thread'
import { readVisitorChat, sendVisitorChat } from '@/lib/chat.functions'

const load = () => readVisitorChat()
const send = (body: string) => sendVisitorChat({ data: { body } })

export function SupportChat() {
  return (
    <ChatThread
      load={load}
      send={send}
      ownSender="visitor"
      otherLabel="SpeedyEssays support"
      emptyText="Send us a message here. Check this chat for our reply."
    />
  )
}

export function ChatWidget() {
  const [open, setOpen] = useState(false)
  return (
    <div className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">
      {open && (
        <aside
          id="support-chat"
          aria-label="Support chat"
          className="mb-3 w-[min(24rem,calc(100vw-2rem))] rounded-xl border bg-card p-4 shadow-xl"
        >
          <h2 className="mb-3 text-lg font-semibold">Support chat</h2>
          <SupportChat />
        </aside>
      )}
      <Button
        className="ml-auto flex rounded-full shadow-lg"
        aria-expanded={open}
        aria-controls={open ? 'support-chat' : undefined}
        onClick={() => setOpen(!open)}
      >
        {open ? <X /> : <MessageCircle />}{' '}
        {open ? 'Close chat' : 'Chat with support'}
      </Button>
    </div>
  )
}
