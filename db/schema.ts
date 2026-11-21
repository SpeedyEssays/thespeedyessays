import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

// Orders placed by signed-in clients. Price is recomputed on the server from
// src/lib/pricing.ts and stored in cents.
export const orders = pgTable(
  'orders',
  {
    id: serial().primaryKey(),
    userId: text('user_id').notNull(),
    clientEmail: text('client_email').notNull(),
    clientName: text('client_name'),
    submissionId: uuid('submission_id').unique(),
    paymentReference: text('payment_reference').unique(),
    paymentUrl: text('payment_url'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    type: text().notNull(),
    subject: text().notNull(),
    topic: text().notNull(),
    level: text().notNull(),
    style: text().notNull(),
    sources: integer().notNull().default(0),
    pages: integer().notNull(),
    deadlineOption: text('deadline_option').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    agreedDueAt: timestamp('agreed_due_at', { withTimezone: true }),
    detailsRevision: integer('details_revision').notNull().default(0),
    extras: jsonb()
      .$type<{
        topWriter?: boolean
        draftPreview?: boolean
        abstractPage?: boolean
      }>()
      .notNull()
      .default({}),
    instructions: text().notNull().default(''),
    paymentMethod: text('payment_method').notNull(),
    priceCents: integer('price_cents').notNull(),
    status: text().notNull().default('awaiting-payment'),
    originalityScore: integer('originality_score'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    kind: text().notNull(), // FileKind in src/lib/orders.ts
    name: text().notNull(),
    size: integer().notNull(),
    contentType: text('content_type').notNull(),
    blobKey: text('blob_key').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
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
    supportName: text('support_name'),
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('order_messages_order_id_idx').on(t.orderId)],
)

// Site-wide live chat. Visitors are identified by a secret token kept in their
// browser; signed-in visitors are also linked to their account.
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid().primaryKey().defaultRandom(),
    visitorToken: uuid('visitor_token').notNull().unique(),
    userId: text('user_id'),
    name: text(),
    email: text(),
    page: text(),
    closed: boolean().notNull().default(false),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('chat_conversations_user_id_last_message_at_idx').on(
      t.userId,
      t.lastMessageAt.desc(),
    ),
  ],
)

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: serial().primaryKey(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    sender: text().notNull(), // 'visitor' | 'agent'
    supportName: text('support_name'),
    body: text().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('chat_messages_conversation_id_idx').on(t.conversationId)],
)

// Account details maintained by staff for customer support.
export const customerProfiles = pgTable.withRLS('customer_profiles', {
  userId: text('user_id').primaryKey(),
  displayName: text('display_name'),
  supportNotes: text('support_notes').notNull().default(''),
  revision: integer().notNull().default(1),
  updatedBy: text('updated_by').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Visible-page activity is recorded by the portal server for staff use.
export const customerPresence = pgTable.withRLS('customer_presence', {
  userId: text('user_id').primaryKey(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
})
