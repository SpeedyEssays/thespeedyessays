import { z } from "zod";

export const discountCodeInput = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9_-]{2,31}$/,
    "Use 3 to 32 letters, numbers, hyphens or underscores for the discount code.",
  );

export type DiscountQuote = { code: string; percent: number };
export const inactiveDiscountMessage =
  "This discount code is unavailable. Apply a different code or remove it before saving.";
export const minimumDiscountMessage =
  "This code brings the total below the $2.00 USD checkout minimum. Adjust the order or remove the code.";
