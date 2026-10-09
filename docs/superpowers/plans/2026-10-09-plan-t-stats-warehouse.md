# Plan T — Stats warehouse: tables and light sources

**Status:** not started.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every stat the free, keyless "light" sources publish for 2019 through the current season in new `wh_*` tables, synced in the background after each refresh, and ship `v0.20.0`.

**Architecture:** A migration adds five warehouse tables (`data_json` per row, keyed by source and the source's own id) and a durable `wh_source_state`. Each source is a small adapter: the warehouse HTTP client fetches, a pure parser returns rows, and a registry entry (`WarehouseStep`) ties them together. `refreshWarehouse` walks the registry oldest season first. It decides from `wh_source_state` and the last finished `sync_log` row whether a step is due, then writes each step in one transaction. The IPC refresh starts it after the core refresh settles, single-flight, without waiting for it. Nothing reads the warehouse yet.

**Tech Stack:** unchanged — Electron 39, TypeScript strict, `node:sqlite`, Vitest (node environment), `node:zlib`.

**Spec:** `docs/superpowers/specs/2026-10-09-stats-warehouse-design.md` (§2–§5, §7, §8 Plan T). Plans U and V (play-by-play, FTN, participation, spec §6) are separate.

## Global Constraints

- Branch `feat/stats-warehouse-t` off `main`. One Conventional Commit per "Commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- The working tree has unrelated changes that are not part of this plan: `.gitignore`, `.design-sync/`, `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts` and `tsconfig.web.tsbuildinfo`. Never stage them. Stage files by name; never run `git add -A` or `git add .`.
- Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`.**
- Storage only. The core tables (`player_week_stats`, `team_week_stats`, `player_week_snaps`, `games`), `recomputePoints`, values, signals and the UI do not change. No production code reads `wh_*` except the warehouse sync.
- Seasons run from `WAREHOUSE_FIRST_SEASON = 2019` through the Sleeper NFL state season. Without an NFL state the warehouse does nothing.
- Freshness (spec §4.2):
  - A step never runs within **24 h** of its last _finished_ attempt (`ok`, `skipped` or `error`). A `running` row left by a quit app does not count.
  - `force` bypasses that rule for the current season, the prior season and all-seasons steps only.
  - Otherwise a step is due when any of its sources has no state or an older version, when the season is the current one or an all-seasons file, when the prior season's `fetched_at` is ≥ 7 days old, or when an older season is not sealed.
  - A success for a season ≤ current − 2 seals it. Every adapter is version 1.
- `sync_log` names are `wh:<id>:<season>`, or `wh:<id>` for all-seasons files. `getLastError` ignores `wh:` rows. Warehouse steps neither invalidate caches nor send sync progress.
- `data_json` rules:
  - `''` and `'NA'` are dropped.
  - Columns named `*_id` stay text.
  - Numeric text becomes a number; anything else stays text.
- Team codes are nflverse codes. Sleeper codes go through `toNflverseTeam`; QBR maps `LAR` → `LA` and `WSH` → `WAS`.
- HTTP timeout is 30 s, with one retry on 429 / 5xx and 404 → `null`. Older nflverse seasons exist only as `.csv`: try `<name>.csv.gz`, then `<name>.csv`.
- No test touches the network. Only the throwaway live check in Task 10 does, and it is never committed.
- **Size gate (Task 10):** if the Plan T backfill alone makes the database larger than **300 MB**, stop and report before releasing. 300 MB is the spec's upper estimate for all three plans.
- Release `v0.20.0` (`npm version minor`). **Ask the user before pushing.**
- Not GUI-verifiable here (WSLg). Say so in the Status block rather than claiming a click-through.

## Review Focus

These are the most likely ways for this to bite a user that the spec's own test list does not pin down. Each has its test in the owning task.

1. **The app quits mid-step.** A `running` `sync_log` row must not block the step's retry for 24 h → Task 8, "a step left running by a quit app does not block the retry".
2. **The Refresh button always sends `force = true`.** Back-to-back forced refreshes re-run only the current season and all-seasons steps, never a prior season fetched < 7 days ago or a sealed season → Task 8, "a forced refresh re-runs the current season only".
3. **Preseason or offseason Sleeper state (`pre` / `off`).** The current season's Sleeper step skips with "has not started"; past seasons still run → Task 7, `sleeperWeeks` and "skips a current season that has not started".
4. **Sleeper answers with HTML or an error object.** A readable step error, not a crash, and the other steps continue → Task 3, "rejects a Sleeper answer that is not a list, or not JSON"; Task 8, "a failing step is logged … and the others continue".
5. **A current-season file published with only its header.** The step succeeds with 0 rows and touches no other season → Task 4, "accepts a header-only file".

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/stats-warehouse-t
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/stats-warehouse-t`.

---

### Task 1: Warehouse tables, repo, and the status-bar filter (spec §3, §4.3)

**Files:**

- Create: `src/main/db/migrations/010_warehouse.sql`
- Modify: `src/main/db/migrations/index.ts`
- Create: `src/main/db/repos/warehouse.ts`
- Modify: `src/main/db/repos/syncLog.ts` (`WAREHOUSE_LOG_PREFIX`, `getLastError`, `getLastFinishedSync`)
- Test: `tests/main/db/migrate.test.ts`, `tests/main/db/warehouseRepo.test.ts`, `tests/main/db/repos.test.ts`

**Interfaces:**

- Produces (`src/main/db/repos/warehouse.ts`): types `WhValue`, `WhData`, `WhSeasonType`, `WhKeyType`, `WhPlayerWeek`, `WhTeamWeek`, `WhGame`, `WhPlayer`, `WhSourceState`; functions `replaceWhPlayerWeeks(db, source, seasons, rows, updatedAt): number`, `replaceWhTeamWeeks(db, source, seasons, rows, updatedAt): number`, `replaceWhGames(db, seasons, rows, updatedAt): number`, `replaceWhPlayers(db, source, rows, updatedAt): number`, `upsertWhPlayersLatest(db, source, rows, updatedAt): number`, `listWhPlayerWeeks(db, source, season)`, `listWhTeamWeeks(db, source, season)`, `listWhGames(db, season)`, `listWhPlayers(db, source)`, `getWhSourceState(db, source, season)`, `setWhSourceState(db, state)`.
- Produces (`syncLog.ts`): `WAREHOUSE_LOG_PREFIX = 'wh:'`, `getLastFinishedSync(db, source): SyncLogEntry | null`.

- [ ] **Step 1: Write the failing tests**

In `tests/main/db/migrate.test.ts`:

- Change the three `toBe(9)` assertions (the version, the `schema_version` count, and `expect(migrate(db)).toBe(9)`) to `toBe(10)`.
- Add these to the `arrayContaining` list: `'wh_player_week'`, `'wh_team_week'`, `'wh_game'`, `'wh_player'`, `'wh_source_state'`.

In `tests/main/db/repos.test.ts`:

- Add `getLastFinishedSync` to the `@main/db/repos/syncLog` import.
- Add after the `'sync log start/finish/last/error'` test:

```ts
it('getLastError ignores warehouse steps; getLastFinishedSync ignores running rows', () => {
  const a = startSync(db, 'sleeper:league', T)
  finishSync(db, a, 'error', T, 'core', 0)
  const b = startSync(db, 'wh:sleeper:2025', T)
  finishSync(db, b, 'error', T, 'warehouse', 0)
  expect(getLastError(db)).toMatchObject({ id: a, message: 'core' })
  startSync(db, 'wh:sleeper:2025', '2099-01-01T00:00:00.000Z')
  expect(getLastFinishedSync(db, 'wh:sleeper:2025')).toMatchObject({ id: b, status: 'error' })
  expect(getLastFinishedSync(db, 'wh:nothing')).toBeNull()
})
```

Create `tests/main/db/warehouseRepo.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import {
  getWhSourceState,
  listWhGames,
  listWhPlayers,
  listWhPlayerWeeks,
  listWhTeamWeeks,
  replaceWhGames,
  replaceWhPlayers,
  replaceWhPlayerWeeks,
  replaceWhTeamWeeks,
  setWhSourceState,
  upsertWhPlayersLatest,
  type WhData,
  type WhPlayer,
  type WhPlayerWeek,
  type WhTeamWeek
} from '@main/db/repos/warehouse'

const T = '2026-10-09T12:00:00.000Z'

function pw(source: string, season: number, week: number, data: WhData = {}): WhPlayerWeek {
  return {
    source,
    season,
    seasonType: 'REG',
    week,
    playerKey: '00-0034844',
    keyType: 'gsis',
    team: 'PHI',
    opponent: 'DAL',
    data
  }
}

function tw(source: string, season: number, team: string): WhTeamWeek {
  return { source, season, seasonType: 'REG', week: 1, team, opponent: null, data: { plays: 60 } }
}

function profile(source: string, playerKey: string, data: WhData): WhPlayer {
  return { source, playerKey, keyType: 'gsis', data }
}

describe('warehouse repo', () => {
  let db: Db

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('replaces player weeks of one source in the given seasons only', () => {
    replaceWhPlayerWeeks(db, 'a', [2024, 2025], [pw('a', 2024, 1), pw('a', 2025, 1)], T)
    replaceWhPlayerWeeks(db, 'b', [2025], [pw('b', 2025, 1)], T)
    const nested = { name: 'x', entries: [{ formation: 'Offense', rank: 1 }] }
    expect(replaceWhPlayerWeeks(db, 'a', [2025], [pw('a', 2025, 2, nested)], T)).toBe(1)
    expect(listWhPlayerWeeks(db, 'a', 2024)).toEqual([pw('a', 2024, 1)])
    expect(listWhPlayerWeeks(db, 'a', 2025)).toEqual([pw('a', 2025, 2, nested)])
    expect(listWhPlayerWeeks(db, 'b', 2025)).toHaveLength(1)
  })

  it('keeps the last row when a source repeats a key', () => {
    replaceWhPlayerWeeks(
      db,
      'a',
      [2025],
      [pw('a', 2025, 1, { n: 1 }), pw('a', 2025, 1, { n: 2 })],
      T
    )
    expect(listWhPlayerWeeks(db, 'a', 2025)).toEqual([pw('a', 2025, 1, { n: 2 })])
  })

  it('replaces team weeks of one source in the given seasons only', () => {
    replaceWhTeamWeeks(db, 'a', [2024], [tw('a', 2024, 'KC')], T)
    replaceWhTeamWeeks(db, 'a', [2025], [tw('a', 2025, 'PHI'), tw('a', 2025, 'DAL')], T)
    replaceWhTeamWeeks(db, 'a', [2025], [tw('a', 2025, 'LA')], T)
    expect(listWhTeamWeeks(db, 'a', 2025)).toEqual([tw('a', 2025, 'LA')])
    expect(listWhTeamWeeks(db, 'a', 2024)).toHaveLength(1)
  })

  it('replaces games of the given seasons', () => {
    replaceWhGames(
      db,
      [2024, 2025],
      [
        { gameId: 'g24', season: 2024, week: 1, data: { roof: 'dome' } },
        { gameId: 'g25', season: 2025, week: 1, data: {} }
      ],
      T
    )
    replaceWhGames(
      db,
      [2025],
      [{ gameId: 'g25b', season: 2025, week: 2, data: { spread_line: 3.5 } }],
      T
    )
    expect(listWhGames(db, 2024).map((g) => g.gameId)).toEqual(['g24'])
    expect(listWhGames(db, 2025)).toEqual([
      { gameId: 'g25b', season: 2025, week: 2, data: { spread_line: 3.5 } }
    ])
  })

  it('replaces every profile of a source', () => {
    replaceWhPlayers(db, 'combine', [profile('combine', 'A', { forty: 4.4 })], T)
    replaceWhPlayers(db, 'combine', [profile('combine', 'B', { forty: 4.5 })], T)
    expect(listWhPlayers(db, 'combine')).toEqual([profile('combine', 'B', { forty: 4.5 })])
  })

  it('keeps the newest roster profile (by data.as_of)', () => {
    upsertWhPlayersLatest(
      db,
      'rosters',
      [profile('rosters', 'P', { as_of: 202602, weight: 233 })],
      T
    )
    upsertWhPlayersLatest(
      db,
      'rosters',
      [profile('rosters', 'P', { as_of: 202518, weight: 230 })],
      T
    )
    expect(listWhPlayers(db, 'rosters')[0].data.weight).toBe(233)
    upsertWhPlayersLatest(
      db,
      'rosters',
      [profile('rosters', 'P', { as_of: 202603, weight: 235 })],
      T
    )
    expect(listWhPlayers(db, 'rosters')[0].data.weight).toBe(235)
  })

  it('round-trips source state', () => {
    expect(getWhSourceState(db, 'a', 2024)).toBeNull()
    setWhSourceState(db, {
      source: 'a',
      season: 2024,
      version: 1,
      rows: 5,
      fetchedAt: T,
      sealed: false
    })
    setWhSourceState(db, {
      source: 'a',
      season: 2024,
      version: 2,
      rows: 6,
      fetchedAt: T,
      sealed: true
    })
    expect(getWhSourceState(db, 'a', 2024)).toEqual({
      source: 'a',
      season: 2024,
      version: 2,
      rows: 6,
      fetchedAt: T,
      sealed: true
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/db/migrate.test.ts tests/main/db/warehouseRepo.test.ts tests/main/db/repos.test.ts`
Expected: FAIL. The version is 9, `@main/db/repos/warehouse` cannot be resolved, and `getLastFinishedSync` is not a function.

- [ ] **Step 3: Write the migration**

Create `src/main/db/migrations/010_warehouse.sql`:

```sql
-- Stats warehouse (spec 2026-10-09 §3). Nothing in the app reads these tables yet.
-- One row per source × player × week. data_json: every column the source publishes for that row;
-- numbers as numbers, text as strings, arrays where a source lists several entries; empty / NA dropped.
CREATE TABLE wh_player_week (
  source TEXT NOT NULL,
  season INTEGER NOT NULL,
  season_type TEXT NOT NULL CHECK (season_type IN ('REG', 'POST')),
  week INTEGER NOT NULL,              -- 0 = a season-level row the source publishes itself (NGS, QBR)
  player_key TEXT NOT NULL,           -- the source's own id
  key_type TEXT NOT NULL CHECK (key_type IN ('gsis', 'pfr', 'espn', 'sleeper', 'cfb')),
  team TEXT,
  opponent TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, season, season_type, week, player_key)
);
CREATE INDEX idx_wh_player_week_key ON wh_player_week(player_key, season);

CREATE TABLE wh_team_week (
  source TEXT NOT NULL,
  season INTEGER NOT NULL,
  season_type TEXT NOT NULL CHECK (season_type IN ('REG', 'POST')),
  week INTEGER NOT NULL,
  team TEXT NOT NULL,                 -- nflverse team code
  opponent TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, season, season_type, week, team)
);

-- The full schedules row (all 46 columns).
CREATE TABLE wh_game (
  game_id TEXT PRIMARY KEY,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_wh_game_season ON wh_game(season, week);

-- Season-independent profiles (combine, latest roster bio).
CREATE TABLE wh_player (
  source TEXT NOT NULL,
  player_key TEXT NOT NULL,
  key_type TEXT NOT NULL CHECK (key_type IN ('gsis', 'pfr', 'espn', 'sleeper', 'cfb')),
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, player_key)
);

-- Durable fetch record. sync_log is pruned after 30 days, so it cannot remember that 2019 is done.
-- season = 0 for sources published as one all-seasons file.
CREATE TABLE wh_source_state (
  source TEXT NOT NULL,
  season INTEGER NOT NULL,
  version INTEGER NOT NULL,           -- the adapter version that wrote the rows
  rows INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  sealed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source, season)
);
```

In `src/main/db/migrations/index.ts`, add `import warehouseSql from './010_warehouse.sql?raw'` after the `waiversSql` import, and append `{ version: 10, name: 'warehouse', sql: warehouseSql }` to `migrations`.

- [ ] **Step 4: Write the repo**

Create `src/main/db/repos/warehouse.ts`:

```ts
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
```

- [ ] **Step 5: Filter the status bar and add `getLastFinishedSync`**

In `src/main/db/repos/syncLog.ts`, add above `getLastError`:

```ts
/** Prefix of every stats-warehouse step in sync_log; their failures stay out of the status bar (spec §4.3). */
export const WAREHOUSE_LOG_PREFIX = 'wh:'
```

Replace the body of `getLastError` with:

```ts
const row = db
  .prepare(
    "SELECT * FROM sync_log WHERE status = 'error' AND source NOT LIKE ? ORDER BY id DESC LIMIT 1"
  )
  .get(`${WAREHOUSE_LOG_PREFIX}%`) as Row | undefined
return row ? toEntry(row) : null
```

Add after `getLastSync`:

```ts
/** Latest finished entry (any status) for `source`; a `running` row left by a quit app does not count. */
export function getLastFinishedSync(db: Db, source: string): SyncLogEntry | null {
  const row = db
    .prepare(
      'SELECT * FROM sync_log WHERE source = ? AND finished_at IS NOT NULL ORDER BY id DESC LIMIT 1'
    )
    .get(source) as Row | undefined
  return row ? toEntry(row) : null
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/main/db tests/main/sync/sleeperSync.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/main/db/migrations/index.ts src/main/db/repos/warehouse.ts src/main/db/repos/syncLog.ts tests/main/db/migrate.test.ts tests/main/db/warehouseRepo.test.ts tests/main/db/repos.test.ts
git add src/main/db/migrations/010_warehouse.sql src/main/db/migrations/index.ts src/main/db/repos/warehouse.ts src/main/db/repos/syncLog.ts tests/main/db/migrate.test.ts tests/main/db/warehouseRepo.test.ts tests/main/db/repos.test.ts
git commit -m "feat(db): add stats warehouse tables"
```

---

### Task 2: Sync plumbing — `runStep` without a Sleeper client, background helpers (spec §4.1)

**Files:**

- Modify: `src/main/sync/step.ts` (`StepDeps`)
- Create: `src/main/sync/background.ts`
- Test: `tests/main/sync/step.test.ts`, `tests/main/sync/background.test.ts`

**Interfaces:**

- Produces: `type StepDeps = Pick<SyncDeps, 'db' | 'now' | 'onStep'>`; `nowOf(deps: StepDeps)`; `runStep(deps: StepDeps, …)` (same signature otherwise).
- Produces: `singleFlight<A extends unknown[], T>(fn: (...args: A) => Promise<T>): (...args: A) => Promise<T>`; `thenInBackground<T>(first: Promise<T>, next: () => Promise<unknown>, onError: (err: unknown) => void): Promise<T>`.

- [ ] **Step 1: Write the failing tests**

In `tests/main/sync/step.test.ts`, add inside `describe('runStep', …)`:

```ts
it('runs with only a database (the warehouse sync has no Sleeper client)', async () => {
  const entry = await runStep({ db, now: () => clock }, 'wh:x', 0, true, async () => 1)
  expect(entry).toMatchObject({ source: 'wh:x', status: 'ok', rowsWritten: 1 })
})
```

Create `tests/main/sync/background.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { singleFlight, thenInBackground } from '@main/sync/background'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('singleFlight', () => {
  it('returns the running call instead of starting another, then runs again once it settles', async () => {
    const first = deferred<number>()
    const fn = vi.fn((): Promise<number> => first.promise)
    const run = singleFlight(fn)
    const a = run()
    const b = run()
    expect(b).toBe(a)
    expect(fn).toHaveBeenCalledTimes(1)
    first.resolve(1)
    expect(await a).toBe(1)
    fn.mockImplementation(async () => 2)
    expect(await run()).toBe(2)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('clears the flight after a rejection', async () => {
    const fn = vi
      .fn((): Promise<number> => Promise.resolve(3))
      .mockImplementationOnce(() => Promise.reject(new Error('boom')))
    const run = singleFlight(fn)
    await expect(run()).rejects.toThrow('boom')
    expect(await run()).toBe(3)
  })
})

describe('thenInBackground', () => {
  it('settles with the first promise without waiting for the next run', async () => {
    const next = deferred<void>()
    const start = vi.fn((): Promise<void> => next.promise)
    expect(await thenInBackground(Promise.resolve('core'), start, () => {})).toBe('core')
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('starts the next run after a failure too; the caller still sees the failure', async () => {
    const start = vi.fn(async (): Promise<void> => {})
    await expect(
      thenInBackground(Promise.reject(new Error('core failed')), start, () => {})
    ).rejects.toThrow('core failed')
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('reports a failing or throwing next run to onError only', async () => {
    const onError = vi.fn()
    await thenInBackground(
      Promise.resolve(1),
      () => Promise.reject(new Error('wh failed')),
      onError
    )
    await thenInBackground(
      Promise.resolve(2),
      () => {
        throw new Error('wh threw')
      },
      onError
    )
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2))
    expect(onError.mock.calls.map(([e]) => (e as Error).message).sort()).toEqual([
      'wh failed',
      'wh threw'
    ])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/sync/background.test.ts && npm run typecheck:node`
Expected: FAIL. `@main/sync/background` cannot be resolved, and typecheck reports that `sleeper` is missing in `step.test.ts`.

- [ ] **Step 3: Narrow the step deps**

In `src/main/sync/step.ts`, add after `RefreshOptions`:

```ts
/** What `runStep` needs; the warehouse sync has no Sleeper client. */
export type StepDeps = Pick<SyncDeps, 'db' | 'now' | 'onStep'>
```

Change `export function nowOf(deps: SyncDeps): Date` to `export function nowOf(deps: StepDeps): Date`. In `runStep`, change the first parameter from `deps: SyncDeps` to `deps: StepDeps`.

- [ ] **Step 4: Write the helpers**

Create `src/main/sync/background.ts`:

```ts
/** One run at a time: calling while a run is in flight returns that run instead of starting another. */
export function singleFlight<A extends unknown[], T>(
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<T> {
  let inFlight: Promise<T> | null = null
  return (...args) => {
    if (!inFlight) {
      inFlight = fn(...args).finally(() => {
        inFlight = null
      })
    }
    return inFlight
  }
}

/**
 * Returns `first` unchanged and, once it settles either way, starts `next` without anyone awaiting it
 * (stats-warehouse spec §4.1: the Refresh result does not wait for the warehouse). `next` failures go to
 * `onError`; they never reach `first`'s caller.
 */
export function thenInBackground<T>(
  first: Promise<T>,
  next: () => Promise<unknown>,
  onError: (err: unknown) => void
): Promise<T> {
  const start = (): void => {
    try {
      next().catch(onError)
    } catch (err) {
      onError(err)
    }
  }
  first.then(start, start)
  return first
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/sync && npm run typecheck:node`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/main/sync/step.ts src/main/sync/background.ts tests/main/sync/step.test.ts tests/main/sync/background.test.ts
git add src/main/sync/step.ts src/main/sync/background.ts tests/main/sync/step.test.ts tests/main/sync/background.test.ts
git commit -m "feat(sync): add background run helpers"
```

---

### Task 3: Shared HTTP text fetch and the warehouse client (spec §4.3, §5)

**Files:**

- Create: `src/main/sources/http.ts`
- Modify: `src/main/sources/nflverse.ts` (use `fetchText`)
- Create: `src/main/sources/warehouse/client.ts`
- Test: `tests/main/sources/nflverse.test.ts` (unchanged, must stay green), `tests/main/sources/warehouseClient.test.ts`

**Interfaces:**

- Produces (`http.ts`): `interface FetchTextOptions { fetchImpl: typeof fetch; timeoutMs: number; retryDelayMs: number }`; `fetchText(url, options, httpError: (status: number, url: string) => Error): Promise<string | null>`.
- Produces (`client.ts`): `type SleeperSeasonType = 'regular' | 'post'`; `interface WarehouseClient { nflverseCsv(tag: string, name: string): Promise<string | null>; text(url: string): Promise<string | null>; sleeperStats(season: number, week: number, seasonType: SleeperSeasonType): Promise<unknown[]> }`; `createWarehouseClient(options?)`; `WarehouseHttpError`; `SLEEPER_STATS_URL`.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/sources/warehouseClient.test.ts`:

```ts
import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { createWarehouseClient, WarehouseHttpError } from '@main/sources/warehouse/client'

const REL = 'https://rel'
const SL = 'https://sl'

function setup(routes: Record<string, () => Response>): {
  urls: string[]
  client: ReturnType<typeof createWarehouseClient>
} {
  const urls: string[] = []
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    urls.push(url)
    const route = routes[url]
    return route ? route() : new Response('', { status: 404 })
  })
  const client = createWarehouseClient({
    fetchImpl: fetchImpl as unknown as typeof fetch,
    releasesUrl: REL,
    sleeperStatsUrl: SL,
    retryDelayMs: 0
  })
  return { urls, client }
}

describe('createWarehouseClient', () => {
  it('reads <name>.csv.gz first and gunzips it', async () => {
    const { urls, client } = setup({
      [`${REL}/injuries/injuries_2025.csv.gz`]: () =>
        new Response(gzipSync(Buffer.from('a,b\n1,2\n')))
    })
    expect(await client.nflverseCsv('injuries', 'injuries_2025')).toBe('a,b\n1,2\n')
    expect(urls).toEqual([`${REL}/injuries/injuries_2025.csv.gz`])
  })

  it('falls back to <name>.csv when the .gz is missing', async () => {
    const { urls, client } = setup({
      [`${REL}/injuries/injuries_2019.csv`]: () => new Response('a\n1\n')
    })
    expect(await client.nflverseCsv('injuries', 'injuries_2019')).toBe('a\n1\n')
    expect(urls).toEqual([
      `${REL}/injuries/injuries_2019.csv.gz`,
      `${REL}/injuries/injuries_2019.csv`
    ])
  })

  it('returns null when neither file exists', async () => {
    const { client } = setup({})
    expect(await client.nflverseCsv('ftn_charting', 'ftn_charting_2019')).toBeNull()
    expect(await client.text('https://ff/ep_weekly_2030.csv')).toBeNull()
  })

  it('throws WarehouseHttpError on other failures (after one retry on 5xx)', async () => {
    const { urls, client } = setup({
      'https://ff/x.csv': () => new Response('down', { status: 503 })
    })
    await expect(client.text('https://ff/x.csv')).rejects.toBeInstanceOf(WarehouseHttpError)
    expect(urls).toHaveLength(2)
  })

  it('reads Sleeper weekly stats; a week Sleeper does not know is empty', async () => {
    const { urls, client } = setup({
      [`${SL}/2025/5?season_type=regular`]: () => new Response('[{"player_id":"4866"}]')
    })
    expect(await client.sleeperStats(2025, 5, 'regular')).toEqual([{ player_id: '4866' }])
    expect(await client.sleeperStats(2025, 1, 'post')).toEqual([])
    expect(urls).toEqual([`${SL}/2025/5?season_type=regular`, `${SL}/2025/1?season_type=post`])
  })

  it('rejects a Sleeper answer that is not a list, or not JSON', async () => {
    const { client } = setup({
      [`${SL}/2025/1?season_type=regular`]: () => new Response('{"error":"rate limited"}'),
      [`${SL}/2025/2?season_type=regular`]: () => new Response('<html>busy</html>')
    })
    await expect(client.sleeperStats(2025, 1, 'regular')).rejects.toThrow(
      'Sleeper stats: expected a list'
    )
    await expect(client.sleeperStats(2025, 2, 'regular')).rejects.toThrow(
      'Sleeper stats: unreadable response'
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/main/sources/warehouseClient.test.ts`
Expected: FAIL (`@main/sources/warehouse/client` cannot be resolved).

- [ ] **Step 3: Extract the fetch**

Create `src/main/sources/http.ts`:

```ts
import { gunzipSync } from 'node:zlib'

export interface FetchTextOptions {
  fetchImpl: typeof fetch
  timeoutMs: number
  retryDelayMs: number
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * GETs `url` as text: follows redirects (fetch default), gunzips gzip bodies (detected by magic bytes)
 * and retries once on 429 / 5xx. Returns null on 404; any other failure status throws `httpError`.
 */
export async function fetchText(
  url: string,
  options: FetchTextOptions,
  httpError: (status: number, url: string) => Error
): Promise<string | null> {
  const { fetchImpl, timeoutMs, retryDelayMs } = options
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.status === 404) return null
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer())
      const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
      return new TextDecoder().decode(gzipped ? gunzipSync(bytes) : bytes)
    }
    if (attempt === 0 && isRetryable(res.status)) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      continue
    }
    throw httpError(res.status, url)
  }
}
```

In `src/main/sources/nflverse.ts`:

- Remove the `import { gunzipSync } from 'node:zlib'` line and the `isRetryable` function.
- Add `import { fetchText } from './http'`.
- Inside `createNflverseClient`, replace the whole `getText` function with:

```ts
/** Follows GitHub's redirect, gunzips `.gz` bodies; see `fetchText`. */
const getText = (url: string): Promise<string | null> =>
  fetchText(
    url,
    { fetchImpl, timeoutMs, retryDelayMs },
    (status, u) => new NflverseHttpError(status, u)
  )
```

- [ ] **Step 4: Write the client**

Create `src/main/sources/warehouse/client.ts`:

```ts
import { fetchText } from '../http'
import { NFLVERSE_RELEASES_URL } from '../nflverse'

/** Sleeper's un-versioned weekly stats; unlike /v1 it gives each row its team and opponent. */
export const SLEEPER_STATS_URL = 'https://api.sleeper.com/stats/nfl'

export type SleeperSeasonType = 'regular' | 'post'

/** The warehouse's downloads (stats-warehouse spec §5). Every method returns null / [] when unpublished. */
export interface WarehouseClient {
  /** An nflverse release file: `<tag>/<name>.csv.gz`, else `<tag>/<name>.csv` (older seasons); null when neither exists. */
  nflverseCsv(tag: string, name: string): Promise<string | null>
  /** Any other file (ffverse); null on 404. */
  text(url: string): Promise<string | null>
  /** One week of Sleeper's stats rows; [] when Sleeper has none. */
  sleeperStats(season: number, week: number, seasonType: SleeperSeasonType): Promise<unknown[]>
}

export class WarehouseHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`HTTP ${status} for ${url}`)
    this.name = 'WarehouseHttpError'
  }
}

export interface WarehouseClientOptions {
  fetchImpl?: typeof fetch
  releasesUrl?: string
  sleeperStatsUrl?: string
  timeoutMs?: number
  retryDelayMs?: number
}

export function createWarehouseClient(options: WarehouseClientOptions = {}): WarehouseClient {
  const releasesUrl = options.releasesUrl ?? NFLVERSE_RELEASES_URL
  const sleeperStatsUrl = options.sleeperStatsUrl ?? SLEEPER_STATS_URL
  const http = {
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? 30_000,
    retryDelayMs: options.retryDelayMs ?? 1_000
  }
  const get = (url: string): Promise<string | null> =>
    fetchText(url, http, (status, u) => new WarehouseHttpError(status, u))

  return {
    async nflverseCsv(tag, name) {
      const base = `${releasesUrl}/${tag}/${name}`
      return (await get(`${base}.csv.gz`)) ?? (await get(`${base}.csv`))
    },
    text: get,
    async sleeperStats(season, week, seasonType) {
      const url = `${sleeperStatsUrl}/${season}/${week}?season_type=${seasonType}`
      const body = await get(url)
      if (body === null) return []
      let parsed: unknown
      try {
        parsed = JSON.parse(body)
      } catch {
        throw new Error(`Sleeper stats: unreadable response from ${url}`)
      }
      if (!Array.isArray(parsed)) throw new Error(`Sleeper stats: expected a list from ${url}`)
      return parsed
    }
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/sources && npm run typecheck:node`
Expected: PASS, with the existing `nflverse.test.ts` client tests still green.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/main/sources/http.ts src/main/sources/nflverse.ts src/main/sources/warehouse/client.ts tests/main/sources/warehouseClient.test.ts
git add src/main/sources/http.ts src/main/sources/nflverse.ts src/main/sources/warehouse/client.ts tests/main/sources/warehouseClient.test.ts
git commit -m "feat(sources): add the warehouse HTTP client"
```

---

### Task 4: Generic CSV parsing (spec §3, §4.3, §5)

**Files:**

- Create: `src/main/sources/warehouse/parse.ts`
- Test: `tests/main/sources/warehouseParse.test.ts`

**Interfaces:**

- Consumes: `parseCsv`, `numOrNull`, `strOrNull` (`src/main/sources/csv.ts`); the `Wh*` types (Task 1).
- Produces: `interface Parsed<T> { rows: T[]; skipped: number }`; `cellValue(column, raw)`; `rowData(row): WhData`; `seasonTypeOf(raw): WhSeasonType | null`; `regularWeeks(season): number`; `seasonTypeOfWeek(season, week): WhSeasonType`; `headerOf(text): string[]`; `requireColumns(text, source, columns): void`; `interface PlayerCsvSpec`; `parsePlayerCsv(text, spec, minSeason): Parsed<WhPlayerWeek>`; `interface TeamCsvSpec`; `parseTeamCsv(text, spec, minSeason): Parsed<WhTeamWeek>`; `parseGamesCsv(text, minSeason): Parsed<WhGame>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/sources/warehouseParse.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  cellValue,
  headerOf,
  parseGamesCsv,
  parsePlayerCsv,
  parseTeamCsv,
  seasonTypeOf,
  seasonTypeOfWeek,
  type PlayerCsvSpec
} from '@main/sources/warehouse/parse'

