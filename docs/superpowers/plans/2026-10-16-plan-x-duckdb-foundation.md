# Plan X — Stats analysis: the DuckDB foundation

**Status:** complete 2026-10-16. Executed inline. Merged to main as `e4bf632` and tagged `v0.25.0` on `ac3e665` (not pushed yet). Task 1 gate: the `Package check` workflow on Windows was green in 2 min 20 s; the packaged app printed `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true}` and the suite passed on Windows. Each task's tests were seen failing, then passing. The counts are 3 above the plan's (889 / 930 / 795) because of the untracked `tests/shared/playerImage.test.ts` in the working tree. Task 8, live on the committed code: 127 steps (126 ok, `participation:2026` skipped) in 154 s, peak 2.2 GB, 283 MB, `ALL GATES PASSED` (box score ≥ 99.99 %, snaps ±1 ≥ 99.48 %, FTN 100 %, participation ≥ 98.33 %). Packaged Linux self-test ok. Standalone empty profile: `warehouse.db` deleted, 126 ok + 1 skipped in 2 min 14 s. Dev profile: `warehouse.db` (632 MB) deleted, league refresh then stats backfill in 2 min 28 s, no main-process errors. Final review (fresh reviewer, Opus): no Critical, 3 Important, 8 Minor. All three Important findings and seven of the Minor ones are fixed, each test-first (`7c81f01`, `fe4f4a6`, `8cbd14e`, `4652883`, `f64d45d`); the eighth (postseason week numbering) is documented in the reference.

- (1) Sleeper players with 1–3 digit ids (Rodgers, Brady, Stafford: 223 players) had been filed as defenses. Defenses are now told apart by letters, and the Sleeper source is at version 2.
- (2) A quit during a DuckDB statement hung until it finished, then Electron aborted (SIGABRT, reproduced). Closing now cancels the refresh (aborts the download, interrupts the statement), and the app waits for the close before quitting. A packaged app sent SIGTERM mid-backfill exited in 203 ms, logged the step `interrupted`, and resumed on relaunch.
- (3) The new name key could link a Sleeper id to a crosswalk row owned by another Sleeper id ("Anthony Jones" → Tony Jones Jr.). Such candidates are now skipped, in the fantasy resolver and in `sleeper_ids`.
- Minors: interrupted steps are retried on the next run; a locked `warehouse.db` no longer breaks launch; Sleeper stat keys are validated; the self-test also checks `read_json` and ICU; team columns are normalised in place everywhere (`depth_charts` version 2); `season` and `week` are INTEGER in every table; two integer types widen to BIGINT; postseason week numbering is documented.
- Live rerun after the fixes: 145 s, 285 MB, peak 1.9 GB, `ALL GATES PASSED`. Sleeper players with points: 3,002 of 3,007 mapped (the short ids added 150); no gsis is shared through a name match; every `season` / `week` column is INTEGER.
- The dev profile's `stats.duckdb` was deleted after the fixes (built before them); the next launch rebuilds it.
- Not GUI-verified (WSLg); nothing in this plan changes the window.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SQLite stats warehouse (`warehouse.db`) with a DuckDB file, `stats.duckdb`, owned by one worker thread. It holds every free source as published (typed columns, no JSON), plus plays, the players each play names, and the players on the field, with the counting rules as views. Fold in coverage-audit fixes 1–4. The stats sync also runs without a league. Ship `v0.25.0`.

**Architecture:**

- **Module.** A new `src/main/stats/` module. `StatsDb` wraps one DuckDB connection.
  - `load.ts`: one generic loader. It replaces a season of a table from any Parquet / CSV / JSON select, adding columns that appear and widening types that change.
  - `sources.ts`: a declarative registry of the nflverse / ffverse files.
  - `sleeper.ts`: Sleeper's weekly lines.
  - `views.ts` and `identity.ts`: rebuilt after each refresh.
  - `sync.ts`: the warehouse's due and sealing rules, kept, one logged step per source × season.
- **Threading.** All of it runs in `statsWorker.js`, which `StatsClient` drives from the main process (`refresh`, `selfTest`, `close`). The main process starts it at launch, deletes `warehouse.db`, and refreshes stats after every league refresh, or at launch when no league exists.
- **Gate.** `--stats-self-test` lets CI prove the packaged Windows app loads DuckDB before anything else is built on it.
- **Removal.** Nothing read the warehouse, so its code is deleted. Plan Y rebuilds the aggregates as SQL over these tables.

**Tech Stack:** Electron 39, TypeScript strict, `@duckdb/node-api` 1.5.6 (new; first native module), `node:worker_threads`, Vitest (node environment; DuckDB runs in tests).

**Spec:** `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §2–§4, §11 (Plan X row of §12), amended by this plan (Task 9 writes the amendments into the spec as §15). The coverage audit: `docs/research/2026-10-14-warehouse-coverage-audit.md`.

## Planning findings (live data, 2026-10-15 / 16)

Everything below was measured with the code in this plan, unless it says "prototype".

- **Engine benchmark** (spec §3.2, prototype). On 2023–2025 (143,585 plays, 3.0 M on-field rows), DuckDB is 37 MB against SQLite's 379 MB, and a broad query takes 0.10 s against 5.7 s.
- **Extensions.** `@duckdb/node-api` 1.5.6 links `parquet`, `json`, `icu` and `core_functions` statically. Nothing is downloaded at run time (`autoinstall_known_extensions` is off anyway).
- **Native binding.**
  - It loads in a Node worker thread and in an Electron 39.8 main-process worker thread.
  - On Linux, packaged with `electron-builder --linux dir`, the binding lands in `app.asar.unpacked/node_modules/@duckdb/node-bindings-linux-x64/` (`duckdb.node` + `libduckdb.so`, 70 MB). `--stats-self-test` prints `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true}` and exits 0.
  - The Windows binding (`@duckdb/node-bindings-win32-x64`) is 38 MB unpacked and is in the lockfile as an optional dependency, so `npm ci` on the Windows runner installs it. **The Windows gate is Task 1, run on CI.** Expected installer growth: about 12–15 MB (v0.24.0's is 95 MB).
- **Parquet for every source.** nflverse publishes every file the warehouse read as `.parquet`, and ffverse publishes `ep_weekly_{season}.parquet`. Only the DynastyProcess crosswalk is CSV, and Sleeper is JSON.
  - A full backfill downloads 208 MB of Parquet in about 90 s, against about 1.5 GB of CSV before.
  - Participation is 4.7 MB against 49 MB. 2026 depth charts are 2.9 MB against 63 MB.
  - `pbp_participation_2026` is a 404, as expected.
- **Backfill** (the live check of Task 8, 2026-10-16, state 2026 week 6):

| Measure                  | Result                                                                | Target   |
| ------------------------ | --------------------------------------------------------------------- | -------- |
| Steps                    | 127: 126 ok, `stats:participation:2026` skipped ("not published yet") |          |
| Time, downloads included | 135–140 s                                                             | ≤ 10 min |
| `stats.duckdb`           | 283–285 MB                                                            | ≤ 400 MB |
| Peak process memory      | 1.76–2.0 GB (`memory_limit` 512 MB, 2 threads)                        |          |

- Over-cap runs: 1 GB and 4 threads peaked at 2.9 GB, and 256 MB fails on play-by-play.
- A forced daily refresh runs 24 steps in 12 s, peaking at 0.8 GB.
- Repeated forced refreshes keep the file between 301 and 306 MB, so freed blocks are reused.
- **Gates on that backfill.**
  - **Box score.** Carries, targets and receptions from the `plays` flags match nflverse `stats_player` on 99.99–100 % of player-weeks in every season 2019–2026.
  - **Snaps.** Snaps from `on_field` are within one of `snap_counts` on 99.48–99.98 % (offense) and 99.48–99.97 % (defense) in every season 2019–2025.
  - **Joins.** FTN finds its play 100 % of the time. Participation does 98.33–98.57 % through 2022 (deleted plays) and 100 % from 2023.
  - **Team codes.** No `OAK` / `SD` / `STL` / `LAR` / `WSH` is left in any team column.
  - **Depth charts.** `depth_chart_week` has 2025 playoff weeks 19–22 (10,989 rows).
  - **Sleeper ids.** Sleeper players with points map to a gsis id in 2,853 of 2,857 cases. Matt Hibner (13324) and Brandon Coleman (11702) resolve by name.
  - **Combine.** Of the 95 combine rows since 2019 with neither a PFR nor a college id, 71 resolve. All combine rows since 2019: 2,415 of 2,749.
  - **Freshness.** BUF @ LA (2026 week 5), stale in the audit, has its 199 plays.
  - **Speed.** The whole gate suite runs in 0.6 s.
- **Sources disagree in shape.** Each finding has a test.
  - Injuries gained a `season_type` column in 2025, beside `game_type`.
  - ESPN's QBR files have a `team` column holding the nickname ("Rams").
  - Participation lists positions only from 2023.
  - The 2019 play-by-play has `goal_to_go` as INTEGER, later seasons as DOUBLE.
  - Sleeper's stats object has about 280 keys across a season.
- **Play-by-play size.** Stored with all 372 columns, `src_pbp` alone is 211 MB. The drop pattern (amendment E) keeps 234 columns, including `desc`, and halves it to 106 MB. Within the file, `desc` is 8 % of the bytes and the home/away running totals about 30 %.
- **`play_players`** has 2.85 rows per play (1.0 M rows), not "~6" (spec §4.2).
- **Identity coverage.**
  - Before the position groups (amendment G), defenders listed by Sleeper as DL / DB missed their nflverse DT / CB match: 2,848 of 2,857 scorers mapped.
  - All Sleeper ids with any line: 5,705 of 5,819 mapped.
  - `sleeper_ids` resolutions: crosswalk 6,215, name 1,672, rosters 1. Rosters rarely add anything beyond the crosswalk, but they cost nothing.
- **DuckDB pitfalls hit while building.**
  - `at` is a reserved word. `off` is too, so aliases avoid it.
  - A view's `*` is bound at creation, so views are rebuilt after each refresh.
  - `DESCRIBE <select>` gives a load's columns without reading the data.
  - `INSERT … BY NAME` matches columns by name.
  - A literal `NULL` column has type `"NULL"`, stored as `VARCHAR`.
  - The React-hooks lint rule flags any function called `use`, so the download reader parameter is `read`.

## Spec amendments (taken in this plan)

Task 9 Step 2 records these in the spec as §15. **Confirm them with the user before starting Task 1** if they have not been approved yet.

- **A. One step per source.** FTN and participation are their own steps and tables, joined to play-by-play by the `plays` view instead of in the worker. Plan V's per-source due-ness inside one step goes away.
- **B. Table set.**
  - QBR is two tables (`src_qbr_week`, `src_qbr_season`).
  - Depth charts are `src_depth_charts` (weekly, through 2024) and `src_depth_chart_snapshots` (2025+), unified by the `depth_chart_week` view.
  - `src_ff_opportunity_team` is not created: the team totals stay as `*_team` columns of `src_ff_opportunity`, and Plan Y derives team rows.
  - `src_sleeper_players` and `play_players` are added.
- **C. Standard columns are few.** `season`, `season_type`, and team codes normalised in place. Id columns keep their published names (no `player_key` / `key_type`). ESPN's nickname column moves to `team_name`.
- **D. Zeros are kept. Types widen** when a season disagrees: numbers to `DOUBLE`, anything else to `VARCHAR`. The step message names the column.
- **E. Play-by-play keeps 234 of 372 columns** (spec said ~120). Dropped by pattern: running home/away totals, home/away/defense win-probability copies, score-type probabilities, clock strings, names and jerseys, per-tackler team columns, game-level copies already in `games`. `desc` is kept.
- **F. `play_players`** has about 2.9 rows per play. Its roles are listed in the reference doc.
- **G. Identity.**
  - `sleeper_ids`: crosswalk, then rosters, then a name + position-group match among nflverse players active that season, only when unique.
  - `combine_ids`: PFR id, then name + draft year, then name + rookie season.
  - The name key canonicalises nicknames and position groups (OL, DL, LB, DB). The fantasy resolver in `companion.db` uses the same key (audit fix 4).
- **H. Engine settings.** `memory_limit` 512 MB, 2 threads, `preserve_insertion_order` off. The backfill peaks at about 2 GB of process memory.
- **I. Logging.**
  - Steps log as `stats:<source>[:<season>]`.
  - `stats:state` logs a failed NFL-state fetch; `stats:identity` logs the identity and views rebuild.
  - The status `interrupted` marks steps a closed app left running.
- **J. Retirement.** `warehouse.db` is deleted on the first launch of v0.25.0, since nothing read it. Stats refresh at launch when no league exists, and after every refresh or import otherwise.
- **K. CI.** `--stats-self-test=<file>`, a `Package check` workflow (push a `check/**` branch), and a self-test step in the Release workflow.

## Global Constraints

- **Branch** `feat/stats-duckdb-x` off `main`.
- **Commits.** One Conventional Commit per "Commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- **Never stage these.** The working tree has unrelated changes that are not part of this plan: `.gitignore`, `.design-sync/`, `docs/design/FantasyCompanion UI/`, `docs/research/nfl_predictive_metrics.md:Zone.Identifier`, `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts` and `tsconfig.web.tsbuildinfo`. Stage files by name; never run `git add -A` or `git add .`.
- **Formatting and lint.**
  - Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`.**
  - Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
  - Typecheck with `npm run typecheck`.
- **Copy the code exactly.** Every code block below was run as written: Tasks 1–7 were replayed in this order on a clean copy of `main`, with typecheck, lint and the full suite green after each task. The final tree is byte-identical to the prototype.
- **Scope.**
  - Storage only. The fantasy pipeline (`companion.db`, scoring, values, lineup, trade, waivers, UI) does not change, except the identity name key (Task 5).
  - Nothing outside `src/main/stats/` reads `stats.duckdb`.
- **Network.** No test touches the network. Only the throwaway live checks in Task 8 do, and they are never committed.
- **Gates.**
  - **Task 1:** the Package check workflow is green on Windows.
  - **Task 8:** every line of the live script, which ends with `ALL GATES PASSED`.
  - If a gate fails, stop and report the numbers to the user.
- **Release** `v0.25.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push** (the `check/plan-x` branch in Task 1, `main` and the tag in Task 10).
- **Not GUI-verifiable here** (WSLg): nothing in this plan changes the window. Say so in the Status block.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **The packaged Windows app cannot load DuckDB.** That would be the first native module, and if it fails the whole stats section is off. → Task 1: the self-test in the packaged Linux build locally, and the Package check workflow on Windows before anything else. The Release workflow keeps the check (Task 1).
2. **A failed load leaves half a season.** → Task 2, "keeps the old rows when the load fails". Each source × season replaces its rows in one transaction.
3. **A source changes shape between seasons**, adding, retyping or duplicating a column. → Task 2, "adds new columns and widens a column whose type changed" and "lets an all-NULL column fit an existing one"; Task 6, "derives the season type from game types, once even when the file has the column" and "stores play-by-play without the dropped columns" (team columns the file lacks are not invented).
4. **Old team codes split a franchise** (audit fix 2). → Task 1 macro test; Task 6 source tests; Task 8 gate.
5. **A wrong Sleeper ↔ gsis link.** Every later dashboard would show someone else's stats. → Task 5: name matches need a unique candidate active that season ("Chris Jones" is ambiguous and stays unmapped); the crosswalk wins over names.
6. **Memory and disk on the user's PC.** → `StatsDb` settings (Task 1), measured in Task 8 (peak ≤ about 2 GB, file ≤ 400 MB, stable under daily refreshes).
7. **Deleting `warehouse.db`.** Nothing reads it (Task 7 removes the only code that did), and the stats backfill rebuilds everything in 2–3 minutes in the background.
8. **No league, no data.** The stats sync must start on a fresh install. → Task 7 launch path; Task 8 Step 3 (packaged app on an empty profile).
9. **Steps left `running` by a closed app** (audit). → Task 1, "marks steps a closed app left running as interrupted".

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/stats-duckdb-x
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/stats-duckdb-x`.

---

### Task 1: DuckDB in a stats worker, and the Windows gate (spec §2, §3.3)

This task adds the dependency, the database wrapper and its bootstrap, the worker and its client, and `--stats-self-test`. It also adds the CI steps that run the self-test on the packaged Windows build. The service only self-tests for now; Task 7 gives it the sync.

**Files:**

- Modify: `package.json`, `package-lock.json` (via npm), `electron.vite.config.ts`, `electron-builder.yml`, `src/main/index.ts`, `.github/workflows/release.yml`
- Create: `src/main/stats/db.ts`, `src/main/stats/schema.ts`, `src/main/stats/protocol.ts`, `src/main/stats/service.ts`, `src/main/stats/worker.ts`, `src/main/stats/client.ts`, `.github/workflows/package-check.yml`, `tests/fixtures/stats.ts`
- Test: `tests/main/stats/schema.test.ts`, `tests/main/stats/client.test.ts`, `tests/main/stats/service.test.ts`

**Interfaces:**

- Produces (`db.ts`):
  - `class StatsDb`: `static open(path, { memoryLimit?, threads?, tempDirectory? })`, `exec(sql, params?)`, `all<T>(sql, params?)` (bigints become numbers), `get<T>`, `transaction(fn)`, `close()`.
  - `sqlString(value)`, `sqlIdent(name)`; types `Row`, `Params`.
- Produces (`schema.ts`): `TEAM_CODE_FIXES`, `INTERRUPTED_MESSAGE`, `bootstrapStatsDb(db, now): Promise<number>`. It creates the macros `nfl_team(t)` and `season_type_of(g)` and the tables `sync_log` and `source_state`.
- Produces (`protocol.ts`): `StatsLogEntry`, `StatsStepStatus`, `StatsSyncResult`, `RefreshOptions`, `StatsWorkerInit { path, tempDir }`, `SelfTestResult`, `StatsRequest`, `StatsReply`.
- Produces (`client.ts`): `startStatsWorker(init, onStep?, workerPath?): StatsClient { refresh (single-flight), selfTest, close }`, `statsWorkerPath()`.
- Produces (`service.ts`, interim): `openStatsService(init): Promise<StatsService { refresh, selfTest, close }>`.

- [ ] **Step 1: Add the dependency**

```bash
npm install --save @duckdb/node-api@1.5.6-r.1 --no-audit --no-fund
```

Then make the version exact in `package.json`. `"@duckdb/node-api": "^1.5.6-r.1"` becomes `"@duckdb/node-api": "1.5.6-r.1"`, under `dependencies` (not `devDependencies`: electron-vite leaves dependencies out of the bundle, so the native binding loads from `node_modules`). Run `npm install --no-audit --no-fund` once more so the lockfile records the exact version. Expected `package.json` diff:

```diff
--- a/package.json
+++ b/package.json
@@ -27,6 +27,7 @@
     "node": ">=22.13"
   },
   "dependencies": {
+    "@duckdb/node-api": "1.5.6-r.1",
     "@electron-toolkit/utils": "^4.0.0",
     "dompurify": "^3.4.15",
     "electron-updater": "^6.8.9"
```

Check that the lockfile lists `node_modules/@duckdb/node-bindings-win32-x64` (Windows needs it):

```bash
grep -c '"node_modules/@duckdb/node-bindings-win32-x64"' package-lock.json
```

Expected: `1`.

- [ ] **Step 2: Write the failing tests**

Create `tests/fixtures/stats.ts`:

```ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'
import { StatsDb, sqlString } from '@main/stats/db'
import { bootstrapStatsDb } from '@main/stats/schema'

const opened: StatsDb[] = []
const dirs: string[] = []

afterEach(() => {
  for (const db of opened.splice(0)) db.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

/** An in-memory stats database with the macros and bookkeeping tables; closed after the test. */
export async function openTestDb(now = new Date('2026-10-16T12:00:00Z')): Promise<StatsDb> {
  const db = await StatsDb.open(':memory:', { threads: 1, memoryLimit: '256MB' })
  opened.push(db)
  await bootstrapStatsDb(db, now)
  return db
}

/** A temp directory removed after the test. */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ffc-stats-'))
  dirs.push(dir)
  return dir
}

/** Writes `select`'s rows to `<dir>/<name>` as Parquet (or CSV / JSON by extension) and returns the path. */
export async function writeFixture(
  db: StatsDb,
  dir: string,
  name: string,
  select: string
): Promise<string> {
  const path = join(dir, name)
  const format = name.endsWith('.csv')
    ? 'csv, HEADER true'
    : name.endsWith('.json')
      ? 'json, ARRAY true'
      : 'parquet'
  await db.exec(`COPY (${select}) TO ${sqlString(path)} (FORMAT ${format})`)
  return path
}
```

Create `tests/main/stats/schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { INTERRUPTED_MESSAGE, bootstrapStatsDb } from '@main/stats/schema'
import { openTestDb } from '../../fixtures/stats'

describe('bootstrapStatsDb', () => {
  it('normalises team codes and season types', async () => {
    const db = await openTestDb()
    const row = await db.get(
      `SELECT nfl_team('OAK') AS oak, nfl_team('LAR') AS lar, nfl_team('WSH') AS wsh, nfl_team('KC') AS kc,
              season_type_of('WC') AS wc, season_type_of('REG') AS reg, season_type_of('PRE') AS pre`
    )
    expect(row).toEqual({
      oak: 'LV',
      lar: 'LA',
      wsh: 'WAS',
      kc: 'KC',
      wc: 'POST',
      reg: 'REG',
      pre: null
    })
  })

  it('marks steps a closed app left running as interrupted', async () => {
    const db = await openTestDb()
    await db.exec(
      "INSERT INTO sync_log (source, started_at, status) VALUES ('stats:pbp:2026', '2026-10-14T20:23:31Z', 'running')"
    )
    expect(await bootstrapStatsDb(db, new Date('2026-10-16T12:00:00Z'))).toBe(1)
    expect(await db.get('SELECT status, finished_at, message FROM sync_log')).toEqual({
      status: 'interrupted',
      finished_at: '2026-10-16T12:00:00.000Z',
      message: INTERRUPTED_MESSAGE
    })
  })
})
```

Create `tests/main/stats/client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEmitter } from 'node:events'
import { startStatsWorker } from '@main/stats/client'
import type { StatsRequest } from '@main/stats/protocol'

type FakeWorker = EventEmitter & { posted: StatsRequest[]; terminated: boolean; options: unknown }

const { workers } = vi.hoisted(() => ({ workers: [] as FakeWorker[] }))

/** A worker that never runs: the test answers its messages. */
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  class Worker extends EventEmitter {
    posted: unknown[] = []
    terminated = false
    constructor(
      _path: string,
      public options: unknown
    ) {
      super()
      workers.push(this as unknown as FakeWorker)
    }
    postMessage(message: unknown): void {
      this.posted.push(message)
    }
    terminate(): Promise<number> {
      this.terminated = true
      return Promise.resolve(0)
    }
  }
  return { Worker }
})

beforeEach(() => {
  workers.length = 0
})

