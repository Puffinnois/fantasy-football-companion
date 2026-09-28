import type { LineupBuild } from '@main/lineup/build'
import { tradePlayer } from '@main/trade/player'
import type { PlayerSeries } from '@main/value/series'
import type { StashRow } from '@shared/types'
import {
  freeAgents,
  LINEUP_MIN_DELTA,
  scoreAdd,
  WAIVER_MAX,
  type ScoredAdd,
  type WaiverContext
} from './search'

interface Signals {
  series: PlayerSeries
  market: number | null
  trending: number | null
  /** FantasyPros ROS overall consensus rank: lower is better. */
  rank: number | null
}

type SignalKey = 'market' | 'trending' | 'rank'

const DIR: Record<SignalKey, 1 | -1> = { market: -1, trending: -1, rank: 1 }

function signalsOf(
  build: LineupBuild,
  series: PlayerSeries,
  trending: Map<string, number>
): Signals {
  const row = build.rowById.get(series.base.playerId)
  return {
    series,
    market: row?.market?.value ?? null,
    trending: trending.get(series.base.playerId) ?? null,
    rank: row?.expert?.ecrRank ?? null
  }
}

/** `dir` −1 = high first; players without the value last. */
function nullsLast(x: number | null, y: number | null, dir: 1 | -1): number {
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
  return (x - y) * dir
}

function byName(a: Signals, b: Signals): number {
  return a.series.base.fullName.localeCompare(b.series.base.fullName)
}

/**
 * Spec §3: free agents with upside team strength can't see yet — on an NFL team, not Inactive,
 * no lineup gain worth listing, at least one signal. The shortlist is the top `max` by each signal
 * so re-sorting by any column still shows a full list; each carries its release options.
 */
export function stashRows(
  ctx: WaiverContext,
  scored: ScoredAdd[],
  trending: Map<string, number>,
  max = WAIVER_MAX
): StashRow[] {
  const { build } = ctx
  const inLineup = new Set(
    scored.filter((x) => x.options[0].delta >= LINEUP_MIN_DELTA).map((x) => x.series.base.playerId)
  )
  const pool = freeAgents(build)
    .filter(
      (s) => s.base.team !== null && s.base.status !== 'Inactive' && !inLineup.has(s.base.playerId)
    )
    .map((s) => signalsOf(build, s, trending))
    .filter((x) => x.market !== null || x.trending !== null || x.rank !== null)
  const shortlist = new Map<string, Signals>()
  for (const key of ['market', 'trending', 'rank'] as const) {
    pool
      .filter((x) => x[key] !== null)
      .sort((a, b) => nullsLast(a[key], b[key], DIR[key]) || byName(a, b))
      .slice(0, max)
      .forEach((x) => shortlist.set(x.series.base.playerId, x))
  }
  const known = new Map(scored.map((x) => [x.series.base.playerId, x.options]))
  return [...shortlist.values()]
    .sort(
      (a, b) =>
        nullsLast(a.market, b.market, -1) || nullsLast(a.trending, b.trending, -1) || byName(a, b)
    )
    .map((x) => ({
      player: tradePlayer(build, x.series, 0),
      trending: x.trending,
      options: known.get(x.series.base.playerId) ?? scoreAdd(ctx, x.series)
    }))
}
