import type { Db } from '../connection'

/** A `data_json` value: what a source published, as numbers and text (arrays / objects for grouped entries). */
export type WhValue = number | string | WhValue[] | { [key: string]: WhValue }
export type WhData = Record<string, WhValue>
export type WhSeasonType = 'REG' | 'POST'
export type WhKeyType = 'gsis' | 'pfr' | 'espn' | 'sleeper' | 'cfb'

export interface WhPlayerWeek {
  source: string
  season: number
  seasonType: WhSeasonType
  /** 0 = a season-level row the source publishes itself. */
  week: number
  /** The source's own player id. */
  playerKey: string
  keyType: WhKeyType
  team: string | null
  opponent: string | null
  data: WhData
}

export interface WhTeamWeek {
  source: string
  season: number
  seasonType: WhSeasonType
  week: number
  /** nflverse team code. */
  team: string
  opponent: string | null
  data: WhData
}

export interface WhGame {
  gameId: string
  season: number
  week: number
  data: WhData
}

export interface WhPlayer {
  source: string
  playerKey: string
  keyType: WhKeyType
  data: WhData
}

/** What was last fetched for a source and season (season 0 = an all-seasons file). */
export interface WhSourceState {
  source: string
  season: number
  version: number
  rows: number
  fetchedAt: string
  sealed: boolean
}

interface PlayerWeekDbRow {
  source: string
  season: number
  season_type: WhSeasonType
  week: number
  player_key: string
  key_type: WhKeyType
  team: string | null
  opponent: string | null
  data_json: string
}

interface TeamWeekDbRow {
  source: string
  season: number
  season_type: WhSeasonType
  week: number
  team: string
  opponent: string | null
  data_json: string
}

interface StateDbRow {
  source: string
  season: number
  version: number
  rows: number
  fetched_at: string
  sealed: number
}

const parse = (json: string): WhData => JSON.parse(json) as WhData

function deleteSeasons(
  db: Db,
  table: 'wh_player_week' | 'wh_team_week',
  source: string,
  seasons: number[]
): void {
  const del = db.prepare(`DELETE FROM ${table} WHERE source = ? AND season = ?`)
  for (const season of seasons) del.run(source, season)
}

/** Replaces every row of `source` in `seasons` with `rows` (which belong to `source`). Wrap in `withTransaction`. */
export function replaceWhPlayerWeeks(
  db: Db,
  source: string,
  seasons: number[],
  rows: WhPlayerWeek[],
  updatedAt: string
): number {
  deleteSeasons(db, 'wh_player_week', source, seasons)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO wh_player_week
       (source, season, season_type, week, player_key, key_type, team, opponent, data_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const r of rows) {
    insert.run(
      source,
      r.season,
      r.seasonType,
      r.week,
      r.playerKey,
      r.keyType,
      r.team,
      r.opponent,
      JSON.stringify(r.data),
      updatedAt
    )
  }
  return rows.length
}

export function replaceWhTeamWeeks(
  db: Db,
  source: string,
  seasons: number[],
  rows: WhTeamWeek[],
  updatedAt: string
): number {
  deleteSeasons(db, 'wh_team_week', source, seasons)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO wh_team_week
       (source, season, season_type, week, team, opponent, data_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const r of rows) {
    insert.run(
      source,
      r.season,
      r.seasonType,
      r.week,
      r.team,
      r.opponent,
      JSON.stringify(r.data),
      updatedAt
    )
  }
  return rows.length
}

export function replaceWhGames(
  db: Db,
  seasons: number[],
  rows: WhGame[],
  updatedAt: string
): number {
  const del = db.prepare('DELETE FROM wh_game WHERE season = ?')
  for (const season of seasons) del.run(season)
  const insert = db.prepare(
    'INSERT OR REPLACE INTO wh_game (game_id, season, week, data_json, updated_at) VALUES (?, ?, ?, ?, ?)'
  )
  for (const g of rows) insert.run(g.gameId, g.season, g.week, JSON.stringify(g.data), updatedAt)
  return rows.length
}

