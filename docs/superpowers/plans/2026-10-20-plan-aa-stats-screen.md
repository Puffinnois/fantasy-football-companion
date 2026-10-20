# Plan AA — Stats analysis: the Stats screen

**Status:** complete 2026-10-20. Merged to main as `0c71f1b` and tagged `v0.28.0` on `63d0321` (not pushed yet). Tasks 1–8 were executed from this text; each task's tests were seen failing, then passing, with the plan's counts plus the 3 of the untracked `tests/shared/playerImage.test.ts`.

Task 9 on the branch: `ALL GATES PASSED`. Boards 35 ms (per game 25 ms); leaderboard tabs 19–70 ms warm, cold within 10 ms of warm; 40 columns 233 ms; qualified counts as in the Planning findings. The walk-through ran on the branch's build with the dev league and without one; every screenshot matched its checklist, and again after the review fixes.

Windows Package check green (`"query":true`) before the review fixes.

Final review (fresh reviewer, Opus): no Critical; 2 Important and 9 Minor findings. Both Important and five Minor were fixed, each test-first in its own commit (`c865ac3` … `b12c267`):

- (Important) The table ranked a count (receiving yards, sacks) among every player with a game while showing only the tab's qualified rows, so nearly every count cell was green. Columns are now ranked among the tab's qualified rows, per position (`rankWithinTab`).
- (Important) A saved view whose sort column left the catalogue made the engine reject its query. Boards are normalised (`normalizeBoard`) when a view opens and before every query.
- A rostered defense marked that team's offense and ratings rows; team ownership now applies on the Defense tab only.
- A row opened from the home could be off screen (below the qualifier or past 50 rows); it is kept and shown.
- The family select always read "this tab", and unchecking every column left stale rows; the select shows the preset, and the last column cannot be removed.
- A malformed board was stored as is, and one corrupt row broke the views list; main validates boards and skips bad rows; a failed delete shows its error.
- The scope reset when switching to Fantasy and back (amendment J); App keeps it.

Deferred (Minor): the "#" and CSV "Rank" are display positions, not the engine's rank, and CSV stays enabled during a refetch; sorting by column head is mouse-only (no keyboard focus); rosters are re-read only when league data changes. 936 tests after the fixes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Companion Stats, the app's second product: its shell, the Stats home and the player and team leaderboards (spec §9.1–§9.2), built from the approved design handoff.

- A shell of its own: the cobalt palette and nav of the handoff (Leaderboards · Players · Teams · Games · Glossary), "Stats ↗" in the Fantasy nav, and the app opens on it when no league is imported.
- The scope every Stats screen shares: season, season type, weeks, scoring.
- The home: the handoff's eight boards, my players marked.
- Player and team leaderboards in the handoff's Ledger table:
  - position or unit tabs, percentile shading, a hover with rank and sample;
  - the catalogue entry and a reliability marker on every column head;
  - qualified only, team, my team or free agents, search;
  - a family filter, a column picker, sort;
  - saved views and CSV export.
- A glossary of the catalogue.
- Ship `v0.28.0`.

**Architecture:**

- **Main.**
  - `companion.db` migration 11: `stats_views` (`src/main/db/repos/statsViews.ts`).
  - `leagueOwnership` (`src/main/db/repos/ownership.ts`): the league's rosters keyed like the stats rows, players by gsis id (`player_ids`), defenses by nflverse code.
  - IPC `stats:ownership`, `stats:views`, `stats:saveView`, `stats:deleteView`, `stats:exportCsv` (a save dialog).
- **Shared.** `StatsOwnership`, `LeaderboardBoard`, `StatsView`; `samples.ts` and `MetricInfo.sampleLabel`, what each sample counts in words.
- **Renderer models** (`src/renderer/src/lib/stats/`, pure and unit-tested).
  - `format.ts`: values by unit, the seven shading steps, the cell hover, reliability words.
  - `scope.ts`: seasons, weeks, the query scope, the freshness line.
  - `boards.ts`: the home's boards. `leaderboard.ts`: tabs, default columns, qualifiers, the query, filters, family presets, CSV.
  - `useStats.ts`: the status, catalogue and rosters every screen reads, and a query hook that drops late answers.
- **Components** (`src/renderer/src/components/stats/`): `controls.tsx`, `StatsNav`, `ScopeBar`, `MetricCard` (the catalogue entry, the reliability marker), `ColumnPicker`, `ViewsMenu`, `LeaderTable`.
- **Screens** (`src/renderer/src/screens/stats/`): `StatsApp` (the shell, the shared scope, saved views), `StatsHome`, `StatsLeaderboard`, `StatsGlossary`.
- **App.** A product switch: Fantasy or Stats; Stats when no league is imported.

**Tech Stack:** Electron 39, React 19, Tailwind 4, `radix-ui` (Popover, HoverCard), TypeScript strict, Vitest (jsdom for components).

**Spec:** `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.1–§9.2, §9.6 and §11 (the Plan AA row of §12), amended by this plan (Task 8 writes the amendments into the spec as §18). Design: the handoff in `docs/design/FantasyCompanion UI/templates/two-products/design_handoff_companion/` (README "Stats (Profile)", "Stats nav", "5. Leaderboards"; `StatsBoards.dc.html`) and the round-1 Ledger table (`../StatsLedger.dc.html`, 3d). The data reference: `docs/reference/stats-database.md`.

## Decisions (user, 2026-10-20)

- **The shell is the handoff's**, not spec §9.1's: Stats is a product of its own with its nav, not a `TopNav` entry with Players, Teams, Explore, Matchups, Saved views.
- **The home is both:** the handoff's eight boards, and "All →" opens a full leaderboard. The full leaderboard is the Ledger mockup with the spec's features: column picker, markers, saved views, CSV, on the query engine.
- Write the plan now; execute it separately.

## Planning findings (live data, 2026-10-20)

Measured on a full `stats.duckdb` (2019 – 2026 week 6, Plan Z's live build) with the code in this plan, and in the built app on scratch profiles (`--user-data-dir`), unless it says otherwise.

- **Speed** is far inside the budgets (§11: dashboard ≤ 300 ms, leaderboard ≤ 500 ms).

| Measure                                           | Result                       |
| ------------------------------------------------- | ---------------------------- |
| The home's eight boards (one query each, at once) | 24–40 ms; on screen in 90 ms |
| A tab's default leaderboard (11–18 metrics)       | 19–85 ms                     |
| The same, in the app from click to table          | 100–210 ms                   |
| A sort (a new query)                              | 120 ms                       |
| 40 metrics over every WR                          | 256–265 ms                   |
| The catalogue                                     | 8 ms                         |
| A cold read (the file just copied, once, RB 2025) | 968 ms                       |

- **"Qualified only" did nothing** on 8 of the 10 player tabs. The engine qualifies a row on the sort metric's sample, and a count (receiving yards, sacks) has games as its sample with no minimum: 2025 WRs, 253 rows either way.
  - Each tab now qualifies on one metric's `minSample`, as the engine scales it (amendment D).
  - 2025: 38 of 82 QBs, 63 of 166 RBs, 110 of 253 WRs, 48 of 144 TEs, 29 of 42 Ks, 194 of 328 DL. 2026 (6 weeks): 34 of 62 QBs, 104 of 215 WRs.
- **Per game read 1 in the games column:** `perGame` divides every count by games, the games metric included. The games column is now the row's own (amendment C).
- **Samples had no words.** The catalogue's 78 sample components are internal names (`x_dropbacks`, `cov_targets`), so "sample on hover" could not say what it counts. `MetricInfo.sampleLabel` names each, and a test fails on a new one without a label (amendment H).
- **Family presets.** A family's core metrics on a tab are often few: Charting has none for a QB, NGS none for defenders. Extended ones fill a preset up to 12, and a family with none on the tab is not offered (DL: no Next Gen).
- **Columns the season lacks.** Pressure rate (participation, published after the season) is empty in 2026. The engine says so in a note; the column head is greyed and its hover says "Not published for 2026 yet."
- **Rosters.** Sleeper ids reach the stats rows through `player_ids.gsis_id` (the fantasy resolver's), defenses through `nflverse_team` (`LAR` → `LA`). Filtering "my team" in the query (`scope.players`) would rank my players among themselves, so the owner filters run on the engine's rows.
- **The design covers less than the spec.** The handoff designs the boards home, a player profile, compare, team and game pages. The leaderboard table is round 1's Ledger (3d, not picked then, chosen now). The column picker, the views menu, the CSV button and the glossary have no mockup: they are built in the handoff's Stats language (tokens, radii, type) and are worth a pass in Claude Design.
- **The app runs here.** Plan Z said "not GUI-verifiable (WSLg)". The built app runs under WSLg with `--ozone-platform=x11` and `--user-data-dir=<scratch profile>`, driven over the DevTools protocol (Task 9 Step 3). Screens checked in light and dark:
  - the home with my players, from the dev league;
  - every player and team tab;
  - the column hover, the picker and a saved view;
  - 2024 and 2026;
  - the glossary;
  - the fantasy League screen with "Stats ↗";
  - a profile without a league: Stats first, no league scoring or roster filters, "Fantasy ↗" to Setup.

## Spec amendments (taken in this plan)

Task 8 Step 3 records these in the spec as §18. **Confirm them with the user before starting Task 1** if they have not been approved yet.

- **A. Two products (§9.1, §9.6).** Stats follows the approved design handoff (2026-10-16, "Companion Stats"), not a `TopNav` entry: its own shell, cobalt palette and nav (Leaderboards · Players · Teams · Games · Glossary).
  - The Fantasy nav gains "Stats ↗"; the Stats nav has "Fantasy ↗", which opens Setup when no league is imported.
  - Games stays disabled until a later plan; Explore and Matchups join the nav with Plans AD and AE.
  - Saved views are a Views menu on the leaderboards and chips on the home, not a nav item.
- **B. The home (§9.2)** is the handoff's eight boards (top six, Totals / Per game, my players marked, my best one under a dashed line when outside the top six). A row needs half the regular-season games in range on top of the metric's qualification. A row or "All →" opens the full leaderboard sorted by that metric.
- **C. The leaderboard table** is the handoff's Ledger (round 1, 3d).
  - The percentile is the cell's shading in seven steps, not a bar; a neutral metric is unshaded. The percentile, rank and sample are in the cell's hover.
  - The reliability marker sits in the column head, since stability is a metric's, not a value's; so does the catalogue entry, on hover.
  - The games column is the row's games: `perGame` of the games metric reads 1.
- **D. Qualification is the tab's.** A count's sample is its games, with no minimum, so "qualified only" changed nothing on 8 of the 10 player tabs. Each tab qualifies a row on one metric's `minSample`, scaled as the engine scales it: QB dropbacks, RB carries, WR and TE targets, K field-goal attempts, P punts, defenders' defensive snaps, All offense's offensive snaps. 2025 measured: 38 of 82 QBs, 110 of 253 WRs. Teams always qualify.
- **E. The family filter** sets the columns to that family's core metrics on the tab (extended ones fill in to 12).
- **F. Custom views** save the board: entity, tab, columns, sort, per game, qualified only, team and owner filter. The season, weeks and scoring stay the screen's, so a view carries over from week to week. A name is unique regardless of case; saving under it replaces the view. Table `stats_views` in `companion.db` (migration 11).
- **G. Rosters.** Main keys the league's rosters by gsis id (`player_ids`) and team defenses by nflverse code (`stats.ownership`). My team and Free agents filter the engine's rows, so percentiles stay among the whole position. My players carry the amber dot, another team's a hollow ring naming it.
- **H. Samples in words.** `MetricInfo.sampleLabel` names what each of the catalogue's 78 samples counts ("routes", "dropbacks faced"), for the hover and for NLQ (§10).
- **I. CSV** holds every row the filters keep: unformatted numbers, percentages in percent, gsis ids. It is saved through a dialog (Downloads by default), in UTF-8 with a byte-order mark for Excel.
- **J. The scope** (season, season type, the regular season's weeks, scoring) is shared by every Stats screen for the session and not saved. Postseason and Both have no week range.
- **K. Measured** (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a 40-column query 265 ms (budgets 300 ms and 500 ms, §11).

## Global Constraints

- **Branch** `feat/stats-screen-aa` off `main`.
- **Commits.** One Conventional Commit per "Commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- **Never stage these.** The working tree has unrelated changes that are not part of this plan: `.gitignore`, `.design-sync/`, `docs/design/FantasyCompanion UI/`, `docs/research/nfl_predictive_metrics.md:Zone.Identifier`, `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts`, `tsconfig.node.tsbuildinfo` and `tsconfig.web.tsbuildinfo`. Stage files by name; never run `git add -A` or `git add .`.
- **Formatting and lint.**
  - Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`** (it rewrites the Sleeper fixtures).
  - Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
  - Typecheck with `npm run typecheck`.
- **Copy the code exactly.** Every new file is given whole, and every change to an existing file as a diff that `git apply` takes as written (save it to a file and run `git apply <file>`, or make the same edit by hand). The tasks were replayed in order on a clean copy of `main`, with typecheck, lint and the full suite green after each. The final tree is byte-identical to the prototype.
- **Test counts** are those of a clean checkout. In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3.
- **Scope.**
  - The fantasy screens do not change, except "Stats ↗" in their nav.
  - The stats engine does not change, except `MetricInfo.sampleLabel` (Task 2).
  - No dashboards (Plans AB, AC), no explorer, compare or trends (AD), no matchups (AE): Games stays disabled in the nav, and a row selects rather than opening a dashboard.
- **Network.** No test touches the network. Task 9's live check opens a copy of the live database offline; its app runs refresh their scratch profiles.
- **Gates.**
  - **Task 9:** the live check ends with `ALL GATES PASSED`, and every screenshot of the walk-through shows what its checklist says.
  - **Task 10 Step 2:** the Windows suite and self-test on the Package check workflow.
  - If a gate fails, stop and report the numbers or the screenshot to the user.
- **Release** `v0.28.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push** (`check/plan-aa` in Task 10, `main` and the tag).

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **A ranking against the wrong population** (percentiles among my team only, a row that does not qualify shaded as if it did). → Task 4: the owner and search filters run on the engine's rows; the qualifier. Task 6: NQ rows hidden, then shown greyed. Task 9: qualified counts per tab.
2. **A number written wrong** (a share not ×100, a per-game count rounded to 0, EPA without its sign, games per game). → Task 3: every unit. Task 4: the games column is not a metric; CSV numbers.
3. **A saved view that breaks later** (a metric renamed, two views of one name). → Task 1: names unique regardless of case, saving replaces. Task 4: an unknown column is dropped from the query.
4. **Wrong roster marks** (a Sleeper id without a gsis id, the Rams' defense). → Task 1: gsis and nflverse keys, `LAR` → `LA`.
5. **The app without a league** (opens on a disabled fantasy screen, offers "My league" scoring, filters by rosters it lacks). → Tasks 5–7. Task 9: the no-league walk-through.
6. **Stale screens after a refresh.** → Task 6: a rebuild re-reads the catalogue and re-runs every query on screen.
7. **A CSV that drops rows or that Excel garbles.** → Task 4: every filtered row, quoting. Task 1: the UTF-8 byte-order mark.
8. **The fantasy screens regress** (a token leaking from the Stats palette, the nav). → The palette is scoped to `.stats` (Task 5). Task 7: the product switch. Task 9: the League screen screenshot.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/stats-screen-aa
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/stats-screen-aa`.

---

### Task 1: Saved views and the league's rosters (spec §9.2; amendments F, G, I)

`companion.db` keeps custom views, and main serves the league's rosters keyed like the stats rows. IPC for both, and for saving a CSV.

**Files:**

- Create: `src/main/db/migrations/011_stats_views.sql`, `src/main/db/repos/statsViews.ts`, `src/main/db/repos/ownership.ts`, `tests/main/db/statsViewsRepo.test.ts`, `tests/main/db/ownershipRepo.test.ts`
- Modify: `src/main/db/migrations/index.ts`, `tests/main/db/migrate.test.ts`, `src/shared/stats/types.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/handlers.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/db/statsViewsRepo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { deleteStatsView, listStatsViews, saveStatsView } from '@main/db/repos/statsViews'
import type { LeaderboardBoard } from '@shared/stats/types'

const board = (over: Partial<LeaderboardBoard> = {}): LeaderboardBoard => ({
  entity: 'player',
  tab: 'WR',
  columns: ['targets', 'target_share', 'yprr'],
  sort: { by: 'yprr', dir: 'desc' },
  perGame: false,
  qualifiedOnly: true,
  team: null,
  owner: 'all',
  ...over
})

describe('stats views repo', () => {
  it('saves, lists by name and deletes', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const wr = saveStatsView(db, '  Slot WRs ', board(), 't1')
    saveStatsView(
      db,
      'Air raid',
      board({ entity: 'team', tab: 'offense', columns: ['proe'] }),
      't1'
    )
    expect(wr).toEqual({ id: wr.id, name: 'Slot WRs', board: board(), updatedAt: 't1' })
    expect(listStatsViews(db).map((v) => v.name)).toEqual(['Air raid', 'Slot WRs'])
    deleteStatsView(db, wr.id)
    expect(listStatsViews(db).map((v) => v.name)).toEqual(['Air raid'])
  })

  it('replaces a view of the same name, whatever its case', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const first = saveStatsView(db, 'Deep threats', board(), 't1')
    const second = saveStatsView(db, 'deep threats', board({ perGame: true }), 't2')
    expect(second.id).toBe(first.id)
    expect(listStatsViews(db)).toEqual([
      { id: first.id, name: 'deep threats', board: board({ perGame: true }), updatedAt: 't2' }
    ])
  })

  it('rejects an empty or long name', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    expect(() => saveStatsView(db, '  ', board(), 't')).toThrow('A view needs a name')
    expect(() => saveStatsView(db, 'x'.repeat(61), board(), 't')).toThrow('at most 60')
  })
})
```

Create `tests/main/db/ownershipRepo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { leagueOwnership } from '@main/db/repos/ownership'
import { replacePlayerIds, type PlayerIdRecord } from '@main/db/repos/playerIds'
import { seedLeague } from '../../fixtures/db'

const ids = (playerId: string, over: Partial<PlayerIdRecord>): PlayerIdRecord => ({
  playerId,
  gsisId: null,
  pfrId: null,
  sportradarId: null,
  espnId: null,
  nflverseTeam: null,
  resolution: 'crosswalk',
  ...over
})

describe('league ownership', () => {
  it('keys rostered players by gsis id and defenses by nflverse code', () => {
    const db = seedLeague()
    replacePlayerIds(
      db,
      [
        ids('4866', { gsisId: '00-0034844' }),
        ids('6794', { gsisId: '00-0036322' }),
        ids('7564', { gsisId: '00-0036900' }),
        ids('LAR', { nflverseTeam: 'LA', resolution: 'team' })
      ],
      't'
    )
    expect(leagueOwnership(db, 'L1')).toEqual({
      players: {
        '00-0034844': { name: 'Cook Book', mine: true },
        '00-0036322': { name: 'Cook Book', mine: true },
        '00-0036900': { name: 'Rival', mine: false }
      },
      teams: { LA: { name: 'Cook Book', mine: true } }
    })
  })

  it('is empty for another league', () => {
    expect(leagueOwnership(seedLeague(), 'L9')).toEqual({ players: {}, teams: {} })
  })
})
```

```diff
diff --git a/tests/main/db/migrate.test.ts b/tests/main/db/migrate.test.ts
index e783c2d..75d54e6 100644
--- a/tests/main/db/migrate.test.ts
+++ b/tests/main/db/migrate.test.ts
@@ -12,7 +12,7 @@ describe('migrate', () => {
         name: string
       }[]
     ).map((r) => r.name)
-    expect(version).toBe(10)
+    expect(version).toBe(11)
     expect(tables).toEqual(
       expect.arrayContaining([
         'app_settings',
@@ -38,6 +38,7 @@ describe('migrate', () => {
         'market_values',
         'trending_adds',
         'sleeper_week_stats',
+        'stats_views',
         'schema_version'
       ])
     )
@@ -48,7 +49,7 @@ describe('migrate', () => {
     migrate(db)
     expect(() => migrate(db)).not.toThrow()
     const row = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number }
-    expect(row.n).toBe(10)
+    expect(row.n).toBe(11)
   })

   it('005 adds crosswalk.fantasypros_id and forgets the crosswalk step so it is re-downloaded', () => {
@@ -70,7 +71,7 @@ describe('migrate', () => {
        VALUES ('nflverse:crosswalk', 't', 't', 'ok', NULL, 10), ('nflverse:games', 't', 't', 'ok', NULL, 1)`
     ).run()

