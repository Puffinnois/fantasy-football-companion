# Plan O — Waiver adds and stash (slice 6c, phase 1)

**Status:** complete — executed inline on 2026-09-23, merged and released as `v0.16.0`. No deviations from the plan's code. Measured: the pruned search equals brute force on three generated leagues (IR moves included); budget 859 ms for 16 teams + 550 free agents (limit 3 s); real league 223 ms for waiver adds (+234 ms to build the lineup data), 30 lineup adds / 40 stash candidates, every best release the bench WR who barely starts, no IR move (the only injured starter is `NA`, which the league does not allow on IR); the bundled `engineWorker.js` ran against a migrated copy of the real DB in plain Node (507 ms). **Not verified:** the Waivers screen and the Rules IR fields were not clicked through in a running app (WSLg), and the renamed worker inside a packaged asar is untested — if it fails there, add `out/main/engineWorker.js` to `asarUnpack` in `electron-builder.yml`. Waiver priority and IR settings appear after the next sync (the dev DB copy predates them).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A **Waivers** screen whose rest-of-season mode lists the free agents that raise my team strength (*Improves my lineup*) and the ones with upside the lineup can't see yet (*Stash*), each with the exact best way to make room (open spot, IR move or drop) and an override dropdown; plus the data it needs (IR settings, waiver priority, Sleeper trending adds, signal snapshots); ship `v0.16.0`.

**Architecture:** Pure modules in `src/main/waiver/` on the cached-style `LineupBuild`: `release.ts` (which releases exist, the tie order), `search.ts` (the exact per-free-agent search of spec §2.3 with three exact shortcuts and a `skip: false` brute-force mode for the property test), `stash.ts` (signal shortlist), `adds.ts` (the `WaiverAdds` payload). They run in a generic **engine worker** that replaces Plan M's trade worker (`src/main/engine/`), reached through a new `waiver:adds` channel. Data: migration 009 (`trending_adds`, two `ros_snapshots` columns, `teams.waiver_position`), a non-fatal `sleeper:trending:add` sync step, `LeagueSettings.irSlots` / `irStatuses` mapped from Sleeper and editable on the Rules screen. The renderer adds `WaiverScreen.tsx` (two cards) with pure strings in `lib/waiverView.ts`.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4 + shadcn, Vitest (jsdom + Testing Library for component tests), `node:sqlite`, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-23-slice6c-waivers-design.md` — §2 (engine), §3 (stash), §5 (data and sync), §6 (types, IPC, engine worker), §8 (screen, *Rest of season* only), §9 (errors), §10 (tests), §12 (Plan O = `v0.16.0`). Streaming (§4) and the trade builder's open-spot line (§7) are Plan P.

## Global Constraints

- Same as Plans C–N: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use` if `node --version` is not 22.x), no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`. Path aliases: `@main/*`, `@shared/*`, `@/*` (renderer). Tests import fixtures relatively (`../../fixtures/...`).
- **Payload conventions** (`docs/reference/value-and-signals.md`): `null` = not computable; points with 2 decimals (`fmtPoints`), signed with `fmtSigned`, `—` for null; market values and counts through `fmtMarket` (thin-space thousands).
- **Window** (spec §2.1): `currentWeek..lastWeek` from `windowWeeks(build)`; `requireWindow` throws `TradeError('NO_PROJECTIONS')`, `myTeam` throws `TradeError('NO_ME')` — both from `@main/trade/evaluate`.
- **Releases** (spec §2.2): `open` when active players (roster slot not `ir` / `taxi`) < `rosterSize(build)` (or the size is unknown) — then it is the **only** option; otherwise one `drop` per active player plus one `ir` per active player whose `injuryStatus` is in `irStatuses` while an IR slot is free (`irSlots` > players in the `ir` slot). No `irSlots` → no IR move.
- **Tie order** (spec §2.3 step 4): higher `delta` first; ties `open` → `ir` → `drop`, then the least upside first: lowest FantasyCalc `market.value` (none = 0), then worst FantasyPros overall `expert.ecrRank` (unranked = worst), then lowest `rosPoints` (none = 0), then name.
- **Thresholds** (spec §2.4 / §3): `LINEUP_MIN_DELTA = 0.5` points over the window; `WAIVER_MAX = 30` rows per list; the stash shortlist is the union of the top 30 by market, by trending and by rank.
- **Budget** (spec §10): rest-of-season adds ≤ 3 s on 16 teams × 16 players + 550 free agents (`npm run test:budget`).
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits, summary ≤ 50 chars, imperative, **no trailers** (no `Co-Authored-By`, no "Generated with").
- ESLint is strict: explicit return types on every named function and component, `react-hooks/set-state-in-effect` is an error (state is set only in promise callbacks / event handlers), no unused vars / imports.
- Decisions locked in here (not in the spec):
  - **Names:** the spec's `Release` type is `WaiverRelease` (the app already talks about app *releases*); `WaiverAdds` carries `currentWeek` / `lastWeek` / `weeks` instead of `window: { from, to }` so the renderer reuses `windowLabel()`.
  - **A third exact shortcut** (beyond the spec's two): for a release `r` that starts in the oversized solve, if the add still can't enter *my roster without `r`* (solved once per `r` in the context), that solve is the answer — no re-solve. Guarded by the property test.
  - **`requireWindow`'s message** becomes neutral: "No projections stored for this season — trades and waivers are valued on the remaining weeks".
  - **Stash candidates** exclude every free agent whose best lineup Δ is ≥ `LINEUP_MIN_DELTA`, listed or not (spec review: nobody in both lists).
  - **Snapshot keep rule:** a player with nothing projected ahead and no rank is still recorded when he is trending (the backtest needs trending players).
  - **Loading state:** "Calculating…" before the first result; "Refreshing…" above the previous result while a new one computes (spec §8's "spinner" is this line of text, matching the Trade screen's "Loading…").
  - **IR statuses** are stored in canonical `IR_STATUSES` order with `IR` always first (`canonicalIrStatuses`).

---

### Task 0: Branch

**Files:** none.

- [x] **Step 1:** `git checkout -b feat/waiver-adds` from `main` (clean, at `0a67ee9` or later).

---

### Task 1: IR settings — `irSlots`, `irStatuses`

**Files:**

- Modify: `src/shared/rules.ts` (`LeagueSettings`, new constants and `canonicalIrStatuses`)
- Modify: `src/main/sync/mappers.ts` (`mapRules`)
- Modify: `src/main/scoring/normalize.ts`
- Test: `tests/main/sync/mappers.test.ts`, `tests/main/scoring/normalize.test.ts`

**Interfaces:**

- Produces: `IR_STATUSES` (`readonly ['IR', 'PUP', 'Out', 'Doubtful', 'Sus', 'NA', 'DNR', 'COV']`), `MAX_IR_SLOTS = 10`, `canonicalIrStatuses(statuses: readonly string[] | undefined): string[]`, `LeagueSettings.irSlots?: number`, `LeagueSettings.irStatuses?: string[]`.

- [x] **Step 1: Write the failing tests**

In `tests/main/sync/mappers.test.ts`, inside `describe('mapRules', …)`:

```ts
    it('maps IR slots and the statuses the league allows on IR', () => {
      const rules = mapRules(
        {
          ...fx.league,
          settings: {
            ...fx.league.settings,
            reserve_slots: 2,
            reserve_allow_out: 1,
            reserve_allow_doubtful: 0,
            reserve_allow_cov: 1
          }
        },
        'T'
      )
      expect(rules.settings.irSlots).toBe(2)
      expect(rules.settings.irStatuses).toEqual(['IR', 'Out', 'COV'])
    })

    it('leaves IR unset when Sleeper sends no reserve slots', () => {
      const rules = mapRules(fx.league, 'T')
      expect(rules.settings.irSlots).toBeUndefined()
      expect(rules.settings.irStatuses).toBeUndefined()
    })
```

In `tests/main/scoring/normalize.test.ts`:

```ts
  it('keeps IR slots and stores IR statuses in canonical order, IR first', () => {
    const out = normalizeRules(
      rules({ settings: { ...rules().settings, irSlots: 2, irStatuses: ['COV', 'Out'] } }),
      T
    )
    expect(out.settings.irSlots).toBe(2)
    expect(out.settings.irStatuses).toEqual(['IR', 'Out', 'COV'])
  })

  it('rejects unknown IR statuses and too many IR slots', () => {
    expect(() =>
      normalizeRules(rules({ settings: { ...rules().settings, irStatuses: ['Questionable'] } }), T)
    ).toThrow('IR statuses must be among')
    expect(() =>
      normalizeRules(rules({ settings: { ...rules().settings, irSlots: 11 } }), T)
    ).toThrow('IR slots must be at most 10')
  })
```

- [x] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/main/sync/mappers.test.ts tests/main/scoring/normalize.test.ts`
Expected: FAIL — `irSlots` undefined / no throw.

- [x] **Step 3: Implement**

`src/shared/rules.ts` — add to `LeagueSettings` (after `playoffRoundType`):

```ts
  /** Sleeper `reserve_slots`: IR spots outside the roster size (slice 6c spec §5.4). */
  irSlots?: number
  /** Injury statuses allowed on IR, in `IR_STATUSES` order, `IR` first. */
  irStatuses?: string[]
```

and below the interface:

```ts
/** Slice 6c spec §5.4: injury statuses a league can allow in an IR slot; `IR` is always allowed. */
export const IR_STATUSES = ['IR', 'PUP', 'Out', 'Doubtful', 'Sus', 'NA', 'DNR', 'COV'] as const
export const MAX_IR_SLOTS = 10

/** Canonical order, `IR` always in, unknown statuses dropped. */
export function canonicalIrStatuses(statuses: readonly string[] | undefined): string[] {
  return IR_STATUSES.filter((s) => s === 'IR' || (statuses ?? []).includes(s))
}
```

`src/main/sync/mappers.ts` — import `canonicalIrStatuses` from `@shared/rules`; above `mapRules`:

```ts
/** Sleeper `reserve_allow_*` flag → the injury status it lets onto IR (slice 6c spec §5.4). */
const RESERVE_FLAGS: [string, string][] = [
  ['reserve_allow_out', 'Out'],
  ['reserve_allow_doubtful', 'Doubtful'],
  ['reserve_allow_sus', 'Sus'],
  ['reserve_allow_na', 'NA'],
  ['reserve_allow_dnr', 'DNR'],
  ['reserve_allow_cov', 'COV']
]
```

and in `mapRules`, after the `playoff_round_type` line:

```ts
  if (s.reserve_slots !== undefined) {
    settings.irSlots = s.reserve_slots
    settings.irStatuses = canonicalIrStatuses(
      RESERVE_FLAGS.filter(([flag]) => s[flag] === 1).map(([, status]) => status)
    )
  }
```

`src/main/scoring/normalize.ts` — import `canonicalIrStatuses`, `IR_STATUSES`, `MAX_IR_SLOTS`; add `'irSlots'` to `OPTIONAL_SETTINGS`; after the `for (const key of OPTIONAL_SETTINGS)` loop:

```ts
  if (settings.irSlots !== undefined && settings.irSlots > MAX_IR_SLOTS) {
    throw new Error(`IR slots must be at most ${MAX_IR_SLOTS}`)
  }
  if (s.irStatuses !== undefined) {
    const known: readonly string[] = IR_STATUSES
    if (!Array.isArray(s.irStatuses) || s.irStatuses.some((x) => !known.includes(x))) {
      throw new Error(`IR statuses must be among ${IR_STATUSES.join(', ')}`)
    }
    settings.irStatuses = canonicalIrStatuses(s.irStatuses)
  }
```

- [x] **Step 4: Run the tests, then the full check**

Run: `npx vitest run tests/main/sync/mappers.test.ts tests/main/scoring/normalize.test.ts` → PASS.
Run: `npm run typecheck && npm run lint && npm test` → green.

- [x] **Step 5: Commit**

```bash
git add src/shared/rules.ts src/main/sync/mappers.ts src/main/scoring/normalize.ts tests/main/sync/mappers.test.ts tests/main/scoring/normalize.test.ts
git commit -m "feat(rules): map IR slots and IR-eligible statuses"
```

---

### Task 2: Migration 009 and waiver position

**Files:**

- Create: `src/main/db/migrations/009_waivers.sql`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/shared/types.ts` (`Team.waiverPosition`)
- Modify: `src/main/sources/sleeper-types.ts` (`SleeperRosterSettings.waiver_position`)
- Modify: `src/main/sync/mappers.ts` (`mapTeams`)
- Modify: `src/main/db/repos/teams.ts` (`replaceTeams`, `listTeams`)
- Modify (fixtures): `tests/fixtures/sleeper.ts`, `tests/fixtures/league.ts`, `tests/fixtures/synthetic.ts` (`team()`), `tests/main/db/repos.test.ts` (`team()`)
- Test: `tests/main/db/migrate.test.ts`, `tests/main/sync/mappers.test.ts`, `tests/main/db/repos.test.ts`

**Interfaces:**

- Produces: `Team.waiverPosition: number | null`; tables `trending_adds(player_id, count, fetched_at)`, columns `ros_snapshots.market_value`, `ros_snapshots.trending_adds`, `teams.waiver_position`.

- [x] **Step 1: Write the failing tests**

`tests/main/db/migrate.test.ts`: change the three `8`s (`expect(version).toBe(8)`, `expect(row.n).toBe(8)`, `expect(migrate(db)).toBe(8)`) to `9` and add `'trending_adds'` to the `expect.arrayContaining([...])` table list.

`tests/fixtures/sleeper.ts`: add `waiver_position: 3` to the first roster's `settings` (roster 1).

`tests/main/sync/mappers.test.ts`, after `'maps teams with owner names, decimal points and isMe'`:

```ts
  it('maps the waiver position, null when Sleeper sends none', () => {
    const teams = mapTeams('L1', fx.rosters, fx.users, 'u1')
    expect(teams.map((t) => t.waiverPosition)).toEqual([3, null])
  })
```

`tests/main/db/repos.test.ts`: add `waiverPosition: null,` to the `team()` builder's defaults, and a test next to the other teams tests:

```ts
  it('round-trips the waiver position', () => {
    replaceTeams(db, 'L1', [team(1, { waiverPosition: 5 }), team(2)], T)
    const byRoster = new Map(listTeams(db, 'L1').map((t) => [t.rosterId, t.waiverPosition]))
    expect(byRoster.get(1)).toBe(5)
    expect(byRoster.get(2)).toBeNull()
  })
```

`tests/fixtures/league.ts` `team()` and `tests/fixtures/synthetic.ts` `team()`: add `waiverPosition: null` (the synthetic one becomes `waiverPosition: t.waiverPosition ?? null` in Task 5).

- [x] **Step 2: Run to see the failures**

Run: `npx vitest run tests/main/db tests/main/sync/mappers.test.ts`
Expected: FAIL — version 8, `waiverPosition` undefined, typecheck-level errors on the new field.

- [x] **Step 3: Implement**

`src/main/db/migrations/009_waivers.sql`:

```sql
-- Slice 6c: Sleeper trending adds (latest fetch only), the two stash signals in the weekly
-- snapshot (history for a backtest), and each team's waiver priority.
CREATE TABLE trending_adds (
  player_id TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  fetched_at TEXT NOT NULL
);

ALTER TABLE ros_snapshots ADD COLUMN market_value INTEGER;
ALTER TABLE ros_snapshots ADD COLUMN trending_adds INTEGER;
ALTER TABLE teams ADD COLUMN waiver_position INTEGER;
```

`src/main/db/migrations/index.ts`: `import waiversSql from './009_waivers.sql?raw'` and `{ version: 9, name: 'waivers', sql: waiversSql }` at the end of `migrations`.

`src/shared/types.ts`, in `Team` after `isMe`:

```ts
  /** Sleeper roster `settings.waiver_position`; null when Sleeper sends none (slice 6c spec §5.3). */
  waiverPosition: number | null
```

`src/main/sources/sleeper-types.ts`, in `SleeperRosterSettings`: `waiver_position?: number`.

`src/main/sync/mappers.ts` `mapTeams`, after `isMe`: `waiverPosition: s.waiver_position ?? null`.

`src/main/db/repos/teams.ts`: `TeamRow` gains `waiver_position: number | null`; `replaceTeams` inserts it:

```ts
  const insert = db.prepare(
    `INSERT INTO teams (league_id, roster_id, owner_id, display_name, team_name, avatar, wins, losses, ties, fpts,
       fpts_against, is_me, waiver_position, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
```

with `t.waiverPosition,` passed after `t.isMe ? 1 : 0,`; `listTeams` maps `waiverPosition: r.waiver_position`.

- [x] **Step 4: Run the tests, then the full check**

Run: `npx vitest run tests/main/db tests/main/sync` → PASS.
Run: `npm run typecheck && npm run lint && npm test` → green (every other `Team` literal is built through the three fixtures above; fix any the typecheck names the same way).

- [x] **Step 5: Commit**

```bash
git add src/main/db/migrations src/shared/types.ts src/main/sources/sleeper-types.ts src/main/sync/mappers.ts src/main/db/repos/teams.ts tests/
git commit -m "feat(db): add migration 009 and waiver position"
```

---

### Task 3: Sleeper trending adds

**Files:**

- Modify: `src/main/sources/sleeper-types.ts`, `src/main/sources/sleeper.ts`
- Create: `src/main/db/repos/trending.ts`
- Create: `src/main/sync/trendingSync.ts`
- Modify: `src/main/sync/refresh.ts`
- Modify (fakes): `tests/main/sync/sleeperSync.test.ts` (`fakeClient`), `tests/main/sync/refresh.test.ts` (`sleeper`)
- Test: `tests/main/sources/sleeper.test.ts`, `tests/main/sync/trendingSync.test.ts` (new), `tests/main/sync/refresh.test.ts`

**Interfaces:**

- Consumes: `runStep`, `nowOf`, `SyncDeps` (`@main/sync/step`); `withTransaction` (`@main/db/connection`); table `trending_adds` (Task 2).
- Produces: `SleeperTrendingPlayer { player_id: string; count: number }`; `SleeperClient.getTrendingAdds(): Promise<SleeperTrendingPlayer[]>`; `TrendingRecord { playerId: string; count: number }`; `replaceTrendingAdds(db, records, fetchedAt): number`; `listTrendingAdds(db): Map<string, number>`; `trendingFetchedAt(db): string | null`; `SOURCE_TRENDING = 'sleeper:trending:add'`; `mapTrending(items): TrendingRecord[]`; `refreshTrending(deps: SyncDeps): Promise<SyncResult>`.

- [x] **Step 1: Write the failing tests**

`tests/main/sources/sleeper.test.ts`, inside `describe('createSleeperClient', …)`:

```ts
  it('getTrendingAdds asks for the last 24 h of adds, top 100', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: [{ player_id: '4866', count: 1200 }] }])
    const rows = await createSleeperClient({ fetchImpl }).getTrendingAdds()
    expect(rows).toEqual([{ player_id: '4866', count: 1200 }])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=100',
      expect.anything()
    )
  })