/** Replaces every profile of `source`. */
export function replaceWhPlayers(
  db: Db,
  source: string,
  rows: WhPlayer[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM wh_player WHERE source = ?').run(source)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO wh_player (source, player_key, key_type, data_json, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  )
  for (const r of rows)
    insert.run(source, r.playerKey, r.keyType, JSON.stringify(r.data), updatedAt)
  return rows.length
}

/**
 * Keeps each player's newest profile: a row replaces the stored one only when its `data.as_of`
 * (season × 100 + week) is not older, so refreshing an earlier season never overwrites a later bio.
 */
export function upsertWhPlayersLatest(
  db: Db,
  source: string,
  rows: WhPlayer[],
  updatedAt: string
): number {
  const upsert = db.prepare(
    `INSERT INTO wh_player (source, player_key, key_type, data_json, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(source, player_key) DO UPDATE SET key_type = excluded.key_type,
       data_json = excluded.data_json, updated_at = excluded.updated_at
     WHERE COALESCE(json_extract(excluded.data_json, '$.as_of'), 0)
        >= COALESCE(json_extract(wh_player.data_json, '$.as_of'), 0)`
  )
  for (const r of rows)
    upsert.run(source, r.playerKey, r.keyType, JSON.stringify(r.data), updatedAt)
  return rows.length
}

export function listWhPlayerWeeks(db: Db, source: string, season: number): WhPlayerWeek[] {
  const rows = db
    .prepare(
      `SELECT source, season, season_type, week, player_key, key_type, team, opponent, data_json
       FROM wh_player_week WHERE source = ? AND season = ? ORDER BY season_type, week, player_key`
    )
    .all(source, season) as unknown as PlayerWeekDbRow[]
  return rows.map((r) => ({
    source: r.source,
    season: r.season,
    seasonType: r.season_type,
    week: r.week,
    playerKey: r.player_key,
    keyType: r.key_type,
    team: r.team,
    opponent: r.opponent,
    data: parse(r.data_json)
  }))
}

export function listWhTeamWeeks(db: Db, source: string, season: number): WhTeamWeek[] {
  const rows = db
    .prepare(
      `SELECT source, season, season_type, week, team, opponent, data_json
       FROM wh_team_week WHERE source = ? AND season = ? ORDER BY season_type, week, team`
    )
    .all(source, season) as unknown as TeamWeekDbRow[]
  return rows.map((r) => ({
    source: r.source,
    season: r.season,
    seasonType: r.season_type,
    week: r.week,
    team: r.team,
    opponent: r.opponent,
    data: parse(r.data_json)
  }))
}

export function listWhGames(db: Db, season: number): WhGame[] {
  const rows = db
    .prepare(
      'SELECT game_id, season, week, data_json FROM wh_game WHERE season = ? ORDER BY week, game_id'
    )
    .all(season) as unknown as {
    game_id: string
    season: number
    week: number
    data_json: string
  }[]
  return rows.map((r) => ({
    gameId: r.game_id,
    season: r.season,
    week: r.week,
    data: parse(r.data_json)
  }))
}

export function listWhPlayers(db: Db, source: string): WhPlayer[] {
  const rows = db
    .prepare(
      'SELECT source, player_key, key_type, data_json FROM wh_player WHERE source = ? ORDER BY player_key'
    )
    .all(source) as unknown as {
    source: string
    player_key: string
    key_type: WhKeyType
    data_json: string
  }[]
  return rows.map((r) => ({
    source: r.source,
    playerKey: r.player_key,
    keyType: r.key_type,
    data: parse(r.data_json)
  }))
}

export function getWhSourceState(db: Db, source: string, season: number): WhSourceState | null {
  const row = db
    .prepare(
      'SELECT source, season, version, rows, fetched_at, sealed FROM wh_source_state WHERE source = ? AND season = ?'
    )
    .get(source, season) as StateDbRow | undefined
  if (!row) return null
  return {
    source: row.source,
    season: row.season,
    version: row.version,
    rows: row.rows,
    fetchedAt: row.fetched_at,
    sealed: row.sealed === 1
  }
}

export function setWhSourceState(db: Db, state: WhSourceState): void {
  db.prepare(
    `INSERT INTO wh_source_state (source, season, version, rows, fetched_at, sealed) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(source, season) DO UPDATE SET version = excluded.version, rows = excluded.rows,
       fetched_at = excluded.fetched_at, sealed = excluded.sealed`
  ).run(
    state.source,
    state.season,
    state.version,
    state.rows,
    state.fetchedAt,
    state.sealed ? 1 : 0
  )
}