-    expect(migrate(db)).toBe(10)
+    expect(migrate(db)).toBe(11)
     const columns = (db.prepare('PRAGMA table_info(crosswalk)').all() as { name: string }[]).map(
       (c) => c.name
     )
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/main/db
```

Expected: FAIL. The two repos do not exist, and the migrations stop at version 10.

- [ ] **Step 3: The table and the types**

Create `src/main/db/migrations/011_stats_views.sql`:

```sql
-- Stats-analysis spec §9.2: custom views, a named leaderboard (its tab, columns, sort and filters).
-- The season and weeks stay the screen's own, so a view carries over from one week to the next.
CREATE TABLE stats_views (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  board_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

```diff
diff --git a/src/main/db/migrations/index.ts b/src/main/db/migrations/index.ts
index 17b020a..42c94ab 100644
--- a/src/main/db/migrations/index.ts
+++ b/src/main/db/migrations/index.ts
@@ -8,6 +8,7 @@ import injurySql from './007_injury.sql?raw'
 import rosSnapshotsSql from './008_ros_snapshots.sql?raw'
 import waiversSql from './009_waivers.sql?raw'
 import sleeperStatsSql from './010_sleeper_stats.sql?raw'
+import statsViewsSql from './011_stats_views.sql?raw'

 export interface Migration {
   version: number
@@ -25,5 +26,6 @@ export const migrations: Migration[] = [
   { version: 7, name: 'injury', sql: injurySql },
   { version: 8, name: 'ros_snapshots', sql: rosSnapshotsSql },
   { version: 9, name: 'waivers', sql: waiversSql },
-  { version: 10, name: 'sleeper_stats', sql: sleeperStatsSql }
+  { version: 10, name: 'sleeper_stats', sql: sleeperStatsSql },
+  { version: 11, name: 'stats_views', sql: statsViewsSql }
 ]
```

```diff
diff --git a/src/shared/stats/types.ts b/src/shared/stats/types.ts
index 12caa00..88dcca0 100644
--- a/src/shared/stats/types.ts
+++ b/src/shared/stats/types.ts
@@ -295,3 +295,41 @@ export interface PlayerOutlook {
    */
   schedule: { opponents: string[]; easierBy: number | null }
 }
+
+/** Who rosters a player (or a team defense) in the imported league (spec §9.2). */
+export interface StatsOwner {
+  /** The fantasy team's name. */
+  name: string
+  mine: boolean
+}
+
+/** The league's rosters keyed the way the stats rows are: gsis ids and nflverse team codes. */
+export interface StatsOwnership {
+  players: Record<string, StatsOwner>
+  teams: Record<string, StatsOwner>
+}
+
+/** A leaderboard's own settings (spec §9.2): what a custom view saves. */
+export interface LeaderboardBoard {
+  entity: Entity
+  /** A position group for players; `offense`, `defense` or `forecast` for teams. */
+  tab: string
+  /** Catalogue ids, in display order. */
+  columns: string[]
+  /** A column id, or `name`. */
+  sort: { by: string; dir: 'asc' | 'desc' }
+  perGame: boolean
+  qualifiedOnly: boolean
+  /** nflverse team code; null for every team. */
+  team: string | null
+  /** With a league: every row, my team's, or the unrostered. */
+  owner: 'all' | 'mine' | 'free'
+}
+
+/** A custom view: a named leaderboard, saved in `companion.db` (spec §9.2). */
+export interface StatsView {
+  id: number
+  name: string
+  board: LeaderboardBoard
+  updatedAt: string
+}
```

- [ ] **Step 4: The repos**

Create `src/main/db/repos/statsViews.ts`:

```ts
import type { LeaderboardBoard, StatsView } from '@shared/stats/types'
import type { Db } from '../connection'

interface ViewRow {
  id: number
  name: string
  board_json: string
  updated_at: string
}

const toView = (r: ViewRow): StatsView => ({
  id: r.id,
  name: r.name,
  board: JSON.parse(r.board_json) as LeaderboardBoard,
  updatedAt: r.updated_at
})

/** Every custom view, by name. */
export function listStatsViews(db: Db): StatsView[] {
  return (
    db
      .prepare(
        'SELECT id, name, board_json, updated_at FROM stats_views ORDER BY name COLLATE NOCASE'
      )
      .all() as unknown as ViewRow[]
  ).map(toView)
}

/** Saves a view under `name`; a view of the same name (any case) is replaced. */
export function saveStatsView(
  db: Db,
  name: string,
  board: LeaderboardBoard,
  now: string
): StatsView {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('A view needs a name')
  if (trimmed.length > 60) throw new Error('A view name is at most 60 characters')
  const row = db
    .prepare(
      `INSERT INTO stats_views (name, board_json, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET name = excluded.name, board_json = excluded.board_json,
         updated_at = excluded.updated_at
       RETURNING id, name, board_json, updated_at`
    )
    .get(trimmed, JSON.stringify(board), now, now) as unknown as ViewRow
  return toView(row)
}

export function deleteStatsView(db: Db, id: number): void {
  db.prepare('DELETE FROM stats_views WHERE id = ?').run(id)
}
```

Create `src/main/db/repos/ownership.ts`:

```ts
import type { StatsOwner, StatsOwnership } from '@shared/stats/types'
import type { Db } from '../connection'

interface OwnerRow {
  gsis_id: string | null
  nflverse_team: string | null
  owner: string
  is_me: number
}

/**
 * Stats-analysis spec §9.2: the league's rosters keyed like the stats rows, players by gsis id
 * (`player_ids`) and team defenses by nflverse code. A player without a gsis id is left out.
 */
export function leagueOwnership(db: Db, leagueId: string): StatsOwnership {
  const rows = db
    .prepare(
      `SELECT i.gsis_id, i.nflverse_team, COALESCE(t.team_name, t.display_name) AS owner, t.is_me
       FROM roster_players rp
       JOIN teams t ON t.league_id = rp.league_id AND t.roster_id = rp.roster_id
       LEFT JOIN player_ids i ON i.player_id = rp.player_id
       WHERE rp.league_id = ?`
    )
    .all(leagueId) as unknown as OwnerRow[]
  const players: Record<string, StatsOwner> = {}
  const teams: Record<string, StatsOwner> = {}
  for (const r of rows) {
    const owner = { name: r.owner, mine: r.is_me === 1 }
    if (r.nflverse_team) teams[r.nflverse_team] = owner
    else if (r.gsis_id) players[r.gsis_id] = owner
  }
  return { players, teams }
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/main/db
```

Expected: PASS (57 passed).

- [ ] **Step 6: IPC**

```diff
diff --git a/src/shared/ipc.ts b/src/shared/ipc.ts
index b91b9a1..2d77323 100644
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -30,12 +30,15 @@ import type { Rules } from './rules'
 import type {
   GameForecast,
   GamesQuery,
+  LeaderboardBoard,
   MetricInfo,
   OutlookQuery,
   PlayerOutlook,
+  StatsOwnership,
   StatsQuery,
   StatsResult,
-  StatsStatus
+  StatsStatus,
+  StatsView
 } from './stats/types'

 export interface FindLeaguesResult {
@@ -134,6 +137,15 @@ export interface Api {
     status(): Promise<StatsStatus>
     /** Fires when a rebuild finished: screens query again. Returns the unsubscribe function. */
     onChanged(listener: () => void): () => void
+    /** The league's rosters keyed like the stats rows (spec §9.2); null without a league. */
+    ownership(): Promise<StatsOwnership | null>
+    /** Custom views (spec §9.2), by name. */
+    views(): Promise<StatsView[]>
+    /** Saves a view; one of the same name is replaced. Rejects with a readable message. */
+    saveView(name: string, board: LeaderboardBoard): Promise<StatsView>
+    deleteView(id: number): Promise<void>
+    /** Asks where to save a table as CSV and writes it; resolves to the path, null if cancelled. */
+    exportCsv(fileName: string, csv: string): Promise<string | null>
   }
 }

@@ -176,5 +188,10 @@ export const IPC = {
   statsStatus: 'stats:status',
   statsGames: 'stats:games',
   statsOutlook: 'stats:outlook',
-  statsChanged: 'stats:changed'
+  statsChanged: 'stats:changed',
+  statsOwnership: 'stats:ownership',
+  statsViews: 'stats:views',
+  statsSaveView: 'stats:saveView',
+  statsDeleteView: 'stats:deleteView',
+  statsExportCsv: 'stats:exportCsv'
 } as const
```

```diff
diff --git a/src/preload/index.ts b/src/preload/index.ts
index cd5484a..fdaedca 100644
--- a/src/preload/index.ts
+++ b/src/preload/index.ts
@@ -88,7 +88,12 @@ const api: Api = {
       return () => {
         ipcRenderer.removeListener(IPC.statsChanged, handler)
       }
-    }
+    },
+    ownership: () => ipcRenderer.invoke(IPC.statsOwnership),
+    views: () => ipcRenderer.invoke(IPC.statsViews),
+    saveView: (name, board) => ipcRenderer.invoke(IPC.statsSaveView, name, board),
+    deleteView: (id) => ipcRenderer.invoke(IPC.statsDeleteView, id),
+    exportCsv: (fileName, csv) => ipcRenderer.invoke(IPC.statsExportCsv, fileName, csv)
   }
 }

```

```diff
diff --git a/src/main/ipc/handlers.ts b/src/main/ipc/handlers.ts
index b8878c2..e745afd 100644
--- a/src/main/ipc/handlers.ts
+++ b/src/main/ipc/handlers.ts
@@ -1,14 +1,18 @@
-import { app, ipcMain, type BrowserWindow } from 'electron'
+import { writeFile } from 'node:fs/promises'
+import { join } from 'node:path'
+import { app, dialog, ipcMain, type BrowserWindow } from 'electron'
 import { withTransaction, type Db } from '@main/db/connection'
 import { runEngine, runEngineStream } from '@main/engine/runEngine'
 import { listExpertRanks } from '@main/db/repos/expertRanks'
 import { getLeague, leagueRosterPositions } from '@main/db/repos/leagues'
 import { listMatchups } from '@main/db/repos/matchups'
+import { leagueOwnership } from '@main/db/repos/ownership'
 import { playersOptions, playersWeek } from '@main/db/repos/playersWeek'
 import { latestPointsWeek, NO_POINTS_CONTEXT } from '@main/db/repos/points'
 import { getRules, saveRules } from '@main/db/repos/rules'
 import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
 import { getNflState } from '@main/db/repos/state'
+import { deleteStatsView, listStatsViews, saveStatsView } from '@main/db/repos/statsViews'
 import {
   getLastError,
   getLastFinishedLike,
@@ -42,12 +46,15 @@ import type { Rules } from '@shared/rules'
 import type {
   GameForecast,
   GamesQuery,
+  LeaderboardBoard,
   MetricInfo,
   OutlookQuery,
   PlayerOutlook,
+  StatsOwnership,
   StatsQuery,
   StatsResult,
-  StatsStatus
+  StatsStatus,
+  StatsView
 } from '@shared/stats/types'
 import { SYNC_SOURCE_GROUPS } from '@shared/syncSources'
 import type {
@@ -343,6 +350,32 @@ export function registerIpcHandlers(ctx: AppContext): void {
   ipcMain.handle(IPC.statsStatus, (): Promise<StatsStatus> =>
     ctx.stats ? ctx.stats.status() : Promise.resolve(STATS_OFF)
   )
+  ipcMain.handle(IPC.statsOwnership, (): StatsOwnership | null => {
+    const id = activeLeagueId()
+    return id ? leagueOwnership(ctx.db, id) : null
+  })
+  ipcMain.handle(IPC.statsViews, (): StatsView[] => listStatsViews(ctx.db))
+  ipcMain.handle(IPC.statsSaveView, (_event, name: string, board: LeaderboardBoard): StatsView =>
+    saveStatsView(ctx.db, name, board, new Date().toISOString())
+  )
+  ipcMain.handle(IPC.statsDeleteView, (_event, id: number): void => deleteStatsView(ctx.db, id))
+  ipcMain.handle(
+    IPC.statsExportCsv,
+    async (_event, fileName: string, csv: string): Promise<string | null> => {
+      const window = ctx.getWindow()
+      const options = {
+        defaultPath: join(app.getPath('downloads'), fileName),
+        filters: [{ name: 'CSV', extensions: ['csv'] }]
+      }
+      const picked = window
+        ? await dialog.showSaveDialog(window, options)
+        : await dialog.showSaveDialog(options)
+      if (picked.canceled || !picked.filePath) return null
+      // A byte-order mark so Excel reads the names' accents as UTF-8.
+      await writeFile(picked.filePath, `\uFEFF${csv}`, 'utf8')
+      return picked.filePath
+    }
+  )

   ipcMain.handle(IPC.playersOptions, (): PlayersOptions => {
     const id = activeLeagueId()
```

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
```

Expected: clean; 889 passed | 5 skipped.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/main/db/migrations/index.ts src/main/db/repos/statsViews.ts src/main/db/repos/ownership.ts src/shared/stats/types.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts tests/main/db/migrate.test.ts tests/main/db/statsViewsRepo.test.ts tests/main/db/ownershipRepo.test.ts
git add src/main/db/migrations/011_stats_views.sql src/main/db/migrations/index.ts src/main/db/repos/statsViews.ts src/main/db/repos/ownership.ts src/shared/stats/types.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts tests/main/db/migrate.test.ts tests/main/db/statsViewsRepo.test.ts tests/main/db/ownershipRepo.test.ts
git commit -m "feat(stats): save views and read rosters"
```

---

### Task 2: What each sample counts (spec §9.2, §10; amendment H)

**Files:**

- Create: `src/shared/stats/samples.ts`
- Modify: `src/shared/stats/types.ts`, `src/main/stats/engine/registry.ts`, `tests/shared/stats/catalogue.test.ts`, `tests/main/stats/service.test.ts`

- [ ] **Step 1: Write the failing tests**

```diff
diff --git a/tests/shared/stats/catalogue.test.ts b/tests/shared/stats/catalogue.test.ts
index f12c6c4..c0c680e 100644
--- a/tests/shared/stats/catalogue.test.ts
+++ b/tests/shared/stats/catalogue.test.ts
@@ -2,6 +2,7 @@ import { describe, expect, it } from 'vitest'
 import { grainsOf } from '@main/stats/engine/registry'
 import { CATALOGUE, componentsOf } from '@shared/stats/catalogue'
 import { statsQuerySchema } from '@shared/stats/querySchema'
+import { SAMPLE_LABELS } from '@shared/stats/samples'
 import { POSITION_GROUPS } from '@shared/stats/types'

 describe('the metric catalogue (stats-analysis spec §6)', () => {
@@ -67,4 +68,8 @@ describe('the metric catalogue (stats-analysis spec §6)', () => {
     expect(schema.properties.metrics.items?.enum).toHaveLength(CATALOGUE.length)
     expect(Object.keys(schema.properties.situation.properties ?? {})).toContain('withOnField')
   })
+
+  it('names what every sample counts (spec §9.2)', () => {
+    expect(CATALOGUE.filter((m) => !SAMPLE_LABELS[m.sample]).map((m) => m.sample)).toEqual([])
+  })
 })
```

```diff
diff --git a/tests/main/stats/service.test.ts b/tests/main/stats/service.test.ts
index 3d705f5..d1b0266 100644
--- a/tests/main/stats/service.test.ts
+++ b/tests/main/stats/service.test.ts
@@ -173,6 +173,7 @@ describe('the service reads and the league rules (stats-analysis spec §5, §7)'
       expect((await service.query(league)).rows[0].values.fantasy_points.value).toBe(5)
       expect((await service.catalogue()).find((m) => m.id === 'yprr')).toMatchObject({
         grains: ['week', 'season', 'play'],
+        sampleLabel: 'routes',
         stability: null
       })
     } finally {
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/shared/stats tests/main/stats/service.test.ts
```

Expected: FAIL. `@shared/stats/samples` does not exist.

- [ ] **Step 3: The words, served with the catalogue**

Create `src/shared/stats/samples.ts`:

```ts
/**
 * What each metric's sample counts, in words (stats-analysis spec §9.2 "sample on hover", §10):
 * "412 routes", "96 dropbacks faced". Keyed by the catalogue's `sample` component.
 */
export const SAMPLE_LABELS: Readonly<Record<string, string>> = {
  box_known: 'carries with a box count',
  carries: 'carries',
  cov_cmp: 'completions allowed in coverage',
  cov_targets: 'targets in coverage',
  cpoe_n: 'attempts with a completion model',
  db_blitzed: 'dropbacks against the blitz',
  db_ftn: 'charted dropbacks',
  db_play_action: 'play-action dropbacks',
  db_pressure_known: 'dropbacks with pressure charted',
  db_pressured: 'pressured dropbacks',
  deep_att: 'deep attempts',
  def_box_known: 'plays with a box count',
  def_carries: 'carries faced',
  def_coverage_known: 'dropbacks with coverage charted',
  def_designed_runs: 'designed runs faced',
  def_drives: 'drives faced',
  def_dropbacks: 'dropbacks faced',
  def_early_plays: 'early-down plays faced',
  def_fourth_att: 'fourth downs faced',
  def_ftn_dropbacks: 'charted dropbacks faced',
  def_man: 'dropbacks in man coverage',
  def_pass_rushers_n: 'dropbacks with rushers counted',
  def_pass_snaps: 'pass snaps',
  def_plays: 'plays faced',
  def_pressure_known: 'dropbacks faced with pressure charted',
  def_snaps: 'defensive snaps',
  def_third_att: 'third downs faced',
  def_zone: 'dropbacks in zone coverage',
  drives: 'drives',
  dropbacks: 'dropbacks',
  elo_games: 'games with an Elo forecast',
  fg_att: 'field-goal attempts',
  fg_model_att: 'modelled field-goal attempts',
  ftn_att: 'charted attempts',
  games: 'games',
  kickoffs: 'kickoffs',
  kr: 'kick returns',
  ngs_pass_att: 'Next Gen Stats attempts',
  ngs_receptions: 'Next Gen Stats receptions',
  ngs_rush_att: 'Next Gen Stats carries',
  ngs_targets: 'Next Gen Stats targets',
  off_carries: 'carries',
  off_designed_runs: 'designed runs',
  off_dropbacks: 'dropbacks',
  off_early_plays: 'early-down plays',
  off_fourth_att: 'fourth downs',
  off_ftn_dropbacks: 'charted dropbacks',
  off_ftn_plays: 'charted plays',
  off_neutral_plays: 'neutral-situation plays',
  off_neutral_xpass_n: 'neutral-situation plays',
  off_pass_oe_n: 'plays with a pass expectation',
  off_personnel_known: 'plays with personnel charted',
  off_play_action: 'play-action dropbacks',
  off_plays: 'plays',
  off_pressure_known: 'dropbacks with pressure charted',
  off_snaps: 'offensive snaps',
  off_third_att: 'third downs',
  on_def_plays: 'defensive plays on the field',
  on_off_plays: 'offensive plays on the field',
  pace_plays: 'neutral-situation plays',
  pass_air_n: 'attempts with air yards',
  pass_att: 'pass attempts',
  pat_att: 'extra-point attempts',
  pfr_carries: 'charted carries',
  pfr_tackles: 'tackle attempts',
  pr: 'punt returns',
  punts: 'punts',
  punts_pbp: 'punts',
  qbr_plays: 'QBR plays',
  rec_xyac_n: 'receptions with a YAC model',
  receptions: 'receptions',
  routes: 'routes',
  routes_man: 'routes against man',
  routes_zone: 'routes against zone',
  tackle_depth_n: 'tackles with a depth',
  targets: 'targets',
  tgt_contested: 'contested targets',
  tgt_ftn: 'charted targets',
  vegas_games: 'games with a betting line'
}

/** The words for a sample component; its name, spaced, for one not listed. */
export function sampleLabel(component: string): string {
  return SAMPLE_LABELS[component] ?? component.replaceAll('_', ' ')
}
```

```diff
diff --git a/src/shared/stats/types.ts b/src/shared/stats/types.ts
index 88dcca0..d38869c 100644
--- a/src/shared/stats/types.ts
+++ b/src/shared/stats/types.ts
@@ -78,6 +78,8 @@ export interface MetricStability {
 /** A catalogue entry as the engine serves it: the formula left out, where it can be computed added. */
 export interface MetricInfo extends Omit<MetricDef, 'value' | 'sample'> {
   grains: Grain[]
+  /** What the sample counts, in words: "routes", "dropbacks faced". */
+  sampleLabel: string
   /** Null until the models have run, or for a metric without enough seasons. */
   stability: MetricStability | null
 }
```

```diff
diff --git a/src/main/stats/engine/registry.ts b/src/main/stats/engine/registry.ts
index a81a306..2c1774c 100644
--- a/src/main/stats/engine/registry.ts
+++ b/src/main/stats/engine/registry.ts
@@ -1,4 +1,5 @@
 import { CATALOGUE, componentsOf } from '@shared/stats/catalogue'
+import { sampleLabel } from '@shared/stats/samples'
 import type { Entity, Grain, MetricDef, MetricInfo, MetricStability } from '@shared/stats/types'
 import { BOX_COMPONENTS, playerComponentNames } from '../derived/player'
 import { PLAYER_PLAY_COMPONENTS, TEAM_PLAY_COMPONENTS } from '../derived/plays'
@@ -100,6 +101,7 @@ export function catalogueInfo(
     return {
       ...(info as Omit<MetricDef, 'value' | 'sample'>),
       grains: grainsOf(def),
+      sampleLabel: sampleLabel(def.sample),
       stability: stability.get(def.id) ?? null
     }
   })
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/shared/stats tests/main/stats/service.test.ts
```

Expected: PASS (14 passed). Then `npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run`: clean; 890 passed | 5 skipped.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/shared/stats/samples.ts src/shared/stats/types.ts src/main/stats/engine/registry.ts tests/shared/stats/catalogue.test.ts tests/main/stats/service.test.ts
git add src/shared/stats/samples.ts src/shared/stats/types.ts src/main/stats/engine/registry.ts tests/shared/stats/catalogue.test.ts tests/main/stats/service.test.ts
git commit -m "feat(stats): name what each sample counts"
```

---

### Task 3: Values and the scope (spec §9.1, §9.2, §5.3; amendments C, J)

How the Stats screens write a value, its shading and hover; the seasons, weeks and query scope; the freshness line. `tests/fixtures/statsScreens.ts` serves the catalogue as `stats.catalogue()` does, and builds results.

**Files:**

- Create: `src/renderer/src/lib/stats/format.ts`, `src/renderer/src/lib/stats/scope.ts`, `tests/fixtures/statsScreens.ts`, `tests/renderer/lib/statsFormat.test.ts`, `tests/renderer/lib/statsScope.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/fixtures/statsScreens.ts`:

```ts
import { CATALOGUE } from '@shared/stats/catalogue'
import { sampleLabel } from '@shared/stats/samples'
import type {
  MetricDef,
  MetricInfo,
  MetricStability,
  MetricValue,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'

/** The catalogue as `stats.catalogue()` serves it (no formulas; grains and stability stubbed). */
export function catalogue(stability: Record<string, MetricStability> = {}): MetricInfo[] {
  return CATALOGUE.map((def) => {
    const info: Partial<MetricDef> = { ...def }
    delete info.value
    delete info.sample
    return {
      ...(info as Omit<MetricDef, 'value' | 'sample'>),
      grains: ['week', 'season'],
      sampleLabel: sampleLabel(def.sample),
      stability: stability[def.id] ?? null
    }
  })
}

export function catalogueMap(
  stability: Record<string, MetricStability> = {}
): Map<string, MetricInfo> {
  return new Map(catalogue(stability).map((m) => [m.id, m]))
}

export const STATUS: StatsStatus = {
  available: true,
  through: { season: 2026, seasonType: 'REG', week: 6 },
  updatedAt: '2026-10-19T08:00:00.000Z',
  busy: false
}

export function value(v: number | null, over: Partial<MetricValue> = {}): MetricValue {
  return {
    value: v,
    raw: v,
    sample: v === null ? null : 100,
    qualified: v !== null,
    percentile: null,
    rank: null,
    estimated: false,
    ...over
  }
}

export function row(
  id: string,
  name: string,
  values: Record<string, MetricValue>,
  over: Partial<StatsRow> = {}
): StatsRow {
  return { id, name, team: 'SEA', position: 'WR', group: {}, games: 6, values, ...over }
}

/** A result over `metrics` (the catalogue's units), rows in the engine's order. */
export function result(
  metrics: string[],
  rows: StatsRow[],
  over: Partial<StatsResult> = {}
): StatsResult {
  const byId = new Map(CATALOGUE.map((m) => [m.id, m]))
  return {
    grain: 'season',
    columns: metrics.map((id) => {
      const m = byId.get(id)!
      return {
        id,
        label: m.label,
        short: m.short,
        unit: m.unit,
        decimals: m.decimals,
        direction: m.direction,
        seasons: [2026]
      }
    }),
    rows,
    total: rows.length,
    notes: [],
    ms: 12,
    ...over
  }
}
```

Create `tests/renderer/lib/statsFormat.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cellTitle, fmtStat, heatOf, ordinal, reliabilityOf } from '@/lib/stats/format'
import { value } from '../../fixtures/statsScreens'

describe('stats value formatting', () => {
  it('writes each unit as the Stats screens do', () => {
    expect(fmtStat(1714, { unit: 'count', decimals: 0, kind: 'count' })).toBe('1,714')
    expect(fmtStat(285.67, { unit: 'count', decimals: 0, kind: 'count' }, true)).toBe('285.7')
    expect(fmtStat(0.3514, { unit: 'pct', decimals: 1 })).toBe('35.1%')
    expect(fmtStat(0.123, { unit: 'epa', decimals: 3 })).toBe('+0.123')
    expect(fmtStat(-0.05, { unit: 'epa', decimals: 3 })).toBe('−0.050')
    expect(fmtStat(3.14, { unit: 'pp', decimals: 1 })).toBe('+3.1')
    expect(fmtStat(-0.04, { unit: 'pp', decimals: 1 })).toBe('0.0')
    expect(fmtStat(2.714, { unit: 'seconds', decimals: 2 })).toBe('2.71')
    expect(fmtStat(null, { unit: 'yards', decimals: 1 })).toBe('—')
    // A rate is already per play: per game changes nothing.
    expect(fmtStat(8.44, { unit: 'yards', decimals: 1, kind: 'rate' }, true)).toBe('8.4')
  })

  it('shades by percentile in seven steps, never a neutral metric', () => {
    expect([95, 80, 61, 50, 39, 20, 5].map((p) => heatOf(p, 'higher'))).toEqual([
      'h3',
      'h2',
      'h1',
      'n',
      'l1',
      'l2',
      'l3'
    ])
    expect(heatOf(null, 'higher')).toBe('n')
    expect(heatOf(99, 'neutral')).toBe('n')
  })

  it('writes ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 73.4, 100].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '73rd',
      '100th'
    ])
  })

  it('says on hover where a value ranks and what its sample is (spec §9.2)', () => {
    const info = { sampleLabel: 'routes', direction: 'higher' as const }
    expect(cellTitle(value(2.41, { percentile: 92.4, rank: 7, sample: 1412 }), info, 'WR')).toBe(
      '92nd percentile among qualified WRs\nRank 7 among WRs\n1,412 routes'
    )
    expect(
      cellTitle(value(1.9, { qualified: false, sample: 40, estimated: true }), info, 'WR')
    ).toBe(
      '40 routes\nBelow the qualifying sample\nEstimated: participation for this season is not published yet'
    )
    expect(
      cellTitle(
        value(0.12, { percentile: 50, rank: 16, sample: 380 }),
        { sampleLabel: 'plays', direction: 'higher' },
        null
      )
    ).toBe('50th percentile among qualified teams\nRank 16\n380 plays')
  })

  it('words a metric reliability from its stability (spec §8.6)', () => {
    expect(reliabilityOf({ stability: null })).toBeNull()
    expect(
      reliabilityOf({
        stability: { yearToYear: 0.684, pairs: 400, splitHalf: 0.8, prior: 7, reliability: 'high' }
      })
    ).toEqual({
      level: 'high',
      text: 'Reliability high: carries over well from one season to the next (year-to-year r 0.68)'
    })
  })
})
```

Create `tests/renderer/lib/statsScope.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  defaultScope,
  freshness,
  lastWeek,
  minGames,
  queryScope,
  rangeLabel,
  regularWeeks,
  seasonOptions,
  type StatsScope
} from '@/lib/stats/scope'
import { STATUS } from '../../fixtures/statsScreens'

const scope = (over: Partial<StatsScope> = {}): StatsScope => ({
  season: 2026,
  seasonType: 'REG',
  weeks: null,
  scoring: 'ppr',
  ...over
})

