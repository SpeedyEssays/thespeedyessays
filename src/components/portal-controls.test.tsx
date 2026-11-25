import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

import type { AdminOrderView, OrderView } from "@/lib/orders";
import { OrderFeedbackForm } from "./order-feedback-form";
import { OrderFileUpload } from "./order-file-upload";
import { OrderPanel } from "./order-panel";
import { StaffNotifications } from "./staff-notifications";
import { StaffOrderStatus } from "./staff-order-status";

const stubs = vi.hoisted(() => ({
  saveOrderFeedback: vi.fn(),
  updateOrderStatus: vi.fn(),
  listStaffCustomers: vi.fn(),
  getStaffCustomer: vi.fn(),
  sendCustomerNotification: vi.fn(),
  approveOrder: vi.fn(),
  requestRevision: vi.fn(),
  uploadOrderFile: vi.fn(),
  prepareDeliveryPreview: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: stubs.invalidate }),
}));
vi.mock("@/components/chat-thread", () => ({ ChatThread: () => null }));
vi.mock("@/lib/feedback.functions", () => ({
  saveOrderFeedback: stubs.saveOrderFeedback,
}));
vi.mock("@/lib/orders.functions", () => ({
  updateOrderStatus: stubs.updateOrderStatus,
  approveOrder: stubs.approveOrder,
  requestRevision: stubs.requestRevision,
}));
vi.mock("@/lib/payments.functions", () => ({
  refreshPayment: vi.fn(),
  startCheckout: vi.fn(),
}));
vi.mock("@/lib/files.functions", () => ({
  uploadOrderFile: stubs.uploadOrderFile,
  addOrderFilePreview: vi.fn(),
}));
vi.mock("@/lib/delivery-preview", () => ({
  canRenderFilePreview: (name: string) => /\.pdf$/i.test(name),
  prepareDeliveryPreview: stubs.prepareDeliveryPreview,
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
  await user.click(screen.getByRole("radio", { name: "0 stars" }));
  await user.click(screen.getByRole("button", { name: "Save feedback" }));
  await screen.findByText("Feedback saved.");
  expect(stubs.saveOrderFeedback).toHaveBeenLastCalledWith({
    data: { code, rating: 0, comment: "" },
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
    deliveryVersion: 0,
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
      deliveryVersion: 0,
    },
  });
  expect(onSaved).toHaveBeenCalledWith("Order reopened.");
});

it("requires staff to select a delivery type and a review PDF for a Word final", async () => {
  const user = userEvent.setup();
  const original = new File(["word"], "Final.docx");
  const pdf = new File(["PDF export"], "Final.pdf", {
    type: "application/pdf",
  });
  const preview = new File(["protected preview"], "preview.pdf", {
    type: "application/pdf",
  });
  stubs.prepareDeliveryPreview.mockResolvedValue(preview);
  stubs.uploadOrderFile.mockResolvedValue({ ok: true });
  render(<OrderFileUpload code="SE-48001" staff />);

  const upload = screen.getByLabelText("Choose files for this customer");
  expect(upload).toBeDisabled();
  await user.selectOptions(screen.getByLabelText("Delivery type"), "final");
  await user.upload(upload, original);
  expect(screen.getByRole("button", { name: "Upload files" })).toBeDisabled();
  await user.upload(screen.getByLabelText("Preview PDF for Final.docx"), pdf);
  await user.click(screen.getByRole("button", { name: "Upload files" }));
  await screen.findByText(
    "Files prepared. Mark the order delivered to share the previews.",
  );
  expect(stubs.prepareDeliveryPreview).toHaveBeenCalledWith(pdf, "SE-48001");
  const data = stubs.uploadOrderFile.mock.calls[0][0].data as FormData;
  expect(data.get("kind")).toBe("final");
  expect(data.get("file")).toBe(original);
  expect(data.get("preview")).toBe(preview);
});

function deliveredOrder() {
  const deliveredAt = new Date().toISOString();
  return {
    id: 1,
    code: "SE-48001",
    title: "Delivery test",
    type: "Essay",
    service: "writing",
    pages: 1,
    price: 12,
    dueAt: deliveredAt,
    deliveredAt,
    updatedAt: deliveredAt,
    deliveryVersion: 3,
    status: "completed",
    revisionStatus: "available",
    files: [
      {
        id: 42,
        kind: "final",
        name: "Final.docx",
        size: 7000,
        access: "preview",
        hasPreview: true,
        createdAt: deliveredAt,
      },
      {
        id: 43,
        kind: "report",
        name: "Report.pdf",
        size: 2500,
        access: "original",
        hasPreview: false,
        createdAt: deliveredAt,
      },
    ],
  } as OrderView;
}

it("offers the preview and a red revision action alongside approval, then shows the clean download and rating", async () => {
  const user = userEvent.setup();
  const order = deliveredOrder();
  stubs.approveOrder.mockResolvedValue({ ok: true });
  const { rerender } = render(<OrderPanel order={order} allowApproval />);

  expect(
    screen.getByRole("link", { name: "Open preview of Final.docx" }),
  ).toHaveAttribute("href", "/api/files/42?preview=1");
  expect(
    screen.queryByRole("link", { name: "Download Final.docx" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Originality report" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Request a revision" }),
  ).toHaveAttribute("data-variant", "destructive");
  const approve = screen.getByRole("button", { name: "Approve order" });
  expect(approve).toHaveClass("bg-success");
  await user.click(approve);
  await waitFor(() =>
    expect(stubs.approveOrder).toHaveBeenCalledWith({
      data: { code: order.code, deliveryVersion: 3 },
    }),
  );
  rerender(
    <OrderPanel
      allowApproval
      order={{
        ...order,
        status: "approved",
        approvedAt: order.deliveredAt,
        files: order.files.map((file) => ({ ...file, access: "original" })),
      }}
    />,
  );
  expect(
    screen.getByRole("link", { name: "Download Final.docx" }),
  ).toHaveTextContent("Download clean copy");
  expect(
    screen.getByRole("heading", { name: "Rate your order" }),
  ).toBeInTheDocument();
});

it("removes the customer revision action after the window closes and keeps approval available", () => {
  const order = deliveredOrder();
  render(
    <OrderPanel
      order={{ ...order, revisionStatus: "expired" }}
      allowApproval
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Request a revision" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(/The 14-day revision window has ended/),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve order" })).toBeEnabled();
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
