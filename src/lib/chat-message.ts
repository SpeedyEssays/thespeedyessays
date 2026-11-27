import { z } from "zod";

export const messageBody = z.string().trim().min(1);
