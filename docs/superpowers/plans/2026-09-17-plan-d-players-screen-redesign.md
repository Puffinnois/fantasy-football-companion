# Plan D — Players Screen Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Players screen with a Sleeper-like weekly table — position tabs (incl. the league's flex slots), `Projection | Stats` toggle, season/week selectors, free-agent / watchlist / rookie filters, Sleeper's per-position column groups — with points under the league's own rules in both modes, a `Δ` column, and nflverse usage columns.

**Architecture:** A new Sleeper source call (`getProjections`) feeds a `player_week_projections` table through a new `sleeper:projections:<season>:<week>` sync step. A read-only `db/repos/playersTable.ts` assembles one row per candidate player from SQL (candidates + filters) plus JS map lookups (stats via the existing adapters, points, projections scored on read, snaps, games). Three IPC calls (`players.options`, `players.table`, `watchlist.toggle`) replace `players.search`. The renderer gets a pure view-model (`playersTableView.ts`), a rewritten `PlayersScreen.tsx` and a small `SlideOver` component.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4, shadcn primitives, `node:sqlite`, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-players-screen-redesign-design.md`. **Builds on:** `v0.3.0` (Plan C): `scoreStatLine` (`@main/scoring/engine`), `playerStatLine` / `teamStatLine` / `offensiveYards` (`@main/scoring/adapters`), `pointsAllowedIndex` (`@main/scoring/recompute`), repos `stats.ts`, `points.ts`, `playerIds.ts`, `playersQuery.ts` (`playerWeeklyStats` stays), `sync/step.ts` (`runStep`, `SkipStep`), `sleeperSync.ts`, `shared/teams.ts` (`toNflverseTeam`), `PositionBadge`, `fmtPoints` / `fmtPct`.

## Global Constraints

- Same as Plan C: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use`), `node:sqlite` only, no Electron imports in core modules, repositories never open transactions, `sync_log` row per network step, sources independent, 30 s timeouts, retry once on 429/5xx.
- Every read behind the screen is SQLite-only in the main process. The renderer formats; it never computes points.
- Stat keys shown in the table are **Sleeper's vocabulary** in both modes (`rush_att`, `rec_tgt`, `fgm_40_49`, `sack`, …) plus the display-only keys `fga`, `xpa`, `fgm_0_39`.
- **Do not saturate the window** (user request): one tabs row + one controls row, only the columns listed per tab, no extra buttons.
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Branch `feat/players-screen-redesign`.
- Existing `tests/**` are typechecked: when a shared type gains a required field, update the fixture literals named in the task.

## Design decisions

1. Projections are stored raw and **scored on read** (`scoreStatLine`) — no `league_id`, no recompute hook; rules edits show immediately.
2. `players.search` / `searchPlayers` are **removed** (dead once the screen is rewritten); `playerWeeklyStats` stays for the slide-over.
3. Kickoff = `gameday + gametime` interpreted as America/New_York, converted to ISO UTC in main (`@shared/time.kickoffIso`), formatted in the renderer's local zone.
4. Sleeper's `FB` displays and filters as `RB`; opponent codes are shown as Sleeper spells them (`LA` → `LAR`, `toSleeperTeam`).
5. Candidate players = scored positions that are rostered, watched, or active on an NFL team (`status != 'Inactive'`, team not null). Sorting is done in JS on the whole candidate set; the first 250 rows are returned with `total`.
6. Projection sync fetches only the NFL display week of the current season during `season_type = regular`; 404/410 or a non-array body → `skipped`.
7. Version bump to 0.4.0 + Windows build happen after the user's dev-app check (Task 6).

## File map

```
src/main/sources/sleeper-types.ts        + SleeperProjection
src/main/sources/sleeper.ts              + getProjections (projectionsBaseUrl, 404/410 → null)
src/main/sync/mappers.ts                 + mapProjections
src/main/db/migrations/004_projections.sql, migrations/index.ts
src/main/db/repos/projections.ts         ProjectionRecord, replaceProjections, listProjections, listProjectionWeeks
src/main/db/repos/watchlist.ts           toggleWatch, listWatched
src/main/db/repos/stats.ts               + gametime on games; listPlayerWeeksByWeek, listTeamWeeksByWeek, listSnapsByWeek, listGamesByWeek
src/main/db/repos/points.ts              + listPointsByWeek
src/main/db/repos/playersTable.ts        tabsForSlots, playersOptions, playersTable
src/main/db/repos/playersQuery.ts        − searchPlayers
src/main/sync/sleeperSync.ts             + sourceProjections, syncProjections in refresh + import
src/main/scoring/adapters.ts             + DISPLAY_STAT_MAP, withDisplayStats
src/shared/time.ts                       kickoffIso
src/shared/teams.ts                      + toSleeperTeam
src/shared/types.ts, src/shared/ipc.ts   + PositionTab, PlayersOptions, PlayersQuery, PlayersTable, PlayerTableRow, GameInfo; − PlayerFilter/PlayerRow/OwnerFilter
src/main/ipc/handlers.ts, src/preload/index.ts
src/renderer/src/lib/playersTableView.ts columnGroups, cellText, gameLabel, kickoffLabel
src/renderer/src/lib/playersView.ts      − (deleted; weekColumns/formatStat move to playersTableView)
src/renderer/src/components/SlideOver.tsx
src/renderer/src/screens/PlayersScreen.tsx (rewritten)
tests/fixtures/sleeper/projections.json   (captured, 20 items)  tests/fixtures/sleeper.ts + projections
tests/main/sources/sleeper.test.ts, tests/main/sync/{mappers,sleeperSync}.test.ts, tests/main/db/{migrate,projectionsRepo,watchlistRepo,statsRepo,playersTable,playersQuery}.test.ts, tests/main/scoring/adapters.test.ts, tests/shared/time.test.ts, tests/renderer/lib/playersTableView.test.ts
```

---

### Task 1: Sleeper projections source and mapper

**Files:**
- Modify: `src/main/sources/sleeper-types.ts`, `src/main/sources/sleeper.ts`, `src/main/sync/mappers.ts`
- Create: `tests/fixtures/sleeper/projections.json` (already captured: 20 real week-2 items, `player` trimmed to 5 fields), extend `tests/fixtures/sleeper.ts`
- Test: `tests/main/sources/sleeper.test.ts`, `tests/main/sync/mappers.test.ts`

**Interfaces:**
- Produces: `SleeperProjection { player_id; season; week; season_type; company; team; opponent; stats: Record<string, number> | null }`; `SleeperClient.getProjections(season: string, week: number): Promise<SleeperProjection[] | null>` (`null` = endpoint unavailable); `SleeperClientOptions.projectionsBaseUrl` (default `https://api.sleeper.app`); `ProjectionRecord { playerId; season; week; company; team; opponent; stats }` (defined in `@main/db/repos/projections` in Task 2 — Task 1 defines it in `mappers.ts` and Task 2 moves it; see Task 2 step 3); `mapProjections(items, season, week): { records: ProjectionRecord[]; skipped: number }`; fixture `fx.projections: SleeperProjection[]`.

- [ ] **Step 1: Fixture and failing tests**

Append to `tests/fixtures/sleeper.ts` (add `SleeperProjection` to its type import from `@main/sources/sleeper-types`):

```ts
/** Week-1 projections in Sleeper's stat vocabulary (values invented). */
export const projections: SleeperProjection[] = [
  { player_id: '4866', season: '2026', week: 1, season_type: 'regular', company: 'rotowire', team: 'PHI', opponent: 'DAL', stats: { rush_att: 18.2, rush_yd: 84.5, rush_td: 0.7, rec: 3.1, rec_tgt: 4, rec_yd: 22.3, rec_td: 0.1, pts_ppr: 20.1 } },
  { player_id: '6794', season: '2026', week: 1, season_type: 'regular', company: 'rotowire', team: 'MIN', opponent: 'CHI', stats: { rec: 6.5, rec_tgt: 9.8, rec_yd: 88.1, rec_td: 0.6, pts_ppr: 18.9 } },
  { player_id: 'LAR', season: '2026', week: 1, season_type: 'regular', company: 'rotowire', team: 'LAR', opponent: 'HOU', stats: { sack: 2.4, int: 0.8, ff: 0.6, fum_rec: 0.5, def_td: 0.1, pts_allow: 20.5, yds_allow: 330 } },
  { player_id: '9999', season: '2026', week: 1, season_type: 'regular', company: 'rotowire', team: null, opponent: null, stats: null },
  { player_id: '1234', season: '2026', week: 2, season_type: 'regular', company: 'rotowire', team: 'FA', opponent: null, stats: { pass_yd: 1 } }
]
```

Append to `tests/main/sources/sleeper.test.ts` inside the existing `describe('createSleeperClient')` (it has a `fakeFetch(responses: { status; body? }[])` helper; add `import * as fx from '../../fixtures/sleeper'`):

```ts
  it('getProjections hits the un-versioned host with every scored position', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: fx.projections }])
    const items = await createSleeperClient({ fetchImpl }).getProjections('2026', 1)
    expect(items).toHaveLength(5)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.sleeper.app/projections/nfl/2026/1?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF',
      expect.anything()
    )
  })

  it('getProjections returns null when the endpoint is gone (404/410) and throws otherwise', async () => {
    const gone = createSleeperClient({ fetchImpl: fakeFetch([{ status: 404 }, { status: 410 }]) })
    expect(await gone.getProjections('2026', 1)).toBeNull()
    expect(await gone.getProjections('2026', 1)).toBeNull()
    const denied = createSleeperClient({ fetchImpl: fakeFetch([{ status: 403, body: 'nope' }]) })
    await expect(denied.getProjections('2026', 1)).rejects.toThrow(/403/)
  })
```

Append to `tests/main/sync/mappers.test.ts` (add `mapProjections` to its `@main/sync/mappers` import and `import { readFileSync } from 'node:fs'`; the file already imports `* as fx`):

```ts
describe('mapProjections', () => {
  it('keeps regular-season items of the requested week with a stats object', () => {
    const { records, skipped } = mapProjections(fx.projections, 2026, 1)
    expect(records.map((r) => r.playerId)).toEqual(['4866', '6794', 'LAR'])
    expect(skipped).toBe(2) // null stats; wrong week
    expect(records[0]).toEqual({
      playerId: '4866', season: 2026, week: 1, company: 'rotowire', team: 'PHI', opponent: 'DAL',
      stats: { rush_att: 18.2, rush_yd: 84.5, rush_td: 0.7, rec: 3.1, rec_tgt: 4, rec_yd: 22.3, rec_td: 0.1, pts_ppr: 20.1 }
    })
  })

  it('maps the captured real payload', () => {
    const real = JSON.parse(readFileSync(new URL('../../fixtures/sleeper/projections.json', import.meta.url), 'utf8'))
    const { records, skipped } = mapProjections(real, 2026, 2)
    expect(skipped).toBe(0)
    expect(records).toHaveLength(20)
    expect(records.find((r) => r.playerId === '7042')?.stats).toMatchObject({ fgm: 1.82, fga: 2.14, xpm: 2.79 })
    expect(records.find((r) => r.playerId === 'BUF')?.stats).toMatchObject({ sack: 2.65, pts_allow: 24.5 })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/sources/sleeper.test.ts tests/main/sync/mappers.test.ts` — expected: FAIL (`getProjections` / `mapProjections` missing; TS may also flag the fixture type).

