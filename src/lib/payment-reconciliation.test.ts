import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const { db, recordPayment } = vi.hoisted(() => ({
  db: { select: vi.fn(), update: vi.fn() },
  recordPayment: vi.fn(),
}));

vi.mock("../../db", () => ({ getDb: () => db }));

import { reconcilePayment } from "./payments.server";

const reference = "se-9dcec983-f6e3-405e-bd04-32a91007fe07";
const order = {
  id: 1,
  priceCents: 2000,
  status: "awaiting-payment",
  deadlineOption: "7d",
  dueAt: new Date("2026-12-01T00:00:00Z"),
  paidAt: null,
};
const correctPayment = {
  domain: "live",
  reference,
  amount: order.priceCents,
  currency: "USD",
  status: "success",
};

function providerPayment(overrides = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        status: true,
        data: { ...correctPayment, ...overrides },
      }),
    ),
  );
}

beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_example");
  vi.stubEnv("PAYSTACK_CALLBACK_ORIGIN", "https://speedyessays.example.test");
  db.select.mockReturnValue({ from: () => ({ where: async () => [order] }) });
  recordPayment.mockReturnValue({
    where: () => ({ returning: async () => [{ id: order.id }] }),
  });
  db.update.mockReturnValue({ set: recordPayment });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("records a verified live USD payment on the existing order", async () => {
  providerPayment();
  await expect(reconcilePayment(reference)).resolves.toBe(true);
  expect(recordPayment).toHaveBeenCalledOnce();
  expect(recordPayment).toHaveBeenCalledWith(
    expect.objectContaining({ paidAt: expect.any(Date) }),
  );
  expect(recordPayment.mock.calls[0][0]).not.toHaveProperty("dueAt");
  expect(recordPayment.mock.calls[0][0]).not.toHaveProperty("agreedDueAt");
  expect(
    new PgDialect().sqlToQuery(recordPayment.mock.calls[0][0].status).sql,
  ).toContain(
    `when "orders"."status" = 'awaiting-payment' then 'in-progress' else "orders"."status"`,
  );
});

it.each([{ domain: "test" }, { currency: "KES" }, { amount: 1999 }])(
  "leaves the saved order unpaid when payment details are incorrect (%j)",
  async (overrides) => {
    providerPayment(overrides);
    await expect(reconcilePayment(reference)).rejects.toThrow();
    expect(db.update).not.toHaveBeenCalled();
  },
);

it("leaves the saved order unpaid when the customer exits checkout", async () => {
  providerPayment({ status: "abandoned" });
  await expect(reconcilePayment(reference)).resolves.toBe(false);
  expect(db.update).not.toHaveBeenCalled();
});

it("reports payment only after it is recorded, including when two callbacks race", async () => {
  providerPayment();
  recordPayment.mockReturnValue({
    where: () => ({ returning: async () => [] }),
  });
  await expect(reconcilePayment(reference)).resolves.toBe(false);

  db.select.mockReturnValueOnce({
    from: () => ({ where: async () => [order] }),
  });
  db.select.mockReturnValueOnce({
    from: () => ({ where: async () => [{ paidAt: new Date() }] }),
  });
  await expect(reconcilePayment(reference)).resolves.toBe(true);
});
