import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { leagueRosterPositions } from '@main/db/repos/leagues'
import { replaceMarketValues } from '@main/db/repos/marketValues'
import { listMatchups, replaceMatchupsWeek } from '@main/db/repos/matchups'
import { getRules } from '@main/db/repos/rules'
import { listStarterIndexes, listTeams } from '@main/db/repos/teams'
import {
  buildLineups,
  rosterWeek,
  teamStrengths,
  teamWeek,
  type LineupBuild,
  type LineupInputs
} from '@main/lineup/build'
import { mapMatchups } from '@main/sync/matchupsSync'
import { evaluateTrade, rosterSize, TradeError } from '@main/trade/evaluate'
import { starterWeeks, tradePlayer } from '@main/trade/player'
import { buildValueSeason } from '@main/value/build'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'
import * as fx from '../../fixtures/sleeper'

function inputs(db: Db, over: Partial<LineupInputs> = {}): LineupInputs {
  return {
    value: buildValueSeason(db, 'L1', SEASON),
    teams: listTeams(db, 'L1'),
    rosterSlots: getRules(db, 'L1')?.rosterSlots ?? [],
    rosterPositions: leagueRosterPositions(db, 'L1'),
    matchups: listMatchups(db, 'L1', SEASON),
    starterIndexes: listStarterIndexes(db, 'L1'),
    tradeDeadlineWeek: getRules(db, 'L1')?.settings.tradeDeadlineWeek ?? null,
    ...over
  }
}

const ids = (list: { playerId: string }[]): string[] => list.map((p) => p.playerId)

/** The TradeError code a call throws, or a marker when it does not throw / throws something else. */
function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    if (err instanceof TradeError) return err.code
    throw err
  }
  return 'no error'
}

/**
 * Fixture as of week 3 (Thursday played), window 3..17. Me (roster 1): Barkley RB (30 played wk3,
 * 8 proj wk4), Jefferson WR (13 wk3, 15 wk4), LAR DEF (0), Cook RB on IR. Rival (roster 2):
 * Chase WR (9 wk3), Bijan RB on taxi (7 wk4, reserved). Everything else is 0.
 */
