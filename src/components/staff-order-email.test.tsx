import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { AdminOrderView } from "@/lib/orders";
import { StaffOrderEmail } from "./staff-order-email";

const stubs = vi.hoisted(() => ({
  getOrderEmailDetails: vi.fn(),
  notifyOrderCustomer: vi.fn(),
}));

vi.mock("@/lib/order-email.functions", () => stubs);

const order = {
  code: "SE-48001",
  status: "in-progress",
  deliveredAt: null,
} as AdminOrderView;

beforeEach(() => {
  stubs.getOrderEmailDetails.mockReset();
  stubs.notifyOrderCustomer.mockReset();
});

it("sends a notification only when staff submits the selected template", async () => {
  const user = userEvent.setup();
  stubs.getOrderEmailDetails.mockResolvedValue({
    status: "ready",
    recipient: "customer@example.test",
  });
  stubs.notifyOrderCustomer.mockResolvedValue("queued");
  render(<StaffOrderEmail order={order} />);

  await screen.findByText("To customer@example.test");
  expect(
    screen.getByRole("option", { name: "Order delivered" }),
  ).toBeDisabled();
  await user.selectOptions(
    screen.getByLabelText("Email template"),
    "clarification",
  );
  await user.type(
    screen.getByLabelText("Message from support (optional)"),
    "Which template should we use?",
  );
  expect(stubs.notifyOrderCustomer).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Send email" }));

  expect(
    await screen.findByText("Email queued for delivery."),
  ).toBeInTheDocument();
  expect(stubs.notifyOrderCustomer).toHaveBeenCalledWith({
    data: {
      code: order.code,
      kind: "clarification",
      note: "Which template should we use?",
      expectedRecipient: "customer@example.test",
      requestId: expect.any(String),
    },
  });
});

it("prevents sending until the mail provider is configured", async () => {
  stubs.getOrderEmailDetails.mockResolvedValue({ status: "setup" });
  render(<StaffOrderEmail order={order} />);

  await screen.findByText(/Email sending needs to be connected in Render/);
  expect(screen.getByRole("button", { name: "Send email" })).toBeDisabled();
  expect(stubs.notifyOrderCustomer).not.toHaveBeenCalled();
});
