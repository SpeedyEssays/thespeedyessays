import { expect, it, vi } from "vitest";
import {
  requireAdmin,
  requireCustomer,
  requireUser,
} from "./identity.functions";
import { customerAccountOnly, staffAccountOnly } from "./portal-access";
import { readSessionUser } from "./session.server";

vi.mock("./session.server", () => ({ readSessionUser: vi.fn() }));

const customer = {
  id: "customer",
  email: "customer@example.test",
  name: null,
  isAdmin: false,
  canManageStaff: false,
  supportName: null,
};
const staff = {
  ...customer,
  id: "staff",
  email: "staff@example.test",
  isAdmin: true,
  supportName: "Marvin",
};

it("rejects a signed-in customer at the staff server boundary", async () => {
  vi.mocked(readSessionUser).mockResolvedValue(customer);
  const next = vi.fn();
  await expect(
    requireAdmin.options.server?.({ next } as never),
  ).rejects.toThrow(customerAccountOnly);
  expect(next).not.toHaveBeenCalled();
});

it("authenticates the customer portal and rejects a staff account before a customer action", async () => {
  expect(requireCustomer.options.middleware).toContain(requireUser);
  const next = vi.fn();
  expect(() =>
    requireCustomer.options.server?.({
      context: { user: staff },
      next,
    } as never),
  ).toThrow(staffAccountOnly);
  expect(next).not.toHaveBeenCalled();
  requireCustomer.options.server?.({
    context: { user: customer },
    next,
  } as never);
  expect(next).toHaveBeenCalledOnce();
});