- [ ] **Step 3: Implement**

`src/main/sources/sleeper-types.ts` — append:

```ts
/** One item of the unofficial `/projections/nfl/{season}/{week}` endpoint. `stats` uses Sleeper's stat keys. */
export interface SleeperProjection {
  player_id: string
  season: string
  week: number
  season_type: string
  company: string | null
  team: string | null
  opponent: string | null
  stats: Record<string, number> | null
}
```

`src/main/sources/sleeper.ts`:

1. Add `getProjections(season: string, week: number): Promise<SleeperProjection[] | null>` to `SleeperClient` and `SleeperProjection` to the type import.
2. Add `projectionsBaseUrl?: string` to `SleeperClientOptions`; in `createSleeperClient` add `const projectionsBaseUrl = options.projectionsBaseUrl ?? 'https://api.sleeper.app'`.
3. Change `getJson` to take the base as a second parameter and treat 410 like 404:

```ts
  async function getJson<T>(path: string, base = baseUrl): Promise<T | null> {
    const url = `${base}${path}`
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 404 || res.status === 410) return null
      if (res.ok) return (await res.json()) as T | null
      const body = await res.text()
      if (attempt === 0 && isRetryable(res.status)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
        continue
      }
      throw new SleeperHttpError(res.status, url, body)
    }
  }
```

4. Add to the returned object:

```ts
    getProjections: (season, week) =>
      getJson<SleeperProjection[]>(
        `/projections/nfl/${encodeURIComponent(season)}/${week}?season_type=regular${PROJECTION_POSITIONS}`,
        projectionsBaseUrl
      )
```

with, above `createSleeperClient`: `const PROJECTION_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].map((p) => `&position[]=${p}`).join('')`.

`src/main/sync/mappers.ts` — append (import `SleeperProjection` into the existing sleeper-types import; `ProjectionRecord` is imported from `@main/db/repos/projections` **after Task 2** — for this task define it locally with `export interface ProjectionRecord {...}` and move it in Task 2):

```ts
export interface ProjectionRecord {
  playerId: string
  season: number
  week: number
  company: string | null
  team: string | null
  opponent: string | null
  stats: Record<string, number>
}

/** Keeps regular-season items of exactly (season, week) that carry a stats object. */
export function mapProjections(
  items: SleeperProjection[],
  season: number,
  week: number
): { records: ProjectionRecord[]; skipped: number } {
  const records: ProjectionRecord[] = []
  let skipped = 0
  for (const it of items) {
    if (
      !it.player_id ||
      !it.stats ||
      it.season_type !== 'regular' ||
      Number(it.season) !== season ||
      it.week !== week
    ) {
      skipped++
      continue
    }
    records.push({
      playerId: it.player_id,
      season,
      week,
      company: it.company ?? null,
      team: it.team ?? null,
      opponent: it.opponent ?? null,
      stats: it.stats
    })
  }
  return { records, skipped }
}
```

Any existing fake `SleeperClient` in tests (`tests/main/sync/sleeperSync.test.ts` `fakeClient`) must gain `getProjections: vi.fn(async () => fx.projections)` to keep typechecking.

- [ ] **Step 4: Verify and commit**

`npx vitest run tests/main/sources/sleeper.test.ts tests/main/sync/mappers.test.ts` → pass; then `npm run typecheck && npm run lint && npm test`.

```bash
git add src/main/sources/sleeper-types.ts src/main/sources/sleeper.ts src/main/sync/mappers.ts tests/fixtures/sleeper/projections.json tests/fixtures/sleeper.ts tests/main/sources/sleeper.test.ts tests/main/sync/mappers.test.ts tests/main/sync/sleeperSync.test.ts
git commit -m "feat(sources): fetch sleeper weekly projections

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 004, projections and watchlist repos, game kickoff time

**Files:**
- Create: `src/main/db/migrations/004_projections.sql`, `src/main/db/repos/projections.ts`, `src/main/db/repos/watchlist.ts`
- Modify: `src/main/db/migrations/index.ts`, `src/main/sources/nflverse-types.ts` (`GameRecord.gametime`), `src/main/sources/nflverse.ts` (`parseGames`), `src/main/db/repos/stats.ts` (`GameRow.gametime`, `upsertGames`, `listGames`), `src/main/sync/mappers.ts` (import `ProjectionRecord` from the repo instead of defining it)
- Test: `tests/main/db/migrate.test.ts` (version 4, tables `player_week_projections`, `watchlist`), new `tests/main/db/projectionsRepo.test.ts`, `tests/main/db/watchlistRepo.test.ts`; update `tests/main/sources/nflverse.test.ts` (games expectation gains `gametime: '20:20'`), `tests/main/db/statsRepo.test.ts` and `tests/main/db/playersQuery.test.ts` (`GameRecord` literals gain `gametime: null`).

**Interfaces:**
- Produces: `ProjectionRecord` (moved here), `replaceProjections(db, season, week, records, updatedAt): number`, `listProjections(db, season, week): ProjectionRecord[]`, `listProjectionWeeks(db): { season: number; week: number }[]`; `toggleWatch(db, playerId, now): boolean`, `listWatched(db): string[]`; `GameRecord.gametime: string | null`, `GameRow.gametime`.

- [ ] **Step 1: Failing tests**

`tests/main/db/projectionsRepo.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { listProjections, listProjectionWeeks, replaceProjections } from '@main/db/repos/projections'
import { mapProjections } from '@main/sync/mappers'
import * as fx from '../../fixtures/sleeper'

const TS = '2026-09-17T12:00:00.000Z'

describe('projections repo', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('replaces a week idempotently and round-trips stats', () => {
    const { records } = mapProjections(fx.projections, 2026, 1)
    expect(replaceProjections(db, 2026, 1, records, TS)).toBe(3)
    expect(replaceProjections(db, 2026, 1, records, TS)).toBe(3)
    expect(listProjections(db, 2026, 1)).toEqual(records)
    expect(listProjections(db, 2026, 2)).toEqual([])
    replaceProjections(db, 2026, 2, records.slice(0, 1).map((r) => ({ ...r, week: 2 })), TS)
    expect(listProjectionWeeks(db)).toEqual([{ season: 2026, week: 1 }, { season: 2026, week: 2 }])
  })
})
```

`tests/main/db/watchlistRepo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { listWatched, toggleWatch } from '@main/db/repos/watchlist'

describe('watchlist repo', () => {
  it('toggles and lists', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(toggleWatch(db, '4866', 'now')).toBe(true)
    expect(toggleWatch(db, '6794', 'now')).toBe(true)
    expect(listWatched(db).sort()).toEqual(['4866', '6794'])
    expect(toggleWatch(db, '4866', 'now')).toBe(false)
    expect(listWatched(db)).toEqual(['6794'])
  })
})
```

`tests/main/db/migrate.test.ts`: version `3` → `4` (both places), add `'player_week_projections', 'watchlist',` to the table list. `tests/main/sources/nflverse.test.ts`: in the `parseGames` `toEqual`, add `gametime: '20:20'` after `gameday`. `tests/main/db/statsRepo.test.ts`: add `gametime: null,` to each of the six `GameRecord` literals in the `teamByeWeeks` test and assert the round-trip in `upsertGames`: after `upsertGames(db, games, TS)` add `expect(listGames(db)[0].gametime).toBe('20:20')`. `tests/main/db/playersQuery.test.ts`: add `gametime: null,` to the `game()` helper's object.

- [ ] **Step 2: Run the tests to verify they fail**

`npx vitest run tests/main/db tests/main/sources/nflverse.test.ts` — expected: migrate version 3 ≠ 4, unresolved repos, `gametime` missing.

- [ ] **Step 3: Implement**

`src/main/db/migrations/004_projections.sql`:

```sql
-- Sleeper weekly projections (unofficial endpoint), stats in Sleeper's vocabulary; scored on read.
CREATE TABLE player_week_projections (
  player_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  company TEXT,
  team TEXT,
  opponent TEXT,
  stats_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, season, week)
);
CREATE INDEX idx_projections_week ON player_week_projections(season, week);

CREATE TABLE watchlist (
  player_id TEXT PRIMARY KEY,
  added_at TEXT NOT NULL
);

-- Kickoff wall-clock time in ET ("20:15"), from games.csv.
ALTER TABLE games ADD COLUMN gametime TEXT;
```

`migrations/index.ts`: `import projectionsSql from './004_projections.sql?raw'` and `{ version: 4, name: 'projections', sql: projectionsSql }`.

`src/main/db/repos/projections.ts`:

```ts
import type { Db } from '../connection'

export interface ProjectionRecord {
  playerId: string
  season: number
  week: number
  company: string | null
  team: string | null
  opponent: string | null
  /** Sleeper stat keys → projected value. */
  stats: Record<string, number>
}

interface Row {
  player_id: string
  season: number
  week: number
  company: string | null
  team: string | null
  opponent: string | null
  stats_json: string
}

/** Full replace of one week. Wrap in `withTransaction`. */
export function replaceProjections(
  db: Db,
  season: number,
  week: number,
  records: ProjectionRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM player_week_projections WHERE season = ? AND week = ?').run(season, week)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO player_week_projections (player_id, season, week, company, team, opponent, stats_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(r.playerId, season, week, r.company, r.team, r.opponent, JSON.stringify(r.stats), updatedAt)
    written++
  }
  return written
}

export function listProjections(db: Db, season: number, week: number): ProjectionRecord[] {
  const rows = db
    .prepare(
      `SELECT player_id, season, week, company, team, opponent, stats_json
       FROM player_week_projections WHERE season = ? AND week = ? ORDER BY player_id`
    )
    .all(season, week) as unknown as Row[]
  return rows.map((r) => ({
    playerId: r.player_id,
    season: r.season,
    week: r.week,
    company: r.company,
    team: r.team,
    opponent: r.opponent,
    stats: JSON.parse(r.stats_json) as Record<string, number>
  }))
}

export function listProjectionWeeks(db: Db): { season: number; week: number }[] {
  return db
    .prepare('SELECT DISTINCT season, week FROM player_week_projections ORDER BY season, week')
    .all() as unknown as { season: number; week: number }[]
}
```

`src/main/db/repos/watchlist.ts`:

```ts
import type { Db } from '../connection'

/** Adds the player when absent, removes it when present. Returns the new state. */
export function toggleWatch(db: Db, playerId: string, now: string): boolean {
  const removed = db.prepare('DELETE FROM watchlist WHERE player_id = ?').run(playerId).changes
  if (removed > 0) return false
  db.prepare('INSERT INTO watchlist (player_id, added_at) VALUES (?, ?)').run(playerId, now)
  return true
}

