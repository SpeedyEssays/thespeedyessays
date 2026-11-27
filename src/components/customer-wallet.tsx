import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { Copy, Gift, Wallet } from "lucide-react";
import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatUSD, MIN_CHECKOUT_CENTS } from "@/lib/pricing";
import {
  parseUSDCents,
  REFERRAL_REWARD_CENTS,
  walletEntryLabels,
} from "@/lib/wallet";
import {
  getMyWallet,
  refreshWalletTopUp,
  startWalletTopUp,
} from "@/lib/wallet.functions";

type WalletData = Awaited<ReturnType<typeof getMyWallet>>;

export function WalletActivity({
  entries,
}: {
  entries: WalletData["entries"];
}) {
  if (!entries.length)
    return (
      <p className="text-sm text-muted-foreground">No wallet activity yet.</p>
    );
  return (
    <ul className="divide-y">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm"
        >
          <div className="min-w-0 flex-1">
            <p className="font-medium">{walletEntryLabels[entry.kind]}</p>
            <p className="wrap-anywhere text-muted-foreground">
              {entry.description}
            </p>
            <LocalTime
              at={entry.createdAt}
              className="text-xs text-muted-foreground"
            />
          </div>
          <span
            className={`shrink-0 font-semibold tabular-nums ${entry.amountCents > 0 ? "text-success" : "text-foreground"}`}
          >
            {entry.amountCents > 0 ? "+" : ""}
            {formatUSD(entry.amountCents / 100)} USD
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CustomerWallet({
  wallet,
  reference,
  checkoutClosed,
}: {
  wallet: WalletData;
  reference?: string;
  checkoutClosed: boolean;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const request = useRef<{ amountCents: number; requestId: string } | null>(
    null,
  );
  const amountCents = parseUSDCents(amount);

  useEffect(() => {
    if (!reference || checkoutClosed) return;
    let active = true;
    void refreshWalletTopUp({ data: { reference } }).then(
      ({ paid }) => {
        if (!active) return;
        setNotice(
          paid
            ? "Your top-up is confirmed and has been added to your wallet."
            : "The top-up is awaiting payment confirmation.",
        );
        if (paid) void router.invalidate();
      },
      () => {
        if (active)
          setProblem(
            "We couldn’t check this top-up. Use Check payment below to try again.",
          );
      },
    );
    return () => {
      active = false;
    };
  }, [reference, checkoutClosed, router]);

  async function openTopUp(
    data: Parameters<typeof startWalletTopUp>[0]["data"],
  ) {
    if (busy) return;
    setBusy(true);
    setProblem("");
    setNotice("");
    try {
      const { url } = await startWalletTopUp({ data });
      window.location.assign(url);
    } catch (failure) {
      setProblem(
        failure instanceof Error
          ? failure.message
          : "Couldn’t open checkout. Try again.",
      );
      setBusy(false);
      void router.invalidate();
    }
  }

  function createTopUp(event: FormEvent) {
    event.preventDefault();
    if (busy || !amountCents || amountCents < MIN_CHECKOUT_CENTS) return;
    if (request.current?.amountCents !== amountCents)
      request.current = { amountCents, requestId: crypto.randomUUID() };
    void openTopUp(request.current);
  }

  async function checkPayment(reference: string) {
    if (busy) return;
    setBusy(true);
    setProblem("");
    try {
      const { paid } = await refreshWalletTopUp({ data: { reference } });
      setNotice(
        paid
          ? "Your top-up is confirmed and has been added to your wallet."
          : "The top-up is awaiting payment confirmation.",
      );
      if (paid) await router.invalidate();
    } catch {
      setProblem("Payment status couldn’t be checked. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function copyReferral() {
    if (!wallet.referralUrl) return;
    try {
      await navigator.clipboard.writeText(wallet.referralUrl);
      setCopyStatus("Invitation link copied.");
    } catch {
      setCopyStatus("Select the invitation link above to copy it.");
    }
  }

  return (
    <section aria-label="Wallet" className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card">
          <div className="space-y-2 rounded-t-xl bg-primary p-5 text-primary-foreground">
            <h2 className="flex items-center gap-2 font-sans text-base font-medium">
              <Wallet className="size-4" /> Your wallet
            </h2>
            <p className="text-4xl font-semibold tabular-nums">
              {formatUSD(wallet.balanceCents / 100)}{" "}
              <span className="text-lg">USD</span>
            </p>
            <p className="text-sm">Available to pay for orders</p>
          </div>
          <form className="space-y-3 p-5" onSubmit={createTopUp}>
            <Label htmlFor="wallet-top-up">Add funds in USD</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="wallet-top-up"
                className="w-36"
                inputMode="decimal"
                placeholder="10.00"
                value={amount}
                disabled={busy || !wallet.canTopUp}
                onChange={(event) => setAmount(event.target.value)}
              />
              <Button
                disabled={
                  busy ||
                  !wallet.canTopUp ||
                  !amountCents ||
                  amountCents < MIN_CHECKOUT_CENTS
                }
              >
                {busy ? "Please wait…" : "Top up with Paystack"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {wallet.canTopUp
                ? `Minimum top-up ${formatUSD(MIN_CHECKOUT_CENTS / 100)} USD.`
                : "Online top-ups are unavailable until Paystack USD checkout is enabled."}
            </p>
          </form>
        </section>
        <section className="space-y-4 rounded-xl border bg-card p-5">
          <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-primary">
            <Gift className="size-5" />
          </div>
          <h2 className="text-2xl font-semibold">
            Invite a friend. Earn{" "}
            {formatUSD(REFERRAL_REWARD_CENTS / 100).replace(".00", "")}.
          </h2>
          <p className="text-sm text-muted-foreground">
            Share your link with a friend who is new to SpeedyEssays. Each time
            they approve an order, we add $3 USD to your wallet.
          </p>
          {wallet.referralUrl && (
            <div className="space-y-2">
              <Label htmlFor="wallet-invitation">Your invitation link</Label>
              <Input
                id="wallet-invitation"
                value={wallet.referralUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyReferral()}
              >
                <Copy /> Copy invitation link
              </Button>
            </div>
          )}
          {copyStatus && (
            <p role="status" className="text-sm text-success">
              {copyStatus}
            </p>
          )}
        </section>
      </div>
      {checkoutClosed && (
        <p className="rounded-lg border bg-card p-3 text-sm">
          Checkout closed. You can resume the pending top-up below.
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border bg-card p-3 text-sm text-success"
        >
          {notice}
        </p>
      )}
      {problem && (
        <p
          role="alert"
          className="rounded-lg border bg-card p-3 text-sm text-destructive"
        >
          {problem}
        </p>
      )}
      {wallet.topUps.length > 0 && (
        <section className="space-y-3 rounded-xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Pending top-ups</h2>
          <ul className="divide-y">
            {wallet.topUps.map((topUp) => (
              <li
                key={topUp.reference}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="font-medium">
                  {formatUSD(topUp.amountCents / 100)} USD
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || !wallet.canTopUp}
                    onClick={() =>
                      void openTopUp({ reference: topUp.reference })
                    }
                  >
                    Resume checkout
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void checkPayment(topUp.reference)}
                  >
                    Check payment
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-xl border bg-card p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Recent wallet activity</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void router.invalidate()}
            >
              Refresh wallet
            </Button>
            <Link
              to="/dashboard"
              className="text-sm font-medium underline underline-offset-2"
            >
              View my orders
            </Link>
          </div>
        </div>
        <WalletActivity entries={wallet.entries} />
      </section>
    </section>
  );
}