```

`tests/main/sync/trendingSync.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { listTrendingAdds, replaceTrendingAdds, trendingFetchedAt } from '@main/db/repos/trending'
import type { SleeperClient } from '@main/sources/sleeper'
import type { SyncDeps } from '@main/sync/step'
import { mapTrending, refreshTrending, SOURCE_TRENDING } from '@main/sync/trendingSync'

const T0 = '2026-09-20T08:00:00.000Z'
const T = '2026-09-22T10:00:00.000Z'

describe('refreshTrending (slice 6c spec §5.1)', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })
  const deps = (getTrendingAdds: SleeperClient['getTrendingAdds']): SyncDeps => ({
    db,
    sleeper: { getTrendingAdds } as unknown as SleeperClient,
    now: () => new Date(T)
  })

  it('replaces the stored list with the latest fetch, as one logged step', async () => {
    replaceTrendingAdds(db, [{ playerId: 'old', count: 1 }], T0)
    const { steps } = await refreshTrending(
      deps(async () => [
        { player_id: '4866', count: 1200 },
        { player_id: '9509', count: 40 }
      ])
    )
    expect(steps).toEqual([expect.objectContaining({ source: SOURCE_TRENDING, status: 'ok' })])
    expect(listTrendingAdds(db)).toEqual(
      new Map([
        ['4866', 1200],
        ['9509', 40]
      ])
    )
    expect(trendingFetchedAt(db)).toBe(T)
  })

  it('keeps the previous list when Sleeper fails', async () => {
    replaceTrendingAdds(db, [{ playerId: '4866', count: 5 }], T0)
    const { steps } = await refreshTrending(
      deps(async () => {
        throw new Error('Sleeper 503')
      })
    )
    expect(steps[0]).toMatchObject({ source: SOURCE_TRENDING, status: 'error' })
    expect(listTrendingAdds(db)).toEqual(new Map([['4866', 5]]))
    expect(trendingFetchedAt(db)).toBe(T0)
  })

  it('drops malformed rows', () => {
    expect(
      mapTrending([
        { player_id: '', count: 3 },
        { player_id: '1', count: Number.NaN },
        { player_id: '2', count: 7 }
      ])
    ).toEqual([{ playerId: '2', count: 7 }])
  })

  it('reports no fetch time before the first fetch', () => {
    expect(trendingFetchedAt(db)).toBeNull()
  })
})
```

`tests/main/sync/refresh.test.ts`: add `getTrendingAdds: vi.fn(async () => [{ player_id: '4866', count: 12 }])` to `sleeper`, and change the two `slice(-5)` assertions to `slice(-6)` with `'sleeper:trending:add'` before `'snapshot:ros:2026'`:

```ts
    expect(sources.slice(-6)).toEqual([
      'fantasypros:weekly:2026:1',
      'fantasypros:weekly:2026:2',
      'fantasypros:ros:2026',
      'fantasycalc:2026',
      'sleeper:trending:add',
      'snapshot:ros:2026'
    ])
    // …
    expect(refreshed.steps.map((s) => s.source).slice(-6)).toEqual(sources.slice(-6))
```

(and rename the test to `'runs the expert steps after Sleeper and nflverse, then trending adds and the ROS snapshot, on import and on refresh'`).

`tests/main/sync/sleeperSync.test.ts` `fakeClient`: add `getTrendingAdds: vi.fn(async () => []),`.

- [x] **Step 2: Run to see the failures**

Run: `npx vitest run tests/main/sources/sleeper.test.ts tests/main/sync`
Expected: FAIL — `getTrendingAdds` / `trendingSync` do not exist.

- [x] **Step 3: Implement**

`src/main/sources/sleeper-types.ts`:

```ts
/** `GET /players/nfl/trending/add`: most-added players across all Sleeper leagues over the lookback. */
export interface SleeperTrendingPlayer {
  player_id: string
  count: number
}
```

`src/main/sources/sleeper.ts` — import the type; in `SleeperClient`:

```ts
  /** Most-added players across all Sleeper leagues over the last 24 h (slice 6c spec §5.1). */
  getTrendingAdds(): Promise<SleeperTrendingPlayer[]>
```

constants next to `PROJECTION_POSITIONS`:

```ts
const TRENDING_LOOKBACK_HOURS = 24
const TRENDING_LIMIT = 100
```

and in the returned object:

```ts
    getTrendingAdds: () =>
      getJsonRequired<SleeperTrendingPlayer[]>(
        `/players/nfl/trending/add?lookback_hours=${TRENDING_LOOKBACK_HOURS}&limit=${TRENDING_LIMIT}`
      ),
```

`src/main/db/repos/trending.ts`:

```ts
import type { Db } from '../connection'

export interface TrendingRecord {
  playerId: string
  count: number
}

/** Slice 6c spec §5.1: only the latest fetch is kept; the weekly history lives in `ros_snapshots`. */
export function replaceTrendingAdds(db: Db, records: TrendingRecord[], fetchedAt: string): number {
  db.prepare('DELETE FROM trending_adds').run()
  const insert = db.prepare(
    'INSERT OR REPLACE INTO trending_adds (player_id, count, fetched_at) VALUES (?, ?, ?)'
  )
  for (const r of records) insert.run(r.playerId, r.count, fetchedAt)
  return records.length
}

export function listTrendingAdds(db: Db): Map<string, number> {
  const rows = db.prepare('SELECT player_id, count FROM trending_adds').all() as unknown as {
    player_id: string
    count: number
  }[]
  return new Map(rows.map((r) => [r.player_id, r.count]))
}

/** When the stored list was fetched; null before the first fetch. */
export function trendingFetchedAt(db: Db): string | null {
  const row = db.prepare('SELECT MAX(fetched_at) AS at FROM trending_adds').get() as
    | { at: string | null }
    | undefined
  return row?.at ?? null
}
```

`src/main/sync/trendingSync.ts`:

```ts
import { withTransaction } from '@main/db/connection'
import { replaceTrendingAdds, type TrendingRecord } from '@main/db/repos/trending'
import type { SleeperTrendingPlayer } from '@main/sources/sleeper-types'
import type { SyncResult } from '@shared/types'
import { nowOf, runStep, type SyncDeps } from './step'

export const SOURCE_TRENDING = 'sleeper:trending:add'

/** Keeps well-formed rows only, so one bad row can't sink the step. */
export function mapTrending(items: SleeperTrendingPlayer[]): TrendingRecord[] {
  return items.flatMap((it) =>
    typeof it.player_id === 'string' && it.player_id !== '' && Number.isFinite(it.count)
      ? [{ playerId: it.player_id, count: Math.round(it.count) }]
      : []
  )
}

/**
 * Slice 6c spec §5.1: the Stash list's trending signal. Runs every sync, before the ROS snapshot
 * that records it; a failure is logged and leaves the previous fetch in place.
 */
export async function refreshTrending(deps: SyncDeps): Promise<SyncResult> {
  const entry = await runStep(deps, SOURCE_TRENDING, 0, true, async () => {
    const records = mapTrending(await deps.sleeper.getTrendingAdds())
    return withTransaction(deps.db, () =>
      replaceTrendingAdds(deps.db, records, nowOf(deps).toISOString())
    )
  })
  return { steps: [entry] }
}
```

`src/main/sync/refresh.ts` — import `refreshTrending` from `./trendingSync`; in both `refreshAll` and `importAll`, before `snapshotRos`:

```ts
  const trending = await refreshTrending(deps)
```

and return `steps: [...sleeper.steps, ...nflverse.steps, ...experts.steps, ...trending.steps, ...snapshot.steps]`. Update the `refreshAll` doc comment: "…then the expert layer (it needs the crosswalk), then trending adds and the weekly snapshot that records them."

- [x] **Step 4: Run the tests, then the full check**

Run: `npx vitest run tests/main/sources/sleeper.test.ts tests/main/sync` → PASS.
Run: `npm run typecheck && npm run lint && npm test` → green.

- [x] **Step 5: Commit**

```bash
git add src/main/sources src/main/db/repos/trending.ts src/main/sync/trendingSync.ts src/main/sync/refresh.ts tests/main/sources tests/main/sync
git commit -m "feat(sync): fetch Sleeper trending adds"
```

---

### Task 4: Stash signals in the weekly snapshot

**Files:**

- Modify: `src/main/db/repos/rosSnapshots.ts`
- Modify: `src/main/value/snapshot.ts`
- Test: `tests/main/value/snapshot.test.ts`

**Interfaces:**

- Consumes: `listTrendingAdds` (Task 3), `listMarketValues` (`@main/db/repos/marketValues`).
- Produces: `RosSnapshotRecord.marketValue: number | null`, `RosSnapshotRecord.trendingAdds: number | null`.

- [x] **Step 1: Write the failing tests**

In `tests/main/value/snapshot.test.ts` (import `replaceMarketValues` from `@main/db/repos/marketValues` and `replaceTrendingAdds` from `@main/db/repos/trending`):

```ts
  it('records the stash signals: market value and trending adds (slice 6c spec §5.2)', () => {
    replaceMarketValues(
      db,
      SEASON,
      [{ playerId: '9509', value: 4321, overallRank: 1, posRank: 1, tier: null, trend30d: 0 }],
      SEED_TS
    )
    replaceTrendingAdds(db, [{ playerId: '9509', count: 250 }], SEED_TS)
    const snap = buildRosSnapshot(db, 'L1', SEASON)
    expect(snap?.records.find((r) => r.playerId === '9509')).toMatchObject({
      marketValue: 4321,
      trendingAdds: 250
    })
    expect(snap?.records.find((r) => r.playerId === '4866')).toMatchObject({
      marketValue: null,
      trendingAdds: null
    })
  })

  it('keeps a trending player even with nothing projected ahead and no rank', () => {
    // James Cook (8259, on IR in the season fixture) has no projection after week 3 and no rank.
    const without = buildRosSnapshot(db, 'L1', SEASON)
    expect(without?.records.some((r) => r.playerId === '8259')).toBe(false)
    replaceTrendingAdds(db, [{ playerId: '8259', count: 99 }], SEED_TS)
    const snap = buildRosSnapshot(db, 'L1', SEASON)
    expect(snap?.records.find((r) => r.playerId === '8259')).toMatchObject({
      rawRos: 0,
      trendingAdds: 99
    })
  })
```

- [x] **Step 2: Run to see the failures**

Run: `npx vitest run tests/main/value/snapshot.test.ts`
Expected: FAIL — `marketValue` / `trendingAdds` missing.

- [x] **Step 3: Implement**

`src/main/db/repos/rosSnapshots.ts`: `RosSnapshotRecord` gains

```ts
  /** FantasyCalc value at snapshot time (slice 6c spec §5.2); null outside its list. */
  marketValue: number | null
  /** Sleeper adds over the 24 h before the snapshot; null when not trending. */
  trendingAdds: number | null
