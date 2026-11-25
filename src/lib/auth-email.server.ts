import { z } from "zod";
import { escapeEmailHtml as escapeHtml } from "./email-html.server";
import {
  emailSiteOrigin,
  gmailSenderConfig,
  type GmailMessage,
} from "./gmail-sender.server";

const linkTemplates = {
  signup: [
    "Confirm your SpeedyEssays account",
    "Confirm your email address to finish creating your account.",
    "Confirm email address",
  ],
  invite: [
    "Your SpeedyEssays invitation",
    "Accept your invitation and set your password.",
    "Accept invitation",
  ],
  magiclink: [
    "Sign in to SpeedyEssays",
    "Use this link to sign in to your account.",
    "Sign in to SpeedyEssays",
  ],
  recovery: [
    "Reset your SpeedyEssays password",
    "Use this link to choose a new password.",
    "Reset password",
  ],
  email_change: [
    "Confirm your SpeedyEssays email change",
    "Confirm this address to continue changing the email on your account.",
    "Confirm email change",
  ],
} as const;

const noticeTemplates = {
  password_changed_notification: "Your account password was changed.",
  email_changed_notification: "The email address on your account was changed.",
  phone_changed_notification: "The phone number on your account was changed.",
  identity_linked_notification: "A sign-in method was linked to your account.",
  identity_unlinked_notification:
    "A sign-in method was removed from your account.",
  mfa_factor_enrolled_notification:
    "A verification method was added to your account.",
  mfa_factor_unenrolled_notification:
    "A verification method was removed from your account.",
} as const;

const address = z.email().max(320);
const eventSchema = z.object({
  user: z.object({
    email: address,
    new_email: z.string().optional(),
  }),
  email_data: z.object({
    email_action_type: z.string(),
    token: z.string().optional(),
    token_hash: z.string().optional(),
    token_hash_new: z.string().optional(),
    old_email: z.string().optional(),
  }),
});

function accountMessage(
  id: string,
  to: string,
  subject: string,
  body: string,
  action?: { label: string; href: string },
): GmailMessage {
  const unrequested = "If you did not request this email, you can ignore it.";
  const text = [
    body,
    action && `${action.label}: ${action.href}`,
    action && unrequested,
    "SpeedyEssays",
  ]
    .filter(Boolean)
    .join("\n\n");
  const link = action ? escapeHtml(action.href) : "";
  const button = action
    ? `<p style="margin:26px 0"><a href="${link}" style="display:inline-block;padding:13px 20px;border-radius:6px;background:#192a50;color:#fff;font-size:15px;font-weight:bold;text-decoration:none">${escapeHtml(action.label)}</a></p>
<p style="margin:0 0 6px;color:#475569;font-size:13px">If the button doesn’t open, copy this link into your browser.</p>
<p style="margin:0 0 22px;line-height:1.5;font-size:13px;word-break:break-all"><a href="${link}" style="color:#192a50">${link}</a></p>
<p style="margin:0;color:#475569;line-height:1.5;font-size:13px">${unrequested}</p>`
    : "";
  const html = `<!doctype html>
<html lang="en"><body style="margin:0;background:#f7f5ef;font-family:Arial,Helvetica,sans-serif;color:#192a50">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#fff;border:1px solid #dedad2">
<tr><td style="padding:20px 24px;background:#192a50;color:#fff;border-bottom:4px solid #bc9559;font-size:20px;font-weight:bold">SpeedyEssays</td></tr>
<tr><td style="padding:28px 24px">
<h1 style="margin:0 0 14px;font-size:24px;line-height:1.25">${escapeHtml(subject)}</h1>
<p style="margin:0;line-height:1.6;font-size:15px">${escapeHtml(body)}</p>
${button}
</td></tr></table></td></tr></table></body></html>`;
  return { id: `auth:${id}`, to, subject, text, html };
}

function linkMessage(
  type: keyof typeof linkTemplates,
  id: string,
  to: string,
  token: string,
  origin: string,
) {
  if (!/^(?:pkce_)?[a-f0-9]{32,128}$/i.test(token))
    throw new Error("Invalid email token.");
  const link = new URL("/account", origin);
  link.hash = new URLSearchParams({ token_hash: token, type }).toString();
  const [subject, instruction, label] = linkTemplates[type];
  return accountMessage(id, to, subject, instruction, {
    href: link.href,
    label,
  });
}

