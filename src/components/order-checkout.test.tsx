import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";

const stubs = vi.hoisted(() => ({
  checkout: true,
  createOrder: vi.fn(),
  startCheckout: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useSearch: () => ({ pages: 1 }),
    useLoaderData: () => stubs.checkout,
    useRouteContext: () => ({ user: { email: "customer@example.test" } }),
  }),
  Link: ({
    to,
    search,
    children,
  }: {
    to: string;
    search?: { order?: string };
    children: ReactNode;
  }) => (
    <a href={search?.order ? `${to}?order=${search.order}` : to}>{children}</a>
  ),
}));
vi.mock("@/components/portal-shell", () => ({
  PortalShell: ({ children }: { children: ReactNode }) => (
    <main>{children}</main>
  ),
}));
vi.mock("@/lib/identity.functions", () => ({ getServerUser: vi.fn() }));
vi.mock("@/lib/files.functions", () => ({ uploadOrderFile: vi.fn() }));
vi.mock("@/lib/orders.functions", () => ({ createOrder: stubs.createOrder }));
vi.mock("@/lib/payments.functions", () => ({
  isCheckoutAvailable: vi.fn(),
  startCheckout: stubs.startCheckout,
}));
vi.mock("@/lib/use-customer-activity", () => ({
  useCustomerActivity: vi.fn(),
}));

import { Route } from "@/routes/order";

const OrderPage = Route.options.component!;
const code = "SE-48001";

beforeAll(() => {
  Object.defineProperties(HTMLElement.prototype, {
    hasPointerCapture: { configurable: true, value: () => false },
    scrollIntoView: { configurable: true, value: vi.fn() },
  });
});

afterAll(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "hasPointerCapture");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  stubs.checkout = true;
  stubs.createOrder.mockReset().mockResolvedValue({ code });
  stubs.startCheckout.mockReset().mockResolvedValue({ url: "#test-checkout" });
  window.location.hash = "";
});

afterEach(() => vi.unstubAllGlobals());

async function reviewOrder() {
  const user = userEvent.setup();
  render(<OrderPage />);
  await user.click(screen.getByRole("combobox", { name: "Subject" }));
  await user.click(await screen.findByRole("option", { name: "Business" }));
  await user.type(
    screen.getByLabelText("Topic or working title"),
    "Demo checkout order",
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.type(
    screen.getByLabelText("Paper instructions"),
    "Sample instructions for the checkout test.",
  );
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await user.click(screen.getByRole("checkbox", { name: /I agree to/ }));
  return user;
}

it("saves the order before opening checkout", async () => {
  const user = await reviewOrder();
  await user.click(screen.getByRole("button", { name: "Continue to payment" }));
  await screen.findByRole("heading", { name: `Order ${code} saved` });
  expect(stubs.startCheckout).toHaveBeenCalledExactlyOnceWith({
    data: { code },
  });
  expect(stubs.createOrder.mock.invocationCallOrder[0]).toBeLessThan(
    stubs.startCheckout.mock.invocationCallOrder[0],
  );
  expect(window.location.hash).toBe("#test-checkout");
});

it("gives the customer a saved order to open after checkout fails", async () => {
  stubs.startCheckout.mockRejectedValue(new Error("Payment unavailable"));
  const user = await reviewOrder();
  await user.click(screen.getByRole("button", { name: "Continue to payment" }));
  await screen.findByRole("heading", { name: `Order ${code} saved` });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "We couldn’t open checkout",
  );
  expect(screen.getByRole("link", { name: "Open my order" })).toHaveAttribute(
    "href",
    `/dashboard?order=${code}`,
  );
});

it.each([
  { checkout: true, button: "Save and pay later" },
  { checkout: false, button: "Save order" },
])(
  "saves a usable order when the customer chooses $button",
  async ({ checkout, button }) => {
    stubs.checkout = checkout;
    const user = await reviewOrder();
    await user.click(screen.getByRole("button", { name: button }));
    await screen.findByRole("heading", { name: `Order ${code} saved` });
    expect(screen.getByRole("link", { name: "Open my order" })).toHaveAttribute(
      "href",
      `/dashboard?order=${code}`,
    );
    expect(stubs.startCheckout).not.toHaveBeenCalled();
  },
);