```

`Row` gains `market_value: number | null` and `trending_adds: number | null`; the insert lists `market_value, trending_adds` after `experts` (19 `?`) and passes `r.marketValue, r.trendingAdds` after `r.experts`; `listRosSnapshot` maps `marketValue: r.market_value, trendingAdds: r.trending_adds`.

`src/main/value/snapshot.ts`:

```ts
import { listTrendingAdds } from '@main/db/repos/trending'
// …
export function buildRosSnapshot(db: Db, leagueId: string, season: number): RosSnapshot | null {
  const bundle = loadSeries(db, leagueId, season)
  const ranks = listExpertRanks(db, season, ROS_WEEK)
  const market = listMarketValues(db, season)
  const build = assembleValue(bundle, { ranks, market })
  const week = bundle.currentWeek
  if (week >= build.context.lastWeek) return null
  const byId = new Map(ranks.map((r) => [r.playerId, r]))
  const marketById = new Map(market.map((m) => [m.playerId, m.value]))
  const trending = listTrendingAdds(db)
  const adjustments = new Map(build.rows.map((r) => [r.playerId, r.rosAdjust]))
  const records: RosSnapshotRecord[] = []
  for (const raw of bundle.players) {
    const id = raw.base.playerId
    const rank = byId.get(id) ?? null
    const rawRos = futureTotal(raw, week)
    // Slice 6c: a trending player is kept even with nothing ahead — the stash backtest needs him.
    if (rawRos === 0 && rank === null && !trending.has(id)) continue
    // … existing fields unchanged …
      experts: rank?.experts ?? null,
      marketValue: marketById.get(id) ?? null,
      trendingAdds: trending.get(id) ?? null
    })
  }
  return { week, records }
}
```

Update the function's doc comment: "…the consensus rank with its spread, and (slice 6c) the market value and trending adds. Players with nothing projected ahead, no rank and no trending adds are left out."

- [x] **Step 4: Run the tests, then the full check**

Run: `npx vitest run tests/main/value/snapshot.test.ts tests/main/sync/snapshotSync.test.ts` → PASS (the round-trip test now carries the two fields through the repo).
Run: `npm run typecheck && npm run lint && npm test` → green.

- [x] **Step 5: Commit**

```bash
git add src/main/db/repos/rosSnapshots.ts src/main/value/snapshot.ts tests/main/value/snapshot.test.ts
git commit -m "feat(snapshot): record market value and trending adds"
```

---

### Task 5: Waiver types, synthetic free agents, release candidates

**Files:**

- Modify: `src/shared/types.ts` (waiver types after `TradeSuggestion`)
- Modify: `src/main/trade/evaluate.ts` (export `isStarter`; neutral `requireWindow` message)
- Modify: `tests/fixtures/synthetic.ts` (free agents, injury, team, rank, waiver position; `WAIVER_LEAGUE`; `generateLeague` free agents)
- Create: `src/main/waiver/release.ts`
- Test: `tests/main/waiver/release.test.ts`

**Interfaces:**

- Consumes: `rosterSize`, `isStarter` (`@main/trade/evaluate`); `UNSTARTABLE_SLOTS` (`@main/value/roster`); `LeagueSettings` (`@shared/rules`).
- Produces (types, `@shared/types`): `WaiverRelease`, `AddOption`, `AddRow`, `StashRow`, `WaiverAdds` (below).
- Produces (`@main/waiver/release`): `ReleaseCandidate { release: WaiverRelease; series: PlayerSeries | null }`; `IrSettings = Pick<LeagueSettings, 'irSlots' | 'irStatuses'>`; `releaseCandidates(build: LineupBuild, roster: PlayerSeries[], ir: IrSettings): ReleaseCandidate[]`; `applyRelease(roster: PlayerSeries[], r: ReleaseCandidate): PlayerSeries[]`; `compareReleases(build: LineupBuild, a: ReleaseCandidate, b: ReleaseCandidate): number`.
- Produces (fixtures): `SyntheticPlayer.injuryStatus? / team? / rank?`, `SyntheticTeam.waiverPosition?`, `SyntheticLeague.freeAgents?`, `WAIVER_LEAGUE`, `generateLeague(seed, teamCount = 16, freeAgents = 0)`.

- [x] **Step 1: Shared types**

`src/shared/types.ts` — at the top: `import type { WaiverType } from './rules'` (a type-only cycle with `rules.ts`, which is fine). After `TradeSuggestion`:

```ts
/** Slice 6c spec §2.2: how an add makes room on my roster. */
export type WaiverRelease =
  | { kind: 'open' }
  | { kind: 'ir'; playerId: string }
  | { kind: 'drop'; playerId: string }

/** Spec §2.4: one way to make room for an add, scored on my window strength. */
export interface AddOption {
  release: WaiverRelease
  /** The player moved to IR or dropped; null for an open spot. */
  releasePlayer: TradePlayer | null
  /** Window total after the move − before. */
  delta: number
  deltaPerWeek: number
  thisWeekDelta: number
  /** Window weeks the added player starts after this move. */
  startWeeks: number[]
}

/** Spec §2.4: a free agent who improves my lineup; options best first, never empty. */
export interface AddRow {
  player: TradePlayer
  options: AddOption[]
}

/** Spec §3: upside the lineup can't see yet; the best option's `delta` is the cost of making room. */
export interface StashRow {
  player: TradePlayer
  /** Sleeper adds in the last 24 h; null when he isn't in the trending list. */
  trending: number | null
  options: AddOption[]
}

/** Spec §6: the Waivers screen's rest-of-season payload. */
export interface WaiverAdds {
  season: number
  currentWeek: number
  lastWeek: number
  /** Window length, currentWeek..lastWeek. */
  weeks: number
  lineup: AddRow[]
  stash: StashRow[]
  waiverType: WaiverType
  /** My place in the waiver order; null when Sleeper sends none. */
  myWaiverPosition: number | null
  teamCount: number
  /** When trending adds were last fetched; null = never. */
  trendingFetchedAt: string | null
}
```

`src/main/trade/evaluate.ts`: `export function isStarter(week: TeamWeek, id: string): boolean` (was private), and `requireWindow`'s message becomes `'No projections stored for this season — trades and waivers are valued on the remaining weeks'`.

- [x] **Step 2: Synthetic fixture — free agents and `WAIVER_LEAGUE`**

`tests/fixtures/synthetic.ts`:

```ts
import { replaceExpertRanks, ROS_WEEK } from '@main/db/repos/expertRanks'
// …
export interface SyntheticPlayer {
  id: string
  position: string
  /** Projected points per window week (one number = the same every week). */
  weekly: number | number[]
  slot?: RosterSlot
  /** FantasyCalc value; omitted / null = outside its list. */
  market?: number | null
  /** Sleeper injury status (e.g. 'Out'); omitted = healthy. */
  injuryStatus?: string
  /** NFL team; free agents need one to be in the candidate pool, so they default to 'KC'. */
  team?: string
  /** FantasyPros ROS consensus (seeded as overall and positional rank); omitted = unranked. */
  rank?: number
}

export interface SyntheticTeam {
  rosterId: number
  name: string
  isMe?: boolean
  waiverPosition?: number
  players: SyntheticPlayer[]
}

export interface SyntheticLeague {
  // … existing fields …
  /** Slice 6c: players on no roster — the value pool's free agents. */
  freeAgents?: SyntheticPlayer[]
}
```

`team(t)` returns `waiverPosition: t.waiverPosition ?? null`. `playerRecord(p)` sets `team: p.team ?? null` and `injuryStatus: p.injuryStatus ?? null`. In `syntheticBuild`, replace `const players = league.teams.flatMap((t) => t.players)` with

```ts
  const freeAgents = (league.freeAgents ?? []).map((p) => ({ ...p, team: p.team ?? 'KC' }))
  const players = [...league.teams.flatMap((t) => t.players), ...freeAgents]
```

(projections and market values already loop over `players`), and after the market values:

```ts
  const ranked = players.filter((p) => typeof p.rank === 'number')
  replaceExpertRanks(
    db,
    SEASON,
    ROS_WEEK,
    'PPR',
    ranked.map((p) => ({
      playerId: p.id,
      rankEcr: p.rank as number,
      posRank: p.rank as number,
      rankAve: null,
      rankStd: null,
      rankMin: null,
      rankMax: null,
      experts: 10,
      grade: null,
      projPts: null
    })),
    SEED_TS
  )
```

Add the engine fixture after `SMALL_LEAGUE`:

```ts
/**
 * Slice 6c engine fixture: slots RB · WR · FLEX (+1 bench), roster size 4, window weeks 16–17.
 * My optimal lineup is 42 a week (RB A20 · WR B10 · FLEX C12); D never starts.
 *
 * | Me (1)        | Rival (2)  | Free agents (team KC)            |
 * | ------------- | ---------- | -------------------------------- |
 * | A RB 20 5000  | R1 WR 30   | X WR 11 (800)                    |
 * | C RB 12 2000  | R2 RB 30   | Y RB 3 in wk 16, 25 in wk 17     |
 * | B WR 10 1500  |            | Z WR 4 (700)                     |
 * | D WR 5 300    |            | K TE 9 (900)                     |
 * |               |            | W RB 2, ROS rank 5               |
 * |               |            | Q QB 30 (no QB slot, no signal)  |
 *
 * By hand (Δ over the two weeks, options best first):
 *   X → drop D +2 · drop B +2 · drop C −2 · drop A −18   (starts 16, 17; this week +1)
 *   Y → drop D +13 · drop C +6 · drop B +3 · drop A −10  (starts 17; this week 0 / −7 / −5 / −15)
 *   Z, K, W, Q can't start for me in either week → skipped by the lineup search.
 *   Stash in market order: K [D 0 · C −6 · B −10 · A −22], Z [D 0 · B −10 · C −14 · A −30],
 *   W [D 0 · B −10 · C −14 · A −30].
 */
export const WAIVER_LEAGUE: SyntheticLeague = {
  currentWeek: 16,
  weeks: [16, 17],
  rosterPositions: ['RB', 'WR', 'FLEX', 'BN'],
  rules: rules({
    rosterSlots: [
      { slot: 'RB', count: 1 },
      { slot: 'WR', count: 1 },
      { slot: 'FLEX', count: 1 },
      { slot: 'BN', count: 1 }
    ],
    settings: { numTeams: 2, waiverType: 'priority', playoffStartWeek: 15, playoffTeams: 6 }
  }),
  teams: [
    {
      rosterId: 1,
      name: 'Me',
      isMe: true,
      waiverPosition: 2,
      players: [
        { id: 'A', position: 'RB', weekly: 20, market: 5000 },
        { id: 'C', position: 'RB', weekly: 12, market: 2000 },
        { id: 'B', position: 'WR', weekly: 10, market: 1500 },
        { id: 'D', position: 'WR', weekly: 5, market: 300 }
      ]
    },
    {
      rosterId: 2,
      name: 'Rival',
      waiverPosition: 1,
      players: [
        { id: 'R1', position: 'WR', weekly: 30 },
        { id: 'R2', position: 'RB', weekly: 30 }
      ]
    }
  ],
  freeAgents: [
    { id: 'X', position: 'WR', weekly: 11, market: 800 },
    { id: 'Y', position: 'RB', weekly: [3, 25] },
    { id: 'Z', position: 'WR', weekly: 4, market: 700 },
    { id: 'K', position: 'TE', weekly: 9, market: 900 },
    { id: 'W', position: 'RB', weekly: 2, rank: 5 },
    { id: 'Q', position: 'QB', weekly: 30 }
  ]
}

/** `WAIVER_LEAGUE` with my roster replaced — the release variants of the engine tests. */
export function waiverLeagueWith(mine: SyntheticPlayer[]): SyntheticLeague {
  return {
    ...WAIVER_LEAGUE,
    teams: WAIVER_LEAGUE.teams.map((t) => (t.isMe ? { ...t, players: mine } : t))
  }
}
```

`generateLeague` gains `freeAgents = 0` as a third parameter; after the `teams` array (so the existing teams draw the same numbers and Plan M's seeds are unchanged):

```ts
  // Slice 6c: the leftovers — drawn from the lower 60 % of each position's range.
  const pool = Array.from({ length: freeAgents }, (_, i): SyntheticPlayer => {
    const position = SHAPE[i % SHAPE.length]
    const [lo, hi] = RANGES[position]
    const mean = lo + (hi - lo) * 0.6 * r()
    return {
      id: `fa${i + 1}`,
      position,
      team: 'KC',
      weekly: weeks.map(() => Math.round(mean * (0.7 + 0.6 * r()) * 10) / 10),
      market: null
    }
  })
```

and return `freeAgents: pool` in the league object. Update its doc comment: "…and `freeAgents` unrostered players from the lower 60 % of each range."

- [x] **Step 3: Write the failing release tests**

`tests/main/waiver/release.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { LineupBuild } from '@main/lineup/build'
import { myTeam } from '@main/trade/evaluate'
import type { PlayerSeries } from '@main/value/series'
import {
  applyRelease,
  compareReleases,
  releaseCandidates,
  type ReleaseCandidate
} from '@main/waiver/release'
import type { PlayerValueRow } from '@shared/types'
import { syntheticBuild, WAIVER_LEAGUE, waiverLeagueWith } from '../../fixtures/synthetic'

const A = { id: 'A', position: 'RB', weekly: 20, market: 5000 }
const C = { id: 'C', position: 'RB', weekly: 12, market: 2000 }
const B = { id: 'B', position: 'WR', weekly: 10, market: 1500 }
const D_OUT = { id: 'D', position: 'WR', weekly: 5, market: 300, injuryStatus: 'Out' }

function candidates(
  league: typeof WAIVER_LEAGUE,
  ir: Parameters<typeof releaseCandidates>[2] = {}
): string[] {
  const { build } = syntheticBuild(league)
  const roster = build.rosters.get(myTeam(build).rosterId) ?? []
  return releaseCandidates(build, roster, ir)
    .map((r) => (r.release.kind === 'open' ? 'open' : `${r.release.kind} ${r.release.playerId}`))
    .sort()
}

describe('release candidates (slice 6c spec §2.2)', () => {
  it('offers a drop of every active player when the roster is full', () => {
    expect(candidates(WAIVER_LEAGUE)).toEqual(['drop A', 'drop B', 'drop C', 'drop D'])
  })

  it('offers only the open spot when the roster has room', () => {
    expect(candidates(waiverLeagueWith([A, C, B]))).toEqual(['open'])
  })

  it('adds an IR move for an injured player whose status the league allows on IR', () => {
    const league = waiverLeagueWith([A, C, B, D_OUT])
    expect(candidates(league, { irSlots: 1, irStatuses: ['IR', 'Out'] })).toEqual([
      'drop A',
      'drop B',
      'drop C',
      'drop D',
      'ir D'
    ])
    // status not allowed, no IR slots, or the IR slot already taken → no IR move
    expect(candidates(league, { irSlots: 1, irStatuses: ['IR'] })).not.toContain('ir D')
    expect(candidates(league, {})).not.toContain('ir D')
    const full = waiverLeagueWith([
      A,
      C,
      B,
      D_OUT,
      { id: 'E', position: 'RB', weekly: 1, slot: 'ir', injuryStatus: 'IR' }
    ])
    expect(candidates(full, { irSlots: 1, irStatuses: ['IR', 'Out'] })).toEqual([
      'drop A',
      'drop B',
      'drop C',
      'drop D'
    ])
  })

  it('applies a drop by removing the player and an IR move by changing his slot', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const roster = build.rosters.get(1) ?? []
    const d = roster.find((s) => s.base.playerId === 'D') as PlayerSeries
    const dropped = applyRelease(roster, {
      release: { kind: 'drop', playerId: 'D' },
      series: d
    })
    expect(dropped.map((s) => s.base.playerId).sort()).toEqual(['A', 'B', 'C'])
    const moved = applyRelease(roster, { release: { kind: 'ir', playerId: 'D' }, series: d })
    expect(moved.find((s) => s.base.playerId === 'D')?.rosterSlot).toBe('ir')
    expect(moved.filter((s) => s.base.playerId !== 'D')).toEqual(
      roster.filter((s) => s.base.playerId !== 'D')
    )
    expect(applyRelease(roster, { release: { kind: 'open' }, series: null })).toBe(roster)
  })
})