const SPEC: PlayerCsvSpec = {
  source: 'nflverse_player',
  ids: [{ column: 'player_id', keyType: 'gsis' }],
  season: 'season',
  week: 'week',
  seasonType: 'season_type',
  team: 'team',
  opponent: 'opponent_team'
}

const PLAYER_CSV = `season,week,season_type,player_id,team,opponent_team,passing_yards,headshot_url,game_id
2025,1,REG,00-0034844,LA,DAL,0,"https://x/img?f_auto,q_auto",2025_01_DAL_PHI
2025,19,POST,00-0034844,LA,GB,12,,2025_19_GB_PHI
2025,0,PRE,00-0034844,LA,GB,1,,x
2018,1,REG,00-0034844,PHI,DAL,0,,x
2025,2,REG,,PHI,KC,0,,x
2025,,REG,00-0034844,PHI,KC,0,,x
2025,3,REG,00-0034844,PHI,NA,NA,,x
`

describe('cellValue', () => {
  it('drops missing values, keeps *_id columns as text, turns numeric text into numbers', () => {
    expect(cellValue('x', '')).toBeNull()
    expect(cellValue('x', 'NA')).toBeNull()
    expect(cellValue('passing_yards', '12')).toBe(12)
    expect(cellValue('cpoe', '-1.5')).toBe(-1.5)
    expect(cellValue('sleeper_id', '4866')).toBe('4866')
    expect(cellValue('ht', '6-4')).toBe('6-4')
    expect(cellValue('roof', ' ')).toBe(' ')
  })
})

