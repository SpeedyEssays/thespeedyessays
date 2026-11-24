import { z } from "zod";
import {
  emailSiteOrigin,
  gmailSenderConfig,
  sendGmail,
  type GmailMessage,
} from "./gmail-sender.server";

const linkTemplates = {
  signup: [
    "Confirm your SpeedyEssays account",
    "Confirm your email address to finish creating your account.",
  ],
  invite: [
    "Your SpeedyEssays invitation",
    "Accept your invitation and set your password.",
  ],
  magiclink: [
    "Sign in to SpeedyEssays",
    "Use this link to sign in to your account.",
  ],
  recovery: [
    "Reset your SpeedyEssays password",
    "Use this link to choose a new password.",
  ],
  email_change: [
    "Confirm your SpeedyEssays email change",
    "Confirm this address to continue changing the email on your account.",
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
): GmailMessage {
  return { id: `auth:${id}`, to, subject, text: `${body}\n\nSpeedyEssays` };
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
  const [subject, instruction] = linkTemplates[type];
  return accountMessage(
    id,
    to,
    subject,
    `${instruction}\n\n${link.href}\n\nIf you did not request this email, you can ignore it.`,
  );
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

export type AuthEmailJob = { mail: GmailMessage; queuedAt: number };
type Producer = {
  sendBatch(messages: { body: AuthEmailJob }[]): Promise<void>;
};
type PendingEmail = {
  body: AuthEmailJob;
  ack(): void;
  retry(options: { delaySeconds: number }): void;
};

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

export async function receiveAuthEmail(request: Request, queue?: Producer) {
  if (request.method !== "POST")
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const origin = emailSiteOrigin();
  const secret = process.env.SUPABASE_EMAIL_HOOK_SECRET?.trim();
  if (!origin || !secret || !queue || !gmailSenderConfig()) {
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
    await queue.sendBatch(
      emails.map((mail) => ({ body: { mail, queuedAt: Date.now() } })),
    );
    return Response.json({});
  } catch {
    return hookError(
      503,
      "Account email could not be queued. Try again shortly.",
    );
  }
}

export async function deliverAuthEmails(messages: PendingEmail[]) {
  const config = gmailSenderConfig();
  for (const message of messages) {
    // Avoid retrying a link long after the customer requested it.
    if (Date.now() - message.body.queuedAt > 10 * 60 * 1000) {
      console.warn("An account email expired while waiting to send.");
      message.ack();
      continue;
    }
    const result = config
      ? await sendGmail(config, message.body.mail)
      : "unavailable";
    if (result === "queued") {
      message.ack();
    } else {
      console.warn(
        `An account email is waiting for Gmail delivery (${result}).`,
      );
      message.retry({ delaySeconds: 60 });
    }
  }
}