describe('release tie order (spec §2.3 step 4)', () => {
  const series = (id: string): PlayerSeries =>
    ({ base: { playerId: id, fullName: id } }) as unknown as PlayerSeries
  const build = {
    rowById: new Map<string, Partial<PlayerValueRow>>([
      ['m1', { market: { value: 100, posRank: 1, tier: null, trend30d: 0 } }],
      ['m2', { market: { value: 900, posRank: 1, tier: null, trend30d: 0 } }],
      ['r1', { expert: { ecrRank: 50, ecrPosRank: 5, spread: null, experts: 10, ecrDelta: null } }],
      ['r2', { expert: { ecrRank: 200, ecrPosRank: 40, spread: null, experts: 10, ecrDelta: null } }],
      ['u', { rosPoints: 30 }],
      ['p', { rosPoints: 10 }]
    ])
  } as unknown as LineupBuild
  const drop = (id: string): ReleaseCandidate => ({
    release: { kind: 'drop', playerId: id },
    series: series(id)
  })

  it('puts the open spot and IR first, then drops the least upside: market, worst rank, fewest points, name', () => {
    const list: ReleaseCandidate[] = [
      drop('m2'),
      drop('r1'),
      drop('u'),
      { release: { kind: 'ir', playerId: 'x' }, series: series('x') },
      drop('b'),
      drop('m1'),
      drop('p'),
      { release: { kind: 'open' }, series: null },
      drop('r2'),
      drop('a')
    ]
    const order = [...list]
      .sort((x, y) => compareReleases(build, x, y))
      .map((r) => (r.release.kind === 'open' ? 'open' : `${r.release.kind} ${r.release.playerId}`))
    expect(order).toEqual([
      'open',
      'ir x',
      'drop a',
      'drop b',
      'drop p',
      'drop u',
      'drop r2',
      'drop r1',
      'drop m1',
      'drop m2'
    ])
  })
})
```

- [x] **Step 4: Run to see them fail**

Run: `npx vitest run tests/main/waiver/release.test.ts`
Expected: FAIL — `@main/waiver/release` does not exist.

- [x] **Step 5: Implement `src/main/waiver/release.ts`**

```ts
import type { LineupBuild } from '@main/lineup/build'
import { rosterSize } from '@main/trade/evaluate'
import { UNSTARTABLE_SLOTS } from '@main/value/roster'
import type { PlayerSeries } from '@main/value/series'
import type { LeagueSettings } from '@shared/rules'
import type { WaiverRelease } from '@shared/types'

/** Slice 6c spec §2.2: one way to make room, before it is scored. */
export interface ReleaseCandidate {
  release: WaiverRelease
  /** The player leaving the lineup pool; null for an open spot. */
  series: PlayerSeries | null
}

export type IrSettings = Pick<LeagueSettings, 'irSlots' | 'irStatuses'>

function onReserve(s: PlayerSeries): boolean {
  return s.rosterSlot !== null && UNSTARTABLE_SLOTS.has(s.rosterSlot)
}

/**
 * Spec §2.2: an open spot is the only option when there is room (a drop can never beat it);
 * otherwise a drop per active player, plus an IR move for each active player whose injury status
 * the league allows on IR while an IR slot is free.
 */
export function releaseCandidates(
  build: LineupBuild,
  roster: PlayerSeries[],
  ir: IrSettings
): ReleaseCandidate[] {
  const size = rosterSize(build)
  const active = roster.filter((s) => !onReserve(s))
  if (size === null || active.length < size || active.length === 0) {
    return [{ release: { kind: 'open' }, series: null }]
  }
  const irFree = (ir.irSlots ?? 0) > roster.filter((s) => s.rosterSlot === 'ir').length
  const eligible = new Set(ir.irStatuses ?? ['IR'])
  const out: ReleaseCandidate[] = []
  for (const s of active) {
    const id = s.base.playerId
    const status = s.base.injuryStatus
    if (irFree && status !== null && eligible.has(status)) {
      out.push({ release: { kind: 'ir', playerId: id }, series: s })
    }
    out.push({ release: { kind: 'drop', playerId: id }, series: s })
  }
  return out
}

/** The roster after the release: a drop removes the player, an IR move puts him in an unstartable slot. */
export function applyRelease(roster: PlayerSeries[], r: ReleaseCandidate): PlayerSeries[] {
  const leaving = r.series
  if (leaving === null) return roster
  if (r.release.kind === 'ir') {
    return roster.map((s) => (s === leaving ? { ...s, rosterSlot: 'ir' as const } : s))
  }
  return roster.filter((s) => s !== leaving)
}

const KIND_ORDER: Record<WaiverRelease['kind'], number> = { open: 0, ir: 1, drop: 2 }

/** Spec §2.3 step 4: the order among releases that cost the same. */
export function compareReleases(
  build: LineupBuild,
  a: ReleaseCandidate,
  b: ReleaseCandidate
): number {
  const kind = KIND_ORDER[a.release.kind] - KIND_ORDER[b.release.kind]
  if (kind !== 0 || a.series === null || b.series === null) return kind
  const ra = build.rowById.get(a.series.base.playerId)
  const rb = build.rowById.get(b.series.base.playerId)
  const rank = (r: typeof ra): number => r?.expert?.ecrRank ?? Number.MAX_SAFE_INTEGER
  return (
    (ra?.market?.value ?? 0) - (rb?.market?.value ?? 0) ||
    rank(rb) - rank(ra) ||
    (ra?.rosPoints ?? 0) - (rb?.rosPoints ?? 0) ||
    a.series.base.fullName.localeCompare(b.series.base.fullName)
  )
}
```

- [x] **Step 6: Run the tests, then the full check**

Run: `npx vitest run tests/main/waiver/release.test.ts` → PASS.
Run: `npm run typecheck && npm run lint && npm test` → green (Plan M's trade tests still pass: `generateLeague`'s teams are unchanged).

- [x] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/trade/evaluate.ts src/main/waiver/release.ts tests/fixtures/synthetic.ts tests/main/waiver/release.test.ts
git commit -m "feat(waiver): add release candidates and tie order"
```

---

### Task 6: Exact add search and *Improves my lineup*

**Files:**

- Create: `src/main/waiver/search.ts`
- Test: `tests/main/waiver/search.test.ts`

**Interfaces:**

- Consumes: `candidateFor`, `rosterWeek`, `teamWeek`, `LineupBuild`, `TeamWeek` (`@main/lineup/build`); `canEnter` (`@main/trade/enter`); `isStarter`, `myTeam`, `requireWindow` (`@main/trade/evaluate`); `starterWeeks`, `tradePlayer` (`@main/trade/player`); Task 5's release module.
- Produces: `LINEUP_MIN_DELTA = 0.5`, `WAIVER_MAX = 30`; `SearchOptions { skip?: boolean }`; `WaiverContext`; `ScoredAdd { series: PlayerSeries; options: AddOption[] }`; `waiverContext(build: LineupBuild, ir: IrSettings): WaiverContext`; `freeAgents(build: LineupBuild): PlayerSeries[]`; `canHelp(ctx, add): boolean`; `scoreAdd(ctx, add, opts?): AddOption[]`; `scoreFreeAgents(ctx, opts?): ScoredAdd[]`; `lineupRows(ctx, scored, max = WAIVER_MAX): AddRow[]`.

- [x] **Step 1: Write the failing tests**

`tests/main/waiver/search.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { TradeError, type TradeErrorCode } from '@main/trade/evaluate'
import type { PlayerSeries } from '@main/value/series'
import {
  canHelp,
  lineupRows,
  scoreAdd,
  scoreFreeAgents,
  waiverContext,
  type WaiverContext
} from '@main/waiver/search'
import type { IrSettings } from '@main/waiver/release'
import type { AddOption } from '@shared/types'
import {
  syntheticBuild,
  WAIVER_LEAGUE,
  waiverLeagueWith,
  type SyntheticLeague
} from '../../fixtures/synthetic'

const A = { id: 'A', position: 'RB', weekly: 20, market: 5000 }
const C = { id: 'C', position: 'RB', weekly: 12, market: 2000 }
const B = { id: 'B', position: 'WR', weekly: 10, market: 1500 }

function ctxOf(league: SyntheticLeague, ir: IrSettings = {}): WaiverContext {
  return waiverContext(syntheticBuild(league).build, ir)
}
function fa(ctx: WaiverContext, id: string): PlayerSeries {
  const s = ctx.build.inputs.value.series.get(id)
  if (!s) throw new Error(`no player ${id}`)
  return s
}
const summary = (options: AddOption[]): [string, number][] =>
  options.map((o) => [
    o.release.kind === 'open' ? 'open' : `${o.release.kind} ${o.release.playerId}`,
    o.delta
  ])
function codeOf(fn: () => unknown): TradeErrorCode | 'no error' {
  try {
    fn()
  } catch (err) {
    if (err instanceof TradeError) return err.code
    throw err
  }
  return 'no error'
}

describe('waiver add search (slice 6c spec §2.3–2.4)', () => {
  it('scores every release for an add, best first, ties to the least upside', () => {
    const ctx = ctxOf(WAIVER_LEAGUE)
    const options = scoreAdd(ctx, fa(ctx, 'X'))
    expect(summary(options)).toEqual([
      ['drop D', 2],
      ['drop B', 2],
      ['drop C', -2],
      ['drop A', -18]
    ])
    expect(options[0]).toMatchObject({ deltaPerWeek: 1, thisWeekDelta: 1, startWeeks: [16, 17] })
    expect(options[0].releasePlayer).toMatchObject({ playerId: 'D', starterWeeks: 0 })
    expect(options[3].releasePlayer).toMatchObject({ playerId: 'A', starterWeeks: 2 })
  })

  it('re-solves only the weeks a released starter plays, and counts the add only where he starts', () => {
    const ctx = ctxOf(WAIVER_LEAGUE)
    const options = scoreAdd(ctx, fa(ctx, 'Y'))
    expect(summary(options)).toEqual([
      ['drop D', 13],
      ['drop C', 6],
      ['drop B', 3],
      ['drop A', -10]
    ])
    expect(options.map((o) => o.thisWeekDelta)).toEqual([0, -7, -5, -15])
    expect(options[0]).toMatchObject({ deltaPerWeek: 6.5, startWeeks: [17] })
  })

  it('skips free agents who cannot start for me in any window week', () => {
    const ctx = ctxOf(WAIVER_LEAGUE)
    expect(['X', 'Y', 'Z', 'K', 'W', 'Q'].filter((id) => canHelp(ctx, fa(ctx, id)))).toEqual([
      'X',
      'Y'
    ])
    expect(
      scoreFreeAgents(ctx)
        .map((x) => x.series.base.playerId)
        .sort()
    ).toEqual(['X', 'Y'])
  })

  it('lists adds worth at least 0.5 over the window, best first, capped', () => {
    const ctx = ctxOf(WAIVER_LEAGUE)
    const scored = scoreFreeAgents(ctx)
    const rows = lineupRows(ctx, scored)
    expect(rows.map((r) => r.player.playerId)).toEqual(['Y', 'X'])
    expect(rows[0].player).toMatchObject({ fullName: 'Y', starterWeeks: 0 })
    expect(lineupRows(ctx, scored, 1).map((r) => r.player.playerId)).toEqual(['Y'])
  })

  it('offers only the open spot when my roster has room', () => {
    const ctx = ctxOf(waiverLeagueWith([A, C, B]))
    expect(summary(scoreAdd(ctx, fa(ctx, 'X')))).toEqual([['open', 2]])
    expect(summary(scoreAdd(ctx, fa(ctx, 'Y')))).toEqual([['open', 13]])
  })

  it('puts an IR move ahead of dropping the same injured player', () => {
    const league = waiverLeagueWith([
      A,
      C,
      B,
      { id: 'D', position: 'WR', weekly: 5, market: 300, injuryStatus: 'Out' }
    ])
    const ctx = ctxOf(league, { irSlots: 1, irStatuses: ['IR', 'Out'] })
    expect(summary(scoreAdd(ctx, fa(ctx, 'X')))).toEqual([
      ['ir D', 2],
      ['drop D', 2],
      ['drop B', 2],
      ['drop C', -2],
      ['drop A', -18]
    ])
  })

  it('throws the engine errors without projections or without my team', () => {
    const blind = syntheticBuild({ ...WAIVER_LEAGUE, weeks: [] }).build
    expect(codeOf(() => waiverContext(blind, {}))).toBe('NO_PROJECTIONS')
    const anonymous = syntheticBuild({
      ...WAIVER_LEAGUE,
      teams: WAIVER_LEAGUE.teams.map((t) => ({ ...t, isMe: false }))
    }).build
    expect(codeOf(() => waiverContext(anonymous, {}))).toBe('NO_ME')
  })
})
```

- [x] **Step 2: Run to see them fail**

Run: `npx vitest run tests/main/waiver/search.test.ts`
Expected: FAIL — `@main/waiver/search` does not exist.

- [x] **Step 3: Implement `src/main/waiver/search.ts`**

```ts
import { round2 } from '@main/db/repos/points'
import {
  candidateFor,
  rosterWeek,
  teamWeek,
  type LineupBuild,
  type TeamWeek
} from '@main/lineup/build'
import { canEnter } from '@main/trade/enter'
import { isStarter, myTeam, requireWindow } from '@main/trade/evaluate'
import { starterWeeks, tradePlayer } from '@main/trade/player'
import type { PlayerSeries } from '@main/value/series'
import type { AddOption, AddRow } from '@shared/types'
import {
  applyRelease,
  compareReleases,
  releaseCandidates,
  type IrSettings,
  type ReleaseCandidate
} from './release'

/** Slice 6c spec §2.4: an add must be worth at least this much over the window to be listed. */
export const LINEUP_MIN_DELTA = 0.5
/** Spec §2.4 / §3: rows per list. */
export const WAIVER_MAX = 30

export interface SearchOptions {
  /** Tests only: `false` scores every free agent and solves every week of every release. */
  skip?: boolean
}

/** What the search reuses across free agents: my roster, its solved window and the releases. */
export interface WaiverContext {
  build: LineupBuild
  weeks: number[]
  roster: PlayerSeries[]
  /** My optimal lineup per window week, index-aligned with `weeks`. */
  base: TeamWeek[]
  before: number
  releases: ReleaseCandidate[]
  /** Per releasable player: my roster without him, per window week (`base` where he doesn't start). */
  without: Map<string, TeamWeek[]>
  /** My players' window starts, for their `TradePlayer` rows. */
  starts: Map<string, number>
}

/** A free agent with every release option scored, best first. */
export interface ScoredAdd {
  series: PlayerSeries
  options: AddOption[]
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0)
}

export function waiverContext(build: LineupBuild, ir: IrSettings): WaiverContext {
  const weeks = requireWindow(build)
  const me = myTeam(build)
  const roster = build.rosters.get(me.rosterId) ?? []
  const base = weeks.map((w) => teamWeek(build, me.rosterId, w))
  const releases = releaseCandidates(build, roster, ir)
  const without = new Map<string, TeamWeek[]>()
  for (const r of releases) {
    const leaving = r.series
    if (leaving === null || without.has(leaving.base.playerId)) continue
    const rest = roster.filter((s) => s !== leaving)
    without.set(
      leaving.base.playerId,
      weeks.map((w, i) =>
        isStarter(base[i], leaving.base.playerId) ? rosterWeek(build, rest, w) : base[i]
      )
    )
  }
  return {
    build,
    weeks,
    roster,
    base,
    before: sum(base.map((x) => x.optimalTotal)),
    releases,
    without,
    starts: starterWeeks(build, me.rosterId, weeks)
  }
}

/** 6b §2.3: can `add` raise `lineup`'s total in week `w`? Exact when false. */
function enters(ctx: WaiverContext, add: PlayerSeries, lineup: TeamWeek, w: number): boolean {
  const candidate = candidateFor(ctx.build, add, w)
  return candidate !== null && canEnter(candidate, ctx.build.slots, lineup.optimal)
}

/** Spec §2.3 step 1: false only when `add` can't start for me in any window week — then no release makes him worth it. */
export function canHelp(ctx: WaiverContext, add: PlayerSeries): boolean {
  return ctx.weeks.some((w, i) => enters(ctx, add, ctx.base[i], w))
}

/** Spec §2.3 steps 2–4: every release option for adding `add`, scored, best first. */
export function scoreAdd(
  ctx: WaiverContext,
  add: PlayerSeries,
  opts: SearchOptions = {}
): AddOption[] {
  const { build, weeks, roster, base } = ctx
  const skip = opts.skip !== false
  const id = add.base.playerId
  const withAdd = [...roster, add]
  // Step 2: the oversized roster; where he can't enter, my lineup is already its optimum.
  const oversized = weeks.map((w, i) =>
    skip && !enters(ctx, add, base[i], w) ? base[i] : rosterWeek(build, withAdd, w)
  )
  // Step 3: an IR move and a drop of the same player leave the same lineup — solve him once.
  const solved = new Map<string, TeamWeek[]>()
  const afterWeeks = (r: ReleaseCandidate): TeamWeek[] => {
    const leaving = r.series
    if (leaving === null) return oversized
    const pid = leaving.base.playerId
    const hit = solved.get(pid)
    if (hit) return hit
    const rest = applyRelease(withAdd, r)
    const without = ctx.without.get(pid) ?? []
    const result = weeks.map((w, i) => {
      if (!skip) return rosterWeek(build, rest, w)
      // A player the oversized optimum doesn't start can leave without changing it.
      if (!isStarter(oversized[i], pid)) return oversized[i]
      // If the add can't enter my lineup without him either, that lineup is the optimum.
      if (!enters(ctx, add, without[i], w)) return without[i]
      return rosterWeek(build, rest, w)
    })
    solved.set(pid, result)
    return result
  }
  const scored = ctx.releases.map((r) => {
    const after = afterWeeks(r)
    const delta = round2(sum(after.map((x) => x.optimalTotal)) - ctx.before) ?? 0
    const option: AddOption = {
      release: r.release,
      releasePlayer: r.series
        ? tradePlayer(build, r.series, ctx.starts.get(r.series.base.playerId) ?? 0)
        : null,
      delta,
      deltaPerWeek: round2(delta / weeks.length) ?? 0,
      thisWeekDelta: round2(after[0].optimalTotal - base[0].optimalTotal) ?? 0,
      startWeeks: weeks.filter((_, i) => isStarter(after[i], id))
    }
    return { r, option }
  })
  scored.sort((a, b) => b.option.delta - a.option.delta || compareReleases(build, a.r, b.r))
  return scored.map((x) => x.option)
}

/** Spec §2: the value pool's players on no roster. */
export function freeAgents(build: LineupBuild): PlayerSeries[] {
  return [...build.inputs.value.series.values()].filter((s) => s.base.ownerRosterId === null)
}

/** Spec §2.3: every free agent who can start for me in some window week, scored. */
export function scoreFreeAgents(ctx: WaiverContext, opts: SearchOptions = {}): ScoredAdd[] {
  const out: ScoredAdd[] = []
  for (const series of freeAgents(ctx.build)) {
    if (opts.skip !== false && !canHelp(ctx, series)) continue
    out.push({ series, options: scoreAdd(ctx, series, opts) })
  }
  return out
}

function byBest(a: ScoredAdd, b: ScoredAdd): number {
  return (
    b.options[0].delta - a.options[0].delta ||
    b.options[0].thisWeekDelta - a.options[0].thisWeekDelta ||
    a.series.base.fullName.localeCompare(b.series.base.fullName)
  )
}

/** Spec §2.4: adds worth at least `LINEUP_MIN_DELTA` over the window, best first, capped. */
export function lineupRows(ctx: WaiverContext, scored: ScoredAdd[], max = WAIVER_MAX): AddRow[] {
  return scored
    .filter((x) => x.options[0].delta >= LINEUP_MIN_DELTA)
    .sort(byBest)
    .slice(0, max)
    .map((x) => ({ player: tradePlayer(ctx.build, x.series, 0), options: x.options }))
}
```

