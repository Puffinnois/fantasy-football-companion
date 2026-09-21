import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import type { MatchupRow } from '@main/db/repos/matchups'
import { round2 } from '@main/db/repos/points'
import type { ValueBuild } from '@main/value/build'
import { UNSTARTABLE_SLOTS } from '@main/value/roster'
import type { PlayerSeries } from '@main/value/series'
import type { RosterSlotCount } from '@shared/rules'
import type {
  LineupPlayer,
  LineupWeek,
  LineupWeekStatus,
  PlayerValueRow,
  SlotEntry,
  Swap,
  Team,
  TeamLineup,
  TeamStrength
} from '@shared/types'
import {
  closeCall,
  currentAssignments,
  isUnavailable,
  lineupSlots,
  optimalLineup,
  swapsBetween,
  weekFlag,
  weekValue,
  type Candidate,
  type LineupSlot,
  type Placed,
  type WeekLine
} from './optimal'

export interface LineupInputs {
  value: ValueBuild
  teams: Team[]
  rosterSlots: RosterSlotCount[]
  /** Sleeper's `roster_positions`; null for an import that lacks it (current lineups then unknown). */
  rosterPositions: string[] | null
  matchups: MatchupRow[]
  /** Current starters by slot index per roster (`roster_players`): the current-week fallback. */
  starterIndexes: Map<number, (string | null)[]>
}

/** One player's week: the engine's candidate and the payload row (expert block filled at serve time). */
export interface WeekPlayer {
  candidate: Candidate
  player: LineupPlayer
}

export interface TeamWeek {
  optimal: Placed[]
  optimalTotal: number
  bench: WeekPlayer[]
  unavailable: WeekPlayer[]
  /** Every player considered that week, by id. */
  players: Map<string, WeekPlayer>
  /** Players with a game that week, and how many of them have played — the status inputs. */
  games: number
  played: number
}

export interface LineupBuild {
  inputs: LineupInputs
  slots: LineupSlot[]
  rowById: Map<string, PlayerValueRow>
  /** Current roster per team. */
  rosters: Map<number, PlayerSeries[]>
  /** week → rosterId → row. */
  matchups: Map<number, Map<number, MatchupRow>>
  /** Memoised team-weeks, `${rosterId}|${week}`. */
  weeks: Map<string, TeamWeek>
}

export function buildLineups(inputs: LineupInputs): LineupBuild {
  const rosters = new Map<number, PlayerSeries[]>()
  for (const s of inputs.value.series.values()) {
    const owner = s.base.ownerRosterId
    if (owner === null) continue
    const list = rosters.get(owner) ?? []
    list.push(s)
    rosters.set(owner, list)
  }
  const matchups = new Map<number, Map<number, MatchupRow>>()
  for (const m of inputs.matchups) {
    const week = matchups.get(m.week) ?? new Map<number, MatchupRow>()
    week.set(m.rosterId, m)
    matchups.set(m.week, week)
  }
  return {
    inputs,
    slots: lineupSlots(inputs.rosterSlots),
    rowById: new Map(inputs.value.rows.map((r) => [r.playerId, r])),
    rosters,
    matchups,
    weeks: new Map()
  }
}

function teamName(t: Team): string {
  return t.teamName ?? t.displayName
}

/** A starter id the build knows nothing about (left the player universe): shown by id, worth 0. */
function placeholder(id: string): WeekPlayer {
  return {
    candidate: { id, name: id, position: null, value: 0 },
    player: {
      playerId: id,
      fullName: id,
      position: null,
      team: null,
      statsAvailable: false,
      opponent: null,
      dvpRank: null,
      value: 0,
      played: false,
      injuryStatus: null,
      flag: null,
      expert: null,
      floor: null,
      ceiling: null
    }
  }
}

function weekPlayer(build: LineupBuild, series: PlayerSeries, week: number): WeekPlayer {
  const { currentWeek } = build.inputs.value.context
  const b = series.base
  const sw = series.weeks.find((w) => w.week === week)
  const line: WeekLine | null = sw
    ? {
        played: sw.played,
        points: sw.points,
        projected: sw.projected,
        hasGame: sw.opponent !== null
      }
    : null
  const flag = weekFlag(line, b.injuryStatus, week === currentWeek)
  const value = isUnavailable(flag) ? 0 : (round2(weekValue(line)) ?? 0)
  const opponent = sw?.opponent ?? null
  const signals = build.rowById.get(b.playerId)?.signals ?? null
  return {
    candidate: { id: b.playerId, name: b.fullName, position: b.position, value },
    player: {
      playerId: b.playerId,
      fullName: b.fullName,
      position: b.position,
      team: b.team,
      statsAvailable: series.statsAvailable,
      opponent,
      dvpRank:
        opponent !== null && b.position !== null
          ? (build.inputs.value.defense.get(opponent)?.get(b.position) ?? null)
          : null,
      value,
      played: sw?.played ?? false,
      injuryStatus: b.injuryStatus,
      flag,
      expert: null,
      floor: signals?.floor ?? null,
      ceiling: signals?.ceiling ?? null
    }
  }
}

