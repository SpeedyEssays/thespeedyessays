import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_DEADLINE_EXTENSION_HOURS } from "@/lib/order-deadline";

export function DeadlineDurationField({
  id,
  description,
  disabled,
  onChange,
}: {
  id: string;
  description: string;
  disabled: boolean;
  onChange: (hours: number | undefined) => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<"hours" | "days">("hours");
  const max =
    unit === "days"
      ? MAX_DEADLINE_EXTENSION_HOURS / 24
      : MAX_DEADLINE_EXTENSION_HOURS;

  return (
    <fieldset
      className="space-y-2 rounded-lg border bg-background px-3 pb-3"
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-semibold">New deadline</legend>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {description} Choose 1 hour to 14 days.
      </p>
      <div className="flex flex-wrap gap-2">
        <div className="space-y-1">
          <Label htmlFor={id}>Time allowed</Label>
          <Input
            id={id}
            aria-describedby={`${id}-help`}
            type="number"
            className="w-28"
            min={1}
            max={max}
            step={1}
            value={quantity}
            required
            onChange={(event) => {
              const { value, valueAsNumber } = event.currentTarget;
              setQuantity(value);
              const valid =
                Number.isInteger(valueAsNumber) &&
                valueAsNumber >= 1 &&
                valueAsNumber <= max;
              onChange(
                valid ? valueAsNumber * (unit === "days" ? 24 : 1) : undefined,
              );
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-unit`}>Unit</Label>
          <select
            id={`${id}-unit`}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={unit}
            onChange={(event) => {
              setUnit(event.currentTarget.value === "days" ? "days" : "hours");
              setQuantity("");
              onChange(undefined);
            }}
          >
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
        </div>
      </div>
    </fieldset>
  );
}