const INIT = { path: '/data/stats.duckdb', tempDir: '/data/stats-tmp' }
const RESULT = { steps: [] }

describe('startStatsWorker', () => {
  it('starts the worker on the database path and answers a request by id', async () => {
    const client = startStatsWorker(INIT, undefined, '/out/statsWorker.js')
    const worker = workers[0]
    expect(worker.options).toEqual({ workerData: INIT })
    const pending = client.refresh({ force: true })
    expect(worker.posted).toEqual([{ id: 1, kind: 'refresh', options: { force: true } }])
    worker.emit('message', { kind: 'reply', id: 1, ok: true, result: RESULT })
    await expect(pending).resolves.toEqual(RESULT)
  })

  it('runs one refresh at a time', async () => {
    const client = startStatsWorker(INIT, undefined, 'w.js')
    const first = client.refresh()
    const second = client.refresh()
    expect(second).toBe(first)
    expect(workers[0].posted).toHaveLength(1)
    workers[0].emit('message', { kind: 'reply', id: 1, ok: true, result: RESULT })
    await first
    client.refresh()
    expect(workers[0].posted).toHaveLength(2)
  })

  it('forwards step progress and rejects a failed request', async () => {
    const steps: string[] = []
    const client = startStatsWorker(INIT, (e) => steps.push(e.source), 'w.js')
    const pending = client.selfTest()
    workers[0].emit('message', { kind: 'step', entry: { source: 'stats:pbp:2026' } })
    workers[0].emit('message', { kind: 'reply', id: 1, ok: false, error: 'disk full' })
    await expect(pending).rejects.toThrow('disk full')
    expect(steps).toEqual(['stats:pbp:2026'])
  })

  it('rejects pending and later requests once the database cannot open', async () => {
    const client = startStatsWorker(INIT, undefined, 'w.js')
    const pending = client.selfTest()
    workers[0].emit('message', { kind: 'fatal', error: 'IO Error: locked' })
    await expect(pending).rejects.toThrow('stats database: IO Error: locked')
    await expect(client.refresh()).rejects.toThrow('stats database: IO Error: locked')
  })

  it('rejects pending requests when the worker exits', async () => {
    const client = startStatsWorker(INIT, undefined, 'w.js')
    const pending = client.selfTest()
    workers[0].emit('exit', 1)
    await expect(pending).rejects.toThrow('the stats worker stopped (exit 1)')
  })

  it('closes the database before ending the worker', async () => {
    const client = startStatsWorker(INIT, undefined, 'w.js')
    const closing = client.close()
    expect(workers[0].posted).toEqual([{ id: 1, kind: 'close' }])
    workers[0].emit('message', { kind: 'reply', id: 1, ok: true, result: null })
    await closing
    expect(workers[0].terminated).toBe(true)
  })
})
```

Create `tests/main/stats/service.test.ts`:

```ts
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openStatsService } from '@main/stats/service'
import { tempDir } from '../../fixtures/stats'

describe('openStatsService', () => {
  it('opens the file, bootstraps it and passes the self-test (stats-analysis spec §3.3)', async () => {
    const dir = tempDir()
    const service = await openStatsService({
      path: join(dir, 'stats.duckdb'),
      tempDir: join(dir, 'tmp')
    })
    try {
      const result = await service.selfTest()
      expect(result).toMatchObject({ rows: 1000, parquet: true })
      expect(result.duckdb).toMatch(/^v1\./)
    } finally {
      service.close()
    }
  })
})
```

Run: `npx vitest run tests/main/stats`

Expected: FAIL, because the `@main/stats/*` modules do not exist.

- [ ] **Step 3: The database wrapper and its bootstrap**

Create `src/main/stats/db.ts`:

```ts
import { DuckDBInstance, type DuckDBConnection, type DuckDBValue } from '@duckdb/node-api'

export type Row = Record<string, unknown>
export type Params = DuckDBValue[]

export interface StatsDbOptions {
  /** DuckDB's buffer limit; 512 MB loads every source (smaller fails on play-by-play). */
  memoryLimit?: string
  threads?: number
  /** Where DuckDB spills large sorts and joins; its default is beside the file. */
  tempDirectory?: string
}

/** BIGINT results arrive as bigint; every count and sum here fits a double. */
function plain(value: unknown): unknown {
  return typeof value === 'bigint' ? Number(value) : value
}

/**
 * The stats database (stats-analysis spec §2–§4): one DuckDB file, opened by one thread (the stats
 * worker). `exec` and `all` run on one connection, so statements are serialised; `transaction`
 * wraps a body in BEGIN / COMMIT and rolls back on a throw.
 */
export class StatsDb {
  private constructor(
    private readonly instance: DuckDBInstance,
    private readonly conn: DuckDBConnection
  ) {}

  static async open(path: string, options: StatsDbOptions = {}): Promise<StatsDb> {
    const config: Record<string, string> = {
      memory_limit: options.memoryLimit ?? '512MB',
      threads: String(options.threads ?? 2),
      // Large inserts need not keep the source order, which lets DuckDB stream them in less memory.
      preserve_insertion_order: 'false',
      // Never download an extension at run time: parquet, json and icu are built in.
      autoinstall_known_extensions: 'false'
    }
    if (options.tempDirectory) config.temp_directory = options.tempDirectory
    const instance = await DuckDBInstance.create(path, config)
    return new StatsDb(instance, await instance.connect())
  }

  async exec(sql: string, params?: Params): Promise<void> {
    await this.conn.run(sql, params)
  }

  async all<T extends object = Row>(sql: string, params?: Params): Promise<T[]> {
    const reader = await this.conn.runAndReadAll(sql, params)
    return reader
      .getRowObjectsJS()
      .map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, plain(v)])) as T)
  }

  async get<T extends object = Row>(sql: string, params?: Params): Promise<T | null> {
    return (await this.all<T>(sql, params))[0] ?? null
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.exec('BEGIN TRANSACTION')
    try {
      const result = await fn()
      await this.exec('COMMIT')
      return result
    } catch (err) {
      try {
        await this.exec('ROLLBACK')
      } catch {
        // already rolled back by DuckDB; keep the original error
      }
      throw err
    }
  }

  close(): void {
    this.conn.closeSync()
    this.instance.closeSync()
  }
}

/** A SQL string literal ('it''s'), for paths and names that cannot be bound as parameters. */
export function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/** A quoted identifier ("column"), for column names read from a file's header. */
export function sqlIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`
}
```

Create `src/main/stats/schema.ts`:

```ts
import type { StatsDb } from './db'

/**
 * Team codes the sources spell differently from nflverse today (stats-analysis spec §4.3, audit
 * fix 2): relocated franchises take their current code, so a franchise is one team in every season.
 */
export const TEAM_CODE_FIXES: Record<string, string> = {
  OAK: 'LV',
  SD: 'LAC',
  STL: 'LA',
  LAR: 'LA',
  WSH: 'WAS',
  JAC: 'JAX'
}

const teamCase = Object.entries(TEAM_CODE_FIXES)
  .map(([from, to]) => `WHEN '${from}' THEN '${to}'`)
  .join(' ')

/**
 * Created on every open, so a new version replaces them. The tables keep their rows across
 * versions: `sync_log` is the stats steps' own log (status adds `interrupted`), `source_state`
 * what each source holds per season (season 0 = an all-seasons file).
 */
const BOOTSTRAP = [
  `CREATE OR REPLACE MACRO nfl_team(t) AS CASE t ${teamCase} ELSE t END`,
  // nflverse season types and game types (WC / DIV / CON / SB); preseason and unknown are NULL.
  `CREATE OR REPLACE MACRO season_type_of(g) AS
     CASE WHEN g = 'REG' THEN 'REG' WHEN g IN ('POST', 'WC', 'DIV', 'CON', 'SB') THEN 'POST' END`,
  'CREATE SEQUENCE IF NOT EXISTS sync_log_id',
  `CREATE TABLE IF NOT EXISTS sync_log (
     id BIGINT PRIMARY KEY DEFAULT nextval('sync_log_id'),
     source VARCHAR NOT NULL,
     started_at VARCHAR NOT NULL,
     finished_at VARCHAR,
     status VARCHAR NOT NULL,
     message VARCHAR,
     rows_written BIGINT NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS source_state (
     source VARCHAR NOT NULL,
     season INTEGER NOT NULL,
     version INTEGER NOT NULL,
     rows_written BIGINT NOT NULL,
     fetched_at VARCHAR NOT NULL,
     sealed BOOLEAN NOT NULL,
     PRIMARY KEY (source, season)
   )`
]

export const INTERRUPTED_MESSAGE = 'The app closed during this step'

/**
 * Creates the macros and bookkeeping tables, then marks steps a closed app left `running` as
 * `interrupted` (coverage audit 2026-10-14). Returns how many rows it marked.
 */
export async function bootstrapStatsDb(db: StatsDb, now: Date): Promise<number> {
  for (const sql of BOOTSTRAP) await db.exec(sql)
  const stale = await db.get<{ n: number }>(
    "SELECT count(*) AS n FROM sync_log WHERE status = 'running'"
  )
  await db.exec(
    "UPDATE sync_log SET status = 'interrupted', finished_at = ?, message = ? WHERE status = 'running'",
    [now.toISOString(), INTERRUPTED_MESSAGE]
  )
  return stale?.n ?? 0
}
```

- [ ] **Step 4: The worker, its protocol and its client**

Create `src/main/stats/protocol.ts`:

```ts
export type StatsStepStatus = 'ok' | 'error' | 'skipped' | 'running' | 'interrupted'

/** One row of `stats.duckdb`'s own `sync_log`. */
export interface StatsLogEntry {
  id: number
  source: string
  startedAt: string
  finishedAt: string | null
  status: StatsStepStatus
  message: string | null
  rowsWritten: number
}

export interface StatsSyncResult {
  steps: StatsLogEntry[]
}

export interface RefreshOptions {
  /** Re-fetch the current season and all-seasons files even within a day of the last attempt. */
  force?: boolean
}

/** What the stats worker is started with. */
export interface StatsWorkerInit {
  /** `stats.duckdb` (stats-analysis spec §4). */
  path: string
  /** Downloads and DuckDB's spill files. */
  tempDir: string
}

export interface SelfTestResult {
  duckdb: string
  rows: number
  parquet: boolean
}

export type StatsRequest =
  | { id: number; kind: 'refresh'; options: RefreshOptions }
  | { id: number; kind: 'selfTest' }
  | { id: number; kind: 'close' }

export type StatsReply =
  | { kind: 'reply'; id: number; ok: true; result: unknown }
  | { kind: 'reply'; id: number; ok: false; error: string }
  | { kind: 'step'; entry: StatsLogEntry }
  /** The database could not be opened; the worker exits after sending it. */
  | { kind: 'fatal'; error: string }
```

Create `src/main/stats/service.ts`. It is the interim version: Task 7 replaces it with the one that runs the sync.

```ts
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { sqlString, StatsDb } from './db'
import type { RefreshOptions, SelfTestResult, StatsSyncResult, StatsWorkerInit } from './protocol'
import { bootstrapStatsDb } from './schema'

/** The worker's state: the open database and what a refresh needs. Runnable in-process for tests. */
export interface StatsService {
  refresh(options: RefreshOptions): Promise<StatsSyncResult>
  selfTest(): Promise<SelfTestResult>
  close(): void
}

export async function openStatsService(init: StatsWorkerInit): Promise<StatsService> {
  mkdirSync(init.tempDir, { recursive: true })
  const db = await StatsDb.open(init.path, { tempDirectory: join(init.tempDir, 'duckdb') })
  await bootstrapStatsDb(db, new Date())
  return {
    // The sync is wired in Task 7; until then a refresh writes nothing.
    refresh: async () => ({ steps: [] }),
    /** Stats-analysis spec §3.3: write, read, and a Parquet round trip through the real file. */
    async selfTest() {
      await db.exec('CREATE OR REPLACE TABLE self_test AS SELECT range AS x FROM range(1000)')
      const parquetPath = join(init.tempDir, 'self-test.parquet')
      await db.exec(`COPY self_test TO ${sqlString(parquetPath)} (FORMAT parquet)`)
      const back = await db.get<{ n: number }>(
        `SELECT count(*) AS n FROM read_parquet(${sqlString(parquetPath)})`
      )
      const version = await db.get<{ v: string }>('SELECT version() AS v')
      await db.exec('DROP TABLE self_test')
      return { duckdb: version?.v ?? '?', rows: back?.n ?? 0, parquet: back?.n === 1000 }
    },
    close: () => db.close()
  }
}
```

Create `src/main/stats/worker.ts`. It is also interim: Task 7 passes the step reporter.

```ts
import { parentPort, workerData } from 'node:worker_threads'
import type { StatsReply, StatsRequest, StatsWorkerInit } from './protocol'
import { openStatsService, type StatsService } from './service'

/**
 * Worker entry, bundled to `out/main/statsWorker.js` (stats-analysis spec §2): the only thread that
 * opens `stats.duckdb`. Requests run one after another, in arrival order.
 */
const port = parentPort
if (!port) throw new Error('statsWorker must run as a worker thread')
const post = (reply: StatsReply): void => port.postMessage(reply)

let queue: Promise<unknown> = Promise.resolve()
let service: StatsService | null = null

async function handle(request: StatsRequest): Promise<unknown> {
  if (!service) throw new Error('the stats database is not open')
  switch (request.kind) {
    case 'refresh':
      return service.refresh(request.options)
    case 'selfTest':
      return service.selfTest()
    case 'close':
      service.close()
      service = null
      return null
  }
}

openStatsService(workerData as StatsWorkerInit).then(
  (opened) => {
    service = opened
    port.on('message', (request: StatsRequest) => {
      queue = queue.then(async () => {
        try {
          post({ kind: 'reply', id: request.id, ok: true, result: await handle(request) })
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          post({ kind: 'reply', id: request.id, ok: false, error })
        }
        if (request.kind === 'close') port.close()
      })
    })
  },
  (err: unknown) => {
    post({ kind: 'fatal', error: err instanceof Error ? err.message : String(err) })
    port.close()
  }
)
```

Create `src/main/stats/client.ts`:

```ts
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import { singleFlight } from '@main/sync/background'
import type {
  RefreshOptions,
  SelfTestResult,
  StatsLogEntry,
  StatsReply,
  StatsRequest,
  StatsSyncResult,
  StatsWorkerInit
} from './protocol'

/** The main process's handle on the stats worker (stats-analysis spec §2). */
export interface StatsClient {
  /** One refresh at a time: a call while one runs returns that run. */
  refresh(options?: RefreshOptions): Promise<StatsSyncResult>
  selfTest(): Promise<SelfTestResult>
  /** Closes the database and ends the worker. */
  close(): Promise<void>
}

/** Bundled beside the main entry by `electron.vite.config.ts`. */
export function statsWorkerPath(): string {
  return join(__dirname, 'statsWorker.js')
}

type Pending = { resolve: (value: unknown) => void; reject: (err: Error) => void }

export function startStatsWorker(
  init: StatsWorkerInit,
  onStep: (entry: StatsLogEntry) => void = () => {},
  workerPath: string = statsWorkerPath()
): StatsClient {
  const worker = new Worker(workerPath, { workerData: init })
  const pending = new Map<number, Pending>()
  let nextId = 1
  let dead: Error | null = null

  const fail = (err: Error): void => {
    dead ??= err
    for (const p of pending.values()) p.reject(dead)
    pending.clear()
  }
  worker.on('message', (reply: StatsReply) => {
    if (reply.kind === 'step') return onStep(reply.entry)
    if (reply.kind === 'fatal') return fail(new Error(`stats database: ${reply.error}`))
    const p = pending.get(reply.id)
    if (!p) return
    pending.delete(reply.id)
    if (reply.ok) p.resolve(reply.result)
    else p.reject(new Error(reply.error))
  })
  worker.on('error', (err) => fail(err))
  worker.on('exit', (code) => fail(new Error(`the stats worker stopped (exit ${code})`)))

  function request<T>(make: (id: number) => StatsRequest): Promise<T> {
    if (dead) return Promise.reject(dead)
    const id = nextId++
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      worker.postMessage(make(id))
    })
  }

  return {
    refresh: singleFlight((options: RefreshOptions = {}) =>
      request<StatsSyncResult>((id) => ({ id, kind: 'refresh', options }))
    ),
    selfTest: () => request<SelfTestResult>((id) => ({ id, kind: 'selfTest' })),
    async close() {
      if (dead) return
      await request((id) => ({ id, kind: 'close' })).catch(() => undefined)
      await worker.terminate()
    }
  }
}
```

Run: `npx vitest run tests/main/stats`

Expected: PASS (`schema`, `client`, `service`).

- [ ] **Step 5: Bundle the worker, unpack the binding, add the self-test flag**

In `electron.vite.config.ts`, add the worker entry (the warehouse worker stays until Task 7):

```diff
--- a/electron.vite.config.ts
+++ b/electron.vite.config.ts
@@ -11,12 +11,14 @@
     build: {
       rollupOptions: {
         external: ['node:sqlite'],
-        // The trade and waiver searches (6b / 6c spec §6) and the play-by-play aggregation
-        // (stats-warehouse spec §6.1) run in worker threads, bundled beside the main entry.
+        // The trade and waiver searches (6b / 6c spec §6), the play-by-play aggregation
+        // (stats-warehouse spec §6.1) and the stats database (stats-analysis spec §2) run in
+        // worker threads, bundled beside the main entry.
         input: {
           index: resolve('src/main/index.ts'),
           engineWorker: resolve('src/main/engine/worker.ts'),
-          warehouseWorker: resolve('src/main/warehouse/worker.ts')
+          warehouseWorker: resolve('src/main/warehouse/worker.ts'),
+          statsWorker: resolve('src/main/stats/worker.ts')
         }
       }
     }
```

In `electron-builder.yml`, unpack DuckDB's binding and leave out the Linux musl build:

```diff
--- a/electron-builder.yml
+++ b/electron-builder.yml
@@ -12,8 +12,12 @@
   - '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,dev-app-update.yml,CHANGELOG.md,README.md}'
   - '!{.env,.env.*,.npmrc,pnpm-lock.yaml,.nvmrc,components.json}'
   - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
+  # DuckDB ships a musl build beside the glibc one on Linux; the app only loads the glibc one.
+  - '!node_modules/@duckdb/node-bindings-*-musl/**'
 asarUnpack:
   - resources/**
+  # DuckDB's native binding and library load from disk, not from inside the asar.
+  - node_modules/@duckdb/node-bindings-*/**
 win:
   executableName: FantasyCompanion
   target:
```

In `src/main/index.ts`, add `--stats-self-test`:

```diff
--- a/src/main/index.ts
+++ b/src/main/index.ts
@@ -1,4 +1,6 @@
 import { app, BrowserWindow, dialog, shell } from 'electron'
+import { rmSync, writeFileSync } from 'node:fs'
+import { tmpdir } from 'node:os'
 import { join } from 'path'
 import { electronApp, is, optimizer } from '@electron-toolkit/utils'
 import { autoUpdater } from 'electron-updater'
@@ -15,6 +17,7 @@
 import { createSleeperClient } from '@main/sources/sleeper'
 import { createWarehouseClient } from '@main/sources/warehouse/client'
 import { createSleeperNewsClient } from '@main/sources/sleeperNews'
+import { startStatsWorker } from '@main/stats/client'
 import { installAutoUpdater } from '@main/updater'
 import { IPC } from '@shared/ipc'

@@ -83,7 +86,37 @@
   }
 }

-app.whenReady().then(() => {
+/**
+ * `--stats-self-test=<file>` (stats-analysis spec §3.3): the packaged app opens a throwaway stats
+ * database in the worker, writes, reads and round-trips Parquet, writes the result as JSON to
+ * `<file>`, and exits 0 on success. CI runs it on the Windows build.
+ */
+const SELF_TEST_FLAG = '--stats-self-test='
+
+async function runStatsSelfTest(out: string): Promise<number> {
+  const dir = join(tmpdir(), `ffc-stats-self-test-${process.pid}`)
+  let result: object
+  let code = 1
+  try {
+    const client = startStatsWorker({ path: join(dir, 'stats.duckdb'), tempDir: dir })
+    const test = await client.selfTest()
+    await client.close()
+    code = test.parquet && test.rows === 1000 ? 0 : 1
+    result = { ok: code === 0, ...test }
+  } catch (err) {
+    result = { ok: false, error: err instanceof Error ? err.message : String(err) }
+  }
+  writeFileSync(out, JSON.stringify(result))
+  rmSync(dir, { recursive: true, force: true })
+  return code
+}
+
+app.whenReady().then(async () => {
+  const selfTest = process.argv.find((a) => a.startsWith(SELF_TEST_FLAG))
+  if (selfTest) {
+    app.exit(await runStatsSelfTest(selfTest.slice(SELF_TEST_FLAG.length)))
+    return
+  }
   electronApp.setAppUserModelId('com.yhabie.fantasycompanion')
   app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

```

- [ ] **Step 6: Run the self-test in CI**

Create `.github/workflows/package-check.yml`:

```yaml
name: Package check

# Stats-analysis spec §3.3: builds the Windows app without releasing it and runs the packaged
# stats self-test. Push any branch named check/** (or run it by hand) to try a change on Windows
# before tagging a release.
on:
  workflow_dispatch:
  push:
    branches: ['check/**']

jobs:
  windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version-file: .nvmrc
          cache: npm

      - run: npm ci
      - run: npm test
      - run: npm run build

      - name: Package (unpacked)
        run: npx electron-builder --win --dir --publish never

      - name: Check the stats database in the packaged app
        shell: bash
        timeout-minutes: 5
        run: |
          ./dist/win-unpacked/FantasyCompanion.exe --stats-self-test="$RUNNER_TEMP/stats-self-test.json"
          cat "$RUNNER_TEMP/stats-self-test.json"
          grep -q '"ok":true' "$RUNNER_TEMP/stats-self-test.json"
```

In `.github/workflows/release.yml`, check the packaged app before the release files:

```diff
--- a/.github/workflows/release.yml
+++ b/.github/workflows/release.yml
@@ -38,6 +38,16 @@
       - name: Package
         run: npx electron-builder --win --publish never

+      # Stats-analysis spec §3.3: the packaged app must load DuckDB in its worker (native binding
+      # unpacked from the asar), write, read and round-trip Parquet.
+      - name: Check the stats database in the packaged app
+        shell: bash
+        timeout-minutes: 5
+        run: |
+          ./dist/win-unpacked/FantasyCompanion.exe --stats-self-test="$RUNNER_TEMP/stats-self-test.json"
+          cat "$RUNNER_TEMP/stats-self-test.json"
+          grep -q '"ok":true' "$RUNNER_TEMP/stats-self-test.json"
+
       - name: Check release files
         shell: bash
         run: ls -l dist/FantasyCompanion-Setup-*.exe dist/FantasyCompanion-Setup-*.exe.blockmap dist/latest.yml
```

- [ ] **Step 7: Verify locally, including a packaged Linux build**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
```

Expected: typecheck and lint clean; **886 passed, 5 skipped**.

```bash
npx electron-vite build && npx electron-builder --linux dir --publish never
ls dist/linux-unpacked/resources/app.asar.unpacked/node_modules/@duckdb/
dist/linux-unpacked/fantasy-football-companion --stats-self-test=/tmp/ffc-self-test.json; echo "exit $?"; cat /tmp/ffc-self-test.json
```

Expected:

- The `ls` shows `node-bindings-linux-x64`.
- The self-test prints `exit 0` and `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true}`.
- GPU / dbus / sandbox warnings on stderr are WSLg noise.
- `dist/` is gitignored; leave it.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/main/stats tests/fixtures/stats.ts tests/main/stats src/main/index.ts electron.vite.config.ts electron-builder.yml .github/workflows/release.yml .github/workflows/package-check.yml package.json
git add package.json package-lock.json electron.vite.config.ts electron-builder.yml src/main/index.ts src/main/stats tests/fixtures/stats.ts tests/main/stats
git commit -m "feat(stats): open DuckDB in a stats worker"
git add .github/workflows/release.yml .github/workflows/package-check.yml
git commit -m "ci: run the packaged stats self-test"
```

