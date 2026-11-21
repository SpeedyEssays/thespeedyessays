import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import {
  orderEmailSubject,
  orderEmailTemplates,
  type OrderEmailKind,
} from "./order-email";
import { useSupabase } from "./supabase-config";

const emailAddress = z.email().max(320);

export function orderEmailConfig() {
  const key = process.env.MAILJET_API_KEY?.trim();
  const secret = process.env.MAILJET_SECRET_KEY?.trim();
  const from = emailAddress.safeParse(process.env.MAILJET_FROM_EMAIL?.trim());
  const configuredOrigin =
    process.env.SITE_ORIGIN || process.env.RENDER_EXTERNAL_URL;

  if (
    !key ||
    !secret ||
    !from.success ||
    !configuredOrigin ||
    !URL.canParse(configuredOrigin)
  ) {
    return null;
  }
  const url = new URL(configuredOrigin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    return null;
  }

  return { key, secret, from: from.data, origin: url.origin };
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

const escapeMap: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => escapeMap[char]);
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
const mailjetError = z.object({
  ErrorCode: z.string().optional(),
  StatusCode: z.number().optional(),
});
const mailjetResponse = mailjetError.extend({
  Messages: z
    .tuple([
      z.object({
        Status: z.enum(["success", "error"]),
        To: z.tuple([z.object({ Email: z.email() })]).optional(),
        Errors: z.array(mailjetError).optional(),
      }),
    ])
    .optional(),
});

function mailjetFailure(status: number, code?: string) {
  if (code === "send-0008") return "sender-not-authorized";
  if (status === 401) {
    return code === "mj-0001" ? "key-suspended" : "credentials-rejected";
  }
  if (status === 403) return "access-rejected";
  if (status === 429) return "rate-limited";
  if (status >= 500) return "unconfirmed";
  return "rejected";
}

async function requestMailjet(
  config: EmailConfig,
  recipient: string,
  content: {
    Subject: string;
    TextPart: string;
    HTMLPart?: string;
    CustomID?: string;
    CustomCampaign?: string;
    DeduplicateCampaign?: boolean;
  },
  sandbox = false,
) {
  try {
    const response = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.key}:${config.secret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(sandbox && { SandboxMode: true }),
        Messages: [
          {
            From: { Email: config.from, Name: "SpeedyEssays Support" },
            To: [{ Email: recipient }],
            ...content,
            TrackClicks: "disabled",
            TrackOpens: "disabled",
          },
        ],
      }),
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    const payload = mailjetResponse.safeParse(
      await response.json().catch(() => null),
    ).data;
    const message = payload?.Messages?.[0];
    if (!response.ok || message?.Status === "error") {
      const error =
        message?.Errors?.find(({ ErrorCode }) => ErrorCode === "send-0008") ??
        message?.Errors?.[0] ??
        payload;
      return mailjetFailure(
        error?.StatusCode ?? response.status,
        error?.ErrorCode,
      );
    }
    return message?.Status === "success" &&
      message.To?.[0].Email.toLowerCase() === recipient.toLowerCase()
      ? "queued"
      : "unconfirmed";
  } catch {
    return "unconfirmed";
  }
}

export async function sendOrderEmail(
  config: EmailConfig,
  message: OrderEmail & { recipient: string; requestId: string },
) {
  const { subject, text, html } = renderOrderEmail(message, config.origin);
  return requestMailjet(config, message.recipient, {
    Subject: subject,
    TextPart: text,
    HTMLPart: html,
    CustomID: `${message.code}:${message.requestId}`,
    // Mailjet suppresses a repeat to the same person for this send request.
    CustomCampaign: `speedy-order-${message.requestId}`,
    DeduplicateCampaign: true,
  });
}

export async function checkMailjetConnection(config: EmailConfig) {
  const result = await requestMailjet(
    config,
    config.from,
    {
      Subject: "SpeedyEssays order email connection check",
      TextPart: "Validate the order email sender and API credentials.",
    },
    true,
  );
  return result === "queued" ? "connected" : result;
}
