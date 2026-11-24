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
  request: { action: "check" } | (GmailMessage & { action: "send" }),
) {
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
    const signal = AbortSignal.timeout(12_000);
    let response = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, timestamp, signature }),
      redirect: "manual",
      signal,
    });
    if ([301, 302, 303].includes(response.status)) {
      // Apps Script ContentService redirects only the result to its Google host.
      const location = response.headers.get("Location");
      if (!location || !URL.canParse(location)) return "unavailable";
      const redirect = new URL(location);
      if (redirect.origin !== "https://script.googleusercontent.com") {
        return "unavailable";
      }
      response = await fetch(redirect.href, { redirect: "error", signal });
    }
    if (!response.ok) return "unavailable";
    const result = responseSchema.safeParse(await response.json());
    return result.data?.status ?? "unavailable";
  } catch {
    return "unavailable";
  }
}

export function sendGmail(config: SenderConfig, message: GmailMessage) {
  return senderRequest(config, { action: "send", ...message });
}

export function checkGmail(config: SenderConfig) {
  return senderRequest(config, { action: "check" });
}
