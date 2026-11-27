import { useCallback, useRef, useState, type FormEvent } from "react";
import { WalletActivity } from "@/components/customer-wallet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatUSD } from "@/lib/pricing";
import { useInboxData } from "@/lib/use-inbox-data";
import { parseUSDCents } from "@/lib/wallet";
import { getStaffWallet, grantWalletReward } from "@/lib/wallet.functions";

export function StaffCustomerWallet({ userId }: { userId: string }) {
  const load = useCallback(
    () => getStaffWallet({ data: { userId } }),
    [userId],
  );
  const { data: wallet, error, refresh } = useInboxData(load, 30_000);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const request = useRef<{ key: string; id: string } | null>(null);
  const amountCents = parseUSDCents(amount);

  async function reward(event: FormEvent) {
    event.preventDefault();
    if (busy || !amountCents || !reason.trim()) return;
    const key = JSON.stringify([userId, amountCents, reason.trim()]);
    if (request.current?.key !== key)
      request.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    setProblem("");
    setNotice("");
    try {
      await grantWalletReward({
        data: {
          userId,
          amountCents,
          reason: reason.trim(),
          requestId: request.current.id,
        },
      });
      setNotice(
        `${formatUSD(amountCents / 100)} USD was credited to this customer’s wallet.`,
      );
      setAmount("");
      setReason("");
      request.current = null;
      refresh();
    } catch (failure) {
      setProblem(
        failure instanceof Error
          ? failure.message
          : "Couldn’t credit the reward. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Customer wallet</h3>
        {wallet && (
          <p className="font-semibold tabular-nums">
            {formatUSD(wallet.balanceCents / 100)} USD
          </p>
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive" role="status">
          The wallet couldn’t load. Retrying…
        </p>
      )}
      <form className="space-y-3" onSubmit={(event) => void reward(event)}>
        <div className="space-y-2">
          <Label htmlFor="staff-wallet-amount">Reward amount in USD</Label>
          <Input
            id="staff-wallet-amount"
            inputMode="decimal"
            placeholder="3.00"
            className="w-36"
            value={amount}
            disabled={busy}
            required
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="staff-wallet-reason">Reason for reward</Label>
          <Textarea
            id="staff-wallet-reason"
            rows={2}
            maxLength={500}
            required
            value={reason}
            disabled={busy}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <Button size="sm" disabled={busy || !amountCents || !reason.trim()}>
          {busy ? "Crediting…" : "Credit wallet reward"}
        </Button>
      </form>
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {wallet && wallet.entries.length > 0 && (
        <details className="border-t pt-3">
          <summary className="cursor-pointer text-sm font-medium">
            Recent wallet activity
          </summary>
          <WalletActivity entries={wallet.entries.slice(0, 5)} />
        </details>
      )}
    </section>
  );
}