export function listWatched(db: Db): string[] {
  return (
    db.prepare('SELECT player_id FROM watchlist ORDER BY added_at').all() as unknown as {
      player_id: string
    }[]
  ).map((r) => r.player_id)
}
```

`src/main/sync/mappers.ts`: delete the local `ProjectionRecord` interface and add `import type { ProjectionRecord } from '@main/db/repos/projections'`.

`src/main/sources/nflverse-types.ts`: add `gametime: string | null` to `GameRecord` (after `gameday`, doc: `/** ET wall clock "HH:MM"; null when unscheduled */`). `parseGames` in `nflverse.ts`: add `gametime: strOrNull(row.gametime),` after `gameday`.

`src/main/db/repos/stats.ts`: `GameRow` gains `gametime: string | null`; `GameDbRow` gains `gametime: string | null`; `upsertGames` inserts it (add the column to the INSERT list, a `?`, `g.gametime` after `g.gameday`, and `gametime = excluded.gametime` to the update set); `listGames` selects it and maps `gametime: r.gametime`.

- [ ] **Step 4: Verify and commit**

`npm run typecheck && npm run lint && npm test` all clean.

```bash
git add src/main/db/migrations/004_projections.sql src/main/db/migrations/index.ts src/main/db/repos/projections.ts src/main/db/repos/watchlist.ts src/main/db/repos/stats.ts src/main/sources/nflverse-types.ts src/main/sources/nflverse.ts src/main/sync/mappers.ts tests/main/db tests/main/sources/nflverse.test.ts
git commit -m "feat(db): add projections, watchlist and kickoff time

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Projections sync step

**Files:**
- Modify: `src/main/sync/sleeperSync.ts`
- Test: `tests/main/sync/sleeperSync.test.ts`

**Interfaces:**
- Consumes: `getNflState`, `replaceProjections` (Task 2), `mapProjections` (Task 1), `runStep`/`SkipStep`/`nowOf` (`./step`).
- Produces: `SOURCE_PROJECTIONS_PREFIX = 'sleeper:projections:'`, `sourceProjections(season, week)`, `PROJECTIONS_FRESHNESS_MS` (6 h); `importLeague` and `refreshSleeper` gain the step after `sleeper:players`.

- [ ] **Step 1: Update and add tests**

In `tests/main/sync/sleeperSync.test.ts`:
- `fakeClient`: add `getProjections: vi.fn(async () => fx.projections),`.
- Import `sourceProjections` from `@main/sync/sleeperSync`.
- `importLeague writes …`: statuses `['ok', 'ok', 'ok', 'ok']`; `steps` gains `` `${sourceProjections(2026, 1)}:ok` `` at the end.
- `refresh skips fresh sources …`: `fresh` → four `'skipped'`; `stale` → `['ok', 'ok', 'skipped', 'skipped']`; `forced` → four `'ok'`.
- `a failing league step …`: statuses `['ok', 'error', 'ok', 'ok']`.
- `refresh without a configured league …`: sources `[SOURCE_STATE, SOURCE_PLAYERS, sourceProjections(2026, 1)]`.
- `a throwing onStep callback …`: four `'ok'`, `toHaveBeenCalledTimes(4)`.

Add:

```ts
  it('projections: stored for the display week, skipped when the endpoint is gone or off-season', async () => {
    const sleeper = fakeClient()
    await importLeague({ db, sleeper, now }, 'L1', 'u1')
    expect(getLastSync(db, sourceProjections(2026, 1))).toMatchObject({ status: 'ok', rowsWritten: 3, message: '2 items skipped' })
    expect(listProjections(db, 2026, 1).map((p) => p.playerId)).toEqual(['4866', '6794', 'LAR'])

    const gone = fakeClient({ getProjections: vi.fn(async () => null) })
    const r1 = await refreshSleeper({ db, sleeper: gone, now }, { force: true })
    expect(r1.steps.at(-1)).toMatchObject({ status: 'skipped', message: 'projections endpoint unavailable' })

    const preseason = fakeClient({ getNflState: vi.fn(async () => ({ ...fx.nflState, season_type: 'pre' })) })
    const r2 = await refreshSleeper({ db, sleeper: preseason, now }, { force: true })
    expect(r2.steps.at(-1)).toMatchObject({ status: 'skipped', message: 'projections only during the regular season' })
    expect(preseason.getProjections).not.toHaveBeenCalled()
  })
```