- [ ] **Step 9: GATE — the packaged Windows build**

**Ask the user before pushing.** Then:

```bash
git push origin HEAD:check/plan-x
gh run list --workflow "Package check" --branch check/plan-x --limit 1
gh run watch "$(gh run list --workflow 'Package check' --branch check/plan-x --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

Expected:

- The run is green, and its "Check the stats database in the packaged app" step prints `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true}`.
- The step runs `npm test` on Windows first, so the DuckDB tests pass there too.
- If it fails, **stop**. Report the step log to the user (`gh run view --log-failed`). Do not build further on DuckDB.
- If it is green: `git push origin --delete check/plan-x`.

---

### Task 2: The loader (spec §4.1)

One function loads any source: it evolves the table to the incoming columns, then replaces one season's rows (or all rows) in a transaction. `standardSelect` builds the select that normalises the standard columns.

**Files:**

- Create: `src/main/stats/load.ts`
- Test: `tests/main/stats/load.test.ts`

**Interfaces:**

- Produces:
  - `type Columns = Map<string, string>`
  - `describe(db, select): Promise<Columns>`
  - `standardSelect(from, have, standard, exclude?, where?): string`
  - `widerType(a, b)`
  - `evolveTable(db, table, incoming): Promise<string[]>`
  - `replaceRows(db, table, season | null, select): Promise<{ rows, widened }>`

- [ ] **Step 1: Write the failing test**

Create `tests/main/stats/load.test.ts`:

```ts
import { describe as group, expect, it } from 'vitest'
import { describe, replaceRows, standardSelect, widerType } from '@main/stats/load'
import { openTestDb, tempDir, writeFixture } from '../../fixtures/stats'

group('standardSelect', () => {
  const have = new Map([
    ['team', 'VARCHAR'],
    ['game_type', 'VARCHAR'],
    ['name', 'VARCHAR']
  ])

  it('replaces columns the file has, adds the others and drops excluded ones', () => {
    const sql = standardSelect(
      "'f.parquet'",
      have,
      { team: 'nfl_team(team)', season_type: 'season_type_of(game_type)' },
      (c) => c === 'name',
      'season >= 2019'
    )
    expect(sql).toBe(
      `SELECT * EXCLUDE ("name") REPLACE (nfl_team(team) AS "team"), season_type_of(game_type) AS "season_type" FROM 'f.parquet' WHERE season >= 2019`
    )
  })

  it('never excludes a standard column', () => {
    expect(standardSelect('t', have, { team: 'team' }, () => true)).toBe(
      'SELECT * EXCLUDE ("game_type", "name") REPLACE (team AS "team") FROM t'
    )
  })
})

group('widerType', () => {
  it('keeps numbers numeric and falls back to text', () => {
    expect(widerType('INTEGER', 'DOUBLE')).toBe('DOUBLE')
    expect(widerType('BIGINT', 'DECIMAL(18,3)')).toBe('DOUBLE')
    expect(widerType('INTEGER', 'VARCHAR')).toBe('VARCHAR')
    expect(widerType('BOOLEAN', 'INTEGER')).toBe('VARCHAR')
  })
})

group('replaceRows', () => {
  it('replaces one season and keeps the others', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const s1 = await writeFixture(
      db,
      dir,
      'a.parquet',
      'SELECT 2024 AS season, 1 AS x UNION ALL SELECT 2024, 2'
    )
    const s2 = await writeFixture(db, dir, 'b.parquet', 'SELECT 2025 AS season, 3 AS x')
    const s1b = await writeFixture(db, dir, 'c.parquet', 'SELECT 2024 AS season, 9 AS x')
    await replaceRows(db, 'src_t', 2024, `SELECT * FROM '${s1}'`)
    await replaceRows(db, 'src_t', 2025, `SELECT * FROM '${s2}'`)
    expect((await replaceRows(db, 'src_t', 2024, `SELECT * FROM '${s1b}'`)).rows).toBe(1)
    expect(await db.all('SELECT season, x FROM src_t ORDER BY season')).toEqual([
      { season: 2024, x: 9 },
      { season: 2025, x: 3 }
    ])
  })

  it('adds new columns and widens a column whose type changed', async () => {
    const db = await openTestDb()
    await replaceRows(db, 'src_t', 2024, 'SELECT 2024 AS season, 1::INTEGER AS x')
    const out = await replaceRows(
      db,
      'src_t',
      2025,
      "SELECT 2025 AS season, 1.5::DOUBLE AS x, 'new' AS y"
    )
    expect(out.widened).toEqual(['x INTEGER → DOUBLE'])
    expect(await db.all('SELECT season, x, y FROM src_t ORDER BY season')).toEqual([
      { season: 2024, x: 1, y: null },
      { season: 2025, x: 1.5, y: 'new' }
    ])
  })

  it('lets an all-NULL column fit an existing one', async () => {
    const db = await openTestDb()
    await replaceRows(db, 'src_t', 2024, "SELECT 2024 AS season, 'WR' AS pos")
    const out = await replaceRows(db, 'src_t', 2025, 'SELECT 2025 AS season, NULL AS pos')
    expect(out.widened).toEqual([])
    expect((await describe(db, 'SELECT * FROM src_t')).get('pos')).toBe('VARCHAR')
  })

  it('replaces every row when the season is null', async () => {
    const db = await openTestDb()
    await replaceRows(db, 'src_t', null, 'SELECT 1 AS season UNION ALL SELECT 2')
    await replaceRows(db, 'src_t', null, 'SELECT 3 AS season')
    expect(await db.all('SELECT season FROM src_t')).toEqual([{ season: 3 }])
  })

  it('keeps the old rows when the load fails', async () => {
    const db = await openTestDb()
    await replaceRows(db, 'src_t', 2024, 'SELECT 2024 AS season, 1 AS x')
    await expect(
      replaceRows(db, 'src_t', 2024, "SELECT 2024 AS season, error('boom')::INTEGER AS x")
    ).rejects.toThrow('boom')
    expect(await db.all('SELECT x FROM src_t')).toEqual([{ x: 1 }])
  })
})
```

Run: `npx vitest run tests/main/stats/load.test.ts`

Expected: FAIL (`@main/stats/load` does not exist).

- [ ] **Step 2: Implement**

Create `src/main/stats/load.ts`:

```ts
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

const NUMERIC =
  /^(TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|FLOAT|DOUBLE|DECIMAL\(\d+,\d+\))$/

/** The type a column takes when two seasons disagree: a number if both are numbers, else text. */
export function widerType(a: string, b: string): string {
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
```

Run: `npx vitest run tests/main/stats/load.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/main/stats/load.ts tests/main/stats/load.test.ts
git add src/main/stats/load.ts tests/main/stats/load.test.ts
git commit -m "feat(stats): load source files into DuckDB"
```

---

### Task 3: Downloads to disk (spec §4.4)

DuckDB reads files from disk, so a download goes to a temp file that is deleted after the read, whatever happens.

**Files:**

- Create: `src/main/stats/download.ts`
- Test: `tests/main/stats/download.test.ts`

**Interfaces:**

- Produces: `StatsHttpError`, `interface Downloads { withFile(url, read), json(url) }`, `createDownloads({ dir, fetchImpl?, timeoutMs?, retryDelayMs? })`. It reuses `fetchBytes` from `@main/sources/http`: one retry on 429 / 5xx, and null on 404.

- [ ] **Step 1: Write the failing test**

Create `tests/main/stats/download.test.ts`:

```ts
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createDownloads } from '@main/stats/download'
import { tempDir } from '../../fixtures/stats'

const respond =
  (status: number, body = ''): typeof fetch =>
  async () =>
    new Response(status === 404 ? null : body, { status })

describe('createDownloads', () => {
  it('hands the file to the reader and deletes it afterwards', async () => {
    const dir = tempDir()
    const downloads = createDownloads({ dir, fetchImpl: respond(200, 'abc') })
    let seen = ''
    const out = await downloads.withFile('https://x/f.parquet', async (path) => {
      expect(path.endsWith('.parquet')).toBe(true)
      seen = readFileSync(path, 'utf8')
      return 7
    })
    expect(out).toBe(7)
    expect(seen).toBe('abc')
    expect(readdirSync(dir)).toEqual([])
  })

  it('deletes the file when the reader throws', async () => {
    const dir = tempDir()
    const downloads = createDownloads({ dir, fetchImpl: respond(200, 'abc') })
    await expect(
      downloads.withFile('https://x/f.csv', async () => {
        throw new Error('bad file')
      })
    ).rejects.toThrow('bad file')
    expect(readdirSync(dir)).toEqual([])
  })

  it('returns null on 404 without calling the reader, and throws on other failures', async () => {
    const dir = `${tempDir()}/never-made`
    const missing = createDownloads({ dir, fetchImpl: respond(404) })
    expect(await missing.withFile('https://x/f.parquet', async () => 1)).toBeNull()
    expect(existsSync(dir)).toBe(false)
    const broken = createDownloads({ dir, fetchImpl: respond(403), retryDelayMs: 0 })
    await expect(broken.withFile('https://x/f.parquet', async () => 1)).rejects.toThrow(
      'HTTP 403 for https://x/f.parquet'
    )
  })

  it('parses JSON and rejects an unreadable body', async () => {
    const ok = createDownloads({ dir: tempDir(), fetchImpl: respond(200, '[1,2]') })
    expect(await ok.json('https://x/s')).toEqual([1, 2])
    const bad = createDownloads({ dir: tempDir(), fetchImpl: respond(200, '<html>') })
    await expect(bad.json('https://x/s')).rejects.toThrow('unreadable JSON from https://x/s')
  })
})
```

Run: `npx vitest run tests/main/stats/download.test.ts`

Expected: FAIL.

- [ ] **Step 2: Implement**

Create `src/main/stats/download.ts`:

```ts
import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fetchBytes, type FetchTextOptions } from '@main/sources/http'

export class StatsHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`HTTP ${status} for ${url}`)
    this.name = 'StatsHttpError'
  }
}

export interface Downloads {
  /**
   * Downloads `url` to a temp file, runs `read` on its path, and deletes the file whatever happens.
   * Returns null without calling `read` when the file is not published (404).
   */
  withFile<T>(url: string, read: (path: string) => Promise<T>): Promise<T | null>
  /** GETs JSON (Sleeper); null on 404. */
  json(url: string): Promise<unknown>
}

export interface DownloadOptions {
  /** Temp files go here; created when missing. */
  dir: string
  fetchImpl?: typeof fetch
  /** Play-by-play is ~20 MB; the default leaves room for a slow connection. */
  timeoutMs?: number
  retryDelayMs?: number
}

/** Stats-analysis spec §4.4: files are Parquet where nflverse publishes it, read from disk by DuckDB. */
export function createDownloads(options: DownloadOptions): Downloads {
  const http: FetchTextOptions = {
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? 120_000,
    retryDelayMs: options.retryDelayMs ?? 2_000
  }
  const error = (status: number, url: string): Error => new StatsHttpError(status, url)
  return {
    async withFile(url, read) {
      const bytes = await fetchBytes(url, http, error)
      if (bytes === null) return null
      mkdirSync(options.dir, { recursive: true })
      const extension = /\.(parquet|csv|json)$/.exec(url)?.[0] ?? ''
      const path = join(options.dir, `${randomUUID()}${extension}`)
      writeFileSync(path, bytes)
      try {
        return await read(path)
      } finally {
        rmSync(path, { force: true })
      }
    },
    async json(url) {
      const bytes = await fetchBytes(url, http, error)
      if (bytes === null) return null
      try {
        return JSON.parse(new TextDecoder().decode(bytes))
      } catch {
        throw new Error(`unreadable JSON from ${url}`)
      }
    }
  }
}
```

Run: `npx vitest run tests/main/stats/download.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/main/stats/download.ts tests/main/stats/download.test.ts
git add src/main/stats/download.ts tests/main/stats/download.test.ts
git commit -m "feat(stats): download source files to disk"
```

---

### Task 4: The plays and depth-chart views (spec §4.2; audit fix 1)

`plays` joins play-by-play, FTN and participation and carries the counting rules as flags. `depth_chart_week` puts both depth-chart formats into one shape and maps 2025+ snapshots to weeks, playoff weeks included.

**Files:**

- Create: `src/main/stats/views.ts`
- Test: `tests/main/stats/views.test.ts`

**Interfaces:**

- Produces: `PLAY_FLAGS` (`counts`, `is_snap`, `is_dropback`, `is_carry`, `is_target` → SQL), `buildViews(db): Promise<string[]>` (the views it built).

- [ ] **Step 1: Write the failing test**

Create `tests/main/stats/views.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildViews } from '@main/stats/views'
import { openTestDb } from '../../fixtures/stats'

/** A play-by-play row: only the columns the flags read, defaults for the rest. */
function play(id: number, over: Record<string, string | number | null>): string {
  const p: Record<string, string | number | null> = {
    game_id: "'g'",
    play_id: id,
    season: 2025,
    week: 1,
    play_type: "'pass'",
    two_point_attempt: 0,
    pass: 0,
    rush: 0,
    qb_kneel: 0,
    qb_spike: 0,
    qb_dropback: 0,
    pass_attempt: 0,
    sack: 0,
    passer_id: 'NULL',
    rusher_player_id: 'NULL',
    receiver_player_id: 'NULL',
    play_deleted: 0,
    ...over
  }
  return `SELECT ${Object.entries(p)
    .map(([k, v]) => `${v}${typeof v === 'number' ? '' : '::VARCHAR'} AS ${k}`)
    .join(', ')}`
}

describe('plays view (stats-analysis spec §4.2)', () => {
  it('carries the counting rules of the warehouse spec §11–§12', async () => {
    const db = await openTestDb()
    await db.exec(
      `CREATE TABLE src_pbp AS ${[
        play(1, {
          pass: 1,
          qb_dropback: 1,
          pass_attempt: 1,
          passer_id: "'qb'",
          receiver_player_id: "'wr'"
        }),
        play(2, {
          pass: 1,
          qb_dropback: 1,
          pass_attempt: 1,
          sack: 1,
          passer_id: "'qb'",
          receiver_player_id: "'wr'"
        }),
        play(3, { play_type: "'run'", rush: 1, rusher_player_id: "'rb'" }),
        play(4, { play_type: "'qb_kneel'", qb_kneel: 1, rusher_player_id: "'qb'" }),
        play(5, { play_type: "'no_play'", rush: 1, rusher_player_id: "'rb'" }),
        play(6, { play_type: "'run'", rush: 1, two_point_attempt: 1, rusher_player_id: "'rb'" }),
        play(7, { play_type: "'run'", rush: 1, rusher_player_id: "'rb'", play_deleted: 1 })
      ].join(' UNION ALL ')}`
    )
    expect(await buildViews(db)).toEqual(['plays'])
    expect(
      await db.all(
        'SELECT play_id, counts, is_snap, is_dropback, is_carry, is_target FROM plays ORDER BY play_id'
      )
    ).toEqual([
      {
        play_id: 1,
        counts: true,
        is_snap: true,
        is_dropback: true,
        is_carry: false,
        is_target: true
      },
      {
        play_id: 2,
        counts: true,
        is_snap: true,
        is_dropback: true,
        is_carry: false,
        is_target: false
      },
      {
        play_id: 3,
        counts: true,
        is_snap: true,
        is_dropback: false,
        is_carry: true,
        is_target: false
      },
      {
        play_id: 4,
        counts: true,
        is_snap: true,
        is_dropback: false,
        is_carry: true,
        is_target: false
      },
      {
        play_id: 5,
        counts: false,
        is_snap: true,
        is_dropback: false,
        is_carry: false,
        is_target: false
      },
      {
        play_id: 6,
        counts: false,
        is_snap: true,
        is_dropback: false,
        is_carry: false,
        is_target: false
      }
    ])
  })

  it('joins FTN and participation on game and play when they exist', async () => {
    const db = await openTestDb()
    await db.exec(`CREATE TABLE src_pbp AS ${play(1, {})} UNION ALL ${play(2, {})}`)
    await db.exec(
      "CREATE TABLE src_ftn AS SELECT 'g' AS game_id, 1 AS play_id, 2025 AS season, 1 AS week, true AS is_play_action"
    )
    await db.exec(
      "CREATE TABLE src_participation AS SELECT 'g' AS game_id, 2 AS play_id, 2025 AS season, 'x' AS old_game_id, true AS was_pressure"
    )
    await buildViews(db)
    expect(
      await db.all('SELECT play_id, is_play_action, was_pressure FROM plays ORDER BY play_id')
    ).toEqual([
      { play_id: 1, is_play_action: true, was_pressure: null },
      { play_id: 2, is_play_action: null, was_pressure: true }
    ])
  })
})

describe('depth_chart_week view (coverage audit fix 1)', () => {
  it('maps snapshots to the last one before each kickoff, playoff weeks included', async () => {
    const db = await openTestDb()
    await db.exec(`CREATE TABLE games AS SELECT * FROM (VALUES
        (2025, 'REG', 18, '2026-01-04', '13:00'),
        (2025, 'WC', 19, '2026-01-10', '16:30'),
        (2025, 'DIV', 20, '2026-01-17', '16:30'),
        (2025, 'CON', 21, '2026-01-25', '15:00')
      ) t(season, game_type, week, gameday, gametime)`)
    await db.exec(`CREATE TABLE src_depth_chart_snapshots AS SELECT * FROM (VALUES
        ('2026-01-03T07:00:00Z', 2025, 'BUF', 'A', '1', 'g1', 'Offense', 'QB', 1),
        ('2026-01-09T07:00:00Z', 2025, 'BUF', 'B', '2', 'g2', 'Offense', 'QB', 1),
        ('2026-01-12T07:00:00Z', 2025, 'BUF', 'C', '3', 'g3', 'Offense', 'QB', 1)
      ) t(dt, season, team, player_name, espn_id, gsis_id, pos_grp, pos_abb, pos_rank)`)
    await buildViews(db)
    // Week 21 kicks off after the latest snapshot and is not the next week, so it is left out.
    expect(
      await db.all('SELECT season_type, week, gsis_id FROM depth_chart_week ORDER BY week')
    ).toEqual([
      { season_type: 'REG', week: 18, gsis_id: 'g1' },
      { season_type: 'POST', week: 19, gsis_id: 'g2' },
      { season_type: 'POST', week: 20, gsis_id: 'g3' }
    ])
  })

  it('keeps the weekly rows of earlier seasons in the same shape', async () => {
    const db = await openTestDb()
    await db.exec(`CREATE TABLE src_depth_charts AS SELECT 2024 AS season, 'POST' AS season_type, 19 AS week,
        'g1' AS gsis_id, 'KC' AS team, 'Pat' AS full_name, 'Offense' AS formation, 'QB' AS depth_position,
        'QB' AS position, '1' AS depth_team`)
    await buildViews(db)
    expect(
      await db.all('SELECT season, week, gsis_id, position, depth FROM depth_chart_week')
    ).toEqual([{ season: 2024, week: 19, gsis_id: 'g1', position: 'QB', depth: 1 }])
  })
})
```

Run: `npx vitest run tests/main/stats/views.test.ts`

Expected: FAIL.

- [ ] **Step 2: Implement**

Create `src/main/stats/views.ts`:

```ts
import type { StatsDb } from './db'

async function existing(db: StatsDb, tables: string[]): Promise<Set<string>> {
  const rows = await db.all<{ table_name: string }>(
    `SELECT table_name FROM duckdb_tables() WHERE schema_name = 'main'
     AND table_name IN (${tables.map(() => '?').join(', ')})`,
    tables
  )
  return new Set(rows.map((r) => r.table_name))
}

/**
 * The counting rules of the warehouse spec §11–§12, as columns of `plays` (stats-analysis spec
 * §4.2). A play `counts` unless a penalty wiped it out or it is a two-point try; a snap counts
 * either way (nflverse's snap counts do).
 */
const COUNTS = "coalesce(p.play_type, '') <> 'no_play' AND coalesce(p.two_point_attempt, 0) = 0"
export const PLAY_FLAGS: Record<string, string> = {
  counts: COUNTS,
  is_snap:
    'coalesce(p.pass, 0) = 1 OR coalesce(p.rush, 0) = 1 OR coalesce(p.qb_kneel, 0) = 1 OR coalesce(p.qb_spike, 0) = 1',
  is_dropback: `(${COUNTS}) AND coalesce(p.qb_dropback, 0) = 1 AND p.passer_id IS NOT NULL`,
  is_carry: `(${COUNTS}) AND (p.play_type = 'run' OR coalesce(p.qb_kneel, 0) = 1) AND p.rusher_player_id IS NOT NULL`,
  is_target: `(${COUNTS}) AND p.receiver_player_id IS NOT NULL AND coalesce(p.pass_attempt, 0) = 1 AND coalesce(p.sack, 0) = 0`
}

/** `plays`: every non-deleted play, with FTN (2022+) and participation columns when published. */
function playsView(have: Set<string>): string | null {
  if (!have.has('src_pbp')) return null
  const parts = ['p.*']
  const joins: string[] = []
  if (have.has('src_ftn')) {
    parts.push('f.* EXCLUDE (game_id, play_id, season, week)')
    joins.push('LEFT JOIN src_ftn f ON f.game_id = p.game_id AND f.play_id = p.play_id')
  }
  if (have.has('src_participation')) {
    parts.push('x.* EXCLUDE (game_id, play_id, season, old_game_id)')
    joins.push('LEFT JOIN src_participation x ON x.game_id = p.game_id AND x.play_id = p.play_id')
  }
  const flags = Object.entries(PLAY_FLAGS).map(([name, expr]) => `(${expr}) AS ${name}`)
  return `CREATE OR REPLACE VIEW plays AS
    SELECT ${[...parts, ...flags].join(',\n           ')}
    FROM src_pbp p ${joins.join(' ')}
    WHERE coalesce(p.play_deleted, 0) = 0`
}

