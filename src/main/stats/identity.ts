import { canonicalName, nameKey } from '@main/sync/identity'
import { sqlIdent, type Params, type StatsDb } from './db'
import { describe } from './load'

/** Inserts `rows` into a new `table` (replacing it) in chunks of bound VALUES. */
export async function writeTable(
  db: StatsDb,
  table: string,
  columns: Record<string, string>,
  rows: unknown[][]
): Promise<void> {
  const names = Object.keys(columns)
  const defs = names.map((c) => `${sqlIdent(c)} ${columns[c]}`).join(', ')
  await db.exec(`CREATE OR REPLACE TABLE ${sqlIdent(table)} (${defs})`)
  const one = `(${names.map(() => '?').join(', ')})`
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    await db.exec(
      `INSERT INTO ${sqlIdent(table)} VALUES ${chunk.map(() => one).join(', ')}`,
      chunk.flat() as Params
    )
  }
}

async function tableExists(db: StatsDb, table: string): Promise<boolean> {
  const row = await db.get<{ n: number }>(
    "SELECT count(*) AS n FROM duckdb_tables() WHERE table_name = ? AND schema_name = 'main'",
    [table]
  )
  return (row?.n ?? 0) > 0
}

interface NflversePlayer {
  gsis_id: string
  display_name: string | null
  position: string | null
  draft_year: number | null
  rookie_season: number | null
  last_season: number | null
}

/** `players` columns (spec §4.3) and the nflverse `players` column each comes from; NULL when absent. */
const PLAYER_COLUMNS: Record<string, string> = {
  name: 'display_name',
  first_name: 'first_name',
  last_name: 'last_name',
  position: 'position',
  position_group: 'position_group',
  birth_date: 'birth_date',
  height: 'height',
  weight: 'weight',
  college: 'college_name',
  draft_year: 'draft_year',
  draft_round: 'draft_round',
  draft_pick: 'draft_pick',
  draft_team: 'draft_team',
  rookie_season: 'rookie_season',
  last_season: 'last_season',
  team: 'latest_team',
  status: 'status',
  headshot: 'headshot',
  pfr_id: 'pfr_id',
  espn_id: 'espn_id',
  pff_id: 'pff_id',
  nfl_id: 'nfl_id',
  smart_id: 'smart_id'
}

/** Spec §4.3 resolution order for a Sleeper id: crosswalk, the rosters' own sleeper_id, then name. */
const SLEEPER_ID_PRIORITY = ['crosswalk', 'rosters', 'name']

/**
 * `sleeper_ids` (Sleeper id → gsis id): the DynastyProcess crosswalk, then nflverse weekly rosters
 * (which carry `sleeper_id`), then a name + position match (`nameKey`) against nflverse players
 * active that season, only when exactly one matches. Team ids (DEF, `TEAM_*`) are not players.
 */
async function buildSleeperIds(db: StatsDb, players: NflversePlayer[]): Promise<number> {
  const pairs = new Map<string, [string, string]>()
  const add = (sleeper: string, gsis: string, how: string): void => {
    if (!pairs.has(sleeper)) pairs.set(sleeper, [gsis, how])
  }
  if (await tableExists(db, 'src_crosswalk')) {
    const rows = await db.all<{ sleeper_id: string; gsis_id: string }>(
      `SELECT sleeper_id, min(gsis_id) AS gsis_id FROM src_crosswalk
       WHERE sleeper_id IS NOT NULL AND gsis_id IS NOT NULL GROUP BY sleeper_id`
    )
    for (const r of rows) add(r.sleeper_id, r.gsis_id, 'crosswalk')
  }
  if (await tableExists(db, 'src_rosters')) {
    const rows = await db.all<{ sleeper_id: string; gsis_id: string }>(
      `SELECT sleeper_id::VARCHAR AS sleeper_id, arg_max(gsis_id, season * 100 + week) AS gsis_id
       FROM src_rosters WHERE sleeper_id IS NOT NULL AND gsis_id IS NOT NULL GROUP BY 1`
    )
    for (const r of rows) add(r.sleeper_id, r.gsis_id, 'rosters')
  }
  if (await tableExists(db, 'src_sleeper_players')) {
    const byKey = new Map<string, NflversePlayer[]>()
    for (const p of players) {
      if (!p.display_name || !p.position) continue
      const key = nameKey(p.display_name, p.position)
      byKey.set(key, [...(byKey.get(key) ?? []), p])
    }
    const sleeper = await db.all<{
      player_id: string
      name: string
      position: string | null
      season: number
    }>(
      `SELECT player_id, arg_max(concat_ws(' ', first_name, last_name), season) AS name,
              arg_max(position, season) AS position, max(season) AS season
       FROM src_sleeper_players WHERE length(player_id) > 3 AND player_id NOT LIKE 'TEAM%'
       GROUP BY player_id`
    )
    for (const s of sleeper) {
      if (pairs.has(s.player_id) || !s.position || s.position === 'DEF') continue
      const active = (byKey.get(nameKey(s.name, s.position)) ?? []).filter(
        (p) => p.last_season === null || p.last_season >= s.season - 1
      )
      if (active.length === 1) add(s.player_id, active[0].gsis_id, 'name')
    }
  }
  await writeTable(
    db,
    'sleeper_ids',
    { sleeper_id: 'VARCHAR', gsis_id: 'VARCHAR', resolution: 'VARCHAR' },
    [...pairs].map(([sleeper, [gsis, how]]) => [sleeper, gsis, how])
  )
  return pairs.size
}

