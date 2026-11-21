import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  readCustomerPresence,
  touchCustomerPresence,
} from "./customer-presence.server";
import { requireAdmin, requireUser } from "./identity.functions";

export const recordPortalActivity = createServerFn({ method: "POST" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    if (!context.user.isAdmin) await touchCustomerPresence(context.user.id);
    return null;
  });

export const getCustomerPresence = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .validator(z.string().min(1).max(128))
  .handler(({ data }) => readCustomerPresence(data));
