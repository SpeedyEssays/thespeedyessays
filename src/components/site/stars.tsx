import { Star } from 'lucide-react'

export function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex gap-0.5" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={i <= rating ? 'size-4 fill-accent text-accent' : 'size-4 text-muted-foreground/40'} />
      ))}
    </span>
  )
}
