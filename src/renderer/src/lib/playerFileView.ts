import type { DetailWeek, PlayerDetail, ScheduleEntry } from '@shared/types'

/** Player file (design handoff "Player file"): chart columns, tiles and "The read". */

export type ColumnKind = 'played' | 'upcoming' | 'dnp'

export interface ChartColumn {
  week: number
  opponent: string | null
  kind: ColumnKind
  points: number | null
  projected: number | null
  /** Played and at or above the projection. */
  beat: boolean
}

/** First week still to come: the schedule's first entry, else the week after the last one listed. */
export function currentWeekOf(detail: Pick<PlayerDetail, 'weeks' | 'schedule'>): number {
  if (detail.schedule.length > 0) return detail.schedule[0].week
  const last = detail.weeks.at(-1)
  return last ? last.week + 1 : 1
}

/** Columns through the current week + 2; a past week without a game played is DNP. */
export function chartColumns(weeks: DetailWeek[], schedule: ScheduleEntry[]): ChartColumn[] {
  const cw = currentWeekOf({ weeks, schedule })
  return weeks
    .filter((w) => w.week < cw + 3)
    .map((w) => {
      const kind: ColumnKind = w.played ? 'played' : w.week >= cw ? 'upcoming' : 'dnp'
      return {
        week: w.week,
        opponent: w.opponent,
        kind,
        points: w.played ? (w.points ?? 0) : null,
        projected: w.projected,
        beat: w.played && w.projected !== null && w.points !== null && w.points >= w.projected
      }
    })
}

/** "Beat his projection in 4 of 6 games" over played weeks that had a projection. */
export function beatLine(columns: ChartColumn[]): string {
  const played = columns.filter((c) => c.kind === 'played')
  if (played.length === 0) return 'No games played yet'
  const withProj = played.filter((c) => c.projected !== null)
  if (withProj.length === 0) return `${played.length} game${played.length === 1 ? '' : 's'} played`
  const beat = withProj.filter((c) => c.beat).length
  return `Beat the projection in ${beat} of ${withProj.length} games`
}

export type ReadTone = 'good' | 'bad' | null

export interface ReadRow {
  label: string
  note: string
  value: string
  tone: ReadTone
}

const sign = (n: number): string => (n > 0 ? '+' : n < 0 ? '−' : '')
const signedOne = (n: number): string => `${sign(n)}${Math.abs(n).toFixed(1)}`
const signedPct = (n: number): string => `${sign(n)}${Math.abs(Math.round(n * 100))}%`
const signedInt = (n: number): string => `${sign(n)}${Math.abs(Math.round(n))}`
const byThreshold = (n: number, t: number): ReadTone => (n > t ? 'good' : n < -t ? 'bad' : null)

/** SOS / matchup rank tone: ≤ 11 tough (bad), ≥ 22 easy (good). */
export function rankTone(rank: number | null): ReadTone {
  return rank === null ? null : rank <= 11 ? 'bad' : rank >= 22 ? 'good' : null
}

/** "The read": TDs vs expected, points vs projection, schedule from here, trade market. */
export function readRows(row: PlayerDetail['row']): ReadRow[] {
  const s = row.signals
  const market = row.market
  return [
    {
      label: 'Touchdowns vs expected',
      note: 'Scored minus what the usage predicts',
      value: s?.tdDelta == null ? '—' : signedOne(s.tdDelta),
      tone: s?.tdFlag === 'down' ? 'bad' : s?.tdFlag === 'up' ? 'good' : null
    },
    {
      label: 'Points vs projection',
      note: 'Season scoring against weekly projections',
      value: s?.vsProjPct == null ? '—' : signedPct(s.vsProjPct),
      tone: s?.vsProjPct == null ? null : byThreshold(s.vsProjPct, 0.1)
    },
    {
      label: 'Schedule from here',
      note: 'Average opponent rank, 1 is the toughest',
      value: s?.rosSos == null ? '—' : s.rosSos.toFixed(1),
      tone: rankTone(s?.rosSos ?? null)
    },
    {
      label: 'Trade market',
      note: 'Market value, change over 30 days',
      value: market ? `${market.value} (${signedInt(market.trend30d)})` : '—',
      tone: market ? byThreshold(market.trend30d, 0) : null
    }
  ]
}

/** First name over the big last name: "Ja'Marr" / "Chase"; a single word is the last name. */
export function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/)
  if (parts.length < 2) return { first: '', last: fullName }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}
