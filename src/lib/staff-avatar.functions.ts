import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "../../db";
import { staffAvatars } from "../../db/schema";
import { requireAdmin } from "./identity.functions";

export const getMyStaffAvatar = createServerFn({ method: "GET" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    const [avatar] = await getDb()
      .select({ id: staffAvatars.id })
      .from(staffAvatars)
      .where(eq(staffAvatars.userId, context.user.id));
    return avatar?.id ?? null;
  });

const avatarInput = z
  .file()
  .refine(
    (file) =>
      file.type === "image/jpeg" && file.size >= 5 && file.size <= 262_144,
    "Choose a valid profile photo.",
  );

export const uploadStaffAvatar = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((form: FormData) => avatarInput.parse(form.get("avatar")))
  .handler(async ({ data, context }) => {
    const jpeg = Buffer.from(await data.arrayBuffer());
    if (
      jpeg[0] !== 0xff ||
      jpeg[1] !== 0xd8 ||
      jpeg[2] !== 0xff ||
      jpeg.at(-2) !== 0xff ||
      jpeg.at(-1) !== 0xd9
    ) {
      throw new Error("This picture couldn’t be read. Choose a valid photo.");
    }
    const id = randomUUID();
    await getDb()
      .insert(staffAvatars)
      .values({ userId: context.user.id, id, jpeg })
      .onConflictDoUpdate({ target: staffAvatars.userId, set: { id, jpeg } });
    return id;
  });

export const removeStaffAvatar = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async ({ context }) => {
    await getDb()
      .delete(staffAvatars)
      .where(eq(staffAvatars.userId, context.user.id));
    return { ok: true };
  });
