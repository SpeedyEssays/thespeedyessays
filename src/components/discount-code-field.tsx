import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lookupDiscountCode } from "@/lib/discount-codes.functions";
import { discountCodeInput, type DiscountQuote } from "@/lib/discount-codes";

export function DiscountCodeField({
  id,
  discount,
  onChange,
  initialCode,
  disabled,
}: {
  id: string;
  discount: DiscountQuote | null;
  onChange: (discount: DiscountQuote | null) => void;
  initialCode?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(initialCode ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(
    initialCode && !discount ? "This discount code is unavailable." : "",
  );

  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    const input = discountCodeInput.safeParse(value);
    if (!input.success) {
      setProblem(input.error.issues[0].message);
      return;
    }
    setBusy(true);
    setProblem("");
    try {
      const offer = await lookupDiscountCode({ data: input.data });
      if (offer) onChange(offer);
      else setProblem("This discount code is unavailable.");
    } catch {
      setProblem("Couldn’t check the discount code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return discount ? (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-secondary/40 px-3 py-2">
      <span role="status" className="text-sm">
        <strong>{discount.code}</strong> · {discount.percent}% off
      </span>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => {
          onChange(null);
          setValue("");
        }}
      >
        Remove code
      </Button>
    </div>
  ) : (
    <form className="space-y-2" onSubmit={(event) => void apply(event)}>
      <Label htmlFor={id}>Discount code</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          maxLength={32}
          autoComplete="off"
          disabled={busy || disabled}
          onChange={(event) => {
            setValue(event.target.value);
            setProblem("");
          }}
        />
        <Button
          type="submit"
          variant="outline"
          disabled={busy || disabled || !value.trim()}
        >
          {busy ? "Checking…" : "Apply"}
        </Button>
      </div>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
    </form>
  );
}