(`listProjections` imported from `@main/db/repos/projections`.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/main/sync/sleeperSync.test.ts`: the updated step counts fail.

- [ ] **Step 3: Implement**

In `src/main/sync/sleeperSync.ts`: merge imports — `import { getNflState, setNflState } from '@main/db/repos/state'`, `import { replaceProjections } from '@main/db/repos/projections'`, add `mapProjections` to the `./mappers` import, add `SkipStep` to the `./step` import. Add after `FRESHNESS_MS`:

```ts
export const SOURCE_PROJECTIONS_PREFIX = 'sleeper:projections:'
export const sourceProjections = (season: number, week: number): string =>
  `${SOURCE_PROJECTIONS_PREFIX}${season}:${week}`
export const PROJECTIONS_FRESHNESS_MS = 6 * 60 * MINUTE
```

and after `syncPlayers`:

```ts
/** Unofficial endpoint: only the NFL display week of the current regular season; gone → skipped. */
function syncProjections(deps: SyncDeps, force: boolean): Promise<SyncLogEntry> {
  const state = getNflState(deps.db)
  const season = state ? Number(state.season) : 0
  const week = state?.displayWeek ?? 0
  return runSyncStep(deps, sourceProjections(season, week), PROJECTIONS_FRESHNESS_MS, force, async () => {
    if (!state) throw new SkipStep('no NFL state yet')
    if (state.seasonType !== 'regular') throw new SkipStep('projections only during the regular season')
    const items = await deps.sleeper.getProjections(state.season, week)
    if (!Array.isArray(items)) throw new SkipStep('projections endpoint unavailable')
    const { records, skipped } = mapProjections(items, season, week)
    const ts = nowOf(deps).toISOString()
    const rows = withTransaction(deps.db, () => replaceProjections(deps.db, season, week, records, ts))
    return { rows, message: skipped ? `${skipped} items skipped` : null }
  })
}
```

`importLeague`: after `steps.push(await syncPlayers(deps, false))` add `steps.push(await syncProjections(deps, false))`. `refreshSleeper`: after `steps.push(await syncPlayers(deps, force))` add `steps.push(await syncProjections(deps, force))`.

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/sync/sleeperSync.ts tests/main/sync/sleeperSync.test.ts
git commit -m "feat(sync): fetch weekly projections with the sleeper refresh

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Table read model, shared types, IPC

**Files:**
- Create: `src/shared/time.ts`, `src/main/db/repos/playersTable.ts`
- Modify: `src/shared/teams.ts` (+ `toSleeperTeam`), `src/shared/types.ts`, `src/shared/ipc.ts`, `src/main/scoring/adapters.ts` (+ `DISPLAY_STAT_MAP`, `withDisplayStats`, `withKickingBuckets`), `src/main/db/repos/stats.ts` (+ by-week lists), `src/main/db/repos/points.ts` (+ `listPointsByWeek`), `src/main/db/repos/playersQuery.ts` (− `searchPlayers`), `src/main/ipc/handlers.ts`, `src/preload/index.ts`
- Test: `tests/shared/time.test.ts`, `tests/main/db/playersTable.test.ts`, `tests/main/scoring/adapters.test.ts` (+ display keys), `tests/main/db/playersQuery.test.ts` (− `searchPlayers` cases)

**Interfaces:**
- Produces (shared): `TableMode`, `PositionTab`, `PlayersOptions`, `TableSort`, `PlayersQuery`, `GameInfo`, `PlayerTableRow`, `PlayersTable`; `Api.players.options()`, `Api.players.table(query)`, `Api.watchlist.toggle(playerId)`; channels `players:options`, `players:table`, `watchlist:toggle` (`players:search` removed). `kickoffIso(gameday, gametime): string | null`; `toSleeperTeam(code)`.
- Produces (main): `tabsForSlots(slots)`, `playersOptions(db, leagueId)`, `playersTable(db, leagueId, query)`, `TABLE_LIMIT = 250`; `withDisplayStats(line, raw)`, `withKickingBuckets(line)`; `listPlayerWeeksByWeek`, `listTeamWeeksByWeek`, `listSnapsByWeek` (→ `Map<pfrId, number | null>`), `listGamesByWeek`, `listPointsByWeek` (→ `Map<playerId, number>`).

- [ ] **Step 1: Failing tests**

`tests/shared/time.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { kickoffIso } from '@shared/time'

describe('kickoffIso', () => {
  it('interprets gameday + gametime as Eastern time (EDT and EST)', () => {
    expect(kickoffIso('2026-09-17', '20:15')).toBe('2026-09-18T00:15:00.000Z')
    expect(kickoffIso('2026-12-06', '13:00')).toBe('2026-12-06T18:00:00.000Z')
  })
  it('returns null without a time or with junk', () => {
    expect(kickoffIso('2026-09-17', null)).toBeNull()
    expect(kickoffIso(null, '13:00')).toBeNull()
    expect(kickoffIso('2026-09-17', 'TBD')).toBeNull()
  })
})
```

Append to `tests/main/scoring/adapters.test.ts` (add `withDisplayStats, withKickingBuckets` to the adapters import):

```ts
describe('display helpers', () => {
  it('adds attempt columns and the 0-39 bucket', () => {
    const line = withDisplayStats(playerStatLine({ fg_made: 2, fg_att: 3, pat_made: 1, pat_att: 2 }), { fg_made: 2, fg_att: 3, pat_made: 1, pat_att: 2 })
    expect(line).toMatchObject({ fgm: 2, fga: 3, xpm: 1, xpa: 2 })
    expect(withKickingBuckets({ fgm_0_19: 0, fgm_20_29: 1, fgm_30_39: 1, fgm_40_49: 1 })).toMatchObject({ fgm_0_39: 2 })
    expect(withKickingBuckets({ rush_yd: 5 })).toEqual({ rush_yd: 5 })
  })
})
```

`tests/main/db/playersTable.test.ts` (uses `seedLeague`; the Sleeper fixture league is season 2026, roster 1 = `4866 6794 8259 LAR` owned by `Cook Book`, roster 2 = `7564 9509` (`Rival`); `1234` is Inactive with no team):

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { replacePlayerIds } from '@main/db/repos/playerIds'
import { playersOptions, playersTable, tabsForSlots } from '@main/db/repos/playersTable'
import { replacePoints } from '@main/db/repos/points'
import { replaceProjections } from '@main/db/repos/projections'
import { setNflState } from '@main/db/repos/state'
import { replacePlayerWeekStats, replaceSnaps, replaceTeamWeekStats, upsertGames } from '@main/db/repos/stats'
import { toggleWatch } from '@main/db/repos/watchlist'
import { parsePlayerWeekStats, parseSnapCounts, parseTeamWeekStats } from '@main/sources/nflverse'
import { mapProjections } from '@main/sync/mappers'
import type { PlayersQuery } from '@shared/types'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as nv from '../../fixtures/nflverse'
import * as fx from '../../fixtures/sleeper'

const S = 2026
const base: PlayersQuery = { season: S, week: 1, mode: 'stats', tab: 'ALL', sort: { key: 'points', dir: 'desc' } }
const ids = (playerId: string, gsisId: string | null, pfrId: string | null = null, nflverseTeam: string | null = null) =>
  ({ playerId, gsisId, pfrId, sportradarId: null, espnId: null, nflverseTeam, resolution: gsisId ? 'crosswalk' : nflverseTeam ? 'team' : 'unresolved' }) as const

describe('playersTable', () => {
  let db: Db

  beforeEach(() => {
    db = seedLeague()
    setNflState(db, { season: '2026', week: 2, displayWeek: 2, seasonType: 'regular', fetchedAt: SEED_TS })
    replacePlayerIds(db, [ids('4866', '00-0034844', 'BarkSa00'), ids('6794', '00-0036322'), ids('LAR', null, null, 'LA'), ids('8259', null)], SEED_TS)
    const withSeason = <T extends { season: number }>(r: T): T => ({ ...r, season: S })
    replacePlayerWeekStats(db, S, parsePlayerWeekStats(nv.playerStatsCsv).records.filter((r) => r.seasonType === 'REG').map(withSeason), SEED_TS)
    replaceTeamWeekStats(db, S, parseTeamWeekStats(nv.teamStatsCsv).records.map(withSeason), SEED_TS)
    replaceSnaps(db, S, parseSnapCounts(nv.snapCountsCsv).records.map(withSeason), SEED_TS)
    upsertGames(db, [
      { gameId: 'g1', season: S, week: 1, gameType: 'REG', gameday: '2026-09-10', gametime: '20:15', homeTeam: 'PHI', awayTeam: 'DAL', homeScore: 24, awayScore: 20 },
      { gameId: 'g2', season: S, week: 1, gameType: 'REG', gameday: '2026-09-13', gametime: '13:00', homeTeam: 'LA', awayTeam: 'HOU', homeScore: 14, awayScore: 9 },
      { gameId: 'g3', season: S, week: 2, gameType: 'REG', gameday: '2026-09-20', gametime: '16:25', homeTeam: 'KC', awayTeam: 'MIN', homeScore: null, awayScore: null },
      { gameId: 'g4', season: S, week: 2, gameType: 'REG', gameday: '2026-09-20', gametime: '13:00', homeTeam: 'LA', awayTeam: 'DAL', homeScore: null, awayScore: null },
      { gameId: 'g5', season: S, week: 3, gameType: 'REG', gameday: '2026-09-27', gametime: '16:25', homeTeam: 'PHI', awayTeam: 'DAL', homeScore: null, awayScore: null }
    ], SEED_TS) // PHI plays weeks 1 and 3 -> bye 2
    replacePoints(db, 'L1', [
      { playerId: '4866', season: S, week: 1, points: 18.4 },
      { playerId: '6794', season: S, week: 1, points: 10.8 },
      { playerId: 'LAR', season: S, week: 1, points: 12 }
    ], SEED_TS)
    replaceProjections(db, S, 1, mapProjections(fx.projections, 2026, 1).records, SEED_TS)
  })

  it('tabsForSlots: ALL, singles, then the league flex slots in order', () => {
    expect(tabsForSlots([{ slot: 'QB', count: 1 }, { slot: 'FLEX', count: 2 }, { slot: 'SUPER_FLEX', count: 1 }, { slot: 'FLEX', count: 1 }]).map((t) => t.id))
      .toEqual(['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'FLEX', 'SUPER_FLEX'])
    expect(tabsForSlots([{ slot: 'REC_FLEX', count: 1 }]).at(-1)).toEqual({ id: 'REC_FLEX', label: 'REC FLEX', positions: ['WR', 'TE'] })
  })

  it('playersOptions', () => {
    const o = playersOptions(db, 'L1')
    expect(o).toMatchObject({ seasons: [2026, 2025], currentWeek: 2, lastScoredWeek: 1, projectionWeeks: [{ season: 2026, week: 1 }] })
    expect(o.tabs.map((t) => t.id)).toContain('FLEX') // the rules() fixture has a FLEX slot
  })

  it('stats mode: rows carry stats in Sleeper keys, points, delta, usage, owner, game and bye', () => {
    const { rows, total } = playersTable(db, 'L1', base)
    expect(total).toBe(6) // 4866 6794 8259 7564 9509 LAR (1234 is inactive with no team)
    expect(rows.map((r) => r.playerId)).toEqual(['4866', 'LAR', '6794', '9509', '7564', '8259']) // points desc, nulls last by name
    const barkley = rows[0]
    expect(barkley).toMatchObject({ fullName: 'Saquon Barkley', position: 'RB', team: 'PHI', ownerName: 'Cook Book', rookie: false, watched: false, points: 18.4, statsAvailable: true, byeWeek: 2 })
    expect(barkley.stats).toMatchObject({ rush_att: 18, rush_yd: 60, rush_td: 1, rec: 4, rec_tgt: 5, rec_yd: 24 })
    expect(barkley.projected).toBeCloseTo(18.2 * 0 + 84.5 * 0.1 + 0.7 * 6 + 3.1 * 1 + 22.3 * 0.1 + 0.1 * 6, 2) // rules() fixture: PPR, 0.1/yd, 6/td
    expect(barkley.delta).toBeCloseTo(18.4 - barkley.projected!, 2)
    expect(barkley.snapPct).toBe(0.83)
    expect(barkley.game).toEqual({ opponent: 'DAL', home: true, kickoff: '2026-09-11T00:15:00.000Z', homeScore: 24, awayScore: 20, final: true })
    const def = rows[1]
    expect(def).toMatchObject({ playerId: 'LAR', position: 'DEF', points: 12, statsAvailable: true })
    expect(def.stats).toMatchObject({ sack: 4, int: 2, pts_allow: 9, yds_allow: 250 + 60 - 30 })
    expect(def.game?.opponent).toBe('HOU')
    expect(rows.find((r) => r.playerId === '8259')).toMatchObject({ statsAvailable: false, points: null, projected: null, delta: null, stats: {} })
    expect(rows.find((r) => r.playerId === '6794')?.targetShare).toBeNull() // fixture has no target_share column
  })

  it('projection mode: points are the scored projection, stats are the projection line, usage absent', () => {
    const { rows } = playersTable(db, 'L1', { ...base, mode: 'proj' })
    // Jefferson projects 18.91 under the fixture rules, Barkley 18.58
    expect(rows.slice(0, 2).map((r) => r.playerId)).toEqual(['6794', '4866'])
    expect(rows[1].stats).toMatchObject({ rush_att: 18.2, rec_tgt: 4 })
    expect(rows.find((r) => r.playerId === 'LAR')?.stats).toMatchObject({ sack: 2.4, pts_allow: 20.5 })
    expect(rows.find((r) => r.playerId === '7564')?.projected).toBeNull()
  })

  it('a future week has no stats but keeps the upcoming game or bye', () => {
    const bye = playersTable(db, 'L1', { ...base, week: 2 }).rows.find((r) => r.playerId === '4866')
    expect(bye).toMatchObject({ points: null, stats: {}, game: null, byeWeek: 2 })
    const { rows } = playersTable(db, 'L1', { ...base, week: 3 })
    expect(rows.find((r) => r.playerId === '4866')?.game).toEqual({ opponent: 'DAL', home: true, final: false, kickoff: '2026-09-27T20:25:00.000Z', homeScore: null, awayScore: null })
    expect(rows.find((r) => r.playerId === '7564')?.game).toBeNull() // CIN is not in the fixture schedule at all
  })

  it('tabs, filters and search', () => {
    const idsOf = (q: Partial<PlayersQuery>): string[] => playersTable(db, 'L1', { ...base, ...q }).rows.map((r) => r.playerId)
    expect(idsOf({ tab: 'WR' })).toEqual(['6794', '7564'])
    expect(idsOf({ tab: 'FLEX' })).toEqual(['4866', '6794', '9509', '7564', '8259'])
    expect(idsOf({ tab: 'DEF' })).toEqual(['LAR'])
    expect(idsOf({ freeAgents: true })).toEqual([])
    db.prepare("DELETE FROM roster_players WHERE player_id = '9509'").run()
    expect(idsOf({ freeAgents: true })).toEqual(['9509'])
    db.prepare("UPDATE players SET years_exp = 0 WHERE player_id = '9509'").run()
    expect(idsOf({ rookies: true })).toEqual(['9509'])
    toggleWatch(db, '7564', SEED_TS)
    expect(idsOf({ watchlist: true })).toEqual(['7564'])
    expect(playersTable(db, 'L1', { ...base, watchlist: true }).rows[0].watched).toBe(true)
    expect(idsOf({ owner: 2 })).toEqual(['7564'])
    expect(idsOf({ search: 'jeff' })).toEqual(['6794'])
    expect(idsOf({ sort: { key: 'stat:rec_yd', dir: 'asc' } }).slice(0, 2)).toEqual(['4866', '6794']) // 24 then 68; nulls last
    expect(idsOf({ sort: { key: 'name', dir: 'asc' } })[0]).toBe('9509') // Bijan
  })

  it('FB players show as RB and fall under the RB tab', () => {
    db.prepare("UPDATE players SET position = 'FB' WHERE player_id = '8259'").run()
    const { rows } = playersTable(db, 'L1', { ...base, tab: 'RB' })
    expect(rows.map((r) => [r.playerId, r.position])).toContainEqual(['8259', 'RB'])
  })
})
```

In `tests/main/db/playersQuery.test.ts` delete the two `searchPlayers` tests and its import (keep `listRoster` and `playerWeeklyStats` cases).

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/shared tests/main/db/playersTable.test.ts tests/main/scoring/adapters.test.ts`: unresolved modules / missing exports.

- [ ] **Step 3: Shared code**

`src/shared/time.ts`:

```ts
const EASTERN = 'America/New_York'
const wallClock = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit'
})

/** Eastern wall-clock offset from UTC at `at`, in ms (−4 h in EDT, −5 h in EST). */
function easternOffsetMs(at: Date): number {
  const parts: Record<string, number> = {}
  for (const p of wallClock.formatToParts(at)) if (p.type !== 'literal') parts[p.type] = Number(p.value)
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute)
  return wall - at.getTime()
}

/** nflverse `gameday` (YYYY-MM-DD) + `gametime` (HH:MM, Eastern) → ISO UTC instant; null without a valid time. */
export function kickoffIso(gameday: string | null, gametime: string | null): string | null {
  if (!gameday || !gametime) return null
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(gameday)
  const t = /^(\d{1,2}):(\d{2})/.exec(gametime)
  if (!d || !t) return null
  const wall = Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]))
  const guess = new Date(wall - easternOffsetMs(new Date(wall)))
  return new Date(wall - easternOffsetMs(guess)).toISOString() // second pass settles DST edges
}
```

`src/shared/teams.ts` — append:

```ts
const NFLVERSE_TO_SLEEPER_TEAM: Record<string, string> = Object.fromEntries(
  Object.entries(SLEEPER_TO_NFLVERSE_TEAM).map(([sleeper, nflverse]) => [nflverse, sleeper])
)

export function toSleeperTeam(nflverseTeam: string): string {
  return NFLVERSE_TO_SLEEPER_TEAM[nflverseTeam] ?? nflverseTeam
}
```

`src/shared/types.ts` — delete `OwnerFilter`, `PlayerFilter`, `PlayerRow`; add:

```ts
export type TableMode = 'proj' | 'stats'

