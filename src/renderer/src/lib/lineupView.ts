import type { LineupPlayer, LineupWeek, SlotEntry, Swap, TeamLineup } from '@shared/types'
import { fmtPoints, fmtSigned } from './format'

function starterIds(current: SlotEntry[] | null): Set<string> {
  return new Set((current ?? []).flatMap((e) => (e.player ? [e.player.playerId] : [])))
}

/** An optimal starter who is not among the current starters (a player who only changed slot is not new). */
export function isNewStarter(entry: SlotEntry, current: SlotEntry[] | null): boolean {
  return (
    current !== null && entry.player !== null && !starterIds(current).has(entry.player.playerId)
  )
}

/** Row Δ: the new starter's value over whoever sits in that slot today; null on unchanged rows. */
export function rowDelta(
  optimal: SlotEntry,
  current: SlotEntry | undefined,
  currentAll: SlotEntry[] | null
): number | null {
  if (!isNewStarter(optimal, currentAll) || !optimal.player) return null
  return Math.round((optimal.player.value - (current?.player?.value ?? 0)) * 100) / 100
}

export function swapLine(s: Swap): string {
  const where = `${s.slot}, ${fmtSigned(s.delta)}`
  return s.out
    ? `Start ${s.in.fullName} over ${s.out.fullName} (${where})`
    : `Start ${s.in.fullName} (${where})`
}

function describePlayer(p: LineupPlayer): string {
  const parts = [`${p.fullName}: ${fmtPoints(p.value)}`]
  if (p.floor !== null && p.ceiling !== null) {
    parts.push(`floor ${fmtPoints(p.floor)} / ceiling ${fmtPoints(p.ceiling)}`)
  }
  if (p.expert) {
    parts.push(
      `ECR ${p.position ?? ''}${p.expert.ecrPosRank}${p.expert.grade ? ` (${p.expert.grade})` : ''}`
    )
  }
  if (p.opponent) parts.push(`vs ${p.opponent}${p.dvpRank !== null ? ` (DvP ${p.dvpRank})` : ''}`)
  return parts.join(' · ')
}

/** Tooltip on a close call: both players' value, floor/ceiling, expert rank and matchup (spec §5.1 item 2). */
export function closeCallTitle(starter: LineupPlayer, alt: LineupPlayer): string {
  return `Close call\n${describePlayer(starter)}\n${describePlayer(alt)}`
}

/** Starters on display: the optimal lineup once swaps are applied, else what is set (optimal when unknown). */
export function shownStarters(t: TeamLineup, applied: boolean): SlotEntry[] {
  return applied || t.current === null ? t.optimal : t.current
}

/** Everyone startable who is not on display, best projection first (README "Lineup" swap logic). */
export function benchFor(t: TeamLineup, shown: SlotEntry[]): LineupPlayer[] {
  const pool = new Map<string, LineupPlayer>()
  for (const e of [...(t.current ?? []), ...t.optimal])
    if (e.player) pool.set(e.player.playerId, e.player)
  for (const p of t.bench) pool.set(p.playerId, p)
  const starting = new Set(shown.flatMap((e) => (e.player ? [e.player.playerId] : [])))
  const unavailable = new Set(t.unavailable.map((p) => p.playerId))
  return [...pool.values()]
    .filter((p) => !starting.has(p.playerId) && !unavailable.has(p.playerId))
    .sort((a, b) => b.value - a.value)
}

/** Projected points the set lineup leaves on the bench; 0 when it is already optimal or unknown. */
export function pointsLeft(t: TeamLineup): number {
  return t.currentTotal === null
    ? 0
    : Math.max(0, Math.round((t.optimalTotal - t.currentTotal) * 10) / 10)
}

/** Matchup chip tone: opponent rank vs the position, ≤ 11 tough, ≥ 22 easy, bye dashed. */
export function matchupTone(p: LineupPlayer): 'good' | 'bad' | 'neutral' | 'dashed' {
  if (!p.opponent) return 'dashed'
  if (p.dvpRank === null) return 'neutral'
  return p.dvpRank <= 11 ? 'bad' : p.dvpRank >= 22 ? 'good' : 'neutral'
}

/** "B. Robinson" for close-call notes. */
export function shortName(name: string): string {
  const parts = name.split(' ')
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(' ')}` : name
}

/** Scoreboard of the masthead: my total, theirs, and the edge chip text. */
export function scoreboard(
  w: LineupWeek,
  applied: boolean
): { mine: number; theirs: number | null; edge: string; tone: 'good' | 'bad' | 'neutral' } | null {
  if (!w.me) return null
  const final = w.status === 'final'
  const mine = final
    ? (w.me.actualTotal ?? w.me.optimalTotal)
    : applied
      ? w.me.optimalTotal
      : (w.me.currentTotal ?? w.me.optimalTotal)
  const o = w.opponent
  const theirs = o
    ? final
      ? (o.actualTotal ?? o.optimalTotal)
      : (o.currentTotal ?? o.optimalTotal)
    : null
  if (theirs === null) return { mine, theirs, edge: 'No opponent', tone: 'neutral' }
  const diff = Math.round((mine - theirs) * 10) / 10
  if (diff === 0) return { mine, theirs, edge: 'Dead even', tone: 'neutral' }
  const by = Math.abs(diff).toFixed(1)
  const edge = final
    ? `${diff > 0 ? 'Won' : 'Lost'} by ${by}`
    : `${diff > 0 ? 'Ahead' : 'Behind'} by ${by}`
  return { mine, theirs, edge, tone: diff > 0 ? 'good' : 'bad' }
}