/** Kickoffs in UTC: nflverse lists games in Eastern time. */
const KICKOFFS = `SELECT season, CASE WHEN game_type = 'REG' THEN 'REG' ELSE 'POST' END AS season_type, week,
    min(timezone('America/New_York', strptime(gameday || ' ' || gametime, '%Y-%m-%d %H:%M'))) AS kickoff
  FROM games WHERE gameday IS NOT NULL AND gametime IS NOT NULL GROUP BY ALL`

/**
 * `depth_chart_week`: one row per player × slot × week. Through 2024 nflverse publishes weekly
 * rows; from 2025 timestamped snapshots, where week w takes the last snapshot before its first
 * kickoff, playoff weeks included (coverage audit fix 1). A week kicking off after the latest
 * snapshot is left out, except the next one, which takes the latest.
 */
function depthChartView(have: Set<string>): string | null {
  const weekly = have.has('src_depth_charts')
    ? `SELECT season, season_type, week, gsis_id, NULL::VARCHAR AS espn_id, team, full_name AS player_name,
              formation, coalesce(depth_position, position) AS position, depth_team::INTEGER AS depth,
              NULL::VARCHAR AS snapshot
       FROM src_depth_charts WHERE season_type IS NOT NULL`
    : null
  const snapshots =
    have.has('src_depth_chart_snapshots') && have.has('games')
      ? `SELECT w.season, w.season_type, w.week, d.gsis_id, d.espn_id::VARCHAR AS espn_id, d.team,
                d.player_name, d.pos_grp AS formation, d.pos_abb AS position, d.pos_rank::INTEGER AS depth,
                d.dt AS snapshot
         FROM (SELECT k.season, k.season_type, k.week,
                      (SELECT max(s.taken_at) FROM snaps s WHERE s.season = k.season AND s.taken_at < k.kickoff) AS taken_at
               FROM kick k JOIN latest l USING (season)
               WHERE k.kickoff <= l.taken_at
                  OR k.kickoff = (SELECT min(k2.kickoff) FROM kick k2 WHERE k2.season = k.season AND k2.kickoff > l.taken_at)) w
         JOIN src_depth_chart_snapshots d ON d.season = w.season AND d.dt::TIMESTAMPTZ = w.taken_at`
      : null
  if (weekly === null && snapshots === null) return null
  const ctes = snapshots
    ? `WITH kick AS (${KICKOFFS}),
       snaps AS (SELECT DISTINCT season, dt::TIMESTAMPTZ AS taken_at FROM src_depth_chart_snapshots),
       latest AS (SELECT season, max(taken_at) AS taken_at FROM snaps GROUP BY season)`
    : ''
  const body = [weekly, snapshots].filter((s): s is string => s !== null).join('\nUNION ALL\n')
  return `CREATE OR REPLACE VIEW depth_chart_week AS ${ctes} ${body}`
}

/**
 * (Re)creates the views over the tables that exist; called after every refresh, because a view's
 * `*` is bound when it is created and the tables gain columns.
 */
export async function buildViews(db: StatsDb): Promise<string[]> {
  const have = await existing(db, [
    'src_pbp',
    'src_ftn',
    'src_participation',
    'src_depth_charts',
    'src_depth_chart_snapshots',
    'games'
  ])
  const built: string[] = []
  for (const [name, sql] of [
    ['plays', playsView(have)],
    ['depth_chart_week', depthChartView(have)]
  ] as const) {
    if (sql === null) continue
    await db.exec(sql)
    built.push(name)
  }
  return built
}
```

Run: `npx vitest run tests/main/stats/views.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/main/stats/views.ts tests/main/stats/views.test.ts
git add src/main/stats/views.ts tests/main/stats/views.test.ts
git commit -m "feat(stats): add plays and depth chart views"
```

---

### Task 5: Identity (spec §4.3; audit fixes 3 and 4)

The name key gains nickname canonicalisation and position groups, in the fantasy resolver itself (audit fix 4). The stats identity tables use the same key.

**Files:**

- Modify: `src/main/sync/identity.ts`, `tests/main/sync/identity.test.ts`
- Create: `src/main/stats/identity.ts`
- Test: `tests/main/stats/identity.test.ts`

**Interfaces:**

- Produces (`sync/identity.ts`): `canonicalName(name)`, `positionGroup(position)`, `nameKey(name, position)` (now exported; `indexCrosswalk` / `resolvePlayer` use it).
- Produces (`stats/identity.ts`): `writeTable(db, table, columns, rows)`, `buildIdentity(db): Promise<number>` (the rows of `players`; it also builds `sleeper_ids` and `combine_ids`).

- [ ] **Step 1: Write the failing tests**

Apply to `tests/main/sync/identity.test.ts`:

```diff
--- a/tests/main/sync/identity.test.ts
+++ b/tests/main/sync/identity.test.ts
@@ -1,6 +1,14 @@
 import { describe, expect, it } from 'vitest'
 import { parseCrosswalk } from '@main/sources/nflverse'
-import { normalizeName, resolvePlayer, resolvePlayers, indexCrosswalk } from '@main/sync/identity'
+import {
+  canonicalName,
+  indexCrosswalk,
+  nameKey,
+  normalizeName,
+  positionGroup,
+  resolvePlayer,
+  resolvePlayers
+} from '@main/sync/identity'
 import type { PlayerIdentitySource } from '@main/db/repos/playerIds'
 import { toNflverseTeam } from '@shared/teams'
 import { crosswalkCsv } from '../../fixtures/nflverse'
@@ -30,6 +38,21 @@
   })
 })

