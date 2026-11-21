CREATE TABLE "customer_profiles" (
	"user_id" text PRIMARY KEY,
	"display_name" text,
	"support_notes" text DEFAULT '' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "agreed_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "details_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "chat_conversations_user_id_last_message_at_idx" ON "chat_conversations" ("user_id","last_message_at" DESC NULLS LAST);
--> statement-breakpoint
REVOKE ALL ON public.customer_profiles FROM public;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.customer_profiles FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.customer_profiles FROM authenticated;
  END IF;
END
$$;
