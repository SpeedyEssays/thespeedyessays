import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  assignmentTypeGroups,
  assignmentTypeLabel,
  changeLengthUnit,
  formatOrderLength,
  formatUSD,
  maxOrderLength,
  orderServiceIds,
  orderServices,
  SPEAKER_NOTES_FEE,
  WORDS_PER_PAGE,
  type AssignmentType,
  type LengthUnit,
  type OrderLength,
  type OrderService,
} from "@/lib/pricing";

const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";
const unitLabels = { pages: "Pages", words: "Words", slides: "Slides" };

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
  quote: { pages: number; words: number; perSlide: number };
  error?: string;
}) {
  const units: LengthUnit[] = ["pages", "words", "slides"];
  const description = {
    pages: `About ${quote.words.toLocaleString("en-US")} words at ${WORDS_PER_PAGE} words per double-spaced page.`,
    words: `${formatOrderLength(quote.pages, quote.words)}. ${WORDS_PER_PAGE} words per billable page, rounded up.`,
    slides: `${formatUSD(quote.perSlide)} per slide · up to ${maxOrderLength("slides").toLocaleString("en-US")} slides`,
  };
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Length</legend>
      <div
        role="group"
        aria-label="Length unit"
        className="flex flex-wrap gap-2"
      >
        {units.map((unit) => (
          <Button
            key={unit}
            type="button"
            size="sm"
            variant={length.unit === unit ? "default" : "outline"}
            aria-pressed={length.unit === unit}
            onClick={() => {
              if (length.unit !== unit)
                onChange(changeLengthUnit(length, unit));
            }}
          >
            {unitLabels[unit]}
          </Button>
        ))}
      </div>
      <Label htmlFor={id}>Number of {length.unit}</Label>
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
        {error || description[length.unit]}
      </p>
    </fieldset>
  );
}

export function SpeakerNotesField({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Label
      htmlFor={id}
      className="flex cursor-pointer items-start gap-3 rounded-md border p-3"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <span className="flex-1">
        <span className="block font-medium">Speaker notes</span>
        <span className="block text-xs font-normal text-muted-foreground">
          Separate Word document
        </span>
      </span>
      <span className="font-medium">+{formatUSD(SPEAKER_NOTES_FEE)}</span>
    </Label>
  );
}
