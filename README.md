# SpeedyEssays

An academic writing website where students get an instant price, place a detailed order, and track their paper from brief to delivery — with free originality reports, free revisions, and a money-back guarantee.

## What's live

| Route | Screen |
| --- | --- |
| `/` | Homepage with instant pricing calculator, how it works, guarantees, samples, verified reviews, FAQ |
| `/order` | Four-step order form with live price summary, file uploads and secure-payment step |
| `/dashboard` | Client dashboard: order tracking, downloads, originality reports, revision requests, anonymous writer chat |
| `/samples` | Sample paper gallery with subject filter and PDF downloads |
| `/policies/money-back-guarantee`, `/policies/revision-policy`, `/policies/privacy-policy` | Policy pages |

A 24/7 support chat launcher appears on every page.

## Tech

- [TanStack Start](https://tanstack.com/start) (React 19, file-based routing, SSR) on Netlify
- Tailwind CSS 4 + shadcn/ui (Radix) components, lucide icons
- Netlify Image CDN for imagery

## Run locally

```bash
pnpm install
netlify dev   # or: pnpm dev
```

## Roadmap

Data is currently served from `src/lib/fixtures.ts`. Upcoming milestones (see [PLAN.md](PLAN.md)): persistent orders with Netlify Database and Blobs, client/writer accounts with Netlify Identity, Stripe and PayPal checkout, persisted writer–client messaging with moderation, the writer application portal and writer dashboard, plagiarism-scan integration, live-chat provider and Trustpilot/Sitejabber reviews, and an admin console.
