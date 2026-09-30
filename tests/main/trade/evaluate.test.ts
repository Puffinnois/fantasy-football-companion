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
import type { SideMemo } from '@main/trade/side'
import { buildValueSeason } from '@main/value/build'
import { twoTeam } from '@shared/deal'
import type { TradeMove, TradeProposal } from '@shared/types'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'
import * as fx from '../../fixtures/sleeper'
import { CYCLE_LEAGUE, SMALL_LEAGUE, syntheticBuild } from '../../fixtures/synthetic'

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
    const ev = evaluateTrade(build, twoTeam(1, 2, ['6794'], ['7564']))
    expect(ev).toMatchObject({
      season: SEASON,
      currentWeek: 3,
      lastWeek: 17,
      weeks: 15,
      tradeDeadlinePassed: false,
      everyoneGains: false
    })
    const [me, them] = ev.sides
    expect(me).toMatchObject({ rosterId: 1, name: 'Cook Book', isMe: true })
    expect(ids(me.give)).toEqual(['6794'])
    expect(ids(me.get)).toEqual(['7564'])
    expect(me.give[0].to).toBe(2)
    expect(me.get[0].from).toBe(2)
    expect(ids(them.give)).toEqual(['7564'])
    expect(ids(them.get)).toEqual(['6794'])
    // before equals the power ranking; wk3 13 → 9 (−4), wk4 15 → 0 (−15)
    const mine = teamStrengths(build).find((r) => r.rosterId === 1)
    expect(me.before).toBeCloseTo(mine?.rosTotal ?? -1, 2)
    expect(me.delta).toBeCloseTo(-19, 2)
    expect(me.deltaPerWeek).toBeCloseTo(-19 / 15, 2)
    expect(me.thisWeekDelta).toBeCloseTo(-4, 2)
    expect(me.weeksChanged).toBe(2)
    expect(them.delta).toBeCloseTo(19, 2)
    expect(them.thisWeekDelta).toBeCloseTo(4, 2)
    expect(me.drops).toEqual([])
    // this week's swap on my side: Chase in for Jefferson at WR
    expect(me.thisWeekSwaps).toHaveLength(1)
    expect(me.thisWeekSwaps[0]).toMatchObject({ slot: 'WR', delta: -4 })
    expect(me.thisWeekSwaps[0].in.playerId).toBe('7564')
    expect(me.thisWeekSwaps[0].out?.playerId).toBe('6794')
  })

  it('matches a full solve of every week (the week skip is exact)', () => {
    const trades: [string[], string[]][] = [
      [['6794'], ['7564']],
      [['LAR'], ['9509']], // 0-value defense for a taxi player
      [
        ['4866', 'LAR'],
        ['7564', '9509']
      ],
      [['8259'], ['9509']] // IR for taxi: nothing changes
    ]
    for (const [give, get] of trades) {
      const p = twoTeam(1, 2, give, get)
      const skipped = evaluateTrade(build, p)
      const full = evaluateTrade(build, p, { skip: false })
      const [mine, theirs] = skipped.sides
      expect([mine.delta, theirs.delta, mine.weeksChanged]).toEqual([
        full.sides[0].delta,
        full.sides[1].delta,
        full.sides[0].weeksChanged
      ])
      // and the after total is what rosterWeek says on the swapped roster
      const kept = (build.rosters.get(1) ?? []).filter((s) => !give.includes(s.base.playerId))
      const got = get.map((id) => build.inputs.value.series.get(id)).flatMap((s) => (s ? [s] : []))
      let after = 0
      for (let w = 3; w <= 17; w++) after += rosterWeek(build, [...kept, ...got], w).optimalTotal
      expect(mine.after).toBeCloseTo(after, 2)
    }
    const ir = evaluateTrade(build, twoTeam(1, 2, ['8259'], ['9509']))
    expect(ir.sides[0].delta).toBe(0)
    expect(ir.sides[0].weeksChanged).toBe(0)
    expect(ir.sides[0].get[0].reserve).toBe('taxi')
  })

  it('auto-drops the player who starts least when the roster would overflow (spec §2.3)', () => {
    // Sleeper roster size 2 (IR does not count): after Jefferson → Chase I hold Barkley, LAR, Chase.
    const small = buildLineups(inputs(db, { rosterPositions: ['RB', 'WR', 'IR'] }))
    expect(rosterSize(small)).toBe(2)
    const ev = evaluateTrade(small, twoTeam(1, 2, ['6794'], ['7564']))
    // Everyone "starts" every week (0-value starters still fill slots); LAR has the lowest rosPoints.
    expect(ids(ev.sides[0].drops)).toEqual(['LAR'])
    expect(ev.sides[0].delta).toBeCloseTo(-19, 2)
    expect(ev.sides[1].drops).toEqual([]) // Rival: Jefferson + Bijan (taxi) = 1 active
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
    const ev = evaluateTrade(priced, twoTeam(1, 2, ['6794', 'LAR'], ['7564']))
    expect(ev.sides[0]).toMatchObject({
      marketGive: 10512,
      marketGet: 8000,
      unvaluedGive: 1,
      unvaluedGet: 0
    })
    expect(ev.sides[1]).toMatchObject({ marketGive: 8000, marketGet: 10512, unvaluedGet: 1 })
    expect(ev.marketFair).toBe(false) // 8000 / 10512 = 0.76 on my side
    expect(ev.sides[0].give[0].market?.value).toBe(10512)
    // Unpriced league: every ratio is +∞, so the trade is "fair" — the unvalued counts say why.
    const blind = evaluateTrade(build, twoTeam(1, 2, ['6794'], ['7564']))
    expect(blind.marketFair).toBe(true)
    expect(blind.sides[0].unvaluedGive + blind.sides[0].unvaluedGet).toBe(2)
  })

  it('rejects malformed proposals with INVALID_TRADE (multi-team spec §2.1)', () => {
    const invalid = (moves: TradeMove[]): string => codeOf(() => evaluateTrade(build, { moves }))
    const chaseToMe: TradeMove = { playerId: '7564', to: 1 }
    expect(invalid([])).toBe('INVALID_TRADE')
    expect(invalid([{ playerId: '6794', to: 9 }, chaseToMe])).toBe('INVALID_TRADE')
    expect(invalid([{ playerId: '6794', to: 1 }, chaseToMe])).toBe('INVALID_TRADE')
    expect(invalid([{ playerId: '6794', to: 2 }])).toBe('INVALID_TRADE')
    expect(invalid([chaseToMe])).toBe('INVALID_TRADE')
    expect(invalid([{ playerId: '6794', to: 2 }, { playerId: '6794', to: 2 }, chaseToMe])).toBe(
      'INVALID_TRADE'
    )
    expect(invalid([{ playerId: 'nobody', to: 2 }, chaseToMe])).toBe('INVALID_TRADE')
    expect(() =>
      evaluateTrade(build, { moves: [{ playerId: 'nobody', to: 2 }, chaseToMe] })
    ).toThrow('nobody is not on a roster in this league')
    expect(() => evaluateTrade(build, { moves: [{ playerId: '6794', to: 2 }] })).toThrow(
      'Cook Book gets nobody'
    )
    expect(() => evaluateTrade(build, { moves: [{ playerId: '6794', to: 9 }, chaseToMe] })).toThrow(
      'Team 9 is not in this league'
    )
  })

  it('throws NO_PROJECTIONS without a window and NO_ME without my team', () => {
    const proposal = twoTeam(1, 2, ['6794'], ['7564'])
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
    expect(evaluateTrade(late, twoTeam(1, 2, ['6794'], ['7564'])).tradeDeadlinePassed).toBe(true)
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

/**
 * SMALL_LEAGUE (fixtures/synthetic.ts), window 16–17, constant weeks. Me → Rival → Other → me:
 * B to Rival, G to Other, I to me. Per week: Me A20 · I25 · FLEX C18 = 63 (was 46), Rival H3 · F19 ·
 * FLEX E17 = 39 (43), Other G7 · K6 · FLEX L9 = 22 (38). Every roster stays at 4: no drops.
 */
describe('evaluateTrade across three teams (multi-team spec §2.2)', () => {
  const { build } = syntheticBuild(SMALL_LEAGUE)
  const cycle: TradeProposal = {
    moves: [
      { playerId: 'B', to: 2 },
      { playerId: 'G', to: 3 },
      { playerId: 'I', to: 1 }
    ]
  }

  it('scores every side on its own gives and gets', () => {
    const ev = evaluateTrade(build, cycle)
    expect(ev.sides.map((s) => s.rosterId)).toEqual([1, 2, 3])
    const [me, rival, other] = ev.sides
    expect(me).toMatchObject({
      delta: 34,
      deltaPerWeek: 17,
      thisWeekDelta: 17,
      weeksChanged: 2,
      drops: []
    })
    expect(rival).toMatchObject({ delta: -8, deltaPerWeek: -4, thisWeekDelta: -4, drops: [] })
    expect(other).toMatchObject({ delta: -32, deltaPerWeek: -16, thisWeekDelta: -16, drops: [] })
    expect(me.give).toMatchObject([{ playerId: 'B', to: 2, starterWeeks: 2 }])
    // I's starts are counted on Other, the roster he leaves
    expect(me.get).toMatchObject([{ playerId: 'I', from: 3, starterWeeks: 2 }])
    expect(rival.give).toMatchObject([{ playerId: 'G', to: 3 }])
    expect(rival.get).toMatchObject([{ playerId: 'B', from: 1, starterWeeks: 2 }])
    expect(other.give).toMatchObject([{ playerId: 'I', to: 1 }])
    expect(other.get).toMatchObject([{ playerId: 'G', from: 2, starterWeeks: 2 }])
    expect(ev.sides.map((s) => [s.marketGive, s.marketGet])).toEqual([
      [1500, 7000],
      [1000, 1500],
      [7000, 1000]
    ])
    expect(ev).toMatchObject({ weeks: 2, everyoneGains: false, marketFair: false })
  })

  it('orders the other sides by first appearance and matches a full solve', () => {
    const reordered: TradeProposal = {
      moves: [
        { playerId: 'I', to: 1 },
        { playerId: 'B', to: 2 },
        { playerId: 'G', to: 3 }
      ]
    }
    expect(evaluateTrade(build, reordered).sides.map((s) => s.rosterId)).toEqual([1, 3, 2])
    expect(evaluateTrade(build, cycle, { skip: false })).toEqual(evaluateTrade(build, cycle))
  })

  it('flags a deal where everyone gains', () => {
    const { build: cycleBuild } = syntheticBuild(CYCLE_LEAGUE)
    const ev = evaluateTrade(cycleBuild, {
      moves: [
        { playerId: 'a2', to: 3 },
        { playerId: 'c2', to: 2 },
        { playerId: 'b2', to: 1 }
      ]
    })
    expect(ev.sides.map((s) => [s.rosterId, s.deltaPerWeek])).toEqual([
      [1, 10],
      [3, 10],
      [2, 10]
    ])
    expect(ev.everyoneGains).toBe(true)
    expect(ev.marketFair).toBe(true)
  })

  it('names the rule a deal breaks', () => {
    const moves: TradeMove[] = [
      { playerId: 'B', to: 2 },
      { playerId: 'G', to: 1 },
      { playerId: 'I', to: 2 }
    ]
    expect(() => evaluateTrade(build, { moves })).toThrow('Other gets nobody')
    expect(evaluateTrade(build, twoTeam(1, 3, ['B'], ['I'])).sides.map((s) => s.rosterId)).toEqual([
      1, 3
    ])
  })

  it('shares side verdicts through a memo, destinations aside (spec §2.3)', () => {
    const memo: SideMemo = new Map()
    const first = evaluateTrade(build, cycle, { memo })
    expect([...memo.keys()]).toEqual(['1|B|I', '2|G|B', '3|I|G'])
    expect(evaluateTrade(build, cycle, { memo })).toEqual(first)
    expect(evaluateTrade(build, cycle)).toEqual(first)
    // B for I straight with Other: my side comes from the memo, Other's is new, B now goes to Other
    const direct = evaluateTrade(build, twoTeam(1, 3, ['B'], ['I']), { memo })
    // a memo hit returns the stored side itself, so this proves the memo is read, not just written
    expect(direct.sides[0].get).toBe(first.sides[0].get)
    expect(memo.size).toBe(4)
    expect(direct.sides[0]).toEqual({
      ...first.sides[0],
      give: [{ ...first.sides[0].give[0], to: 3 }]
    })
  })
})
