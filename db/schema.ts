import { sql } from 'drizzle-orm'
import {
  boolean,
  bytea,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import type { Extras, OrderService, PriceAdjustment } from '../src/lib/pricing'
import type { OrderLanguage, OrderSoftware } from '../src/lib/order-requirements'
import type { NotificationKind } from '../src/lib/portal-notifications'
import type { OrderRequestKind, OrderRequestStatus } from '../src/lib/order-requests'
import type { WalletEntryKind } from '../src/lib/wallet'

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
    deliveryVersion: integer('delivery_version').notNull().default(0),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    type: text().notNull(),
    service: text().$type<OrderService>().notNull().default('writing'),
    language: text().$type<OrderLanguage>(),
    software: text().$type<OrderSoftware>(),
    softwareDetails: text('software_details'),
    softwareFeeCents: integer('software_fee_cents').notNull().default(0),
    subject: text().notNull(),
    topic: text().notNull(),
    level: text().notNull(),
    style: text().notNull(),
    sources: integer().notNull().default(0),
    pages: integer().notNull(),
    wordCount: integer('word_count'),
    slideCount: integer('slide_count'),
    deadlineOption: text('deadline_option').notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
    agreedDueAt: timestamp('agreed_due_at', { withTimezone: true }),
    detailsRevision: integer('details_revision').notNull().default(0),
    extras: jsonb().$type<Extras>().notNull().default({}),
    instructions: text().notNull().default(''),
    paymentMethod: text('payment_method').notNull(),
    priceCents: integer('price_cents').notNull(),
    refundedCents: integer('refunded_cents').notNull().default(0),
    priceAdjustment: jsonb('price_adjustment').$type<PriceAdjustment>(),
    status: text().notNull().default('awaiting-payment'),
    originalityScore: integer('originality_score'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('orders_user_id_idx').on(t.userId),
    check('orders_software_fee_valid', sql`${t.softwareFeeCents} >= 0`),
    check('orders_refund_valid', sql`${t.refundedCents} between 0 and ${t.priceCents}`),
  ],
)

