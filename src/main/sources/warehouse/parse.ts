import type {
  WhData,
  WhGame,
  WhKeyType,
  WhPlayerWeek,
  WhSeasonType,
  WhTeamWeek
} from '@main/db/repos/warehouse'
import { numOrNull, parseCsv, strOrNull } from '../csv'

export interface Parsed<T> {
  rows: T[]
  /** Rows missing a key field (id, season or week), reported in the step message. */
  skipped: number
}

/** Spec §3 data rules: '' / 'NA' are missing; `*_id` columns stay text; numeric text becomes a number. */
export function cellValue(column: string, raw: string): number | string | null {
  if (raw === '' || raw === 'NA') return null
  if (column.endsWith('_id')) return raw
  const n = Number(raw)
  return raw.trim() !== '' && Number.isFinite(n) ? n : raw
}

/**
 * A CSV row's columns by the rules of `cellValue`, without zeros and without the `omit` columns
 * (those the row already stores in its own fields) — spec §10.
 */
export function rowData(
  row: Record<string, string>,
  omit: ReadonlySet<string> = new Set()
): WhData {
  const data: WhData = {}
  for (const [column, raw] of Object.entries(row)) {
    if (omit.has(column)) continue
    const value = cellValue(column, raw)
    if (value !== null && value !== 0) data[column] = value
  }
  return data
}

const SEASON_TYPES: Record<string, WhSeasonType> = {
  REG: 'REG',
  Regular: 'REG',
  POST: 'POST',
  WC: 'POST',
  DIV: 'POST',
  CON: 'POST',
  SB: 'POST',
  SBBYE: 'POST',
  Playoffs: 'POST'
}

/** nflverse / ESPN season-type spellings → REG / POST; null (row left out) for preseason or unknown. */
export function seasonTypeOf(raw: string | undefined): WhSeasonType | null {
  return raw === undefined ? null : (SEASON_TYPES[raw] ?? null)
}

/** Regular-season weeks: 17 through 2020, 18 since. */
export function regularWeeks(season: number): number {
  return season <= 2020 ? 17 : 18
}

/** For files without a season-type column: weeks past the regular season are POST. */
export function seasonTypeOfWeek(season: number, week: number): WhSeasonType {
  return week > regularWeeks(season) ? 'POST' : 'REG'
}

/** Column names of a CSV's header line. */
export function headerOf(text: string): string[] {
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0
  const end = text.indexOf('\n')
  return text
    .slice(start, end === -1 ? undefined : end)
    .replace(/\r$/, '')
    .split(',')
    .map((c) => c.replace(/^"|"$/g, ''))
}

/** Spec §4.3: a missing key column fails the step, naming the column (new columns are fine). */
export function requireColumns(text: string, source: string, columns: string[]): void {
  const header = new Set(headerOf(text))
  for (const column of columns) {
    if (!header.has(column)) throw new Error(`${source}: column "${column}" is missing`)
  }
}

interface DimSpec {
  season: string
  /** null: the file holds season-level rows only (week 0). */
  week: string | null
  /** null: derived from the week number. */
  seasonType: string | null
}

interface Dims {
  season: number
  week: number
  seasonType: WhSeasonType
}

function dimColumns(spec: DimSpec): string[] {
  return [spec.season, spec.week, spec.seasonType].filter((c): c is string => c !== null)
}

/** The columns a row stores in its own fields, so `data_json` leaves them out (spec §10). */
function keyColumns(spec: DimSpec, ...others: (string | undefined)[]): ReadonlySet<string> {
  return new Set([...dimColumns(spec), ...others.filter((c): c is string => c !== undefined)])
}

