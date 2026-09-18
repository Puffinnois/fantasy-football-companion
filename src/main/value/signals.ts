import { round2 } from '@main/db/repos/points'
import type { PlayerSignals, Trend, UsageMetric, UsageTrend } from '@shared/types'
import type { PlayerSeries } from './series'

/** Games in the "recent" window of a usage trend (spec §3.1). */
export const RECENT_GAMES = 3
/** recent − season from which a share (target, rush, air yards, WOPR) counts as rising / falling. */
export const SHARE_TREND_THRESHOLD = 0.03
/** Same for snap %. */
export const SNAP_TREND_THRESHOLD = 0.05
/** Games with the metric needed before a trend is reported. */
export const MIN_GAMES_USAGE = 2
/** Games needed before floor / ceiling / stdev / start rate are reported (spec §3.3). */
export const MIN_GAMES_CONSISTENCY = 3
/** |actual − expected TDs| from which the regression flag is set (spec §3.2). */
export const TD_FLAG_THRESHOLD = 1.5
/** Positions with opportunities; K and DEF have none. */
export const OPPORTUNITY_POSITIONS: readonly string[] = ['QB', 'RB', 'WR', 'TE']

const USAGE_THRESHOLDS: Record<UsageMetric, number> = {
  snapPct: SNAP_TREND_THRESHOLD,
  targetShare: SHARE_TREND_THRESHOLD,
  rushShare: SHARE_TREND_THRESHOLD,
  airYardsShare: SHARE_TREND_THRESHOLD,
  wopr: SHARE_TREND_THRESHOLD
}

const mean = (values: number[]): number => values.reduce((s, v) => s + v, 0) / values.length

/** Season mean vs last-RECENT_GAMES mean over the games that have the metric, oldest first. */
export function usageTrend(values: number[], threshold: number): UsageTrend | null {
  if (values.length < MIN_GAMES_USAGE) return null
  const season = mean(values)
  const recent = mean(values.slice(-RECENT_GAMES))
  const diff = recent - season
  const trend: Trend = diff >= threshold ? 'rising' : diff <= -threshold ? 'falling' : 'flat'
  return { season, recent, trend }
}

/** Opportunities of one line in Sleeper keys: targets + carries, pass attempts + carries for a QB. */
export function opportunities(
  position: string | null,
  line: Record<string, number>
): number | null {
  if (position === 'QB') return (line.pass_att ?? 0) + (line.rush_att ?? 0)
  if (position === 'RB' || position === 'WR' || position === 'TE')
    return (line.rec_tgt ?? 0) + (line.rush_att ?? 0)
  return null
}

/** TDs and yards earned on those opportunities: rushing + receiving, plus passing for a QB. */
export function production(
  position: string | null,
  line: Record<string, number>
): { tds: number; yards: number } {
  const passing = position === 'QB'
  return {
    tds: (line.rush_td ?? 0) + (line.rec_td ?? 0) + (passing ? (line.pass_td ?? 0) : 0),
    yards: (line.rush_yd ?? 0) + (line.rec_yd ?? 0) + (passing ? (line.pass_yd ?? 0) : 0)
  }
}

export interface PositionTotals {
  opportunities: number
  tds: number
  yards: number
}

function sumProduction(position: string | null, series: PlayerSeries): PositionTotals {
  const totals: PositionTotals = { opportunities: 0, tds: 0, yards: 0 }
  for (const w of series.weeks) {
    if (!w.played) continue
    totals.opportunities += opportunities(position, w.line) ?? 0
    const { tds, yards } = production(position, w.line)
    totals.tds += tds
    totals.yards += yards
  }
  return totals
}

/** League-wide sums per position over every candidate's played games (spec §3.2 rates). */
export function positionTotals(players: PlayerSeries[]): Map<string, PositionTotals> {
  const totals = new Map<string, PositionTotals>()
  for (const p of players) {
    const pos = p.base.position
    if (pos === null || !OPPORTUNITY_POSITIONS.includes(pos)) continue
    const t = totals.get(pos) ?? { opportunities: 0, tds: 0, yards: 0 }
    const own = sumProduction(pos, p)
    t.opportunities += own.opportunities
    t.tds += own.tds
    t.yards += own.yards
    totals.set(pos, t)
  }
  return totals
}

/** p-th percentile (0..1) with linear interpolation between the two nearest ranks. */
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo)
}

/** Population standard deviation. */
export function stdev(values: number[]): number {
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

/** Everything in PlayerSignals except the schedule fields, which schedule.ts produces. */
export type StatSignals = Omit<PlayerSignals, 'nextOpponent' | 'rosSos' | 'byesRemaining'>

/** Spec §3.1–3.3 for one player; `totals` is the position's league-wide sum, `replacementPpg` its STD replacement level. */
export function statSignals(
  series: PlayerSeries,
  totals: PositionTotals | undefined,
  replacementPpg: number | null
): StatSignals {
  const position = series.base.position
  const played = series.weeks.filter((w) => w.played)

  const trend = (metric: UsageMetric): UsageTrend | null =>
    usageTrend(
      played.flatMap((w) => {
        const v = w[metric]
        return v === null ? [] : [v]
      }),
      USAGE_THRESHOLDS[metric]
    )
  const usage: PlayerSignals['usage'] = {
    snapPct: trend('snapPct'),
    targetShare: trend('targetShare'),
    rushShare: trend('rushShare'),
    airYardsShare: trend('airYardsShare'),
    wopr: trend('wopr')
  }

  const own = sumProduction(position, series)
  const hasRate = totals !== undefined && totals.opportunities > 0
  const tdDelta =
    hasRate && own.opportunities > 0
      ? round2(own.tds - own.opportunities * (totals.tds / totals.opportunities))
      : null
  const ypo = own.opportunities > 0 ? round2(own.yards / own.opportunities) : null
  const ypoDelta =
    hasRate && own.opportunities > 0
      ? round2(own.yards / own.opportunities - totals.yards / totals.opportunities)
      : null

  const withProjection = played.filter((w) => w.projected !== null)
  const actual = withProjection.reduce((s, w) => s + (w.points ?? 0), 0)
  const projected = withProjection.reduce((s, w) => s + (w.projected ?? 0), 0)

  const points = played.map((w) => w.points ?? 0)
  const enough = points.length >= MIN_GAMES_CONSISTENCY

  return {
    usage,
    tdDelta,
    tdFlag:
      tdDelta === null
        ? null
        : tdDelta >= TD_FLAG_THRESHOLD
          ? 'down'
          : tdDelta <= -TD_FLAG_THRESHOLD
            ? 'up'
            : null,
    ypo,
    ypoDelta,
    vsProjPoints: withProjection.length > 0 ? round2(actual - projected) : null,
    vsProjPct: withProjection.length > 0 && projected > 0 ? (actual - projected) / projected : null,
    floor: enough ? round2(percentile(points, 0.25)) : null,
    ceiling: enough ? round2(percentile(points, 0.75)) : null,
    stdev: enough ? round2(stdev(points)) : null,
    startRate:
      enough && replacementPpg !== null
        ? points.filter((p) => p >= replacementPpg).length / points.length
        : null
  }
}
