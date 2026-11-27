ALTER TABLE "chat_messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "chat_messages_unread_idx" ON "chat_messages" ("sender","conversation_id") WHERE "read_at" is null;--> statement-breakpoint
CREATE INDEX "order_messages_unread_idx" ON "order_messages" ("sender","order_id") WHERE "read_at" is null;