import { expect, it } from "vitest";

import { customerRevisionStatus, orderRevisionDeadline } from "./orders";

const delivery = {
  deliveredAt: "2026-11-01T08:30:15Z",
  updatedAt: "2026-11-14T08:30:15Z",
  status: "approved",
};

it("ends the customer revision period exactly 14 days after delivery, even after a later update", () => {
  const cutoff = new Date("2026-11-15T08:30:15Z").getTime();
  expect(orderRevisionDeadline(delivery)).toBe(cutoff);
  expect(customerRevisionStatus(delivery, cutoff - 1)).toBe("available");
  expect(customerRevisionStatus(delivery, cutoff)).toBe("expired");
  expect(
    customerRevisionStatus({ ...delivery, status: "revision" }, cutoff),
  ).toBe("unavailable");
});

it("keeps draft reviews available before the first final delivery", () => {
  expect(
    customerRevisionStatus({
      ...delivery,
      status: "draft-ready",
      deliveredAt: null,
    }),
  ).toBe("available");
});
