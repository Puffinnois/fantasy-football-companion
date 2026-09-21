import type {
  LineupFlag,
  LineupPlayer,
  LineupWeek,
  SlotEntry,
  Swap,
  TeamLineup
} from '@shared/types'
import { fmtPoints, fmtSigned } from './format'

export const WEEKS: number[] = Array.from({ length: 18 }, (_, i) => i + 1)

export interface FlagBadge {
  text: string
  tone: 'red' | 'amber' | 'muted'
}

export function flagBadge(flag: LineupFlag): FlagBadge | null {
  switch (flag) {
    case 'out':
      return { text: 'O', tone: 'red' }
    case 'doubtful':
      return { text: 'D', tone: 'red' }
    case 'questionable':
      return { text: 'Q', tone: 'amber' }
    case 'bye':
      return { text: 'BYE', tone: 'muted' }
    default:
      return null
  }
}

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

/** Final weeks: what the optimal lineup would have scored over the actual one. */
export function leftOnBench(t: TeamLineup): number | null {
  return t.actualTotal === null ? null : Math.round((t.optimalTotal - t.actualTotal) * 100) / 100
}

export interface MatchupHeader {
  /** "You 118.9 optimal · 112.4 current" or, final, "You 121.3". Empty without a team. */
  mine: string
  /** "Rival 109.7 current" / "Rival 98.0"; null without an opponent. */
  theirs: string | null
  result: 'W' | 'L' | 'T' | null
  note: string | null
}

export function matchupHeader(w: LineupWeek): MatchupHeader {
  if (!w.me) {
    return {
      mine: '',
      theirs: null,
      result: null,
      note: "Your team isn't identified — re-import from Setup"
    }
  }
  const notes: string[] = []
  if (!w.opponent) notes.push('No matchup this week')
  if (!w.projectionsStored) notes.push('No projections stored — values are actuals only')
  const note = notes.length ? notes.join(' · ') : null
  if (w.status === 'final') {
    const mineScore = w.me.actualTotal ?? w.me.optimalTotal
    const theirScore = w.opponent ? (w.opponent.actualTotal ?? w.opponent.optimalTotal) : null
    const theirActual = w.opponent?.actualTotal ?? null
    const result: MatchupHeader['result'] =
      w.me.actualTotal === null || theirActual === null
        ? null
        : mineScore > theirActual
          ? 'W'
          : mineScore < theirActual
            ? 'L'
            : 'T'
    return {
      mine: `You ${fmtPoints(mineScore)}`,
      theirs: w.opponent ? `${w.opponent.name} ${fmtPoints(theirScore)}` : null,
      result,
      note
    }
  }
  const mine =
    `You ${fmtPoints(w.me.optimalTotal)} optimal` +
    (w.me.currentTotal !== null ? ` · ${fmtPoints(w.me.currentTotal)} current` : '')
  const theirs = w.opponent
    ? w.opponent.currentTotal !== null
      ? `${w.opponent.name} ${fmtPoints(w.opponent.currentTotal)} current`
      : `${w.opponent.name} ${fmtPoints(w.opponent.optimalTotal)} optimal`
    : null
  return { mine, theirs, result: null, note }
}

export function swapLine(s: Swap): string {
  const where = `${s.slot}, ${fmtSigned(s.delta)}`
  return s.out
    ? `Start ${s.in.fullName} over ${s.out.fullName} (${where})`
    : `Start ${s.in.fullName} (${where})`
}

export function swapsEmptyText(t: TeamLineup): string {
  return t.current === null ? 'Lineup not set on Sleeper yet' : 'Your lineup is optimal'
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
