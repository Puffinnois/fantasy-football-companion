import { dealProblem, dealTeams, type DealMove } from '@shared/deal'
import type { TradeEvaluation, TradePool, TradeProposal, TradeSideResult } from '@shared/types'

/** One chosen player: the team he leaves and, once picked, where he goes (null = the default). */
export interface BuilderPick {
  playerId: string
  from: number
  to: number | null
}

/** Multi-team spec §5.1: the builder's deal — the other teams in order, and the chosen players. */
export interface BuilderDeal {
  teams: number[]
  picks: BuilderPick[]
}

export const EMPTY_DEAL: BuilderDeal = { teams: [], picks: [] }

/** "Me" for my team, otherwise the team's name. */
export function teamLabel(pool: TradePool, rosterId: number): string {
  if (rosterId === pool.me.rosterId) return 'Me'
  return pool.teams.find((t) => t.rosterId === rosterId)?.name ?? `Team ${rosterId}`
}

function playerName(pool: TradePool, playerId: string): string {
  for (const team of [pool.me, ...pool.teams]) {
    const p = team.players.find((x) => x.playerId === playerId)
    if (p) return p.fullName
  }
  return playerId
}

/** Spec §5.1 defaults: my players go to the first other team, everyone else's to me. */
export function destinationOf(deal: BuilderDeal, pick: BuilderPick, me: number): number | null {
  if (pick.to !== null) return pick.to
  return pick.from === me ? (deal.teams[0] ?? null) : me
}

/** The picks with their destinations resolved; a pick with nowhere to go yet is left out. */
export function dealMoves(deal: BuilderDeal, me: number): DealMove[] {
  return deal.picks.flatMap((p) => {
    const to = destinationOf(deal, p, me)
    return to === null ? [] : [{ playerId: p.playerId, from: p.from, to }]
  })
}

export function proposalFrom(deal: BuilderDeal, me: number): TradeProposal {
  return { moves: dealMoves(deal, me).map(({ playerId, to }) => ({ playerId, to })) }
}

export function addTeam(deal: BuilderDeal, rosterId: number): BuilderDeal {
  return deal.teams.includes(rosterId) ? deal : { ...deal, teams: [...deal.teams, rosterId] }
}

/** Spec §5.1: a removed team's players leave the deal; players headed to it go back to their default. */
export function removeTeam(deal: BuilderDeal, rosterId: number): BuilderDeal {
  return {
    teams: deal.teams.filter((t) => t !== rosterId),
    picks: deal.picks
      .filter((p) => p.from !== rosterId)
      .map((p) => (p.to === rosterId ? { ...p, to: null } : p))
  }
}

export function addPick(deal: BuilderDeal, playerId: string, from: number): BuilderDeal {
  if (deal.picks.some((p) => p.playerId === playerId)) return deal
  return { ...deal, picks: [...deal.picks, { playerId, from, to: null }] }
}

export function removePick(deal: BuilderDeal, playerId: string): BuilderDeal {
  return { ...deal, picks: deal.picks.filter((p) => p.playerId !== playerId) }
}

export function setDestination(deal: BuilderDeal, playerId: string, to: number): BuilderDeal {
  return {
    ...deal,
    picks: deal.picks.map((p) => (p.playerId === playerId ? { ...p, to } : p))
  }
}

/** A suggestion's or verdict's deal: its teams in order and every move with its destination. */
export function dealOf(ev: TradeEvaluation): BuilderDeal {
  return {
    teams: ev.sides.filter((s) => !s.isMe).map((s) => s.rosterId),
    picks: ev.sides.flatMap((s) =>
      s.give.map((p) => ({ playerId: p.playerId, from: s.rosterId, to: p.to }))
    )
  }
}

/** After a sync: teams that still exist, players still on the team they leave, stale destinations reset. */
export function pruneDeal(deal: BuilderDeal, pool: TradePool): BuilderDeal {
  const me = pool.me.rosterId
  const rosters = new Map([pool.me, ...pool.teams].map((t) => [t.rosterId, t.players]))
  const teams = deal.teams.filter((t) => t !== me && rosters.has(t))
  const inDeal = (t: number): boolean => t === me || teams.includes(t)
  const picks = deal.picks
    .filter(
      (p) => inDeal(p.from) && (rosters.get(p.from) ?? []).some((x) => x.playerId === p.playerId)
    )
    .map((p) => (p.to !== null && !inDeal(p.to) ? { ...p, to: null } : p))
  return { teams, picks }
}

/** Spec §5.1 inline validation — the rule main enforces; null when Evaluate may run. */
export function builderProblem(deal: BuilderDeal, pool: TradePool): string | null {
  const me = pool.me.rosterId
  const name = (rosterId: number): string =>
    rosterId === me ? pool.me.name : teamLabel(pool, rosterId)
  return dealProblem([me, ...deal.teams], dealMoves(deal, me), me, name, (playerId) =>
    playerName(pool, playerId)
  )
}

/** "gets: Ja'Marr Chase" — with 3+ teams each source follows in brackets; "gets: nobody" when empty. */
export function getsLine(deal: BuilderDeal, rosterId: number, pool: TradePool): string {
  const incoming = dealMoves(deal, pool.me.rosterId).filter((m) => m.to === rosterId)
  if (incoming.length === 0) return 'gets: nobody'
  const multi = deal.teams.length >= 2
  const names = incoming.map((m) => {
    const name = playerName(pool, m.playerId)
    return multi ? `${name} (${teamLabel(pool, m.from)})` : name
  })
  return `gets: ${names.join(', ')}`
}

/** Verdict columns in the builder's card order — me, then the teams row; anything else last. */
export function sidesInOrder(
  ev: TradeEvaluation,
  deal: BuilderDeal,
  me: number
): TradeSideResult[] {
  const order = [me, ...deal.teams]
  const rank = (rosterId: number): number => {
    const i = order.indexOf(rosterId)
    return i === -1 ? order.length : i
  }
  return [...ev.sides].sort((a, b) => rank(a.rosterId) - rank(b.rosterId))
}

/** An alternative's deal (spec §5.2 "Open in builder"): every move with its source from the pool, teams in first appearance. */
export function dealFromProposal(proposal: TradeProposal, pool: TradePool): BuilderDeal {
  const owner = new Map<string, number>()
  for (const team of [pool.me, ...pool.teams]) {
    for (const p of team.players) owner.set(p.playerId, team.rosterId)
  }
  const picks = proposal.moves.flatMap((m) => {
    const from = owner.get(m.playerId)
    return from === undefined ? [] : [{ playerId: m.playerId, from, to: m.to }]
  })
  return { teams: dealTeams(picks).filter((t) => t !== pool.me.rosterId), picks }
}