/** null: left out on purpose (before `minSeason`, preseason); 'skip': unparseable, counted. */
function dimsOf(
  row: Record<string, string>,
  spec: DimSpec,
  minSeason: number
): Dims | null | 'skip' {
  const season = numOrNull(row[spec.season])
  if (season === null) return 'skip'
  if (season < minSeason) return null
  const week = spec.week === null ? 0 : numOrNull(row[spec.week])
  if (week === null) return 'skip'
  const seasonType =
    spec.seasonType === null ? seasonTypeOfWeek(season, week) : seasonTypeOf(row[spec.seasonType])
  if (seasonType === null) return null
  return { season, week, seasonType }
}

function teamOf(
  row: Record<string, string>,
  column: string | undefined,
  codes: Record<string, string> | undefined
): string | null {
  const raw = column === undefined ? null : strOrNull(row[column])
  return raw === null ? null : (codes?.[raw] ?? raw)
}

export interface PlayerCsvSpec extends DimSpec {
  source: string
  /** Id columns in preference order, with the key type each gives; the first one must exist. */
  ids: { column: string; keyType: WhKeyType }[]
  team?: string
  opponent?: string
  /** Source team codes that differ from nflverse's. */
  teamCodes?: Record<string, string>
}

export function parsePlayerCsv(
  text: string,
  spec: PlayerCsvSpec,
  minSeason: number
): Parsed<WhPlayerWeek> {
  requireColumns(text, spec.source, [spec.ids[0].column, ...dimColumns(spec)])
  const omit = keyColumns(spec, ...spec.ids.map((i) => i.column), spec.team, spec.opponent)
  const rows: WhPlayerWeek[] = []
  let skipped = 0
  for (const row of parseCsv(text)) {
    const dims = dimsOf(row, spec, minSeason)
    if (dims === null) continue
    const id = spec.ids.find((i) => strOrNull(row[i.column]) !== null)
    if (dims === 'skip' || !id) {
      skipped++
      continue
    }
    rows.push({
      source: spec.source,
      ...dims,
      playerKey: row[id.column],
      keyType: id.keyType,
      team: teamOf(row, spec.team, spec.teamCodes),
      opponent: teamOf(row, spec.opponent, spec.teamCodes),
      data: rowData(row, omit)
    })
  }
  return { rows, skipped }
}

export interface TeamCsvSpec extends DimSpec {
  source: string
  team: string
  opponent?: string
  teamCodes?: Record<string, string>
}

export function parseTeamCsv(
  text: string,
  spec: TeamCsvSpec,
  minSeason: number
): Parsed<WhTeamWeek> {
  requireColumns(text, spec.source, [spec.team, ...dimColumns(spec)])
  const omit = keyColumns(spec, spec.team, spec.opponent)
  const rows: WhTeamWeek[] = []
  let skipped = 0
  for (const row of parseCsv(text)) {
    const dims = dimsOf(row, spec, minSeason)
    if (dims === null) continue
    const team = teamOf(row, spec.team, spec.teamCodes)
    if (dims === 'skip' || team === null) {
      skipped++
      continue
    }
    rows.push({
      source: spec.source,
      ...dims,
      team,
      opponent: teamOf(row, spec.opponent, spec.teamCodes),
      data: rowData(row, omit)
    })
  }
  return { rows, skipped }
}

const GAME_KEY_COLUMNS: ReadonlySet<string> = new Set(['game_id', 'season', 'week'])

/** nflverse `schedules/games.csv`: one row per game, every column kept. */
export function parseGamesCsv(text: string, minSeason: number): Parsed<WhGame> {
  requireColumns(text, 'schedules', ['game_id', 'season', 'week'])
  const rows: WhGame[] = []
  let skipped = 0
  for (const row of parseCsv(text)) {
    const season = numOrNull(row.season)
    if (season !== null && season < minSeason) continue
    const gameId = strOrNull(row.game_id)
    const week = numOrNull(row.week)
    if (gameId === null || season === null || week === null) {
      skipped++
      continue
    }
    rows.push({ gameId, season, week, data: rowData(row, GAME_KEY_COLUMNS) })
  }
  return { rows, skipped }
}
