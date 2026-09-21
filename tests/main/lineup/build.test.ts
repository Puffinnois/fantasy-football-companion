import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import { leagueRosterPositions } from '@main/db/repos/leagues'
import { listMatchups, replaceMatchupsWeek } from '@main/db/repos/matchups'
import { getRules } from '@main/db/repos/rules'
import { listStarterIndexes, listTeams } from '@main/db/repos/teams'
import {
  buildLineups,
  candidateFor,
  lineupWeek,
  rosterWeek,
  teamStrengths,
  teamWeek,
  weekStatus,
  windowWeeks,
  type LineupBuild,
  type LineupInputs
} from '@main/lineup/build'
import { mapMatchups } from '@main/sync/matchupsSync'
import { buildValueSeason } from '@main/value/build'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'
import * as fx from '../../fixtures/sleeper'

const NO_EXPERTS = new Map<string, ExpertRankRow>()

function inputs(db: Db, over: Partial<LineupInputs> = {}): LineupInputs {
  return {
    value: buildValueSeason(db, 'L1', SEASON),
    teams: listTeams(db, 'L1'),
    rosterSlots: getRules(db, 'L1')?.rosterSlots ?? [],
    rosterPositions: leagueRosterPositions(db, 'L1'),
    matchups: listMatchups(db, 'L1', SEASON),
    starterIndexes: listStarterIndexes(db, 'L1'),
    ...over
  }
}

/** Week value the engine must have used: points when played, else the scored projection, else 0. */
function seriesValue(build: LineupBuild, playerId: string, week: number): number {
  const w = build.inputs.value.series.get(playerId)?.weeks.find((x) => x.week === week)
  if (!w) return 0
  const raw = w.played ? (w.points ?? 0) : (w.projected ?? 0)
  return Math.round(raw * 100) / 100
}

