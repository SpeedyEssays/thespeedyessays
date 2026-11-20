import { randomUUID } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { and, asc, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import {
  chatConversations,
  chatMessages,
  customerProfiles,
} from '../../db/schema'
import { findCustomerAccount } from './customers.server'
import { requireAdmin } from './identity.functions'
import { readSessionUser, supportChatCookie } from './session.server'
import { supportNameRequired } from './support-name'

const messageInput = z.object({ body: z.string().trim().min(1).max(3000) })
const staffThread = z.object({ id: z.uuid() })

type ChatDb = Pick<
  ReturnType<typeof getDb>,
  'select' | 'insert' | 'update' | 'execute'
>
type CustomerIdentity = { id: string; name: string | null; email: string }

async function messagesFor(conversationId: string, guestOnly = false) {
  return getDb()
    .select({
      id: chatMessages.id,
      sender: chatMessages.sender,
      supportName: chatMessages.supportName,
      body: chatMessages.body,
      at: chatMessages.createdAt,
    })
    .from(chatMessages)
    .innerJoin(chatConversations, eq(chatMessages.conversationId, chatConversations.id))
    .where(and(eq(chatMessages.conversationId, conversationId), guestOnly ? isNull(chatConversations.userId) : undefined))
    .orderBy(desc(chatMessages.id))
    .limit(200)
    .then((rows) =>
      rows.reverse().map((row) => ({ ...row, at: row.at.toISOString() })),
    )
}

function visitorToken() {
  const token = z.uuid().safeParse(getCookie(supportChatCookie))
  return token.success ? token.data : null
}

async function accountConversation(db: ChatDb, userId: string) {
  const [conversation] = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(eq(chatConversations.userId, userId))
    .orderBy(desc(chatConversations.lastMessageAt), asc(chatConversations.id))
    .limit(1)
  return conversation
}

async function openAccountConversation(
  db: ChatDb,
  user: CustomerIdentity,
  token: string | null,
) {
  // Serialize first messages and staff-initiated chats for the same customer.
  await db.execute(
    sql`select pg_advisory_xact_lock(hashtext('speedyessays:chat'), hashtext(${user.id}))`,
  )
  const existing = await accountConversation(db, user.id)
  if (existing) return existing

  const identity = { userId: user.id, name: user.name, email: user.email }
  if (token) {
    const [claimed] = await db
      .update(chatConversations)
      .set(identity)
      .where(
        and(
          eq(chatConversations.visitorToken, token),
          isNull(chatConversations.userId),
        ),
      )
      .returning({ id: chatConversations.id })
    if (claimed) return claimed
  }

  const [created] = await db
    .insert(chatConversations)
    .values({ ...identity, visitorToken: randomUUID() })
    .returning()
  return { id: created.id }
}

async function openGuestConversation(db: ChatDb, token: string) {
  const [conversation] = await db
    .insert(chatConversations)
    .values({ visitorToken: token })
    .onConflictDoUpdate({
      target: chatConversations.visitorToken,
      set: { closed: false },
      setWhere: isNull(chatConversations.userId),
    })
    .returning()
  if (conversation) return conversation

  // A previous guest chat may now belong to an account. Start a new guest thread.
  const [created] = await db
    .insert(chatConversations)
    .values({ visitorToken: randomUUID() })
    .returning()
  return created
}

export const readVisitorChat = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await readSessionUser()
    const token = visitorToken()
    if (user) {
      const conversation = await accountConversation(getDb(), user.id)
      if (conversation) return messagesFor(conversation.id)
    }
    if (!token) return []
    const [guest] = await getDb()
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.visitorToken, token),
          isNull(chatConversations.userId),
        ),
      )
    return guest ? messagesFor(guest.id, true) : []
  },
)

export const sendVisitorChat = createServerFn({ method: 'POST' })
  .validator(messageInput)
  .handler(async ({ data }) => {
    const user = await readSessionUser()
    const token = visitorToken()
    const guestToken = await getDb().transaction(async (tx) => {
      const conversation = user
        ? await openAccountConversation(tx, user, token)
        : await openGuestConversation(tx, token ?? randomUUID())
      await tx
        .update(chatConversations)
        .set({ lastMessageAt: new Date(), closed: false })
        .where(eq(chatConversations.id, conversation.id))

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
      if (count >= 8)
        throw new Error('Please wait a minute before sending another message.')
      await tx
        .insert(chatMessages)
        .values({
          conversationId: conversation.id,
          sender: 'visitor',
          body: data.body,
        })
      return 'visitorToken' in conversation ? conversation.visitorToken : null
    })
    if (typeof guestToken === 'string') {
      setCookie(supportChatCookie, guestToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 2592000,
      })
    }
    return { ok: true }
  })

export const openCustomerChat = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(z.string().min(1).max(128))
  .handler(async ({ data }) => {
    const customer = await findCustomerAccount(data)
    if (!customer) throw new Error('Customer account not found.')
    return getDb().transaction((tx) =>
      openAccountConversation(
        tx,
        {
          id: customer.id,
          name: customer.accountName,
          email: customer.email,
        },
        null,
      ),
    )
  })

export const listSupportChats = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .validator(z.object({ focus: z.uuid().optional() }).optional())
  .handler(async ({ data }) => {
    const rows = await getDb()
      .select({
        id: chatConversations.id,
        userId: chatConversations.userId,
        name: sql<
          string | null
        >`coalesce(${customerProfiles.displayName}, ${chatConversations.name})`,
        email: chatConversations.email,
        at: chatConversations.lastMessageAt,
        latest: sql<string | null>`(
          select cm.body from ${chatMessages} cm where cm.conversation_id = ${chatConversations}."id"
          order by cm.id desc limit 1
        )`,
        sender: sql<string | null>`(
          select cm.sender from ${chatMessages} cm where cm.conversation_id = ${chatConversations}."id"
          order by cm.id desc limit 1
        )`,
      })
      .from(chatConversations)
      .leftJoin(
        customerProfiles,
        eq(customerProfiles.userId, chatConversations.userId),
      )
      .orderBy(
        ...(data?.focus
          ? [desc(sql`${chatConversations.id} = ${data.focus}::uuid`)]
          : []),
        desc(chatConversations.lastMessageAt),
        asc(chatConversations.id),
      )
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
  .handler(async ({ context, data }) => {
    const { supportName } = context.user
    if (!supportName) throw new Error(supportNameRequired)
    await getDb().transaction(async (tx) => {
      const [conversation] = await tx
        .update(chatConversations)
        .set({ lastMessageAt: new Date() })
        .where(eq(chatConversations.id, data.id))
        .returning({ id: chatConversations.id })
      if (!conversation) throw new Error('Conversation not found.')
      await tx
        .insert(chatMessages)
        .values({
          conversationId: data.id,
          sender: 'agent',
          body: data.body,
          supportName,
        })
    })
    return { ok: true }
  })