+describe('nameKey (coverage audit fix 4)', () => {
+  it('spells out nickname first names and groups line and defensive positions', () => {
+    expect(canonicalName('Matt Hibner')).toBe('matthew hibner')
+    expect(canonicalName('Matthew Hibner')).toBe('matthew hibner')
+    expect(canonicalName('Matt')).toBe('matt')
+    expect(positionGroup('G')).toBe('OL')
+    expect(positionGroup('OL')).toBe('OL')
+    expect(positionGroup('TE')).toBe('TE')
+    expect(positionGroup('DT')).toBe('DL')
+    expect(positionGroup('CB')).toBe('DB')
+    expect(positionGroup('OLB')).toBe('LB')
+    expect(nameKey('Brandon Coleman', 'OL')).toBe(nameKey('Brandon Coleman', 'G'))
+  })
+})
+
 describe('resolvePlayer', () => {
   it('1. crosswalk row by sleeper_id wins and brings pfr/espn ids', () => {
     const r = resolvePlayer(
@@ -116,6 +139,23 @@
     ).toBe('unresolved')
   })

+  it('6. matches a nickname and a line position against nflverse (coverage audit fix 4)', () => {
+    const nflverse = [
+      { gsisId: '00-0040879', name: 'Matthew Hibner', position: 'TE' },
+      { gsisId: '00-0039913', name: 'Brandon Coleman', position: 'G' }
+    ]
+    const withStats = indexCrosswalk(parseCrosswalk(crosswalkCsv).records, nflverse)
+    expect(
+      resolvePlayer(src({ playerId: '13324', fullName: 'Matt Hibner', position: 'TE' }), withStats)
+    ).toMatchObject({ gsisId: '00-0040879', resolution: 'name' })
+    expect(
+      resolvePlayer(
+        src({ playerId: '11702', fullName: 'Brandon Coleman', position: 'OL' }),
+        withStats
+      )
+    ).toMatchObject({ gsisId: '00-0039913', resolution: 'name' })
+  })
+
   it('ignores malformed Sleeper gsis ids', () => {
     const r = resolvePlayer(
       src({ playerId: '9', fullName: 'Nobody Here', position: 'QB', gsisId: 'WAS123456' }),
```

Create `tests/main/stats/identity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { buildIdentity } from '@main/stats/identity'
import { openTestDb } from '../../fixtures/stats'

async function seed(db: Awaited<ReturnType<typeof openTestDb>>): Promise<void> {
  await db.exec(`CREATE TABLE src_players AS SELECT * FROM (VALUES
      ('00-0034844', 'Saquon Barkley', 'RB', 2018, 2018, 2026, 'BarkSa00'),
      ('00-0040879', 'Matthew Hibner', 'TE', NULL, 2025, 2026, NULL),
      ('00-0041000', 'Trey Smack', 'K', NULL, 2026, 2026, NULL),
      ('00-0011111', 'Chris Jones', 'DT', 2016, 2016, 2026, 'JoneCh09'),
      ('00-0022222', 'Chris Jones', 'DT', 2016, 2016, 2026, 'JoneCh10'),
      ('00-0039000', 'Isaiah Davis', 'RB', 2024, 2024, 2026, NULL),
      ('00-0039001', 'Jalen Coker', 'WR', NULL, 2024, 2026, NULL)
    ) t(gsis_id, display_name, position, draft_year, rookie_season, last_season, pfr_id)`)
  await db.exec(`CREATE TABLE src_crosswalk AS SELECT '4866' AS sleeper_id, '00-0034844' AS gsis_id,
      'sr-1' AS sportradar_id, 'fp-1' AS fantasypros_id, NULL AS yahoo_id`)
  await db.exec(
    `CREATE TABLE src_rosters AS SELECT 2026 AS season, 5 AS week, 13545 AS sleeper_id, '00-0041000' AS gsis_id`
  )
  await db.exec(`CREATE TABLE src_sleeper_players AS SELECT * FROM (VALUES
      (2026, '4866', 'Saquon', 'Barkley', 'RB'),
      (2026, '13545', 'Trey', 'Smack', 'K'),
      (2026, '13324', 'Matt', 'Hibner', 'TE'),
      (2026, '9999', 'Chris', 'Jones', 'DT'),
      (2026, 'LAR', NULL, NULL, 'DEF')
    ) t(season, player_id, first_name, last_name, position)`)
  await db.exec(`CREATE TABLE src_combine AS SELECT * FROM (VALUES
      (2018, 'Saquon Barkley', 'Penn St.', 'BarkSa00', NULL),
      (2024, 'Isaiah Davis', 'South Dakota St.', NULL, NULL),
      (2024, 'Jalen Coker', 'Holy Cross', NULL, NULL),
      (2024, 'Nobody Known', 'Somewhere', NULL, NULL)
    ) t(season, player_name, school, pfr_id, cfb_id)`)
}

describe('buildIdentity (stats-analysis spec §4.3)', () => {
  it('maps Sleeper ids by crosswalk, then rosters, then a unique name match', async () => {
    const db = await openTestDb()
    await seed(db)
    expect(await buildIdentity(db)).toBe(7)
    expect(
      await db.all('SELECT sleeper_id, gsis_id, resolution FROM sleeper_ids ORDER BY sleeper_id')
    ).toEqual([
      { sleeper_id: '13324', gsis_id: '00-0040879', resolution: 'name' },
      { sleeper_id: '13545', gsis_id: '00-0041000', resolution: 'rosters' },
      { sleeper_id: '4866', gsis_id: '00-0034844', resolution: 'crosswalk' }
    ])
    expect(
      await db.get(
        "SELECT name, sleeper_id, sportradar_id, pfr_id FROM players WHERE gsis_id = '00-0034844'"
      )
    ).toEqual({
      name: 'Saquon Barkley',
      sleeper_id: '4866',
      sportradar_id: 'sr-1',
      pfr_id: 'BarkSa00'
    })
  })

  it('resolves combine rows by PFR id, then name and draft year, then name and rookie season (audit fix 3)', async () => {
    const db = await openTestDb()
    await seed(db)
    await buildIdentity(db)
    expect(
      await db.all(
        'SELECT player_name, gsis_id, resolution FROM combine_ids ORDER BY season, player_name'
      )
    ).toEqual([
      { player_name: 'Saquon Barkley', gsis_id: '00-0034844', resolution: 'pfr' },
      { player_name: 'Isaiah Davis', gsis_id: '00-0039000', resolution: 'name_draft_year' },
      { player_name: 'Jalen Coker', gsis_id: '00-0039001', resolution: 'name_rookie_season' }
    ])
  })

  it('does nothing before the players file is loaded', async () => {
    const db = await openTestDb()
    expect(await buildIdentity(db)).toBe(0)
  })
})
```

Run: `npx vitest run tests/main/sync/identity.test.ts tests/main/stats/identity.test.ts`

Expected: FAIL (`canonicalName` is not exported; `@main/stats/identity` does not exist).

- [ ] **Step 2: Implement**

Apply to `src/main/sync/identity.ts`:

```diff
--- a/src/main/sync/identity.ts
+++ b/src/main/sync/identity.ts
@@ -17,20 +17,82 @@
   return words.join(' ')
 }

+/** Common first-name nicknames and the name they shorten; both sides of a match are canonicalised. */
+const NICKNAMES: Record<string, string> = {
+  matt: 'matthew',
+  mike: 'michael',
+  chris: 'christopher',
+  nick: 'nicholas',
+  josh: 'joshua',
+  will: 'william',
+  bill: 'william',
+  rob: 'robert',
+  bob: 'robert',
+  tom: 'thomas',
+  dan: 'daniel',
+  danny: 'daniel',
+  jim: 'james',
+  jimmy: 'james',
+  joe: 'joseph',
+  tony: 'anthony',
+  alex: 'alexander',
+  sam: 'samuel',
+  ben: 'benjamin',
+  jon: 'jonathan',
+  zach: 'zachary',
+  zack: 'zachary',
+  jake: 'jacob',
+  nate: 'nathan',
+  greg: 'gregory',
+  jeff: 'jeffrey',
+  steve: 'steven',
+  andy: 'andrew',
+  pat: 'patrick',
+  ken: 'kenneth',
+  tim: 'timothy',
+  dave: 'david',
+  ed: 'edward',
+  rick: 'richard',
+  dick: 'richard'
+}
+
+/** `normalizeName` with a nickname first name spelled out: "Matt Hibner" -> "matthew hibner". */
+export function canonicalName(name: string): string {
+  const words = normalizeName(name).split(' ')
+  if (words.length > 1) words[0] = NICKNAMES[words[0]] ?? words[0]
+  return words.join(' ')
+}
+
+/**
+ * Sources disagree on line and defensive positions (Sleeper OL / DL / DB, nflverse G / DT / CB), so
+ * they compare by group.
+ */
+const POSITION_GROUPS: Record<string, string> = {
+  ...Object.fromEntries(['OL', 'G', 'OG', 'T', 'OT', 'C'].map((p) => [p, 'OL'])),
+  ...Object.fromEntries(['DL', 'DE', 'DT', 'NT'].map((p) => [p, 'DL'])),
+  ...Object.fromEntries(['LB', 'ILB', 'OLB', 'MLB'].map((p) => [p, 'LB'])),
+  ...Object.fromEntries(['DB', 'CB', 'S', 'FS', 'SS', 'SAF'].map((p) => [p, 'DB']))
+}
+
+export function positionGroup(position: string): string {
+  return POSITION_GROUPS[position] ?? position
+}
+
+/** The name-match key of the identity rule (coverage audit fix 4: nicknames and line positions). */
+export function nameKey(name: string, position: string): string {
+  return `${canonicalName(name)}|${positionGroup(position)}`
+}
+
 export interface CrosswalkIndex {
   bySleeper: Map<string, CrosswalkRecord>
   byGsis: Map<string, CrosswalkRecord>
   bySportradar: Map<string, CrosswalkRecord>
-  /** key = `${normalizeName(name)}|${position}` */
+  /** key = `nameKey(name, position)` */
   byName: Map<string, CrosswalkRecord>
   /** Same key, but from the nflverse stats file itself (rookies the crosswalk has not caught up with). */
   byNflverseName: Map<string, string>
 }

-function nameKey(name: string, position: string): string {
-  return `${normalizeName(name)}|${position}`
-}
-
 /** First row wins per key, so duplicate crosswalk rows never flip a resolution between runs. */
 export function indexCrosswalk(
   rows: CrosswalkRecord[],
```

Create `src/main/stats/identity.ts`:

```ts
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
```

Run: `npx vitest run tests/main/sync tests/main/stats`

Expected: PASS. That includes `expertSync.test.ts`, the other user of `normalizeName`, unchanged.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/main/sync/identity.ts tests/main/sync/identity.test.ts src/main/stats/identity.ts tests/main/stats/identity.test.ts
git add src/main/sync/identity.ts tests/main/sync/identity.test.ts
git commit -m "fix(identity): match nicknames and position groups"
git add src/main/stats/identity.ts tests/main/stats/identity.test.ts
git commit -m "feat(stats): build player identity tables"
```

---

### Task 6: Sources and the sync (spec §4.1, §4.4)

The registry of files, Sleeper's weekly lines, and the orchestration: due-ness, logging, state, sealing, and the identity and views rebuild.

**Files:**

- Create: `src/main/stats/sources.ts`, `src/main/stats/sleeper.ts`, `src/main/stats/sync.ts`, `tests/fixtures/statsSync.ts`
- Test: `tests/main/stats/sources.test.ts`, `tests/main/stats/sleeper.test.ts`, `tests/main/stats/sync.test.ts`

**Interfaces:**

- Produces (`sources.ts`): `FTN_FIRST_SEASON`, `STATS_FIRST_SEASON`, `DEPTH_SNAPSHOT_FIRST_SEASON`, `FF_OPPORTUNITY_RELEASE`, `regularWeeks(season)`, `PLAY_PLAYER_ROLES`, `interface FileSource`, `interface FileContext`, `FILE_SOURCES` (in sync order).
- Produces (`sleeper.ts`): `SLEEPER_STATS_URL`, `StatsState { season, week, seasonType }`, `SleeperWeek`, `sleeperWeeks(season, state)`, `slimWeek(rows, week)`, `loadSleeperSeason(season, state, downloads, tempDir, replace)`.
- Produces (`sync.ts`): `ATTEMPT_INTERVAL_MS`, `PRIOR_SEASON_FRESHNESS_MS`, `STATS_LOG_PREFIX`, `StatsSyncDeps`, `SourceState`, `DueInput`, `isDue(input)`, `STATS_STEPS`, `stepLogName(step, season)`, `refreshStats(deps, options?, steps?)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/fixtures/statsSync.ts`:

```ts
import type { StatsDb } from '@main/stats/db'
import type { Downloads } from '@main/stats/download'
import type { StatsState } from '@main/stats/sleeper'
import { FILE_SOURCES } from '@main/stats/sources'
import type { StatsSyncResult } from '@main/stats/protocol'
import { refreshStats, STATS_STEPS, type StatsSyncDeps } from '@main/stats/sync'
import { tempDir } from './stats'

export const STATE_2026: StatsState = { season: 2026, week: 6, seasonType: 'regular' }

/** The URL a file source fetches for `season` (0 for an all-seasons file). */
export function urlOf(id: string, season = 0): string {
  const source = FILE_SOURCES.find((s) => s.id === id)
  if (!source) throw new Error(`no source ${id}`)
  return source.url(season)
}

/** Serves local files by URL (never deleted) and JSON bodies; anything else is a 404. */
export function fakeDownloads(
  files: Record<string, string>,
  json: Record<string, unknown> = {}
): Downloads & { fetched: string[] } {
  const fetched: string[] = []
  return {
    fetched,
    async withFile(url, read) {
      fetched.push(url)
      const path = files[url]
      return path === undefined ? null : read(path)
    },
    async json(url) {
      fetched.push(url)
      return json[url] ?? null
    }
  }
}

export interface RunOptions {
  files?: Record<string, string>
  json?: Record<string, unknown>
  /** Only these step ids run (default: every step). */
  only?: string[]
  state?: StatsState
  now?: Date
  force?: boolean
}

/** One stats refresh against fake downloads. */
export async function runSync(db: StatsDb, options: RunOptions = {}): Promise<StatsSyncResult> {
  const deps: StatsSyncDeps = {
    db,
    downloads: fakeDownloads(options.files ?? {}, options.json ?? {}),
    tempDir: tempDir(),
    nflState: async () => options.state ?? STATE_2026,
    now: () => options.now ?? new Date('2026-10-16T12:00:00Z')
  }
  const steps = options.only ? STATS_STEPS.filter((s) => options.only?.includes(s.id)) : STATS_STEPS
  return refreshStats(deps, { force: options.force }, steps)
}
```

Create `tests/main/stats/sources.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { openTestDb, tempDir, writeFixture } from '../../fixtures/stats'
import { runSync, urlOf } from '../../fixtures/statsSync'

describe('file sources (stats-analysis spec §4.1)', () => {
  it('normalises team codes and keeps the published columns', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const file = await writeFixture(
      db,
      dir,
      'stats_player_week_2019.parquet',
      `SELECT '00-0033873' AS player_id, 2019 AS season, 1 AS week, 'REG' AS season_type,
              'OAK' AS team, 'DEN' AS opponent_team, 5 AS receptions, 0 AS targets`
    )
    const { steps } = await runSync(db, {
      files: { [urlOf('player_stats', 2019)]: file },
      only: ['player_stats']
    })
    expect(steps.find((s) => s.source === 'stats:player_stats:2019')).toMatchObject({
      status: 'ok',
      rowsWritten: 1
    })
    expect(
      await db.all(
        'SELECT player_id, team, opponent_team, receptions, targets FROM src_player_stats'
      )
    ).toEqual([
      { player_id: '00-0033873', team: 'LV', opponent_team: 'DEN', receptions: 5, targets: 0 }
    ])
  })

  it('derives the season type from game types, once even when the file has the column', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const snaps = await writeFixture(
      db,
      dir,
      'snap_counts_2025.parquet',
      `SELECT 'AlleJo02' AS pfr_player_id, 2025 AS season, 19 AS week, 'WC' AS game_type,
              'BUF' AS team, 'LAR' AS opponent, 60 AS offense_snaps`
    )
    const injuries = await writeFixture(
      db,
      dir,
      'injuries_2025.parquet',
      `SELECT '00-0034857' AS gsis_id, 2025 AS season, 3 AS week, 'REG' AS game_type,
              'REG' AS season_type, 'BUF' AS team`
    )
    await runSync(db, {
      files: { [urlOf('snaps', 2025)]: snaps, [urlOf('injuries', 2025)]: injuries },
      only: ['snaps', 'injuries']
    })
    expect(await db.all('SELECT season_type, opponent FROM src_snaps')).toEqual([
      { season_type: 'POST', opponent: 'LA' }
    ])
    const columns = await db.all<{ column_name: string }>(
      "SELECT column_name FROM duckdb_columns() WHERE table_name = 'src_injuries' AND column_name LIKE 'season_type%'"
    )
    expect(columns).toEqual([{ column_name: 'season_type' }])
  })

  it("moves ESPN's nickname to team_name and takes the code as team", async () => {
    const db = await openTestDb()
    const file = await writeFixture(
      db,
      tempDir(),
      'qbr_week_level.parquet',
      `SELECT 2025 AS season, 'Regular' AS season_type, 4 AS game_week, '3139477' AS player_id,
              'LAR' AS team_abb, 'WSH' AS opp_abb, 'Rams' AS team, 71.2 AS qbr_total
       UNION ALL SELECT 2018, 'Regular', 1, '1', 'KC', 'LAC', 'Chiefs', 50.0`
    )
    await runSync(db, { files: { [urlOf('qbr_week')]: file }, only: ['qbr_week'] })
    expect(
      await db.all('SELECT season, week, team, team_name, opponent FROM src_qbr_week')
    ).toEqual([{ season: 2025, week: 4, team: 'LA', team_name: 'Rams', opponent: 'WAS' }])
  })

  it('reads the crosswalk CSV as text with NA as missing', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const file = `${dir}/db_playerids.csv`
    const { writeFileSync } = await import('node:fs')
    writeFileSync(
      file,
      'sleeper_id,gsis_id,name\n13324,NA,Matt Hibner\n4866,00-0034844,Saquon Barkley\n'
    )
    await runSync(db, { files: { [urlOf('crosswalk')]: file }, only: ['crosswalk'] })
    expect(await db.all('SELECT sleeper_id, gsis_id FROM src_crosswalk ORDER BY name')).toEqual([
      { sleeper_id: '13324', gsis_id: null },
      { sleeper_id: '4866', gsis_id: '00-0034844' }
    ])
  })

  it('stores play-by-play without the dropped columns and lists every named player', async () => {
    const db = await openTestDb()
    const file = await writeFixture(
      db,
      tempDir(),
      'play_by_play_2025.parquet',
      `SELECT * FROM (VALUES
         ('2025_01_BUF_BAL', 40.0, 2025, 1, 'REG', 'BUF', 'BAL', 'BUF', 'BAL', 'pass', '00-0034857', '00-0036', NULL, '00-0038', 0, 1.5, 'J.Allen'),
         ('2025_01_BUF_BAL', 41.0, 2025, 1, 'REG', 'BUF', 'BAL', 'BUF', 'BAL', 'run', NULL, NULL, '00-0037', NULL, 1, 0.2, NULL)
       ) t(game_id, play_id, season, week, season_type, posteam, defteam, home_team, away_team, play_type,
           passer_player_id, receiver_player_id, rusher_player_id, solo_tackle_1_player_id, play_deleted,
           total_home_epa, passer_player_name)`
    )
    const { steps } = await runSync(db, { files: { [urlOf('pbp', 2025)]: file }, only: ['pbp'] })
    expect(steps.find((s) => s.source === 'stats:pbp:2025')).toMatchObject({
      status: 'ok',
      message: null
    })
    const columns = await db.all<{ column_name: string; data_type: string }>(
      "SELECT column_name, data_type FROM duckdb_columns() WHERE table_name = 'src_pbp'"
    )
    const names = columns.map((c) => c.column_name)
    expect(names).not.toContain('total_home_epa')
    expect(names).not.toContain('passer_player_name')
    expect(columns.find((c) => c.column_name === 'play_id')?.data_type).toBe('INTEGER')
    // The deleted play (41) names nobody in play_players.
    expect(await db.all('SELECT play_id, role, gsis FROM play_players ORDER BY role')).toEqual([
      { play_id: 40, role: 'passer', gsis: '00-0034857' },
      { play_id: 40, role: 'receiver', gsis: '00-0036' },
      { play_id: 40, role: 'solo_tackle', gsis: '00-0038' }
    ])
  })

  it('splits participation into its play columns and the players on the field', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const withPositions = await writeFixture(
      db,
      dir,
      'pbp_participation_2025.parquet',
      `SELECT '2025_01_BUF_BAL' AS nflverse_game_id, 40.0 AS play_id, 'OAK' AS possession_team,
              'a;b' AS offense_players, 'c' AS defense_players, 'QB;WR' AS offense_positions,
              'CB' AS defense_positions, 'A;B' AS offense_names, true AS was_pressure`
    )
    const without = await writeFixture(
      db,
      dir,
      'pbp_participation_2019.parquet',
      `SELECT '2019_01_OAK_DEN' AS nflverse_game_id, 7.0 AS play_id, 'OAK' AS possession_team,
              'x' AS offense_players, '' AS defense_players, false AS was_pressure`
    )
    await runSync(db, {
      files: {
        [urlOf('participation', 2025)]: withPositions,
        [urlOf('participation', 2019)]: without
      },
      only: ['participation']
    })
    expect(
      await db.all(
        'SELECT season, game_id, play_id, possession_team, was_pressure FROM src_participation ORDER BY season'
      )
    ).toEqual([
      {
        season: 2019,
        game_id: '2019_01_OAK_DEN',
        play_id: 7,
        possession_team: 'LV',
        was_pressure: false
      },
      {
        season: 2025,
        game_id: '2025_01_BUF_BAL',
        play_id: 40,
        possession_team: 'LV',
        was_pressure: true
      }
    ])
    expect(
      await db.all('SELECT season, side, gsis, position FROM on_field ORDER BY season, side, gsis')
    ).toEqual([
      { season: 2019, side: 'O', gsis: 'x', position: null },
      { season: 2025, side: 'D', gsis: 'c', position: 'CB' },
      { season: 2025, side: 'O', gsis: 'a', position: 'QB' },
      { season: 2025, side: 'O', gsis: 'b', position: 'WR' }
    ])
  })

  it('keys FTN charting by the nflverse game and play', async () => {
    const db = await openTestDb()
    const file = await writeFixture(
      db,
      tempDir(),
      'ftn_charting_2022.parquet',
      `SELECT '2022_01_BUF_LA' AS nflverse_game_id, 55 AS nflverse_play_id, 2022 AS season, 1 AS week, true AS is_play_action`
    )
    await runSync(db, { files: { [urlOf('ftn', 2022)]: file }, only: ['ftn'] })
    expect(await db.all('SELECT game_id, play_id, is_play_action FROM src_ftn')).toEqual([
      { game_id: '2022_01_BUF_LA', play_id: 55, is_play_action: true }
    ])
  })

  it('stores 2025+ depth-chart snapshots apart from the weekly rows, with their season', async () => {
    const db = await openTestDb()
    const file = await writeFixture(
      db,
      tempDir(),
      'depth_charts_2026.parquet',
      `SELECT '2026-09-08T07:00:00Z' AS dt, 'LAR' AS team, 'Player' AS player_name, '1' AS espn_id,
              '00-1' AS gsis_id, 'Offense' AS pos_grp, 'WR' AS pos_abb, 1 AS pos_rank`
    )
    const { steps } = await runSync(db, {
      files: { [urlOf('depth_chart_snapshots', 2026)]: file },
      only: ['depth_charts', 'depth_chart_snapshots']
    })
    // Weekly depth charts end in 2024; snapshots start in 2025.
    expect(steps.map((s) => s.source).filter((s) => s.includes('2026'))).toEqual([
      'stats:depth_chart_snapshots:2026'
    ])
    expect(await db.all('SELECT season, team FROM src_depth_chart_snapshots')).toEqual([
      { season: 2026, team: 'LA' }
    ])
  })
})
```

Create `tests/main/stats/sleeper.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { SLEEPER_STATS_URL, sleeperWeeks, slimWeek } from '@main/stats/sleeper'
import { openTestDb } from '../../fixtures/stats'
import { runSync } from '../../fixtures/statsSync'

const week = (n: number, type = 'regular'): string =>
  `${SLEEPER_STATS_URL}/2026/${n}?season_type=${type}`

describe('sleeperWeeks', () => {
  it('lists a past season in full and the current one through the state week', () => {
    const past = sleeperWeeks(2020, { season: 2026, week: 6, seasonType: 'regular' })
    expect(past).toHaveLength(17 + 4)
    expect(past.at(-1)).toEqual({ seasonType: 'post', week: 4 })
    expect(sleeperWeeks(2026, { season: 2026, week: 6, seasonType: 'regular' })).toHaveLength(6)
    expect(sleeperWeeks(2026, { season: 2026, week: 0, seasonType: 'pre' })).toEqual([])
    expect(sleeperWeeks(2026, { season: 2026, week: 2, seasonType: 'post' })).toHaveLength(22)
  })
})

describe('slimWeek', () => {
  it('keeps the ids, the context and the numeric stats; counts rows without an id', () => {
    const out = slimWeek(
      [
        {
          player_id: '4866',
          team: 'NYG',
          opponent: 'DAL',
          game_id: 'g1',
          stats: { rush_yd: 80, pts_ppr: 14, note: 'x' },
          player: { first_name: 'Saquon', last_name: 'Barkley', position: 'RB' }
        },
        { stats: { rush_yd: 1 } }
      ],
      { seasonType: 'post', week: 2 }
    )
    expect(out.skipped).toBe(1)
    expect(out.rows).toEqual([
      {
        player_id: '4866',
        team: 'NYG',
        opponent: 'DAL',
        game_id: 'g1',
        season_type: 'POST',
        week: 2,
        stats: { rush_yd: 80, pts_ppr: 14 }
      }
    ])
    expect(out.players[0]).toMatchObject({ first_name: 'Saquon', position: 'RB' })
  })
})

describe('Sleeper weekly lines (stats-analysis spec §4.1)', () => {
  it('splits players, defenses and team offense, every stat key a column', async () => {
    const db = await openTestDb()
    const { steps } = await runSync(db, {
      only: ['sleeper'],
      json: {
        [week(1)]: [
          {
            player_id: '4866',
            team: 'NYG',
            opponent: 'LAR',
            stats: { rush_yd: 80 },
            player: { first_name: 'Saquon', last_name: 'Barkley', position: 'RB' }
          },
          { player_id: 'LAR', team: 'LAR', opponent: 'NYG', stats: { pts_allow: 24 } },
          { player_id: 'TEAM_NYG', team: 'NYG', opponent: 'LAR', stats: { pass_att: 30 } }
        ],
        [week(2)]: [{ player_id: '4866', team: 'NYG', opponent: 'DAL', stats: { rec: 3 } }]
      }
    })
    expect(steps.find((s) => s.source === 'stats:sleeper:2026')).toMatchObject({ status: 'ok' })
    expect(
      await db.all(
        'SELECT week, player_id, team, opponent, rush_yd, rec FROM src_sleeper ORDER BY week'
      )
    ).toEqual([
      { week: 1, player_id: '4866', team: 'NYG', opponent: 'LA', rush_yd: 80, rec: null },
      { week: 2, player_id: '4866', team: 'NYG', opponent: 'DAL', rush_yd: null, rec: 3 }
    ])
    expect(await db.all('SELECT player_id, team, pts_allow FROM src_sleeper_def')).toEqual([
      { player_id: 'LAR', team: 'LA', pts_allow: 24 }
    ])
    expect(await db.all('SELECT player_id, pass_att FROM src_sleeper_team')).toEqual([
      { player_id: 'TEAM_NYG', pass_att: 30 }
    ])
    expect(await db.all('SELECT player_id, first_name, position FROM src_sleeper_players')).toEqual(
      [{ player_id: '4866', first_name: 'Saquon', position: 'RB' }]
    )
  })

  it('skips a season with no lines yet', async () => {
    const db = await openTestDb()
    const { steps } = await runSync(db, { only: ['sleeper'] })
    expect(steps.find((s) => s.source === 'stats:sleeper:2026')).toMatchObject({
      status: 'skipped',
      message: '2026 has not started'
    })
  })
})
```

Create `tests/main/stats/sync.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  isDue,
  PRIOR_SEASON_FRESHNESS_MS,
  refreshStats,
  STATS_STEPS,
  type DueInput,
  type SourceState
} from '@main/stats/sync'
import { openTestDb, tempDir, writeFixture } from '../../fixtures/stats'
import { fakeDownloads, runSync, STATE_2026, urlOf } from '../../fixtures/statsSync'

const NOW = Date.parse('2026-10-16T12:00:00Z')
const HOUR = 60 * 60 * 1000
const due = (over: Partial<DueInput>): boolean =>
  isDue({
    season: 2026,
    current: 2026,
    force: false,
    now: NOW,
    lastAttemptAt: null,
    version: 1,
    state: null,
    ...over
  })
const state = (fetchedAt: string, sealed = false, version = 1): SourceState => ({
  version,
  fetchedAt,
  sealed
})

describe('isDue (warehouse spec §4.2, kept)', () => {
  it('runs what was never fetched and what a new version changed', () => {
    expect(due({ season: 2019 })).toBe(true)
    expect(due({ season: 2019, state: state('2026-01-01T00:00:00Z', true), version: 2 })).toBe(true)
  })

  it('never retries within a day unless forced, and forcing only reaches recent seasons', () => {
    const lastAttemptAt = new Date(NOW - 2 * HOUR).toISOString()
    expect(due({ lastAttemptAt })).toBe(false)
    expect(due({ lastAttemptAt, force: true })).toBe(true)
    expect(due({ season: 0, lastAttemptAt, force: true })).toBe(true)
    expect(due({ season: 2020, lastAttemptAt, force: true })).toBe(false)
  })

  it('refreshes the current season daily, the prior weekly, and older ones until sealed', () => {
    const recent = new Date(NOW - 3 * 24 * HOUR).toISOString()
    expect(due({ state: state(recent) })).toBe(true)
    expect(due({ season: 2025, state: state(recent) })).toBe(false)
    expect(
      due({ season: 2025, state: state(new Date(NOW - PRIOR_SEASON_FRESHNESS_MS).toISOString()) })
    ).toBe(true)
    expect(due({ season: 2023, state: state(recent, true) })).toBe(false)
    expect(due({ season: 2023, state: state(recent, false) })).toBe(true)
  })
})

describe('refreshStats', () => {
  it('logs every due step, skips unpublished files, and records state with sealing', async () => {
    const db = await openTestDb()
    const file = await writeFixture(
      db,
      tempDir(),
      'c.parquet',
      "SELECT 2010 AS season, 'X' AS player_name"
    )
    const { steps } = await runSync(db, {
      files: { [urlOf('combine')]: file },
      only: ['combine', 'injuries']
    })
    expect(steps.map((s) => [s.source, s.status])).toEqual([
      ['stats:combine', 'ok'],
      ...[2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((s) => [
        `stats:injuries:${s}`,
        'skipped'
      ]),
      ['stats:identity', 'ok']
    ])
    expect(steps[1].message).toBe('injuries 2019 not published yet')
    expect(await db.all('SELECT source, season, rows_written, sealed FROM source_state')).toEqual([
      { source: 'combine', season: 0, rows_written: 1, sealed: false }
    ])
  })

  it('does not run a step again within the day, and seals seasons two back', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const files: Record<string, string> = {}
    for (const season of [2024, 2026]) {
      files[urlOf('injuries', season)] = await writeFixture(
        db,
        dir,
        `i${season}.parquet`,
        `SELECT ${season} AS season, 1 AS week, 'REG' AS game_type, 'g' AS gsis_id, 'KC' AS team`
      )
    }
    await runSync(db, { files, only: ['injuries'] })
    const again = await runSync(db, { files, only: ['injuries'] })
    expect(again.steps).toEqual([])
    expect(await db.all('SELECT season, sealed FROM source_state ORDER BY season')).toEqual([
      { season: 2024, sealed: true },
      { season: 2026, sealed: false }
    ])
  })

  it('logs a failed step as an error and carries on', async () => {
    const db = await openTestDb()
    const dir = tempDir()
    const bad = `${dir}/bad.parquet`
    const { writeFileSync } = await import('node:fs')
    writeFileSync(bad, 'not parquet')
    const good = await writeFixture(
      db,
      dir,
      'c.parquet',
      "SELECT 2010 AS season, 'X' AS player_name"
    )
    const { steps } = await runSync(db, {
      files: { [urlOf('players')]: bad, [urlOf('combine')]: good },
      only: ['players', 'combine']
    })
    expect(steps.map((s) => [s.source, s.status])).toEqual([
      ['stats:players', 'error'],
      ['stats:combine', 'ok'],
      ['stats:identity', 'ok']
    ])
  })

  it('logs the NFL state failure and stops', async () => {
    const db = await openTestDb()
    const { steps } = await refreshStats({
      db,
      downloads: fakeDownloads({}),
      tempDir: tempDir(),
      nflState: () => Promise.reject(new Error('Sleeper is down'))
    })
    expect(steps.map((s) => [s.source, s.status, s.message])).toEqual([
      ['stats:state', 'error', 'Sleeper is down']
    ])
  })

  it('reports each finished step', async () => {
    const db = await openTestDb()
    const seen: string[] = []
    await refreshStats(
      {
        db,
        downloads: fakeDownloads({}),
        tempDir: tempDir(),
        nflState: async () => STATE_2026,
        onStep: (e) => seen.push(`${e.source} ${e.status}`)
      },
      {},
      STATS_STEPS.filter((s) => s.id === 'combine')
    )
    expect(seen).toEqual(['stats:combine skipped'])
  })
})
```

Run: `npx vitest run tests/main/stats`

Expected: FAIL (`@main/stats/sources`, `sleeper` and `sync` do not exist).

- [ ] **Step 2: Implement the registry**

Create `src/main/stats/sources.ts`:

```ts
import { CROSSWALK_URL, NFLVERSE_RELEASES_URL } from '@main/sources/nflverse'
import { sqlIdent, sqlString } from './db'
import type { Columns } from './load'

export const FF_OPPORTUNITY_RELEASE =
  'https://github.com/ffverse/ffopportunity/releases/download/latest-data'

/** Stats-analysis spec §4: 2019 through the current season, as the warehouse before it. */
export const STATS_FIRST_SEASON = 2019
/** FTN charting starts in 2022. */
export const FTN_FIRST_SEASON = 2022
/** From 2025 nflverse publishes depth charts as timestamped snapshots, not weekly rows. */
export const DEPTH_SNAPSHOT_FIRST_SEASON = 2025

const nflverse = (tag: string, name: string): string =>
  `${NFLVERSE_RELEASES_URL}/${tag}/${name}.parquet`

const parquet = (path: string): string => `read_parquet(${sqlString(path)})`

/** What a source's extra tables are built from: the downloaded file and its columns. */
export interface FileContext {
  from: string
  columns: Columns
  season: number
  /** Replaces this season's rows of `table` with `select` (the sync's loader); returns its rows. */
  replace(table: string, select: string): Promise<number>
}

export interface FileSource {
  /** `stats:<id>:<season>` (or `stats:<id>`) in `sync_log`, `<id>` in `source_state`. */
  id: string
  table: string
  /** Bump to re-fetch sealed seasons after a change to how the source is stored. */
  version: number
  firstSeason: number
  lastSeason?: number
  /** One file holding every season, fetched as season 0. */
  allSeasons: boolean
  url(season: number): string
  /** The table function reading the downloaded file. */
  read(path: string): string
  /**
   * Spec §4.1 standard columns by expression over the file's columns (see `standardSelect`); it
   * gets the file's columns so it can leave out what the file lacks.
   */
  standard(season: number, columns: Columns): Record<string, string>
  exclude?: (column: string) => boolean
  /** A filter over the file's columns. */
  where?: string
  /** Tables built from the same file, replaced for the same season; returns their rows. */
  extra?: (ctx: FileContext) => Promise<number>
}

const team = (column: string): string => `nfl_team(${column})`
/** nflverse files that spell the season type as a game type (REG / WC / DIV / CON / SB). */
const gameType = { season_type: 'season_type_of(game_type)' }
/** Regular-season weeks: 17 through 2020, 18 since. */
export const regularWeeks = (season: number): number => (season <= 2020 ? 17 : 18)

function seasonFile(
  id: string,
  table: string,
  url: (season: number) => string,
  standard: FileSource['standard'],
  rest: Partial<FileSource> = {}
): FileSource {
  return {
    id,
    table,
    version: 1,
    firstSeason: STATS_FIRST_SEASON,
    allSeasons: false,
    url,
    read: parquet,
    standard,
    ...rest
  }
}

function allSeasonsFile(
  id: string,
  table: string,
  url: string,
  standard: Record<string, string>,
  rest: Partial<FileSource> = {}
): FileSource {
  return {
    id,
    table,
    version: 1,
    firstSeason: STATS_FIRST_SEASON,
    allSeasons: true,
    url: () => url,
    read: parquet,
    standard: () => standard,
    ...rest
  }
}

/** Play-by-play columns not stored (spec §4.2): running totals, duplicates, names, game-level copies. */
const PBP_DROPPED =
  /^total_(home|away)_|_player_name$|_jersey_number$|^(solo_tackle|assist_tackle|tackle_with_assist|fumbled|fumble_recovery|forced_fumble_player)_\d_team$|^(fantasy|fantasy_id|fantasy_player_id|fantasy_player_name|name|id|passer|rusher|receiver|jersey_number|time_of_day|end_clock_time|drive_real_start_time|start_time|order_sequence|away_wp|home_wp|def_wp|away_wp_post|home_wp_post|vegas_home_wp|vegas_home_wpa|no_score_prob|opp_td_prob|opp_fg_prob|safety_prob|opp_safety_prob|td_prob|fg_prob|nfl_api_id|old_game_id|stadium|game_stadium|stadium_id|home_coach|away_coach|weather|temp|wind|roof|surface|spread_line|total_line|result|total|home_score|away_score|div_game|location|game_date|home_opening_kickoff)$/

/** Team-coded play-by-play columns, normalised like every other source. */
const PBP_TEAMS = [
  'posteam',
  'defteam',
  'home_team',
  'away_team',
  'side_of_field',
  'return_team',
  'penalty_team',
  'td_team',
  'timeout_team'
]

/** Every play-by-play column naming a player, with the role `play_players` gives it (spec §4.2). */
export const PLAY_PLAYER_ROLES: Record<string, string> = {
  passer_player_id: 'passer',
  passer_id: 'dropback',
  rusher_player_id: 'rusher',
  receiver_player_id: 'receiver',
  interception_player_id: 'interception',
  sack_player_id: 'sack',
  half_sack_1_player_id: 'half_sack',
  half_sack_2_player_id: 'half_sack',
  qb_hit_1_player_id: 'qb_hit',
  qb_hit_2_player_id: 'qb_hit',
  tackle_for_loss_1_player_id: 'tackle_for_loss',
  tackle_for_loss_2_player_id: 'tackle_for_loss',
  solo_tackle_1_player_id: 'solo_tackle',
  solo_tackle_2_player_id: 'solo_tackle',
  assist_tackle_1_player_id: 'assist_tackle',
  assist_tackle_2_player_id: 'assist_tackle',
  assist_tackle_3_player_id: 'assist_tackle',
  assist_tackle_4_player_id: 'assist_tackle',
  tackle_with_assist_1_player_id: 'tackle_with_assist',
  tackle_with_assist_2_player_id: 'tackle_with_assist',
  pass_defense_1_player_id: 'pass_defense',
  pass_defense_2_player_id: 'pass_defense',
  forced_fumble_player_1_player_id: 'forced_fumble',
  forced_fumble_player_2_player_id: 'forced_fumble',
  fumbled_1_player_id: 'fumbled',
  fumbled_2_player_id: 'fumbled',
  fumble_recovery_1_player_id: 'fumble_recovery',
  fumble_recovery_2_player_id: 'fumble_recovery',
  kicker_player_id: 'kicker',
  punter_player_id: 'punter',
  kickoff_returner_player_id: 'kick_returner',
  punt_returner_player_id: 'punt_returner',
  own_kickoff_recovery_player_id: 'own_kickoff_recovery',
  blocked_player_id: 'blocked_kick',
  td_player_id: 'touchdown',
  safety_player_id: 'safety',
  penalty_player_id: 'penalty',
  lateral_receiver_player_id: 'lateral_receiver',
  lateral_rusher_player_id: 'lateral_rusher',
  lateral_interception_player_id: 'lateral_interception',
  lateral_sack_player_id: 'lateral_sack',
  lateral_kickoff_returner_player_id: 'lateral_returner',
  lateral_punt_returner_player_id: 'lateral_returner'
}

/** `play_players` for one season: every player a non-deleted play names, with a role. */
async function playPlayers({ from, columns, season, replace }: FileContext): Promise<number> {
  const roles = Object.entries(PLAY_PLAYER_ROLES).filter(([column]) => columns.has(column))
  const role = `CASE col ${roles.map(([c, r]) => `WHEN '${c}' THEN '${r}'`).join(' ')} END`
  const deleted = columns.has('play_deleted') ? 'AND coalesce(play_deleted, 0) = 0' : ''
  const select = `SELECT ${season} AS season, game_id, play_id, ${role} AS role, gsis FROM (
      UNPIVOT (SELECT game_id, play_id::INTEGER AS play_id, ${roles.map(([c]) => sqlIdent(c)).join(', ')}
               FROM ${from} WHERE season_type IN ('REG', 'POST') ${deleted})
      ON ${roles.map(([c]) => sqlIdent(c)).join(', ')} INTO NAME col VALUE gsis)`
  return replace('play_players', select)
}

/** Participation lists the players on the field as "id;id;…" (positions from 2023 only). */
async function onField({ from, columns, season, replace }: FileContext): Promise<number> {
  const side = (name: 'offense' | 'defense', code: string): string => {
    const pos = columns.has(`${name}_positions`)
      ? `unnest(string_split(${name}_positions, ';'))`
      : 'NULL::VARCHAR'
    return `SELECT nflverse_game_id AS game_id, play_id::INTEGER AS play_id, '${code}' AS side,
              unnest(string_split(${name}_players, ';')) AS gsis, ${pos} AS position
            FROM ${from} WHERE coalesce(${name}_players, '') <> ''`
  }
  const select = `SELECT ${season} AS season, * FROM (${side('offense', 'O')} UNION ALL ${side('defense', 'D')})`
  return replace('on_field', select)
}

const PARTICIPATION_LISTS = [
  'offense_players',
  'defense_players',
  'offense_names',
  'defense_names',
  'offense_positions',
  'defense_positions',
  'offense_numbers',
  'defense_numbers',
  'players_on_play',
  'nflverse_game_id'
]

/** Spec §4.1–§4.2, in sync order: identity first, the schedule before depth charts. */
export const FILE_SOURCES: FileSource[] = [
  allSeasonsFile(
    'schedules',
    'games',
    nflverse('schedules', 'games'),
    {
      home_team: team('home_team'),
      away_team: team('away_team')
    },
    { where: `season >= ${STATS_FIRST_SEASON}` }
  ),
  allSeasonsFile('players', 'src_players', nflverse('players', 'players'), {
    latest_team: team('latest_team')
  }),
  allSeasonsFile(
    'crosswalk',
    'src_crosswalk',
    CROSSWALK_URL,
    {},
    {
      read: (path) =>
        `read_csv(${sqlString(path)}, header = true, all_varchar = true, nullstr = 'NA')`
    }
  ),
  allSeasonsFile('combine', 'src_combine', nflverse('combine', 'combine'), {}),
  seasonFile(
    'player_stats',
    'src_player_stats',
    (s) => nflverse('stats_player', `stats_player_week_${s}`),
    () => ({
      team: team('team'),
      opponent_team: team('opponent_team')
    })
  ),
  seasonFile(
    'team_stats',
    'src_team_stats',
    (s) => nflverse('stats_team', `stats_team_week_${s}`),
    () => ({
      team: team('team'),
      opponent_team: team('opponent_team')
    })
  ),
  seasonFile(
    'snaps',
    'src_snaps',
    (s) => nflverse('snap_counts', `snap_counts_${s}`),
    () => ({
      team: team('team'),
      opponent: team('opponent'),
      ...gameType
    })
  ),
  seasonFile(
    'ff_opportunity',
    'src_ff_opportunity',
    (s) => `${FF_OPPORTUNITY_RELEASE}/ep_weekly_${s}.parquet`,
    (s) => ({
      team: team('posteam'),
      season_type: `CASE WHEN week > ${regularWeeks(s)} THEN 'POST' ELSE 'REG' END`
    })
  ),
  ...(['passing', 'rushing', 'receiving'] as const).map((kind) =>
    allSeasonsFile(
      `ngs_${kind}`,
      `src_ngs_${kind}`,
      nflverse('nextgen_stats', `ngs_${kind}`),
      {
        team: team('team_abbr')
      },
      { where: `season >= ${STATS_FIRST_SEASON}` }
    )
  ),
  ...(['pass', 'rush', 'rec', 'def'] as const).map((kind) =>
    seasonFile(
      `pfr_${kind}`,
      `src_pfr_${kind}`,
      (s) => nflverse('pfr_advstats', `advstats_week_${kind}_${s}`),
      () => ({
        team: team('team'),
        opponent: team('opponent'),
        ...gameType
      })
    )
  ),
  // ESPN's `team` is the nickname; it moves to `team_name` and `team` takes the code.
  allSeasonsFile(
    'qbr_week',
    'src_qbr_week',
    nflverse('espn_data', 'qbr_week_level'),
    {
      team_name: 'team',
      team: team('team_abb'),
      opponent: team('opp_abb'),
      week: 'game_week'
    },
    { where: `season >= ${STATS_FIRST_SEASON}` }
  ),
  allSeasonsFile(
    'qbr_season',
    'src_qbr_season',
    nflverse('espn_data', 'qbr_season_level'),
    {
      team_name: 'team',
      team: team('team_abb')
    },
    { where: `season >= ${STATS_FIRST_SEASON}` }
  ),
  seasonFile(
    'injuries',
    'src_injuries',
    (s) => nflverse('injuries', `injuries_${s}`),
    () => ({
      team: team('team'),
      ...gameType
    })
  ),
  seasonFile(
    'depth_charts',
    'src_depth_charts',
    (s) => nflverse('depth_charts', `depth_charts_${s}`),
    () => ({
      team: team('club_code'),
      ...gameType
    }),
    { lastSeason: DEPTH_SNAPSHOT_FIRST_SEASON - 1 }
  ),
  seasonFile(
    'depth_chart_snapshots',
    'src_depth_chart_snapshots',
    (s) => nflverse('depth_charts', `depth_charts_${s}`),
    (s) => ({
      season: String(s),
      team: team('team')
    }),
    { firstSeason: DEPTH_SNAPSHOT_FIRST_SEASON }
  ),
  seasonFile(
    'rosters',
    'src_rosters',
    (s) => nflverse('weekly_rosters', `roster_weekly_${s}`),
    () => ({
      team: team('team'),
      ...gameType
    })
  ),
  seasonFile(
    'pbp',
    'src_pbp',
    (s) => nflverse('pbp', `play_by_play_${s}`),
    (_, columns) => ({
      ...Object.fromEntries(PBP_TEAMS.filter((c) => columns.has(c)).map((c) => [c, team(c)])),
      play_id: 'play_id::INTEGER'
    }),
    {
      exclude: (column) => PBP_DROPPED.test(column),
      where: "season_type IN ('REG', 'POST')",
      extra: playPlayers
    }
  ),
  seasonFile(
    'ftn',
    'src_ftn',
    (s) => nflverse('ftn_charting', `ftn_charting_${s}`),
    () => ({
      game_id: 'nflverse_game_id',
      play_id: 'nflverse_play_id::INTEGER'
    }),
    {
      firstSeason: FTN_FIRST_SEASON,
      exclude: (column) => column === 'nflverse_game_id' || column === 'nflverse_play_id'
    }
  ),
  seasonFile(
    'participation',
    'src_participation',
    (s) => nflverse('pbp_participation', `pbp_participation_${s}`),
    (s) => ({
      season: String(s),
      game_id: 'nflverse_game_id',
      play_id: 'play_id::INTEGER',
      possession_team: team('possession_team')
    }),
    {
      exclude: (column) => PARTICIPATION_LISTS.includes(column),
      extra: onField
    }
  )
]
```

- [ ] **Step 3: Implement Sleeper's weekly lines**

Create `src/main/stats/sleeper.ts`:

```ts
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
        if (typeof v === 'number' && Number.isFinite(v)) stats[k] = v
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

/** Sleeper DEF ids are team codes; team-offense rows are `TEAM_<code>`; everything else is a player. */
const KIND_FILTERS = {
  src_sleeper: "player_id NOT LIKE 'TEAM\\_%' ESCAPE '\\' AND length(player_id) > 3",
  src_sleeper_def: 'length(player_id) <= 3',
  src_sleeper_team: "player_id LIKE 'TEAM\\_%' ESCAPE '\\'"
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
```

- [ ] **Step 4: Implement the sync**

Create `src/main/stats/sync.ts`:

```ts
import type { StatsDb } from './db'
import type { Downloads } from './download'
import type { RefreshOptions, StatsLogEntry, StatsStepStatus, StatsSyncResult } from './protocol'
import { buildIdentity } from './identity'
import { describe, replaceRows, standardSelect } from './load'
import { loadSleeperSeason, type StatsState } from './sleeper'
import { FILE_SOURCES, STATS_FIRST_SEASON, type FileSource } from './sources'
import { buildViews } from './views'

const DAY = 24 * 60 * 60 * 1000
/** Warehouse spec §4.2, kept: a step is never retried within a day of its last finished attempt. */
export const ATTEMPT_INTERVAL_MS = DAY
/** The prior season is re-fetched weekly. */
export const PRIOR_SEASON_FRESHNESS_MS = 7 * DAY
/** Prefix of every stats step in `sync_log`. */
export const STATS_LOG_PREFIX = 'stats:'

export interface StatsSyncDeps {
  db: StatsDb
  downloads: Downloads
  /** Where the Sleeper lines are staged before DuckDB reads them. */
  tempDir: string
  /** The Sleeper NFL state; fetched by the worker itself, so no league is needed (spec §4.4). */
  nflState: () => Promise<StatsState>
  now?: () => Date
  onStep?: (entry: StatsLogEntry) => void
}

/** A source of the sync: one of the files, or Sleeper's weekly lines. */
interface Step {
  id: string
  version: number
  firstSeason: number
  lastSeason?: number
  allSeasons: boolean
  run(season: number, ctx: RunContext): Promise<StepRun | null>
}

interface RunContext {
  deps: StatsSyncDeps
  state: StatsState
}

interface StepRun {
  rows: number
  notes: string[]
}

/** Thrown by a step body to log `skipped` instead of `error`. */
class SkipStep extends Error {}

const nowOf = (deps: StatsSyncDeps): Date => (deps.now ?? (() => new Date()))()

function fileStep(source: FileSource): Step {
  return {
    id: source.id,
    version: source.version,
    firstSeason: source.firstSeason,
    lastSeason: source.lastSeason,
    allSeasons: source.allSeasons,
    async run(season, { deps }) {
      const db = deps.db
      return deps.downloads.withFile(source.url(season), async (path) => {
        const from = source.read(path)
        const columns = await describe(db, `SELECT * FROM ${from}`)
        const standard = source.standard(season, columns)
        const select = standardSelect(from, columns, standard, source.exclude, source.where)
        const scope = source.allSeasons ? null : season
        const main = await replaceRows(db, source.table, scope, select)
        let rows = main.rows
        if (source.extra) {
          rows += await source.extra({
            from,
            columns,
            season,
            replace: async (table, sql) => (await replaceRows(db, table, season, sql)).rows
          })
        }
        return { rows, notes: main.widened.map((w) => `widened ${w}`) }
      })
    }
  }
}

const sleeperStep: Step = {
  id: 'sleeper',
  version: 1,
  firstSeason: STATS_FIRST_SEASON,
  allSeasons: false,
  async run(season, { deps, state }) {
    const loaded = await loadSleeperSeason(
      season,
      state,
      deps.downloads,
      deps.tempDir,
      async (table, sql) => (await replaceRows(deps.db, table, season, sql)).rows
    )
    if (loaded === null) throw new SkipStep(`${season} has not started`)
    return {
      rows: loaded.rows,
      notes: loaded.skipped > 0 ? [`${loaded.skipped} rows without a player id skipped`] : []
    }
  }
}

/** Spec §4.1–§4.2 in sync order: Sleeper, then the files (identity first, schedule before depth charts). */
export const STATS_STEPS: Step[] = [sleeperStep, ...FILE_SOURCES.map(fileStep)]

export function stepLogName(step: Pick<Step, 'id' | 'allSeasons'>, season: number): string {
  return step.allSeasons
    ? `${STATS_LOG_PREFIX}${step.id}`
    : `${STATS_LOG_PREFIX}${step.id}:${season}`
}

function seasonsFor(step: Step, current: number): number[] {
  if (step.allSeasons) return [0]
  const last = Math.min(step.lastSeason ?? current, current)
  const seasons: number[] = []
  for (let s = Math.max(step.firstSeason, STATS_FIRST_SEASON); s <= last; s++) seasons.push(s)
  return seasons
}

export interface SourceState {
  version: number
  fetchedAt: string
  sealed: boolean
}

export interface DueInput {
  season: number
  current: number
  force: boolean
  now: number
  lastAttemptAt: string | null
  version: number
  state: SourceState | null
}

/**
 * Warehouse spec §4.2: never within a day of the last attempt (unless forced, for the current
 * season and all-seasons files); a new version or no state is due; the current season and
 * all-seasons files daily, the prior season weekly, older seasons until sealed.
 */
export function isDue(input: DueInput): boolean {
  const { season, current, now, state } = input
  const recent = season === 0 || season >= current - 1
  const attempted =
    input.lastAttemptAt !== null && now - Date.parse(input.lastAttemptAt) < ATTEMPT_INTERVAL_MS
  if (attempted && !(input.force && recent)) return false
  if (!state || state.version < input.version) return true
  if (season === 0 || season === current) return true
  if (season === current - 1) return now - Date.parse(state.fetchedAt) >= PRIOR_SEASON_FRESHNESS_MS
  return !state.sealed
}

async function lastAttempt(db: StatsDb, source: string): Promise<string | null> {
  const row = await db.get<{ started_at: string }>(
    `SELECT started_at FROM sync_log WHERE source = ? AND status <> 'running'
     ORDER BY id DESC LIMIT 1`,
    [source]
  )
  return row?.started_at ?? null
}

async function sourceState(
  db: StatsDb,
  source: string,
  season: number
): Promise<SourceState | null> {
  const row = await db.get<{ version: number; fetched_at: string; sealed: boolean }>(
    'SELECT version, fetched_at, sealed FROM source_state WHERE source = ? AND season = ?',
    [source, season]
  )
  return row ? { version: row.version, fetchedAt: row.fetched_at, sealed: row.sealed } : null
}

function toEntry(row: Record<string, unknown>): StatsLogEntry {
  return {
    id: row.id as number,
    source: row.source as string,
    startedAt: row.started_at as string,
    finishedAt: (row.finished_at as string | null) ?? null,
    status: row.status as StatsStepStatus,
    message: (row.message as string | null) ?? null,
    rowsWritten: row.rows_written as number
  }
}

/** Runs one step under a `sync_log` row; never throws (errors are logged). */
async function runLogged(
  deps: StatsSyncDeps,
  name: string,
  body: () => Promise<{ rows: number; message: string | null }>
): Promise<StatsLogEntry> {
  const db = deps.db
  const started = await db.get<{ id: number }>(
    "INSERT INTO sync_log (source, started_at, status) VALUES (?, ?, 'running') RETURNING id",
    [name, nowOf(deps).toISOString()]
  )
  const id = started?.id ?? 0
  let status: StatsStepStatus = 'ok'
  let message: string | null = null
  let rows = 0
  try {
    const out = await body()
    rows = out.rows
    message = out.message
  } catch (err) {
    status = err instanceof SkipStep ? 'skipped' : 'error'
    message = err instanceof Error ? err.message : String(err)
  }
  const row = await db.get(
    `UPDATE sync_log SET finished_at = ?, status = ?, message = ?, rows_written = ?
     WHERE id = ? RETURNING *`,
    [nowOf(deps).toISOString(), status, message, rows, id]
  )
  const entry = toEntry(row ?? {})
  try {
    deps.onStep?.(entry)
  } catch {
    // progress reporting never affects the sync
  }
  return entry
}

/**
 * Stats-analysis spec §4.4: every due step, in order, oldest season first; each commits on its own,
 * so a quit mid-backfill resumes on the next run. Then, when anything was written, identity and
 * views are rebuilt (`stats:identity`). Never throws.
 */
export async function refreshStats(
  deps: StatsSyncDeps,
  options: RefreshOptions = {},
  steps: Step[] = STATS_STEPS
): Promise<StatsSyncResult> {
  const log: StatsLogEntry[] = []
  let state: StatsState
  try {
    state = await deps.nflState()
  } catch (err) {
    log.push(
      await runLogged(deps, `${STATS_LOG_PREFIX}state`, () => {
        throw err
      })
    )
    return { steps: log }
  }
  const force = options.force ?? false
  let wrote = false
  for (const step of steps) {
    for (const season of seasonsFor(step, state.season)) {
      const name = stepLogName(step, season)
      const due = isDue({
        season,
        current: state.season,
        force,
        now: nowOf(deps).getTime(),
        lastAttemptAt: await lastAttempt(deps.db, name),
        version: step.version,
        state: await sourceState(deps.db, step.id, season)
      })
      if (!due) continue
      const entry = await runLogged(deps, name, async () => {
        const run = await step.run(season, { deps, state })
        if (run === null) {
          throw new SkipStep(
            season === 0 ? `${step.id} not published yet` : `${step.id} ${season} not published yet`
          )
        }
        await deps.db.exec(`INSERT OR REPLACE INTO source_state VALUES (?, ?, ?, ?, ?, ?)`, [
          step.id,
          season,
          step.version,
          run.rows,
          nowOf(deps).toISOString(),
          season !== 0 && season <= state.season - 2
        ])
        return { rows: run.rows, message: run.notes.length > 0 ? run.notes.join('; ') : null }
      })
      if (entry.status === 'ok') wrote = true
      log.push(entry)
    }
  }
  if (wrote) {
    log.push(
      await runLogged(deps, `${STATS_LOG_PREFIX}identity`, async () => {
        const players = await buildIdentity(deps.db)
        const views = await buildViews(deps.db)
        await deps.db.exec('CHECKPOINT')
        return { rows: players, message: views.length > 0 ? `views: ${views.join(', ')}` : null }
      })
    )
  }
  return { steps: log }
}
```

Run: `npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run`

Expected: clean; **927 passed, 5 skipped**.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/stats tests/fixtures/statsSync.ts tests/main/stats
git add src/main/stats/sources.ts src/main/stats/sleeper.ts src/main/stats/sync.ts tests/fixtures/statsSync.ts tests/main/stats/sources.test.ts tests/main/stats/sleeper.test.ts tests/main/stats/sync.test.ts
git commit -m "feat(stats): sync every source into DuckDB"
```

---

### Task 7: Run the sync in the app, retire the warehouse (spec §4.4; amendment J)

The service runs the sync, and the worker reports each step. The app starts the worker, deletes `warehouse.db`, refreshes stats after every refresh or import (or at launch with no league), and closes the worker on quit. The warehouse code goes.

**Files:**

- Modify: `src/main/stats/service.ts` (replace), `src/main/stats/worker.ts`, `tests/main/stats/service.test.ts` (replace), `src/main/index.ts`, `src/main/ipc/handlers.ts`, `electron.vite.config.ts`, `src/main/sync/step.ts`
- Delete: `src/main/warehouse/`, `src/main/sources/warehouse/`, `src/main/sync/warehouseSync.ts`, `src/main/sync/warehouseSteps.ts`, `src/main/db/repos/warehouse.ts`, `src/main/db/warehouseDb.ts`, `src/main/db/warehouseMigrations/`, and their tests and fixtures (Step 4)

**Interfaces:**

- Produces (`service.ts`): `fetchStatsState(): Promise<StatsState>`, `openStatsService(init, onStep, nflState?)`.
- Produces (`handlers.ts`): `AppContext.stats: StatsClient | null` replaces `warehouse` and `warehouseDb`; `startStats(ctx, options?)`. `startRefresh` and the league import start stats after they settle.

- [ ] **Step 1: The service runs the sync**

Replace `src/main/stats/service.ts` with:

```ts
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createSleeperClient } from '@main/sources/sleeper'
import { sqlString, StatsDb } from './db'
import { createDownloads } from './download'
import type {
  RefreshOptions,
  SelfTestResult,
  StatsLogEntry,
  StatsSyncResult,
  StatsWorkerInit
} from './protocol'
import { bootstrapStatsDb } from './schema'
import type { StatsState } from './sleeper'
import { refreshStats } from './sync'

/** The worker's state: the open database and what a refresh needs. Runnable in-process for tests. */
export interface StatsService {
  refresh(options: RefreshOptions): Promise<StatsSyncResult>
  selfTest(): Promise<SelfTestResult>
  close(): void
}

/** The Sleeper NFL state, as the stats sync reads it. */
export async function fetchStatsState(): Promise<StatsState> {
  const s = await createSleeperClient().getNflState()
  return { season: Number(s.season), week: s.week, seasonType: s.season_type }
}

export async function openStatsService(
  init: StatsWorkerInit,
  onStep: (entry: StatsLogEntry) => void,
  nflState: () => Promise<StatsState> = fetchStatsState
): Promise<StatsService> {
  mkdirSync(init.tempDir, { recursive: true })
  const db = await StatsDb.open(init.path, { tempDirectory: join(init.tempDir, 'duckdb') })
  await bootstrapStatsDb(db, new Date())
  const downloads = createDownloads({ dir: init.tempDir })
  return {
    refresh: (options) =>
      refreshStats({ db, downloads, tempDir: init.tempDir, nflState, onStep }, options),
    /** Stats-analysis spec §3.3: write, read, and a Parquet round trip through the real file. */
    async selfTest() {
      await db.exec('CREATE OR REPLACE TABLE self_test AS SELECT range AS x FROM range(1000)')
      const parquetPath = join(init.tempDir, 'self-test.parquet')
      await db.exec(`COPY self_test TO ${sqlString(parquetPath)} (FORMAT parquet)`)
      const back = await db.get<{ n: number }>(
        `SELECT count(*) AS n FROM read_parquet(${sqlString(parquetPath)})`
      )
      const version = await db.get<{ v: string }>('SELECT version() AS v')
      await db.exec('DROP TABLE self_test')
      return { duckdb: version?.v ?? '?', rows: back?.n ?? 0, parquet: back?.n === 1000 }
    },
    close: () => db.close()
  }
}
```

Apply to `src/main/stats/worker.ts`:

```diff
--- a/src/main/stats/worker.ts
+++ b/src/main/stats/worker.ts
@@ -27,7 +27,7 @@
   }
 }

-openStatsService(workerData as StatsWorkerInit).then(
+openStatsService(workerData as StatsWorkerInit, (entry) => post({ kind: 'step', entry })).then(
   (opened) => {
     service = opened
     port.on('message', (request: StatsRequest) => {
```

Replace `tests/main/stats/service.test.ts` with:

```ts
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openStatsService } from '@main/stats/service'
import { tempDir } from '../../fixtures/stats'

describe('openStatsService', () => {
  it('opens the file, bootstraps it and passes the self-test (stats-analysis spec §3.3)', async () => {
    const dir = tempDir()
    const service = await openStatsService(
      { path: join(dir, 'stats.duckdb'), tempDir: join(dir, 'tmp') },
      () => {},
      async () => ({ season: 2026, week: 6, seasonType: 'regular' })
    )
    try {
      const result = await service.selfTest()
      expect(result).toMatchObject({ rows: 1000, parquet: true })
      expect(result.duckdb).toMatch(/^v1\./)
    } finally {
      service.close()
    }
  })
})
```

- [ ] **Step 2: Wire the app**

Apply to `src/main/ipc/handlers.ts`:

```diff
--- a/src/main/ipc/handlers.ts
+++ b/src/main/ipc/handlers.ts
@@ -23,19 +23,17 @@
 import { tradePool } from '@main/trade/pool'
 import { suggestRuns, type SuggestRuns } from '@main/trade/suggestRun'
 import { normalizeRules } from '@main/scoring/normalize'
+import type { StatsClient } from '@main/stats/client'
 import { recomputePoints } from '@main/scoring/recompute'
 import type { FantasyCalcClient } from '@main/sources/fantasycalc'
 import type { FantasyProsClient } from '@main/sources/fantasypros'
 import type { NflverseClient } from '@main/sources/nflverse'
 import type { SleeperClient } from '@main/sources/sleeper'
-import type { WarehouseClient } from '@main/sources/warehouse/client'
-import { singleFlight, thenInBackground } from '@main/sync/background'
+import { thenInBackground } from '@main/sync/background'
 import { mapLeagueSummary } from '@main/sync/mappers'
 import { STATS_SOURCE_PREFIX } from '@main/sync/nflverseSync'
 import { importAll, refreshAll, type AppSyncDeps } from '@main/sync/refresh'
 import { reimportRules, SOURCE_LEAGUE } from '@main/sync/sleeperSync'
-import { refreshWarehouse } from '@main/sync/warehouseSync'
-import { runPbpWorker } from '@main/warehouse/runWorker'
 import { buildValueSeason, detailFor, type ValueBuild } from '@main/value/build'
 import type { RefreshOptions } from '@main/sync/step'
 import type { UpdateController } from '@main/updater'
@@ -76,10 +74,11 @@
   nflverse: NflverseClient
   fantasypros: FantasyProsClient
   fantasycalc: FantasyCalcClient
-  /** Stats-warehouse downloads (spec 2026-10-09), written to `warehouseDb`; read by nothing yet. */
-  warehouse: WarehouseClient
-  /** `warehouse.db` (spec §10); null when it could not be opened — the app then runs without it. */
-  warehouseDb: Db | null
+  /**
+   * The stats worker and its `stats.duckdb` (stats-analysis spec §2); null when it could not start,
+   * and the app then runs without it. Nothing reads it yet.
+   */
+  stats: StatsClient | null
   news: NewsCache
   getWindow: () => BrowserWindow | null
   update: UpdateController
@@ -181,31 +180,21 @@
 let inFlight: Promise<SyncResult> | null = null

 /**
- * Stats-warehouse spec §4.1: one warehouse run at a time, started after a refresh or import settles.
- * No onStep: nothing reads the warehouse, so its steps neither invalidate caches nor report progress.
+ * Stats-analysis spec §4.4: the stats refresh, one at a time (the client single-flights it). Its
+ * steps log to `stats.duckdb`'s own `sync_log`, so they neither invalidate caches nor reach the
+ * status bar.
  */
-const startWarehouse = singleFlight(
-  async (ctx: AppContext, options: RefreshOptions): Promise<SyncResult> =>
-    ctx.warehouseDb
-      ? refreshWarehouse(
-          {
-            db: ctx.warehouseDb,
-            warehouse: ctx.warehouse,
-            state: getNflState(ctx.db),
-            aggregatePbp: runPbpWorker
-          },
-          options
-        )
-      : { steps: [] }
-)
+export function startStats(ctx: AppContext, options: RefreshOptions = {}): Promise<unknown> {
+  return ctx.stats ? ctx.stats.refresh(options) : Promise.resolve(null)
+}

-function logWarehouseError(err: unknown): void {
-  console.error('warehouse refresh failed', err)
+function logStatsError(err: unknown): void {
+  console.error('stats refresh failed', err)
 }

 /**
  * One refresh at a time: the on-launch refresh and the Refresh button share the same promise. The
- * warehouse starts once it settles; the caller does not wait for the warehouse.
+ * stats refresh starts once it settles; the caller does not wait for it.
  */
 export function startRefresh(ctx: AppContext, options: RefreshOptions = {}): Promise<SyncResult> {
   if (!inFlight) {
@@ -213,8 +202,8 @@
       refreshAll(syncDeps(ctx), options).finally(() => {
         inFlight = null
       }),
-      () => startWarehouse(ctx, options),
-      logWarehouseError
+      () => startStats(ctx, options),
+      logStatsError
     )
   }
   return inFlight
@@ -249,8 +238,8 @@
     (_event, leagueId: string, userId: string | null): Promise<SyncResult> =>
       thenInBackground(
         importAll(syncDeps(ctx), leagueId, userId),
-        () => startWarehouse(ctx, {}),
-        logWarehouseError
+        () => startStats(ctx, {}),
+        logStatsError
       )
   )

```

Apply to `src/main/index.ts`:

```diff
--- a/src/main/index.ts
+++ b/src/main/index.ts
@@ -1,5 +1,5 @@
 import { app, BrowserWindow, dialog, shell } from 'electron'
-import { rmSync, writeFileSync } from 'node:fs'
+import { existsSync, rmSync, writeFileSync } from 'node:fs'
 import { tmpdir } from 'node:os'
 import { join } from 'path'
 import { electronApp, is, optimizer } from '@electron-toolkit/utils'
@@ -7,17 +7,15 @@
 import icon from '../../resources/icon.png?asset'
 import { openDatabase, type Db } from '@main/db/connection'
 import { migrate } from '@main/db/migrate'
-import { openWarehouseDatabase } from '@main/db/warehouseDb'
 import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
-import { registerIpcHandlers, startRefresh, type AppContext } from '@main/ipc/handlers'
+import { registerIpcHandlers, startRefresh, startStats, type AppContext } from '@main/ipc/handlers'
 import { createNewsCache } from '@main/news/newsCache'
 import { createFantasyCalcClient } from '@main/sources/fantasycalc'
 import { createFantasyProsClient } from '@main/sources/fantasypros'
 import { createNflverseClient } from '@main/sources/nflverse'
 import { createSleeperClient } from '@main/sources/sleeper'
-import { createWarehouseClient } from '@main/sources/warehouse/client'
 import { createSleeperNewsClient } from '@main/sources/sleeperNews'
-import { startStatsWorker } from '@main/stats/client'
+import { startStatsWorker, type StatsClient } from '@main/stats/client'
 import { installAutoUpdater } from '@main/updater'
 import { IPC } from '@shared/ipc'

@@ -75,13 +73,25 @@
   }
 }

-/** Stats-warehouse spec §10: a failure here only disables the warehouse, never the app. */
-function openWarehouse(): Db | null {
-  const path = join(app.getPath('userData'), 'warehouse.db')
+/** The stats-warehouse files of v0.20–v0.24, replaced by `stats.duckdb` (stats-analysis spec §4). */
+const RETIRED_FILES = ['warehouse.db', 'warehouse.db-wal', 'warehouse.db-shm']
+
+function retireWarehouse(): void {
+  for (const name of RETIRED_FILES) {
+    const path = join(app.getPath('userData'), name)
+    if (existsSync(path)) rmSync(path, { force: true })
+  }
+}
+
+/** Stats-analysis spec §2: a failure here only disables the stats section, never the app. */
+function openStats(): StatsClient | null {
   try {
-    return openWarehouseDatabase(path)
+    return startStatsWorker({
+      path: join(app.getPath('userData'), 'stats.duckdb'),
+      tempDir: join(app.getPath('userData'), 'stats-tmp')
+    })
   } catch (err) {
-    console.error(`could not open ${path}; the stats warehouse is off`, err)
+    console.error('could not start the stats worker; the stats section is off', err)
     return null
   }
 }
@@ -127,8 +137,7 @@
     nflverse: createNflverseClient(),
     fantasypros: createFantasyProsClient(),
     fantasycalc: createFantasyCalcClient(),
-    warehouse: createWarehouseClient(),
-    warehouseDb: openWarehouse(),
+    stats: openStats(),
     news: createNewsCache(createSleeperNewsClient()),
     getWindow: () => mainWindow,
     update: installAutoUpdater({
@@ -140,9 +149,16 @@
   registerIpcHandlers(ctx)
   createWindow()

+  retireWarehouse()
   if (getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)) {
     startRefresh(ctx).catch((err) => console.error('background refresh failed', err))
+  } else {
+    // Spec §4.4: the stats section works without a league, so its data syncs on its own.
+    startStats(ctx).catch((err) => console.error('stats refresh failed', err))
   }
+  app.on('will-quit', () => {
+    void ctx.stats?.close()
+  })

   app.on('activate', () => {
     if (BrowserWindow.getAllWindows().length === 0) createWindow()
```

Apply to `electron.vite.config.ts`:

```diff
--- a/electron.vite.config.ts
+++ b/electron.vite.config.ts
@@ -11,13 +11,11 @@
     build: {
       rollupOptions: {
         external: ['node:sqlite'],
-        // The trade and waiver searches (6b / 6c spec §6), the play-by-play aggregation
-        // (stats-warehouse spec §6.1) and the stats database (stats-analysis spec §2) run in
-        // worker threads, bundled beside the main entry.
+        // The trade and waiver searches (6b / 6c spec §6) and the stats database (stats-analysis
+        // spec §2) run in worker threads, bundled beside the main entry.
         input: {
           index: resolve('src/main/index.ts'),
           engineWorker: resolve('src/main/engine/worker.ts'),
-          warehouseWorker: resolve('src/main/warehouse/worker.ts'),
           statsWorker: resolve('src/main/stats/worker.ts')
         }
       }
```

Apply to `src/main/sync/step.ts`:

```diff
--- a/src/main/sync/step.ts
+++ b/src/main/sync/step.ts
@@ -14,7 +14,7 @@
   force?: boolean
 }

-/** What `runStep` needs; the warehouse sync has no Sleeper client. */
+/** What `runStep` needs. */
 export type StepDeps = Pick<SyncDeps, 'db' | 'now' | 'onStep'>

 /** Thrown by a step body to record `skipped` (e.g. upstream file not published yet) instead of `error`. */
```

- [ ] **Step 3: Verify, then commit the wiring**

The warehouse code is still there, unused, and still passes its own tests.

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
```

Expected: clean; **927 passed, 5 skipped**.

```bash
npx prettier --write src/main/stats/service.ts src/main/stats/worker.ts tests/main/stats/service.test.ts src/main/index.ts src/main/ipc/handlers.ts electron.vite.config.ts src/main/sync/step.ts
git add src/main/stats/service.ts src/main/stats/worker.ts tests/main/stats/service.test.ts src/main/index.ts src/main/ipc/handlers.ts electron.vite.config.ts src/main/sync/step.ts
git commit -m "feat(stats): run the stats sync in the app"
```

- [ ] **Step 4: Delete the warehouse**

```bash
git rm -rq src/main/warehouse src/main/sources/warehouse src/main/sync/warehouseSync.ts src/main/sync/warehouseSteps.ts src/main/db/repos/warehouse.ts src/main/db/warehouseDb.ts src/main/db/warehouseMigrations tests/main/warehouse tests/main/sources/ffOpportunity.test.ts tests/main/sources/sleeperStats.test.ts tests/main/sources/warehouseClient.test.ts tests/main/sources/warehouseParse.test.ts tests/main/sources/warehouseProfiles.test.ts tests/main/sync/warehouseSteps.test.ts tests/main/sync/warehouseSync.test.ts tests/main/db/warehouseDb.test.ts tests/main/db/warehouseRepo.test.ts tests/fixtures/pbp.ts tests/fixtures/warehouse.ts tests/fixtures/warehouse
grep -rn "warehouse" src --include=*.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
```

Expected:

- The `grep` finds only comments: `syncSources.ts` ("warehouse, identity"), `background.ts` (stats-warehouse spec §4.1), and `index.ts`, `views.ts` and `sources.ts` naming the old warehouse.
- Typecheck and lint are clean; **792 passed, 5 skipped**. The count drops with the deleted warehouse tests.

```bash
git commit -m "refactor: remove the SQLite stats warehouse"
```

---

### Task 8: Live checks

**Files:**

- Throwaway (never committed): `tests/zz-x-live.test.ts`

- [ ] **Step 1: Live backfill and gates**

Create `tests/zz-x-live.test.ts`:

```ts
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { StatsDb } from '@main/stats/db'
import { openStatsService } from '@main/stats/service'

const pct = (v: number): string => (100 * v).toFixed(2)

it('live stats backfill and gates (throwaway; never commit)', { timeout: 1_800_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ffc-x-'))
  const path = join(dir, 'stats.duckdb')
  let peak = 0
  const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 100)
  const start = Date.now()
  const service = await openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
  const result = await service.refresh({})
  service.close()
  clearInterval(timer)
  const fails: string[] = []
  const gate = (ok: boolean, what: string): void => {
    if (!ok) fails.push(what)
  }
  const notOk = result.steps.filter((s) => s.status !== 'ok')
  console.log({
    steps: result.steps.length,
    seconds: Math.round((Date.now() - start) / 1000),
    peakRssMb: Math.round(peak / 1e6),
    fileMb: Math.round(statSync(path).size / 1e6),
    notOk: notOk.map((s) => `${s.source} ${s.status} ${s.message}`),
    notes: result.steps.filter((s) => s.message).map((s) => `${s.source}: ${s.message}`)
  })
  gate(
    notOk.every((s) => s.status === 'skipped' && s.source.startsWith('stats:participation:')),
    'every step ok but current-season participation'
  )
  gate((Date.now() - start) / 1000 <= 600, 'backfill ≤ 10 min')
  gate(statSync(path).size <= 400e6, 'file ≤ 400 MB')

  const db = await StatsDb.open(path)
  const box = await db.all<{ season: number; carries: number; targets: number; rec: number }>(`
      WITH c AS (SELECT season, season_type, week, rusher_player_id AS id, count(*) AS carries
                 FROM plays WHERE is_carry GROUP BY ALL),
      t AS (SELECT season, season_type, week, receiver_player_id AS id, count(*) AS targets,
                   sum(complete_pass) AS rec FROM plays WHERE is_target GROUP BY ALL),
      o AS (SELECT * FROM c FULL JOIN t USING (season, season_type, week, id))
      SELECT s.season, avg((coalesce(o.carries, 0) = coalesce(s.carries, 0))::INT) AS carries,
             avg((coalesce(o.targets, 0) = coalesce(s.targets, 0))::INT) AS targets,
             avg((coalesce(o.rec, 0) = coalesce(s.receptions, 0))::INT) AS rec
      FROM src_player_stats s LEFT JOIN o ON o.id = s.player_id AND o.season = s.season
        AND o.week = s.week AND o.season_type = s.season_type
      GROUP BY 1 ORDER BY 1`)
  console.log(
    'box score',
    box.map((r) => `${r.season} ${pct(r.carries)} ${pct(r.targets)} ${pct(r.rec)}`)
  )
  for (const r of box) gate(Math.min(r.carries, r.targets, r.rec) >= 0.999, `box score ${r.season}`)

  const snaps = await db.all<{ season: number; off1: number; def1: number }>(`
      WITH o AS (SELECT f.season, p.season_type, p.week, f.gsis, sum((f.side = 'O')::INT) AS o_n,
                        sum((f.side = 'D')::INT) AS d_n
                 FROM on_field f JOIN plays p ON p.game_id = f.game_id AND p.play_id = f.play_id
                 WHERE p.is_snap GROUP BY ALL)
      SELECT s.season, avg((abs(coalesce(o.o_n, 0) - s.offense_snaps) <= 1)::INT) AS off1,
             avg((abs(coalesce(o.d_n, 0) - s.defense_snaps) <= 1)::INT) AS def1
      FROM src_snaps s JOIN players pl ON pl.pfr_id = s.pfr_player_id
      LEFT JOIN o ON o.gsis = pl.gsis_id AND o.season = s.season AND o.week = s.week
        AND o.season_type = s.season_type
      WHERE s.season IN (SELECT DISTINCT season FROM on_field)
        AND (s.offense_snaps > 0 OR s.defense_snaps > 0)
      GROUP BY 1 ORDER BY 1`)
  console.log(
    'snaps ±1',
    snaps.map((r) => `${r.season} ${pct(r.off1)} ${pct(r.def1)}`)
  )
  for (const r of snaps) gate(Math.min(r.off1, r.def1) >= 0.985, `snaps ${r.season}`)

  const joins = await db.all<{ src: string; season: number; m: number }>(`
      SELECT 'ftn' AS src, f.season, avg((p.play_id IS NOT NULL)::INT) AS m
      FROM src_ftn f LEFT JOIN src_pbp p USING (game_id, play_id) GROUP BY ALL
      UNION ALL SELECT 'part', x.season, avg((p.play_id IS NOT NULL)::INT)
      FROM src_participation x LEFT JOIN src_pbp p USING (game_id, play_id) GROUP BY ALL
      ORDER BY 1, 2`)
  console.log(
    'joins',
    joins.map((r) => `${r.src} ${r.season} ${pct(r.m)}`)
  )
  for (const r of joins) gate(r.m >= (r.src === 'ftn' ? 1 : 0.98), `${r.src} join ${r.season}`)

  const old = await db.get<{ n: number }>(`
      SELECT (SELECT count(*) FROM games WHERE home_team IN ('OAK', 'SD', 'STL', 'LAR', 'WSH')
                OR away_team IN ('OAK', 'SD', 'STL', 'LAR', 'WSH'))
           + (SELECT count(*) FROM src_snaps WHERE team IN ('OAK', 'LAR', 'WSH'))
           + (SELECT count(*) FROM src_sleeper WHERE team IN ('OAK', 'LAR', 'WSH'))
           + (SELECT count(*) FROM src_sleeper_team WHERE team IN ('OAK', 'LAR', 'WSH'))
           + (SELECT count(*) FROM src_rosters WHERE team IN ('OAK', 'LAR', 'WSH'))
           + (SELECT count(*) FROM src_participation WHERE possession_team IN ('OAK', 'LAR', 'WSH')) AS n`)
  console.log('old team codes left', old?.n)
  gate(old?.n === 0, 'no old team codes (audit fix 2)')

  const post = await db.all<{ week: number }>(
    "SELECT DISTINCT week FROM depth_chart_week WHERE season = 2025 AND season_type = 'POST' ORDER BY week"
  )
  console.log(
    '2025 playoff depth-chart weeks',
    post.map((r) => r.week)
  )
  gate(post.length === 4, '2025 playoff depth charts (audit fix 1)')

  const ids = await db.get<{ scorers: number; mapped: number }>(`
      WITH sc AS (SELECT player_id FROM src_sleeper GROUP BY 1 HAVING sum(coalesce(pts_half_ppr, 0)) > 0)
      SELECT count(*) AS scorers, count(i.gsis_id) AS mapped
      FROM sc LEFT JOIN sleeper_ids i ON i.sleeper_id = sc.player_id`)
  const fix4 = await db.all("SELECT * FROM sleeper_ids WHERE sleeper_id IN ('13324', '11702')")
  console.log('Sleeper scorers mapped', ids, 'Hibner / Coleman', fix4)
  gate((ids?.mapped ?? 0) / (ids?.scorers ?? 1) >= 0.995, 'Sleeper scorers mapped ≥ 99.5 %')
  gate(fix4.length === 2, 'Hibner and Coleman mapped (audit fix 4)')

  const combine = await db.get<{ no_ids: number; resolved: number }>(`
      SELECT count(*) AS no_ids, count(i.gsis_id) AS resolved FROM src_combine c
      LEFT JOIN combine_ids i ON i.season = c.season AND i.player_name = c.player_name
        AND i.school IS NOT DISTINCT FROM c.school
      WHERE c.season >= 2019 AND c.pfr_id IS NULL AND c.cfb_id IS NULL`)
  console.log('combine rows without ids, resolved', combine)
  gate((combine?.resolved ?? 0) >= 60, 'combine rows without ids resolved ≥ 60 (audit fix 3)')
  db.close()

  console.log(fails.length === 0 ? 'ALL GATES PASSED' : `GATES FAILED: ${fails.join('; ')}`)
})
```

Run: `npx vitest run tests/zz-x-live.test.ts --reporter=verbose`

Expected (measured 2026-10-16, state 2026 week 6):

- 127 steps in 135–140 s; peak RSS 1.8–2.0 GB; file 283–285 MB.
- `notOk` is only `stats:participation:<current> skipped participation <current> not published yet`.
- The notes include `stats:pbp:2020: widened goal_to_go INTEGER → DOUBLE` and `stats:identity: views: plays, depth_chart_week`.
- Box score: every season ≥ 99.99 %. Snaps ±1: 99.48–99.98 %. FTN 100 %, participation 98.33–100 %.
- No old team codes. Depth-chart weeks `[19, 20, 21, 22]`. Sleeper scorers 2,853 / 2,857, with Hibner and Coleman mapped. Combine 71 / 95.
- **The last line is `ALL GATES PASSED`.** Otherwise stop and report the failing gates and numbers to the user.
- A step that errors with "fetch failed" or "terminated" is a dropped download. Re-run before judging.

Record the numbers for the Status block. Then `rm tests/zz-x-live.test.ts` and do not commit it.

- [ ] **Step 2: Packaged self-test**

```bash
npx electron-vite build && npx electron-builder --linux dir --publish never
dist/linux-unpacked/fantasy-football-companion --stats-self-test=/tmp/ffc-self-test.json; echo "exit $?"; cat /tmp/ffc-self-test.json
```

Expected: `exit 0` and `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true}`.

- [ ] **Step 3: Standalone launch on an empty profile**

Launch the packaged app on a fresh profile that has no league. Plant a stale `warehouse.db` in it first to check the retirement.

```bash
P=$(mktemp -d) && touch "$P/warehouse.db" "$P/warehouse.db-wal"
timeout 240 dist/linux-unpacked/fantasy-football-companion --user-data-dir="$P" > /tmp/ffc-standalone.log 2>&1; ls "$P"
```

Expected:

- `warehouse.db` and `warehouse.db-wal` are gone.
- `stats.duckdb` (~285 MB) and `stats-tmp/` exist.
- The window may not show under WSLg; the sync runs anyway.

Then read the log with a throwaway `tests/zz-x-profile.test.ts`. Put the profile path in place of `<P>`:

```ts
import { it } from 'vitest'
import { StatsDb } from '@main/stats/db'

it('standalone profile (throwaway; never commit)', async () => {
  const db = await StatsDb.open('<P>/stats.duckdb')
  console.log(
    await db.all(
      'SELECT status, count(*) AS n, min(started_at) AS first, max(finished_at) AS last FROM sync_log GROUP BY 1'
    )
  )
  db.close()
})
```

Run: `npx vitest run tests/zz-x-profile.test.ts --reporter=verbose`

Expected: 126 `ok` and 1 `skipped`, all within about 2–3 minutes of the launch (measured: 2 min 16 s), and no `running` row. Delete the test file and the profile directory.

- [ ] **Step 4: The real dev profile**

Run the app on the dev profile, as the user's install will: `npm run dev`, with the Bash tool's `run_in_background` (see the memory note on WSLg).

- The first launch deletes `~/.config/FantasyCompanion/warehouse.db*` (632 MB).
- It refreshes the league (a league exists), then backfills `stats.duckdb`.

When `stats:identity` appears in its `sync_log`, read the counts as in Step 3 and stop the app (kill the Electron PID, not `pkill -f electron`).

Expected:

- The same step counts as Step 1.
- `companion.db` changed only by its normal refresh.
- No main-process errors other than GPU / zygote noise.

---

### Task 9: Docs

**Files:**

- Create: `docs/reference/stats-database.md`
- Delete: `docs/reference/stats-warehouse.md`
- Modify: `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`, `docs/research/2026-10-14-warehouse-coverage-audit.md`

- [ ] **Step 1: The data reference**

```bash
git rm -q docs/reference/stats-warehouse.md
```

Create `docs/reference/stats-database.md`. Update the measured numbers if Task 8 measured different ones.

````md
# Stats database — data reference

Added in v0.25.0 (Plan X; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §2–§4, amended in §15). It replaces the SQLite stats warehouse of v0.20–v0.24 (`warehouse.db`, deleted on the first launch of v0.25.0). Every stat the free, keyless sources publish, 2019 through the current season, in a DuckDB file, `stats.duckdb` beside `companion.db`. It is about 285 MB after the backfill and settles around 305 MB under daily refreshes (measured 2026-10-16). Deleting the file makes the next refresh rebuild it in 2–3 minutes. **Nothing in the app reads it yet**: Plan Y builds the metric layer and query engine on it.

## Engine

- One worker thread (`out/main/statsWorker.js`, `src/main/stats/worker.ts`) owns the file. The main process talks to it through `StatsClient` (`src/main/stats/client.ts`): `refresh`, `selfTest`, `close`.
- DuckDB `@duckdb/node-api` 1.5.6. Its native binding loads from `app.asar.unpacked` (`asarUnpack` in `electron-builder.yml`). Parquet, JSON and ICU are built in, and no extension is ever downloaded.
- Settings: `memory_limit` 512 MB, 2 threads, `preserve_insertion_order` off, spill files in `<userData>/stats-tmp/duckdb`. The backfill peaks around 1.8 GB of process memory, and a forced daily refresh around 0.8 GB.
- `FantasyCompanion.exe --stats-self-test=<file>` opens a throwaway database in the worker, writes, reads and round-trips Parquet. It writes `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true}` to `<file>` and exits 0. The Release and Package check workflows run it on the Windows build.

## Tables

Source tables keep **every column the source publishes, as published, typed**, including zeros. The only changes are the standard columns below. When a later season adds a column, it is added to the table. When a column's type changes between seasons, it is widened (numbers to `DOUBLE`, anything else to `VARCHAR`), and the step message says so.

Standard columns: `season`; `season_type` (`REG` / `POST`, from nflverse's game types `WC` / `DIV` / `CON` / `SB` where a file has no season type); and team codes normalised to nflverse's current ones (`OAK` → `LV`, `SD` → `LAC`, `STL` / `LAR` → `LA`, `WSH` → `WAS`, `JAC` → `JAX`), in place in the source's own team columns. Id columns keep their published names (`player_id`, `gsis_id`, `pfr_player_id`, …).

| Table                                                        | From                                                                                                                                                                | Grain                    | Id                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------- |
| `games`                                                      | nflverse `schedules/games`                                                                                                                                          | game                     | `game_id`                   |
| `src_players`                                                | nflverse `players/players` (every player, all ids, bio, draft)                                                                                                      | player                   | `gsis_id`                   |
| `src_crosswalk`                                              | DynastyProcess `db_playerids.csv` (all text, `NA` = missing)                                                                                                        | player                   | `sleeper_id`, `gsis_id`, …  |
| `src_combine`                                                | nflverse `combine` (every year)                                                                                                                                     | prospect                 | `pfr_id`, `cfb_id`          |
| `src_player_stats`, `src_team_stats`                         | nflverse `stats_player_week`, `stats_team_week`                                                                                                                     | player- / team-week      | `player_id` (gsis) / `team` |
| `src_snaps`                                                  | nflverse `snap_counts`                                                                                                                                              | player-week              | `pfr_player_id`             |
| `src_ff_opportunity`                                         | ffverse `ep_weekly` (expected fantasy points; team totals in `*_team` columns)                                                                                      | player-week              | `player_id` (gsis)          |
| `src_ngs_passing`, `src_ngs_rushing`, `src_ngs_receiving`    | nflverse `nextgen_stats` (week 0 = season)                                                                                                                          | player-week              | `player_gsis_id`            |
| `src_pfr_pass`, `src_pfr_rush`, `src_pfr_rec`, `src_pfr_def` | nflverse `pfr_advstats` (weekly)                                                                                                                                    | player-week              | `pfr_player_id`             |
| `src_qbr_week`, `src_qbr_season`                             | nflverse `espn_data` (ESPN's nickname moves to `team_name`; `team`, `opponent` are codes; `week` = `game_week`)                                                     | player-week / season     | `player_id` (espn)          |
| `src_injuries`                                               | nflverse `injuries`                                                                                                                                                 | player-week              | `gsis_id`                   |
| `src_depth_charts`                                           | nflverse `depth_charts`, weekly rows through 2024                                                                                                                   | player × slot × week     | `gsis_id`                   |
| `src_depth_chart_snapshots`                                  | nflverse `depth_charts`, timestamped snapshots from 2025                                                                                                            | player × slot × snapshot | `gsis_id`, `espn_id`        |
| `src_rosters`                                                | nflverse `weekly_rosters`                                                                                                                                           | player-week              | `gsis_id`, `sleeper_id`, …  |
| `src_sleeper`, `src_sleeper_def`, `src_sleeper_team`         | Sleeper `api.sleeper.com/stats/nfl/{season}/{week}`: players, fantasy defenses (`player_id` = team), team offense (`TEAM_<code>`); every stat key a `DOUBLE` column | player- / team-week      | `player_id` (sleeper)       |
| `src_sleeper_players`                                        | the same responses: each id's name, position and team that season                                                                                                   | player-season            | `player_id`                 |
| `src_pbp`                                                    | nflverse `pbp/play_by_play` (below)                                                                                                                                 | play                     | `game_id`, `play_id`        |
| `play_players`                                               | built from `src_pbp` (below)                                                                                                                                        | player × role × play     | `gsis`                      |
| `src_ftn`                                                    | nflverse `ftn_charting`, 2022+ (`game_id`, `play_id` from nflverse's)                                                                                               | play                     | `game_id`, `play_id`        |
| `src_participation`                                          | nflverse `pbp_participation`, through the prior season, without its player lists                                                                                    | play                     | `game_id`, `play_id`        |
| `on_field`                                                   | the participation player lists                                                                                                                                      | player × play            | `gsis`                      |
| `players`, `sleeper_ids`, `combine_ids`                      | identity (below)                                                                                                                                                    |                          |                             |
| `sync_log`, `source_state`                                   | the sync's own log and per-source state                                                                                                                             |                          |                             |

## Play-by-play

- **`src_pbp`** keeps 234 of nflverse's 372 columns, including `desc`. Dropped by pattern (`PBP_DROPPED`, `src/main/stats/sources.ts`): running home/away totals, the home/away/defense copies of win probability, the score-type probabilities, clock strings, player-name and jersey copies, per-tackler team columns, and game-level copies already in `games` (coaches, weather, roof, surface, lines, scores). `play_id` is an `INTEGER`. Deleted plays are kept here and filtered by the views.
- **`play_players`**: every player a non-deleted play names, about 2.9 per play. Roles: `passer`, `dropback` (nflfastR's `passer_id`, scrambles and sacks included), `rusher`, `receiver`, `interception`, `sack`, `half_sack`, `qb_hit`, `tackle_for_loss`, `solo_tackle`, `assist_tackle`, `tackle_with_assist`, `pass_defense`, `forced_fumble`, `fumbled`, `fumble_recovery`, `kicker`, `punter`, `kick_returner`, `punt_returner`, `own_kickoff_recovery`, `blocked_kick`, `touchdown`, `safety`, `penalty`, and the `lateral_*` roles.
- **`on_field`**: `season`, `game_id`, `play_id`, `side` (`O` / `D`), `gsis`, `position` (from 2023; NULL before). Every play participation lists, special teams included.

## Views

Recreated after every refresh that loaded rows (a view's `*` is bound when it is created).

- **`plays`**: `src_pbp` without deleted plays, `LEFT JOIN`ed to `src_ftn` and `src_participation` on `game_id` + `play_id`, plus the counting flags of the warehouse spec §11–§12:

| Flag          | Rule                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `counts`      | not wiped out by a penalty (`play_type` ≠ `no_play`) and not a two-point try                                        |
| `is_snap`     | `pass`, `rush`, `qb_kneel` or `qb_spike`; penalty-wiped snaps and two-point tries included (nflverse's snap counts) |
| `is_dropback` | counts, `qb_dropback`, `passer_id` set                                                                              |
| `is_carry`    | counts, a run or a kneel, `rusher_player_id` set                                                                    |
| `is_target`   | counts, `receiver_player_id` set, a pass attempt that is not a sack                                                 |

They reproduce nflverse's own counts. Carries, targets and receptions match `src_player_stats` on 99.99–100 % of player-weeks in every season 2019–2026. Snaps from `on_field` are within one of `src_snaps` on 99.48–99.98 % (offense) and 99.48–99.97 % (defense) every season. FTN rows find their play 100 %, participation 98.3–98.6 % through 2022 (deleted plays) and 100 % after (2026-10-16).

- **`depth_chart_week`**: one row per player × slot × week with `season`, `season_type`, `week`, `gsis_id`, `espn_id`, `team`, `player_name`, `formation`, `position`, `depth`, `snapshot`. Through 2024 it holds nflverse's weekly rows. From 2025, week w takes the last snapshot before that week's first kickoff (games in Eastern time), **playoff weeks included**. A week kicking off after the latest snapshot is left out, except the next one, which takes the latest.

## Identity

Rebuilt after every refresh that loaded rows (`stats:identity` in the log).

- **`players`**: one row per person in nflverse `players`, keyed by `gsis_id`. Columns: `name`, `first_name`, `last_name`, `position`, `position_group`, `birth_date`, `height`, `weight`, `college`, draft (`draft_year`, `draft_round`, `draft_pick`, `draft_team`), `rookie_season`, `last_season`, `team`, `status`, `headshot`, every id (`pfr_id`, `espn_id`, `pff_id`, `nfl_id`, `smart_id`, `sportradar_id`, `fantasypros_id`, `sleeper_id`).
- **`sleeper_ids`** (`sleeper_id`, `gsis_id`, `resolution`), first hit wins:
  1. the crosswalk;
  2. nflverse rosters' own `sleeper_id`;
  3. a name + position-group match (`nameKey`, `src/main/sync/identity.ts`) against nflverse players active that season, taken only when exactly one matches.

  Sleeper players with points: 2,853 of 2,857 mapped (2026-10-16); the rest are junk ids.

- **`combine_ids`** (`season`, `player_name`, `school`, `gsis_id`, `resolution`): by PFR id, else name and draft year, else name and rookie season (the combine year or the next). It resolves 2,415 of 2,749 combine rows since 2019, including 71 of the 95 with neither a PFR nor a college id. Join it to `src_combine` on `season`, `player_name` and `school`.

`nameKey` spells out nickname first names (Matt → Matthew) and compares positions by group (OL ⊇ G / T / C; DL ⊇ DE / DT / NT; LB ⊇ ILB / OLB / MLB; DB ⊇ CB / S / FS / SS). The fantasy side's resolver (`player_ids` in `companion.db`) uses the same key.

## Sync

- **When it runs.**
  - After every refresh and league import, as before.
  - **At launch when no league exists**: the stats section is standalone, and the worker fetches the Sleeper NFL state itself.
  - One run at a time. The Refresh result does not wait for it.
- **Freshness.** These are the warehouse rules, kept:
  - Nothing is retried within 24 h of its last finished attempt, except a forced refresh of the current season and the all-seasons files.
  - The current season and the all-seasons files are refreshed daily, the prior season weekly.
  - Older seasons are fetched once and sealed. A source's `version` bump re-fetches them.
- **Steps.** Each source × season is one step, logged as `stats:<source>:<season>` (or `stats:<source>` for an all-seasons file) in the file's own `sync_log`.
  - A file that is not published (404) is `skipped` and retried the next day; participation for the current season is the usual case.
  - A step replaces its season's rows in one transaction, so a failed load keeps the old rows.
  - Steps still `running` when the app closed are marked `interrupted` on the next open.
- **Downloads.** Parquet from nflverse and ffverse, CSV for the crosswalk, JSON for Sleeper. Files are written to `<userData>/stats-tmp`, read by DuckDB, and deleted. A full backfill downloads about 210 MB of Parquet plus Sleeper's JSON and takes 2–3 minutes. A forced daily refresh runs 24 steps in about 12 s.

## Reading it

```sql
-- Targets per route on the field (past seasons: participation lags a season)
SELECT f.gsis, any_value(pl.name) AS name,
       count(*) FILTER (p.is_dropback) AS routes,
       count(*) FILTER (p.is_target AND p.receiver_player_id = f.gsis) AS targets
FROM on_field f JOIN plays p USING (game_id, play_id) JOIN players pl ON pl.gsis_id = f.gsis
WHERE p.season = 2025 AND p.season_type = 'REG' AND f.side = 'O' AND f.position = 'WR'
GROUP BY f.gsis HAVING routes >= 300 ORDER BY targets / routes DESC LIMIT 10;

-- Yards per catch when the QB was pressured, weeks 4–9
SELECT p.receiver_player_id, count(*) AS catches, round(avg(p.yards_gained), 1) AS ypc
FROM plays p WHERE p.season = 2025 AND p.week BETWEEN 4 AND 9 AND p.is_target
  AND p.complete_pass = 1 AND p.was_pressure
GROUP BY 1 HAVING count(*) >= 5 ORDER BY ypc DESC LIMIT 5;

-- A Sleeper player's weekly half-PPR points and nflverse targets
SELECT s.week, s.pts_half_ppr, ps.targets
FROM src_sleeper s JOIN sleeper_ids i ON i.sleeper_id = s.player_id
LEFT JOIN src_player_stats ps ON ps.player_id = i.gsis_id AND ps.season = s.season AND ps.week = s.week
WHERE s.player_id = '4866' AND s.season = 2025 AND s.season_type = 'REG' ORDER BY s.week;
```
````

- [ ] **Step 2: Spec amendments**

In `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`:

- In the header, change `**Status:** approved 2026-10-16` to `**Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X)`.
- In §4.2, change `| \`play_players\` | ~6 a play |`to`| \`play_players\` | ~3 a play |`.
- Append §15:

```md
## 15. Amendment 2026-10-16: the DuckDB foundation (Plan X)

Measured on the live sources while Plan X was written (its Planning findings), and taken into the build. `docs/reference/stats-database.md` documents the result.

- **A. One step per source.** FTN and participation are their own steps and tables, joined to play-by-play by the `plays` view instead of inside the worker. The per-source due-ness that Plan V needed inside one step is gone.
- **B. Table set (§4.1).**
  - QBR is `src_qbr_week` and `src_qbr_season`.
  - Depth charts are `src_depth_charts` (weekly rows, through 2024) and `src_depth_chart_snapshots` (2025+), read through the `depth_chart_week` view.
  - There is no `src_ff_opportunity_team`: the team totals stay as `*_team` columns of `src_ff_opportunity`, and Plan Y derives team rows.
  - Added: `src_sleeper_players` (each Sleeper id's name and position, for identity) and `play_players`.
- **C. Standard columns** are `season`, `season_type` and team codes normalised in place. Id columns keep their published names. ESPN's nickname column moves to `team_name`.
- **D. Zeros are kept, and types widen** when a season disagrees: numbers to `DOUBLE`, anything else to `VARCHAR`. The step message names the column (`goal_to_go` in 2020).
- **E. Play-by-play keeps 234 of its 372 columns** (§4.2 said about 120), including `desc`. Dropped by pattern: running home/away totals, win-probability copies, score-type probabilities, clock strings, names and jerseys, per-tackler team columns, and game-level copies already in `games`. That halves `src_pbp` (211 → 106 MB).
- **F. `play_players`** holds about 2.9 rows per play (1.0 M rows for 2019–2026).
- **G. Identity (§4.3).**
  - `sleeper_ids` resolves a Sleeper id by the crosswalk, then nflverse rosters' `sleeper_id`, then a name + position-group match among nflverse players active that season, only when exactly one matches.
  - `combine_ids` resolves by PFR id, then name + draft year, then name + rookie season.
  - The name key spells out nicknames and compares positions by group (OL, DL, LB, DB). The fantasy resolver uses the same key.
  - Measured: 2,853 of 2,857 Sleeper players with points mapped, and 71 of the 95 id-less combine rows resolved.
- **H. Engine settings.** `memory_limit` 512 MB (256 MB fails on play-by-play), 2 threads, insertion order not preserved.
  - The backfill: 135–140 s, 283–285 MB, peak process memory 1.8–2.0 GB.
  - A forced daily refresh: 12 s and 0.8 GB, and the file stays at 301–306 MB.
- **I. Logging.**
  - Steps log as `stats:<source>[:<season>]` in `stats.duckdb`'s own `sync_log`.
  - `stats:state` logs a failed NFL-state fetch; `stats:identity` logs the identity and views rebuild.
  - `interrupted` marks steps a closed app left `running`.
- **J. Retirement and launch.** `warehouse.db` is deleted on the first launch of v0.25.0 (nothing read it). Stats refresh at launch when no league exists, and after every refresh or league import otherwise.
- **K. CI.** `--stats-self-test=<file>` runs in the Release workflow and in a `Package check` workflow (`workflow_dispatch`, or a push to `check/**`).
```

- [ ] **Step 3: Close the audit's fixes**

In `docs/research/2026-10-14-warehouse-coverage-audit.md`, add this paragraph right under the title line:

```md
**Status (2026-10-16):** fixes 1–4 are done in Plan X (v0.25.0, `stats.duckdb`). Fix 1: the `depth_chart_week` view (playoff weeks included). Fix 2: team codes are normalised on write. Fix 3: `combine_ids` (71 of the 95 rows resolve). Fix 4: `nameKey` in `src/main/sync/identity.ts`. Fix 5 is moot: snapshot rows keep `espn_id`. The orphan `running` row is now marked `interrupted` on open.
```

- [ ] **Step 4: Commit**

```bash
npx prettier --write docs/reference/stats-database.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md docs/research/2026-10-14-warehouse-coverage-audit.md
git add docs/reference/stats-database.md docs/research/2026-10-14-warehouse-coverage-audit.md
git commit -m "docs: document the DuckDB stats database"
git add docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git commit -m "docs(spec): amend stats spec for plan X"
```

---

### Task 10: Verify, merge, release

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 792 passed, 5 skipped; the build lists `out/main/statsWorker.js`, and no `warehouseWorker.js`.

- [ ] **Step 2: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/stats-duckdb-x` against spec §2–§4, the amendments and the Review Focus list. Fix Critical and Important findings, each in its own commit, re-running Step 1 after them.

- [ ] **Step 3: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/stats-duckdb-x -m "merge: feat/stats-duckdb-x (plan X)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.25.0" && git tag v0.25.0
git branch -d feat/stats-duckdb-x
```

- [ ] **Step 4: Status block**

Replace this plan's Status line with the outcome: merge commit, tag, the Task 8 numbers, review fixes, deferred items, and "not GUI-verified (WSLg)". Commit: `git commit -m "docs(plan): mark plan X complete"` (stage this file only).

- [ ] **Step 5: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.25.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests, the packaged self-test, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.25.0 --draft=false`). The release notes should say that the first launch deletes `warehouse.db` and rebuilds the stats in the background in about 2–3 minutes (about 210 MB download).

---

## Self-review against the spec

- **§2 Architecture.** One process owns DuckDB (the stats worker), and `companion.db` is not attached; worker and client are in Task 1. The fantasy pipeline is unchanged except the shared name key (Task 5).
- **§3 Engine.** DuckDB, TypeScript kept. §3.3's gate is Task 1 Step 9, kept in the Release workflow.
- **§4.1 Source tables.** Every current source is in `FILE_SOURCES` or `sleeper.ts`. Standard columns, new columns and widening are Tasks 2 and 6; the table set changed as amendment B says.
- **§4.2 Plays.** `src_pbp`, `play_players`, `on_field` and `src_ftn` / `src_participation` are Task 6; the `plays` view with the counting flags is Task 4. The Plan U / V agreement gates are re-run in Task 8.
- **§4.3 Identity.** `players`, `sleeper_ids` and `combine_ids` are Task 5. Team codes are normalised on write (Tasks 1 and 6). Audit fixes: 1 in Task 4, 2 in Tasks 1 and 6, 3 and 4 in Task 5.
- **§4.4 Sync.** The freshness rules and Parquet are Task 6. "Runs without a league" is Tasks 6 (`fetchStatsState`) and 7 (launch). The startup sweep is Task 1. Size ≤ 400 MB and backfill ≤ 10 min are gated in Task 8.
- **§11 Testing.** Unit tests per source mapping, counting rule and loader rule; agreement gates; the packaged gate; performance (backfill, size, memory). The query-level budgets of §11 belong to Plans Y–AC.
- **Not in this plan** (by §12): derived tables, the catalogue, the query engine (Y), models (Z), and every screen (AA–AE).