/** The roster to optimise: for a past week the roster that played (matchups row), otherwise the current one. */
function pool(build: LineupBuild, rosterId: number, week: number): PlayerSeries[] {
  const { currentWeek } = build.inputs.value.context
  const row = week < currentWeek ? build.matchups.get(week)?.get(rosterId) : undefined
  if (row) {
    return row.players.flatMap((id) => {
      const s = build.inputs.value.series.get(id)
      return s ? [s] : []
    })
  }
  return build.rosters.get(rosterId) ?? []
}

export function teamWeek(build: LineupBuild, rosterId: number, week: number): TeamWeek {
  const key = `${rosterId}|${week}`
  const hit = build.weeks.get(key)
  if (hit) return hit
  const { currentWeek } = build.inputs.value.context
  const all = pool(build, rosterId, week).map((series) => ({
    series,
    wp: weekPlayer(build, series, week)
  }))
  // IR / taxi are facts about the roster now, so they only apply from the current week on.
  const reserved = (s: PlayerSeries): boolean =>
    week >= currentWeek &&
    s.base.ownerRosterId === rosterId &&
    s.rosterSlot !== null &&
    UNSTARTABLE_SLOTS.has(s.rosterSlot)
  const startable = all.filter(
    ({ series, wp }) => !reserved(series) && !isUnavailable(wp.player.flag)
  )
  const startableIds = new Set(startable.map((x) => x.wp.player.playerId))
  const players = new Map(all.map((x) => [x.wp.player.playerId, x.wp]))
  const optimal = optimalLineup(
    build.slots,
    startable.map((x) => x.wp.candidate)
  )
  const lookup = (ids: string[]): WeekPlayer[] =>
    ids.flatMap((id) => {
      const wp = players.get(id)
      return wp ? [wp] : []
    })
  const result: TeamWeek = {
    optimal: optimal.starters,
    optimalTotal: optimal.total,
    bench: lookup(optimal.bench.map((c) => c.id)),
    unavailable: all
      .filter((x) => !startableIds.has(x.wp.player.playerId))
      .map((x) => x.wp)
      .sort(
        (a, b) =>
          b.player.value - a.player.value || a.player.fullName.localeCompare(b.player.fullName)
      ),
    players,
    games: all.filter((x) => x.wp.player.opponent !== null).length,
    played: all.filter((x) => x.wp.player.played).length
  }
  build.weeks.set(key, result)
  return result
}

/** Final before the current week, upcoming after it; in it: none played → upcoming, all → final, else in progress. */
export function weekStatus(
  week: number,
  currentWeek: number,
  games: number,
  played: number
): LineupWeekStatus {
  if (week < currentWeek) return 'final'
  if (week > currentWeek || played === 0) return 'upcoming'
  return games > 0 && played >= games ? 'final' : 'inProgress'
}

/** Spec §3.4: the lineup the team set on Sleeper, as engine candidates; null when unknown. */
function currentPlaced(
  build: LineupBuild,
  rosterId: number,
  week: number,
  tw: TeamWeek
): Placed[] | null {
  const positions = build.inputs.rosterPositions
  if (!positions) return null
  const row = build.matchups.get(week)?.get(rosterId)
  const starters = row
    ? row.starters
    : week === build.inputs.value.context.currentWeek
      ? (build.inputs.starterIndexes.get(rosterId) ?? null)
      : null
  if (!starters) return null
  return currentAssignments(positions, starters).map(({ slot, id }) => {
    if (id === null) return { slot, player: null }
    let wp = tw.players.get(id)
    if (!wp) {
      const series = build.inputs.value.series.get(id)
      wp = series ? weekPlayer(build, series, week) : placeholder(id)
      tw.players.set(id, wp)
    }
    return { slot, player: wp.candidate }
  })
}

function withExpert(tw: TeamWeek, c: Candidate, experts: Map<string, ExpertRankRow>): LineupPlayer {
  const base = tw.players.get(c.id)?.player ?? placeholder(c.id).player
  const rank = experts.get(c.id)
  return { ...base, expert: rank ? { ecrPosRank: rank.posRank, grade: rank.grade } : null }
}

