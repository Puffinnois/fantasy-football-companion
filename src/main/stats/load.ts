import { sqlIdent, type StatsDb } from './db'

/** A file's (or select's) columns and their DuckDB types, in order. */
export type Columns = Map<string, string>

export async function describe(db: StatsDb, select: string): Promise<Columns> {
  const rows = await db.all<{ column_name: string; column_type: string }>(`DESCRIBE ${select}`)
  return new Map(rows.map((r) => [r.column_name, r.column_type]))
}

/**
 * `SELECT *` over `from` with the standard columns of spec §4.1: an expression replaces the file's
 * column of that name when it has one, and is added otherwise, so files that gained a column in a
 * later season (injuries' `season_type` from 2025) still give one column. `exclude` drops the
 * file's columns it matches (never a standard one).
 */
export function standardSelect(
  from: string,
  have: Columns,
  standard: Record<string, string>,
  exclude: (column: string) => boolean = () => false,
  where?: string
): string {
  const dropped = [...have.keys()].filter((c) => !(c in standard) && exclude(c))
  const replaced = Object.entries(standard).filter(([c]) => have.has(c))
  const added = Object.entries(standard).filter(([c]) => !have.has(c))
  const parts = ['SELECT *']
  if (dropped.length > 0) parts.push(`EXCLUDE (${dropped.map(sqlIdent).join(', ')})`)
  if (replaced.length > 0) {
    parts.push(`REPLACE (${replaced.map(([c, e]) => `${e} AS ${sqlIdent(c)}`).join(', ')})`)
  }
  const select = parts.join(' ') + added.map(([c, e]) => `, ${e} AS ${sqlIdent(c)}`).join('')
  return `${select} FROM ${from}${where ? ` WHERE ${where}` : ''}`
}

const INTEGER = /^(TINYINT|SMALLINT|INTEGER|BIGINT|UTINYINT|USMALLINT|UINTEGER)$/
const NUMERIC =
  /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL\(\d+,\d+\))$/

/**
 * The type a column takes when two seasons disagree: BIGINT for two integer types (an id stays
 * whole), DOUBLE for other numbers, else text.
 */
export function widerType(a: string, b: string): string {
  if (INTEGER.test(a) && INTEGER.test(b)) return 'BIGINT'
  return NUMERIC.test(a) && NUMERIC.test(b) ? 'DOUBLE' : 'VARCHAR'
}

async function tableColumns(db: StatsDb, table: string): Promise<Columns | null> {
  const rows = await db.all<{ column_name: string; data_type: string }>(
    `SELECT column_name, data_type FROM duckdb_columns()
     WHERE table_name = ? AND schema_name = 'main' AND NOT internal ORDER BY column_index`,
    [table]
  )
  return rows.length === 0 ? null : new Map(rows.map((r) => [r.column_name, r.data_type]))
}

/** A type DuckDB can store: an all-NULL select column has type "NULL", stored as text. */
const storable = (type: string): string => (type === '"NULL"' || type === 'NULL' ? 'VARCHAR' : type)

/**
 * Brings `table`'s columns up to `incoming` (spec §4.1: new columns are picked up): creates the
 * table, adds missing columns, and widens a column whose type changed between seasons. Returns the
 * widenings, for the step message.
 */
export async function evolveTable(
  db: StatsDb,
  table: string,
  incoming: Columns
): Promise<string[]> {
  const current = await tableColumns(db, table)
  if (current === null) {
    const cols = [...incoming].map(([c, t]) => `${sqlIdent(c)} ${storable(t)}`)
    await db.exec(`CREATE TABLE ${sqlIdent(table)} (${cols.join(', ')})`)
    return []
  }
  const widened: string[] = []
  for (const [column, type] of incoming) {
    const have = current.get(column)
    if (have === undefined) {
      await db.exec(
        `ALTER TABLE ${sqlIdent(table)} ADD COLUMN ${sqlIdent(column)} ${storable(type)}`
      )
    } else if (have !== type && storable(type) === type) {
      // An all-NULL column ("NULL" type) fits any column; anything else may need a wider one.
      const wider = widerType(have, type)
      if (wider === have) continue
      await db.exec(`ALTER TABLE ${sqlIdent(table)} ALTER ${sqlIdent(column)} TYPE ${wider}`)
      widened.push(`${column} ${have} → ${wider}`)
    }
  }
  return widened
}

export interface Replaced {
  rows: number
  /** Columns whose type was widened to fit this load. */
  widened: string[]
}

/**
 * Replaces one season's rows of `table` (every row when `season` is null) with the rows of
 * `select`, in one transaction: a failed load keeps the old rows. Columns are matched by name.
 */
export async function replaceRows(
  db: StatsDb,
  table: string,
  season: number | null,
  select: string
): Promise<Replaced> {
  const widened = await evolveTable(db, table, await describe(db, select))
  const scope = season === null ? '' : ` WHERE season = ${season}`
  await db.transaction(async () => {
    await db.exec(`DELETE FROM ${sqlIdent(table)}${scope}`)
    await db.exec(`INSERT INTO ${sqlIdent(table)} BY NAME ${select}`)
  })
  const counted = await db.get<{ n: number }>(
    `SELECT count(*) AS n FROM ${sqlIdent(table)}${scope}`
  )
  return { rows: counted?.n ?? 0, widened }
}
