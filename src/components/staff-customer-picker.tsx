import {
  useEffect,
  useId,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getStaffCustomer,
  listStaffCustomers,
} from "@/lib/customers.functions";

export type StaffRecipient = Awaited<
  ReturnType<typeof listStaffCustomers>
>[number];

export function StaffCustomerPicker({
  recipient,
  setRecipient,
  customerId,
  disabled,
}: {
  recipient: StaffRecipient | null;
  setRecipient: Dispatch<SetStateAction<StaffRecipient | null>>;
  customerId?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<StaffRecipient[] | null>(null);
  const [loadingRecipient, setLoadingRecipient] = useState(Boolean(customerId));
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!customerId) return;
    let active = true;
    void getStaffCustomer({ data: customerId })
      .then(
        (account) => {
          if (active) setRecipient((current) => current ?? account);
        },
        () => {
          if (active)
            setProblem(
              "The selected account couldn’t load. Search for the customer below.",
            );
        },
      )
      .finally(() => {
        if (active) setLoadingRecipient(false);
      });
    return () => {
      active = false;
    };
  }, [customerId, setRecipient]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching || disabled) return;
    setSearching(true);
    setProblem("");
    try {
      setAccounts(await listStaffCustomers({ data: { query } }));
    } catch {
      setProblem("Customer accounts couldn’t load. Try again.");
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-3">
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => void search(event)}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor={`${id}-search`}>Find a customer</Label>
          <Input
            id={`${id}-search`}
            type="search"
            placeholder="Name or email"
            maxLength={200}
            value={query}
            disabled={disabled}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          disabled={searching || disabled}
        >
          {searching ? "Searching…" : "Search"}
        </Button>
      </form>
      {problem && (
        <p role="alert" className="text-sm text-destructive">
          {problem}
        </p>
      )}
      {loadingRecipient && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading selected customer…
        </p>
      )}
      {accounts?.length === 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          No customers match this search.
        </p>
      )}
      {accounts && accounts.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor={`${id}-recipient`}>Customer search results</Label>
          <select
            id={`${id}-recipient`}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={
              accounts.some((account) => account.id === recipient?.id)
                ? recipient?.id
                : ""
            }
            onChange={(event) =>
              setRecipient(
                accounts.find((account) => account.id === event.target.value) ??
                  null,
              )
            }
            disabled={disabled}
          >
            <option value="">Choose a customer</option>
            {accounts.map((account) => {
              const name = account.displayName || account.accountName;
              return (
                <option key={account.id} value={account.id}>
                  {name ? `${name} · ${account.email}` : account.email}
                </option>
              );
            })}
          </select>
        </div>
      )}
    </div>
  );
}
