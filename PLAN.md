# SpeedyEssays — Product Roadmap

SpeedyEssays is an academic writing marketplace: clients order custom papers, vetted writers fulfil them, and the platform handles pricing, payment, messaging, quality checks and policies. The roadmap below breaks the full product into self-contained milestones. Each one should leave the site deployable.

## ✅ Milestone 1 — Product surface (done)

- Homepage with instant pricing calculator (level × deadline × pages), guarantees, sample preview, reviews, FAQ.
- Four-step order form (assignment → length & deadline → instructions & uploads → review & pay), prefilled from the calculator.
- Client dashboard: active orders with progress, order history, file downloads, originality score, revision request dialog, anonymous writer chat.
- Samples gallery with subject filter and downloadable PDFs (`public/sample-papers/`).
- Policy pages: money-back guarantee, revision policy, privacy & confidentiality.
- 24/7 support chat widget (scripted replies).
- All dynamic data lives in `src/lib/fixtures.ts`; pricing in `src/lib/pricing.ts`.

## Milestone 2 — Data model & orders

- Netlify Database (Postgres + Drizzle) schema in `db/schema.ts`: `clients`, `writers`, `orders`, `order_files`, `messages`, `revisions`, `bids`, `payouts`, `writer_applications`.
- Persist orders from the order form via a server function; recompute price server-side with `src/lib/pricing.ts` (never trust the client total).
- Store uploaded briefs and delivered papers in Netlify Blobs; serve downloads through an authorised server route.
- Replace fixture imports on the dashboard with route loaders.

## Milestone 3 — Accounts & secure portal

- Netlify Identity for sign-up / sign-in, with roles `client`, `writer`, `admin` (role path `app_metadata.authorization.roles`).
- Create the client account during checkout (email from step 4), protect `/dashboard` server-side.
- Email notifications for status changes.

## Milestone 4 — Payments

- Stripe Checkout (cards, Apple/Google Pay) and PayPal Orders API; webhook marks orders `writer-assigned`-eligible once paid.
- Refunds from admin tooling following the money-back policy; account balance credits.
- Keep the SSL / PCI trust badges on checkout and the order summary.

## Milestone 5 — Writer–client messaging

- Persist messages per order; poll or stream updates.
- Moderation: automatically block emails/phone numbers/URLs in messages, flag for the quality team; support-team messages in thread.
- Unread counts in the dashboard sidebar.

## Milestone 6 — Writer application portal (`/writers/apply`)

- Application form: profile, subjects, degree level, résumé and diploma uploads (Blobs).
- Timed English grammar test (auto-scored) and a short writing test (reviewed by admins).
- Admin review queue to approve/reject applicants and assign the `writer` role.

## Milestone 7 — Writer dashboard (`/writer`)

- Browse available orders (anonymised: no client identity), filter by subject/level/deadline.
- Bid on orders; client or admin accepts a bid → assignment.
- Upload drafts and finals, respond to revisions, chat with clients.
- Earnings ledger: per-order payouts, pending vs. available balance, payout requests.

## Milestone 8 — Quality assurance & trust integrations

- Plagiarism scanning via Copyleaks (or Turnitin partner API) on every final upload; store the originality report PDF and score on the order.
- Live chat: swap the scripted widget for Tawk.to or Zendesk (embed ID via environment variable), keeping the same launcher button.
- Reviews: pull verified reviews from Trustpilot / Sitejabber widgets or APIs; post-delivery review prompt for clients.

## Milestone 9 — Admin console & launch hardening

- Admin views for orders, disputes, refunds, writers, and message moderation.
- Legal review of policy copy, cookie consent, analytics, SEO metadata per page, rate limiting on public forms.