- [x] **Step 4: Run the tests, then the full check**

Run: `npx vitest run tests/main/waiver` → PASS. If a hand-computed number differs, recompute it from the fixture table before touching the code — the table is the spec for this fixture.
Run: `npm run typecheck && npm run lint && npm test` → green.

- [x] **Step 5: Commit**

```bash
git add src/main/waiver/search.ts tests/main/waiver/search.test.ts
git commit -m "feat(waiver): add the exact add search"
```

---

### Task 7: Stash and the `WaiverAdds` payload

**Files:**

- Create: `src/main/waiver/stash.ts`, `src/main/waiver/adds.ts`
- Test: `tests/main/waiver/stash.test.ts`

**Interfaces:**

- Consumes: Task 6 (`freeAgents`, `scoreAdd`, `scoreFreeAgents`, `lineupRows`, `waiverContext`, `LINEUP_MIN_DELTA`, `WAIVER_MAX`, `ScoredAdd`, `WaiverContext`).
- Produces: `stashRows(ctx: WaiverContext, scored: ScoredAdd[], trending: Map<string, number>, max = WAIVER_MAX): StashRow[]`; `WaiverExtras { settings: Pick<LeagueSettings, 'waiverType' | 'irSlots' | 'irStatuses'>; trending: Map<string, number>; trendingFetchedAt: string | null }`; `waiverAdds(build: LineupBuild, extras: WaiverExtras): WaiverAdds`.

- [x] **Step 1: Write the failing tests**

`tests/main/waiver/stash.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { waiverAdds } from '@main/waiver/adds'
import { scoreFreeAgents, waiverContext } from '@main/waiver/search'
import { stashRows } from '@main/waiver/stash'
import type { AddOption } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import { syntheticBuild, WAIVER_LEAGUE } from '../../fixtures/synthetic'

const trending = new Map([
  ['Z', 120],
  ['W', 40]
])
const summary = (options: AddOption[]): [string, number][] =>
  options.map((o) => [
    o.release.kind === 'open' ? 'open' : `${o.release.kind} ${o.release.playerId}`,
    o.delta
  ])

describe('stash (slice 6c spec §3)', () => {
  const ctx = waiverContext(syntheticBuild(WAIVER_LEAGUE).build, {})
  const scored = scoreFreeAgents(ctx)

  it('lists free agents with a signal and no lineup gain, in market order', () => {
    const rows = stashRows(ctx, scored, trending)
    // X and Y improve the lineup; Q has no signal; R1 / R2 are rostered.
    expect(rows.map((r) => r.player.playerId)).toEqual(['K', 'Z', 'W'])
    expect(rows.map((r) => r.trending)).toEqual([null, 120, 40])
    expect(rows[2].player.expert?.ecrRank).toBe(5)
  })

  it('scores what making room costs for each', () => {
    const rows = stashRows(ctx, scored, trending)
    expect(summary(rows[0].options)).toEqual([
      ['drop D', 0],
      ['drop C', -6],
      ['drop B', -10],
      ['drop A', -22]
    ])
    expect(summary(rows[1].options)).toEqual([
      ['drop D', 0],
      ['drop B', -10],
      ['drop C', -14],
      ['drop A', -30]
    ])
  })

  it('shortlists the top of each signal, so any sort shows a full list', () => {
    // top 1 by market = K, by trending = Z, by rank = W
    expect(
      stashRows(ctx, scored, trending, 1)
        .map((r) => r.player.playerId)
        .sort()
    ).toEqual(['K', 'W', 'Z'])
  })
})

describe('waiverAdds (spec §6)', () => {
  it('assembles the rest-of-season payload', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const adds = waiverAdds(build, {
      settings: { waiverType: 'priority' },
      trending,
      trendingFetchedAt: '2026-09-22T10:00:00.000Z'
    })
    expect(adds).toMatchObject({
      season: SEASON,
      currentWeek: 16,
      lastWeek: 17,
      weeks: 2,
      waiverType: 'priority',
      myWaiverPosition: 2,
      teamCount: 2,
      trendingFetchedAt: '2026-09-22T10:00:00.000Z'
    })
    expect(adds.lineup.map((r) => r.player.playerId)).toEqual(['Y', 'X'])
    expect(adds.stash.map((r) => r.player.playerId)).toEqual(['K', 'Z', 'W'])
  })
})
```

- [x] **Step 2: Run to see them fail**

Run: `npx vitest run tests/main/waiver/stash.test.ts`
Expected: FAIL — modules missing.

- [x] **Step 3: Implement**

`src/main/waiver/stash.ts`:

```ts
import type { LineupBuild } from '@main/lineup/build'
import { tradePlayer } from '@main/trade/player'
import type { PlayerSeries } from '@main/value/series'
import type { StashRow } from '@shared/types'
import {
  freeAgents,
  LINEUP_MIN_DELTA,
  scoreAdd,
  WAIVER_MAX,
  type ScoredAdd,
  type WaiverContext
} from './search'

interface Signals {
  series: PlayerSeries
  market: number | null
  trending: number | null
  /** FantasyPros ROS overall consensus rank: lower is better. */
  rank: number | null
}

type SignalKey = 'market' | 'trending' | 'rank'

function signalsOf(
  build: LineupBuild,
  series: PlayerSeries,
  trending: Map<string, number>
): Signals {
  const row = build.rowById.get(series.base.playerId)
  return {
    series,
    market: row?.market?.value ?? null,
    trending: trending.get(series.base.playerId) ?? null,
    rank: row?.expert?.ecrRank ?? null
  }
}

/** `dir` −1 = high first; players without the value last. */
function nullsLast(x: number | null, y: number | null, dir: 1 | -1): number {
  if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1
  return (x - y) * dir
}

function byName(a: Signals, b: Signals): number {
  return a.series.base.fullName.localeCompare(b.series.base.fullName)
}

const DIR: Record<SignalKey, 1 | -1> = { market: -1, trending: -1, rank: 1 }

/**
 * Spec §3: free agents with upside team strength can't see yet — on an NFL team, not Inactive,
 * no lineup gain worth listing, at least one signal. The shortlist is the top `max` by each signal
 * so re-sorting by any column still shows a full list; each carries its release options.
 */
export function stashRows(
  ctx: WaiverContext,
  scored: ScoredAdd[],
  trending: Map<string, number>,
  max = WAIVER_MAX
): StashRow[] {
  const { build } = ctx
  const inLineup = new Set(
    scored
      .filter((x) => x.options[0].delta >= LINEUP_MIN_DELTA)
      .map((x) => x.series.base.playerId)
  )
  const pool = freeAgents(build)
    .filter(
      (s) =>
        s.base.team !== null && s.base.status !== 'Inactive' && !inLineup.has(s.base.playerId)
    )
    .map((s) => signalsOf(build, s, trending))
    .filter((x) => x.market !== null || x.trending !== null || x.rank !== null)
  const shortlist = new Map<string, Signals>()
  for (const key of ['market', 'trending', 'rank'] as const) {
    pool
      .filter((x) => x[key] !== null)
      .sort((a, b) => nullsLast(a[key], b[key], DIR[key]) || byName(a, b))
      .slice(0, max)
      .forEach((x) => shortlist.set(x.series.base.playerId, x))
  }
  const known = new Map(scored.map((x) => [x.series.base.playerId, x.options]))
  return [...shortlist.values()]
    .sort(
      (a, b) =>
        nullsLast(a.market, b.market, -1) || nullsLast(a.trending, b.trending, -1) || byName(a, b)
    )
    .map((x) => ({
      player: tradePlayer(build, x.series, 0),
      trending: x.trending,
      options: known.get(x.series.base.playerId) ?? scoreAdd(ctx, x.series)
    }))
}
```

`src/main/waiver/adds.ts`:

```ts
import type { LineupBuild } from '@main/lineup/build'
import { myTeam } from '@main/trade/evaluate'
import type { LeagueSettings } from '@shared/rules'
import type { WaiverAdds } from '@shared/types'
import { lineupRows, scoreFreeAgents, waiverContext } from './search'
import { stashRows } from './stash'

export interface WaiverExtras {
  settings: Pick<LeagueSettings, 'waiverType' | 'irSlots' | 'irStatuses'>
  /** Sleeper trending adds by player id (latest fetch). */
  trending: Map<string, number>
  trendingFetchedAt: string | null
}

/** Slice 6c spec §2–3 / §6: the Waivers screen's rest-of-season lists. */
export function waiverAdds(build: LineupBuild, extras: WaiverExtras): WaiverAdds {
  const ctx = waiverContext(build, extras.settings)
  const scored = scoreFreeAgents(ctx)
  const { season, currentWeek, lastWeek } = build.inputs.value.context
  return {
    season,
    currentWeek,
    lastWeek,
    weeks: ctx.weeks.length,
    lineup: lineupRows(ctx, scored),
    stash: stashRows(ctx, scored, extras.trending),
    waiverType: extras.settings.waiverType,
    myWaiverPosition: myTeam(build).waiverPosition,
    teamCount: build.inputs.teams.length,
    trendingFetchedAt: extras.trendingFetchedAt
  }
}
```

- [x] **Step 4: Run the tests, then the full check**

Run: `npx vitest run tests/main/waiver` → PASS.
Run: `npm run typecheck && npm run lint && npm test` → green.

- [x] **Step 5: Commit**

```bash
git add src/main/waiver/stash.ts src/main/waiver/adds.ts tests/main/waiver/stash.test.ts
git commit -m "feat(waiver): add the stash list and adds payload"
```

---

### Task 8: Exactness property test and the budget

**Files:**

- Create: `tests/main/waiver/searchProperty.test.ts`, `tests/main/waiver/waiverBudget.test.ts`
- Modify: `package.json` (`test:budget` runs every `*Budget*` file)

**Interfaces:**

- Consumes: `generateLeague(seed, teamCount, freeAgents)` (Task 5), `scoreFreeAgents`, `lineupRows`, `waiverContext` (Task 6), `waiverAdds` (Task 7).

- [x] **Step 1: Write the property test**

`tests/main/waiver/searchProperty.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { lineupRows, scoreFreeAgents, waiverContext, type ScoredAdd } from '@main/waiver/search'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

/** Releases and totals only: tied optima may start a different player, which changes no number. */
const numbers = (x: ScoredAdd): object[] =>
  x.options.map((o) => ({ release: o.release, delta: o.delta, thisWeekDelta: o.thisWeekDelta }))

describe('waiver search shortcuts are exact (slice 6c spec §10)', () => {
  it.each([1, 2, 3])('seed %i: the pruned search equals brute force', (seed) => {
    const league = generateLeague(seed, 2, 40)
    // One injured starter-quality player so IR moves are part of the comparison.
    league.teams[0].players[3] = { ...league.teams[0].players[3], injuryStatus: 'Out' }
    const ctx = waiverContext(syntheticBuild(league).build, { irSlots: 1, irStatuses: ['IR', 'Out'] })
    const fast = scoreFreeAgents(ctx)
    const brute = scoreFreeAgents(ctx, { skip: false })
    expect(fast.length).toBeGreaterThan(0)
    const bruteById = new Map(brute.map((x) => [x.series.base.playerId, x]))
    for (const x of fast) {
      const b = bruteById.get(x.series.base.playerId)
      expect(b && numbers(b)).toEqual(numbers(x))
    }
    // Skipped free agents could not have helped with any release.
    const kept = new Set(fast.map((x) => x.series.base.playerId))
    for (const b of brute) {
      if (!kept.has(b.series.base.playerId)) expect(b.options[0].delta).toBeLessThanOrEqual(0)
    }
    expect(lineupRows(ctx, fast, Infinity).map((r) => r.player.playerId)).toEqual(
      lineupRows(ctx, brute, Infinity).map((r) => r.player.playerId)
    )
  })
})
```

- [x] **Step 2: Run it**

Run: `npx vitest run tests/main/waiver/searchProperty.test.ts`
Expected: PASS (a few seconds). If it fails, the failing seed and player id reproduce the case: fix the shortcut, never loosen the test.

- [x] **Step 3: Write the budget test**

