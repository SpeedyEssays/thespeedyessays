// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canSendDeliveryEmail, orderEmailKinds } from "./order-email";
import {
  checkGmailConnection,
  orderEmailConfig,
  renderOrderEmail,
  sendOrderEmail,
} from "./order-email.server";

const config = {
  origin: "https://orders.example.test",
  sender: {
    url: "https://script.google.com/macros/s/test-deployment/exec",
    secret: "c".repeat(64),
  },
};
const delivery = {
  code: "SE-48001",
  kind: "delivered",
  note: "<img src=x onerror=alert(1)>\nPlease check your portal & reply.",
  recipient: "customer@example.test",
  requestId: "00000000-1000-4000-8000-000000000001",
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("order email", () => {
  it.each(orderEmailKinds)(
    "renders the %s template with the correct order link",
    (kind) => {
      const { subject, text, html } = renderOrderEmail(
        { ...delivery, kind },
        config.origin,
      );
      const link = "https://orders.example.test/dashboard?order=SE-48001";
      expect(subject).toContain("SE-48001");
      expect(text).toContain(link);
      expect(html).toContain(`href="${link}"`);
      expect(html).toContain("&lt;img");
      expect(html).toContain("portal &amp; reply.");
      expect(html).not.toContain("<img");
    },
  );

  it("only offers a delivery email after the order is delivered", () => {
    const deliveredAt = new Date();
    expect(canSendDeliveryEmail({ status: "in-progress", deliveredAt })).toBe(
      false,
    );
    expect(
      canSendDeliveryEmail({ status: "completed", deliveredAt: null }),
    ).toBe(false);
    expect(canSendDeliveryEmail({ status: "completed", deliveredAt })).toBe(
      true,
    );
    expect(canSendDeliveryEmail({ status: "approved", deliveredAt })).toBe(
      true,
    );
  });

  it("requires an Apps Script deployment, a connection key and a trusted site origin", () => {
    vi.stubEnv("SPEEDYESSAYS_EMAIL_URL", config.sender.url);
    vi.stubEnv("SPEEDYESSAYS_EMAIL_SECRET", config.sender.secret);
    vi.stubEnv("SITE_ORIGIN", "https://orders.example.test/");
    expect(orderEmailConfig()).toEqual(config);
    vi.stubEnv("SITE_ORIGIN", "https://orders.example.test/untrusted");
    expect(orderEmailConfig()).toBeNull();
    vi.stubEnv("SITE_ORIGIN", config.origin);
    vi.stubEnv(
      "SPEEDYESSAYS_EMAIL_URL",
      "https://script.google.com.example.test/macros/s/test/exec",
    );
    expect(orderEmailConfig()).toBeNull();
  });

  it("queues an email for the selected customer and reuses the retry identity", async () => {
    const fetch = vi.fn<
      (url: string, options: RequestInit) => Promise<Response>
    >(async () => Response.json({ status: "queued" }));
    vi.stubGlobal("fetch", fetch);
    await expect(sendOrderEmail(config, delivery)).resolves.toBe("queued");
    await sendOrderEmail(config, delivery);
    const [url, request] = fetch.mock.calls[0];
    const { payload, timestamp, signature } = JSON.parse(String(request.body));
    expect(url).toBe(config.sender.url);
    expect(JSON.parse(payload)).toMatchObject({
      action: "send",
      to: delivery.recipient,
      id: `${delivery.code}:${delivery.requestId}`,
    });
    expect(signature).toBe(
      createHmac("sha256", config.sender.secret)
        .update(`${timestamp}.${payload}`)
        .digest("base64"),
    );
    expect(String(request.body)).not.toContain(config.sender.secret);
    expect(JSON.parse(String(fetch.mock.calls[1][1].body)).payload).toBe(
      payload,
    );
  });

  it("keeps failures and uncertain delivery states distinct from a queued email", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fetch.mockResolvedValueOnce(Response.json({ status: "access-denied" }));
    await expect(sendOrderEmail(config, delivery)).resolves.toBe(
      "credentials-rejected",
    );
    fetch.mockResolvedValueOnce(Response.json({ status: "quota" }));
    await expect(sendOrderEmail(config, delivery)).resolves.toBe(
      "rate-limited",
    );
    fetch.mockRejectedValueOnce(new Error("Network unavailable"));
    await expect(sendOrderEmail(config, delivery)).resolves.toBe("unconfirmed");
    fetch.mockResolvedValueOnce(Response.json({ status: "invalid" }));
    await expect(sendOrderEmail(config, delivery)).resolves.toBe("rejected");
  });

  it("does not forward signed requests to a redirect outside Google", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(Response.redirect("https://example.test/elsewhere"));
    vi.stubGlobal("fetch", fetch);
    await expect(sendOrderEmail(config, delivery)).resolves.toBe("unconfirmed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("checks the sender without sending an email and follows Google's result URL", async () => {
    const fetch =
      vi.fn<(url: string, options: RequestInit) => Promise<Response>>();
    const result =
      "https://script.googleusercontent.com/macros/echo?test=result";
    fetch.mockResolvedValueOnce(Response.redirect(result, 302));
    fetch.mockResolvedValueOnce(Response.json({ status: "ready" }));
    vi.stubGlobal("fetch", fetch);
    await expect(checkGmailConnection(config)).resolves.toBe("connected");
    const payload = JSON.parse(String(fetch.mock.calls[0][1].body));
    expect(JSON.parse(payload.payload)).toEqual({ action: "check" });
    expect(fetch.mock.calls[1][0]).toBe(result);
    expect(fetch.mock.calls[1][1].body).toBeUndefined();
  });
});
