export const customerGreeting = "Dear Customer,";

export function withoutCustomerGreeting(body: string) {
  return body
    .trim()
    .replace(/^(?:dear[ \t]+customer[ \t]*(?:[,:]|(?=\r?\n|$))\s*)+/i, "");
}

export function supportSenderLabel(name?: string | null) {
  return name ? `${name} Support:` : "Support:";
}
