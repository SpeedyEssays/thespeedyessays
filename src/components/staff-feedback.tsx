import { useCallback, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";

import { LocalTime } from "@/components/local-time";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listStaffFeedback } from "@/lib/feedback.functions";
import { useInboxData } from "@/lib/use-inbox-data";

export function StaffFeedback() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setQuery(input.trim());
    setPage(0);
  }

  return (
    <section className="max-w-4xl space-y-4" aria-labelledby="staff-feedback">
      <div>
        <h2 id="staff-feedback" className="text-2xl font-semibold">
          Customer feedback
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ratings and comments customers leave after approving their work.
        </p>
      </div>
      <form className="flex max-w-xl items-end gap-2" onSubmit={search}>
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="feedback-search">Find feedback</Label>
          <Input
            id="feedback-search"
            type="search"
            maxLength={200}
            placeholder="Order number, customer email or topic"
            value={input}
            onChange={(event) => setInput(event.target.value)}
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      <FeedbackPage
        key={JSON.stringify([query, page])}
        query={query}
        page={page}
        setPage={setPage}
      />
    </section>
  );
}

function FeedbackPage({
  query,
  page,
  setPage,
}: {
  query: string;
  page: number;
  setPage: (page: number) => void;
}) {
  const load = useCallback(
    () => listStaffFeedback({ data: { query, page } }),
    [query, page],
  );
  const { data, error, refresh } = useInboxData(load, 20_000);

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 text-sm text-destructive"
        >
          Feedback couldn’t load.
          <Button type="button" variant="outline" size="sm" onClick={refresh}>
            Try again
          </Button>
        </div>
      )}
      {!data && !error && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading feedback…
        </p>
      )}
      {data && !data.entries.length && (
        <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          {query
            ? "No feedback matches your search."
            : "Customer ratings will appear here when they’re submitted."}
        </p>
      )}
      {data?.entries.map((entry) => (
        <article
          key={entry.code}
          className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Link
                to="/admin"
                search={{ tab: "orders", order: entry.code }}
                className="text-sm font-semibold text-primary underline underline-offset-2"
              >
                {entry.code}
              </Link>
              <h3 className="break-words font-sans text-base font-semibold tracking-normal">
                {entry.title}
              </h3>
              <p className="break-all text-sm text-muted-foreground">
                {entry.clientName && `${entry.clientName} · `}
                {entry.clientEmail}
              </p>
            </div>
            <span
              className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5 text-sm font-semibold"
              aria-label={`${entry.rating} of 5 stars`}
            >
              <Star aria-hidden="true" className="size-4 fill-accent" />{" "}
              {entry.rating} / 5
            </span>
          </div>
          {entry.comment && (
            <p className="whitespace-pre-wrap break-words text-sm">
              {entry.comment}
            </p>
          )}
          <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>
              Left <LocalTime at={entry.createdAt} />
            </span>
            {entry.updatedAt !== entry.createdAt && (
              <span>
                Updated <LocalTime at={entry.updatedAt} />
              </span>
            )}
          </p>
        </article>
      ))}
      {(page > 0 || data?.hasMore) && (
        <nav className="flex justify-between gap-2" aria-label="Feedback pages">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!data?.hasMore}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