describe('season types', () => {
  it('maps nflverse and ESPN spellings; preseason and unknown are null', () => {
    const raw = [
      'REG',
      'Regular',
      'POST',
      'WC',
      'DIV',
      'CON',
      'SB',
      'SBBYE',
      'Playoffs',
      'PRE',
      undefined
    ]
    expect(raw.map((r) => seasonTypeOf(r))).toEqual([
      'REG',
      'REG',
      'POST',
      'POST',
      'POST',
      'POST',
      'POST',
      'POST',
      'POST',
      null,
      null
    ])
  })

  it('splits by the regular-season length: 17 weeks through 2020, 18 since', () => {
    expect(seasonTypeOfWeek(2020, 17)).toBe('REG')
    expect(seasonTypeOfWeek(2020, 18)).toBe('POST')
    expect(seasonTypeOfWeek(2021, 18)).toBe('REG')
    expect(seasonTypeOfWeek(2025, 19)).toBe('POST')
  })
})

describe('headerOf', () => {
  it('reads the first line, without a BOM or CR', () => {
    expect(headerOf('﻿a,"b"\r\n1,2')).toEqual(['a', 'b'])
    expect(headerOf('only,header')).toEqual(['only', 'header'])
  })
})

describe('parsePlayerCsv', () => {
  it('keeps every column, filters early seasons and preseason, counts rows missing a key', () => {
    const { rows, skipped } = parsePlayerCsv(PLAYER_CSV, SPEC, 2019)
    expect(skipped).toBe(2)
    expect(rows.map((r) => [r.seasonType, r.week])).toEqual([
      ['REG', 1],
      ['POST', 19],
      ['REG', 3]
    ])
    expect(rows[0]).toEqual({
      source: 'nflverse_player',
      season: 2025,
      seasonType: 'REG',
      week: 1,
      playerKey: '00-0034844',
      keyType: 'gsis',
      team: 'LA',
      opponent: 'DAL',
      data: {
        season: 2025,
        week: 1,
        season_type: 'REG',
        player_id: '00-0034844',
        team: 'LA',
        opponent_team: 'DAL',
        passing_yards: 0,
        headshot_url: 'https://x/img?f_auto,q_auto',
        game_id: '2025_01_DAL_PHI'
      }
    })
    expect(rows[2].opponent).toBeNull()
    expect(rows[2].data).not.toHaveProperty('passing_yards')
  })

  it('maps team codes, falls back across id columns, and derives week / season type when told to', () => {
    const csv = 'season,team_abb,opp_abb,pfr_id,cfb_id,week\n2025,WSH,LAR,,smith-1,19\n'
    const seasonLevel = parsePlayerCsv(
      csv,
      {
        source: 's',
        ids: [
          { column: 'pfr_id', keyType: 'pfr' },
          { column: 'cfb_id', keyType: 'cfb' }
        ],
        season: 'season',
        week: null,
        seasonType: null,
        team: 'team_abb',
        opponent: 'opp_abb',
        teamCodes: { LAR: 'LA', WSH: 'WAS' }
      },
      2019
    ).rows
    expect(seasonLevel[0]).toMatchObject({
      playerKey: 'smith-1',
      keyType: 'cfb',
      week: 0,
      seasonType: 'REG',
      team: 'WAS',
      opponent: 'LA'
    })
    const byWeek = parsePlayerCsv(
      csv,
      {
        source: 's',
        ids: [{ column: 'cfb_id', keyType: 'cfb' }],
        season: 'season',
        week: 'week',
        seasonType: null
      },
      2019
    ).rows
    expect(byWeek[0]).toMatchObject({ week: 19, seasonType: 'POST', team: null, opponent: null })
  })

  it('accepts a header-only file (published before any game)', () => {
    expect(parsePlayerCsv('season,week,season_type,player_id\n', SPEC, 2019)).toEqual({
      rows: [],
      skipped: 0
    })
  })

  it('fails, naming the column, when a key column is missing', () => {
    expect(() =>
      parsePlayerCsv('season,week,season_type,gsis\n2025,1,REG,x\n', SPEC, 2019)
    ).toThrow('nflverse_player: column "player_id" is missing')
  })
})

describe('parseTeamCsv', () => {
  it('keys rows by team and counts rows without one', () => {
    const csv = `season,week,team,season_type,opponent_team,passing_yards
2025,1,PHI,REG,DAL,220
2025,1,,REG,DAL,1
2017,1,PHI,REG,DAL,1
`
    const { rows, skipped } = parseTeamCsv(
      csv,
      {
        source: 'nflverse_team',
        team: 'team',
        season: 'season',
        week: 'week',
        seasonType: 'season_type',
        opponent: 'opponent_team'
      },
      2019
    )
    expect(skipped).toBe(1)
    expect(rows).toEqual([
      {
        source: 'nflverse_team',
        season: 2025,
        seasonType: 'REG',
        week: 1,
        team: 'PHI',
        opponent: 'DAL',
        data: {
          season: 2025,
          week: 1,
          team: 'PHI',
          season_type: 'REG',
          opponent_team: 'DAL',
          passing_yards: 220
        }
      }
    ])
  })
})

describe('parseGamesCsv', () => {
  it('keeps every schedule column from the first season on', () => {
    const csv = `game_id,season,game_type,week,gameday,gametime,away_team,home_team,spread_line,roof,temp,old_game_id
2025_01_DAL_PHI,2025,REG,1,2025-09-04,20:20,DAL,PHI,8.5,outdoors,NA,2025090400
2018_01_ATL_PHI,2018,REG,1,2018-09-06,20:20,ATL,PHI,1,outdoors,80,2018090600
,2025,REG,1,x,x,A,B,1,x,1,1
`
    const { rows, skipped } = parseGamesCsv(csv, 2019)
    expect(skipped).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ gameId: '2025_01_DAL_PHI', season: 2025, week: 1 })
    expect(rows[0].data).toMatchObject({
      spread_line: 8.5,
      roof: 'outdoors',
      gameday: '2025-09-04',
      gametime: '20:20',
      old_game_id: '2025090400'
    })
    expect(rows[0].data).not.toHaveProperty('temp')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/main/sources/warehouseParse.test.ts`
Expected: FAIL (`@main/sources/warehouse/parse` cannot be resolved).

- [ ] **Step 3: Write the parser**

Create `src/main/sources/warehouse/parse.ts`:

```ts
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

/** Every column of a CSV row, by the rules of `cellValue`. */
export function rowData(row: Record<string, string>): WhData {
  const data: WhData = {}
  for (const [column, raw] of Object.entries(row)) {
    const value = cellValue(column, raw)
    if (value !== null) data[column] = value
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
      data: rowData(row)
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
      data: rowData(row)
    })
  }
  return { rows, skipped }
}

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
    rows.push({ gameId, season, week, data: rowData(row) })
  }
  return { rows, skipped }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/main/sources/warehouseParse.test.ts && npm run typecheck:node`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/sources/warehouse/parse.ts tests/main/sources/warehouseParse.test.ts
git add src/main/sources/warehouse/parse.ts tests/main/sources/warehouseParse.test.ts
git commit -m "feat(warehouse): parse generic stat CSVs"
```

---

### Task 5: Sleeper weekly stats (spec §5 `sleeper`, `sleeper_def`, `sleeper_team`)

**Files:**

- Create: `src/main/sources/warehouse/sleeperStats.ts`
- Test: `tests/main/sources/sleeperStats.test.ts`

**Interfaces:**

- Consumes: `NFL_TEAMS`, `toNflverseTeam` (`src/shared/teams.ts`); the `Wh*` types.
- Produces: `interface SleeperStatsRows { players: WhPlayerWeek[]; defs: WhTeamWeek[]; teams: WhTeamWeek[]; skipped: number }`; `parseSleeperStats(rows: unknown[], season, week, seasonType: WhSeasonType): SleeperStatsRows`.

- [ ] **Step 1: Write the failing test**

Create `tests/main/sources/sleeperStats.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseSleeperStats } from '@main/sources/warehouse/sleeperStats'

describe('parseSleeperStats', () => {
  it('splits players, team defenses and team offenses; keeps numbers only; maps team codes', () => {
    const rows: unknown[] = [
      {
        player_id: '4866',
        team: 'PHI',
        opponent: 'LAR',
        stats: { rush_yd: 60, rec_rz_tgt: 1, pts_ppr: 20.4 },
        player: { position: 'RB' }
      },
      {
        player_id: 'LAR',
        team: 'LAR',
        opponent: 'PHI',
        stats: { def_3_and_out: 2, fan_pts_allow_rb: 18 }
      },
      { player_id: 'TEAM_LAR', team: 'LAR', opponent: 'PHI', stats: { down_3_att: 12, note: 'x' } },
      { player_id: '9999', team: null, opponent: null, stats: null },
      { team: 'PHI', stats: {} },
      'garbage'
    ]
    const out = parseSleeperStats(rows, 2025, 5, 'REG')
    expect(out.skipped).toBe(2)
    expect(out.players).toEqual([
      {
        source: 'sleeper',
        season: 2025,
        seasonType: 'REG',
        week: 5,
        playerKey: '4866',
        keyType: 'sleeper',
        team: 'PHI',
        opponent: 'LA',
        data: { rush_yd: 60, rec_rz_tgt: 1, pts_ppr: 20.4 }
      },
      {
        source: 'sleeper',
        season: 2025,
        seasonType: 'REG',
        week: 5,
        playerKey: '9999',
        keyType: 'sleeper',
        team: null,
        opponent: null,
        data: {}
      }
    ])
    expect(out.defs).toEqual([
      {
        source: 'sleeper_def',
        season: 2025,
        seasonType: 'REG',
        week: 5,
        team: 'LA',
        opponent: 'PHI',
        data: { def_3_and_out: 2, fan_pts_allow_rb: 18 }
      }
    ])
    expect(out.teams).toEqual([
      {
        source: 'sleeper_team',
        season: 2025,
        seasonType: 'REG',
        week: 5,
        team: 'LA',
        opponent: 'PHI',
        data: { down_3_att: 12 }
      }
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/main/sources/sleeperStats.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the parser**

Create `src/main/sources/warehouse/sleeperStats.ts`:

```ts
import type { WhData, WhPlayerWeek, WhSeasonType, WhTeamWeek } from '@main/db/repos/warehouse'
import { NFL_TEAMS, toNflverseTeam } from '@shared/teams'

/** Sleeper DEF ids are team codes; team-offense rows are `TEAM_<code>`. */
const TEAM_CODES: ReadonlySet<string> = new Set(NFL_TEAMS)
const TEAM_ROW = 'TEAM_'

