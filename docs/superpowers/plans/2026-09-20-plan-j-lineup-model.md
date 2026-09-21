# Plan J — Lineup model (slice 6a, phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Lineup` screen that shows, for any week, my optimal lineup under the league's slots and scoring next to the lineup I set on Sleeper, the swaps between them, the close calls with context, and this week's opponent with both projected totals — plus the rest-of-season team-strength numbers (`lineup.strength`) the League screen will surface in Plan K.

**Architecture:** Sleeper's keyless `/league/{id}/matchups/{week}` is synced into a new `matchups` table by one step of the Sleeper part of the refresh. A pure engine `src/main/lineup/optimal.ts` expands the app's `rosterSlots` into starting slots and solves an exact maximum-weight assignment (Hungarian algorithm) of players to slots; `src/main/lineup/build.ts` turns the existing per-(league, season) `ValueBuild` (series, signals, defense ranks) plus teams, matchups and the current starters into per-team per-week lineups, swaps, close calls and team strength, cached next to the value build. Two IPC calls (`lineup.week`, `lineup.strength`) serve the renderer; `screens/LineupScreen.tsx` renders with pure helpers in `lib/lineupView.ts`.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4 + shadcn, `node:sqlite`, Vitest 5 (jsdom + Testing Library for component tests), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md` — §2 engine, §3 matchups, §4 build/IPC/types, §5.1 screen items 1–4, §6 errors, §7 tests, §9 phasing (Plan J = v0.10.0).

## Global Constraints

- Same as Plans C–I: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use`), no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`. Path aliases: `@main/*`, `@shared/*`, `@/*` (renderer).
- **Keyless** (spec §3.1): the matchups endpoint is Sleeper's documented REST API, same client, same retry rule (one retry on 429/5xx), no key.
- **Player value for a week** (spec §2.2): actual `points` when the week is played, else the league-scored `projected`, else `0`. **Availability** (spec §2.3): `ir`/`taxi` roster slots never start (current and future weeks); in the **current week only**, `injuryStatus ∈ UNAVAILABLE_STATUSES = {Out, Doubtful, IR, PUP, Sus, COV, NA, DNR}` → value `0`, listed as unavailable; `Questionable` keeps its value, flagged. Byes are value `0`, flag `bye`, still eligible.
- **Optimiser** (spec §2.4): exact max-weight assignment; ineligible pairs impossible; filling a slot always beats leaving it empty; deterministic placement of the chosen set (dedicated slots first, highest value; then flex slots from the most restrictive; ties by name then id).
- **Close call** (spec §2.5): best eligible bench alternative within `CLOSE_CALL_PTS = 2.0` of the chosen starter. **Swaps**: set difference between optimal and current starters (a player moving between two slots is not a swap), paired same-position first, `delta = value(in) − value(out ?? 0)`.
- **Current lineup mapping** (spec §3.4): `starters[i]` ↔ the i-th entry of Sleeper's `roster_positions` with `BN`, `IR`, `TAXI` removed; `'0'` = empty slot; non-lineup (IDP) entries dropped. Source: the week's `matchups` row, else (current week only) `roster_players.starter_index`, else `null`.
- **Strength** (spec §4.1): per team, weeks `currentWeek..18` on the current roster; `null` when no projections are stored or the season is over.
- **Payload conventions**: `null` = not computable; point values rounded to 2 decimals (`round2`); team codes are Sleeper's.
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits, summary ≤ 50 chars, imperative, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- ESLint is strict: explicit return types on every function (tests included), `react-hooks/set-state-in-effect` is an error (use keyed state as `PlayerDetailPanel` does), no unused vars.
- Spec deviations locked in here:
  - **`matchups.season` is `INTEGER`** (spec §3.2 says TEXT): every other per-season table (`expert_ranks`, `player_week_projections`) stores the season as an integer; the repo takes `season: number`.
  - **`LineupPlayer.statsAvailable: boolean`** is added to the spec §4.3 type so a lineup player can open the existing `PlayerDetailPanel`, whose prop is widened to a minimal `DetailTarget` (`playerId, fullName, position, team, statsAvailable`).
  - **`roster_players.starter_index` becomes the index in Sleeper's unfiltered `starters` array** (today it is the index after dropping `'0'` entries, which breaks the slot mapping whenever a slot is empty). `listRoster`'s ordering is unchanged.
  - **Past weeks use the roster that played** (`matchups.players_json`) for the optimal/retrospective lineup; the current and future weeks use the current roster (spec §4.1 only states the latter). Without a matchups row a past week falls back to the current roster.
  - **Week status at the current week is `final` once every player with a game has played** (spec §4.3 says "none / some / all"): Sleeper's `week` advances a day after the last game, so this is what makes the header show the result on Tuesday morning.
  - **Sync step position**: `refreshMatchups` runs right after the league/rosters step in both `refreshSleeper` and `importLeague` (spec §3.3: "after rosters"), taking the league id explicitly.

## File map

| File | Change |
| --- | --- |
| `src/main/sources/sleeper-types.ts` (modify) | `SleeperMatchup` |
| `src/main/sources/sleeper.ts` (modify) | `getMatchups(leagueId, week)` |
| `tests/fixtures/sleeper.ts` (modify) | `matchups(week)` fixture |
| `tests/main/sources/sleeper.test.ts`, `tests/main/sync/sleeperSync.test.ts`, `tests/main/sync/refresh.test.ts` (modify) | client test; mocks gain `getMatchups` |
| `src/main/db/migrations/006_matchups.sql` (create), `migrations/index.ts` (modify), `tests/main/db/migrate.test.ts` (modify) | table; version 6 |
| `src/main/db/repos/matchups.ts` (create), `tests/main/db/matchupsRepo.test.ts` (create) | `replaceMatchupsWeek`, `listMatchups`, `matchupsWeekUpdatedAt` |
| `src/main/db/repos/teams.ts` (modify), `src/main/db/repos/leagues.ts` (modify), `src/main/sync/mappers.ts` (modify), `tests/main/sync/mappers.test.ts`, `tests/main/db/repos.test.ts` (modify) | `listStarterIndexes`, `leagueRosterPositions`, unfiltered `starterIndex` |
| `src/main/sync/matchupsSync.ts` (create), `tests/main/sync/matchupsSync.test.ts` (create), `src/main/sync/sleeperSync.ts` (modify) | mapper, freshness, step, wiring |
| `src/main/lineup/optimal.ts` (create), `tests/main/lineup/optimal.test.ts` (create) | pure engine |
| `src/shared/types.ts` (modify) | spec §4.3 types (+ `statsAvailable`, `DetailTarget`) |
| `src/main/value/build.ts` (modify) | `ValueBuild.defense` |
| `src/main/lineup/build.ts` (create), `tests/main/lineup/build.test.ts` (create) | `buildLineups`, `teamWeek`, `teamStrengths`, `lineupWeek` |
| `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/handlers.ts` (modify) | `lineup.week`, `lineup.strength`, `lineupCache` |
| `src/renderer/src/lib/lineupView.ts` (create), `tests/renderer/lib/lineupView.test.ts` (create) | view helpers |
| `src/renderer/src/screens/LineupScreen.tsx` (create), `tests/renderer/components/LineupScreen.test.tsx` (create) | the screen |
| `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/components/PlayerDetailPanel.tsx` (modify) | `lineup` screen, `DetailTarget` prop |
| `tests/fixtures/lineup.ts` (create) | `LineupWeek` fixtures for the renderer tests |
| `docs/reference/value-and-signals.md` (modify) | Lineup section, v0.10.0 |
| `package.json`, `package-lock.json` (modify) | 0.10.0 |

---

### Task 0: Branch

- [x] **Step 1:** `git checkout -b feat/lineup-model` from `main` (clean, at `1949140` or later).

---

### Task 1: Sleeper matchups client

**Files:**
- Modify: `src/main/sources/sleeper-types.ts` (after `SleeperRoster`)
- Modify: `src/main/sources/sleeper.ts` (interface + implementation)
- Modify: `tests/fixtures/sleeper.ts` (append), `tests/main/sources/sleeper.test.ts` (append), `tests/main/sync/sleeperSync.test.ts:26-40` (`fakeClient`), `tests/main/sync/refresh.test.ts:~24` (client mock)

**Interfaces:**
- Produces: `SleeperMatchup { roster_id: number; matchup_id: number | null; starters: string[] | null; players: string[] | null; points: number | null }`; `SleeperClient.getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]>` (never null — `[]` when the week has none).

- [x] **Step 1: Fixture.** Append to `tests/fixtures/sleeper.ts` (import `SleeperMatchup` from `@main/sources/sleeper-types` at the top):

```ts
/** Two-team league: rosters 1 and 2 meet every week; scores only for weeks before 3. */
export const matchups = (week: number): SleeperMatchup[] => [
  {
    roster_id: 1,
    matchup_id: 1,
    starters: ['4866', '6794', '0', 'LAR'],
    players: ['4866', '6794', '8259', 'LAR'],
    points: week < 3 ? 100 + week : 0
  },
  {
    roster_id: 2,
    matchup_id: 1,
    starters: ['7564'],
    players: ['7564', '9509'],
    points: week < 3 ? 90 + week : 0
  }
]
```

- [x] **Step 2: Failing test.** Append to `tests/main/sources/sleeper.test.ts` inside the `describe`:

```ts
  it('getMatchups hits /league/{id}/matchups/{week} and maps an empty week to []', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: fx.matchups(3) }, { status: 200, body: [] }])
    const client = createSleeperClient({ fetchImpl })
    const rows = await client.getMatchups('L1', 3)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ roster_id: 1, matchup_id: 1, starters: ['4866', '6794', '0', 'LAR'] })
    expect(fetchImpl).toHaveBeenCalledWith('https://api.sleeper.app/v1/league/L1/matchups/3', expect.anything())
    expect(await client.getMatchups('L1', 17)).toEqual([])
  })

  it('getMatchups treats a 404 as an empty week and throws on other errors', async () => {
    expect(await createSleeperClient({ fetchImpl: fakeFetch([{ status: 404 }]) }).getMatchups('L1', 1)).toEqual([])
    await expect(
      createSleeperClient({ fetchImpl: fakeFetch([{ status: 403, body: 'nope' }]) }).getMatchups('L1', 1)
    ).rejects.toThrow(/403/)
  })
```

- [x] **Step 3: Run** `npx vitest run tests/main/sources/sleeper.test.ts` — expected: FAIL (`getMatchups is not a function`, and a type error on `fx.matchups`).

- [x] **Step 4: Type.** In `src/main/sources/sleeper-types.ts`, after `SleeperRoster`:

```ts
/**
 * `GET /league/{id}/matchups/{week}`: one row per roster. `starters` is ordered like the league's
 * `roster_positions` without its BN/IR/TAXI entries, `'0'` = empty slot; the two rosters sharing a
 * `matchup_id` play each other (`null` on a bye week).
 */
export interface SleeperMatchup {
  roster_id: number
  matchup_id: number | null
  starters: string[] | null
  players: string[] | null
  points: number | null
}
```

- [x] **Step 5: Client.** In `src/main/sources/sleeper.ts`: add `SleeperMatchup` to the type import; in `SleeperClient` after `getProjections`:

```ts
  /** Weekly matchups (documented endpoint); `[]` for a week Sleeper has none for yet (playoffs before the bracket). */
  getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]>
```

and in the returned object after `getProjections`:

```ts
    getMatchups: async (leagueId, week) =>
      (await getJson<SleeperMatchup[]>(
        `/league/${encodeURIComponent(leagueId)}/matchups/${week}`
      )) ?? []
```

- [x] **Step 6: Mocks.** `tests/main/sync/sleeperSync.test.ts` `fakeClient`: add `getMatchups: vi.fn(async (_leagueId: string, week: number) => fx.matchups(week)),` after `getProjections`. `tests/main/sync/refresh.test.ts` client mock: add `getMatchups: vi.fn(async () => [])` next to `getProjections`. Grep for any other object literal typed `SleeperClient` (`grep -rn "getProjections: vi.fn" tests`) and add the same line.

- [x] **Step 7: Run** `npx vitest run tests/main/sources/sleeper.test.ts tests/main/sync` then `npm run typecheck && npm run lint` — expected: all PASS.

- [x] **Step 8: Commit** — `feat(sources): Sleeper matchups client`.

---

### Task 2: Migration 006, `matchups` repo, starters-by-slot-index

**Files:**
- Create: `src/main/db/migrations/006_matchups.sql`, `src/main/db/repos/matchups.ts`, `tests/main/db/matchupsRepo.test.ts`
- Modify: `src/main/db/migrations/index.ts`, `tests/main/db/migrate.test.ts:15,49` (5 → 6), `src/main/db/repos/teams.ts` (append), `src/main/db/repos/leagues.ts` (append), `src/main/sync/mappers.ts:69-86`, `tests/main/sync/mappers.test.ts:70-77`, `tests/main/db/repos.test.ts` (append one test)

**Interfaces:**
- Produces: `MatchupRecord { rosterId; matchupId: number | null; starters: string[]; players: string[]; points: number }`, `MatchupRow extends MatchupRecord { week: number; updatedAt: string }`; `replaceMatchupsWeek(db, leagueId, season: number, week, records, updatedAt): number`; `listMatchups(db, leagueId, season): MatchupRow[]` (by week, roster); `matchupsWeekUpdatedAt(db, leagueId, season, week): string | null`; `listStarterIndexes(db, leagueId): Map<number, (string | null)[]>`; `leagueRosterPositions(db, leagueId): string[] | null`.

- [x] **Step 1: Migration.** Create `src/main/db/migrations/006_matchups.sql`:

```sql
-- Sleeper weekly matchups (slice 6a spec §3.2): one row per roster and week, replaced per week.
-- starters_json: Sleeper's `starters` in slot order ('0' = empty slot); players_json: the roster that week.
CREATE TABLE matchups (
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  roster_id INTEGER NOT NULL,
  matchup_id INTEGER,
  starters_json TEXT NOT NULL,
  players_json TEXT NOT NULL,
  points REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, season, week, roster_id)
);
```

In `src/main/db/migrations/index.ts` add `import matchupsSql from './006_matchups.sql?raw'` and `{ version: 6, name: 'matchups', sql: matchupsSql }`. In `tests/main/db/migrate.test.ts` change both `5` expectations (`toBe(5)` at lines 15 and 49) to `6`.

- [x] **Step 2: Failing repo test.** Create `tests/main/db/matchupsRepo.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { type Db } from '@main/db/connection'
import {
  listMatchups,
  matchupsWeekUpdatedAt,
  replaceMatchupsWeek,
  type MatchupRecord
} from '@main/db/repos/matchups'
import { leagueRosterPositions } from '@main/db/repos/leagues'
import { listStarterIndexes } from '@main/db/repos/teams'
import { seedLeague } from '../../fixtures/db'

const T1 = '2026-09-20T10:00:00.000Z'
const T2 = '2026-09-20T11:00:00.000Z'

const rec = (rosterId: number, points: number, starters: string[] = ['a', '0', 'b']): MatchupRecord => ({
  rosterId,
  matchupId: 1,
  starters,
  players: [...starters.filter((s) => s !== '0'), 'c'],
  points
})

describe('matchups repo', () => {
  let db: Db
  beforeEach(() => {
    db = seedLeague()
  })

  it('replaces one week at a time and lists by week then roster', () => {
    expect(replaceMatchupsWeek(db, 'L1', 2026, 1, [rec(2, 90), rec(1, 100)], T1)).toBe(2)
    replaceMatchupsWeek(db, 'L1', 2026, 2, [rec(1, 0)], T1)
    const rows = listMatchups(db, 'L1', 2026)
    expect(rows.map((r) => [r.week, r.rosterId, r.points])).toEqual([
      [1, 1, 100],
      [1, 2, 90],
      [2, 1, 0]
    ])
    expect(rows[0]).toMatchObject({ matchupId: 1, starters: ['a', '0', 'b'], players: ['a', 'b', 'c'], updatedAt: T1 })
    replaceMatchupsWeek(db, 'L1', 2026, 1, [rec(1, 101)], T2)
    expect(listMatchups(db, 'L1', 2026).filter((r) => r.week === 1)).toHaveLength(1)
    replaceMatchupsWeek(db, 'L1', 2026, 2, [], T2)
    expect(listMatchups(db, 'L1', 2026).map((r) => r.week)).toEqual([1])
  })

  it('reports when a week was last written', () => {
    expect(matchupsWeekUpdatedAt(db, 'L1', 2026, 1)).toBeNull()
    replaceMatchupsWeek(db, 'L1', 2026, 1, [rec(1, 100)], T1)
    expect(matchupsWeekUpdatedAt(db, 'L1', 2026, 1)).toBe(T1)
    expect(matchupsWeekUpdatedAt(db, 'L1', 2025, 1)).toBeNull()
  })

  it('exposes the current starters by slot index and the raw roster_positions', () => {
    // Fixture roster 1: starters ['4866', '6794', '0', 'LAR'] → index 2 is empty.
    expect(listStarterIndexes(db, 'L1').get(1)).toEqual(['4866', '6794', null, 'LAR'])
    expect(listStarterIndexes(db, 'L1').get(2)).toEqual(['7564'])
    expect(leagueRosterPositions(db, 'L1')).toEqual([
      'QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN', 'IR'
    ])
    expect(leagueRosterPositions(db, 'nope')).toBeNull()
  })
})
```

(Check the fixture's exact `roster_positions` list in `tests/fixtures/sleeper.ts:46-63` and paste it verbatim into the last expectation.)

- [x] **Step 3: Run** `npx vitest run tests/main/db/matchupsRepo.test.ts` — expected: FAIL (module not found).

- [x] **Step 4: Repo.** Create `src/main/db/repos/matchups.ts`:

```ts
import type { Db } from '../connection'

