import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function RemoveFromPortal({
  item,
  name,
  onRemove,
}: {
  item: "file" | "message";
  name?: string;
  onRemove: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function remove() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onRemove();
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setFailed(false);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          type="button"
          aria-label={name ? `Remove ${name}` : undefined}
        >
          Remove {item}
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Remove this {item}?</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            {name
              ? `${name} will be removed from this order.`
              : "This reply will be removed for everyone in this conversation."}
          </DialogDescription>
        </DialogHeader>
        {failed && (
          <p className="text-sm text-destructive" role="alert">
            Couldn’t remove this {item}. Try again.
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button" disabled={busy}>
              Keep {item}
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            type="button"
            disabled={busy}
            onClick={() => void remove()}
          >
            {busy ? "Removing…" : `Remove ${item}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
