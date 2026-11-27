import { randomUUID } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { and, asc, count, desc, eq, exists, gte, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../db'
import {
  chatConversations,
  chatMessages,
  customerPresence,
  customerNotifications,
  customerProfiles,
  orderMessages,
  orderRequests,
  orders,
  staffAvatars,
} from '../../db/schema'
import { activeCustomer, touchCustomerPresence } from './customer-presence.server'
import { findCustomerAccount } from './customers.server'
import { messageBody } from './chat-message'
import { requireAdmin, requireCustomer } from './identity.functions'
import { staffAccountOnly } from './portal-access'
import { orderCode } from './orders'
import { readSessionUser, supportChatCookie } from './session.server'
import { supportNameRequired } from './support-name'

const messageInput = z.object({ body: messageBody })
const staffThread = z.object({ id: z.uuid() })
const readThrough = z.object({
  through: z.number().int().positive().max(2147483647),
})

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
      supportAvatarId: staffAvatars.id,
      body: chatMessages.body,
      at: chatMessages.createdAt,
      readAt: chatMessages.readAt,
    })
    .from(chatMessages)
    .innerJoin(chatConversations, eq(chatMessages.conversationId, chatConversations.id))
    .leftJoin(staffAvatars, eq(staffAvatars.userId, chatMessages.supportUserId))
    .where(and(eq(chatMessages.conversationId, conversationId), guestOnly ? isNull(chatConversations.userId) : undefined))
    .orderBy(desc(chatMessages.id))
    .limit(200)
    .then((rows) =>
      rows.reverse().map((row) => ({
        ...row,
        at: row.at.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
      })),
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

async function visitorConversation(userId?: string) {
  if (userId) {
    const account = await accountConversation(getDb(), userId)
    if (account) return { id: account.id, guestOnly: false }
  }
  const token = visitorToken()
  if (!token) return null
  const [guest] = await getDb()
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.visitorToken, token),
        isNull(chatConversations.userId),
      ),
    )
  return guest ? { id: guest.id, guestOnly: true } : null
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

async function visitorChatUser() {
  const user = await readSessionUser()
  if (user?.isAdmin) throw new Error(staffAccountOnly)
  return user
}

export const readVisitorChat = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await visitorChatUser()
    if (user) await touchCustomerPresence(user.id).catch(() => {})
    const conversation = await visitorConversation(user?.id)
    return conversation ? messagesFor(conversation.id, conversation.guestOnly) : []
  },
)

async function markChatRead(
  conversationId: string,
  sender: 'agent' | 'visitor',
  through?: number,
  guestOnly = false,
) {
  const db = getDb()
  await db
    .update(chatMessages)
    .set({ readAt: sql`now()` })
    .where(
      and(
        eq(chatMessages.conversationId, conversationId),
        eq(chatMessages.sender, sender),
        through !== undefined ? lte(chatMessages.id, through) : undefined,
        isNull(chatMessages.readAt),
        guestOnly
          ? exists(
              db.select({ id: chatConversations.id })
                .from(chatConversations)
                .where(and(eq(chatConversations.id, conversationId), isNull(chatConversations.userId))),
            )
          : undefined,
      ),
    )
  return { ok: true }
}

export const markVisitorChatRead = createServerFn({ method: 'POST' })
  .validator(readThrough)
  .handler(async ({ data }) => {
    const user = await visitorChatUser()
    const conversation = await visitorConversation(user?.id)
    if (!conversation) return { ok: true }
    return markChatRead(conversation.id, 'agent', data.through, conversation.guestOnly)
  })

export const sendVisitorChat = createServerFn({ method: 'POST' })
  .validator(messageInput)
  .handler(async ({ data }) => {
    const user = await visitorChatUser()
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
          select left(cm.body, 240) from ${chatMessages} cm where cm.conversation_id = ${chatConversations}."id"
          order by cm.id desc limit 1
        )`,
        sender: sql<string | null>`(
          select cm.sender from ${chatMessages} cm where cm.conversation_id = ${chatConversations}."id"
          order by cm.id desc limit 1
        )`,
        unread: sql<number>`(
          select count(*)::int from ${chatMessages} cm
          where cm.conversation_id = ${chatConversations}."id"
            and cm.sender = 'visitor' and cm.read_at is null
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

export const markSupportChatRead = createServerFn({ method: 'POST' })
  .middleware([requireAdmin])
  .validator(staffThread.extend(readThrough.partial().shape))
  .handler(({ data }) => markChatRead(data.id, 'visitor', data.through))

function unreadOrders(customerId?: string) {
  return getDb()
    .select({ orderId: orders.id, customerId: orders.userId, unread: count() })
    .from(orderMessages)
    .innerJoin(orders, eq(orders.id, orderMessages.orderId))
    .where(and(
      isNull(orderMessages.readAt),
      eq(orderMessages.sender, customerId ? 'support' : 'client'),
      customerId ? eq(orders.userId, customerId) : undefined,
    ))
    .groupBy(orders.id, orders.userId)
}

function inboxCounts(website: number, orders: { orderId: number; unread: number }[]) {
  return {
    website,
    orders: Object.fromEntries(orders.map((row) => [orderCode(row.orderId), row.unread])),
    ordersTotal: orders.reduce((total, row) => total + row.unread, 0),
  }
}

export const getCustomerInboxCounts = createServerFn({ method: 'GET' })
  .middleware([requireCustomer])
  .handler(async ({ context }) => {
    const conversation = await visitorConversation(context.user.id)
    const [website, orders, notifications] = await Promise.all([
      conversation
        ? getDb()
            .select({ unread: count() })
            .from(chatMessages)
            .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
            .where(and(
              eq(chatMessages.conversationId, conversation.id),
              eq(chatMessages.sender, 'agent'),
              isNull(chatMessages.readAt),
              conversation.guestOnly ? isNull(chatConversations.userId) : undefined,
            ))
        : [],
      unreadOrders(context.user.id),
      getDb().select({ unread: count() }).from(customerNotifications).where(and(
        eq(customerNotifications.userId, context.user.id),
        isNull(customerNotifications.readAt),
      )),
    ])
    return { ...inboxCounts(website[0]?.unread ?? 0, orders), notifications: notifications[0]?.unread ?? 0 }
  })

export const getStaffInboxCounts = createServerFn({ method: 'GET' })
  .middleware([requireAdmin])
  .handler(async () => {
    const db = getDb()
    const [website, orders, active, pending] = await Promise.all([
      db.select({ customerId: chatConversations.userId, unread: count() })
        .from(chatMessages)
        .innerJoin(chatConversations, eq(chatConversations.id, chatMessages.conversationId))
        .where(and(eq(chatMessages.sender, 'visitor'), isNull(chatMessages.readAt)))
        .groupBy(chatConversations.userId),
      unreadOrders(),
      db.select({ id: customerPresence.userId }).from(customerPresence).where(activeCustomer),
      db.select({ total: count() }).from(orderRequests).where(eq(orderRequests.status, 'pending')),
    ])
    const customers = new Map<string, number>()
    for (const { customerId, unread } of [...website, ...orders]) {
      if (customerId) customers.set(customerId, (customers.get(customerId) ?? 0) + unread)
    }
    return {
      ...inboxCounts(website.reduce((total, row) => total + row.unread, 0), orders),
      customers: Object.fromEntries(customers),
      onlineCustomers: active.map(({ id }) => id),
      pendingRequests: pending[0]?.total ?? 0,
    }
  })

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
          supportUserId: context.user.id,
        })
    })
    return { ok: true }
  })
