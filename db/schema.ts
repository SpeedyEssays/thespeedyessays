import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// Orders placed by signed-in clients. Price is recomputed on the server from
// src/lib/pricing.ts and stored in cents.
export const orders = pgTable(
  'orders',
  {
    id: serial().primaryKey(),
    userId: text('user_id').notNull(),
    clientEmail: text('client_email').notNull(),
    clientName: text('client_name'),
    type: text().notNull(),
    subject: text().notNull(),
    topic: text().notNull(),
    level: text().notNull(),
    style: text().notNull(),
    sources: integer().notNull().default(0),
    pages: integer().notNull(),
    deadlineOption: text('deadline_option').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    extras: jsonb().$type<{ topWriter?: boolean; draftPreview?: boolean; abstractPage?: boolean }>().notNull().default({}),
    instructions: text().notNull().default(''),
    paymentMethod: text('payment_method').notNull(),
    priceCents: integer('price_cents').notNull(),
    status: text().notNull().default('awaiting-payment'),
    originalityScore: integer('originality_score'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('orders_user_id_idx').on(t.userId)],
)

export const orderFiles = pgTable(
  'order_files',
  {
    id: serial().primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    kind: text().notNull(), // 'brief' | 'paper' | 'report'
    name: text().notNull(),
    size: integer().notNull(),
    contentType: text('content_type').notNull(),
    blobKey: text('blob_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_files_order_id_idx').on(t.orderId)],
)

// Per-order thread between the client and the support team.
export const orderMessages = pgTable(
  'order_messages',
  {
    id: serial().primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    sender: text().notNull(), // 'client' | 'support'
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_messages_order_id_idx').on(t.orderId)],
)

// Site-wide live chat. Visitors are identified by a secret token kept in their
// browser; signed-in visitors are also linked to their account.
export const chatConversations = pgTable('chat_conversations', {
  id: uuid().primaryKey().defaultRandom(),
  visitorToken: uuid('visitor_token').notNull().unique(),
  userId: text('user_id'),
  name: text(),
  email: text(),
  page: text(),
  closed: boolean().notNull().default(false),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: serial().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    sender: text().notNull(), // 'visitor' | 'agent'
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('chat_messages_conversation_id_idx').on(t.conversationId)],
)