`tests/main/waiver/waiverBudget.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { waiverAdds } from '@main/waiver/adds'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

/** Slice 6c spec §10: the rest-of-season lists on a league the size of the user's. */
const ADDS_MS = 3000

/** Wall-clock: runs only under `npm run test:budget` (parallel `npm test` workers make it flap). */
describe.skipIf(!process.env.FFC_BUDGET)('waiver adds budget', () => {
  it('scores 16 teams and 550 free agents inside 3 s', () => {
    const { build } = syntheticBuild(generateLeague(7, 16, 550))
    const t0 = performance.now()
    const adds = waiverAdds(build, {
      settings: { waiverType: 'priority' },
      trending: new Map(),
      trendingFetchedAt: null
    })
    const ms = performance.now() - t0
    console.info(
      `waiver adds ${ms.toFixed(0)} ms · ${adds.lineup.length} lineup · ${adds.stash.length} stash`
    )
    expect(ms).toBeLessThan(ADDS_MS)
  })
})
```

`package.json`: `"test:budget": "FFC_BUDGET=1 vitest run Budget"` (matches `suggestBudget` and `waiverBudget`).

- [x] **Step 4: Run the budget**

Run: `npm run test:budget`
Expected: both budget files PASS; note the printed times in the commit body. If the waiver time is over 3 s, **stop and report** the number with a profile of where it goes (oversized solves vs release re-solves) — do not raise the budget; the next exact prune is decided with the user, as in Plan M.

- [x] **Step 5: Commit**

```bash
git add tests/main/waiver/searchProperty.test.ts tests/main/waiver/waiverBudget.test.ts package.json
git commit -m "test(waiver): add exactness property and budget"
```

---

### Task 9: Engine worker and the `waiver:adds` channel

**Files:**

- Create: `src/main/engine/lineupFromDb.ts`, `src/main/engine/jobs.ts`, `src/main/engine/worker.ts`, `src/main/engine/runEngine.ts`, `src/main/waiver/fromDb.ts`
- Modify: `src/main/trade/fromDb.ts` (use `lineupBuildFromDb`)
- Delete: `src/main/trade/worker.ts`, `src/main/trade/runSuggest.ts`
- Modify: `electron.vite.config.ts` (worker entry), `src/main/ipc/handlers.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`
- Test: `tests/main/engine/jobs.test.ts`

**Interfaces:**

- Consumes: `suggestFromDb` (`@main/trade/fromDb`), `waiverAdds` (Task 7), `listTrendingAdds`, `trendingFetchedAt` (Task 3), `getRules`.
- Produces: `lineupBuildFromDb(db: Db, leagueId: string, season: number): LineupBuild`; `waiverAddsFromDb(dbPath: string, leagueId: string, season: number): WaiverAdds`; `EngineJob = { kind: 'tradeSuggest'; query: TradeSuggestQuery } | { kind: 'waiverAdds'; season: number }`; `EngineResults { tradeSuggest: TradeSuggestion[]; waiverAdds: WaiverAdds }`; `EngineInput { dbPath; leagueId; job }`; `EngineOutput { result?: unknown; error?: string }`; `runJob(input: EngineInput): EngineResults[EngineJob['kind']]`; `runEngine<J extends EngineJob>(dbPath, leagueId, job: J): Promise<EngineResults[J['kind']]>`; `IPC.waiverAdds = 'waiver:adds'`; `Api.waiver.adds(season: number): Promise<WaiverAdds>`.

- [x] **Step 1: Write the failing test**

`tests/main/engine/jobs.test.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { replaceTrendingAdds } from '@main/db/repos/trending'
import { runJob } from '@main/engine/jobs'
import { suggestTrades } from '@main/trade/suggest'
import { waiverAdds } from '@main/waiver/adds'
import { SEED_TS } from '../../fixtures/db'
import { SEASON } from '../../fixtures/season'
import { SMALL_LEAGUE, syntheticBuild, WAIVER_LEAGUE } from '../../fixtures/synthetic'

const dir = mkdtempSync(join(tmpdir(), 'ffc-engine-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('runJob (the engine worker body)', () => {
  it('answers a waiver job from its own connection with the in-process result', () => {
    const path = join(dir, 'waiver.db')
    const { db, build } = syntheticBuild(WAIVER_LEAGUE, path)
    replaceTrendingAdds(db, [{ playerId: 'Z', count: 120 }], SEED_TS)
    db.close()
    const settings = WAIVER_LEAGUE.rules?.settings ?? { waiverType: 'priority' as const }
    expect(
      runJob({ dbPath: path, leagueId: 'L1', job: { kind: 'waiverAdds', season: SEASON } })
    ).toEqual(
      waiverAdds(build, {
        settings,
        trending: new Map([['Z', 120]]),
        trendingFetchedAt: SEED_TS
      })
    )
  })

  it('still answers trade suggestions', () => {
    const path = join(dir, 'trade.db')
    const { db, build } = syntheticBuild(SMALL_LEAGUE, path)
    db.close()
    const query = { season: SEASON, focus: null, stance: 'fair' as const, partnerRosterId: null }
    expect(runJob({ dbPath: path, leagueId: 'L1', job: { kind: 'tradeSuggest', query } })).toEqual(
      suggestTrades(build, query)
    )
  })

  it('surfaces the engine error without projections', () => {
    const path = join(dir, 'blind.db')
    syntheticBuild({ ...WAIVER_LEAGUE, weeks: [] }, path).db.close()
    expect(() =>
      runJob({ dbPath: path, leagueId: 'L1', job: { kind: 'waiverAdds', season: SEASON } })
    ).toThrow('No projections stored')
  })
})
```

- [x] **Step 2: Run to see it fail**

Run: `npx vitest run tests/main/engine/jobs.test.ts`
Expected: FAIL — `@main/engine/jobs` missing.

- [x] **Step 3: Implement the engine modules**

`src/main/engine/lineupFromDb.ts`:

```ts
import type { Db } from '@main/db/connection'
import { leagueRosterPositions } from '@main/db/repos/leagues'
import { listMatchups } from '@main/db/repos/matchups'
import { getRules } from '@main/db/repos/rules'
import { listStarterIndexes, listTeams } from '@main/db/repos/teams'
import { buildLineups, type LineupBuild } from '@main/lineup/build'
import { buildValueSeason } from '@main/value/build'

/**
 * The lineup build as the handlers' `cachedLineup` makes it, on the caller's connection: the
 * engine worker opens its own, and rebuilding costs ~30 ms — far less than the searches it feeds.
 */
export function lineupBuildFromDb(db: Db, leagueId: string, season: number): LineupBuild {
  const rules = getRules(db, leagueId)
  return buildLineups({
    value: buildValueSeason(db, leagueId, season),
    teams: listTeams(db, leagueId),
    rosterSlots: rules?.rosterSlots ?? [],
    rosterPositions: leagueRosterPositions(db, leagueId),
    matchups: listMatchups(db, leagueId, season),
    starterIndexes: listStarterIndexes(db, leagueId),
    tradeDeadlineWeek: rules?.settings.tradeDeadlineWeek ?? null
  })
}
```

`src/main/trade/fromDb.ts` becomes:

```ts
import { openDatabase } from '@main/db/connection'
import { lineupBuildFromDb } from '@main/engine/lineupFromDb'
import type { TradeSuggestion, TradeSuggestQuery } from '@shared/types'
import { suggestTrades } from './suggest'

/** The trade search on its own connection, for the engine worker (6b spec §6). */
export function suggestFromDb(
  dbPath: string,
  leagueId: string,
  query: TradeSuggestQuery
): TradeSuggestion[] {
  const db = openDatabase(dbPath)
  try {
    return suggestTrades(lineupBuildFromDb(db, leagueId, query.season), query)
  } finally {
    db.close()
  }
}
```

`src/main/waiver/fromDb.ts`:

```ts
import { openDatabase } from '@main/db/connection'
import { getRules } from '@main/db/repos/rules'
import { listTrendingAdds, trendingFetchedAt } from '@main/db/repos/trending'
import { lineupBuildFromDb } from '@main/engine/lineupFromDb'
import type { WaiverAdds } from '@shared/types'
import { waiverAdds } from './adds'

/** Slice 6c spec §6: the rest-of-season lists on their own connection, for the engine worker. */
export function waiverAddsFromDb(dbPath: string, leagueId: string, season: number): WaiverAdds {
  const db = openDatabase(dbPath)
  try {
    const settings = getRules(db, leagueId)?.settings ?? { waiverType: 'priority' as const }
    return waiverAdds(lineupBuildFromDb(db, leagueId, season), {
      settings,
      trending: listTrendingAdds(db),
      trendingFetchedAt: trendingFetchedAt(db)
    })
  } finally {
    db.close()
  }
}
```

`src/main/engine/jobs.ts`:

```ts
import { suggestFromDb } from '@main/trade/fromDb'
import { waiverAddsFromDb } from '@main/waiver/fromDb'
import type { TradeSuggestion, TradeSuggestQuery, WaiverAdds } from '@shared/types'

/** The searches that run off the main thread (6b spec §6, 6c spec §6). */
export type EngineJob =
  | { kind: 'tradeSuggest'; query: TradeSuggestQuery }
  | { kind: 'waiverAdds'; season: number }

export interface EngineResults {
  tradeSuggest: TradeSuggestion[]
  waiverAdds: WaiverAdds
}

export interface EngineInput {
  dbPath: string
  leagueId: string
  job: EngineJob
}

/** Errors cross the thread boundary as a message so `TradeError`'s user-facing text survives. */
export interface EngineOutput {
  result?: unknown
  error?: string
}

export function runJob(input: EngineInput): EngineResults[EngineJob['kind']] {
  const { dbPath, leagueId, job } = input
  switch (job.kind) {
    case 'tradeSuggest':
      return suggestFromDb(dbPath, leagueId, job.query)
    case 'waiverAdds':
      return waiverAddsFromDb(dbPath, leagueId, job.season)
  }
}
```

`src/main/engine/worker.ts`:

```ts
import { parentPort, workerData } from 'node:worker_threads'
import { runJob, type EngineInput, type EngineOutput } from './jobs'

/** Worker entry, bundled to `out/main/engineWorker.js`. */
const input = workerData as EngineInput
let output: EngineOutput
try {
  output = { result: runJob(input) }
} catch (err) {
  output = { error: err instanceof Error ? err.message : String(err) }
}
parentPort?.postMessage(output)
```

`src/main/engine/runEngine.ts`:

```ts
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { EngineInput, EngineJob, EngineOutput, EngineResults } from './jobs'

/** Bundled beside the main entry by `electron.vite.config.ts`. */
function workerPath(): string {
  return join(__dirname, 'engineWorker.js')
}

/**
 * The trade and waiver searches take seconds, so they run off the main thread: the window keeps
 * painting and every other channel keeps answering. One worker per job, terminated when it answers.
 */
export function runEngine<J extends EngineJob>(
  dbPath: string,
  leagueId: string,
  job: J
): Promise<EngineResults[J['kind']]> {
  return new Promise((resolve, reject) => {
    const workerData: EngineInput = { dbPath, leagueId, job }
    const worker = new Worker(workerPath(), { workerData })
    let answered = false
    const settle = (fn: () => void): void => {
      if (answered) return
      answered = true
      void worker.terminate()
      fn()
    }
    worker.on('message', (out: EngineOutput) =>
      settle(() =>
        out.error === undefined
          ? resolve(out.result as EngineResults[J['kind']])
          : reject(new Error(out.error))
      )
    )
    worker.on('error', (err) => settle(() => reject(err)))
    worker.on('exit', (code) =>
      settle(() => reject(new Error(`Background calculation stopped unexpectedly (exit ${code})`)))
    )
  })
}
```

`git rm src/main/trade/worker.ts src/main/trade/runSuggest.ts`.

`electron.vite.config.ts`:

```ts
        // The trade and waiver searches run in a worker thread (6b / 6c spec §6), bundled beside the main entry.
        input: {
          index: resolve('src/main/index.ts'),
          engineWorker: resolve('src/main/engine/worker.ts')
        }
```

- [x] **Step 4: Wire the channel**

`src/shared/ipc.ts` — import `WaiverAdds`; in `Api` after `trade`:

```ts
  waiver: {
    /** Rest-of-season adds and stashes with their releases (slice 6c spec §2–3); runs in the engine worker. */
    adds(season: number): Promise<WaiverAdds>
  }
```

and `waiverAdds: 'waiver:adds',` in `IPC` after `tradeSuggest`.

`src/preload/index.ts`, after `trade`:

```ts
  waiver: {
    adds: (season) => ipcRenderer.invoke(IPC.waiverAdds, season)
  },
```

`src/main/ipc/handlers.ts` — replace `import { runSuggest } from '@main/trade/runSuggest'` with `import { runEngine } from '@main/engine/runEngine'`; the `tradeSuggest` handler returns `runEngine(ctx.dbPath, id, { kind: 'tradeSuggest', query })`; import `WaiverAdds` in the `@shared/types` list and add after it:

```ts
  ipcMain.handle(IPC.waiverAdds, (_event, season: number): Promise<WaiverAdds> => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    // Slice 6c spec §6: the search runs in the engine worker, rebuilt from the DB.
    return runEngine(ctx.dbPath, id, { kind: 'waiverAdds', season })
  })
```

- [x] **Step 5: Run the tests, the build, then the full check**

Run: `npx vitest run tests/main/engine tests/main/trade` → PASS.
Run: `npm run build && ls out/main` → shows `engineWorker.js` and no `tradeWorker.js`.
Run: `npm run typecheck && npm run lint && npm test` → green.

- [x] **Step 6: Commit**

```bash
git add -A src/main/engine src/main/trade src/main/waiver/fromDb.ts src/main/ipc/handlers.ts src/shared/ipc.ts src/preload/index.ts electron.vite.config.ts tests/main/engine
git commit -m "feat(ipc): run waiver adds in a shared engine worker"
```

---

### Task 10: Waiver view helpers

**Files:**

- Create: `src/renderer/src/lib/waiverView.ts`
- Create: `tests/fixtures/waiver.ts`
- Test: `tests/renderer/lib/waiverView.test.ts`

**Interfaces:**

- Consumes: `fmtSigned`, `relativeTime` (`@/lib/format`); `fmtMarket` (`@/lib/tradeView`).
- Produces: `NO_LINEUP_ADDS`, `NO_STASH`, `STASH_SHOWN = 30`, `StashSort = 'market' | 'trending' | 'rank'`, `STASH_SORTS: { key: StashSort; label: string }[]`, `releaseLabel(o)`, `optionLabel(o)`, `startsText(weeks, windowWeeks)`, `priorityLine(adds)`, `rosRankLabel(p)`, `trendingText(count)`, `isFree(o)`, `trendingNote(fetchedAt, now?)`, `sortStash(rows, by)`. Fixtures: `allgeier`, `miller`, `wright`, `harris`, `addOption(over)`, `addRow(over)`, `stashRow(over)`, `waiverAdds(over)`.

- [x] **Step 1: Fixtures**

`tests/fixtures/waiver.ts`:

```ts
import type { AddOption, AddRow, StashRow, WaiverAdds } from '@shared/types'
import { tradePlayer } from './trade'

export const allgeier = tradePlayer({
  playerId: '7001',
  fullName: 'Tyler Allgeier',
  team: 'ATL',
  starterWeeks: 0
})
export const miller = tradePlayer({
  playerId: '7002',
  fullName: 'Kendre Miller',
  team: 'NO',
  starterWeeks: 0
})
export const wright = tradePlayer({
  playerId: '7004',
  fullName: 'Jaylen Wright',
  team: 'MIA',
  starterWeeks: 0,
  expert: { ecrRank: 120, ecrPosRank: 34, spread: 5, experts: 30, ecrDelta: null },
  market: { value: 2100, posRank: 40, tier: 6, trend30d: 0 }
})
export const harris = tradePlayer({
  playerId: '7005',
  fullName: 'Tre Harris',
  position: 'WR',
  team: 'LAC',
  starterWeeks: 0
})

export function addOption(over: Partial<AddOption> = {}): AddOption {
  return {
    release: { kind: 'drop', playerId: miller.playerId },
    releasePlayer: miller,
    delta: 6,
    deltaPerWeek: 0.4,
    thisWeekDelta: 0,
    startWeeks: [7, 9],
    ...over
  }
}

export function addRow(over: Partial<AddRow> = {}): AddRow {
  return { player: allgeier, options: [addOption()], ...over }
}

export function stashRow(over: Partial<StashRow> = {}): StashRow {
  return {
    player: wright,
    trending: null,
    options: [addOption({ delta: 0, deltaPerWeek: 0, startWeeks: [] })],
    ...over
  }
}

export function waiverAdds(over: Partial<WaiverAdds> = {}): WaiverAdds {
  return {
    season: 2026,
    currentWeek: 3,
    lastWeek: 17,
    weeks: 15,
    lineup: [addRow()],
    stash: [stashRow(), stashRow({ player: harris, trending: 1200 })],
    waiverType: 'priority',
    myWaiverPosition: 12,
    teamCount: 16,
    trendingFetchedAt: null,
    ...over
  }
}
```

