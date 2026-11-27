import { beforeEach, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  user: { id: "order-owner", isAdmin: false },
  releaseFiles: vi.fn(),
  approve: vi.fn(),
  findOrder: vi.fn(),
  saveRevision: vi.fn(),
  recordRevision: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn() {
    const builder = {
      middleware: () => builder,
      validator: () => builder,
      handler:
        (
          handler: (input: {
            data: unknown;
            context: { user: typeof session.user };
          }) => unknown,
        ) =>
        ({ data }: { data: unknown }) =>
          handler({ data, context: { user: session.user } }),
    };
    return builder;
  },
}));
vi.mock("./identity.functions", () => ({
  requireUser: {},
  requireAdmin: {},
  requireCustomer: {},
}));
vi.mock("./customers.server", () => ({ readCustomerProfile: vi.fn() }));
vi.mock("./order-records", () => ({ findAccessibleOrder: session.findOrder }));
vi.mock("../../db", () => ({
  getDb: () => ({
    transaction: async (transaction: (tx: object) => Promise<void>) =>
      transaction({
        select: () => ({
          from: () => ({ where: () => ({ getSQL: () => ({}) }) }),
        }),
        update: () => ({
          set: (values: { status?: string }) => ({
            where: () => {
              if (values.status === "approved")
                return { returning: session.approve };
              if (values.status === "revision")
                return { returning: () => session.saveRevision(values) };
              return session.releaseFiles();
            },
          }),
        }),
        insert: () => ({ values: session.recordRevision }),
      }),
  }),
}));

import { approveOrder, requestRevision } from "./orders.functions";

const data = { code: "SE-48001", deliveryVersion: 3 };

beforeEach(() => {
  vi.clearAllMocks();
  session.user.id = "order-owner";
  session.findOrder.mockImplementation(
    async (_code: string, user: typeof session.user) =>
      user.id === "order-owner" || user.isAdmin
        ? { id: 1, status: "completed", deliveryVersion: 3 }
        : null,
  );
  session.approve.mockResolvedValue([{ id: 1 }]);
  session.saveRevision.mockResolvedValue([{ id: 1 }]);
});

it("allows the customer to approve their own delivered order", async () => {
  await expect(approveOrder({ data })).resolves.toEqual({ ok: true });
  expect(session.findOrder).toHaveBeenCalledWith(data.code, {
    id: "order-owner",
    isAdmin: false,
  });
  expect(session.releaseFiles).toHaveBeenCalledOnce();
});

it("limits customer approval to the order owner", async () => {
  session.user.id = "other-customer";
  await expect(approveOrder({ data })).rejects.toThrow("Order not found.");
  expect(session.approve).not.toHaveBeenCalled();
  expect(session.releaseFiles).not.toHaveBeenCalled();
});

it("persists a new deadline with an overdue customer's revision request", async () => {
  const deliveredAt = new Date();
  session.findOrder.mockResolvedValue({
    id: 1,
    status: "completed",
    deliveryVersion: 3,
    detailsRevision: 0,
    deliveredAt,
    dueAt: new Date(deliveredAt.getTime() - 3_600_000),
    agreedDueAt: null,
  });
  const notes = "Please add the cover page.";
  await expect(requestRevision({ data: { ...data, notes } })).rejects.toThrow(
    "Choose a new deadline",
  );
  expect(session.saveRevision).not.toHaveBeenCalled();

  await expect(
    requestRevision({ data: { ...data, notes, deadlineHours: 1 } }),
  ).resolves.toEqual({ ok: true });
  const change = session.saveRevision.mock.calls[0][0];
  expect(change.status).toBe("revision");
  expect(change.agreedDueAt.getTime() - change.updatedAt.getTime()).toBe(
    3_600_000,
  );
  expect(session.recordRevision).toHaveBeenCalledExactlyOnceWith({
    orderId: 1,
    sender: "client",
    body: `Revision request: ${notes}\n\nRequested turnaround: 1 hour.`,
  });
});
