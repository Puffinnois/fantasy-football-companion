const EASTERN = 'America/New_York'
const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

/** Eastern wall-clock offset from UTC at `at`, in ms (−4 h in EDT, −5 h in EST). */
function easternOffsetMs(at: Date): number {
  const parts: Record<string, number> = {}
  for (const p of wallClock.formatToParts(at))
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute)
  return wall - at.getTime()
}

/** nflverse `gameday` (YYYY-MM-DD) + `gametime` (HH:MM, Eastern) → ISO UTC instant; null without a valid time. */
export function kickoffIso(gameday: string | null, gametime: string | null): string | null {
  if (!gameday || !gametime) return null
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gameday)
  const t = /^(\d{1,2}):(\d{2})/.exec(gametime)
  if (!d || !t) return null
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]))
  const guess = new Date(wall - easternOffsetMs(new Date(wall)))
  return new Date(wall - easternOffsetMs(guess)).toISOString() // second pass settles DST edges
}
