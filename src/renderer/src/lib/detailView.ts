import type { BarItem } from '@/lib/charts'
import { fmtPct, fmtSigned, fmtSignedPct } from '@/lib/format'
import type { DetailWeek, PlayerSignals, UsageMetric } from '@shared/types'

/** Usage metrics the detail weeks carry (air-yards share exists only as a trend). */
export type DetailMetric = Extract<UsageMetric, 'snapPct' | 'targetShare' | 'rushShare' | 'wopr'>

export interface UsageRow {
  metric: DetailMetric
  label: string
}

const SNAP: UsageRow = { metric: 'snapPct', label: 'Snap %' }
const TARGET: UsageRow = { metric: 'targetShare', label: 'Target share' }
const RUSH: UsageRow = { metric: 'rushShare', label: 'Rush share' }
const WOPR: UsageRow = { metric: 'wopr', label: 'WOPR' }
const USAGE_ROWS: Partial<Record<string, UsageRow[]>> = {
  QB: [SNAP],
  RB: [SNAP, RUSH, WOPR],
  WR: [SNAP, TARGET, WOPR],
  TE: [SNAP, TARGET, WOPR]
}

/** Spec §6.2 item 3: sparkline rows per position; none for K / DEF. */
export function usageRows(position: string | null): UsageRow[] {
  return (position ? USAGE_ROWS[position] : undefined) ?? []
}

/** Spec §6.2 item 2: one band per week that was played or has a projection. */
export function barItems(weeks: DetailWeek[]): BarItem[] {
  return weeks
    .filter((w) => w.played || w.projected !== null)
    .map((w) => ({ label: String(w.week), value: w.played ? w.points : null, marker: w.projected }))
}

/** Spec §6.2 item 4: one line per signal family; families without data are skipped, the consistency gate is stated. */
export function signalLines(s: PlayerSignals, gamesPlayed: number): string[] {
  const lines: string[] = []
  if (s.tdDelta !== null) {
    const note =
      s.tdFlag === 'down' ? ' — regression candidate' : s.tdFlag === 'up' ? ' — due for more' : ''
    lines.push(`TDs ${fmtSigned(s.tdDelta)} vs expected${note}`)
  }
  if (s.ypo !== null && s.ypoDelta !== null) {
    lines.push(`Yds/opp ${s.ypo.toFixed(1)} · ${fmtSigned(s.ypoDelta)} vs position`)
  }
  if (s.vsProjPoints !== null) {
    const pct = s.vsProjPct === null ? '' : ` (${fmtSignedPct(s.vsProjPct)})`
    lines.push(`vs projection ${fmtSigned(s.vsProjPoints)} pts${pct}`)
  }
  if (s.floor !== null && s.ceiling !== null) {
    const start = s.startRate === null ? '' : ` · start-worthy ${fmtPct(s.startRate)}`
    lines.push(`Floor ${s.floor.toFixed(1)} · Ceiling ${s.ceiling.toFixed(1)}${start}`)
  } else {
    lines.push(`Consistency: needs 3 games (${gamesPlayed} played)`)
  }
  return lines
}
