import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { buildValueSeason, detailFor, type ValueBuild } from '@main/value/build'
import { upsertPlayers } from '@main/db/repos/players'
import { replaceProjections } from '@main/db/repos/projections'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { PlayerValueRow } from '@shared/types'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'

describe('buildValueSeason', () => {
  let db: Db
  let build: ValueBuild
  const row = (id: string): PlayerValueRow | undefined => build.rows.find((r) => r.playerId === id)
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
    build = buildValueSeason(db, 'L1', SEASON)
  })

  it('reports the context and replacement levels per position', () => {
    expect(build.context).toMatchObject({
      season: SEASON,
      currentWeek: 3,
      projectionsStored: true,
      teamCount: 2
    })
    // 2 teams × (RB 2 + WR 2 + FLEX 1 …): RB std [20, 12] → worst; ROS [8, 7, 0] → Cook's 0
    expect(build.context.replacement.RB).toEqual({
      std: { level: 12, starters: 4 },
      ros: { level: 0, starters: 4 }
    })
    expect(build.context.replacement.WR).toEqual({
      std: { level: 10, starters: 4 },
      ros: { level: 9, starters: 4 }
    })
    expect(build.context.replacement.QB).toEqual({ std: null, ros: null })
  })

  it('computes PPG over played weeks and ROS over unplayed weeks from the current one', () => {
    // Barkley played week 3 (Thursday): his week-3 projection is out of ROS, week 4 stays
    expect(row('4866')).toMatchObject({ gamesPlayed: 3, ppg: 20, rosPoints: 8 })
    // Jefferson has not played week 3: both projections count
    expect(row('6794')).toMatchObject({ gamesPlayed: 1, ppg: 25, rosPoints: 28 })
    // no projection rows → 0 ROS, no games → null PPG
    expect(row('8259')).toMatchObject({
      gamesPlayed: 0,
      ppg: null,
      rosPoints: 0,
      statsAvailable: false
    })
    expect(row('LAR')).toMatchObject({ gamesPlayed: 1, ppg: 8, rosPoints: 0 })
  })

  it('values over replacement and ranks within position and overall', () => {
    expect(row('4866')).toMatchObject({
      stdValue: 8,
      stdRank: 1,
      rosValue: 8,
      rosRank: 1,
      overallRank: 2
    })
    expect(row('9509')).toMatchObject({
      stdValue: 0,
      stdRank: 2,
      rosValue: 7,
      rosRank: 2,
      overallRank: 3
    })
    expect(row('8259')).toMatchObject({ stdValue: null, stdRank: null, rosValue: 0, rosRank: 3 })
    expect(row('6794')).toMatchObject({
      stdValue: 15,
      stdRank: 1,
      rosValue: 19,
      rosRank: 1,
      overallRank: 1
    })
    expect(row('7564')).toMatchObject({
      stdValue: 0,
      stdRank: 2,
      rosValue: 0,
      rosRank: 2,
      overallRank: 4
    })
  })

  it('serves a detail with the week series in Sleeper keys', () => {
    const detail = detailFor(build, '4866')
    expect(detail?.row.playerId).toBe('4866')
    expect(detail?.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5])
    expect(detail?.weeks[0]).toMatchObject({ played: true, points: 20, snapPct: 0.83 })
    expect(detail?.weeks[0].stats.rush_yd).toBe(60)
    expect(detail?.weeks[3]).toMatchObject({ played: false, projected: 8, stats: {} })
    expect(detailFor(build, 'nobody')).toBeNull()
  })

  it('has null ROS everywhere when no projections are stored', () => {
    const empty = buildValueSeason(db, 'L1', SEASON - 1)
    expect(empty.context.projectionsStored).toBe(false)
    expect(empty.rows.every((r) => r.rosPoints === null && r.rosValue === null)).toBe(true)
    expect(empty.context.replacement.RB.ros).toBeNull()
  })

  it('attaches signals: usage, efficiency, consistency and vs projection', () => {
    const s = row('4866')?.signals
    // snap % 0.83 / 0.90 (week 3 has no snap row): two games, recent = season → flat
    expect(s?.usage.snapPct?.trend).toBe('flat')
    expect(s?.usage.snapPct?.season).toBeCloseTo(0.865)
    expect(s?.usage.targetShare).toBeNull()
    // Barkley is the only RB with a stat line, so he *is* the RB rate: 48 opportunities, 1 TD, 182 yards
    expect(s?.tdDelta).toBeCloseTo(0)
    expect(s?.tdFlag).toBeNull()
    expect(s?.ypo).toBe(3.79)
    expect(s?.ypoDelta).toBeCloseTo(0)
    // week 3: 30 points against a 10-point projection
    expect(s).toMatchObject({ vsProjPoints: 20, vsProjPct: 2 })
    // points 20 / 10 / 30 against the RB replacement PPG of 12
    expect(s).toMatchObject({ floor: 15, ceiling: 25, stdev: 8.16 })
    expect(s?.startRate).toBeCloseTo(2 / 3)
    // one game: no trends, no consistency
    expect(row('6794')?.signals).toMatchObject({
      floor: null,
      startRate: null,
      usage: { snapPct: null, targetShare: null }
    })
    expect(row('8259')?.signals).toBeNull()
    expect(row('LAR')?.signals).toMatchObject({ tdDelta: null, ypo: null })
  })

  it('attaches the schedule: next opponent with its rank, SOS and byes', () => {
    // Barkley played week 3; PHI then hosts WAS (4) and LAR (5), neither ranked at RB yet
    expect(row('4866')?.signals).toMatchObject({
      nextOpponent: { team: 'WAS', rank: null },
      rosSos: null,
      byesRemaining: 0
    })
    // Jefferson: DET (3, unranked), CHI (4), no game in week 5. Five defenses have been played
    // against; CHI is the only one that allowed WR points (his 25), so it ranks 5th of 5 at WR.
    expect(row('6794')?.signals).toMatchObject({
      nextOpponent: { team: 'DET', rank: null },
      rosSos: 5,
      byesRemaining: 1
    })
    expect(detailFor(build, '6794')?.schedule).toEqual([
      { week: 3, opponent: 'DET', rank: null },
      { week: 4, opponent: 'CHI', rank: 5 },
      { week: 5, opponent: null, rank: null }
    ])
    // BUF has no game in the fixture
    expect(detailFor(build, '8259')?.schedule).toEqual([])
  })
})

