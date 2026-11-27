export const REFERRAL_REWARD_CENTS = 300;
export const MAX_WALLET_CENTS = 2_147_483_647;

export const walletEntryLabels = {
  "referral-reward": "Referral reward",
  "staff-reward": "Support reward",
  "top-up": "Wallet top-up",
  "order-payment": "Order payment",
  "order-refund": "Order refund",
} as const;

export type WalletEntryKind = keyof typeof walletEntryLabels;

export function parseUSDCents(value: string) {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Math.round(Number(value) * 100);
  return Number.isSafeInteger(amount) &&
    amount > 0 &&
    amount <= MAX_WALLET_CENTS
    ? amount
    : null;
}

export const walletReferencePattern = /^se-wallet-[0-9a-f-]{36}$/;
export const referralCookie = "se_referral";
