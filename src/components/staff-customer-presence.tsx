import { useEffect, useState } from "react";
import { getCustomerPresence } from "@/lib/customer-presence.functions";
import { LocalTime } from "./local-time";

type Presence = Awaited<ReturnType<typeof getCustomerPresence>>;

export function StaffCustomerPresence({ userId }: { userId: string }) {
  const [presence, setPresence] = useState<Presence | "error" | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        if (!document.hidden) {
          const status = await getCustomerPresence({ data: userId });
          if (active) setPresence(status);
        }
      } catch {
        if (active) setPresence("error");
      } finally {
        if (active) timer = setTimeout(poll, 15_000);
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [userId]);

  if (presence === null)
    return <p className="text-xs text-muted-foreground">Checking activity…</p>;
  if (presence === "error")
    return (
      <p className="text-xs text-muted-foreground">
        Activity status unavailable
      </p>
    );

  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
      <span
        className={
          presence.online ? "inline-flex items-center gap-1.5 font-semibold text-success" : "font-medium"
        }
      >
        {presence.online && <span aria-hidden="true" className="size-2.5 rounded-full bg-success" />}
        {presence.online ? "Online" : "Offline"}
      </span>
      {!presence.online &&
        (presence.lastSeenAt ? (
          <span>
            Last seen <LocalTime at={presence.lastSeenAt} />
          </span>
        ) : (
          <span>No activity recorded</span>
        ))}
    </p>
  );
}