export interface SleeperStatsRows {
  players: WhPlayerWeek[]
  /** Fantasy DST lines → `sleeper_def`. */
  defs: WhTeamWeek[]
  /** Team offense → `sleeper_team`. */
  teams: WhTeamWeek[]
  skipped: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The numeric entries of a row's `stats` object. */
function numbers(stats: unknown): WhData {
  const data: WhData = {}
  if (!isRecord(stats)) return data
  for (const [key, value] of Object.entries(stats)) {
    if (typeof value === 'number' && Number.isFinite(value)) data[key] = value
  }
  return data
}

function teamCode(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? toNflverseTeam(value) : null
}

/** One week's response from `api.sleeper.com/stats/nfl/{season}/{week}` (spec §5). */
export function parseSleeperStats(
  rows: unknown[],
  season: number,
  week: number,
  seasonType: WhSeasonType
): SleeperStatsRows {
  const out: SleeperStatsRows = { players: [], defs: [], teams: [], skipped: 0 }
  for (const row of rows) {
    const id = isRecord(row) ? row.player_id : undefined
    if (!isRecord(row) || typeof id !== 'string' || id === '') {
      out.skipped++
      continue
    }
    const data = numbers(row.stats)
    const opponent = teamCode(row.opponent)
    if (TEAM_CODES.has(id)) {
      out.defs.push({
        source: 'sleeper_def',
        season,
        seasonType,
        week,
        team: toNflverseTeam(id),
        opponent,
        data
      })
    } else if (id.startsWith(TEAM_ROW)) {
      const team = toNflverseTeam(id.slice(TEAM_ROW.length))
      out.teams.push({ source: 'sleeper_team', season, seasonType, week, team, opponent, data })
    } else {
      out.players.push({
        source: 'sleeper',
        season,
        seasonType,
        week,
        playerKey: id,
        keyType: 'sleeper',
        team: teamCode(row.team),
        opponent,
        data
      })
    }
  }
  return out
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/main/sources/sleeperStats.test.ts && npm run typecheck:node`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/sources/warehouse/sleeperStats.ts tests/main/sources/sleeperStats.test.ts
git add src/main/sources/warehouse/sleeperStats.ts tests/main/sources/sleeperStats.test.ts
git commit -m "feat(warehouse): parse Sleeper weekly stats"
```

---

### Task 6: Depth charts, rosters and combine (spec §5)

**Files:**

- Create: `src/main/sources/warehouse/depthCharts.ts`, `src/main/sources/warehouse/rosters.ts`, `src/main/sources/warehouse/combine.ts`
- Test: `tests/main/sources/warehouseProfiles.test.ts`

**Interfaces:**

- Consumes: `kickoffIso` (`src/shared/time.ts`); `parseCsv`, `numOrNull`, `strOrNull`; `headerOf`, `requireColumns`, `seasonTypeOf`, `rowData`, `parsePlayerCsv`, `Parsed`, `PlayerCsvSpec` (Task 4).
- Produces (`depthCharts.ts`): `DEPTH_SOURCE = 'depth_charts'`; `interface Kickoff { week: number; at: string }`; `firstKickoffs(games: WhGame[]): Kickoff[]`; `isSnapshotDepthChart(text): boolean`; `parseDepthCharts(text, season, kickoffs, currentWeek: number | null): Parsed<WhPlayerWeek>`.
- Produces (`rosters.ts`): `ROSTERS_SOURCE = 'rosters'`; `asOf({ season, week }): number`; `parseRosters(text, minSeason): { weeks: Parsed<WhPlayerWeek>; bios: WhPlayer[] }`.
- Produces (`combine.ts`): `COMBINE_SOURCE = 'combine'`; `parseCombine(text): Parsed<WhPlayer>`.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/sources/warehouseProfiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { WhGame } from '@main/db/repos/warehouse'
import { parseCombine } from '@main/sources/warehouse/combine'
import {
  firstKickoffs,
  isSnapshotDepthChart,
  parseDepthCharts,
  type Kickoff
} from '@main/sources/warehouse/depthCharts'
import { parseRosters } from '@main/sources/warehouse/rosters'

const WEEKLY = `season,club_code,week,game_type,depth_team,last_name,first_name,football_name,formation,gsis_id,jersey_number,position,elias_id,depth_position,full_name
2024,PHI,1,REG,1,Barkley,Saquon,Saquon,Offense,00-0034844,26,RB,BAR123,RB,Saquon Barkley
2024,PHI,1,REG,2,Barkley,Saquon,Saquon,Special Teams,00-0034844,26,RB,BAR123,KR,Saquon Barkley
2024,PHI,19,WC,1,Barkley,Saquon,Saquon,Offense,00-0034844,26,RB,BAR123,RB,Saquon Barkley
2024,PHI,1,REG,1,Nobody,No,No,Offense,,1,QB,X,QB,No Body
`

const SNAPSHOTS = `dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank
2025-09-01T07:00:00Z,PHI,Jalen Hurts,4040715,00-0036389,1,Base Offense,1,Quarterback,QB,1,1
2025-09-01T07:00:00Z,PHI,Saquon Barkley,3929630,00-0034844,1,Base Offense,2,Running Back,RB,1,1
2025-09-01T07:00:00Z,PHI,Saquon Barkley,3929630,00-0034844,3,Special Teams,9,Kick Returner,KR,1,2
2025-09-09T07:00:00Z,PHI,Jalen Hurts,4040715,00-0036389,1,Base Offense,1,Quarterback,QB,1,1
2025-09-09T07:00:00Z,PHI,Tanner McKee,,00-0039170,1,Base Offense,1,Quarterback,QB,1,2
2025-09-16T07:00:00Z,PHI,Jalen Hurts,4040715,00-0036389,1,Base Offense,1,Quarterback,QB,1,1
2025-09-16T07:00:00Z,PHI,No Id,,,1,Base Offense,1,Quarterback,QB,1,3
`

const KICKOFFS: Kickoff[] = [
  { week: 1, at: '2025-09-05T00:20:00.000Z' },
  { week: 2, at: '2025-09-12T00:15:00.000Z' },
  { week: 3, at: '2025-09-19T00:15:00.000Z' }
]

describe('firstKickoffs', () => {
  it('takes the earliest regular-season kickoff of each week, in UTC', () => {
    const games: WhGame[] = [
      {
        gameId: 'a',
        season: 2025,
        week: 1,
        data: { game_type: 'REG', gameday: '2025-09-07', gametime: '13:00' }
      },
      {
        gameId: 'b',
        season: 2025,
        week: 1,
        data: { game_type: 'REG', gameday: '2025-09-04', gametime: '20:20' }
      },
      {
        gameId: 'c',
        season: 2025,
        week: 19,
        data: { game_type: 'WC', gameday: '2026-01-10', gametime: '16:30' }
      },
      { gameId: 'd', season: 2025, week: 2, data: { game_type: 'REG', gameday: '2025-09-11' } }
    ]
    expect(firstKickoffs(games)).toEqual([{ week: 1, at: '2025-09-05T00:20:00.000Z' }])
  })
})

describe('parseDepthCharts', () => {
  it('groups the weekly format (through 2024) into one row per player-week with its slots', () => {
    expect(isSnapshotDepthChart(WEEKLY)).toBe(false)
    const { rows, skipped } = parseDepthCharts(WEEKLY, 2024, [], null)
    expect(skipped).toBe(1)
    expect(rows).toEqual([
      {
        source: 'depth_charts',
        season: 2024,
        seasonType: 'REG',
        week: 1,
        playerKey: '00-0034844',
        keyType: 'gsis',
        team: 'PHI',
        opponent: null,
        data: {
          full_name: 'Saquon Barkley',
          entries: [
            { formation: 'Offense', position: 'RB', rank: 1 },
            { formation: 'Special Teams', position: 'KR', rank: 2 }
          ]
        }
      },
      {
        source: 'depth_charts',
        season: 2024,
        seasonType: 'POST',
        week: 19,
        playerKey: '00-0034844',
        keyType: 'gsis',
        team: 'PHI',
        opponent: null,
        data: {
          full_name: 'Saquon Barkley',
          entries: [{ formation: 'Offense', position: 'RB', rank: 1 }]
        }
      }
    ])
  })

  it('maps each week to the last snapshot before its first kickoff (snapshot format, 2025+)', () => {
    expect(isSnapshotDepthChart(SNAPSHOTS)).toBe(true)
    const { rows, skipped } = parseDepthCharts(SNAPSHOTS, 2025, KICKOFFS, null)
    expect(skipped).toBe(1)
    // week 3 kicks off after the latest snapshot and is not the current week
    expect(rows.map((r) => [r.week, r.playerKey])).toEqual([
      [1, '00-0036389'],
      [1, '00-0034844'],
      [2, '00-0036389'],
      [2, '00-0039170']
    ])
    expect(rows.every((r) => r.seasonType === 'REG' && r.team === 'PHI')).toBe(true)
    expect(rows[1].data).toEqual({
      snapshot: '2025-09-01T07:00:00Z',
      player_name: 'Saquon Barkley',
      espn_id: '3929630',
      entries: [
        { formation: 'Base Offense', position: 'RB', rank: 1 },
        { formation: 'Special Teams', position: 'KR', rank: 2 }
      ]
    })
    expect(rows[3].data).not.toHaveProperty('espn_id')
  })

  it('gives the current week the latest snapshot even before its kickoff', () => {
    const { rows } = parseDepthCharts(SNAPSHOTS, 2025, KICKOFFS, 3)
    const week3 = rows.filter((r) => r.week === 3)
    expect(week3.map((r) => r.playerKey)).toEqual(['00-0036389'])
    expect(week3[0].data.snapshot).toBe('2025-09-16T07:00:00Z')
  })
})

describe('parseRosters', () => {
  it('keeps every roster week and the latest bio per player', () => {
    const csv = `season,team,full_name,birth_date,height,weight,college,gsis_id,sleeper_id,week,game_type,entry_year,draft_club,draft_number,status
2025,PHI,Saquon Barkley,1997-02-09,72,233,Penn State,00-0034844,4866,1,REG,2018,NYG,2,ACT
2025,PHI,Saquon Barkley,1997-02-09,72,235,Penn State,00-0034844,4866,2,REG,2018,NYG,2,INA
2025,PHI,Nobody,,,,,,,1,REG,,,,ACT
`
    const { weeks, bios } = parseRosters(csv, 2019)
    expect(weeks.skipped).toBe(1)
    expect(weeks.rows.map((r) => [r.week, r.data.status])).toEqual([
      [1, 'ACT'],
      [2, 'INA']
    ])
    expect(bios).toEqual([
      {
        source: 'rosters',
        playerKey: '00-0034844',
        keyType: 'gsis',
        data: {
          as_of: 202502,
          full_name: 'Saquon Barkley',
          birth_date: '1997-02-09',
          height: 72,
          weight: 235,
          college: 'Penn State',
          gsis_id: '00-0034844',
          sleeper_id: '4866',
          entry_year: 2018,
          draft_club: 'NYG',
          draft_number: 2
        }
      }
    ])
  })
})

describe('parseCombine', () => {
  it('keys by PFR id, else CFB id, and counts rows with neither', () => {
    const csv = `season,draft_year,draft_team,draft_round,draft_ovr,pfr_id,cfb_id,player_name,pos,school,ht,wt,forty,bench,vertical,broad_jump,cone,shuttle
2018,2018,New York Giants,1,2,BarkSa00,saquon-barkley-1,Saquon Barkley,RB,Penn State,6-0,233,4.4,29,41,125,6.86,4.24
2024,,,,,,undrafted-guy-1,Undrafted Guy,WR,Somewhere,6-1,190,4.5,,,,,
2024,,,,,,,No Ids,WR,Nowhere,6-1,190,4.6,,,,,
`
    const { rows, skipped } = parseCombine(csv)
    expect(skipped).toBe(1)
    expect(rows.map((r) => [r.playerKey, r.keyType])).toEqual([
      ['BarkSa00', 'pfr'],
      ['undrafted-guy-1', 'cfb']
    ])
    expect(rows[0].data).toMatchObject({ forty: 4.4, ht: '6-0', wt: 233, draft_ovr: 2 })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/main/sources/warehouseProfiles.test.ts`
Expected: FAIL (modules not found).

- [ ] **Step 3: Write the depth-chart parser**

Create `src/main/sources/warehouse/depthCharts.ts`:

```ts
import type { WhData, WhGame, WhPlayerWeek } from '@main/db/repos/warehouse'
import { kickoffIso } from '@shared/time'
import { numOrNull, parseCsv, strOrNull } from '../csv'
import { headerOf, requireColumns, seasonTypeOf, type Parsed } from './parse'

export const DEPTH_SOURCE = 'depth_charts'

/** First regular-season kickoff of a week (ISO UTC). */
export interface Kickoff {
  week: number
  at: string
}

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)

/** The earliest regular-season kickoff of each week, from the stored schedule, ascending by week. */
export function firstKickoffs(games: WhGame[]): Kickoff[] {
  const first = new Map<number, string>()
  for (const g of games) {
    if (g.data.game_type !== 'REG') continue
    const at = kickoffIso(text(g.data.gameday), text(g.data.gametime))
    if (at === null) continue
    const prev = first.get(g.week)
    if (prev === undefined || Date.parse(at) < Date.parse(prev)) first.set(g.week, at)
  }
  return [...first].map(([week, at]) => ({ week, at })).sort((a, b) => a.week - b.week)
}

/** From 2025 nflverse publishes timestamped snapshots (a `dt` column) instead of weekly rows. */
export function isSnapshotDepthChart(csv: string): boolean {
  return headerOf(csv).includes('dt')
}

/** Through 2024: one row per player × slot × week; grouped into one row per player-week. */
function parseWeekly(csv: string): Parsed<WhPlayerWeek> {
  requireColumns(csv, DEPTH_SOURCE, ['season', 'week', 'game_type', 'gsis_id', 'club_code'])
  const byKey = new Map<string, { row: WhPlayerWeek; slots: WhData[] }>()
  let skipped = 0
  for (const r of parseCsv(csv)) {
    const seasonType = seasonTypeOf(r.game_type)
    if (seasonType === null) continue
    const season = numOrNull(r.season)
    const week = numOrNull(r.week)
    const gsis = strOrNull(r.gsis_id)
    if (season === null || week === null || gsis === null) {
      skipped++
      continue
    }
    const key = `${seasonType}|${week}|${gsis}`
    let entry = byKey.get(key)
    if (!entry) {
      const slots: WhData[] = []
      const data: WhData = { entries: slots }
      const name = strOrNull(r.full_name)
      if (name !== null) data.full_name = name
      entry = {
        row: {
          source: DEPTH_SOURCE,
          season,
          seasonType,
          week,
          playerKey: gsis,
          keyType: 'gsis',
          team: strOrNull(r.club_code),
          opponent: null,
          data
        },
        slots
      }
      byKey.set(key, entry)
    }
    entry.slots.push({
      formation: r.formation ?? '',
      position: strOrNull(r.depth_position) ?? r.position ?? '',
      rank: numOrNull(r.depth_team) ?? 0
    })
  }
  return { rows: [...byKey.values()].map((e) => e.row), skipped }
}

function snapshotRows(
  rows: Record<string, string>[],
  season: number,
  week: number,
  dt: string
): WhPlayerWeek[] {
  const byPlayer = new Map<string, { row: WhPlayerWeek; slots: WhData[] }>()
  for (const r of rows) {
    const gsis = r.gsis_id
    let entry = byPlayer.get(gsis)
    if (!entry) {
      const slots: WhData[] = []
      const data: WhData = { snapshot: dt, entries: slots }
      const name = strOrNull(r.player_name)
      if (name !== null) data.player_name = name
      const espn = strOrNull(r.espn_id)
      if (espn !== null) data.espn_id = espn
      entry = {
        row: {
          source: DEPTH_SOURCE,
          season,
          seasonType: 'REG',
          week,
          playerKey: gsis,
          keyType: 'gsis',
          team: strOrNull(r.team),
          opponent: null,
          data
        },
        slots
      }
      byPlayer.set(gsis, entry)
    }
    entry.slots.push({
      formation: r.pos_grp ?? '',
      position: r.pos_abb ?? '',
      rank: numOrNull(r.pos_rank) ?? 0
    })
  }
  return [...byPlayer.values()].map((e) => e.row)
}

/**
 * 2025+: week w takes the last snapshot before its first kickoff. A week that kicks off after the
 * latest snapshot is left out, except the current week, which gets the latest snapshot (spec §5).
 */
function parseSnapshots(
  csv: string,
  season: number,
  kickoffs: Kickoff[],
  currentWeek: number | null
): Parsed<WhPlayerWeek> {
  requireColumns(csv, DEPTH_SOURCE, ['dt', 'team', 'gsis_id', 'pos_grp', 'pos_abb', 'pos_rank'])
  const snapshots = new Map<string, Record<string, string>[]>()
  let skipped = 0
  for (const r of parseCsv(csv)) {
    const dt = strOrNull(r.dt)
    if (dt === null || Number.isNaN(Date.parse(dt)) || strOrNull(r.gsis_id) === null) {
      skipped++
      continue
    }
    const list = snapshots.get(dt) ?? []
    list.push(r)
    snapshots.set(dt, list)
  }
  const times = [...snapshots.keys()].sort((a, b) => Date.parse(a) - Date.parse(b))
  if (times.length === 0) return { rows: [], skipped }
  const latest = Date.parse(times[times.length - 1])
  const rows: WhPlayerWeek[] = []
  for (const { week, at } of kickoffs) {
    const kickoff = Date.parse(at)
    if (kickoff > latest && week !== currentWeek) continue
    const before = times.filter((t) => Date.parse(t) < kickoff)
    const dt = before[before.length - 1]
    if (dt === undefined) continue
    rows.push(...snapshotRows(snapshots.get(dt) ?? [], season, week, dt))
  }
  return { rows, skipped }
}

/** `depth_charts_{season}`: weekly rows through 2024, timestamped snapshots from 2025 (by its header). */
export function parseDepthCharts(
  csv: string,
  season: number,
  kickoffs: Kickoff[],
  currentWeek: number | null
): Parsed<WhPlayerWeek> {
  return isSnapshotDepthChart(csv)
    ? parseSnapshots(csv, season, kickoffs, currentWeek)
    : parseWeekly(csv)
}
```

- [ ] **Step 4: Write the roster and combine parsers**

Create `src/main/sources/warehouse/rosters.ts`:

```ts
import type { WhData, WhPlayer, WhPlayerWeek } from '@main/db/repos/warehouse'
import { parsePlayerCsv, type Parsed, type PlayerCsvSpec } from './parse'

export const ROSTERS_SOURCE = 'rosters'

const ROSTER_SPEC: PlayerCsvSpec = {
  source: ROSTERS_SOURCE,
  ids: [{ column: 'gsis_id', keyType: 'gsis' }],
  season: 'season',
  week: 'week',
  seasonType: 'game_type',
  team: 'team'
}

/** Columns that describe the player rather than his week; the latest roster row supplies them. */
const BIO_COLUMNS = [
  'full_name',
  'first_name',
  'last_name',
  'football_name',
  'birth_date',
  'height',
  'weight',
  'college',
  'position',
  'gsis_id',
  'sleeper_id',
  'espn_id',
  'pfr_id',
  'sportradar_id',
  'years_exp',
  'entry_year',
  'rookie_year',
  'draft_club',
  'draft_number',
  'headshot_url'
]

/** season × 100 + week: orders roster rows across seasons (`upsertWhPlayersLatest` compares it). */
export function asOf(r: { season: number; week: number }): number {
  return r.season * 100 + r.week
}

/** `roster_weekly_{season}`: every player-week, plus each player's latest bio for `wh_player`. */
export function parseRosters(
  csv: string,
  minSeason: number
): { weeks: Parsed<WhPlayerWeek>; bios: WhPlayer[] } {
  const weeks = parsePlayerCsv(csv, ROSTER_SPEC, minSeason)
  const latest = new Map<string, WhPlayerWeek>()
  for (const r of weeks.rows) {
    const prev = latest.get(r.playerKey)
    if (!prev || asOf(r) >= asOf(prev)) latest.set(r.playerKey, r)
  }
  const bios = [...latest.values()].map((r): WhPlayer => {
    const data: WhData = { as_of: asOf(r) }
    for (const column of BIO_COLUMNS) {
      const value = r.data[column]
      if (value !== undefined) data[column] = value
    }
    return { source: ROSTERS_SOURCE, playerKey: r.playerKey, keyType: 'gsis', data }
  })
  return { weeks, bios }
}
```

Create `src/main/sources/warehouse/combine.ts`:

```ts
import type { WhPlayer } from '@main/db/repos/warehouse'
import { parseCsv, strOrNull } from '../csv'
import { requireColumns, rowData, type Parsed } from './parse'

export const COMBINE_SOURCE = 'combine'

/** `combine.csv`, every year: keyed by PFR id, else the college-football id; rows with neither are counted. */
export function parseCombine(csv: string): Parsed<WhPlayer> {
  requireColumns(csv, COMBINE_SOURCE, ['pfr_id', 'cfb_id'])
  const rows: WhPlayer[] = []
  let skipped = 0
  for (const row of parseCsv(csv)) {
    const pfr = strOrNull(row.pfr_id)
    const key = pfr ?? strOrNull(row.cfb_id)
    if (key === null) {
      skipped++
      continue
    }
    rows.push({
      source: COMBINE_SOURCE,
      playerKey: key,
      keyType: pfr !== null ? 'pfr' : 'cfb',
      data: rowData(row)
    })
  }
  return { rows, skipped }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/main/sources/warehouseProfiles.test.ts && npm run typecheck:node`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/main/sources/warehouse/depthCharts.ts src/main/sources/warehouse/rosters.ts src/main/sources/warehouse/combine.ts tests/main/sources/warehouseProfiles.test.ts
git add src/main/sources/warehouse/depthCharts.ts src/main/sources/warehouse/rosters.ts src/main/sources/warehouse/combine.ts tests/main/sources/warehouseProfiles.test.ts
git commit -m "feat(warehouse): parse depth, roster, combine"
```

---

### Task 7: The source registry and captured fixtures (spec §5)

**Files:**

- Create: `src/main/sync/warehouseSteps.ts`
- Create: `tests/fixtures/warehouse/capture.sh` and the files it writes (`tests/fixtures/warehouse/*.csv`, `sleeper_stats_2025_5.json`)
- Create: `tests/fixtures/warehouse.ts`
- Test: `tests/main/sync/warehouseSteps.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 1, 3–6; `SkipStep` (`step.ts`); `listWhGames`.
- Produces (`warehouseSteps.ts`):
  - `WAREHOUSE_FIRST_SEASON = 2019`, `FF_OPPORTUNITY_URL`
  - `interface StepRows { playerWeeks: WhPlayerWeek[]; teamWeeks: WhTeamWeek[]; games: WhGame[]; players: WhPlayer[]; playersMode: 'replace' | 'latest'; skipped: number }`
  - `stepRows(partial: Partial<StepRows>): StepRows`
  - `interface StepContext { db: Db; client: WarehouseClient; current: number; stateWeek: number; stateSeasonType: string }`
  - `interface WarehouseStep { id: string; sources: { source: string; version: number }[]; firstSeason: number; allSeasons: boolean; fetch(ctx: StepContext, season: number): Promise<StepRows | null> }`
  - `sleeperWeeks(season, ctx): SleeperWeek[]`, `WAREHOUSE_STEPS: WarehouseStep[]`
- Produces (`tests/fixtures/warehouse.ts`): `captured(name)`, `capturedNflverse(name)`, `fakeWarehouse(files?, sleeper?): FakeWarehouse` (with `calls: string[]`), `capturedFiles()`, `capturedSleeper()`.

- [ ] **Step 1: Capture the fixtures**

Create `tests/fixtures/warehouse/capture.sh` and make it executable (`chmod +x`):

```bash
#!/usr/bin/env bash
# Re-captures tests/fixtures/warehouse/* from the live sources: the header plus the first rows of each
# file (all-seasons files filtered to 2025 first). Usage: tests/fixtures/warehouse/capture.sh
# Needs curl, gunzip and node; `head` closing the pipe is expected.
set -eu
dir="$(cd "$(dirname "$0")" && pwd)"
base=https://github.com/nflverse/nflverse-data/releases/download
ff=https://github.com/ffverse/ffopportunity/releases/download/latest-data
# get URL OUT [ROWS] [AWK-CONDITION]: the header plus the first ROWS (default 20) data rows passing the condition
get() {
  curl -sL "$1" | { case "$1" in *.gz) gunzip ;; *) cat ;; esac } \
    | awk -F, "NR == 1 || (${4:-1})" | head -n $((${3:-20} + 1)) > "$dir/$2"
}
get "$base/nextgen_stats/ngs_passing.csv.gz" ngs_passing.csv 20 '$1 == "2025"'
get "$base/nextgen_stats/ngs_rushing.csv.gz" ngs_rushing.csv 20 '$1 == "2025"'
get "$base/nextgen_stats/ngs_receiving.csv.gz" ngs_receiving.csv 20 '$1 == "2025"'
for kind in pass rush rec def; do
  get "$base/pfr_advstats/advstats_week_${kind}_2025.csv.gz" "advstats_week_${kind}_2025.csv"
done
get "$base/espn_data/qbr_week_level.csv.gz" qbr_week_level.csv 20 '$1 == "2025"'
get "$base/espn_data/qbr_season_level.csv.gz" qbr_season_level.csv 20 '$1 == "2025"'
get "$base/injuries/injuries_2025.csv.gz" injuries_2025.csv
get "$base/depth_charts/depth_charts_2024.csv.gz" depth_charts_2024.csv
get "$base/weekly_rosters/roster_weekly_2025.csv.gz" roster_weekly_2025.csv
get "$base/combine/combine.csv.gz" combine.csv
get "$ff/ep_weekly_2025.csv" ep_weekly_2025.csv 20 '$5 != "NA"'
# Sleeper 2025 week 5: the first 20 player rows plus two DEF and two TEAM rows, without the embedded player object.
curl -s --compressed "https://api.sleeper.com/stats/nfl/2025/5?season_type=regular" | node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  const rows = JSON.parse(s)
  const pos = (r) => (r.player || {}).position
  const pick = [
    ...rows.filter((r) => pos(r) !== "DEF" && pos(r) !== "TEAM").slice(0, 20),
    ...rows.filter((r) => pos(r) === "DEF").slice(0, 2),
    ...rows.filter((r) => pos(r) === "TEAM").slice(0, 2)
  ].map(({ player, ...r }) => r)
  process.stdout.write(JSON.stringify(pick, null, 1) + "\n")
})' > "$dir/sleeper_stats_2025_5.json"
wc -l "$dir"/*.csv "$dir"/*.json
```

Run: `tests/fixtures/warehouse/capture.sh`
Expected: 14 CSV files of 21 lines each (header + 20), and a JSON file holding 24 rows. If a file has fewer lines, the source returned less; open it and check the header looks right before continuing.

- [ ] **Step 2: Write the fixture helpers**

Create `tests/fixtures/warehouse.ts`:

```ts
import { readFileSync } from 'node:fs'
import type { WarehouseClient } from '@main/sources/warehouse/client'
import { FF_OPPORTUNITY_URL } from '@main/sync/warehouseSteps'

/** A captured live file under tests/fixtures/warehouse/ (see capture.sh there). */
export const captured = (name: string): string =>
  readFileSync(new URL(`./warehouse/${name}`, import.meta.url), 'utf8')

/** A captured nflverse file under tests/fixtures/nflverse/ (2025 rows, every column). */
export const capturedNflverse = (name: string): string =>
  readFileSync(new URL(`./nflverse/${name}`, import.meta.url), 'utf8')

export interface FakeWarehouse extends WarehouseClient {
  /** Every request, in order: `<tag>/<name>`, a URL, or `sleeper:<season>/<week>/<type>`. */
  calls: string[]
}

/**
 * Serves `files` by `<tag>/<name>` (nflverse) or full URL (other files); anything else is unpublished.
 * Sleeper weeks come from `sleeper`, keyed `<season>/<week>/<type>`; other weeks are empty.
 */
export function fakeWarehouse(
  files: Record<string, string> = {},
  sleeper: Record<string, unknown[]> = {}
): FakeWarehouse {
  const calls: string[] = []
  return {
    calls,
    async nflverseCsv(tag, name) {
      calls.push(`${tag}/${name}`)
      return files[`${tag}/${name}`] ?? null
    },
    async text(url) {
      calls.push(url)
      return files[url] ?? null
    },
    async sleeperStats(season, week, seasonType) {
      const key = `${season}/${week}/${seasonType}`
      calls.push(`sleeper:${key}`)
      return sleeper[key] ?? []
    }
  }
}

/** Every captured file, under the name its warehouse step asks for. */
export function capturedFiles(): Record<string, string> {
  const files: Record<string, string> = {
    'stats_player/stats_player_week_2025': capturedNflverse('stats_player_week.csv'),
    'stats_team/stats_team_week_2025': capturedNflverse('stats_team_week.csv'),
    'snap_counts/snap_counts_2025': capturedNflverse('snap_counts.csv'),
    'schedules/games': capturedNflverse('games.csv'),
    [`${FF_OPPORTUNITY_URL}/ep_weekly_2025.csv`]: captured('ep_weekly_2025.csv'),
    'nextgen_stats/ngs_passing': captured('ngs_passing.csv'),
    'nextgen_stats/ngs_rushing': captured('ngs_rushing.csv'),
    'nextgen_stats/ngs_receiving': captured('ngs_receiving.csv'),
    'espn_data/qbr_week_level': captured('qbr_week_level.csv'),
    'espn_data/qbr_season_level': captured('qbr_season_level.csv'),
    'injuries/injuries_2025': captured('injuries_2025.csv'),
    'depth_charts/depth_charts_2024': captured('depth_charts_2024.csv'),
    'weekly_rosters/roster_weekly_2025': captured('roster_weekly_2025.csv'),
    'combine/combine': captured('combine.csv')
  }
  for (const kind of ['pass', 'rush', 'rec', 'def']) {
    files[`pfr_advstats/advstats_week_${kind}_2025`] = captured(`advstats_week_${kind}_2025.csv`)
  }
  return files
}

/** The captured Sleeper week (2025 week 5, regular season). */
export function capturedSleeper(): Record<string, unknown[]> {
  return { '2025/5/regular': JSON.parse(captured('sleeper_stats_2025_5.json')) as unknown[] }
}
```

- [ ] **Step 3: Write the failing tests**

Create `tests/main/sync/warehouseSteps.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { replaceWhGames, type WhKeyType } from '@main/db/repos/warehouse'
import type { WarehouseClient } from '@main/sources/warehouse/client'
import { parseGamesCsv } from '@main/sources/warehouse/parse'
import { SkipStep } from '@main/sync/step'
import {
  sleeperWeeks,
  WAREHOUSE_FIRST_SEASON,
  WAREHOUSE_STEPS,
  type StepContext,
  type WarehouseStep
} from '@main/sync/warehouseSteps'
import {
  capturedFiles,
  capturedNflverse,
  capturedSleeper,
  fakeWarehouse
} from '../../fixtures/warehouse'

const KEY: Record<WhKeyType, RegExp> = {
  gsis: /^00-\d{7}$/,
  pfr: /^\S+\d{2}$/,
  espn: /^\d+$/,
  sleeper: /^\d+$/,
  cfb: /\S/
}

function step(id: string): WarehouseStep {
  const found = WAREHOUSE_STEPS.find((s) => s.id === id)
  if (!found) throw new Error(`no step ${id}`)
  return found
}

describe('warehouse steps', () => {
  let db: Db

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  const ctx = (client: WarehouseClient, over: Partial<StepContext> = {}): StepContext => ({
    db,
    client,
    current: 2026,
    stateWeek: 3,
    stateSeasonType: 'regular',
    ...over
  })

  it('has unique ids and sources; the schedule loads before depth charts', () => {
    const ids = WAREHOUSE_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const sources = WAREHOUSE_STEPS.flatMap((s) => s.sources.map((x) => x.source))
    expect(new Set(sources).size).toBe(sources.length)
    expect(ids.indexOf('schedules')).toBeLessThan(ids.indexOf('depth_charts'))
  })

  it.each([
    ['nflverse_player', 2025],
    ['nflverse_team', 2025],
    ['snaps', 2025],
    ['schedules', 0],
    ['ff_opportunity', 2025],
    ['ngs_pass', 0],
    ['ngs_rush', 0],
    ['ngs_rec', 0],
    ['pfr_pass', 2025],
    ['pfr_rush', 2025],
    ['pfr_rec', 2025],
    ['pfr_def', 2025],
    ['qbr', 0],
    ['injuries', 2025],
    ['depth_charts', 2024],
    ['rosters', 2025],
    ['combine', 0],
    ['sleeper', 2025]
  ])('%s reads its captured file', async (id, season) => {
    const s = step(id)
    const out = await s.fetch(ctx(fakeWarehouse(capturedFiles(), capturedSleeper())), season)
    expect(out).not.toBeNull()
    if (!out) return
    const sources = new Set(s.sources.map((x) => x.source))
    const keyed = [...out.playerWeeks, ...out.players]
    const all = [...keyed, ...out.teamWeeks]
    expect(all.length + out.games.length).toBeGreaterThan(0)
    for (const r of all) expect(sources.has(r.source)).toBe(true)
    for (const r of keyed) expect(r.playerKey).toMatch(KEY[r.keyType])
    for (const r of [...out.playerWeeks, ...out.teamWeeks, ...out.games]) {
      expect(r.season).toBeGreaterThanOrEqual(WAREHOUSE_FIRST_SEASON)
    }
  })

  it('returns null for a file that is not published', async () => {
    expect(await step('nflverse_player').fetch(ctx(fakeWarehouse()), 2025)).toBeNull()
    expect(await step('qbr').fetch(ctx(fakeWarehouse()), 0)).toBeNull()
  })

  it('maps QBR team codes and reads the season file as week 0', async () => {
    const files = {
      'espn_data/qbr_week_level':
        'season,season_type,game_week,team_abb,player_id,opp_abb,qbr_total\n2025,Regular,3,WSH,4480,LAR,71.2\n2025,Playoffs,1,LAR,4480,WSH,60\n',
      'espn_data/qbr_season_level':
        'season,season_type,game_week,team_abb,player_id,qbr_total\n2025,Regular,Season Total,WSH,4480,65\n'
    }
    const out = await step('qbr').fetch(ctx(fakeWarehouse(files)), 0)
    expect(
      out?.playerWeeks.map((r) => [r.seasonType, r.week, r.team, r.opponent, r.keyType])
    ).toEqual([
      ['REG', 3, 'WAS', 'LA', 'espn'],
      ['POST', 1, 'LA', 'WAS', 'espn'],
      ['REG', 0, 'WAS', null, 'espn']
    ])
  })

  describe('sleeperWeeks', () => {
    const at = (stateSeasonType: string, stateWeek = 3): Parameters<typeof sleeperWeeks>[1] => ({
      current: 2026,
      stateWeek,
      stateSeasonType
    })

    it('asks for every week of a past season: 17 + 4 through 2020, 18 + 4 since', () => {
      expect(sleeperWeeks(2020, at('regular'))).toHaveLength(21)
      const weeks = sleeperWeeks(2025, at('regular'))
      expect(weeks).toHaveLength(22)
      expect(weeks[17]).toEqual({ seasonType: 'regular', week: 18 })
      expect(weeks[21]).toEqual({ seasonType: 'post', week: 4 })
    })

    it('asks for the current season through the state week, all of it once in the postseason', () => {
      expect(sleeperWeeks(2026, at('regular', 3))).toEqual([
        { seasonType: 'regular', week: 1 },
        { seasonType: 'regular', week: 2 },
        { seasonType: 'regular', week: 3 }
      ])
      expect(sleeperWeeks(2026, at('regular', 25))).toHaveLength(18)
      expect(sleeperWeeks(2026, at('post', 2))).toHaveLength(22)
    })

    it('asks for nothing in the preseason or offseason', () => {
      expect(sleeperWeeks(2026, at('pre', 1))).toEqual([])
      expect(sleeperWeeks(2026, at('off', 0))).toEqual([])
    })
  })

  it('splits Sleeper rows into players, defenses and team offenses', async () => {
    const client = fakeWarehouse({}, capturedSleeper())
    const out = await step('sleeper').fetch(ctx(client), 2025)
    expect(client.calls.filter((c) => c.startsWith('sleeper:2025/'))).toHaveLength(22)
    expect(out?.playerWeeks.length).toBeGreaterThan(0)
    expect(out?.teamWeeks.filter((r) => r.source === 'sleeper_def').length).toBeGreaterThan(0)
    expect(out?.teamWeeks.filter((r) => r.source === 'sleeper_team').length).toBeGreaterThan(0)
    expect(out?.playerWeeks.every((r) => r.week === 5 && r.seasonType === 'REG')).toBe(true)
  })

  it('skips a current season that has not started', async () => {
    await expect(
      step('sleeper').fetch(ctx(fakeWarehouse(), { stateSeasonType: 'pre', stateWeek: 1 }), 2026)
    ).rejects.toBeInstanceOf(SkipStep)
  })

  it('waits for the schedule before mapping snapshot depth charts', async () => {
    // Two snapshots: one before the season, one after the captured weeks (1–4), so weeks 1–4 all
    // take the September one.
    const files = {
      'depth_charts/depth_charts_2025': `dt,team,player_name,espn_id,gsis_id,pos_grp_id,pos_grp,pos_id,pos_name,pos_abb,pos_slot,pos_rank
2025-09-01T07:00:00Z,DAL,Dak Prescott,2577417,00-0033077,1,Base Offense,1,Quarterback,QB,1,1
2026-01-31T07:00:00Z,DAL,Joe Milton,,00-0039850,1,Base Offense,1,Quarterback,QB,1,1
`
    }
    const s = step('depth_charts')
    await expect(s.fetch(ctx(fakeWarehouse(files)), 2025)).rejects.toBeInstanceOf(SkipStep)
    replaceWhGames(db, [2025], parseGamesCsv(capturedNflverse('games.csv'), 2019).rows, 'x')
    const out = await s.fetch(ctx(fakeWarehouse(files)), 2025)
    expect(out?.playerWeeks.map((r) => r.week)).toEqual([1, 2, 3, 4])
    expect(
      out?.playerWeeks.every(
        (r) => r.playerKey === '00-0033077' && r.data.snapshot === '2025-09-01T07:00:00Z'
      )
    ).toBe(true)
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run tests/main/sync/warehouseSteps.test.ts`
Expected: FAIL (`@main/sync/warehouseSteps` cannot be resolved).

- [ ] **Step 5: Write the registry**

Create `src/main/sync/warehouseSteps.ts`:

```ts
import type { Db } from '@main/db/connection'
import {
  listWhGames,
  type WhGame,
  type WhPlayer,
  type WhPlayerWeek,
  type WhTeamWeek
} from '@main/db/repos/warehouse'
import type { WarehouseClient } from '@main/sources/warehouse/client'
import { parseCombine } from '@main/sources/warehouse/combine'
import {
  firstKickoffs,
  isSnapshotDepthChart,
  parseDepthCharts
} from '@main/sources/warehouse/depthCharts'
import {
  parseGamesCsv,
  parsePlayerCsv,
  parseTeamCsv,
  regularWeeks,
  type PlayerCsvSpec
} from '@main/sources/warehouse/parse'
import { parseRosters } from '@main/sources/warehouse/rosters'
import { parseSleeperStats } from '@main/sources/warehouse/sleeperStats'
import { SkipStep } from './step'

/** Stats-warehouse spec: seasons 2019 through the Sleeper state season. */
export const WAREHOUSE_FIRST_SEASON = 2019
/** ffverse's expected-fantasy-points release (`ep_weekly_{season}.csv`). */
export const FF_OPPORTUNITY_URL =
  'https://github.com/ffverse/ffopportunity/releases/download/latest-data'
const SLEEPER_POST_WEEKS = 4
/** ESPN team codes that differ from nflverse's (QBR files). */
const ESPN_TEAM_CODES: Record<string, string> = { LAR: 'LA', WSH: 'WAS' }

/** What one step fetched; the sync writes each source's rows in one transaction. */
export interface StepRows {
  playerWeeks: WhPlayerWeek[]
  teamWeeks: WhTeamWeek[]
  games: WhGame[]
  players: WhPlayer[]
  /** `replace`: the step's profiles replace the source's; `latest`: keep each player's newest. */
  playersMode: 'replace' | 'latest'
  skipped: number
}

export function stepRows(partial: Partial<StepRows>): StepRows {
  return {
    playerWeeks: [],
    teamWeeks: [],
    games: [],
    players: [],
    playersMode: 'replace',
    skipped: 0,
    ...partial
  }
}

export interface StepContext {
  db: Db
  client: WarehouseClient
  /** The Sleeper state season. */
  current: number
  /** Sleeper state week and season type (`pre` / `regular` / `post` / `off`), for the current season. */
  stateWeek: number
  stateSeasonType: string
}

export interface WarehouseStep {
  /** `wh:<id>` (all-seasons) or `wh:<id>:<season>` in sync_log. */
  id: string
  /** The sources this step writes, each with the adapter version that writes it. */
  sources: { source: string; version: number }[]
  /** First season fetched (never before WAREHOUSE_FIRST_SEASON); unused for all-seasons steps. */
  firstSeason: number
  /** One file holding every season; fetched with season 0. */
  allSeasons: boolean
  /** The rows for `season`, or null when the file is not published. May throw `SkipStep`. */
  fetch(ctx: StepContext, season: number): Promise<StepRows | null>
}

const v1 = (...sources: string[]): { source: string; version: number }[] =>
  sources.map((source) => ({ source, version: 1 }))

/** A per-season player-week CSV fetched by `get`. */
function playerStep(
  spec: PlayerCsvSpec,
  get: (client: WarehouseClient, season: number) => Promise<string | null>
): WarehouseStep {
  return {
    id: spec.source,
    sources: v1(spec.source),
    firstSeason: WAREHOUSE_FIRST_SEASON,
    allSeasons: false,
    async fetch(ctx, season) {
      const csv = await get(ctx.client, season)
      if (csv === null) return null
      const parsed = parsePlayerCsv(csv, spec, WAREHOUSE_FIRST_SEASON)
      return stepRows({ playerWeeks: parsed.rows, skipped: parsed.skipped })
    }
  }
}

/** One all-seasons Next Gen Stats file. */
function ngsStep(source: string, file: string): WarehouseStep {
  const spec: PlayerCsvSpec = {
    source,
    ids: [{ column: 'player_gsis_id', keyType: 'gsis' }],
    season: 'season',
    week: 'week',
    seasonType: 'season_type',
    team: 'team_abbr'
  }
  return {
    id: source,
    sources: v1(source),
    firstSeason: WAREHOUSE_FIRST_SEASON,
    allSeasons: true,
    async fetch(ctx) {
      const csv = await ctx.client.nflverseCsv('nextgen_stats', file)
      if (csv === null) return null
      const parsed = parsePlayerCsv(csv, spec, WAREHOUSE_FIRST_SEASON)
      return stepRows({ playerWeeks: parsed.rows, skipped: parsed.skipped })
    }
  }
}

function pfrStep(kind: 'pass' | 'rush' | 'rec' | 'def'): WarehouseStep {
  return playerStep(
    {
      source: `pfr_${kind}`,
      ids: [{ column: 'pfr_player_id', keyType: 'pfr' }],
      season: 'season',
      week: 'week',
      seasonType: 'game_type',
      team: 'team',
      opponent: 'opponent'
    },
    (client, season) => client.nflverseCsv('pfr_advstats', `advstats_week_${kind}_${season}`)
  )
}

export interface SleeperWeek {
  seasonType: 'regular' | 'post'
  week: number
}

/** Spec §5: every week of a past season; the current season through the state week (all of it in the postseason). */
export function sleeperWeeks(
  season: number,
  ctx: Pick<StepContext, 'current' | 'stateWeek' | 'stateSeasonType'>
): SleeperWeek[] {
  const regular = (n: number): SleeperWeek[] =>
    Array.from({ length: n }, (_, i) => ({ seasonType: 'regular', week: i + 1 }))
  const post: SleeperWeek[] = Array.from({ length: SLEEPER_POST_WEEKS }, (_, i) => ({
    seasonType: 'post',
    week: i + 1
  }))
  if (season < ctx.current || ctx.stateSeasonType === 'post') {
    return [...regular(regularWeeks(season)), ...post]
  }
  if (ctx.stateSeasonType === 'regular') {
    return regular(Math.min(ctx.stateWeek, regularWeeks(season)))
  }
  return []
}

const sleeperStep: WarehouseStep = {
  id: 'sleeper',
  sources: v1('sleeper', 'sleeper_def', 'sleeper_team'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season) {
    const weeks = sleeperWeeks(season, ctx)
    if (weeks.length === 0) throw new SkipStep(`${season} has not started`)
    const out = stepRows({})
    for (const { seasonType, week } of weeks) {
      const rows = await ctx.client.sleeperStats(season, week, seasonType)
      const parsed = parseSleeperStats(rows, season, week, seasonType === 'post' ? 'POST' : 'REG')
      out.playerWeeks.push(...parsed.players)
      out.teamWeeks.push(...parsed.defs, ...parsed.teams)
      out.skipped += parsed.skipped
    }
    return out
  }
}

const schedulesStep: WarehouseStep = {
  id: 'schedules',
  sources: v1('schedules'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: true,
  async fetch(ctx) {
    const csv = await ctx.client.nflverseCsv('schedules', 'games')
    if (csv === null) return null
    const parsed = parseGamesCsv(csv, WAREHOUSE_FIRST_SEASON)
    return stepRows({ games: parsed.rows, skipped: parsed.skipped })
  }
}

const nflverseTeamStep: WarehouseStep = {
  id: 'nflverse_team',
  sources: v1('nflverse_team'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season) {
    const csv = await ctx.client.nflverseCsv('stats_team', `stats_team_week_${season}`)
    if (csv === null) return null
    const parsed = parseTeamCsv(
      csv,
      {
        source: 'nflverse_team',
        team: 'team',
        season: 'season',
        week: 'week',
        seasonType: 'season_type',
        opponent: 'opponent_team'
      },
      WAREHOUSE_FIRST_SEASON
    )
    return stepRows({ teamWeeks: parsed.rows, skipped: parsed.skipped })
  }
}

const qbrStep: WarehouseStep = {
  id: 'qbr',
  sources: v1('qbr'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: true,
  async fetch(ctx) {
    const weekly = await ctx.client.nflverseCsv('espn_data', 'qbr_week_level')
    const seasonal = await ctx.client.nflverseCsv('espn_data', 'qbr_season_level')
    if (weekly === null || seasonal === null) return null
    const base = {
      source: 'qbr',
      ids: [{ column: 'player_id', keyType: 'espn' as const }],
      season: 'season',
      seasonType: 'season_type',
      team: 'team_abb',
      teamCodes: ESPN_TEAM_CODES
    }
    const weeks = parsePlayerCsv(
      weekly,
      { ...base, week: 'game_week', opponent: 'opp_abb' },
      WAREHOUSE_FIRST_SEASON
    )
    const seasons = parsePlayerCsv(seasonal, { ...base, week: null }, WAREHOUSE_FIRST_SEASON)
    return stepRows({
      playerWeeks: [...weeks.rows, ...seasons.rows],
      skipped: weeks.skipped + seasons.skipped
    })
  }
}

const depthChartsStep: WarehouseStep = {
  id: 'depth_charts',
  sources: v1('depth_charts'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season) {
    const csv = await ctx.client.nflverseCsv('depth_charts', `depth_charts_${season}`)
    if (csv === null) return null
    const kickoffs = firstKickoffs(listWhGames(ctx.db, season))
    if (isSnapshotDepthChart(csv) && kickoffs.length === 0) {
      throw new SkipStep(`${season} schedule not loaded yet`)
    }
    const currentWeek = season === ctx.current ? ctx.stateWeek : null
    const parsed = parseDepthCharts(csv, season, kickoffs, currentWeek)
    return stepRows({ playerWeeks: parsed.rows, skipped: parsed.skipped })
  }
}

const rostersStep: WarehouseStep = {
  id: 'rosters',
  sources: v1('rosters'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season) {
    const csv = await ctx.client.nflverseCsv('weekly_rosters', `roster_weekly_${season}`)
    if (csv === null) return null
    const { weeks, bios } = parseRosters(csv, WAREHOUSE_FIRST_SEASON)
    return stepRows({
      playerWeeks: weeks.rows,
      players: bios,
      playersMode: 'latest',
      skipped: weeks.skipped
    })
  }
}

const combineStep: WarehouseStep = {
  id: 'combine',
  sources: v1('combine'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: true,
  async fetch(ctx) {
    const csv = await ctx.client.nflverseCsv('combine', 'combine')
    if (csv === null) return null
    const parsed = parseCombine(csv)
    return stepRows({ players: parsed.rows, skipped: parsed.skipped })
  }
}

/** Spec §5, in sync order (the schedule before depth charts, which map snapshots to its kickoffs). */
export const WAREHOUSE_STEPS: WarehouseStep[] = [
  sleeperStep,
  schedulesStep,
  playerStep(
    {
      source: 'nflverse_player',
      ids: [{ column: 'player_id', keyType: 'gsis' }],
      season: 'season',
      week: 'week',
      seasonType: 'season_type',
      team: 'team',
      opponent: 'opponent_team'
    },
    (client, season) => client.nflverseCsv('stats_player', `stats_player_week_${season}`)
  ),
  nflverseTeamStep,
  playerStep(
    {
      source: 'snaps',
      ids: [{ column: 'pfr_player_id', keyType: 'pfr' }],
      season: 'season',
      week: 'week',
      seasonType: 'game_type',
      team: 'team',
      opponent: 'opponent'
    },
    (client, season) => client.nflverseCsv('snap_counts', `snap_counts_${season}`)
  ),
  playerStep(
    {
      source: 'ff_opportunity',
      ids: [{ column: 'player_id', keyType: 'gsis' }],
      season: 'season',
      week: 'week',
      seasonType: null,
      team: 'posteam'
    },
    (client, season) => client.text(`${FF_OPPORTUNITY_URL}/ep_weekly_${season}.csv`)
  ),
  ngsStep('ngs_pass', 'ngs_passing'),
  ngsStep('ngs_rush', 'ngs_rushing'),
  ngsStep('ngs_rec', 'ngs_receiving'),
  pfrStep('pass'),
  pfrStep('rush'),
  pfrStep('rec'),
  pfrStep('def'),
  qbrStep,
  playerStep(
    {
      source: 'injuries',
      ids: [{ column: 'gsis_id', keyType: 'gsis' }],
      season: 'season',
      week: 'week',
      seasonType: 'season_type',
      team: 'team'
    },
    (client, season) => client.nflverseCsv('injuries', `injuries_${season}`)
  ),
  depthChartsStep,
  rostersStep,
  combineStep
]
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/main/sync/warehouseSteps.test.ts && npm run typecheck:node`
Expected: PASS. If a captured-file case fails on `toMatch(KEY[…])` or `skipped`, open the captured file and compare its header with the step's spec. The upstream column set is the truth; fix the spec, not the fixture.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/main/sync/warehouseSteps.ts tests/fixtures/warehouse.ts tests/main/sync/warehouseSteps.test.ts
git add src/main/sync/warehouseSteps.ts tests/fixtures/warehouse.ts tests/fixtures/warehouse tests/main/sync/warehouseSteps.test.ts
git commit -m "feat(warehouse): register the light sources"
```

---

### Task 8: `refreshWarehouse` — due checks, sealing, writes (spec §4.1–§4.3)

**Files:**

- Create: `src/main/sync/warehouseSync.ts`
- Test: `tests/main/sync/warehouseSync.test.ts`

**Interfaces:**

- Consumes: `runStep`, `SkipStep`, `nowOf`, `StepDeps`, `RefreshOptions` (`step.ts`); `getLastFinishedSync`, `WAREHOUSE_LOG_PREFIX` (`syncLog.ts`); the repo writes and state (Task 1); `WAREHOUSE_STEPS`, `WAREHOUSE_FIRST_SEASON`, `StepRows`, `StepContext`, `WarehouseStep` (Task 7); `getNflState`.
- Produces: `interface WarehouseSyncDeps extends StepDeps { warehouse: WarehouseClient }`; `refreshWarehouse(deps, options?, steps = WAREHOUSE_STEPS): Promise<SyncResult>`; `stepLogName(step, season): string`; `ATTEMPT_INTERVAL_MS`, `PRIOR_SEASON_FRESHNESS_MS`.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/sync/warehouseSync.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { setNflState } from '@main/db/repos/state'
import { getLastError, getLastSync, startSync } from '@main/db/repos/syncLog'
import {
  getWhSourceState,
  listWhGames,
  listWhPlayers,
  listWhPlayerWeeks,
  replaceWhPlayerWeeks,
  type WhPlayerWeek
} from '@main/db/repos/warehouse'
import { stepRows, type StepRows, type WarehouseStep } from '@main/sync/warehouseSteps'
import { refreshWarehouse, type WarehouseSyncDeps } from '@main/sync/warehouseSync'
import type { SyncResult } from '@shared/types'
import { capturedFiles, capturedSleeper, fakeWarehouse } from '../../fixtures/warehouse'

const HOUR = 3_600_000
const DAY = 24 * HOUR

function rowFor(source: string, season: number): WhPlayerWeek {
  return {
    source,
    season,
    seasonType: 'REG',
    week: 1,
    playerKey: '00-0034844',
    keyType: 'gsis',
    team: 'PHI',
    opponent: null,
    data: { season }
  }
}

interface FakeStepOptions {
  version?: number
  firstSeason?: number
  allSeasons?: boolean
  sources?: string[]
  fetch?: (season: number) => Promise<StepRows | null>
}

function fakeStep(id: string, options: FakeStepOptions = {}): WarehouseStep & { calls: number[] } {
  const calls: number[] = []
  const sources = options.sources ?? [id]
  return {
    id,
    calls,
    sources: sources.map((source) => ({ source, version: options.version ?? 1 })),
    firstSeason: options.firstSeason ?? 2024,
    allSeasons: options.allSeasons ?? false,
    async fetch(_ctx, season) {
      calls.push(season)
      if (options.fetch) return options.fetch(season)
      return stepRows({ playerWeeks: sources.map((s) => rowFor(s, season === 0 ? 2025 : season)) })
    }
  }
}

const ran = (result: SyncResult): string[] => result.steps.map((s) => `${s.source}=${s.status}`)

describe('refreshWarehouse', () => {
  let db: Db
  let clock: Date

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    clock = new Date('2026-10-09T12:00:00.000Z')
    setNflState(db, {
      season: '2026',
      week: 6,
      displayWeek: 6,
      seasonType: 'regular',
      fetchedAt: clock.toISOString()
    })
  })

  const deps = (warehouse = fakeWarehouse()): WarehouseSyncDeps => ({
    db,
    warehouse,
    now: () => clock
  })
  const run = (steps: WarehouseStep[], force = false): Promise<SyncResult> =>
    refreshWarehouse(deps(), { force }, steps)
  const later = (ms: number): void => {
    clock = new Date(clock.getTime() + ms)
  }

  it('does nothing without an NFL state', async () => {
    const empty = openDatabase(':memory:')
    migrate(empty)
    const a = fakeStep('a')
    expect(await refreshWarehouse({ db: empty, warehouse: fakeWarehouse() }, {}, [a])).toEqual({
      steps: []
    })
    expect(a.calls).toEqual([])
  })

  it('backfills oldest season first and seals seasons two or more back', async () => {
    const a = fakeStep('a')
    expect(ran(await run([a]))).toEqual(['wh:a:2024=ok', 'wh:a:2025=ok', 'wh:a:2026=ok'])
    expect(getWhSourceState(db, 'a', 2024)).toMatchObject({ version: 1, rows: 1, sealed: true })
    expect(getWhSourceState(db, 'a', 2025)?.sealed).toBe(false)
    expect(getWhSourceState(db, 'a', 2026)?.sealed).toBe(false)
    expect(listWhPlayerWeeks(db, 'a', 2025)).toEqual([rowFor('a', 2025)])
  })

  it('never goes before 2019 or before a step’s first season', async () => {
    const early = fakeStep('early', { firstSeason: 2010 })
    const late = fakeStep('late', { firstSeason: 2025 })
    await run([early, late])
    expect(early.calls).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])
    expect(late.calls).toEqual([2025, 2026])
  })

  it('runs nothing within 24 h of the last attempt, then the current season only', async () => {
    const a = fakeStep('a')
    await run([a])
    later(HOUR)
    expect(ran(await run([a]))).toEqual([])
    later(DAY)
    expect(ran(await run([a]))).toEqual(['wh:a:2026=ok'])
  })

  it('a forced refresh re-runs the current season only (the Refresh button always forces)', async () => {
    const a = fakeStep('a')
    await run([a])
    later(60_000)
    expect(ran(await run([a], true))).toEqual(['wh:a:2026=ok'])
    later(60_000)
    expect(ran(await run([a], true))).toEqual(['wh:a:2026=ok'])
  })

  it('refreshes the prior season weekly and never a sealed one', async () => {
    const a = fakeStep('a')
    await run([a])
    later(8 * DAY)
    expect(ran(await run([a], true))).toEqual(['wh:a:2025=ok', 'wh:a:2026=ok'])
  })

  it('a version bump re-fetches sealed seasons once', async () => {
    await run([fakeStep('a')])
    later(DAY)
    const v2 = fakeStep('a', { version: 2 })
    expect(ran(await run([v2]))).toEqual(['wh:a:2024=ok', 'wh:a:2025=ok', 'wh:a:2026=ok'])
    expect(getWhSourceState(db, 'a', 2024)).toMatchObject({ version: 2, sealed: true })
    later(DAY)
    expect(ran(await run([v2]))).toEqual(['wh:a:2026=ok'])
  })

  it('skips an unpublished file and retries it after 24 h', async () => {
    const missing = fakeStep('m', { firstSeason: 2026, fetch: async () => null })
    expect(ran(await run([missing]))).toEqual(['wh:m:2026=skipped'])
    expect(getLastSync(db, 'wh:m:2026')?.message).toBe('m 2026 not published yet')
    later(HOUR)
    expect(ran(await run([missing]))).toEqual([])
    later(DAY)
    expect(ran(await run([missing]))).toEqual(['wh:m:2026=skipped'])
  })

  it('a failing step is logged, kept out of the status bar, and the others continue', async () => {
    const bad = fakeStep('bad', {
      firstSeason: 2026,
      fetch: async () => {
        throw new Error('boom')
      }
    })
    const good = fakeStep('good', { firstSeason: 2026 })
    expect(ran(await run([bad, good]))).toEqual(['wh:bad:2026=error', 'wh:good:2026=ok'])
    expect(getLastError(db)).toBeNull()
    expect(getLastSync(db, 'wh:bad:2026')?.message).toBe('boom')
  })

  it('a partial backfill resumes where it stopped', async () => {
    let fail = true
    const a = fakeStep('a', {
      fetch: async (season) => {
        if (season === 2025 && fail) throw new Error('network')
        return stepRows({ playerWeeks: [rowFor('a', season)] })
      }
    })
    expect(ran(await run([a]))).toEqual(['wh:a:2024=ok', 'wh:a:2025=error', 'wh:a:2026=ok'])
    fail = false
    later(DAY)
    expect(ran(await run([a]))).toEqual(['wh:a:2025=ok', 'wh:a:2026=ok'])
  })

  it('a step left running by a quit app does not block the retry', async () => {
    startSync(db, 'wh:a:2026', new Date(clock.getTime() - HOUR).toISOString())
    expect(ran(await run([fakeStep('a', { firstSeason: 2026 })]))).toEqual(['wh:a:2026=ok'])
  })

  it('an all-seasons file replaces only the seasons it holds and refreshes daily', async () => {
    replaceWhPlayerWeeks(db, 'ngs', [2020], [rowFor('ngs', 2020)], 'x')
    const ngs = fakeStep('ngs', {
      allSeasons: true,
      fetch: async () => stepRows({ playerWeeks: [rowFor('ngs', 2024), rowFor('ngs', 2025)] })
    })
    expect(ran(await run([ngs]))).toEqual(['wh:ngs=ok'])
    expect(listWhPlayerWeeks(db, 'ngs', 2020)).toHaveLength(1)
    expect(listWhPlayerWeeks(db, 'ngs', 2025)).toHaveLength(1)
    expect(getWhSourceState(db, 'ngs', 0)).toMatchObject({ rows: 2, sealed: false })
    later(DAY)
    expect(ran(await run([ngs]))).toEqual(['wh:ngs=ok'])
  })

  it('tracks each source of a multi-source step, and writes games and profiles', async () => {
    const multi = fakeStep('multi', { firstSeason: 2026, sources: ['x', 'y'] })
    const schedule = fakeStep('schedules', {
      allSeasons: true,
      fetch: async () => stepRows({ games: [{ gameId: 'g', season: 2025, week: 1, data: {} }] })
    })
    const roster = fakeStep('rosters', {
      firstSeason: 2026,
      fetch: async () =>
        stepRows({
          players: [
            { source: 'rosters', playerKey: 'p', keyType: 'gsis', data: { as_of: 202606 } }
          ],
          playersMode: 'latest'
        })
    })
    await run([multi, schedule, roster])
    expect(getWhSourceState(db, 'x', 2026)?.rows).toBe(1)
    expect(getWhSourceState(db, 'y', 2026)?.rows).toBe(1)
    expect(listWhGames(db, 2025)).toHaveLength(1)
    expect(getWhSourceState(db, 'schedules', 0)?.rows).toBe(1)
    expect(listWhPlayers(db, 'rosters')).toHaveLength(1)
  })

  it('runs every registered step against the captured files without an error', async () => {
    const warehouse = fakeWarehouse(capturedFiles(), capturedSleeper())
    const result = await refreshWarehouse(deps(warehouse))
    expect(result.steps.filter((s) => s.status === 'error')).toEqual([])
    const filled = (
      db
        .prepare('SELECT DISTINCT source FROM wh_source_state WHERE rows > 0 ORDER BY source')
        .all() as { source: string }[]
    ).map((r) => r.source)
    expect(filled).toEqual([
      'combine',
      'depth_charts',
      'ff_opportunity',
      'injuries',
      'nflverse_player',
      'nflverse_team',
      'ngs_pass',
      'ngs_rec',
      'ngs_rush',
      'pfr_def',
      'pfr_pass',
      'pfr_rec',
      'pfr_rush',
      'qbr',
      'rosters',
      'schedules',
      'sleeper',
      'sleeper_def',
      'sleeper_team',
      'snaps'
    ])
    expect(warehouse.calls.filter((c) => c.startsWith('sleeper:2026/'))).toEqual([
      'sleeper:2026/1/regular',
      'sleeper:2026/2/regular',
      'sleeper:2026/3/regular',
      'sleeper:2026/4/regular',
      'sleeper:2026/5/regular',
      'sleeper:2026/6/regular'
    ])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/main/sync/warehouseSync.test.ts`
Expected: FAIL (`@main/sync/warehouseSync` cannot be resolved).

- [ ] **Step 3: Write the sync**

Create `src/main/sync/warehouseSync.ts`:

```ts
import { withTransaction, type Db } from '@main/db/connection'
import { getNflState } from '@main/db/repos/state'
import { getLastFinishedSync, WAREHOUSE_LOG_PREFIX } from '@main/db/repos/syncLog'
import {
  getWhSourceState,
  replaceWhGames,
  replaceWhPlayers,
  replaceWhPlayerWeeks,
  replaceWhTeamWeeks,
  setWhSourceState,
  upsertWhPlayersLatest,
  type WhSourceState
} from '@main/db/repos/warehouse'
import type { WarehouseClient } from '@main/sources/warehouse/client'
import type { SyncLogEntry, SyncResult } from '@shared/types'
import {
  nowOf,
  runStep,
  SkipStep,
  type RefreshOptions,
  type StepDeps,
  type StepOutcome
} from './step'
import {
  WAREHOUSE_FIRST_SEASON,
  WAREHOUSE_STEPS,
  type StepContext,
  type StepRows,
  type WarehouseStep
} from './warehouseSteps'

const DAY = 24 * 60 * 60 * 1000
/** Spec §4.2: a step is never retried within a day of its last finished attempt, whatever the outcome. */
export const ATTEMPT_INTERVAL_MS = DAY
/** The prior season is re-fetched weekly. */
export const PRIOR_SEASON_FRESHNESS_MS = 7 * DAY

export interface WarehouseSyncDeps extends StepDeps {
  warehouse: WarehouseClient
}

export function stepLogName(step: WarehouseStep, season: number): string {
  return step.allSeasons
    ? `${WAREHOUSE_LOG_PREFIX}${step.id}`
    : `${WAREHOUSE_LOG_PREFIX}${step.id}:${season}`
}

function seasonsFor(step: WarehouseStep, current: number): number[] {
  if (step.allSeasons) return [0]
  const seasons: number[] = []
  for (let s = Math.max(step.firstSeason, WAREHOUSE_FIRST_SEASON); s <= current; s++)
    seasons.push(s)
  return seasons
}

interface DueInput {
  season: number
  current: number
  force: boolean
  now: number
  lastAttemptAt: string | null
  states: { version: number; state: WhSourceState | null }[]
}

/** Spec §4.2. */
function isDue(input: DueInput): boolean {
  const { season, current, now } = input
  const recent = season === 0 || season >= current - 1
  const attemptedRecently =
    input.lastAttemptAt !== null && now - Date.parse(input.lastAttemptAt) < ATTEMPT_INTERVAL_MS
  if (attemptedRecently && !(input.force && recent)) return false
  return input.states.some(({ version, state }) => {
    if (!state || state.version < version) return true
    if (season === 0 || season === current) return true
    if (season === current - 1) {
      return now - Date.parse(state.fetchedAt) >= PRIOR_SEASON_FRESHNESS_MS
    }
    return !state.sealed
  })
}

/** Writes one step's rows per source and records each source's state. Returns the rows written. */
function writeStepRows(
  db: Db,
  step: WarehouseStep,
  season: number,
  rows: StepRows,
  updatedAt: string,
  sealed: boolean
): number {
  const seasonsOf = (list: { season: number }[]): number[] =>
    season === 0 ? [...new Set(list.map((r) => r.season))] : [season]
  let total = 0
  step.sources.forEach(({ source, version }, index) => {
    const playerWeeks = rows.playerWeeks.filter((r) => r.source === source)
    const teamWeeks = rows.teamWeeks.filter((r) => r.source === source)
    const players = rows.players.filter((r) => r.source === source)
    let written =
      replaceWhPlayerWeeks(db, source, seasonsOf(playerWeeks), playerWeeks, updatedAt) +
      replaceWhTeamWeeks(db, source, seasonsOf(teamWeeks), teamWeeks, updatedAt)
    written +=
      rows.playersMode === 'latest'
        ? upsertWhPlayersLatest(db, source, players, updatedAt)
        : replaceWhPlayers(db, source, players, updatedAt)
    // Games carry no source; they belong to the step's first source (the schedule).
    if (index === 0 && rows.games.length > 0) {
      written += replaceWhGames(db, seasonsOf(rows.games), rows.games, updatedAt)
    }
    setWhSourceState(db, { source, season, version, rows: written, fetchedAt: updatedAt, sealed })
    total += written
  })
  return total
}

async function runWarehouseStep(
  deps: WarehouseSyncDeps,
  ctx: StepContext,
  step: WarehouseStep,
  season: number
): Promise<StepOutcome> {
  const rows = await step.fetch(ctx, season)
  if (rows === null) {
    throw new SkipStep(
      season === 0 ? `${step.id} not published yet` : `${step.id} ${season} not published yet`
    )
  }
  const updatedAt = nowOf(deps).toISOString()
  const sealed = season !== 0 && season <= ctx.current - 2
  const written = withTransaction(deps.db, () =>
    writeStepRows(deps.db, step, season, rows, updatedAt, sealed)
  )
  return {
    rows: written,
    message: rows.skipped ? `${rows.skipped} unparseable rows skipped` : null
  }
}

/**
 * Stats-warehouse spec §4: every due step, in registry order, oldest season first. Each step commits
 * on its own, so a quit mid-backfill resumes on the next run. Never throws (steps log their errors).
 */
export async function refreshWarehouse(
  deps: WarehouseSyncDeps,
  options: RefreshOptions = {},
  steps: WarehouseStep[] = WAREHOUSE_STEPS
): Promise<SyncResult> {
  const log: SyncLogEntry[] = []
  const state = getNflState(deps.db)
  if (!state) return { steps: log }
  const current = Number(state.season)
  const ctx: StepContext = {
    db: deps.db,
    client: deps.warehouse,
    current,
    stateWeek: state.week,
    stateSeasonType: state.seasonType
  }
  const force = options.force ?? false
  for (const step of steps) {
    for (const season of seasonsFor(step, current)) {
      const name = stepLogName(step, season)
      const due = isDue({
        season,
        current,
        force,
        now: nowOf(deps).getTime(),
        lastAttemptAt: getLastFinishedSync(deps.db, name)?.startedAt ?? null,
        states: step.sources.map(({ source, version }) => ({
          version,
          state: getWhSourceState(deps.db, source, season)
        }))
      })
      if (!due) continue
      log.push(await runStep(deps, name, 0, true, () => runWarehouseStep(deps, ctx, step, season)))
    }
  }
  return { steps: log }
}
```

Check that `StepOutcome` is exported from `step.ts`. It is (`export type StepOutcome`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main/sync && npm run typecheck:node`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/sync/warehouseSync.ts tests/main/sync/warehouseSync.test.ts
git add src/main/sync/warehouseSync.ts tests/main/sync/warehouseSync.test.ts
git commit -m "feat(sync): add the warehouse refresh"
```

---

### Task 9: Run the warehouse after each refresh and import (spec §4.1)

**Files:**

- Modify: `src/main/ipc/handlers.ts` (`AppContext.warehouse`, `startWarehouse`, `startRefresh`, `setupImportLeague`)
- Modify: `src/main/index.ts` (create the client)

**Interfaces:**

- Consumes: `singleFlight`, `thenInBackground` (Task 2); `refreshWarehouse` (Task 8); `createWarehouseClient`, `WarehouseClient` (Task 3).

The behaviour is pinned by the Task 2 tests (single flight; the result does not wait; failures are isolated). The handlers module imports `electron`, so it has no unit tests. This task is checked by typecheck, the full suite, and the dev start in Task 10.

- [ ] **Step 1: Wire the handlers**

In `src/main/ipc/handlers.ts`:

- Add these imports, sorted among the existing ones:

```ts
import type { WarehouseClient } from '@main/sources/warehouse/client'
import { singleFlight, thenInBackground } from '@main/sync/background'
import { refreshWarehouse } from '@main/sync/warehouseSync'
```

- In `AppContext`, add after `fantasycalc: FantasyCalcClient`:

```ts
/** Stats-warehouse downloads (spec 2026-10-09); written to `wh_*`, read by nothing yet. */
warehouse: WarehouseClient
```

- Replace `startRefresh` (and the `inFlight` comment above it) with:

```ts
let inFlight: Promise<SyncResult> | null = null

/**
 * Stats-warehouse spec §4.1: one warehouse run at a time, started after a refresh or import settles.
 * No onStep: nothing reads the warehouse, so its steps neither invalidate caches nor report progress.
 */
const startWarehouse = singleFlight(
  (ctx: AppContext, options: RefreshOptions): Promise<SyncResult> =>
    refreshWarehouse({ db: ctx.db, warehouse: ctx.warehouse }, options)
)

function logWarehouseError(err: unknown): void {
  console.error('warehouse refresh failed', err)
}

/**
 * One refresh at a time: the on-launch refresh and the Refresh button share the same promise. The
 * warehouse starts once it settles; the caller does not wait for the warehouse.
 */
export function startRefresh(ctx: AppContext, options: RefreshOptions = {}): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = thenInBackground(
      refreshAll(syncDeps(ctx), options).finally(() => {
        inFlight = null
      }),
      () => startWarehouse(ctx, options),
      logWarehouseError
    )
  }
  return inFlight
}
```

- Replace the `IPC.setupImportLeague` handler body:

```ts
ipcMain.handle(
  IPC.setupImportLeague,
  (_event, leagueId: string, userId: string | null): Promise<SyncResult> =>
    thenInBackground(
      importAll(syncDeps(ctx), leagueId, userId),
      () => startWarehouse(ctx, {}),
      logWarehouseError
    )
)
```

- [ ] **Step 2: Create the client**

In `src/main/index.ts`, add `import { createWarehouseClient } from '@main/sources/warehouse/client'` next to the other source imports. In the `ctx` literal, add `warehouse: createWarehouseClient(),` after `fantasycalc: createFantasyCalcClient(),`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/main/ipc/handlers.ts src/main/index.ts
git add src/main/ipc/handlers.ts src/main/index.ts
git commit -m "feat: run the warehouse after each refresh"
```

---

### Task 10: Live check, docs, verification, release

**Files:**

- Create: `docs/reference/stats-warehouse.md`
- Modify: this plan (Status block)
- Throwaway (never committed): `tests/zz-warehouse-live.test.ts`

- [ ] **Step 1: Live backfill measurement (size gate)**

Get the current Sleeper state with `curl -s https://api.sleeper.app/v1/state/nfl`, and note `season`, `week` and `season_type`. Create `tests/zz-warehouse-live.test.ts` with those three values filled in:

```ts
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { setNflState } from '@main/db/repos/state'
import { createWarehouseClient } from '@main/sources/warehouse/client'
import { refreshWarehouse } from '@main/sync/warehouseSync'

it('live warehouse backfill (throwaway; never commit)', { timeout: 3_600_000 }, async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ffc-wh-')), 'wh.db')
  const db = openDatabase(path)
  migrate(db)
  const season = '2026' // ← state season
  const week = 6 // ← state week
  setNflState(db, {
    season,
    week,
    displayWeek: week,
    seasonType: 'regular',
    fetchedAt: new Date().toISOString()
  })
  const start = Date.now()
  const result = await refreshWarehouse({ db, warehouse: createWarehouseClient() })
  const seconds = (Date.now() - start) / 1000
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  const byStatus: Record<string, number> = {}
  for (const s of result.steps) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1
  console.log({
    seconds,
    megabytes: statSync(path).size / 1e6,
    steps: result.steps.length,
    byStatus
  })
  console.log(
    result.steps
      .filter((s) => s.status !== 'ok')
      .map((s) => `${s.source}: ${s.status} ${s.message}`)
  )
  console.log(
    db
      .prepare(
        `SELECT source, COUNT(*) AS rows, ROUND(SUM(LENGTH(data_json)) / 1e6, 1) AS mb FROM (
           SELECT source, data_json FROM wh_player_week UNION ALL SELECT source, data_json FROM wh_team_week
           UNION ALL SELECT source, data_json FROM wh_player UNION ALL SELECT 'schedules', data_json FROM wh_game)
         GROUP BY source ORDER BY mb DESC`
      )
      .all()
  )
})
```

Run: `npx vitest run tests/zz-warehouse-live.test.ts`

Expected:

- No `error` steps. Skips are fine only for files that really are unpublished; read each skip message.
- Record `seconds`, `megabytes` and the per-source table for the Status block.
- **Gate:** if `megabytes` > 300, stop here and report the numbers to the user before continuing.

Then delete the throwaway test with `rm tests/zz-warehouse-live.test.ts` and do not commit it.

- [ ] **Step 2: Write the reference doc**

Create `docs/reference/stats-warehouse.md`:

````md
# Stats warehouse — data reference

Added in v0.20.0 (Plan T; spec `docs/superpowers/specs/2026-10-09-stats-warehouse-design.md`). Every stat the free, keyless sources publish, 2019 through the current season, in the app database. **Nothing in the app reads it yet**: it is storage for later features and research.

## Tables

| Table             | Key                                           | Holds                                                                                                                                                                                |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `wh_player_week`  | source, season, season_type, week, player_key | One row per source × player × week. `key_type` says which id `player_key` is (`gsis`, `pfr`, `espn`, `sleeper`, `cfb`). Week 0 = a season-level row the source publishes (NGS, QBR). |
| `wh_team_week`    | source, season, season_type, week, team       | One row per source × team × week (nflverse team codes).                                                                                                                              |
| `wh_game`         | game_id                                       | Every column of nflverse `games.csv` (Vegas lines, rest, roof, surface, weather, coaches, referee).                                                                                  |
| `wh_player`       | source, player_key                            | Profiles: `combine` (every draft year), `rosters` (each player's latest bio, `as_of` = season × 100 + week).                                                                         |
| `wh_source_state` | source, season                                | What was fetched, when, at which adapter version; `sealed` seasons are never re-fetched. Season 0 = an all-seasons file.                                                             |

`data_json` holds every column the source publishes: numbers as numbers, text as text, `*_id` columns as text, empty / `NA` dropped. Depth charts store their slots as `entries: [{ formation, position, rank }]`.

## Sources

| `source`                                     | From                                                                                    | Id                | Table                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------- | ------------------------- |
| `sleeper`                                    | `api.sleeper.com/stats/nfl/{season}/{week}` (REG 1–17/18, POST 1–4)                     | sleeper           | player-week               |
| `sleeper_def`, `sleeper_team`                | same response: DEF rows, `TEAM_<code>` rows                                             | team              | team-week                 |
| `schedules`                                  | nflverse `schedules/games.csv`                                                          | game_id           | `wh_game`                 |
| `nflverse_player`, `nflverse_team`, `snaps`  | nflverse `stats_player`, `stats_team`, `snap_counts`                                    | gsis / team / pfr | player-week, team-week    |
| `ff_opportunity`                             | ffverse `ep_weekly_{season}.csv` (expected fantasy points)                              | gsis              | player-week               |
| `ngs_pass`, `ngs_rush`, `ngs_rec`            | nflverse `nextgen_stats` (all seasons)                                                  | gsis              | player-week               |
| `pfr_pass`, `pfr_rush`, `pfr_rec`, `pfr_def` | nflverse `pfr_advstats`                                                                 | pfr               | player-week               |
| `qbr`                                        | nflverse `espn_data` (weekly + season)                                                  | espn              | player-week               |
| `injuries`                                   | nflverse `injuries`                                                                     | gsis              | player-week               |
| `depth_charts`                               | nflverse `depth_charts` (from 2025: the last snapshot before each week's first kickoff) | gsis              | player-week               |
| `rosters`                                    | nflverse `weekly_rosters`                                                               | gsis              | player-week + `wh_player` |
| `combine`                                    | nflverse `combine.csv`                                                                  | pfr, else cfb     | `wh_player`               |

## Sync

- Runs in the background after every refresh and import (`refreshWarehouse`), one run at a time. The Refresh result does not wait for it.
- Freshness:
  - Nothing is retried within 24 h of its last finished attempt.
  - The current season and all-seasons files are refreshed daily, and on a forced refresh.
  - The prior season is refreshed weekly.
  - Older seasons are fetched once and sealed. Only a version bump in `src/main/sync/warehouseSteps.ts` re-fetches them.
- Steps log to `sync_log` as `wh:<id>:<season>` (or `wh:<id>`). Their errors stay out of the status bar.

## Reading it

Join to Sleeper players through `player_ids` (`gsis_id`, `pfr_id`, `espn_id`), or by Sleeper id for `sleeper` rows:

```sql
-- expected vs actual fantasy points by week for one Sleeper player, 2025
SELECT w.week,
       json_extract(w.data_json, '$.total_fantasy_points_exp') AS xfp,
       json_extract(w.data_json, '$.total_fantasy_points') AS fp
FROM wh_player_week w JOIN player_ids p ON p.gsis_id = w.player_key
WHERE w.source = 'ff_opportunity' AND w.season = 2025 AND p.player_id = ?
ORDER BY w.week;
```
````

Then:

```bash
npx prettier --write docs/reference/stats-warehouse.md
git add docs/reference/stats-warehouse.md
git commit -m "docs: document the stats warehouse"
```

- [ ] **Step 3: Final verification**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green. Note the test count.

Run `npm run dev` with the Bash tool's `run_in_background`. Watch the log for main-process errors during the launch refresh and the warehouse run that follows, then stop it (kill by PID from `ps -eo pid,args | grep '[e]lectron/dist/electron'`). Then check the dev database for warehouse errors:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(db.prepare(\"SELECT source,status,message FROM sync_log WHERE source LIKE 'wh:%' AND status='error' ORDER BY id DESC LIMIT 20\").all())" ~/.config/FantasyCompanion/companion.db
```

The dev database is `~/.config/FantasyCompanion/companion.db`. It was about 115 MB before this plan; record its size after the warehouse run too. If WSLg can't show the window, say so in the Status block.

- [ ] **Step 4: Merge and tag**

```bash
git checkout main && git merge --no-ff feat/stats-warehouse-t -m "merge: feat/stats-warehouse-t (plan T)"
npm version minor -m "build: bump version to %s"
```

Expected: `package.json` at `0.20.0`, tag `v0.20.0`. **Ask the user before** `git push --follow-tags`, which triggers the Windows release workflow.

- [ ] **Step 5: Status block**

Replace this plan's `**Status:**` line with:

- the completion date;
- the merge and tag hashes;
- the test count;
- the live numbers from Step 1 (seconds, MB, largest sources);
- any upstream skips seen;
- what was not verified (GUI).

Then:

```bash
npx prettier --write docs/superpowers/plans/2026-10-09-plan-t-stats-warehouse.md
git add docs/superpowers/plans/2026-10-09-plan-t-stats-warehouse.md
git commit -m "docs(plan): mark plan T complete"
```

---

## Self-review against the spec

| Spec                                                                                                                                                | Where                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| §2 isolation: core tables / recompute / values untouched; own entry point and guard                                                                 | Global Constraints; Tasks 8–9   |
| §3 the five tables, keys and checks; replace granularity (per season; all-seasons files replace only the seasons they hold); REG + POST; data rules | Tasks 1, 4, 8                   |
| §3 size estimate recorded                                                                                                                           | Task 10 Step 1 (gate at 300 MB) |
| §4.1 background after refresh / import, single flight, resume after a quit, no NFL state → nothing                                                  | Tasks 2, 8, 9                   |
| §4.2 24 h attempt rule, current / prior / sealed, versions, force only for recent seasons, first seasons                                            | Task 8                          |
| §4.3 `wh:` log names, `getLastError` filter, 404 → skipped, skipped-row counts, missing key column fails, `.csv` fallback, timeouts                 | Tasks 1, 3, 4, 8                |
| §5 every light source with its id, table, season rules (Sleeper weeks, QBR codes and week 0, depth-chart snapshots, roster bios, combine fallback)  | Tasks 4–7                       |
| §5 team codes (Sleeper `toNflverseTeam`, QBR `LAR`/`WSH`)                                                                                           | Tasks 5, 7                      |
| §7 testing: fixtures, migration, adapters, sync behaviours, manual check                                                                            | Tasks 1–8, 10                   |
| §8 Plan T scope and release                                                                                                                         | Task 10                         |
| §6 play-by-play / FTN / participation                                                                                                               | Plans U and V (not here)        |

```

```
