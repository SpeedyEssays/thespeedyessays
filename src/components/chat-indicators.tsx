import { Badge } from '@/components/ui/badge'

export function UnreadBadge({ count = 0 }: { count?: number }) {
  if (count === 0) return null
  return (
    <Badge variant="destructive" className="rounded-full">
      {count} unread
    </Badge>
  )
}

export function OnlineDot() {
  return (
    <span
      role="img"
      aria-label="Online"
      title="Online"
      className="inline-block size-2.5 shrink-0 rounded-full bg-success"
    />
  )
}