export interface PositionTab {
  id: string
  label: string
  positions: string[]
}

export interface PlayersOptions {
  seasons: number[]
  currentWeek: number
  lastScoredWeek: number | null
  tabs: PositionTab[]
  projectionWeeks: { season: number; week: number }[]
}

export interface TableSort {
  /** 'points' | 'delta' | 'name' | 'snapPct' | 'targetShare' | `stat:<sleeperKey>` */
  key: string
  dir: 'asc' | 'desc'
}

export interface PlayersQuery {
  season: number
  week: number
  mode: TableMode
  tab: string
  search?: string
  freeAgents?: boolean
  watchlist?: boolean
  rookies?: boolean
  owner?: number
  sort: TableSort
}

export interface GameInfo {
  /** Sleeper team code of the opponent. */
  opponent: string
  home: boolean
  /** ISO UTC kickoff; null when the schedule has no time. */
  kickoff: string | null
  homeScore: number | null
  awayScore: number | null
  final: boolean
}

export interface PlayerTableRow {
  playerId: string
  fullName: string
  position: string | null
  team: string | null
  byeWeek: number | null
  injuryStatus: string | null
  rookie: boolean
  watched: boolean
  ownerRosterId: number | null
  ownerName: string | null
  /** null = bye (team known) or no team. */
  game: GameInfo | null
  points: number | null
  projected: number | null
  delta: number | null
  /** Sleeper stat keys (+ fga, xpa, fgm_0_39); the projection line in 'proj' mode. */
  stats: Record<string, number>
  snapPct: number | null
  targetShare: number | null
  statsAvailable: boolean
}

export interface PlayersTable {
  rows: PlayerTableRow[]
  total: number
}
```

`src/shared/ipc.ts`: swap the type imports (`PlayerFilter`, `PlayerRow` → `PlayersOptions`, `PlayersQuery`, `PlayersTable`), replace the `players` block and add `watchlist`:

```ts
  players: {
    options(): Promise<PlayersOptions>
    /** One row per candidate player for (season, week); sorted server-side; at most 250 rows (`total` says how many matched). */
    table(query: PlayersQuery): Promise<PlayersTable>
    weeklyStats(playerId: string): Promise<WeekStats[]>
  }
  watchlist: {
    /** Returns the new state. */
    toggle(playerId: string): Promise<boolean>
  }
```

channels: replace `playersSearch: 'players:search',` with `playersOptions: 'players:options',` and `playersTable: 'players:table',`; add `watchlistToggle: 'watchlist:toggle',`.

- [ ] **Step 4: Main-process code**

`src/main/scoring/adapters.ts` — append:

```ts
/** Display-only keys (not scoring keys): attempts behind the K columns. */
export const DISPLAY_STAT_MAP: Record<string, string[]> = { fga: ['fg_att'], xpa: ['pat_att'] }

export function withDisplayStats(line: StatLine, raw: Stats): StatLine {
  const out: StatLine = { ...line }
  for (const [key, cols] of Object.entries(DISPLAY_STAT_MAP)) {
    if (cols.some((c) => c in raw)) out[key] = sum(raw, cols)
  }
  return out
}

const SHORT_FG = ['fgm_0_19', 'fgm_20_29', 'fgm_30_39']

/** Adds `fgm_0_39` (Sleeper's screen groups short field goals). Works for actual and projected lines. */
export function withKickingBuckets(line: StatLine): StatLine {
  if (!SHORT_FG.some((c) => c in line)) return line
  return { ...line, fgm_0_39: sum(line as Stats, SHORT_FG) }
}
```

`src/main/db/repos/stats.ts` — append:

```ts
export function listPlayerWeeksByWeek(db: Db, season: number, week: number): PlayerWeekRow[] {
  const rows = db
    .prepare(`${PLAYER_WEEK_SELECT} WHERE season = ? AND week = ?`)
    .all(season, week) as unknown as PlayerWeekDbRow[]
  return rows.map(toPlayerWeek)
}

export function listTeamWeeksByWeek(db: Db, season: number, week: number): TeamWeekRow[] {
  const rows = db
    .prepare('SELECT team, season, week, opponent, stats_json FROM team_week_stats WHERE season = ? AND week = ?')
    .all(season, week) as unknown as TeamWeekDbRow[]
  return rows.map((r) => ({
    team: r.team,
    season: r.season,
    week: r.week,
    opponent: r.opponent,
    stats: JSON.parse(r.stats_json) as Record<string, number>
  }))
}

/** pfr id → offensive snap share for one week. */
export function listSnapsByWeek(db: Db, season: number, week: number): Map<string, number | null> {
  const rows = db
    .prepare('SELECT pfr_id, offense_pct FROM player_week_snaps WHERE season = ? AND week = ?')
    .all(season, week) as unknown as { pfr_id: string; offense_pct: number | null }[]
  return new Map(rows.map((r) => [r.pfr_id, r.offense_pct]))
}

export function listGamesByWeek(db: Db, season: number, week: number): GameRow[] {
  return listGames(db).filter((g) => g.season === season && g.week === week)
}
```

`src/main/db/repos/points.ts` — append:

```ts
/** player id → points for one week of the league's season. */
export function listPointsByWeek(db: Db, leagueId: string, season: number, week: number): Map<string, number> {
  const rows = db
    .prepare('SELECT player_id, points FROM player_week_points WHERE league_id = ? AND season = ? AND week = ?')
    .all(leagueId, season, week) as unknown as { player_id: string; points: number }[]
  return new Map(rows.map((r) => [r.player_id, r.points]))
}
```

`src/main/db/repos/playersQuery.ts`: delete `searchPlayers`, `SearchRow`, `SCORED_POSITIONS`, `escapeLike` and the now-unused imports (`PlayerFilter`, `PlayerRow`, `PointsContext`, `POINTS_CTE`, `round2`, `teamByeWeeks`, `toNflverseTeam`) — keep `playerWeeklyStats`.

`src/main/db/repos/playersTable.ts`:

```ts
import {
  offensiveYards,
  playerStatLine,
  teamStatLine,
  withDisplayStats,
  withKickingBuckets
} from '@main/scoring/adapters'
import { scoreStatLine, type StatLine } from '@main/scoring/engine'
import { pointsAllowedIndex } from '@main/scoring/recompute'
import { POSITIONS, type Position, type RosterSlotCount } from '@shared/rules'
import { toNflverseTeam, toSleeperTeam } from '@shared/teams'
import { kickoffIso } from '@shared/time'
import type {
  GameInfo,
  PlayersOptions,
  PlayersQuery,
  PlayersTable,
  PlayerTableRow,
  PositionTab
} from '@shared/types'
import type { Db } from '../connection'
import { getLeague } from './leagues'
import { latestPointsWeek, listPointsByWeek, round2 } from './points'
import { listProjections, listProjectionWeeks } from './projections'
import { getRules } from './rules'
import { getNflState } from './state'
import {
  listGamesByWeek,
  listPlayerWeeksByWeek,
  listSnapsByWeek,
  listTeamWeeksByWeek,
  teamByeWeeks
} from './stats'

export const TABLE_LIMIT = 250
const ALL_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
const FLEX_SLOTS: Record<string, string[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR']
}

interface CandidateRow {
  player_id: string
  full_name: string
  pos: string | null
  team: string | null
  injury_status: string | null
  years_exp: number | null
  owner_roster_id: number | null
  owner_name: string | null
  watched: string | null
  gsis_id: string | null
  pfr_id: string | null
  nflverse_team: string | null
}

/** ALL, one tab per scored position, then the league's flex slots in roster order. */
export function tabsForSlots(slots: RosterSlotCount[]): PositionTab[] {
  const tabs: PositionTab[] = [{ id: 'ALL', label: 'All', positions: ALL_POSITIONS }]
  for (const p of ALL_POSITIONS) tabs.push({ id: p, label: p, positions: [p] })
  for (const s of slots) {
    const positions = FLEX_SLOTS[s.slot]
    if (positions && !tabs.some((t) => t.id === s.slot)) {
      tabs.push({ id: s.slot, label: s.slot.replace('_', ' '), positions })
    }
  }
  return tabs
}

export function playersOptions(db: Db, leagueId: string): PlayersOptions {
  const league = getLeague(db, leagueId)
  const state = getNflState(db)
  const season = league ? Number(league.season) : state ? Number(state.season) : 0
  return {
    seasons: [season, season - 1],
    currentWeek: state ? Math.min(Math.max(state.displayWeek, 1), 18) : 1,
    lastScoredWeek: latestPointsWeek(db, leagueId, season),
    tabs: tabsForSlots(getRules(db, leagueId)?.rosterSlots ?? []),
    projectionWeeks: listProjectionWeeks(db)
  }
}

