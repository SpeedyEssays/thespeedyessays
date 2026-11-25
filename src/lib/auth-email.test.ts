// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { receiveAuthEmail } from "./auth-email.server";
import type { GmailMessage } from "./gmail-sender.server";

const signingKey = Buffer.alloc(32, 9);
const firstHash = "pkce_" + "a".repeat(56);
const secondHash = "b".repeat(56);

beforeEach(() => {
  vi.stubEnv("SITE_ORIGIN", "https://orders.example.test");
  vi.stubEnv(
    "SPEEDYESSAYS_EMAIL_URL",
    "https://script.google.com/macros/s/sample/exec",
  );
  vi.stubEnv("SPEEDYESSAYS_EMAIL_SECRET", "f".repeat(64));
  vi.stubEnv(
    "SUPABASE_EMAIL_HOOK_SECRET",
    `v1,whsec_${signingKey.toString("base64")}`,
  );
});

afterEach(() => vi.unstubAllEnvs());

function eventRequest(action: string, signed = true) {
  const id = "msg_test";
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    user: { email: "old@example.test", new_email: "new@example.test" },
    email_data: {
      email_action_type: action,
      token_hash: firstHash,
      token_hash_new: secondHash,
      redirect_to: "https://untrusted.example.test/",
    },
  });
  const signature = createHmac("sha256", signed ? signingKey : "wrong")
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return new Request("https://orders.example.test/api/auth-email", {
    method: "POST",
    headers: {
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
    },
    body,
  });
}

it("rejects a request with an invalid Supabase signature", async () => {
  const enqueue = vi.fn();
  const response = await receiveAuthEmail(
    eventRequest("signup", false),
    enqueue,
  );
  expect(response.status).toBe(401);
  expect(enqueue).not.toHaveBeenCalled();
});

it.each([
  ["signup", "Confirm email address"],
  ["invite", "Accept invitation"],
  ["recovery", "Reset password"],
  ["magiclink", "Sign in to SpeedyEssays"],
])(
  "queues a branded %s email with a button and a fallback link",
  async (action, label) => {
    const enqueue =
      vi.fn<(id: string, messages: GmailMessage[]) => Promise<void>>();
    const response = await receiveAuthEmail(eventRequest(action), enqueue);
    expect(response.status).toBe(200);
    const [id, [mail]] = enqueue.mock.calls[0];
    expect(id).toBe("msg_test");
    expect(mail.to).toBe("old@example.test");
    const link = `https://orders.example.test/account#token_hash=${firstHash}&type=${action}`;
    expect(mail.text).toContain(`${label}: ${link}`);
    expect(mail.text.startsWith("Dear Customer,\n\n")).toBe(true);
    expect(mail.html).toContain(">Dear Customer,</p>");
    const escapedLink = link.replace("&", "&amp;");
    expect(mail.html).toContain(`href="${escapedLink}"`);
    expect(mail.html).toContain(`>${label}</a>`);
    expect(mail.html).toContain(`>${escapedLink}</a>`);
    expect(mail.html).toContain("SpeedyEssays");
    expect(`${mail.html}${mail.text}`).not.toContain("untrusted.example.test");
  },
);

it("matches the two email-change links to their respective addresses", async () => {
  const enqueue =
    vi.fn<(id: string, messages: GmailMessage[]) => Promise<void>>();
  const response = await receiveAuthEmail(
    eventRequest("email_change"),
    enqueue,
  );
  expect(response.status).toBe(200);
  const [next, current] = enqueue.mock.calls[0][1];
  expect(next.to).toBe("new@example.test");
  expect(next.text).toContain(firstHash);
  expect(current.to).toBe("old@example.test");
  expect(current.text).toContain(secondHash);
});