describe('evaluateTrade on the fixture league', () => {
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

  it('scores Jefferson for Chase by both teams’ window strength', () => {
    const ev = evaluateTrade(build, { rosterId: 2, give: ['6794'], get: ['7564'] })
    expect(ev).toMatchObject({
      season: SEASON,
      currentWeek: 3,
      lastWeek: 17,
      weeks: 15,
      tradeDeadlinePassed: false,
      winWin: false
    })
    expect(ev.me).toMatchObject({ rosterId: 1, name: 'Cook Book', isMe: true })
    expect(ids(ev.me.give)).toEqual(['6794'])
    expect(ids(ev.me.get)).toEqual(['7564'])
    expect(ids(ev.them.give)).toEqual(['7564'])
    expect(ids(ev.them.get)).toEqual(['6794'])
    // before equals the power ranking; wk3 13 → 9 (−4), wk4 15 → 0 (−15)
    const mine = teamStrengths(build).find((r) => r.rosterId === 1)
    expect(ev.me.before).toBeCloseTo(mine?.rosTotal ?? -1, 2)
    expect(ev.me.delta).toBeCloseTo(-19, 2)
    expect(ev.me.deltaPerWeek).toBeCloseTo(-19 / 15, 2)
    expect(ev.me.thisWeekDelta).toBeCloseTo(-4, 2)
    expect(ev.me.weeksChanged).toBe(2)
    expect(ev.them.delta).toBeCloseTo(19, 2)
    expect(ev.them.thisWeekDelta).toBeCloseTo(4, 2)
    expect(ev.me.drops).toEqual([])
    // this week's swap on my side: Chase in for Jefferson at WR
    expect(ev.me.thisWeekSwaps).toHaveLength(1)
    expect(ev.me.thisWeekSwaps[0]).toMatchObject({ slot: 'WR', delta: -4 })
    expect(ev.me.thisWeekSwaps[0].in.playerId).toBe('7564')
    expect(ev.me.thisWeekSwaps[0].out?.playerId).toBe('6794')
  })

  it('matches a full solve of every week (the week skip is exact)', () => {
    const proposals = [
      { rosterId: 2, give: ['6794'], get: ['7564'] },
      { rosterId: 2, give: ['LAR'], get: ['9509'] }, // 0-value defense for a taxi player
      { rosterId: 2, give: ['4866', 'LAR'], get: ['7564', '9509'] },
      { rosterId: 2, give: ['8259'], get: ['9509'] } // IR for taxi: nothing changes
    ]
    for (const p of proposals) {
      const skipped = evaluateTrade(build, p)
      const full = evaluateTrade(build, p, { skip: false })
      expect([skipped.me.delta, skipped.them.delta, skipped.me.weeksChanged]).toEqual([
        full.me.delta,
        full.them.delta,
        full.me.weeksChanged
      ])
      // and the after total is what rosterWeek says on the swapped roster
      const mine = (build.rosters.get(1) ?? []).filter((s) => !p.give.includes(s.base.playerId))
      const got = p.get
        .map((id) => build.inputs.value.series.get(id))
        .flatMap((s) => (s ? [s] : []))
      let after = 0
      for (let w = 3; w <= 17; w++) after += rosterWeek(build, [...mine, ...got], w).optimalTotal
      expect(skipped.me.after).toBeCloseTo(after, 2)
    }
    const ir = evaluateTrade(build, { rosterId: 2, give: ['8259'], get: ['9509'] })
    expect(ir.me.delta).toBe(0)
    expect(ir.me.weeksChanged).toBe(0)
    expect(ir.me.get[0].reserve).toBe('taxi')
  })

  it('auto-drops the player who starts least when the roster would overflow (spec §2.3)', () => {
    // Sleeper roster size 2 (IR does not count): after Jefferson → Chase I hold Barkley, LAR, Chase.
    const small = buildLineups(inputs(db, { rosterPositions: ['RB', 'WR', 'IR'] }))
    expect(rosterSize(small)).toBe(2)
    const ev = evaluateTrade(small, { rosterId: 2, give: ['6794'], get: ['7564'] })
    // Everyone "starts" every week (0-value starters still fill slots); LAR has the lowest rosPoints.
    expect(ids(ev.me.drops)).toEqual(['LAR'])
    expect(ev.me.delta).toBeCloseTo(-19, 2)
    expect(ev.them.drops).toEqual([]) // Rival: Jefferson + Bijan (taxi) = 1 active
    expect(rosterSize(buildLineups(inputs(db, { rosterPositions: null })))).toBeNull()
  })

  it('sums market values and counts unvalued players (spec §2.3)', () => {
    replaceMarketValues(
      db,
      SEASON,
      [
        { playerId: '6794', value: 10512, overallRank: 1, posRank: 1, tier: 1, trend30d: 120 },
        { playerId: '7564', value: 8000, overallRank: 3, posRank: 2, tier: 1, trend30d: 40 }
      ],
      SEED_TS
    )
    const priced = buildLineups(inputs(db))
    const ev = evaluateTrade(priced, { rosterId: 2, give: ['6794', 'LAR'], get: ['7564'] })
    expect(ev.me).toMatchObject({
      marketGive: 10512,
      marketGet: 8000,
      unvaluedGive: 1,
      unvaluedGet: 0
    })
    expect(ev.them).toMatchObject({ marketGive: 8000, marketGet: 10512, unvaluedGet: 1 })
    expect(ev.marketFair).toBe(false) // 8000 / 10512 = 0.76 on my side
    expect(ev.me.give[0].market?.value).toBe(10512)
    // Unpriced league: every ratio is +∞, so the trade is "fair" — the unvalued counts say why.
    const blind = evaluateTrade(build, { rosterId: 2, give: ['6794'], get: ['7564'] })
    expect(blind.marketFair).toBe(true)
    expect(blind.me.unvaluedGive + blind.me.unvaluedGet).toBe(2)
  })

  it('rejects malformed proposals with INVALID_TRADE', () => {
    const invalid = (p: Parameters<typeof evaluateTrade>[1]): string =>
      codeOf(() => evaluateTrade(build, p))
    expect(invalid({ rosterId: 9, give: ['6794'], get: ['7564'] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 1, give: ['6794'], get: ['7564'] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 2, give: [], get: ['7564'] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 2, give: ['6794'], get: [] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 2, give: ['7564'], get: ['6794'] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 2, give: ['6794', '6794'], get: ['7564'] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 2, give: ['nobody'], get: ['7564'] })).toBe('INVALID_TRADE')
    expect(() => evaluateTrade(build, { rosterId: 2, give: ['nobody'], get: ['7564'] })).toThrow(
      "nobody is not on Cook Book's roster"
    )
  })

  it('throws NO_PROJECTIONS without a window and NO_ME without my team', () => {
    const proposal = { rosterId: 2, give: ['6794'], get: ['7564'] }
    const nobody = buildLineups(
      inputs(db, { teams: listTeams(db, 'L1').map((t) => ({ ...t, isMe: false })) })
    )
    expect(codeOf(() => evaluateTrade(nobody, proposal))).toBe('NO_ME')
    db.prepare('DELETE FROM player_week_projections').run()
    expect(codeOf(() => evaluateTrade(buildLineups(inputs(db)), proposal))).toBe('NO_PROJECTIONS')
    expect(() => evaluateTrade(buildLineups(inputs(db)), proposal)).toThrow('No projections stored')
  })

  it('flags a passed trade deadline', () => {
    const late = buildLineups(inputs(db, { tradeDeadlineWeek: 2 }))
    expect(
      evaluateTrade(late, { rosterId: 2, give: ['6794'], get: ['7564'] }).tradeDeadlinePassed
    ).toBe(true)
  })
})

describe('trade player rows', () => {
  let build: LineupBuild
  beforeEach(() => {
    const db = seedLeague()
    seedSeason(db)
    build = buildLineups(inputs(db))
  })

  it('counts window starts per player and builds the row', () => {
    const weeks = [3, 4, 5]
    const starts = starterWeeks(build, 1, weeks)
    expect(starts.get('4866')).toBe(3) // Barkley fills RB even at 0 in week 5
    expect(starts.get('8259')).toBeUndefined() // IR
    const cook = build.inputs.value.series.get('8259')
    if (!cook) throw new Error('fixture: Cook missing')
    expect(tradePlayer(build, cook, 0)).toEqual({
      playerId: '8259',
      fullName: 'James Cook',
      position: 'RB',
      team: cook.base.team,
      statsAvailable: false,
      injuryStatus: cook.base.injuryStatus,
      reserve: 'ir',
      rosPoints: 0, // projections are stored; he has none
      rosValue: 0,
      expert: null,
      market: null,
      starterWeeks: 0
    })
    const barkley = build.inputs.value.series.get('4866')
    if (!barkley) throw new Error('fixture: Barkley missing')
    const row = tradePlayer(build, barkley, 3)
    expect(row.reserve).toBeNull()
    expect(row.rosPoints).toBe(build.rowById.get('4866')?.rosPoints ?? null)
    expect(teamWeek(build, 1, 3).optimal.some((p) => p.player?.id === '4866')).toBe(true)
  })
})