export interface MatchupRecord {
  rosterId: number
  /** Rosters sharing a matchup id play each other; null on a bye week. */
  matchupId: number | null
  /** Sleeper's `starters` in slot order; `'0'` = empty slot. */
  starters: string[]
  /** The roster that week. */
  players: string[]
  points: number
}

export interface MatchupRow extends MatchupRecord {
  week: number
  updatedAt: string
}

interface Row {
  week: number
  roster_id: number
  matchup_id: number | null
  starters_json: string
  players_json: string
  points: number
  updated_at: string
}

/** Full replace of one (league, season, week); empty `records` clears the week. Wrap in `withTransaction`. */
export function replaceMatchupsWeek(
  db: Db,
  leagueId: string,
  season: number,
  week: number,
  records: MatchupRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM matchups WHERE league_id = ? AND season = ? AND week = ?').run(
    leagueId,
    season,
    week
  )
  const insert = db.prepare(
    `INSERT INTO matchups (league_id, season, week, roster_id, matchup_id, starters_json, players_json, points, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  for (const r of records) {
    insert.run(
      leagueId,
      season,
      week,
      r.rosterId,
      r.matchupId,
      JSON.stringify(r.starters),
      JSON.stringify(r.players),
      r.points,
      updatedAt
    )
  }
  return records.length
}

export function listMatchups(db: Db, leagueId: string, season: number): MatchupRow[] {
  const rows = db
    .prepare(
      `SELECT week, roster_id, matchup_id, starters_json, players_json, points, updated_at
       FROM matchups WHERE league_id = ? AND season = ? ORDER BY week, roster_id`
    )
    .all(leagueId, season) as unknown as Row[]
  return rows.map((r) => ({
    week: r.week,
    rosterId: r.roster_id,
    matchupId: r.matchup_id,
    starters: JSON.parse(r.starters_json) as string[],
    players: JSON.parse(r.players_json) as string[],
    points: r.points,
    updatedAt: r.updated_at
  }))
}

/** When the week was last written (its rows share one timestamp); null when nothing is stored. */
export function matchupsWeekUpdatedAt(
  db: Db,
  leagueId: string,
  season: number,
  week: number
): string | null {
  const row = db
    .prepare(
      'SELECT MAX(updated_at) AS updated_at FROM matchups WHERE league_id = ? AND season = ? AND week = ?'
    )
    .get(leagueId, season, week) as { updated_at: string | null } | undefined
  return row?.updated_at ?? null
}
```

- [x] **Step 5: Starters by index + roster_positions.** Append to `src/main/db/repos/teams.ts`:

```ts
/**
 * Per roster, the current starters by Sleeper slot index (`null` = empty slot) — the current-week
 * fallback for the lineup screen when no matchups row exists yet (slice 6a spec §3.4).
 */
export function listStarterIndexes(db: Db, leagueId: string): Map<number, (string | null)[]> {
  const rows = db
    .prepare(
      `SELECT roster_id, player_id, starter_index FROM roster_players
       WHERE league_id = ? AND slot = 'starter' AND starter_index IS NOT NULL
       ORDER BY roster_id, starter_index`
    )
    .all(leagueId) as unknown as { roster_id: number; player_id: string; starter_index: number }[]
  const out = new Map<number, (string | null)[]>()
  for (const r of rows) {
    const starters = out.get(r.roster_id) ?? []
    while (starters.length < r.starter_index) starters.push(null)
    starters[r.starter_index] = r.player_id
    out.set(r.roster_id, starters)
  }
  return out
}
```

Append to `src/main/db/repos/leagues.ts`:

```ts
/** Sleeper's `roster_positions` from the raw league payload; null when the league or the field is missing. */
export function leagueRosterPositions(db: Db, leagueId: string): string[] | null {
  const row = db.prepare('SELECT sleeper_raw FROM leagues WHERE league_id = ?').get(leagueId) as
    | { sleeper_raw: string }
    | undefined
  if (!row) return null
  try {
    const raw = JSON.parse(row.sleeper_raw) as { roster_positions?: unknown }
    return Array.isArray(raw.roster_positions) &&
      raw.roster_positions.every((s) => typeof s === 'string')
      ? (raw.roster_positions as string[])
      : null
  } catch {
    return null
  }
}
```

- [x] **Step 6: Unfiltered starter index.** In `src/main/sync/mappers.ts` replace the body of `mapRosterPlayers` (lines 69–86) with:

```ts
export function mapRosterPlayers(rosters: SleeperRoster[]): RosterPlayerRecord[] {
  const out: RosterPlayerRecord[] = []
  for (const r of rosters) {
    const starters = r.starters ?? []
    const starterSet = new Set(starters.filter((id) => id !== EMPTY_STARTER_SLOT))
    const reserve = new Set(r.reserve ?? [])
    const taxi = new Set(r.taxi ?? [])
    // starterIndex is the position in Sleeper's `starters` array, empty slots included, so it maps onto roster_positions.
    starters.forEach((playerId, starterIndex) => {
      if (playerId === EMPTY_STARTER_SLOT) return
      out.push({ rosterId: r.roster_id, playerId, slot: 'starter', starterIndex })
    })
    for (const playerId of r.players ?? []) {
      if (starterSet.has(playerId)) continue
      const slot = reserve.has(playerId) ? 'ir' : taxi.has(playerId) ? 'taxi' : 'bench'
      out.push({ rosterId: r.roster_id, playerId, slot, starterIndex: null })
    }
  }
  return out
}
```

In `tests/main/sync/mappers.test.ts:72` change `{ rosterId: 1, playerId: 'LAR', slot: 'starter', starterIndex: 2 }` to `starterIndex: 3`.

- [x] **Step 7: Run** `npx vitest run tests/main/db tests/main/sync/mappers.test.ts` then `npm run typecheck && npm run lint` — expected: PASS (migrate 6, repo tests green, mappers updated).

- [x] **Step 8: Commit** — `feat(db): matchups table and repo, starters by slot`.

---

### Task 3: Matchups sync step

**Files:**
- Create: `src/main/sync/matchupsSync.ts`, `tests/main/sync/matchupsSync.test.ts`
- Modify: `src/main/sync/sleeperSync.ts:172-185` (`refreshSleeper`), `:154-170` (`importLeague`)

**Interfaces:**
- Consumes: `SleeperClient.getMatchups`, `replaceMatchupsWeek`, `matchupsWeekUpdatedAt`, `runStep`/`SkipStep`/`nowOf` from `./step`, `LAST_WEEK` from `@main/value/series`.
- Produces: `sourceMatchups(season): string` (`sleeper:matchups:{season}`), `MATCHUPS_PAST_FRESHNESS_MS`, `mapMatchups(items: SleeperMatchup[]): MatchupRecord[]`, `refreshMatchups(deps: SyncDeps, leagueId: string, force: boolean): Promise<SyncLogEntry>`.

- [x] **Step 1: Failing test.** Create `tests/main/sync/matchupsSync.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@main/db/connection'
import { listMatchups } from '@main/db/repos/matchups'
import { setNflState } from '@main/db/repos/state'
import type { SleeperClient } from '@main/sources/sleeper'
import type { SleeperMatchup } from '@main/sources/sleeper-types'
import {
  mapMatchups,
  MATCHUPS_PAST_FRESHNESS_MS,
  refreshMatchups,
  sourceMatchups
} from '@main/sync/matchupsSync'
import type { SyncDeps } from '@main/sync/step'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as fx from '../../fixtures/sleeper'

const T0 = new Date('2026-09-20T12:00:00.000Z')

function deps(db: Db, getMatchups: SleeperClient['getMatchups'], now = T0): SyncDeps {
  return { db, sleeper: { getMatchups } as unknown as SleeperClient, now: () => now }
}

describe('mapMatchups', () => {
  it('keeps slot order, defaults missing arrays and points', () => {
    const items: SleeperMatchup[] = [
      { roster_id: 3, matchup_id: null, starters: null, players: null, points: null },
      ...fx.matchups(1)
    ]
    expect(mapMatchups(items)[0]).toEqual({ rosterId: 3, matchupId: null, starters: [], players: [], points: 0 })
    expect(mapMatchups(items)[1]).toEqual({
      rosterId: 1,
      matchupId: 1,
      starters: ['4866', '6794', '0', 'LAR'],
      players: ['4866', '6794', '8259', 'LAR'],
      points: 101
    })
  })
})

describe('refreshMatchups', () => {
  let db: Db
  beforeEach(() => {
    db = seedLeague()
    setNflState(db, { season: '2026', week: 3, displayWeek: 3, seasonType: 'regular', fetchedAt: SEED_TS })
  })

  it('fetches all 18 weeks the first time, stores them and reports the counts', async () => {
    const getMatchups = vi.fn(async (_l: string, week: number) => (week <= 15 ? fx.matchups(week) : []))
    const entry = await refreshMatchups(deps(db, getMatchups), 'L1', false)
    expect(entry).toMatchObject({ source: sourceMatchups(2026), status: 'ok', rows: 18 })
    expect(entry.message).toBe('18 weeks fetched, 2 teams')
    expect(getMatchups).toHaveBeenCalledTimes(18)
    const rows = listMatchups(db, 'L1', 2026)
    expect(rows).toHaveLength(30)
    expect(rows.find((r) => r.week === 2 && r.rosterId === 1)).toMatchObject({ points: 102, updatedAt: T0.toISOString() })
  })

  it('skips fresh past weeks, always refetches the current and future weeks', async () => {
    const first = vi.fn(async (_l: string, week: number) => fx.matchups(week))
    await refreshMatchups(deps(db, first), 'L1', false)
    const second = vi.fn(async (_l: string, week: number) => fx.matchups(week))
    const later = new Date(T0.getTime() + 60 * 60 * 1000)
    const entry = await refreshMatchups(deps(db, second, later), 'L1', false)
    expect(second.mock.calls.map((c) => c[1])).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
    expect(entry.message).toBe('16 weeks fetched, 2 teams')
    const stale = new Date(T0.getTime() + MATCHUPS_PAST_FRESHNESS_MS + 1)
    const third = vi.fn(async (_l: string, week: number) => fx.matchups(week))
    await refreshMatchups(deps(db, third, stale), 'L1', false)
    expect(third).toHaveBeenCalledTimes(18)
  })

  it('force refetches everything and an empty answer clears a stored week', async () => {
    await refreshMatchups(deps(db, vi.fn(async (_l: string, week: number) => fx.matchups(week))), 'L1', false)
    const empty = vi.fn(async (_l: string, week: number) => (week === 1 ? [] : fx.matchups(week)))
    await refreshMatchups(deps(db, empty), 'L1', true)
    expect(empty).toHaveBeenCalledTimes(18)
    expect(listMatchups(db, 'L1', 2026).some((r) => r.week === 1)).toBe(false)
  })

  it('records a failed step and keeps what was stored so far', async () => {
    const failing = vi.fn(async (_l: string, week: number) => {
      if (week === 4) throw new Error('boom')
      return fx.matchups(week)
    })
    const entry = await refreshMatchups(deps(db, failing), 'L1', false)
    expect(entry.status).toBe('error')
    expect(entry.message).toBe('boom')
    expect(listMatchups(db, 'L1', 2026).map((r) => r.week)).toEqual([1, 1, 2, 2, 3, 3])
  })
})
```

- [x] **Step 2: Run** `npx vitest run tests/main/sync/matchupsSync.test.ts` — expected: FAIL (module not found).

- [x] **Step 3: Implementation.** Create `src/main/sync/matchupsSync.ts`:

```ts
import { withTransaction } from '@main/db/connection'
import {
  matchupsWeekUpdatedAt,
  replaceMatchupsWeek,
  type MatchupRecord
} from '@main/db/repos/matchups'
import { getNflState } from '@main/db/repos/state'
import type { SleeperMatchup } from '@main/sources/sleeper-types'
import { LAST_WEEK } from '@main/value/series'
import type { SyncLogEntry } from '@shared/types'
import { nowOf, runStep, SkipStep, type SyncDeps } from './step'

export const SOURCE_MATCHUPS_PREFIX = 'sleeper:matchups:'
export const sourceMatchups = (season: number): string => `${SOURCE_MATCHUPS_PREFIX}${season}`

/** A finished week (scores in, lineups locked) is re-fetched this rarely; current and future weeks every refresh. */
export const MATCHUPS_PAST_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000

export function mapMatchups(items: SleeperMatchup[]): MatchupRecord[] {
  return items.map((m) => ({
    rosterId: m.roster_id,
    matchupId: m.matchup_id ?? null,
    starters: m.starters ?? [],
    players: m.players ?? [],
    points: m.points ?? 0
  }))
}

/**
 * Spec §3.3: one step for the current season's 18 weeks. Past weeks are skipped while their stored
 * rows are younger than MATCHUPS_PAST_FRESHNESS_MS (unless forced); an empty answer clears the week.
 * Never throws — a failure is one `error` row, and the weeks written before it stay.
 */
export async function refreshMatchups(
  deps: SyncDeps,
  leagueId: string,
  force: boolean
): Promise<SyncLogEntry> {
  const state = getNflState(deps.db)
  const season = Number(state?.season)
  return runStep(deps, sourceMatchups(season), 0, true, async () => {
    if (!state || Number.isNaN(season)) throw new SkipStep('NFL state unknown')
    const currentWeek = Math.min(Math.max(state.week, 1), LAST_WEEK)
    const now = nowOf(deps).getTime()
    let fetched = 0
    const teams = new Set<number>()
    for (let week = 1; week <= LAST_WEEK; week++) {
      if (!force && week < currentWeek) {
        const stored = matchupsWeekUpdatedAt(deps.db, leagueId, season, week)
        if (stored && now - new Date(stored).getTime() < MATCHUPS_PAST_FRESHNESS_MS) continue
      }
      const records = mapMatchups(await deps.sleeper.getMatchups(leagueId, week))
      const ts = nowOf(deps).toISOString()
      withTransaction(deps.db, () => replaceMatchupsWeek(deps.db, leagueId, season, week, records, ts))
      fetched++
      for (const r of records) teams.add(r.rosterId)
    }
    return { rows: fetched, message: `${fetched} weeks fetched, ${teams.size} teams` }
  })
}
```

- [x] **Step 4: Wire into the Sleeper refresh.** In `src/main/sync/sleeperSync.ts` add `import { refreshMatchups } from './matchupsSync'`. In `refreshSleeper` change the league line to:

```ts
  if (leagueId) {
    steps.push(await syncLeague(deps, leagueId, myUserId, force))
    steps.push(await refreshMatchups(deps, leagueId, force))
  }
```

In `importLeague`, inside `if (leagueEntry.status === 'ok') { … }` after the two `setSetting` calls add `steps.push(await refreshMatchups(deps, leagueId, true))`.

- [x] **Step 5: Run** `npx vitest run tests/main/sync` — expected: PASS. If `refresh.test.ts` or `sleeperSync.test.ts` count steps by position (`steps[1]`…), adjust the expectation for the new `sleeper:matchups:2026` entry after the league step — keep the assertion on `source` names, not on indexes.

- [x] **Step 6:** `npm run typecheck && npm run lint && npm test` — PASS. **Commit** — `feat(sync): matchups sync step`.

---

### Task 4: Pure lineup engine — `src/main/lineup/optimal.ts`

**Files:**
- Create: `src/main/lineup/optimal.ts`, `tests/main/lineup/optimal.test.ts`
- Modify: `src/shared/types.ts` (only `LineupFlag`, the rest of the types come in Task 5)

**Interfaces:**
- Consumes: `FLEX_ELIGIBILITY`, `LINEUP_POSITIONS`, `RosterSlotCount` from `@shared/rules`; `round2` from `@main/db/repos/points`.
- Produces (all exported): `CLOSE_CALL_PTS = 2`, `UNAVAILABLE_STATUSES`, `QUESTIONABLE_STATUS`, `RESERVE_SLOTS`; `LineupSlot { slot; eligible }`, `Candidate { id; name; position; value }`, `Placed { slot; player: Candidate | null }`, `Optimal { starters: Placed[]; total; bench: Candidate[] }`, `SwapPair { slot; out: Candidate | null; in: Candidate; delta }`, `WeekLine { played; points; projected; hasGame }`; `lineupSlots(rosterSlots)`, `currentAssignments(rosterPositions, starters)`, `assign(cost)`, `optimalLineup(slots, candidates)`, `swapsBetween(optimal, current)`, `closeCall(slot, starter, bench)`, `weekValue(line)`, `weekFlag(line, injuryStatus, isCurrentWeek)`, `isUnavailable(flag)`, `byValueDesc(a, b)`.

- [x] **Step 1: `LineupFlag`.** In `src/shared/types.ts`, before `PlayerValueRow`:

```ts
/** Slice 6a spec §2.3: why a lineup player's week value is 0 or needs a second look. */
export type LineupFlag = 'out' | 'doubtful' | 'questionable' | 'bye' | null
```

- [x] **Step 2: Failing tests.** Create `tests/main/lineup/optimal.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  assign,
  CLOSE_CALL_PTS,
  closeCall,
  currentAssignments,
  isUnavailable,
  lineupSlots,
  optimalLineup,
  swapsBetween,
  weekFlag,
  weekValue,
  type Candidate,
  type LineupSlot
} from '@main/lineup/optimal'

const c = (id: string, position: string | null, value: number, name = id): Candidate => ({
  id,
  name,
  position,
  value
})

/** The user's league shape: 1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX, 1 K, 1 DEF. */
const LEAGUE = lineupSlots([
  { slot: 'QB', count: 1 },
  { slot: 'RB', count: 2 },
  { slot: 'WR', count: 2 },
  { slot: 'TE', count: 1 },
  { slot: 'FLEX', count: 2 },
  { slot: 'K', count: 1 },
  { slot: 'DEF', count: 1 },
  { slot: 'BN', count: 6 },
  { slot: 'IR', count: 1 }
])

/** Every injective slot → player assignment; best = most slots filled, then the highest total. */
function bruteForce(slots: LineupSlot[], players: Candidate[]): { filled: number; total: number } {
  let best = { filled: -1, total: Number.NEGATIVE_INFINITY }
  const used = new Array<boolean>(players.length).fill(false)
  const walk = (i: number, filled: number, total: number): void => {
    if (i === slots.length) {
      if (filled > best.filled || (filled === best.filled && total > best.total + 1e-9)) {
        best = { filled, total }
      }
      return
    }
    walk(i + 1, filled, total)
    players.forEach((p, j) => {
      if (used[j] || p.position === null || !slots[i].eligible.includes(p.position)) return
      used[j] = true
      walk(i + 1, filled + 1, total + p.value)
      used[j] = false
    })
  }
  walk(0, 0, 0)
  return best
}

/** Small deterministic generator so a failing case reproduces from its seed. */
function rng(seed: number): () => number {
  let s = seed
  return (): number => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const POOL_SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'REC_FLEX', 'WRRB_FLEX', 'K']
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', null]

describe('lineupSlots', () => {
  it('expands counts in order and drops bench, reserve and unknown slots', () => {
    expect(LEAGUE.map((s) => s.slot)).toEqual(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF'])
    expect(LEAGUE[6].eligible).toEqual(['RB', 'WR', 'TE'])
    expect(lineupSlots([{ slot: 'IDP_FLEX', count: 2 }, { slot: 'WEIRD', count: 1 }])).toEqual([])
  })
})

describe('assign', () => {
  it('finds the minimum-cost perfect matching', () => {
    expect(assign([[4, 1, 3], [2, 0, 5], [3, 2, 2]])).toEqual([1, 0, 2])
    expect(assign([])).toEqual([])
  })
})

describe('optimalLineup', () => {
  it('fills the league shape: dedicated slots take the best of each position, flex the best leftovers', () => {
    const roster = [
      c('qb1', 'QB', 20), c('qb2', 'QB', 18),
      c('rb1', 'RB', 16), c('rb2', 'RB', 12), c('rb3', 'RB', 9),
      c('wr1', 'WR', 15), c('wr2', 'WR', 11), c('wr3', 'WR', 10), c('wr4', 'WR', 4),
      c('te1', 'TE', 8), c('te2', 'TE', 7),
      c('k1', 'K', 8), c('def1', 'DEF', 6)
    ]
    const out = optimalLineup(LEAGUE, roster)
    expect(out.starters.map((e) => `${e.slot}:${e.player?.id}`)).toEqual([
      'QB:qb1', 'RB:rb1', 'RB:rb2', 'WR:wr1', 'WR:wr2', 'TE:te1', 'FLEX:wr3', 'FLEX:rb3', 'K:k1', 'DEF:def1'
    ])
    expect(out.total).toBe(115)
    expect(out.bench.map((b) => b.id)).toEqual(['qb2', 'te2', 'wr4'])
  })

  it('matches brute force on random rosters with mixed flex kinds, ties and ineligible players', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const r = rng(seed)
      const nSlots = 2 + Math.floor(r() * 3)
      const slots = lineupSlots(
        Array.from({ length: nSlots }, () => ({ slot: POOL_SLOTS[Math.floor(r() * POOL_SLOTS.length)], count: 1 }))
      )
      const nPlayers = 1 + Math.floor(r() * 7)
      const players = Array.from({ length: nPlayers }, (_, i) =>
        c(`p${i}`, POSITIONS[Math.floor(r() * POSITIONS.length)], Math.round((r() * 33 - 3) * 2) / 2)
      )
      const expected = bruteForce(slots, players)
      const actual = optimalLineup(slots, players)
      const filled = actual.starters.filter((e) => e.player !== null).length
      expect({ seed, filled, total: actual.total }).toEqual({
        seed,
        filled: expected.filled,
        total: Math.round(expected.total * 100) / 100
      })
      for (const e of actual.starters) {
        if (e.player) expect(e.player.position !== null && slots.find((s) => s.slot === e.slot)?.eligible.includes(e.player.position)).toBe(true)
      }
      expect(new Set(actual.starters.flatMap((e) => (e.player ? [e.player.id] : []))).size).toBe(filled)
    }
  })

  it('leaves slots empty only when nobody eligible is left, and still starts a negative projection', () => {
    const slots = lineupSlots([{ slot: 'QB', count: 1 }, { slot: 'RB', count: 2 }])
    const out = optimalLineup(slots, [c('rb1', 'RB', -1.5), c('wr1', 'WR', 20)])
    expect(out.starters).toEqual([
      { slot: 'QB', player: null },
      { slot: 'RB', player: c('rb1', 'RB', -1.5) },
      { slot: 'RB', player: null }
    ])
    expect(out.total).toBe(-1.5)
    expect(out.bench.map((b) => b.id)).toEqual(['wr1'])
  })

  it('places ties deterministically whatever the input order', () => {
    const slots = lineupSlots([{ slot: 'RB', count: 1 }, { slot: 'FLEX', count: 1 }])
    const a = optimalLineup(slots, [c('z', 'RB', 10, 'Zed'), c('a', 'RB', 10, 'Aaron')])
    const b = optimalLineup(slots, [c('a', 'RB', 10, 'Aaron'), c('z', 'RB', 10, 'Zed')])
    expect(a.starters.map((e) => e.player?.id)).toEqual(['a', 'z'])
    expect(b.starters).toEqual(a.starters)
  })

  it('seats the higher-valued player of a position in the dedicated slot, the other in flex', () => {
    const slots = lineupSlots([{ slot: 'RB', count: 1 }, { slot: 'FLEX', count: 1 }])
    const out = optimalLineup(slots, [c('rb2', 'RB', 8), c('rb1', 'RB', 14)])
    expect(out.starters.map((e) => e.player?.id)).toEqual(['rb1', 'rb2'])
  })
})

describe('currentAssignments', () => {
  it('maps starters onto the non-reserve roster_positions, empties as null, IDP dropped', () => {
    const positions = ['QB', 'RB', 'WR', 'FLEX', 'IDP_FLEX', 'K', 'BN', 'BN', 'IR']
    expect(currentAssignments(positions, ['q', '0', 'w', 'f', 'lb', 'k'])).toEqual([
      { slot: 'QB', id: 'q' },
      { slot: 'RB', id: null },
      { slot: 'WR', id: 'w' },
      { slot: 'FLEX', id: 'f' },
      { slot: 'K', id: 'k' }
    ])
    expect(currentAssignments(['QB', 'RB'], ['q'])).toEqual([
      { slot: 'QB', id: 'q' },
      { slot: 'RB', id: null }
    ])
    expect(currentAssignments(['QB'], ['q', 'extra'])).toEqual([{ slot: 'QB', id: 'q' }])
  })
})

describe('swapsBetween', () => {
  const slots = lineupSlots([{ slot: 'RB', count: 1 }, { slot: 'WR', count: 1 }, { slot: 'FLEX', count: 1 }])
  it('ignores players who only change slot', () => {
    const optimal = optimalLineup(slots, [c('rb1', 'RB', 10), c('wr1', 'WR', 9), c('rb2', 'RB', 8)]).starters
    const current = [
      { slot: 'RB', player: c('rb2', 'RB', 8) },
      { slot: 'WR', player: c('wr1', 'WR', 9) },
      { slot: 'FLEX', player: c('rb1', 'RB', 10) }
    ]
    expect(swapsBetween(optimal, current)).toEqual([])
  })

  it('pairs each new starter with a removed one, same position first, then the weakest', () => {
    const optimal = [
      { slot: 'RB', player: c('rb1', 'RB', 10) },
      { slot: 'WR', player: c('wr1', 'WR', 9) },
      { slot: 'FLEX', player: c('te1', 'TE', 7) }
    ]
    const current = [
      { slot: 'RB', player: c('rb2', 'RB', 4) },
      { slot: 'WR', player: c('wr1', 'WR', 9) },
      { slot: 'FLEX', player: c('wr2', 'WR', 6) }
    ]
    expect(swapsBetween(optimal, current)).toEqual([
      { slot: 'RB', out: c('rb2', 'RB', 4), in: c('rb1', 'RB', 10), delta: 6 },
      { slot: 'FLEX', out: c('wr2', 'WR', 6), in: c('te1', 'TE', 7), delta: 1 }
    ])
  })

  it('fills an empty current slot with out = null and delta = the new value', () => {
    const optimal = [{ slot: 'RB', player: c('rb1', 'RB', 10.25) }]
    expect(swapsBetween(optimal, [{ slot: 'RB', player: null }])).toEqual([
      { slot: 'RB', out: null, in: c('rb1', 'RB', 10.25), delta: 10.25 }
    ])
  })
})

describe('closeCall', () => {
  const flex = { slot: 'FLEX', eligible: ['RB', 'WR', 'TE'] }
  it('returns the best eligible bench player inside the band, else null', () => {
    const bench = [c('qb2', 'QB', 18), c('wr3', 'WR', 9), c('rb3', 'RB', 8)]
    expect(closeCall(flex, c('wr2', 'WR', 9 + CLOSE_CALL_PTS), bench)).toEqual(c('wr3', 'WR', 9))
    expect(closeCall(flex, c('wr2', 'WR', 9 + CLOSE_CALL_PTS + 0.1), bench)).toBeNull()
    expect(closeCall({ slot: 'QB', eligible: ['QB'] }, c('qb1', 'QB', 19), bench)).toEqual(c('qb2', 'QB', 18))
    expect(closeCall(flex, null, bench)).toBeNull()
    expect(closeCall(flex, c('wr2', 'WR', 9), [])).toBeNull()
  })
})

describe('weekValue / weekFlag', () => {
  const played = { played: true, points: 12.3, projected: 15, hasGame: true }
  const upcoming = { played: false, points: null, projected: 15, hasGame: true }
  const noProjection = { played: false, points: null, projected: null, hasGame: true }
  it('uses points when played, projection otherwise, 0 without either', () => {
    expect(weekValue(played)).toBe(12.3)
    expect(weekValue(upcoming)).toBe(15)
    expect(weekValue(noProjection)).toBe(0)
    expect(weekValue(null)).toBe(0)
  })
  it('flags byes always, statuses in the current week only, nothing once played', () => {
    expect(weekFlag(null, 'Out', true)).toBe('bye')
    expect(weekFlag({ ...upcoming, hasGame: false }, null, false)).toBe('bye')
    expect(weekFlag(upcoming, 'Out', true)).toBe('out')
    expect(weekFlag(upcoming, 'IR', true)).toBe('out')
    expect(weekFlag(upcoming, 'Doubtful', true)).toBe('doubtful')
    expect(weekFlag(upcoming, 'Questionable', true)).toBe('questionable')
    expect(weekFlag(upcoming, 'Out', false)).toBeNull()
    expect(weekFlag(upcoming, null, true)).toBeNull()
    expect(weekFlag(played, 'Out', true)).toBeNull()
    expect(isUnavailable('out')).toBe(true)
    expect(isUnavailable('doubtful')).toBe(true)
    expect(isUnavailable('questionable')).toBe(false)
    expect(isUnavailable('bye')).toBe(false)
    expect(isUnavailable(null)).toBe(false)
  })
})
```

- [x] **Step 3: Run** `npx vitest run tests/main/lineup/optimal.test.ts` — expected: FAIL (module not found).

- [x] **Step 4: Implementation.** Create `src/main/lineup/optimal.ts`:

```ts
import { round2 } from '@main/db/repos/points'
import { FLEX_ELIGIBILITY, LINEUP_POSITIONS, type RosterSlotCount } from '@shared/rules'
import type { LineupFlag } from '@shared/types'

/** Spec §2.5: a bench alternative within this many points of the chosen starter is a judgement call. */
export const CLOSE_CALL_PTS = 2
/** Spec §2.3: current-week injury statuses that mean the player will not play. */
export const UNAVAILABLE_STATUSES: ReadonlySet<string> = new Set([
  'Out',
  'Doubtful',
  'IR',
  'PUP',
  'Sus',
  'COV',
  'NA',
  'DNR'
])
export const QUESTIONABLE_STATUS = 'Questionable'
/** `roster_positions` entries that Sleeper's `starters` array skips. */
export const RESERVE_SLOTS: ReadonlySet<string> = new Set(['BN', 'IR', 'TAXI'])
const EMPTY_STARTER = '0'

/** Cost of an ineligible pairing; never chosen because every slot can stay empty and every player sit for less. */
const FORBIDDEN = 1e6
/** Cost of leaving a slot empty: worse than any real player (weekly points never fall below −1000). */
const EMPTY_SLOT = 1e3

export interface LineupSlot {
  slot: string
  eligible: readonly string[]
}

export interface Candidate {
  id: string
  name: string
  position: string | null
  value: number
}

export interface Placed {
  slot: string
  player: Candidate | null
}

export interface Optimal {
  /** One entry per slot, in slot order. */
  starters: Placed[]
  total: number
  /** Eligible players left out, best first. */
  bench: Candidate[]
}

export interface SwapPair {
  slot: string
  out: Candidate | null
  in: Candidate
  delta: number
}

export interface WeekLine {
  played: boolean
  points: number | null
  projected: number | null
  /** The player's team has a game that week (the series week has an opponent). */
  hasGame: boolean
}

function eligibleFor(slot: string): readonly string[] | undefined {
  return LINEUP_POSITIONS.includes(slot) ? [slot] : FLEX_ELIGIBILITY[slot]
}

/** Spec §2.1: one entry per starting slot in Sleeper's order; bench, reserve, IDP and unknown slots are dropped. */
export function lineupSlots(rosterSlots: RosterSlotCount[]): LineupSlot[] {
  const out: LineupSlot[] = []
  for (const s of rosterSlots) {
    const eligible = eligibleFor(s.slot)
    if (!eligible) continue
    for (let i = 0; i < s.count; i++) out.push({ slot: s.slot, eligible })
  }
  return out
}

/**
 * Spec §3.4: `starters[i]` sits in the i-th `roster_positions` entry that is not BN/IR/TAXI; `'0'` or a
 * missing entry is an empty slot; entries that are not lineup slots (IDP) are dropped with their player.
 */
export function currentAssignments(
  rosterPositions: string[],
  starters: (string | null)[]
): { slot: string; id: string | null }[] {
  const out: { slot: string; id: string | null }[] = []
  rosterPositions
    .filter((s) => !RESERVE_SLOTS.has(s))
    .forEach((slot, i) => {
      if (!eligibleFor(slot)) return
      const id = starters[i] ?? null
      out.push({ slot, id: id === EMPTY_STARTER ? null : id })
    })
  return out
}

/** Higher value first; ties by name, then id, so equal players always come out in the same order. */
export function byValueDesc(a: Candidate, b: Candidate): number {
  return b.value - a.value || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
}

/**
 * Minimum-cost perfect matching of a square matrix (Hungarian algorithm with potentials, O(n³)).
 * Returns the column matched to each row.
 */
export function assign(cost: number[][]): number[] {
  const n = cost.length
  const u = new Array<number>(n + 1).fill(0)
  const v = new Array<number>(n + 1).fill(0)
  const p = new Array<number>(n + 1).fill(0)
  const way = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY)
    const used = new Array<boolean>(n + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Number.POSITIVE_INFINITY
      let j1 = 0
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0 !== 0)
  }
  const result = new Array<number>(n).fill(-1)
  for (let j = 1; j <= n; j++) if (p[j] !== 0) result[p[j] - 1] = j - 1
  return result
}

/**
 * Re-seats an optimal set so equal-value ties never shuffle players between slots: dedicated slots
 * first, then flex slots from the most restrictive, each taking the best remaining eligible player.
 * Null when that order cannot seat everyone (crossing flex kinds) — the caller then keeps the
 * assignment's own placement, which has the same total.
 */
function placeDeterministically(slots: LineupSlot[], chosen: Candidate[]): Placed[] | null {
  const remaining = [...chosen].sort(byValueDesc)
  const placed: Placed[] = slots.map((s) => ({ slot: s.slot, player: null }))
  const order = slots
    .map((_, i) => i)
    .sort((a, b) => slots[a].eligible.length - slots[b].eligible.length || a - b)
  for (const i of order) {
    const k = remaining.findIndex(
      (c) => c.position !== null && slots[i].eligible.includes(c.position)
    )
    if (k === -1) continue
    placed[i].player = remaining[k]
    remaining.splice(k, 1)
  }
  return remaining.length === 0 ? placed : null
}

/**
 * Spec §2.4: exact maximum-weight assignment of candidates to slots. Rows are the slots plus one
 * "bench" row per player, columns the players plus one "empty" column per slot, so no slot ever
 * needs an ineligible player and no player ever needs a slot. Filling a slot always beats leaving
 * it empty; among full lineups the total is maximal.
 */
export function optimalLineup(slots: LineupSlot[], candidates: Candidate[]): Optimal {
  const s = slots.length
  const p = candidates.length
  const n = s + p
  const cost: number[][] = []
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n).fill(0)
    if (i < s) {
      for (let j = 0; j < n; j++) {
        if (j >= p) {
          row[j] = EMPTY_SLOT
        } else {
          const c = candidates[j]
          row[j] =
            c.position !== null && slots[i].eligible.includes(c.position) ? -c.value : FORBIDDEN
        }
      }
    }
    cost.push(row)
  }
  const match = assign(cost)
  const chosen: Candidate[] = []
  const raw: Placed[] = slots.map((slot, i) => {
    const player = match[i] < p ? candidates[match[i]] : null
    if (player) chosen.push(player)
    return { slot: slot.slot, player }
  })
  const chosenIds = new Set(chosen.map((c) => c.id))
  return {
    starters: placeDeterministically(slots, chosen) ?? raw,
    total: round2(chosen.reduce((sum, c) => sum + c.value, 0)) ?? 0,
    bench: candidates.filter((c) => !chosenIds.has(c.id)).sort(byValueDesc)
  }
}

/**
 * Spec §2.5: the starters the optimal lineup adds, each paired with one it removes — same position
 * first, then the weakest remaining; a player who only changes slot is not a swap. `out` is null
 * when the current lineup had an empty slot to fill.
 */
export function swapsBetween(optimal: Placed[], current: Placed[]): SwapPair[] {
  const ids = (placed: Placed[]): Set<string> =>
    new Set(placed.flatMap((e) => (e.player ? [e.player.id] : [])))
  const currentIds = ids(current)
  const optimalIds = ids(optimal)
  const ins = optimal
    .flatMap((e) =>
      e.player && !currentIds.has(e.player.id) ? [{ slot: e.slot, player: e.player }] : []
    )
    .sort((a, b) => byValueDesc(a.player, b.player))
  const outs = current
    .flatMap((e) => (e.player && !optimalIds.has(e.player.id) ? [e.player] : []))
    .sort((a, b) => a.value - b.value || a.name.localeCompare(b.name))
  return ins.map(({ slot, player }) => {
    let k = outs.findIndex((o) => o.position === player.position)
    if (k === -1 && outs.length > 0) k = 0
    const out = k === -1 ? null : outs.splice(k, 1)[0]
    return { slot, out, in: player, delta: round2(player.value - (out?.value ?? 0)) ?? 0 }
  })
}

/** Spec §2.5: the best bench player eligible for the slot when within CLOSE_CALL_PTS of the starter. */
export function closeCall(
  slot: LineupSlot,
  starter: Candidate | null,
  bench: Candidate[]
): Candidate | null {
  if (!starter) return null
  const alt = bench.find((c) => c.position !== null && slot.eligible.includes(c.position))
  return alt && starter.value - alt.value <= CLOSE_CALL_PTS ? alt : null
}

/** Spec §2.2: actual points when played, else the league-scored projection, else 0. */
export function weekValue(line: WeekLine | null): number {
  if (!line) return 0
  if (line.played) return line.points ?? 0
  return line.projected ?? 0
}

/** Spec §2.3: byes always; injury statuses count in the current week only; nothing once played. */
export function weekFlag(
  line: WeekLine | null,
  injuryStatus: string | null,
  isCurrentWeek: boolean
): LineupFlag {
  if (line?.played) return null
  if (!line || !line.hasGame) return 'bye'
  if (!isCurrentWeek || injuryStatus === null) return null
  if (injuryStatus === 'Doubtful') return 'doubtful'
  if (UNAVAILABLE_STATUSES.has(injuryStatus)) return 'out'
  if (injuryStatus === QUESTIONABLE_STATUS) return 'questionable'
  return null
}

/** A flag that takes the player out of the lineup (value 0, listed as unavailable). */
export function isUnavailable(flag: LineupFlag): boolean {
  return flag === 'out' || flag === 'doubtful'
}
```

- [x] **Step 5: Run** `npx vitest run tests/main/lineup/optimal.test.ts` — expected: PASS (the property test takes well under a second). If the brute-force comparison fails for a seed, print `slots` and `players` for that seed and fix the engine — never the oracle.

- [x] **Step 6:** `npm run typecheck && npm run lint` — PASS. **Commit** — `feat(lineup): optimal lineup engine`.

---

### Task 5: Shared types, `ValueBuild.defense`, `src/main/lineup/build.ts`

**Files:**
- Modify: `src/shared/types.ts` (after `LineupFlag`), `src/main/value/build.ts:20-26` (`ValueBuild`) and the return of `assembleValue` (~line 200-214)
- Create: `src/main/lineup/build.ts`, `tests/main/lineup/build.test.ts`

**Interfaces:**
- Consumes: Task 4 engine; `ValueBuild { context, rows, series, schedules }` (+ new `defense: DefenseRanks`); `MatchupRow`; `Team`; `ExpertRankRow` (`posRank`, `grade`).
- Produces: shared types `DetailTarget`, `LineupPlayer`, `SlotEntry`, `Swap`, `TeamLineup`, `LineupWeekStatus`, `LineupWeek`, `TeamStrength`; `LineupInputs`, `LineupBuild`, `buildLineups(inputs): LineupBuild`, `teamWeek(build, rosterId, week): TeamWeek`, `weekStatus(week, currentWeek, games, played)`, `lineupWeek(build, week, experts: Map<string, ExpertRankRow>): LineupWeek`, `teamStrengths(build): TeamStrength[]`.

- [x] **Step 1: Shared types.** In `src/shared/types.ts`, right after `LineupFlag`:

```ts
/** What the player detail panel needs to open for a player from any screen. */
export interface DetailTarget {
  playerId: string
  fullName: string
  position: string | null
  team: string | null
  statsAvailable: boolean
}

/** Slice 6a spec §4.3: one player's week as the lineup engine sees it. */
export interface LineupPlayer extends DetailTarget {
  /** NFL opponent that week; null on a bye. */
  opponent: string | null
  /** Defense-vs-position rank of that opponent at the player's position, 1 = allows the fewest. */
  dvpRank: number | null
  /** Spec §2.2 after §2.3: points when played, else the league-scored projection, 0 when unavailable / bye. */
  value: number
  played: boolean
  injuryStatus: string | null
  flag: LineupFlag
  /** FantasyPros weekly consensus for that week; null when the player has no row. */
  expert: { ecrPosRank: number; grade: string | null } | null
  floor: number | null
  ceiling: number | null
}

export interface SlotEntry {
  slot: string
  player: LineupPlayer | null
  /** The best eligible bench alternative within CLOSE_CALL_PTS of `player`; only on the optimal lineup. */
  closeCall: LineupPlayer | null
}

export interface Swap {
  slot: string
  /** null when the current lineup had that slot empty. */
  out: LineupPlayer | null
  in: LineupPlayer
  delta: number
}

export interface TeamLineup {
  rosterId: number
  name: string
  isMe: boolean
  optimal: SlotEntry[]
  optimalTotal: number
  /** The lineup set on Sleeper; null when unknown (no matchups row, no starters, no roster_positions). */
  current: SlotEntry[] | null
  currentTotal: number | null
  /** Sleeper's score for a final week; null otherwise. */
  actualTotal: number | null
  /** Startable players left out of the optimal lineup, best first. */
  bench: LineupPlayer[]
  /** IR / taxi players and, in the current week, Out / Doubtful players. */
  unavailable: LineupPlayer[]
  swaps: Swap[]
}

/** none of the team's players with a game has played / some / all (a past week is always final). */
export type LineupWeekStatus = 'upcoming' | 'inProgress' | 'final'

export interface LineupWeek {
  season: number
  week: number
  currentWeek: number
  status: LineupWeekStatus
  projectionsStored: boolean
  matchupId: number | null
  /** null when no team is flagged is_me. */
  me: TeamLineup | null
  /** null on a bye week or without a matchups row. */
  opponent: TeamLineup | null
}

export interface TeamStrength {
  rosterId: number
  name: string
  isMe: boolean
  /** Optimal total of the current week. */
  thisWeek: number | null
  /** Σ optimal totals over weeks currentWeek..18 on the current roster. */
  rosTotal: number | null
  rosPerWeek: number | null
  /** 1 = strongest; null when rosTotal is null. */
  rank: number | null
}
```

- [x] **Step 2: `ValueBuild.defense`.** In `src/main/value/build.ts`: import `type DefenseRanks` from `./schedule`; add `/** Defense-vs-position ranks (team → position → rank), reused by the lineup build. */ defense: DefenseRanks` to `ValueBuild`; add `defense,` to the object `assembleValue` returns (the local `defense` from `defenseRanks(bundle.players)` already exists at ~line 144). Run `npx vitest run tests/main/value` — still PASS.

- [x] **Step 3: Failing tests.** Create `tests/main/lineup/build.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { leagueRosterPositions } from '@main/db/repos/leagues'
import { listMatchups, replaceMatchupsWeek } from '@main/db/repos/matchups'
import { getRules } from '@main/db/repos/rules'
import { listStarterIndexes, listTeams } from '@main/db/repos/teams'
import { buildLineups, lineupWeek, teamStrengths, teamWeek, weekStatus, type LineupBuild, type LineupInputs } from '@main/lineup/build'
import { mapMatchups } from '@main/sync/matchupsSync'
import { buildValueSeason } from '@main/value/build'
import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'
import * as fx from '../../fixtures/sleeper'

const NO_EXPERTS = new Map<string, ExpertRankRow>()

function inputs(db: Db, over: Partial<LineupInputs> = {}): LineupInputs {
  return {
    value: buildValueSeason(db, 'L1', SEASON),
    teams: listTeams(db, 'L1'),
    rosterSlots: getRules(db, 'L1')?.rosterSlots ?? [],
    rosterPositions: leagueRosterPositions(db, 'L1'),
    matchups: listMatchups(db, 'L1', SEASON),
    starterIndexes: listStarterIndexes(db, 'L1'),
    ...over
  }
}

/** Week value the engine must have used: points when played, else the scored projection, else 0. */
function seriesValue(build: LineupBuild, playerId: string, week: number): number {
  const w = build.inputs.value.series.get(playerId)?.weeks.find((x) => x.week === week)
  if (!w) return 0
  const raw = w.played ? (w.points ?? 0) : (w.projected ?? 0)
  return Math.round(raw * 100) / 100
}

describe('lineup build on the fixture league (week 3, Thursday played)', () => {
  let db: Db
  let build: LineupBuild
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
    for (let week = 1; week <= 4; week++) {
      replaceMatchupsWeek(db, 'L1', SEASON, week, mapMatchups(fx.matchups(week)), SEED_TS)
    }
    build = buildLineups(inputs(db))
  })

  it('groups the current rosters and expands the league slots', () => {
    expect(build.slots.map((s) => s.slot)).toEqual(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'])
    expect([...(build.rosters.get(1) ?? [])].map((s) => s.base.playerId).sort()).toEqual(['4866', '6794', '8259', 'LAR'])
    expect(build.matchups.get(2)?.get(2)?.points).toBe(92)
  })

  it('optimises my current week: Barkley on his Thursday points, Jefferson and LAR projected, Cook out (IR)', () => {
    const tw = teamWeek(build, 1, 3)
    const byId = Object.fromEntries(tw.optimal.filter((e) => e.player).map((e) => [e.player?.id, e.slot]))
    expect(byId).toEqual({ '4866': 'RB', '6794': 'WR', LAR: 'DEF' })
    expect(tw.players.get('4866')?.player).toMatchObject({ played: true, flag: null, value: seriesValue(build, '4866', 3) })
    expect(tw.players.get('6794')?.player).toMatchObject({ played: false, flag: null, value: seriesValue(build, '6794', 3) })
    expect(tw.unavailable.map((u) => u.player.playerId)).toEqual(['8259'])
    expect(tw.optimalTotal).toBeCloseTo(seriesValue(build, '4866', 3) + seriesValue(build, '6794', 3) + seriesValue(build, 'LAR', 3), 2)
    expect(tw.bench).toEqual([])
    expect(teamWeek(build, 1, 3)).toBe(tw) // memoised
  })

  it('applies injury statuses in the current week only', () => {
    db.prepare("UPDATE players SET injury_status = 'Out' WHERE player_id = '6794'").run()
    db.prepare("UPDATE players SET injury_status = 'Questionable' WHERE player_id = '4866'").run()
    const b = buildLineups(inputs(db))
    const now = teamWeek(b, 1, 3)
    expect(now.unavailable.map((u) => u.player.playerId).sort()).toEqual(['6794', '8259'])
    expect(now.players.get('6794')?.player).toMatchObject({ flag: 'out', value: 0 })
    expect(now.players.get('4866')?.player.flag).toBeNull() // already played this week
    const next = teamWeek(b, 1, 4)
    expect(next.players.get('6794')?.player).toMatchObject({ flag: null, value: seriesValue(b, '6794', 4) })
    expect(next.unavailable.map((u) => u.player.playerId)).toEqual(['8259'])
  })

  it('uses the roster that played for a past week, with byes at 0 and flagged', () => {
    const past = teamWeek(build, 1, 2)
    expect(past.players.get('6794')?.player).toMatchObject({ flag: 'bye', value: 0, opponent: null })
    expect(past.players.get('4866')?.player).toMatchObject({ played: true, value: seriesValue(build, '4866', 2) })
    expect(past.unavailable).toEqual([]) // IR only counts from the current week on
    expect(past.games).toBeGreaterThan(0)
  })

  it('serves my matchup for the current week with the Sleeper lineup mapped onto roster_positions', () => {
    const w = lineupWeek(build, 3, NO_EXPERTS)
    expect(w).toMatchObject({ season: SEASON, week: 3, currentWeek: 3, status: 'inProgress', projectionsStored: true, matchupId: 1 })
    expect(w.me).toMatchObject({ rosterId: 1, name: 'Cook Book', isMe: true })
    expect(w.opponent).toMatchObject({ rosterId: 2, name: 'Rival', isMe: false })
    // starters ['4866', '6794', '0', 'LAR'] land on QB, RB, RB(empty), WR of the 9 starting slots.
    expect(w.me?.current?.map((e) => `${e.slot}:${e.player?.playerId ?? '-'}`)).toEqual([
      'QB:4866', 'RB:6794', 'RB:-', 'WR:LAR', 'WR:-', 'TE:-', 'FLEX:-', 'K:-', 'DEF:-'
    ])
    expect(w.me?.currentTotal).toBeCloseTo(w.me?.optimalTotal ?? -1, 2)
    expect(w.me?.swaps).toEqual([]) // same three players, only moved between slots
    expect(w.me?.actualTotal).toBeNull()
    expect(w.me?.optimal.map((e) => e.slot)).toEqual(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF'])
    expect(w.me?.optimal[1].player?.playerId).toBe('4866')
    expect(w.me?.unavailable.map((p) => p.playerId)).toEqual(['8259'])
  })

  it('derives swaps against a partial Sleeper lineup and decorates with expert ranks', () => {
    const starters = ['0', '4866', '0', '0', '0', '0', '0', '0', '0']
    replaceMatchupsWeek(db, 'L1', SEASON, 3, [
      { ...mapMatchups(fx.matchups(3))[0], starters },
      mapMatchups(fx.matchups(3))[1]
    ], SEED_TS)
    const experts = new Map<string, ExpertRankRow>([
      ['6794', { playerId: '6794', rankEcr: 5, posRank: 3, rankAve: 4.5, rankStd: 1.2, rankMin: 2, rankMax: 8, experts: 40, grade: 'A', projPts: 18.2, scoring: 'PPR', updatedAt: SEED_TS }]
    ])
    const w = lineupWeek(buildLineups(inputs(db)), 3, experts)
    expect(w.me?.currentTotal).toBeCloseTo(seriesValue(build, '4866', 3), 2)
    expect(w.me?.swaps.map((s) => [s.slot, s.in.playerId, s.out, s.delta])).toEqual([
      ['WR', '6794', null, seriesValue(build, '6794', 3)],
      ['DEF', 'LAR', null, seriesValue(build, 'LAR', 3)]
    ].sort((a, b) => Number(b[3]) - Number(a[3])))
    expect(w.me?.optimal.find((e) => e.slot === 'WR')?.player?.expert).toEqual({ ecrPosRank: 3, grade: 'A' })
    expect(w.me?.optimal.find((e) => e.slot === 'DEF')?.player?.expert).toBeNull()
  })

  it('reports a final past week with the Sleeper score, an upcoming future week, and no matchup as null', () => {
    const past = lineupWeek(build, 2, NO_EXPERTS)
    expect(past.status).toBe('final')
    expect(past.me?.actualTotal).toBe(102)
    expect(past.opponent?.actualTotal).toBe(92)
    const future = lineupWeek(build, 4, NO_EXPERTS)
    expect(future.status).toBe('upcoming')
    expect(future.me?.actualTotal).toBeNull()
    const none = lineupWeek(build, 9, NO_EXPERTS)
    expect(none.matchupId).toBeNull()
    expect(none.opponent).toBeNull()
    expect(none.me?.current).toBeNull() // no matchups row and not the current week
  })

  it('falls back to roster_players starters for the current week and to null without roster_positions', () => {
    replaceMatchupsWeek(db, 'L1', SEASON, 3, [], SEED_TS)
    const fallback = lineupWeek(buildLineups(inputs(db)), 3, NO_EXPERTS)
    expect(fallback.me?.current?.map((e) => e.player?.playerId ?? null).slice(0, 4)).toEqual(['4866', '6794', null, 'LAR'])
    expect(fallback.opponent).toBeNull()
    const blind = lineupWeek(buildLineups(inputs(db, { rosterPositions: null })), 3, NO_EXPERTS)
    expect(blind.me?.current).toBeNull()
    expect(blind.me?.currentTotal).toBeNull()
    expect(blind.me?.swaps).toEqual([])
  })

  it('ranks the teams by rest-of-season optimal totals', () => {
    const rows = teamStrengths(build)
    expect(rows.map((r) => [r.rosterId, r.rank])).toEqual([[1, 1], [2, 2]])
    const me = rows[0]
    expect(me.thisWeek).toBeCloseTo(teamWeek(build, 1, 3).optimalTotal, 2)
    let expected = 0
    for (let w = 3; w <= 18; w++) expected += teamWeek(build, 1, w).optimalTotal
    expect(me.rosTotal).toBeCloseTo(expected, 1)
    expect(me.rosPerWeek).toBeCloseTo(expected / 16, 1)
    expect(me.name).toBe('Cook Book')
  })

  it('has no strength without stored projections', () => {
    db.prepare('DELETE FROM player_week_projections').run()
    const rows = teamStrengths(buildLineups(inputs(db)))
    expect(rows.every((r) => r.rosTotal === null && r.rank === null && r.thisWeek === null)).toBe(true)
    expect(lineupWeek(buildLineups(inputs(db)), 3, NO_EXPERTS).projectionsStored).toBe(false)
  })
})

describe('weekStatus', () => {
  it('is final before the current week, upcoming after it, and follows the games in it', () => {
    expect(weekStatus(2, 3, 0, 0)).toBe('final')
    expect(weekStatus(4, 3, 0, 0)).toBe('upcoming')
    expect(weekStatus(3, 3, 5, 0)).toBe('upcoming')
    expect(weekStatus(3, 3, 5, 2)).toBe('inProgress')
    expect(weekStatus(3, 3, 5, 5)).toBe('final')
    expect(weekStatus(3, 19, 0, 0)).toBe('final')
  })
})
```

If the fixture's `players` table stores the projection for `LAR` in week 3 under a different id or not at all, `seriesValue(build, 'LAR', 3)` is simply `0` — the expectations are written against the series so they stay true either way. Check the fixture DEF id with `build.inputs.value.series.has('LAR')` if the first test fails.

- [x] **Step 4: Run** `npx vitest run tests/main/lineup/build.test.ts` — expected: FAIL (module not found).

- [x] **Step 5: Implementation.** Create `src/main/lineup/build.ts`:

```ts
import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import type { MatchupRow } from '@main/db/repos/matchups'
import { round2 } from '@main/db/repos/points'
import type { ValueBuild } from '@main/value/build'
import { UNSTARTABLE_SLOTS } from '@main/value/roster'
import { LAST_WEEK, type PlayerSeries } from '@main/value/series'
import type { RosterSlotCount } from '@shared/rules'
import type {
  LineupPlayer,
  LineupWeek,
  LineupWeekStatus,
  PlayerValueRow,
  SlotEntry,
  Swap,
  Team,
  TeamLineup,
  TeamStrength
} from '@shared/types'
import {
  closeCall,
  currentAssignments,
  isUnavailable,
  lineupSlots,
  optimalLineup,
  swapsBetween,
  weekFlag,
  weekValue,
  type Candidate,
  type LineupSlot,
  type Placed,
  type WeekLine
} from './optimal'

export interface LineupInputs {
  value: ValueBuild
  teams: Team[]
  rosterSlots: RosterSlotCount[]
  /** Sleeper's `roster_positions`; null for an import that lacks it (current lineups then unknown). */
  rosterPositions: string[] | null
  matchups: MatchupRow[]
  /** Current starters by slot index per roster (`roster_players`): the current-week fallback. */
  starterIndexes: Map<number, (string | null)[]>
}

/** One player's week: the engine's candidate and the payload row (expert block filled at serve time). */
export interface WeekPlayer {
  candidate: Candidate
  player: LineupPlayer
}

export interface TeamWeek {
  optimal: Placed[]
  optimalTotal: number
  bench: WeekPlayer[]
  unavailable: WeekPlayer[]
  /** Every player considered that week, by id. */
  players: Map<string, WeekPlayer>
  /** Players with a game that week, and how many of them have played — the status inputs. */
  games: number
  played: number
}

export interface LineupBuild {
  inputs: LineupInputs
  slots: LineupSlot[]
  rowById: Map<string, PlayerValueRow>
  /** Current roster per team. */
  rosters: Map<number, PlayerSeries[]>
  /** week → rosterId → row. */
  matchups: Map<number, Map<number, MatchupRow>>
  /** Memoised team-weeks, `${rosterId}|${week}`. */
  weeks: Map<string, TeamWeek>
}

export function buildLineups(inputs: LineupInputs): LineupBuild {
  const rosters = new Map<number, PlayerSeries[]>()
  for (const s of inputs.value.series.values()) {
    const owner = s.base.ownerRosterId
    if (owner === null) continue
    const list = rosters.get(owner) ?? []
    list.push(s)
    rosters.set(owner, list)
  }
  const matchups = new Map<number, Map<number, MatchupRow>>()
  for (const m of inputs.matchups) {
    const week = matchups.get(m.week) ?? new Map<number, MatchupRow>()
    week.set(m.rosterId, m)
    matchups.set(m.week, week)
  }
  return {
    inputs,
    slots: lineupSlots(inputs.rosterSlots),
    rowById: new Map(inputs.value.rows.map((r) => [r.playerId, r])),
    rosters,
    matchups,
    weeks: new Map()
  }
}

function teamName(t: Team): string {
  return t.teamName ?? t.displayName
}

/** A starter id the build knows nothing about (left the player universe): shown by id, worth 0. */
function placeholder(id: string): WeekPlayer {
  return {
    candidate: { id, name: id, position: null, value: 0 },
    player: {
      playerId: id,
      fullName: id,
      position: null,
      team: null,
      statsAvailable: false,
      opponent: null,
      dvpRank: null,
      value: 0,
      played: false,
      injuryStatus: null,
      flag: null,
      expert: null,
      floor: null,
      ceiling: null
    }
  }
}

function weekPlayer(build: LineupBuild, series: PlayerSeries, week: number): WeekPlayer {
  const { currentWeek } = build.inputs.value.context
  const b = series.base
  const sw = series.weeks.find((w) => w.week === week)
  const line: WeekLine | null = sw
    ? { played: sw.played, points: sw.points, projected: sw.projected, hasGame: sw.opponent !== null }
    : null
  const flag = weekFlag(line, b.injuryStatus, week === currentWeek)
  const value = isUnavailable(flag) ? 0 : (round2(weekValue(line)) ?? 0)
  const opponent = sw?.opponent ?? null
  const signals = build.rowById.get(b.playerId)?.signals ?? null
  return {
    candidate: { id: b.playerId, name: b.fullName, position: b.position, value },
    player: {
      playerId: b.playerId,
      fullName: b.fullName,
      position: b.position,
      team: b.team,
      statsAvailable: series.statsAvailable,
      opponent,
      dvpRank:
        opponent !== null && b.position !== null
          ? (build.inputs.value.defense.get(opponent)?.get(b.position) ?? null)
          : null,
      value,
      played: sw?.played ?? false,
      injuryStatus: b.injuryStatus,
      flag,
      expert: null,
      floor: signals?.floor ?? null,
      ceiling: signals?.ceiling ?? null
    }
  }
}

/** The roster to optimise: for a past week the roster that played (matchups row), otherwise the current one. */
function pool(build: LineupBuild, rosterId: number, week: number): PlayerSeries[] {
  const { currentWeek } = build.inputs.value.context
  const row = week < currentWeek ? build.matchups.get(week)?.get(rosterId) : undefined
  if (row) {
    return row.players.flatMap((id) => {
      const s = build.inputs.value.series.get(id)
      return s ? [s] : []
    })
  }
  return build.rosters.get(rosterId) ?? []
}

export function teamWeek(build: LineupBuild, rosterId: number, week: number): TeamWeek {
  const key = `${rosterId}|${week}`
  const hit = build.weeks.get(key)
  if (hit) return hit
  const { currentWeek } = build.inputs.value.context
  const all = pool(build, rosterId, week).map((series) => ({
    series,
    wp: weekPlayer(build, series, week)
  }))
  // IR / taxi are facts about the roster now, so they only apply from the current week on.
  const reserved = (s: PlayerSeries): boolean =>
    week >= currentWeek &&
    s.base.ownerRosterId === rosterId &&
    s.rosterSlot !== null &&
    UNSTARTABLE_SLOTS.has(s.rosterSlot)
  const startable = all.filter(({ series, wp }) => !reserved(series) && !isUnavailable(wp.player.flag))
  const startableIds = new Set(startable.map((x) => x.wp.player.playerId))
  const players = new Map(all.map((x) => [x.wp.player.playerId, x.wp]))
  const optimal = optimalLineup(build.slots, startable.map((x) => x.wp.candidate))
  const lookup = (ids: string[]): WeekPlayer[] =>
    ids.flatMap((id) => {
      const wp = players.get(id)
      return wp ? [wp] : []
    })
  const result: TeamWeek = {
    optimal: optimal.starters,
    optimalTotal: optimal.total,
    bench: lookup(optimal.bench.map((c) => c.id)),
    unavailable: all
      .filter((x) => !startableIds.has(x.wp.player.playerId))
      .map((x) => x.wp)
      .sort((a, b) => b.player.value - a.player.value || a.player.fullName.localeCompare(b.player.fullName)),
    players,
    games: all.filter((x) => x.wp.player.opponent !== null).length,
    played: all.filter((x) => x.wp.player.played).length
  }
  build.weeks.set(key, result)
  return result
}

/** Final before the current week, upcoming after it; in it: none played → upcoming, all → final, else in progress. */
export function weekStatus(
  week: number,
  currentWeek: number,
  games: number,
  played: number
): LineupWeekStatus {
  if (week < currentWeek) return 'final'
  if (week > currentWeek || played === 0) return 'upcoming'
  return games > 0 && played >= games ? 'final' : 'inProgress'
}

/** Spec §3.4: the lineup the team set on Sleeper, as engine candidates; null when unknown. */
function currentPlaced(
  build: LineupBuild,
  rosterId: number,
  week: number,
  tw: TeamWeek
): Placed[] | null {
  const positions = build.inputs.rosterPositions
  if (!positions) return null
  const row = build.matchups.get(week)?.get(rosterId)
  const starters = row
    ? row.starters
    : week === build.inputs.value.context.currentWeek
      ? (build.inputs.starterIndexes.get(rosterId) ?? null)
      : null
  if (!starters) return null
  return currentAssignments(positions, starters).map(({ slot, id }) => {
    if (id === null) return { slot, player: null }
    let wp = tw.players.get(id)
    if (!wp) {
      const series = build.inputs.value.series.get(id)
      wp = series ? weekPlayer(build, series, week) : placeholder(id)
      tw.players.set(id, wp)
    }
    return { slot, player: wp.candidate }
  })
}

function withExpert(
  tw: TeamWeek,
  c: Candidate,
  experts: Map<string, ExpertRankRow>
): LineupPlayer {
  const base = tw.players.get(c.id)?.player ?? placeholder(c.id).player
  const rank = experts.get(c.id)
  return { ...base, expert: rank ? { ecrPosRank: rank.posRank, grade: rank.grade } : null }
}

function teamLineup(
  build: LineupBuild,
  team: Team,
  week: number,
  experts: Map<string, ExpertRankRow>,
  status: LineupWeekStatus
): TeamLineup {
  const tw = teamWeek(build, team.rosterId, week)
  const decorate = (c: Candidate | null): LineupPlayer | null =>
    c ? withExpert(tw, c, experts) : null
  const benchCandidates = tw.bench.map((b) => b.candidate)
  const optimal: SlotEntry[] = tw.optimal.map((e, i) => ({
    slot: e.slot,
    player: decorate(e.player),
    closeCall: decorate(closeCall(build.slots[i], e.player, benchCandidates))
  }))
  const placed = currentPlaced(build, team.rosterId, week, tw)
  const current: SlotEntry[] | null =
    placed?.map((e) => ({ slot: e.slot, player: decorate(e.player), closeCall: null })) ?? null
  const swaps: Swap[] = placed
    ? swapsBetween(tw.optimal, placed).map((s) => ({
        slot: s.slot,
        out: decorate(s.out),
        in: withExpert(tw, s.in, experts),
        delta: s.delta
      }))
    : []
  const row = build.matchups.get(week)?.get(team.rosterId)
  return {
    rosterId: team.rosterId,
    name: teamName(team),
    isMe: team.isMe,
    optimal,
    optimalTotal: tw.optimalTotal,
    current,
    currentTotal: placed
      ? (round2(placed.reduce((sum, e) => sum + (e.player?.value ?? 0), 0)) ?? 0)
      : null,
    actualTotal: status === 'final' && row ? row.points : null,
    bench: tw.bench.map((b) => withExpert(tw, b.candidate, experts)),
    unavailable: tw.unavailable.map((u) => withExpert(tw, u.candidate, experts)),
    swaps
  }
}

/** Spec §4.2 `lineup.week`: my team and its opponent for the week. */
export function lineupWeek(
  build: LineupBuild,
  week: number,
  experts: Map<string, ExpertRankRow>
): LineupWeek {
  const ctx = build.inputs.value.context
  const me = build.inputs.teams.find((t) => t.isMe) ?? null
  const weekRows = build.matchups.get(week)
  const myRow = me ? weekRows?.get(me.rosterId) : undefined
  const matchupId = myRow?.matchupId ?? null
  const oppRow =
    me && matchupId !== null
      ? [...(weekRows?.values() ?? [])].find(
          (r) => r.matchupId === matchupId && r.rosterId !== me.rosterId
        )
      : undefined
  const opponent = oppRow
    ? (build.inputs.teams.find((t) => t.rosterId === oppRow.rosterId) ?? null)
    : null
  const mine = me ? teamWeek(build, me.rosterId, week) : null
  const status = weekStatus(week, ctx.currentWeek, mine?.games ?? 0, mine?.played ?? 0)
  return {
    season: ctx.season,
    week,
    currentWeek: ctx.currentWeek,
    status,
    projectionsStored: ctx.projectionsStored,
    matchupId,
    me: me ? teamLineup(build, me, week, experts, status) : null,
    opponent: opponent ? teamLineup(build, opponent, week, experts, status) : null
  }
}

/** Spec §4.1: every team's optimal totals over the remaining weeks on its current roster, ranked. */
export function teamStrengths(build: LineupBuild): TeamStrength[] {
  const { currentWeek, projectionsStored } = build.inputs.value.context
  const weeks: number[] = []
  if (projectionsStored) for (let w = currentWeek; w <= LAST_WEEK; w++) weeks.push(w)
  const rows = build.inputs.teams.map((t): TeamStrength => {
    const base = { rosterId: t.rosterId, name: teamName(t), isMe: t.isMe }
    if (weeks.length === 0) {
      return { ...base, thisWeek: null, rosTotal: null, rosPerWeek: null, rank: null }
    }
    const totals = weeks.map((w) => teamWeek(build, t.rosterId, w).optimalTotal)
    const rosTotal = round2(totals.reduce((sum, v) => sum + v, 0)) ?? 0
    return {
      ...base,
      thisWeek: totals[0],
      rosTotal,
      rosPerWeek: round2(rosTotal / totals.length),
      rank: null
    }
  })
  rows.sort(
    (a, b) =>
      (b.rosTotal ?? Number.NEGATIVE_INFINITY) - (a.rosTotal ?? Number.NEGATIVE_INFINITY) ||
      a.name.localeCompare(b.name)
  )
  return rows.map((r, i) => ({ ...r, rank: r.rosTotal === null ? null : i + 1 }))
}
```

- [x] **Step 6: Run** `npx vitest run tests/main/lineup` — expected: PASS. Where a fixture-dependent expectation (e.g. `past.games > 0`, the `LAR` week-3 projection) disagrees with the seeded data, read the seeded rows through `build.inputs.value.series` and correct the *test's* expectation to what the fixture actually holds — the engine rules are fixed by the spec.

- [x] **Step 7:** `npm run typecheck && npm run lint && npm test` — PASS. **Commit** — `feat(lineup): per-team lineups, swaps and strength`.

---

### Task 6: IPC channels, cache, renderer view helpers

**Files:**
- Modify: `src/shared/ipc.ts` (`Api.lineup`, two channel names), `src/preload/index.ts` (bridge), `src/main/ipc/handlers.ts` (imports, `lineupCache`, `cachedLineup`, two handlers)
- Create: `src/renderer/src/lib/lineupView.ts`, `tests/fixtures/lineup.ts`, `tests/renderer/lib/lineupView.test.ts`

**Interfaces:**
- Consumes: Task 5 `buildLineups` / `lineupWeek` / `teamStrengths`; repos `listMatchups`, `listStarterIndexes`, `leagueRosterPositions`, `listExpertRanks`, `listTeams`, `getRules`.
- Produces: `IPC.lineupWeek = 'lineup:week'`, `IPC.lineupStrength = 'lineup:strength'`; `api.lineup.week(query: WeekQuery): Promise<LineupWeek>`, `api.lineup.strength(season): Promise<TeamStrength[]>`; view helpers `WEEKS`, `flagBadge(flag): FlagBadge | null`, `isNewStarter(entry, current): boolean`, `rowDelta(optimal, current): number | null`, `leftOnBench(team): number | null`, `matchupHeader(week): MatchupHeader`, `swapLine(swap): string`, `swapsEmptyText(team): string`, `closeCallTitle(starter, alt): string`; fixtures `lineupPlayer`, `slotEntry`, `teamLineup`, `lineupWeek`.

- [x] **Step 1: Shared IPC.** In `src/shared/ipc.ts` add `LineupWeek`, `TeamStrength` to the type import; in `Api` after `players`:

```ts
  lineup: {
    /** My optimal vs. current lineup for a week with my opponent (slice 6a spec §4.2); cached in main with the value build. */
    week(query: WeekQuery): Promise<LineupWeek>
    /** Every team's rest-of-season strength on its current roster, ranked. */
    strength(season: number): Promise<TeamStrength[]>
  }
```

and in `IPC` after `playersNews`: `lineupWeek: 'lineup:week',` `lineupStrength: 'lineup:strength',`.

- [x] **Step 2: Preload.** In `src/preload/index.ts` after the `players` block:

```ts
  lineup: {
    week: (query) => ipcRenderer.invoke(IPC.lineupWeek, query),
    strength: (season) => ipcRenderer.invoke(IPC.lineupStrength, season)
  },
```

- [x] **Step 3: Handlers.** In `src/main/ipc/handlers.ts`:

Imports to add:

```ts
import { listExpertRanks } from '@main/db/repos/expertRanks'
import { getLeague, leagueRosterPositions } from '@main/db/repos/leagues'   // replaces the existing getLeague import line
import { listMatchups } from '@main/db/repos/matchups'
import { listRoster, listStarterIndexes, listTeams } from '@main/db/repos/teams'   // replaces the existing teams import line
import { buildLineups, lineupWeek, teamStrengths, type LineupBuild } from '@main/lineup/build'
```

and `LineupWeek`, `TeamStrength` in the `@shared/types` type import.

After `const valueCache = …`:

```ts
/** Lineups derive from the value build and the same DB rows; same key, same invalidation. */
const lineupCache = new Map<string, LineupBuild>()
```

In `invalidateCaches()` add `lineupCache.clear()`. After `cachedValue`:

```ts
function cachedLineup(ctx: AppContext, leagueId: string, season: number): LineupBuild {
  const key = `${leagueId}|${season}`
  const hit = lineupCache.get(key)
  if (hit) return hit
  const built = buildLineups({
    value: cachedValue(ctx, leagueId, season),
    teams: listTeams(ctx.db, leagueId),
    rosterSlots: getRules(ctx.db, leagueId)?.rosterSlots ?? [],
    rosterPositions: leagueRosterPositions(ctx.db, leagueId),
    matchups: listMatchups(ctx.db, leagueId, season),
    starterIndexes: listStarterIndexes(ctx.db, leagueId)
  })
  if (lineupCache.size >= VALUE_CACHE_MAX) {
    const oldest = lineupCache.keys().next().value
    if (oldest !== undefined) lineupCache.delete(oldest)
  }
  lineupCache.set(key, built)
  return built
}
```

In `registerIpcHandlers` after the `playersNews` handler:

```ts
  ipcMain.handle(IPC.lineupWeek, (_event, query: WeekQuery): LineupWeek => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    const experts = new Map(
      listExpertRanks(ctx.db, query.season, query.week).map((r) => [r.playerId, r])
    )
    return lineupWeek(cachedLineup(ctx, id, query.season), query.week, experts)
  })

  ipcMain.handle(IPC.lineupStrength, (_event, season: number): TeamStrength[] => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    return teamStrengths(cachedLineup(ctx, id, season))
  })
```

Run `npm run typecheck` — PASS (the renderer has no caller yet; that is fine).

- [x] **Step 4: Fixture.** Create `tests/fixtures/lineup.ts`:

```ts
import type { LineupPlayer, LineupWeek, SlotEntry, TeamLineup } from '@shared/types'

export function lineupPlayer(over: Partial<LineupPlayer> & { playerId: string }): LineupPlayer {
  return {
    fullName: `Player ${over.playerId}`,
    position: 'RB',
    team: 'PHI',
    statsAvailable: true,
    opponent: 'DAL',
    dvpRank: 12,
    value: 10,
    played: false,
    injuryStatus: null,
    flag: null,
    expert: null,
    floor: 6,
    ceiling: 15,
    ...over
  }
}

export function slotEntry(
  slot: string,
  player: LineupPlayer | null,
  closeCall: LineupPlayer | null = null
): SlotEntry {
  return { slot, player, closeCall }
}

export function teamLineup(over: Partial<TeamLineup> = {}): TeamLineup {
  const rb1 = lineupPlayer({ playerId: 'rb1', fullName: 'Saquon Barkley', value: 18.4 })
  const wr1 = lineupPlayer({ playerId: 'wr1', fullName: 'Justin Jefferson', position: 'WR', team: 'MIN', value: 16.2 })
  return {
    rosterId: 1,
    name: 'Cook Book',
    isMe: true,
    optimal: [slotEntry('RB', rb1), slotEntry('WR', wr1)],
    optimalTotal: 34.6,
    current: [slotEntry('RB', rb1), slotEntry('WR', wr1)],
    currentTotal: 34.6,
    actualTotal: null,
    bench: [],
    unavailable: [],
    swaps: [],
    ...over
  }
}

export function lineupWeek(over: Partial<LineupWeek> = {}): LineupWeek {
  return {
    season: 2026,
    week: 3,
    currentWeek: 3,
    status: 'upcoming',
    projectionsStored: true,
    matchupId: 1,
    me: teamLineup(),
    opponent: teamLineup({ rosterId: 2, name: 'Rival', isMe: false, optimalTotal: 30.1, currentTotal: 28.7 }),
    ...over
  }
}
```

- [x] **Step 5: Failing tests.** Create `tests/renderer/lib/lineupView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  closeCallTitle,
  flagBadge,
  isNewStarter,
  leftOnBench,
  matchupHeader,
  rowDelta,
  swapLine,
  swapsEmptyText,
  WEEKS
} from '@/lib/lineupView'
import { lineupPlayer, lineupWeek, slotEntry, teamLineup } from '../../fixtures/lineup'

describe('lineupView', () => {
  it('lists 18 weeks and maps flags to badges', () => {
    expect(WEEKS).toHaveLength(18)
    expect(flagBadge('out')).toEqual({ text: 'O', tone: 'red' })
    expect(flagBadge('doubtful')).toEqual({ text: 'D', tone: 'red' })
    expect(flagBadge('questionable')).toEqual({ text: 'Q', tone: 'amber' })
    expect(flagBadge('bye')).toEqual({ text: 'BYE', tone: 'muted' })
    expect(flagBadge(null)).toBeNull()
  })

  it('tints only starters who are not in the current lineup, and gives their row delta', () => {
    const a = lineupPlayer({ playerId: 'a', value: 10 })
    const b = lineupPlayer({ playerId: 'b', value: 8 })
    const c = lineupPlayer({ playerId: 'c', value: 12 })
    const current = [slotEntry('RB', b), slotEntry('FLEX', a)]
    expect(isNewStarter(slotEntry('RB', a), current)).toBe(false) // moved, not new
    expect(isNewStarter(slotEntry('RB', c), current)).toBe(true)
    expect(isNewStarter(slotEntry('RB', c), null)).toBe(false)
    expect(isNewStarter(slotEntry('RB', null), current)).toBe(false)
    expect(rowDelta(slotEntry('RB', c), slotEntry('RB', b), current)).toBe(4)
    expect(rowDelta(slotEntry('RB', c), slotEntry('RB', null), current)).toBe(12)
    expect(rowDelta(slotEntry('RB', a), slotEntry('RB', b), current)).toBeNull()
    expect(rowDelta(slotEntry('RB', c), undefined, null)).toBeNull()
  })

  it('formats the header for upcoming, final and matchup-less weeks', () => {
    expect(matchupHeader(lineupWeek())).toEqual({
      mine: 'You 34.6 optimal · 34.6 current',
      theirs: 'Rival 28.7 current',
      result: null,
      note: null
    })
    const unset = lineupWeek({ me: teamLineup({ current: null, currentTotal: null }), opponent: teamLineup({ isMe: false, name: 'Rival', current: null, currentTotal: null, optimalTotal: 30.1 }) })
    expect(matchupHeader(unset)).toMatchObject({ mine: 'You 34.6 optimal', theirs: 'Rival 30.1 optimal' })
    const final = lineupWeek({
      status: 'final',
      me: teamLineup({ actualTotal: 121.3, optimalTotal: 133.6 }),
      opponent: teamLineup({ isMe: false, name: 'Rival', actualTotal: 98 })
    })
    expect(matchupHeader(final)).toEqual({ mine: 'You 121.3', theirs: 'Rival 98.0', result: 'W', note: null })
    expect(matchupHeader(lineupWeek({ status: 'final', me: teamLineup({ actualTotal: 90 }), opponent: teamLineup({ isMe: false, actualTotal: 90 }) })).result).toBe('T')
    expect(matchupHeader(lineupWeek({ opponent: null, matchupId: null }))).toMatchObject({ theirs: null, note: 'No matchup this week' })
    expect(matchupHeader(lineupWeek({ me: null, opponent: null }))).toEqual({
      mine: '',
      theirs: null,
      result: null,
      note: "Your team isn't identified — re-import from Setup"
    })
    expect(matchupHeader(lineupWeek({ projectionsStored: false })).note).toBe('No projections stored — values are actuals only')
  })

  it('computes points left on the bench for a final week only', () => {
    expect(leftOnBench(teamLineup({ actualTotal: 121.3, optimalTotal: 133.6 }))).toBe(12.3)
    expect(leftOnBench(teamLineup())).toBeNull()
  })

  it('writes swap lines and the empty-state text', () => {
    const a = lineupPlayer({ playerId: 'a', fullName: 'A. Adams', value: 12.1 })
    const b = lineupPlayer({ playerId: 'b', fullName: 'B. Brown', value: 9 })
    expect(swapLine({ slot: 'FLEX', out: b, in: a, delta: 3.1 })).toBe('Start A. Adams over B. Brown (FLEX, +3.1)')
    expect(swapLine({ slot: 'WR', out: null, in: a, delta: 12.1 })).toBe('Start A. Adams (WR, +12.1)')
    expect(swapsEmptyText(teamLineup())).toBe('Your lineup is optimal')
    expect(swapsEmptyText(teamLineup({ current: null }))).toBe('Lineup not set on Sleeper yet')
  })

  it('describes both sides of a close call', () => {
    const starter = lineupPlayer({ playerId: 'a', fullName: 'A. Adams', value: 11, floor: 5.5, ceiling: 17, expert: { ecrPosRank: 14, grade: 'B+' }, opponent: 'DAL', dvpRank: 20 })
    const alt = lineupPlayer({ playerId: 'b', fullName: 'B. Brown', position: 'WR', value: 9.6, floor: null, ceiling: null, expert: null, opponent: null, dvpRank: null })
    expect(closeCallTitle(starter, alt)).toBe(
      'Close call\nA. Adams: 11.0 · floor 5.5 / ceiling 17.0 · ECR RB14 (B+) · vs DAL (DvP 20)\nB. Brown: 9.6'
    )
  })
})
```

- [x] **Step 6: Run** `npx vitest run tests/renderer/lib/lineupView.test.ts` — expected: FAIL (module not found).

- [x] **Step 7: Implementation.** Create `src/renderer/src/lib/lineupView.ts`:

```ts
import type {
  LineupFlag,
  LineupPlayer,
  LineupWeek,
  SlotEntry,
  Swap,
  TeamLineup
} from '@shared/types'
import { fmtPoints, fmtSigned } from './format'

export const WEEKS: number[] = Array.from({ length: 18 }, (_, i) => i + 1)

export interface FlagBadge {
  text: string
  tone: 'red' | 'amber' | 'muted'
}

export function flagBadge(flag: LineupFlag): FlagBadge | null {
  switch (flag) {
    case 'out':
      return { text: 'O', tone: 'red' }
    case 'doubtful':
      return { text: 'D', tone: 'red' }
    case 'questionable':
      return { text: 'Q', tone: 'amber' }
    case 'bye':
      return { text: 'BYE', tone: 'muted' }
    default:
      return null
  }
}

function starterIds(current: SlotEntry[] | null): Set<string> {
  return new Set((current ?? []).flatMap((e) => (e.player ? [e.player.playerId] : [])))
}

/** An optimal starter who is not among the current starters (a player who only changed slot is not new). */
export function isNewStarter(entry: SlotEntry, current: SlotEntry[] | null): boolean {
  return current !== null && entry.player !== null && !starterIds(current).has(entry.player.playerId)
}

/** Row Δ: the new starter's value over whoever sits in that slot today; null on unchanged rows. */
export function rowDelta(
  optimal: SlotEntry,
  current: SlotEntry | undefined,
  currentAll: SlotEntry[] | null
): number | null {
  if (!isNewStarter(optimal, currentAll) || !optimal.player) return null
  return Math.round((optimal.player.value - (current?.player?.value ?? 0)) * 100) / 100
}

/** Final weeks: what the optimal lineup would have scored over the actual one. */
export function leftOnBench(t: TeamLineup): number | null {
  return t.actualTotal === null ? null : Math.round((t.optimalTotal - t.actualTotal) * 100) / 100
}

export interface MatchupHeader {
  /** "You 118.9 optimal · 112.4 current" or, final, "You 121.3". Empty without a team. */
  mine: string
  /** "Rival 109.7 current" / "Rival 98.0"; null without an opponent. */
  theirs: string | null
  result: 'W' | 'L' | 'T' | null
  note: string | null
}

export function matchupHeader(w: LineupWeek): MatchupHeader {
  if (!w.me) {
    return { mine: '', theirs: null, result: null, note: "Your team isn't identified — re-import from Setup" }
  }
  const notes: string[] = []
  if (!w.opponent) notes.push('No matchup this week')
  if (!w.projectionsStored) notes.push('No projections stored — values are actuals only')
  const note = notes.length ? notes.join(' · ') : null
  if (w.status === 'final') {
    const mineScore = w.me.actualTotal ?? w.me.optimalTotal
    const theirScore = w.opponent ? (w.opponent.actualTotal ?? w.opponent.optimalTotal) : null
    const theirActual = w.opponent?.actualTotal ?? null
    const result: MatchupHeader['result'] =
      w.me.actualTotal === null || theirActual === null
        ? null
        : mineScore > theirActual
          ? 'W'
          : mineScore < theirActual
            ? 'L'
            : 'T'
    return {
      mine: `You ${fmtPoints(mineScore)}`,
      theirs: w.opponent ? `${w.opponent.name} ${fmtPoints(theirScore)}` : null,
      result,
      note
    }
  }
  const mine =
    `You ${fmtPoints(w.me.optimalTotal)} optimal` +
    (w.me.currentTotal !== null ? ` · ${fmtPoints(w.me.currentTotal)} current` : '')
  const theirs = w.opponent
    ? w.opponent.currentTotal !== null
      ? `${w.opponent.name} ${fmtPoints(w.opponent.currentTotal)} current`
      : `${w.opponent.name} ${fmtPoints(w.opponent.optimalTotal)} optimal`
    : null
  return { mine, theirs, result: null, note }
}

export function swapLine(s: Swap): string {
  const where = `${s.slot}, ${fmtSigned(s.delta)}`
  return s.out
    ? `Start ${s.in.fullName} over ${s.out.fullName} (${where})`
    : `Start ${s.in.fullName} (${where})`
}

export function swapsEmptyText(t: TeamLineup): string {
  return t.current === null ? 'Lineup not set on Sleeper yet' : 'Your lineup is optimal'
}

function describePlayer(p: LineupPlayer): string {
  const parts = [`${p.fullName}: ${fmtPoints(p.value)}`]
  if (p.floor !== null && p.ceiling !== null) {
    parts.push(`floor ${fmtPoints(p.floor)} / ceiling ${fmtPoints(p.ceiling)}`)
  }
  if (p.expert) {
    parts.push(`ECR ${p.position ?? ''}${p.expert.ecrPosRank}${p.expert.grade ? ` (${p.expert.grade})` : ''}`)
  }
  if (p.opponent) parts.push(`vs ${p.opponent}${p.dvpRank !== null ? ` (DvP ${p.dvpRank})` : ''}`)
  return parts.join(' · ')
}

/** Tooltip on a close call: both players' value, floor/ceiling, expert rank and matchup (spec §5.1 item 2). */
export function closeCallTitle(starter: LineupPlayer, alt: LineupPlayer): string {
  return `Close call\n${describePlayer(starter)}\n${describePlayer(alt)}`
}
```

- [x] **Step 8: Run** `npx vitest run tests/renderer/lib/lineupView.test.ts` — PASS. `npm run typecheck && npm run lint && npm test` — PASS.

- [x] **Step 9: Commit** — `feat(ipc): lineup.week and lineup.strength channels` (handlers, ipc, preload) and `feat(ui): lineup view helpers` (lib + fixture + test) — two commits.

---

### Task 7: Lineup screen, sidebar entry, detail-panel target

**Files:**
- Create: `src/renderer/src/screens/LineupScreen.tsx`, `tests/renderer/components/LineupScreen.test.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx:1-22`, `src/renderer/src/App.tsx:2-7,61-63`, `src/renderer/src/components/PlayerDetailPanel.tsx:24-33`

**Interfaces:**
- Consumes: `api.players.options()` (season, `currentWeek`), `api.lineup.week`, Task 6 helpers, `PlayerDetailPanel`, `PositionBadge`, shadcn `Card`/`Table`.
- Produces: `Screen` union gains `'lineup'`; `PlayerDetailPanel` prop `player: DetailTarget | null`.

- [x] **Step 1: Detail panel target.** In `src/renderer/src/components/PlayerDetailPanel.tsx`: remove `type TableRow as PlayerRow` from the `playersTableView` import (keep the other names), add `DetailTarget` to the `@shared/types` import, and change the prop to:

```ts
  /** The clicked player (any row that carries id, name, position, team and statsAvailable); null closes the panel. */
  player: DetailTarget | null
```

`PlayersScreen` keeps passing its `TableRow` — it is structurally a `DetailTarget`. Run `npm run typecheck:web` — PASS.

- [x] **Step 2: Sidebar + App.** In `Sidebar.tsx`: import `ClipboardList` from `lucide-react`; `export type Screen = 'setup' | 'league' | 'rules' | 'players' | 'lineup'`; insert after the players item: `{ id: 'lineup', label: 'Lineup', icon: ClipboardList, enabled: (hasLeague) => hasLeague },`. In `App.tsx`: `import { LineupScreen } from '@/screens/LineupScreen'` and after the players route: `{screen === 'lineup' && <LineupScreen dataVersion={dataVersion} />}`.

- [x] **Step 3: Failing DOM test.** Create `tests/renderer/components/LineupScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LineupScreen } from '@/screens/LineupScreen'
import { api } from '@/lib/api'
import type { PlayersOptions } from '@shared/types'
import { lineupPlayer, lineupWeek, slotEntry, teamLineup } from '../../fixtures/lineup'

vi.mock('@/lib/api', () => ({
  api: {
    players: { options: vi.fn(), detail: vi.fn() },
    lineup: { week: vi.fn() }
  }
}))
const optionsMock = vi.mocked(api.players.options)
const weekMock = vi.mocked(api.lineup.week)

const options: PlayersOptions = {
  seasons: [2026],
  currentWeek: 3,
  lastScoredWeek: 2,
  tabs: [],
  projectionWeeks: []
}

beforeEach(() => {
  optionsMock.mockReset()
  weekMock.mockReset()
  optionsMock.mockResolvedValue(options)
})
afterEach(cleanup)

describe('LineupScreen', () => {
  it('loads the current week, shows the matchup header, the slot table and the optimal state', async () => {
    weekMock.mockResolvedValue(lineupWeek())
    render(<LineupScreen dataVersion={0} />)
    expect(await screen.findByText('You 34.6 optimal · 34.6 current')).toBeTruthy()
    expect(weekMock).toHaveBeenCalledWith({ season: 2026, week: 3 })
    expect(screen.getByText('Rival 28.7 current')).toBeTruthy()
    expect(screen.getAllByText('Saquon Barkley')).toHaveLength(2) // current and optimal columns
    expect(screen.getByText('Your lineup is optimal')).toBeTruthy()
    expect((screen.getByLabelText('Week') as HTMLSelectElement).value).toBe('3')
  })

  it('lists swaps, tints new starters, flags players and shows a close call', async () => {
    const rb1 = lineupPlayer({ playerId: 'rb1', fullName: 'Saquon Barkley', value: 18.4 })
    const rb2 = lineupPlayer({ playerId: 'rb2', fullName: 'Chase Brown', value: 11.2, flag: 'questionable', injuryStatus: 'Questionable' })
    const rb3 = lineupPlayer({ playerId: 'rb3', fullName: 'Rico Dowdle', value: 10.1 })
    const out = lineupPlayer({ playerId: 'rb4', fullName: 'Old Starter', value: 4, flag: 'out', injuryStatus: 'Out' })
    weekMock.mockResolvedValue(
      lineupWeek({
        me: teamLineup({
          optimal: [slotEntry('RB', rb1), slotEntry('RB', rb2, rb3)],
          optimalTotal: 29.6,
          current: [slotEntry('RB', rb1), slotEntry('RB', out)],
          currentTotal: 22.4,
          bench: [rb3],
          unavailable: [out],
          swaps: [{ slot: 'RB', out, in: rb2, delta: 7.2 }]
        })
      })
    )
    render(<LineupScreen dataVersion={0} />)
    expect(await screen.findByText('Start Chase Brown over Old Starter (RB, +7.2)')).toBeTruthy()
    expect(screen.getByText('Q')).toBeTruthy()
    expect(screen.getAllByText('O').length).toBeGreaterThan(0)
    expect(screen.getByText('≈ Rico Dowdle').getAttribute('title')).toMatch(/^Close call\n/)
    expect(screen.getByText('Rico Dowdle')).toBeTruthy() // bench list
    expect(screen.getByText('+7.2')).toBeTruthy() // row delta
  })

  it('shows the not-set and no-team states, and refetches on a week change', async () => {
    weekMock.mockResolvedValueOnce(lineupWeek({ me: teamLineup({ current: null, currentTotal: null, swaps: [] }) }))
    render(<LineupScreen dataVersion={0} />)
    expect(await screen.findByText('Lineup not set on Sleeper yet')).toBeTruthy()
    weekMock.mockResolvedValueOnce(lineupWeek({ week: 5, me: null, opponent: null, matchupId: null }))
    fireEvent.change(screen.getByLabelText('Week'), { target: { value: '5' } })
    expect(await screen.findByText("Your team isn't identified — re-import from Setup")).toBeTruthy()
    expect(weekMock).toHaveBeenLastCalledWith({ season: 2026, week: 5 })
  })

  it('renders the error line when the call fails', async () => {
    weekMock.mockRejectedValue(new Error('boom'))
    render(<LineupScreen dataVersion={0} />)
    expect(await screen.findByText('boom')).toBeTruthy()
  })
})
```

- [x] **Step 4: Run** `npx vitest run tests/renderer/components/LineupScreen.test.tsx` — FAIL (module not found).

- [x] **Step 5: Screen.** Create `src/renderer/src/screens/LineupScreen.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { PositionBadge } from '@/components/PositionBadge'
import { api } from '@/lib/api'
import { errorMessage, fmtPoints, fmtSigned } from '@/lib/format'
import {
  closeCallTitle,
  flagBadge,
  isNewStarter,
  leftOnBench,
  matchupHeader,
  rowDelta,
  swapLine,
  swapsEmptyText,
  WEEKS
} from '@/lib/lineupView'
import { cn } from '@/lib/utils'
import type { DetailTarget, LineupPlayer, LineupWeek, SlotEntry, TeamLineup } from '@shared/types'

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'

const TONE: Record<'red' | 'amber' | 'muted', string> = {
  red: 'bg-red-500/15 text-red-400',
  amber: 'bg-amber-500/15 text-amber-400',
  muted: 'bg-muted text-muted-foreground'
}

function Flag({ player }: { player: LineupPlayer }): React.JSX.Element | null {
  const badge = flagBadge(player.flag)
  if (!badge) return null
  return (
    <span
      className={cn('rounded px-1 text-[10px] font-semibold', TONE[badge.tone])}
      title={player.injuryStatus ?? undefined}
    >
      {badge.text}
    </span>
  )
}

function PlayerCell({
  player,
  onOpen
}: {
  player: LineupPlayer | null
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  if (!player) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex items-center gap-2">
      <PositionBadge position={player.position} />
      <button type="button" className="hover:underline" onClick={() => onOpen(player)}>
        {player.fullName}
      </button>
      <span className="text-xs text-muted-foreground">
        {player.team ?? 'FA'}
        {player.opponent ? ` vs ${player.opponent}` : ''}
      </span>
      <Flag player={player} />
    </span>
  )
}

function PlayerList({
  title,
  players,
  onOpen
}: {
  title: string
  players: LineupPlayer[]
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {players.map((p) => (
              <li key={p.playerId} className="flex items-center justify-between gap-3">
                <PlayerCell player={p} onOpen={onOpen} />
                <span className="tabular-nums">{fmtPoints(p.value)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function SlotTable({
  team,
  onOpen
}: {
  team: TeamLineup
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const rows = Math.max(team.optimal.length, team.current?.length ?? 0)
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">Slot</TableHead>
          <TableHead>Your starter</TableHead>
          <TableHead className="w-16 text-right">Pts</TableHead>
          <TableHead>Optimal</TableHead>
          <TableHead className="w-16 text-right">Pts</TableHead>
          <TableHead className="w-16 text-right">Δ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }, (_, i) => {
          const optimal: SlotEntry | undefined = team.optimal[i]
          const current: SlotEntry | undefined = team.current?.[i]
          const tinted = optimal ? isNewStarter(optimal, team.current) : false
          const delta = optimal ? rowDelta(optimal, current, team.current) : null
          return (
            <TableRow key={i} className={cn(tinted && 'bg-primary/10')}>
              <TableCell className="text-xs font-semibold text-muted-foreground">
                {optimal?.slot ?? current?.slot}
              </TableCell>
              <TableCell>
                {team.current ? (
                  <PlayerCell player={current?.player ?? null} onOpen={onOpen} />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtPoints(current?.player?.value ?? null)}
              </TableCell>
              <TableCell>
                <PlayerCell player={optimal?.player ?? null} onOpen={onOpen} />
                {optimal?.player && optimal.closeCall && (
                  <span
                    className="ml-2 text-xs text-amber-400"
                    title={closeCallTitle(optimal.player, optimal.closeCall)}
                  >
                    ≈ {optimal.closeCall.fullName}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {fmtPoints(optimal?.player?.value ?? null)}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  delta !== null && (delta >= 0 ? 'text-emerald-400' : 'text-red-400')
                )}
              >
                {delta === null ? '' : fmtSigned(delta)}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

interface LineupScreenProps {
  dataVersion: number
}

export function LineupScreen({ dataVersion }: LineupScreenProps): React.JSX.Element {
  const [season, setSeason] = useState<number | null>(null)
  const [week, setWeek] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; data: LineupWeek } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [selected, setSelected] = useState<DetailTarget | null>(null)

  useEffect(() => {
    void api.players
      .options()
      .then((o) => {
        setSeason((s) => s ?? o.seasons[0] ?? null)
        setWeek((w) => w ?? o.currentWeek)
      })
      .catch((err) => setFailed({ key: 'options', message: errorMessage(err) }))
  }, [dataVersion])

  const key = season !== null && week !== null ? `${season}|${week}|${dataVersion}` : null
  useEffect(() => {
    if (season === null || week === null || key === null) return
    let cancelled = false
    void api.lineup
      .week({ season, week })
      .then((data) => {
        if (!cancelled) setLoaded({ key, data })
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, week, key])

  const data = loaded?.key === key ? loaded.data : null
  const error = failed && (failed.key === key || failed.key === 'options') ? failed.message : null
  const header = data ? matchupHeader(data) : null
  const me = data?.me ?? null
  const benchLeft = me ? leftOnBench(me) : null
  const oppLeft = data?.opponent ? leftOnBench(data.opponent) : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Lineup</h1>
          <p className="text-sm text-muted-foreground">
            Optimal lineup on Sleeper projections under your scoring, next to what you set.
          </p>
        </div>
        {/* Not a <label> wrapper: its text content would include every option, so the test's getByLabelText uses the aria-label. */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Week</span>
          <select
            aria-label="Week"
            className={selectClass}
            value={week ?? ''}
            onChange={(e) => setWeek(Number(e.target.value))}
          >
            {WEEKS.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {!data && !error && <p className="text-sm text-muted-foreground">Loading…</p>}

      {data && header && (
        <Card>
          <CardContent className="flex flex-wrap items-baseline gap-x-6 gap-y-2 pt-6 text-sm">
            {header.mine && <span className="text-lg font-semibold">{header.mine}</span>}
            {header.theirs && (
              <>
                <span className="text-muted-foreground">vs</span>
                <span className="text-lg font-semibold">{header.theirs}</span>
              </>
            )}
            {header.result && (
              <span
                className={cn(
                  'rounded px-2 py-0.5 text-xs font-bold',
                  header.result === 'W'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : header.result === 'L'
                      ? 'bg-red-500/15 text-red-400'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                {header.result}
              </span>
            )}
            {benchLeft !== null && (
              <span className="text-muted-foreground">
                Left on bench: {fmtSigned(benchLeft)}
                {oppLeft !== null ? ` · ${data.opponent?.name}: ${fmtSigned(oppLeft)}` : ''}
              </span>
            )}
            {header.note && <span className="text-muted-foreground">{header.note}</span>}
          </CardContent>
        </Card>
      )}

      {me && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{me.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <SlotTable team={me} onOpen={setSelected} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Swaps</CardTitle>
            </CardHeader>
            <CardContent>
              {me.swaps.length === 0 ? (
                <p className="text-sm text-muted-foreground">{swapsEmptyText(me)}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {me.swaps.map((s) => (
                    <li key={`${s.slot}:${s.in.playerId}`}>{swapLine(s)}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <PlayerList title="Bench" players={me.bench} onOpen={setSelected} />
            <PlayerList title="Unavailable" players={me.unavailable} onOpen={setSelected} />
          </div>
        </>
      )}

      <PlayerDetailPanel
        season={season ?? 0}
        player={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
```

- [x] **Step 6: Run** `npx vitest run tests/renderer/components/LineupScreen.test.tsx` — PASS. If `getByText('Q')` also matches the `PositionBadge` of a QB, there is no QB in the fixture; if `getAllByText('O')` is ambiguous, scope it with `within(screen.getByText('Unavailable').closest('div')!)` — keep the intent: the badge renders.

- [x] **Step 7:** `npm run typecheck && npm run lint && npm test` — PASS. **Commit** — `feat(ui): Lineup screen`.

---

### Task 8: Data reference and dev-app check

**Files:**
- Modify: `docs/reference/value-and-signals.md`

- [x] **Step 1: Document.** Edits to `docs/reference/value-and-signals.md`:

- Intro paragraph: "the current v0.9.0 presentation" → "the current v0.10.0 presentation"; add "slice 6a (lineup model) rationale in `docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md`" to the rationale sentence.
- Table "How the data reaches the renderer": two rows —

```
| `lineup.week({ season, week })` (`window.api.lineup`) | `LineupWeek` | My team and its opponent for the week: optimal lineup, the lineup set on Sleeper, swaps, close calls, bench, unavailable, status. Built from the value build plus `matchups`, `roster_players.starter_index` and Sleeper's `roster_positions`; cached with the value build (same invalidation). FantasyPros weekly rank/grade attached per call. |
| `lineup.strength(season)` | `TeamStrength[]` | Every team's optimal totals over weeks `currentWeek..18` on its current roster, ranked; `null` without projections or after the season. Not shown yet (Plan K puts it on the League cards). |
```

- New section after `## PlayerNews` — paste:

```markdown
## Lineup (added in v0.10.0)

Slice 6a spec §2–§4; engine `src/main/lineup/optimal.ts` (pure), assembly `src/main/lineup/build.ts`, matchups synced by `src/main/sync/matchupsSync.ts` (one step `sleeper:matchups:{season}`, weeks 1–18; past weeks re-fetched after 30 d, current and future weeks every refresh) into `matchups` (migration 006).

### Conventions

- **Lineup slots** = the league's `rosterSlots` expanded one entry per slot in Sleeper's order: `QB RB WR TE K DEF` take their position, `FLEX / SUPER_FLEX / REC_FLEX / WRRB_FLEX` take `FLEX_ELIGIBILITY`; `BN IR TAXI`, IDP and unknown slots are not lineup slots.
- **Week value** = `points` when the week is played, else the league-scored projection, else 0 (bye, no projection) — the `rosPoints` rule.
- **Availability** — `ir` / `taxi` players never start (from the current week on). In the **current week only**, `injuryStatus ∈ UNAVAILABLE_STATUSES` (`Out Doubtful IR PUP Sus COV NA DNR`) → value 0, listed under `unavailable`; `Questionable` keeps its value and is flagged. Future weeks use raw projections.
- **Optimal** = exact maximum-weight assignment (Hungarian); every slot that can be filled is filled; ties are seated deterministically (dedicated slots first, best player; then flex from the most restrictive).
- **Current lineup** = Sleeper's `starters` mapped onto `roster_positions` minus `BN IR TAXI` (`'0'` = empty). Source: the week's `matchups` row, else `roster_players.starter_index` for the current week, else `null`.
- **Roster basis** — a past week uses the roster that played (`matchups.players_json`); the current and future weeks use the current roster.

### `LineupWeek`

| Field | Meaning |
| --- | --- |
| `season`, `week`, `currentWeek` | As the value build. |
| `status` | `final` before the current week (and in it once every player with a game has played), `upcoming` after it or before any game, else `inProgress`. |
| `projectionsStored` | As `ValueContext`; when false values are actuals only. |
| `matchupId` | Sleeper's pairing id for my team that week; `null` on a bye / without a row. |
| `me` | `TeamLineup` for the `is_me` team; `null` without one. |
| `opponent` | `TeamLineup` for the roster sharing `matchupId`; `null` otherwise. |

### `TeamLineup`

| Field | Meaning |
| --- | --- |
| `optimal[]` | One `SlotEntry { slot, player, closeCall }` per lineup slot; `player` null when nobody eligible is left; `closeCall` = best eligible bench player within `CLOSE_CALL_PTS = 2.0`. |
| `optimalTotal` | Σ values of the optimal starters. |
| `current[]`, `currentTotal` | The Sleeper lineup as `SlotEntry` (no close calls) and its Σ; `null` when unknown. |
| `actualTotal` | Sleeper's `points` for a `final` week; `null` otherwise. |
| `bench[]` | Startable players left out, best first. |
| `unavailable[]` | IR / taxi and current-week Out / Doubtful players. |
| `swaps[]` | `{ slot, out, in, delta }`: starters the optimal lineup adds, each paired with one it removes (same position first, weakest first); `out` null when the current slot was empty; a player who only changes slot is not a swap. |

### `LineupPlayer`

`playerId`, `fullName`, `position`, `team`, `statsAvailable` (the `DetailTarget` the detail panel opens on), `opponent` (NFL, `null` on a bye), `dvpRank` (that opponent's defense-vs-position rank at the player's position, 1 = hardest), `value`, `played`, `injuryStatus`, `flag` (`out | doubtful | questionable | bye | null`), `expert` (`{ ecrPosRank, grade }` from FantasyPros weekly, `null` without a row), `floor`, `ceiling` (from `signals`).

### `TeamStrength`

`rosterId`, `name`, `isMe`, `thisWeek` (optimal total of the current week), `rosTotal` (Σ over `currentWeek..18`), `rosPerWeek`, `rank` (1 = strongest). All `null` when `!projectionsStored` or the season is over.

### Where it is shown (v0.10.0) — Lineup screen

1. **Header** — week picker (default `currentWeek`); `You {optimalTotal} optimal · {currentTotal} current vs {opponent.name} {currentTotal ?? optimalTotal} current|optimal`; final weeks `You {actualTotal} – {opponent} {actualTotal} · W/L/T` and `Left on bench: +Δ` (`optimalTotal − actualTotal`) for both sides; notes `No matchup this week`, `No projections stored — values are actuals only`, `Your team isn't identified — re-import from Setup`.
2. **Slot table** — Slot · Your starter · Pts · Optimal · Pts · Δ; rows whose optimal starter is not among the current starters are tinted and carry Δ = `value(optimal) − value(current in that slot ?? 0)`; `≈ {alt}` (amber) with the close-call tooltip (both players' value, floor/ceiling, ECR + grade, opponent + DvP); flags `Q` amber, `D`/`O` red, `BYE` muted; names open `PlayerDetailPanel`.
3. **Swaps** — `Start A over B (SLOT, +Δ)`; empty states `Your lineup is optimal` / `Lineup not set on Sleeper yet`.
4. **Bench** / **Unavailable** — name, team, opponent, flag, value.

Not shown yet: `TeamStrength` (Plan K), the opponent's slot table (Plan K), `expert` on bench players (in the payload).
```

- Constants table: add a row `| `src/main/lineup/optimal.ts`, `src/main/sync/matchupsSync.ts` | `CLOSE_CALL_PTS = 2`, `UNAVAILABLE_STATUSES`, `QUESTIONABLE_STATUS`, `RESERVE_SLOTS = BN IR TAXI`; `MATCHUPS_PAST_FRESHNESS_MS = 30 d` |`.
- Module map: add `src/main/lineup/optimal.ts` (slots, assignment, placement, swaps, close calls, week value/flag), `src/main/lineup/build.ts` (team-weeks, current lineup mapping, `lineupWeek`, `teamStrengths`), `src/main/sync/matchupsSync.ts` + `src/main/db/repos/matchups.ts`, `src/renderer/src/lib/lineupView.ts` + `screens/LineupScreen.tsx`.
- `## Where each number is shown today (v0.9.0)` → `(v0.10.0)`.

- [x] **Step 2: Dev-app check** (`npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu`; record the PID and stop it by PID afterwards — never with a `pgrep -f` pattern that matches the harness shell). Refresh → the status bar shows `sleeper:matchups:2026` ok with "18 weeks fetched, 16 teams" (or fewer weeks if playoff weeks are empty). Open **Lineup**: the current week loads; header shows both totals and the opponent's name; the slot table shows 10 slots (1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX, 1 K, 1 DEF) with the Sleeper lineup on the left; swaps read sensibly (or "Your lineup is optimal"); switch to week 1 → final header with `Left on bench`; switch to a playoff week → `No matchup this week`. Click a name → the detail panel opens. Note the real numbers (my optimal/current totals, one close call) in the progress notes.

- [x] **Step 3: Commit** — `docs: lineup model in the data reference`. Then ask the user to check the dev app before the build.

---

### Task 9: Version 0.10.0, Windows build, tag

Only after the user has checked Task 8 in the dev app and asked for the build.

- [x] **Step 1:** `package.json` / `package-lock.json` version `0.9.0` → `0.10.0`; `npm run typecheck && npm run lint && npm test`; commit `build: bump version to 0.10.0`.
- [x] **Step 2:** `npm run build:win`; copy `dist/FantasyCompanion-Setup-0.10.0.exe` to `/mnt/c/Users/habie/OneDrive/Bureau/`.
- [x] **Step 3:** User installs over 0.9.0 — migration 006 runs on first launch, the first refresh adds the matchups step. Check: the Lineup screen for the current week, a past week's result and `Left on bench`, one close-call tooltip, a name opening the detail panel.
- [x] **Step 4:** Progress notes appended to this plan, commit `docs(plan): mark plan J complete`, tag `v0.10.0`, fast-forward `main`, delete the branch. Plan K (League cards power ranking + Opponent section) follows under the same spec → v0.11.0.

---

## Self-review notes

- **Spec coverage:** §2.1 slots (T4 `lineupSlots`), §2.2 value (T4 `weekValue`, T5 `weekPlayer`), §2.3 availability (T4 `weekFlag`/`isUnavailable`, T5 `reserved` + current-week rule, tested both ways), §2.4 exact assignment + deterministic ties (T4 Hungarian + `placeDeterministically`, brute-force property test), §2.5 swaps / close calls (T4, T5), §3.1 client (T1), §3.2 table (T2, INTEGER season noted), §3.3 step + freshness + empty week + non-fatal failure (T3), §3.4 mapping incl. `BN` removal and the `starter_index` fallback (T2 fix + T4 `currentAssignments` + T5 `currentPlaced`), §4.1 build, strength, cache (T5, T6), §4.2 both IPC calls (T6), §4.3 types (T5, + `statsAvailable`), §5.1 items 1–4 (T7), §5.3 data reference (T8), §6 error cases (no projections → note; past season → strengths null / weeks final; no `is_me` → header note; short roster → empty slots; no matchup → `opponent null`; renderer error line + keyed state), §7 tests (T4 property, T5 fixture build, T3 sync, T6/T7 renderer), §9 Plan J → v0.10.0 (T9). §5.1 item 5 and §5.2 are Plan K by the spec.
- **Placeholders:** none; every step has its code or its exact command.
- **Type consistency:** `Candidate`/`Placed`/`LineupSlot` (T4) are what T5 consumes; `LineupPlayer` includes `statsAvailable` (T5 types, T5 build, T7 `DetailTarget`); `WeekQuery { season, week }` reused for `lineup.week` (T6, T7); `TeamLineup.current: SlotEntry[] | null` drives `swapsEmptyText` and `isNewStarter` (T6, T7); `ExpertRankRow.posRank/grade` → `expert { ecrPosRank, grade }` (T5).
- **Fixture caveat:** the Sleeper fixture's `starters` arrays are shorter than the 9 starting slots — the T5 tests exploit that deliberately (empty slots, moved players); expectations that depend on projection values read them back through `value.series` rather than hard-coding numbers.

## Progress notes (2026-09-20)

All tasks executed inline in one session on `feat/lineup-model`; 374 tests (from 328), typecheck and lint green at every commit.

- **T1–T3 as planned.** Existing Sleeper sync tests counted steps by position (`3 + 18` → `4 + 18`) and assumed every step is `skipped` when fresh — the matchups step always runs by design, so those assertions now exclude it and check the order `state, league, matchups, players, projections…`. `SyncLogEntry.rowsWritten` (not `rows`) is the field name.
- **T4:** the 150-seed brute-force property test passed on the first run; the whole engine suite runs in <200 ms.
- **T5:** all 11 fixture-DB tests passed on the first run — the fixture's short `starters` arrays land on `QB, RB, RB(empty), WR` exactly as the plan predicted. One addition after the real-data read: `TeamLineup.swaps` is sorted by `delta` descending (spec §5.1 "largest Δ first"); the engine's own order (by the incoming player's value) is only for pairing.
- **T6–T7 as planned.**
- **T8 real-data read** (dev DB copy, live Sleeper fetch): `sleeper:matchups:2026` ok, "18 weeks fetched, 16 teams" in 788 ms; a second run skipped the fresh past week. Week 2 (in progress): my optimal 121.66 vs current 115.07 → swaps *Stafford over Young (+0.39, close call ≈ Young)*, *Buccaneers D over Texans (+2.93)*, *Rodriguez over E. Johnson (+3.27)*; Josh Jacobs unavailable (`NA`). Week 1 final: 134.94–124.76 W, 15.5 left on the bench. Strength: 16 teams in 30 ms, my roster #10 (leader 2 103.8 ROS, 123.8/wk). Whole-league lineup build 239 ms on top of the cached value build. Dev app checked by the user: "all good".
- **Extra (user request during the dev-app check):** `fix(ui): show fantasy points with two decimals` — `fmtPoints` → 2 decimals, `fmtSigned(value, decimals = 2)`, table formats `pts` / `signedPts` for point-valued columns; SOS, expert spread, TD delta and yards/opp stay at 1 decimal. Data reference conventions updated.
- **T9:** `v0.10.0` built with `npm run build:win`; installer copied to `C:\Users\habie\OneDrive\Bureau\FantasyCompanion-Setup-0.10.0.exe` (installing over 0.9.0 runs migration 006). **Windows install check is the one step left open until the user confirms.** Plan K (League cards power ranking + Opponent section → v0.11.0) is next under the same spec.
