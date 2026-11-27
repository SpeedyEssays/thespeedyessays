import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MAX_SOFTWARE_DETAILS,
  orderLanguageIds,
  orderLanguages,
  orderSoftware,
  orderSoftwareIds,
  type OrderLanguage,
  type SoftwareSelection,
} from "@/lib/order-requirements";
import { formatUSD } from "@/lib/pricing";

const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm";

export function OrderLanguageField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: OrderLanguage | "";
  onChange: (value: OrderLanguage | "") => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Language of the work</Label>
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(event) => onChange(event.target.value as OrderLanguage | "")}
      >
        {value === "" && <option value="">Not specified</option>}
        {orderLanguageIds.map((language) => (
          <option key={language} value={language}>
            {orderLanguages[language]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function OrderSoftwareField({
  id,
  value,
  onChange,
  details,
  error,
  disabled,
  fee,
}: {
  id: string;
  value: SoftwareSelection;
  onChange: (value: SoftwareSelection) => void;
  details?: { value: string; onChange: (value: string) => void };
  error?: string;
  disabled?: boolean;
  fee: number;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={id}>Does the work require software?</Label>
          <select
            id={id}
            className={selectClass}
            value={value === "none" ? "no" : "yes"}
            onChange={(event) =>
              onChange(event.target.value === "yes" ? "" : "none")
            }
          >
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>
        </div>
        {value !== "none" && (
          <div className="space-y-2">
            <Label htmlFor={`${id}-tool`}>Software</Label>
            <select
              id={`${id}-tool`}
              className={selectClass}
              value={value}
              aria-invalid={Boolean(error && !value)}
              onChange={(event) =>
                onChange(event.target.value as SoftwareSelection)
              }
            >
              <option value="" disabled>
                Select software
              </option>
              {orderSoftwareIds.map((tool) => (
                <option key={tool} value={tool}>
                  {orderSoftware[tool]}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {value === "other" && details && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-details`}>Specify the software</Label>
          <Input
            id={`${id}-details`}
            value={details.value}
            onChange={(event) => details.onChange(event.target.value)}
            maxLength={MAX_SOFTWARE_DETAILS}
            aria-invalid={Boolean(error)}
            required
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {disabled
          ? "The software selection is locked once checkout starts."
          : `Software work adds ${formatUSD(fee)} USD per order.`}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}
