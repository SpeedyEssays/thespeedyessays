import { useState } from "react";
import { cn } from "@/lib/utils";

export function StaffAvatar({
  avatarId,
  name,
  className,
}: {
  avatarId?: string | null;
  name?: string | null;
  className?: string;
}) {
  const [failedId, setFailedId] = useState<string | null>(null);

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid size-7 shrink-0 place-items-center overflow-hidden rounded-full bg-secondary text-xs font-semibold text-secondary-foreground",
        className,
      )}
    >
      {avatarId && avatarId !== failedId ? (
        <img
          src={`/api/staff-avatar/${avatarId}`}
          alt=""
          className="size-full object-cover"
          onError={() => setFailedId(avatarId)}
        />
      ) : (
        name?.charAt(0).toUpperCase() || "S"
      )}
    </span>
  );
}
