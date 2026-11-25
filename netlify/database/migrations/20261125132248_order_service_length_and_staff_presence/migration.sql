CREATE TABLE "staff_presence" (
	"user_id" text PRIMARY KEY,
	"support_name" text NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "staff_presence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "service" text DEFAULT 'writing' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "word_count" integer;