- [x] **Step 2: Write the failing tests**

`tests/renderer/lib/waiverView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  isFree,
  optionLabel,
  priorityLine,
  releaseLabel,
  rosRankLabel,
  sortStash,
  startsText,
  trendingNote,
  trendingText
} from '@/lib/waiverView'
import { fmtMarket } from '@/lib/tradeView'
import { addOption, harris, stashRow, waiverAdds, wright } from '../../fixtures/waiver'

describe('waiverView', () => {
  it('labels each release kind', () => {
    expect(releaseLabel(addOption())).toBe('Drop Kendre Miller')
    expect(releaseLabel(addOption({ release: { kind: 'open' }, releasePlayer: null }))).toBe(
      'Open spot'
    )
    expect(releaseLabel(addOption({ release: { kind: 'ir', playerId: '7002' } }))).toBe(
      'IR: Kendre Miller'
    )
    expect(optionLabel(addOption({ delta: -1.5 }))).toBe('Drop Kendre Miller · -1.50')
  })

  it('shows up to three start weeks, then a count', () => {
    expect(startsText([], 15)).toBe('—')
    expect(startsText([7, 9], 15)).toBe('wk 7, 9')
    expect(startsText([3, 4, 5, 6], 15)).toBe('4 of 15 wks')
  })

  it('shows my waiver priority in priority leagues only', () => {
    expect(priorityLine(waiverAdds())).toBe('Waiver priority 12 of 16')
    expect(priorityLine(waiverAdds({ waiverType: 'faab' }))).toBeNull()
    expect(priorityLine(waiverAdds({ myWaiverPosition: null }))).toBeNull()
  })

  it('formats the stash signals', () => {
    expect(rosRankLabel(wright)).toBe('RB34')
    expect(rosRankLabel(harris)).toBe('—')
    expect(trendingText(12345)).toBe(`+${fmtMarket(12345)}`)
    expect(trendingText(null)).toBe('—')
    expect(isFree(addOption({ delta: 0 }))).toBe(true)
    expect(isFree(addOption({ delta: -0.2 }))).toBe(false)
  })

  it('says when trending adds were fetched', () => {
    const now = Date.parse('2026-09-22T12:00:00.000Z')
    expect(trendingNote('2026-09-22T10:00:00.000Z', now)).toBe('Trending adds fetched 2 h ago')
    expect(trendingNote(null, now)).toBe('Trending adds unavailable — refresh to fetch them')
  })

  it('sorts the stash by a signal, players without it last', () => {
    const rows = [stashRow(), stashRow({ player: harris, trending: 1200 })]
    expect(sortStash(rows, 'market').map((r) => r.player.fullName)).toEqual([
      'Jaylen Wright',
      'Tre Harris'
    ])
    expect(sortStash(rows, 'trending').map((r) => r.player.fullName)).toEqual([
      'Tre Harris',
      'Jaylen Wright'
    ])
    expect(sortStash(rows, 'rank').map((r) => r.player.fullName)).toEqual([
      'Jaylen Wright',
      'Tre Harris'
    ])
  })
})
```

- [x] **Step 3: Run to see them fail**

Run: `npx vitest run tests/renderer/lib/waiverView.test.ts`
Expected: FAIL — module missing.

- [x] **Step 4: Implement `src/renderer/src/lib/waiverView.ts`**

```ts
import { fmtSigned, relativeTime } from '@/lib/format'
import { fmtMarket } from '@/lib/tradeView'
import type { AddOption, StashRow, TradePlayer, WaiverAdds } from '@shared/types'

export const NO_LINEUP_ADDS = 'No free agent improves your lineup over the rest of the season.'
export const NO_STASH = 'No free agent carries a market, trending or expert signal.'
/** Slice 6c spec §3: the Stash table shows this many rows of the current sort. */
export const STASH_SHOWN = 30

export type StashSort = 'market' | 'trending' | 'rank'
export const STASH_SORTS: { key: StashSort; label: string }[] = [
  { key: 'market', label: 'Market' },
  { key: 'trending', label: 'Trending 24 h' },
  { key: 'rank', label: 'ROS rank' }
]

/** Spec §8: "Drop Kendre Miller", "Open spot", "IR: Caleb Williams". */
export function releaseLabel(o: AddOption): string {
  const name = o.releasePlayer?.fullName ?? ''
  switch (o.release.kind) {
    case 'open':
      return 'Open spot'
    case 'ir':
      return `IR: ${name}`
    case 'drop':
      return `Drop ${name}`
  }
}

/** A dropdown entry: the release and the whole move's window Δ. */
export function optionLabel(o: AddOption): string {
  return `${releaseLabel(o)} · ${fmtSigned(o.delta)}`
}

/** Spec §8: "wk 7, 9" up to three weeks, then "12 of 15 wks"; "—" when he never starts. */
export function startsText(weeks: number[], windowWeeks: number): string {
  if (weeks.length === 0) return '—'
  if (weeks.length <= 3) return `wk ${weeks.join(', ')}`
  return `${weeks.length} of ${windowWeeks} wks`
}

export function priorityLine(a: WaiverAdds): string | null {
  return a.waiverType === 'priority' && a.myWaiverPosition !== null
    ? `Waiver priority ${a.myWaiverPosition} of ${a.teamCount}`
    : null
}

/** FantasyPros ROS positional rank: "RB34". */
export function rosRankLabel(p: TradePlayer): string {
  return p.expert && p.position ? `${p.position}${p.expert.ecrPosRank}` : '—'
}

export function trendingText(count: number | null): string {
  return count === null ? '—' : `+${fmtMarket(count)}`
}

/** Spec §3: making room costs nothing. */
export function isFree(o: AddOption): boolean {
  return o.delta >= 0
}

export function trendingNote(fetchedAt: string | null, now: number = Date.now()): string {
  return fetchedAt === null
    ? 'Trending adds unavailable — refresh to fetch them'
    : `Trending adds fetched ${relativeTime(fetchedAt, now)}`
}

function signal(row: StashRow, by: StashSort): number | null {
  switch (by) {
    case 'market':
      return row.player.market?.value ?? null
    case 'trending':
      return row.trending
    case 'rank':
      return row.player.expert?.ecrRank ?? null
  }
}

/** Spec §3 / §8: market and trending high first, rank low first; players without the signal last. */
export function sortStash(rows: StashRow[], by: StashSort): StashRow[] {
  const dir = by === 'rank' ? 1 : -1
  return [...rows]
    .sort((a, b) => {
      const x = signal(a, by)
      const y = signal(b, by)
      if (x === null || y === null) {
        if (x !== y) return x === null ? 1 : -1
      } else if (x !== y) {
        return (x - y) * dir
      }
      return a.player.fullName.localeCompare(b.player.fullName)
    })
    .slice(0, STASH_SHOWN)
}
```

- [x] **Step 5: Run the tests, then the full check**

Run: `npx vitest run tests/renderer/lib/waiverView.test.ts` → PASS.
Run: `npm run typecheck && npm run lint && npm test` → green.

- [x] **Step 6: Commit**

```bash
git add src/renderer/src/lib/waiverView.ts tests/fixtures/waiver.ts tests/renderer/lib/waiverView.test.ts
git commit -m "feat(ui): add waiver view helpers"
```

---

### Task 11: The Waivers screen

**Files:**

- Create: `src/renderer/src/screens/WaiverScreen.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx`, `src/renderer/src/App.tsx`
- Test: `tests/renderer/components/WaiverScreen.test.tsx`

**Interfaces:**

- Consumes: `api.players.options`, `api.waiver.adds` (Task 9); Task 10's helpers; `windowLabel`, `deltaTone`, `fmtMarket` (`@/lib/tradeView`); `PlayerDetailPanel`, `PositionBadge`, `Card*`, `Table*`.
- Produces: `WaiverScreen({ dataVersion }: { dataVersion: number })`; `Screen` gains `'waivers'`.

- [x] **Step 1: Write the failing test**

`tests/renderer/components/WaiverScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { WaiverScreen } from '@/screens/WaiverScreen'
import { api } from '@/lib/api'
import type { PlayersOptions } from '@shared/types'
import { addOption, addRow, waiverAdds } from '../../fixtures/waiver'

vi.mock('@/lib/api', () => ({
  api: {
    players: { options: vi.fn(), detail: vi.fn() },
    waiver: { adds: vi.fn() }
  }
}))
const optionsMock = vi.mocked(api.players.options)
const addsMock = vi.mocked(api.waiver.adds)

const options: PlayersOptions = {
  seasons: [2026],
  currentWeek: 3,
  lastScoredWeek: 2,
  tabs: [],
  projectionWeeks: []
}

beforeEach(() => {
  optionsMock.mockReset()
  addsMock.mockReset()
  optionsMock.mockResolvedValue(options)
  addsMock.mockResolvedValue(waiverAdds())
})
afterEach(cleanup)

describe('WaiverScreen', () => {
  it('shows the window, my waiver priority and the lineup adds', async () => {
    render(<WaiverScreen dataVersion={0} />)
    expect(await screen.findByText('weeks 3–17 · 15 weeks')).toBeTruthy()
    expect(addsMock).toHaveBeenCalledWith(2026)
    expect(screen.getByText('Waiver priority 12 of 16')).toBeTruthy()
    expect(screen.getByText('Tyler Allgeier')).toBeTruthy()
    expect(screen.getByText('+0.40/wk')).toBeTruthy()
    expect(screen.getByText('wk 7, 9')).toBeTruthy()
  })

  it('switches a row to another release and shows its numbers', async () => {
    addsMock.mockResolvedValue(
      waiverAdds({
        lineup: [
          addRow({
            options: [
              addOption(),
              addOption({
                release: { kind: 'open' },
                releasePlayer: null,
                delta: -3,
                deltaPerWeek: -0.2,
                startWeeks: [7]
              })
            ]
          })
        ]
      })
    )
    render(<WaiverScreen dataVersion={0} />)
    const select = (await screen.findByLabelText(
      'Release for Tyler Allgeier'
    )) as HTMLSelectElement
    expect(select.value).toBe('0')
    fireEvent.change(select, { target: { value: '1' } })
    expect(screen.getByText('-0.20/wk')).toBeTruthy()
    expect(screen.getByText('wk 7')).toBeTruthy()
  })

  it('sorts the stash by trending on request and tags free releases', async () => {
    render(<WaiverScreen dataVersion={0} />)
    await screen.findByText('Jaylen Wright')
    const names = (): string[] =>
      screen
        .getAllByTestId('stash-row')
        .map((row) => within(row).getAllByRole('button')[0].textContent ?? '')
    expect(names()).toEqual(['Jaylen Wright', 'Tre Harris'])
    fireEvent.click(screen.getByRole('button', { name: 'Trending 24 h' }))
    expect(names()).toEqual(['Tre Harris', 'Jaylen Wright'])
    expect(screen.getAllByText('free')).toHaveLength(2)
    expect(screen.getByText('Trending adds unavailable — refresh to fetch them')).toBeTruthy()
  })

  it('explains empty lists', async () => {
    addsMock.mockResolvedValue(waiverAdds({ lineup: [], stash: [] }))
    render(<WaiverScreen dataVersion={0} />)
    expect(
      await screen.findByText('No free agent improves your lineup over the rest of the season.')
    ).toBeTruthy()
    expect(screen.getByText('No free agent carries a market, trending or expert signal.')).toBeTruthy()
  })

  it('shows the engine error', async () => {
    addsMock.mockRejectedValue(new Error('No projections stored for this season'))
    render(<WaiverScreen dataVersion={0} />)
    expect(await screen.findByText('No projections stored for this season')).toBeTruthy()
  })
})
```

- [x] **Step 2: Run to see it fail**

Run: `npx vitest run tests/renderer/components/WaiverScreen.test.tsx`
Expected: FAIL — screen missing.

- [x] **Step 3: Implement `src/renderer/src/screens/WaiverScreen.tsx`**

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
import { errorMessage, fmtSigned } from '@/lib/format'
import { deltaTone, fmtMarket, windowLabel } from '@/lib/tradeView'
import { cn } from '@/lib/utils'
import {
  NO_LINEUP_ADDS,
  NO_STASH,
  STASH_SORTS,
  isFree,
  optionLabel,
  priorityLine,
  releaseLabel,
  rosRankLabel,
  sortStash,
  startsText,
  trendingNote,
  trendingText,
  type StashSort
} from '@/lib/waiverView'
import type { AddOption, DetailTarget, TradePlayer, WaiverAdds } from '@shared/types'

const selectClass =
  'h-8 max-w-64 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'

const TONE: Record<ReturnType<typeof deltaTone>, string> = {
  green: 'text-emerald-400',
  red: 'text-red-400',
  muted: 'text-muted-foreground'
}

type Choose = (key: string, index: number) => void

function PlayerCell({
  player,
  onOpen
}: {
  player: TradePlayer
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <PositionBadge position={player.position} />
      <button type="button" className="font-medium hover:underline" onClick={() => onOpen(player)}>
        {player.fullName}
      </button>
      <span className="text-muted-foreground">{player.team ?? ''}</span>
      {player.injuryStatus && (
        <span className="text-xs font-semibold text-red-400">{player.injuryStatus}</span>
      )}
    </div>
  )
}

/** Spec §8: the release, as a dropdown of every option when there is a choice. */
function ReleaseCell({
  player,
  options,
  index,
  onChange
}: {
  player: TradePlayer
  options: AddOption[]
  index: number
  onChange: (index: number) => void
}): React.JSX.Element {
  if (options.length === 1) return <span className="text-sm">{releaseLabel(options[0])}</span>
  return (
    <select
      aria-label={`Release for ${player.fullName}`}
      className={selectClass}
      value={index}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {options.map((o, i) => (
        <option key={i} value={i}>
          {optionLabel(o)}
        </option>
      ))}
    </select>
  )
}

