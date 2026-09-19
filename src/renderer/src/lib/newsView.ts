/** Spec §5.3: 8 items shown, "Show more" reveals the rest. */
export const NEWS_PAGE_SIZE = 8

const BADGES: Record<string, string> = {
  fantasy_pros: 'FP',
  rotowire: 'RW',
  rotoballer: 'RB'
}

/** `FP` / `RW` / `RB`, else the raw source. */
export function sourceBadge(source: string): string {
  return BADGES[source] ?? source
}

/** "now", "5m", "2h", "3d", then "Sep 12" — with the year when it is not the current one. */
export function newsAge(publishedAt: string, now: number = Date.now()): string {
  const t = new Date(publishedAt).getTime()
  if (Number.isNaN(t)) return ''
  const minutes = Math.floor((now - t) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const date = new Date(t)
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(
    'en-US',
    sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' }
  )
}
