const dateAndTime = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function LocalTime({
  at,
  className,
}: {
  at: string;
  className?: string;
}) {
  return (
    <time dateTime={at} className={className}>
      {dateAndTime.format(new Date(at))}
    </time>
  );
}