function teamLineup(
  build: LineupBuild,
  team: Team,
  week: number,
  experts: Map<string, ExpertRankRow>,
  status: LineupWeekStatus
): TeamLineup {
  const tw = teamWeek(build, team.rosterId, week)
  const decorate = (c: Candidate | null): LineupPlayer | null =>
    c ? withExpert(tw, c, experts) : null
  const benchCandidates = tw.bench.map((b) => b.candidate)
  const optimal: SlotEntry[] = tw.optimal.map((e, i) => ({
    slot: e.slot,
    player: decorate(e.player),
    closeCall: decorate(closeCall(build.slots[i], e.player, benchCandidates))
  }))
  const placed = currentPlaced(build, team.rosterId, week, tw)
  const current: SlotEntry[] | null =
    placed?.map((e) => ({ slot: e.slot, player: decorate(e.player), closeCall: null })) ?? null
  // Spec §5.1: largest gain first (the engine orders them by the incoming player's value for pairing).
  const swaps: Swap[] = placed
    ? swapsBetween(tw.optimal, placed)
        .map((s) => ({
          slot: s.slot,
          out: decorate(s.out),
          in: withExpert(tw, s.in, experts),
          delta: s.delta
        }))
        .sort((a, b) => b.delta - a.delta)
    : []
  const row = build.matchups.get(week)?.get(team.rosterId)
  return {
    rosterId: team.rosterId,
    name: teamName(team),
    isMe: team.isMe,
    optimal,
    optimalTotal: tw.optimalTotal,
    current,
    currentTotal: placed
      ? (round2(placed.reduce((sum, e) => sum + (e.player?.value ?? 0), 0)) ?? 0)
      : null,
    actualTotal: status === 'final' && row ? row.points : null,
    bench: tw.bench.map((b) => withExpert(tw, b.candidate, experts)),
    unavailable: tw.unavailable.map((u) => withExpert(tw, u.candidate, experts)),
    swaps
  }
}

/** Spec §4.2 `lineup.week`: my team and its opponent for the week. */
export function lineupWeek(
  build: LineupBuild,
  week: number,
  experts: Map<string, ExpertRankRow>
): LineupWeek {
  const ctx = build.inputs.value.context
  const me = build.inputs.teams.find((t) => t.isMe) ?? null
  const weekRows = build.matchups.get(week)
  const myRow = me ? weekRows?.get(me.rosterId) : undefined
  const matchupId = myRow?.matchupId ?? null
  const oppRow =
    me && matchupId !== null
      ? [...(weekRows?.values() ?? [])].find(
          (r) => r.matchupId === matchupId && r.rosterId !== me.rosterId
        )
      : undefined
  const opponent = oppRow
    ? (build.inputs.teams.find((t) => t.rosterId === oppRow.rosterId) ?? null)
    : null
  const mine = me ? teamWeek(build, me.rosterId, week) : null
  const status = weekStatus(week, ctx.currentWeek, mine?.games ?? 0, mine?.played ?? 0)
  return {
    season: ctx.season,
    week,
    currentWeek: ctx.currentWeek,
    status,
    projectionsStored: ctx.projectionsStored,
    matchupId,
    me: me ? teamLineup(build, me, week, experts, status) : null,
    opponent: opponent ? teamLineup(build, opponent, week, experts, status) : null
  }
}

/** Spec §4.1: every team's optimal totals over the remaining weeks on its current roster, ranked. */
/** Spec 6b §2.1: the weeks team strength and trade deltas are summed over; empty without projections. */
export function windowWeeks(build: LineupBuild): number[] {
  const { currentWeek, lastWeek, projectionsStored } = build.inputs.value.context
  const weeks: number[] = []
  if (projectionsStored) for (let w = currentWeek; w <= lastWeek; w++) weeks.push(w)
  return weeks
}

export function teamStrengths(build: LineupBuild): TeamStrength[] {
  const weeks = windowWeeks(build)
  const rows = build.inputs.teams.map((t): TeamStrength => {
    const base = { rosterId: t.rosterId, name: teamName(t), isMe: t.isMe }
    if (weeks.length === 0) {
      return { ...base, thisWeek: null, rosTotal: null, rosPerWeek: null, rank: null }
    }
    const totals = weeks.map((w) => teamWeek(build, t.rosterId, w).optimalTotal)
    const rosTotal = round2(totals.reduce((sum, v) => sum + v, 0)) ?? 0
    return {
      ...base,
      thisWeek: totals[0],
      rosTotal,
      rosPerWeek: round2(rosTotal / totals.length),
      rank: null
    }
  })
  rows.sort(
    (a, b) =>
      (b.rosTotal ?? Number.NEGATIVE_INFINITY) - (a.rosTotal ?? Number.NEGATIVE_INFINITY) ||
      a.name.localeCompare(b.name)
  )
  return rows.map((r, i) => ({ ...r, rank: r.rosTotal === null ? null : i + 1 }))
}
