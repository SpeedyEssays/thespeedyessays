import { useCallback, useEffect, useRef, useState } from 'react'
import { MessageCircle, Volume2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatThread } from '@/components/chat-thread'
import { markVisitorChatRead, readVisitorChat, sendVisitorChat } from '@/lib/chat.functions'
import { getOnlineSupport } from '@/lib/staff-presence.functions'
import { useInboxData } from '@/lib/use-inbox-data'

const load = () => readVisitorChat()
const send = (body: string) => sendVisitorChat({ data: { body } })
const markRead = (through: number) => markVisitorChatRead({ data: { through } })
const greeting = 'Hi there, how can we help you?'
const priceGreeting = 'Looking for a better price? Tell me what you need, and I’ll see what I can do.'
const greetingDismissed = 'se-chat-greeting-dismissed'
const alertPlayed = 'se-chat-pop-played'

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
  const audio = useRef<HTMLAudioElement>(null)
  const played = useRef(false)
  const playing = useRef(false)
  const { data: availability, error } = useInboxData(getOnlineSupport, 30_000, showGreeting || open)
  const supportName = error ? null : availability?.name

  const playAlert = useCallback((replay = false) => {
    const clip = audio.current
    if (!clip || playing.current || !clip.paused || document.hidden) return
    if (!replay) {
      if (played.current) return
      try {
        if (sessionStorage.getItem(alertPlayed)) return
      } catch {
        // The in-memory flag still prevents repeat playback on this page.
      }
    }
    playing.current = true
    clip.currentTime = 0
    void clip.play().then(() => {
      played.current = true
      try {
        sessionStorage.setItem(alertPlayed, '1')
      } catch {
        // Storage is optional for the alert.
      }
    }).catch(() => {
      // Playback can be retried from a user interaction.
    }).finally(() => {
      playing.current = false
    })
  }, [])

  useEffect(() => {
    try {
      if (sessionStorage.getItem(greetingDismissed)) return
    } catch {
      // The greeting still works when browser storage is unavailable.
    }
    greetingTimer.current = window.setTimeout(() => setShowGreeting(true), 900)
    return () => window.clearTimeout(greetingTimer.current)
  }, [])

  useEffect(() => {
    if (!showGreeting || open) return
    function afterInteraction(event: MouseEvent) {
      if (event.target instanceof Element && event.target.closest('[data-chat-control]')) return
      playAlert()
    }
    playAlert()
    document.addEventListener('click', afterInteraction)
    return () => document.removeEventListener('click', afterInteraction)
  }, [open, showGreeting, playAlert])

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
      <audio ref={audio} src="/chat-pop.mp3" preload="none" />
      {showGreeting && !open && (
        <aside
          aria-label="Live chat greeting"
          className="mb-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border bg-card p-3 shadow-lg"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="pt-1 text-sm" aria-live="polite">
              {supportName ? (
                <>
                  <p className="mb-1 flex items-center gap-2 font-semibold">
                    <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />
                    {supportName} is online
                  </p>
                  <p>{priceGreeting}</p>
                </>
              ) : (
                <p>{greeting}</p>
              )}
            </div>
            <div className="flex shrink-0">
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Play chat alert"
                data-chat-control
                onClick={() => playAlert(true)}
              >
                <Volume2 />
              </Button>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Dismiss chat greeting"
                data-chat-control
                onClick={() => {
                  audio.current?.pause()
                  dismissGreeting()
                }}
              >
                <X />
              </Button>
            </div>
          </div>
        </aside>
      )}
      {open && (
        <aside
          id="support-chat"
          aria-label="Live chat"
          className="mb-3 max-h-[calc(100dvh-5rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-card p-4 shadow-xl"
        >
          <h2 className="mb-3 text-lg font-semibold">Live chat</h2>
          {supportName && (
            <p className="mb-3 flex items-center gap-2 text-sm font-medium">
              <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />
              {supportName} is online
            </p>
          )}
          <SupportChat />
        </aside>
      )}
      <Button
        type="button"
        className="ml-auto flex rounded-full shadow-lg"
        aria-expanded={open}
        aria-controls={open ? 'support-chat' : undefined}
        data-chat-control
        onClick={() => {
          if (!open) playAlert()
          dismissGreeting()
          setOpen(!open)
        }}
      >
        {open ? <X /> : <MessageCircle />} {open ? 'Close chat' : 'Live chat'}
      </Button>
    </div>
  )
}
