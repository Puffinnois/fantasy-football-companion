import { describe as group, expect, it } from 'vitest'
import { describe, replaceRows, standardSelect, widerType } from '@main/stats/load'
import { openTestDb, tempDir, writeFixture } from '../../fixtures/stats'

group('standardSelect', () => {
  const have = new Map([
    ['team', 'VARCHAR'],
    ['game_type', 'VARCHAR'],
    ['name', 'VARCHAR']
  ])

  it('replaces columns the file has, adds the others and drops excluded ones', () => {
    const sql = standardSelect(
      "'f.parquet'",
      have,
      { team: 'nfl_team(team)', season_type: 'season_type_of(game_type)' },
      (c) => c === 'name',
      'season >= 2019'
    )
    expect(sql).toBe(
      `SELECT * EXCLUDE ("name") REPLACE (nfl_team(team) AS "team"), season_type_of(game_type) AS "season_type" FROM 'f.parquet' WHERE season >= 2019`
    )
  })

  it('never excludes a standard column', () => {
    expect(standardSelect('t', have, { team: 'team' }, () => true)).toBe(
      'SELECT * EXCLUDE ("game_type", "name") REPLACE (team AS "team") FROM t'
    )
  })
})

group('widerType', () => {
  it('keeps numbers numeric and falls back to text', () => {
    expect(widerType('INTEGER', 'DOUBLE')).toBe('DOUBLE')
    expect(widerType('INTEGER', 'BIGINT')).toBe('BIGINT')
    expect(widerType('BIGINT', 'DECIMAL(18,3)')).toBe('DOUBLE')
    expect(widerType('INTEGER', 'VARCHAR')).toBe('VARCHAR')
    expect(widerType('BOOLEAN', 'INTEGER')).toBe('VARCHAR')
  })
})

group('replaceRows', () => {
  it('replaces one season and keeps the others', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const s1 = await writeFixture(
      db,
      dir,
      'a.parquet',
      'SELECT 2024 AS season, 1 AS x UNION ALL SELECT 2024, 2'
    )
    const s2 = await writeFixture(db, dir, 'b.parquet', 'SELECT 2025 AS season, 3 AS x')
    const s1b = await writeFixture(db, dir, 'c.parquet', 'SELECT 2024 AS season, 9 AS x')
    await replaceRows(db, 'src_t', 2024, `SELECT * FROM '${s1}'`)
    await replaceRows(db, 'src_t', 2025, `SELECT * FROM '${s2}'`)
    expect((await replaceRows(db, 'src_t', 2024, `SELECT * FROM '${s1b}'`)).rows).toBe(1)
    expect(await db.all('SELECT season, x FROM src_t ORDER BY season')).toEqual([
      { season: 2024, x: 9 },
      { season: 2025, x: 3 }
    ])
  })

  it('adds new columns and widens a column whose type changed', async () => {
    const db = await openTestDb()
    await replaceRows(db, 'src_t', 2024, 'SELECT 2024 AS season, 1::INTEGER AS x')
    const out = await replaceRows(
      db,
      'src_t',
      2025,
      "SELECT 2025 AS season, 1.5::DOUBLE AS x, 'new' AS y"
    )
    expect(out.widened).toEqual(['x INTEGER → DOUBLE'])
    expect(await db.all('SELECT season, x, y FROM src_t ORDER BY season')).toEqual([
      { season: 2024, x: 1, y: null },
      { season: 2025, x: 1.5, y: 'new' }
    ])
  })

  it('lets an all-NULL column fit an existing one', async () => {
    const db = await openTestDb()
    await replaceRows(db, 'src_t', 2024, "SELECT 2024 AS season, 'WR' AS pos")
    const out = await replaceRows(db, 'src_t', 2025, 'SELECT 2025 AS season, NULL AS pos')
    expect(out.widened).toEqual([])
    expect((await describe(db, 'SELECT * FROM src_t')).get('pos')).toBe('VARCHAR')
  })

  it('replaces every row when the season is null', async () => {
    const db = await openTestDb()
    await replaceRows(db, 'src_t', null, 'SELECT 1 AS season UNION ALL SELECT 2')
    await replaceRows(db, 'src_t', null, 'SELECT 3 AS season')
    expect(await db.all('SELECT season FROM src_t')).toEqual([{ season: 3 }])
  })

  it('keeps the old rows when the load fails', async () => {
    const db = await openTestDb()
    await replaceRows(db, 'src_t', 2024, 'SELECT 2024 AS season, 1 AS x')
    await expect(
      replaceRows(db, 'src_t', 2024, "SELECT 2024 AS season, error('boom')::INTEGER AS x")
    ).rejects.toThrow('boom')
    expect(await db.all('SELECT x FROM src_t')).toEqual([{ x: 1 }])
  })
})
