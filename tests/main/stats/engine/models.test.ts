import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { compileQuery, StatsQueryError } from '@main/stats/engine/compile'
import { runQuery } from '@main/stats/engine/run'
import { openTestDb } from '../../../fixtures/stats'
import { seedGame, seedTable, WR } from '../../../fixtures/statsDerived'

const CTX = { currentSeason: 2025, hasLeague: false }

async function seeded(): Promise<Awaited<ReturnType<typeof openTestDb>>> {
  const db = await openTestDb()
  await seedGame(db)
  await rebuildDerived(db, { seasons: 'all', league: null })
  return db
}

describe('model metrics in the query engine (stats-analysis spec §7, §8)', () => {
  it('reads a team state at the end of the scope', async () => {
    const db = await seeded()
    // Every week has a row, byes included (week 2 is BUF's bye); the postseason has no odds.
    const row = (
      team: string,
      week: number,
      elo: number,
      odds: number | null
    ): Record<string, string | number | null> => ({
      team,
      season: 2025,
      season_type: week > 18 ? 'POST' : 'REG',
      week,
      elo,
      playoff_pct: odds
    })
    await seedTable(db, 'team_model_week', [
      row('BUF', 0, 1500, 0.5),
      row('BUF', 1, 1520, 0.6),
      row('BUF', 2, 1520, 0.7),
      row('BUF', 19, 1540, null),
      row('KC', 0, 1500, 0.5),
      row('KC', 1, 1480, 0.4),
      row('KC', 2, 1470, 0.3)
    ])
    const at = async (
      scope: Record<string, unknown>,
      groupBy?: ('week' | 'season')[]
    ): Promise<[string, unknown, number | null, number | null][]> =>
      (
        await runQuery(
          db,
          {
            entity: 'team',
            metrics: ['elo', 'playoff_pct'],
            scope: { seasons: [2025], ...scope },
            groupBy
          },
          CTX
        )
      ).rows.map((x) => [
        x.id,
        x.group.week ?? null,
        x.values.elo.value,
        x.values.playoff_pct.value
      ])
    // The regular season ends at week 2, after BUF's bye.
    expect(await at({})).toEqual([
      ['BUF', null, 1520, 0.7],
      ['KC', null, 1470, 0.3]
    ])
    expect(await at({ weeks: [1, 1] })).toEqual([
      ['BUF', null, 1520, 0.6],
      ['KC', null, 1480, 0.4]
    ])
    // With the postseason, the rating moves on and the odds stay the last ones there were.
    expect((await at({ seasonType: 'ALL' }))[0]).toEqual(['BUF', null, 1540, 0.7])
    // By week: each played week's state (a team's rows are its games).
    expect(await at({ teams: ['KC'] }, ['week'])).toEqual([['KC', 1, 1480, 0.4]])
  })

  it('computes weekly quantiles and boom weeks from weekly rows', async () => {
    const db = await seeded()
    const r = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['fp_ceiling', 'boom_rate'],
        scope: { seasons: [2025], players: [WR] }
      },
      CTX
    )
    // A weekly quantile needs one row per game: the engine reads the weekly table.
    expect(r.grain).toBe('week')
    // One PPR week: 1 + 2 = 3 points, the best (and only) WR line that week.
    expect(r.rows[0].values.fp_ceiling.value).toBeCloseTo(3, 6)
    expect(r.rows[0].values.boom_rate.value).toBe(1)
  })

  it('shrinks a rate toward the qualified mean by its stability prior', async () => {
    const db = await seeded()
    const r = await runQuery(
      db,
      { entity: 'team', metrics: ['win_pct'], scope: { seasons: [2025] }, transform: 'shrunk' },
      { ...CTX, priors: new Map([['win_pct', 3]]) }
    )
    const value = (team: string): number | null =>
      r.rows.find((x) => x.id === team)!.values.win_pct.value
    // BUF 1–0, KC 0–1, the mean 0.5: (1 × 1 + 3 × 0.5) / 4 and (0 + 1.5) / 4.
    expect(value('BUF')).toBeCloseTo(0.625, 9)
    expect(value('KC')).toBeCloseTo(0.375, 9)
    const none = await runQuery(
      db,
      { entity: 'team', metrics: ['win_pct'], scope: { seasons: [2025] }, transform: 'shrunk' },
      CTX
    )
    expect(none.notes).toEqual(['Win %: not shrunk (no stability estimate).'])
  })

  it('adjusts for the opponents faced', async () => {
    const db = await seeded()
    const q = { entity: 'team' as const, metrics: ['off_epa_play'], scope: { seasons: [2025] } }
    const raw = await runQuery(db, q, CTX)
    const adjusted = await runQuery(db, { ...q, transform: 'opponentAdjusted' }, CTX)
    expect(adjusted.grain).toBe('week')
    // One game: each offense is exactly what its opponent allowed, so both adjust to the league.
    const v = (r: typeof raw, team: string): number =>
      r.rows.find((x) => x.id === team)!.values.off_epa_play.value!
    const league = (v(raw, 'BUF') * 4 + v(raw, 'KC') * 1) / 5
    expect(v(adjusted, 'BUF')).toBeCloseTo(league, 9)
    expect(v(adjusted, 'KC')).toBeCloseTo(league, 9)
    await expect(
      runQuery(db, { ...q, transform: 'opponentAdjusted', situation: { down: [1] } }, CTX)
    ).rejects.toThrow(StatsQueryError)
  })

  it('leaves a count unadjusted: a total is not comparable with the league total', async () => {
    const db = await seeded()
    const q = { entity: 'team' as const, metrics: ['points_for'], scope: { seasons: [2025] } }
    const r = await runQuery(db, { ...q, transform: 'opponentAdjusted' }, CTX)
    expect(r.rows.map((x) => [x.id, x.values.points_for.value])).toEqual([
      ['BUF', 27],
      ['KC', 20]
    ])
    expect(r.notes).toEqual([
      'Points scored: not opponent-adjusted (a count, a rating or a weekly range).'
    ])
  })

  it('splits rows into odd and even weeks for the stability model only', async () => {
    const db = await seeded()
    const compiled = compileQuery(
      { entity: 'team', metrics: ['win_pct'], scope: { seasons: [2025] }, groupBy: ['season'] },
      { ...CTX, internal: { unlimited: true, halves: true } }
    )
    const rows = await db.all<{ id: string; g_half: number }>(
      compiled.sql.replaceAll('$factor', '0.5'),
      compiled.params
    )
    expect(rows.map((r) => [r.id, r.g_half]).sort()).toEqual([
      ['BUF', 1],
      ['KC', 1]
    ])
    expect(compiled.sql).not.toContain('LIMIT')
  })
})
