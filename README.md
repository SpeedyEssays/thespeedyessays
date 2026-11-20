# SpeedyEssays

SpeedyEssays is a TanStack Start app hosted on Netlify. It uses Netlify Identity for accounts, Netlify Database for orders and conversations, Netlify Blobs for private files, and Paystack hosted checkout for USD card payments.

| Route        | Use                                                                               |
| ------------ | --------------------------------------------------------------------------------- |
| `/`          | Pricing calculator, samples, and visitor support chat                             |
| `/account`   | Registration, email confirmation, sign-in, and password recovery                  |
| `/order`     | Authenticated order form and brief upload                                         |
| `/dashboard` | Customer orders, payment, messages, downloads, and revision requests              |
| `/admin`     | Staff orders, order replies, draft and final copy uploads, and website chat inbox |

## Configure a Netlify Deploy Preview

1. Connect this repository to the existing Netlify project and open a pull request. Check the deploy log for both database migrations and confirm the preview has an isolated Netlify Database branch. Keep live credentials and actual customer data out of this preview.
2. In Netlify, enable Identity, choose **Open** registration, and keep email confirmation enabled. Use an Identity test customer and create a separate staff user. In the Identity dashboard assign the staff user the application role `admin`. Sign out and back in after the assignment. A Netlify team member does not automatically have the application role.
3. For checkout, first confirm with Paystack that your business is eligible to take USD card payments. Enter your settlement details directly in the Paystack Dashboard. Add these as Functions-scoped environment variables in the correct Netlify deploy context. Availability of production payment acceptance depends on merchant approval and configuration.

   | Variable                   | Value                                                                                                                                                    |
   | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `PAYSTACK_SECRET_KEY`      | Paystack test secret in the Deploy Preview. Use the live secret only in production.                                                                      |
   | `PAYSTACK_CALLBACK_ORIGIN` | Exact HTTPS origin for that deployment, with no trailing slash.                                                                                          |
   | `PAYSTACK_WEBHOOK_SECRET`  | Optional Paystack `whsec_` signing secret for the same mode. When unset, the app verifies the legacy `X-Paystack-Signature` header using the API secret. |

   Set the webhook URL in the corresponding Paystack test or live settings to the deployment's origin followed by `/api/paystack-webhook`. Orders remain saved and await payment if checkout is unconfigured. The initial integration charges in USD by card. Refunds are handled in the provider dashboard and coordinated in the order message thread.

4. In the preview, verify registration, email confirmation, sign-in, and password reset. Save an order and a customer brief, try a cancelled or failed sandbox checkout and a successful one, then confirm a repeated webhook does not advance the order again. In `/admin`, reply to a visitor from **Website chat** and to a signed-in customer from **Orders**. Upload a file as **Final copy**, then select **Mark as delivered**. Verify the customer sees and downloads it from the order. Confirm a separate customer cannot view the order, message thread, or direct file URL. Files are limited to 4 MB each.

Website chat is tied to the visitor's browser. Leave **Website chat** open to receive incoming conversations while you are available. Order messages and delivery updates are available in the signed-in portal.

## Local checks

Use Node 22.13+ on the Node 22 line, Node 24, or Node 26+. Install from the checked-in pnpm lockfile. Run:

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

Use the Netlify preview for hosted Identity, Blobs, and payment sandbox checks. See [PLAN.md](PLAN.md) for the wider marketplace roadmap.
