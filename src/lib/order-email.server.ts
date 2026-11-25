import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { escapeEmailHtml as escapeHtml } from "./email-html.server";
import {
  checkGmail,
  emailSiteOrigin,
  gmailSenderConfig,
  sendGmail,
} from "./gmail-sender.server";
import {
  orderEmailSubject,
  orderEmailTemplates,
  type OrderEmailKind,
} from "./order-email";
import { useSupabase } from "./supabase-config";

const emailAddress = z.email().max(320);

export function orderEmailConfig() {
  const sender = gmailSenderConfig();
  const origin = emailSiteOrigin();
  return sender && origin ? { sender, origin } : null;
}

export async function orderEmailRecipient(order: {
  userId: string;
  clientEmail: string;
}) {
  if (!useSupabase)
    return emailAddress.safeParse(order.clientEmail.trim()).data ?? null;

  // Look up the current verified address, in case the customer changed it after ordering.
  const accountId = z.uuid().safeParse(order.userId);
  if (!accountId.success) return null;
  const { rows } = await getDb().execute<{ email: string | null }>(sql`
    select email from auth.users
    where id = ${accountId.data}::uuid
      and email_confirmed_at is not null and deleted_at is null
    limit 1
  `);
  return emailAddress.safeParse(rows[0]?.email?.trim()).data ?? null;
}

type OrderEmail = {
  code: string;
  kind: OrderEmailKind;
  note: string;
};

export function renderOrderEmail(
  { code, kind, note }: OrderEmail,
  origin: string,
) {
  const template = orderEmailTemplates[kind];
  const url = new URL("/dashboard", origin);
  url.searchParams.set("order", code);
  const text = [
    template.heading,
    `Order ${code}`,
    template.body,
    note ? `Message from support:\n${note}` : "",
    `${template.button}: ${url.href}`,
    "SpeedyEssays Support",
  ]
    .filter(Boolean)
    .join("\n\n");
  const noteMarkup = note
    ? `<p style="padding:14px 16px;background:#f1f3f7;line-height:1.55"><strong>Message from support</strong><br>${escapeHtml(note).replace(/\r\n|\n|\r/g, "<br>")}</p>`
    : "";
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f7f5ef;color:#192a50;font-family:Arial,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e3e5ea">
<tr><td style="padding:18px 24px;background:#192a50;color:#ffffff;font-size:18px;font-weight:bold">SpeedyEssays</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 8px;font-size:13px;color:#475569">Order ${escapeHtml(code)}</p>
<h1 style="margin:0 0 14px;font-size:24px">${template.heading}</h1>
<p style="line-height:1.55">${template.body}</p>
${noteMarkup}
<p style="margin:24px 0"><a href="${escapeHtml(url.href)}" style="display:inline-block;padding:12px 18px;background:#192a50;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold">${template.button}</a></p>
<p style="margin:0;color:#475569;font-size:13px">SpeedyEssays Support</p>
</td></tr></table></td></tr></table></body></html>`;

  return { subject: orderEmailSubject(kind, code), text, html };
}

type EmailConfig = NonNullable<ReturnType<typeof orderEmailConfig>>;

function gmailFailure(result: Awaited<ReturnType<typeof sendGmail>>) {
  if (result === "quota") return "rate-limited";
  if (result === "access-denied") return "credentials-rejected";
  if (result === "invalid") return "rejected";
  if (result === "unavailable") return "sender-script-error";
  if (result !== "ready" && result !== "queued") return result;
  return "unconfirmed";
}

export async function sendOrderEmail(
  config: EmailConfig,
  message: OrderEmail & { recipient: string; requestId: string },
) {
  const { subject, text, html } = renderOrderEmail(message, config.origin);
  const result = await sendGmail(config.sender, {
    id: `${message.code}:${message.requestId}`,
    to: message.recipient,
    subject,
    text,
    html,
  });
  return result === "queued" ? result : gmailFailure(result);
}

export async function checkGmailConnection(config: EmailConfig) {
  const result = await checkGmail(config.sender);
  return result === "ready" ? "connected" : gmailFailure(result);
}