function asPosition(value: string | null): Position | null {
  return (POSITIONS as readonly string[]).includes(value ?? '') ? (value as Position) : null
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

function sortValue(row: PlayerTableRow, key: string, mode: PlayersQuery['mode']): number | string | null {
  if (key === 'points') return mode === 'proj' ? row.projected : row.points
  if (key === 'delta') return row.delta
  if (key === 'name') return row.fullName
  if (key === 'snapPct') return row.snapPct
  if (key === 'targetShare') return row.targetShare
  if (key.startsWith('stat:')) return row.stats[key.slice(5)] ?? null
  return null
}

/** Candidate players (SQL) + one week of data attached from map lookups (JS); sorted, then capped. */
export function playersTable(db: Db, leagueId: string, q: PlayersQuery): PlayersTable {
  const rules = getRules(db, leagueId)
  const tabs = tabsForSlots(rules?.rosterSlots ?? [])
  const tab = tabs.find((t) => t.id === q.tab) ?? tabs[0]
  const where = [
    `pos IN (${tab.positions.map(() => '?').join(', ')})`,
    "(owner_roster_id IS NOT NULL OR watched IS NOT NULL OR (team IS NOT NULL AND COALESCE(status, '') != 'Inactive'))"
  ]
  const params: (string | number)[] = [leagueId, ...tab.positions]
  if (q.search?.trim()) {
    where.push("full_name LIKE ? ESCAPE '\\'")
    params.push(`%${escapeLike(q.search.trim())}%`)
  }
  if (q.freeAgents) where.push('owner_roster_id IS NULL')
  if (q.watchlist) where.push('watched IS NOT NULL')
  if (q.rookies) where.push('years_exp = 0')
  if (typeof q.owner === 'number') {
    where.push('owner_roster_id = ?')
    params.push(q.owner)
  }
  const candidates = db
    .prepare(
      `SELECT * FROM (
         SELECT p.player_id, p.full_name, CASE WHEN p.position = 'FB' THEN 'RB' ELSE p.position END AS pos,
           p.team, p.status, p.injury_status, p.years_exp,
           rp.roster_id AS owner_roster_id, COALESCE(t.team_name, t.display_name) AS owner_name,
           w.player_id AS watched, i.gsis_id, i.pfr_id, i.nflverse_team
         FROM players p
         LEFT JOIN roster_players rp ON rp.player_id = p.player_id AND rp.league_id = ?
         LEFT JOIN teams t ON t.league_id = rp.league_id AND t.roster_id = rp.roster_id
         LEFT JOIN watchlist w ON w.player_id = p.player_id
         LEFT JOIN player_ids i ON i.player_id = p.player_id
       ) WHERE ${where.join(' AND ')}`
    )
    .all(...params) as unknown as CandidateRow[]

  const { season, week } = q
  const statsByGsis = new Map(listPlayerWeeksByWeek(db, season, week).map((r) => [r.gsisId, r]))
  const teamWeeks = listTeamWeeksByWeek(db, season, week)
  const teamByCode = new Map(teamWeeks.map((t) => [t.team, t]))
  const games = listGamesByWeek(db, season, week)
  const allowed = pointsAllowedIndex(games)
  const gameByTeam = new Map<string, GameInfo>()
  for (const g of games) {
    const shared = {
      kickoff: kickoffIso(g.gameday, g.gametime),
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      final: g.homeScore !== null && g.awayScore !== null
    }
    gameByTeam.set(g.homeTeam, { ...shared, opponent: toSleeperTeam(g.awayTeam), home: true })
    gameByTeam.set(g.awayTeam, { ...shared, opponent: toSleeperTeam(g.homeTeam), home: false })
  }
  const points = listPointsByWeek(db, leagueId, season, week)
  const projections = new Map(listProjections(db, season, week).map((p) => [p.playerId, p.stats]))
  const snaps = listSnapsByWeek(db, season, week)
  const byes = teamByeWeeks(db, season)

  const rows: PlayerTableRow[] = candidates.map((r) => {
    const position = asPosition(r.pos)
    const projLine = projections.get(r.player_id) ?? null
    const projected = projLine && rules ? scoreStatLine(projLine, rules, position) : null
    let actual: StatLine | null = null
    let targetShare: number | null = null
    let snapPct: number | null = null
    if (r.nflverse_team) {
      const t = teamByCode.get(r.nflverse_team)
      if (t) {
        const opp = t.opponent ? teamByCode.get(t.opponent) : undefined
        actual = teamStatLine(t.stats, {
          pointsAllowed: allowed.get(`${t.team}|${season}|${week}`) ?? null,
          yardsAllowed: opp ? offensiveYards(opp.stats) : null
        })
      }
    } else if (r.gsis_id) {
      const s = statsByGsis.get(r.gsis_id)
      if (s) {
        actual = withDisplayStats(playerStatLine(s.stats), s.stats)
        targetShare = s.stats.target_share ?? null
      }
      if (r.pfr_id) snapPct = snaps.get(r.pfr_id) ?? null
    }
    const pts = points.get(r.player_id) ?? null
    const line = q.mode === 'proj' ? projLine : actual
    const nflverseTeam = r.team ? toNflverseTeam(r.team) : null
    return {
      playerId: r.player_id,
      fullName: r.full_name,
      position: r.pos,
      team: r.team,
      byeWeek: nflverseTeam ? (byes.get(nflverseTeam) ?? null) : null,
      injuryStatus: r.injury_status,
      rookie: r.years_exp === 0,
      watched: r.watched !== null,
      ownerRosterId: r.owner_roster_id,
      ownerName: r.owner_name,
      game: nflverseTeam ? (gameByTeam.get(nflverseTeam) ?? null) : null,
      points: pts,
      projected,
      delta: pts !== null && projected !== null ? round2(pts - projected) : null,
      stats: line ? (withKickingBuckets(line) as Record<string, number>) : {},
      snapPct,
      targetShare,
      statsAvailable: r.gsis_id !== null || r.nflverse_team !== null
    }
  })

  const dir = q.sort.dir === 'asc' ? 1 : -1
  rows.sort((a, b) => {
    const va = sortValue(a, q.sort.key, q.mode)
    const vb = sortValue(b, q.sort.key, q.mode)
    if (va === null && vb === null) return a.fullName.localeCompare(b.fullName)
    if (va === null) return 1
    if (vb === null) return -1
    const cmp = typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb
    return cmp !== 0 ? cmp * dir : a.fullName.localeCompare(b.fullName)
  })
  return { rows: rows.slice(0, TABLE_LIMIT), total: rows.length }
}
```

`src/main/ipc/handlers.ts`: replace the `searchPlayers` import with `import { playerWeeklyStats } from '@main/db/repos/playersQuery'`, add `import { playersOptions, playersTable } from '@main/db/repos/playersTable'` and `import { toggleWatch } from '@main/db/repos/watchlist'`; replace `PlayerFilter, PlayerRow` in the types import with `PlayersOptions, PlayersQuery, PlayersTable`; replace the `playersSearch` handler with:

```ts
  ipcMain.handle(IPC.playersOptions, (): PlayersOptions => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    return playersOptions(ctx.db, id)
  })

  ipcMain.handle(IPC.playersTable, (_event, query: PlayersQuery): PlayersTable => {
    const id = activeLeagueId()
    return id ? playersTable(ctx.db, id, query) : { rows: [], total: 0 }
  })

  ipcMain.handle(IPC.watchlistToggle, (_event, playerId: string): boolean =>
    toggleWatch(ctx.db, playerId, new Date().toISOString())
  )
```

`src/preload/index.ts`: in `players` replace `search:` with `options: () => ipcRenderer.invoke(IPC.playersOptions),` and `table: (query) => ipcRenderer.invoke(IPC.playersTable, query),`; add `watchlist: { toggle: (playerId) => ipcRenderer.invoke(IPC.watchlistToggle, playerId) },`.

The renderer still imports `PlayerFilter`/`PlayerRow`/`players.search` in `PlayersScreen.tsx` and `playersView.ts` — `npm run typecheck:web` fails until Task 5 rewrites them. To keep the commit green, in this task replace `src/renderer/src/screens/PlayersScreen.tsx` with the minimal placeholder below and delete `src/renderer/src/lib/playersView.ts` + `tests/renderer/lib/playersView.test.ts` (Task 5 brings them back as `playersTableView`):

```tsx
export function PlayersScreen(): React.JSX.Element {
  return <p className="text-sm text-muted-foreground">Players screen is being rebuilt.</p>
}
```

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add -A src/shared src/main tests/shared tests/main src/renderer/src/screens/PlayersScreen.tsx src/renderer/src/lib/playersView.ts tests/renderer/lib/playersView.test.ts
git commit -m "feat(ipc): add weekly players table read model

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The screen

**Files:**
- Create: `src/renderer/src/lib/playersTableView.ts`, `src/renderer/src/components/SlideOver.tsx`
- Rewrite: `src/renderer/src/screens/PlayersScreen.tsx`
- Test: `tests/renderer/lib/playersTableView.test.ts`

**Interfaces:**
- Consumes: `api.players.options/table/weeklyStats`, `api.watchlist.toggle`, `api.league.teams`; shared types from Task 4; `fmtPct`, `fmtPoints`, `errorMessage`; `PositionBadge`; shadcn `Input`, `Badge`, `Button`, `Table*`; lucide `Search`, `Star`, `X`.
- Produces: `Column`, `ColumnGroup`, `columnGroups(tabId, mode)`, `cellValue(row, col, mode)`, `cellText(value, col, mode)`, `kickoffLabel(iso, timeZone?, locale?)`, `gameLabel(row, timeZone?)`, `subLabel(row, timeZone?)`; `<SlideOver open title onClose>`; `PlayersScreen` (no props; remounted by `App` on `dataVersion`).

- [ ] **Step 1: Failing view-model tests**

`tests/renderer/lib/playersTableView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cellText, cellValue, columnGroups, gameLabel, kickoffLabel, subLabel } from '@/lib/playersTableView'
import type { PlayerTableRow } from '@shared/types'

const row = (over: Partial<PlayerTableRow> = {}): PlayerTableRow => ({
  playerId: '1', fullName: 'A', position: 'RB', team: 'PHI', byeWeek: 7, injuryStatus: null, rookie: false, watched: false,
  ownerRosterId: null, ownerName: null, game: null, points: 18.4, projected: 18.58, delta: -0.18,
  stats: { rush_yd: 60, sack: 2.5 }, snapPct: 0.83, targetShare: null, statsAvailable: true, ...over
})

describe('columnGroups', () => {
  it('follows the tab and hides Δ / usage outside stats mode', () => {
    const all = columnGroups('ALL', 'stats')
    expect(all.map((g) => g.label)).toEqual(['Fantasy', 'Rushing', 'Receiving', 'Passing', 'Usage'])
    expect(all[0].columns.map((c) => c.key)).toEqual(['points', 'delta'])
    expect(columnGroups('FLEX', 'proj').map((g) => g.label)).toEqual(['Fantasy', 'Rushing', 'Receiving', 'Passing'])
    expect(columnGroups('QB', 'stats').map((g) => g.label)).toEqual(['Fantasy', 'Passing', 'Rushing', 'Usage'])
    expect(columnGroups('QB', 'stats')[1].columns.map((c) => c.label)).toEqual(['CMP', 'ATT', 'YD', 'TD', 'INT'])
    expect(columnGroups('K', 'stats').map((g) => g.label)).toEqual(['Fantasy', 'Field goals', 'XP'])
    expect(columnGroups('DEF', 'proj').map((g) => g.label)).toEqual(['Fantasy', 'Defense', 'Allowed'])
  })
})

describe('cells', () => {
  const pts = columnGroups('ALL', 'stats')[0].columns[0]
  const delta = columnGroups('ALL', 'stats')[0].columns[1]
  const rushYd = columnGroups('ALL', 'stats')[1].columns[1]
  const snap = columnGroups('ALL', 'stats')[4].columns[0]

  it('picks the value by kind and mode', () => {
    expect(cellValue(row(), pts, 'stats')).toBe(18.4)
    expect(cellValue(row(), pts, 'proj')).toBe(18.58)
    expect(cellValue(row(), rushYd, 'stats')).toBe(60)
    expect(cellValue(row({ stats: {} }), rushYd, 'stats')).toBeNull()
    expect(cellValue(row(), snap, 'stats')).toBe(0.83)
  })

  it('formats: dash, signed delta, one decimal for projections and fractions, percent for usage', () => {
    expect(cellText(null, pts, 'stats')).toBe('—')
    expect(cellText(18.4, pts, 'stats')).toBe('18.4')
    expect(cellText(-0.18, delta, 'stats')).toBe('-0.2')
    expect(cellText(6.2, delta, 'stats')).toBe('+6.2')
    expect(cellText(60, rushYd, 'stats')).toBe('60')
    expect(cellText(2.5, rushYd, 'stats')).toBe('2.5')
    expect(cellText(84.5, rushYd, 'proj')).toBe('84.5')
    expect(cellText(18, rushYd, 'proj')).toBe('18.0')
    expect(cellText(0.83, snap, 'stats')).toBe('83%')
  })
})

