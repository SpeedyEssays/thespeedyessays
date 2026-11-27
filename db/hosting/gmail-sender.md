# SpeedyEssays Gmail sender

## Set up the Gmail project

1. Sign in to Google Apps Script with the Gmail account that should send SpeedyEssays email.
2. Open your project’s `Code.gs`, replace its contents with [the sender script](../../scripts/gmail-sender/Code.gs), and save.
3. Select `setUpEmailSender` in the function dropdown and click **Run**. Review and grant the script permission to send email on your behalf. The execution log shows **Sender ready** when setup finishes.
4. Click **Deploy → New deployment**, choose **Web app**, set **Execute as** to **Me** and **Who has access** to **Anyone**, and click **Deploy**. Copy the Web app URL that ends in `/exec`. The script verifies a signature before using Gmail.
5. Open the gear icon for **Project Settings**. Under **Script properties**, locate `SPEEDYESSAYS_EMAIL_SECRET`. Copy its value directly to the Cloudflare secret field below.

## Connect staff order emails

In Cloudflare, open **thespeedyessays → Settings → Runtime variables and secrets → Production**.

| Key                         | Type     | Value                                         |
| --------------------------- | -------- | --------------------------------------------- |
| `SPEEDYESSAYS_EMAIL_URL`    | Variable | The Apps Script Web app URL ending in `/exec` |
| `SPEEDYESSAYS_EMAIL_SECRET` | Secret   | The matching Apps Script property value       |

Apply the changes using the button ending in **and deploy**. On a staff test order,
select **Email customer → Check connection**. This checks Apps Script authorization
and Gmail quota. To verify actual delivery, send a test order notice to an address
you control. Gmail sends from the project owner’s mailbox.

## Connect Supabase account emails

The Cloudflare deployment creates `AUTH_EMAIL_DELIVERY`. It saves messages
before the Supabase hook responds and sends them in the background through the
same Apps Script deployment. Check the Worker’s **Bindings** tab for
`AUTH_EMAIL_DELIVERY` and confirm **Email customer → Check connection** succeeds
before enabling the Supabase hook.

In Supabase **Authentication → Hooks**, add an HTTP **Send Email** hook with
`https://thespeedyessays.info-speedypaper.workers.dev/api/auth-email` as its
endpoint. Copy the hook signing secret directly into Cloudflare as the
Production runtime secret `SUPABASE_EMAIL_HOOK_SECRET` and deploy it before
enabling the hook. Keep Supabase’s Email provider enabled. The hook sends
branded signup confirmations, sign-in links, invitations, and password resets.
The email button and its copyable link both open the SpeedyEssays account page.

Use a test address you control to verify a signup confirmation, invitation, and
password reset. A link opens the SpeedyEssays account page and asks the recipient
to confirm the action. Check Cloudflare Worker logs and Apps Script **Executions** if
delivery fails. If account emails fail during setup, disable the hook to return
to the prior Supabase mail settings.

Personal Gmail accounts allow 100 recipients per day through Apps Script. That
allowance covers account and staff emails together. The site reports a quota
error for staff sends and briefly retries account email jobs.
