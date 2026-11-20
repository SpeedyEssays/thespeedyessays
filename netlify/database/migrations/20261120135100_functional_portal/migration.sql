ALTER TABLE "orders" ADD COLUMN "submission_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_reference" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_files" ADD CONSTRAINT "order_files_blob_key_key" UNIQUE("blob_key");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_submission_id_key" UNIQUE("submission_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_reference_key" UNIQUE("payment_reference");