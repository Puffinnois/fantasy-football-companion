/** Detail-panel section: small uppercase heading with an optional note, then the content. */
export function Section({
  title,
  note,
  children
}: {
  title: string
  note?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mt-5">
      <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {title}
        {note && <span className="ml-2 normal-case tracking-normal">{note}</span>}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}
