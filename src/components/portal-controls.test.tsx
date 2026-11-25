import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import type { AdminOrderView } from "@/lib/orders";
import { OrderFeedbackForm } from "./order-feedback-form";
import { StaffNotifications } from "./staff-notifications";
import { StaffOrderStatus } from "./staff-order-status";

const stubs = vi.hoisted(() => ({
  saveOrderFeedback: vi.fn(),
  updateOrderStatus: vi.fn(),
  listStaffCustomers: vi.fn(),
  getStaffCustomer: vi.fn(),
  sendCustomerNotification: vi.fn(),
}));

vi.mock("@/lib/feedback.functions", () => ({
  saveOrderFeedback: stubs.saveOrderFeedback,
}));
vi.mock("@/lib/orders.functions", () => ({
  updateOrderStatus: stubs.updateOrderStatus,
}));
vi.mock("@/lib/customers.functions", () => ({
  listStaffCustomers: stubs.listStaffCustomers,
  getStaffCustomer: stubs.getStaffCustomer,
}));
vi.mock("@/lib/notifications.functions", () => ({
  sendCustomerNotification: stubs.sendCustomerNotification,
}));

beforeEach(() => {
  vi.resetAllMocks();
});

it("allows a customer to rate an approved order without a comment, then edit the feedback", async () => {
  const user = userEvent.setup();
  const code = "SE-48001";
  stubs.saveOrderFeedback.mockImplementation(async ({ data }) => ({
    rating: data.rating,
    comment: data.comment,
    createdAt: "2026-11-25T12:00:00.000Z",
    updatedAt: "2026-11-25T12:00:00.000Z",
  }));
  render(<OrderFeedbackForm code={code} feedback={null} />);

  expect(screen.getByRole("button", { name: "Save feedback" })).toBeDisabled();
  await user.click(screen.getByRole("radio", { name: "5 stars" }));
  await user.click(screen.getByRole("button", { name: "Save feedback" }));
  await screen.findByText("Feedback saved.");
  expect(stubs.saveOrderFeedback).toHaveBeenLastCalledWith({
    data: { code, rating: 5, comment: "" },
  });

  await user.click(screen.getByRole("radio", { name: "4 stars" }));
  await user.type(
    screen.getByLabelText("Comment (optional)"),
    "More charts would help.",
  );
  await user.click(screen.getByRole("button", { name: "Update feedback" }));
  expect(stubs.saveOrderFeedback).toHaveBeenLastCalledWith({
    data: { code, rating: 4, comment: "More charts would help." },
  });
});

it("lets staff reopen the same cancelled order without selecting customer approval or unverified payment", async () => {
  const user = userEvent.setup();
  const order = {
    code: "SE-48001",
    status: "cancelled",
    checkoutStarted: false,
    paidAt: null,
    files: [],
  } as unknown as AdminOrderView;
  const onSaved = vi.fn().mockResolvedValue(undefined);
  stubs.updateOrderStatus.mockResolvedValue({ ok: true });
  render(<StaffOrderStatus order={order} onSaved={onSaved} />);

  expect(
    screen.queryByRole("option", { name: "Approved" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: "Paid" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("Change order status")).toHaveValue(
    "awaiting-payment",
  );
  await user.click(screen.getByRole("button", { name: "Reopen order" }));
  expect(stubs.updateOrderStatus).toHaveBeenCalledWith({
    data: {
      code: order.code,
      status: "awaiting-payment",
      currentStatus: "cancelled",
    },
  });
  expect(onSaved).toHaveBeenCalledWith("Order reopened.");
});

it("sends a portal offer only to the recipient selected by staff", async () => {
  const user = userEvent.setup();
  const recipient = {
    id: "customer-1",
    email: "customer@example.test",
    displayName: "Customer",
  };
  stubs.listStaffCustomers.mockResolvedValue([recipient]);
  stubs.sendCustomerNotification.mockResolvedValue({ ok: true });
  render(<StaffNotifications />);

  await user.type(screen.getByLabelText("Find a customer"), recipient.email);
  await user.click(screen.getByRole("button", { name: "Search" }));
  await user.selectOptions(
    await screen.findByLabelText("Customer search results"),
    recipient.id,
  );
  await user.selectOptions(screen.getByLabelText("Type"), "offer");
  await user.type(screen.getByLabelText("Title"), "November offer");
  await user.type(
    screen.getByLabelText("Message"),
    "Ask us for this week’s offer.",
  );
  expect(stubs.sendCustomerNotification).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Send offer" }));
  await screen.findByText(
    "Sent to customer@example.test in the customer portal.",
  );
  expect(stubs.sendCustomerNotification).toHaveBeenCalledWith({
    data: {
      requestId: expect.any(String),
      userId: recipient.id,
      kind: "offer",
      title: "November offer",
      body: "Ask us for this week’s offer.",
    },
  });
});
