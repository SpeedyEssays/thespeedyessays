import { afterEach, describe, expect, it, vi } from "vitest";
import { canSendDeliveryEmail, orderEmailKinds } from "./order-email";
import {
  checkMailjetConnection,
  orderEmailConfig,
  renderOrderEmail,
  sendOrderEmail,
} from "./order-email.server";

const config = {
  origin: "https://orders.example.test",
  from: "support@example.test",
  key: "mock-api-key",
  secret: "mock-secret",
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

  it("requires a verified sender setting and a trusted HTTPS site origin", () => {
    vi.stubEnv("MAILJET_API_KEY", "mock-api-key");
    vi.stubEnv("MAILJET_SECRET_KEY", "mock-secret");
    vi.stubEnv("MAILJET_FROM_EMAIL", "support@example.test");
    vi.stubEnv("SITE_ORIGIN", "https://orders.example.test/");
    expect(orderEmailConfig()).toEqual(config);
    vi.stubEnv("SITE_ORIGIN", "https://orders.example.test/untrusted");
    expect(orderEmailConfig()).toBeNull();
    vi.stubEnv("MAILJET_SECRET_KEY", "");
    expect(orderEmailConfig()).toBeNull();
  });

  it("queues an email for the selected customer and reuses the retry identity", async () => {
    const fetch = vi.fn<
      (url: string, options: RequestInit) => Promise<Response>
    >(async () =>
      Response.json({
        Messages: [{ Status: "success", To: [{ Email: delivery.recipient }] }],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(sendOrderEmail(config, delivery)).resolves.toBe("queued");
    await sendOrderEmail(config, delivery);
    const [url, request] = fetch.mock.calls[0];
    const payload = JSON.parse(String(request.body));
    expect(url).toBe("https://api.mailjet.com/v3.1/send");
    expect(payload).not.toHaveProperty("SandboxMode");
    expect(payload.Messages).toEqual([
      expect.objectContaining({
        To: [{ Email: delivery.recipient }],
        CustomID: `${delivery.code}:${delivery.requestId}`,
        DeduplicateCampaign: true,
        TrackClicks: "disabled",
      }),
    ]);
    expect(fetch.mock.calls[1][1].body).toBe(request.body);
  });

  it("keeps failures and uncertain delivery states distinct from a queued email", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fetch.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(sendOrderEmail(config, delivery)).resolves.toBe(
      "credentials-rejected",
    );
    fetch.mockResolvedValueOnce(new Response(null, { status: 429 }));
    await expect(sendOrderEmail(config, delivery)).resolves.toBe(
      "rate-limited",
    );
    fetch.mockRejectedValueOnce(new Error("Network unavailable"));
    await expect(sendOrderEmail(config, delivery)).resolves.toBe("unconfirmed");
    fetch.mockResolvedValueOnce(
      Response.json({ Messages: [{ Status: "error" }] }),
    );
    await expect(sendOrderEmail(config, delivery)).resolves.toBe("rejected");
  });

  it("distinguishes an unauthorized sender from rejected credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            Messages: [
              {
                Status: "error",
                Errors: [{ ErrorCode: "send-0008", StatusCode: 403 }],
              },
            ],
          },
          { status: 403 },
        ),
      ),
    );
    await expect(sendOrderEmail(config, delivery)).resolves.toBe(
      "sender-not-authorized",
    );
  });

  it("checks Mailjet in sandbox mode using only the configured sender address", async () => {
    const fetch =
      vi.fn<(url: string, options: RequestInit) => Promise<Response>>();
    fetch.mockResolvedValueOnce(
      Response.json({
        Messages: [{ Status: "success", To: [{ Email: config.from }] }],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(checkMailjetConnection(config)).resolves.toBe("connected");
    const payload = JSON.parse(String(fetch.mock.calls[0][1].body));
    expect(payload.SandboxMode).toBe(true);
    expect(payload.Messages).toEqual([
      expect.objectContaining({
        From: { Email: config.from, Name: "SpeedyEssays Support" },
        To: [{ Email: config.from }],
      }),
    ]);
  });
});
