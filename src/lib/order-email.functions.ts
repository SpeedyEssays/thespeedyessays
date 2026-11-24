import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAdmin } from "./identity.functions";
import {
  canSendDeliveryEmail,
  orderEmailKinds,
  orderEmailNoteLimit,
} from "./order-email";
import {
  checkGmailConnection,
  orderEmailConfig,
  orderEmailRecipient,
  sendOrderEmail,
} from "./order-email.server";
import { findAccessibleOrder } from "./order-records";
import { orderCode } from "./orders";

const orderEmailInput = z.object({ code: z.string().trim().max(20) });

export const getOrderEmailDetails = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(orderEmailInput)
  .handler(async ({ data, context }) => {
    if (!orderEmailConfig()) return { status: "setup" } as const;
    const order = await findAccessibleOrder(data.code, context.user);
    const recipient = order ? await orderEmailRecipient(order) : null;
    return recipient
      ? ({ status: "ready", recipient } as const)
      : ({ status: "unavailable" } as const);
  });

export const checkOrderEmailConnection = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(() => {
    const config = orderEmailConfig();
    return config ? checkGmailConnection(config) : ("setup" as const);
  });

export const notifyOrderCustomer = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(
    orderEmailInput.extend({
      kind: z.enum(orderEmailKinds),
      expectedRecipient: z.email().max(320),
      note: z.string().trim().max(orderEmailNoteLimit),
      requestId: z.uuid(),
    }),
  )
  .handler(async ({ data, context }) => {
    const config = orderEmailConfig();
    if (!config) return "setup" as const;
    const order = await findAccessibleOrder(data.code, context.user);
    if (!order) return "unavailable" as const;
    if (data.kind === "delivered" && !canSendDeliveryEmail(order)) {
      return "not-delivered" as const;
    }

    const recipient = await orderEmailRecipient(order);
    if (!recipient) return "unavailable" as const;
    if (recipient !== data.expectedRecipient)
      return "recipient-changed" as const;

    return sendOrderEmail(config, {
      code: orderCode(order.id),
      recipient,
      kind: data.kind,
      note: data.note,
      requestId: data.requestId,
    });
  });
