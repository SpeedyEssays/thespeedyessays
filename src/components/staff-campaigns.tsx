import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "@tanstack/react-router";

import { LocalTime } from "@/components/local-time";
import {
  StaffCustomerPicker,
  type StaffRecipient,
} from "@/components/staff-customer-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { discountCodeInput, type DiscountQuote } from "@/lib/discount-codes";
import {
  createDiscountCode,
  setDiscountCodeActive,
} from "@/lib/discount-codes.functions";
import {
  getOfferCampaignProgress,
  queueOfferCampaign,
  resumeOfferCampaign,
  sendOfferEmail,
} from "@/lib/offer-email.functions";
import { useInboxData } from "@/lib/use-inbox-data";

type SavedCode = DiscountQuote & { active: boolean };

export function StaffCampaigns({
  codes,
  customerId,
}: {
  codes: SavedCode[];
  customerId?: string;
}) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <OfferEmail
        codes={codes.filter((code) => code.active)}
        customerId={customerId}
      />
      <DiscountCodes codes={codes} />
    </div>
  );
}

function OfferEmail({
  codes,
  customerId,
}: {
  codes: SavedCode[];
  customerId?: string;
}) {
  const [recipient, setRecipient] = useState<StaffRecipient | null>(null);
  const [audience, setAudience] = useState<"one" | "all">("one");
  const [headline, setHeadline] = useState("");
  const [message, setMessage] = useState("");
  const [selectedCode, setSelectedCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");
  const request = useRef<{ payload: string; id: string } | null>(null);
  const discount = codes.find((code) => code.code === selectedCode);
  const {
    data: campaign,
    error: progressError,
    refresh,
  } = useInboxData(getOfferCampaignProgress, 10_000, audience === "all");
  const campaignActive = campaign && campaign.status !== "complete";
  const canSend = Boolean(
    headline.trim() &&
    message.trim() &&
    (audience === "all" ? !campaignActive && !progressError : recipient),
  );

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canSend) return;
    const data = {
      headline: headline.trim(),
      message: message.trim(),
      discountCode: discount?.code,
    };
    const payload = JSON.stringify([
      audience,
      audience === "one" ? recipient : null,
      data,
    ]);
    if (request.current?.payload !== payload)
      request.current = { payload, id: crypto.randomUUID() };
    setBusy(true);
    setNotice("");
    setProblem("");
    try {
      const offer = { ...data, requestId: request.current.id };
      if (audience === "all") {
        const queued = await queueOfferCampaign({ data: offer });
        setNotice(
          `Campaign queued for ${queued.total} ${queued.total === 1 ? "customer" : "customers"}.`,
        );
        refresh();
      } else if (recipient) {
        await sendOfferEmail({
          data: {
            ...offer,
            userId: recipient.id,
            expectedRecipient: recipient.email,
          },
        });
        setNotice(`Offer email sent to ${recipient.email}.`);
      }
      request.current = null;
      setHeadline("");
      setMessage("");
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Couldn’t send this offer. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resume() {
    setBusy(true);
    setProblem("");
    try {
      await resumeOfferCampaign();
      refresh();
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Couldn’t resume the campaign.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="space-y-5 rounded-xl border bg-card p-5"
      aria-labelledby="offer-email-heading"
    >
      <h2 id="offer-email-heading" className="text-2xl font-semibold">
        Email an offer
      </h2>
      <fieldset disabled={busy} className="space-y-2">
        <legend className="text-sm font-semibold">Send to</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ["one", "One customer"],
              ["all", "All customers"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium has-checked:border-primary has-checked:bg-secondary"
            >
              <input
                type="radio"
                name="offer-audience"
                value={value}
                checked={audience === value}
                onChange={() => {
                  setAudience(value);
                  setProblem("");
                  setNotice("");
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      {audience === "one" ? (
        <StaffCustomerPicker
          recipient={recipient}
          setRecipient={setRecipient}
          customerId={customerId}
          disabled={busy}
        />
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            Each customer with a confirmed email receives their own copy.
            Delivery continues in the background.
          </p>
          {progressError && (
            <p role="status" className="text-destructive">
              Campaign progress couldn’t load. Retrying…
            </p>
          )}
          {campaign && (
            <div className="space-y-2 rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="font-semibold">
                  {campaign.status === "complete"
                    ? "Last campaign finished"
                    : "Campaign delivery"}
                </p>
                <p className="tabular-nums text-muted-foreground">
                  {campaign.sent} of {campaign.total} sent
                </p>
              </div>
              <progress
                className="h-2 w-full accent-success"
                aria-label="Campaign recipients processed"
                value={campaign.sent + campaign.skipped}
                max={campaign.total}
              />
              {campaign.skipped > 0 && (
                <p className="text-xs text-muted-foreground">
                  {campaign.skipped} skipped because the account no longer has
                  an eligible email.
                </p>
              )}
              {campaign.nextAttemptAt !== null && (
                <p className="text-xs text-muted-foreground">
                  Next delivery attempt{" "}
                  <LocalTime
                    at={new Date(campaign.nextAttemptAt).toISOString()}
                  />
                  .
                </p>
              )}
              {campaign.status === "paused" && (
                <div className="space-y-2">
                  <p className="text-xs text-destructive">
                    Delivery paused. Check the Gmail sender, then resume
                    sending.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void resume()}
                  >
                    Resume campaign
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <form
        className="space-y-4 border-t pt-4"
        onSubmit={(event) => void send(event)}
      >
        {audience === "one" && recipient && (
          <p className="break-all text-sm font-medium">To {recipient.email}</p>
        )}
        <fieldset disabled={busy} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="offer-headline">Offer headline</Label>
            <Input
              id="offer-headline"
              value={headline}
              maxLength={100}
              onChange={(event) => setHeadline(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="offer-message">Message</Label>
            <Textarea
              id="offer-message"
              value={message}
              maxLength={1200}
              rows={5}
              onChange={(event) => setMessage(event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="offer-discount">Discount code</Label>
            <select
              id="offer-discount"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={discount?.code ?? ""}
              onChange={(event) => setSelectedCode(event.target.value)}
            >
              <option value="">No discount code</option>
              {codes.map((code) => (
                <option value={code.code} key={code.code}>
                  {code.code} · {code.percent}% off
                </option>
              ))}
            </select>
          </div>
        </fieldset>
        {(headline.trim() || message.trim() || discount) && (
          <details className="overflow-hidden rounded-lg border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              Preview the email
            </summary>
            <div className="bg-primary px-4 py-3 font-semibold text-primary-foreground">
              SpeedyEssays
            </div>
            <div className="space-y-3 p-4 text-sm">
              {headline && (
                <h3 className="break-words font-sans text-lg font-semibold">
                  {headline}
                </h3>
              )}
              <p className="whitespace-pre-wrap break-words">{message}</p>
              {discount && (
                <p className="rounded-md border bg-secondary px-3 py-2">
                  <strong>{discount.percent}% off</strong> with code{" "}
                  {discount.code}
                </p>
              )}
              <span className="inline-flex rounded-md bg-primary px-3 py-2 font-medium text-primary-foreground">
                {discount ? "Use this discount" : "Start an order"}
              </span>
            </div>
          </details>
        )}
        <Button type="submit" disabled={busy || !canSend}>
          {busy
            ? "Please wait…"
            : audience === "all"
              ? "Send offer to all customers"
              : "Send offer email"}
        </Button>
        {notice && (
          <p role="status" className="break-words text-sm text-success">
            {notice}
          </p>
        )}
        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}
      </form>
    </section>
  );
}

function DiscountCodes({ codes }: { codes: SavedCode[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [notice, setNotice] = useState("");

  async function save(action: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true);
    setProblem("");
    setNotice("");
    try {
      await action();
      await router.invalidate();
      setNotice(message);
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Couldn’t update the discount code. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = discountCodeInput.safeParse(code);
    const amount = Number(percent);
    if (!input.success) {
      setProblem(input.error.issues[0].message);
      return;
    }
    if (!Number.isInteger(amount) || amount < 1 || amount > 99) {
      setProblem("Enter a whole percentage from 1 to 99.");
      return;
    }
    void save(async () => {
      await createDiscountCode({ data: { code: input.data, percent: amount } });
      setCode("");
      setPercent("");
    }, `Discount code ${input.data} created.`);
  }

  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-5"
      aria-labelledby="discount-codes-heading"
    >
      <h2 id="discount-codes-heading" className="text-2xl font-semibold">
        Discount codes
      </h2>
      <form className="space-y-3" onSubmit={create}>
        <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
          <div className="space-y-2">
            <Label htmlFor="new-discount-code">Code</Label>
            <Input
              id="new-discount-code"
              value={code}
              maxLength={32}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              disabled={busy}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discount-percent">Percent off</Label>
            <Input
              id="discount-percent"
              type="number"
              value={percent}
              min={1}
              max={99}
              step={1}
              onChange={(event) => setPercent(event.target.value)}
              disabled={busy}
              required
            />
          </div>
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={busy || !code.trim() || !percent}
        >
          Create code
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
      {codes.length > 0 && (
        <ul className="divide-y border-t">
          {codes.map((code) => (
            <li
              key={code.code}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="min-w-0 break-words text-sm">
                <strong>{code.code}</strong>
                <p className="text-muted-foreground">
                  {code.percent}% off · {code.active ? "Active" : "Inactive"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                aria-label={`${code.active ? "Disable" : "Enable"} ${code.code}`}
                onClick={() =>
                  void save(
                    () =>
                      setDiscountCodeActive({
                        data: { code: code.code, active: !code.active },
                      }),
                    `${code.code} ${code.active ? "disabled" : "enabled"}.`,
                  )
                }
              >
                {code.active ? "Disable" : "Enable"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