describe('labels', () => {
  const NY = 'America/New_York'
  it('kickoffLabel renders weekday + time in the given zone', () => {
    expect(kickoffLabel('2026-09-11T00:15:00.000Z', NY)).toBe('Thu 8:15 PM')
    expect(kickoffLabel('2026-09-20T17:00:00.000Z', NY)).toBe('Sun 1:00 PM')
  })
  it('gameLabel: upcoming, final, bye', () => {
    const upcoming = { opponent: 'GB', home: true, kickoff: '2026-09-20T17:00:00.000Z', homeScore: null, awayScore: null, final: false }
    expect(gameLabel(row({ game: upcoming }), NY)).toBe('Sun 1:00 PM vs GB')
    expect(gameLabel(row({ game: { ...upcoming, home: false, kickoff: null } }), NY)).toBe('@ GB')
    expect(gameLabel(row({ game: { opponent: 'DAL', home: true, kickoff: null, homeScore: 24, awayScore: 20, final: true } }))).toBe('vs DAL · W 24-20')
    expect(gameLabel(row({ game: { opponent: 'DAL', home: false, kickoff: null, homeScore: 24, awayScore: 20, final: true } }))).toBe('@ DAL · L 20-24')
    expect(gameLabel(row({ game: null }))).toBe('BYE')
  })
  it('subLabel: team with bye + game; FA without a team', () => {
    expect(subLabel(row({ game: null }))).toBe('PHI (bye 7) · BYE')
    expect(subLabel(row({ byeWeek: null, game: null }))).toBe('PHI · BYE')
    expect(subLabel(row({ team: null }))).toBe('FA')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/renderer/lib/playersTableView.test.ts`.

- [ ] **Step 3: View-model**

`src/renderer/src/lib/playersTableView.ts`:

```ts
import { fmtPct } from '@/lib/format'
import type { PlayerTableRow, TableMode } from '@shared/types'

export type ColumnKind = 'points' | 'delta' | 'stat' | 'snapPct' | 'targetShare'

export interface Column {
  /** Sort key sent to `players.table` (`points`, `delta`, `snapPct`, `targetShare`, `stat:<key>`). */
  key: string
  label: string
  kind: ColumnKind
  statKey?: string
}

export interface ColumnGroup {
  label: string
  columns: Column[]
}

const stat = (statKey: string, label: string): Column => ({
  key: `stat:${statKey}`,
  label,
  kind: 'stat',
  statKey
})
const group = (label: string, columns: Column[]): ColumnGroup => ({ label, columns })

const POINTS: Column = { key: 'points', label: 'PTS', kind: 'points' }
const DELTA: Column = { key: 'delta', label: 'Δ', kind: 'delta' }
const SNAP: Column = { key: 'snapPct', label: 'SNAP%', kind: 'snapPct' }
const TGT: Column = { key: 'targetShare', label: 'TGT%', kind: 'targetShare' }
const RUSHING = group('Rushing', [stat('rush_att', 'ATT'), stat('rush_yd', 'YD'), stat('rush_td', 'TD')])
const RECEIVING = group('Receiving', [
  stat('rec', 'REC'),
  stat('rec_tgt', 'TAR'),
  stat('rec_yd', 'YD'),
  stat('rec_td', 'TD')
])
const PASSING = group('Passing', [
  stat('pass_cmp', 'CMP'),
  stat('pass_att', 'ATT'),
  stat('pass_yd', 'YD'),
  stat('pass_td', 'TD')
])
const PASSING_QB = group('Passing', [...PASSING.columns, stat('pass_int', 'INT')])
const FIELD_GOALS = group('Field goals', [
  stat('fgm', 'FGM'),
  stat('fga', 'FGA'),
  stat('fgm_0_39', '0–39'),
  stat('fgm_40_49', '40–49'),
  stat('fgm_50p', '50+')
])
const XP = group('XP', [stat('xpm', 'XPM'), stat('xpa', 'XPA')])
const DEFENSE = group('Defense', [
  stat('sack', 'SACK'),
  stat('int', 'INT'),
  stat('ff', 'FF'),
  stat('fum_rec', 'FR'),
  stat('def_td', 'TD'),
  stat('safe', 'SAFE'),
  stat('blk_kick', 'BLK')
])
const ALLOWED = group('Allowed', [stat('pts_allow', 'PTS'), stat('yds_allow', 'YDS')])

/** Sleeper's column groups per tab; Δ and usage only exist for played weeks (stats mode). */
export function columnGroups(tabId: string, mode: TableMode): ColumnGroup[] {
  const fantasy = group('Fantasy', mode === 'stats' ? [POINTS, DELTA] : [POINTS])
  const usage = (...cols: Column[]): ColumnGroup[] => (mode === 'stats' ? [group('Usage', cols)] : [])
  switch (tabId) {
    case 'QB':
      return [fantasy, PASSING_QB, RUSHING, ...usage(SNAP)]
    case 'K':
      return [fantasy, FIELD_GOALS, XP]
    case 'DEF':
      return [fantasy, DEFENSE, ALLOWED]
    default:
      return [fantasy, RUSHING, RECEIVING, PASSING, ...usage(SNAP, TGT)]
  }
}

export function cellValue(row: PlayerTableRow, col: Column, mode: TableMode): number | null {
  switch (col.kind) {
    case 'points':
      return mode === 'proj' ? row.projected : row.points
    case 'delta':
      return row.delta
    case 'snapPct':
      return row.snapPct
    case 'targetShare':
      return row.targetShare
    case 'stat':
      return row.stats[col.statKey ?? ''] ?? null
  }
}

export function cellText(value: number | null, col: Column, mode: TableMode): string {
  if (value === null) return '—'
  if (col.kind === 'snapPct' || col.kind === 'targetShare') return fmtPct(value)
  if (col.kind === 'points') return value.toFixed(1)
  if (col.kind === 'delta') return `${value > 0 ? '+' : ''}${value.toFixed(1)}`
  if (mode === 'proj') return value.toFixed(1)
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** "Sun 1:00 PM" in `timeZone` (default: the machine's). */
export function kickoffLabel(iso: string, timeZone?: string, locale = 'en-US'): string {
  return new Date(iso).toLocaleString(locale, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
    timeZone
  })
}

/** "Sun 1:00 PM vs GB" · "@ DAL · L 20-24" · "BYE". */
export function gameLabel(row: PlayerTableRow, timeZone?: string): string {
  const g = row.game
  if (!g) return 'BYE'
  const vs = `${g.home ? 'vs' : '@'} ${g.opponent}`
  if (g.final && g.homeScore !== null && g.awayScore !== null) {
    const us = g.home ? g.homeScore : g.awayScore
    const them = g.home ? g.awayScore : g.homeScore
    const result = us > them ? 'W' : us < them ? 'L' : 'T'
    return `${vs} · ${result} ${us}-${them}`
  }
  return g.kickoff ? `${kickoffLabel(g.kickoff, timeZone)} ${vs}` : vs
}

/** Second line under the name: "PHI (bye 7) · Sun 1:00 PM vs GB"; "FA" without a team. */
export function subLabel(row: PlayerTableRow, timeZone?: string): string {
  if (!row.team) return 'FA'
  const team = row.byeWeek ? `${row.team} (bye ${row.byeWeek})` : row.team
  return `${team} · ${gameLabel(row, timeZone)}`
}
```

- [ ] **Step 4: Run to verify the view-model tests pass**, then build the components.

`src/renderer/src/components/SlideOver.tsx`:

```tsx
import { useEffect } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SlideOverProps {
  open: boolean
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
}

/** Right-edge overlay panel; closes on the X button, the backdrop or Escape. */
export function SlideOver({ open, title, onClose, children }: SlideOverProps): React.JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close" className="flex-1 bg-black/40" onClick={onClose} />
      <aside className="flex h-full w-[520px] max-w-full flex-col border-l bg-background shadow-xl">
        <header className="flex items-center gap-2 border-b px-4 py-3">
          <div className="min-w-0 flex-1 text-sm font-semibold">{title}</div>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onClose} aria-label="Close panel">
            <X className="size-4" />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
      </aside>
    </div>
  )
}
```

`src/renderer/src/screens/PlayersScreen.tsx` (full replacement):

```tsx
import { useCallback, useEffect, useState } from 'react'
import { Search, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { PositionBadge } from '@/components/PositionBadge'
import { SlideOver } from '@/components/SlideOver'
import { api } from '@/lib/api'
import { errorMessage, fmtPct, fmtPoints } from '@/lib/format'
import { cellText, cellValue, columnGroups, subLabel, type Column } from '@/lib/playersTableView'
import { cn } from '@/lib/utils'
import type {
  PlayersOptions,
  PlayersQuery,
  PlayerTableRow,
  TableMode,
  TableSort,
  Team,
  WeekStats
} from '@shared/types'

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'
const WEEKS = Array.from({ length: 18 }, (_, i) => i + 1)

function Chip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 rounded-full border px-3 text-sm transition-colors',
        active
          ? 'border-primary/60 bg-primary/15 text-foreground'
          : 'border-border text-muted-foreground hover:bg-accent/40'
      )}
    >
      {children}
    </button>
  )
}

