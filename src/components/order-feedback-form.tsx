import { useState, type FormEvent } from "react";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveOrderFeedback } from "@/lib/feedback.functions";
import type { OrderFeedbackView } from "@/lib/orders";
import { cn } from "@/lib/utils";

const ratings = [1, 2, 3, 4, 5];

export function OrderFeedbackForm({
  code,
  feedback,
}: {
  code: string;
  feedback: OrderFeedbackView | null;
}) {
  const [saved, setSaved] = useState(feedback);
  const [rating, setRating] = useState(feedback?.rating ?? 0);
  const [comment, setComment] = useState(feedback?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !rating) return;
    setBusy(true);
    setNotice("");
    setProblem("");
    try {
      const result = await saveOrderFeedback({
        data: { code, rating, comment },
      });
      setSaved(result);
      setComment(result.comment);
      setNotice("Feedback saved.");
    } catch (error) {
      setProblem(
        error instanceof Error
          ? error.message
          : "Couldn’t save your feedback. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="space-y-3 rounded-xl border bg-secondary/50 p-4 sm:p-5"
      aria-labelledby="order-feedback"
    >
      <div>
        <h3 id="order-feedback" className="text-lg font-semibold">
          Rate your order
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {saved
            ? "You can update your rating and comment anytime."
            : "Optional. Share how the work turned out with our support team."}
        </p>
      </div>
      <form className="space-y-4" onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy}>
          <legend className="mb-1 text-sm font-medium">
            Quality of the work
          </legend>
          <div className="flex flex-wrap items-center gap-1">
            {ratings.map((value) => (
              <label key={value} className="cursor-pointer">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="quality"
                  value={value}
                  checked={value === rating}
                  onChange={() => {
                    setRating(value);
                    setNotice("");
                  }}
                  required
                />
                <span className="grid size-10 place-items-center rounded-md hover:bg-card peer-focus-visible:ring-2 peer-focus-visible:ring-ring">
                  <Star
                    aria-hidden="true"
                    className={cn(
                      "size-6",
                      value <= rating
                        ? "fill-accent text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  />
                </span>
                <span className="sr-only">
                  {value} {value === 1 ? "star" : "stars"}
                </span>
              </label>
            ))}
            <span
              aria-hidden="true"
              className="ml-2 text-sm text-muted-foreground"
            >
              {rating ? `${rating} of 5` : "Select a rating"}
            </span>
          </div>
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="feedback-comment">Comment (optional)</Label>
          <Textarea
            id="feedback-comment"
            maxLength={5000}
            rows={3}
            value={comment}
            disabled={busy}
            onChange={(event) => {
              setComment(event.target.value);
              setNotice("");
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={busy || !rating}>
            {busy ? "Saving…" : saved ? "Update feedback" : "Save feedback"}
          </Button>
          {notice && (
            <p role="status" className="text-sm font-medium text-success">
              {notice}
            </p>
          )}
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
