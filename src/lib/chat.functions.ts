import { randomUUID } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie, setResponseHeader } from '@tanstack/react-start/server'
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import { chatConversations, chatMessages } from '../../db/schema'
import { requireAdmin } from './identity.functions'

const cookieName = 'se_support'
const messageInput = z.object({ body: z.string().trim().min(1).max(3000) })
const staffThread = z.object({ id: z.uuid() })

async function messagesFor(conversationId: string) {
  return getDb()
    .select({
      id: chatMessages.id,
      sender: chatMessages.sender,
      body: chatMessages.body,
      at: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(desc(chatMessages.id))
    .limit(200)
    .then((rows) => rows.reverse().map((row) => ({ ...row, at: row.at.toISOString() })))
}

function visitorToken() {
  const token = z.uuid().safeParse(getCookie(cookieName))
  return token.success ? token.data : null
}

export const readVisitorChat = createServerFn({ method: 'GET' }).handler(async () => {
  setResponseHeader('Cache-Control', 'private, no-store')
  const token = visitorToken()
  if (!token) return []
  const [conversation] = await getDb()
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(eq(chatConversations.visitorToken, token))
  return conversation ? messagesFor(conversation.id) : []
})

export const sendVisitorChat = createServerFn({ method: 'POST' })
  .validator(messageInput)
  .handler(async ({ data }) => {
    const token = visitorToken() ?? randomUUID()
    const db = getDb()
    await db.transaction(async (tx) => {
      const [conversation] = await tx
        .insert(chatConversations)
        .values({ visitorToken: token })
        .onConflictDoUpdate({
          target: chatConversations.visitorToken,
          set: { lastMessageAt: sql`now()`, closed: false },
        })
        .returning()
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, conversation.id),
            eq(chatMessages.sender, 'visitor'),
            gte(chatMessages.createdAt, new Date(Date.now() - 60_000)),
          ),
        )
      if (count >= 8) throw new Error('Please wait a minute before sending another message.')
      await tx
        .insert(chatMessages)
        .values({ conversationId: conversation.id, sender: 'visitor', body: data.body })
    })
    setCookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 2592000,
    })
    return { ok: true }
  })

export const listSupportChats = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .handler(async () => {
    const rows = await getDb()
      .select({
        id: chatConversations.id,
        at: chatConversations.lastMessageAt,
        latest: sql<
          string | null
        >`(select cm.body from ${chatMessages} cm where cm.conversation_id = ${chatConversations}."id" order by cm.id desc limit 1)`,
        sender: sql<
          string | null
        >`(select cm.sender from ${chatMessages} cm where cm.conversation_id = ${chatConversations}."id" order by cm.id desc limit 1)`,
      })
      .from(chatConversations)
      .orderBy(desc(chatConversations.lastMessageAt), asc(chatConversations.id))
      .limit(200)
    return rows.map((row) => ({ ...row, at: row.at.toISOString() }))
  })

export const readSupportChat = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .validator(staffThread)
  .handler(({ data }) => messagesFor(data.id))

export const sendSupportChat = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(staffThread.extend(messageInput.shape))
  .handler(async ({ data }) => {
    await getDb().transaction(async (tx) => {
      const [conversation] = await tx
        .update(chatConversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(chatConversations.id, data.id))
        .returning({ id: chatConversations.id })
      if (!conversation) throw new Error('Conversation not found.')
      await tx.insert(chatMessages).values({ conversationId: data.id, sender: 'agent', body: data.body })
    })
    return { ok: true }
  })
