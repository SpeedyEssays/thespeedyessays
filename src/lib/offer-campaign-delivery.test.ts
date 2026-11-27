import { beforeEach, expect, it, vi } from "vitest";
import { findOfferRecipientEmail } from "./customers.server";
import { gmailSenderConfig, sendGmail } from "./gmail-sender.server";
import { OfferCampaignDelivery } from "./offer-campaign-delivery.server";
import type { OfferCampaignInput } from "./offer-campaign.server";

vi.mock("../../db", () => ({
  withWorkerDatabase: (_url: string, run: () => unknown) => run(),
}));
vi.mock("./customers.server", () => ({ findOfferRecipientEmail: vi.fn() }));
vi.mock("./gmail-sender.server", () => ({
  gmailSenderConfig: vi.fn(),
  sendGmail: vi.fn(),
}));

const composer = {
  id: "test-campaign",
  recipients: ["first", "second"],
  email: {
    subject: "Spring offer",
    text: "An offer for you.",
    html: "<p>An offer for you.</p>",
  },
} satisfies OfferCampaignInput;

function queue() {
  const records = new Map<string, unknown>();
  type Storage = ConstructorParameters<
    typeof OfferCampaignDelivery
  >[0]["storage"];
  const setAlarm = vi
    .fn<(time: number) => Promise<void>>()
    .mockResolvedValue(undefined);
  const storage: Storage = {
    get: async <T>(key: string) => records.get(key) as T | undefined,
    put: async (key, value) => {
      records.set(key, value);
    },
    delete: async (key) => records.delete(key),
    setAlarm,
    transaction: async (callback) => callback(storage),
  };
  const delivery = new OfferCampaignDelivery({ storage }, {});
  const start = (input = composer) =>
    delivery.fetch(
      new Request("https://offer-email.internal/start", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    );
  const status = async () =>
    (
      await delivery.fetch(new Request("https://offer-email.internal/status"))
    ).json();
  return { delivery, setAlarm, start, status };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gmailSenderConfig).mockReturnValue({
    url: "https://example.test",
    secret: "test",
  });
  vi.mocked(findOfferRecipientEmail).mockImplementation(
    async (id) => `${id}@example.test`,
  );
  vi.mocked(sendGmail).mockResolvedValue("queued");
});

it("continues the same campaign after a quota wait and never recreates a submitted campaign", async () => {
  const { delivery, setAlarm, start, status } = queue();
  await start();
  expect((await start({ ...composer, id: "other-campaign" })).status).toBe(409);
  vi.mocked(sendGmail).mockResolvedValueOnce("quota");
  await delivery.alarm();
  expect(await status()).toMatchObject({ sent: 0, status: "waiting" });
  expect(setAlarm.mock.lastCall?.[0]).toBeGreaterThan(Date.now());

  await delivery.alarm();
  const firstAttempt = vi.mocked(sendGmail).mock.calls[0][1];
  expect(vi.mocked(sendGmail).mock.calls[1][1]).toEqual(firstAttempt);
  await delivery.alarm();
  expect(await status()).toMatchObject({ sent: 2, status: "complete" });
  expect(await (await start()).json()).toMatchObject({
    sent: 2,
    status: "complete",
  });
  expect(
    vi.mocked(sendGmail).mock.calls.map(([, message]) => message.to),
  ).toEqual([
    "first@example.test",
    "first@example.test",
    "second@example.test",
  ]);
});

it("skips a recipient whose account changed before delivery", async () => {
  const { delivery, start, status } = queue();
  await start();
  vi.mocked(findOfferRecipientEmail).mockResolvedValueOnce(null);
  await delivery.alarm();
  await delivery.alarm();
  expect(await status()).toMatchObject({
    total: 2,
    sent: 1,
    skipped: 1,
    status: "complete",
  });
  expect(sendGmail).toHaveBeenCalledExactlyOnceWith(
    expect.anything(),
    expect.objectContaining({ to: "second@example.test" }),
  );
});
