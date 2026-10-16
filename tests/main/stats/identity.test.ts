import { describe, expect, it } from 'vitest'
import { buildIdentity } from '@main/stats/identity'
import { openTestDb } from '../../fixtures/stats'

async function seed(db: Awaited<ReturnType<typeof openTestDb>>): Promise<void> {
  await db.exec(`CREATE TABLE src_players AS SELECT * FROM (VALUES
      ('00-0034844', 'Saquon Barkley', 'RB', 2018, 2018, 2026, 'BarkSa00'),
      ('00-0040879', 'Matthew Hibner', 'TE', NULL, 2025, 2026, NULL),
      ('00-0041000', 'Trey Smack', 'K', NULL, 2026, 2026, NULL),
      ('00-0011111', 'Chris Jones', 'DT', 2016, 2016, 2026, 'JoneCh09'),
      ('00-0022222', 'Chris Jones', 'DT', 2016, 2016, 2026, 'JoneCh10'),
      ('00-0039000', 'Isaiah Davis', 'RB', 2024, 2024, 2026, NULL),
      ('00-0039001', 'Jalen Coker', 'WR', NULL, 2024, 2026, NULL),
      ('00-0023459', 'Aaron Rodgers', 'QB', 2005, 2005, 2026, 'RodgAa00')
    ) t(gsis_id, display_name, position, draft_year, rookie_season, last_season, pfr_id)`)
  await db.exec(`CREATE TABLE src_crosswalk AS SELECT '4866' AS sleeper_id, '00-0034844' AS gsis_id,
      'sr-1' AS sportradar_id, 'fp-1' AS fantasypros_id, NULL AS yahoo_id`)
  await db.exec(
    `CREATE TABLE src_rosters AS SELECT 2026 AS season, 5 AS week, 13545 AS sleeper_id, '00-0041000' AS gsis_id`
  )
  await db.exec(`CREATE TABLE src_sleeper_players AS SELECT * FROM (VALUES
      (2026, '4866', 'Saquon', 'Barkley', 'RB'),
      (2026, '13545', 'Trey', 'Smack', 'K'),
      (2026, '13324', 'Matt', 'Hibner', 'TE'),
      (2026, '9999', 'Chris', 'Jones', 'DT'),
      (2026, '96', 'Aaron', 'Rodgers', 'QB'),
      (2026, 'LAR', NULL, NULL, 'DEF')
    ) t(season, player_id, first_name, last_name, position)`)
  await db.exec(`CREATE TABLE src_combine AS SELECT * FROM (VALUES
      (2018, 'Saquon Barkley', 'Penn St.', 'BarkSa00', NULL),
      (2024, 'Isaiah Davis', 'South Dakota St.', NULL, NULL),
      (2024, 'Jalen Coker', 'Holy Cross', NULL, NULL),
      (2024, 'Nobody Known', 'Somewhere', NULL, NULL)
    ) t(season, player_name, school, pfr_id, cfb_id)`)
}

describe('buildIdentity (stats-analysis spec §4.3)', () => {
  it('maps Sleeper ids by crosswalk, then rosters, then a unique name match', async () => {
    const db = await openTestDb()
    await seed(db)
    expect(await buildIdentity(db)).toBe(8)
    expect(
      await db.all('SELECT sleeper_id, gsis_id, resolution FROM sleeper_ids ORDER BY sleeper_id')
    ).toEqual([
      { sleeper_id: '13324', gsis_id: '00-0040879', resolution: 'name' },
      { sleeper_id: '13545', gsis_id: '00-0041000', resolution: 'rosters' },
      { sleeper_id: '4866', gsis_id: '00-0034844', resolution: 'crosswalk' },
      { sleeper_id: '96', gsis_id: '00-0023459', resolution: 'name' }
    ])
    expect(
      await db.get(
        "SELECT name, sleeper_id, sportradar_id, pfr_id FROM players WHERE gsis_id = '00-0034844'"
      )
    ).toEqual({
      name: 'Saquon Barkley',
      sleeper_id: '4866',
      sportradar_id: 'sr-1',
      pfr_id: 'BarkSa00'
    })
  })

  it('resolves combine rows by PFR id, then name and draft year, then name and rookie season (audit fix 3)', async () => {
    const db = await openTestDb()
    await seed(db)
    await buildIdentity(db)
    expect(
      await db.all(
        'SELECT player_name, gsis_id, resolution FROM combine_ids ORDER BY season, player_name'
      )
    ).toEqual([
      { player_name: 'Saquon Barkley', gsis_id: '00-0034844', resolution: 'pfr' },
      { player_name: 'Isaiah Davis', gsis_id: '00-0039000', resolution: 'name_draft_year' },
      { player_name: 'Jalen Coker', gsis_id: '00-0039001', resolution: 'name_rookie_season' }
    ])
  })

  it('does nothing before the players file is loaded', async () => {
    const db = await openTestDb()
    expect(await buildIdentity(db)).toBe(0)
  })
})
