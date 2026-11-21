CREATE TABLE "customer_presence" (
	"user_id" text PRIMARY KEY,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_presence" ENABLE ROW LEVEL SECURITY;