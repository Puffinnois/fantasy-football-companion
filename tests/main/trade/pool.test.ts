import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { leagueRosterPositions } from '@main/db/repos/leagues'
import { listMatchups } from '@main/db/repos/matchups'
import { getRules } from '@main/db/repos/rules'
import { listStarterIndexes, listTeams } from '@main/db/repos/teams'
import { buildLineups, type LineupInputs } from '@main/lineup/build'
import { TradeError } from '@main/trade/evaluate'
import { tradePool } from '@main/trade/pool'
import { buildValueSeason } from '@main/value/build'
import { seedLeague } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'

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

describe('tradePool', () => {
  let db: Db
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
  })

  it('lists my roster and every other team, ordered by position then ROS points', () => {
    const pool = tradePool(buildLineups(inputs(db)))
    expect(pool).toMatchObject({
      season: SEASON,
      currentWeek: 3,
      lastWeek: 17,
      weeks: 15,
      tradeDeadlinePassed: false
    })
    expect(pool.me.name).toBe('Cook Book')
    // RB Barkley (ROS 8), RB Cook (IR, 0), WR Jefferson, DEF LAR
    expect(pool.me.players.map((p) => [p.playerId, p.position, p.reserve])).toEqual([
      ['4866', 'RB', null],
      ['8259', 'RB', 'ir'],
      ['6794', 'WR', null],
      ['LAR', 'DEF', null]
    ])
    expect(pool.me.players[0].starterWeeks).toBe(15)
    expect(pool.me.players[1].starterWeeks).toBe(0)
    expect(pool.teams.map((t) => t.name)).toEqual(['Rival'])
    expect(pool.teams[0].players.map((p) => [p.playerId, p.reserve])).toEqual([
      ['9509', 'taxi'],
      ['7564', null]
    ])
  })

  it('fails like the evaluator without projections or my team', () => {
    const nobody = buildLineups(
      inputs(db, { teams: listTeams(db, 'L1').map((t) => ({ ...t, isMe: false })) })
    )
    expect(codeOf(() => tradePool(nobody))).toBe('NO_ME')
    db.prepare('DELETE FROM player_week_projections').run()
    expect(codeOf(() => tradePool(buildLineups(inputs(db))))).toBe('NO_PROJECTIONS')
  })
})
