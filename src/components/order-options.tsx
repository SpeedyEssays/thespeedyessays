import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  assignmentTypeGroups,
  assignmentTypeLabel,
  formatOrderLength,
  maxOrderLength,
  orderServiceIds,
  orderServices,
  WORDS_PER_PAGE,
  type AssignmentType,
  type OrderLength,
  type OrderService,
} from "@/lib/pricing";

const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";

export function PaperTypeField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: AssignmentType;
  onChange: (value: AssignmentType) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>Type of assignment</Label>
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(event) => onChange(event.target.value as AssignmentType)}
      >
        {assignmentTypeGroups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.types.map((type) => (
              <option key={type} value={type}>
                {assignmentTypeLabel(type)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

export function OrderServiceField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: OrderService;
  onChange: (value: OrderService) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id}>Service</Label>
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(event) => onChange(event.target.value as OrderService)}
      >
        {orderServiceIds.map((service) => (
          <option value={service} key={service}>
            {orderServices[service].label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function OrderLengthField({
  id,
  length,
  onChange,
  quote,
  error,
}: {
  id: string;
  length: OrderLength;
  onChange: (length: OrderLength) => void;
  quote: { pages: number; words: number };
  error?: string;
}) {
  const isPages = length.unit === "pages";
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Length</legend>
      <div
        role="group"
        aria-label="Length unit"
        className="flex flex-wrap gap-2"
      >
        {(["pages", "words"] as const).map((unit) => (
          <Button
            key={unit}
            type="button"
            size="sm"
            variant={length.unit === unit ? "default" : "outline"}
            aria-pressed={length.unit === unit}
            onClick={() => {
              if (length.unit !== unit)
                onChange({
                  unit,
                  amount: String(unit === "pages" ? quote.pages : quote.words),
                });
            }}
          >
            {unit === "pages" ? "Pages" : "Words"}
          </Button>
        ))}
      </div>
      <Label htmlFor={id}>
        {isPages ? "Number of pages" : "Number of words"}
      </Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={maxOrderLength(length.unit)}
        step={1}
        value={length.amount}
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint`}
        className="max-w-40 tabular-nums"
        onChange={(event) =>
          onChange({ ...length, amount: event.target.value })
        }
      />
      <p
        id={`${id}-hint`}
        className={`text-xs ${error ? "text-destructive" : "text-muted-foreground"}`}
      >
        {error ||
          (isPages
            ? `About ${quote.words.toLocaleString("en-US")} words at ${WORDS_PER_PAGE} words per double-spaced page.`
            : `${formatOrderLength(quote.pages, quote.words)}. ${WORDS_PER_PAGE} words per billable page, rounded up.`)}
      </p>
    </fieldset>
  );
}