function createMessages(body: string, id: string, origin: string) {
  const { user, email_data: data } = eventSchema.parse(JSON.parse(body));
  const type = data.email_action_type;
  if (type === "email_change") {
    const nextAddress = address.parse(user.new_email);
    const messages = [
      linkMessage(
        type,
        `${id}:new`,
        nextAddress,
        data.token_hash ?? "",
        origin,
      ),
    ];
    if (data.token_hash_new) {
      messages.push(
        linkMessage(
          type,
          `${id}:current`,
          user.email,
          data.token_hash_new,
          origin,
        ),
      );
    }
    return messages;
  }
  if (Object.hasOwn(linkTemplates, type)) {
    return [
      linkMessage(
        type as keyof typeof linkTemplates,
        id,
        user.email,
        data.token_hash ?? "",
        origin,
      ),
    ];
  }
  if (type === "reauthentication" && /^\d{4,12}$/.test(data.token ?? "")) {
    return [
      accountMessage(
        id,
        user.email,
        "Your SpeedyEssays verification code",
        `Your verification code is ${data.token}. Keep this code private.`,
      ),
    ];
  }
  if (Object.hasOwn(noticeTemplates, type)) {
    const recipient =
      type === "email_changed_notification"
        ? (address.safeParse(data.old_email).data ?? user.email)
        : user.email;
    return [
      accountMessage(
        id,
        recipient,
        "SpeedyEssays account security update",
        `${noticeTemplates[type as keyof typeof noticeTemplates]} If you did not make this change, contact SpeedyEssays support.`,
      ),
    ];
  }
  throw new Error("Unsupported account email.");
}

type EnqueueEmail = (id: string, messages: GmailMessage[]) => Promise<void>;

async function readHookBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let total = 0;
  let body = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return body + decoder.decode();
      total += value.byteLength;
      if (total > 48 * 1024) {
        await reader.cancel();
        return null;
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

async function verifySignature(
  secret: string,
  signature: string,
  signed: string,
) {
  const secretMatch = /^(?:v1,)?whsec_([A-Za-z0-9+/]+={0,2})$/.exec(secret);
  if (!secretMatch) return false;
  try {
    const bytes = Uint8Array.from(atob(secretMatch[1]), (c) => c.charCodeAt(0));
    if (bytes.byteLength < 16) return false;
    const key = await crypto.subtle.importKey(
      "raw",
      bytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const payload = new TextEncoder().encode(signed);
    for (const entry of signature.split(/\s+/)) {
      const match = /^v1,([A-Za-z0-9+/]{43}=)$/.exec(entry);
      if (!match) continue;
      const supplied = Uint8Array.from(atob(match[1]), (c) => c.charCodeAt(0));
      if (await crypto.subtle.verify("HMAC", key, supplied, payload))
        return true;
    }
    return false;
  } catch {
    return false;
  }
}

function hookError(status: number, message: string) {
  return Response.json({ error: { http_code: status, message } }, { status });
}

export async function receiveAuthEmail(
  request: Request,
  enqueue?: EnqueueEmail,
) {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const origin = emailSiteOrigin();
  const secret = process.env.SUPABASE_EMAIL_HOOK_SECRET?.trim();
  if (!origin || !secret || !enqueue || !gmailSenderConfig()) {
    return hookError(503, "Account email is not configured.");
  }
  const id = request.headers.get("webhook-id") ?? "";
  const timestamp = request.headers.get("webhook-timestamp") ?? "";
  const signature = request.headers.get("webhook-signature") ?? "";
  if (
    !/^[A-Za-z0-9_-]{1,90}$/.test(id) ||
    !/^\d{10}$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
    !signature ||
    signature.length > 512
  ) {
    return hookError(401, "Invalid account email signature.");
  }
  const body = await readHookBody(request).catch(() => null);
  if (body === null) return hookError(400, "Invalid account email request.");
  if (
    !(await verifySignature(secret, signature, `${id}.${timestamp}.${body}`))
  ) {
    return hookError(401, "Invalid account email signature.");
  }
  let emails: GmailMessage[];
  try {
    emails = createMessages(body, id, origin);
  } catch {
    return hookError(400, "Invalid account email request.");
  }
  try {
    await enqueue(id, emails);
    return Response.json({});
  } catch {
    return hookError(
      503,
      "Account email could not be queued. Try again shortly.",
    );
  }
}
