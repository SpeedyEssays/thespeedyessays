// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { receiveAuthEmail, type AuthEmailJob } from "./auth-email.server";

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
  const sendBatch = vi.fn();
  const response = await receiveAuthEmail(eventRequest("signup", false), {
    sendBatch,
  });
  expect(response.status).toBe(401);
  expect(sendBatch).not.toHaveBeenCalled();
});

it.each(["signup", "invite", "recovery", "magiclink"])(
  "queues %s using the configured origin and the existing account link format",
  async (action) => {
    const sendBatch =
      vi.fn<(messages: { body: AuthEmailJob }[]) => Promise<void>>();
    const response = await receiveAuthEmail(eventRequest(action), {
      sendBatch,
    });
    expect(response.status).toBe(200);
    const { mail } = sendBatch.mock.calls[0][0][0].body;
    expect(mail.to).toBe("old@example.test");
    expect(mail.text).toContain(
      `https://orders.example.test/account#token_hash=${firstHash}&type=${action}`,
    );
    expect(mail.text).not.toContain("untrusted.example.test");
  },
);

it("matches the two email-change links to their respective addresses", async () => {
  const sendBatch =
    vi.fn<(messages: { body: AuthEmailJob }[]) => Promise<void>>();
  const response = await receiveAuthEmail(eventRequest("email_change"), {
    sendBatch,
  });
  expect(response.status).toBe(200);
  const [next, current] = sendBatch.mock.calls[0][0].map(
    ({ body }) => body.mail,
  );
  expect(next.to).toBe("new@example.test");
  expect(next.text).toContain(firstHash);
  expect(current.to).toBe("old@example.test");
  expect(current.text).toContain(secondHash);
});
