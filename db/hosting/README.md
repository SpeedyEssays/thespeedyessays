# Cloudflare Workers and Supabase

This deployment uses the same SpeedyEssays application as the Netlify preview. The Cloudflare build uses Supabase for email accounts, PostgreSQL and private order files.

## Configure a new destination

1. Create a Supabase project. Apply the two existing `netlify/database/migrations` SQL files in timestamp order on an empty database, then apply [supabase-access.sql](./supabase-access.sql). The last step prevents anonymous and signed-in Supabase API users from querying application tables. Keep the database connection and maintenance credentials private.
2. Create a private bucket named `order-files`. Leave public access off and set its maximum file size to 4 MB. Keep the storage secret on the Worker.
3. In Supabase Auth, set the Site URL to the actual Worker origin and allow `/account` and `/account?recovery=true` as redirect URLs. Enable email confirmation and configure a custom SMTP sender for public registration. With the default templates, the customer needs to open the confirmation or recovery link in the browser that started the flow.
4. Connect the GitHub repository to Cloudflare Workers Builds. Use this branch while verifying the migration. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build variables. The publishable key is the only key that belongs in the browser bundle.

   | Setting              | Value                                                                                                                                           |
   | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
   | Build command        | `npm run build:cloudflare`                                                                                                                      |
   | Deploy command       | `npm run deploy:cloudflare`                                                                                                                     |
   | Runtime database     | A cache-disabled `HYPERDRIVE` binding to Supabase, or a `DATABASE_URL` secret for the Supabase session pooler with TLS certificate verification |
   | Runtime file storage | `SUPABASE_STORAGE_SECRET_KEY` secret                                                                                                            |
   | Runtime checkout     | `PAYSTACK_SECRET_KEY` starting in test mode and `PAYSTACK_CALLBACK_ORIGIN` set to the actual Worker origin without a trailing slash             |

   If using Hyperdrive through Workers Builds, add its configuration ID and the binding name `HYPERDRIVE` to the Wrangler configuration for that deployment. Keep queries uncached because staff and customer screens must show newly saved orders and messages. Set the Paystack webhook to `/api/paystack-webhook` on the deployed Worker. Complete the payment provider's business approval before switching to live mode.

## Migrate data and verify the cutover

The active Netlify preview has its own PostgreSQL branch. Inspect both the preview and production branches and select the authoritative source for each application record. Back up both privately before changing the live entry point. Preserve an explicit mapping if both branches contain real records with overlapping primary keys. Keep the preview available until the migration is verified.

- Export the application tables `orders`, `order_files`, `order_messages`, `chat_conversations`, and `chat_messages` through PostgreSQL tools to a private archive. Restore them into the destination after applying the schema and access grants above. Preserve record IDs and reset the serial sequences after import if the export did not include their values. Compare source and destination counts and check foreign keys.
- Copy private Netlify Blobs into the Supabase bucket using the exact `order_files.blob_key` paths. Check uploaded object counts, byte sizes, and hashes before exposing the new site. The Netlify namespace uses the hash of the source database host and database path as shown in `src/lib/files.server.ts`.
- Netlify Identity is a separate service. Inventory and re-enrol existing users with email confirmation or an invitation, then map their old IDs to the newly verified Supabase user IDs before allowing access to their migrated records. Reassign staff roles from a verified admin list using Supabase Auth application metadata, for example `{"roles":["admin"]}`. Keep password credentials, account tokens, database dumps and chat contents out of GitHub. Website visitors will get a new chat cookie on the new domain; staff can still see migrated conversation history.
- For a test customer, verify signup, email confirmation, password reset, and placement of a test order with an upload. Verify a staff reply from each inbox, Paystack sandbox checkout, and final-file delivery. Sign in as a second customer and confirm the first customer's orders and files are unavailable. Start accepting real customer data only after these checks on the new host.

The previous Netlify `*.netlify.app` address remains tied to Netlify. Use the new `*.workers.dev` URL or a custom domain you control.