function LineupCard({
  adds,
  choice,
  onChoose,
  onOpen
}: {
  adds: WaiverAdds
  choice: Record<string, number>
  onChoose: Choose
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Improves my lineup</CardTitle>
      </CardHeader>
      <CardContent>
        {adds.lineup.length === 0 ? (
          <p className="text-sm text-muted-foreground">{NO_LINEUP_ADDS}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                <TableHead className="text-right">Δ/week</TableHead>
                <TableHead className="text-right">Window</TableHead>
                <TableHead className="text-right">This week</TableHead>
                <TableHead>Starts</TableHead>
                <TableHead>Make room</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adds.lineup.map((row) => {
                const key = `lineup|${row.player.playerId}`
                const index = choice[key] ?? 0
                const o = row.options[index] ?? row.options[0]
                return (
                  <TableRow key={key}>
                    <TableCell>
                      <PlayerCell player={row.player} onOpen={onOpen} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right font-semibold tabular-nums',
                        TONE[deltaTone(o.deltaPerWeek)]
                      )}
                    >
                      {`${fmtSigned(o.deltaPerWeek)}/wk`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtSigned(o.delta)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmtSigned(o.thisWeekDelta)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {startsText(o.startWeeks, adds.weeks)}
                    </TableCell>
                    <TableCell>
                      <ReleaseCell
                        player={row.player}
                        options={row.options}
                        index={index}
                        onChange={(i) => onChoose(key, i)}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function StashCard({
  adds,
  sort,
  onSort,
  choice,
  onChoose,
  onOpen
}: {
  adds: WaiverAdds
  sort: StashSort
  onSort: (by: StashSort) => void
  choice: Record<string, number>
  onChoose: Choose
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const rows = sortStash(adds.stash, sort)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Stash</CardTitle>
        <p className="text-xs text-muted-foreground">{trendingNote(adds.trendingFetchedAt)}</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{NO_STASH}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Player</TableHead>
                {STASH_SORTS.map(({ key, label }) => (
                  <TableHead key={key} className="text-right">
                    <button
                      type="button"
                      aria-pressed={sort === key}
                      className={cn('hover:underline', sort === key && 'font-semibold text-foreground')}
                      onClick={() => onSort(key)}
                    >
                      {label}
                    </button>
                  </TableHead>
                ))}
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Make room</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const key = `stash|${row.player.playerId}`
                const index = choice[key] ?? 0
                const o = row.options[index] ?? row.options[0]
                return (
                  <TableRow key={key} data-testid="stash-row">
                    <TableCell>
                      <PlayerCell player={row.player} onOpen={onOpen} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.player.market ? fmtMarket(row.player.market.value) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {trendingText(row.trending)}
                    </TableCell>
                    <TableCell className="text-right">{rosRankLabel(row.player)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {isFree(o) ? (
                        <span className="rounded bg-emerald-500/15 px-1 text-xs font-semibold text-emerald-400">
                          free
                        </span>
                      ) : (
                        fmtSigned(o.delta)
                      )}
                    </TableCell>
                    <TableCell>
                      <ReleaseCell
                        player={row.player}
                        options={row.options}
                        index={index}
                        onChange={(i) => onChoose(key, i)}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

interface WaiverScreenProps {
  dataVersion: number
}

/** Slice 6c spec §8: the Waivers screen, rest-of-season mode (streaming comes in Plan P). */
export function WaiverScreen({ dataVersion }: WaiverScreenProps): React.JSX.Element {
  const [season, setSeason] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; adds: WaiverAdds } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [choice, setChoice] = useState<Record<string, number>>({})
  const [sort, setSort] = useState<StashSort>('market')
  const [selected, setSelected] = useState<DetailTarget | null>(null)

  useEffect(() => {
    void api.players
      .options()
      .then((o) => setSeason((s) => s ?? o.seasons[0] ?? null))
      .catch((err) => setFailed({ key: 'options', message: errorMessage(err) }))
  }, [dataVersion])

  const key = season !== null ? `${season}|${dataVersion}` : null
  useEffect(() => {
    if (season === null || key === null) return
    let cancelled = false
    void api.waiver
      .adds(season)
      .then((adds) => {
        if (cancelled) return
        setLoaded({ key, adds })
        setChoice({})
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, key])

  // Spec §8: keep the previous lists on screen while a refresh computes.
  const adds = loaded?.adds ?? null
  const notice = failed && (failed.key === key || failed.key === 'options') ? failed.message : null
  const refreshing = loaded !== null && loaded.key !== key && notice === null
  const priority = adds ? priorityLine(adds) : null
  const choose: Choose = (k, i) => setChoice((c) => ({ ...c, [k]: i }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Waivers</h1>
          <p className="text-sm text-muted-foreground">
            Free agents worth a roster spot over the rest of the season, and what to release for
            them.
          </p>
        </div>
        {adds && (
          <div className="flex flex-col items-end text-sm text-muted-foreground">
            {priority && <span>{priority}</span>}
            <span>{windowLabel(adds)}</span>
          </div>
        )}
      </div>

      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {!adds && !notice && <p className="text-sm text-muted-foreground">Calculating…</p>}
      {refreshing && <p className="text-xs text-muted-foreground">Refreshing…</p>}

      {adds && (
        <>
          <LineupCard adds={adds} choice={choice} onChoose={choose} onOpen={setSelected} />
          <StashCard
            adds={adds}
            sort={sort}
            onSort={setSort}
            choice={choice}
            onChoose={choose}
            onOpen={setSelected}
          />
        </>
      )}

      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
```

`src/renderer/src/components/Sidebar.tsx`: import `UserPlus` from `lucide-react`; `Screen` becomes `'setup' | 'league' | 'rules' | 'players' | 'lineup' | 'trade' | 'waivers'`; add after the Trade item:

```ts
  { id: 'waivers', label: 'Waivers', icon: UserPlus, enabled: (hasLeague) => hasLeague },
```

`src/renderer/src/App.tsx`: `import { WaiverScreen } from '@/screens/WaiverScreen'` and after the Trade line:

```tsx
          {screen === 'waivers' && <WaiverScreen dataVersion={dataVersion} />}
```

- [x] **Step 4: Run the tests, then the full check**

Run: `npx vitest run tests/renderer` → PASS (if the stash name query picks another button first, scope it: the player's name button is the first button in the row).
Run: `npm run typecheck && npm run lint && npm test` → green.

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/screens/WaiverScreen.tsx src/renderer/src/components/Sidebar.tsx src/renderer/src/App.tsx tests/renderer/components/WaiverScreen.test.tsx
git commit -m "feat(ui): add the Waivers screen"
```

---

### Task 12: Rules screen — IR slots and statuses

**Files:**

- Modify: `src/renderer/src/lib/rulesView.ts`, `src/renderer/src/screens/RulesScreen.tsx`
- Test: `tests/renderer/lib/rulesView.test.ts`

**Interfaces:**

- Consumes: `IR_STATUSES`, `canonicalIrStatuses`, `LeagueSettings` (`@shared/rules`, Task 1).
- Produces: `irStatusesOf(settings: LeagueSettings): string[]`; `toggleIrStatus(current: string[] | undefined, status: string): string[]`.

- [x] **Step 1: Write the failing tests**

In `tests/renderer/lib/rulesView.test.ts` (import the two helpers):

```ts
describe('IR statuses (slice 6c spec §5.4)', () => {
  it('always includes IR', () => {
    expect(irStatusesOf({ numTeams: 12, waiverType: 'priority' })).toEqual(['IR'])
    expect(
      irStatusesOf({ numTeams: 12, waiverType: 'priority', irStatuses: ['Out', 'IR'] })
    ).toEqual(['IR', 'Out'])
  })

  it('toggles a status in canonical order and never removes IR', () => {
    expect(toggleIrStatus(['IR'], 'COV')).toEqual(['IR', 'COV'])
    expect(toggleIrStatus(['IR', 'COV'], 'Out')).toEqual(['IR', 'Out', 'COV'])
    expect(toggleIrStatus(['IR', 'Out'], 'Out')).toEqual(['IR'])
    expect(toggleIrStatus(['IR'], 'IR')).toEqual(['IR'])
    expect(toggleIrStatus(undefined, 'PUP')).toEqual(['IR', 'PUP'])
  })
})
```

- [x] **Step 2: Run to see them fail**

Run: `npx vitest run tests/renderer/lib/rulesView.test.ts`
Expected: FAIL — helpers missing.

- [x] **Step 3: Implement**

`src/renderer/src/lib/rulesView.ts` (import `canonicalIrStatuses` and `LeagueSettings` from `@shared/rules`):

```ts
/** Slice 6c spec §5.4: the statuses allowed on IR, `IR` always included. */
export function irStatusesOf(settings: LeagueSettings): string[] {
  return canonicalIrStatuses(settings.irStatuses)
}

/** Adds or removes one status, in canonical order; `IR` can't be removed. */
export function toggleIrStatus(current: string[] | undefined, status: string): string[] {
  const set = new Set(canonicalIrStatuses(current))
  if (status !== 'IR') {
    if (set.has(status)) set.delete(status)
    else set.add(status)
  }
  return canonicalIrStatuses([...set])
}
```

`src/renderer/src/screens/RulesScreen.tsx` — import `IR_STATUSES` from `@shared/rules` and `irStatusesOf`, `toggleIrStatus` from `@/lib/rulesView`; inside the league-settings `CardContent`, after the *Playoff round type* `Field`:

```tsx
            <Field label="IR slots">
              <NumberField
                value={draft.settings.irSlots}
                integer
                placeholder="0"
                onChange={(v) => setSetting('irSlots', v)}
                className="w-full text-left"
              />
            </Field>
            <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-3">
              <span>Allowed on IR</span>
              <div className="flex flex-wrap gap-4">
                {IR_STATUSES.map((status) => (
                  <label key={status} className="flex items-center gap-1.5 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={irStatusesOf(draft.settings).includes(status)}
                      disabled={status === 'IR'}
                      onChange={() =>
                        setSetting('irStatuses', toggleIrStatus(draft.settings.irStatuses, status))
                      }
                    />
                    {status}
                  </label>
                ))}
              </div>
            </div>
```

- [x] **Step 4: Run the tests, then the full check**

Run: `npx vitest run tests/renderer/lib/rulesView.test.ts` → PASS.
Run: `npm run typecheck && npm run lint && npm test` → green.

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/lib/rulesView.ts src/renderer/src/screens/RulesScreen.tsx tests/renderer/lib/rulesView.test.ts
git commit -m "feat(rules): edit IR slots and IR statuses"
```

---

### Task 13: Data reference, real-data check, release `v0.16.0`

**Files:**

- Modify: `docs/reference/value-and-signals.md`
- Modify: this plan (status block)

- [x] **Step 1: Data reference**

In `docs/reference/value-and-signals.md`, before `## Constants (single sources)`, add a `## Waivers (added in v0.16.0)` section covering, in the doc's existing table style:

- **Releases** — `open` (only option when there is room), `ir` (league `irSlots` free, status in `irStatuses`; `IR` always allowed; lineup-wise identical to a drop), `drop` (active players only).
- **The search** — window as for trades; skip a free agent who can't enter my lineup in any window week (exact: Δ ≤ 0 for every release); oversized solve; a release that doesn't start in the oversized optimum costs nothing; a starter's release re-solves only when the add can enter my lineup without him (exact shortcuts, property-tested against brute force).
- **Tie order** — `open` → `ir` → least upside: market (none = 0), worst overall ROS rank (unranked worst), fewest `rosPoints`, name.
- **Lists** — *Improves my lineup*: best Δ ≥ 0.5 over the window, sorted by Δ, this week's Δ, name, 30 rows. *Stash*: free agents on an NFL team, not Inactive, best Δ < 0.5, with a market / trending / rank signal; shortlist = top 30 per signal; default order market, trending, name; cost = the best option's Δ, *free* at ≥ 0.
- **Payload** — `WaiverAdds` fields, one line each, as for `TradeEvaluation`.
- **Data** — `trending_adds` (latest Sleeper fetch, `sleeper:trending:add`, every sync, non-fatal), `ros_snapshots.market_value` / `trending_adds` (weekly history), `teams.waiver_position`, `LeagueSettings.irSlots` / `irStatuses` (Sleeper `reserve_slots` / `reserve_allow_*`, editable on Rules).

Add `LINEUP_MIN_DELTA`, `WAIVER_MAX`, `STASH_SHOWN`, `IR_STATUSES`, `MAX_IR_SLOTS` to *Constants (single sources)* with their files, and `src/main/waiver/*`, `src/main/engine/*`, `src/renderer/src/lib/waiverView.ts`, `WaiverScreen.tsx` to *Module map*.

- [x] **Step 2: Commit the docs**

```bash
git add docs/reference/value-and-signals.md
git commit -m "docs: document waiver recommendations"
```

- [x] **Step 3: Final verification and the real-data check**

Run: `npm run typecheck && npm run lint && npm test && npm run test:budget` — all green.

Then on a copy of the dev DB (`cp ~/.config/FantasyCompanion/companion.db <scratchpad>/real.db`) a throwaway `tests/zz-waivers.test.ts` that: runs `migrate()` on the copy; takes the league's settings from `mapRules(JSON.parse(sleeper_raw), now).settings` (the copy predates `irSlots`); fetches trending adds live with `createSleeperClient().getTrendingAdds()` into `replaceTrendingAdds`; builds `lineupBuildFromDb(db, leagueId, 2026)` and times `waiverAdds(...)`; prints the top 10 lineup adds (player, Δ/wk, window Δ, start weeks, chosen release and the next two options) and the top 10 stash rows (market, trending, rank, cost). Check with the user's roster in mind: every suggested drop is someone who barely starts; IR moves appear only for Out / IR players with a free IR slot (the league allows 2, `Out` eligible); no stash row is a player the lineup list already has; the time is under the 3 s budget. Delete the file (never commit it).

Also run the app once (`npm run dev`, via the Bash tool's `run_in_background`) and open Waivers: both cards render, the release dropdown changes a row's numbers, a column header re-sorts the stash, the Rules screen shows *IR slots* and the status checkboxes. If WSLg can't show the window, say so in the status block rather than claiming it was checked.

- [x] **Step 4: Merge and release**

```bash
git checkout main && git merge --no-ff feat/waiver-adds -m "merge: feat/waiver-adds (plan O)"
npm version minor -m "build: bump version to %s"
```

Expected: `package.json` at `0.16.0`, tag `v0.16.0`. Pushing (`git push --follow-tags`) triggers the Windows release workflow into a draft release — **ask the user first**, as in earlier plans. The worker file name changed (`engineWorker.js`): if the packaged app's Trade suggestions or Waivers fail with a worker error, add `out/main/engineWorker.js` to `asarUnpack` in `electron-builder.yml`. Then mark the plan complete in a `docs(plan): mark plan O complete` commit.

---

## Self-review against the spec

- §2.1 window and baseline → Task 6 (`waiverContext`: `requireWindow`, `teamWeek` baseline).
- §2.2 releases (open / IR / drop, open alone when there is room, IR eligibility) → Task 5 (`releaseCandidates`, `applyRelease`), tested for each case including a full IR slot and a disallowed status.
- §2.3 exact search (skip, oversized, non-starter shortcut, re-solve only starting weeks, tie order) → Task 5 (`compareReleases`) and Task 6 (`scoreAdd`), with the hand-computed `WAIVER_LEAGUE` and the brute-force property test in Task 8.
- §2.4 rows (delta, per week, this week, start weeks, ≥ 0.5, sort, cap 30) → Task 6 (`lineupRows`).
- §3 stash (candidates, signals, shortlist union, costs, free tag, default order) → Task 7 (`stashRows`) and Tasks 10–11 (sort, *free* tag).
- §5.1 trending → Task 3; §5.2 snapshot columns → Task 4; §5.3 waiver position → Task 2; §5.4 IR settings → Task 1 (+ Rules fields in Task 12); §5.5 migration → Task 2.
- §6 types, `waiver:adds`, engine worker (rename, four-kind protocol reduced to the two kinds that exist in Plan O — `waiverStream` and `openSpot` come with Plan P) → Tasks 5 and 9.
- §8 screen (*Rest of season* mode, header, cards, release dropdown, detail panel, refresh behaviour, sidebar) → Task 11. The `Rest of season | Streaming` switch arrives with streaming in Plan P.
- §9 errors / empty states → Task 6 (errors), Task 9 (worker error text), Task 11 (messages).
- §10 tests → unit tests per task, property + budget in Task 8, sync / data tests in Tasks 1–4, worker body in Task 9, components in Tasks 11–12, real-data check in Task 13.
- §12 phasing: Plan O = data, engine, stash, worker, rest-of-season screen → `v0.16.0` (Task 13).