describe('lineup build on the fixture league (week 3, Thursday played)', () => {
  let db: Db
  let build: LineupBuild
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
    for (let week = 1; week <= 4; week++) {
      replaceMatchupsWeek(db, 'L1', SEASON, week, mapMatchups(fx.matchups(week)), SEED_TS)
    }
    build = buildLineups(inputs(db))
  })

  it('groups the current rosters and expands the league slots', () => {
    expect(build.slots.map((s) => s.slot)).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'K',
      'DEF'
    ])
    expect([...(build.rosters.get(1) ?? [])].map((s) => s.base.playerId).sort()).toEqual([
      '4866',
      '6794',
      '8259',
      'LAR'
    ])
    expect(build.matchups.get(2)?.get(2)?.points).toBe(92)
  })

  it('optimises my current week: Barkley on his Thursday points, Jefferson and LAR projected, Cook out (IR)', () => {
    const tw = teamWeek(build, 1, 3)
    const byId = Object.fromEntries(
      tw.optimal.filter((e) => e.player).map((e) => [e.player?.id, e.slot])
    )
    expect(byId).toEqual({ '4866': 'RB', '6794': 'WR', LAR: 'DEF' })
    expect(tw.players.get('4866')?.player).toMatchObject({
      played: true,
      flag: null,
      value: seriesValue(build, '4866', 3)
    })
    expect(tw.players.get('6794')?.player).toMatchObject({
      played: false,
      flag: null,
      value: seriesValue(build, '6794', 3)
    })
    expect(tw.unavailable.map((u) => u.player.playerId)).toEqual(['8259'])
    expect(tw.optimalTotal).toBeCloseTo(
      seriesValue(build, '4866', 3) + seriesValue(build, '6794', 3) + seriesValue(build, 'LAR', 3),
      2
    )
    expect(tw.bench).toEqual([])
    expect(teamWeek(build, 1, 3)).toBe(tw) // memoised
  })

  it('applies injury statuses in the current week only', () => {
    db.prepare("UPDATE players SET injury_status = 'Out' WHERE player_id = '6794'").run()
    db.prepare("UPDATE players SET injury_status = 'Questionable' WHERE player_id = '4866'").run()
    const b = buildLineups(inputs(db))
    const now = teamWeek(b, 1, 3)
    expect(now.unavailable.map((u) => u.player.playerId).sort()).toEqual(['6794', '8259'])
    expect(now.players.get('6794')?.player).toMatchObject({ flag: 'out', value: 0 })
    expect(now.players.get('4866')?.player.flag).toBeNull() // already played this week
    const next = teamWeek(b, 1, 4)
    expect(next.players.get('6794')?.player).toMatchObject({
      flag: null,
      value: seriesValue(b, '6794', 4)
    })
    expect(next.unavailable.map((u) => u.player.playerId)).toEqual(['8259'])
  })

  it('uses the roster that played for a past week, with byes at 0 and flagged', () => {
    const past = teamWeek(build, 1, 2)
    expect(past.players.get('6794')?.player).toMatchObject({
      flag: 'bye',
      value: 0,
      opponent: null
    })
    expect(past.players.get('4866')?.player).toMatchObject({
      played: true,
      value: seriesValue(build, '4866', 2)
    })
    expect(past.unavailable).toEqual([]) // IR only counts from the current week on
    expect(past.games).toBeGreaterThan(0)
  })

  it('serves my matchup for the current week with the Sleeper lineup mapped onto roster_positions', () => {
    const w = lineupWeek(build, 3, NO_EXPERTS)
    expect(w).toMatchObject({
      season: SEASON,
      week: 3,
      currentWeek: 3,
      status: 'inProgress',
      projectionsStored: true,
      matchupId: 1
    })
    expect(w.me).toMatchObject({ rosterId: 1, name: 'Cook Book', isMe: true })
    expect(w.opponent).toMatchObject({ rosterId: 2, name: 'Rival', isMe: false })
    // starters ['4866', '6794', '0', 'LAR'] land on QB, RB, RB(empty), WR of the 9 starting slots.
    expect(w.me?.current?.map((e) => `${e.slot}:${e.player?.playerId ?? '-'}`)).toEqual([
      'QB:4866',
      'RB:6794',
      'RB:-',
      'WR:LAR',
      'WR:-',
      'TE:-',
      'FLEX:-',
      'K:-',
      'DEF:-'
    ])
    expect(w.me?.currentTotal).toBeCloseTo(w.me?.optimalTotal ?? -1, 2)
    expect(w.me?.swaps).toEqual([]) // same three players, only moved between slots
    expect(w.me?.actualTotal).toBeNull()
    expect(w.me?.optimal.map((e) => e.slot)).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'K',
      'DEF'
    ])
    expect(w.me?.optimal[1].player?.playerId).toBe('4866')
    expect(w.me?.unavailable.map((p) => p.playerId)).toEqual(['8259'])
  })

  it('derives swaps against a partial Sleeper lineup and decorates with expert ranks', () => {
    const starters = ['0', '4866', '0', '0', '0', '0', '0', '0', '0']
    replaceMatchupsWeek(
      db,
      'L1',
      SEASON,
      3,
      [{ ...mapMatchups(fx.matchups(3))[0], starters }, mapMatchups(fx.matchups(3))[1]],
      SEED_TS
    )
    const experts = new Map<string, ExpertRankRow>([
      [
        '6794',
        {
          playerId: '6794',
          rankEcr: 5,
          posRank: 3,
          rankAve: 4.5,
          rankStd: 1.2,
          rankMin: 2,
          rankMax: 8,
          experts: 40,
          grade: 'A',
          projPts: 18.2,
          scoring: 'PPR',
          updatedAt: SEED_TS
        }
      ]
    ])
    const w = lineupWeek(buildLineups(inputs(db)), 3, experts)
    expect(w.me?.currentTotal).toBeCloseTo(seriesValue(build, '4866', 3), 2)
    const expected = [
      ['WR', '6794', null, seriesValue(build, '6794', 3)],
      ['DEF', 'LAR', null, seriesValue(build, 'LAR', 3)]
    ].sort((a, b) => Number(b[3]) - Number(a[3]))
    expect(w.me?.swaps.map((s) => [s.slot, s.in.playerId, s.out, s.delta])).toEqual(expected)
    expect(w.me?.optimal.find((e) => e.slot === 'WR')?.player?.expert).toEqual({
      ecrPosRank: 3,
      grade: 'A'
    })
    expect(w.me?.optimal.find((e) => e.slot === 'DEF')?.player?.expert).toBeNull()
  })

  it('reports a final past week with the Sleeper score, an upcoming future week, and no matchup as null', () => {
    const past = lineupWeek(build, 2, NO_EXPERTS)
    expect(past.status).toBe('final')
    expect(past.me?.actualTotal).toBe(102)
    expect(past.opponent?.actualTotal).toBe(92)
    const future = lineupWeek(build, 4, NO_EXPERTS)
    expect(future.status).toBe('upcoming')
    expect(future.me?.actualTotal).toBeNull()
    const none = lineupWeek(build, 9, NO_EXPERTS)
    expect(none.matchupId).toBeNull()
    expect(none.opponent).toBeNull()
    expect(none.me?.current).toBeNull() // no matchups row and not the current week
  })

  it('falls back to roster_players starters for the current week and to null without roster_positions', () => {
    replaceMatchupsWeek(db, 'L1', SEASON, 3, [], SEED_TS)
    const fallback = lineupWeek(buildLineups(inputs(db)), 3, NO_EXPERTS)
    expect(fallback.me?.current?.map((e) => e.player?.playerId ?? null).slice(0, 4)).toEqual([
      '4866',
      '6794',
      null,
      'LAR'
    ])
    expect(fallback.opponent).toBeNull()
    const blind = lineupWeek(buildLineups(inputs(db, { rosterPositions: null })), 3, NO_EXPERTS)
    expect(blind.me?.current).toBeNull()
    expect(blind.me?.currentTotal).toBeNull()
    expect(blind.me?.swaps).toEqual([])
  })

  it('ranks the teams by rest-of-season optimal totals over the league window', () => {
    const rows = teamStrengths(build)
    expect(rows.map((r) => [r.rosterId, r.rank])).toEqual([
      [1, 1],
      [2, 2]
    ])
    const me = rows[0]
    expect(me.thisWeek).toBeCloseTo(teamWeek(build, 1, 3).optimalTotal, 2)
    // playoff_week_start 15 + 3 rounds (6 teams) − 1 = week 17: 15 weeks, not 16.
    let expected = 0
    for (let w = 3; w <= 17; w++) expected += teamWeek(build, 1, w).optimalTotal
    expect(me.rosTotal).toBeCloseTo(expected, 1)
    expect(me.rosPerWeek).toBeCloseTo(expected / 15, 1)
    expect(me.name).toBe('Cook Book')
    expect(windowWeeks(build)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17])
  })

  it('solves a hypothetical roster like the team it copies', () => {
    const mine = build.rosters.get(1) ?? []
    for (const week of [3, 4, 5]) {
      const hypothetical = rosterWeek(build, mine, week)
      const real = teamWeek(build, 1, week)
      expect(hypothetical.optimalTotal).toBeCloseTo(real.optimalTotal, 2)
      expect(hypothetical.optimal.map((p) => p.player?.id ?? null)).toEqual(
        real.optimal.map((p) => p.player?.id ?? null)
      )
    }
    expect(build.weeks.has('1|5')).toBe(true) // teamWeek memoises …
    const memoised = build.weeks.size
    rosterWeek(build, mine, 6)
    expect(build.weeks.size).toBe(memoised) // … rosterWeek never does
  })

  it('keeps a traded taxi player reserved on the receiving roster (spec 6b §2.2)', () => {
    const bijan = build.inputs.value.series.get('9509') // taxi on roster 2, projected 7 in week 4
    if (!bijan) throw new Error('fixture: Bijan missing')
    const mine = build.rosters.get(1) ?? []
    const week = rosterWeek(build, [...mine, bijan], 4)
    expect(week.optimal.some((p) => p.player?.id === '9509')).toBe(false)
    expect(week.unavailable.map((x) => x.player.playerId)).toContain('9509')
    expect(week.optimalTotal).toBeCloseTo(teamWeek(build, 1, 4).optimalTotal, 2)
    expect(candidateFor(build, bijan, 4)).toBeNull()
  })

  it('gives the engine candidate of an active player, with the week value', () => {
    const chase = build.inputs.value.series.get('7564')
    if (!chase) throw new Error('fixture: Chase missing')
    expect(candidateFor(build, chase, 3)).toEqual({
      id: '7564',
      name: "Ja'Marr Chase",
      position: 'WR',
      value: 9 // 4 rec + 50 yd under the fixture scoring
    })
    expect(candidateFor(build, chase, 5)).toEqual(
      expect.objectContaining({ id: '7564', value: 0 }) // no projection stored
    )
  })

  it('has no strength without stored projections', () => {
    db.prepare('DELETE FROM player_week_projections').run()
    const rows = teamStrengths(buildLineups(inputs(db)))
    expect(rows.every((r) => r.rosTotal === null && r.rank === null && r.thisWeek === null)).toBe(
      true
    )
    expect(lineupWeek(buildLineups(inputs(db)), 3, NO_EXPERTS).projectionsStored).toBe(false)
  })
})

describe('weekStatus', () => {
  it('is final before the current week, upcoming after it, and follows the games in it', () => {
    expect(weekStatus(2, 3, 0, 0)).toBe('final')
    expect(weekStatus(4, 3, 0, 0)).toBe('upcoming')
    expect(weekStatus(3, 3, 5, 0)).toBe('upcoming')
    expect(weekStatus(3, 3, 5, 2)).toBe('inProgress')
    expect(weekStatus(3, 3, 5, 5)).toBe('final')
    expect(weekStatus(3, 19, 0, 0)).toBe('final')
  })
})
