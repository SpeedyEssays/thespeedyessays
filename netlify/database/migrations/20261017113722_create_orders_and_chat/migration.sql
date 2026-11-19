CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"visitor_token" uuid NOT NULL UNIQUE,
	"user_id" text,
	"name" text,
	"email" text,
	"page" text,
	"closed" boolean DEFAULT false NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY,
	"conversation_id" uuid NOT NULL,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_files" (
	"id" serial PRIMARY KEY,
	"order_id" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"size" integer NOT NULL,
	"content_type" text NOT NULL,
	"blob_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_messages" (
	"id" serial PRIMARY KEY,
	"order_id" integer NOT NULL,
	"sender" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY,
	"user_id" text NOT NULL,
	"client_email" text NOT NULL,
	"client_name" text,
	"type" text NOT NULL,
	"subject" text NOT NULL,
	"topic" text NOT NULL,
	"level" text NOT NULL,
	"style" text NOT NULL,
	"sources" integer DEFAULT 0 NOT NULL,
	"pages" integer NOT NULL,
	"deadline_option" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"extras" jsonb DEFAULT '{}' NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"payment_method" text NOT NULL,
	"price_cents" integer NOT NULL,
	"status" text DEFAULT 'awaiting-payment' NOT NULL,
	"originality_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "chat_messages_conversation_id_idx" ON "chat_messages" ("conversation_id");--> statement-breakpoint
CREATE INDEX "order_files_order_id_idx" ON "order_files" ("order_id");--> statement-breakpoint
CREATE INDEX "order_messages_order_id_idx" ON "order_messages" ("order_id");--> statement-breakpoint
CREATE INDEX "orders_user_id_idx" ON "orders" ("user_id");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "order_messages" ADD CONSTRAINT "order_messages_order_id_orders_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE;