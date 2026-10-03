import { teamName } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { Team, TradeAcceptance, TradeProposal } from '@shared/types'
import { MARKET_FAIR, marketRatio, marketSum } from './evaluate'
import { sideOf, type MySide, type SearchContext } from './searchContext'
import { sideKey, type SideCore } from './side'
import { acceptanceOf } from './thresholds'

/** A team that takes its part of a deal: its verdict and why (6b §3.3). */
export interface Accepted {
  core: SideCore
  acceptance: TradeAcceptance
}

/** Spec §3.1: a working cycle me → teams[0] → … → teams[k − 2] (= C) → me. */
export interface Deal {
  /** T1 … C, the teams after me in cycle order. */
  teams: Team[]
  /** hops[0] = x (me → T1), hops[i] = teams[i − 1] → teams[i], hops[k − 1] = z (C → me). */
  hops: PlayerSeries[][]
  /** Aligned with `teams`. */
  accepted: Accepted[]
}

/**
 * Spec §3.3: whether `team` takes `get` for `give` — 6b's acceptance on the memoized side, after
 * two exact prunes that skip the solve.
 */
export function accepts(
  ctx: SearchContext,
  team: Team,
  give: PlayerSeries[],
  get: PlayerSeries[]
): Accepted | null {
  const ratio = marketRatio({
    marketGive: marketSum(ctx.build, give).total,
    marketGet: marketSum(ctx.build, get).total
  })
  // Nothing it gets can start for it, so its delta cannot be positive — and the market can't
  // carry the deal either (6b's rule, now for every team).
  if (ratio < MARKET_FAIR && !get.some((s) => ctx.enters(team.rosterId, s))) return null
  if (give.length === 2) {
    for (const one of give) {
      // Plan M generalized: giving both can only do worse than giving one of them for the same
      // players — when that smaller deal needed no drops, its after-roster contains this one's,
      // and it gives less market value. If the smaller deal was refused, so is this one.
      const smaller = ctx.memo.get(sideKey(team.rosterId, [one], get))
      if (
        smaller &&
        smaller.drops.length === 0 &&
        acceptanceOf(smaller.delta, marketRatio(smaller), smaller.deltaPerWeek) === null
      ) {
        return null
      }
    }
  }
  const core = sideOf(ctx, team, give, get)
  const acceptance = acceptanceOf(core.delta, marketRatio(core), core.deltaPerWeek)
  return acceptance === null ? null : { core, acceptance }
}

/**
 * Spec §3.3: every working deal of exactly k teams around one my side. k = 2: C takes x and sends
 * z. k ≥ 3: a depth-first search over ordered distinct bridge teams and what each sends; a bridge
 * hop may carry two players only when x and z are singles and no other bridge hop does. Yields
 * after each first bridge team so a long search can report progress.
 */
export function* dealsAt(ctx: SearchContext, side: MySide, k: number): Generator<void, Deal[]> {
  const { x, z, c } = side
  // The must-include team, when it is not C, has to be one of the bridge teams.
  const must = ctx.mustInclude !== null && ctx.mustInclude !== c.rosterId ? ctx.mustInclude : null
  if (k === 2) {
    if (must !== null) return []
    const closing = accepts(ctx, c, z, x)
    return closing ? [{ teams: [c], hops: [x, z], accepted: [closing] }] : []
  }
  const slots = k - 2
  const bridgeTeams = ctx.others.filter((t) => t.rosterId !== c.rosterId)
  const out: Deal[] = []
  const teams: Team[] = []
  const hops: PlayerSeries[][] = [x]
  const accepted: Accepted[] = []
  /** Distinct teams; the last slot is the must-include team's final chance. */
  const allowed = (t: Team): boolean =>
    !teams.includes(t) &&
    (must === null ||
      teams.length + 1 < slots ||
      t.rosterId === must ||
      teams.some((u) => u.rosterId === must))
  const place = (t: Team, prev: PlayerSeries[], pairOk: boolean): void => {
    for (const hop of ctx.hopsOf(t.rosterId, pairOk)) {
      // Spec §3.3: a team is checked as soon as both its hops are fixed.
      const taken = accepts(ctx, t, hop, prev)
      if (!taken) continue
      teams.push(t)
      hops.push(hop)
      accepted.push(taken)
      if (teams.length === slots) {
        const closing = accepts(ctx, c, z, hop)
        if (closing) {
          out.push({ teams: [...teams, c], hops: [...hops, z], accepted: [...accepted, closing] })
        }
      } else {
        for (const next of bridgeTeams) {
          if (allowed(next)) place(next, hop, pairOk && hop.length === 1)
        }
      }
      teams.pop()
      hops.pop()
      accepted.pop()
    }
  }
  for (const first of bridgeTeams) {
    if (!allowed(first)) continue
    place(first, x, x.length === 1 && z.length === 1)
    yield
  }
  return out
}

/** The deal as moves, hop by hop: hop i goes to `teams[i]`, the last hop to me. */
export function dealProposal(me: Team, deal: Deal): TradeProposal {
  const last = deal.hops.length - 1
  return {
    moves: deal.hops.flatMap((hop, i) =>
      hop.map((s) => ({
        playerId: s.base.playerId,
        to: i === last ? me.rosterId : deal.teams[i].rosterId
      }))
    )
  }
}

/** "via Gridiron Gang: James Cook · Tank Mode: Bijan Robinson" — the bridge teams and what each sends. */
export function bridgeLabel(deal: Deal): string {
  const stops = deal.teams.slice(0, -1).map(
    (t, i) =>
      `${teamName(t)}: ${deal.hops[i + 1]
        .map((s) => s.base.fullName)
        .sort((a, b) => a.localeCompare(b))
        .join(', ')}`
  )
  return `via ${stops.join(' · ')}`
}
