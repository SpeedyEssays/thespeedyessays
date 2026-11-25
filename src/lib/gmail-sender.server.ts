import { z } from "zod";

type SenderConfig = { url: string; secret: string };
export type GmailMessage = {
  id: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
};

const responseSchema = z.object({
  status: z.enum([
    "ready",
    "queued",
    "quota",
    "access-denied",
    "invalid",
    "busy",
    "unavailable",
  ]),
});
type SenderRequest = { action: "check" } | (GmailMessage & { action: "send" });
type SenderResult =
  | z.infer<typeof responseSchema>["status"]
  | "deployment-access"
  | "deployment-missing"
  | "reply-missing"
  | "invalid-reply"
  | "google-busy"
  | "timed-out"
  | "transport-error";

export function gmailSenderConfig(): SenderConfig | null {
  const value = process.env.SPEEDYESSAYS_EMAIL_URL?.trim();
  const secret = process.env.SPEEDYESSAYS_EMAIL_SECRET?.trim();
  if (
    !value ||
    !secret ||
    !/^[a-f0-9]{64}$/i.test(secret) ||
    !URL.canParse(value)
  ) {
    return null;
  }
  const url = new URL(value);
  if (
    url.origin !== "https://script.google.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)
  ) {
    return null;
  }
  return { url: url.href, secret };
}

export function emailSiteOrigin() {
  const configured = process.env.SITE_ORIGIN || process.env.RENDER_EXTERNAL_URL;
  if (!configured || !URL.canParse(configured)) return null;
  const url = new URL(configured);
  return url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash
    ? url.origin
    : null;
}

async function senderRequest(
  config: SenderConfig,
  request: SenderRequest,
  signal: AbortSignal,
): Promise<SenderResult> {
  let readingReply = false;
  try {
    const payload = JSON.stringify(request);
    const timestamp = Math.floor(Date.now() / 1000);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(config.secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const bytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(`${timestamp}.${payload}`),
    );
    const signature = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    let response = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, timestamp, signature }),
      redirect: "manual",
      cache: "no-store",
      signal,
    });
    if ([301, 302, 303].includes(response.status)) {
      // Apps Script ContentService redirects only the result to its Google host.
      const location = response.headers.get("Location");
      if (!location || !URL.canParse(location, config.url))
        return "invalid-reply";
      const redirect = new URL(location, config.url);
      if (redirect.origin === "https://accounts.google.com") {
        return "deployment-access";
      }
      if (redirect.origin !== "https://script.googleusercontent.com") {
        return "invalid-reply";
      }
      readingReply = true;
      response = await fetch(redirect.href, {
        redirect: "manual",
        cache: "no-store",
        signal,
      });
      if (response.status >= 300 && response.status < 400)
        return "invalid-reply";
    }
    if ([404, 410].includes(response.status)) {
      return readingReply ? "reply-missing" : "deployment-missing";
    }
    if ([401, 403].includes(response.status)) return "deployment-access";
    if (response.status === 429) return "google-busy";
    if (!response.ok) return "transport-error";

    const body = await response.text();
    try {
      const result = responseSchema.safeParse(JSON.parse(body));
      return result.data?.status ?? "invalid-reply";
    } catch {
      if (/script function not found:\s*doPost/i.test(body))
        return "deployment-missing";
      if (
        /authorization (?:is )?required|accounts\.google\.com\/servicelogin/i.test(
          body,
        )
      ) {
        return "deployment-access";
      }
      return "invalid-reply";
    }
  } catch {
    return signal.aborted ? "timed-out" : "transport-error";
  }
}

export function sendGmail(config: SenderConfig, message: GmailMessage) {
  return senderRequest(
    config,
    { action: "send", ...message },
    AbortSignal.timeout(25_000),
  );
}

export async function checkGmail(config: SenderConfig) {
  const signal = AbortSignal.timeout(25_000);
  const result = await senderRequest(config, { action: "check" }, signal);
  // Google may lose the one-time result URL. A fresh check cannot send mail.
  return result === "reply-missing" && !signal.aborted
    ? senderRequest(config, { action: "check" }, signal)
    : result;
}
