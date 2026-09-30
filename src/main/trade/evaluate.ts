import { teamName, windowWeeks, type LineupBuild } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import { dealProblem, dealTeams, type DealMove } from '@shared/deal'
import type { Team, TradeEvaluation, TradeProposal, TradeSideResult } from '@shared/types'
import { startsByRoster } from './player'
import { sideFor, type DealSide, type SideOptions, type SideMemo } from './side'

export { isStarter, marketSum } from './side'

/** Spec 6b §2.4: a side is market-fair when it receives at least this share of what it gives. */
export const MARKET_FAIR = 0.9

export type TradeErrorCode = 'NO_PROJECTIONS' | 'NO_ME' | 'INVALID_TRADE'

/** Spec 6b §4.2 / §6: the message is what the renderer shows; the code is for tests and callers in main. */
export class TradeError extends Error {
  constructor(
    readonly code: TradeErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'TradeError'
  }
}

export interface EvaluateOptions extends SideOptions {
  /** Multi-team spec §2.3: reuse side verdicts across calls (one search run); none by default. */
  memo?: SideMemo
}

export function myTeam(build: LineupBuild): Team {
  const me = build.inputs.teams.find((t) => t.isMe)
  if (!me) throw new TradeError('NO_ME', "Your team isn't identified — re-import from Setup")
  return me
}

export function requireWindow(build: LineupBuild): number[] {
  const weeks = windowWeeks(build)
  if (weeks.length === 0) {
    throw new TradeError(
      'NO_PROJECTIONS',
      'No projections stored for this season — trades and waivers are valued on the remaining weeks'
    )
  }
  return weeks
}

/** Spec §2.3: roster spots that count against the league's size — everything but IR and taxi; null when Sleeper's list is unknown. */
export function rosterSize(build: LineupBuild): number | null {
  const positions = build.inputs.rosterPositions
  return positions ? positions.filter((p) => p !== 'IR' && p !== 'TAXI').length : null
}

export function marketRatio(side: { marketGive: number; marketGet: number }): number {
  return side.marketGive === 0 ? Number.POSITIVE_INFINITY : side.marketGet / side.marketGive
}

/** Multi-team spec §2.1: a proposal checked against the rosters — its sides, me first, and each player's destination. */
export interface ResolvedDeal {
  sides: DealSide[]
  to: Map<string, number>
}

export function resolveDeal(build: LineupBuild, proposal: TradeProposal): ResolvedDeal {
  const me = myTeam(build)
  const teams = new Map(build.inputs.teams.map((t) => [t.rosterId, t]))
  const owned = new Map<string, { rosterId: number; series: PlayerSeries }>()
  for (const [rosterId, roster] of build.rosters) {
    for (const series of roster) owned.set(series.base.playerId, { rosterId, series })
  }
  const moves: DealMove[] = proposal.moves.map((m) => {
    const hit = owned.get(m.playerId)
    if (!hit) {
      const name = build.inputs.value.series.get(m.playerId)?.base.fullName ?? m.playerId
      throw new TradeError('INVALID_TRADE', `${name} is not on a roster in this league`)
    }
    if (!teams.has(m.to)) {
      throw new TradeError('INVALID_TRADE', `Team ${m.to} is not in this league`)
    }
    return { playerId: m.playerId, from: hit.rosterId, to: m.to }
  })
  const order = dealTeams(moves)
  const problem = dealProblem(
    order,
    moves,
    me.rosterId,
    (rosterId) => {
      const t = teams.get(rosterId)
      return t ? teamName(t) : `Team ${rosterId}`
    },
    (playerId) => owned.get(playerId)?.series.base.fullName ?? playerId
  )
  if (problem !== null) throw new TradeError('INVALID_TRADE', problem)
  const series = (m: DealMove): PlayerSeries[] => {
    const hit = owned.get(m.playerId)
    return hit ? [hit.series] : []
  }
  const sides = [me.rosterId, ...order.filter((id) => id !== me.rosterId)].flatMap(
    (rosterId): DealSide[] => {
      const team = teams.get(rosterId)
      if (!team) return []
      return [
        {
          team,
          give: moves.filter((m) => m.from === rosterId).flatMap(series),
          get: moves.filter((m) => m.to === rosterId).flatMap(series)
        }
      ]
    }
  )
  return { sides, to: new Map(moves.map((m) => [m.playerId, m.to])) }
}

/** Multi-team spec §2.2: every side's window strength before and after, drops, market sums, verdict flags. */
export function evaluateTrade(
  build: LineupBuild,
  proposal: TradeProposal,
  opts: EvaluateOptions = {}
): TradeEvaluation {
  const weeks = requireWindow(build)
  const deal = resolveDeal(build, proposal)
  const size = rosterSize(build)
  const startsOf = startsByRoster(build, weeks)
  const destination = (playerId: string): number => {
    const to = deal.to.get(playerId)
    if (to === undefined) throw new Error(`No destination for ${playerId}`)
    return to
  }
  const sides = deal.sides.map((side): TradeSideResult => {
    const core = sideFor(build, side, weeks, size, startsOf, opts, opts.memo ?? null)
    return { ...core, give: core.give.map((p) => ({ ...p, to: destination(p.playerId) })) }
  })
  const { season, currentWeek, lastWeek } = build.inputs.value.context
  const deadline = build.inputs.tradeDeadlineWeek
  return {
    season,
    currentWeek,
    lastWeek,
    weeks: weeks.length,
    tradeDeadlinePassed: deadline !== null && currentWeek > deadline,
    sides,
    everyoneGains: sides.every((s) => s.delta > 0),
    marketFair: sides.every((s) => marketRatio(s) >= MARKET_FAIR)
  }
}