/**
 * `combine_ids` (coverage audit fix 3): each combine row's gsis id by PFR id, else by name and the
 * draft year, else by name and the rookie season (the combine year or the next one).
 */
async function buildCombineIds(db: StatsDb, players: NflversePlayer[]): Promise<number> {
  if (!(await tableExists(db, 'src_combine'))) return 0
  const byPfr = new Map(
    (
      await db.all<{ pfr_id: string; gsis_id: string }>(
        'SELECT pfr_id, min(gsis_id) AS gsis_id FROM src_players WHERE pfr_id IS NOT NULL GROUP BY 1'
      )
    ).map((r) => [r.pfr_id, r.gsis_id])
  )
  const byNameYear = new Map<string, string[]>()
  const put = (name: string, year: number | null, gsis: string): void => {
    if (year === null) return
    const key = `${canonicalName(name)}|${year}`
    byNameYear.set(key, [...(byNameYear.get(key) ?? []), gsis])
  }
  for (const p of players) {
    if (!p.display_name) continue
    put(p.display_name, p.draft_year, p.gsis_id)
  }
  const byNameRookie = new Map<string, string[]>()
  for (const p of players) {
    if (!p.display_name || p.rookie_season === null) continue
    const key = `${canonicalName(p.display_name)}|${p.rookie_season}`
    byNameRookie.set(key, [...(byNameRookie.get(key) ?? []), p.gsis_id])
  }
  const unique = (list: string[] | undefined): string | null =>
    list && new Set(list).size === 1 ? list[0] : null
  const rows = await db.all<{
    season: number
    player_name: string
    school: string | null
    pfr_id: string | null
  }>('SELECT DISTINCT season, player_name, school, pfr_id FROM src_combine')
  const out: unknown[][] = []
  for (const r of rows) {
    let gsis = r.pfr_id ? (byPfr.get(r.pfr_id) ?? null) : null
    let how = 'pfr'
    if (gsis === null) {
      gsis = unique(byNameYear.get(`${canonicalName(r.player_name)}|${r.season}`))
      how = 'name_draft_year'
    }
    if (gsis === null) {
      const name = canonicalName(r.player_name)
      gsis =
        unique(byNameRookie.get(`${name}|${r.season}`)) ??
        unique(byNameRookie.get(`${name}|${r.season + 1}`))
      how = 'name_rookie_season'
    }
    if (gsis !== null) out.push([r.season, r.player_name, r.school, gsis, how])
  }
  await writeTable(
    db,
    'combine_ids',
    {
      season: 'INTEGER',
      player_name: 'VARCHAR',
      school: 'VARCHAR',
      gsis_id: 'VARCHAR',
      resolution: 'VARCHAR'
    },
    out
  )
  return out.length
}

/**
 * Stats-analysis spec §4.3: `players` (one row per person, keyed by gsis id, with every id the
 * sources use), `sleeper_ids` and `combine_ids`. Rebuilt after every refresh that loaded rows.
 */
export async function buildIdentity(db: StatsDb): Promise<number> {
  if (!(await tableExists(db, 'src_players'))) return 0
  const players = await db.all<NflversePlayer>(
    `SELECT gsis_id, display_name, position, draft_year, rookie_season, last_season
     FROM src_players WHERE gsis_id IS NOT NULL`
  )
  await buildSleeperIds(db, players)
  const have = await describe(db, 'SELECT * FROM src_players')
  const columns = Object.entries(PLAYER_COLUMNS)
    .map(
      ([alias, column]) =>
        `${have.has(column) ? `p.${sqlIdent(column)}` : 'NULL'} AS ${sqlIdent(alias)}`
    )
    .join(', ')
  const crosswalk = (await tableExists(db, 'src_crosswalk'))
    ? `LEFT JOIN (SELECT gsis_id, min(sportradar_id) AS sportradar_id, min(fantasypros_id) AS fantasypros_id
                  FROM src_crosswalk WHERE gsis_id IS NOT NULL GROUP BY 1) cw USING (gsis_id)`
    : ''
  const crosswalkCols = crosswalk
    ? 'cw.sportradar_id, cw.fantasypros_id'
    : 'NULL AS sportradar_id, NULL AS fantasypros_id'
  await db.exec(
    `CREATE OR REPLACE TABLE players AS
     SELECT p.gsis_id, ${columns}, ${crosswalkCols}, s.sleeper_id
     FROM src_players p ${crosswalk}
     LEFT JOIN (SELECT gsis_id, arg_min(sleeper_id, ${prioritySql()}) AS sleeper_id
                FROM sleeper_ids GROUP BY gsis_id) s USING (gsis_id)
     WHERE p.gsis_id IS NOT NULL`
  )
  await buildCombineIds(db, players)
  const n = await db.get<{ n: number }>('SELECT count(*) AS n FROM players')
  return n?.n ?? 0
}

function prioritySql(): string {
  return `CASE resolution ${SLEEPER_ID_PRIORITY.map((r, i) => `WHEN '${r}' THEN ${i}`).join(' ')} END`
}
