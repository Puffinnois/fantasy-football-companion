import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { compileQuery, StatsQueryError } from '@main/stats/engine/compile'
import { runQuery } from '@main/stats/engine/run'
import type { StatsQuery } from '@shared/stats/types'
import { openTestDb } from '../../../fixtures/stats'
import { CB, EDGE, KC_RB, QB, RB, seedGame, seedPlays, WR } from '../../../fixtures/statsDerived'

const CTX = { currentSeason: 2025, hasLeague: false }

async function seeded(): Promise<Awaited<ReturnType<typeof openTestDb>>> {
  const db = await openTestDb()
  await seedGame(db)
  await rebuildDerived(db, { seasons: 'all', league: null })
  return db
}

describe('runQuery (stats-analysis spec §7)', () => {
  it('answers a leaderboard with value, sample, qualification, percentile and rank', async () => {
    const db = await seeded()
    const r = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['targets', 'catch_rate'],
        scope: { seasons: [2025], positions: ['WR', 'RB'] }
      },
      CTX
    )
    expect(r.grain).toBe('season')
    expect(r.total).toBe(3)
    // Best first; rows without a value last, by name.
    expect(r.rows.map((x) => x.id)).toEqual([WR, KC_RB, RB])
    expect(r.rows[0]).toMatchObject({ name: 'Wes Wideout', team: 'BUF', position: 'WR', games: 1 })
    expect(r.rows[0].values.targets).toEqual({
      value: 2,
      raw: 2,
      sample: 1,
      qualified: true,
      percentile: 0,
      rank: 1,
      estimated: false
    })
    // 50 targets per 17 games: 1 game of 1 week needs 2.9; 2 is not enough.
    expect(r.rows[0].values.catch_rate).toMatchObject({
      value: 0.5,
      sample: 2,
      qualified: false,
      percentile: null
    })
    expect(r.columns[1]).toMatchObject({ id: 'catch_rate', unit: 'pct', seasons: [2025] })
  })

  it('splits by situation from the plays', async () => {
    const db = await seeded()
    const r = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['qb_epa_db'],
        scope: { seasons: [2025], players: [QB] },
        groupBy: ['down']
      },
      CTX
    )
    expect(r.grain).toBe('play')
    expect(r.rows.map((x) => [x.group.down, x.values.qb_epa_db.raw])).toEqual([
      [1, 0.4],
      [2, -1.8]
    ])
    const pressured = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['yprr', 'routes'],
        scope: { seasons: [2025], players: [WR] },
        situation: { pressure: false }
      },
      CTX
    )
    expect(pressured.rows[0].values.routes.raw).toBe(2)
    expect(pressured.rows[0].values.yprr.raw).toBe(10)
    expect(pressured.notes[0]).toMatch(/participation/)
  })

  it('splits the last two minutes of the 2nd and 4th quarters from the rest', async () => {
    const db = await seeded()
    // EPA in powers of two: a sum names the plays it holds.
    const play = (qtr: number, left: number, epa: number): Record<string, unknown> => ({
      posteam: 'BUF',
      defteam: 'KC',
      play_type: 'run',
      rush: 1,
      qtr,
      half_seconds_remaining: left,
      epa
    })
    await seedPlays(db, [
      play(2, 90, 1),
      play(4, 30, 2),
      play(2, 120, 4),
      // The end of the 1st and 3rd quarters: the half has 15 more minutes.
      play(1, 960, 8),
      play(3, 960, 16),
      play(4, 121, 32),
      play(5, 60, 64)
    ])
    const sum = async (twoMinute: boolean): Promise<number[]> => {
      const r = await runQuery(
        db,
        {
          entity: 'team',
          metrics: ['off_epa_play'],
          scope: { seasons: [2025], teams: ['BUF'] },
          situation: { twoMinute }
        },
        CTX
      )
      const v = r.rows[0].values.off_epa_play
      return [v.raw! * v.sample!, v.sample!]
    }
    expect(await sum(true)).toEqual([1 + 2 + 4, 3])
    expect(await sum(false)).toEqual([8 + 16 + 32 + 64, 4])
  })

  it('scales qualification to the share of plays each situational row keeps', async () => {
    const db = await seeded()
    const shares = async (q: Partial<StatsQuery>): Promise<unknown[]> => {
      const c = compileQuery(
        {
          entity: 'player',
          metrics: ['qb_epa_db'],
          scope: { seasons: [2025], players: [QB] },
          ...q
        },
        CTX
      )
      const rows = await db.all<{ share: number }>(c.sql.replaceAll('$factor', '1'), c.params)
      return rows.map((r) => r.share).sort()
    }
    // Five scrimmage plays: three on first down, one each on second and third.
    expect(await shares({ groupBy: ['down'] })).toEqual([0.2, 0.6])
    expect(await shares({ situation: { pressure: true } })).toEqual([0.2])
    // A team's share counts the side the metric is on: BUF's four offensive plays, not KC's run.
    expect(
      await shares({
        metrics: ['yprr'],
        scope: { seasons: [2025], teams: ['BUF'], players: [WR] },
        situation: { withOnField: [QB] }
      })
    ).toEqual([1])
    expect(
      await shares({
        metrics: ['sacks'],
        scope: { seasons: [2025], teams: ['KC'], players: [EDGE] },
        situation: { withOnField: [EDGE] }
      })
    ).toEqual([1])
  })

  it('reads weekly rows, fantasy points under a scoring, and team metrics', async () => {
    const db = await seeded()
    const weekly = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['fantasy_points'],
        scope: { seasons: [2025], players: [WR] },
        groupBy: ['week'],
        scoring: 'half'
      },
      CTX
    )
    expect(weekly.rows.map((x) => [x.group.week, x.values.fantasy_points.value])).toEqual([
      [1, 2.5]
    ])
    const teams = await runQuery(
      db,
      {
        entity: 'team',
        metrics: ['off_epa_play', 'win_pct', 'fpa_wr'],
        scope: { seasons: [2025] }
      },
      CTX
    )
    expect(teams.rows.map((x) => [x.id, x.values.win_pct.value])).toEqual([
      ['BUF', 1],
      ['KC', 0]
    ])
    expect(teams.rows.find((x) => x.id === 'KC')?.values.fpa_wr.value).toBe(3)
  })

  it('transforms values per game, as percentiles, z-scores or against the league', async () => {
    const db = await seeded()
    const q = { entity: 'team' as const, metrics: ['off_epa_play'], scope: { seasons: [2025] } }
    const raw = await runQuery(db, q, CTX)
    const vs = await runQuery(db, { ...q, transform: 'vsLeague' }, CTX)
    const mean = (raw.rows[0].values.off_epa_play.raw! + raw.rows[1].values.off_epa_play.raw!) / 2
    expect(vs.rows[0].values.off_epa_play.value).toBeCloseTo(
      raw.rows[0].values.off_epa_play.raw! - mean
    )
    const pct = await runQuery(db, { ...q, transform: 'percentile' }, CTX)
    expect(pct.rows.map((x) => x.values.off_epa_play.value)).toEqual([100, 0])
    const perGame = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['tackles'],
        scope: { seasons: [2025], players: [CB] },
        transform: 'perGame'
      },
      CTX
    )
    expect(perGame.rows[0].values.tackles.value).toBe(1)
  })

  it('marks routes estimated in a season without participation', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await db.exec('DELETE FROM on_field')
    await rebuildDerived(db, { seasons: 'all', league: null })
    const r = await runQuery(
      db,
      { entity: 'player', metrics: ['yprr'], scope: { seasons: [2025], players: [WR] } },
      CTX
    )
    expect(r.rows[0].values.yprr).toMatchObject({ raw: 10, estimated: true })
  })

  it('stops a query that runs too long', async () => {
    const db = await seeded()
    await db.exec('ALTER TABLE team_week RENAME TO team_week_real')
    await db.exec('CREATE VIEW team_week AS SELECT t.* FROM team_week_real t, range(400000000) r')
    await expect(
      runQuery(db, { entity: 'player', metrics: ['targets'], scope: { seasons: [2025] } }, CTX, 50)
    ).rejects.toThrow(new StatsQueryError('the query took longer than 0.05 s'))
  })
})