export function PlayersScreen(): React.JSX.Element {
  const [options, setOptions] = useState<PlayersOptions | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [tab, setTab] = useState('ALL')
  const [mode, setMode] = useState<TableMode>('stats')
  const [season, setSeason] = useState<number | null>(null)
  const [week, setWeek] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [freeAgents, setFreeAgents] = useState(false)
  const [watchlist, setWatchlist] = useState(false)
  const [rookies, setRookies] = useState(false)
  const [owner, setOwner] = useState('')
  const [sort, setSort] = useState<TableSort>({ key: 'points', dir: 'desc' })
  const [rows, setRows] = useState<PlayerTableRow[]>([])
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<PlayerTableRow | null>(null)
  const [weeks, setWeeks] = useState<WeekStats[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api.players
      .options()
      .then((o) => {
        setOptions(o)
        setSeason((s) => s ?? o.seasons[0])
        setWeek((w) => w ?? o.currentWeek)
        // default to Projection when the current week has not been scored yet
        setMode(o.lastScoredWeek !== null && o.lastScoredWeek >= o.currentWeek ? 'stats' : 'proj')
      })
      .catch((err) => setError(errorMessage(err)))
    void api.league
      .teams()
      .then(setTeams)
      .catch((err) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    if (season === null || week === null) return
    const query: PlayersQuery = {
      season,
      week,
      mode,
      tab,
      search: search.trim() || undefined,
      freeAgents: freeAgents || undefined,
      watchlist: watchlist || undefined,
      rookies: rookies || undefined,
      owner: owner ? Number(owner) : undefined,
      sort
    }
    const handle = setTimeout(() => {
      void api.players
        .table(query)
        .then((t) => {
          setError(null)
          setRows(t.rows)
          setTotal(t.total)
        })
        .catch((err) => setError(errorMessage(err)))
    }, 150)
    return () => clearTimeout(handle)
  }, [season, week, mode, tab, search, freeAgents, watchlist, rookies, owner, sort])

  useEffect(() => {
    if (!selected) return
    void api.players
      .weeklyStats(selected.playerId)
      .then(setWeeks)
      .catch((err) => setError(errorMessage(err)))
  }, [selected])

  const closePanel = useCallback(() => setSelected(null), [])

  async function toggleWatch(row: PlayerTableRow): Promise<void> {
    try {
      const watched = await api.watchlist.toggle(row.playerId)
      setRows((list) => list.map((r) => (r.playerId === row.playerId ? { ...r, watched } : r)))
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  function sortBy(col: Column): void {
    setSort((s) =>
      s.key === col.key ? { key: col.key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key: col.key, dir: 'desc' }
    )
  }

  const groups = columnGroups(tab, mode)
  const columns = groups.flatMap((g) => g.columns)
  const weekPlayed = options?.lastScoredWeek !== null && week !== null && (options?.lastScoredWeek ?? 0) >= week
  const projectionsStored =
    options?.projectionWeeks.some((p) => p.season === season && p.week === week) ?? false
  const empty =
    rows.length === 0
      ? mode === 'stats' && !weekPlayed
        ? `Week ${week} hasn't been played yet — switch to Projection.`
        : mode === 'proj' && !projectionsStored
          ? `No projections stored for week ${week} (they are fetched from the current week on).`
          : 'No players match.'
      : null

  return (
    <div className="space-y-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-full border p-1">
          {(options?.tabs ?? []).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'h-7 rounded-full px-3 text-sm font-medium transition-colors',
                tab === t.id ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-2 size-4 text-muted-foreground" />
          <Input
            placeholder="Find player"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-52 pl-8"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5">
          {(['proj', 'stats'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'h-7 rounded px-3 text-sm',
                mode === m ? 'bg-primary/20 text-foreground' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m === 'proj' ? 'Projection' : 'Stats'}
            </button>
          ))}
        </div>
        <select className={selectClass} value={season ?? ''} onChange={(e) => setSeason(Number(e.target.value))}>
          {(options?.seasons ?? []).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className={selectClass} value={week ?? ''} onChange={(e) => setWeek(Number(e.target.value))}>
          {WEEKS.map((w) => (
            <option key={w} value={w}>
              Week {w}
            </option>
          ))}
        </select>
        <Chip active={freeAgents} onClick={() => setFreeAgents((v) => !v)}>
          Free agents
        </Chip>
        <Chip active={watchlist} onClick={() => setWatchlist((v) => !v)}>
          Watchlist
        </Chip>
        <Chip active={rookies} onClick={() => setRookies((v) => !v)}>
          Rookies
        </Chip>
        <select className={cn(selectClass, 'ml-auto')} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Any owner</option>
          {teams.map((t) => (
            <option key={t.rosterId} value={String(t.rosterId)}>
              {t.teamName ?? t.displayName}
            </option>
          ))}
        </select>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead colSpan={3} />
            {groups.map((g) => (
              <TableHead
                key={g.label}
                colSpan={g.columns.length}
                className="border-l text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {g.label}
              </TableHead>
            ))}
          </TableRow>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Player</TableHead>
            <TableHead className="w-32">Owner</TableHead>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                onClick={() => sortBy(col)}
                className={cn(
                  'w-14 cursor-pointer select-none text-right',
                  sort.key === col.key && 'text-foreground'
                )}
              >
                {col.label}
                {sort.key === col.key ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : ''}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((p) => (
            <TableRow
              key={p.playerId}
              onClick={() => {
                setSelected(p)
                setWeeks([])
              }}
              className={cn('cursor-pointer', selected?.playerId === p.playerId && 'bg-accent/60')}
            >
              <TableCell className="pr-0">
                <button
                  type="button"
                  aria-label={p.watched ? 'Remove from watchlist' : 'Add to watchlist'}
                  onClick={(e) => {
                    e.stopPropagation()
                    void toggleWatch(p)
                  }}
                  className={cn('text-muted-foreground hover:text-foreground', p.watched && 'text-yellow-400')}
                >
                  <Star className="size-4" fill={p.watched ? 'currentColor' : 'none'} />
                </button>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <PositionBadge position={p.position} />
                  <span className="font-medium">{p.fullName}</span>
                  {p.rookie && (
                    <Badge variant="outline" className="h-4 px-1 text-[10px]">
                      R
                    </Badge>
                  )}
                  {p.injuryStatus && <span className="text-xs text-destructive">{p.injuryStatus}</span>}
                </div>
                <div className="text-xs text-muted-foreground">{subLabel(p)}</div>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {p.ownerName ?? <span className="italic">Free agent</span>}
              </TableCell>
              {columns.map((col) => {
                const value = p.statsAvailable || mode === 'proj' ? cellValue(p, col, mode) : null
                return (
                  <TableCell
                    key={col.key}
                    className={cn(
                      'text-right tabular-nums',
                      col.kind === 'points' && 'font-medium',
                      col.kind === 'delta' && value !== null && (value >= 0 ? 'text-pos-rb' : 'text-destructive')
                    )}
                  >
                    {cellText(value, col, mode)}
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
          {empty && (
            <TableRow>
              <TableCell colSpan={3 + columns.length} className="py-8 text-center text-sm text-muted-foreground">
                {empty}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {total > rows.length && (
        <p className="text-xs text-muted-foreground">
          Showing {rows.length} of {total} — refine the filters to see the rest.
        </p>
      )}

      <SlideOver
        open={selected !== null}
        onClose={closePanel}
        title={
          selected && (
            <span className="flex items-center gap-2">
              <PositionBadge position={selected.position} />
              {selected.fullName}
              <span className="font-normal text-muted-foreground">{selected.team ?? 'FA'}</span>
            </span>
          )
        }
      >
        {selected && !selected.statsAvailable && (
          <p className="text-sm text-muted-foreground">
            Stats unavailable — this player could not be matched to nflverse data.
          </p>
        )}
        {selected?.statsAvailable && weeks.length === 0 && (
          <p className="text-sm text-muted-foreground">No games yet this season.</p>
        )}
        {weeks.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Wk</TableHead>
                <TableHead className="w-14">Opp</TableHead>
                <TableHead className="w-14 text-right">Pts</TableHead>
                {selected?.position !== 'DEF' && <TableHead className="w-14 text-right">Snap%</TableHead>}
                {columnGroups(selected?.position ?? 'ALL', 'stats')
                  .slice(1)
                  .flatMap((g) => g.columns)
                  .filter((c) => c.kind === 'stat')
                  .map((c) => (
                    <TableHead key={c.key} className="text-right">
                      {c.label}
                    </TableHead>
                  ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {weeks.map((w) => (
                <TableRow key={w.week}>
                  <TableCell className="tabular-nums">{w.week}</TableCell>
                  <TableCell className="text-muted-foreground">{w.opponent ?? '—'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtPoints(w.points)}</TableCell>
                  {selected?.position !== 'DEF' && (
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {fmtPct(w.snaps?.offensePct ?? null)}
                    </TableCell>
                  )}
                  {columnGroups(selected?.position ?? 'ALL', 'stats')
                    .slice(1)
                    .flatMap((g) => g.columns)
                    .filter((c) => c.kind === 'stat')
                    .map((c) => (
                      <TableCell key={c.key} className="text-right tabular-nums">
                        {cellText(w.stats[weekStatKey(c.statKey ?? '')] ?? null, c, 'stats')}
                      </TableCell>
                    ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SlideOver>
    </div>
  )
}

/** The slide-over reads raw nflverse rows; map the Sleeper column keys back to nflverse names. */
const WEEK_STAT_KEYS: Record<string, string> = {
  rush_att: 'carries',
  rush_yd: 'rushing_yards',
  rush_td: 'rushing_tds',
  rec: 'receptions',
  rec_tgt: 'targets',
  rec_yd: 'receiving_yards',
  rec_td: 'receiving_tds',
  pass_cmp: 'completions',
  pass_att: 'attempts',
  pass_yd: 'passing_yards',
  pass_td: 'passing_tds',
  pass_int: 'passing_interceptions',
  fgm: 'fg_made',
  fga: 'fg_att',
  fgm_40_49: 'fg_made_40_49',
  xpm: 'pat_made',
  xpa: 'pat_att',
  sack: 'def_sacks',
  int: 'def_interceptions',
  ff: 'def_fumbles_forced',
  fum_rec: 'fumble_recovery_opp',
  def_td: 'def_tds',
  safe: 'def_safeties'
}

function weekStatKey(sleeperKey: string): string {
  return WEEK_STAT_KEYS[sleeperKey] ?? sleeperKey
}
```

`App.tsx` needs no change (`PlayersScreen` is already routed with `key={dataVersion}`).

- [ ] **Step 5: Verify, human check, commit**

```bash
npm run typecheck && npm run lint && npm test
npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu
```

Human check (user): tabs incl. FLEX; Projection is the default while the current week is unplayed and shows projected points under the league's rules with one-decimal stats; Stats for a played week shows actuals, `Δ`, `SNAP%`/`TGT%`; K and DEF tabs switch the groups; the game line shows local kickoff times, results for played games and `BYE`; star toggles persist across a reload; Free agents / Watchlist / Rookies chips and the owner select narrow the list; header click sorts; row click opens the slide-over; Escape closes it; the two toolbar rows fit at 1280 px without wrapping into a third.

```bash
git add src/renderer/src/lib/playersTableView.ts src/renderer/src/components/SlideOver.tsx src/renderer/src/screens/PlayersScreen.tsx tests/renderer/lib/playersTableView.test.ts
git commit -m "feat(ui): rebuild players screen as weekly table

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Version 0.4.0, Windows build, tag

Only after the user has checked Task 5 in the dev app and asked for the build.

- [ ] **Step 1:** `package.json` / `package-lock.json` version `0.3.0` → `0.4.0`; verify; commit `build: bump version to 0.4.0`.
- [ ] **Step 2:** `npm run build:win`; copy `dist/FantasyCompanion-Setup-0.4.0.exe` to `/mnt/c/Users/habie/OneDrive/Bureau/`.
- [ ] **Step 3:** User installs over 0.3.0 (migration 004 on the existing DB), confirms the Players screen and that a Refresh writes `sleeper:projections:<season>:<week>` (status bar: no error).
- [ ] **Step 4:** Progress notes in this plan, commit `docs(plan): mark plan D complete`, tag `v0.4.0`, fast-forward `main`, delete the branch.

## Self-review notes

- **Spec coverage:** §2.1 endpoint, vocabulary, scored on read, 404/410 → skipped (T1, T3); §2.2 `gametime` (T2); §3 tables (T2); §4 sync step placement, freshness, regular-season guard, full-week replace, message (T3); §5 IPC trio, `PlayersQuery`/`PlayerTableRow`/`GameInfo`, tabs from roster slots, FB→RB, candidate rule, four map lookups, display keys, `Δ`, JS sort + cap (T4); §6 two toolbar rows, groups per tab, row anatomy, slide-over, empty states, local kickoff time (T5); §7 unavailable projections → skipped + empty state (T3, T5); `statsAvailable` (T4/T5); §8 tests listed per task; §9 files match the file map.
- **Placeholder scan:** none.
- **Type consistency:** `ProjectionRecord` defined once (T2 repo; T1 defines it locally then T2 moves it — both spellings identical); `PlayersQuery.sort: TableSort` (T4) is what `PlayersScreen` holds in state (T5) and what `Column.key` produces (T5); `PlayerTableRow.stats` is `Record<string, number>` in both modes (T4) and `cellValue` reads it by `statKey` (T5); `GameInfo.opponent` is a Sleeper code (T4 `toSleeperTeam`) so `gameLabel` prints it verbatim (T5); `kickoffIso` (T4) → `kickoffLabel` (T5); `listSnapsByWeek` returns `Map<string, number | null>` and the row's `snapPct` is `number | null` (T4).