describe('the Stats scope (spec §9.1)', () => {
  it('offers every season since 2019, newest first', () => {
    expect(seasonOptions(STATUS)).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020, 2019])
    expect(seasonOptions(null, new Date('2027-03-01'))[0]).toBe(2027)
  })

  it('opens on the latest season, with the league scoring when there is a league', () => {
    expect(defaultScope(STATUS, true)).toEqual(scope({ scoring: 'league' }))
    expect(defaultScope(STATUS, false).scoring).toBe('ppr')
    const preseason = {
      ...STATUS,
      through: { season: 2025, seasonType: 'POST' as const, week: 22 }
    }
    expect(defaultScope(preseason, false).season).toBe(2025)
  })

  it('knows each season length and the week the data runs through', () => {
    expect([2019, 2020, 2021, 2025].map(regularWeeks)).toEqual([17, 17, 18, 18])
    expect(lastWeek(2026, STATUS)).toBe(6)
    expect(lastWeek(2025, STATUS)).toBe(18)
  })

  it('asks for weeks only in a regular season with a range', () => {
    expect(queryScope(scope(), STATUS)).toEqual({ seasons: [2026], seasonType: 'REG' })
    expect(queryScope(scope({ weeks: [2, 9] }), STATUS)).toEqual({
      seasons: [2026],
      seasonType: 'REG',
      weeks: [2, 6]
    })
    expect(queryScope(scope({ seasonType: 'POST', weeks: [2, 4] }), STATUS)).toEqual({
      seasons: [2026],
      seasonType: 'POST'
    })
  })

  it('labels the range and the games the Stats home needs', () => {
    expect(rangeLabel(scope(), STATUS)).toBe('Weeks 1–6')
    expect(rangeLabel(scope({ weeks: [3, 3] }), STATUS)).toBe('Week 3')
    expect(rangeLabel(scope({ season: 2024, seasonType: 'ALL' }), STATUS)).toBe(
      'Season and postseason'
    )
    expect(minGames(scope(), STATUS)).toBe(3)
    expect(minGames(scope({ season: 2025 }), STATUS)).toBe(9)
    expect(minGames(scope({ seasonType: 'POST' }), STATUS)).toBe(1)
  })

  it('says how fresh the data is (spec §5.3)', () => {
    const now = Date.parse('2026-10-19T11:00:00.000Z')
    expect(freshness(STATUS, now)).toBe('Data through 2026 week 6 · updated 3 h ago')
    expect(freshness({ ...STATUS, busy: true }, now)).toBe('Data through 2026 week 6 · updating…')
    expect(
      freshness({ ...STATUS, through: { season: 2025, seasonType: 'POST', week: 22 } }, now)
    ).toBe('Data through the 2025 postseason · updated 3 h ago')
    expect(freshness({ ...STATUS, through: null, busy: true }, now)).toBe('Loading the stats…')
    expect(freshness({ available: false, through: null, updatedAt: null, busy: false })).toBe(
      'Stats unavailable'
    )
    expect(freshness(null)).toBe('')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/renderer/lib/statsFormat.test.ts tests/renderer/lib/statsScope.test.ts
```

Expected: FAIL. `@/lib/stats/format` and `@/lib/stats/scope` do not exist.

- [ ] **Step 3: Write the modules**

Create `src/renderer/src/lib/stats/format.ts`:

```ts
import type { MetricInfo, MetricUnit, MetricValue, StatsResultColumn } from '@shared/stats/types'

/** What a value needs to be written: its unit, decimals and kind (a count can be per game). */
export type ValueFormat = Pick<StatsResultColumn, 'unit' | 'decimals'> & { kind?: 'count' | 'rate' }

const MINUS = '−'

/** Units whose values sit around zero: written with their sign. */
const SIGNED: MetricUnit[] = ['pp', 'epa']

/**
 * A value as the stats screens write it (handoff "Stats", Geist Mono): a fraction as a percentage,
 * a count whole (one decimal per game), EPA and percentage points signed, a real minus sign.
 */
export function fmtStat(value: number | null, f: ValueFormat, perGame = false): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const perGameCount = perGame && f.kind === 'count'
  const decimals = perGameCount ? Math.max(1, f.decimals) : f.decimals
  const shown = f.unit === 'pct' ? value * 100 : value
  let text = Math.abs(shown).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
  if (f.unit === 'pct') text += '%'
  const zero = Number(Math.abs(shown).toFixed(decimals)) === 0
  if (shown < 0 && !zero) return MINUS + text
  if (SIGNED.includes(f.unit) && shown > 0 && !zero) return `+${text}`
  return text
}

/** The 7 shading steps of the Ledger (handoff 3d): ≥90 / ≥75 / ≥60 good, ≤10 / ≤25 / ≤40 bad. */
export type Heat = 'h3' | 'h2' | 'h1' | 'n' | 'l1' | 'l2' | 'l3'

export function heatOf(percentile: number | null, direction: MetricInfo['direction']): Heat {
  if (percentile === null || direction === 'neutral') return 'n'
  if (percentile >= 90) return 'h3'
  if (percentile >= 75) return 'h2'
  if (percentile >= 60) return 'h1'
  if (percentile <= 10) return 'l3'
  if (percentile <= 25) return 'l2'
  if (percentile <= 40) return 'l1'
  return 'n'
}

/** "1st", "22nd", "73rd", "11th". */
export function ordinal(n: number): string {
  const r = Math.round(n)
  const teen = r % 100 >= 11 && r % 100 <= 13
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[r % 10]
  return `${r}${suffix ?? 'th'}`
}

/**
 * A cell's hover (spec §9.2): percentile and rank within the position, the sample in words,
 * whether it qualifies, and the estimate.
 */
export function cellTitle(
  v: MetricValue,
  info: Pick<MetricInfo, 'sampleLabel' | 'direction'>,
  position: string | null
): string {
  const among = position ? `${position}s` : 'teams'
  const lines: string[] = []
  if (v.percentile !== null && info.direction !== 'neutral')
    lines.push(`${ordinal(v.percentile)} percentile among qualified ${among}`)
  if (v.rank !== null) lines.push(`Rank ${v.rank}${position ? ` among ${among}` : ''}`)
  if (v.sample !== null)
    lines.push(`${fmtStat(v.sample, { unit: 'count', decimals: 0 })} ${info.sampleLabel}`)
  if (!v.qualified && v.value !== null) lines.push('Below the qualifying sample')
  if (v.estimated) lines.push('Estimated: participation for this season is not published yet')
  return lines.join('\n')
}

const FAMILY_LABELS: Record<MetricInfo['family'], string> = {
  traditional: 'Traditional',
  advanced: 'Advanced',
  ngs: 'Next Gen',
  charting: 'Charting',
  predictive: 'Predictive'
}

export function familyLabel(family: MetricInfo['family']): string {
  return FAMILY_LABELS[family]
}

/** A metric's reliability (spec §8.6) for its marker, null until the models have measured it. */
export function reliabilityOf(info: Pick<MetricInfo, 'stability'>): {
  level: 'high' | 'medium' | 'low'
  text: string
} | null {
  const s = info.stability
  if (!s?.reliability) return null
  const r = s.yearToYear === null ? '' : ` (year-to-year r ${s.yearToYear.toFixed(2)})`
  const words = { high: 'carries over well', medium: 'carries over partly', low: 'mostly noise' }
  return {
    level: s.reliability,
    text: `Reliability ${s.reliability}: ${words[s.reliability]} from one season to the next${r}`
  }
}
```

Create `src/renderer/src/lib/stats/scope.ts`:

```ts
import { relativeTime } from '@/lib/format'
import type { Scoring } from '@shared/stats/scoring'
import type { StatsQuery, StatsStatus } from '@shared/stats/types'

/** Spec §9.1: the controls every Stats screen shares. */
export interface StatsScope {
  season: number
  seasonType: 'REG' | 'POST' | 'ALL'
  /** Regular-season weeks; null is the whole season (or postseason). */
  weeks: [number, number] | null
  scoring: Scoring
}

/** The warehouse starts in 2019 (spec §4). */
export const FIRST_SEASON = 2019

/** Regular-season weeks: 17 through 2020, 18 since. */
export function regularWeeks(season: number): number {
  return season <= 2020 ? 17 : 18
}

/** The season the data runs through; this calendar year's until the first sync lands. */
export function latestSeason(status: StatsStatus | null, now = new Date()): number {
  return status?.through?.season ?? now.getFullYear()
}

/** Every season with data, newest first. */
export function seasonOptions(status: StatsStatus | null, now = new Date()): number[] {
  const last = latestSeason(status, now)
  return Array.from({ length: last - FIRST_SEASON + 1 }, (_, i) => last - i)
}

/**
 * The last regular-season week with data for `season`: the week the data runs through in its
 * latest season, every week of a sealed one.
 */
export function lastWeek(season: number, status: StatsStatus | null): number {
  const t = status?.through
  if (t && t.season === season && t.seasonType === 'REG') return Math.max(1, t.week)
  return regularWeeks(season)
}

export function defaultScope(status: StatsStatus | null, hasLeague: boolean): StatsScope {
  return {
    season: latestSeason(status),
    seasonType: 'REG',
    weeks: null,
    scoring: hasLeague ? 'league' : 'ppr'
  }
}

/** The weeks a scope covers, clamped to the data. */
export function weeksOf(scope: StatsScope, status: StatsStatus | null): [number, number] {
  const last = lastWeek(scope.season, status)
  const [from, to] = scope.weeks ?? [1, last]
  const a = Math.min(Math.max(1, from), last)
  return [a, Math.min(Math.max(a, to), last)]
}

/** The `scope` part of a query: the season, its type and, in the regular season, the weeks. */
export function queryScope(
  scope: StatsScope,
  status: StatsStatus | null
): Pick<StatsQuery['scope'], 'seasons' | 'seasonType' | 'weeks'> {
  const base = { seasons: [scope.season], seasonType: scope.seasonType }
  if (scope.seasonType !== 'REG' || scope.weeks === null) return base
  return { ...base, weeks: weeksOf(scope, status) }
}

/**
 * Games a row needs on the Stats home (handoff 4d): half the regular-season weeks in range, one in
 * the postseason.
 */
export function minGames(scope: StatsScope, status: StatsStatus | null): number {
  if (scope.seasonType === 'POST') return 1
  const [a, b] = weeksOf(scope, status)
  return Math.max(1, Math.ceil((b - a + 1) / 2))
}

/** "Weeks 1–6", "Week 3", "Postseason", "Season and postseason". */
export function rangeLabel(scope: StatsScope, status: StatsStatus | null): string {
  if (scope.seasonType === 'POST') return 'Postseason'
  if (scope.seasonType === 'ALL') return 'Season and postseason'
  const [a, b] = weeksOf(scope, status)
  return a === b ? `Week ${a}` : `Weeks ${a}–${b}`
}

export const SCORING_LABELS: Record<Scoring, string> = {
  league: 'My league',
  ppr: 'PPR',
  half: 'Half PPR',
  std: 'Standard'
}

/** Spec §5.3: "Data through week 6 · updated 3 h ago", or that a refresh is running. */
export function freshness(status: StatsStatus | null, now = Date.now()): string {
  if (!status) return ''
  if (!status.available) return 'Stats unavailable'
  if (!status.through) return status.busy ? 'Loading the stats…' : 'No stats yet'
  const t = status.through
  const through =
    t.seasonType === 'POST'
      ? `Data through the ${t.season} postseason`
      : `Data through ${t.season} week ${t.week}`
  return status.busy
    ? `${through} · updating…`
    : `${through} · updated ${relativeTime(status.updatedAt, now)}`
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/renderer/lib/statsFormat.test.ts tests/renderer/lib/statsScope.test.ts
```

Expected: PASS (11 passed). Then the typecheck, lint and full suite: clean; 901 passed | 5 skipped.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/src/lib/stats/format.ts src/renderer/src/lib/stats/scope.ts tests/fixtures/statsScreens.ts tests/renderer/lib/statsFormat.test.ts tests/renderer/lib/statsScope.test.ts
git add src/renderer/src/lib/stats/format.ts src/renderer/src/lib/stats/scope.ts tests/fixtures/statsScreens.ts tests/renderer/lib/statsFormat.test.ts tests/renderer/lib/statsScope.test.ts
git commit -m "feat(stats): format values and the screen scope"
```

---

### Task 4: The boards and the leaderboards (spec §9.2; amendments B–E, I)

The home's eight boards and the leaderboards as data: tabs and their default columns, qualifiers, the query, the owner and search filters, the family presets, the header groups and the CSV.

**Files:**

- Create: `src/renderer/src/lib/stats/boards.ts`, `src/renderer/src/lib/stats/leaderboard.ts`, `tests/renderer/lib/statsBoards.test.ts`, `tests/renderer/lib/statsLeaderboard.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/lib/statsBoards.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BOARDS, boardQuery, boardView } from '@/lib/stats/boards'
import type { StatsOwnership } from '@shared/stats/types'
import { result, row, STATUS, value } from '../../fixtures/statsScreens'

const COUNT = { unit: 'count' as const, decimals: 0, kind: 'count' as const }
const scope = { season: 2026, seasonType: 'REG' as const, weeks: null, scoring: 'half' as const }

describe('the Stats home boards (handoff 4d)', () => {
  it('has the eight boards of the handoff', () => {
    expect(BOARDS.map((b) => `${b.label} ${b.title}`)).toEqual([
      'QB Passing yards',
      'QB Yards per attempt',
      'RB Rushing yards',
      'RB Touches',
      'WR Receiving yards',
      'WR Target share',
      'TE Receiving yards',
      'DEF Takeaways'
    ])
  })

  it('asks for every qualified row of the position, per game when asked', () => {
    expect(boardQuery(BOARDS[4], scope, STATUS, true)).toEqual({
      entity: 'player',
      metrics: ['rec_yds'],
      scope: { seasons: [2026], seasonType: 'REG', positions: ['WR'], qualifiedOnly: true },
      transform: 'perGame',
      scoring: 'half',
      limit: 1000
    })
    expect(boardQuery(BOARDS[7], { ...scope, weeks: [1, 4] }, STATUS, false)).toMatchObject({
      entity: 'team',
      metrics: ['def_turnovers'],
      scope: { seasons: [2026], seasonType: 'REG', weeks: [1, 4], qualifiedOnly: true },
      transform: 'raw'
    })
  })

  it('shows the top six with bars against the leader, and my best one below them', () => {
    const rows = [700, 600, 550, 500, 450, 300, 250, 200, null].map((v, i) =>
      row(`p${i}`, `Player ${i}`, { rec_yds: value(v) }, { games: i === 5 ? 2 : 6 })
    )
    const ownership: StatsOwnership = {
      players: { p7: { name: 'Cook Book', mine: true }, p1: { name: 'Rival', mine: false } },
      teams: {}
    }
    const view = boardView(result(['rec_yds'], rows), COUNT, false, 3, ownership, true)
    // Player 5 played two games: below the three the range needs.
    expect(view.rows.map((r) => `${r.rank} ${r.name} ${r.value} ${r.fraction.toFixed(2)}`)).toEqual(
      [
        '1 Player 0 700 1.00',
        '2 Player 1 600 0.86',
        '3 Player 2 550 0.79',
        '4 Player 3 500 0.71',
        '5 Player 4 450 0.64',
        '6 Player 6 250 0.36'
      ]
    )
    expect(view.rows[0].lead).toBe(true)
    expect(view.rows.some((r) => r.mine)).toBe(false)
    expect(view.extra).toMatchObject({ rank: 7, name: 'Player 7', mine: true })
    expect(view.sub).toBe('total')
    expect(view.qualified).toBe(7)
    expect(boardView(result(['rec_yds'], rows), COUNT, false, 3, ownership, false).extra).toBeNull()
  })

  it('marks my team defense on the takeaways board', () => {
    const rows = [row('DEN', 'DEN', { def_turnovers: value(10) }, { position: null })]
    const view = boardView(
      result(['def_turnovers'], rows),
      COUNT,
      true,
      1,
      { players: {}, teams: { DEN: { name: 'Cook Book', mine: true } } },
      true
    )
    expect(view.rows[0]).toMatchObject({ name: 'DEN', value: '10.0', mine: true })
    expect(view.sub).toBe('per game')
  })
})
```

Create `tests/renderer/lib/statsLeaderboard.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  columnGroups,
  csvFileName,
  defaultBoard,
  engineSort,
  familiesOf,
  familyColumns,
  leaderboardCsv,
  leaderboardQuery,
  leaderRows,
  pickable,
  PLAYER_TABS,
  tabOf,
  TEAM_TABS
} from '@/lib/stats/leaderboard'
import type { LeaderboardBoard, StatsOwnership } from '@shared/stats/types'
import { catalogue, catalogueMap, result, row, STATUS, value } from '../../fixtures/statsScreens'

const CAT = catalogueMap()
const scope = {
  season: 2026,
  seasonType: 'REG' as const,
  weeks: [1, 4] as [number, number],
  scoring: 'ppr' as const
}
const wr = (over: Partial<LeaderboardBoard> = {}): LeaderboardBoard => ({
  ...defaultBoard('player', 'WR', CAT),
  ...over
})

describe('the leaderboards (spec §9.2)', () => {
  it('builds every tab from catalogue metrics that apply to it', () => {
    for (const tab of [...PLAYER_TABS, ...TEAM_TABS]) {
      const ids = tab.groups.flatMap(([, g]) => g)
      expect(
        ids.filter((id) => !CAT.has(id)),
        tab.id
      ).toEqual([])
      const offered = new Set(pickable(catalogue(), tab).map((m) => m.id))
      expect(
        ids.filter((id) => !offered.has(id)),
        tab.id
      ).toEqual([])
      if (tab.qualifier) expect(CAT.get(tab.qualifier)?.minSample, tab.id).toBeGreaterThan(0)
    }
    expect(PLAYER_TABS.map((t) => t.id)).toEqual([
      'ALL',
      'QB',
      'RB',
      'WR',
      'TE',
      'K',
      'P',
      'DL',
      'LB',
      'DB'
    ])
    expect(TEAM_TABS.map((t) => t.id)).toEqual(['offense', 'defense', 'forecast'])
  })

  it('opens a tab on its default columns, best first, qualified only', () => {
    expect(wr()).toEqual({
      entity: 'player',
      tab: 'WR',
      columns: [
        'snap_share',
        'route_participation',
        'target_share',
        'air_yards_share',
        'wopr',
        'targets',
        'receptions',
        'rec_yds',
        'rec_td',
        'yprr',
        'tprr',
        'rec_adot',
        'separation',
        'fantasy_ppg',
        'fpoe'
      ],
      sort: { by: 'rec_yds', dir: 'desc' },
      perGame: false,
      qualifiedOnly: true,
      team: null,
      owner: 'all'
    })
    // Lower is better for a defense's EPA allowed.
    expect(defaultBoard('team', 'defense', CAT).sort).toEqual({ by: 'def_epa_play', dir: 'asc' })
    expect(tabOf('player', 'nope').id).toBe('ALL')
  })

  it('queries every row with the tab qualifier, and sorts in the engine', () => {
    expect(
      leaderboardQuery(
        wr({
          columns: ['rec_yds', 'yprr'],
          sort: { by: 'yprr', dir: 'asc' },
          team: 'SEA',
          perGame: true
        }),
        scope,
        STATUS,
        CAT
      )
    ).toEqual({
      entity: 'player',
      metrics: ['rec_yds', 'yprr', 'target_share'],
      scope: {
        seasons: [2026],
        seasonType: 'REG',
        weeks: [1, 4],
        positions: ['WR'],
        teams: ['SEA']
      },
      transform: 'perGame',
      sort: { metric: 'yprr', dir: 'asc' },
      scoring: 'ppr',
      limit: 1000
    })
    // A metric the catalogue no longer has (an old saved view) is left out.
    expect(leaderboardQuery(wr({ columns: ['gone', 'yprr'] }), scope, STATUS, CAT).metrics).toEqual(
      ['yprr', 'target_share']
    )
    const team = leaderboardQuery(defaultBoard('team', 'forecast', CAT), scope, STATUS, CAT)
    expect(team.metrics).not.toContain(undefined)
    expect(team.scope.positions).toBeUndefined()
    // A name sort (or a removed column) sorts the engine by the tab's metric, else the first.
    expect(engineSort(wr({ sort: { by: 'name', dir: 'asc' } }), CAT)).toEqual({
      metric: 'rec_yds',
      dir: 'desc'
    })
    expect(
      engineSort(wr({ columns: ['yprr', 'targets'], sort: { by: 'wopr', dir: 'asc' } }), CAT)
    ).toEqual({
      metric: 'yprr',
      dir: 'desc'
    })
  })

  it('filters by qualification, search and owner, and sorts by name', () => {
    const rows = [
      row('a', 'A.J. Brown', { target_share: value(0.25), yprr: value(2.1) }),
      row('b', 'Amon-Ra St. Brown', { target_share: value(0.29), yprr: value(2.4) }),
      row('c', 'Rookie Depth', {
        target_share: value(0.04, { qualified: false }),
        yprr: value(1.1)
      }),
      row('d', 'Zay Flowers', { target_share: value(0.31), yprr: value(2.2) })
    ]
    const res = result(['yprr', 'target_share'], rows)
    const ownership: StatsOwnership = {
      players: { b: { name: 'Cook Book', mine: true }, d: { name: 'Rival', mine: false } },
      teams: {}
    }
    const names = (
      b: LeaderboardBoard,
      search = '',
      own: StatsOwnership | null = ownership
    ): string[] => leaderRows(res, b, own, search).map((r) => r.name)
    expect(names(wr())).toEqual(['A.J. Brown', 'Amon-Ra St. Brown', 'Zay Flowers'])
    expect(names(wr({ qualifiedOnly: false }))).toHaveLength(4)
    expect(names(wr(), ' brown')).toEqual(['A.J. Brown', 'Amon-Ra St. Brown'])
    expect(names(wr({ owner: 'mine' }))).toEqual(['Amon-Ra St. Brown'])
    expect(names(wr({ owner: 'free' }))).toEqual(['A.J. Brown'])
    expect(names(wr({ owner: 'mine' }), '', null)).toHaveLength(3)
    expect(names(wr({ sort: { by: 'name', dir: 'desc' } }))).toEqual([
      'Zay Flowers',
      'Amon-Ra St. Brown',
      'A.J. Brown'
    ])
  })

  it('groups the header by the tab groups, and added columns by family', () => {
    expect(
      columnGroups(
        ['snap_share', 'target_share', 'targets', 'drops', 'cushion'],
        tabOf('player', 'WR'),
        CAT
      )
    ).toEqual([
      { label: 'Usage', span: 2 },
      { label: 'Receiving', span: 1 },
      { label: 'Charting', span: 1 },
      { label: 'Next Gen', span: 1 }
    ])
  })

  it('offers a family filter with the families a tab has (spec §9.2)', () => {
    const cat = catalogue()
    expect(familiesOf(cat, tabOf('player', 'WR'))).toEqual([
      'traditional',
      'advanced',
      'ngs',
      'charting',
      'predictive'
    ])
    expect(familiesOf(cat, tabOf('player', 'DL'))).not.toContain('ngs')
    const ngs = familyColumns(cat, tabOf('player', 'WR'), 'ngs')
    expect(ngs).toContain('separation')
    expect(ngs.every((id) => CAT.get(id)?.family === 'ngs')).toBe(true)
    const def = familyColumns(cat, tabOf('team', 'defense'), 'advanced')
    expect(def.length).toBeGreaterThan(5)
    expect(def.every((id) => CAT.get(id)?.side === 'defense')).toBe(true)
    // The games are their own column, never a metric one.
    expect(pickable(cat, tabOf('player', 'WR')).some((m) => m.id === 'games')).toBe(false)
  })

  it('exports the rows as CSV, percentages in percent, names quoted when needed', () => {
    const rows = [
      row('00-1', 'Smith, Jr.', {
        target_share: value(0.2519),
        rec_yds: value(95.5)
      }),
      row(
        '00-2',
        'Puka "P" Nacua',
        { target_share: value(null), rec_yds: value(102) },
        { team: 'LA', games: 5 }
      )
    ]
    const board = wr({ columns: ['target_share', 'rec_yds'], perGame: true })
    expect(leaderboardCsv(rows, board, CAT)).toBe(
      'Rank,Player,Team,Position,gsis_id,Games,Target share (%),Receiving yards per game\r\n' +
        '1,"Smith, Jr.",SEA,WR,00-1,6,25.19,95.5\r\n' +
        '2,"Puka ""P"" Nacua",LA,WR,00-2,5,,102\r\n'
    )
    expect(csvFileName(board, { ...scope, season: 2026 }, 'Weeks 1–4')).toBe(
      'stats-2026-wr-weeks-1-4.csv'
    )
    expect(csvFileName(defaultBoard('team', 'forecast', CAT), scope, 'Postseason')).toBe(
      'stats-2026-teams-ratings-odds-postseason.csv'
    )
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/renderer/lib/statsBoards.test.ts tests/renderer/lib/statsLeaderboard.test.ts
```

Expected: FAIL. `@/lib/stats/boards` and `@/lib/stats/leaderboard` do not exist.

- [ ] **Step 3: Write the modules**

Create `src/renderer/src/lib/stats/boards.ts`:

```ts
import type { PositionGroup, StatsOwnership, StatsQuery, StatsResult } from '@shared/stats/types'
import type { StatsStatus } from '@shared/stats/types'
import { fmtStat, type ValueFormat } from './format'
import { queryScope, type StatsScope } from './scope'

/** One card of the Stats home (handoff 4d "Leaderboards"): a metric's top six at a position. */
export interface BoardDef {
  key: string
  /** The chip: a position group, or DEF for team defenses. */
  label: string
  position: PositionGroup | null
  metric: string
  title: string
  /** The leaderboard tab "All →" opens. */
  tab: string
}

/** The handoff's eight boards, on the catalogue's metrics. */
export const BOARDS: BoardDef[] = [
  {
    key: 'qb-yds',
    label: 'QB',
    position: 'QB',
    metric: 'pass_yds',
    title: 'Passing yards',
    tab: 'QB'
  },
  {
    key: 'qb-ypa',
    label: 'QB',
    position: 'QB',
    metric: 'pass_ypa',
    title: 'Yards per attempt',
    tab: 'QB'
  },
  {
    key: 'rb-yds',
    label: 'RB',
    position: 'RB',
    metric: 'rush_yds',
    title: 'Rushing yards',
    tab: 'RB'
  },
  { key: 'rb-tch', label: 'RB', position: 'RB', metric: 'touches', title: 'Touches', tab: 'RB' },
  {
    key: 'wr-yds',
    label: 'WR',
    position: 'WR',
    metric: 'rec_yds',
    title: 'Receiving yards',
    tab: 'WR'
  },
  {
    key: 'wr-tgt',
    label: 'WR',
    position: 'WR',
    metric: 'target_share',
    title: 'Target share',
    tab: 'WR'
  },
  {
    key: 'te-yds',
    label: 'TE',
    position: 'TE',
    metric: 'rec_yds',
    title: 'Receiving yards',
    tab: 'TE'
  },
  {
    key: 'def-to',
    label: 'DEF',
    position: null,
    metric: 'def_turnovers',
    title: 'Takeaways',
    tab: 'defense'
  }
]

/** Rows on a card. */
export const BOARD_ROWS = 6

/**
 * A board's query: every qualified row (my best player may rank outside the top six), sorted by
 * the engine. Counts per game when asked.
 */
export function boardQuery(
  board: BoardDef,
  scope: StatsScope,
  status: StatsStatus | null,
  perGame: boolean
): StatsQuery {
  return {
    entity: board.position ? 'player' : 'team',
    metrics: [board.metric],
    scope: {
      ...queryScope(scope, status),
      ...(board.position ? { positions: [board.position] } : {}),
      qualifiedOnly: true
    },
    transform: perGame ? 'perGame' : 'raw',
    scoring: scope.scoring,
    limit: 1000
  }
}

export interface BoardRow {
  id: string
  rank: number
  name: string
  team: string | null
  value: string
  /** The value over the leader's, for the bar. */
  fraction: number
  lead: boolean
  mine: boolean
}

export interface BoardView {
  rows: BoardRow[]
  /** My best-ranked row when it falls outside the top six (handoff: under a dashed divider). */
  extra: BoardRow | null
  /** "per game" / "total" for counts, nothing for rates. */
  sub: string
  qualified: number
}

/**
 * The card's rows from its result: rows that played `minGames` (handoff: half the games in range)
 * ranked in the engine's order. `mine` marks rows on my fantasy team when `highlight`.
 */
export function boardView(
  result: StatsResult,
  format: ValueFormat,
  perGame: boolean,
  minGames: number,
  ownership: StatsOwnership | null,
  highlight: boolean
): BoardView {
  const metric = result.columns[0]?.id
  const ranked = result.rows.filter(
    (r) => metric && r.values[metric]?.value !== null && r.games >= minGames
  )
  const isMine = (id: string): boolean =>
    highlight && !!(ownership?.players[id]?.mine || ownership?.teams[id]?.mine)
  const leader = ranked[0] ? (ranked[0].values[metric!].value ?? 0) : 0
  const row = (i: number): BoardRow => {
    const r = ranked[i]
    const v = r.values[metric!]
    return {
      id: r.id,
      rank: i + 1,
      name: r.name,
      team: r.team,
      value: fmtStat(v.value, format, perGame),
      fraction: leader ? Math.max(0, Math.min(1, (v.value ?? 0) / leader)) : 0,
      lead: i === 0,
      mine: isMine(r.id)
    }
  }
  const top = ranked.slice(0, BOARD_ROWS).map((_, i) => row(i))
  const mineAt = ranked.findIndex((r) => isMine(r.id))
  return {
    rows: top,
    extra: mineAt >= BOARD_ROWS ? row(mineAt) : null,
    sub: format.kind === 'count' ? (perGame ? 'per game' : 'total') : '',
    qualified: ranked.length
  }
}
```

Create `src/renderer/src/lib/stats/leaderboard.ts`:

```ts
import type {
  Entity,
  LeaderboardBoard,
  MetricFamily,
  MetricInfo,
  PositionGroup,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'
import { familyLabel } from './format'
import { queryScope, type StatsScope } from './scope'

/** A leaderboard tab: positions for players, a unit for teams, and its default columns by group. */
export interface TabDef {
  id: string
  label: string
  entity: Entity
  positions?: PositionGroup[]
  /** Team tabs: which metrics the column picker offers first. */
  sides?: NonNullable<MetricInfo['side']>[]
  groups: [string, string[]][]
  sort: string
  /**
   * The metric whose sample qualifies a row (spec §9.2 "qualified only"): its `minSample`, scaled
   * by the engine to the weeks in scope. Teams always qualify.
   */
  qualifier?: string
}

const OFFENSE: PositionGroup[] = ['QB', 'RB', 'WR', 'TE']
const RECEIVING: [string, string[]][] = [
  ['Usage', ['snap_share', 'route_participation', 'target_share', 'air_yards_share', 'wopr']],
  ['Receiving', ['targets', 'receptions', 'rec_yds', 'rec_td']],
  ['Efficiency', ['yprr', 'tprr', 'rec_adot', 'separation']],
  ['Fantasy', ['fantasy_ppg', 'fpoe']]
]

/** Spec §9.2 players' tabs (the Ledger's position views, every position group). */
export const PLAYER_TABS: TabDef[] = [
  {
    id: 'ALL',
    label: 'All offense',
    entity: 'player',
    positions: OFFENSE,
    groups: [
      ['Usage', ['snap_share', 'touches', 'target_share']],
      ['Production', ['scrimmage_yds', 'total_td']],
      ['Fantasy', ['fantasy_points', 'fantasy_ppg', 'expected_points', 'fpoe']]
    ],
    sort: 'fantasy_points',
    qualifier: 'snap_share'
  },
  {
    id: 'QB',
    label: 'QB',
    entity: 'player',
    positions: ['QB'],
    groups: [
      [
        'Passing',
        ['pass_att', 'pass_cmp_pct', 'pass_yds', 'pass_ypa', 'pass_td', 'pass_int', 'pass_anya']
      ],
      ['Efficiency', ['qb_epa_db', 'qb_success', 'cpoe', 'epa_cpoe_composite', 'qbr']],
      ['Style', ['pass_adot', 'time_to_throw']],
      ['Rushing', ['carries', 'rush_yds', 'rush_td']],
      ['Fantasy', ['fantasy_ppg']]
    ],
    sort: 'pass_yds',
    qualifier: 'qb_epa_db'
  },
  {
    id: 'RB',
    label: 'RB',
    entity: 'player',
    positions: ['RB'],
    groups: [
      ['Usage', ['snap_share', 'carry_share', 'opportunity_share', 'high_value_touches']],
      ['Rushing', ['carries', 'rush_yds', 'rush_ypc', 'rush_td', 'ryoe_att']],
      ['Receiving', ['targets', 'receptions', 'rec_yds']],
      ['Fantasy', ['fantasy_ppg', 'fpoe']]
    ],
    sort: 'rush_yds',
    qualifier: 'carry_share'
  },
  {
    id: 'WR',
    label: 'WR',
    entity: 'player',
    positions: ['WR'],
    groups: RECEIVING,
    sort: 'rec_yds',
    qualifier: 'target_share'
  },
  {
    id: 'TE',
    label: 'TE',
    entity: 'player',
    positions: ['TE'],
    groups: RECEIVING,
    sort: 'rec_yds',
    qualifier: 'target_share'
  },
  {
    id: 'K',
    label: 'K',
    entity: 'player',
    positions: ['K'],
    groups: [
      ['Field goals', ['fg_made', 'fg_att', 'fg_pct', 'fg_pct_40_49', 'fg_pct_50p']],
      ['Model', ['fgoe', 'fgoe_pct']],
      ['Extra points', ['pat_pct']],
      ['Fantasy', ['fantasy_ppg']]
    ],
    sort: 'fg_made',
    qualifier: 'fg_pct'
  },
  {
    id: 'P',
    label: 'P',
    entity: 'player',
    positions: ['P'],
    groups: [
      [
        'Punting',
        ['punts', 'punt_avg', 'punt_net_avg', 'punt_in20_rate', 'punt_tb_rate', 'punter_epa']
      ]
    ],
    sort: 'punt_net_avg',
    qualifier: 'punt_net_avg'
  },
  {
    id: 'DL',
    label: 'DL',
    entity: 'player',
    positions: ['DL'],
    groups: [
      ['Pass rush', ['sacks', 'qb_hits', 'pressures', 'pressure_rate']],
      ['Run defense', ['tackles', 'tfl', 'def_stuffs']],
      ['Playmaking', ['forced_fumbles', 'pass_defended']],
      ['Usage', ['def_snaps', 'def_snap_share']]
    ],
    sort: 'sacks',
    qualifier: 'def_snap_share'
  },
  {
    id: 'LB',
    label: 'LB',
    entity: 'player',
    positions: ['LB'],
    groups: [
      ['Tackling', ['tackles', 'solo_tackles', 'tfl', 'def_stuffs', 'missed_tackle_pct']],
      ['Pass rush', ['sacks', 'pressures']],
      ['Coverage', ['coverage_targets', 'coverage_cmp_pct', 'coverage_ypt', 'coverage_rating']],
      ['Usage', ['def_snap_share']]
    ],
    sort: 'tackles',
    qualifier: 'def_snap_share'
  },
  {
    id: 'DB',
    label: 'DB',
    entity: 'player',
    positions: ['DB'],
    groups: [
      [
        'Coverage',
        ['coverage_targets', 'coverage_cmp_pct', 'coverage_ypt', 'coverage_rating', 'coverage_td']
      ],
      ['Ball', ['def_ints', 'pass_defended']],
      ['Tackling', ['tackles', 'missed_tackle_pct']],
      ['Usage', ['def_snap_share']]
    ],
    sort: 'pass_defended',
    qualifier: 'def_snap_share'
  }
]

/** Spec §9.2 teams' tabs. */
export const TEAM_TABS: TabDef[] = [
  {
    id: 'offense',
    label: 'Offense',
    entity: 'team',
    sides: ['offense', 'special'],
    groups: [
      ['Record', ['wins', 'losses', 'points_for', 'point_diff']],
      [
        'Efficiency',
        [
          'off_epa_play',
          'off_pass_epa',
          'off_rush_epa',
          'off_success_rate',
          'adj_off_epa',
          'points_per_drive'
        ]
      ],
      ['Tendencies', ['proe', 'neutral_pass_rate', 'neutral_pace']]
    ],
    sort: 'off_epa_play'
  },
  {
    id: 'defense',
    label: 'Defense',
    entity: 'team',
    sides: ['defense'],
    groups: [
      ['Record', ['points_against']],
      [
        'Efficiency',
        [
          'def_epa_play',
          'def_pass_epa',
          'def_rush_epa',
          'def_success_rate',
          'adj_def_epa',
          'def_points_per_drive'
        ]
      ],
      ['Pass rush', ['def_sack_rate', 'def_pressure_rate']],
      ['Takeaways', ['def_turnovers']],
      ['Fantasy allowed', ['fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te']]
    ],
    sort: 'def_epa_play'
  },
  {
    id: 'forecast',
    label: 'Ratings & odds',
    entity: 'team',
    groups: [
      ['Ratings', ['elo', 'srs', 'adj_net_epa']],
      ['Season', ['wins', 'losses', 'proj_wins', 'playoff_pct', 'division_pct', 'sb_pct']],
      ['Luck', ['pythag_wins', 'luck_wins', 'turnover_luck']],
      ['Schedule', ['sos_elo', 'sos_left_elo']]
    ],
    sort: 'elo'
  }
]

export function tabsOf(entity: Entity): TabDef[] {
  return entity === 'player' ? PLAYER_TABS : TEAM_TABS
}

export function tabOf(entity: Entity, id: string): TabDef {
  const tabs = tabsOf(entity)
  return tabs.find((t) => t.id === id) ?? tabs[0]
}

/** At most 40 metrics a query (spec §7). */
export const MAX_COLUMNS = 40

/** Rows a leaderboard asks for: the engine's cap. Search and the owner filters work on them. */
export const ROW_LIMIT = 1000

/** The default sort of a metric: best first. */
export function bestFirst(info: MetricInfo | undefined): 'asc' | 'desc' {
  return info?.direction === 'lower' ? 'asc' : 'desc'
}

export function defaultBoard(
  entity: Entity,
  tabId: string,
  catalogue: ReadonlyMap<string, MetricInfo>
): LeaderboardBoard {
  const tab = tabOf(entity, tabId)
  return {
    entity,
    tab: tab.id,
    columns: tab.groups.flatMap(([, ids]) => ids).filter((id) => catalogue.has(id)),
    sort: { by: tab.sort, dir: bestFirst(catalogue.get(tab.sort)) },
    perGame: false,
    qualifiedOnly: true,
    team: null,
    owner: 'all'
  }
}

const FAMILIES: MetricFamily[] = ['traditional', 'advanced', 'ngs', 'charting', 'predictive']

/** The games column is the row's own (a count of games per game would read 1). */
const GAMES = new Set(['games', 'games_played'])

/** Whether a metric belongs on a tab: its positions meet the tab's, or it is a team metric. */
export function appliesTo(info: MetricInfo, tab: TabDef): boolean {
  if (info.entity !== tab.entity || info.tier === 'stored' || GAMES.has(info.id)) return false
  if (tab.entity === 'team') return true
  return info.positions === 'all' || info.positions.some((p) => tab.positions?.includes(p))
}

/**
 * What the column picker offers on a tab (spec §9.2, tiers core and extended): the tab's own unit
 * first for teams, then by family and label.
 */
export function pickable(catalogue: readonly MetricInfo[], tab: TabDef): MetricInfo[] {
  const own = (m: MetricInfo): number =>
    tab.sides && m.side && !tab.sides.includes(m.side) ? 1 : 0
  return catalogue
    .filter((m) => appliesTo(m, tab))
    .sort(
      (a, b) =>
        own(a) - own(b) ||
        FAMILIES.indexOf(a.family) - FAMILIES.indexOf(b.family) ||
        a.label.localeCompare(b.label)
    )
}

/** A family's metrics on a tab (its unit's, for teams), core first; extended fill in up to 12. */
function familyMetrics(
  catalogue: readonly MetricInfo[],
  tab: TabDef,
  family: MetricFamily
): string[] {
  const of = pickable(catalogue, tab).filter(
    (m) => m.family === family && (!tab.sides || !m.side || tab.sides.includes(m.side))
  )
  const core = of.filter((m) => m.tier === 'core')
  const fill = of.filter((m) => m.tier !== 'core').slice(0, Math.max(0, 12 - core.length))
  return [...core, ...fill].map((m) => m.id)
}

/** The families a tab has metrics of, for the family filter. */
export function familiesOf(catalogue: readonly MetricInfo[], tab: TabDef): MetricFamily[] {
  return FAMILIES.filter((f) => familyMetrics(catalogue, tab, f).length > 0)
}

/** Spec §9.2 family filter: one family's metrics on the tab. */
export function familyColumns(
  catalogue: readonly MetricInfo[],
  tab: TabDef,
  family: MetricFamily
): string[] {
  return familyMetrics(catalogue, tab, family).slice(0, MAX_COLUMNS)
}

/** The header groups over the columns: the tab's group names, a family for an added column. */
export function columnGroups(
  columns: readonly string[],
  tab: TabDef,
  catalogue: ReadonlyMap<string, MetricInfo>
): { label: string; span: number }[] {
  const named = new Map(tab.groups.flatMap(([label, ids]) => ids.map((id) => [id, label] as const)))
  const out: { label: string; span: number }[] = []
  for (const id of columns) {
    const info = catalogue.get(id)
    const label = named.get(id) ?? (info ? familyLabel(info.family) : '')
    const last = out[out.length - 1]
    if (last && last.label === label) last.span++
    else out.push({ label, span: 1 })
  }
  return out
}

/** The sort a board's query asks the engine for: its column, or the tab's (by name: the first). */
export function engineSort(
  board: LeaderboardBoard,
  catalogue: ReadonlyMap<string, MetricInfo>
): { metric: string; dir: 'asc' | 'desc' } {
  if (board.sort.by !== 'name' && board.columns.includes(board.sort.by))
    return { metric: board.sort.by, dir: board.sort.dir }
  const tab = tabOf(board.entity, board.tab)
  const metric = board.columns.includes(tab.sort) ? tab.sort : board.columns[0]
  return { metric, dir: bestFirst(catalogue.get(metric)) }
}

export function leaderboardQuery(
  board: LeaderboardBoard,
  scope: StatsScope,
  status: StatsStatus | null,
  catalogue: ReadonlyMap<string, MetricInfo>
): StatsQuery {
  const tab = tabOf(board.entity, board.tab)
  // A saved view may name a metric the catalogue no longer has.
  const columns = board.columns.filter((id) => catalogue.has(id))
  const extra = tab.qualifier && !columns.includes(tab.qualifier) ? [tab.qualifier] : []
  // Qualification is the tab's (see `qualifies`), so the engine returns every row.
  return {
    entity: board.entity,
    metrics: [...columns, ...extra],
    scope: {
      ...queryScope(scope, status),
      ...(tab.positions ? { positions: tab.positions } : {}),
      ...(board.team ? { teams: [board.team] } : {})
    },
    transform: board.perGame ? 'perGame' : 'raw',
    sort: engineSort(board, catalogue),
    scoring: scope.scoring,
    limit: ROW_LIMIT
  }
}

/** A row qualifies when its sample of the tab's qualifier is large enough (teams always do). */
export function qualifies(row: StatsRow, tab: TabDef): boolean {
  return !tab.qualifier || row.values[tab.qualifier]?.qualified === true
}

/** "Brown" finds "A.J. Brown" and "Amon-Ra St. Brown". */
export function searchKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
}

/** The owner of a row in my league, if anyone rosters it. */
export function ownerOf(
  row: Pick<StatsRow, 'id'>,
  entity: Entity,
  ownership: StatsOwnership | null
): { name: string; mine: boolean } | null {
  if (!ownership) return null
  return (entity === 'player' ? ownership.players[row.id] : ownership.teams[row.id]) ?? null
}

/**
 * The rows a leaderboard shows: the engine's, qualified ones only when asked, filtered by the
 * search and (with a league) my team or the free agents, sorted by name when asked.
 */
export function leaderRows(
  result: StatsResult,
  board: LeaderboardBoard,
  ownership: StatsOwnership | null,
  search: string
): StatsRow[] {
  const needle = searchKey(search.trim())
  const tab = tabOf(board.entity, board.tab)
  const rows = result.rows.filter((r) => {
    if (board.qualifiedOnly && !qualifies(r, tab)) return false
    if (needle && !searchKey(r.name).includes(needle)) return false
    if (!ownership || board.owner === 'all') return true
    const owner = ownerOf(r, board.entity, ownership)
    return board.owner === 'mine' ? owner?.mine === true : owner === null
  })
  if (board.sort.by !== 'name') return rows
  const dir = board.sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => a.name.localeCompare(b.name) * dir)
}

const csvCell = (v: string | number | null): string => {
  if (v === null) return ''
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

/**
 * Spec §9.2 CSV export of the table as shown: numbers unformatted (percentages in percent), the
 * rank, identity and games first.
 */
export function leaderboardCsv(
  rows: readonly StatsRow[],
  board: LeaderboardBoard,
  catalogue: ReadonlyMap<string, MetricInfo>
): string {
  const infos = board.columns.map((id) => catalogue.get(id))
  const player = board.entity === 'player'
  const head = [
    'Rank',
    player ? 'Player' : 'Team',
    ...(player ? ['Team', 'Position', 'gsis_id'] : []),
    'Games',
    ...infos.map((m, i) => {
      if (!m) return board.columns[i]
      const per = board.perGame && m.kind === 'count' ? ' per game' : ''
      return `${m.label}${per}${m.unit === 'pct' ? ' (%)' : ''}`
    })
  ]
  const lines = rows.map((r, i) => [
    i + 1,
    r.name,
    ...(player ? [r.team, r.position, r.id] : []),
    r.games,
    ...board.columns.map((id, j) => {
      const v = r.values[id]?.value ?? null
      if (v === null) return null
      const m = infos[j]
      const shown = m?.unit === 'pct' ? v * 100 : v
      return Number(shown.toFixed((m?.decimals ?? 2) + 2))
    })
  ])
  return [head, ...lines].map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** "stats-2026-wr-weeks-1-6.csv". */
export function csvFileName(board: LeaderboardBoard, scope: StatsScope, range: string): string {
  const slug = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  const tab = tabOf(board.entity, board.tab)
  return `stats-${scope.season}-${slug(board.entity === 'team' ? `teams ${tab.label}` : tab.label)}-${slug(range)}.csv`
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/renderer/lib/statsBoards.test.ts tests/renderer/lib/statsLeaderboard.test.ts
```

Expected: PASS (11 passed). Then the typecheck, lint and full suite: clean; 912 passed | 5 skipped.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/src/lib/stats/boards.ts src/renderer/src/lib/stats/leaderboard.ts tests/renderer/lib/statsBoards.test.ts tests/renderer/lib/statsLeaderboard.test.ts
git add src/renderer/src/lib/stats/boards.ts src/renderer/src/lib/stats/leaderboard.ts tests/renderer/lib/statsBoards.test.ts tests/renderer/lib/statsLeaderboard.test.ts
git commit -m "feat(stats): model the boards and leaderboards"
```

---

### Task 5: The Stats shell, palette and controls (spec §9.1, §9.6, §5.3; amendment A)

The handoff's Stats tokens, scoped to `.stats` so the fantasy screens keep theirs; the nav; the scope bar; the shared controls; the catalogue card and reliability marker; the data hooks.

**Files:**

- Create: `src/renderer/src/components/stats/controls.tsx`, `src/renderer/src/components/stats/StatsNav.tsx`, `src/renderer/src/components/stats/ScopeBar.tsx`, `src/renderer/src/components/stats/MetricCard.tsx`, `src/renderer/src/lib/stats/useStats.ts`, `tests/renderer/components/StatsShell.test.tsx`
- Modify: `src/renderer/src/assets/main.css`

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/components/StatsShell.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { ScopeBar } from '@/components/stats/ScopeBar'
import { StatsNav } from '@/components/stats/StatsNav'
import type { StatsScope } from '@/lib/stats/scope'
import type { UpdateState } from '@shared/types'
import { STATUS } from '../../fixtures/statsScreens'

afterEach(cleanup)

const SCOPE: StatsScope = { season: 2026, seasonType: 'REG', weeks: null, scoring: 'league' }
const options = (name: string): string[] =>
  within(screen.getByRole('combobox', { name }))
    .getAllByRole('option')
    .map((o) => o.textContent ?? '')

describe('the Stats scope bar (spec §9.1)', () => {
  it('offers the seasons, the weeks with data and the scorings', () => {
    render(<ScopeBar scope={SCOPE} status={STATUS} hasLeague onChange={() => {}} />)
    expect(options('Season')).toEqual([
      '2026',
      '2025',
      '2024',
      '2023',
      '2022',
      '2021',
      '2020',
      '2019'
    ])
    expect(options('To week')).toHaveLength(6)
    expect(options('Fantasy scoring')).toEqual(['My league', 'PPR', 'Half PPR', 'Standard'])
  })

  it('narrows the weeks, keeps them ordered, and resets them with the season', () => {
    const onChange = vi.fn()
    const bar = (scope: StatsScope): React.JSX.Element => (
      <ScopeBar scope={scope} status={STATUS} hasLeague onChange={onChange} />
    )
    const { rerender } = render(bar({ ...SCOPE, weeks: [2, 4] }))
    const pick = (name: string, value: string): void => {
      fireEvent.change(screen.getByRole('combobox', { name }), { target: { value } })
    }
    pick('From week', '5')
    expect(onChange).toHaveBeenLastCalledWith({ ...SCOPE, weeks: [5, 5] })
    pick('To week', '1')
    expect(onChange).toHaveBeenLastCalledWith({ ...SCOPE, weeks: [1, 1] })
    rerender(bar({ ...SCOPE, weeks: [1, 4] }))
    // Weeks 1 to the last with data is the whole season.
    pick('To week', '6')
    expect(onChange).toHaveBeenLastCalledWith({ ...SCOPE, weeks: null })
    pick('Season', '2024')
    expect(onChange).toHaveBeenLastCalledWith({ ...SCOPE, season: 2024, weeks: null })
  })

  it('has no weeks in the postseason and no league scoring without a league', () => {
    render(
      <ScopeBar
        scope={{ ...SCOPE, seasonType: 'POST', scoring: 'ppr' }}
        status={STATUS}
        hasLeague={false}
        onChange={() => {}}
      />
    )
    expect(screen.queryByRole('combobox', { name: 'From week' })).toBeNull()
    expect(options('Fantasy scoring')).toEqual(['PPR', 'Half PPR', 'Standard'])
  })
})

describe('the Stats nav', () => {
  it('shows the screens, the freshness line and the way back to Fantasy', () => {
    const onNavigate = vi.fn()
    const onOpenFantasy = vi.fn()
    render(
      <StatsNav
        current="home"
        onNavigate={onNavigate}
        status={{ ...STATUS, busy: true }}
        hasLeague={false}
        onOpenFantasy={onOpenFantasy}
        update={{ status: 'idle' } as UpdateState}
        version="0.28.0"
        onOpenUpdate={() => {}}
        onToggleTheme={() => {}}
      />
    )
    expect(screen.getByRole('button', { name: 'Leaderboards' }).getAttribute('aria-current')).toBe(
      'page'
    )
    expect((screen.getByRole('button', { name: 'Games' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Glossary' }))
    expect(onNavigate).toHaveBeenCalledWith('glossary')
    expect(screen.getByText('Data through 2026 week 6 · updating…')).toBeTruthy()
    const fantasy = screen.getByRole('button', { name: /Fantasy ↗/ })
    expect(fantasy.title).toBe('Import a Sleeper league in Fantasy')
    fireEvent.click(fantasy)
    expect(onOpenFantasy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/renderer/components/StatsShell.test.tsx
```

Expected: FAIL. `@/components/stats/ScopeBar` does not exist.

- [ ] **Step 3: The palette**

```diff
diff --git a/src/renderer/src/assets/main.css b/src/renderer/src/assets/main.css
index 044af4f..c4dd55a 100644
--- a/src/renderer/src/assets/main.css
+++ b/src/renderer/src/assets/main.css
@@ -93,6 +93,58 @@
   --shadow-c: rgba(0, 0, 0, 0.5);
 }

+/*
+ * Companion Stats "Profile" palette (design handoff 2026-10-16, README "Stats (Profile)"): the Stats
+ * shell carries `.stats`, which re-points the shared tokens and adds cobalt, row lines, the selected
+ * row and the Ledger's percentile shading. Popovers portalled out of the shell carry `.stats` too.
+ */
+.stats {
+  --paper: oklch(0.993 0.002 250);
+  --panel: oklch(1 0 0);
+  --panel-2: oklch(0.972 0.004 250);
+  --line: oklch(0.915 0.005 250);
+  --line-2: oklch(0.945 0.004 250);
+  --hover: oklch(0.975 0.006 255);
+  --sel: oklch(0.95 0.03 262);
+  --fg: oklch(0.19 0.012 255);
+  --fg-2: oklch(0.42 0.014 255);
+  --fg-3: oklch(0.54 0.014 255);
+  --cobalt: oklch(0.52 0.2 262);
+  --on-cobalt: oklch(1 0 0);
+  --cobalt-soft: oklch(0.52 0.2 262 / 0.09);
+  --shadow-c: rgba(20, 30, 50, 0.12);
+  --h1: oklch(0.945 0.04 150);
+  --h2: oklch(0.89 0.075 150);
+  --h3: oklch(0.83 0.11 150);
+  --l1: oklch(0.95 0.03 25);
+  --l2: oklch(0.905 0.06 25);
+  --l3: oklch(0.85 0.1 25);
+}
+
+.dark .stats {
+  --paper: oklch(0.165 0.008 255);
+  --panel: oklch(0.19 0.009 255);
+  --panel-2: oklch(0.22 0.01 255);
+  --line: oklch(0.28 0.01 255);
+  --line-2: oklch(0.235 0.01 255);
+  --hover: oklch(0.215 0.012 255);
+  --sel: oklch(0.26 0.05 262);
+  --fg: oklch(0.96 0.004 255);
+  --fg-2: oklch(0.77 0.01 255);
+  --fg-3: oklch(0.62 0.012 255);
+  --cobalt: oklch(0.7 0.15 262);
+  --on-cobalt: oklch(0.16 0.03 262);
+  --cobalt-soft: oklch(0.7 0.15 262 / 0.16);
+  --bad: oklch(0.72 0.17 25);
+  --shadow-c: rgba(0, 0, 0, 0.5);
+  --h1: oklch(0.27 0.045 150);
+  --h2: oklch(0.35 0.075 150);
+  --h3: oklch(0.44 0.1 150);
+  --l1: oklch(0.265 0.04 25);
+  --l2: oklch(0.33 0.075 25);
+  --l3: oklch(0.41 0.11 25);
+}
+
 @theme inline {
   --font-sans: 'Geist Variable', 'Segoe UI', system-ui, sans-serif;
   --font-mono: 'Geist Mono Variable', ui-monospace, monospace;
@@ -123,6 +175,17 @@
   --color-on-pos: var(--on-pos);
   --color-scrim: var(--scrim);
   --color-stats: var(--stats);
+  --color-line-2: var(--line-2);
+  --color-sel: var(--sel);
+  --color-cobalt: var(--cobalt);
+  --color-on-cobalt: var(--on-cobalt);
+  --color-cobalt-soft: var(--cobalt-soft);
+  --color-h1: var(--h1);
+  --color-h2: var(--h2);
+  --color-h3: var(--h3);
+  --color-l1: var(--l1);
+  --color-l2: var(--l2);
+  --color-l3: var(--l3);
   --color-background: var(--background);
   --color-foreground: var(--foreground);
   --color-card: var(--card);
```

- [ ] **Step 4: The controls, nav, scope bar and catalogue card**

Create `src/renderer/src/components/stats/controls.tsx`:

```tsx
import { cn } from '@/lib/utils'

/** Companion Stats controls (handoff "Stats"): Geist 12–12.5px, 6–7px radius, hairline borders. */

export function StatsSelect<V extends string | number>({
  value,
  options,
  onChange,
  title,
  className
}: {
  value: V
  options: { value: V; label: string }[]
  onChange: (value: V) => void
  title: string
  className?: string
}): React.JSX.Element {
  return (
    <select
      value={String(value)}
      title={title}
      aria-label={title}
      onChange={(e) => {
        const picked = options.find((o) => String(o.value) === e.target.value)
        if (picked) onChange(picked.value)
      }}
      className={cn(
        'h-7 cursor-pointer rounded-[6px] border border-line bg-panel px-1.5 text-[12.5px] text-fg',
        className
      )}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** Totals / Per game, and other two- or three-way switches. */
export function Segmented<V extends string>({
  value,
  options,
  onChange,
  label
}: {
  value: V
  options: { value: V; label: string }[]
  onChange: (value: V) => void
  label: string
}): React.JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex gap-0.5 rounded-[7px] bg-panel-2 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-6 cursor-pointer rounded-[5px] px-2.5 text-[12px] font-medium',
            o.value === value
              ? 'bg-panel text-fg shadow-[0_0_0_1px_var(--line)]'
              : 'text-fg-2 hover:text-fg'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A checkbox-styled toggle button ("Qualified only"). */
export function CheckToggle({
  on,
  onChange,
  children,
  title
}: {
  on: boolean
  onChange: (on: boolean) => void
  children: React.ReactNode
  title?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={title}
      onClick={() => onChange(!on)}
      className={cn(
        'flex h-7 cursor-pointer items-center gap-[7px] rounded-[7px] border border-line bg-panel px-2.5 text-[12.5px] font-medium',
        on ? 'text-fg' : 'text-fg-2'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-3.5 items-center justify-center rounded-[4px] text-[10px] leading-none',
          on ? 'bg-cobalt text-on-cobalt' : 'border-[1.5px] border-line'
        )}
      >
        {on ? '✓' : ''}
      </span>
      {children}
    </button>
  )
}

/** A quiet bordered button (Columns, Views, Export). */
export function StatsButton({
  children,
  onClick,
  title,
  disabled,
  className,
  ...rest
}: React.ComponentProps<'button'>): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] border border-line bg-panel px-2.5 text-[12.5px] font-medium text-fg hover:bg-hover disabled:cursor-default disabled:opacity-50',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/** The amber "on your fantasy team" dot (handoff "Your players in Stats"). */
export function MineDot({ title = 'On your fantasy team' }: { title?: string }): React.JSX.Element {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-block size-1.5 shrink-0 rounded-full bg-brand"
    />
  )
}

/**
 * Spec §9.2 rostered-by badge: my players get the amber dot, another team's a hollow ring
 * naming the team on hover; free agents nothing.
 */
export function OwnerMark({
  owner
}: {
  owner: { name: string; mine: boolean } | null
}): React.JSX.Element | null {
  if (!owner) return null
  if (owner.mine) return <MineDot />
  const title = `Rostered by ${owner.name}`
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-block size-1.5 shrink-0 rounded-full border border-fg-3"
    />
  )
}

const POS_TEXT: Record<string, string> = {
  QB: 'text-pos-qb',
  RB: 'text-pos-rb',
  WR: 'text-pos-wr',
  TE: 'text-pos-te',
  K: 'text-pos-k'
}

/** A position as the Stats tables write it: mono, in its color (defenders and teams in slate). */
export function PosText({ position }: { position: string | null }): React.JSX.Element {
  return (
    <span
      className={cn(
        'font-mono text-[11.5px] leading-none font-semibold',
        POS_TEXT[position ?? ''] ?? 'text-pos-def'
      )}
    >
      {position ?? 'DEF'}
    </span>
  )
}
```

Create `src/renderer/src/components/stats/StatsNav.tsx`:

```tsx
import { Mark } from '@/components/edition'
import { UpdatePill } from '@/components/UpdatePill'
import { freshness } from '@/lib/stats/scope'
import { cn } from '@/lib/utils'
import type { StatsStatus } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'

export type StatsScreen = 'home' | 'players' | 'teams' | 'glossary'

const ITEMS: { id: StatsScreen | 'games'; label: string }[] = [
  { id: 'home', label: 'Leaderboards' },
  { id: 'players', label: 'Players' },
  { id: 'teams', label: 'Teams' },
  { id: 'games', label: 'Games' },
  { id: 'glossary', label: 'Glossary' }
]

interface StatsNavProps {
  current: StatsScreen
  onNavigate: (screen: StatsScreen) => void
  status: StatsStatus | null
  hasLeague: boolean
  onOpenFantasy: () => void
  update: UpdateState
  version: string | null
  onOpenUpdate: () => void
  onToggleTheme: () => void
}

/** Stats nav (handoff "Stats nav"): 52px, mark + "Companion Stats", five items, Fantasy ↗, theme. */
export function StatsNav({
  current,
  onNavigate,
  status,
  hasLeague,
  onOpenFantasy,
  update,
  version,
  onOpenUpdate,
  onToggleTheme
}: StatsNavProps): React.JSX.Element {
  return (
    <nav className="flex h-[52px] shrink-0 items-center gap-[30px] border-b border-line px-6">
      <div
        className="flex items-center gap-[9px]"
        title={version !== null ? `Companion v${version}` : undefined}
      >
        <Mark product="stats" />
        <span className="text-[15px] leading-none font-semibold tracking-[-0.01em]">
          Companion <span className="font-medium text-fg-3">Stats</span>
        </span>
      </div>
      <div className="flex gap-[22px] self-stretch text-[13.5px] leading-none font-medium">
        {ITEMS.map(({ id, label }) => {
          const soon = id === 'games'
          return (
            <button
              key={id}
              type="button"
              disabled={soon}
              title={soon ? 'Game previews come in a later update' : undefined}
              aria-current={current === id ? 'page' : undefined}
              onClick={() => !soon && onNavigate(id)}
              className={cn(
                'flex cursor-pointer items-center disabled:cursor-default disabled:opacity-40',
                current === id
                  ? 'text-fg shadow-[inset_0_-2px_0_var(--cobalt)]'
                  : 'text-fg-2 hover:text-fg disabled:hover:text-fg-2'
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="ml-auto flex items-center gap-3.5 text-[13px] leading-none font-medium text-fg-2">
        <span
          className={cn(
            'flex items-center gap-1.5 text-[12px] font-normal text-fg-3',
            status && !status.available && 'text-bad'
          )}
        >
          {status?.busy && <span className="size-1.5 animate-pulse rounded-full bg-cobalt" />}
          {freshness(status)}
        </span>
        <UpdatePill state={update} onOpen={onOpenUpdate} />
        <button
          type="button"
          onClick={onOpenFantasy}
          title={hasLeague ? 'Open Companion Fantasy' : 'Import a Sleeper league in Fantasy'}
          className="flex cursor-pointer items-center gap-1.5 hover:text-fg"
        >
          <Mark size={14} />
          Fantasy ↗
        </button>
        <button
          type="button"
          title="Switch theme"
          aria-label="Switch theme"
          onClick={onToggleTheme}
          className="flex size-[30px] cursor-pointer items-center justify-center rounded-[7px] border border-line text-fg-2 hover:bg-hover hover:text-fg"
        >
          <span className="size-[13px] rounded-full border-[1.5px] border-current bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]" />
        </button>
      </div>
    </nav>
  )
}
```

Create `src/renderer/src/components/stats/ScopeBar.tsx`:

```tsx
import { StatsSelect } from '@/components/stats/controls'
import {
  lastWeek,
  SCORING_LABELS,
  seasonOptions,
  weeksOf,
  type StatsScope
} from '@/lib/stats/scope'
import type { Scoring } from '@shared/stats/scoring'
import type { StatsStatus } from '@shared/stats/types'

const TYPES: { value: StatsScope['seasonType']; label: string }[] = [
  { value: 'REG', label: 'Regular season' },
  { value: 'POST', label: 'Postseason' },
  { value: 'ALL', label: 'Both' }
]

/**
 * Spec §9.1 global controls: season, season type, the regular season's week range, and the
 * scoring of fantasy points (My league once a league is imported).
 */
export function ScopeBar({
  scope,
  status,
  hasLeague,
  onChange,
  scoring = true
}: {
  scope: StatsScope
  status: StatsStatus | null
  hasLeague: boolean
  onChange: (scope: StatsScope) => void
  /** Screens without fantasy points leave the scoring picker out. */
  scoring?: boolean
}): React.JSX.Element {
  const last = lastWeek(scope.season, status)
  const [from, to] = weeksOf(scope, status)
  const weeks = Array.from({ length: last }, (_, i) => ({ value: i + 1, label: `Week ${i + 1}` }))
  const full = (a: number, b: number): [number, number] | null =>
    a === 1 && b === last ? null : [a, b]
  const scorings = (['league', 'ppr', 'half', 'std'] as Scoring[])
    .filter((s) => s !== 'league' || hasLeague)
    .map((s) => ({ value: s, label: SCORING_LABELS[s] }))
  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-fg-3">
      <StatsSelect
        title="Season"
        value={scope.season}
        options={seasonOptions(status).map((s) => ({ value: s, label: String(s) }))}
        onChange={(season) => onChange({ ...scope, season, weeks: null })}
      />
      <StatsSelect
        title="Season type"
        value={scope.seasonType}
        options={TYPES}
        onChange={(seasonType) => onChange({ ...scope, seasonType })}
      />
      {scope.seasonType === 'REG' && (
        <>
          <StatsSelect
            title="From week"
            value={from}
            options={weeks}
            onChange={(a) => onChange({ ...scope, weeks: full(a, Math.max(a, to)) })}
          />
          <span>to</span>
          <StatsSelect
            title="To week"
            value={to}
            options={weeks}
            onChange={(b) => onChange({ ...scope, weeks: full(Math.min(from, b), b) })}
          />
        </>
      )}
      {scoring && (
        <StatsSelect
          title="Fantasy scoring"
          value={scope.scoring}
          options={scorings}
          onChange={(s) => onChange({ ...scope, scoring: s })}
        />
      )}
    </div>
  )
}
```

Create `src/renderer/src/components/stats/MetricCard.tsx`:

```tsx
import { HoverCard } from 'radix-ui'
import { familyLabel, reliabilityOf } from '@/lib/stats/format'
import { cn } from '@/lib/utils'
import type { MetricInfo } from '@shared/stats/types'

/** Three bars, filled by reliability (spec §8.6): the marker beside every stat. */
export function ReliabilityMarker({ info }: { info: MetricInfo }): React.JSX.Element | null {
  const r = reliabilityOf(info)
  if (!r) return null
  const filled = { high: 3, medium: 2, low: 1 }[r.level]
  return (
    <span
      role="img"
      aria-label={r.text}
      title={r.text}
      className="inline-flex shrink-0 items-end gap-px align-middle"
    >
      {[4, 6, 8].map((h, i) => (
        <span
          key={h}
          className={cn('w-[2px] rounded-[1px]', i < filled ? 'bg-fg-3' : 'bg-line')}
          style={{ height: `${h}px` }}
        />
      ))}
    </span>
  )
}

const QUALIFY_WORDS = (info: MetricInfo): string | null =>
  info.minSample ? `${info.minSample} ${info.sampleLabel} over a full season to qualify` : null

/** The catalogue entry of a metric (spec §9.2 "tooltip from the catalogue"). */
export function MetricCardBody({
  info,
  missing,
  className = 'w-[300px]'
}: {
  info: MetricInfo
  /** Why the column is empty for the season, if it is. */
  missing?: string | null
  className?: string
}): React.JSX.Element {
  const r = reliabilityOf(info)
  const where =
    info.entity === 'team'
      ? info.side === 'defense'
        ? 'Team defense'
        : info.side === 'special'
          ? 'Team special teams'
          : 'Team offense'
      : info.positions === 'all'
        ? 'Every position'
        : info.positions.join(', ')
  return (
    <div className={cn('flex flex-col gap-2 text-[12px] leading-[1.4] text-fg-2', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13.5px] font-semibold text-fg">{info.label}</span>
        <span className="shrink-0 rounded-[4px] bg-cobalt-soft px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-cobalt">
          {familyLabel(info.family)}
        </span>
      </div>
      <p className="m-0 text-fg">{info.description}</p>
      {missing && <p className="m-0 text-warn">{missing}</p>}
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11.5px]">
        <dt className="text-fg-3">For</dt>
        <dd className="m-0">{where}</dd>
        <dt className="text-fg-3">Sample</dt>
        <dd className="m-0">{QUALIFY_WORDS(info) ?? info.sampleLabel}</dd>
        <dt className="text-fg-3">Since</dt>
        <dd className="m-0">
          {info.firstSeason}
          {info.lastSeason === 'prior' ? ', through last season' : ''}
        </dd>
        <dt className="text-fg-3">Source</dt>
        <dd className="m-0">{info.sources.join(', ')}</dd>
      </dl>
      {r && (
        <div className="flex items-center gap-2 text-[11.5px]">
          <ReliabilityMarker info={info} />
          <span>{r.text}</span>
        </div>
      )}
    </div>
  )
}

/** Hovering `children` (a column head) shows the metric's card. */
export function MetricHover({
  info,
  missing,
  children
}: {
  info: MetricInfo
  missing?: string | null
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <HoverCard.Root openDelay={350} closeDelay={80}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="bottom"
          align="center"
          sideOffset={6}
          collisionPadding={12}
          className="stats z-50 rounded-[10px] bg-panel p-3 shadow-[0_0_0_1px_var(--line),0_10px_28px_rgba(0,0,0,0.18)]"
        >
          <MetricCardBody info={info} missing={missing} />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  )
}
```

- [ ] **Step 5: The data hooks**

Create `src/renderer/src/lib/stats/useStats.ts`:

```ts
import { useEffect, useMemo, useState } from 'react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import type {
  MetricInfo,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsStatus
} from '@shared/stats/types'

/** What every Stats screen reads once: the status, the catalogue, my league's rosters. */
export interface StatsData {
  status: StatsStatus | null
  catalogue: MetricInfo[]
  byId: ReadonlyMap<string, MetricInfo>
  ownership: StatsOwnership | null
  /** Bumped when a rebuild finished (spec §5.3): screens query again. */
  version: number
  error: string | null
}

/**
 * Loads the shared Stats data and keeps it current: a finished rebuild re-reads the status and the
 * catalogue (stability changes with the models), a league change (`leagueKey`) the rosters.
 */
export function useStatsData(leagueKey: number): StatsData {
  const [status, setStatus] = useState<StatsStatus | null>(null)
  const [catalogue, setCatalogue] = useState<MetricInfo[]>([])
  const [ownership, setOwnership] = useState<StatsOwnership | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([api.stats.status(), api.stats.catalogue()])
      .then(([s, c]) => {
        if (!alive) return
        setStatus(s)
        setCatalogue(c)
        setError(null)
      })
      .catch((err) => alive && setError(errorMessage(err)))
    return () => {
      alive = false
    }
  }, [version])

  useEffect(() => {
    let alive = true
    void api.stats
      .ownership()
      .then((o) => alive && setOwnership(o))
      .catch(() => alive && setOwnership(null))
    return () => {
      alive = false
    }
  }, [leagueKey])

  useEffect(() => api.stats.onChanged(() => setVersion((v) => v + 1)), [])

  // A refresh in progress: poll the status quietly until it is done (spec §5.3).
  useEffect(() => {
    if (!status?.busy) return
    const timer = setInterval(() => {
      void api.stats
        .status()
        .then(setStatus)
        .catch(() => {})
    }, 5000)
    return () => clearInterval(timer)
  }, [status?.busy])

  const byId = useMemo(() => new Map(catalogue.map((m) => [m.id, m])), [catalogue])
  return { status, catalogue, byId, ownership, version, error }
}

export interface QueryState {
  /** The last answer: it stays on screen while the next one loads. */
  result: StatsResult | null
  loading: boolean
  error: string | null
}

/**
 * Runs `query` (null: nothing to run) and again when it, or `version`, changes. An answer for a
 * query that has since changed is dropped.
 */
export function useStatsQuery(query: StatsQuery | null, version: number): QueryState {
  const key = query ? `${version}|${JSON.stringify(query)}` : null
  const [done, setDone] = useState<{
    key: string
    result: StatsResult | null
    error: string | null
  } | null>(null)
  useEffect(() => {
    if (!key) return
    let cancelled = false
    api.stats
      .query(JSON.parse(key.slice(key.indexOf('|') + 1)) as StatsQuery)
      .then((result) => !cancelled && setDone({ key, result, error: null }))
      .catch((err) => !cancelled && setDone({ key, result: null, error: errorMessage(err) }))
    return () => {
      cancelled = true
    }
  }, [key])
  const current = done !== null && done.key === key
  return {
    result: done?.result ?? null,
    loading: key !== null && !current,
    error: current ? done.error : null
  }
}
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run tests/renderer/components/StatsShell.test.tsx
```

Expected: PASS (4 passed). Then the typecheck, lint and full suite: clean; 916 passed | 5 skipped.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/renderer/src/assets/main.css src/renderer/src/components/stats/controls.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/components/stats/ScopeBar.tsx src/renderer/src/components/stats/MetricCard.tsx src/renderer/src/lib/stats/useStats.ts tests/renderer/components/StatsShell.test.tsx
git add src/renderer/src/assets/main.css src/renderer/src/components/stats/controls.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/components/stats/ScopeBar.tsx src/renderer/src/components/stats/MetricCard.tsx src/renderer/src/lib/stats/useStats.ts tests/renderer/components/StatsShell.test.tsx
git commit -m "feat(stats): add the Stats shell and controls"
```

---

### Task 6: The home, the leaderboards and the glossary (spec §9.2; amendments B–G, I, J)

**Files:**

- Create: `src/renderer/src/components/stats/ColumnPicker.tsx`, `src/renderer/src/components/stats/ViewsMenu.tsx`, `src/renderer/src/components/stats/LeaderTable.tsx`, `src/renderer/src/screens/stats/StatsHome.tsx`, `src/renderer/src/screens/stats/StatsLeaderboard.tsx`, `src/renderer/src/screens/stats/StatsGlossary.tsx`, `src/renderer/src/screens/stats/StatsApp.tsx`, `tests/renderer/components/StatsApp.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/components/StatsApp.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StatsApp } from '@/screens/stats/StatsApp'
import { api } from '@/lib/api'
import type { StatsOwnership, StatsQuery, StatsView } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'
import { catalogue, result, row, STATUS, value } from '../../fixtures/statsScreens'

vi.mock('@/lib/api', () => ({
  api: {
    stats: {
      status: vi.fn(),
      catalogue: vi.fn(),
      query: vi.fn(),
      ownership: vi.fn(),
      views: vi.fn(),
      saveView: vi.fn(),
      deleteView: vi.fn(),
      exportCsv: vi.fn(),
      onChanged: vi.fn()
    }
  }
}))
const stats = vi.mocked(api.stats)

// Radix popovers measure their content.
globalThis.ResizeObserver ??= class {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
} as unknown as typeof ResizeObserver

const OWNERSHIP: StatsOwnership = {
  players: { p1: { name: 'Cook Book', mine: true }, p2: { name: 'Rival', mine: false } },
  teams: {}
}

/** Three players per query: p0 leads, p1 is mine, p3 is below the tab's qualifying sample. */
function answer(q: StatsQuery): ReturnType<typeof result> {
  const position = q.scope.positions?.[0] ?? null
  const rows = ['p0', 'p1', 'p2', 'p3'].map((id, i) =>
    row(
      id,
      `Player ${i}`,
      Object.fromEntries(
        q.metrics.map((m) => [
          m,
          value(100 - i * 10, { percentile: 90 - i * 30, qualified: i < 3 })
        ])
      ),
      { position, team: position ? 'SEA' : null }
    )
  )
  return result(q.metrics, rows)
}

const IDLE: UpdateState = { status: 'idle' } as UpdateState

function renderApp(hasLeague = true): void {
  render(
    <StatsApp
      hasLeague={hasLeague}
      leagueKey={0}
      onOpenFantasy={() => {}}
      update={IDLE}
      version="0.28.0"
      onOpenUpdate={() => {}}
      onToggleTheme={() => {}}
    />
  )
}

const lastQuery = (): StatsQuery => stats.query.mock.calls.at(-1)![0]

beforeEach(() => {
  vi.resetAllMocks()
  stats.status.mockResolvedValue(STATUS)
  stats.catalogue.mockResolvedValue(catalogue())
  stats.query.mockImplementation(async (q) => answer(q))
  stats.ownership.mockResolvedValue(OWNERSHIP)
  stats.views.mockResolvedValue([])
  stats.onChanged.mockReturnValue(() => {})
})
afterEach(cleanup)

describe('Companion Stats', () => {
  it('opens on the eight boards with the freshness line and my players marked', async () => {
    renderApp()
    expect(screen.getByRole('heading', { name: 'Leaderboards' })).toBeTruthy()
    expect(await screen.findByText(/^Data through 2026 week 6 · updated/)).toBeTruthy()
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(8))
    expect(screen.getByText('Target share')).toBeTruthy()
    expect((await screen.findAllByTitle('On your fantasy team')).length).toBeGreaterThan(0)
    expect(screen.getByText(/3\+ games and position minimums to qualify/)).toBeTruthy()
    // League scoring by default.
    expect(lastQuery().scoring).toBe('league')
  })

  it('opens a board in full: its position, sorted by its metric, best first', async () => {
    renderApp()
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(8))
    fireEvent.click(screen.getAllByRole('button', { name: 'All →' })[0])
    expect(
      await screen.findByRole('heading', { name: '2026 quarterback leaderboard' })
    ).toBeTruthy()
    await waitFor(() => expect(lastQuery().scope.positions).toEqual(['QB']))
    expect(lastQuery().sort).toEqual({ metric: 'pass_yds', dir: 'desc' })
    expect(screen.getByRole('tab', { name: 'QB', selected: true })).toBeTruthy()
  })

  it('sorts by a column, hides rows below the sample until asked, and filters my team', async () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Players' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'WR' }))
    await screen.findByText('Player 2')
    expect(screen.queryByText('Player 3')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Qualified only' }))
    expect(screen.getByText('Player 3')).toBeTruthy()
    expect(screen.getByTitle('Below the qualifying sample')).toBeTruthy()

    fireEvent.click(screen.getByText('YPRR'))
    await waitFor(() => expect(lastQuery().sort).toEqual({ metric: 'yprr', dir: 'desc' }))
    expect(lastQuery().metrics).toContain('target_share')

    fireEvent.change(screen.getByRole('combobox', { name: 'Fantasy rosters' }), {
      target: { value: 'mine' }
    })
    const table = screen.getByRole('table')
    expect(within(table).getByText('Player 1')).toBeTruthy()
    expect(within(table).queryByText('Player 0')).toBeNull()
  })

  it('saves a view, opens it from the home, and exports the table as CSV', async () => {
    const saved: StatsView = {
      id: 7,
      name: 'Slot guys',
      board: {
        entity: 'player',
        tab: 'WR',
        columns: ['yprr'],
        sort: { by: 'yprr', dir: 'desc' },
        perGame: false,
        qualifiedOnly: true,
        team: null,
        owner: 'all'
      },
      updatedAt: 't'
    }
    stats.saveView.mockResolvedValue(saved)
    stats.exportCsv.mockResolvedValue('/home/me/Downloads/stats.csv')
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: 'Players' }))
    await screen.findByText('Player 2')

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
    await waitFor(() => expect(stats.exportCsv).toHaveBeenCalled())
    const [file, csv] = stats.exportCsv.mock.calls[0]
    expect(file).toBe('stats-2026-all-offense-weeks-1-6.csv')
    expect(csv.split('\r\n')[0]).toMatch(
      /^Rank,Player,Team,Position,gsis_id,Games,Snap share \(%\),/
    )
    expect(await screen.findByText('Saved 3 rows to /home/me/Downloads/stats.csv')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Views' }))
    fireEvent.change(await screen.findByRole('textbox', { name: 'View name' }), {
      target: { value: 'Slot guys' }
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(stats.saveView).toHaveBeenCalled())
    expect(stats.saveView.mock.calls[0][0]).toBe('Slot guys')
    expect(stats.saveView.mock.calls[0][1]).toMatchObject({ entity: 'player', tab: 'ALL' })

    fireEvent.click(screen.getByRole('button', { name: 'Leaderboards' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Slot guys' }))
    expect(
      await screen.findByRole('heading', { name: '2026 wide receiver leaderboard' })
    ).toBeTruthy()
    await waitFor(() => expect(lastQuery().metrics).toEqual(['yprr', 'target_share']))
  })

  it('works without a league: no league scoring, no roster marks or filters', async () => {
    stats.ownership.mockResolvedValue(null)
    renderApp(false)
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(8))
    expect(lastQuery().scoring).toBe('ppr')
    const scoring = screen.getByRole('combobox', { name: 'Fantasy scoring' })
    expect(within(scoring).queryByText('My league')).toBeNull()
    expect(screen.queryByRole('button', { name: 'My players' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Players' }))
    await screen.findByText('Player 2')
    expect(screen.queryByRole('combobox', { name: 'Fantasy rosters' })).toBeNull()
  })

  it('queries again when a rebuild finished (spec §5.3)', async () => {
    renderApp()
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(8))
    expect(stats.catalogue).toHaveBeenCalledTimes(1)
    const changed = stats.onChanged.mock.calls[0][0]
    act(() => changed())
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(16))
    expect(stats.catalogue).toHaveBeenCalledTimes(2)
  })

  it('says so when the stats database is off', async () => {
    stats.status.mockResolvedValue({
      available: false,
      through: null,
      updatedAt: null,
      busy: false
    })
    renderApp()
    expect(
      await screen.findByText('The stats database could not be opened on this computer.')
    ).toBeTruthy()
    expect(screen.getByText('Stats unavailable')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/renderer/components/StatsApp.test.tsx
```

Expected: FAIL. `@/screens/stats/StatsApp` does not exist.

- [ ] **Step 3: The table, the column picker and the views menu**

Create `src/renderer/src/components/stats/LeaderTable.tsx`:

```tsx
import { useEffect, useRef } from 'react'
import { OwnerMark, PosText } from '@/components/stats/controls'
import { MetricHover, ReliabilityMarker } from '@/components/stats/MetricCard'
import { cellTitle, fmtStat, heatOf, type Heat } from '@/lib/stats/format'
import { columnGroups, ownerOf, qualifies, type TabDef } from '@/lib/stats/leaderboard'
import { cn } from '@/lib/utils'
import type {
  LeaderboardBoard,
  MetricInfo,
  StatsOwnership,
  StatsResultColumn,
  StatsRow
} from '@shared/stats/types'

const HEAT: Record<Heat, string> = {
  h3: 'bg-h3 font-semibold',
  h2: 'bg-h2',
  h1: 'bg-h1',
  n: '',
  l1: 'bg-l1',
  l2: 'bg-l2',
  l3: 'bg-l3 font-semibold'
}

/** The Ledger's percentile legend (handoff 3d), under the table. */
export function HeatLegend(): React.JSX.Element {
  const steps: [Heat, string][] = [
    ['l3', '≤10'],
    ['l2', '25'],
    ['l1', '40'],
    ['n', '50'],
    ['h1', '60'],
    ['h2', '75'],
    ['h3', '≥90']
  ]
  return (
    <div className="flex items-center gap-2">
      <span>Percentile</span>
      <div className="flex font-mono text-[10.5px] leading-none font-medium text-fg">
        {steps.map(([h, label]) => (
          <span
            key={h}
            className={cn(
              'w-[30px] py-1 text-center',
              HEAT[h],
              h === 'n' && 'shadow-[inset_0_0_0_1px_var(--line)]'
            )}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

const arrow = (dir: 'asc' | 'desc'): string => (dir === 'asc' ? '▲' : '▼')

/** Why a column is empty for the season (participation is published after the season). */
function missingFor(column: StatsResultColumn | undefined, season: number): string | null {
  return column && column.seasons.length === 0 ? `Not published for ${season} yet.` : null
}

/**
 * The leaderboard table (handoff 3d "Ledger"): sticky header in two rows (groups, labels) and a
 * sticky identity column; each value shaded by its percentile within the position, its hover
 * saying the rank and sample; rows below the qualifying sample greyed and marked NQ.
 */
export function LeaderTable({
  rows,
  board,
  tab,
  columns,
  byId,
  ownership,
  season,
  selected,
  onSelect,
  onSort
}: {
  rows: StatsRow[]
  board: LeaderboardBoard
  tab: TabDef
  /** The result's columns: which seasons each metric has. */
  columns: StatsResultColumn[]
  byId: ReadonlyMap<string, MetricInfo>
  ownership: StatsOwnership | null
  season: number
  selected: string | null
  onSelect: (id: string) => void
  onSort: (by: string) => void
}): React.JSX.Element {
  const player = board.entity === 'player'
  const groups = columnGroups(board.columns, tab, byId)
  const resultCol = new Map(columns.map((c) => [c.id, c]))
  const selectedRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: 'center' })
  }, [selected])

  const nameSorted = board.sort.by === 'name'
  return (
    <table className="min-w-full border-separate border-spacing-0">
      <thead>
        <tr>
          <th className="sticky top-0 left-0 z-[4] h-6 bg-panel" />
          <th className="sticky top-0 z-[3] h-6 bg-panel" />
          {groups.map((g, i) => (
            <th
              key={`${g.label}-${i}`}
              colSpan={g.span}
              className="sticky top-0 z-[3] h-6 bg-panel px-2 pb-[5px] text-left align-bottom text-[11px] leading-none font-medium tracking-[0.06em] whitespace-nowrap text-fg-3 uppercase shadow-[inset_1px_0_0_var(--line)]"
            >
              {g.label}
            </th>
          ))}
          <th className="sticky top-0 z-[2] w-full bg-panel" />
        </tr>
        <tr>
          <th className="sticky top-6 left-0 z-[4] h-7 border-b border-fg-3 bg-panel p-0 align-middle">
            <div className="grid w-[300px] grid-cols-[34px_minmax(0,1fr)_42px_34px] items-center gap-x-2 pr-2.5 pl-3 text-left font-mono text-[11px] leading-none font-medium text-fg-3">
              <span>#</span>
              <button
                type="button"
                onClick={() => onSort('name')}
                className={cn(
                  'cursor-pointer justify-self-start uppercase',
                  nameSorted ? 'font-semibold text-fg' : 'hover:text-fg'
                )}
              >
                {player ? 'Player' : 'Team'} {nameSorted && arrow(board.sort.dir)}
              </button>
              <span>{player ? 'TEAM' : ''}</span>
              <span>{player ? 'POS' : ''}</span>
            </div>
          </th>
          <th
            title="Games played"
            className="sticky top-6 z-[2] h-7 border-b border-fg-3 bg-panel px-2 text-right align-middle font-mono text-[11px] leading-none font-medium text-fg-2"
          >
            G
          </th>
          {board.columns.map((id) => {
            const info = byId.get(id)
            const on = board.sort.by === id
            const missing = missingFor(resultCol.get(id), season)
            const label = info?.short ?? id
            const head = (
              <th
                key={id}
                aria-sort={on ? (board.sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                onClick={() => onSort(id)}
                className={cn(
                  'sticky top-6 z-[2] h-7 cursor-pointer border-b border-fg-3 px-2 text-right align-middle font-mono text-[11px] leading-none whitespace-nowrap',
                  on
                    ? 'bg-cobalt-soft font-semibold text-cobalt'
                    : 'bg-panel font-medium text-fg-2 hover:text-fg',
                  missing && !on && 'text-fg-3 opacity-60'
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {info && <ReliabilityMarker info={info} />}
                  {label}
                  {on && <span className="text-[8px]">{arrow(board.sort.dir)}</span>}
                </span>
              </th>
            )
            return info ? (
              <MetricHover key={id} info={info} missing={missing}>
                {head}
              </MetricHover>
            ) : (
              head
            )
          })}
          <th className="sticky top-6 z-[2] w-full border-b border-fg-3 bg-panel" />
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const owner = ownerOf(r, board.entity, ownership)
          const ok = qualifies(r, tab)
          const isSel = r.id === selected
          return (
            <tr
              key={r.id}
              ref={isSel ? selectedRef : undefined}
              aria-selected={isSel}
              onClick={() => onSelect(r.id)}
              className={cn('cursor-default', isSel ? 'bg-sel' : 'bg-panel hover:bg-hover')}
            >
              <td className="sticky left-0 z-[1] h-[30px] border-b border-line-2 bg-inherit p-0 align-middle">
                <div className="grid w-[300px] grid-cols-[34px_minmax(0,1fr)_42px_34px] items-center gap-x-2 pr-2.5 pl-3">
                  <span className="font-mono text-[12px] leading-none text-fg-3">{i + 1}</span>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[13px] leading-[1.1] font-medium">{r.name}</span>
                    {!ok && (
                      <span
                        title="Below the qualifying sample"
                        className="shrink-0 font-mono text-[10px] leading-none font-medium text-fg-3"
                      >
                        NQ
                      </span>
                    )}
                    <OwnerMark owner={owner} />
                  </div>
                  <span className="font-mono text-[12px] leading-none text-fg-2">
                    {player ? r.team : ''}
                  </span>
                  <span>{player && <PosText position={r.position} />}</span>
                </div>
              </td>
              <td className="border-b border-line-2 px-2 text-right font-mono text-[12.5px] leading-[30px] text-fg-2">
                {r.games}
              </td>
              {board.columns.map((id) => {
                const v = r.values[id]
                const info = byId.get(id)
                if (!v || !info)
                  return (
                    <td key={id} className="border-b border-line-2 px-2 text-right text-fg-3">
                      —
                    </td>
                  )
                const heat = ok && v.qualified ? heatOf(v.percentile, info.direction) : 'n'
                return (
                  <td
                    key={id}
                    title={cellTitle(v, info, player ? r.position : null)}
                    className="border-b border-line-2 p-0 text-right align-middle font-mono text-[12.5px] leading-[30px] whitespace-nowrap"
                  >
                    <div
                      className={cn('px-2', HEAT[heat], (!ok || v.value === null) && 'text-fg-3')}
                    >
                      {fmtStat(v.value, info, board.perGame)}
                      {v.estimated && v.value !== null && (
                        <span className="ml-0.5 align-top text-[8.5px] leading-none text-fg-3">
                          est
                        </span>
                      )}
                    </div>
                  </td>
                )
              })}
              <td className="border-b border-line-2" />
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
```

Create `src/renderer/src/components/stats/ColumnPicker.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { Popover } from 'radix-ui'
import { Columns3 } from 'lucide-react'
import { StatsButton } from '@/components/stats/controls'
import { ReliabilityMarker } from '@/components/stats/MetricCard'
import { familyLabel } from '@/lib/stats/format'
import { MAX_COLUMNS, pickable, searchKey, type TabDef } from '@/lib/stats/leaderboard'
import { cn } from '@/lib/utils'
import type { MetricInfo } from '@shared/stats/types'

/**
 * Spec §9.2 column picker over the catalogue (tiers core and extended): search, check to add (at
 * the end) or remove, reset to the tab's columns. At most 40 columns.
 */
export function ColumnPicker({
  tab,
  catalogue,
  columns,
  onChange,
  onReset
}: {
  tab: TabDef
  catalogue: readonly MetricInfo[]
  columns: string[]
  onChange: (columns: string[]) => void
  onReset: () => void
}): React.JSX.Element {
  const [search, setSearch] = useState('')
  const offered = useMemo(() => pickable(catalogue, tab), [catalogue, tab])
  const needle = searchKey(search.trim())
  const shown = needle
    ? offered.filter((m) => searchKey(`${m.label} ${m.short} ${m.description}`).includes(needle))
    : offered
  const groups = new Map<string, MetricInfo[]>()
  for (const m of shown) {
    const key = familyLabel(m.family)
    groups.set(key, [...(groups.get(key) ?? []), m])
  }
  const chosen = new Set(columns)
  const full = columns.length >= MAX_COLUMNS
  const toggle = (id: string): void =>
    onChange(chosen.has(id) ? columns.filter((c) => c !== id) : [...columns, id])

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <StatsButton title="Choose the columns">
          <Columns3 className="size-3.5" />
          Columns
          <span className="font-mono text-[11px] text-fg-3">{columns.length}</span>
        </StatsButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="stats z-50 flex max-h-[min(560px,var(--radix-popover-content-available-height))] w-[380px] flex-col rounded-[10px] bg-panel shadow-[0_0_0_1px_var(--line),0_10px_28px_rgba(0,0,0,0.18)]"
        >
          <div className="flex items-center gap-2 border-b border-line-2 p-2.5">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search metrics"
              aria-label="Search metrics"
              className="h-7 min-w-0 flex-1 rounded-[6px] border border-line bg-panel px-2 text-[12.5px] text-fg outline-none"
            />
            <button
              type="button"
              onClick={onReset}
              className="h-7 shrink-0 cursor-pointer rounded-[6px] px-2 text-[12px] font-medium text-fg-2 hover:bg-hover hover:text-fg"
            >
              Reset
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto py-1">
            {[...groups].map(([family, metrics]) => (
              <div key={family}>
                <div className="sticky top-0 bg-panel px-3 pt-2 pb-1 text-[11px] font-medium tracking-[0.06em] text-fg-3 uppercase">
                  {family}
                </div>
                {metrics.map((m) => {
                  const on = chosen.has(m.id)
                  return (
                    <label
                      key={m.id}
                      title={m.description}
                      className={cn(
                        'flex h-[30px] cursor-pointer items-center gap-2 px-3 text-[12.5px] hover:bg-hover',
                        !on && full && 'cursor-not-allowed opacity-50'
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!on && full}
                        onChange={() => toggle(m.id)}
                        className="accent-[var(--cobalt)]"
                      />
                      <span className="min-w-0 flex-1 truncate text-fg">{m.label}</span>
                      <span className="font-mono text-[11px] text-fg-3">{m.short}</span>
                      <ReliabilityMarker info={m} />
                    </label>
                  )
                })}
              </div>
            ))}
            {shown.length === 0 && (
              <div className="px-3 py-6 text-center text-[12.5px] text-fg-3">
                No metric matches.
              </div>
            )}
          </div>
          <div className="border-t border-line-2 px-3 py-2 text-[11.5px] text-fg-3">
            {columns.length} of {MAX_COLUMNS} columns · new ones go at the end
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
```

Create `src/renderer/src/components/stats/ViewsMenu.tsx`:

```tsx
import { useState } from 'react'
import { Popover } from 'radix-ui'
import { Bookmark, X } from 'lucide-react'
import { StatsButton } from '@/components/stats/controls'
import { errorMessage } from '@/lib/format'
import { tabOf } from '@/lib/stats/leaderboard'
import type { StatsView } from '@shared/stats/types'

/**
 * Spec §9.2 custom views: open a saved leaderboard, save the current one under a name (the same
 * name replaces it), delete one.
 */
export function ViewsMenu({
  views,
  onOpen,
  onSave,
  onDelete
}: {
  views: StatsView[]
  onOpen: (view: StatsView) => void
  /** Rejects with a readable message. */
  onSave: (name: string) => Promise<void>
  onDelete: (view: StatsView) => Promise<void>
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function save(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await onSave(name)
      setName('')
      setOpen(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <StatsButton title="Saved views">
          <Bookmark className="size-3.5" />
          Views
        </StatsButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="stats z-50 flex w-[300px] flex-col rounded-[10px] bg-panel text-[12.5px] shadow-[0_0_0_1px_var(--line),0_10px_28px_rgba(0,0,0,0.18)]"
        >
          <div className="max-h-[260px] overflow-auto py-1">
            {views.length === 0 && (
              <div className="px-3 py-3 text-fg-3">
                No saved views yet. A view keeps the tab, columns, sort and filters; the season and
                weeks stay the ones on screen.
              </div>
            )}
            {views.map((v) => (
              <div key={v.id} className="flex h-8 items-center gap-1 pr-1.5 pl-3 hover:bg-hover">
                <button
                  type="button"
                  onClick={() => {
                    onOpen(v)
                    setOpen(false)
                  }}
                  className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 text-left"
                >
                  <span className="truncate font-medium text-fg">{v.name}</span>
                  <span className="shrink-0 font-mono text-[11px] text-fg-3">
                    {v.board.entity === 'team' ? 'Teams' : 'Players'} ·{' '}
                    {tabOf(v.board.entity, v.board.tab).label}
                  </span>
                </button>
                <button
                  type="button"
                  title={`Delete "${v.name}"`}
                  aria-label={`Delete ${v.name}`}
                  onClick={() => void onDelete(v)}
                  className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[5px] text-fg-3 hover:bg-panel-2 hover:text-bad"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <form
            className="flex flex-col gap-1.5 border-t border-line-2 p-2.5"
            onSubmit={(e) => {
              e.preventDefault()
              void save()
            }}
          >
            <div className="flex gap-1.5">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this view"
                aria-label="View name"
                maxLength={60}
                className="h-7 min-w-0 flex-1 rounded-[6px] border border-line bg-panel px-2 text-fg outline-none"
              />
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="h-7 shrink-0 cursor-pointer rounded-[6px] bg-cobalt px-2.5 font-semibold text-on-cobalt disabled:cursor-default disabled:opacity-50"
              >
                Save
              </button>
            </div>
            {error && <div className="text-bad">{error}</div>}
          </form>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
```

- [ ] **Step 4: The screens**

Create `src/renderer/src/screens/stats/StatsHome.tsx`:

```tsx
import { useState } from 'react'
import { MineDot, Segmented } from '@/components/stats/controls'
import { ScopeBar } from '@/components/stats/ScopeBar'
import {
  BOARD_ROWS,
  BOARDS,
  boardQuery,
  boardView,
  type BoardDef,
  type BoardRow
} from '@/lib/stats/boards'
import { minGames, rangeLabel, type StatsScope } from '@/lib/stats/scope'
import { useStatsQuery, type StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import type { StatsView } from '@shared/stats/types'

const POS_TEXT: Record<string, string> = {
  QB: 'text-pos-qb',
  RB: 'text-pos-rb',
  WR: 'text-pos-wr',
  TE: 'text-pos-te',
  DEF: 'text-pos-def'
}

function Bar({ fraction, lead }: { fraction: number; lead: boolean }): React.JSX.Element {
  return (
    <div className="h-[3px] overflow-hidden rounded-[2px] bg-line-2">
      <div
        className={cn('h-full rounded-[2px]', lead ? 'bg-cobalt' : 'bg-fg-3 opacity-50')}
        style={{ width: `${Math.max(3, fraction * 100)}%` }}
      />
    </div>
  )
}

function Row({
  row,
  onOpen,
  dashed
}: {
  row: BoardRow
  onOpen: () => void
  dashed?: boolean
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'grid h-[38px] w-full cursor-pointer grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-x-2.5 pr-3.5 pl-2.5 text-left hover:bg-hover',
        dashed && 'mt-0.5 border-t border-dashed border-line'
      )}
    >
      <span
        className={cn(
          'text-right',
          row.lead
            ? 'font-cond text-[18px] leading-none font-extrabold text-cobalt'
            : 'font-mono text-[11.5px] leading-none text-fg-3'
        )}
      >
        {row.rank}
      </span>
      <div className="flex min-w-0 flex-col gap-[5px]">
        <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
          <span className="truncate text-[13px] leading-[1.1] font-medium">{row.name}</span>
          {row.team && row.team !== row.name && (
            <span className="shrink-0 font-mono text-[10.5px] leading-none text-fg-3">
              {row.team}
            </span>
          )}
          {row.mine && <MineDot />}
        </div>
        <Bar fraction={row.fraction} lead={row.lead} />
      </div>
      <span
        className={cn(
          'font-mono text-[12.5px] leading-none',
          row.lead ? 'font-semibold text-fg' : 'text-fg-2'
        )}
      >
        {row.value}
      </span>
    </button>
  )
}

function Board({
  board,
  data,
  scope,
  perGame,
  highlight,
  onOpen
}: {
  board: BoardDef
  data: StatsData
  scope: StatsScope
  perGame: boolean
  highlight: boolean
  onOpen: (board: BoardDef, rowId: string | null) => void
}): React.JSX.Element {
  const info = data.byId.get(board.metric)
  const { result, loading, error } = useStatsQuery(
    info ? boardQuery(board, scope, data.status, perGame) : null,
    data.version
  )
  const view =
    result && info
      ? boardView(result, info, perGame, minGames(scope, data.status), data.ownership, highlight)
      : null
  return (
    <section className="flex min-w-0 flex-col rounded-[10px] bg-panel shadow-[0_0_0_1px_var(--line)]">
      <div className="flex h-11 items-center justify-between gap-2 border-b border-line-2 pr-2.5 pl-3.5">
        <div className="flex min-w-0 items-baseline gap-[7px] overflow-hidden whitespace-nowrap">
          <span
            className={cn(
              'font-mono text-[11.5px] leading-none font-semibold',
              POS_TEXT[board.label]
            )}
          >
            {board.label}
          </span>
          <span
            className="truncate text-[13.5px] leading-none font-semibold tracking-[-0.01em]"
            title={info?.description}
          >
            {board.title}
          </span>
          {view?.sub && (
            <span className="font-mono text-[11px] leading-none text-fg-3">{view.sub}</span>
          )}
        </div>
        <button
          type="button"
          title="Open the full board"
          onClick={() => onOpen(board, null)}
          className="h-6 shrink-0 cursor-pointer rounded-[5px] px-[7px] text-[11.5px] font-medium text-fg-3 hover:bg-hover hover:text-cobalt"
        >
          All →
        </button>
      </div>
      <div
        className={cn(
          'flex flex-col pt-1 pb-1.5 transition-opacity duration-150',
          loading && view && 'opacity-60'
        )}
      >
        {error ? (
          <div className="px-3.5 py-6 text-center text-[12.5px] text-bad">{error}</div>
        ) : !view ? (
          Array.from({ length: BOARD_ROWS }, (_, i) => (
            <div key={i} className="flex h-[38px] items-center px-3.5">
              <div className="h-2.5 w-full animate-pulse rounded bg-panel-2" />
            </div>
          ))
        ) : view.rows.length === 0 ? (
          <div className="px-3.5 py-6 text-center text-[12.5px] text-fg-3">
            No qualified players yet
          </div>
        ) : (
          <>
            {view.rows.map((r) => (
              <Row key={r.id} row={r} onOpen={() => onOpen(board, r.id)} />
            ))}
            {view.extra && (
              <Row row={view.extra} dashed onOpen={() => onOpen(board, view.extra!.id)} />
            )}
          </>
        )}
      </div>
    </section>
  )
}

/**
 * Stats home (handoff 4d "Leaderboards"): eight boards, top six each, my players marked; a board's
 * "All →" or a row opens the full leaderboard. Saved views are one click away above them.
 */
export function StatsHome({
  data,
  scope,
  onScope,
  hasLeague,
  views,
  onOpenBoard,
  onOpenView
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  views: StatsView[]
  onOpenBoard: (board: BoardDef, rowId: string | null, perGame: boolean) => void
  onOpenView: (view: StatsView) => void
}): React.JSX.Element {
  const [perGame, setPerGame] = useState(false)
  const [highlight, setHighlight] = useState(true)
  const min = minGames(scope, data.status)
  return (
    <div className="flex flex-col gap-5 px-8 pt-[22px] pb-7">
      <header className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[28px] leading-none font-bold tracking-[-0.03em]">
            Leaderboards
          </h1>
          <div className="text-[13px] text-fg-2">
            {scope.season} season · {rangeLabel(scope, data.status)} ·{' '}
            <span className="text-fg-3">
              {min}+ {min === 1 ? 'game' : 'games'} and position minimums to qualify
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {hasLeague && data.ownership && (
            <button
              type="button"
              aria-pressed={highlight}
              title="Mark players on your fantasy team"
              onClick={() => setHighlight(!highlight)}
              className={cn(
                'flex h-7 cursor-pointer items-center gap-[7px] rounded-[7px] px-[11px] text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--line)]',
                highlight ? 'bg-panel-2 text-fg' : 'text-fg-3 hover:text-fg'
              )}
            >
              <span
                className={cn(
                  'size-[7px] rounded-full',
                  highlight ? 'bg-brand' : 'border-[1.5px] border-current'
                )}
              />
              My players
            </button>
          )}
          <ScopeBar scope={scope} status={data.status} hasLeague={hasLeague} onChange={onScope} />
          <Segmented
            label="Totals or per game"
            value={perGame ? 'per' : 'tot'}
            options={[
              { value: 'tot', label: 'Totals' },
              { value: 'per', label: 'Per game' }
            ]}
            onChange={(v) => setPerGame(v === 'per')}
          />
        </div>
      </header>
      {views.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
          <span>Saved views</span>
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onOpenView(v)}
              className="h-6 cursor-pointer rounded-[5px] bg-panel px-2 text-[12px] font-medium text-fg shadow-[0_0_0_1px_var(--line)] hover:text-cobalt"
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-4 gap-4">
        {BOARDS.map((b) => (
          <Board
            key={b.key}
            board={b}
            data={data}
            scope={scope}
            perGame={perGame}
            highlight={highlight}
            onOpen={(board, rowId) => onOpenBoard(board, rowId, perGame)}
          />
        ))}
      </div>
    </div>
  )
}
```

Create `src/renderer/src/screens/stats/StatsLeaderboard.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { ColumnPicker } from '@/components/stats/ColumnPicker'
import { CheckToggle, Segmented, StatsButton, StatsSelect } from '@/components/stats/controls'
import { HeatLegend, LeaderTable } from '@/components/stats/LeaderTable'
import { ScopeBar } from '@/components/stats/ScopeBar'
import { ViewsMenu } from '@/components/stats/ViewsMenu'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { familyLabel } from '@/lib/stats/format'
import {
  bestFirst,
  csvFileName,
  defaultBoard,
  engineSort,
  familiesOf,
  familyColumns,
  leaderboardCsv,
  leaderboardQuery,
  leaderRows,
  tabOf,
  tabsOf
} from '@/lib/stats/leaderboard'
import { rangeLabel, type StatsScope } from '@/lib/stats/scope'
import { useStatsQuery, type StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import { NFL_TEAMS, toNflverseTeam } from '@shared/teams'
import type { Entity, LeaderboardBoard, MetricFamily, StatsView } from '@shared/stats/types'

/** Rows rendered at a time; "Show more" adds as many. */
const PAGE = 50

const TITLES: Record<string, string> = {
  ALL: 'offense',
  QB: 'quarterback',
  RB: 'running back',
  WR: 'wide receiver',
  TE: 'tight end',
  K: 'kicker',
  P: 'punter',
  DL: 'defensive line',
  LB: 'linebacker',
  DB: 'defensive back',
  offense: 'team offense',
  defense: 'team defense',
  forecast: 'team ratings'
}

const QUALIFY: Record<string, string> = {
  snap_share: 'a share of the snaps',
  qb_epa_db: 'dropbacks',
  carry_share: 'carries',
  target_share: 'targets',
  fg_pct: 'field-goal attempts',
  punt_net_avg: 'punts',
  def_snap_share: 'defensive snaps'
}

const TEAMS = [...NFL_TEAMS].map(toNflverseTeam).sort()

/** What opens a leaderboard: a board's "All →", a row, a saved view. The nonce re-applies it. */
export interface LeaderboardOpen {
  board: LeaderboardBoard
  selected: string | null
  nonce: number
}

/**
 * Spec §9.2 leaderboards (handoff 3d "Ledger" table): position (or team unit) tabs, filters,
 * a family filter and a column picker over the catalogue, saved views and CSV export.
 */
export function StatsLeaderboard({
  entity,
  data,
  scope,
  onScope,
  hasLeague,
  open,
  views,
  onSaveView,
  onDeleteView,
  onOpenView
}: {
  entity: Entity
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  open: LeaderboardOpen | null
  views: StatsView[]
  onSaveView: (name: string, board: LeaderboardBoard) => Promise<void>
  onDeleteView: (view: StatsView) => Promise<void>
  onOpenView: (view: StatsView) => void
}): React.JSX.Element {
  // The board on screen: the one opened (until the user changes it), else the default tab's.
  const [own, setOwn] = useState<{ nonce: number | null; board: LeaderboardBoard } | null>(null)
  const opened = open && open.board.entity === entity ? open : null
  const board =
    own && own.nonce === (opened?.nonce ?? null)
      ? own.board
      : (opened?.board ?? defaultBoard(entity, tabsOf(entity)[0].id, data.byId))
  const setBoard = (b: LeaderboardBoard): void => setOwn({ nonce: opened?.nonce ?? null, board: b })
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<{ nonce: number | null; id: string } | null>(null)
  const selected =
    picked && picked.nonce === (opened?.nonce ?? null) ? picked.id : (opened?.selected ?? null)
  const [limit, setLimit] = useState(PAGE)
  const [notice, setNotice] = useState<string | null>(null)

  const tab = tabOf(entity, board.tab)
  const query = useMemo(
    () =>
      data.byId.size > 0 && board.columns.length > 0
        ? leaderboardQuery(board, scope, data.status, data.byId)
        : null,
    [board, scope, data.status, data.byId]
  )
  const { result, loading, error } = useStatsQuery(query, data.version)
  const rows = useMemo(
    () => (result ? leaderRows(result, board, data.ownership, search) : []),
    [result, board, data.ownership, search]
  )
  const families = familiesOf(data.catalogue, tab)
  const range = rangeLabel(scope, data.status)

  const update = (patch: Partial<LeaderboardBoard>): void => {
    const next = { ...board, ...patch }
    // The sorted column was removed: sort as the engine now does.
    if (next.sort.by !== 'name' && !next.columns.includes(next.sort.by)) {
      const { metric, dir } = engineSort(next, data.byId)
      next.sort = { by: metric, dir }
    }
    setBoard(next)
    setLimit(PAGE)
  }
  const sortBy = (by: string): void => {
    const dir =
      board.sort.by === by
        ? board.sort.dir === 'asc'
          ? 'desc'
          : 'asc'
        : by === 'name'
          ? 'asc'
          : bestFirst(data.byId.get(by))
    update({ sort: { by, dir } })
  }
  const switchTab = (id: string): void => {
    const next = defaultBoard(entity, id, data.byId)
    update({
      ...next,
      perGame: board.perGame,
      qualifiedOnly: board.qualifiedOnly,
      owner: board.owner,
      team: board.team
    })
  }
  const setFamily = (family: MetricFamily | 'default'): void => {
    if (family === 'default') {
      update({ columns: defaultBoard(entity, board.tab, data.byId).columns })
      return
    }
    const columns = familyColumns(data.catalogue, tab, family)
    const keep = columns.includes(board.sort.by)
    update({
      columns,
      sort: keep ? board.sort : { by: columns[0], dir: bestFirst(data.byId.get(columns[0])) }
    })
  }

  async function exportCsv(): Promise<void> {
    setNotice(null)
    try {
      const path = await api.stats.exportCsv(
        csvFileName(board, scope, range),
        leaderboardCsv(rows, board, data.byId)
      )
      if (path) setNotice(`Saved ${rows.length} rows to ${path}`)
    } catch (err) {
      setNotice(errorMessage(err))
    }
  }

  const title = `${scope.season} ${TITLES[tab.id] ?? tab.label} leaderboard`
  const qualifyNote = tab.qualifier
    ? `Qualified: enough ${QUALIFY[tab.qualifier] ?? data.byId.get(tab.qualifier)?.sampleLabel} for the weeks in range`
    : 'Every team qualifies'
  const sortLabel =
    board.sort.by === 'name' ? 'name' : (data.byId.get(board.sort.by)?.label ?? board.sort.by)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5 px-8 pt-[22px] pb-4">
      <header className="flex items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-[7px]">
          <h1 className="m-0 truncate text-[26px] leading-[1.1] font-semibold tracking-[-0.025em] first-letter:uppercase">
            {title}
          </h1>
          <div className="text-[13px] text-fg-3">
            {range} · {qualifyNote} · Shading is percentile within{' '}
            {entity === 'player' ? 'position' : 'the league'}
          </div>
        </div>
        <ScopeBar scope={scope} status={data.status} hasLeague={hasLeague} onChange={onScope} />
      </header>

      <div className="flex items-end justify-between gap-4 border-b border-line">
        <div role="tablist" className="flex gap-[22px]">
          {tabsOf(entity).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab.id}
              onClick={() => switchTab(t.id)}
              className={cn(
                'h-8 cursor-pointer text-[13.5px] leading-none',
                t.id === tab.id
                  ? 'font-semibold text-fg shadow-[inset_0_-2px_0_var(--fg)]'
                  : 'font-medium text-fg-3 hover:text-fg'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 pb-1.5">
          <StatsSelect
            title="Metric family"
            value="default"
            options={[
              { value: 'default' as const, label: 'Columns: this tab' },
              ...families.map((f) => ({ value: f, label: `Columns: ${familyLabel(f)}` }))
            ]}
            onChange={setFamily}
          />
          <ColumnPicker
            tab={tab}
            catalogue={data.catalogue}
            columns={board.columns}
            onChange={(columns) => update({ columns })}
            onReset={() => update({ columns: defaultBoard(entity, board.tab, data.byId).columns })}
          />
          <ViewsMenu
            views={views}
            onOpen={onOpenView}
            onSave={(name) => onSaveView(name, board)}
            onDelete={onDeleteView}
          />
          <StatsButton
            title="Save this table as CSV"
            onClick={() => void exportCsv()}
            disabled={!rows.length}
          >
            <Download className="size-3.5" />
            CSV
          </StatsButton>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Segmented
          label="Totals or per game"
          value={board.perGame ? 'per' : 'tot'}
          options={[
            { value: 'tot', label: 'Totals' },
            { value: 'per', label: 'Per game' }
          ]}
          onChange={(v) => update({ perGame: v === 'per' })}
        />
        {tab.qualifier && (
          <CheckToggle
            on={board.qualifiedOnly}
            onChange={(qualifiedOnly) => update({ qualifiedOnly })}
          >
            Qualified only
          </CheckToggle>
        )}
        {entity === 'player' && (
          <StatsSelect
            title="Team"
            value={board.team ?? ''}
            options={[
              { value: '', label: 'All teams' },
              ...TEAMS.map((t) => ({ value: t, label: t }))
            ]}
            onChange={(t) => update({ team: t || null })}
            className="w-[110px]"
          />
        )}
        {hasLeague && data.ownership && (
          <StatsSelect
            title="Fantasy rosters"
            value={board.owner}
            options={[
              {
                value: 'all' as const,
                label: entity === 'player' ? 'All players' : 'All defenses'
              },
              { value: 'mine' as const, label: entity === 'player' ? 'My team' : 'My defense' },
              { value: 'free' as const, label: 'Free agents' }
            ]}
            onChange={(owner) => update({ owner })}
          />
        )}
        <label className="flex h-7 w-[180px] items-center gap-[7px] rounded-[7px] border border-line bg-panel px-2.5 text-fg-3">
          <Search className="size-3.5 shrink-0" />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setLimit(PAGE)
            }}
            placeholder={entity === 'player' ? 'Player' : 'Team'}
            aria-label="Search"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none"
          />
        </label>
      </div>

      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-auto rounded-[8px] border border-line bg-panel transition-opacity duration-150',
          loading && result && 'opacity-60'
        )}
      >
        {result && (
          <LeaderTable
            rows={rows.slice(0, limit)}
            board={board}
            tab={tab}
            columns={result.columns}
            byId={data.byId}
            ownership={data.ownership}
            season={scope.season}
            selected={selected}
            onSelect={(id) => setPicked({ nonce: opened?.nonce ?? null, id })}
            onSort={sortBy}
          />
        )}
        {!result && loading && (
          <div className="py-16 text-center text-[13px] text-fg-3">Loading the table…</div>
        )}
        {error && <div className="py-16 text-center text-[13px] text-bad">{error}</div>}
        {result && !loading && rows.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="text-[14px] font-medium text-fg-2">
              No {entity === 'player' ? 'players' : 'teams'} match.
            </div>
            <button
              type="button"
              onClick={() => {
                setSearch('')
                update({ team: null, owner: 'all', qualifiedOnly: false })
              }}
              className="h-7 cursor-pointer rounded-[6px] bg-cobalt px-3 text-[12.5px] font-semibold text-on-cobalt"
            >
              Reset filters
            </button>
          </div>
        )}
      </div>

      <footer className="flex shrink-0 items-start justify-between gap-4 text-[12px] text-fg-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-3">
            <span>
              <span className="font-semibold text-fg">{Math.min(limit, rows.length)}</span> of{' '}
              {rows.length} · sorted by {sortLabel} · {board.perGame ? 'per game' : 'totals'}
            </span>
            {rows.length > limit && (
              <button
                type="button"
                onClick={() => setLimit(limit + PAGE)}
                className="h-6 cursor-pointer rounded-[6px] border border-line bg-panel px-2 text-[12px] font-medium text-fg hover:bg-hover"
              >
                Show {Math.min(PAGE, rows.length - limit)} more
              </button>
            )}
          </div>
          {notice && <div className="truncate text-fg-2">{notice}</div>}
          {result?.notes.map((n) => (
            <div key={n} className="truncate">
              {n}
            </div>
          ))}
        </div>
        <HeatLegend />
      </footer>
    </div>
  )
}
```

Create `src/renderer/src/screens/stats/StatsGlossary.tsx`:

```tsx
import { useState } from 'react'
import { Search } from 'lucide-react'
import { Segmented, StatsSelect } from '@/components/stats/controls'
import { MetricCardBody } from '@/components/stats/MetricCard'
import { familyLabel } from '@/lib/stats/format'
import { searchKey } from '@/lib/stats/leaderboard'
import type { MetricFamily, MetricInfo } from '@shared/stats/types'

const FAMILIES: MetricFamily[] = ['traditional', 'advanced', 'ngs', 'charting', 'predictive']

/**
 * Glossary (handoff Stats nav): every metric the screens show (tiers core and extended), with the
 * catalogue's words, sample, seasons, source and reliability. Written for a person and an LLM (§10).
 */
export function StatsGlossary({ catalogue }: { catalogue: MetricInfo[] }): React.JSX.Element {
  const [entity, setEntity] = useState<'player' | 'team'>('player')
  const [family, setFamily] = useState<MetricFamily | ''>('')
  const [search, setSearch] = useState('')
  const needle = searchKey(search.trim())
  const shown = catalogue
    .filter(
      (m) =>
        m.tier !== 'stored' &&
        m.entity === entity &&
        (!family || m.family === family) &&
        (!needle || searchKey(`${m.label} ${m.short} ${m.description}`).includes(needle))
    )
    .sort((a, b) => a.label.localeCompare(b.label))
  return (
    <div className="flex flex-col gap-5 px-8 pt-[22px] pb-7">
      <header className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="m-0 text-[28px] leading-none font-bold tracking-[-0.03em]">Glossary</h1>
          <div className="text-[13px] text-fg-2">
            {shown.length} {entity} metrics · what each measures, its sample, and how much it
            carries over from one season to the next
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Segmented
            label="Players or teams"
            value={entity}
            options={[
              { value: 'player', label: 'Players' },
              { value: 'team', label: 'Teams' }
            ]}
            onChange={setEntity}
          />
          <StatsSelect
            title="Family"
            value={family}
            options={[
              { value: '' as const, label: 'Every family' },
              ...FAMILIES.map((f) => ({ value: f, label: familyLabel(f) }))
            ]}
            onChange={setFamily}
          />
          <label className="flex h-7 w-[200px] items-center gap-[7px] rounded-[7px] border border-line bg-panel px-2.5 text-fg-3">
            <Search className="size-3.5 shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search metrics"
              aria-label="Search metrics"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none"
            />
          </label>
        </div>
      </header>
      <div className="grid grid-cols-3 gap-4">
        {shown.map((m) => (
          <article
            key={m.id}
            className="rounded-[10px] bg-panel p-3.5 shadow-[0_0_0_1px_var(--line)]"
          >
            <MetricCardBody info={m} className="w-full" />
          </article>
        ))}
      </div>
    </div>
  )
}
```

Create `src/renderer/src/screens/stats/StatsApp.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { StatsNav, type StatsScreen } from '@/components/stats/StatsNav'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import type { BoardDef } from '@/lib/stats/boards'
import { bestFirst, defaultBoard } from '@/lib/stats/leaderboard'
import { defaultScope, type StatsScope } from '@/lib/stats/scope'
import { useStatsData } from '@/lib/stats/useStats'
import { StatsGlossary } from '@/screens/stats/StatsGlossary'
import { StatsHome } from '@/screens/stats/StatsHome'
import { StatsLeaderboard, type LeaderboardOpen } from '@/screens/stats/StatsLeaderboard'
import type { LeaderboardBoard, StatsView } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'

interface StatsAppProps {
  hasLeague: boolean
  /** Bumped when league data changed: the rosters are read again. */
  leagueKey: number
  onOpenFantasy: () => void
  update: UpdateState
  version: string | null
  onOpenUpdate: () => void
  onToggleTheme: () => void
}

/**
 * Companion Stats (stats-analysis spec §9, design handoff "Companion Stats"): its own shell and
 * nav, the scope shared by every screen (§9.1), the Stats home and the leaderboards (§9.2).
 */
export function StatsApp({
  hasLeague,
  leagueKey,
  onOpenFantasy,
  update,
  version,
  onOpenUpdate,
  onToggleTheme
}: StatsAppProps): React.JSX.Element {
  const data = useStatsData(leagueKey)
  const [screen, setScreen] = useState<StatsScreen>('home')
  const [chosen, setChosen] = useState<StatsScope | null>(null)
  const scope = chosen ?? defaultScope(data.status, hasLeague)
  const [open, setOpen] = useState<LeaderboardOpen | null>(null)
  const [views, setViews] = useState<StatsView[]>([])
  const [viewsError, setViewsError] = useState<string | null>(null)

  useEffect(() => {
    void api.stats
      .views()
      .then(setViews)
      .catch((err) => setViewsError(errorMessage(err)))
  }, [])

  // A league removed or added: "My league" scoring follows.
  const effective: StatsScope =
    scope.scoring === 'league' && !hasLeague ? { ...scope, scoring: 'ppr' } : scope

  const openBoard = (board: LeaderboardBoard, selected: string | null): void => {
    setOpen((o) => ({ board, selected, nonce: (o?.nonce ?? 0) + 1 }))
    setScreen(board.entity === 'player' ? 'players' : 'teams')
  }
  const openFromHome = (b: BoardDef, rowId: string | null, perGame: boolean): void => {
    const entity = b.position ? 'player' : 'team'
    const base = defaultBoard(entity, b.tab, data.byId)
    const columns = base.columns.includes(b.metric) ? base.columns : [b.metric, ...base.columns]
    openBoard(
      {
        ...base,
        columns,
        perGame,
        sort: { by: b.metric, dir: bestFirst(data.byId.get(b.metric)) }
      },
      rowId
    )
  }
  const openView = (v: StatsView): void => openBoard(v.board, null)
  const saveView = async (name: string, board: LeaderboardBoard): Promise<void> => {
    const saved = await api.stats.saveView(name, board)
    setViews((vs) =>
      [...vs.filter((v) => v.id !== saved.id), saved].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      )
    )
  }
  const deleteView = async (view: StatsView): Promise<void> => {
    await api.stats.deleteView(view.id)
    setViews((vs) => vs.filter((v) => v.id !== view.id))
  }

  const unavailable = data.status !== null && !data.status.available
  return (
    <div className="stats flex h-full flex-col bg-paper text-fg">
      <StatsNav
        current={screen}
        onNavigate={setScreen}
        status={data.status}
        hasLeague={hasLeague}
        onOpenFantasy={onOpenFantasy}
        update={update}
        version={version}
        onOpenUpdate={onOpenUpdate}
        onToggleTheme={onToggleTheme}
      />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto">
        {unavailable || data.error ? (
          <div className="py-20 text-center text-[13px] text-bad">
            {data.error ?? 'The stats database could not be opened on this computer.'}
          </div>
        ) : (
          <>
            {screen === 'home' && (
              <StatsHome
                data={data}
                scope={effective}
                onScope={setChosen}
                hasLeague={hasLeague}
                views={views}
                onOpenBoard={openFromHome}
                onOpenView={openView}
              />
            )}
            {(screen === 'players' || screen === 'teams') && (
              <StatsLeaderboard
                key={screen}
                entity={screen === 'players' ? 'player' : 'team'}
                data={data}
                scope={effective}
                onScope={setChosen}
                hasLeague={hasLeague}
                open={open}
                views={views}
                onSaveView={saveView}
                onDeleteView={deleteView}
                onOpenView={openView}
              />
            )}
            {screen === 'glossary' && <StatsGlossary catalogue={data.catalogue} />}
            {viewsError && <div className="px-8 pb-4 text-[12px] text-bad">{viewsError}</div>}
          </>
        )}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/renderer/components/StatsApp.test.tsx
```

Expected: PASS (7 passed). Then the typecheck, lint and full suite: clean; 923 passed | 5 skipped.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/renderer/src/components/stats/LeaderTable.tsx src/renderer/src/components/stats/ColumnPicker.tsx src/renderer/src/components/stats/ViewsMenu.tsx src/renderer/src/screens/stats/StatsHome.tsx src/renderer/src/screens/stats/StatsLeaderboard.tsx src/renderer/src/screens/stats/StatsGlossary.tsx src/renderer/src/screens/stats/StatsApp.tsx tests/renderer/components/StatsApp.test.tsx
git add src/renderer/src/components/stats/LeaderTable.tsx src/renderer/src/components/stats/ColumnPicker.tsx src/renderer/src/components/stats/ViewsMenu.tsx src/renderer/src/screens/stats/StatsHome.tsx src/renderer/src/screens/stats/StatsLeaderboard.tsx src/renderer/src/screens/stats/StatsGlossary.tsx src/renderer/src/screens/stats/StatsApp.tsx tests/renderer/components/StatsApp.test.tsx
git commit -m "feat(stats): add the home, leaderboards, glossary"
```

---

### Task 7: Two products in the app (spec §9.1; amendment A)

The Fantasy nav gains "Stats ↗". The app opens on Stats when no league is imported, and "Fantasy ↗" then opens Setup.

**Files:**

- Create: `tests/renderer/components/App.test.tsx`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/components/TopNav.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/components/App.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import App from '@/App'
import { api } from '@/lib/api'
import type { League } from '@shared/types'

vi.mock('@/lib/api', () => ({
  api: {
    app: { version: vi.fn() },
    league: { get: vi.fn() },
    sync: { onProgress: vi.fn() }
  }
}))
vi.mock('@/lib/useUpdateState', () => ({ useUpdateState: () => ({ status: 'idle' }) }))
// The products' screens are tested on their own; here only which one shows.
vi.mock('@/screens/stats/StatsApp', () => ({
  StatsApp: ({ onOpenFantasy }: { onOpenFantasy: () => void }) => (
    <button type="button" onClick={onOpenFantasy}>
      Stats product
    </button>
  )
}))
vi.mock('@/components/TopNav', () => ({
  TopNav: ({ current, onOpenStats }: { current: string; onOpenStats: () => void }) => (
    <button type="button" onClick={onOpenStats}>
      Fantasy nav on {current}
    </button>
  )
}))
vi.mock('@/screens/SetupScreen', () => ({ SetupScreen: () => <div>Setup screen</div> }))
vi.mock('@/screens/LeagueScreen', () => ({ LeagueScreen: () => <div>League screen</div> }))
vi.mock('@/components/UpdateDialog', () => ({ UpdateDialog: () => null }))

const LEAGUE: League = {
  leagueId: 'L1',
  name: 'Emoney',
  season: '2026',
  status: 'in_season',
  totalRosters: 12,
  syncedAt: null
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.app.version).mockResolvedValue('0.28.0')
  vi.mocked(api.sync.onProgress).mockReturnValue(() => {})
})
afterEach(cleanup)

describe('App: two products (stats-analysis spec §9.1)', () => {
  it('opens on Stats without a league, and Fantasy then opens on Setup', async () => {
    vi.mocked(api.league.get).mockResolvedValue(null)
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Stats product' }))
    expect(screen.getByText('Setup screen')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fantasy nav on setup' })).toBeTruthy()
  })

  it('opens on Fantasy with a league, and Stats ↗ switches product', async () => {
    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
    render(<App />)
    expect(await screen.findByText('League screen')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Fantasy nav on league' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Stats product' }))
    // Back to the last Fantasy screen.
    expect(screen.getByText('League screen')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/renderer/components/App.test.tsx
```

Expected: FAIL. The app opens on Setup, with no Stats product to find.

- [ ] **Step 3: The product switch and "Stats ↗"**

```diff
diff --git a/src/renderer/src/App.tsx b/src/renderer/src/App.tsx
index 8d98387..d95b57a 100644
--- a/src/renderer/src/App.tsx
+++ b/src/renderer/src/App.tsx
@@ -8,6 +8,7 @@ import { PlayersScreen } from '@/screens/PlayersScreen'
 import { LineupScreen } from '@/screens/LineupScreen'
 import { TradeScreen } from '@/screens/TradeScreen'
 import { WaiverScreen } from '@/screens/WaiverScreen'
+import { StatsApp } from '@/screens/stats/StatsApp'
 import { api } from '@/lib/api'
 import { useTheme } from '@/lib/theme'
 import { useUpdateState } from '@/lib/useUpdateState'
@@ -16,6 +17,8 @@ import { useUpdateState } from '@/lib/useUpdateState'
 const FULL_BLEED: Screen[] = ['league', 'players', 'lineup', 'trade', 'waivers', 'rules', 'setup']

 export default function App(): React.JSX.Element {
+  // Two products, one app (design handoff 2026-10-16): Fantasy, and Stats, which works without a league.
+  const [product, setProduct] = useState<'fantasy' | 'stats'>('fantasy')
   const [screen, setScreen] = useState<Screen>('league')
   const [hasLeague, setHasLeague] = useState<boolean | null>(null)
   const [dataVersion, setDataVersion] = useState(0)
@@ -43,11 +46,16 @@ export default function App(): React.JSX.Element {
       .get()
       .then((league) => {
         setHasLeague(league !== null)
-        if (league === null) setScreen('setup')
+        // Stats-analysis spec §9.1: with no league, the app opens on Stats.
+        if (league === null) {
+          setScreen('setup')
+          setProduct('stats')
+        }
       })
       .catch(() => {
         setHasLeague(false)
         setScreen('setup')
+        setProduct('stats')
       })
   }, [])

@@ -71,6 +79,35 @@ export default function App(): React.JSX.Element {
     )
   }

+  const updateDialog = (
+    <UpdateDialog
+      state={update}
+      currentVersion={version ?? '?'}
+      open={updateOpen}
+      onOpenChange={setUpdateOpen}
+    />
+  )
+
+  if (product === 'stats') {
+    return (
+      <>
+        <StatsApp
+          hasLeague={hasLeague}
+          leagueKey={dataVersion}
+          onOpenFantasy={() => {
+            if (!hasLeague) setScreen('setup')
+            setProduct('fantasy')
+          }}
+          update={update}
+          version={version}
+          onOpenUpdate={() => setUpdateOpen(true)}
+          onToggleTheme={toggleTheme}
+        />
+        {updateDialog}
+      </>
+    )
+  }
+
   return (
     <div className="flex h-full flex-col">
       <TopNav
@@ -84,6 +121,7 @@ export default function App(): React.JSX.Element {
         onToggleTheme={toggleTheme}
         refreshKey={dataVersion}
         onRefreshed={bumpData}
+        onOpenStats={() => setProduct('stats')}
       />
       <main
         className={
@@ -108,12 +146,7 @@ export default function App(): React.JSX.Element {
         {screen === 'trade' && <TradeScreen dataVersion={dataVersion} />}
         {screen === 'waivers' && <WaiverScreen dataVersion={dataVersion} />}
       </main>
-      <UpdateDialog
-        state={update}
-        currentVersion={version ?? '?'}
-        open={updateOpen}
-        onOpenChange={setUpdateOpen}
-      />
+      {updateDialog}
     </div>
   )
 }
```

```diff
diff --git a/src/renderer/src/components/TopNav.tsx b/src/renderer/src/components/TopNav.tsx
index 27b5ba2..5e11d5f 100644
--- a/src/renderer/src/components/TopNav.tsx
+++ b/src/renderer/src/components/TopNav.tsx
@@ -30,6 +30,8 @@ interface TopNavProps {
   /** Bumped by App when data changed, so the sync line re-reads its status. */
   refreshKey: number
   onRefreshed: () => void
+  /** "Stats ↗" (handoff "Fantasy nav"): the other product. */
+  onOpenStats: () => void
 }

 /**
@@ -113,7 +115,7 @@ function SyncButton({
   )
 }

-/** Fantasy nav (README "Fantasy nav"): mark, seven screens, sync line, update and theme. */
+/** Fantasy nav (README "Fantasy nav"): mark, seven screens, sync line, update, Stats ↗ and theme. */
 export function TopNav({
   current,
   onNavigate,
@@ -124,7 +126,8 @@ export function TopNav({
   theme,
   onToggleTheme,
   refreshKey,
-  onRefreshed
+  onRefreshed,
+  onOpenStats
 }: TopNavProps): React.JSX.Element {
   return (
     <nav className="flex h-[54px] shrink-0 items-center gap-7 border-b border-line px-8">
@@ -157,6 +160,15 @@ export function TopNav({
       <div className="ml-auto flex items-center gap-4 text-[12.5px] leading-none font-medium text-fg-2">
         <UpdatePill state={update} onOpen={onOpenUpdate} />
         {hasLeague && <SyncButton refreshKey={refreshKey} onRefreshed={onRefreshed} />}
+        <button
+          type="button"
+          onClick={onOpenStats}
+          title="Open Companion Stats"
+          className="flex cursor-pointer items-center gap-1.5 hover:text-fg"
+        >
+          <Mark product="stats" size={14} />
+          Stats ↗
+        </button>
         <button
           type="button"
           title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/renderer/components/App.test.tsx
```

Expected: PASS (2 passed). Then the typecheck, lint and full suite: clean; 925 passed | 5 skipped.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/src/App.tsx src/renderer/src/components/TopNav.tsx tests/renderer/components/App.test.tsx
git add src/renderer/src/App.tsx src/renderer/src/components/TopNav.tsx tests/renderer/components/App.test.tsx
git commit -m "feat(app): open Stats from Fantasy or no league"
```

---

### Task 8: Docs

**Files:**

- Create: `docs/reference/stats-screens.md`
- Modify: `README.md`, `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`

- [ ] **Step 1: The screens reference**

Create `docs/reference/stats-screens.md`:

```md
# Stats screens — reference

Added in v0.28.0 (Plan AA; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.1–§9.2, amended in §18). Companion Stats is the app's second product: its own shell and cobalt palette (design handoff 2026-10-16, "Companion Stats"), reachable from the Fantasy nav ("Stats ↗"), and where the app opens when no league is imported. Every number comes from the query engine (`stats.query`, data reference: `docs/reference/stats-database.md`).

## Shell

- **Nav:** Leaderboards · Players · Teams · Games (later) · Glossary; "Data through 2026 week 6 · updated 2 h ago" from `stats.status()` ("updating…" while a refresh runs); "Fantasy ↗" (Setup without a league); the theme toggle.
- **Scope** (every screen, kept for the session): season (2019 → latest), Regular season / Postseason / Both, the regular season's week range, and the fantasy scoring (My league once a league is imported, else PPR, Half PPR, Standard).
- A finished rebuild (`stats:changed`) re-reads the status and the catalogue and runs every query on screen again.

## Leaderboards (home)

Eight boards, the top six of each: QB passing yards and yards per attempt, RB rushing yards and touches, WR receiving yards and target share, TE receiving yards, team takeaways (`def_turnovers`). A row needs the metric's own qualification and half the regular-season games in range (one in the postseason). Totals or per game. With a league, "My players" marks my players with an amber dot and adds my best one under a dashed line when he ranks outside the top six. "All →" or a row opens the full leaderboard sorted by that metric (the row selected). Saved views are listed above the boards.

## Players and Teams

The Ledger table: one tab per position group (All offense, QB, RB, WR, TE, K, P, DL, LB, DB) or team unit (Offense, Defense, Ratings & odds), each with default columns in named groups (`src/renderer/src/lib/stats/leaderboard.ts`).

| Shown            | From                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Value            | The metric's value after Totals / Per game (`perGame` divides counts by games)                                                                                                                                                                                                                                                                                  |
| Shading          | Its percentile among qualified rows of the same position (teams: the league): ≥ 90 / 75 / 60 green, ≤ 10 / 25 / 40 red; neutral metrics (pass rate, pace) unshaded                                                                                                                                                                                              |
| Hover on a value | Percentile, rank, the sample in words (`MetricInfo.sampleLabel`), "below the qualifying sample", "estimated"                                                                                                                                                                                                                                                    |
| `est`            | Routes and the shares built on them in the current season (participation is published after the season)                                                                                                                                                                                                                                                         |
| Column head      | Short label, reliability marker (three bars: high, medium, low year-to-year stability); hover: the catalogue entry (description, family, positions, sample and minimum, seasons, sources, reliability)                                                                                                                                                          |
| G                | The row's games                                                                                                                                                                                                                                                                                                                                                 |
| NQ               | Below the tab's qualifier: QB dropbacks (`qb_epa_db`, 200), RB carries (`carry_share`, 50), WR / TE targets (`target_share`, 30), K field-goal attempts (20), P punts (30), defenders' defensive snaps (200), All offense's offensive snaps (200); each per 17 games, scaled to the weeks in range. "Qualified only" (default) hides them. Teams always qualify |
| Owner mark       | With a league: amber dot for my players (my defense), a hollow ring for another team's, its name on hover                                                                                                                                                                                                                                                       |

- **Filters:** Totals / Per game, Qualified only, team (players), with a league All / My team / Free agents, search by name. Ownership and search filter the engine's rows, so percentiles stay among the whole position.
- **Columns:** "Columns: this tab" or one family's core metrics on the tab (Traditional, Advanced, Next Gen, Charting, Predictive; extended ones fill in to 12); the column picker adds any core or extended metric of the tab (at most 40) or removes one; Reset.
- **Sort:** a column head (best first, then the other way), or the name. The engine sorts; the table shows 50 rows at a time.
- **Views:** a named board saved in `companion.db` (`stats_views`): entity, tab, columns, sort, per game, qualified only, team, owner filter. The season, weeks and scoring stay the screen's. Saving under an existing name (any case) replaces it.
- **CSV:** every row the filters keep (not only the 50 shown): rank, name, team, position and gsis id (players), games, then each column unformatted, percentages in percent. Saved where the dialog says (Downloads by default), UTF-8 with a byte-order mark so Excel reads accents.

## Glossary

Every core and extended metric, players or teams, by family or search, with the same entry as the column hover.

## IPC

`stats.ownership()` (the league's rosters keyed by gsis id and nflverse team code, from `player_ids`), `stats.views()`, `stats.saveView(name, board)`, `stats.deleteView(id)`, `stats.exportCsv(fileName, csv)`; and Plan Y's `stats.query`, `stats.catalogue`, `stats.status`, `stats.onChanged`.

## Speed

Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms.
```

- [ ] **Step 2: The README**

```diff
diff --git a/README.md b/README.md
index f1bffd9..bc8d74d 100644
--- a/README.md
+++ b/README.md
@@ -4,6 +4,7 @@ Windows desktop companion for a Sleeper fantasy football league: league sync, st

 - Design: `docs/superpowers/specs/`
 - Data reference (value & signals payload, definitions, where each number is shown): `docs/reference/value-and-signals.md`
+- Stats: the database `docs/reference/stats-database.md`, the screens `docs/reference/stats-screens.md`. Stats works without a league: the app then opens on it.
 - Plans: `docs/superpowers/plans/`
 - Changelog: GitHub Releases (`https://github.com/Puffinnois/fantasy-football-companion/releases`) — each release's notes are what the in-app update popup shows.
 - Dev (WSL2, Node 22 via nvm): `npm install && npm run dev`
```

- [ ] **Step 3: The spec amendment**

```diff
diff --git a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
index 7eeefd6..507c14a 100644
--- a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
+++ b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
@@ -1,6 +1,6 @@
 # Stats analysis — design

-**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X), 2026-10-17 (§16: Plan Y) and 2026-10-18 (§17: Plan Z) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.
+**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X), 2026-10-17 (§16: Plan Y), 2026-10-18 (§17: Plan Z) and 2026-10-20 (§18: Plan AA) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.

 **Sources:** the stats catalog (`docs/research/2026-10-09-nfl-stats-catalog.md`), the predictive-metrics catalogue (`docs/research/nfl_predictive_metrics.md`), the coverage audit (`docs/research/2026-10-14-warehouse-coverage-audit.md`), and a DuckDB vs SQLite benchmark on 2023–2025 play-by-play and participation (§3.2).

@@ -518,3 +518,25 @@ Measured on the live database while Plan Z was written (its Planning findings),
   - The score is named "Athletic score (RAS-style)". It averages raw measures, so it is not Kent Lee Platte's RAS (DK Metcalf: 7.2 here, 9.07 there). It needs four measures.
 - **M. The EPA + CPOE composite** (moved from Plan Y) averages the two in standard deviations of qualified 2019–2025 QB seasons, with fixed norms.
 - **N. Plan Y follow-up.** At the week and season grains, a counted component a player never had (carries for a receiver) read NULL, so sums of components did too (touches, opportunity share, ANY/A). Play-by-play and box-score components now read 0. FTN, participation, NGS and PFR stay NULL: there, NULL means "not measured".
+
+## 18. Amendment 2026-10-20: the Stats screen (Plan AA)
+
+Decided with the user and measured on the live database while Plan AA was written (its Planning findings), and taken into the build. `docs/reference/stats-screens.md` documents the result.
+
+- **A. Two products (§9.1, §9.6).** Stats follows the approved design handoff (2026-10-16, "Companion Stats"), not a `TopNav` entry: its own shell, cobalt palette and nav (Leaderboards · Players · Teams · Games · Glossary).
+  - The Fantasy nav gains "Stats ↗"; the Stats nav has "Fantasy ↗", which opens Setup when no league is imported.
+  - Games stays disabled until a later plan; Explore and Matchups join the nav with Plans AD and AE.
+  - Saved views are a Views menu on the leaderboards and chips on the home, not a nav item.
+- **B. The home (§9.2)** is the handoff's eight boards (top six, Totals / Per game, my players marked, my best one under a dashed line when outside the top six). A row needs half the regular-season games in range on top of the metric's qualification. A row or "All →" opens the full leaderboard sorted by that metric.
+- **C. The leaderboard table** is the handoff's Ledger (round 1, 3d).
+  - The percentile is the cell's shading in seven steps, not a bar; a neutral metric is unshaded. The percentile, rank and sample are in the cell's hover.
+  - The reliability marker sits in the column head, since stability is a metric's, not a value's; so does the catalogue entry, on hover.
+  - The games column is the row's games: `perGame` of the games metric reads 1.
+- **D. Qualification is the tab's.** A count's sample is its games, with no minimum, so "qualified only" changed nothing on 8 of the 10 player tabs. Each tab qualifies a row on one metric's `minSample`, scaled as the engine scales it: QB dropbacks, RB carries, WR and TE targets, K field-goal attempts, P punts, defenders' defensive snaps, All offense's offensive snaps. 2025 measured: 38 of 82 QBs, 110 of 253 WRs. Teams always qualify.
+- **E. The family filter** sets the columns to that family's core metrics on the tab (extended ones fill in to 12).
+- **F. Custom views** save the board: entity, tab, columns, sort, per game, qualified only, team and owner filter. The season, weeks and scoring stay the screen's, so a view carries over from week to week. A name is unique regardless of case; saving under it replaces the view. Table `stats_views` in `companion.db` (migration 11).
+- **G. Rosters.** Main keys the league's rosters by gsis id (`player_ids`) and team defenses by nflverse code (`stats.ownership`). My team and Free agents filter the engine's rows, so percentiles stay among the whole position. My players carry the amber dot, another team's a hollow ring naming it.
+- **H. Samples in words.** `MetricInfo.sampleLabel` names what each of the catalogue's 78 samples counts ("routes", "dropbacks faced"), for the hover and for NLQ (§10).
+- **I. CSV** holds every row the filters keep: unformatted numbers, percentages in percent, gsis ids. It is saved through a dialog (Downloads by default), in UTF-8 with a byte-order mark for Excel.
+- **J. The scope** (season, season type, the regular season's weeks, scoring) is shared by every Stats screen for the session and not saved. Postseason and Both have no week range.
+- **K. Measured** (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a 40-column query 265 ms (budgets 300 ms and 500 ms, §11).
```

If Task 9 measures different numbers, write the measured ones into both documents.

- [ ] **Step 4: Commit**

```bash
npx prettier --write docs/reference/stats-screens.md README.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git add docs/reference/stats-screens.md README.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git commit -m "docs(stats): document the Stats screens"
```

---

### Task 9: Live checks

**Files:**

- Throwaway (never committed): `tests/zz-aa-live.test.ts`
- Outside the repo: `~/project/ffc-proto-aa-live/` (the database copy, scratch profiles, the driver and its screenshots)

The live check reads a copy of Plan Z's live database, `~/project/ffc-proto-z-live/fresh-z/stats.duckdb` (2026 week 6), offline. If it is gone, build one first: run the built app once on an empty scratch profile (`--user-data-dir`), which backfills in about 4 minutes, and copy its `stats.duckdb`. The walk-through also copies the dev profile's `companion.db` (`~/.config/FantasyCompanion/companion.db`), so the scratch app has the dev league; the dev profile itself is only read.

- [ ] **Step 1: The database copy**

```bash
mkdir -p ~/project/ffc-proto-aa-live && cp ~/project/ffc-proto-z-live/fresh-z/stats.duckdb ~/project/ffc-proto-aa-live/work.duckdb
```

- [ ] **Step 2: The screens' queries on live data**

Create `tests/zz-aa-live.test.ts`:

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { openStatsService } from '@main/stats/service'
import { BOARDS, boardQuery, boardView } from '@/lib/stats/boards'
import {
  defaultBoard,
  familiesOf,
  familyColumns,
  leaderboardQuery,
  leaderRows,
  PLAYER_TABS,
  TEAM_TABS
} from '@/lib/stats/leaderboard'
import { defaultScope, minGames } from '@/lib/stats/scope'
import type { MetricInfo } from '@shared/stats/types'

// Plan AA Task 9: the screens' queries on the live database. Throwaway, never committed.
const LIVE = join(homedir(), 'project', 'ffc-proto-aa-live')
const BUDGET = { boards: 300, leaderboard: 500, cold: 2000, wide: 1000 }

it('plan AA live gates', { timeout: 900_000 }, async () => {
  const service = await openStatsService(
    { path: join(LIVE, 'work.duckdb'), tempDir: join(LIVE, 'tmp') },
    () => {},
    async () => {
      throw new Error('offline: no refresh in this check')
    }
  )
  try {
    const status = await service.status()
    const cat = await service.catalogue()
    const byId = new Map<string, MetricInfo>(cat.map((m) => [m.id, m]))
    const scope = defaultScope(status, false)
    console.log('state', JSON.stringify(status.through))

    // Every default column exists, applies to its tab, and every metric names its sample.
    const ids = [...PLAYER_TABS, ...TEAM_TABS].flatMap((t) => t.groups.flatMap(([, g]) => g))
    expect(ids.filter((id) => !byId.has(id))).toEqual([])
    expect(
      cat.filter((m) => !m.sampleLabel || m.sampleLabel.includes('_')).map((m) => m.id)
    ).toEqual([])
    expect(cat.filter((m) => m.stability).length).toBeGreaterThan(250)

    // The home: eight boards at once, six rows each, my-player row logic aside.
    for (const perGame of [false, true]) {
      const t = Date.now()
      const results = await Promise.all(
        BOARDS.map((b) => service.query(boardQuery(b, scope, status, perGame)))
      )
      const ms = Date.now() - t
      const lines = BOARDS.map((b, i) => {
        const m = byId.get(b.metric)!
        const v = boardView(results[i], m, perGame, minGames(scope, status), null, false)
        expect(v.rows, b.key).toHaveLength(6)
        return `${b.label} ${b.title}: ${v.rows
          .map((r) => `${r.name} ${r.value}`)
          .slice(0, 3)
          .join(' | ')}`
      })
      console.log(`boards${perGame ? ' per game' : ''} ${ms} ms\n  ${lines.join('\n  ')}`)
      expect(ms).toBeLessThan(BUDGET.boards)
    }

    // Every tab, the latest and the last full season: budget, qualification bites on players.
    for (const season of [scope.season - 1, scope.season]) {
      for (const tab of [...PLAYER_TABS, ...TEAM_TABS]) {
        const board = defaultBoard(tab.entity, tab.id, byId)
        const q = leaderboardQuery(board, { ...scope, season }, status, byId)
        // A cold read (the file just copied, pages not cached) once took 968 ms: gate the warm one.
        let t = Date.now()
        await service.query(q)
        const cold = Date.now() - t
        t = Date.now()
        const r = await service.query(q)
        const ms = Date.now() - t
        expect(cold, `${season} ${tab.id} cold`).toBeLessThan(BUDGET.cold)
        const shown = leaderRows(r, board, null, '').length
        const all = leaderRows(r, { ...board, qualifiedOnly: false }, null, '').length
        console.log(
          `${season} ${tab.entity} ${tab.id}: ${ms} ms (cold ${cold}), ${shown} of ${all} qualify; notes: ${r.notes.join(' / ') || '-'}`
        )
        expect(ms, `${season} ${tab.id}`).toBeLessThan(BUDGET.leaderboard)
        expect(shown, `${season} ${tab.id}`).toBeGreaterThan(0)
        if (tab.qualifier && !['K', 'P'].includes(tab.id))
          expect(shown, `${season} ${tab.id}`).toBeLessThan(all * 0.8)
        // The sort column is never all empty among the qualified.
        const sorted = leaderRows(r, board, null, '')
        expect(
          sorted.some((x) => x.values[board.sort.by]?.value !== null),
          `${tab.id} sort`
        ).toBe(true)
      }
    }

    // A family preset and the widest board a user can build.
    for (const tab of [...PLAYER_TABS, ...TEAM_TABS]) {
      for (const f of familiesOf(cat, tab))
        expect(familyColumns(cat, tab, f).length, `${tab.id} ${f}`).toBeGreaterThan(0)
    }
    const wide = cat
      .filter(
        (m) =>
          m.entity === 'player' &&
          m.tier !== 'stored' &&
          m.id !== 'games' &&
          (m.positions === 'all' || m.positions.includes('WR'))
      )
      .slice(0, 40)
      .map((m) => m.id)
    const t = Date.now()
    await service.query(
      leaderboardQuery(
        {
          ...defaultBoard('player', 'WR', byId),
          columns: wide,
          sort: { by: wide[0], dir: 'desc' }
        },
        scope,
        status,
        byId
      )
    )
    const wideMs = Date.now() - t
    console.log(`40 columns: ${wideMs} ms`)
    expect(wideMs).toBeLessThan(BUDGET.wide)
    console.log('ALL GATES PASSED')
  } finally {
    await service.close()
  }
})
```

```bash
npx vitest run tests/zz-aa-live.test.ts --reporter=verbose
```

Expected (2026-10-20, state 2026 week 6), within the budgets the gates set:

- **Home:** the eight boards in 33–38 ms (per game 23–25 ms), six rows each. Leaders: C.J. Stroud 1,714 passing yards, Lamar Jackson 10.1 Y/A, Bijan Robinson 641 rushing yards, Derrick Henry 139 touches, Jaxon Smith-Njigba 717 yards and 35.1 % target share, Isaiah Likely 383 TE yards, DEN 10 takeaways.
- **Leaderboards** (warm; cold within a few ms):

| Tab         | 2025 ms | 2025 qualify | 2026 ms | 2026 qualify |
| ----------- | ------- | ------------ | ------- | ------------ |
| All offense | 71      | 341 of 645   | 56      | 311 of 545   |
| QB          | 68      | 38 of 82     | 61      | 34 of 62     |
| RB          | 60      | 63 of 166    | 51      | 63 of 138    |
| WR          | 68      | 110 of 253   | 58      | 104 of 215   |
| TE          | 59      | 48 of 144    | 53      | 41 of 130    |
| K           | 48      | 29 of 42     | 45      | 31 of 32     |
| P           | 19      | 31 of 36     | 19      | 31 of 33     |
| DL          | 48      | 194 of 328   | 43      | 175 of 248   |
| LB          | 51      | 161 of 319   | 47      | 159 of 294   |
| DB          | 46      | 229 of 432   | 41      | 212 of 362   |
| Teams ×3    | 44–46   | 32 of 32     | 45–47   | 32 of 32     |

- **Notes** in 2026: "Pressure rate: published through 2025." (DL), "Pressure rate allowed: published through 2025." (team defense).
- **40 columns** over every WR: 256 ms.

and `ALL GATES PASSED`. If a gate fails, stop and report the numbers. Then remove the file (`npm run typecheck` does not take it: the node config has no `@/` alias):

```bash
rm tests/zz-aa-live.test.ts && git status --short
```

Expected: only the unrelated changes of Global Constraints.

- [ ] **Step 3: The app, walked through**

The driver starts the built app on a scratch profile with remote debugging, follows a list of steps over the DevTools protocol and saves screenshots. Create `~/project/ffc-proto-aa-live/drive.mjs`:

```js
// Plan AA Task 9 (throwaway, outside the repo): runs the built app on a scratch profile with remote
// debugging, follows a list of steps over the DevTools protocol and saves screenshots.
// usage: node drive.mjs <profile dir> <steps.json> <shots dir>
// steps: {size:[w,h]} {wait:ms} {click:"text or selector"} {hover:"exact text"} {type:"text"}
//        {select:["select title", "value"]} {eval:"js"} {shot:"name"}
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [profile, stepsFile, shots] = process.argv.slice(2).map((p) => resolve(p))
const APP = resolve(process.env.APP ?? '.')
mkdirSync(shots, { recursive: true })
const port = 9333
const args = [
  APP,
  `--user-data-dir=${profile}`,
  `--remote-debugging-port=${port}`,
  '--ozone-platform=x11'
]
const child = spawn(join(APP, 'node_modules/.bin/electron'), args, {
  stdio: ['ignore', 'pipe', 'pipe']
})
let log = ''
child.stdout.on('data', (d) => (log += d))
child.stderr.on('data', (d) => (log += d))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let target
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500)
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
    target = list.find((t) => t.type === 'page' && !t.url.startsWith('devtools'))
  } catch {
    // not listening yet
  }
}
if (!target) {
  console.log('the app did not start\n', log.slice(-2000))
  child.kill()
  process.exit(1)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
let id = 0
const pending = new Map()
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
  }
})
const send = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id
    pending.set(n, r)
    ws.send(JSON.stringify({ id: n, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description
}
const find = (what) => `(() => {
  const want = ${JSON.stringify(what)}
  let el = null
  try { el = document.querySelector(want) } catch {}
  const named = (sel) => [...document.querySelectorAll(sel)].find((e) => e.textContent.trim() === want)
  // Controls first: a wrapper whose only text is its button's would match too.
  return el ?? named('button,[role=tab]') ?? named('th,label,span,div')
})()`

for (const s of JSON.parse(readFileSync(stepsFile, 'utf8'))) {
  if (s.size)
    await send('Emulation.setDeviceMetricsOverride', {
      width: s.size[0],
      height: s.size[1],
      deviceScaleFactor: 1,
      mobile: false
    })
  if (s.wait) await sleep(s.wait)
  if (s.click)
    console.log(
      s.click,
      await evaluate(
        `(() => { const el = ${find(s.click)}; if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()`
      )
    )
  if (s.hover) {
    const at = await evaluate(
      `(() => { const el = ${find(s.hover)}; if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`
    )
    if (!at) console.log(s.hover, 'NOT FOUND')
    else
      for (const dx of [-3, 0])
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at[0] + dx, y: at[1] })
  }
  if (s.type) await send('Input.insertText', { text: s.type })
  if (s.select)
    console.log(
      s.select.join(' = '),
      await evaluate(`(() => {
      const el = [...document.querySelectorAll('select')].find((x) => x.title === ${JSON.stringify(s.select[0])})
      if (!el) return 'NOT FOUND'
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(s.select[1])})
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return 'set'
    })()`)
    )
  if (s.eval) console.log('eval:', JSON.stringify(await evaluate(s.eval)))
  if (s.shot) {
    const r = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(shots, `${s.shot}.png`), Buffer.from(r.result.data, 'base64'))
    console.log('shot', s.shot)
  }
}
ws.close()
child.kill('SIGTERM')
await sleep(1500)
child.kill('SIGKILL')
writeFileSync(join(shots, 'app.log'), log)
```

Create `~/project/ffc-proto-aa-live/steps-aa.json` (with the dev league):

```json
[
  { "size": [1280, 800], "wait": 8000 },
  { "shot": "01-fantasy-league" },
  { "click": "Stats ↗", "wait": 0 },
  { "wait": 2500 },
  { "shot": "02-home" },
  {
    "eval": "[...document.querySelectorAll('section button')].find((b) => b.textContent.trim() === 'All →' && b.closest('section').textContent.includes('Target share')).click()"
  },
  { "wait": 2000 },
  { "hover": "YPRR" },
  { "wait": 1200 },
  { "shot": "03-wr-hover" },
  { "click": "button[aria-pressed]" },
  { "wait": 800 },
  { "shot": "04-wr-all-rows" },
  {
    "eval": "[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Columns') && /\\d/.test(b.textContent)).click()"
  },
  { "wait": 800 },
  { "shot": "05-column-picker" },
  {
    "eval": "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))"
  },
  { "click": "Views" },
  { "wait": 500 },
  { "eval": "document.querySelector('input[aria-label=\"View name\"]').focus()" },
  { "type": "Plan AA check" },
  { "wait": 400 },
  { "click": "Save" },
  { "wait": 800 },
  { "select": ["Season", "2024"] },
  { "click": "QB" },
  { "wait": 2000 },
  { "shot": "06-qb-2024" },
  { "click": "Teams" },
  { "wait": 1500 },
  { "click": "Ratings & odds" },
  { "wait": 1500 },
  { "shot": "07-team-odds" },
  { "click": "Glossary" },
  { "wait": 1000 },
  { "shot": "08-glossary" },
  { "click": "Leaderboards" },
  { "wait": 1500 },
  { "shot": "09-home-saved-view" },
  {
    "eval": "[...document.querySelectorAll('button')].find((b) => b.title === 'Switch theme').click()"
  },
  { "wait": 800 },
  { "shot": "10-home-dark" },
  { "click": "Players" },
  { "wait": 2000 },
  { "shot": "11-players-dark" },
  {
    "eval": "[...document.querySelectorAll('button')].find((b) => b.title === 'Switch theme').click()"
  },
  { "click": "Fantasy ↗" },
  { "wait": 1500 },
  { "shot": "12-back-to-fantasy" }
]
```

Create `~/project/ffc-proto-aa-live/steps-aa-noleague.json`:

```json
[
  { "size": [1280, 800], "wait": 8000 },
  { "shot": "21-noleague-home" },
  {
    "eval": "[...document.querySelectorAll('select')].find((s) => s.title === 'Fantasy scoring').textContent"
  },
  { "click": "Players" },
  { "wait": 2000 },
  { "shot": "22-noleague-players" },
  { "click": "Fantasy ↗" },
  { "wait": 1500 },
  { "shot": "23-noleague-setup" }
]
```

```bash
npx electron-vite build
L=~/project/ffc-proto-aa-live
rm -rf $L/gui && mkdir -p $L/gui/profile $L/gui/profile-noleague
cp ~/.config/FantasyCompanion/companion.db $L/gui/profile/ && cp $L/work.duckdb $L/gui/profile/stats.duckdb
cp $L/work.duckdb $L/gui/profile-noleague/stats.duckdb
node $L/drive.mjs $L/gui/profile $L/steps-aa.json $L/gui/shots
node $L/drive.mjs $L/gui/profile-noleague $L/steps-aa-noleague.json $L/gui/shots
```

Expected: no `NOT FOUND` in the output. Open each screenshot in `$L/gui/shots` and check:

| Shot                              | Shows                                                                                                                                                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-fantasy-league`               | The League screen as before, "Stats ↗" with a cobalt mark beside the sync line.                                                                                                                                                                     |
| `02-home`                         | Companion Stats nav (Games greyed), "Data through 2026 week 6 · updated …"; eight boards of six rows, bars against the leader, amber dots on my players, a dashed extra row where my best is outside the top six; the scope bar with "My league".   |
| `03-wr-hover`                     | The 2026 wide receiver leaderboard sorted by target share (the board's metric), the first row selected; the YPRR card open: description, Advanced, sample "150 routes over a full season to qualify", sources, reliability; `est` on route columns. |
| `04-wr-all-rows`                  | "Qualified only" off: more rows, the extra ones greyed and marked NQ.                                                                                                                                                                               |
| `05-column-picker`                | The picker: search, Reset, metrics by family with reliability bars, "15 of 40 columns".                                                                                                                                                             |
| `06-qb-2024`                      | 2024, Weeks 1–18, the QB tab, Passing / Efficiency / Style / Rushing groups, the views menu closed.                                                                                                                                                 |
| `07-team-odds`                    | Teams, Ratings & odds: Elo, SRS, playoff and Super Bowl odds, no team filter, "All defenses".                                                                                                                                                       |
| `08-glossary`                     | Cards for player metrics with family, sample, seasons, sources, reliability.                                                                                                                                                                        |
| `09-home-saved-view`              | "Saved views: Plan AA check" above the boards; 2024 still in the scope bar.                                                                                                                                                                         |
| `10-home-dark`, `11-players-dark` | The dark Stats palette; shading still legible.                                                                                                                                                                                                      |
| `12-back-to-fantasy`              | The League screen, light again.                                                                                                                                                                                                                     |
| `21-noleague-home`                | Stats first, no "My players", scoring PPR (the eval prints "PPRHalf PPRStandard").                                                                                                                                                                  |
| `22-noleague-players`             | No "All players / My team / Free agents" filter, no roster marks.                                                                                                                                                                                   |
| `23-noleague-setup`               | "Fantasy ↗" opened Setup, "Stats ↗" in its nav.                                                                                                                                                                                                     |

If a screenshot differs, stop and show it to the user.

---

### Task 10: Verify, merge, release

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 925 passed | 5 skipped; the build succeeds.

- [ ] **Step 2: The Windows suite and self-test**

**Ask the user before pushing.** Then:

```bash
git push origin feat/stats-screen-aa:check/plan-aa
gh run watch "$(gh run list --branch check/plan-aa --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
git push origin --delete check/plan-aa
```

Expected: green. The log shows `"query":true`.

- [ ] **Step 3: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/stats-screen-aa` against spec §9.1–§9.2 and §11, the amendments, the handoff and the Review Focus list. Fix Critical and Important findings, each in its own commit, test first, re-running Step 1 (and the Task 9 walk-through for a screen change) after them.

- [ ] **Step 4: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/stats-screen-aa -m "merge: feat/stats-screen-aa (plan AA)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.28.0" && git tag v0.28.0
git branch -d feat/stats-screen-aa
```

- [ ] **Step 5: Status block**

Replace this plan's Status line with the outcome:

- the merge commit and the tag;
- the Task 9 numbers and the walk-through;
- the review fixes and anything deferred.

Then commit, staging this file only: `git commit -m "docs(plan): mark plan AA complete"`.

- [ ] **Step 6: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.28.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests and the packaged self-test, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.28.0 --draft=false`). The release notes should say:

- Companion Stats: "Stats ↗" in the top bar opens leaderboards for every position and every team, 2019 to today, with or without a league.
- Saved views and CSV export on every leaderboard.
- Player and team dashboards come in the next releases.

---

## Self-review against the spec

- **§9.1 Navigation and standalone.**
  - The Stats entry is "Stats ↗" and a shell of its own (amendment A; Tasks 5, 7). The app opens on Stats without a league; Setup stays one click away ("Fantasy ↗"), and the fantasy screens stay disabled without a league, as before (Task 7).
  - Global controls on every Stats screen: season, season type, week range, scoring (Task 3 models, Task 5 `ScopeBar`, Task 6 screens).
- **§9.2 Stats home.**
  - Players and Teams leaderboards with position, team, qualified-only and family filters, search, sortable columns and the column picker over core and extended metrics (Tasks 4, 6; amendments C–E).
  - Every value: the number, its percentile (shading, amendment C), the sample on hover (Task 2's words), "est.", the reliability marker and the catalogue tooltip on the column (Tasks 3, 5, 6).
  - Custom views saved in `companion.db` (Task 1; amendment F) and CSV export of any table (Tasks 1, 4, 6; amendment I).
  - With a league: rostered-by marks, My team and Free agents (Tasks 1, 4, 6; amendment G).
- **§9.6 Design.** The approved handoff for the shell, tokens and boards; the Ledger for the table (Planning findings list what had no mockup).
- **§5.3 Freshness.** "Data through week N, updated …", a quiet indicator while a refresh runs, and screens query again when a rebuild completes (Tasks 3, 5, 6).
- **§11 Testing.** Unit tests for every model and repo, component tests for the shell, screens and app; the performance budgets on live data (Task 9 Step 2); the packaged smoke test (Task 10 Step 2).
- **Not in this plan** (by §12 and §13): the team dashboard (AB), the player dashboard and the slide-over link (AC), the chart explorer, compare and trends (AD), matchups and Games (AE), natural-language queries.
