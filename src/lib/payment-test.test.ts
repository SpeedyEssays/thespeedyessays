import { afterEach, beforeEach, expect, it, vi } from "vitest";

const staff = { email: "staff@example.test" };
const reference = "se-test-9dcec983-f6e3-405e-bd04-32a91007fe07";
const url = "https://checkout.paystack.com/test-session";

vi.mock("@tanstack/react-start", () => ({
  createServerFn() {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler:
        (
          handler: (input: {
            data: unknown;
            context: { user: typeof staff };
          }) => unknown,
        ) =>
        ({ data }: { data: unknown } = { data: undefined }) =>
          handler({ data, context: { user: staff } }),
    };
    return builder;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestUrl: () => new URL("https://speedyessays.example.test/admin"),
}));
vi.mock("./identity.functions", () => ({ requireAdmin: {} }));
vi.mock("../../db", () => ({
  getDb: () => {
    throw new Error("The sandbox must not change an order");
  },
}));

import {
  startUsdPaymentTest,
  verifyUsdPaymentTest,
} from "./payment-test.functions";
import { paystackConfig } from "./payments.server";

beforeEach(() => {
  vi.stubEnv("PAYSTACK_CALLBACK_ORIGIN", "https://speedyessays.example.test");
  vi.stubEnv("PAYSTACK_TEST_SECRET_KEY", "sk_test_example");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("does not enable public checkout with a test key", () => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
  expect(paystackConfig()).toBeNull();
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_example");
  expect(paystackConfig()).toMatchObject({
    origin: "https://speedyessays.example.test",
  });
});

it("opens a USD card test using the test key and returns to the staff portal", async () => {
  const fetch = vi.fn(async (_url: string, request: RequestInit) => {
    const data = JSON.parse(String(request.body));
    expect(request.headers).toMatchObject({
      Authorization: "Bearer sk_test_example",
    });
    expect(data).toMatchObject({
      currency: "USD",
      amount: 2000,
      channels: ["card"],
      email: staff.email,
    });
    expect(new URL(data.callback_url).pathname).toBe("/admin");
    expect(new URL(data.callback_url).searchParams.get("testRef")).toBe(
      data.reference,
    );
    expect(data.reference).toMatch(/^se-test-/);
    return Response.json({
      status: true,
      data: { authorization_url: url, reference: data.reference },
    });
  });
  vi.stubGlobal("fetch", fetch);
  await expect(startUsdPaymentTest()).resolves.toEqual({ url });
  expect(fetch).toHaveBeenCalledOnce();
});

it("rejects a live key in the test setting", async () => {
  vi.stubEnv("PAYSTACK_TEST_SECRET_KEY", "sk_live_example");
  await expect(startUsdPaymentTest()).rejects.toThrow(
    "Paystack Test Secret Key",
  );
});

it("confirms only the expected USD test payment for the signed-in staff account", async () => {
  const transaction = {
    amount: 2000,
    currency: "USD",
    reference,
    domain: "test",
    status: "success",
    customer: { email: staff.email },
  };
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ status: true, data: transaction }))
    .mockResolvedValueOnce(
      Response.json({
        status: true,
        data: { ...transaction, currency: "KES" },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        status: true,
        data: { ...transaction, customer: { email: "other@example.test" } },
      }),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(verifyUsdPaymentTest({ data: reference })).resolves.toEqual({
    paid: true,
  });
  await expect(verifyUsdPaymentTest({ data: reference })).rejects.toThrow();
  await expect(verifyUsdPaymentTest({ data: reference })).rejects.toThrow(
    "another staff account",
  );
});
