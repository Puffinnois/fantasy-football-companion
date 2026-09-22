import { round2 } from '@main/db/repos/points'
import {
  candidateFor,
  rosterWeek,
  teamName,
  teamWeek,
  windowWeeks,
  type LineupBuild,
  type TeamWeek
} from '@main/lineup/build'
import { swapsBetween } from '@main/lineup/optimal'
import { UNSTARTABLE_SLOTS } from '@main/value/roster'
import type { PlayerSeries } from '@main/value/series'
import type {
  Swap,
  Team,
  TradeEvaluation,
  TradePlayer,
  TradeProposal,
  TradeSideResult
} from '@shared/types'
import { canEnter } from './enter'
import { starterWeeks, tradePlayer } from './player'

/** Spec 6b §2.4: a side is market-fair when it receives at least this share of what it gives. */
export const MARKET_FAIR = 0.9
/** Weekly totals that move by less than this are rounding, not a lineup change. */
const CHANGED_PTS = 0.01

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

export interface EvaluateOptions {
  /** Tests only: `false` solves every week instead of skipping the provably unchanged ones. */
  skip?: boolean
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
      'No projections stored for this season — trades are valued on the remaining weeks'
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

function onReserve(s: PlayerSeries): boolean {
  return s.rosterSlot !== null && UNSTARTABLE_SLOTS.has(s.rosterSlot)
}

function resolve(roster: PlayerSeries[], ids: string[], owner: string): PlayerSeries[] {
  const seen = new Set<string>()
  return ids.map((id) => {
    if (seen.has(id)) throw new TradeError('INVALID_TRADE', `Invalid trade: ${id} is listed twice`)
    seen.add(id)
    const s = roster.find((p) => p.base.playerId === id)
    if (!s)
      throw new TradeError('INVALID_TRADE', `Invalid trade: ${id} is not on ${owner}'s roster`)
    return s
  })
}

function isStarter(week: TeamWeek, id: string): boolean {
  return week.optimal.some((p) => p.player?.id === id)
}

function startCounts(weeks: TeamWeek[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const week of weeks) {
    for (const placed of week.optimal) {
      if (placed.player) counts.set(placed.player.id, (counts.get(placed.player.id) ?? 0) + 1)
    }
  }
  return counts
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0)
}

/** Σ FantasyCalc value of a list; players outside FantasyCalc's list count 0 and are counted. */
export function marketSum(
  build: LineupBuild,
  list: PlayerSeries[]
): { total: number; unvalued: number } {
  let total = 0
  let unvalued = 0
  for (const s of list) {
    const market = build.rowById.get(s.base.playerId)?.market ?? null
    if (market) total += market.value
    else unvalued++
  }
  return { total, unvalued }
}

/** Spec §2.3 week skip: false only when the week's optimal total provably stays the same. */
function mayChange(
  build: LineupBuild,
  before: TeamWeek,
  removed: string[],
  added: PlayerSeries[],
  week: number
): boolean {
  if (removed.some((id) => isStarter(before, id))) return true
  return added.some((s) => {
    const candidate = candidateFor(build, s, week)
    return candidate !== null && canEnter(candidate, build.slots, before.optimal)
  })
}

function toSwaps(after: TeamWeek, before: TeamWeek): Swap[] {
  return swapsBetween(after.optimal, before.optimal).flatMap((pair) => {
    const incoming = after.players.get(pair.in.id)?.player
    if (!incoming) return []
    const outgoing = pair.out ? (before.players.get(pair.out.id)?.player ?? null) : null
    return [{ slot: pair.slot, in: incoming, out: outgoing, delta: pair.delta }]
  })
}

interface Side {
  team: Team
  give: PlayerSeries[]
  get: PlayerSeries[]
  /** Window starts of the other team's players (the ones I receive), before the trade. */
  theirStarts: Map<string, number>
}

function sideResult(
  build: LineupBuild,
  side: Side,
  weeks: number[],
  size: number | null,
  opts: EvaluateOptions
): TradeSideResult {
  const { team, give, get } = side
  const before = weeks.map((w) => teamWeek(build, team.rosterId, w))
  const giveIds = new Set(give.map((s) => s.base.playerId))
  const kept = (build.rosters.get(team.rosterId) ?? []).filter((s) => !giveIds.has(s.base.playerId))
  let after = [...kept, ...get]

  // Spec §2.3: an oversized after-roster drops the players who start least on it, then is solved again.
  let drops: PlayerSeries[] = []
  const active = after.filter((s) => !onReserve(s))
  const excess = size === null ? 0 : Math.max(0, active.length - size)
  if (excess > 0) {
    const starts = startCounts(weeks.map((w) => rosterWeek(build, after, w)))
    const rosPoints = (s: PlayerSeries): number =>
      build.rowById.get(s.base.playerId)?.rosPoints ?? 0
    drops = [...active]
      .sort(
        (a, b) =>
          (starts.get(a.base.playerId) ?? 0) - (starts.get(b.base.playerId) ?? 0) ||
          rosPoints(a) - rosPoints(b) ||
          a.base.fullName.localeCompare(b.base.fullName)
      )
      .slice(0, excess)
    const dropIds = new Set(drops.map((s) => s.base.playerId))
    after = after.filter((s) => !dropIds.has(s.base.playerId))
  }

  const removed = [...give, ...drops].map((s) => s.base.playerId)
  const afterWeeks = weeks.map((w, i) =>
    opts.skip !== false && !mayChange(build, before[i], removed, get, w)
      ? before[i]
      : rosterWeek(build, after, w)
  )
  const beforeTotal = sum(before.map((x) => x.optimalTotal))
  const afterTotal = sum(afterWeeks.map((x) => x.optimalTotal))
  const delta = round2(afterTotal - beforeTotal) ?? 0
  const myStarts = startCounts(before)
  const mine = (s: PlayerSeries): TradePlayer =>
    tradePlayer(build, s, myStarts.get(s.base.playerId) ?? 0)
  const giveMarket = marketSum(build, give)
  const getMarket = marketSum(build, get)
  return {
    rosterId: team.rosterId,
    name: teamName(team),
    isMe: team.isMe,
    give: give.map(mine),
    get: get.map((s) => tradePlayer(build, s, side.theirStarts.get(s.base.playerId) ?? 0)),
    drops: drops.map(mine),
    before: round2(beforeTotal) ?? 0,
    after: round2(afterTotal) ?? 0,
    delta,
    deltaPerWeek: round2(delta / weeks.length) ?? 0,
    thisWeekDelta: round2(afterWeeks[0].optimalTotal - before[0].optimalTotal) ?? 0,
    marketGive: giveMarket.total,
    marketGet: getMarket.total,
    unvaluedGive: giveMarket.unvalued,
    unvaluedGet: getMarket.unvalued,
    weeksChanged: afterWeeks.filter(
      (x, i) => Math.abs(x.optimalTotal - before[i].optimalTotal) >= CHANGED_PTS
    ).length,
    thisWeekSwaps: toSwaps(afterWeeks[0], before[0])
  }
}

/** Spec 6b §2.3–2.4: both sides' window strength before and after, drops, market sums, verdict flags. */
export function evaluateTrade(
  build: LineupBuild,
  proposal: TradeProposal,
  opts: EvaluateOptions = {}
): TradeEvaluation {
  const weeks = requireWindow(build)
  const me = myTeam(build)
  const them = build.inputs.teams.find((t) => t.rosterId === proposal.rosterId)
  if (!them || them.rosterId === me.rosterId) {
    throw new TradeError('INVALID_TRADE', 'Invalid trade: pick another team to trade with')
  }
  if (proposal.give.length === 0 || proposal.get.length === 0) {
    throw new TradeError('INVALID_TRADE', 'Invalid trade: both sides must include a player')
  }
  const give = resolve(build.rosters.get(me.rosterId) ?? [], proposal.give, teamName(me))
  const get = resolve(build.rosters.get(them.rosterId) ?? [], proposal.get, teamName(them))
  const size = rosterSize(build)
  const myStarts = starterWeeks(build, me.rosterId, weeks)
  const theirStarts = starterWeeks(build, them.rosterId, weeks)
  const mine = sideResult(build, { team: me, give, get, theirStarts }, weeks, size, opts)
  const theirs = sideResult(
    build,
    { team: them, give: get, get: give, theirStarts: myStarts },
    weeks,
    size,
    opts
  )
  const { season, currentWeek, lastWeek } = build.inputs.value.context
  const deadline = build.inputs.tradeDeadlineWeek
  return {
    season,
    currentWeek,
    lastWeek,
    weeks: weeks.length,
    tradeDeadlinePassed: deadline !== null && currentWeek > deadline,
    me: mine,
    them: theirs,
    winWin: mine.delta > 0 && theirs.delta > 0,
    marketFair: marketRatio(mine) >= MARKET_FAIR && marketRatio(theirs) >= MARKET_FAIR
  }
}
