import { round2 } from '@main/db/repos/points'
import type { PlayerSignals, ScheduleEntry } from '@shared/types'
import type { PlayerSeries } from './series'

/** Sleeper team → week → Sleeper opponent (SeriesBundle.schedule). */
export type TeamSchedule = Map<string, Map<number, string>>
/** Defense (Sleeper code) → position → rank; 1 = allows the fewest points to that position. */
export type DefenseRanks = Map<string, Map<string, number>>

/**
 * Spec §3.4: per defense and position, the mean per played game of the league points scored
 * against it by players at that position, ranked ascending. A defense's played games are the
 * weeks with any points row against it, so a defense that has not played has no rank.
 */
export function defenseRanks(players: PlayerSeries[]): DefenseRanks {
  const allowed = new Map<string, Map<string, number>>()
  const games = new Map<string, Set<number>>()
  const positions = new Set<string>()
  for (const p of players) {
    const pos = p.base.position
    if (pos === null) continue
    positions.add(pos)
    for (const w of p.weeks) {
      if (!w.played || w.opponent === null) continue
      if (!games.has(w.opponent)) games.set(w.opponent, new Set())
      games.get(w.opponent)?.add(w.week)
      if (!allowed.has(w.opponent)) allowed.set(w.opponent, new Map())
      const byPos = allowed.get(w.opponent)
      byPos?.set(pos, (byPos.get(pos) ?? 0) + (w.points ?? 0))
    }
  }
  const ranks: DefenseRanks = new Map()
  for (const pos of positions) {
    const means: { team: string; mean: number }[] = []
    for (const [team, weeks] of games) {
      means.push({ team, mean: (allowed.get(team)?.get(pos) ?? 0) / weeks.size })
    }
    means.sort((a, b) => a.mean - b.mean || a.team.localeCompare(b.team))
    means.forEach(({ team }, i) => {
      if (!ranks.has(team)) ranks.set(team, new Map())
      ranks.get(team)?.set(pos, i + 1)
    })
  }
  return ranks
}

/** Latest week with any game; byes are only counted up to it so a partial schedule never inflates them. */
export function lastScheduledWeek(schedule: TeamSchedule): number {
  let last = 0
  for (const weeks of schedule.values())
    for (const week of weeks.keys()) last = Math.max(last, week)
  return last
}

export interface PlayerSchedule {
  entries: ScheduleEntry[]
  nextOpponent: PlayerSignals['nextOpponent']
  rosSos: number | null
  byesRemaining: number
}

/**
 * Spec §3.4 per player: the remaining weeks (from `currentWeek`, not yet played) of the player's
 * team with each opponent's rank at the player's position; a week without a game is a bye.
 */
export function playerSchedule(
  series: PlayerSeries,
  schedule: TeamSchedule,
  ranks: DefenseRanks,
  currentWeek: number,
  lastWeek = lastScheduledWeek(schedule)
): PlayerSchedule {
  const teamWeeks = series.base.team ? schedule.get(series.base.team) : undefined
  const position = series.base.position
  const entries: ScheduleEntry[] = []
  if (teamWeeks) {
    const played = new Set(series.weeks.filter((w) => w.played).map((w) => w.week))
    for (let week = currentWeek; week <= lastWeek; week++) {
      if (played.has(week)) continue
      const opponent = teamWeeks.get(week) ?? null
      const rank =
        opponent !== null && position !== null ? (ranks.get(opponent)?.get(position) ?? null) : null
      entries.push({ week, opponent, rank })
    }
  }
  const first = entries[0]
  const ranked = entries.flatMap((e) => (e.rank === null ? [] : [e.rank]))
  return {
    entries,
    nextOpponent: first?.opponent ? { team: first.opponent, rank: first.rank } : null,
    rosSos: ranked.length > 0 ? round2(ranked.reduce((s, r) => s + r, 0) / ranked.length) : null,
    byesRemaining: entries.filter((e) => e.opponent === null).length
  }
}
