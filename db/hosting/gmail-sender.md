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

Create a Cloudflare Queue called `speedyessays-auth-email` in the same account as
the Worker. Configure the Worker to produce to it using the binding
`AUTH_EMAIL_QUEUE` and to consume from it. The Worker’s queue handler sends the
signed requests to the same Apps Script deployment. The queue allows the Supabase
hook to return within its timeout while Gmail processes the message.

In Supabase **Authentication → Hooks**, add an HTTP **Send Email** hook with
`https://thespeedyessays.info-speedypaper.workers.dev/api/auth-email` as its
endpoint. Copy the hook signing secret directly into Cloudflare as the
Production runtime secret `SUPABASE_EMAIL_HOOK_SECRET` and deploy it. Enable
the hook once the queue and the Gmail sender are connected. Keep Supabase’s Email
provider enabled. The hook takes over signup confirmation, invitation, and
password reset delivery after it is enabled.

Use a test address you control to verify a signup confirmation, invitation, and
password reset. A link opens the SpeedyEssays account page and asks the recipient
to confirm the action. Check Cloudflare Queues and Apps Script **Executions** if
delivery fails. If account emails fail during setup, disable the hook to return
to the prior Supabase mail settings.

Personal Gmail accounts allow 100 recipients per day through Apps Script. That
allowance covers account and staff emails together. The site reports a quota
error for staff sends and briefly retries account email jobs.
