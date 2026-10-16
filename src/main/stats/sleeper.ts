import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { sqlIdent, sqlString } from './db'
import type { Downloads } from './download'
import { STATS_FIRST_SEASON, regularWeeks } from './sources'

export const SLEEPER_STATS_URL = 'https://api.sleeper.com/stats/nfl'
const POST_WEEKS = 4

export interface SleeperWeek {
  seasonType: 'regular' | 'post'
  week: number
}

/** Where the Sleeper NFL state stands (`/state/nfl`). */
export interface StatsState {
  season: number
  week: number
  /** `pre` / `regular` / `post` / `off`. */
  seasonType: string
}

/** Every week of a past season; the current one through the state week (all of it in the postseason). */
export function sleeperWeeks(season: number, state: StatsState): SleeperWeek[] {
  const regular = (n: number): SleeperWeek[] =>
    Array.from({ length: n }, (_, i) => ({ seasonType: 'regular', week: i + 1 }))
  const post = Array.from({ length: POST_WEEKS }, (_, i): SleeperWeek => ({
    seasonType: 'post',
    week: i + 1
  }))
  if (season < state.season || state.seasonType === 'post') {
    return [...regular(regularWeeks(season)), ...post]
  }
  if (state.seasonType === 'regular') return regular(Math.min(state.week, regularWeeks(season)))
  return []
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

const STAT_KEY = /^[A-Za-z0-9_]+$/

/** One stats row as stored: the line's ids and context, and its numeric stats. */
interface SlimRow {
  player_id: string
  team: string | null
  opponent: string | null
  game_id: string | null
  season_type: 'REG' | 'POST'
  week: number
  stats: Record<string, number>
}

interface SlimPlayer {
  player_id: string
  first_name: string | null
  last_name: string | null
  position: string | null
  team: string | null
  week: number
}

/** A week's response reduced to what the tables keep; rows without an id are counted. */
export function slimWeek(
  rows: unknown,
  week: SleeperWeek
): { rows: SlimRow[]; players: SlimPlayer[]; skipped: number } {
  const out = { rows: [] as SlimRow[], players: [] as SlimPlayer[], skipped: 0 }
  if (!Array.isArray(rows)) throw new Error('Sleeper stats: expected a list')
  for (const row of rows) {
    const id = isRecord(row) ? text(row.player_id) : null
    if (!isRecord(row) || id === null) {
      out.skipped++
      continue
    }
    const stats: Record<string, number> = {}
    if (isRecord(row.stats)) {
      for (const [k, v] of Object.entries(row.stats)) {
        // Keys become column names inside SQL, so only plain identifiers are kept.
        if (STAT_KEY.test(k) && typeof v === 'number' && Number.isFinite(v)) stats[k] = v
      }
    }
    out.rows.push({
      player_id: id,
      team: text(row.team),
      opponent: text(row.opponent),
      game_id: text(row.game_id),
      season_type: week.seasonType === 'post' ? 'POST' : 'REG',
      week: week.week,
      stats
    })
    const p = isRecord(row.player) ? row.player : null
    if (p) {
      out.players.push({
        player_id: id,
        first_name: text(p.first_name),
        last_name: text(p.last_name),
        position: text(p.position),
        team: text(row.team),
        week: week.week
      })
    }
  }
  return out
}

/**
 * Sleeper's fantasy-defense ids are team codes ("LAR"). Its oldest player ids are 1–3 digits
 * ("96"), so a defense is told apart by letters, not by length.
 */
export const SLEEPER_DEF_ID = "regexp_full_match(player_id, '[A-Z]{2,3}')"
/** Team-offense rows are `TEAM_<code>`. */
const SLEEPER_TEAM_ID = "player_id LIKE 'TEAM\\_%' ESCAPE '\\'"
/** A Sleeper id that is a player: neither a defense nor a team-offense row. */
export const SLEEPER_PLAYER_ID = `NOT ${SLEEPER_DEF_ID} AND NOT ${SLEEPER_TEAM_ID}`

const KIND_FILTERS = {
  src_sleeper: SLEEPER_PLAYER_ID,
  src_sleeper_def: SLEEPER_DEF_ID,
  src_sleeper_team: SLEEPER_TEAM_ID
} as const

export interface SleeperLoad {
  rows: number
  skipped: number
}

/**
 * Stats-analysis spec §4.1: one season of Sleeper weekly lines into `src_sleeper` (players),
 * `src_sleeper_def` (fantasy defenses) and `src_sleeper_team` (team offense), every stat key as a
 * DOUBLE column, plus `src_sleeper_players` (each id's name and position that season, for identity).
 */
export async function loadSleeperSeason(
  season: number,
  state: StatsState,
  downloads: Downloads,
  tempDir: string,
  replace: (table: string, select: string) => Promise<number>
): Promise<SleeperLoad | null> {
  if (season < STATS_FIRST_SEASON) return null
  const weeks = sleeperWeeks(season, state)
  if (weeks.length === 0) return null
  const rows: SlimRow[] = []
  const players = new Map<string, SlimPlayer>()
  let skipped = 0
  for (const week of weeks) {
    const url = `${SLEEPER_STATS_URL}/${season}/${week.week}?season_type=${week.seasonType}`
    const body = await downloads.json(url)
    if (body === null) continue
    const slim = slimWeek(body, week)
    rows.push(...slim.rows)
    skipped += slim.skipped
    for (const p of slim.players) players.set(p.player_id, p)
  }
  if (rows.length === 0) return null
  mkdirSync(tempDir, { recursive: true })
  const linesPath = join(tempDir, `${randomUUID()}.json`)
  const playersPath = join(tempDir, `${randomUUID()}.json`)
  try {
    writeFileSync(linesPath, rows.map((r) => JSON.stringify(r)).join('\n'))
    writeFileSync(playersPath, [...players.values()].map((p) => JSON.stringify(p)).join('\n'))
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r.stats)))].sort()
    const struct =
      keys.length > 0 ? `STRUCT(${keys.map((k) => `${sqlIdent(k)} DOUBLE`).join(', ')})` : 'JSON'
    const lines = `read_json(${sqlString(linesPath)}, format = 'newline_delimited', columns = {
        player_id: 'VARCHAR', team: 'VARCHAR', opponent: 'VARCHAR', game_id: 'VARCHAR',
        season_type: 'VARCHAR', week: 'INTEGER', stats: '${struct}'})`
    const unpacked = keys.length > 0 ? ', stats.*' : ''
    let total = 0
    for (const [table, filter] of Object.entries(KIND_FILTERS)) {
      total += await replace(
        table,
        `SELECT ${season} AS season, season_type, week, player_id, nfl_team(team) AS team,
                nfl_team(opponent) AS opponent, game_id${unpacked}
         FROM ${lines} WHERE ${filter}`
      )
    }
    await replace(
      'src_sleeper_players',
      `SELECT ${season} AS season, player_id, first_name, last_name, position, nfl_team(team) AS team
       FROM read_json(${sqlString(playersPath)}, format = 'newline_delimited', columns = {
         player_id: 'VARCHAR', first_name: 'VARCHAR', last_name: 'VARCHAR', position: 'VARCHAR',
         team: 'VARCHAR', week: 'INTEGER'})`
    )
    return { rows: total, skipped }
  } finally {
    rmSync(linesPath, { force: true })
    rmSync(playersPath, { force: true })
  }
}