export const orderFeedback = pgTable.withRLS(
  'order_feedback',
  {
    orderId: integer('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    rating: integer().notNull(),
    comment: text().notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('order_feedback_rating_valid', sql`${t.rating} between 0 and 5`),
    index('order_feedback_updated_idx').on(t.updatedAt.desc(), t.orderId.desc()),
  ],
)

export const customerNotifications = pgTable.withRLS(
  'customer_notifications',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    broadcastId: uuid('broadcast_id'),
    orderId: integer('order_id').references(() => orders.id, { onDelete: 'set null' }),
    kind: text().$type<NotificationKind>().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    senderName: text('sender_name'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (t) => [
    check('customer_notifications_kind_valid', sql`${t.kind} in ('notice', 'offer', 'payment-reminder', 'price-offer', 'wallet-credit')`),
    index('customer_notifications_broadcast_idx').on(t.broadcastId).where(sql`${t.broadcastId} is not null`),
    index('customer_notifications_user_sent_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
    index('customer_notifications_unread_idx').on(t.userId).where(sql`${t.readAt} is null`),
    index('customer_notifications_order_idx').on(t.orderId),
  ],
)

export const discountCodes = pgTable.withRLS('discount_codes', {
  code: text().primaryKey(),
  percent: integer().notNull(),
  active: boolean().notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('discount_codes_percent_valid', sql`${t.percent} between 1 and 99`),
  check('discount_codes_format_valid', sql`${t.code} ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'`),
])

export const walletAccounts = pgTable.withRLS('wallet_accounts', {
  userId: text('user_id').primaryKey(),
  referralCode: uuid('referral_code').notNull().defaultRandom().unique(),
  referredBy: text('referred_by').references((): AnyPgColumn => walletAccounts.userId, { onDelete: 'set null' }),
  balanceCents: integer('balance_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('wallet_balance_nonnegative', sql`${t.balanceCents} >= 0`),
  check('wallet_no_self_referral', sql`${t.userId} <> ${t.referredBy}`),
  index('wallet_accounts_referred_by_idx').on(t.referredBy),
])

export const walletEntries = pgTable.withRLS('wallet_entries', {
  id: uuid().primaryKey().defaultRandom(),
  eventKey: text('event_key').notNull().unique(),
  userId: text('user_id').notNull().references(() => walletAccounts.userId),
  kind: text().$type<WalletEntryKind>().notNull(),
  amountCents: integer('amount_cents').notNull(),
  description: text().notNull(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('wallet_entries_sign_valid', sql`(${t.kind} = 'order-payment' and ${t.amountCents} < 0) or
    (${t.kind} in ('referral-reward', 'staff-reward', 'top-up', 'order-refund') and ${t.amountCents} > 0)`),
  index('wallet_entries_user_created_idx').on(t.userId, t.createdAt.desc(), t.id),
])

export const walletTopUps = pgTable.withRLS('wallet_top_ups', {
  reference: text().primaryKey(),
  userId: text('user_id').notNull().references(() => walletAccounts.userId),
  amountCents: integer('amount_cents').notNull(),
  paymentUrl: text('payment_url'),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check('wallet_top_ups_positive', sql`${t.amountCents} > 0`),
  index('wallet_top_ups_user_pending_idx').on(t.userId, t.createdAt.desc()).where(sql`${t.paidAt} is null`),
])

export const orderRequests = pgTable.withRLS('order_requests', {
  id: uuid().primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id, { onDelete: 'cascade' }),
  kind: text().$type<OrderRequestKind>().notNull(),
  status: text().$type<OrderRequestStatus>().notNull().default('pending'),
  reason: text().notNull(),
  staffNote: text('staff_note'),
  reviewedBy: text('reviewed_by'),
  amountCents: integer('amount_cents'),
  providerRefundId: text('provider_refund_id').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
}, (t) => [
  check('order_requests_kind_valid', sql`${t.kind} in ('cancellation', 'refund')`),
  check('order_requests_status_valid', sql`${t.status} in ('pending', 'approved', 'declined')`),
  check('order_requests_amount_valid', sql`case when ${t.kind} = 'refund' and ${t.status} = 'approved'
    then ${t.amountCents} is not null and ${t.amountCents} > 0 else ${t.amountCents} is null end`),
  index('order_requests_order_created_idx').on(t.orderId, t.createdAt.desc()),
  index('order_requests_status_created_idx').on(t.status, t.createdAt.desc()),
  uniqueIndex('order_requests_one_pending').on(t.orderId, t.kind).where(sql`${t.status} = 'pending'`),
])

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
    previewBlobKey: text('preview_blob_key'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('order_files_order_id_idx').on(t.orderId),
    check('order_files_release_after_delivery', sql`${t.releasedAt} is null or ${t.deliveredAt} is not null`),
  ],
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
    supportUserId: text('support_user_id'),
    body: text().notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('order_messages_order_id_idx').on(t.orderId),
    index('order_messages_unread_idx')
      .on(t.sender, t.orderId)
      .where(sql`${t.readAt} is null`),
  ],
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
    supportUserId: text('support_user_id'),
    body: text().notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('chat_messages_conversation_id_idx').on(t.conversationId),
    index('chat_messages_unread_idx')
      .on(t.sender, t.conversationId)
      .where(sql`${t.readAt} is null`),
  ],
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

// Staff availability is reported only from authenticated staff portal pages.
export const staffPresence = pgTable.withRLS('staff_presence', {
  userId: text('user_id').primaryKey(),
  supportName: text('support_name').notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
})

export const staffAvatars = pgTable.withRLS('staff_avatars', {
  userId: text('user_id').primaryKey(),
  id: uuid().notNull().unique(),
  jpeg: bytea().notNull(),
}, (t) => [
  check('staff_avatars_size_valid', sql`octet_length(${t.jpeg}) between 5 and 262144`),
])