describe('buildValueSeason — roster-relative view', () => {
  let db: Db
  let build: ValueBuild
  const row = (id: string): PlayerValueRow | undefined => build.rows.find((r) => r.playerId === id)
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
    // The fixture has no free agent: add an RB with one stored projection, 90 rush yards in
    // week 5 → 9 ROS points under the 0.1/yd rules. No player_ids row → statsAvailable false.
    upsertPlayers(
      db,
      [
        {
          playerId: '1111',
          fullName: 'Free Agent',
          firstName: 'Free',
          lastName: 'Agent',
          position: 'RB',
          fantasyPositions: ['RB'],
          team: 'DEN',
          status: 'Active',
          injuryStatus: null,
          age: 24,
          yearsExp: 2,
          depthChartOrder: 1,
          searchRank: 100,
          gsisId: null,
          sportradarId: null,
          espnId: null
        }
      ],
      SEED_TS
    )
    replaceProjections(
      db,
      SEASON,
      5,
      [
        {
          playerId: '1111',
          season: SEASON,
          week: 5,
          company: 'rotowire',
          team: 'DEN',
          opponent: 'LV',
          stats: { rush_yd: 90 }
        }
      ],
      SEED_TS
    )
    build = buildValueSeason(db, 'L1', SEASON)
  })

  it('scores the free agent against my lowest startable RB and ignores my IR player', () => {
    // RB ROS values: FA 9, Barkley 8 (mine, starter), Bijan 7 (Rival), Cook 0 (mine, IR);
    // four RBs for four starters → the replacement level stays at the lowest, 0
    expect(row('1111')).toMatchObject({
      ownerRosterId: null,
      ownerIsMe: false,
      rosValue: 9,
      vsMine: 1,
      droppable: null,
      signals: null
    })
    expect(row('4866')).toMatchObject({
      ownerIsMe: true,
      vsMine: null,
      droppable: { playerId: '1111', fullName: 'Free Agent', delta: 1 }
    })
    expect(row('8259')).toMatchObject({ ownerIsMe: true, vsMine: null, droppable: null }) // IR
    expect(row('9509')).toMatchObject({ ownerIsMe: false, vsMine: null, droppable: null }) // Rival's
    expect(row('6794')).toMatchObject({ vsMine: null, droppable: null }) // no WR free agent
  })

  it('reports my baseline per lineup position in the context', () => {
    expect(build.context.hasMyTeam).toBe(true)
    expect(Object.keys(build.context.mine)).toEqual([...LINEUP_POSITIONS])
    expect(build.context.mine.RB).toEqual({
      playerId: '4866',
      fullName: 'Saquon Barkley',
      rosValue: 8
    })
    expect(build.context.mine.WR).toEqual({
      playerId: '6794',
      fullName: 'Justin Jefferson',
      rosValue: 19
    })
    expect(build.context.mine.DEF?.playerId).toBe('LAR')
    expect(build.context.mine.QB).toBeNull()
  })

  it('is null everywhere when no team is flagged as mine', () => {
    db.prepare('UPDATE teams SET is_me = 0').run()
    const none = buildValueSeason(db, 'L1', SEASON)
    expect(none.context.hasMyTeam).toBe(false)
    expect(Object.values(none.context.mine).every((m) => m === null)).toBe(true)
    expect(none.rows.every((r) => r.vsMine === null && r.droppable === null)).toBe(true)
    expect(none.rows.every((r) => !r.ownerIsMe)).toBe(true)
  })
})
