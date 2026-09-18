export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return 'never'
  const minutes = Math.round((now - t) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

export function errorMessage(err: unknown): string {
  return err instanceof Error
    ? err.message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '')
    : String(err)
}

export function fmtPoints(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

/** "+3.2" / "-0.8" / "—". */
export function fmtSigned(value: number | null): string {
  return value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}`
}

/** nflverse percentages are 0–1 fractions. */
export function fmtPct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}

/** "+9%" / "-13%" / "0%" / "—" from a fraction. */
export function fmtSignedPct(value: number | null): string {
  if (value === null) return '—'
  const pct = Math.round(value * 100)
  return `${pct > 0 ? '+' : ''}${pct}%`
}
