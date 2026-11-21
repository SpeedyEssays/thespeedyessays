# Hosting with Supabase

This deployment uses the same SpeedyEssays application as the Netlify preview. The Cloudflare and Node.js builds use Supabase for email accounts, PostgreSQL and private order files.

## Configure a new destination

1. Create a Supabase project. Apply the `netlify/database/migrations` SQL files in timestamp order on an empty database, then apply [supabase-access.sql](./supabase-access.sql). The last step prevents anonymous and signed-in Supabase API users from querying application tables. Keep the database connection and maintenance credentials private.
2. Create a private bucket named `order-files`. Leave public access off and set its maximum file size to 4 MB. Keep the storage secret on the application server.
3. In Supabase Auth, set the Site URL to the actual website origin and allow `/account` and `/account?recovery=true` as redirect URLs. Enable email confirmation and configure a custom SMTP sender for public registration. With the default templates, the customer needs to open the confirmation or recovery link in the browser that started the flow.

### Google sign-in

1. In Google Auth Platform, configure the SpeedyEssays app for an external audience and create a **Web application** OAuth client. Set its authorized JavaScript origin to the public site origin. Use the exact OAuth callback URL shown in **Supabase → Authentication → Providers → Google** as the authorized redirect URI.
2. Save the resulting client ID and secret in that Supabase Google provider panel and enable the provider. Keep the secret in Supabase.
3. Confirm the Supabase Auth **Site URL** uses the same HTTPS origin as the public site. Customers return to `/account?google=true` and then to the portal or the order page that brought them there.
4. Publish the Google OAuth app for public use and verify sign-in from the live customer signup page. The same button can create a new account or sign in to an existing one.

### Cloudflare Workers

Connect the GitHub repository to Cloudflare Workers Builds. Use this branch while verifying the migration. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as build variables. The publishable key is the only key that belongs in the browser bundle.

| Setting              | Value                                                                                                                                           |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Build command        | `npm run build:cloudflare`                                                                                                                      |
| Deploy command       | `npm run deploy:cloudflare`                                                                                                                     |
| Runtime database     | A cache-disabled `HYPERDRIVE` binding to Supabase, or a `DATABASE_URL` secret for the Supabase session pooler with TLS certificate verification |
| Runtime file storage | `SUPABASE_STORAGE_SECRET_KEY` secret                                                                                                            |
| Runtime checkout     | `PAYSTACK_SECRET_KEY` starting in test mode and `PAYSTACK_CALLBACK_ORIGIN` set to the actual Worker origin without a trailing slash             |

If using Hyperdrive through Workers Builds, add its configuration ID and the binding name `HYPERDRIVE` to the Wrangler configuration for that deployment. Keep queries uncached because staff and customer screens must show newly saved orders and messages.

### Node.js web service

Use Node.js 24 and pnpm to run the same app on a host such as Render. The build produces the same server bundle as the Worker build. The startup command serves it over HTTP using Node.js.

| Setting               | Value                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| Service type          | Node.js web service                                                                            |
| Build command         | `pnpm install --frozen-lockfile --prod=false && pnpm run build:node`                           |
| Start command         | `pnpm run start:node`                                                                          |
| Public build settings | `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`                                        |
| Runtime database      | `DATABASE_URL` for the Supabase session pooler with TLS certificate verification               |
| Runtime file storage  | `SUPABASE_STORAGE_SECRET_KEY`                                                                  |
| Runtime checkout      | `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` (if separate), and `PAYSTACK_CALLBACK_ORIGIN` |
| Website origin        | `SITE_ORIGIN` set to the public HTTPS origin. On Render it defaults to `RENDER_EXTERNAL_URL`.  |

The service listens on `0.0.0.0` at the host's `PORT` (3000 locally). On Render, use a Web Service and set `SKIP_INSTALL_DEPS=true` to use the explicit install command above. The free instance is for testing and sleeps after inactivity. The database and order files live in Supabase.

For either host, set the Paystack webhook to `/api/paystack-webhook` on the deployed site and set `PAYSTACK_CALLBACK_ORIGIN` to its HTTPS origin without a trailing slash. Use test keys for verification. Complete the payment provider's business approval before switching to live mode.

### Order notification email

In Render, open the SpeedyEssays service’s **Environment** page and set these runtime variables.

| Variable | Value |
| --- | --- |
| `MAILJET_API_KEY` | Mailjet API Key, also called the SMTP username |
| `MAILJET_SECRET_KEY` | Matching Mailjet Secret Key |
| `MAILJET_FROM_EMAIL` | An active, verified sender address for that Mailjet key |

Order notifications use the Mailjet HTTPS Send API. Staff can send from **Orders → Email customer**. Keep the credentials on the server. A dedicated Mailjet subaccount can supply a separate key without rotating the key used by Supabase Auth.

### Customer activity

Apply the customer presence database migration before deploying the portal update. On existing Supabase databases, also revoke grants on `public.customer_presence` from `public`, `anon`, and `authenticated`. Staff read activity through the portal server. A visible customer portal page reports activity every 30 seconds. Customer live chat also reports activity. Staff see an account as offline after 90 seconds without activity.

## Portal entry points

- Customers sign in through the Customer portal and use `/dashboard` for their orders and live support.
- Staff use the Staff portal link or `/admin` and an account with the server-managed `admin` role. The site owner has both `admin` and `staff_manager` and can grant admin access to confirmed accounts under Admins. The Website chat inbox handles both guests and account holders. Open a customer from Customers to update their display name or support notes, find orders, or start a chat.
- Staff can deliver drafts, final copies, originality reports and supporting materials from an order. Final copies appear to the customer after staff marks the order delivered. Uploads accept up to eight files at a time, 4 MB per file.

## Migrate data and verify the cutover

The active Netlify preview has its own PostgreSQL branch. Inspect both the preview and production branches and select the authoritative source for each application record. Back up both privately before changing the live entry point. Preserve an explicit mapping if both branches contain real records with overlapping primary keys. Keep the preview available until the migration is verified.

- Export the application tables `orders`, `order_files`, `order_messages`, `chat_conversations`, and `chat_messages` through PostgreSQL tools to a private archive. Restore them into the destination after applying the schema and access grants above. Preserve record IDs and reset the serial sequences after import if the export did not include their values. Compare source and destination counts and check foreign keys.
- Copy private Netlify Blobs into the Supabase bucket using the exact `order_files.blob_key` paths. Check uploaded object counts, byte sizes, and hashes before exposing the new site. The Netlify namespace uses the hash of the source database host and database path as shown in `src/lib/files.server.ts`.
- Netlify Identity is a separate service. Inventory and re-enrol existing users with email confirmation or an invitation, then map their old IDs to the newly verified Supabase user IDs before allowing access to their migrated records. Reassign staff roles from a verified admin list using Supabase Auth application metadata, for example `{"roles":["admin"]}`. Keep password credentials, account tokens, database dumps and chat contents out of GitHub. Website visitors will get a new chat cookie on the new domain; staff can still see migrated conversation history.
- For a test customer, verify signup, email confirmation, password reset, and placement of a test order with an upload. Verify a staff reply from each inbox, Paystack sandbox checkout, and final-file delivery. Sign in as a second customer and confirm the first customer's orders and files are unavailable. Start accepting real customer data only after these checks on the new host.

The previous Netlify `*.netlify.app` address remains tied to Netlify. Use the new host’s public URL or a custom domain you control.
