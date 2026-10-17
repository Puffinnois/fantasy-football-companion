import { GROUP_PROBE, type PlayGroup } from './plays'

/**
 * A derived table's select, built for the sources and seasons at hand. `temps` are created first,
 * in order, as temporary tables the select reads: one source at a time keeps memory bounded.
 */
export interface Built {
  temps?: [string, string][]
  sql: string
}

/**
 * What the database holds when a rebuild starts. Sources load independently, and a source can drop
 * a column: what is missing reads as NULL instead of failing the rebuild.
 */
export interface Have {
  /** Tables and views. */
  tables: Set<string>
  /** Each table's (and view's) columns. */
  columns: Map<string, Set<string>>
}

export const columnsOf = (have: Have, table: string): Set<string> =>
  have.columns.get(table) ?? new Set()

/** Whether `plays` has a group's columns (FTN, participation). */
export function groupAvailable(have: Have, group: PlayGroup): boolean {
  const probe = GROUP_PROBE[group]
  return probe === null || columnsOf(have, 'plays').has(probe)
}

/**
 * `sum(a * b) AS name` for each component, a product of `table`'s columns (with `alias.` when
 * given); NULL when the table lacks one of them.
 */
export function sums(
  have: Have,
  table: string,
  defs: Record<string, string>,
  alias?: string
): string {
  const cols = columnsOf(have, table)
  return Object.entries(defs)
    .map(([name, expr]) => {
      const parts = expr.split(' * ')
      const sql = parts.every((c) => cols.has(c))
        ? `sum(${parts.map((c) => (alias ? `${alias}.${c}` : c)).join(' * ')})`
        : 'NULL::DOUBLE'
      return `${sql} AS ${name}`
    })
    .join(', ')
}

/** Every table a select needs is loaded. */
export const hasAll = (have: Have, tables: string[]): boolean =>
  tables.every((t) => have.tables.has(t))

/** Regular-season weeks: 17 through 2020, 18 since. */
export const REG_WEEKS = (season: string): string =>
  `(CASE WHEN ${season} <= 2020 THEN 17 ELSE 18 END)`

/**
 * A postseason week in nflverse's numbering (the reference's "Postseason weeks differ by source"):
 * NGS skips the Pro Bowl week; ESPN's QBR and Sleeper number playoff weeks 1–4.
 */
export function postWeek(
  season: string,
  seasonType: string,
  week: string,
  source: 'ngs' | 'qbr' | 'sleeper'
): string {
  const post =
    source === 'ngs'
      ? `CASE WHEN ${week} > ${REG_WEEKS(season)} + 3 THEN ${week} - 1 ELSE ${week} END`
      : `${REG_WEEKS(season)} + ${week}`
  return `(CASE WHEN ${seasonType} = 'POST' THEN ${post} ELSE ${week} END)::INTEGER`
}
