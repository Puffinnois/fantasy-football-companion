# Plan Y — Stats analysis: the metric layer and the query engine

**Status:** not started. Written 2026-10-17, fully prototyped: every task was replayed on a clean copy of `main` from this text, with the counts below.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `stats.duckdb` into something the stats screens can read.

- Derived tables: player-week, player-season, team-week, team-season, and fantasy points and expected points under four scorings, the league's rules included.
- A catalogue of 259 metrics.
- One structured query engine (`StatsQuery` → rows with samples, qualification, percentiles and caveats).
- Reads that never wait behind a refresh.
- IPC for the renderer.
- No screen changes; ship `v0.26.0`.

**Architecture:**

- **Derived layer** (`src/main/stats/derived/`).
  - `plays.ts`: the play components, each one expression over a row of `plays` with the role it is credited to.
  - `player.ts`, `team.ts`, `fantasy.ts`: one season's select per derived table.
  - `build.ts`: rebuilds the touched seasons, one season and one transaction at a time.
  - `sql.ts`: shared helpers.
- **Catalogue** (`src/shared/stats/catalogue.ts`): each metric's formula over component sums, its sample, minimum, unit, direction, tier and words.
  - `types.ts`: the `StatsQuery` and result types.
  - `querySchema.ts`: the JSON Schema of the query.
  - `scoring.ts`: the scoring presets.
- **Engine** (`src/main/stats/engine/`).
  - `registry.ts`: which grain each metric can be computed at.
  - `compile.ts`: validation, and compilation to parameterised SQL over the season tables, the weekly tables or the plays.
  - `run.ts`: weeks in scope, qualification, a 5 s timeout, and the shaped rows.
- **Worker.**
  - The sync gains a `stats:derived` step.
  - The service gains a read connection, `query` / `catalogue` / `status` (answered at once) and `setLeague` (in turn with refreshes).
  - The self-test also answers a query.
- **App.**
  - IPC `stats:query`, `stats:catalogue`, `stats:status`, and the `stats:changed` event.
  - Main sends the league's scoring rules before each refresh and on every rules change.

**Tech Stack:** Electron 39, TypeScript strict, `@duckdb/node-api` 1.5.6, `node:worker_threads`, Vitest (node environment; DuckDB runs in tests).

**Spec:** `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §2, §5–§7, §10, §11 (Plan Y row of §12), amended by this plan (Task 8 writes the amendments into the spec as §16). The data reference: `docs/reference/stats-database.md`.

## Planning findings (live data, 2026-10-17)

Everything below was measured with the code in this plan on a full `stats.duckdb` (2019 – 2026 week 6), unless it says "prototype".

- **Memory decides how the derived tables are built.**
  - Building every season in one statement ran out of DuckDB's 512 MB limit.
  - So did one season with every source as a CTE, even on one thread.
  - One season with each source first in its own temporary table works on one thread and fails on two (writing `player_week`'s ~230 columns in parallel). So the rebuild sets `threads = 1` while it runs and puts the setting back after.
- **Rebuild times.**

| Measure                                                          | Result                                   | Budget   |
| ---------------------------------------------------------------- | ---------------------------------------- | -------- |
| Fresh backfill, derived step included (empty profile)            | 156 s; the derived step 23 s             | ≤ 10 min |
| Forced daily refresh                                             | 15 s; the derived step (2026) 1.5 s      | ≤ 30 s   |
| A league rules change (fantasy tables, every season)             | 2.5 s                                    |          |
| `stats.duckdb` after the backfill                                | 346 MB (Plan X: 283–285)                 | ≤ 400 MB |
| Peak process memory: backfill / daily refresh                    | 2.4 GB / 1.07 GB                         |          |

- **Query speed** (warm, every query run twice):

| Query                                                              | Time        | Budget   |
| ------------------------------------------------------------------ | ----------- | -------- |
| WR leaderboard, 15 core metrics, a season                          | 60–80 ms    | ≤ 500 ms |
| QB leaderboard, 15 metrics, weeks 1–9                              | 64–69 ms    | ≤ 500 ms |
| Teams, 30 core metrics                                             | 92–98 ms    | ≤ 500 ms |
| One player by week, 12 metrics (a dashboard card row)              | 46–48 ms    | ≤ 300 ms |
| WRs when the QB was pressured (play grain)                         | 58–62 ms    | ≤ 1 s    |
| Teams on third down by coverage, 3 seasons (play grain)            | 66–74 ms    | ≤ 1 s    |
| Five seasons of a metric for every WR                              | 39–43 ms    |          |
| 40 metrics over every player (worst case)                          | 690–736 ms  |          |
| Queries during a forced refresh (30 of them)                       | median 16 ms, max 66 ms |  |

- **Agreement with nflverse** (`player_week` against `stats_player`, `team_week` against `stats_team`, 2019–2026):
  - Targets, receptions, passing yards and sacks: 100 % of player-weeks. Carries: ≥ 99.995 %. Rushing yards: ≥ 99.98 %. Receiving yards: 99.85–99.96 % (laterals).
  - Team passing yards and targets: 100 %. Carries: ≥ 99.8 %. Rushing yards: 99.3–100 % of team-games.
  - Defenders from `play_players` (solo and assisted tackles, sacks, QB hits, interceptions, passes defended, forced fumbles) match 100 %. Tackles for loss match only 95.5–98 % before 2024, so they come from the box score.
- **Fantasy scoring.**
  - Sleeper's lines scored in SQL equal the app's `scoreStatLine` on 82,880 of 82,958 lines (2019, 2025, 2026, the user's league).
  - The other 78 are pre-2024 kickers. Sleeper then had one 50+ bucket (`fgm_50p`; `fgm_50_59` and `fgm_60p` start in 2024). The SQL counts it as 50–59; the fantasy pipeline only scores 2025+ and does not meet it.
  - **Sleeper's stored `pts_*` are not a reference before 2026.** The PPR preset matches `pts_ppr` on 100 % of 2026 player-weeks. It matches 88.6–90.1 % of 2019–2021 offense (Sleeper's interception was −2 then) and 68–76 % of 2019–2025 defenses (a 14–20-points-allowed defense scored 0 then).
- **Expected points.**
  - ffopportunity's actual points reproduce exactly under 0.04 / 4 / −2 / 1 PPR, fumbles −2.
  - Its expected points, scored by `expectedPointsSql` with the same rules, are within 0.1 on 99.49–99.82 % of player-weeks (max 0.51, r = 0.999995).
- **Sources disagree in shape.** Each finding has a test or a gate.
  - QBR's `season_type` is ESPN's "Regular" / "Playoffs", so season QBR joined nothing (fixed: source version 2).
  - NGS publishes a week only for players over its weekly minimum. Weekly sums equal the season row for 12 % of rushers, 9 % of receivers and 64 % of passers, so season NGS comes from the season rows (week 0).
  - Postseason weeks: NGS skips the Pro Bowl week, QBR and Sleeper count 1–4. Mapped to nflverse's numbering, they hit their game 100 % of the time.
  - Participation knows pressure and coverage on 89–90 % of dropbacks through 2022 and on all of them from 2023. Personnel is "1 RB, 1 TE, 3 WR" through 2022 and the whole line-up ("1 C, 2 G, 1 QB, 1 RB, …") from 2023, normalised to "11".
  - FTN charts every play from 2022.
  - DuckDB divides by zero to `Infinity`, so every ratio uses `nullif`.
- **Catalogue.** 259 metrics: 177 player, 82 team; tiers core 92, extended 149, stored 18. By family: traditional 117, advanced 85, charting 37, predictive 11, ngs 9. 162 can be split by situation.
- **Plausibility on 2025.**
  - EPA per dropback: Maye 0.325, Love 0.259, Stafford 0.238.
  - Season QBR: Maye 77.1.
  - YPRR: Smith-Njigba 3.71, Nacua 3.67.
  - Sacks: Garrett 23.
  - Offensive EPA per play: NE 0.157, LA 0.145, BUF 0.141.
  - PPR points: McCaffrey 416.6 (xFP 433.7), Nacua 375.0 (xFP 304.6).
- **Packaged.** The Linux build (`electron-builder --linux dir`) answers the self-test with `{"ok":true,…,"query":true}`.
- **Prototype pitfalls.**
  - A query's `count(*)` can pass while the same select written to a table fails: projection pushdown hides the width.
  - Window aggregates take `FILTER (WHERE …)` before `OVER`.
  - Loading 800k Sleeper lines into JS objects for a check overflows Node's heap; the live check scores three seasons.

## Spec amendments (taken in this plan)

Task 8 Step 2 records these in the spec as §16. **Confirm them with the user before starting Task 1** if they have not been approved yet.

- **A. Building the derived tables (§5.2).** One season at a time, each source into a temporary table first, on one thread (two threads need more than the 512 MB limit to write `player_week`'s ~230 columns). Each season is one transaction (delete, insert), instead of swapping whole tables. The first build takes about 25 s, a forced daily refresh's about 1.5 s. A source or column that is missing reads as NULL.
- **B. Percentiles and ranks are computed by the engine (§5.2, §7.2)**, among the qualified rows of the query's own population (same position, same group). `player_season` holds sums only. Any week range, scoring or split then ranks correctly.
- **C. Fantasy tables.** `fantasy_week` has one row per player-week and scoring (`ppr`, `half`, `std`, `league`), and `team_fantasy_week` holds the points each defense allowed by position. The presets are Sleeper's current defaults. Sleeper's stored `pts_*` follow older defaults in past seasons, so the gate is "the SQL scoring equals the app's scoring engine". Sleeper's single 50+ field-goal bucket before 2024 counts as 50–59. The team rows of ffopportunity (§15 B) are not needed.
- **D. The query (§7.1).**
  - It gains `scoring`.
  - Plan Y's transforms are `raw`, `perGame`, `percentile`, `zScore` and `vsLeague`. `shrunk` and `opponentAdjusted` come with Plan Z's models. `perPlay` is dropped: the rates already are per play.
  - The JSON Schema is written by hand, typed so that the compiler fails if it and the type drift apart.
- **E. Qualification.** `minSample` is per 17 games, scaled to the weeks a row covers and, for situational queries, to the share of plays the situation keeps.
- **F. The catalogue (§6.2)** has 259 metrics (177 player, 82 team); 162 can be split by situation. Left out or changed:
  - The EPA + CPOE composite needs league standardisation and moves to Plan Z.
  - Slot / wide / inline rates are out: participation lists positions, not alignment.
  - Coverage EPA per defender is out: play-by-play does not name the covering defender, so coverage comes from PFR.
  - Defender pressure rate uses pass snaps (opponent dropbacks on the field), since participation does not say who rushed.
  - Two-minute and long-down snap shares are out.
  - Red-zone TD % becomes the TD drive rate.
- **G. Routes** are dropbacks on the field (blocking included), exact through the prior season and estimated in the current one (§6.2).
- **H. Season sources.** NGS and QBR season values come from their season rows. Postseason weeks of NGS, QBR and Sleeper are mapped to nflverse's numbering.
- **I. Reads never wait (§2).**
  - Queries, the catalogue and the status run at once on a second connection. Refreshes and league rules take turns.
  - A query is interrupted after 5 s.
  - Main sends the league's scoring rules before each refresh and on every rules change. Only a change rebuilds the fantasy tables (about 2.5 s).
- **J. Sync.** `stats:derived` follows `stats:identity`. It rebuilds the seasons whose rows changed, and the current season for an all-seasons file.
- **K. QBR's season type** was ESPN's "Regular" / "Playoffs"; it is now REG / POST (source version 2).
- **L. The self-test** also answers an engine query (§11: the packaged worker answers a query).

## Global Constraints

- **Branch** `feat/stats-metrics-y` off `main`.
- **Commits.** One Conventional Commit per "Commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- **Never stage these.** The working tree has unrelated changes that are not part of this plan: `.gitignore`, `.design-sync/`, `docs/design/FantasyCompanion UI/`, `docs/research/nfl_predictive_metrics.md:Zone.Identifier`, `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts` and `tsconfig.web.tsbuildinfo`. Stage files by name; never run `git add -A` or `git add .`.
- **Formatting and lint.**
  - Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`.**
  - Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
  - Typecheck with `npm run typecheck`.
- **Copy the code exactly.** Every new file is given whole, and every change to an existing file as a diff that `git apply` takes as written (save it to a file and run `git apply <file>`, or make the same edit by hand). The tasks were replayed in order on a clean copy of `main`, with typecheck, lint and the full suite green after each. The final tree is byte-identical to the prototype.
- **Test counts** are those of a clean checkout. In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3.
- **Scope.**
  - No screen changes: Plans AA–AE build the screens on this.
  - The fantasy pipeline (`companion.db`, scoring, values, lineup, trade, waivers) does not change. Main only sends the league's rules to the stats worker.
  - Nothing outside `src/main/stats/` reads `stats.duckdb`.
- **Network.** No test touches the network. Only the throwaway live check in Task 7 does, and it is never committed.
- **Gates.**
  - **Task 7:** every line of the live check, which ends with `ALL GATES PASSED`.
  - **Task 9 Step 2:** the Windows self-test (with its query) on the Package check workflow.
  - If a gate fails, stop and report the numbers to the user.
- **Release** `v0.26.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push** (`check/plan-y` in Task 9, `main` and the tag).
- **Not GUI-verifiable here** (WSLg): no window changes in this plan. Say so in the Status block.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **A wrong number on a dashboard**: a component credited to the wrong player, a rate divided by the wrong denominator, or a source that is not loaded read as 0. → Task 2: `player_week` and `team_week` are checked against hand-computed sums of a seeded game, and a missing source reads NULL. Task 7: the nflverse agreement gates.
2. **Fantasy points that differ from Sleeper's** in the league's own scoring. → Task 2: the SQL scoring equals `scoreStatLine` on bonus, tier, override and defense lines. Task 7: the same on every line of three seasons under the user's league.
3. **The stats screen freezes during a refresh.** → Task 5: reads run on their own connection and are never queued. Task 7: queries answered during a forced refresh.
4. **The rebuild runs out of memory or time on the user's PC.** → Task 2: one season, one thread, temporary tables per source. Task 7: backfill, daily refresh and file size gates.
5. **A query that builds unsafe or runaway SQL** from a renderer (later, an LLM). → Task 4: every user value is bound, unknown ids, codes and ranges are refused, and a query is interrupted after 5 s.
6. **A thin sample ranked as a leader.** → Task 4: qualification scales to the weeks (and, at the play grain, to the plays) in scope; percentiles and ranks count qualified rows only, and qualified rows sort first.
7. **League rules out of step** with the fantasy tables after a rules edit. → Task 5: `setLeague` rebuilds on a change only, and the rules are kept with the file. Task 6: main sends them before every refresh and after every rules edit.
8. **A packaged Windows app whose worker cannot answer.** → Task 5: the self-test answers a query. Task 9: the Package check workflow on Windows.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/stats-metrics-y
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/stats-metrics-y`.

---

### Task 1: QBR's season type (amendment K)

ESPN's QBR files spell the season type "Regular" / "Playoffs", so nothing joined QBR to the other tables on `season_type`.

**Files:**

- Modify: `src/main/stats/sources.ts`, `tests/main/stats/sources.test.ts`

- [ ] **Step 1: Write the failing test**

```diff
diff --git a/tests/main/stats/sources.test.ts b/tests/main/stats/sources.test.ts
index 2e10638..68c8959 100644
--- a/tests/main/stats/sources.test.ts
+++ b/tests/main/stats/sources.test.ts
@@ -73,11 +73,12 @@ describe('file sources (stats-analysis spec §4.1)', () => {
     await runSync(db, { files: { [urlOf('qbr_week')]: file }, only: ['qbr_week'] })
     expect(
       await db.all(
-        'SELECT season, week, team, team_name, opponent, team_abb, opp_abb FROM src_qbr_week'
+        'SELECT season, season_type, week, team, team_name, opponent, team_abb, opp_abb FROM src_qbr_week'
       )
     ).toEqual([
       {
         season: 2025,
+        season_type: 'REG',
         week: 4,
         team: 'LA',
         team_name: 'Rams',
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/main/stats/sources.test.ts
```

Expected: FAIL, "moves ESPN's nickname to team_name and takes the code as team": `season_type` is `'Regular'`, not `'REG'`.

- [ ] **Step 3: Map the season type, and bump both QBR sources to version 2**

```diff
diff --git a/src/main/stats/sources.ts b/src/main/stats/sources.ts
index 3277749..0dac116 100644
--- a/src/main/stats/sources.ts
+++ b/src/main/stats/sources.ts
@@ -54,6 +54,9 @@ export interface FileSource {
 const team = (column: string): string => `nfl_team(${column})`
 /** nflverse files that spell the season type as a game type (REG / WC / DIV / CON / SB). */
 const gameType = { season_type: 'season_type_of(game_type)' }
+/** ESPN spells season types "Regular" / "Playoffs". */
+const ESPN_SEASON_TYPE =
+  "CASE season_type WHEN 'Regular' THEN 'REG' WHEN 'Playoffs' THEN 'POST' ELSE season_type END"
 /** Regular-season weeks: 17 through 2020, 18 since. */
 export const regularWeeks = (season: number): number => (season <= 2020 ? 17 : 18)
 
@@ -287,7 +290,8 @@ export const FILE_SOURCES: FileSource[] = [
       })
     )
   ),
-  // ESPN's `team` is the nickname; it moves to `team_name` and `team` takes the code.
+  // ESPN's `team` is the nickname; it moves to `team_name` and `team` takes the code. Its season
+  // type is spelled "Regular" / "Playoffs" (version 2: REG / POST, as in every other table).
   allSeasonsFile(
     'qbr_week',
     'src_qbr_week',
@@ -298,9 +302,10 @@ export const FILE_SOURCES: FileSource[] = [
       opp_abb: team('opp_abb'),
       team: team('team_abb'),
       opponent: team('opp_abb'),
-      week: 'game_week::INTEGER'
+      week: 'game_week::INTEGER',
+      season_type: ESPN_SEASON_TYPE
     },
-    { where: `season >= ${STATS_FIRST_SEASON}` }
+    { where: `season >= ${STATS_FIRST_SEASON}`, version: 2 }
   ),
   allSeasonsFile(
     'qbr_season',
@@ -309,9 +314,10 @@ export const FILE_SOURCES: FileSource[] = [
     {
       team_name: 'team',
       team_abb: team('team_abb'),
-      team: team('team_abb')
+      team: team('team_abb'),
+      season_type: ESPN_SEASON_TYPE
     },
-    { where: `season >= ${STATS_FIRST_SEASON}` }
+    { where: `season >= ${STATS_FIRST_SEASON}`, version: 2 }
   ),
   seasonFile(
     'injuries',
```

The version bump re-fetches both files on the next refresh. They are all-seasons files, fetched daily anyway.

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/main/stats/sources.test.ts
```

Expected: PASS (9 passed).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/stats/sources.ts tests/main/stats/sources.test.ts
git add src/main/stats/sources.ts tests/main/stats/sources.test.ts
git commit -m "fix(stats): qbr season type as REG / POST"
```

---

### Task 2: The derived tables (spec §5; amendments A, C, G, H)

**Files:**

- Create: `src/shared/stats/scoring.ts`, `src/main/stats/derived/sql.ts`, `src/main/stats/derived/plays.ts`, `src/main/stats/derived/player.ts`, `src/main/stats/derived/team.ts`, `src/main/stats/derived/fantasy.ts`, `src/main/stats/derived/build.ts`, `tests/fixtures/statsDerived.ts`
- Modify: `src/main/stats/schema.ts`
- Test: `tests/main/stats/derived/build.test.ts`, `tests/main/stats/derived/fantasy.test.ts`

**Interfaces:**

- Produces (`scoring.ts`): `SCORINGS`, `Scoring` (`ppr` / `half` / `std` / `league`), `ScoringRules { scoring, positionOverrides }`, `SCORING_PRESETS`, `SCORING_LABELS`.
- Produces (`plays.ts`):
  - `PlayComponent { name, role, expr, group }`, `Role`, `PLAYER_PLAY_COMPONENTS`, `ROLE_SOURCES`.
  - `TeamPlayComponent`, `TEAM_PLAY_COMPONENTS`, `GROUP_PROBE`.
  - The expressions `PERSONNEL`, `BOX` and `NEUTRAL`.
- Produces (`sql.ts`): `Built { temps?, sql }`, `Have { tables, columns }`, `columnsOf`, `groupAvailable`, `sums`, `hasAll`, `REG_WEEKS`, `postWeek`.
- Produces (`player.ts`): `BOX_COMPONENTS`, `NGS_COMPONENTS`, `TEAM_CONTEXT`, `playerComponentNames()`, `playerWeekSelect(have, season)`, `playerSeasonSelect(have, season)`.
- Produces (`team.ts`): `TEAM_BOX_COMPONENTS`, `teamComponentNames()`, `teamWeekSelect(have, season)`, `teamSeasonSelect(season)`.
- Produces (`fantasy.ts`): `pointsSql(rules, columns)`, `expectedPointsSql(rules, ffoColumns?)`, `scoringsToBuild(league)`, `fantasyWeekSelect(have, season, scorings)`, `teamFantasyWeekSelect(season)`.
- Produces (`build.ts`): `DERIVED_VERSION`, `DERIVED_TABLES`, `inspect(db)`, `canDerive(db)`, `derivedStale(db)`, `RebuildInput { seasons, league, fantasyOnly? }`, `rebuildDerived(db, input)`.
- Produces (`schema.ts`): the tables `derived_state (name, version)` and `stats_settings (key, value)`.
- Produces (fixture): `seedTable`, `seedPlays`, `seedGame` (one 2025 game, KC at BUF), and the ids `QB`, `WR`, `RB`, `KC_RB`, `EDGE`, `CB`.

- [ ] **Step 1: Write the fixture and the failing tests**

Create `tests/fixtures/statsDerived.ts`:

```ts
import type { StatsDb } from '@main/stats/db'
import { buildViews } from '@main/stats/views'

type Value = string | number | boolean | null
export type Row = Record<string, Value>

/** A SQL literal for a fixture value. */
function literal(v: Value, type: string): string {
  if (v === null) return `NULL::${type}`
  if (typeof v === 'string') return `'${v.replaceAll("'", "''")}'::${type}`
  return `${v}::${type}`
}

function typeOf(column: string, rows: Row[]): string {
  const v = rows.map((r) => r[column]).find((x) => x !== null && x !== undefined)
  if (typeof v === 'boolean') return 'BOOLEAN'
  if (typeof v === 'string') return 'VARCHAR'
  if (column === 'season' || column === 'week' || column === 'play_id') return 'INTEGER'
  return 'DOUBLE'
}

/** Creates `name` from the rows (every row may leave columns out: they are NULL). */
export async function seedTable(db: StatsDb, name: string, rows: Row[]): Promise<void> {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const types = new Map(columns.map((c) => [c, typeOf(c, rows)]))
  const selects = rows.map(
    (r) =>
      `SELECT ${columns.map((c) => `${literal(r[c] ?? null, types.get(c)!)} AS "${c}"`).join(', ')}`
  )
  await db.exec(`CREATE OR REPLACE TABLE "${name}" AS ${selects.join(' UNION ALL ')}`)
}

/** Text and flag columns of `src_pbp`; every other column the code reads is a number (0 by default). */
const PBP_TEXT = [
  'game_id',
  'season_type',
  'posteam',
  'defteam',
  'play_type',
  'passer_player_id',
  'passer_id',
  'rusher_player_id',
  'receiver_player_id',
  'kicker_player_id',
  'punter_player_id',
  'pass_defense_1_player_id',
  'fixed_drive_result',
  'defense_man_zone_type',
  'defense_coverage_type',
  'offense_personnel',
  'offense_formation'
]
const PBP_FLAGS = [
  'was_pressure',
  'is_play_action',
  'is_rpo',
  'is_screen_pass',
  'is_motion',
  'is_interception_worthy',
  'is_throw_away',
  'is_qb_out_of_pocket',
  'is_catchable_ball',
  'is_contested_ball',
  'is_created_reception',
  'is_drop'
]
const PBP_NUMBERS = [
  'pass',
  'rush',
  'qb_kneel',
  'qb_spike',
  'qb_dropback',
  'qb_scramble',
  'pass_attempt',
  'sack',
  'complete_pass',
  'pass_touchdown',
  'rush_touchdown',
  'interception',
  'first_down',
  'first_down_pass',
  'first_down_rush',
  'two_point_attempt',
  'play_deleted',
  'passing_yards',
  'rushing_yards',
  'receiving_yards',
  'yards_gained',
  'air_yards',
  'yards_after_catch',
  'xyac_mean_yardage',
  'epa',
  'qb_epa',
  'wpa',
  'wp',
  'success',
  'cp',
  'cpoe',
  'xpass',
  'pass_oe',
  'down',
  'ydstogo',
  'qtr',
  'yardline_100',
  'half_seconds_remaining',
  'game_seconds_remaining',
  'score_differential',
  'posteam_score',
  'posteam_score_post',
  'fixed_drive',
  'shotgun',
  'no_huddle',
  'field_goal_attempt',
  'kickoff_attempt',
  'punt_attempt',
  'touchback',
  'fumble',
  'fumble_lost',
  'fumble_forced',
  'tackled_for_loss',
  'defenders_in_box',
  'n_defense_box',
  'n_blitzers',
  'n_pass_rushers'
]

/** Numbers that are not plain 0 by default: a play has a time, a down, a place on the field. */
const PBP_DEFAULTS: Row = {
  wp: 0.5,
  down: 1,
  ydstogo: 10,
  qtr: 1,
  yardline_100: 60,
  half_seconds_remaining: 1500,
  game_seconds_remaining: 3300,
  fixed_drive: 1
}

/**
 * `src_pbp` from plays that name only what they need, then the views (`plays` with the counting
 * flags). FTN and participation columns sit in `src_pbp` itself here; leave `ftn` / `part` off to
 * leave those columns out, as when their sources are not loaded.
 */
export async function seedPlays(
  db: StatsDb,
  plays: Row[],
  include: { ftn?: boolean; part?: boolean } = { ftn: true, part: true }
): Promise<void> {
  const part = new Set([
    'was_pressure',
    'defense_man_zone_type',
    'defense_coverage_type',
    'offense_personnel',
    'offense_formation',
    'defenders_in_box'
  ])
  const ftn = new Set([
    ...PBP_FLAGS.filter((f) => f !== 'was_pressure'),
    'n_defense_box',
    'n_blitzers',
    'n_pass_rushers'
  ])
  const keep = (c: string): boolean =>
    (include.part || !part.has(c)) && (include.ftn || !ftn.has(c))
  const rows = plays.map((p, i) => {
    const row: Row = { play_id: i + 1, season: 2025, week: 1, season_type: 'REG', game_id: 'g1' }
    for (const c of PBP_TEXT) row[c] ??= null
    for (const c of PBP_FLAGS) row[c] = null
    for (const c of PBP_NUMBERS) row[c] = PBP_DEFAULTS[c] ?? 0
    for (const c of ['n_defense_box', 'n_blitzers', 'n_pass_rushers', 'defenders_in_box']) {
      row[c] = null
    }
    Object.assign(row, p)
    return Object.fromEntries(Object.entries(row).filter(([c]) => keep(c)))
  })
  // Typed by name: a flag column that is NULL in every row is still a BOOLEAN.
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const type = (c: string): string =>
    PBP_TEXT.includes(c)
      ? 'VARCHAR'
      : PBP_FLAGS.includes(c)
        ? 'BOOLEAN'
        : ['season', 'week', 'play_id'].includes(c)
          ? 'INTEGER'
          : 'DOUBLE'
  const selects = rows.map(
    (r) => `SELECT ${columns.map((c) => `${literal(r[c] ?? null, type(c))} AS "${c}"`).join(', ')}`
  )
  await db.exec(`CREATE OR REPLACE TABLE src_pbp AS ${selects.join(' UNION ALL ')}`)
  await buildViews(db)
}

export const QB = '00-0000001'
export const WR = '00-0000002'
export const RB = '00-0000003'
export const KC_RB = '00-0000004'
export const EDGE = '00-0000010'
export const CB = '00-0000011'

const pass = (over: Row): Row => ({
  posteam: 'BUF',
  defteam: 'KC',
  play_type: 'pass',
  pass: 1,
  qb_dropback: 1,
  pass_attempt: 1,
  passer_player_id: QB,
  passer_id: QB,
  ...over
})
const run = (over: Row): Row => ({
  posteam: 'BUF',
  defteam: 'KC',
  play_type: 'run',
  rush: 1,
  ...over
})

/**
 * One game of 2025, KC at BUF (27–20), as every derived table needs it: four BUF plays (a 20-yard
 * catch, a sack under pressure, a 5-yard run, a deep incompletion in man coverage) and one KC run,
 * with players on the field, the schedule, ids, rosters, box score, snaps, NGS, PFR, QBR,
 * ffopportunity and Sleeper lines.
 */
export async function seedGame(db: StatsDb): Promise<void> {
  await seedPlays(db, [
    pass({
      receiver_player_id: WR,
      complete_pass: 1,
      passing_yards: 20,
      receiving_yards: 20,
      yards_gained: 20,
      air_yards: 12,
      yards_after_catch: 8,
      xyac_mean_yardage: 5,
      first_down_pass: 1,
      first_down: 1,
      epa: 1.5,
      qb_epa: 1.5,
      success: 1,
      cp: 0.6,
      cpoe: 40,
      xpass: 0.6,
      pass_oe: 40,
      was_pressure: false,
      is_play_action: true,
      is_catchable_ball: true,
      n_blitzers: 0,
      n_pass_rushers: 4,
      defense_man_zone_type: 'ZONE_COVERAGE',
      offense_personnel: '1 RB, 1 TE, 3 WR',
      shotgun: 1,
      posteam_score: 0,
      posteam_score_post: 0
    }),
    pass({
      sack: 1,
      yards_gained: -7,
      epa: -1.8,
      qb_epa: -1.8,
      down: 2,
      was_pressure: true,
      is_play_action: false,
      n_blitzers: 2,
      n_pass_rushers: 6,
      defense_man_zone_type: 'MAN_COVERAGE',
      offense_personnel: '1 RB, 1 TE, 3 WR',
      posteam_score: 0,
      posteam_score_post: 0
    }),
    run({
      rusher_player_id: RB,
      rushing_yards: 5,
      yards_gained: 5,
      epa: 0.3,
      success: 1,
      down: 3,
      yardline_100: 8,
      defenders_in_box: 8,
      offense_personnel: '2 RB, 1 TE, 2 WR',
      posteam_score: 0,
      posteam_score_post: 7,
      rush_touchdown: 1,
      fixed_drive_result: 'Touchdown'
    }),
    pass({
      receiver_player_id: WR,
      air_yards: 25,
      epa: -0.7,
      qb_epa: -0.7,
      cp: 0.3,
      cpoe: -30,
      was_pressure: false,
      is_play_action: false,
      is_catchable_ball: false,
      n_blitzers: 0,
      n_pass_rushers: 4,
      defense_man_zone_type: 'MAN_COVERAGE',
      offense_personnel: '1 RB, 1 TE, 3 WR',
      fixed_drive: 2,
      fixed_drive_result: 'Punt',
      posteam_score: 7,
      posteam_score_post: 7
    }),
    run({
      posteam: 'KC',
      defteam: 'BUF',
      rusher_player_id: KC_RB,
      rushing_yards: -2,
      yards_gained: -2,
      epa: -0.6,
      success: 0,
      tackled_for_loss: 1,
      fixed_drive: 3,
      fixed_drive_result: 'Punt',
      posteam_score: 0,
      posteam_score_post: 0
    })
  ])
  const onField = (play: number, side: string, ids: string[]): Row[] =>
    ids.map((gsis) => ({ season: 2025, game_id: 'g1', play_id: play, side, gsis, position: null }))
  await seedTable(db, 'on_field', [
    ...[1, 2, 3, 4].flatMap((p) => [
      ...onField(p, 'O', [QB, WR, RB]),
      ...onField(p, 'D', [EDGE, CB])
    ]),
    ...onField(5, 'O', [KC_RB])
  ])
  await seedTable(db, 'play_players', [
    { season: 2025, game_id: 'g1', play_id: 2, role: 'sack', gsis: EDGE },
    { season: 2025, game_id: 'g1', play_id: 4, role: 'pass_defense', gsis: CB },
    { season: 2025, game_id: 'g1', play_id: 3, role: 'solo_tackle', gsis: CB },
    { season: 2025, game_id: 'g1', play_id: 5, role: 'solo_tackle', gsis: '00-0000020' }
  ])
  await seedTable(db, 'games', [
    {
      game_id: 'g1',
      season: 2025,
      game_type: 'REG',
      week: 1,
      home_team: 'BUF',
      away_team: 'KC',
      home_score: 27,
      away_score: 20,
      spread_line: 2.5,
      total_line: 48.5,
      roof: 'outdoors',
      surface: 'grass',
      temp: 60,
      wind: 5,
      home_rest: 7,
      away_rest: 7
    },
    {
      game_id: 'g2',
      season: 2025,
      game_type: 'REG',
      week: 2,
      home_team: 'KC',
      away_team: 'BUF',
      home_score: null,
      away_score: null,
      spread_line: -1.5,
      total_line: 50,
      roof: 'dome',
      surface: 'turf',
      temp: null,
      wind: null,
      home_rest: 7,
      away_rest: 7
    }
  ])
  const player = (gsis_id: string, name: string, position_group: string): Row => ({
    gsis_id,
    name,
    position_group,
    pfr_id: `pfr${gsis_id.slice(-2)}`,
    espn_id: `espn${gsis_id.slice(-2)}`
  })
  await seedTable(db, 'players', [
    player(QB, 'Quinn Quarterback', 'QB'),
    player(WR, 'Wes Wideout', 'WR'),
    player(RB, 'Ray Runner', 'RB'),
    player(KC_RB, 'Kyle Carrier', 'RB'),
    player(EDGE, 'Eddie Edge', 'DL'),
    player(CB, 'Cory Corner', 'DB')
  ])
  await seedTable(db, 'src_rosters', [
    { gsis_id: WR, season: 2025, week: 1, position: 'WR' },
    { gsis_id: RB, season: 2025, week: 1, position: 'RB' }
  ])
  await seedTable(db, 'src_player_stats', [
    {
      player_id: QB,
      season: 2025,
      week: 1,
      season_type: 'REG',
      game_id: 'g1',
      team: 'BUF',
      fumbles_total: 1,
      fumbles_lost_total: 0
    },
    {
      player_id: WR,
      season: 2025,
      week: 1,
      season_type: 'REG',
      game_id: 'g1',
      team: 'BUF',
      kickoff_returns: 2,
      kickoff_return_yards: 50
    }
  ])
  await seedTable(db, 'src_snaps', [
    {
      pfr_player_id: 'pfr02',
      season: 2025,
      week: 1,
      season_type: 'REG',
      game_id: 'g1',
      team: 'BUF',
      offense_snaps: 48,
      offense_pct: 0.8,
      defense_snaps: 0,
      defense_pct: 0,
      st_snaps: 3
    }
  ])
  await seedTable(db, 'src_ngs_receiving', [
    {
      player_gsis_id: WR,
      season: 2025,
      season_type: 'REG',
      week: 1,
      targets: 2,
      receptions: 1,
      avg_separation: 3,
      avg_cushion: 6,
      avg_yac_above_expectation: 3
    },
    {
      player_gsis_id: WR,
      season: 2025,
      season_type: 'REG',
      week: 0,
      targets: 2,
      receptions: 1,
      avg_separation: 2.5,
      avg_cushion: 6,
      avg_yac_above_expectation: 3
    }
  ])
  await seedTable(db, 'src_qbr_week', [
    { player_id: 'espn01', season: 2025, season_type: 'REG', week: 1, qbr_total: 70, qb_plays: 4 }
  ])
  await seedTable(db, 'src_qbr_season', [
    { player_id: 'espn01', season: 2025, season_type: 'REG', qbr_total: 65, qb_plays: 4 }
  ])
  await seedTable(db, 'src_pfr_def', [
    {
      pfr_player_id: 'pfr11',
      season: 2025,
      season_type: 'REG',
      week: 1,
      def_targets: 1,
      def_completions_allowed: 0,
      def_yards_allowed: 0,
      def_receiving_td_allowed: 0,
      def_ints: 0,
      def_yards_after_catch: 0,
      def_adot: 25,
      def_times_blitzed: 0,
      def_times_hurried: 0,
      def_pressures: 0,
      def_missed_tackles: 0,
      def_tackles_combined: 1
    }
  ])
  await seedTable(db, 'src_ff_opportunity', [
    {
      player_id: WR,
      season: 2025,
      season_type: 'REG',
      week: 1,
      receptions_exp: 1.2,
      rec_yards_gained_exp: 14,
      rush_yards_gained_exp: 0,
      total_touchdown_exp: 0.1,
      total_touchdown: 0,
      rec_attempt: 2,
      rec_touchdown_exp: 0.1,
      rec_first_down_exp: 0.6,
      rec_two_point_conv_exp: 0,
      pass_attempt: 0,
      rush_attempt: 0
    }
  ])
  await seedTable(db, 'sleeper_ids', [{ sleeper_id: '9001', gsis_id: WR, resolution: 'crosswalk' }])
  await seedTable(db, 'src_sleeper_players', [
    {
      season: 2025,
      player_id: '9001',
      first_name: 'Wes',
      last_name: 'Wideout',
      position: 'WR',
      team: 'BUF'
    }
  ])
  await seedTable(db, 'src_sleeper', [
    {
      season: 2025,
      season_type: 'REG',
      week: 1,
      player_id: '9001',
      team: 'BUF',
      opponent: 'KC',
      game_id: 'x',
      gp: 1,
      rec: 1,
      rec_yd: 20,
      rec_tgt: 2
    }
  ])
  await seedTable(db, 'src_sleeper_def', [
    {
      season: 2025,
      season_type: 'REG',
      week: 1,
      player_id: 'KC',
      team: 'KC',
      opponent: 'BUF',
      game_id: 'x',
      gp: 1,
      pts_allow: 27,
      sack: 1
    }
  ])
}
```

Create `tests/main/stats/derived/build.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { openTestDb } from '../../../fixtures/stats'
import { CB, EDGE, QB, RB, WR, seedGame } from '../../../fixtures/statsDerived'

type R = Record<string, unknown>

describe('the derived tables (stats-analysis spec §5)', () => {
  it('sums every source into player_week, one row per player and week', async () => {
    const db = await openTestDb()
    await seedGame(db)
    const written = await rebuildDerived(db, { seasons: 'all', league: null })
    expect(written).toMatchObject({
      team_week: 4,
      player_week: 7,
      player_season: 7,
      team_season: 2
    })
    const week = async (id: string): Promise<R> =>
      (await db.get<R>('SELECT * FROM player_week WHERE gsis_id = ?', [id]))!
    const qb = await week(QB)
    expect(qb).toMatchObject({
      team: 'BUF',
      opponent: 'KC',
      home: true,
      position: 'QB',
      games: 1,
      pass_att: 2,
      pass_cmp: 1,
      pass_yds: 20,
      sacks_taken: 1,
      sack_yds_lost: 7,
      dropbacks: 3,
      db_pressured: 1,
      db_pressure_known: 3,
      deep_att: 1,
      cpoe_n: 2,
      cpoe_sum: 10,
      qbr_sum: 280,
      qbr_plays: 4,
      fumbles: 1
    })
    expect(qb.db_epa).toBeCloseTo(-1.0)
    const wr = await week(WR)
    expect(wr).toMatchObject({
      targets: 2,
      receptions: 1,
      rec_yds: 20,
      rec_air_yds: 37,
      rec_yac: 8,
      rec_fd: 1,
      routes: 3,
      routes_est: 0,
      tm_targets: 2,
      tm_dropbacks: 3,
      tm_air_yds: 37,
      off_snaps: 48,
      tm_off_snaps: 60,
      kr: 2,
      kr_yds: 50,
      tgt_man: 1,
      tgt_zone: 1,
      routes_man: 2,
      routes_zone: 1,
      tgt_catchable: 1,
      tgt_ftn: 2,
      ngs_targets: 2,
      ngs_sep_sum: 6,
      x_rec: 1.2,
      x_td: 0.1
    })
    expect(await week(RB)).toMatchObject({
      carries: 1,
      rush_yds: 5,
      rush_td: 1,
      i10_carries: 1,
      box8_carries: 1,
      box_known: 1
    })
    expect(await week(EDGE)).toMatchObject({ sacks: 1, def_pass_snaps: 3, team: 'KC' })
    expect(await week(CB)).toMatchObject({
      pass_defended: 1,
      tackles_solo: 1,
      cov_targets: 1,
      cov_adot_sum: 25
    })
  })

  it('takes NGS and QBR season figures from their season rows', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: null })
    const wr = await db.get<R>('SELECT * FROM player_season WHERE gsis_id = ?', [WR])
    expect(wr).toMatchObject({
      season_type: 'REG',
      targets: 2,
      routes: 3,
      ngs_targets: 2,
      ngs_sep_sum: 5,
      games: 1
    })
    const qb = await db.get<R>('SELECT qbr_sum, qbr_plays FROM player_season WHERE gsis_id = ?', [
      QB
    ])
    expect(qb).toEqual({ qbr_sum: 260, qbr_plays: 4 })
  })

  it('builds team_week from both sides of each play, with the result, drives and lines', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: null })
    const buf = (await db.get<R>("SELECT * FROM team_week WHERE team = 'BUF' AND week = 1"))!
    expect(buf).toMatchObject({
      opponent: 'KC',
      home: true,
      games: 1,
      wins: 1,
      losses: 0,
      points_for: 27,
      points_against: 20,
      off_plays: 4,
      off_dropbacks: 3,
      off_carries: 1,
      off_targets: 2,
      off_sacks: 1,
      def_plays: 1,
      def_carries: 1,
      def_rush_stuffed: 1,
      def_havoc: 1,
      off_pressured: 1,
      off_pressure_known: 3,
      off_man: 2,
      off_zone: 1,
      off_personnel_11: 3,
      off_personnel_21: 1,
      off_personnel_known: 4,
      drives: 2,
      td_drives: 1,
      drive_points: 7,
      def_drives: 1,
      line_margin: 2.5,
      total_line: 48.5,
      implied_points: 25.5
    })
    expect(buf.off_epa).toBeCloseTo(-0.7)
    const next = await db.get<R>(
      "SELECT games, line_margin, implied_points FROM team_week WHERE team = 'BUF' AND week = 2"
    )
    expect(next).toEqual({ games: 0, line_margin: 1.5, implied_points: 25.75 })
    expect(await db.get<R>("SELECT games, wins FROM team_season WHERE team = 'KC'")).toEqual({
      games: 1,
      wins: 0
    })
  })

  it('estimates routes in a season without participation', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await db.exec('DELETE FROM on_field')
    await rebuildDerived(db, { seasons: 'all', league: null })
    // 3 team dropbacks × 48 of 60 snaps
    expect(
      await db.get<R>('SELECT routes, routes_est FROM player_week WHERE gsis_id = ?', [WR])
    ).toEqual({
      routes: 2,
      routes_est: 1
    })
  })

  it('leaves out what an unloaded source would give', async () => {
    const db = await openTestDb()
    await seedGame(db)
    for (const t of [
      'src_ngs_receiving',
      'src_qbr_week',
      'src_qbr_season',
      'src_snaps',
      'on_field',
      'src_sleeper',
      'src_sleeper_def'
    ]) {
      await db.exec(`DROP TABLE ${t}`)
    }
    const written = await rebuildDerived(db, { seasons: 'all', league: null })
    expect(written.fantasy_week).toBeUndefined()
    expect(
      await db.get<R>(
        'SELECT targets, ngs_targets, qbr_plays, off_snaps, routes FROM player_week WHERE gsis_id = ?',
        [WR]
      )
    ).toEqual({
      targets: 2,
      ngs_targets: null,
      qbr_plays: null,
      off_snaps: null,
      routes: null
    })
  })

  it('rebuilds only the seasons asked for, in place', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: null })
    await db.exec(
      "INSERT INTO player_week (gsis_id, season, season_type, week, targets) VALUES ('00-0000099', 2024, 'REG', 1, 9)"
    )
    await db.exec('UPDATE src_pbp SET receiving_yards = 30 WHERE play_id = 1')
    await rebuildDerived(db, { seasons: [2025], league: null })
    expect(await db.get<R>('SELECT rec_yds FROM player_week WHERE gsis_id = ?', [WR])).toEqual({
      rec_yds: 30
    })
    expect(await db.get<R>('SELECT targets FROM player_week WHERE season = 2024')).toEqual({
      targets: 9
    })
  })

  it('replaces every table when the derived version is new, and only fantasy tables for new rules', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: [], league: null })
    expect(await db.get<R>("SELECT version FROM derived_state WHERE name = 'derived'")).toEqual({
      version: 1
    })
    await db.exec('UPDATE player_week SET targets = 99')
    await rebuildDerived(db, {
      seasons: 'all',
      league: { scoring: { rec: 2 }, positionOverrides: {} },
      fantasyOnly: true
    })
    expect(await db.get<R>('SELECT targets FROM player_week WHERE gsis_id = ?', [WR])).toEqual({
      targets: 99
    })
    expect(await db.get<R>("SELECT points FROM fantasy_week WHERE scoring = 'league'")).toEqual({
      points: 2
    })
  })

  it('builds nothing without play-by-play', async () => {
    const db = await openTestDb()
    expect(await rebuildDerived(db, { seasons: 'all', league: null })).toEqual({})
  })
})
```

Create `tests/main/stats/derived/fantasy.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { sleeperStatLine } from '@main/scoring/adapters'
import { scoreStatLine } from '@main/scoring/engine'
import { rebuildDerived } from '@main/stats/derived/build'
import { expectedPointsSql, pointsSql } from '@main/stats/derived/fantasy'
import type { Position, Rules } from '@shared/rules'
import { SCORING_PRESETS } from '@shared/stats/scoring'
import { openTestDb } from '../../../fixtures/stats'
import { seedGame, seedTable, WR } from '../../../fixtures/statsDerived'

type Line = Record<string, number>

/** A league that scores bonuses, tiers, first downs and a TE premium. */
const LEAGUE: Pick<Rules, 'scoring' | 'positionOverrides'> = {
  scoring: {
    ...SCORING_PRESETS.ppr.scoring,
    pass_fd: 0.5,
    rec_fd: 0.5,
    bonus_rec_yd_100: 3,
    bonus_rush_rec_yd_200: 2,
    bonus_pass_yd_300: 2,
    yds_allow_100_199: 3,
    yds_allow_550p: -7,
    bonus_rec_te: 0.5
  },
  positionOverrides: { TE: { rec: 1.5, rec_td: 7 } }
}

const LINES: [Position, Line][] = [
  ['WR', { gp: 1, rec: 7, rec_yd: 104, rec_td: 1, rec_fd: 5, fum_lost: 1 }],
  ['TE', { gp: 1, rec: 5, rec_yd: 48, rec_td: 1, rec_fd: 3 }],
  ['RB', { gp: 1, rush_att: 22, rush_yd: 140, rec: 3, rec_yd: 65, rush_td: 2, rush_2pt: 1 }],
  ['QB', { gp: 1, pass_yd: 312, pass_td: 3, pass_int: 2, pass_fd: 16, rush_yd: 12 }],
  ['K', { gp: 1, fgm_40_49: 1, fgm_50_59: 1, fgm_60p: 1, xpm: 3, fgmiss: 1 }],
  ['DEF', { gp: 1, sack: 4, int: 1, yds_allow: 180 }],
  ['DEF', { gp: 1, sack: 1, pts_allow: 41, yds_allow: 560, def_td: 1 }],
  ['DEF', { gp: 0 }]
]

async function sqlPoints(
  rules: Pick<Rules, 'scoring' | 'positionOverrides'>,
  lines: [Position, Line][]
): Promise<number[]> {
  const db = await openTestDb()
  const keys = [...new Set(lines.flatMap(([, l]) => Object.keys(l)))]
  await seedTable(
    db,
    'lines',
    lines.map(([position, l], i) => ({
      i,
      position,
      ...Object.fromEntries(keys.map((k) => [k, l[k] ?? null]))
    }))
  )
  const rows = await db.all<{ points: number }>(
    `SELECT ${pointsSql(rules, new Set(keys))} AS points FROM lines s ORDER BY i`
  )
  return rows.map((r) => r.points)
}

describe('fantasy scoring in SQL (stats-analysis spec §5.2)', () => {
  it('scores like the app’s scoring engine, bonuses, tiers and overrides included', async () => {
    const rules = {
      ...LEAGUE,
      source: 'custom',
      updatedAt: '',
      rosterSlots: [],
      settings: { numTeams: 12, waiverType: 'faab' }
    } as Rules
    const expected = LINES.map(([pos, line]) =>
      scoreStatLine(sleeperStatLine(line, pos), rules, pos)
    )
    expect(await sqlPoints(LEAGUE, LINES)).toEqual(expected)
  })

  it('counts Sleeper’s single 50+ bucket of seasons before 2024 as 50–59', async () => {
    const lines: [Position, Line][] = [['K', { gp: 1, fgm_50p: 2, fgm_30_39: 1 }]]
    expect(await sqlPoints(SCORING_PRESETS.ppr, lines)).toEqual([13])
  })

  it('scores the expected stats with the same rules', async () => {
    const db = await openTestDb()
    await seedTable(db, 'f', [
      {
        receptions_exp: 4.5,
        rec_yards_gained_exp: 52,
        rec_touchdown_exp: 0.4,
        rec_first_down_exp: 2,
        rush_yards_gained_exp: 10
      }
    ])
    await seedTable(db, 's', [{ position: 'TE' }])
    const sql = expectedPointsSql(
      LEAGUE,
      new Set([
        'receptions_exp',
        'rec_yards_gained_exp',
        'rec_touchdown_exp',
        'rec_first_down_exp',
        'rush_yards_gained_exp'
      ])
    )
    // 4.5 × (1.5 TE + 0.5 premium) + 5.2 + 0.4 × 7 + 2 × 0.5 + 1.0
    expect((await db.get<{ x: number }>(`SELECT ${sql} AS x FROM f, s`))?.x).toBeCloseTo(19)
  })

  it('builds fantasy_week for each scoring, linked by gsis id, and points allowed by position', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: LEAGUE })
    const rows = await db.all(
      'SELECT scoring, points, xpoints FROM fantasy_week WHERE gsis_id = ? ORDER BY scoring',
      [WR]
    )
    expect(rows).toEqual([
      { scoring: 'half', points: 2.5, xpoints: 2.6 },
      { scoring: 'league', points: 3, xpoints: 3.5 },
      { scoring: 'ppr', points: 3, xpoints: 3.2 },
      { scoring: 'std', points: 2, xpoints: 2 }
    ])
    expect(
      await db.get("SELECT points FROM fantasy_week WHERE player_id = 'KC' AND scoring = 'ppr'")
    ).toEqual({ points: 1 })
    expect(
      await db.get("SELECT fpa_wr FROM team_fantasy_week WHERE team = 'KC' AND scoring = 'std'")
    ).toEqual({ fpa_wr: 2 })
  })

  it('numbers Sleeper’s playoff weeks as nflverse does', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await db.exec("UPDATE src_sleeper SET season_type = 'POST', week = 2")
    await rebuildDerived(db, { seasons: 'all', league: null })
    expect(
      await db.get(
        "SELECT season_type, week FROM fantasy_week WHERE player_id = '9001' AND scoring = 'ppr'"
      )
    ).toEqual({ season_type: 'POST', week: 20 })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/main/stats/derived
```

Expected: FAIL: `@main/stats/derived/build` and `@main/stats/derived/fantasy` do not exist.

- [ ] **Step 3: The scoring presets**

Create `src/shared/stats/scoring.ts`:

```ts
import type { Position, StatKey } from '../rules'

/** Stats-analysis spec §1: the scoring picker. `league` exists once a league is imported. */
export const SCORINGS = ['ppr', 'half', 'std', 'league'] as const
export type Scoring = (typeof SCORINGS)[number]

/** The part of a league's `Rules` that scores a stat line. */
export interface ScoringRules {
  scoring: Record<StatKey, number>
  positionOverrides: Partial<Record<Position, Record<StatKey, number>>>
}

/** Sleeper's default scoring, which its own `pts_std` / `pts_half_ppr` / `pts_ppr` use. */
const BASE: Record<StatKey, number> = {
  pass_yd: 0.04,
  pass_td: 4,
  pass_int: -1,
  pass_2pt: 2,
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  fum_lost: -2,
  fum_rec_td: 6,
  fgm_0_19: 3,
  fgm_20_29: 3,
  fgm_30_39: 3,
  fgm_40_49: 4,
  fgm_50_59: 5,
  fgm_60p: 6,
  fgmiss: -1,
  xpm: 1,
  xpmiss: -1,
  sack: 1,
  int: 2,
  fum_rec: 2,
  ff: 1,
  safe: 2,
  def_td: 6,
  blk_kick: 2,
  def_st_td: 6,
  def_st_ff: 1,
  def_st_fum_rec: 1,
  st_td: 6,
  st_ff: 1,
  st_fum_rec: 1,
  pts_allow_0: 10,
  pts_allow_1_6: 7,
  pts_allow_7_13: 4,
  pts_allow_14_20: 1,
  pts_allow_21_27: 0,
  pts_allow_28_34: -1,
  pts_allow_35p: -4
}

/** The presets of the scoring picker: Sleeper's defaults with 1, ½ and 0 points a reception. */
export const SCORING_PRESETS: Record<Exclude<Scoring, 'league'>, ScoringRules> = {
  ppr: { scoring: { ...BASE, rec: 1 }, positionOverrides: {} },
  half: { scoring: { ...BASE, rec: 0.5 }, positionOverrides: {} },
  std: { scoring: { ...BASE }, positionOverrides: {} }
}

export const SCORING_LABELS: Record<Scoring, string> = {
  league: 'My league',
  ppr: 'PPR',
  half: 'Half PPR',
  std: 'Standard'
}
```

- [ ] **Step 4: The bookkeeping tables**

```diff
diff --git a/src/main/stats/schema.ts b/src/main/stats/schema.ts
index 5d0bf8c..8d5d4b1 100644
--- a/src/main/stats/schema.ts
+++ b/src/main/stats/schema.ts
@@ -20,7 +20,8 @@ const teamCase = Object.entries(TEAM_CODE_FIXES)
 /**
  * Created on every open, so a new version replaces them. The tables keep their rows across
  * versions: `sync_log` is the stats steps' own log (status adds `interrupted`), `source_state`
- * what each source holds per season (season 0 = an all-seasons file).
+ * what each source holds per season (season 0 = an all-seasons file), `derived_state` and
+ * `stats_settings` the derived layer's version and league rules (stats-analysis spec §5).
  */
 const BOOTSTRAP = [
   `CREATE OR REPLACE MACRO nfl_team(t) AS CASE t ${teamCase} ELSE t END`,
@@ -45,7 +46,10 @@ const BOOTSTRAP = [
      fetched_at VARCHAR NOT NULL,
      sealed BOOLEAN NOT NULL,
      PRIMARY KEY (source, season)
-   )`
+   )`,
+  // Plan Y: the version the derived tables were built with, and the league rules they score.
+  'CREATE TABLE IF NOT EXISTS derived_state (name VARCHAR PRIMARY KEY, version INTEGER NOT NULL)',
+  'CREATE TABLE IF NOT EXISTS stats_settings (key VARCHAR PRIMARY KEY, value VARCHAR)'
 ]
 
 export const INTERRUPTED_MESSAGE = 'The app closed during this step'
```

- [ ] **Step 5: The SQL helpers and the play components**

Create `src/main/stats/derived/sql.ts`:

```ts
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
```

Create `src/main/stats/derived/plays.ts`:

```ts
/**
 * Play components (stats-analysis spec §5.1): every count, numerator and denominator that comes
 * from a play, written once as an expression over one row of `plays` (alias `p`). The same
 * expressions build `player_week` / `team_week` (summed by week) and answer play-grain queries
 * (summed under a situation filter, spec §7.2), so the two grains cannot disagree.
 */

/** Which source columns an expression reads: FTN is 2022+, participation through the prior season. */
export type PlayGroup = 'pbp' | 'ftn' | 'part'

/**
 * Who a play is credited to.
 * - `passer`: `passer_player_id`, pass attempts and sacks.
 * - `dropback`: nflfastR's `passer_id`, every dropback (scrambles included).
 * - `rusher`, `receiver`: the ball carrier and the targeted receiver.
 * - `onO`, `onD`: every player on the field (participation, through the prior season).
 * - `kicker`, `punter`: the kicking player.
 * - `defender`: the players `play_players` names in a defensive role (`pp.role`).
 */
export type Role =
  'passer' | 'dropback' | 'rusher' | 'receiver' | 'onO' | 'onD' | 'kicker' | 'punter' | 'defender'

export interface PlayComponent {
  name: string
  role: Role
  /** The value one play adds: SQL over `p` (and `pp` for defenders). NULL adds nothing. */
  expr: string
  group: PlayGroup
}

const n = (cond: string): string => `(${cond})::INT`
const when = (cond: string, value: string): string => `CASE WHEN ${cond} THEN ${value} END`
const one = (flag: string): string => `coalesce(p.${flag}, 0) = 1`

const ATTEMPT = `${one('pass_attempt')} AND coalesce(p.sack, 0) = 0`
const PASS_PLAY = `${one('pass_attempt')} OR ${one('sack')}`
const COMPLETE = one('complete_pass')
/** Spec §6.2 thresholds: deep 20+ air yards, explosive runs 10+, breakaway runs 15+. */
const DEEP = 'p.air_yards >= 20'
const RED_ZONE = 'p.yardline_100 <= 20'
const INSIDE_10 = 'p.yardline_100 <= 10'
const INSIDE_5 = 'p.yardline_100 <= 5'
const PRESSURE_KNOWN = 'p.was_pressure IS NOT NULL'
const COVERAGE = "nullif(p.defense_man_zone_type, '')"
const MAN = `${COVERAGE} = 'MAN_COVERAGE'`
const ZONE = `${COVERAGE} = 'ZONE_COVERAGE'`
/** FTN charts every play from 2022; its flags are NULL before. */
const FTN_KNOWN = 'p.is_play_action IS NOT NULL'
const BLITZ = 'p.n_blitzers > 0'
/** Defenders in the box: participation through the prior season, else FTN (2022+). */
export const BOX = 'coalesce(p.defenders_in_box, p.n_defense_box)'
/**
 * Offensive personnel as the usual code ("11" = 1 RB, 1 TE): participation spells it "1 RB, 1 TE,
 * 3 WR" through 2022 and lists the whole line-up from 2023.
 */
export const PERSONNEL = `CASE WHEN nullif(p.offense_personnel, '') IS NOT NULL THEN
    coalesce(nullif(regexp_extract(p.offense_personnel, '(\\d+) RB', 1), ''), '0') ||
    coalesce(nullif(regexp_extract(p.offense_personnel, '(\\d+) TE', 1), ''), '0') END`

function comps(role: Role, group: PlayGroup, defs: Record<string, string>): PlayComponent[] {
  return Object.entries(defs).map(([name, expr]) => ({ name, role, expr, group }))
}

/** Passing, credited to `passer_player_id` on plays that count (attempts and sacks). */
const PASSER: PlayComponent[] = [
  ...comps('passer', 'pbp', {
    pass_att: n(ATTEMPT),
    pass_cmp: n(`${ATTEMPT} AND ${COMPLETE}`),
    pass_yds: when(ATTEMPT, 'coalesce(p.passing_yards, 0)'),
    pass_td: n(`${ATTEMPT} AND ${one('pass_touchdown')}`),
    pass_int: n(`${ATTEMPT} AND ${one('interception')}`),
    sacks_taken: n(one('sack')),
    sack_yds_lost: when(one('sack'), '-p.yards_gained'),
    pass_fd: n(`${ATTEMPT} AND ${one('first_down_pass')}`),
    pass_air_yds: when(ATTEMPT, 'coalesce(p.air_yards, 0)'),
    pass_yac: when(`${ATTEMPT} AND ${COMPLETE}`, 'coalesce(p.yards_after_catch, 0)'),
    pass_plays: n(PASS_PLAY),
    pass_epa: when(PASS_PLAY, 'p.epa'),
    pass_success: when(PASS_PLAY, 'p.success'),
    cpoe_sum: when(ATTEMPT, 'p.cpoe'),
    cpoe_n: n(`${ATTEMPT} AND p.cpoe IS NOT NULL`),
    xcmp_sum: when(`${ATTEMPT} AND p.cpoe IS NOT NULL`, 'p.cp'),
    pass_air_to_sticks: when(`${ATTEMPT} AND p.air_yards IS NOT NULL`, 'p.air_yards - p.ydstogo'),
    pass_air_n: n(`${ATTEMPT} AND p.air_yards IS NOT NULL`),
    deep_att: n(`${ATTEMPT} AND ${DEEP}`),
    deep_epa: when(`${ATTEMPT} AND ${DEEP}`, 'p.epa'),
    pass_wpa: when(PASS_PLAY, 'p.wpa')
  }),
  ...comps('passer', 'ftn', {
    ftn_att: n(`${ATTEMPT} AND ${FTN_KNOWN}`),
    int_worthy: n(`${ATTEMPT} AND p.is_interception_worthy`),
    throwaways: n(`${ATTEMPT} AND p.is_throw_away`)
  })
]

/** Every dropback (nflfastR's `passer_id`), scrambles and sacks included: the QB's EPA. */
const DROPBACK: PlayComponent[] = [
  ...comps('dropback', 'pbp', {
    dropbacks: '1',
    db_epa: 'p.qb_epa',
    db_success: 'p.success',
    scrambles: n(one('qb_scramble')),
    scramble_yds: when(one('qb_scramble'), 'coalesce(p.rushing_yards, 0)')
  }),
  ...comps('dropback', 'part', {
    db_pressure_known: n(PRESSURE_KNOWN),
    db_pressured: n('p.was_pressure'),
    db_pressured_epa: when('p.was_pressure', 'p.qb_epa'),
    db_pressured_sacks: n(`p.was_pressure AND ${one('sack')}`),
    db_clean_epa: when('NOT p.was_pressure', 'p.qb_epa')
  }),
  ...comps('dropback', 'ftn', {
    db_ftn: n(FTN_KNOWN),
    db_blitzed: n(BLITZ),
    db_blitz_epa: when(BLITZ, 'p.qb_epa'),
    db_play_action: n('p.is_play_action'),
    db_pa_epa: when('p.is_play_action', 'p.qb_epa'),
    db_out_of_pocket: n('p.is_qb_out_of_pocket')
  })
]

/** Rushing, credited to the ball carrier on counted carries (scrambles and kneels included). */
const RUSHER: PlayComponent[] = [
  ...comps('rusher', 'pbp', {
    carries: '1',
    rush_yds: 'coalesce(p.rushing_yards, 0)',
    rush_td: n(one('rush_touchdown')),
    rush_fd: n(one('first_down_rush')),
    rush_epa: 'p.epa',
    rush_success: 'p.success',
    rush_10p: n('p.rushing_yards >= 10'),
    rush_15p_yds: when('p.rushing_yards >= 15', 'p.rushing_yards'),
    rush_stuffed: n('p.rushing_yards <= 0'),
    designed_runs: n(`NOT ${one('qb_scramble')} AND NOT ${one('qb_kneel')}`),
    rz_carries: n(RED_ZONE),
    i10_carries: n(INSIDE_10),
    i5_carries: n(INSIDE_5)
  }),
  ...comps('rusher', 'part', {
    box_known: n(`${BOX} IS NOT NULL`),
    box8_carries: n(`${BOX} >= 8`)
  })
]

/** Receiving, credited to the targeted receiver on counted targets. */
const RECEIVER: PlayComponent[] = [
  ...comps('receiver', 'pbp', {
    targets: '1',
    receptions: n(COMPLETE),
    rec_yds: 'coalesce(p.receiving_yards, 0)',
    rec_td: n(one('pass_touchdown')),
    rec_fd: n(`${COMPLETE} AND ${one('first_down_pass')}`),
    rec_air_yds: 'coalesce(p.air_yards, 0)',
    rec_yac: when(COMPLETE, 'coalesce(p.yards_after_catch, 0)'),
    rec_xyac: when(`${COMPLETE} AND p.xyac_mean_yardage IS NOT NULL`, 'p.xyac_mean_yardage'),
    rec_xyac_yac: when(
      `${COMPLETE} AND p.xyac_mean_yardage IS NOT NULL`,
      'coalesce(p.yards_after_catch, 0)'
    ),
    rec_xyac_n: n(`${COMPLETE} AND p.xyac_mean_yardage IS NOT NULL`),
    rec_epa: 'p.epa',
    rec_success: 'p.success',
    deep_targets: n(DEEP),
    rz_targets: n(RED_ZONE),
    i10_targets: n(INSIDE_10),
    ez_targets: n('p.air_yards >= p.yardline_100')
  }),
  ...comps('receiver', 'ftn', {
    tgt_ftn: n(FTN_KNOWN),
    tgt_catchable: n('p.is_catchable_ball'),
    tgt_contested: n('p.is_contested_ball'),
    contested_catches: n(`p.is_contested_ball AND ${COMPLETE}`),
    drops: n('p.is_drop'),
    created_receptions: n('p.is_created_reception')
  }),
  ...comps('receiver', 'part', {
    tgt_man: n(MAN),
    tgt_zone: n(ZONE),
    rec_yds_man: when(MAN, 'coalesce(p.receiving_yards, 0)'),
    rec_yds_zone: when(ZONE, 'coalesce(p.receiving_yards, 0)')
  })
]

/**
 * On the field (participation lists, through the prior season). A route is a dropback the player
 * was on the field for, on offense: blocking backs and tight ends count too.
 */
const ON_FIELD: PlayComponent[] = [
  ...comps('onO', 'part', {
    routes: n('p.is_dropback'),
    routes_man: n(`p.is_dropback AND ${MAN}`),
    routes_zone: n(`p.is_dropback AND ${ZONE}`),
    on_off_plays: n('p.is_snap AND p.counts'),
    on_off_epa: when('p.is_snap AND p.counts', 'p.epa')
  }),
  ...comps('onD', 'part', {
    def_pass_snaps: n('p.is_dropback'),
    on_def_plays: n('p.is_snap AND p.counts'),
    on_def_epa: when('p.is_snap AND p.counts', 'p.epa')
  })
]

const ROLE = (role: string): string => `pp.role = '${role}'`
const TACKLER = "pp.role IN ('solo_tackle', 'tackle_with_assist')"
/** Individual defense from `play_players` (spec §6.2 Defenders). */
const DEFENDER: PlayComponent[] = comps('defender', 'pbp', {
  tackles_solo: n(ROLE('solo_tackle')),
  tackles_assist: n(ROLE('assist_tackle')),
  tackles_with_assist: n(ROLE('tackle_with_assist')),
  sacks: "CASE pp.role WHEN 'sack' THEN 1.0 WHEN 'half_sack' THEN 0.5 END",
  qb_hits: n(ROLE('qb_hit')),
  pass_defended: n(ROLE('pass_defense')),
  def_ints: n(ROLE('interception')),
  forced_fumbles: n(ROLE('forced_fumble')),
  fumble_recoveries: n(ROLE('fumble_recovery')),
  /** A tackle (solo or shared) on a counted run at or behind the line. */
  def_stuffs: n(
    "pp.role IN ('solo_tackle', 'assist_tackle', 'tackle_with_assist') AND p.is_carry AND p.rushing_yards <= 0"
  ),
  tackle_depth_sum: when(
    `${TACKLER} AND p.counts AND p.yards_gained IS NOT NULL`,
    'p.yards_gained'
  ),
  tackle_depth_n: n(`${TACKLER} AND p.counts AND p.yards_gained IS NOT NULL`)
})

/** Kicking and punting value (the counts come from the box score). */
const KICKING: PlayComponent[] = [
  ...comps('kicker', 'pbp', {
    fg_epa: when(one('field_goal_attempt'), 'p.epa'),
    kickoffs: n(one('kickoff_attempt')),
    kickoff_touchbacks: n(`${one('kickoff_attempt')} AND ${one('touchback')}`)
  }),
  ...comps('punter', 'pbp', {
    punt_epa: when(one('punt_attempt'), 'p.epa'),
    punts_pbp: n(one('punt_attempt'))
  })
]

export const PLAYER_PLAY_COMPONENTS: PlayComponent[] = [
  ...PASSER,
  ...DROPBACK,
  ...RUSHER,
  ...RECEIVER,
  ...ON_FIELD,
  ...DEFENDER,
  ...KICKING
]

const ON_FIELD_FROM = 'on_field f JOIN plays p ON p.game_id = f.game_id AND p.play_id = f.play_id'

/**
 * The id a role credits, its team, the rows it reads (spec §4.2 counting flags), and the tables
 * those need.
 */
export const ROLE_SOURCES: Record<
  Role,
  { id: string; team: string; from: string; where: string; tables: string[] }
> = {
  passer: {
    id: 'p.passer_player_id',
    team: 'p.posteam',
    from: 'plays p',
    where: `p.counts AND (${PASS_PLAY})`,
    tables: ['src_pbp']
  },
  dropback: {
    id: 'p.passer_id',
    team: 'p.posteam',
    from: 'plays p',
    where: 'p.is_dropback',
    tables: ['src_pbp']
  },
  rusher: {
    id: 'p.rusher_player_id',
    team: 'p.posteam',
    from: 'plays p',
    where: 'p.is_carry',
    tables: ['src_pbp']
  },
  receiver: {
    id: 'p.receiver_player_id',
    team: 'p.posteam',
    from: 'plays p',
    where: 'p.is_target',
    tables: ['src_pbp']
  },
  onO: {
    id: 'f.gsis',
    team: 'p.posteam',
    from: ON_FIELD_FROM,
    where: "f.side = 'O'",
    tables: ['src_pbp', 'on_field']
  },
  onD: {
    id: 'f.gsis',
    team: 'p.defteam',
    from: ON_FIELD_FROM,
    where: "f.side = 'D'",
    tables: ['src_pbp', 'on_field']
  },
  kicker: {
    id: 'p.kicker_player_id',
    team: 'p.posteam',
    from: 'plays p',
    where: 'true',
    tables: ['src_pbp']
  },
  punter: {
    id: 'p.punter_player_id',
    team: 'p.posteam',
    from: 'plays p',
    where: 'true',
    tables: ['src_pbp']
  },
  defender: {
    id: 'pp.gsis',
    team: 'p.defteam',
    from: 'play_players pp JOIN plays p ON p.game_id = pp.game_id AND p.play_id = pp.play_id',
    where:
      "pp.role IN ('solo_tackle', 'assist_tackle', 'tackle_with_assist', 'sack', 'half_sack', 'qb_hit', 'pass_defense', 'interception', 'forced_fumble', 'fumble_recovery')",
    tables: ['src_pbp', 'play_players']
  }
}

const SCRIMMAGE = "p.counts AND p.play_type IN ('pass', 'run')"
/** Neutral game state: win probability 20–80 %, early downs, not the last two minutes of a half. */
export const NEUTRAL =
  'p.wp BETWEEN 0.2 AND 0.8 AND p.down IN (1, 2) AND p.qtr <= 4 AND p.half_seconds_remaining > 120'
const EARLY_DOWN = 'p.down IN (1, 2)'
const EXPLOSIVE =
  "(p.play_type = 'pass' AND p.yards_gained >= 20) OR (p.play_type = 'run' AND p.yards_gained >= 10)"
const HAVOC = `${one('interception')} OR ${one('fumble_forced')} OR ${one('sack')} OR ${one('tackled_for_loss')} OR p.pass_defense_1_player_id IS NOT NULL`
const DESIGNED_RUN = "p.is_carry AND p.play_type = 'run' AND NOT coalesce(p.qb_scramble, 0) = 1"

export interface TeamPlayComponent {
  name: string
  expr: string
  group: PlayGroup
}

function teamComps(group: PlayGroup, defs: Record<string, string>): TeamPlayComponent[] {
  return Object.entries(defs).map(([name, expr]) => ({ name, expr, group }))
}

/**
 * Team components, one expression per play, summed twice: by `posteam` as `off_<name>` and by
 * `defteam` as `def_<name>` (spec §5.2, the warehouse spec's `off_` / `def_` convention).
 */
export const TEAM_PLAY_COMPONENTS: TeamPlayComponent[] = [
  ...teamComps('pbp', {
    plays: n(SCRIMMAGE),
    epa: when(SCRIMMAGE, 'p.epa'),
    success: when(SCRIMMAGE, 'p.success'),
    dropbacks: n('p.is_dropback'),
    dropback_epa: when('p.is_dropback', 'p.epa'),
    dropback_success: when('p.is_dropback', 'p.success'),
    pass_att: n(`p.counts AND ${ATTEMPT}`),
    pass_yds: when(`p.counts AND ${ATTEMPT}`, 'coalesce(p.passing_yards, 0)'),
    pass_air_yds: when(`p.counts AND ${ATTEMPT}`, 'coalesce(p.air_yards, 0)'),
    targets: n('p.is_target'),
    sacks: n(`p.counts AND ${one('sack')}`),
    carries: n('p.is_carry'),
    rush_yds: when('p.is_carry', 'coalesce(p.rushing_yards, 0)'),
    rush_epa: when('p.is_carry', 'p.epa'),
    rush_success: when('p.is_carry', 'p.success'),
    rush_stuffed: n('p.is_carry AND p.rushing_yards <= 0'),
    /** Line yards (the public Football Outsiders formula): 120 % of losses, 100 % of 0–4, 50 % of 5–10. */
    line_yds: when(
      DESIGNED_RUN,
      'CASE WHEN p.rushing_yards < 0 THEN 1.2 * p.rushing_yards WHEN p.rushing_yards <= 4 THEN p.rushing_yards WHEN p.rushing_yards <= 10 THEN 4 + 0.5 * (p.rushing_yards - 4) ELSE 7 END'
    ),
    designed_runs: n(DESIGNED_RUN),
    explosive: n(`${SCRIMMAGE} AND (${EXPLOSIVE})`),
    havoc: n(`${SCRIMMAGE} AND (${HAVOC})`),
    early_plays: n(`${SCRIMMAGE} AND ${EARLY_DOWN}`),
    early_epa: when(`${SCRIMMAGE} AND ${EARLY_DOWN}`, 'p.epa'),
    third_att: n(`${SCRIMMAGE} AND p.down = 3`),
    third_conv: n(`${SCRIMMAGE} AND p.down = 3 AND ${one('first_down')}`),
    fourth_att: n(`${SCRIMMAGE} AND p.down = 4`),
    fourth_conv: n(`${SCRIMMAGE} AND p.down = 4 AND ${one('first_down')}`),
    rz_targets: n(`p.is_target AND ${RED_ZONE}`),
    rz_carries: n(`p.is_carry AND ${RED_ZONE}`),
    turnovers: n(`p.counts AND (${one('interception')} OR ${one('fumble_lost')})`),
    shotgun: n(`${SCRIMMAGE} AND ${one('shotgun')}`),
    no_huddle: n(`${SCRIMMAGE} AND ${one('no_huddle')}`),
    neutral_plays: n(`${SCRIMMAGE} AND ${NEUTRAL}`),
    neutral_dropbacks: n(`${SCRIMMAGE} AND ${NEUTRAL} AND p.is_dropback`),
    neutral_xpass_n: n(`${SCRIMMAGE} AND ${NEUTRAL} AND p.xpass IS NOT NULL`),
    neutral_pass_oe: when(`${SCRIMMAGE} AND ${NEUTRAL} AND p.xpass IS NOT NULL`, 'p.pass_oe'),
    pass_oe_sum: when(`${SCRIMMAGE} AND p.xpass IS NOT NULL`, 'p.pass_oe'),
    pass_oe_n: n(`${SCRIMMAGE} AND p.xpass IS NOT NULL`)
  }),
  ...teamComps('ftn', {
    ftn_plays: n(`${SCRIMMAGE} AND ${FTN_KNOWN}`),
    ftn_dropbacks: n(`p.is_dropback AND ${FTN_KNOWN}`),
    play_action: n('p.is_dropback AND p.is_play_action'),
    play_action_epa: when('p.is_dropback AND p.is_play_action', 'p.epa'),
    rpo: n(`${SCRIMMAGE} AND p.is_rpo`),
    screens: n('p.is_dropback AND p.is_screen_pass'),
    motion: n(`${SCRIMMAGE} AND p.is_motion`),
    blitzed: n(`p.is_dropback AND ${BLITZ}`),
    pass_rushers_sum: when('p.is_dropback', 'p.n_pass_rushers'),
    pass_rushers_n: n('p.is_dropback AND p.n_pass_rushers IS NOT NULL')
  }),
  ...teamComps('part', {
    pressure_known: n(`p.is_dropback AND ${PRESSURE_KNOWN}`),
    pressured: n('p.is_dropback AND p.was_pressure'),
    coverage_known: n(`p.is_dropback AND ${COVERAGE} IS NOT NULL`),
    man: n(`p.is_dropback AND ${MAN}`),
    man_epa: when(`p.is_dropback AND ${MAN}`, 'p.epa'),
    zone: n(`p.is_dropback AND ${ZONE}`),
    zone_epa: when(`p.is_dropback AND ${ZONE}`, 'p.epa'),
    box_known: n(`p.is_carry AND ${BOX} IS NOT NULL`),
    box_sum: when('p.is_carry', BOX),
    personnel_known: n(`${SCRIMMAGE} AND (${PERSONNEL}) IS NOT NULL`),
    personnel_11: n(`${SCRIMMAGE} AND (${PERSONNEL}) = '11'`),
    personnel_12: n(`${SCRIMMAGE} AND (${PERSONNEL}) = '12'`),
    personnel_21: n(`${SCRIMMAGE} AND (${PERSONNEL}) = '21'`)
  })
]

/** A column whose presence in `plays` tells that a group's source is loaded. */
export const GROUP_PROBE: Record<PlayGroup, string | null> = {
  pbp: null,
  ftn: 'is_play_action',
  part: 'was_pressure'
}
```

- [ ] **Step 6: `player_week` and `player_season`**

Create `src/main/stats/derived/player.ts`:

```ts
import { PLAYER_PLAY_COMPONENTS, ROLE_SOURCES, type PlayComponent, type Role } from './plays'
import { groupAvailable, hasAll, postWeek, sums, type Built, type Have } from './sql'

/**
 * Box-score components from nflverse `stats_player` (spec §6.2 Traditional): what plays do not
 * carry well (kicking and punting buckets, returns, fumbles, penalties) or where the official
 * count differs from the plays (tackles for loss before 2024).
 */
export const BOX_COMPONENTS: Record<string, string> = {
  fumbles: 'fumbles_total',
  fumbles_lost: 'fumbles_lost_total',
  penalties: 'penalties',
  penalty_yds: 'penalty_yards',
  st_tds: 'special_teams_tds',
  tfl: 'def_tackles_for_loss',
  def_tds: 'def_tds',
  kr: 'kickoff_returns',
  kr_yds: 'kickoff_return_yards',
  pr: 'punt_returns',
  pr_yds: 'punt_return_yards',
  fg_made: 'fg_made',
  fg_att: 'fg_att',
  fg_made_0_19: 'fg_made_0_19',
  fg_made_20_29: 'fg_made_20_29',
  fg_made_30_39: 'fg_made_30_39',
  fg_made_40_49: 'fg_made_40_49',
  fg_made_50_59: 'fg_made_50_59',
  fg_made_60p: 'fg_made_60_',
  fg_missed_0_19: 'fg_missed_0_19',
  fg_missed_20_29: 'fg_missed_20_29',
  fg_missed_30_39: 'fg_missed_30_39',
  fg_missed_40_49: 'fg_missed_40_49',
  fg_missed_50_59: 'fg_missed_50_59',
  fg_missed_60p: 'fg_missed_60_',
  pat_made: 'pat_made',
  pat_att: 'pat_att',
  punts: 'pt_att',
  punt_yds: 'pt_yards',
  punt_net_yds: 'pt_net_yards',
  punt_in20: 'pt_inside_20',
  punt_tb: 'pt_touchback'
}

/**
 * Next Gen Stats, as sums weighted by NGS's own denominators. NGS publishes a week only for
 * players over its weekly minimum, so `player_season` takes these from the season rows (week 0).
 */
export const NGS_COMPONENTS: Record<'passing' | 'rushing' | 'receiving', Record<string, string>> = {
  passing: {
    ngs_pass_att: 'attempts',
    ngs_ttt_sum: 'avg_time_to_throw * attempts',
    ngs_aggr_sum: 'aggressiveness * attempts'
  },
  rushing: {
    ngs_rush_att: 'rush_attempts',
    ngs_ryoe: 'rush_yards_over_expected',
    ngs_roe_sum: 'rush_pct_over_expected * rush_attempts',
    ngs_box8_sum: 'percent_attempts_gte_eight_defenders * rush_attempts'
  },
  receiving: {
    ngs_targets: 'targets',
    ngs_receptions: 'receptions',
    ngs_sep_sum: 'avg_separation * targets',
    ngs_cushion_sum: 'avg_cushion * targets',
    ngs_yacoe_sum: 'avg_yac_above_expectation * receptions'
  }
}

/** PFR advanced stats (weekly, keyed by PFR id). */
const PFR_COMPONENTS: Record<'pass' | 'rush' | 'rec' | 'def', Record<string, string>> = {
  pass: {
    pfr_bad_throws: 'passing_bad_throws',
    pfr_times_pressured: 'times_pressured'
  },
  rush: {
    pfr_carries: 'carries',
    pfr_ybc: 'rushing_yards_before_contact',
    pfr_yac: 'rushing_yards_after_contact',
    pfr_rush_btkl: 'rushing_broken_tackles'
  },
  rec: {
    pfr_rec_btkl: 'receiving_broken_tackles'
  },
  def: {
    cov_targets: 'def_targets',
    cov_cmp: 'def_completions_allowed',
    cov_yds: 'def_yards_allowed',
    cov_td: 'def_receiving_td_allowed',
    cov_int: 'def_ints',
    cov_yac: 'def_yards_after_catch',
    cov_adot_sum: 'def_adot * def_targets',
    pfr_blitzes: 'def_times_blitzed',
    pfr_hurries: 'def_times_hurried',
    pfr_pressures: 'def_pressures',
    pfr_missed_tackles: 'def_missed_tackles',
    pfr_tackles: 'def_tackles_combined'
  }
}

/** ffopportunity's expected stats (spec §6.2 Fantasy opportunity); expected points are in `fantasy_week`. */
const FF_OPPORTUNITY_COMPONENTS: Record<string, string> = {
  x_rec: 'receptions_exp',
  x_rec_yds: 'rec_yards_gained_exp',
  x_rush_yds: 'rush_yards_gained_exp',
  x_td: 'total_touchdown_exp',
  ff_td: 'total_touchdown'
}

/** Team context joined into each player-week, for shares (spec §5.2). */
export const TEAM_CONTEXT: Record<string, string> = {
  tm_targets: 'off_targets',
  tm_air_yds: 'off_pass_air_yds',
  tm_carries: 'off_carries',
  tm_dropbacks: 'off_dropbacks',
  tm_rz_targets: 'off_rz_targets',
  tm_rz_carries: 'off_rz_carries'
}

const SNAP_COMPONENTS: Record<string, string> = {
  off_snaps: 's.offense_snaps',
  def_snaps: 's.defense_snaps',
  st_snaps: 's.st_snaps',
  tm_off_snaps: 'CASE WHEN s.offense_pct > 0 THEN round(s.offense_snaps / s.offense_pct) END',
  tm_def_snaps: 'CASE WHEN s.defense_pct > 0 THEN round(s.defense_snaps / s.defense_pct) END'
}

const NGS_NAMES = Object.values(NGS_COMPONENTS).flatMap((c) => Object.keys(c))

/** Every summed column of `player_week` and `player_season`. */
export function playerComponentNames(): string[] {
  return [
    ...new Set([
      ...PLAYER_PLAY_COMPONENTS.map((c) => c.name),
      ...Object.keys(BOX_COMPONENTS),
      ...Object.keys(SNAP_COMPONENTS),
      ...NGS_NAMES,
      ...Object.values(PFR_COMPONENTS).flatMap((c) => Object.keys(c)),
      'qbr_sum',
      'qbr_plays',
      ...Object.keys(FF_OPPORTUNITY_COMPONENTS),
      ...Object.keys(TEAM_CONTEXT),
      'routes_est',
      'games'
    ])
  ]
}

const KEY = 'gsis_id, season, season_type, week'

/**
 * One source's weekly aggregate, one row per `KEY`. `context` parts also give the game and the
 * team (plays, box score, snaps).
 */
interface Part {
  tables: string[]
  sql: string
  components: string[]
  context: boolean
}

function rolePart(role: Role, components: PlayComponent[], season: number): Part {
  const src = ROLE_SOURCES[role]
  return {
    tables: src.tables,
    sql: `SELECT ${src.id} AS gsis_id, p.season, p.season_type, p.week,
                 any_value(p.game_id) AS game_id, any_value(${src.team}) AS team,
                 ${components.map((c) => `sum(${c.expr}) AS ${c.name}`).join(', ')}
          FROM ${src.from}
          WHERE ${src.id} IS NOT NULL AND ${src.where} AND p.season = ${season}
          GROUP BY ALL`,
    components: components.map((c) => c.name),
    context: true
  }
}

/** The per-role play aggregates; a component whose source is not loaded is NULL. */
function playParts(have: Have, season: number): Part[] {
  const byRole = new Map<Role, PlayComponent[]>()
  for (const c of PLAYER_PLAY_COMPONENTS) {
    const kept = groupAvailable(have, c.group) ? c : { ...c, expr: 'NULL::DOUBLE' }
    byRole.set(c.role, [...(byRole.get(c.role) ?? []), kept])
  }
  return [...byRole].map(([role, components]) => rolePart(role, components, season))
}

function sourceParts(have: Have, season: number): Part[] {
  const ngs = (kind: keyof typeof NGS_COMPONENTS): Part => ({
    tables: [`src_ngs_${kind}`],
    sql: `SELECT player_gsis_id AS gsis_id, season, season_type,
                 ${postWeek('season', 'season_type', 'week', 'ngs')} AS week,
                 ${sums(have, `src_ngs_${kind}`, NGS_COMPONENTS[kind])}
          FROM src_ngs_${kind} WHERE week > 0 AND season = ${season} GROUP BY ALL`,
    components: Object.keys(NGS_COMPONENTS[kind]),
    context: false
  })
  const pfr = (kind: keyof typeof PFR_COMPONENTS): Part => ({
    tables: [`src_pfr_${kind}`, 'players'],
    sql: `SELECT pl.gsis_id, s.season, s.season_type, s.week,
                 ${sums(have, `src_pfr_${kind}`, PFR_COMPONENTS[kind], 's')}
          FROM src_pfr_${kind} s JOIN players pl ON pl.pfr_id = s.pfr_player_id
          WHERE s.season = ${season} GROUP BY ALL`,
    components: Object.keys(PFR_COMPONENTS[kind]),
    context: false
  })
  return [
    {
      tables: ['src_player_stats'],
      sql: `SELECT player_id AS gsis_id, season, season_type, week, any_value(game_id) AS game_id,
                   any_value(team) AS team, ${sums(have, 'src_player_stats', BOX_COMPONENTS)}
            FROM src_player_stats WHERE season = ${season} GROUP BY ALL`,
      components: Object.keys(BOX_COMPONENTS),
      context: true
    },
    {
      tables: ['src_snaps', 'players'],
      sql: `SELECT pl.gsis_id, s.season, s.season_type, s.week, any_value(s.game_id) AS game_id,
                   any_value(s.team) AS team,
                   ${Object.entries(SNAP_COMPONENTS)
                     .map(([name, expr]) => `sum(${expr}) AS ${name}`)
                     .join(', ')}
            FROM src_snaps s JOIN players pl ON pl.pfr_id = s.pfr_player_id
            WHERE s.season = ${season} GROUP BY ALL`,
      components: Object.keys(SNAP_COMPONENTS),
      context: true
    },
    ngs('passing'),
    ngs('rushing'),
    ngs('receiving'),
    pfr('pass'),
    pfr('rush'),
    pfr('rec'),
    pfr('def'),
    {
      tables: ['src_qbr_week', 'players'],
      sql: `SELECT pl.gsis_id, q.season, q.season_type,
                   ${postWeek('q.season', 'q.season_type', 'q.week', 'qbr')} AS week,
                   sum(q.qbr_total * q.qb_plays) AS qbr_sum, sum(q.qb_plays) AS qbr_plays
            FROM src_qbr_week q JOIN players pl ON pl.espn_id = q.player_id
            WHERE q.season = ${season} GROUP BY ALL`,
      components: ['qbr_sum', 'qbr_plays'],
      context: false
    },
    {
      tables: ['src_ff_opportunity'],
      sql: `SELECT player_id AS gsis_id, season, season_type, week,
                   ${sums(have, 'src_ff_opportunity', FF_OPPORTUNITY_COMPONENTS)}
            FROM src_ff_opportunity WHERE season = ${season} GROUP BY ALL`,
      components: Object.keys(FF_OPPORTUNITY_COMPONENTS),
      context: false
    }
  ]
}

/**
 * `player_week` (spec §5.2): one row per player × season type × week of one season, every
 * component from every source joined on gsis, plus the week's position (nflverse rosters), the
 * team context for shares, and routes: exact from participation, else estimated as team dropbacks
 * × offensive snap share (`routes_est` = 1). Each source is aggregated into its own temporary
 * table first, then joined to the keys, so no wide intermediate is built.
 */
export function playerWeekSelect(have: Have, season: number): Built {
  const all = [...playParts(have, season), ...sourceParts(have, season)]
  const parts = all.filter((p) => hasAll(have, p.tables))
  const missing = all.filter((p) => !parts.includes(p)).flatMap((p) => p.components)
  const name = (i: number): string => `pw_part${i}`
  const temps = parts.map((p, i): [string, string] => [name(i), p.sql])
  const keys = parts.map((_, i) => `SELECT ${KEY} FROM ${name(i)}`).join(' UNION ')
  const joins = parts.map((_, i) => `LEFT JOIN ${name(i)} USING (${KEY})`).join('\n')
  const ctx = parts.flatMap((p, i) => (p.context ? [i] : []))
  const components = parts
    .flatMap((p, i) => p.components.map((c) => `${name(i)}.${c}`))
    .filter((c) => !c.endsWith('.routes'))
  const routes = parts.findIndex((p) => p.components.includes('routes'))
  const exact = have.tables.has('on_field')
    ? `EXISTS (SELECT 1 FROM on_field WHERE season = ${season})`
    : 'false'
  const position = have.tables.has('src_rosters')
    ? `(SELECT any_value(r.position) FROM src_rosters r
        WHERE r.gsis_id = s.gsis_id AND r.season = s.season AND r.week = s.week)`
    : 'NULL'
  const sql = `
    WITH keys AS (${keys}),
    joined AS (
      SELECT ${KEY},
             coalesce(${ctx.map((i) => `${name(i)}.game_id`).join(', ')}) AS game_id,
             coalesce(${ctx.map((i) => `${name(i)}.team`).join(', ')}) AS team,
             ${[...components, ...missing.filter((c) => c !== 'routes').map((c) => `NULL::DOUBLE AS ${c}`)].join(', ')},
             ${routes >= 0 ? `${name(routes)}.routes` : 'NULL::DOUBLE'} AS routes_part
      FROM keys ${joins}
    )
    SELECT s.* EXCLUDE (routes_part),
           coalesce(${position}, pl.position_group) AS position,
           CASE WHEN g.home_team = s.team THEN g.away_team WHEN g.away_team = s.team THEN g.home_team END AS opponent,
           g.home_team = s.team AS home,
           ${Object.entries(TEAM_CONTEXT)
             .map(([n, col]) => `t.${col} AS ${n}`)
             .join(', ')},
           CASE WHEN ${exact} THEN coalesce(s.routes_part, 0)
                WHEN s.off_snaps > 0 AND s.tm_off_snaps > 0 THEN round(t.off_dropbacks * s.off_snaps / s.tm_off_snaps)
           END AS routes,
           CASE WHEN NOT ${exact} AND s.off_snaps > 0 AND s.tm_off_snaps > 0 THEN 1 ELSE 0 END AS routes_est,
           1 AS games
    FROM joined s
    LEFT JOIN players pl ON pl.gsis_id = s.gsis_id
    LEFT JOIN games g ON g.game_id = s.game_id
    LEFT JOIN team_week t ON t.team = s.team AND t.game_id = s.game_id
    WHERE s.gsis_id IS NOT NULL`
  return { temps, sql }
}

/**
 * `player_season`: `player_week` summed by season type, with the season's team (latest week) and
 * position (most weeks), and the season-level sources in place of the weekly sums: NGS's season
 * rows (its weekly rows only cover players over a weekly minimum; postseason keeps the weekly
 * sums) and ESPN's season QBR.
 */
export function playerSeasonSelect(have: Have, season: number): Built {
  const own = (c: string): boolean => !NGS_NAMES.includes(c) && c !== 'qbr_sum' && c !== 'qbr_plays'
  const totals = playerComponentNames()
    .filter(own)
    .map((c) => `sum(w.${c}) AS ${c}`)
  const seasonRows = (['passing', 'rushing', 'receiving'] as const)
    .filter((k) => have.tables.has(`src_ngs_${k}`))
    .map(
      (k) => `SELECT player_gsis_id AS gsis_id, season, season_type,
                     ${sums(have, `src_ngs_${k}`, NGS_COMPONENTS[k])}
              FROM src_ngs_${k} WHERE week = 0 AND season = ${season} GROUP BY ALL`
    )
  const ngs = `SELECT gsis_id, season, season_type, ${NGS_NAMES.map((c) => `sum(${c}) AS ${c}`).join(', ')}
               FROM (${[
                 `SELECT gsis_id, season, season_type, ${NGS_NAMES.join(', ')}
                  FROM player_week WHERE season_type = 'POST' AND season = ${season}`,
                 ...seasonRows
               ].join('\nUNION ALL BY NAME\n')})
               GROUP BY ALL`
  const qbr = hasAll(have, ['src_qbr_season', 'players'])
    ? `SELECT pl.gsis_id, q.season, q.season_type,
              sum(q.qbr_total * q.qb_plays) AS qbr_sum, sum(q.qb_plays) AS qbr_plays
       FROM src_qbr_season q JOIN players pl ON pl.espn_id = q.player_id
       WHERE q.season = ${season} GROUP BY ALL`
    : `SELECT NULL::VARCHAR AS gsis_id, NULL::INTEGER AS season, NULL::VARCHAR AS season_type,
              NULL::DOUBLE AS qbr_sum, NULL::DOUBLE AS qbr_plays`
  const sql = `
    WITH base AS (
      SELECT w.gsis_id, w.season, w.season_type, arg_max(w.team, w.week) AS team,
             mode(w.position) AS position, ${totals.join(', ')}
      FROM player_week w WHERE w.season = ${season} GROUP BY ALL
    ),
    ngs AS (${ngs}),
    qbr AS (${qbr})
    SELECT b.*, ${NGS_NAMES.map((c) => `n.${c}`).join(', ')}, q.qbr_sum, q.qbr_plays
    FROM base b
    LEFT JOIN ngs n USING (gsis_id, season, season_type)
    LEFT JOIN qbr q USING (gsis_id, season, season_type)`
  return { sql }
}
```

- [ ] **Step 7: `team_week` and `team_season`**

Create `src/main/stats/derived/team.ts`:

```ts
import { NEUTRAL, TEAM_PLAY_COMPONENTS } from './plays'
import { columnsOf, groupAvailable, type Built, type Have } from './sql'

/** Special teams from nflverse `stats_team` (spec §6.2 Teams). */
export const TEAM_BOX_COMPONENTS: Record<string, string> = {
  fg_made: 'fg_made',
  fg_att: 'fg_att',
  punts: 'pt_att',
  punt_net_yds: 'pt_net_yards',
  kr: 'kickoff_returns',
  kr_yds: 'kickoff_return_yards',
  pr: 'punt_returns',
  pr_yds: 'punt_return_yards',
  st_tds: 'special_teams_tds'
}

/** Every summed column of `team_week` and `team_season`. */
export function teamComponentNames(): string[] {
  return [
    ...TEAM_PLAY_COMPONENTS.flatMap((c) => [`off_${c.name}`, `def_${c.name}`]),
    ...Object.keys(TEAM_BOX_COMPONENTS),
    'games',
    'wins',
    'losses',
    'ties',
    'points_for',
    'points_against',
    'drives',
    'drive_points',
    'td_drives',
    'three_and_outs',
    'drive_start_sum',
    'def_drives',
    'def_drive_points',
    'pace_secs',
    'pace_plays',
    'implied_points',
    'line_margin',
    'total_line'
  ]
}

/**
 * `team_week` (spec §5.2): one row per team × game of one season, scheduled games included
 * (`games` = 0 until played). Offense (`off_`, by `posteam`) and defense (`def_`, by `defteam`)
 * from the same play components; the result and the betting lines from `games`; drives; neutral
 * pace; special teams from the box score.
 */
export function teamWeekSelect(have: Have, season: number): Built {
  const expr = (c: (typeof TEAM_PLAY_COMPONENTS)[number]): string =>
    groupAvailable(have, c.group) ? c.expr : 'NULL::DOUBLE'
  const side = (prefix: 'off' | 'def', team: 'posteam' | 'defteam'): string =>
    `SELECT p.${team} AS team, p.game_id,
            ${TEAM_PLAY_COMPONENTS.map((c) => `sum(${expr(c)}) AS ${prefix}_${c.name}`).join(', ')}
     FROM plays p WHERE p.${team} IS NOT NULL AND p.season = ${season} GROUP BY ALL`
  const boxCols = columnsOf(have, 'src_team_stats')
  const box = boxCols.has('game_id')
    ? 'src_team_stats'
    : '(SELECT NULL::VARCHAR AS team, NULL::VARCHAR AS game_id)'
  const sql = `
    WITH off_side AS (${side('off', 'posteam')}),
    def_side AS (${side('def', 'defteam')}),
    drive AS (
      SELECT p.game_id, p.posteam AS team, p.fixed_drive,
             max(p.posteam_score_post) - min(p.posteam_score) AS points,
             any_value(p.fixed_drive_result) = 'Touchdown' AS td,
             count(*) FILTER (p.counts AND p.play_type IN ('pass', 'run')) <= 3
               AND any_value(p.fixed_drive_result) = 'Punt' AS three_out,
             arg_min(p.yardline_100, p.play_id) AS start_yardline
      FROM plays p
      WHERE p.posteam IS NOT NULL AND p.fixed_drive IS NOT NULL AND p.season = ${season}
        AND coalesce(p.kickoff_attempt, 0) = 0
      GROUP BY ALL
    ),
    drives AS (
      SELECT game_id, team, count(*) AS drives, sum(points) AS drive_points,
             count(*) FILTER (td) AS td_drives, count(*) FILTER (three_out) AS three_and_outs,
             sum(start_yardline) AS drive_start_sum
      FROM drive GROUP BY ALL
    ),
    pace AS (
      SELECT game_id, team, sum(secs) AS pace_secs, count(*) AS pace_plays
      FROM (SELECT p.game_id, p.posteam AS team,
                   lag(p.game_seconds_remaining) OVER (PARTITION BY p.game_id, p.fixed_drive ORDER BY p.play_id)
                     - p.game_seconds_remaining AS secs,
                   ${NEUTRAL} AND p.counts AND p.play_type IN ('pass', 'run') AS neutral
            FROM plays p WHERE p.posteam IS NOT NULL AND p.season = ${season})
      WHERE neutral AND secs BETWEEN 1 AND 60 GROUP BY ALL
    ),
    sides AS (
      SELECT game_id, season, game_type, week, home_team AS team, away_team AS opponent, true AS home,
             home_score AS points_for, away_score AS points_against, spread_line AS margin,
             total_line, roof, surface, temp, wind, home_rest AS rest
      FROM games WHERE season = ${season}
      UNION ALL
      SELECT game_id, season, game_type, week, away_team, home_team, false, away_score, home_score,
             -spread_line, total_line, roof, surface, temp, wind, away_rest
      FROM games WHERE season = ${season}
    )
    SELECT s.team, s.season, CASE WHEN s.game_type = 'REG' THEN 'REG' ELSE 'POST' END AS season_type,
           s.week, s.game_id, s.opponent, s.home, s.roof, s.surface, s.temp, s.wind, s.rest,
           s.margin AS line_margin, s.total_line, (s.total_line + s.margin) / 2 AS implied_points,
           (s.points_for IS NOT NULL)::INT AS games,
           (s.points_for > s.points_against)::INT AS wins,
           (s.points_for < s.points_against)::INT AS losses,
           (s.points_for = s.points_against)::INT AS ties,
           s.points_for, s.points_against,
           o.* EXCLUDE (team, game_id), d.* EXCLUDE (team, game_id),
           dr.drives, dr.drive_points, dr.td_drives, dr.three_and_outs, dr.drive_start_sum,
           od.drives AS def_drives, od.drive_points AS def_drive_points,
           pc.pace_secs, pc.pace_plays,
           ${Object.entries(TEAM_BOX_COMPONENTS)
             .map(([name, col]) => `${boxCols.has(col) ? `b.${col}` : 'NULL::DOUBLE'} AS ${name}`)
             .join(', ')}
    FROM sides s
    LEFT JOIN off_side o ON o.team = s.team AND o.game_id = s.game_id
    LEFT JOIN def_side d ON d.team = s.team AND d.game_id = s.game_id
    LEFT JOIN drives dr ON dr.team = s.team AND dr.game_id = s.game_id
    LEFT JOIN drives od ON od.team = s.opponent AND od.game_id = s.game_id
    LEFT JOIN pace pc ON pc.team = s.team AND pc.game_id = s.game_id
    LEFT JOIN ${box} b ON b.team = s.team AND b.game_id = s.game_id`
  return { sql }
}

/** `team_season`: `team_week` summed by season type, played games only. */
export function teamSeasonSelect(season: number): Built {
  return {
    sql: `SELECT team, season, season_type,
                 ${teamComponentNames()
                   .map((c) => `sum(${c}) AS ${c}`)
                   .join(', ')}
          FROM team_week WHERE games = 1 AND season = ${season} GROUP BY ALL`
  }
}
```

- [ ] **Step 8: The fantasy tables**

Create `src/main/stats/derived/fantasy.ts`:

```ts
import { DERIVED_STATS } from '@main/scoring/engine'
import type { Position } from '@shared/rules'
import { SCORING_PRESETS, type Scoring, type ScoringRules } from '@shared/stats/scoring'
import { sqlIdent } from '../db'
import { columnsOf, postWeek, type Built, type Have } from './sql'

const col = (have: Set<string>, key: string): string =>
  have.has(key) ? `coalesce(s.${sqlIdent(key)}, 0)` : '0'

const atLeast = (value: string, min: number, max?: number): string =>
  `coalesce((${value} >= ${min}${max === undefined ? '' : ` AND ${value} <= ${max}`})::INT, 0)`

/**
 * The SQL twin of `DERIVED_STATS` (`src/main/scoring/engine.ts`): bonus and tier keys are computed
 * from the line, not read. A defense that played allowed 0 when Sleeper leaves the key out
 * (`sleeperStatLine`). Before 2024 Sleeper had one 50+ bucket (`fgm_50p`), counted as 50–59.
 */
function derivedSql(have: Set<string>, key: string): string | null {
  const c = (k: string): string => col(have, k)
  const raw = (k: string): string => (have.has(k) ? `s.${sqlIdent(k)}` : 'NULL')
  const played = `s.position = 'DEF' AND ${c('gp')} >= 1`
  const pts = `(CASE WHEN ${played} THEN ${c('pts_allow')} ELSE ${raw('pts_allow')} END)`
  const yds = `(CASE WHEN ${played} THEN ${c('yds_allow')} ELSE ${raw('yds_allow')} END)`
  const rec = (pos: string): string => `CASE WHEN s.position = '${pos}' THEN ${c('rec')} ELSE 0 END`
  const sql: Record<string, string> = {
    bonus_pass_yd_300: atLeast(c('pass_yd'), 300),
    bonus_pass_yd_400: atLeast(c('pass_yd'), 400),
    bonus_rush_yd_100: atLeast(c('rush_yd'), 100),
    bonus_rush_yd_200: atLeast(c('rush_yd'), 200),
    bonus_rec_yd_100: atLeast(c('rec_yd'), 100),
    bonus_rec_yd_200: atLeast(c('rec_yd'), 200),
    bonus_rush_rec_yd_100: atLeast(`(${c('rush_yd')} + ${c('rec_yd')})`, 100),
    bonus_rush_rec_yd_200: atLeast(`(${c('rush_yd')} + ${c('rec_yd')})`, 200),
    bonus_pass_cmp_25: atLeast(c('pass_cmp'), 25),
    bonus_rush_att_20: atLeast(c('rush_att'), 20),
    bonus_rec_te: rec('TE'),
    bonus_rec_rb: rec('RB'),
    bonus_rec_wr: rec('WR'),
    pts_allow_0: atLeast(pts, 0, 0),
    pts_allow_1_6: atLeast(pts, 1, 6),
    pts_allow_7_13: atLeast(pts, 7, 13),
    pts_allow_14_20: atLeast(pts, 14, 20),
    pts_allow_21_27: atLeast(pts, 21, 27),
    pts_allow_28_34: atLeast(pts, 28, 34),
    pts_allow_35p: atLeast(pts, 35),
    yds_allow_0_100: atLeast(yds, 0, 99),
    yds_allow_100_199: atLeast(yds, 100, 199),
    yds_allow_200_299: atLeast(yds, 200, 299),
    yds_allow_300_349: atLeast(yds, 300, 349),
    yds_allow_350_399: atLeast(yds, 350, 399),
    yds_allow_400_449: atLeast(yds, 400, 449),
    yds_allow_450_499: atLeast(yds, 450, 499),
    yds_allow_500_549: atLeast(yds, 500, 549),
    yds_allow_550p: atLeast(yds, 550)
  }
  if (key === 'fgm_50_59' && have.has('fgm_50p')) {
    return `coalesce(${raw('fgm_50_59')}, CASE WHEN ${raw('fgm_60p')} IS NULL THEN s.fgm_50p END, 0)`
  }
  if (key in sql) return sql[key]
  return key in DERIVED_STATS ? '0' : null
}

/** The points a key is worth, with the league's position overrides as a CASE. */
function pointsOf(rules: ScoringRules, key: string): string {
  const base = rules.scoring[key] ?? 0
  const overrides = Object.entries(rules.positionOverrides).filter(
    ([, o]) => o !== undefined && key in o && o[key] !== base
  )
  if (overrides.length === 0) return String(base)
  return `CASE s.position ${overrides
    .map(([pos, o]) => `WHEN '${pos}' THEN ${o![key]}`)
    .join(' ')} ELSE ${base} END`
}

function scoredKeys(rules: ScoringRules): string[] {
  return [
    ...new Set([
      ...Object.keys(rules.scoring),
      ...Object.values(rules.positionOverrides).flatMap((o) => Object.keys(o ?? {}))
    ])
  ].sort()
}

/** One scoring's points for a Sleeper line `s` (with `s.position`), as one SQL expression. */
export function pointsSql(rules: ScoringRules, have: Set<string>): string {
  const terms: string[] = []
  for (const key of scoredKeys(rules)) {
    const value = derivedSql(have, key) ?? col(have, key)
    const points = pointsOf(rules, key)
    if (value !== '0' && points !== '0') terms.push(`${points} * ${value}`)
  }
  return terms.length > 0 ? `round(${terms.join(' + ')}, 2)` : '0'
}

/**
 * Spec §5.2: expected points under the same rules, from ffopportunity's expected stats (`f`):
 * each scoring key with an expected count is scored on it. Bonuses and fumbles have none.
 */
const EXPECTED: Record<string, string> = {
  pass_att: 'f.pass_attempt',
  pass_cmp: 'f.pass_completions_exp',
  pass_inc: '(f.pass_attempt - f.pass_completions_exp)',
  pass_yd: 'f.pass_yards_gained_exp',
  pass_td: 'f.pass_touchdown_exp',
  pass_int: 'f.pass_interception_exp',
  pass_2pt: 'f.pass_two_point_conv_exp',
  pass_fd: 'f.pass_first_down_exp',
  rush_att: 'f.rush_attempt',
  rush_yd: 'f.rush_yards_gained_exp',
  rush_td: 'f.rush_touchdown_exp',
  rush_2pt: 'f.rush_two_point_conv_exp',
  rush_fd: 'f.rush_first_down_exp',
  rec_tgt: 'f.rec_attempt',
  rec: 'f.receptions_exp',
  rec_yd: 'f.rec_yards_gained_exp',
  rec_td: 'f.rec_touchdown_exp',
  rec_2pt: 'f.rec_two_point_conv_exp',
  rec_fd: 'f.rec_first_down_exp',
  bonus_rec_te: "CASE WHEN s.position = 'TE' THEN f.receptions_exp ELSE 0 END",
  bonus_rec_rb: "CASE WHEN s.position = 'RB' THEN f.receptions_exp ELSE 0 END",
  bonus_rec_wr: "CASE WHEN s.position = 'WR' THEN f.receptions_exp ELSE 0 END"
}

export function expectedPointsSql(rules: ScoringRules, ffo?: Set<string>): string {
  const keys = new Set(scoredKeys(rules))
  // A column ffopportunity does not have (yet) adds nothing.
  const known = (value: string): boolean =>
    ffo === undefined || [...value.matchAll(/f\.([a-z0-9_]+)/g)].every((m) => ffo.has(m[1]))
  const terms = Object.entries(EXPECTED)
    .filter(([key, value]) => keys.has(key) && known(value))
    .map(([key, value]) => [pointsOf(rules, key), value])
    .filter(([points]) => points !== '0')
    .map(([points, value]) => `${points} * coalesce(${value}, 0)`)
  return terms.length > 0 ? `round(${terms.join(' + ')}, 2)` : '0'
}

/** Sleeper positions as the scoring rules name them (overrides, `bonus_rec_*`). */
const SLEEPER_POSITION = `CASE
    WHEN sp.position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB') THEN sp.position
    WHEN sp.position IN ('DE', 'DT', 'NT') THEN 'DL'
    WHEN sp.position IN ('ILB', 'OLB', 'MLB') THEN 'LB'
    WHEN sp.position IN ('CB', 'S', 'SS', 'FS') THEN 'DB'
    WHEN sp.position = 'FB' THEN 'RB'
    WHEN sp.position = 'K/P' THEN 'K'
    ELSE sp.position END`

/** The scorings to build: the presets, and the league's rules when a league is imported. */
export function scoringsToBuild(league: ScoringRules | null): [Scoring, ScoringRules][] {
  const presets = Object.entries(SCORING_PRESETS) as [Scoring, ScoringRules][]
  return league ? [...presets, ['league', league]] : presets
}

/**
 * `fantasy_week` (spec §5.2): one row per Sleeper player or defense × week × scoring of one
 * season, with the points and the expected points under that scoring. Weeks are in nflverse's
 * numbering; `gsis_id` links a player to the rest of the database.
 */
export function fantasyWeekSelect(
  have: Have,
  season: number,
  scorings: [Scoring, ScoringRules][]
): Built {
  const lines = [
    ...(have.tables.has('src_sleeper')
      ? [
          `SELECT t.*, ${SLEEPER_POSITION} AS position FROM src_sleeper t
           LEFT JOIN src_sleeper_players sp ON sp.player_id = t.player_id AND sp.season = t.season
           WHERE t.season = ${season}`
        ]
      : []),
    ...(have.tables.has('src_sleeper_def')
      ? [`SELECT *, 'DEF' AS position FROM src_sleeper_def WHERE season = ${season}`]
      : [])
  ]
  const week = postWeek('s.season', 's.season_type', 's.week', 'sleeper')
  const sleeper = new Set([
    ...columnsOf(have, 'src_sleeper'),
    ...columnsOf(have, 'src_sleeper_def')
  ])
  const ffoCols = columnsOf(have, 'src_ff_opportunity')
  const ffo = ffoCols.has('player_id')
    ? 'src_ff_opportunity'
    : '(SELECT NULL::VARCHAR AS player_id, NULL::INTEGER AS season, NULL::VARCHAR AS season_type, NULL::INTEGER AS week)'
  const one = ([id, rules]: [Scoring, ScoringRules]): string =>
    `SELECT s.player_id, i.gsis_id, s.season, s.season_type, ${week} AS week, s.team, s.opponent,
            s.position, '${id}' AS scoring, ${pointsSql(rules, sleeper)} AS points,
            CASE WHEN f.player_id IS NOT NULL THEN ${expectedPointsSql(rules, ffoCols)} END AS xpoints
     FROM s
     LEFT JOIN sleeper_ids i ON i.sleeper_id = s.player_id
     LEFT JOIN ${ffo} f ON f.player_id = i.gsis_id AND f.season = s.season
       AND f.season_type = s.season_type AND f.week = ${week}`
  return {
    sql: `WITH s AS (${lines.join('\nUNION ALL BY NAME\n')})
          ${scorings.map(one).join('\nUNION ALL\n')}`
  }
}

/** Positions whose fantasy points a defense allows (spec §6.2 Teams). */
const ALLOWED: Position[] = ['QB', 'RB', 'WR', 'TE', 'K']

/** `team_fantasy_week`: the points each defense allowed by position and scoring. */
export function teamFantasyWeekSelect(season: number): Built {
  return {
    sql: `SELECT opponent AS team, season, season_type, week, scoring,
                 ${ALLOWED.map((p) => `sum(points) FILTER (position = '${p}') AS fpa_${p.toLowerCase()}`).join(', ')}
          FROM fantasy_week
          WHERE opponent IS NOT NULL AND position <> 'DEF' AND season = ${season}
          GROUP BY ALL`
  }
}
```

- [ ] **Step 9: The rebuild**

Create `src/main/stats/derived/build.ts`:

```ts
import type { ScoringRules } from '@shared/stats/scoring'
import { sqlIdent, type StatsDb } from '../db'
import { STATS_FIRST_SEASON } from '../sources'
import { fantasyWeekSelect, scoringsToBuild, teamFantasyWeekSelect } from './fantasy'
import { playerSeasonSelect, playerWeekSelect } from './player'
import type { Built, Have } from './sql'
import { teamSeasonSelect, teamWeekSelect } from './team'

/** Bump to rebuild every season into new tables after a change to how they are built. */
export const DERIVED_VERSION = 1

/** The derived tables in build order: each reads the ones before it. */
export const DERIVED_TABLES = [
  'team_week',
  'player_week',
  'player_season',
  'team_season',
  'fantasy_week',
  'team_fantasy_week'
] as const
export type DerivedTable = (typeof DERIVED_TABLES)[number]
const FANTASY_TABLES: DerivedTable[] = ['fantasy_week', 'team_fantasy_week']

/** The sources a rebuild can read: tables, views and their columns. */
export async function inspect(db: StatsDb): Promise<Have> {
  const rows = await db.all<{ table_name: string; column_name: string }>(
    "SELECT table_name, column_name FROM duckdb_columns() WHERE schema_name = 'main'"
  )
  const columns = new Map<string, Set<string>>()
  for (const r of rows) {
    const set = columns.get(r.table_name) ?? new Set<string>()
    set.add(r.column_name)
    columns.set(r.table_name, set)
  }
  return { tables: new Set(columns.keys()), columns }
}

async function exists(db: StatsDb, table: string): Promise<boolean> {
  return (
    (await db.get("SELECT 1 FROM duckdb_tables() WHERE schema_name = 'main' AND table_name = ?", [
      table
    ])) !== null
  )
}

/** The derived tables need play-by-play and the schedule; without them there is nothing to build. */
export async function canDerive(db: StatsDb): Promise<boolean> {
  return (await exists(db, 'src_pbp')) && (await exists(db, 'games'))
}

/** The derived tables are missing or were built by an older `DERIVED_VERSION`. */
export async function derivedStale(db: StatsDb): Promise<boolean> {
  const state = await db.get<{ version: number }>(
    "SELECT version FROM derived_state WHERE name = 'derived'"
  )
  return (state?.version ?? 0) < DERIVED_VERSION || !(await exists(db, 'player_week'))
}

export interface RebuildInput {
  /** The seasons whose source rows changed, or every season (tables replaced). */
  seasons: number[] | 'all'
  /** The league's scoring rules, scored as `league` (spec §5.2); null without a league. */
  league: ScoringRules | null
  /** Only the fantasy tables (the league's rules changed). */
  fantasyOnly?: boolean
}

/**
 * Spec §5.2: rebuilds the derived tables for the seasons a sync touched, one season at a time
 * (bounded memory), each season in one transaction (delete its rows, insert them again), so a
 * reader sees a season's old rows or its new ones. `all`, or a new `DERIVED_VERSION`, replaces the
 * tables. Runs on one thread: writing `player_week` (about 230 columns) on two needs more than the
 * 512 MB limit. Returns the rows written per table.
 */
export async function rebuildDerived(
  db: StatsDb,
  input: RebuildInput
): Promise<Record<string, number>> {
  if (!(await canDerive(db))) return {}
  const have = await inspect(db)
  const stale = await derivedStale(db)
  const replace = stale || input.seasons === 'all'
  const known = (
    await db.all<{ season: number }>(
      `SELECT DISTINCT season FROM games WHERE season >= ${STATS_FIRST_SEASON} ORDER BY season`
    )
  ).map((r) => r.season)
  const seasons = replace ? known : known.filter((s) => (input.seasons as number[]).includes(s))
  const sleeper = have.tables.has('src_sleeper') || have.tables.has('src_sleeper_def')
  const tables = DERIVED_TABLES.filter((t) =>
    FANTASY_TABLES.includes(t) ? sleeper : !(input.fantasyOnly ?? false) || stale
  )
  const build: Record<DerivedTable, (season: number) => Built> = {
    team_week: (s) => teamWeekSelect(have, s),
    player_week: (s) => playerWeekSelect(have, s),
    player_season: (s) => playerSeasonSelect(have, s),
    team_season: (s) => teamSeasonSelect(s),
    fantasy_week: (s) => fantasyWeekSelect(have, s, scoringsToBuild(input.league)),
    team_fantasy_week: (s) => teamFantasyWeekSelect(s)
  }
  const written: Record<string, number> = {}
  const replaced = new Set<DerivedTable>()
  const threads = await db.get<{ t: string }>("SELECT current_setting('threads')::VARCHAR AS t")
  await db.exec('SET threads = 1')
  try {
    for (const season of seasons) {
      await db.transaction(async () => {
        for (const table of tables) {
          const built = build[table](season)
          for (const [temp, sql] of built.temps ?? []) {
            await db.exec(`CREATE OR REPLACE TEMP TABLE ${sqlIdent(temp)} AS ${sql}`)
          }
          if ((replace && !replaced.has(table)) || !(await exists(db, table))) {
            await db.exec(`CREATE OR REPLACE TABLE ${sqlIdent(table)} AS ${built.sql}`)
            replaced.add(table)
          } else {
            await db.exec(`DELETE FROM ${sqlIdent(table)} WHERE season = ${season}`)
            await db.exec(`INSERT INTO ${sqlIdent(table)} BY NAME ${built.sql}`)
          }
          for (const [temp] of built.temps ?? []) await db.exec(`DROP TABLE ${sqlIdent(temp)}`)
          const n = await db.get<{ n: number }>(
            `SELECT count(*) AS n FROM ${sqlIdent(table)} WHERE season = ${season}`
          )
          written[table] = (written[table] ?? 0) + (n?.n ?? 0)
        }
      })
    }
  } finally {
    await db.exec(`SET threads = ${Number(threads?.t ?? 2)}`)
  }
  if (stale) {
    await db.exec(`INSERT OR REPLACE INTO derived_state VALUES ('derived', ${DERIVED_VERSION})`)
  }
  return written
}
```

- [ ] **Step 10: Run the tests**

```bash
npx vitest run tests/main/stats/derived tests/main/stats/schema.test.ts
```

Expected: PASS (15 passed).

- [ ] **Step 11: Verify and commit**

```bash
npx prettier --write src/shared/stats/scoring.ts src/main/stats/schema.ts src/main/stats/derived tests/fixtures/statsDerived.ts tests/main/stats/derived
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
git add src/shared/stats/scoring.ts src/main/stats/schema.ts src/main/stats/derived tests/fixtures/statsDerived.ts tests/main/stats/derived
git commit -m "feat(stats): derived player, team, fantasy tables"
```

Expected: clean; 813 passed | 5 skipped.

---

### Task 3: The metric catalogue and the query type (spec §6, §7.1, §10; amendments D, F)

**Files:**

- Create: `src/shared/stats/types.ts`, `src/shared/stats/catalogue.ts`, `src/shared/stats/querySchema.ts`, `src/main/stats/engine/registry.ts`
- Test: `tests/shared/stats/catalogue.test.ts`

**Interfaces:**

- Produces (`types.ts`):
  - Catalogue: `MetricFamily`, `MetricTier`, `Grain`, `Entity`, `POSITION_GROUPS`, `PositionGroup`, `MetricUnit`, `MetricDef`, `MetricInfo`.
  - Query: `GroupBy`, `Transform`, `StatsQuery`.
  - Result: `MetricValue`, `StatsRow`, `StatsResultColumn`, `StatsResult`, `StatsStatus`.
- Produces (`catalogue.ts`): `CATALOGUE`, `METRICS` (by id), `componentsOf(def)`.
- Produces (`querySchema.ts`): `statsQuerySchema(metricIds)`.
- Produces (`registry.ts`): `PLAYER_FANTASY`, `TEAM_FANTASY`, `COMPONENTS`, `grainsOf(def)`, `catalogueInfo()`.

- [ ] **Step 1: Write the failing test**

Create `tests/shared/stats/catalogue.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { grainsOf } from '@main/stats/engine/registry'
import { CATALOGUE, componentsOf } from '@shared/stats/catalogue'
import { statsQuerySchema } from '@shared/stats/querySchema'
import { POSITION_GROUPS } from '@shared/stats/types'

describe('the metric catalogue (stats-analysis spec §6)', () => {
  it('has unique ids, for players and teams', () => {
    const ids = CATALOGUE.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(CATALOGUE.filter((m) => m.entity === 'player').length).toBeGreaterThan(150)
    expect(CATALOGUE.filter((m) => m.entity === 'team').length).toBeGreaterThan(60)
  })

  it('computes every metric from components the derived tables hold', () => {
    const missing = CATALOGUE.filter((m) => !grainsOf(m).includes('season')).map((m) => m.id)
    expect(missing).toEqual([])
  })

  it('splits by situation exactly the metrics that come from plays', () => {
    const play = (id: string): boolean =>
      grainsOf(CATALOGUE.find((m) => m.id === id)!).includes('play')
    expect(
      ['qb_epa_db', 'yprr', 'target_share', 'sacks', 'off_epa_play', 'def_man_epa'].map(play)
    ).toEqual([true, true, false, true, true, true])
    expect(['separation', 'qbr', 'fantasy_points', 'pressures', 'win_pct'].some(play)).toBe(false)
  })

  it('describes every metric for a person and an LLM', () => {
    for (const m of CATALOGUE) {
      expect(m.description, m.id).toMatch(/^[A-Z].+[.)]$/)
      expect(m.label.length, m.id).toBeGreaterThan(1)
      expect(m.short.length, m.id).toBeLessThanOrEqual(14)
      expect(componentsOf(m), m.id).toContain(m.sample)
      if (m.entity === 'team') expect(m.side, m.id).toBeDefined()
      if (m.positions !== 'all') {
        for (const p of m.positions) expect(POSITION_GROUPS, m.id).toContain(p)
      }
      if (m.kind === 'rate' && m.sample !== 'games' && m.entity === 'player') {
        expect(m.minSample, m.id).toBeGreaterThan(0)
      }
    }
  })

  it('lists its ids as the metric enum of the query schema (spec §10)', () => {
    const schema = statsQuerySchema(CATALOGUE.map((m) => m.id)) as {
      required: string[]
      properties: Record<
        string,
        { items?: { enum: string[] }; properties?: Record<string, unknown> }
      >
    }
    expect(schema.required).toEqual(['entity', 'metrics', 'scope'])
    expect(schema.properties.metrics.items?.enum).toHaveLength(CATALOGUE.length)
    expect(Object.keys(schema.properties.situation.properties ?? {})).toContain('withOnField')
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/shared/stats
```

Expected: FAIL: `@shared/stats/catalogue` does not exist.

- [ ] **Step 3: The types**

Create `src/shared/stats/types.ts`:

```ts
import type { Scoring } from './scoring'

/** Stats-analysis spec §6.1: a badge and a filter, not a tab. */
export type MetricFamily = 'traditional' | 'advanced' | 'ngs' | 'charting' | 'predictive'
/** `core` shown by default, `extended` in its tab and the column picker, `stored` in queries only. */
export type MetricTier = 'core' | 'extended' | 'stored'
export type Grain = 'play' | 'week' | 'season'
export type Entity = 'player' | 'team'

/** Position groups, as nflverse rosters list them (`player_week.position`). */
export const POSITION_GROUPS = ['QB', 'RB', 'WR', 'TE', 'K', 'P', 'DL', 'LB', 'DB', 'OL'] as const
export type PositionGroup = (typeof POSITION_GROUPS)[number]

/**
 * How a value reads: `pct` is a fraction (0.35 = 35 %), `pp` percentage points (CPOE 3.1), `epa`
 * expected points, `rating` an index (passer rating, QBR).
 */
export type MetricUnit =
  'count' | 'number' | 'pct' | 'pp' | 'yards' | 'epa' | 'points' | 'seconds' | 'rating'

/**
 * One catalogue entry (spec §6.1). `value` is SQL over component sums: each `{name}` is the sum of
 * that component over the rows in scope (a column of `player_week` / `team_week`, or `fp` / `xfp`
 * / `fpa_*` under the chosen scoring). `sample` names the component that measures the sample and
 * qualifies a row (`minSample` per 17 games). Descriptions are written for a person and for an
 * LLM (spec §10).
 */
export interface MetricDef {
  id: string
  label: string
  short: string
  description: string
  family: MetricFamily
  entity: Entity
  /** Team metrics: the unit it measures. */
  side?: 'offense' | 'defense' | 'special'
  /** Player metrics: where it applies. */
  positions: PositionGroup[] | 'all'
  value: string
  sample: string
  /** A `count` can be shown per game; a `rate` already is per play or per game. */
  kind: 'count' | 'rate'
  unit: MetricUnit
  decimals: number
  direction: 'higher' | 'lower' | 'neutral'
  /** The sample a row needs to be qualified over 17 games, scaled to the weeks in scope. */
  minSample?: number
  sources: string[]
  firstSeason: number
  /** `prior`: published through the prior season only (participation). */
  lastSeason?: 'prior'
  /** A component counting estimated weeks (routes in the current season): any makes it "est.". */
  estimatedBy?: string
  tier: MetricTier
  /** Depends on the scoring picker (fantasy points). */
  scoring?: boolean
}

/** A catalogue entry as the engine serves it: the formula left out, where it can be computed added. */
export interface MetricInfo extends Omit<MetricDef, 'value' | 'sample'> {
  grains: Grain[]
}

export type GroupBy =
  | 'season'
  | 'week'
  | 'team'
  | 'opponent'
  | 'down'
  | 'quarter'
  | 'personnel'
  | 'coverage'
  | 'formation'

/** `shrunk` and `opponentAdjusted` (spec §7.1) arrive with the models of Plan Z. */
export type Transform = 'raw' | 'perGame' | 'percentile' | 'zScore' | 'vsLeague'

/** Stats-analysis spec §7.1: every leaderboard, card, chart and comparison is one of these. */
export interface StatsQuery {
  entity: Entity
  /** Catalogue ids, at most 40. */
  metrics: string[]
  scope: {
    seasons: number[]
    /** Default `REG`. */
    seasonType?: 'REG' | 'POST' | 'ALL'
    weeks?: [number, number]
    lastNGames?: number
    positions?: PositionGroup[]
    teams?: string[]
    opponents?: string[]
    /** gsis ids */
    players?: string[]
    qualifiedOnly?: boolean
  }
  /** Play-grain filters: only metrics computed from plays accept them. */
  situation?: {
    down?: number[]
    distance?: [number, number]
    quarter?: number[]
    fieldZone?: 'redzone' | 'inside10' | 'inside5' | 'own20'
    scoreMargin?: [number, number]
    winProbability?: [number, number]
    neutral?: boolean
    pressure?: boolean
    blitz?: boolean
    playAction?: boolean
    /** `man` / `zone`, or nflverse coverage types (`COVER_3`, …). */
    coverage?: 'man' | 'zone' | string[]
    formation?: string[]
    /** Personnel codes: "11" = 1 RB, 1 TE. */
    personnel?: string[]
    box?: [number, number]
    airYards?: [number, number]
    withOnField?: string[]
    withoutOnField?: string[]
  }
  groupBy?: GroupBy[]
  transform?: Transform
  /** Default: the first metric, best first. */
  sort?: { metric: string; dir: 'asc' | 'desc' }
  /** Default 100, at most 1000. */
  limit?: number
  /** The scoring of fantasy metrics; `ppr` by default. */
  scoring?: Scoring
}

export interface MetricValue {
  /** After the transform. */
  value: number | null
  raw: number | null
  sample: number | null
  qualified: boolean
  /** 0–100 among the qualified rows of the same position (players) and group; null otherwise. */
  percentile: number | null
  rank: number | null
  estimated: boolean
}

export interface StatsRow {
  /** gsis id or team code */
  id: string
  name: string
  team: string | null
  position: string | null
  /** The `groupBy` values. */
  group: Partial<Record<GroupBy, string | number | null>>
  games: number
  values: Record<string, MetricValue>
}

export interface StatsResultColumn {
  id: string
  label: string
  short: string
  unit: MetricUnit
  decimals: number
  direction: MetricDef['direction']
  /** The seasons in scope this metric has data for. */
  seasons: number[]
}

export interface StatsResult {
  grain: Grain
  columns: StatsResultColumn[]
  rows: StatsRow[]
  /** Rows before `limit`. */
  total: number
  /** Caveats a screen (or an answer) should state: coverage, estimates. */
  notes: string[]
  ms: number
}

/** "Data through week N, updated <time>" (spec §5.3). */
export interface StatsStatus {
  /** The stats worker runs (DuckDB loaded). */
  available: boolean
  /** The latest week with plays. */
  through: { season: number; seasonType: 'REG' | 'POST'; week: number } | null
  /** The last step that wrote rows, ISO time. */
  updatedAt: string | null
  /** A refresh or a rebuild is running. */
  busy: boolean
}
```

- [ ] **Step 4: The catalogue**

Create `src/shared/stats/catalogue.ts`:

```ts
import type { MetricDef, PositionGroup } from './types'

/**
 * The metric catalogue (stats-analysis spec §6): every metric the engine computes, its formula over
 * component sums, and the words a screen (or an LLM, spec §10) needs to read it. The models (Elo,
 * adjusted EPA, FG over expected, stability, shrinkage, RAS) arrive with Plan Z.
 */

type Opts = Partial<Omit<MetricDef, 'id' | 'label' | 'short' | 'description'>> &
  Pick<MetricDef, 'value' | 'sample'>

const QB: PositionGroup[] = ['QB']
const SKILL: PositionGroup[] = ['QB', 'RB', 'WR', 'TE']
const RB: PositionGroup[] = ['RB']
const RECEIVERS: PositionGroup[] = ['RB', 'WR', 'TE']
const PASS_CATCHERS: PositionGroup[] = ['WR', 'TE']
const DEFENDERS: PositionGroup[] = ['DL', 'LB', 'DB']
const COVERAGE: PositionGroup[] = ['LB', 'DB']
const FRONT: PositionGroup[] = ['DL', 'LB']
const K: PositionGroup[] = ['K']
const P: PositionGroup[] = ['P']

/** `{a} / {b}`, NULL when the denominator is 0 (DuckDB divides by 0 to Infinity). */
const ratio = (a: string, b: string): string => `{${a}} / nullif({${b}}, 0)`

/** The NFL passer rating over four components (attempts, completions, yards, TDs, INTs). */
function rating(att: string, cmp: string, yds: string, td: string, int: string): string {
  const per = (c: string): string => `{${c}} / nullif({${att}}, 0)`
  const clamp = (x: string): string => `greatest(0, least(2.375, ${x}))`
  return `100 / 6 * (${clamp(`(${per(cmp)} - 0.3) * 5`)} + ${clamp(`(${per(yds)} - 3) * 0.25`)} + ${clamp(`${per(td)} * 20`)} + ${clamp(`2.375 - ${per(int)} * 25`)})`
}

function metric(id: string, label: string, short: string, description: string, o: Opts): MetricDef {
  return {
    id,
    label,
    short,
    description,
    family: 'traditional',
    entity: 'player',
    positions: 'all',
    kind: 'rate',
    unit: 'number',
    decimals: 1,
    direction: 'higher',
    sources: PBP,
    firstSeason: 2019,
    tier: 'extended',
    ...o
  }
}

/** A counting stat: summed, can be shown per game; its sample is games. */
const count = (c: string, o: Partial<Opts> = {}): Opts => ({
  value: `{${c}}`,
  sample: 'games',
  kind: 'count',
  unit: 'count',
  decimals: 0,
  ...o
})

const PBP = ['nflverse play-by-play']
const BOX = ['nflverse player stats']
const NGS = ['NFL Next Gen Stats (nflverse)']
const PFR = ['Pro Football Reference advanced stats (nflverse)']
const FTN = ['FTN charting (nflverse)']
const PART = ['NFL participation (nflverse)']
const SNAPS = ['nflverse snap counts']
const FFO = ['ffverse ffopportunity']
const SLEEPER = ['Sleeper weekly stats']
const LINES = ['nflverse schedules (betting lines)']

const ROUTES_NOTE =
  'Routes are dropbacks the player was on the field for (blocking snaps count). In the current season, before participation is published, they are estimated as team dropbacks × his offensive snap share.'

const PASSING: MetricDef[] = [
  metric(
    'pass_att',
    'Pass attempts',
    'Att',
    'Passes thrown; sacks and spikes are not attempts here.',
    count('pass_att', { positions: QB, tier: 'core' })
  ),
  metric(
    'pass_cmp',
    'Completions',
    'Cmp',
    'Completed passes.',
    count('pass_cmp', { positions: QB })
  ),
  metric('pass_cmp_pct', 'Completion %', 'Cmp%', 'Completions per attempt.', {
    value: ratio('pass_cmp', 'pass_att'),
    sample: 'pass_att',
    unit: 'pct',
    positions: QB,
    minSample: 200
  }),
  metric(
    'pass_yds',
    'Passing yards',
    'Pass Yds',
    'Yards gained on completions; sack yardage not subtracted.',
    count('pass_yds', { positions: QB, tier: 'core' })
  ),
  metric(
    'pass_td',
    'Passing TDs',
    'Pass TD',
    'Touchdown passes.',
    count('pass_td', { positions: QB, tier: 'core' })
  ),
  metric(
    'pass_int',
    'Interceptions',
    'INT',
    'Passes intercepted.',
    count('pass_int', { positions: QB, direction: 'lower', tier: 'core' })
  ),
  metric('pass_ypa', 'Yards per attempt', 'Y/A', 'Passing yards per attempt.', {
    value: ratio('pass_yds', 'pass_att'),
    sample: 'pass_att',
    unit: 'yards',
    positions: QB,
    minSample: 200
  }),
  metric(
    'pass_nya',
    'Net yards per attempt',
    'NY/A',
    'Passing yards minus sack yards, per attempt or sack.',
    {
      value: '({pass_yds} - {sack_yds_lost}) / nullif({pass_att} + {sacks_taken}, 0)',
      sample: 'pass_att',
      unit: 'yards',
      decimals: 2,
      positions: QB,
      minSample: 200
    }
  ),
  metric(
    'pass_anya',
    'Adjusted net yards per attempt',
    'ANY/A',
    'Net yards per attempt with 20 yards added per touchdown and 45 taken off per interception. One of the most predictive box-score passing stats.',
    {
      value:
        '({pass_yds} - {sack_yds_lost} + 20 * {pass_td} - 45 * {pass_int}) / nullif({pass_att} + {sacks_taken}, 0)',
      sample: 'pass_att',
      unit: 'yards',
      decimals: 2,
      positions: QB,
      minSample: 200,
      tier: 'core'
    }
  ),
  metric(
    'passer_rating',
    'Passer rating',
    'Rate',
    'The NFL passer rating (0–158.3) from completion %, yards, touchdowns and interceptions per attempt.',
    {
      value: rating('pass_att', 'pass_cmp', 'pass_yds', 'pass_td', 'pass_int'),
      sample: 'pass_att',
      unit: 'rating',
      positions: QB,
      minSample: 200
    }
  ),
  metric(
    'pass_td_rate',
    'Touchdown rate',
    'TD%',
    'Touchdown passes per attempt. Swings a lot from year to year.',
    {
      value: ratio('pass_td', 'pass_att'),
      sample: 'pass_att',
      unit: 'pct',
      positions: QB,
      minSample: 200
    }
  ),
  metric('pass_int_rate', 'Interception rate', 'INT%', 'Interceptions per attempt.', {
    value: ratio('pass_int', 'pass_att'),
    sample: 'pass_att',
    unit: 'pct',
    direction: 'lower',
    positions: QB,
    minSample: 200
  }),
  metric(
    'sacks_taken',
    'Sacks taken',
    'Sk',
    'Times sacked.',
    count('sacks_taken', { positions: QB, direction: 'lower' })
  ),
  metric(
    'sack_rate',
    'Sack rate',
    'Sk%',
    'Sacks per dropback: partly the quarterback, partly the line.',
    {
      value: ratio('sacks_taken', 'dropbacks'),
      sample: 'dropbacks',
      unit: 'pct',
      direction: 'lower',
      positions: QB,
      minSample: 200
    }
  ),
  metric(
    'qb_epa_db',
    'EPA per dropback',
    'EPA/db',
    'Expected points added per dropback, scrambles and sacks included: how much each pass play changed the expected score. The best single measure of passing efficiency.',
    {
      value: ratio('db_epa', 'dropbacks'),
      sample: 'dropbacks',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      positions: QB,
      minSample: 200,
      tier: 'core'
    }
  ),
  metric('qb_success', 'Success rate', 'Succ%', 'Share of dropbacks with positive EPA.', {
    value: ratio('db_success', 'dropbacks'),
    sample: 'dropbacks',
    unit: 'pct',
    family: 'advanced',
    positions: QB,
    minSample: 200,
    tier: 'core'
  }),
  metric(
    'cpoe',
    'Completion % over expected',
    'CPOE',
    'Completion rate above what the throws’ difficulty predicts (nflfastR’s completion model), in percentage points: accuracy beyond the easy throws.',
    {
      value: ratio('cpoe_sum', 'cpoe_n'),
      sample: 'cpoe_n',
      unit: 'pp',
      family: 'advanced',
      positions: QB,
      minSample: 200,
      tier: 'core'
    }
  ),
  metric(
    'xcmp_pct',
    'Expected completion %',
    'xCmp%',
    'The completion rate nflfastR’s model expects from these throws: lower means harder throws.',
    {
      value: ratio('xcmp_sum', 'cpoe_n'),
      sample: 'cpoe_n',
      unit: 'pct',
      family: 'advanced',
      direction: 'neutral',
      positions: QB,
      minSample: 200
    }
  ),
  metric(
    'qbr',
    'ESPN QBR',
    'QBR',
    'ESPN’s Total QBR (0–100): EPA per play adjusted for opponent and context. Whole seasons are ESPN’s season figure; week ranges are play-weighted game QBRs.',
    {
      value: ratio('qbr_sum', 'qbr_plays'),
      sample: 'qbr_plays',
      unit: 'rating',
      family: 'advanced',
      positions: QB,
      minSample: 200,
      sources: ['ESPN QBR (nflverse)'],
      tier: 'core'
    }
  ),
  metric(
    'time_to_throw',
    'Time to throw',
    'TTT',
    'Average seconds from snap to throw (Next Gen Stats). Neither good nor bad on its own.',
    {
      value: ratio('ngs_ttt_sum', 'ngs_pass_att'),
      sample: 'ngs_pass_att',
      unit: 'seconds',
      decimals: 2,
      family: 'ngs',
      direction: 'neutral',
      positions: QB,
      minSample: 200,
      sources: NGS,
      tier: 'core'
    }
  ),
  metric(
    'aggressiveness',
    'Aggressiveness',
    'Aggr%',
    'Share of throws into tight windows, a defender within a yard (Next Gen Stats).',
    {
      value: `${ratio('ngs_aggr_sum', 'ngs_pass_att')} / 100`,
      sample: 'ngs_pass_att',
      unit: 'pct',
      family: 'ngs',
      direction: 'neutral',
      positions: QB,
      minSample: 200,
      sources: NGS
    }
  ),
  metric(
    'pass_adot',
    'Average depth of target',
    'aDOT',
    'Air yards per attempt: how far downfield the passes travel.',
    {
      value: ratio('pass_air_yds', 'pass_att'),
      sample: 'pass_att',
      unit: 'yards',
      family: 'advanced',
      direction: 'neutral',
      positions: QB,
      minSample: 200,
      tier: 'core'
    }
  ),
  metric(
    'air_to_sticks',
    'Air yards to the sticks',
    'AYTS',
    'Average air yards beyond the first-down marker; negative means short of it.',
    {
      value: ratio('pass_air_to_sticks', 'pass_air_n'),
      sample: 'pass_air_n',
      unit: 'yards',
      family: 'advanced',
      direction: 'neutral',
      positions: QB,
      minSample: 200
    }
  ),
  metric('deep_rate', 'Deep attempt rate', 'Deep%', 'Share of attempts thrown 20+ air yards.', {
    value: ratio('deep_att', 'pass_att'),
    sample: 'pass_att',
    unit: 'pct',
    family: 'advanced',
    direction: 'neutral',
    positions: QB,
    minSample: 200
  }),
  metric('deep_epa', 'EPA per deep attempt', 'Deep EPA', 'EPA per attempt of 20+ air yards.', {
    value: ratio('deep_epa', 'deep_att'),
    sample: 'deep_att',
    unit: 'epa',
    decimals: 3,
    family: 'advanced',
    positions: QB,
    minSample: 40
  }),
  metric(
    'bad_throw_pct',
    'Bad-throw %',
    'Bad%',
    'Share of attempts Pro Football Reference charts as poorly thrown.',
    {
      value: ratio('pfr_bad_throws', 'pass_att'),
      sample: 'pass_att',
      unit: 'pct',
      family: 'charting',
      direction: 'lower',
      positions: QB,
      minSample: 200,
      sources: PFR
    }
  ),
  metric(
    'int_worthy_rate',
    'Interception-worthy rate',
    'IWP%',
    'Share of attempts FTN charts as interception-worthy, caught or not: steadier than interceptions.',
    {
      value: ratio('int_worthy', 'ftn_att'),
      sample: 'ftn_att',
      unit: 'pct',
      family: 'charting',
      direction: 'lower',
      positions: QB,
      minSample: 200,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'qb_pressured_pct',
    'Pressured %',
    'Prss%',
    'Share of dropbacks under pressure (participation, through the prior season).',
    {
      value: ratio('db_pressured', 'db_pressure_known'),
      sample: 'db_pressure_known',
      unit: 'pct',
      family: 'advanced',
      direction: 'lower',
      positions: QB,
      minSample: 200,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'qb_pressure_pfr',
    'Pressure rate (PFR)',
    'PFR Prss%',
    'Times pressured per dropback as Pro Football Reference charts it; published for the current season too.',
    {
      value: ratio('pfr_times_pressured', 'dropbacks'),
      sample: 'dropbacks',
      unit: 'pct',
      family: 'charting',
      direction: 'lower',
      positions: QB,
      minSample: 200,
      sources: PFR
    }
  ),
  metric(
    'p2s_rate',
    'Pressure-to-sack rate',
    'P2S%',
    'Share of pressured dropbacks that end in a sack: largely on the quarterback, and fairly stable.',
    {
      value: ratio('db_pressured_sacks', 'db_pressured'),
      sample: 'db_pressured',
      unit: 'pct',
      family: 'advanced',
      direction: 'lower',
      positions: QB,
      minSample: 60,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric('pressured_epa', 'EPA when pressured', 'Prss EPA', 'EPA per dropback under pressure.', {
    value: ratio('db_pressured_epa', 'db_pressured'),
    sample: 'db_pressured',
    unit: 'epa',
    decimals: 3,
    family: 'advanced',
    positions: QB,
    minSample: 60,
    sources: PART,
    lastSeason: 'prior'
  }),
  metric(
    'clean_epa',
    'EPA from a clean pocket',
    'Clean EPA',
    'EPA per dropback without pressure.',
    {
      value: '{db_clean_epa} / nullif({db_pressure_known} - {db_pressured}, 0)',
      sample: 'db_pressure_known',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      positions: QB,
      minSample: 200,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'play_action_rate',
    'Play-action rate',
    'PA%',
    'Share of dropbacks with a play-action fake (FTN, 2022+).',
    {
      value: ratio('db_play_action', 'db_ftn'),
      sample: 'db_ftn',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      positions: QB,
      minSample: 200,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'play_action_epa',
    'Play-action EPA',
    'PA EPA',
    'EPA per play-action dropback (FTN, 2022+).',
    {
      value: ratio('db_pa_epa', 'db_play_action'),
      sample: 'db_play_action',
      unit: 'epa',
      decimals: 3,
      family: 'charting',
      positions: QB,
      minSample: 50,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'blitz_epa',
    'EPA vs the blitz',
    'Blitz EPA',
    'EPA per dropback against a blitz (FTN blitzers, 2022+).',
    {
      value: ratio('db_blitz_epa', 'db_blitzed'),
      sample: 'db_blitzed',
      unit: 'epa',
      decimals: 3,
      family: 'charting',
      positions: QB,
      minSample: 50,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'scrambles',
    'Scrambles',
    'Scr',
    'Dropbacks that turned into runs.',
    count('scrambles', { positions: QB })
  ),
  metric(
    'scramble_yds',
    'Scramble yards',
    'Scr Yds',
    'Rushing yards on scrambles.',
    count('scramble_yds', { positions: QB })
  ),
  metric(
    'designed_runs',
    'Designed runs',
    'Des Runs',
    'Carries that were called runs (scrambles and kneels excluded).',
    count('designed_runs', { positions: SKILL })
  ),
  metric(
    'pass_fd',
    'Passing first downs',
    'Pass 1D',
    'Completions that gained a first down.',
    count('pass_fd', { positions: QB, tier: 'stored' })
  ),
  metric(
    'pass_wpa',
    'Passing WPA',
    'Pass WPA',
    'Win probability added on pass plays, summed.',
    count('pass_wpa', {
      positions: QB,
      unit: 'pct',
      decimals: 2,
      family: 'advanced',
      tier: 'stored'
    })
  ),
  metric('throwaway_rate', 'Throwaway rate', 'TA%', 'Share of attempts thrown away (FTN, 2022+).', {
    value: ratio('throwaways', 'ftn_att'),
    sample: 'ftn_att',
    unit: 'pct',
    family: 'charting',
    direction: 'neutral',
    positions: QB,
    minSample: 200,
    sources: FTN,
    firstSeason: 2022,
    tier: 'stored'
  }),
  metric(
    'out_of_pocket_rate',
    'Out-of-pocket rate',
    'OOP%',
    'Share of dropbacks where the quarterback left the pocket (FTN, 2022+).',
    {
      value: ratio('db_out_of_pocket', 'db_ftn'),
      sample: 'db_ftn',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      positions: QB,
      minSample: 200,
      sources: FTN,
      firstSeason: 2022,
      tier: 'stored'
    }
  )
]

const RUSHING: MetricDef[] = [
  metric(
    'carries',
    'Carries',
    'Car',
    'Rushing attempts, scrambles and kneels included (as nflverse counts them).',
    count('carries', { positions: SKILL, tier: 'core' })
  ),
  metric(
    'rush_yds',
    'Rushing yards',
    'Rush Yds',
    'Yards gained on carries.',
    count('rush_yds', { positions: SKILL, tier: 'core' })
  ),
  metric(
    'rush_td',
    'Rushing TDs',
    'Rush TD',
    'Rushing touchdowns.',
    count('rush_td', { positions: SKILL, tier: 'core' })
  ),
  metric('rush_ypc', 'Yards per carry', 'YPC', 'Rushing yards per carry.', {
    value: ratio('rush_yds', 'carries'),
    sample: 'carries',
    unit: 'yards',
    positions: SKILL,
    minSample: 100,
    tier: 'core'
  }),
  metric(
    'rush_fd',
    'Rushing first downs',
    'Rush 1D',
    'Carries that gained a first down.',
    count('rush_fd', { positions: SKILL, tier: 'stored' })
  ),
  metric('rush_epa', 'EPA per carry', 'Rush EPA', 'Expected points added per carry.', {
    value: ratio('rush_epa', 'carries'),
    sample: 'carries',
    unit: 'epa',
    decimals: 3,
    family: 'advanced',
    positions: SKILL,
    minSample: 100
  }),
  metric(
    'rush_success',
    'Rushing success rate',
    'Rush Succ%',
    'Share of carries with positive EPA.',
    {
      value: ratio('rush_success', 'carries'),
      sample: 'carries',
      unit: 'pct',
      family: 'advanced',
      positions: SKILL,
      minSample: 100
    }
  ),
  metric(
    'explosive_run_rate',
    'Explosive-run rate',
    '10+%',
    'Share of carries gaining 10+ yards.',
    {
      value: ratio('rush_10p', 'carries'),
      sample: 'carries',
      unit: 'pct',
      family: 'advanced',
      positions: SKILL,
      minSample: 100
    }
  ),
  metric(
    'breakaway_pct',
    'Breakaway %',
    'Brkwy%',
    'Share of rushing yards gained on runs of 15+ yards: how much a back depends on big runs.',
    {
      value: ratio('rush_15p_yds', 'rush_yds'),
      sample: 'carries',
      unit: 'pct',
      family: 'advanced',
      direction: 'neutral',
      positions: SKILL,
      minSample: 100
    }
  ),
  metric('stuff_rate', 'Stuff rate', 'Stuff%', 'Share of carries stopped at or behind the line.', {
    value: ratio('rush_stuffed', 'carries'),
    sample: 'carries',
    unit: 'pct',
    family: 'advanced',
    direction: 'lower',
    positions: SKILL,
    minSample: 100
  }),
  metric(
    'rz_carries',
    'Red-zone carries',
    'RZ Car',
    'Carries inside the opponent’s 20.',
    count('rz_carries', { positions: SKILL })
  ),
  metric(
    'i10_carries',
    'Carries inside the 10',
    'i10 Car',
    'Carries inside the opponent’s 10: the most valuable touches in fantasy.',
    count('i10_carries', { positions: SKILL })
  ),
  metric(
    'i5_carries',
    'Carries inside the 5',
    'i5 Car',
    'Carries inside the opponent’s 5.',
    count('i5_carries', { positions: SKILL })
  ),
  metric(
    'ryoe',
    'Rush yards over expected',
    'RYOE',
    'Rushing yards above what Next Gen Stats expects from the blockers’ and defenders’ positions at the handoff: credits the runner, not the line.',
    count('ngs_ryoe', { family: 'ngs', positions: RB, sources: NGS, tier: 'core' })
  ),
  metric(
    'ryoe_att',
    'RYOE per attempt',
    'RYOE/att',
    'Rush yards over expected per carry (Next Gen Stats).',
    {
      value: ratio('ngs_ryoe', 'ngs_rush_att'),
      sample: 'ngs_rush_att',
      unit: 'yards',
      decimals: 2,
      family: 'ngs',
      positions: RB,
      minSample: 100,
      sources: NGS,
      tier: 'core'
    }
  ),
  metric(
    'rush_pct_over_expected',
    'Rush % over expected',
    'ROE%',
    'Share of carries that beat their expected yards (Next Gen Stats), in percentage points.',
    {
      value: ratio('ngs_roe_sum', 'ngs_rush_att'),
      sample: 'ngs_rush_att',
      unit: 'pp',
      family: 'ngs',
      positions: RB,
      minSample: 100,
      sources: NGS
    }
  ),
  metric(
    'box8_rate',
    '8+ defenders in the box',
    '8+ Box%',
    'Share of carries against eight or more defenders in the box (Next Gen Stats).',
    {
      value: `${ratio('ngs_box8_sum', 'ngs_rush_att')} / 100`,
      sample: 'ngs_rush_att',
      unit: 'pct',
      family: 'ngs',
      direction: 'neutral',
      positions: RB,
      minSample: 100,
      sources: NGS
    }
  ),
  metric(
    'ybc_att',
    'Yards before contact per carry',
    'YBC/att',
    'Yards gained before first contact (Pro Football Reference): mostly the blocking.',
    {
      value: ratio('pfr_ybc', 'pfr_carries'),
      sample: 'pfr_carries',
      unit: 'yards',
      decimals: 2,
      family: 'charting',
      positions: RB,
      minSample: 100,
      sources: PFR
    }
  ),
  metric(
    'yac_att',
    'Yards after contact per carry',
    'YACon/att',
    'Yards gained after first contact (Pro Football Reference): mostly the runner.',
    {
      value: ratio('pfr_yac', 'pfr_carries'),
      sample: 'pfr_carries',
      unit: 'yards',
      decimals: 2,
      family: 'charting',
      positions: RB,
      minSample: 100,
      sources: PFR
    }
  ),
  metric(
    'broken_tackles_touch',
    'Broken tackles per touch',
    'BTkl/Tch',
    'Broken tackles, rushing and receiving, per carry or catch (Pro Football Reference).',
    {
      value: '({pfr_rush_btkl} + {pfr_rec_btkl}) / nullif({carries} + {receptions}, 0)',
      sample: 'carries',
      unit: 'number',
      decimals: 3,
      family: 'charting',
      positions: RECEIVERS,
      minSample: 100,
      sources: PFR
    }
  ),
  metric(
    'box8_rate_part',
    '8+ box rate (charted)',
    '8+ Box% (ch)',
    'Share of carries against eight or more in the box, from participation (through the prior season) or FTN box counts (2022+).',
    {
      value: ratio('box8_carries', 'box_known'),
      sample: 'box_known',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      positions: RB,
      minSample: 100,
      sources: [...PART, ...FTN],
      tier: 'stored'
    }
  )
]

const RECEIVING: MetricDef[] = [
  metric(
    'targets',
    'Targets',
    'Tgt',
    'Passes thrown to the player.',
    count('targets', { positions: RECEIVERS, tier: 'core' })
  ),
  metric(
    'receptions',
    'Receptions',
    'Rec',
    'Passes caught.',
    count('receptions', { positions: RECEIVERS, tier: 'core' })
  ),
  metric(
    'rec_yds',
    'Receiving yards',
    'Rec Yds',
    'Yards gained on catches.',
    count('rec_yds', { positions: RECEIVERS, tier: 'core' })
  ),
  metric(
    'rec_td',
    'Receiving TDs',
    'Rec TD',
    'Touchdown catches.',
    count('rec_td', { positions: RECEIVERS, tier: 'core' })
  ),
  metric(
    'catch_rate',
    'Catch rate',
    'Ctch%',
    'Receptions per target; depends heavily on target depth.',
    {
      value: ratio('receptions', 'targets'),
      sample: 'targets',
      unit: 'pct',
      positions: RECEIVERS,
      minSample: 50
    }
  ),
  metric('rec_ypr', 'Yards per reception', 'Y/R', 'Receiving yards per catch.', {
    value: ratio('rec_yds', 'receptions'),
    sample: 'receptions',
    unit: 'yards',
    positions: RECEIVERS,
    minSample: 30
  }),
  metric('rec_ypt', 'Yards per target', 'Y/T', 'Receiving yards per target.', {
    value: ratio('rec_yds', 'targets'),
    sample: 'targets',
    unit: 'yards',
    positions: RECEIVERS,
    minSample: 50
  }),
  metric(
    'target_share',
    'Target share',
    'Tgt%',
    'Share of the team’s targets in the games he played. Volume and share stats are the most stable from year to year.',
    {
      value: ratio('targets', 'tm_targets'),
      sample: 'targets',
      unit: 'pct',
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30,
      tier: 'core'
    }
  ),
  metric(
    'air_yards_share',
    'Air-yards share',
    'AY%',
    'Share of the team’s air yards in the games he played.',
    {
      value: ratio('rec_air_yds', 'tm_air_yds'),
      sample: 'targets',
      unit: 'pct',
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30,
      tier: 'core'
    }
  ),
  metric(
    'wopr',
    'WOPR',
    'WOPR',
    'Weighted opportunity rating: 1.5 × target share + 0.7 × air-yards share. Predicts receiving fantasy output.',
    {
      value:
        '1.5 * {targets} / nullif({tm_targets}, 0) + 0.7 * {rec_air_yds} / nullif({tm_air_yds}, 0)',
      sample: 'targets',
      unit: 'number',
      decimals: 2,
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30,
      tier: 'core'
    }
  ),
  metric('rec_adot', 'Average depth of target', 'aDOT', 'Air yards per target.', {
    value: ratio('rec_air_yds', 'targets'),
    sample: 'targets',
    unit: 'yards',
    family: 'advanced',
    direction: 'neutral',
    positions: RECEIVERS,
    minSample: 30,
    tier: 'core'
  }),
  metric(
    'racr',
    'RACR',
    'RACR',
    'Receiver air conversion ratio: receiving yards per air yard targeted.',
    {
      value: ratio('rec_yds', 'rec_air_yds'),
      sample: 'targets',
      unit: 'number',
      decimals: 2,
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30
    }
  ),
  metric(
    'routes',
    'Routes',
    'Rts',
    `Routes run. ${ROUTES_NOTE}`,
    count('routes', {
      family: 'advanced',
      positions: RECEIVERS,
      sources: [...PART, ...SNAPS],
      estimatedBy: 'routes_est'
    })
  ),
  metric(
    'route_participation',
    'Route participation',
    'Rte%',
    `Share of the team’s dropbacks he ran a route on. ${ROUTES_NOTE}`,
    {
      value: ratio('routes', 'tm_dropbacks'),
      sample: 'routes',
      unit: 'pct',
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 150,
      sources: [...PART, ...SNAPS],
      estimatedBy: 'routes_est',
      tier: 'core'
    }
  ),
  metric(
    'yprr',
    'Yards per route run',
    'YPRR',
    `Receiving yards per route: efficiency that does not punish a player for targets he did not get. ${ROUTES_NOTE}`,
    {
      value: ratio('rec_yds', 'routes'),
      sample: 'routes',
      unit: 'yards',
      decimals: 2,
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 150,
      sources: [...PBP, ...PART, ...SNAPS],
      estimatedBy: 'routes_est',
      tier: 'core'
    }
  ),
  metric(
    'tprr',
    'Targets per route run',
    'TPRR',
    `Targets per route: how often he earns the ball when he is out there. ${ROUTES_NOTE}`,
    {
      value: ratio('targets', 'routes'),
      sample: 'routes',
      unit: 'pct',
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 150,
      sources: [...PBP, ...PART, ...SNAPS],
      estimatedBy: 'routes_est',
      tier: 'core'
    }
  ),
  metric(
    'fd_per_route',
    'First downs per route',
    '1D/RR',
    `Receiving first downs per route. ${ROUTES_NOTE}`,
    {
      value: ratio('rec_fd', 'routes'),
      sample: 'routes',
      unit: 'number',
      decimals: 3,
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 150,
      sources: [...PBP, ...PART, ...SNAPS],
      estimatedBy: 'routes_est'
    }
  ),
  metric('yac_rec', 'YAC per reception', 'YAC/R', 'Yards after the catch per catch.', {
    value: ratio('rec_yac', 'receptions'),
    sample: 'receptions',
    unit: 'yards',
    positions: RECEIVERS,
    minSample: 30
  }),
  metric(
    'yacoe',
    'YAC over expected',
    'YACOE',
    'Yards after the catch above nflfastR’s expected YAC, per catch.',
    {
      value: '({rec_xyac_yac} - {rec_xyac}) / nullif({rec_xyac_n}, 0)',
      sample: 'rec_xyac_n',
      unit: 'yards',
      decimals: 2,
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30
    }
  ),
  metric(
    'ngs_yacoe',
    'YAC over expected (NGS)',
    'NGS YACOE',
    'Yards after the catch above Next Gen Stats’ expectation, per catch.',
    {
      value: ratio('ngs_yacoe_sum', 'ngs_receptions'),
      sample: 'ngs_receptions',
      unit: 'yards',
      decimals: 2,
      family: 'ngs',
      positions: RECEIVERS,
      minSample: 30,
      sources: NGS,
      tier: 'stored'
    }
  ),
  metric(
    'separation',
    'Separation',
    'Sep',
    'Average yards between the receiver and the nearest defender when the ball arrives (Next Gen Stats).',
    {
      value: ratio('ngs_sep_sum', 'ngs_targets'),
      sample: 'ngs_targets',
      unit: 'yards',
      decimals: 2,
      family: 'ngs',
      positions: PASS_CATCHERS,
      minSample: 30,
      sources: NGS,
      tier: 'core'
    }
  ),
  metric(
    'cushion',
    'Cushion',
    'Cush',
    'Average yards between the receiver and the nearest defender at the snap (Next Gen Stats).',
    {
      value: ratio('ngs_cushion_sum', 'ngs_targets'),
      sample: 'ngs_targets',
      unit: 'yards',
      decimals: 2,
      family: 'ngs',
      direction: 'neutral',
      positions: PASS_CATCHERS,
      minSample: 30,
      sources: NGS
    }
  ),
  metric(
    'drops',
    'Drops',
    'Drp',
    'Catchable passes dropped (FTN, 2022+).',
    count('drops', {
      family: 'charting',
      direction: 'lower',
      positions: RECEIVERS,
      sources: FTN,
      firstSeason: 2022
    })
  ),
  metric('drop_rate', 'Drop rate', 'Drp%', 'Drops per catch or drop (FTN, 2022+).', {
    value: '{drops} / nullif({receptions} + {drops}, 0)',
    sample: 'targets',
    unit: 'pct',
    family: 'charting',
    direction: 'lower',
    positions: RECEIVERS,
    minSample: 30,
    sources: FTN,
    firstSeason: 2022
  }),
  metric(
    'catchable_pct',
    'Catchable-target %',
    'Catchable%',
    'Share of targets FTN charts as catchable: target quality, mostly the quarterback’s doing.',
    {
      value: ratio('tgt_catchable', 'tgt_ftn'),
      sample: 'tgt_ftn',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      positions: RECEIVERS,
      minSample: 30,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'contested_targets',
    'Contested targets',
    'Cont Tgt',
    'Targets with a defender in position to make a play (FTN, 2022+).',
    count('tgt_contested', {
      family: 'charting',
      direction: 'neutral',
      positions: RECEIVERS,
      sources: FTN,
      firstSeason: 2022
    })
  ),
  metric(
    'contested_catch_rate',
    'Contested catch rate',
    'Cont%',
    'Catches per contested target (FTN, 2022+).',
    {
      value: ratio('contested_catches', 'tgt_contested'),
      sample: 'tgt_contested',
      unit: 'pct',
      family: 'charting',
      positions: RECEIVERS,
      minSample: 10,
      sources: FTN,
      firstSeason: 2022
    }
  ),
  metric(
    'ez_targets',
    'End-zone targets',
    'EZ Tgt',
    'Targets thrown into the end zone.',
    count('ez_targets', { positions: RECEIVERS })
  ),
  metric(
    'i10_targets',
    'Targets inside the 10',
    'i10 Tgt',
    'Targets inside the opponent’s 10.',
    count('i10_targets', { positions: RECEIVERS })
  ),
  metric(
    'rz_targets',
    'Red-zone targets',
    'RZ Tgt',
    'Targets inside the opponent’s 20.',
    count('rz_targets', { positions: RECEIVERS, tier: 'stored' })
  ),
  metric(
    'deep_targets',
    'Deep targets',
    'Deep Tgt',
    'Targets of 20+ air yards.',
    count('deep_targets', { positions: RECEIVERS, tier: 'stored' })
  ),
  metric('rec_epa', 'EPA per target', 'Rec EPA', 'Expected points added per target.', {
    value: ratio('rec_epa', 'targets'),
    sample: 'targets',
    unit: 'epa',
    decimals: 3,
    family: 'advanced',
    positions: RECEIVERS,
    minSample: 30
  }),
  metric(
    'rec_success',
    'Receiving success rate',
    'Rec Succ%',
    'Share of targets with positive EPA.',
    {
      value: ratio('rec_success', 'targets'),
      sample: 'targets',
      unit: 'pct',
      family: 'advanced',
      positions: RECEIVERS,
      minSample: 30,
      tier: 'stored'
    }
  ),
  metric(
    'tprr_man',
    'TPRR vs man',
    'TPRR Man',
    'Targets per route against man coverage (participation, through the prior season).',
    {
      value: ratio('tgt_man', 'routes_man'),
      sample: 'routes_man',
      unit: 'pct',
      family: 'advanced',
      positions: PASS_CATCHERS,
      minSample: 50,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'tprr_zone',
    'TPRR vs zone',
    'TPRR Zone',
    'Targets per route against zone coverage (participation, through the prior season).',
    {
      value: ratio('tgt_zone', 'routes_zone'),
      sample: 'routes_zone',
      unit: 'pct',
      family: 'advanced',
      positions: PASS_CATCHERS,
      minSample: 100,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'yprr_man',
    'YPRR vs man',
    'YPRR Man',
    'Yards per route against man coverage (participation, through the prior season).',
    {
      value: ratio('rec_yds_man', 'routes_man'),
      sample: 'routes_man',
      unit: 'yards',
      decimals: 2,
      family: 'advanced',
      positions: PASS_CATCHERS,
      minSample: 50,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'yprr_zone',
    'YPRR vs zone',
    'YPRR Zone',
    'Yards per route against zone coverage (participation, through the prior season).',
    {
      value: ratio('rec_yds_zone', 'routes_zone'),
      sample: 'routes_zone',
      unit: 'yards',
      decimals: 2,
      family: 'advanced',
      positions: PASS_CATCHERS,
      minSample: 100,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'created_receptions',
    'Created receptions',
    'Created',
    'Catches FTN charts as made by the receiver beyond a routine catch (2022+).',
    count('created_receptions', {
      family: 'charting',
      positions: RECEIVERS,
      sources: FTN,
      firstSeason: 2022,
      tier: 'stored'
    })
  )
]

const USAGE: MetricDef[] = [
  metric('games', 'Games', 'G', 'Games with a snap or a stat.', count('games', { tier: 'core' })),
  metric(
    'off_snaps',
    'Offensive snaps',
    'Off Snp',
    'Offensive snaps played.',
    count('off_snaps', { positions: [...SKILL, 'OL'], sources: SNAPS })
  ),
  metric(
    'snap_share',
    'Snap share',
    'Snp%',
    'Share of the team’s offensive snaps in the games he played.',
    {
      value: ratio('off_snaps', 'tm_off_snaps'),
      sample: 'off_snaps',
      unit: 'pct',
      family: 'advanced',
      positions: [...SKILL, 'OL'],
      minSample: 200,
      sources: SNAPS,
      tier: 'core'
    }
  ),
  metric(
    'def_snaps',
    'Defensive snaps',
    'Def Snp',
    'Defensive snaps played.',
    count('def_snaps', { positions: DEFENDERS, sources: SNAPS, tier: 'core' })
  ),
  metric(
    'def_snap_share',
    'Defensive snap share',
    'Def Snp%',
    'Share of the team’s defensive snaps in the games he played.',
    {
      value: ratio('def_snaps', 'tm_def_snaps'),
      sample: 'def_snaps',
      unit: 'pct',
      family: 'advanced',
      positions: DEFENDERS,
      minSample: 200,
      sources: SNAPS,
      tier: 'core'
    }
  ),
  metric(
    'st_snaps',
    'Special-teams snaps',
    'ST Snp',
    'Special-teams snaps played.',
    count('st_snaps', { sources: SNAPS })
  ),
  metric(
    'carry_share',
    'Carry share',
    'Car%',
    'Share of the team’s carries in the games he played.',
    {
      value: ratio('carries', 'tm_carries'),
      sample: 'carries',
      unit: 'pct',
      family: 'advanced',
      positions: SKILL,
      minSample: 50,
      tier: 'core'
    }
  ),
  metric(
    'opportunity_share',
    'Opportunity share',
    'Opp%',
    'Share of the team’s carries and targets combined, in the games he played.',
    {
      value: '({carries} + {targets}) / nullif({tm_carries} + {tm_targets}, 0)',
      sample: 'carries',
      unit: 'pct',
      family: 'advanced',
      positions: RB,
      minSample: 50,
      tier: 'core'
    }
  ),
  metric(
    'rz_opportunity_share',
    'Red-zone opportunity share',
    'RZ Opp%',
    'Share of the team’s red-zone carries and targets.',
    {
      value: '({rz_carries} + {rz_targets}) / nullif({tm_rz_carries} + {tm_rz_targets}, 0)',
      sample: 'games',
      unit: 'pct',
      family: 'advanced',
      positions: SKILL,
      minSample: 8
    }
  ),
  metric(
    'high_value_touches',
    'High-value touches',
    'HVT',
    'Receptions plus carries inside the 10: the touches worth the most fantasy points.',
    count('receptions', {
      value: '{receptions} + {i10_carries}',
      family: 'advanced',
      positions: RB,
      tier: 'core'
    })
  ),
  metric(
    'touches',
    'Touches',
    'Tch',
    'Carries plus receptions.',
    count('carries', { value: '{carries} + {receptions}', positions: SKILL })
  ),
  metric(
    'scrimmage_yds',
    'Scrimmage yards',
    'Scrim Yds',
    'Rushing plus receiving yards.',
    count('rush_yds', { value: '{rush_yds} + {rec_yds}', positions: SKILL })
  ),
  metric(
    'total_td',
    'Scrimmage TDs',
    'TD',
    'Rushing plus receiving touchdowns.',
    count('rush_td', { value: '{rush_td} + {rec_td}', positions: SKILL })
  ),
  metric(
    'weighted_opportunities',
    'Weighted opportunities',
    'WO',
    'Carries plus 1.5 × targets: a target is worth more fantasy points than a carry.',
    count('carries', {
      value: '{carries} + 1.5 * {targets}',
      unit: 'number',
      decimals: 1,
      family: 'advanced',
      positions: RECEIVERS
    })
  ),
  metric(
    'on_field_epa',
    'Team EPA with him on the field',
    'On EPA',
    'The offense’s EPA per play on his snaps (participation, through the prior season).',
    {
      value: ratio('on_off_epa', 'on_off_plays'),
      sample: 'on_off_plays',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      positions: [...SKILL, 'OL'],
      minSample: 300,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'on_field_def_epa',
    'EPA allowed with him on the field',
    'On Def EPA',
    'The defense’s EPA per play allowed on his snaps (participation, through the prior season).',
    {
      value: ratio('on_def_epa', 'on_def_plays'),
      sample: 'on_def_plays',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      direction: 'lower',
      positions: DEFENDERS,
      minSample: 300,
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  metric(
    'fumbles',
    'Fumbles',
    'Fum',
    'Fumbles, lost or not.',
    count('fumbles', { direction: 'lower', sources: BOX })
  ),
  metric(
    'fumbles_lost',
    'Fumbles lost',
    'FL',
    'Fumbles the other team recovered.',
    count('fumbles_lost', { direction: 'lower', sources: BOX })
  ),
  metric(
    'penalties',
    'Penalties',
    'Pen',
    'Accepted penalties.',
    count('penalties', { direction: 'lower', sources: BOX, tier: 'stored' })
  ),
  metric(
    'penalty_yds',
    'Penalty yards',
    'Pen Yds',
    'Yards of accepted penalties.',
    count('penalty_yds', { direction: 'lower', sources: BOX, tier: 'stored' })
  ),
  metric('kr_avg', 'Kick return average', 'KR Avg', 'Yards per kickoff return.', {
    value: ratio('kr_yds', 'kr'),
    sample: 'kr',
    unit: 'yards',
    minSample: 15,
    sources: BOX
  }),
  metric('pr_avg', 'Punt return average', 'PR Avg', 'Yards per punt return.', {
    value: ratio('pr_yds', 'pr'),
    sample: 'pr',
    unit: 'yards',
    minSample: 15,
    sources: BOX
  }),
  metric(
    'st_tds',
    'Special-teams TDs',
    'ST TD',
    'Return and other special-teams touchdowns.',
    count('st_tds', { sources: BOX, tier: 'stored' })
  )
]

const FANTASY_POSITIONS: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'K']
const FANTASY: MetricDef[] = [
  metric(
    'fantasy_points',
    'Fantasy points',
    'FP',
    'Fantasy points under the chosen scoring, from Sleeper’s weekly stat lines.',
    count('fp', {
      unit: 'points',
      decimals: 1,
      positions: FANTASY_POSITIONS,
      sources: SLEEPER,
      scoring: true,
      tier: 'core'
    })
  ),
  metric(
    'fantasy_ppg',
    'Fantasy points per game',
    'FP/G',
    'Fantasy points per game played, under the chosen scoring.',
    {
      value: ratio('fp', 'games'),
      sample: 'games',
      unit: 'points',
      positions: FANTASY_POSITIONS,
      minSample: 6,
      sources: SLEEPER,
      scoring: true,
      tier: 'core'
    }
  ),
  metric(
    'expected_points',
    'Expected fantasy points',
    'xFP',
    'The fantasy points his opportunities were worth on average (ffopportunity’s expected stats, scored with the chosen rules): volume and role, not results.',
    count('xfp', {
      unit: 'points',
      decimals: 1,
      family: 'predictive',
      positions: SKILL,
      sources: FFO,
      scoring: true,
      tier: 'core'
    })
  ),
  metric('expected_ppg', 'Expected points per game', 'xFP/G', 'Expected fantasy points per game.', {
    value: ratio('xfp', 'games'),
    sample: 'games',
    unit: 'points',
    family: 'predictive',
    positions: SKILL,
    minSample: 6,
    sources: FFO,
    scoring: true
  }),
  metric(
    'fpoe',
    'Fantasy points over expected',
    'FPOE',
    'Fantasy points minus expected points: efficiency, which regresses toward zero more than volume does.',
    count('fp', {
      value: '{fp} - {xfp}',
      unit: 'points',
      decimals: 1,
      family: 'predictive',
      positions: SKILL,
      sources: [...SLEEPER, ...FFO],
      scoring: true,
      tier: 'core'
    })
  ),
  metric(
    'xtd',
    'Expected touchdowns',
    'xTD',
    'Touchdowns his opportunities were worth on average (ffopportunity).',
    count('x_td', {
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      positions: SKILL,
      sources: FFO,
      tier: 'core'
    })
  ),
  metric(
    'td_over_expected',
    'TDs over expected',
    'TD−xTD',
    'Touchdowns minus expected touchdowns: far above or below zero tends to even out.',
    count('ff_td', {
      value: '{ff_td} - {x_td}',
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      positions: SKILL,
      sources: FFO,
      tier: 'core'
    })
  ),
  metric(
    'expected_receptions',
    'Expected receptions',
    'xRec',
    'Receptions his targets were worth on average (ffopportunity).',
    count('x_rec', {
      unit: 'number',
      decimals: 1,
      family: 'predictive',
      positions: RECEIVERS,
      sources: FFO
    })
  ),
  metric(
    'expected_rec_yds',
    'Expected receiving yards',
    'xRecYds',
    'Receiving yards his targets were worth on average (ffopportunity).',
    count('x_rec_yds', {
      unit: 'number',
      family: 'predictive',
      positions: RECEIVERS,
      sources: FFO,
      tier: 'stored'
    })
  ),
  metric(
    'expected_rush_yds',
    'Expected rushing yards',
    'xRushYds',
    'Rushing yards his carries were worth on average (ffopportunity).',
    count('x_rush_yds', {
      unit: 'number',
      family: 'predictive',
      positions: SKILL,
      sources: FFO,
      tier: 'stored'
    })
  )
]

const DEFENSE: MetricDef[] = [
  metric(
    'tackles',
    'Tackles',
    'Tkl',
    'Solo plus assisted tackles.',
    count('tackles_solo', {
      value: '{tackles_solo} + {tackles_with_assist} + {tackles_assist}',
      positions: DEFENDERS,
      tier: 'core'
    })
  ),
  metric(
    'solo_tackles',
    'Solo tackles',
    'Solo',
    'Tackles made alone.',
    count('tackles_solo', { positions: DEFENDERS })
  ),
  metric(
    'assisted_tackles',
    'Assisted tackles',
    'Ast',
    'Tackles shared with a teammate.',
    count('tackles_assist', {
      value: '{tackles_with_assist} + {tackles_assist}',
      positions: DEFENDERS
    })
  ),
  metric(
    'tfl',
    'Tackles for loss',
    'TFL',
    'Tackles behind the line of scrimmage (official count).',
    count('tfl', { positions: DEFENDERS, sources: BOX, tier: 'core' })
  ),
  metric(
    'def_stuffs',
    'Run stuffs',
    'Stuffs',
    'Tackles on runs stopped at or behind the line.',
    count('def_stuffs', { family: 'advanced', positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'sacks',
    'Sacks',
    'Sk',
    'Sacks, a half-sack counted as one half.',
    count('sacks', { decimals: 1, positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'qb_hits',
    'QB hits',
    'QBH',
    'Hits on the quarterback.',
    count('qb_hits', { positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'pressures',
    'Pressures',
    'Prss',
    'Hurries, hits and sacks (Pro Football Reference).',
    count('pfr_pressures', { family: 'charting', positions: DEFENDERS, sources: PFR, tier: 'core' })
  ),
  metric(
    'hurries',
    'Hurries',
    'Hur',
    'Throws he hurried (Pro Football Reference).',
    count('pfr_hurries', { family: 'charting', positions: DEFENDERS, sources: PFR })
  ),
  metric(
    'pressure_rate',
    'Pressure rate',
    'Prss%',
    'Pressures per pass snap. Pass snaps are the opponent’s dropbacks he was on the field for (participation, through the prior season), not true pass rushes.',
    {
      value: ratio('pfr_pressures', 'def_pass_snaps'),
      sample: 'def_pass_snaps',
      unit: 'pct',
      family: 'advanced',
      positions: FRONT,
      minSample: 150,
      sources: [...PFR, ...PART],
      lastSeason: 'prior'
    }
  ),
  metric(
    'blitz_rate',
    'Blitz rate',
    'Blitz%',
    'Blitzes per pass snap (Pro Football Reference blitzes; pass snaps from participation, through the prior season).',
    {
      value: ratio('pfr_blitzes', 'def_pass_snaps'),
      sample: 'def_pass_snaps',
      unit: 'pct',
      family: 'advanced',
      direction: 'neutral',
      positions: COVERAGE,
      minSample: 150,
      sources: [...PFR, ...PART],
      lastSeason: 'prior'
    }
  ),
  metric(
    'missed_tackle_pct',
    'Missed-tackle %',
    'MTkl%',
    'Missed tackles per tackle attempt (Pro Football Reference).',
    {
      value: '{pfr_missed_tackles} / nullif({pfr_missed_tackles} + {pfr_tackles}, 0)',
      sample: 'pfr_tackles',
      unit: 'pct',
      family: 'charting',
      direction: 'lower',
      positions: DEFENDERS,
      minSample: 30,
      sources: PFR
    }
  ),
  metric(
    'tackle_depth',
    'Average depth of tackle',
    'Tkl Dpth',
    'Yards the ball carrier had gained when he made the tackle: lower is closer to the line.',
    {
      value: ratio('tackle_depth_sum', 'tackle_depth_n'),
      sample: 'tackle_depth_n',
      unit: 'yards',
      family: 'advanced',
      direction: 'lower',
      positions: DEFENDERS,
      minSample: 30
    }
  ),
  metric(
    'coverage_targets',
    'Targets in coverage',
    'Cov Tgt',
    'Passes thrown at the receiver he covered (Pro Football Reference).',
    count('cov_targets', {
      family: 'charting',
      direction: 'neutral',
      positions: COVERAGE,
      sources: PFR,
      tier: 'core'
    })
  ),
  metric(
    'coverage_cmp_pct',
    'Completion % allowed',
    'Cmp% All',
    'Completions per target in his coverage.',
    {
      value: ratio('cov_cmp', 'cov_targets'),
      sample: 'cov_targets',
      unit: 'pct',
      family: 'charting',
      direction: 'lower',
      positions: COVERAGE,
      minSample: 30,
      sources: PFR,
      tier: 'core'
    }
  ),
  metric(
    'coverage_ypt',
    'Yards per target allowed',
    'Y/T All',
    'Receiving yards allowed per target in his coverage.',
    {
      value: ratio('cov_yds', 'cov_targets'),
      sample: 'cov_targets',
      unit: 'yards',
      family: 'charting',
      direction: 'lower',
      positions: COVERAGE,
      minSample: 30,
      sources: PFR,
      tier: 'core'
    }
  ),
  metric(
    'coverage_rating',
    'Passer rating allowed',
    'Rate All',
    'The passer rating of throws into his coverage.',
    {
      value: rating('cov_targets', 'cov_cmp', 'cov_yds', 'cov_td', 'cov_int'),
      sample: 'cov_targets',
      unit: 'rating',
      family: 'charting',
      direction: 'lower',
      positions: COVERAGE,
      minSample: 30,
      sources: PFR,
      tier: 'core'
    }
  ),
  metric(
    'coverage_adot',
    'aDOT allowed',
    'aDOT All',
    'Average depth of the targets into his coverage.',
    {
      value: ratio('cov_adot_sum', 'cov_targets'),
      sample: 'cov_targets',
      unit: 'yards',
      family: 'charting',
      direction: 'neutral',
      positions: COVERAGE,
      minSample: 30,
      sources: PFR
    }
  ),
  metric(
    'coverage_yac',
    'YAC allowed per catch',
    'YAC All',
    'Yards after the catch allowed per completion in his coverage.',
    {
      value: ratio('cov_yac', 'cov_cmp'),
      sample: 'cov_cmp',
      unit: 'yards',
      family: 'charting',
      direction: 'lower',
      positions: COVERAGE,
      minSample: 20,
      sources: PFR
    }
  ),
  metric(
    'coverage_td',
    'TDs allowed',
    'TD All',
    'Touchdown catches allowed in his coverage.',
    count('cov_td', {
      family: 'charting',
      direction: 'lower',
      positions: COVERAGE,
      sources: PFR,
      tier: 'core'
    })
  ),
  metric(
    'coverage_int',
    'Interceptions in coverage',
    'INT Cov',
    'Interceptions on throws into his coverage.',
    count('cov_int', { family: 'charting', positions: COVERAGE, sources: PFR })
  ),
  metric(
    'def_ints',
    'Interceptions',
    'INT',
    'Passes intercepted.',
    count('def_ints', { positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'pass_defended',
    'Passes defended',
    'PD',
    'Passes broken up or intercepted.',
    count('pass_defended', { positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'forced_fumbles',
    'Forced fumbles',
    'FF',
    'Fumbles forced.',
    count('forced_fumbles', { positions: DEFENDERS, tier: 'core' })
  ),
  metric(
    'fumble_recoveries',
    'Fumble recoveries',
    'FR',
    'Fumbles recovered.',
    count('fumble_recoveries', { positions: DEFENDERS })
  ),
  metric(
    'def_tds',
    'Defensive TDs',
    'Def TD',
    'Touchdowns scored on defense.',
    count('def_tds', { positions: DEFENDERS, sources: BOX })
  ),
  metric(
    'def_pass_snaps',
    'Pass snaps',
    'Pass Snp',
    'Opponent dropbacks he was on the field for (participation, through the prior season).',
    count('def_pass_snaps', {
      positions: DEFENDERS,
      sources: PART,
      lastSeason: 'prior',
      tier: 'stored'
    })
  )
]

const KICKING: MetricDef[] = [
  metric(
    'fg_made',
    'Field goals made',
    'FGM',
    'Field goals made.',
    count('fg_made', { positions: K, sources: BOX, tier: 'core' })
  ),
  metric(
    'fg_att',
    'Field goal attempts',
    'FGA',
    'Field goals attempted.',
    count('fg_att', { positions: K, sources: BOX })
  ),
  metric(
    'fg_pct',
    'Field goal %',
    'FG%',
    'Field goals made per attempt; depends on the distances tried.',
    {
      value: ratio('fg_made', 'fg_att'),
      sample: 'fg_att',
      unit: 'pct',
      positions: K,
      minSample: 20,
      sources: BOX,
      tier: 'core'
    }
  ),
  metric('fg_pct_0_39', 'FG % under 40', 'FG% <40', 'Field goal % from under 40 yards.', {
    value:
      '({fg_made_0_19} + {fg_made_20_29} + {fg_made_30_39}) / nullif({fg_made_0_19} + {fg_made_20_29} + {fg_made_30_39} + {fg_missed_0_19} + {fg_missed_20_29} + {fg_missed_30_39}, 0)',
    sample: 'fg_att',
    unit: 'pct',
    positions: K,
    minSample: 20,
    sources: BOX
  }),
  metric('fg_pct_40_49', 'FG % 40–49', 'FG% 40s', 'Field goal % from 40–49 yards.', {
    value: '{fg_made_40_49} / nullif({fg_made_40_49} + {fg_missed_40_49}, 0)',
    sample: 'fg_att',
    unit: 'pct',
    positions: K,
    minSample: 20,
    sources: BOX,
    tier: 'core'
  }),
  metric('fg_pct_50p', 'FG % 50+', 'FG% 50+', 'Field goal % from 50 yards or more.', {
    value:
      '({fg_made_50_59} + {fg_made_60p}) / nullif({fg_made_50_59} + {fg_made_60p} + {fg_missed_50_59} + {fg_missed_60p}, 0)',
    sample: 'fg_att',
    unit: 'pct',
    positions: K,
    minSample: 20,
    sources: BOX,
    tier: 'core'
  }),
  metric(
    'fg_made_50p',
    'FGs made 50+',
    'FGM 50+',
    'Field goals made from 50 yards or more.',
    count('fg_made_50_59', { value: '{fg_made_50_59} + {fg_made_60p}', positions: K, sources: BOX })
  ),
  metric('pat_pct', 'Extra point %', 'XP%', 'Extra points made per attempt.', {
    value: ratio('pat_made', 'pat_att'),
    sample: 'pat_att',
    unit: 'pct',
    positions: K,
    minSample: 20,
    sources: BOX
  }),
  metric(
    'kicker_epa',
    'Field goal EPA',
    'FG EPA',
    'Expected points added on field goal attempts, summed.',
    count('fg_epa', { unit: 'epa', decimals: 1, family: 'advanced', positions: K })
  ),
  metric(
    'kickoff_tb_pct',
    'Kickoff touchback %',
    'KO TB%',
    'Share of kickoffs that became touchbacks.',
    {
      value: ratio('kickoff_touchbacks', 'kickoffs'),
      sample: 'kickoffs',
      unit: 'pct',
      direction: 'neutral',
      positions: K,
      minSample: 30
    }
  ),
  metric('punts', 'Punts', 'Punts', 'Punts.', count('punts', { positions: P, sources: BOX })),
  metric('punt_avg', 'Gross punting average', 'Gross', 'Yards per punt.', {
    value: ratio('punt_yds', 'punts'),
    sample: 'punts',
    unit: 'yards',
    positions: P,
    minSample: 30,
    sources: BOX
  }),
  metric(
    'punt_net_avg',
    'Net punting average',
    'Net',
    'Yards per punt after returns and touchbacks.',
    {
      value: ratio('punt_net_yds', 'punts'),
      sample: 'punts',
      unit: 'yards',
      positions: P,
      minSample: 30,
      sources: BOX,
      tier: 'core'
    }
  ),
  metric('punt_in20_rate', 'Inside-20 rate', 'In20%', 'Share of punts downed inside the 20.', {
    value: ratio('punt_in20', 'punts'),
    sample: 'punts',
    unit: 'pct',
    positions: P,
    minSample: 30,
    sources: BOX,
    tier: 'core'
  }),
  metric('punt_tb_rate', 'Punt touchback rate', 'TB%', 'Share of punts that became touchbacks.', {
    value: ratio('punt_tb', 'punts'),
    sample: 'punts',
    unit: 'pct',
    direction: 'lower',
    positions: P,
    minSample: 30,
    sources: BOX
  }),
  metric(
    'punter_epa',
    'EPA per punt',
    'Punt EPA',
    'Expected points added per punt, for the punting team.',
    {
      value: ratio('punt_epa', 'punts_pbp'),
      sample: 'punts_pbp',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      positions: P,
      minSample: 30,
      tier: 'core'
    }
  )
]

/** One team metric for each unit: `{x_…}` becomes `off_…` and `def_…`; defense reads the other way. */
function teamPair(
  id: string,
  label: string,
  short: string,
  description: string,
  o: Opts & { defense?: MetricDef['direction'] }
): MetricDef[] {
  const { defense, ...rest } = o
  const side = (prefix: 'off' | 'def'): Opts => ({
    ...rest,
    value: rest.value.replaceAll('{x_', `{${prefix}_`),
    sample: rest.sample.replace(/^x_/, `${prefix}_`)
  })
  const flip = (d: MetricDef['direction']): MetricDef['direction'] =>
    d === 'higher' ? 'lower' : d === 'lower' ? 'higher' : 'neutral'
  return [
    metric(`off_${id}`, label, short, description, {
      ...side('off'),
      entity: 'team',
      side: 'offense'
    }),
    metric(
      `def_${id}`,
      `${label} allowed`,
      `${short} All`,
      `Allowed by the defense: ${description.charAt(0).toLowerCase()}${description.slice(1)}`,
      {
        ...side('def'),
        entity: 'team',
        side: 'defense',
        direction: defense ?? flip(rest.direction ?? 'higher')
      }
    )
  ]
}

const team = (id: string, label: string, short: string, description: string, o: Opts): MetricDef =>
  metric(id, label, short, description, { entity: 'team', side: 'offense', ...o })

const TEAM: MetricDef[] = [
  team('games_played', 'Games', 'G', 'Games played.', count('games', { tier: 'core' })),
  team('wins', 'Wins', 'W', 'Wins.', count('wins', { tier: 'core' })),
  team('losses', 'Losses', 'L', 'Losses.', count('losses', { direction: 'lower', tier: 'core' })),
  team('win_pct', 'Win %', 'Win%', 'Wins per game, a tie counted as half.', {
    value: '({wins} + 0.5 * {ties}) / nullif({games}, 0)',
    sample: 'games',
    unit: 'pct',
    tier: 'core'
  }),
  team(
    'points_for',
    'Points scored',
    'PF',
    'Points scored.',
    count('points_for', { tier: 'core' })
  ),
  team(
    'points_against',
    'Points allowed',
    'PA',
    'Points allowed.',
    count('points_against', { side: 'defense', direction: 'lower', tier: 'core' })
  ),
  team(
    'point_diff',
    'Point differential',
    'Diff',
    'Points scored minus points allowed.',
    count('points_for', { value: '{points_for} - {points_against}', tier: 'core' })
  ),
  ...teamPair(
    'epa_play',
    'EPA per play',
    'EPA/play',
    'Expected points added per pass or run play: the best single measure of efficiency.',
    {
      value: ratio('x_epa', 'x_plays'),
      sample: 'x_plays',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      tier: 'core'
    }
  ),
  ...teamPair('success_rate', 'Success rate', 'Succ%', 'Share of plays with positive EPA.', {
    value: ratio('x_success', 'x_plays'),
    sample: 'x_plays',
    unit: 'pct',
    family: 'advanced',
    tier: 'core'
  }),
  ...teamPair(
    'pass_epa',
    'EPA per dropback',
    'Pass EPA',
    'EPA per dropback, sacks and scrambles included.',
    {
      value: ratio('x_dropback_epa', 'x_dropbacks'),
      sample: 'x_dropbacks',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      tier: 'core'
    }
  ),
  ...teamPair('rush_epa', 'EPA per carry', 'Rush EPA', 'EPA per carry.', {
    value: ratio('x_rush_epa', 'x_carries'),
    sample: 'x_carries',
    unit: 'epa',
    decimals: 3,
    family: 'advanced',
    tier: 'core'
  }),
  ...teamPair(
    'pass_success',
    'Dropback success rate',
    'Pass Succ%',
    'Share of dropbacks with positive EPA.',
    {
      value: ratio('x_dropback_success', 'x_dropbacks'),
      sample: 'x_dropbacks',
      unit: 'pct',
      family: 'advanced'
    }
  ),
  ...teamPair(
    'rush_success',
    'Rushing success rate',
    'Rush Succ%',
    'Share of carries with positive EPA.',
    {
      value: ratio('x_rush_success', 'x_carries'),
      sample: 'x_carries',
      unit: 'pct',
      family: 'advanced'
    }
  ),
  ...teamPair(
    'early_down_epa',
    'Early-down EPA',
    'Early EPA',
    'EPA per play on first and second down, the most predictive situation.',
    {
      value: ratio('x_early_epa', 'x_early_plays'),
      sample: 'x_early_plays',
      unit: 'epa',
      decimals: 3,
      family: 'advanced'
    }
  ),
  ...teamPair(
    'third_down_pct',
    'Third-down conversion %',
    '3D%',
    'Share of third-down plays that gained a first down.',
    { value: ratio('x_third_conv', 'x_third_att'), sample: 'x_third_att', unit: 'pct' }
  ),
  ...teamPair(
    'fourth_down_pct',
    'Fourth-down conversion %',
    '4D%',
    'Share of fourth-down attempts that gained a first down.',
    { value: ratio('x_fourth_conv', 'x_fourth_att'), sample: 'x_fourth_att', unit: 'pct' }
  ),
  ...teamPair(
    'explosive_rate',
    'Explosive-play rate',
    'Expl%',
    'Share of plays gaining 20+ yards passing or 10+ rushing.',
    { value: ratio('x_explosive', 'x_plays'), sample: 'x_plays', unit: 'pct', family: 'advanced' }
  ),
  ...teamPair(
    'havoc_rate',
    'Havoc rate',
    'Havoc%',
    'Share of plays with a tackle for loss, sack, forced fumble, interception or pass defended.',
    {
      value: ratio('x_havoc', 'x_plays'),
      sample: 'x_plays',
      unit: 'pct',
      family: 'advanced',
      direction: 'lower',
      defense: 'higher'
    }
  ),
  ...teamPair(
    'line_yards',
    'Line yards per carry',
    'Line Yds',
    'Rushing yards credited to the line on designed runs: 120 % of losses, 100 % of 0–4 yards, 50 % of 5–10, nothing beyond (the public Football Outsiders formula).',
    {
      value: ratio('x_line_yds', 'x_designed_runs'),
      sample: 'x_designed_runs',
      unit: 'yards',
      decimals: 2,
      family: 'advanced'
    }
  ),
  ...teamPair(
    'stuff_rate',
    'Stuff rate',
    'Stuff%',
    'Share of carries stopped at or behind the line.',
    {
      value: ratio('x_rush_stuffed', 'x_carries'),
      sample: 'x_carries',
      unit: 'pct',
      family: 'advanced',
      direction: 'lower',
      defense: 'higher'
    }
  ),
  ...teamPair('sack_rate', 'Sack rate', 'Sk%', 'Sacks per dropback.', {
    value: ratio('x_sacks', 'x_dropbacks'),
    sample: 'x_dropbacks',
    unit: 'pct',
    direction: 'lower',
    defense: 'higher'
  }),
  ...teamPair(
    'pressure_rate',
    'Pressure rate',
    'Prss%',
    'Share of dropbacks under pressure (participation, through the prior season).',
    {
      value: ratio('x_pressured', 'x_pressure_known'),
      sample: 'x_pressure_known',
      unit: 'pct',
      family: 'advanced',
      direction: 'lower',
      defense: 'higher',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  ...teamPair('turnovers', 'Turnovers', 'TO', 'Interceptions thrown and fumbles lost.', {
    ...count('x_turnovers', { direction: 'lower' }),
    defense: 'higher'
  }),
  ...teamPair('pass_yds_game', 'Passing yards per game', 'Pass Y/G', 'Passing yards per game.', {
    value: ratio('x_pass_yds', 'games'),
    sample: 'games',
    unit: 'yards'
  }),
  ...teamPair('rush_yds_game', 'Rushing yards per game', 'Rush Y/G', 'Rushing yards per game.', {
    value: ratio('x_rush_yds', 'games'),
    sample: 'games',
    unit: 'yards'
  }),
  team(
    'turnover_margin',
    'Turnover margin',
    'TO +/-',
    'Takeaways minus giveaways.',
    count('def_turnovers', { value: '{def_turnovers} - {off_turnovers}' })
  ),
  team('points_per_drive', 'Points per drive', 'Pts/Dr', 'Points scored per offensive drive.', {
    value: ratio('drive_points', 'drives'),
    sample: 'drives',
    unit: 'points',
    decimals: 2,
    family: 'advanced',
    tier: 'core'
  }),
  team(
    'def_points_per_drive',
    'Points per drive allowed',
    'Pts/Dr All',
    'Points the opponents scored per drive.',
    {
      value: ratio('def_drive_points', 'def_drives'),
      sample: 'def_drives',
      unit: 'points',
      decimals: 2,
      family: 'advanced',
      side: 'defense',
      direction: 'lower',
      tier: 'core'
    }
  ),
  team(
    'td_drive_rate',
    'Touchdown drive rate',
    'TD Dr%',
    'Share of drives ending in a touchdown.',
    { value: ratio('td_drives', 'drives'), sample: 'drives', unit: 'pct', family: 'advanced' }
  ),
  team(
    'three_and_out_rate',
    'Three-and-out rate',
    '3&Out%',
    'Share of drives ending in a punt after three plays or fewer.',
    { value: ratio('three_and_outs', 'drives'), sample: 'drives', unit: 'pct', direction: 'lower' }
  ),
  team(
    'start_field_position',
    'Average starting field position',
    'Start',
    'Average yards from the opponent’s end zone where drives start: lower is better.',
    {
      value: ratio('drive_start_sum', 'drives'),
      sample: 'drives',
      unit: 'yards',
      direction: 'lower'
    }
  ),
  team(
    'proe',
    'Pass rate over expected',
    'PROE',
    'Dropback rate above what nflfastR’s model expects from down, distance, score and time, in percentage points: how pass-happy a team is.',
    {
      value: ratio('off_pass_oe_sum', 'off_pass_oe_n'),
      sample: 'off_pass_oe_n',
      unit: 'pp',
      family: 'advanced',
      direction: 'neutral',
      tier: 'core'
    }
  ),
  team(
    'neutral_proe',
    'Neutral PROE',
    'Neut PROE',
    'Pass rate over expected on early downs in neutral game states (win probability 20–80 %).',
    {
      value: ratio('off_neutral_pass_oe', 'off_neutral_xpass_n'),
      sample: 'off_neutral_xpass_n',
      unit: 'pp',
      family: 'advanced',
      direction: 'neutral'
    }
  ),
  team(
    'neutral_pass_rate',
    'Neutral pass rate',
    'Neut Pass%',
    'Dropback rate on early downs in neutral game states.',
    {
      value: ratio('off_neutral_dropbacks', 'off_neutral_plays'),
      sample: 'off_neutral_plays',
      unit: 'pct',
      family: 'advanced',
      direction: 'neutral',
      tier: 'core'
    }
  ),
  team(
    'neutral_pace',
    'Neutral pace',
    'Pace',
    'Seconds between plays in neutral game states: lower is faster.',
    {
      value: ratio('pace_secs', 'pace_plays'),
      sample: 'pace_plays',
      unit: 'seconds',
      family: 'advanced',
      direction: 'neutral',
      tier: 'core'
    }
  ),
  team('no_huddle_rate', 'No-huddle rate', 'NoHud%', 'Share of plays run without a huddle.', {
    value: ratio('off_no_huddle', 'off_plays'),
    sample: 'off_plays',
    unit: 'pct',
    direction: 'neutral',
    tier: 'core'
  }),
  team('shotgun_rate', 'Shotgun rate', 'Gun%', 'Share of plays from the shotgun.', {
    value: ratio('off_shotgun', 'off_plays'),
    sample: 'off_plays',
    unit: 'pct',
    direction: 'neutral',
    tier: 'core'
  }),
  team(
    'team_play_action_rate',
    'Play-action rate',
    'PA%',
    'Share of dropbacks with a play-action fake (FTN, 2022+).',
    {
      value: ratio('off_play_action', 'off_ftn_dropbacks'),
      sample: 'off_ftn_dropbacks',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      sources: FTN,
      firstSeason: 2022
    }
  ),
  team(
    'team_play_action_epa',
    'Play-action EPA',
    'PA EPA',
    'EPA per play-action dropback (FTN, 2022+).',
    {
      value: ratio('off_play_action_epa', 'off_play_action'),
      sample: 'off_play_action',
      unit: 'epa',
      decimals: 3,
      family: 'charting',
      sources: FTN,
      firstSeason: 2022
    }
  ),
  team('rpo_rate', 'RPO rate', 'RPO%', 'Share of plays that were run-pass options (FTN, 2022+).', {
    value: ratio('off_rpo', 'off_ftn_plays'),
    sample: 'off_ftn_plays',
    unit: 'pct',
    family: 'charting',
    direction: 'neutral',
    sources: FTN,
    firstSeason: 2022
  }),
  team(
    'screen_rate',
    'Screen rate',
    'Scrn%',
    'Share of dropbacks that were screens (FTN, 2022+).',
    {
      value: ratio('off_screens', 'off_ftn_dropbacks'),
      sample: 'off_ftn_dropbacks',
      unit: 'pct',
      family: 'charting',
      direction: 'neutral',
      sources: FTN,
      firstSeason: 2022
    }
  ),
  team('motion_rate', 'Motion rate', 'Mot%', 'Share of plays with pre-snap motion (FTN, 2022+).', {
    value: ratio('off_motion', 'off_ftn_plays'),
    sample: 'off_ftn_plays',
    unit: 'pct',
    family: 'charting',
    direction: 'neutral',
    sources: FTN,
    firstSeason: 2022
  }),
  team(
    'personnel_11_rate',
    '11 personnel rate',
    '11%',
    'Share of plays with one back and one tight end (participation, through the prior season).',
    {
      value: ratio('off_personnel_11', 'off_personnel_known'),
      sample: 'off_personnel_known',
      unit: 'pct',
      direction: 'neutral',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  team(
    'personnel_12_rate',
    '12 personnel rate',
    '12%',
    'Share of plays with one back and two tight ends (participation, through the prior season).',
    {
      value: ratio('off_personnel_12', 'off_personnel_known'),
      sample: 'off_personnel_known',
      unit: 'pct',
      direction: 'neutral',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  team(
    'personnel_21_rate',
    '21 personnel rate',
    '21%',
    'Share of plays with two backs and one tight end (participation, through the prior season).',
    {
      value: ratio('off_personnel_21', 'off_personnel_known'),
      sample: 'off_personnel_known',
      unit: 'pct',
      direction: 'neutral',
      sources: PART,
      lastSeason: 'prior',
      tier: 'stored'
    }
  ),
  team(
    'def_blitz_rate',
    'Blitz rate',
    'Blitz%',
    'Share of opponent dropbacks with a blitz (FTN, 2022+).',
    {
      value: ratio('def_blitzed', 'def_ftn_dropbacks'),
      sample: 'def_ftn_dropbacks',
      unit: 'pct',
      family: 'charting',
      side: 'defense',
      direction: 'neutral',
      sources: FTN,
      firstSeason: 2022
    }
  ),
  team(
    'def_pass_rushers',
    'Pass rushers per dropback',
    'Rushers',
    'Average number of pass rushers (FTN, 2022+).',
    {
      value: ratio('def_pass_rushers_sum', 'def_pass_rushers_n'),
      sample: 'def_pass_rushers_n',
      unit: 'number',
      decimals: 2,
      family: 'charting',
      side: 'defense',
      direction: 'neutral',
      sources: FTN,
      firstSeason: 2022
    }
  ),
  team(
    'def_man_rate',
    'Man coverage rate',
    'Man%',
    'Share of opponent dropbacks in man coverage (participation, through the prior season).',
    {
      value: ratio('def_man', 'def_coverage_known'),
      sample: 'def_coverage_known',
      unit: 'pct',
      family: 'advanced',
      side: 'defense',
      direction: 'neutral',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  team(
    'def_man_epa',
    'EPA allowed in man',
    'Man EPA',
    'EPA per dropback allowed in man coverage (participation, through the prior season).',
    {
      value: ratio('def_man_epa', 'def_man'),
      sample: 'def_man',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      side: 'defense',
      direction: 'lower',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  team(
    'def_zone_epa',
    'EPA allowed in zone',
    'Zone EPA',
    'EPA per dropback allowed in zone coverage (participation, through the prior season).',
    {
      value: ratio('def_zone_epa', 'def_zone'),
      sample: 'def_zone',
      unit: 'epa',
      decimals: 3,
      family: 'advanced',
      side: 'defense',
      direction: 'lower',
      sources: PART,
      lastSeason: 'prior'
    }
  ),
  team(
    'def_box',
    'Defenders in the box',
    'Box',
    'Average defenders in the box on opponent runs (participation, else FTN).',
    {
      value: ratio('def_box_sum', 'def_box_known'),
      sample: 'def_box_known',
      unit: 'number',
      decimals: 2,
      family: 'charting',
      side: 'defense',
      direction: 'neutral',
      sources: [...PART, ...FTN]
    }
  ),
  team('team_fg_pct', 'Field goal %', 'FG%', 'Field goals made per attempt.', {
    value: ratio('fg_made', 'fg_att'),
    sample: 'fg_att',
    unit: 'pct',
    side: 'special',
    sources: BOX
  }),
  team('team_punt_net_avg', 'Net punting average', 'Net', 'Net yards per punt.', {
    value: ratio('punt_net_yds', 'punts'),
    sample: 'punts',
    unit: 'yards',
    side: 'special',
    sources: BOX
  }),
  team('team_kr_avg', 'Kick return average', 'KR Avg', 'Yards per kickoff return.', {
    value: ratio('kr_yds', 'kr'),
    sample: 'kr',
    unit: 'yards',
    side: 'special',
    sources: BOX
  }),
  team('team_pr_avg', 'Punt return average', 'PR Avg', 'Yards per punt return.', {
    value: ratio('pr_yds', 'pr'),
    sample: 'pr',
    unit: 'yards',
    side: 'special',
    sources: BOX
  }),
  team(
    'team_st_tds',
    'Special-teams TDs',
    'ST TD',
    'Return and other special-teams touchdowns.',
    count('st_tds', { side: 'special', sources: BOX })
  ),
  team(
    'implied_points',
    'Implied points per game',
    'Implied',
    'Points the betting line implies per game: (total + expected margin) / 2.',
    {
      value: ratio('implied_points', 'games'),
      sample: 'games',
      unit: 'points',
      family: 'predictive',
      sources: LINES,
      tier: 'core'
    }
  ),
  team(
    'spread',
    'Average expected margin',
    'Margin',
    'Average expected margin from the betting line; positive means favoured.',
    {
      value: ratio('line_margin', 'games'),
      sample: 'games',
      unit: 'points',
      family: 'predictive',
      sources: LINES,
      tier: 'core'
    }
  ),
  team('total_line', 'Average total', 'Total', 'Average over/under of its games.', {
    value: ratio('total_line', 'games'),
    sample: 'games',
    unit: 'points',
    family: 'predictive',
    direction: 'neutral',
    sources: LINES
  }),
  ...(['qb', 'rb', 'wr', 'te', 'k'] as const).map((p) =>
    team(
      `fpa_${p}`,
      `Fantasy points allowed to ${p.toUpperCase()}s`,
      `FPA ${p.toUpperCase()}`,
      `Fantasy points per game the defense allowed to ${p.toUpperCase()}s under the chosen scoring: high means a good matchup for them.`,
      {
        value: ratio(`fpa_${p}`, 'games'),
        sample: 'games',
        unit: 'points',
        side: 'defense',
        direction: 'lower',
        sources: SLEEPER,
        scoring: true,
        tier: 'core'
      }
    )
  )
]

export const CATALOGUE: MetricDef[] = [
  ...PASSING,
  ...RUSHING,
  ...RECEIVING,
  ...USAGE,
  ...FANTASY,
  ...DEFENSE,
  ...KICKING,
  ...TEAM
]

export const METRICS: ReadonlyMap<string, MetricDef> = new Map(CATALOGUE.map((m) => [m.id, m]))

/** The `{component}` names a formula reads, and its sample. */
export function componentsOf(def: Pick<MetricDef, 'value' | 'sample'>): string[] {
  const names = [...def.value.matchAll(/\{([a-z0-9_]+)\}/g)].map((m) => m[1])
  return [...new Set([...names, def.sample])]
}
```

- [ ] **Step 5: The query schema and the registry**

Create `src/shared/stats/querySchema.ts`:

```ts
import { SCORINGS } from './scoring'
import { POSITION_GROUPS, type GroupBy, type StatsQuery, type Transform } from './types'

/**
 * The JSON Schema of `StatsQuery` (stats-analysis spec §7.1, §10): the tool definition the
 * natural-language feature will hand an LLM, with the catalogue's ids as the metric enum. Every
 * `properties` object is typed `Record<keyof …, Schema>`, so the compiler fails when the type gains
 * or loses a field the schema does not.
 */
const GROUP_BY: Record<GroupBy, true> = {
  season: true,
  week: true,
  team: true,
  opponent: true,
  down: true,
  quarter: true,
  personnel: true,
  coverage: true,
  formation: true
}
const TRANSFORMS: Record<Transform, true> = {
  raw: true,
  perGame: true,
  percentile: true,
  zScore: true,
  vsLeague: true
}

type Schema = Record<string, unknown>

const range = (description: string): Schema => ({
  type: 'array',
  items: { type: 'number' },
  minItems: 2,
  maxItems: 2,
  description
})
const list = (items: Schema, description: string): Schema => ({
  type: 'array',
  items,
  minItems: 1,
  description
})
const team = { type: 'string', pattern: '^[A-Z]{2,3}$' }
const gsis = { type: 'string', pattern: '^00-[0-9]{7}$' }

export function statsQuerySchema(metricIds: string[]): Schema {
  const scope: Record<keyof StatsQuery['scope'], Schema> = {
    seasons: list({ type: 'integer', minimum: 2019 }, 'Seasons, 2019 to the current one.'),
    seasonType: { enum: ['REG', 'POST', 'ALL'], description: 'Default REG.' },
    weeks: range('First and last week, inclusive.'),
    lastNGames: { type: 'integer', minimum: 1, description: 'Each row’s last N games in scope.' },
    positions: list({ enum: [...POSITION_GROUPS] }, 'Position groups (players).'),
    teams: list(team, 'Team codes (nflverse: LA, LV, WAS, …).'),
    opponents: list(team, 'Opponent team codes.'),
    players: list(gsis, 'gsis player ids.'),
    qualifiedOnly: { type: 'boolean', description: 'Only rows over the metric’s minimum sample.' }
  }
  const situation: Record<keyof NonNullable<StatsQuery['situation']>, Schema> = {
    down: list({ type: 'integer', minimum: 1, maximum: 4 }, 'Downs.'),
    distance: range('Yards to go.'),
    quarter: list({ type: 'integer', minimum: 1, maximum: 5 }, 'Quarters; 5 is overtime.'),
    fieldZone: { enum: ['redzone', 'inside10', 'inside5', 'own20'] },
    scoreMargin: range('Offense score minus defense score.'),
    winProbability: range('Offense win probability, 0–1.'),
    neutral: {
      type: 'boolean',
      description: 'Win probability 20–80 %, not the last two minutes of a half.'
    },
    pressure: {
      type: 'boolean',
      description: 'QB pressured (participation, through the prior season).'
    },
    blitz: { type: 'boolean', description: 'Defense blitzed (FTN, 2022+).' },
    playAction: { type: 'boolean', description: 'Play-action (FTN, 2022+).' },
    coverage: {
      anyOf: [
        { enum: ['man', 'zone'] },
        list({ type: 'string' }, 'Coverage types: COVER_1, COVER_3, …')
      ]
    },
    formation: list({ type: 'string' }, 'Offensive formations: SHOTGUN, SINGLEBACK, EMPTY, …'),
    personnel: list(
      { type: 'string', pattern: '^[0-9]{2}$' },
      'Personnel codes: "11" = 1 RB, 1 TE.'
    ),
    box: range('Defenders in the box.'),
    airYards: range('Air yards of the pass.'),
    withOnField: list(gsis, 'Only plays with all these players on the field.'),
    withoutOnField: list(gsis, 'Only plays without any of these players on the field.')
  }
  const query: Record<keyof StatsQuery, Schema> = {
    entity: { enum: ['player', 'team'] },
    metrics: { ...list({ enum: metricIds }, 'Catalogue metric ids.'), maxItems: 40 },
    scope: {
      type: 'object',
      properties: scope,
      required: ['seasons'],
      additionalProperties: false
    },
    situation: {
      type: 'object',
      properties: situation,
      additionalProperties: false,
      description: 'Play-level filters; only metrics computed from plays accept them.'
    },
    groupBy: list({ enum: Object.keys(GROUP_BY) }, 'Split rows by these.'),
    transform: { enum: Object.keys(TRANSFORMS) },
    sort: {
      type: 'object',
      properties: { metric: { enum: metricIds }, dir: { enum: ['asc', 'desc'] } },
      required: ['metric', 'dir'],
      additionalProperties: false
    },
    limit: { type: 'integer', minimum: 1, maximum: 1000 },
    scoring: {
      enum: [...SCORINGS],
      description: 'Fantasy scoring; league needs an imported league.'
    }
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'StatsQuery',
    type: 'object',
    properties: query,
    required: ['entity', 'metrics', 'scope'],
    additionalProperties: false
  }
}
```

Create `src/main/stats/engine/registry.ts`:

```ts
import { CATALOGUE, componentsOf } from '@shared/stats/catalogue'
import type { Entity, Grain, MetricDef, MetricInfo } from '@shared/stats/types'
import { playerComponentNames } from '../derived/player'
import { PLAYER_PLAY_COMPONENTS, TEAM_PLAY_COMPONENTS } from '../derived/plays'
import { teamComponentNames } from '../derived/team'

/** Fantasy components, joined from `fantasy_week` / `team_fantasy_week` under the chosen scoring. */
export const PLAYER_FANTASY = ['fp', 'xfp']
export const TEAM_FANTASY = ['fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te', 'fpa_k']

/** The components each grain can sum, by entity (spec §7.2: the grain decides the tables). */
export const COMPONENTS: Record<Entity, Record<'table' | 'play', ReadonlySet<string>>> = {
  player: {
    table: new Set([...playerComponentNames(), ...PLAYER_FANTASY]),
    play: new Set([...PLAYER_PLAY_COMPONENTS.map((c) => c.name), 'games'])
  },
  team: {
    table: new Set([...teamComponentNames(), ...TEAM_FANTASY]),
    play: new Set([
      ...TEAM_PLAY_COMPONENTS.flatMap((c) => [`off_${c.name}`, `def_${c.name}`]),
      'games'
    ])
  }
}

/**
 * Where a metric can be computed: week and season from the derived tables; play when every
 * component comes from plays (and it does not depend on the scoring).
 */
export function grainsOf(def: MetricDef): Grain[] {
  const parts = componentsOf(def)
  const sets = COMPONENTS[def.entity]
  const grains: Grain[] = []
  if (parts.every((c) => sets.table.has(c))) grains.push('week', 'season')
  if (!def.scoring && parts.every((c) => sets.play.has(c))) grains.push('play')
  return grains
}

/** The catalogue as the renderer and NLQ read it: no formulas, and the grains each metric has. */
export function catalogueInfo(): MetricInfo[] {
  return CATALOGUE.map((def) => {
    const info: Partial<MetricDef> = { ...def }
    delete info.value
    delete info.sample
    return { ...(info as Omit<MetricDef, 'value' | 'sample'>), grains: grainsOf(def) }
  })
}
```

- [ ] **Step 6: Run the test**

```bash
npx vitest run tests/shared/stats
```

Expected: PASS (5 passed).

- [ ] **Step 7: Verify and commit**

```bash
npx prettier --write src/shared/stats src/main/stats/engine tests/shared/stats
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
git add src/shared/stats/types.ts src/shared/stats/catalogue.ts src/shared/stats/querySchema.ts src/main/stats/engine/registry.ts tests/shared/stats/catalogue.test.ts
git commit -m "feat(stats): metric catalogue and query type"
```

Expected: clean; 818 passed | 5 skipped.

---

### Task 4: The query engine (spec §7.2; amendments B, D, E)

**Files:**

- Create: `src/main/stats/engine/compile.ts`, `src/main/stats/engine/run.ts`
- Test: `tests/main/stats/engine/compile.test.ts`, `tests/main/stats/engine/run.test.ts`

**Interfaces:**

- Produces (`compile.ts`): `StatsQueryError`, `MAX_METRICS` (40), `DEFAULT_LIMIT` (100), `MAX_LIMIT` (1000), `FULL_SEASON` (17), `CompileContext { currentSeason, hasLeague }`, `Compiled`, `compileQuery(query, ctx)`.
- Produces (`run.ts`): `QUERY_TIMEOUT_MS` (5,000), `runQuery(db, query, ctx, timeoutMs?)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/stats/engine/compile.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { compileQuery, StatsQueryError } from '@main/stats/engine/compile'
import type { StatsQuery } from '@shared/stats/types'

const CTX = { currentSeason: 2026, hasLeague: false }
const base: StatsQuery = { entity: 'player', metrics: ['targets'], scope: { seasons: [2025] } }
const compile = (q: Partial<StatsQuery>): ReturnType<typeof compileQuery> =>
  compileQuery({ ...base, ...q } as StatsQuery, CTX)
const refuses = (q: Partial<StatsQuery>, message: string | RegExp): void => {
  expect(() => compile(q)).toThrow(StatsQueryError)
  expect(() => compile(q)).toThrow(message)
}

describe('compileQuery (stats-analysis spec §7.2)', () => {
  it('refuses what the catalogue does not allow, with a readable message', () => {
    refuses({ metrics: ['nope'] }, 'unknown metric "nope"')
    refuses({ metrics: ['off_epa_play'] }, '"off_epa_play" is a team metric, not a player one')
    refuses({ metrics: [] }, 'metrics must list 1–40 catalogue ids')
    refuses({ metrics: ['targets', 'targets'] }, 'metrics must not repeat')
    refuses({ scope: { seasons: [2018] } }, 'scope.seasons must be whole numbers from 2019 to 2026')
    refuses({ scope: { seasons: [2025], weeks: [5, 2] } }, 'scope.weeks must be [min, max]')
    refuses({ scope: { seasons: [2025], positions: ['XX' as 'QB'] } }, /unknown position "XX"/)
    refuses({ scope: { seasons: [2025], teams: ["KC'; DROP"] } }, /is not valid/)
    refuses({ scoring: 'league' }, 'scoring "league" needs an imported league')
    refuses({ sort: { metric: 'carries', dir: 'desc' } }, 'sort.metric must be one of the metrics')
    refuses({ metrics: ['separation'], situation: { down: [3] } }, /cannot be split by situation/)
    refuses(
      { situation: { pressure: true }, scope: { seasons: [2025], lastNGames: 3 } },
      /lastNGames/
    )
    refuses({ limit: 5000 }, 'limit must be whole numbers from 1 to 1000')
  })

  it('reads the season tables, the weekly ones, or the plays, as the query needs', () => {
    expect(compile({}).grain).toBe('season')
    expect(compile({ groupBy: ['season'] }).grain).toBe('season')
    expect(compile({ scope: { seasons: [2025], weeks: [1, 4] } }).grain).toBe('week')
    expect(compile({ scope: { seasons: [2025], lastNGames: 4 } }).grain).toBe('week')
    expect(compile({ groupBy: ['team'] }).grain).toBe('week')
    expect(compile({ situation: { down: [3] } }).grain).toBe('play')
    expect(compile({ groupBy: ['personnel'] }).grain).toBe('play')
    expect(compile({}).sql).toContain('FROM player_season w')
    expect(compile({ groupBy: ['week'] }).sql).toContain('FROM player_week w')
  })

  it('binds every value the query carries, and splices none into the SQL', () => {
    const c = compile({
      scope: { seasons: [2024, 2025], teams: ['DET'], positions: ['WR'], weeks: [3, 9] },
      situation: { coverage: ['COVER_3'], personnel: ['11'], withOnField: ['00-0012345'] }
    })
    for (const v of ['DET', 'COVER_3', '00-0012345', "'11'", 'WR']) expect(c.sql).not.toContain(v)
    expect(c.params).toEqual(
      expect.arrayContaining(['DET', 'COVER_3', '11', '00-0012345', 'WR', 2024, 2025, 3, 9])
    )
  })

  it('scales the qualification sample to the weeks a row covers', () => {
    expect(compile({}).rowWeeks(18, 1)).toBe(18)
    expect(compile({ groupBy: ['season'] }).rowWeeks(36, 2)).toBe(18)
    expect(compile({ groupBy: ['week'] }).rowWeeks(18, 1)).toBe(1)
    expect(compile({ scope: { seasons: [2025], lastNGames: 4 } }).rowWeeks(18, 1)).toBe(4)
  })

  it('notes coverage the answer depends on', () => {
    expect(compile({ metrics: ['tprr_man'], scope: { seasons: [2025, 2026] } }).notes).toEqual([
      'TPRR vs man: published through 2025.'
    ])
    expect(compile({ metrics: ['drops'], scope: { seasons: [2021] } }).notes).toEqual([
      'Drops: starts in 2022.'
    ])
    expect(compile({ situation: { blitz: true } }).notes).toEqual([
      'Blitz and play-action filters use FTN charting, which starts in 2022.'
    ])
  })
})
```

Create `tests/main/stats/engine/run.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { StatsQueryError } from '@main/stats/engine/compile'
import { runQuery } from '@main/stats/engine/run'
import { openTestDb } from '../../../fixtures/stats'
import { CB, KC_RB, QB, RB, seedGame, WR } from '../../../fixtures/statsDerived'

const CTX = { currentSeason: 2025, hasLeague: false }

async function seeded(): Promise<Awaited<ReturnType<typeof openTestDb>>> {
  const db = await openTestDb()
  await seedGame(db)
  await rebuildDerived(db, { seasons: 'all', league: null })
  return db
}

describe('runQuery (stats-analysis spec §7)', () => {
  it('answers a leaderboard with value, sample, qualification, percentile and rank', async () => {
    const db = await seeded()
    const r = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['targets', 'catch_rate'],
        scope: { seasons: [2025], positions: ['WR', 'RB'] }
      },
      CTX
    )
    expect(r.grain).toBe('season')
    expect(r.total).toBe(3)
    // Best first; rows without a value last, by name.
    expect(r.rows.map((x) => x.id)).toEqual([WR, KC_RB, RB])
    expect(r.rows[0]).toMatchObject({ name: 'Wes Wideout', team: 'BUF', position: 'WR', games: 1 })
    expect(r.rows[0].values.targets).toEqual({
      value: 2,
      raw: 2,
      sample: 1,
      qualified: true,
      percentile: 0,
      rank: 1,
      estimated: false
    })
    // 50 targets per 17 games: 1 game of 1 week needs 2.9; 2 is not enough.
    expect(r.rows[0].values.catch_rate).toMatchObject({
      value: 0.5,
      sample: 2,
      qualified: false,
      percentile: null
    })
    expect(r.columns[1]).toMatchObject({ id: 'catch_rate', unit: 'pct', seasons: [2025] })
  })

  it('splits by situation from the plays', async () => {
    const db = await seeded()
    const r = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['qb_epa_db'],
        scope: { seasons: [2025], players: [QB] },
        groupBy: ['down']
      },
      CTX
    )
    expect(r.grain).toBe('play')
    expect(r.rows.map((x) => [x.group.down, x.values.qb_epa_db.raw])).toEqual([
      [1, 0.4],
      [2, -1.8]
    ])
    const pressured = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['yprr', 'routes'],
        scope: { seasons: [2025], players: [WR] },
        situation: { pressure: false }
      },
      CTX
    )
    expect(pressured.rows[0].values.routes.raw).toBe(2)
    expect(pressured.rows[0].values.yprr.raw).toBe(10)
    expect(pressured.notes[0]).toMatch(/participation/)
  })

  it('reads weekly rows, fantasy points under a scoring, and team metrics', async () => {
    const db = await seeded()
    const weekly = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['fantasy_points'],
        scope: { seasons: [2025], players: [WR] },
        groupBy: ['week'],
        scoring: 'half'
      },
      CTX
    )
    expect(weekly.rows.map((x) => [x.group.week, x.values.fantasy_points.value])).toEqual([
      [1, 2.5]
    ])
    const teams = await runQuery(
      db,
      {
        entity: 'team',
        metrics: ['off_epa_play', 'win_pct', 'fpa_wr'],
        scope: { seasons: [2025] }
      },
      CTX
    )
    expect(teams.rows.map((x) => [x.id, x.values.win_pct.value])).toEqual([
      ['BUF', 1],
      ['KC', 0]
    ])
    expect(teams.rows.find((x) => x.id === 'KC')?.values.fpa_wr.value).toBe(3)
  })

  it('transforms values per game, as percentiles, z-scores or against the league', async () => {
    const db = await seeded()
    const q = { entity: 'team' as const, metrics: ['off_epa_play'], scope: { seasons: [2025] } }
    const raw = await runQuery(db, q, CTX)
    const vs = await runQuery(db, { ...q, transform: 'vsLeague' }, CTX)
    const mean = (raw.rows[0].values.off_epa_play.raw! + raw.rows[1].values.off_epa_play.raw!) / 2
    expect(vs.rows[0].values.off_epa_play.value).toBeCloseTo(
      raw.rows[0].values.off_epa_play.raw! - mean
    )
    const pct = await runQuery(db, { ...q, transform: 'percentile' }, CTX)
    expect(pct.rows.map((x) => x.values.off_epa_play.value)).toEqual([100, 0])
    const perGame = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['tackles'],
        scope: { seasons: [2025], players: [CB] },
        transform: 'perGame'
      },
      CTX
    )
    expect(perGame.rows[0].values.tackles.value).toBe(1)
  })

  it('marks routes estimated in a season without participation', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await db.exec('DELETE FROM on_field')
    await rebuildDerived(db, { seasons: 'all', league: null })
    const r = await runQuery(
      db,
      { entity: 'player', metrics: ['yprr'], scope: { seasons: [2025], players: [WR] } },
      CTX
    )
    expect(r.rows[0].values.yprr).toMatchObject({ raw: 10, estimated: true })
  })

  it('stops a query that runs too long', async () => {
    const db = await seeded()
    await db.exec('ALTER TABLE team_week RENAME TO team_week_real')
    await db.exec('CREATE VIEW team_week AS SELECT t.* FROM team_week_real t, range(400000000) r')
    await expect(
      runQuery(db, { entity: 'player', metrics: ['targets'], scope: { seasons: [2025] } }, CTX, 50)
    ).rejects.toThrow(new StatsQueryError('the query took longer than 0.05 s'))
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/main/stats/engine
```

Expected: FAIL: `@main/stats/engine/compile` and `@main/stats/engine/run` do not exist.

- [ ] **Step 3: The compiler**

Create `src/main/stats/engine/compile.ts`:

```ts
import { componentsOf, METRICS } from '@shared/stats/catalogue'
import { SCORINGS, type Scoring } from '@shared/stats/scoring'
import {
  POSITION_GROUPS,
  type Grain,
  type GroupBy,
  type MetricDef,
  type StatsQuery,
  type Transform
} from '@shared/stats/types'
import {
  BOX,
  PERSONNEL,
  PLAYER_PLAY_COMPONENTS,
  ROLE_SOURCES,
  TEAM_PLAY_COMPONENTS,
  type PlayComponent,
  type Role
} from '../derived/plays'
import { STATS_FIRST_SEASON } from '../sources'
import { grainsOf, PLAYER_FANTASY, TEAM_FANTASY } from './registry'

/** A query the engine refuses, with a message a person (or an LLM) can act on. */
export class StatsQueryError extends Error {}

export const MAX_METRICS = 40
export const DEFAULT_LIMIT = 100
export const MAX_LIMIT = 1000
/** Spec §6.1: `minSample` is for 17 games; it scales with the weeks a row covers. */
export const FULL_SEASON = 17

const TRANSFORMS: Transform[] = ['raw', 'perGame', 'percentile', 'zScore', 'vsLeague']
const TABLE_DIMS: GroupBy[] = ['season', 'week', 'team', 'opponent']
const PLAY_DIMS: GroupBy[] = ['down', 'quarter', 'personnel', 'coverage', 'formation']
const TEAM_CODE = /^[A-Z]{2,3}$/
const GSIS = /^00-[0-9]{7}$/
const PLAY_DIM_SQL: Partial<Record<GroupBy, string>> = {
  season: 'p.season',
  week: 'p.week',
  down: 'p.down::INTEGER',
  quarter: 'p.qtr::INTEGER',
  personnel: PERSONNEL,
  coverage:
    "CASE p.defense_man_zone_type WHEN 'MAN_COVERAGE' THEN 'man' WHEN 'ZONE_COVERAGE' THEN 'zone' END",
  formation: 'p.offense_formation'
}

type Value = string | number | boolean

/** Bound parameters, numbered as they are added ($1, $2, …): no user value is spliced into SQL. */
class Params {
  readonly values: Value[] = []
  add(value: Value): string {
    this.values.push(value)
    return `$${this.values.length}`
  }
  list(values: Value[]): string {
    return `(${values.map((v) => this.add(v)).join(', ')})`
  }
}

export interface CompileContext {
  /** The latest season in the database: `lastSeason: 'prior'` metrics stop the season before. */
  currentSeason: number
  /** A league is imported, so `scoring: 'league'` exists. */
  hasLeague: boolean
}

/** What `runQuery` runs: the weeks in scope (they scale `minSample`), then the query. */
export interface Compiled {
  grain: Grain
  metrics: MetricDef[]
  transform: Transform
  weeksSql: string
  weeksParams: Value[]
  /** `$factor` is replaced by the qualification factor before it runs. */
  sql: string
  params: Value[]
  /** The weeks one row covers, given the weeks and seasons in scope. */
  rowWeeks(weeks: number, seasons: number): number
  notes: string[]
}

function fail(message: string): never {
  throw new StatsQueryError(message)
}

function integers(values: unknown, what: string, min: number, max: number): number[] {
  if (!Array.isArray(values) || values.length === 0) fail(`${what} must be a non-empty list`)
  for (const v of values) {
    if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) {
      fail(`${what} must be whole numbers from ${min} to ${max}`)
    }
  }
  return values as number[]
}

function range(value: unknown, what: string): [number, number] {
  const ok =
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    value[0] <= value[1]
  return ok ? (value as [number, number]) : fail(`${what} must be [min, max]`)
}

function texts(values: unknown, what: string, pattern: RegExp): string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > 64) {
    fail(`${what} must list 1–64 values`)
  }
  for (const v of values) {
    if (typeof v !== 'string' || !pattern.test(v)) fail(`${what}: "${String(v)}" is not valid`)
  }
  return values as string[]
}

function flag(value: unknown, what: string): boolean {
  return typeof value === 'boolean' ? value : fail(`${what} must be true or false`)
}

interface Checked {
  metrics: MetricDef[]
  grain: Grain
  scoring: Scoring
  transform: Transform
  groupBy: GroupBy[]
}

/** Spec §7.2: the checks, with readable messages, before anything reaches SQL. */
function validate(q: StatsQuery, ctx: CompileContext): Checked {
  if (q.entity !== 'player' && q.entity !== 'team') fail('entity must be "player" or "team"')
  if (!Array.isArray(q.metrics) || q.metrics.length === 0 || q.metrics.length > MAX_METRICS) {
    fail(`metrics must list 1–${MAX_METRICS} catalogue ids`)
  }
  if (new Set(q.metrics).size !== q.metrics.length) fail('metrics must not repeat')
  const metrics = q.metrics.map((id) => {
    const def = METRICS.get(id) ?? fail(`unknown metric "${id}"`)
    if (def.entity !== q.entity) fail(`"${id}" is a ${def.entity} metric, not a ${q.entity} one`)
    return def
  })
  const scope = q.scope ?? fail('scope is required')
  integers(scope.seasons, 'scope.seasons', STATS_FIRST_SEASON, ctx.currentSeason)
  if (scope.seasonType !== undefined && !['REG', 'POST', 'ALL'].includes(scope.seasonType)) {
    fail('scope.seasonType must be REG, POST or ALL')
  }
  if (scope.weeks !== undefined) integers(range(scope.weeks, 'scope.weeks'), 'scope.weeks', 1, 22)
  if (scope.lastNGames !== undefined) integers([scope.lastNGames], 'scope.lastNGames', 1, 100)
  if (scope.positions !== undefined) {
    texts(scope.positions, 'scope.positions', /^[A-Z]{1,2}$/)
    for (const p of scope.positions) {
      if (!(POSITION_GROUPS as readonly string[]).includes(p)) {
        fail(`unknown position "${p}"; use ${POSITION_GROUPS.join(', ')}`)
      }
    }
  }
  if (scope.teams !== undefined) texts(scope.teams, 'scope.teams', TEAM_CODE)
  if (scope.opponents !== undefined) texts(scope.opponents, 'scope.opponents', TEAM_CODE)
  if (scope.players !== undefined) texts(scope.players, 'scope.players', GSIS)
  if (scope.qualifiedOnly !== undefined) flag(scope.qualifiedOnly, 'scope.qualifiedOnly')
  const groupBy = q.groupBy ?? []
  for (const g of groupBy) {
    if (![...TABLE_DIMS, ...PLAY_DIMS].includes(g)) fail(`cannot group by "${g}"`)
  }
  if (new Set(groupBy).size !== groupBy.length) fail('groupBy must not repeat')
  const transform = q.transform ?? 'raw'
  if (!TRANSFORMS.includes(transform)) fail(`transform must be one of ${TRANSFORMS.join(', ')}`)
  const scoring = q.scoring ?? 'ppr'
  if (!SCORINGS.includes(scoring)) fail(`scoring must be one of ${SCORINGS.join(', ')}`)
  if (scoring === 'league' && !ctx.hasLeague) fail('scoring "league" needs an imported league')
  if (q.sort !== undefined) {
    if (!q.metrics.includes(q.sort.metric)) fail('sort.metric must be one of the metrics')
    if (q.sort.dir !== 'asc' && q.sort.dir !== 'desc') fail('sort.dir must be asc or desc')
  }
  if (q.limit !== undefined) integers([q.limit], 'limit', 1, MAX_LIMIT)

  const situational =
    Object.keys(q.situation ?? {}).length > 0 || groupBy.some((g) => PLAY_DIMS.includes(g))
  let grain: Grain = 'season'
  if (situational) grain = 'play'
  else if (
    scope.weeks !== undefined ||
    scope.lastNGames !== undefined ||
    scope.opponents !== undefined ||
    groupBy.some((g) => g !== 'season')
  ) {
    grain = 'week'
  }
  if (grain === 'play' && scope.lastNGames !== undefined) {
    fail('lastNGames cannot be combined with situation filters')
  }
  for (const m of metrics) {
    if (!grainsOf(m).includes(grain)) {
      fail(
        grain === 'play'
          ? `"${m.id}" cannot be split by situation: it does not come from plays`
          : `"${m.id}" is only available with situation filters`
      )
    }
  }
  return { metrics, grain, scoring, transform, groupBy }
}

/** Spec §7.1 situation filters, as conditions on `p` (a row of `plays`). */
function situationWhere(
  s: NonNullable<StatsQuery['situation']>,
  params: Params,
  notes: Set<string>
): string[] {
  const where: string[] = []
  const part = (): void => {
    notes.add(
      'Pressure, coverage, personnel, formation and on-field filters use participation data, published through the prior season.'
    )
  }
  const ftn = (): void => {
    notes.add('Blitz and play-action filters use FTN charting, which starts in 2022.')
  }
  const between = (column: string, value: unknown, what: string): void => {
    const [a, b] = range(value, what)
    where.push(`${column} BETWEEN ${params.add(a)} AND ${params.add(b)}`)
  }
  if (s.down !== undefined) {
    where.push(`p.down IN ${params.list(integers(s.down, 'situation.down', 1, 4))}`)
  }
  if (s.distance !== undefined) between('p.ydstogo', s.distance, 'situation.distance')
  if (s.quarter !== undefined) {
    where.push(`p.qtr IN ${params.list(integers(s.quarter, 'situation.quarter', 1, 5))}`)
  }
  if (s.fieldZone !== undefined) {
    const zones: Record<string, string> = {
      redzone: 'p.yardline_100 <= 20',
      inside10: 'p.yardline_100 <= 10',
      inside5: 'p.yardline_100 <= 5',
      own20: 'p.yardline_100 >= 80'
    }
    where.push(
      zones[s.fieldZone] ?? fail('situation.fieldZone must be redzone, inside10, inside5 or own20')
    )
  }
  if (s.scoreMargin !== undefined) {
    between('p.score_differential', s.scoreMargin, 'situation.scoreMargin')
  }
  if (s.winProbability !== undefined) between('p.wp', s.winProbability, 'situation.winProbability')
  if (s.neutral !== undefined) {
    const neutral =
      'coalesce(p.wp BETWEEN 0.2 AND 0.8 AND p.qtr <= 4 AND p.half_seconds_remaining > 120, false)'
    where.push(flag(s.neutral, 'situation.neutral') ? neutral : `NOT ${neutral}`)
  }
  if (s.pressure !== undefined) {
    part()
    where.push(`p.was_pressure = ${params.add(flag(s.pressure, 'situation.pressure'))}`)
  }
  if (s.blitz !== undefined) {
    ftn()
    where.push(`(p.n_blitzers > 0) = ${params.add(flag(s.blitz, 'situation.blitz'))}`)
  }
  if (s.playAction !== undefined) {
    ftn()
    where.push(`p.is_play_action = ${params.add(flag(s.playAction, 'situation.playAction'))}`)
  }
  if (s.coverage !== undefined) {
    part()
    if (s.coverage === 'man' || s.coverage === 'zone') {
      const type = s.coverage === 'man' ? 'MAN_COVERAGE' : 'ZONE_COVERAGE'
      where.push(`p.defense_man_zone_type = ${params.add(type)}`)
    } else {
      const types = texts(s.coverage, 'situation.coverage', /^[A-Z0-9_]+$/)
      where.push(`p.defense_coverage_type IN ${params.list(types)}`)
    }
  }
  if (s.formation !== undefined) {
    part()
    const forms = texts(s.formation, 'situation.formation', /^[A-Z_ ]+$/)
    where.push(`p.offense_formation IN ${params.list(forms)}`)
  }
  if (s.personnel !== undefined) {
    part()
    const codes = texts(s.personnel, 'situation.personnel', /^[0-9]{2}$/)
    where.push(`(${PERSONNEL}) IN ${params.list(codes)}`)
  }
  if (s.box !== undefined) {
    part()
    between(BOX, s.box, 'situation.box')
  }
  if (s.airYards !== undefined) between('p.air_yards', s.airYards, 'situation.airYards')
  const onField = (ids: string[]): string =>
    `SELECT 1 FROM on_field o WHERE o.game_id = p.game_id AND o.play_id = p.play_id AND o.gsis IN ${params.list(ids)}`
  if (s.withOnField !== undefined) {
    part()
    for (const id of texts(s.withOnField, 'situation.withOnField', GSIS)) {
      where.push(`EXISTS (${onField([id])})`)
    }
  }
  if (s.withoutOnField !== undefined) {
    part()
    where.push(`NOT EXISTS (${onField(texts(s.withoutOnField, 'situation.withoutOnField', GSIS))})`)
  }
  return where
}

function seasonTypeWhere(column: string, q: StatsQuery, params: Params): string[] {
  const t = q.scope.seasonType ?? 'REG'
  return t === 'ALL' ? [] : [`${column} = ${params.add(t)}`]
}

/** The components a metric reads, its estimate flag included. */
const neededBy = (m: MetricDef): string[] => [
  ...componentsOf(m),
  ...(m.estimatedBy ? [m.estimatedBy] : [])
]

/** Each metric's value, sample and estimated weeks, from component sums. */
function metricColumns(
  metrics: MetricDef[],
  sumOf: (c: string) => string,
  perGame: boolean
): string[] {
  return metrics.flatMap((m, i) => {
    let value = m.value.replace(/\{([a-z0-9_]+)\}/g, (_, c: string) => sumOf(c))
    if (perGame && m.kind === 'count') value = `(${value}) / nullif(${sumOf('games')}, 0)`
    return [
      `(${value})::DOUBLE AS v${i}`,
      `(${sumOf(m.sample)})::DOUBLE AS s${i}`,
      `(${m.estimatedBy ? sumOf(m.estimatedBy) : '0'})::DOUBLE AS e${i}`
    ]
  })
}

/** The week and season grains: rows of the derived tables, summed per output row. */
function tableAgg(q: StatsQuery, c: Checked, params: Params): { ctes: string; dims: GroupBy[] } {
  const player = q.entity === 'player'
  const season = c.grain === 'season'
  const table = `${player ? 'player' : 'team'}_${season ? 'season' : 'week'}`
  const key = player ? 'gsis_id' : 'team'
  const fantasy = player ? PLAYER_FANTASY : TEAM_FANTASY
  const needed = new Set(['games', ...c.metrics.flatMap(neededBy)])
  const where = [
    `w.season IN ${params.list(q.scope.seasons)}`,
    ...seasonTypeWhere('w.season_type', q, params)
  ]
  if (q.scope.weeks) {
    where.push(`w.week BETWEEN ${params.add(q.scope.weeks[0])} AND ${params.add(q.scope.weeks[1])}`)
  }
  if (player && q.scope.positions) where.push(`w.position IN ${params.list(q.scope.positions)}`)
  if (q.scope.teams) where.push(`w.team IN ${params.list(q.scope.teams)}`)
  if (q.scope.opponents) where.push(`w.opponent IN ${params.list(q.scope.opponents)}`)
  if (player && q.scope.players) where.push(`w.gsis_id IN ${params.list(q.scope.players)}`)
  if (!player && !season) where.push('w.games = 1')

  let join = ''
  if ([...needed].some((n) => fantasy.includes(n))) {
    // A gsis id can have two Sleeper ids; one line per person and week.
    const weekly = player
      ? `SELECT gsis_id, season, season_type, week, max(points) AS fp, max(xpoints) AS xfp
         FROM fantasy_week WHERE scoring = ${params.add(c.scoring)} AND gsis_id IS NOT NULL GROUP BY ALL`
      : `SELECT team, season, season_type, week, ${TEAM_FANTASY.map((f) => `max(${f}) AS ${f}`).join(', ')}
         FROM team_fantasy_week WHERE scoring = ${params.add(c.scoring)} GROUP BY ALL`
    const rows = season
      ? `SELECT ${key}, season, season_type, ${fantasy.map((f) => `sum(${f}) AS ${f}`).join(', ')}
         FROM (${weekly}) GROUP BY ALL`
      : weekly
    join = `LEFT JOIN (${rows}) f ON f.${key} = w.${key} AND f.season = w.season
            AND f.season_type = w.season_type${season ? '' : ' AND f.week = w.week'}`
  }
  const cols = [...needed].map((n) => `${fantasy.includes(n) ? 'f' : 'w'}.${n}`)
  const last =
    q.scope.lastNGames === undefined
      ? ''
      : `QUALIFY row_number() OVER (PARTITION BY w.${key}
           ORDER BY w.season DESC, w.week DESC) <= ${params.add(q.scope.lastNGames)}`
  const base = `SELECT w.${key} AS id, w.season, ${season ? 'NULL::INTEGER' : 'w.week'} AS week,
                       w.team, ${player ? 'w.position' : 'NULL::VARCHAR AS position'},
                       ${season ? 'NULL::VARCHAR' : 'w.opponent'} AS opponent, ${cols.join(', ')}
                FROM ${table} w ${join}
                WHERE ${where.join(' AND ')} ${last}`
  const dims = c.groupBy
  const agg = `SELECT id, ${dims.map((d) => `${d} AS g_${d}, `).join('')}
                      arg_max(team, season * 100 + coalesce(week, 0)) AS team,
                      mode(position) AS position, sum(games)::DOUBLE AS games,
                      ${metricColumns(c.metrics, (n) => `sum(${n})`, c.transform === 'perGame').join(', ')}
               FROM base GROUP BY id${dims.map((d) => `, ${d}`).join('')}`
  return { ctes: `base AS (${base}), agg AS (${agg})`, dims }
}

/** The play grain: components summed again from plays under the situation filter (spec §7.2). */
function playAgg(
  q: StatsQuery,
  c: Checked,
  params: Params,
  notes: Set<string>
): { ctes: string; dims: GroupBy[] } {
  const player = q.entity === 'player'
  const dims = c.groupBy
  const needed = new Set(c.metrics.flatMap(componentsOf))
  const situation = situationWhere(q.situation ?? {}, params, notes)
  const scopeWhere = (team: string, opp: string, id: string): string[] => {
    const w = [
      `p.season IN ${params.list(q.scope.seasons)}`,
      ...seasonTypeWhere('p.season_type', q, params)
    ]
    if (q.scope.weeks) {
      w.push(`p.week BETWEEN ${params.add(q.scope.weeks[0])} AND ${params.add(q.scope.weeks[1])}`)
    }
    if (q.scope.teams) w.push(`${team} IN ${params.list(q.scope.teams)}`)
    if (q.scope.opponents) w.push(`${opp} IN ${params.list(q.scope.opponents)}`)
    if (player && q.scope.players) w.push(`${id} IN ${params.list(q.scope.players)}`)
    return w
  }
  const part = (
    id: string,
    team: string,
    from: string,
    where: string[],
    cols: string[]
  ): string => {
    const opp = team === 'p.posteam' ? 'p.defteam' : 'p.posteam'
    const dimCols = dims.map(
      (d) => `${d === 'team' ? team : d === 'opponent' ? opp : PLAY_DIM_SQL[d]} AS g_${d}`
    )
    return `SELECT ${[`${id} AS id`, ...dimCols, `any_value(${team}) AS team`, 'count(DISTINCT p.game_id) AS games', ...cols].join(', ')}
            FROM ${from}
            WHERE ${[`${id} IS NOT NULL`, ...where, ...scopeWhere(team, opp, id), ...situation].join(' AND ')}
            GROUP BY ALL`
  }
  const parts: { sql: string; cols: string[] }[] = []
  if (player) {
    const byRole = new Map<Role, PlayComponent[]>()
    for (const comp of PLAYER_PLAY_COMPONENTS) {
      if (needed.has(comp.name)) byRole.set(comp.role, [...(byRole.get(comp.role) ?? []), comp])
    }
    for (const [role, comps] of byRole) {
      const src = ROLE_SOURCES[role]
      parts.push({
        sql: part(
          src.id,
          src.team,
          src.from,
          [src.where],
          comps.map((x) => `sum(${x.expr}) AS ${x.name}`)
        ),
        cols: comps.map((x) => x.name)
      })
    }
  } else {
    for (const [prefix, team] of [
      ['off', 'p.posteam'],
      ['def', 'p.defteam']
    ] as const) {
      const comps = TEAM_PLAY_COMPONENTS.filter((x) => needed.has(`${prefix}_${x.name}`))
      if (comps.length === 0) continue
      parts.push({
        sql: part(
          team,
          team,
          'plays p',
          [],
          comps.map((x) => `sum(${x.expr}) AS ${prefix}_${x.name}`)
        ),
        cols: comps.map((x) => `${prefix}_${x.name}`)
      })
    }
  }
  if (parts.length === 0) fail('no metric here is computed from plays')
  const key = ['id', ...dims.map((d) => `g_${d}`)]
  const colOf = new Map<string, string>()
  parts.forEach((p, i) => p.cols.forEach((col) => colOf.set(col, `r${i}.${col}`)))
  const games = `greatest(${parts.map((_, i) => `coalesce(r${i}.games, 0)`).join(', ')})`
  // Not a play component: routes' estimate flag (routes from plays are exact).
  const sumOf = (n: string): string =>
    n === 'games' ? games : colOf.has(n) ? `coalesce(${colOf.get(n)}, 0)` : '0'
  // A dim can be NULL (a play without a down), so the parts join with IS NOT DISTINCT FROM.
  const joins = parts
    .map(
      (_, i) =>
        `LEFT JOIN r${i} ON ${key.map((k) => `k.${k} IS NOT DISTINCT FROM r${i}.${k}`).join(' AND ')}`
    )
    .join('\n')
  const pos = player
    ? `pos AS (SELECT gsis_id, arg_max(position, season) AS position FROM player_season
               WHERE season IN ${params.list(q.scope.seasons)} GROUP BY gsis_id),`
    : ''
  const posWhere =
    player && q.scope.positions ? `WHERE pos.position IN ${params.list(q.scope.positions)}` : ''
  const agg = `SELECT k.*, coalesce(${parts.map((_, i) => `r${i}.team`).join(', ')}) AS team,
                      ${player ? 'pos.position' : 'NULL::VARCHAR'} AS position, ${games}::DOUBLE AS games,
                      ${metricColumns(c.metrics, sumOf, c.transform === 'perGame').join(', ')}
               FROM keys k ${joins} ${player ? 'LEFT JOIN pos ON pos.gsis_id = k.id' : ''} ${posWhere}`
  const ctes = [
    ...parts.map((p, i) => `r${i} AS (${p.sql})`),
    `keys AS (${parts.map((_, i) => `SELECT ${key.join(', ')} FROM r${i}`).join(' UNION ')})`,
    ...(pos ? [pos.replace(/,$/, '')] : []),
    `agg AS (${agg})`
  ]
  return { ctes: ctes.join(',\n'), dims }
}

/** The share of scrimmage plays in scope a situation keeps (1 without one). */
function share(q: StatsQuery, c: Checked, params: Params): string {
  if (c.grain !== 'play' || Object.keys(q.situation ?? {}).length === 0) return '1.0'
  const scope = [
    `p.season IN ${params.list(q.scope.seasons)}`,
    ...seasonTypeWhere('p.season_type', q, params),
    "p.counts AND p.play_type IN ('pass', 'run')"
  ]
  if (q.scope.weeks) {
    scope.push(`p.week BETWEEN ${params.add(q.scope.weeks[0])} AND ${params.add(q.scope.weeks[1])}`)
  }
  const kept = situationWhere(q.situation ?? {}, params, new Set())
  return `(SELECT coalesce(count(*) FILTER (WHERE ${kept.join(' AND ')})::DOUBLE / nullif(count(*), 0), 0)
           FROM plays p WHERE ${scope.join(' AND ')})`
}

/** Spec §7.2: validates a query and compiles it to parameterised, read-only SQL. */
export function compileQuery(q: StatsQuery, ctx: CompileContext): Compiled {
  const c = validate(q, ctx)
  const params = new Params()
  const notes = new Set<string>()
  const { ctes, dims } = c.grain === 'play' ? playAgg(q, c, params, notes) : tableAgg(q, c, params)
  // Percentiles and ranks among qualified rows of the same position (players) and group.
  const group = [...(q.entity === 'player' ? ['position'] : []), ...dims.map((d) => `g_${d}`)]
  const over = (i: number, order: string): string =>
    `OVER (PARTITION BY ${[...group, `(q${i} AND v${i} IS NOT NULL)`].join(', ')} ORDER BY v${i} ${order})`
  const among = group.length > 0 ? `PARTITION BY ${group.join(', ')}` : ''
  const ranked = c.metrics.flatMap((m, i) => {
    const ok = `q${i} AND v${i} IS NOT NULL`
    const up = m.direction === 'lower' ? 'DESC' : 'ASC'
    const best = m.direction === 'lower' ? 'ASC' : 'DESC'
    return [
      `CASE WHEN ${ok} THEN 100 * percent_rank() ${over(i, up)} END AS p${i}`,
      `CASE WHEN ${ok} THEN rank() ${over(i, best)} END AS r${i}`,
      // The league mean and spread, for the transforms that need them.
      ...(c.transform === 'zScore' || c.transform === 'vsLeague'
        ? [
            `avg(v${i}) FILTER (WHERE ${ok}) OVER (${among}) AS m${i}`,
            `stddev_samp(v${i}) FILTER (WHERE ${ok}) OVER (${among}) AS d${i}`
          ]
        : [])
    ]
  })
  const shaped = c.metrics.map((_, i) => {
    switch (c.transform) {
      case 'percentile':
        return `p${i} AS t${i}`
      case 'zScore':
        return `(v${i} - m${i}) / nullif(d${i}, 0) AS t${i}`
      case 'vsLeague':
        return `v${i} - m${i} AS t${i}`
      default:
        return `v${i} AS t${i}`
    }
  })
  const flags = c.metrics.map(
    (m, i) => `(s${i} > 0 AND s${i} >= ${m.minSample ?? 0} * $factor) AS q${i}`
  )
  const sort = q.sort ? q.metrics.indexOf(q.sort.metric) : 0
  const lower = c.metrics[sort].direction === 'lower' && c.transform !== 'percentile'
  const dir = q.sort?.dir ?? (lower ? 'asc' : 'desc')
  const player = q.entity === 'player'
  const sql = `WITH ${ctes},
    flagged AS (SELECT *, ${flags.join(', ')} FROM agg),
    ranked AS (SELECT *, ${ranked.join(', ')} FROM flagged),
    shaped AS (SELECT *, ${shaped.join(', ')} FROM ranked)
    SELECT x.*, ${player ? 'coalesce(pl.name, x.id)' : 'x.id'} AS name, count(*) OVER () AS total
    FROM shaped x ${player ? 'LEFT JOIN players pl ON pl.gsis_id = x.id' : ''}
    ${q.scope.qualifiedOnly ? `WHERE q${sort}` : ''}
    ORDER BY q${sort} DESC, t${sort} ${dir.toUpperCase()} NULLS LAST, name
    LIMIT ${q.limit ?? DEFAULT_LIMIT}`

  // Qualification scales `minSample` to the weeks in scope and, at the play grain, to the share of
  // scrimmage plays the situation keeps: 150 routes over a season is about 45 when pressured.
  const wp = new Params()
  const weeksWhere = [
    `season IN ${wp.list(q.scope.seasons)}`,
    ...seasonTypeWhere('season_type', q, wp),
    'games = 1'
  ]
  if (q.scope.weeks) {
    weeksWhere.push(`week BETWEEN ${wp.add(q.scope.weeks[0])} AND ${wp.add(q.scope.weeks[1])}`)
  }
  for (const m of c.metrics) {
    if (m.lastSeason === 'prior' && q.scope.seasons.includes(ctx.currentSeason)) {
      notes.add(`${m.label}: published through ${ctx.currentSeason - 1}.`)
    }
    if (q.scope.seasons.some((s) => s < m.firstSeason)) {
      notes.add(`${m.label}: starts in ${m.firstSeason}.`)
    }
  }
  const last = q.scope.lastNGames
  return {
    grain: c.grain,
    metrics: c.metrics,
    transform: c.transform,
    weeksSql: `SELECT (SELECT count(DISTINCT (season, season_type, week))::INTEGER FROM team_week
                       WHERE ${weeksWhere.join(' AND ')}) AS weeks,
                      ${share(q, c, wp)} AS share`,
    weeksParams: wp.values,
    sql,
    params: params.values,
    rowWeeks: (weeks, seasons) =>
      last !== undefined
        ? Math.min(weeks, last)
        : c.groupBy.includes('week')
          ? 1
          : c.groupBy.includes('season')
            ? weeks / Math.max(1, seasons)
            : weeks,
    notes: [...notes]
  }
}
```

- [ ] **Step 4: The runner**

Create `src/main/stats/engine/run.ts`:

```ts
import type { GroupBy, MetricValue, StatsQuery, StatsResult } from '@shared/stats/types'
import type { StatsDb } from '../db'
import { compileQuery, FULL_SEASON, StatsQueryError, type CompileContext } from './compile'

/** Spec §7.2: a query that runs longer is interrupted and reported. */
export const QUERY_TIMEOUT_MS = 5_000

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Runs one `StatsQuery` on a read connection (spec §7): compiles it, counts the weeks in scope
 * (qualification scales `minSample` to them), runs it under a timeout, and shapes the rows.
 */
export async function runQuery(
  db: StatsDb,
  query: StatsQuery,
  ctx: CompileContext,
  timeoutMs = QUERY_TIMEOUT_MS
): Promise<StatsResult> {
  const started = Date.now()
  const compiled = compileQuery(query, ctx)
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    db.interrupt()
  }, timeoutMs)
  let rows: Record<string, unknown>[]
  try {
    const scope = await db.get<{ weeks: number; share: number }>(
      compiled.weeksSql,
      compiled.weeksParams
    )
    const seasons = new Set(query.scope.seasons).size
    const factor =
      (compiled.rowWeeks(scope?.weeks ?? 0, seasons) / FULL_SEASON) * (scope?.share ?? 1)
    rows = await db.all(compiled.sql.replaceAll('$factor', factor.toFixed(6)), compiled.params)
  } catch (err) {
    if (timedOut) throw new StatsQueryError(`the query took longer than ${timeoutMs / 1000} s`)
    throw err
  } finally {
    clearTimeout(timer)
  }
  const groupBy: GroupBy[] = query.groupBy ?? []
  const seasons = [...new Set(query.scope.seasons)].sort((a, b) => a - b)
  return {
    grain: compiled.grain,
    columns: compiled.metrics.map((m) => ({
      id: m.id,
      label: m.label,
      short: m.short,
      unit: compiled.transform === 'percentile' ? 'number' : m.unit,
      decimals: m.decimals,
      direction: m.direction,
      seasons: seasons.filter(
        (s) => s >= m.firstSeason && (m.lastSeason !== 'prior' || s < ctx.currentSeason)
      )
    })),
    rows: rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      team: (r.team as string | null) ?? null,
      position: (r.position as string | null) ?? null,
      group: Object.fromEntries(
        groupBy.map((g) => [g, (r[`g_${g}`] as string | number | null) ?? null])
      ),
      games: num(r.games) ?? 0,
      values: Object.fromEntries(
        compiled.metrics.map((m, i): [string, MetricValue] => [
          m.id,
          {
            value: num(r[`t${i}`]),
            raw: num(r[`v${i}`]),
            sample: num(r[`s${i}`]),
            qualified: r[`q${i}`] === true,
            percentile: num(r[`p${i}`]),
            rank: num(r[`r${i}`]),
            estimated: (num(r[`e${i}`]) ?? 0) > 0
          }
        ])
      )
    })),
    total: num(rows[0]?.total) ?? 0,
    notes: compiled.notes,
    ms: Date.now() - started
  }
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/main/stats/engine
```

Expected: PASS (11 passed). The timeout test interrupts a query over a 400-million-row view after 50 ms.

- [ ] **Step 6: Verify and commit**

```bash
npx prettier --write src/main/stats/engine tests/main/stats/engine
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
git add src/main/stats/engine/compile.ts src/main/stats/engine/run.ts tests/main/stats/engine
git commit -m "feat(stats): query engine"
```

Expected: clean; 829 passed | 5 skipped.

---

### Task 5: The worker: derived step, reads, league rules, self-test (spec §2, §5.2, §5.3, §11; amendments I, J, L)

**Files:**

- Modify: `src/main/stats/db.ts`, `src/main/stats/protocol.ts`, `src/main/stats/sync.ts`, `src/main/stats/service.ts`, `src/main/stats/worker.ts`, `src/main/stats/client.ts`, `tests/fixtures/statsSync.ts`, `tests/main/stats/sync.test.ts`, `tests/main/stats/service.test.ts`, `tests/main/stats/client.test.ts`

**Interfaces:**

- Produces (`db.ts`): `StatsDb.connect()`, a second connection on the same instance that leaves it open when it closes.
- Produces (`protocol.ts`): requests `setLeague`, `query`, `catalogue`, `status`; `READ_REQUESTS`; `SelfTestResult.query`.
- Produces (`sync.ts`): `STATS_DERIVED_STEP` (`stats:derived`), `StatsSyncDeps.league`, `touchedSeasons(log, current)`.
- Produces (`service.ts`): `StatsService.setLeague / query / catalogue / status`, `rulesKey(rules)`.
- Produces (`client.ts`): `StatsClient.setLeague / query / catalogue / status`.

- [ ] **Step 1: Write the failing tests**

```diff
diff --git a/tests/fixtures/statsSync.ts b/tests/fixtures/statsSync.ts
index 23649d6..00402ff 100644
--- a/tests/fixtures/statsSync.ts
+++ b/tests/fixtures/statsSync.ts
@@ -3,6 +3,7 @@ import type { Downloads } from '@main/stats/download'
 import type { StatsState } from '@main/stats/sleeper'
 import { FILE_SOURCES } from '@main/stats/sources'
 import type { StatsSyncResult } from '@main/stats/protocol'
+import type { ScoringRules } from '@shared/stats/scoring'
 import { refreshStats, STATS_STEPS, type StatsSyncDeps } from '@main/stats/sync'
 import { tempDir } from './stats'
 
@@ -43,6 +44,8 @@ export interface RunOptions {
   state?: StatsState
   now?: Date
   force?: boolean
+  /** The league's scoring rules, for `fantasy_week`. */
+  league?: ScoringRules | null
 }
 
 /** One stats refresh against fake downloads. */
@@ -52,7 +55,8 @@ export async function runSync(db: StatsDb, options: RunOptions = {}): Promise<St
     downloads: fakeDownloads(options.files ?? {}, options.json ?? {}),
     tempDir: tempDir(),
     nflState: async () => options.state ?? STATE_2026,
-    now: () => options.now ?? new Date('2026-10-16T12:00:00Z')
+    now: () => options.now ?? new Date('2026-10-16T12:00:00Z'),
+    league: () => options.league ?? null
   }
   const steps = options.only ? STATS_STEPS.filter((s) => options.only?.includes(s.id)) : STATS_STEPS
   return refreshStats(deps, { force: options.force }, steps)
```

```diff
diff --git a/tests/main/stats/sync.test.ts b/tests/main/stats/sync.test.ts
index f586e7d..efecfec 100644
--- a/tests/main/stats/sync.test.ts
+++ b/tests/main/stats/sync.test.ts
@@ -4,11 +4,14 @@ import {
   PRIOR_SEASON_FRESHNESS_MS,
   refreshStats,
   STATS_STEPS,
+  touchedSeasons,
   type DueInput,
   type SourceState
 } from '@main/stats/sync'
+import type { StatsLogEntry } from '@main/stats/protocol'
 import { INTERRUPTED_MESSAGE } from '@main/stats/schema'
 import { openTestDb, tempDir, writeFixture } from '../../fixtures/stats'
+import { seedGame } from '../../fixtures/statsDerived'
 import { fakeDownloads, runSync, STATE_2026, urlOf } from '../../fixtures/statsSync'
 
 const NOW = Date.parse('2026-10-16T12:00:00Z')
@@ -197,3 +200,53 @@ describe('refreshStats', () => {
     expect(seen).toEqual(['stats:combine skipped'])
   })
 })
+
+describe('the derived rebuild (stats-analysis spec §5.2)', () => {
+  const entry = (source: string, rowsWritten: number, status = 'ok'): StatsLogEntry => ({
+    id: 1,
+    source,
+    startedAt: '',
+    finishedAt: '',
+    status: status as StatsLogEntry['status'],
+    message: null,
+    rowsWritten
+  })
+
+  it('rebuilds the seasons whose rows changed, and the current one for an all-seasons file', () => {
+    expect(
+      touchedSeasons(
+        [
+          entry('stats:pbp:2025', 10),
+          entry('stats:sleeper:2026', 5),
+          entry('stats:pbp:2024', 0),
+          entry('stats:ftn:2023', 0, 'error'),
+          entry('stats:qbr_week', 3),
+          entry('stats:identity', 9)
+        ],
+        2026
+      )
+    ).toEqual([2025, 2026])
+  })
+
+  it('builds every season once play-by-play exists, then only after a refresh that loaded rows', async () => {
+    const db = await openTestDb()
+    await seedGame(db)
+    const first = await runSync(db, { only: [] })
+    expect(first.steps.map((s) => [s.source, s.status, s.message])).toEqual([
+      ['stats:derived', 'ok', 'all seasons']
+    ])
+    expect(await db.get('SELECT count(*) AS n FROM player_week')).toEqual({ n: 7 })
+    expect((await runSync(db, { only: [] })).steps).toEqual([])
+  })
+
+  it('scores the league’s rules when it has them', async () => {
+    const db = await openTestDb()
+    await seedGame(db)
+    await runSync(db, { only: [], league: { scoring: { rec: 3 }, positionOverrides: {} } })
+    expect(
+      await db.get(
+        "SELECT points FROM fantasy_week WHERE scoring = 'league' AND player_id = '9001'"
+      )
+    ).toEqual({ points: 3 })
+  })
+})
```

```diff
diff --git a/tests/main/stats/service.test.ts b/tests/main/stats/service.test.ts
index 06f5b68..304d77f 100644
--- a/tests/main/stats/service.test.ts
+++ b/tests/main/stats/service.test.ts
@@ -1,8 +1,12 @@
 import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
 import { join } from 'node:path'
 import { describe, expect, it } from 'vitest'
+import { StatsDb } from '@main/stats/db'
+import { rebuildDerived } from '@main/stats/derived/build'
+import { bootstrapStatsDb } from '@main/stats/schema'
 import { openStatsService } from '@main/stats/service'
 import { tempDir } from '../../fixtures/stats'
+import { seedGame, WR } from '../../fixtures/statsDerived'
 
 describe('openStatsService', () => {
   it('clears temp files a closed app left behind', async () => {
@@ -27,10 +31,87 @@ describe('openStatsService', () => {
     )
     try {
       const result = await service.selfTest()
-      expect(result).toMatchObject({ rows: 1000, parquet: true, json: true, icu: true })
+      expect(result).toMatchObject({
+        rows: 1000,
+        parquet: true,
+        json: true,
+        icu: true,
+        query: true
+      })
       expect(result.duckdb).toMatch(/^v1\./)
     } finally {
       service.close()
     }
   })
 })
+
+describe('the service reads and the league rules (stats-analysis spec §5, §7)', () => {
+  const RULES = { scoring: { rec: 3, rec_yd: 0.1 }, positionOverrides: {} }
+
+  async function builtFile(): Promise<{ dir: string; path: string }> {
+    const dir = tempDir()
+    const path = join(dir, 'stats.duckdb')
+    const db = await StatsDb.open(path, { threads: 1 })
+    await bootstrapStatsDb(db, new Date())
+    await seedGame(db)
+    await rebuildDerived(db, { seasons: 'all', league: null })
+    db.close()
+    return { dir, path }
+  }
+
+  it('says the stats are being built until they are', async () => {
+    const dir = tempDir()
+    const service = await openStatsService(
+      { path: join(dir, 'stats.duckdb'), tempDir: join(dir, 'tmp') },
+      () => {}
+    )
+    try {
+      expect(await service.status()).toEqual({
+        available: true,
+        through: null,
+        updatedAt: null,
+        busy: false
+      })
+      await expect(
+        service.query({ entity: 'team', metrics: ['wins'], scope: { seasons: [2025] } })
+      ).rejects.toThrow('the stats are still being built')
+      expect(await service.setLeague(RULES)).toBe(false)
+    } finally {
+      service.close()
+    }
+  })
+
+  it('answers queries, and rescores the league when its rules change', async () => {
+    const { dir, path } = await builtFile()
+    const service = await openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
+    const league = {
+      entity: 'player' as const,
+      metrics: ['fantasy_points'],
+      scope: { seasons: [2025], players: [WR] },
+      scoring: 'league' as const
+    }
+    try {
+      expect((await service.status()).through).toEqual({ season: 2025, seasonType: 'REG', week: 1 })
+      await expect(service.query(league)).rejects.toThrow(
+        'scoring "league" needs an imported league'
+      )
+      expect(await service.setLeague(RULES)).toBe(true)
+      expect(
+        await service.setLeague({ positionOverrides: {}, scoring: { rec_yd: 0.1, rec: 3 } })
+      ).toBe(false)
+      expect((await service.query(league)).rows[0].values.fantasy_points.value).toBe(5)
+      expect(service.catalogue().find((m) => m.id === 'yprr')).toMatchObject({
+        grains: ['week', 'season', 'play']
+      })
+    } finally {
+      service.close()
+    }
+    // The rules are kept with the file.
+    const reopened = await openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
+    try {
+      expect(await reopened.setLeague(RULES)).toBe(false)
+    } finally {
+      reopened.close()
+    }
+  })
+})
```

```diff
diff --git a/tests/main/stats/client.test.ts b/tests/main/stats/client.test.ts
index b17fc74..805210a 100644
--- a/tests/main/stats/client.test.ts
+++ b/tests/main/stats/client.test.ts
@@ -102,3 +102,26 @@ describe('startStatsWorker', () => {
     expect(workers[0].terminated).toBe(true)
   })
 })
+
+describe('the stats reads and league rules (stats-analysis spec §7)', () => {
+  it('sends queries, catalogue, status and league rules, each answered by id', async () => {
+    const client = startStatsWorker(INIT, undefined, 'w.js')
+    const query = { entity: 'team' as const, metrics: ['wins'], scope: { seasons: [2025] } }
+    const answers = [
+      client.query(query),
+      client.catalogue(),
+      client.status(),
+      client.setLeague(null)
+    ]
+    expect(workers[0].posted).toEqual([
+      { id: 1, kind: 'query', query },
+      { id: 2, kind: 'catalogue' },
+      { id: 3, kind: 'status' },
+      { id: 4, kind: 'setLeague', rules: null }
+    ])
+    workers[0].emit('message', { kind: 'reply', id: 4, ok: true, result: false })
+    workers[0].emit('message', { kind: 'reply', id: 1, ok: false, error: 'unknown metric "x"' })
+    await expect(answers[0]).rejects.toThrow('unknown metric "x"')
+    await expect(answers[3]).resolves.toBe(false)
+  })
+})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/main/stats/sync.test.ts tests/main/stats/service.test.ts tests/main/stats/client.test.ts
```

Expected: FAIL: `touchedSeasons` is not exported, the refresh logs no `stats:derived`, the service has no `setLeague` / `query` / `status` and the self-test no `query`, and the client has no `query`.

- [ ] **Step 3: A second connection**

```diff
diff --git a/src/main/stats/db.ts b/src/main/stats/db.ts
index 1da8d5e..b625190 100644
--- a/src/main/stats/db.ts
+++ b/src/main/stats/db.ts
@@ -24,7 +24,9 @@ function plain(value: unknown): unknown {
 export class StatsDb {
   private constructor(
     private readonly instance: DuckDBInstance,
-    private readonly conn: DuckDBConnection
+    private readonly conn: DuckDBConnection,
+    /** A second connection shares the instance and leaves it open when it closes. */
+    private readonly ownsInstance = true
   ) {}
 
   static async open(path: string, options: StatsDbOptions = {}): Promise<StatsDb> {
@@ -72,6 +74,14 @@ export class StatsDb {
     }
   }
 
+  /**
+   * Another connection to the same database (spec §2: screens read while a refresh writes). Its
+   * statements run alongside this one's and see committed data only.
+   */
+  async connect(): Promise<StatsDb> {
+    return new StatsDb(this.instance, await this.instance.connect(), false)
+  }
+
   /** Stops the statement running on this connection; it rejects with an "Interrupted" error. */
   interrupt(): void {
     this.conn.interrupt()
@@ -79,7 +89,7 @@ export class StatsDb {
 
   close(): void {
     this.conn.closeSync()
-    this.instance.closeSync()
+    if (this.ownsInstance) this.instance.closeSync()
   }
 }
 
```

- [ ] **Step 4: The protocol**

```diff
diff --git a/src/main/stats/protocol.ts b/src/main/stats/protocol.ts
index c466684..55af4d3 100644
--- a/src/main/stats/protocol.ts
+++ b/src/main/stats/protocol.ts
@@ -1,3 +1,6 @@
+import type { ScoringRules } from '@shared/stats/scoring'
+import type { StatsQuery } from '@shared/stats/types'
+
 export type StatsStepStatus = 'ok' | 'error' | 'skipped' | 'running' | 'interrupted'
 
 /** One row of `stats.duckdb`'s own `sync_log`. */
@@ -37,12 +40,29 @@ export interface SelfTestResult {
   json: boolean
   /** ICU time zones (depth-chart kickoffs). */
   icu: boolean
+  /** The query engine answers a query (spec §11: the packaged worker answers a query). */
+  query: boolean
 }
 
+/**
+ * Requests to the worker. `refresh`, `setLeague`, `selfTest` and `close` run one after another;
+ * `query`, `catalogue` and `status` are reads and run at once on a second connection (spec §2).
+ */
 export type StatsRequest =
   | { id: number; kind: 'refresh'; options: RefreshOptions }
+  | { id: number; kind: 'setLeague'; rules: ScoringRules | null }
   | { id: number; kind: 'selfTest' }
   | { id: number; kind: 'close' }
+  | { id: number; kind: 'query'; query: StatsQuery }
+  | { id: number; kind: 'catalogue' }
+  | { id: number; kind: 'status' }
+
+/** The kinds that run at once instead of in turn. */
+export const READ_REQUESTS: ReadonlySet<StatsRequest['kind']> = new Set([
+  'query',
+  'catalogue',
+  'status'
+])
 
 export type StatsReply =
   | { kind: 'reply'; id: number; ok: true; result: unknown }
```

- [ ] **Step 5: The derived step**

```diff
diff --git a/src/main/stats/sync.ts b/src/main/stats/sync.ts
index eefc532..b31de11 100644
--- a/src/main/stats/sync.ts
+++ b/src/main/stats/sync.ts
@@ -1,6 +1,8 @@
 import type { StatsDb } from './db'
 import type { Downloads } from './download'
 import type { RefreshOptions, StatsLogEntry, StatsStepStatus, StatsSyncResult } from './protocol'
+import type { ScoringRules } from '@shared/stats/scoring'
+import { canDerive, derivedStale, rebuildDerived } from './derived/build'
 import { buildIdentity } from './identity'
 import { INTERRUPTED_MESSAGE } from './schema'
 import { describe, replaceRows, standardSelect, type Columns } from './load'
@@ -15,6 +17,8 @@ export const ATTEMPT_INTERVAL_MS = DAY
 export const PRIOR_SEASON_FRESHNESS_MS = 7 * DAY
 /** Prefix of every stats step in `sync_log`. */
 export const STATS_LOG_PREFIX = 'stats:'
+/** The derived rebuild's step (spec §5.2): when it ends, screens query again. */
+export const STATS_DERIVED_STEP = `${STATS_LOG_PREFIX}derived`
 
 export interface StatsSyncDeps {
   db: StatsDb
@@ -27,6 +31,8 @@ export interface StatsSyncDeps {
   onStep?: (entry: StatsLogEntry) => void
   /** True once the worker is closing: no step starts after it, and the running one is `interrupted`. */
   cancelled?: () => boolean
+  /** The league's scoring rules for `fantasy_week` (spec §5.2); null without a league. */
+  league?: () => ScoringRules | null
 }
 
 /** A source of the sync: one of the files, or Sleeper's weekly lines. */
@@ -311,5 +317,32 @@ export async function refreshStats(
       })
     )
   }
+  const stale = await derivedStale(deps.db)
+  if ((wrote || stale) && (await canDerive(deps.db)) && !deps.cancelled?.()) {
+    const seasons = touchedSeasons(log, state.season)
+    log.push(
+      await runLogged(deps, STATS_DERIVED_STEP, async () => {
+        const rows = await rebuildDerived(deps.db, { seasons, league: deps.league?.() ?? null })
+        await deps.db.exec('CHECKPOINT')
+        const total = Object.values(rows).reduce((a, b) => a + b, 0)
+        return { rows: total, message: stale ? 'all seasons' : `seasons ${seasons.join(', ')}` }
+      })
+    )
+  }
   return { steps: log }
 }
+
+/**
+ * Spec §5.2: the seasons whose derived rows to rebuild, from the steps that loaded rows. A file of
+ * all seasons (players, QBR, combine) refreshes the current season's.
+ */
+export function touchedSeasons(log: StatsLogEntry[], current: number): number[] {
+  const seasons = new Set<number>()
+  for (const entry of log) {
+    if (entry.status !== 'ok' || entry.rowsWritten === 0) continue
+    const parts = entry.source.slice(STATS_LOG_PREFIX.length).split(':')
+    if (parts[0] === 'identity' || parts[0] === 'derived') continue
+    seasons.add(parts.length > 1 ? Number(parts[1]) : current)
+  }
+  return [...seasons].sort((a, b) => a - b)
+}
```

- [ ] **Step 6: The service**

```diff
diff --git a/src/main/stats/service.ts b/src/main/stats/service.ts
index 5313c5d..f2a92e9 100644
--- a/src/main/stats/service.ts
+++ b/src/main/stats/service.ts
@@ -1,8 +1,14 @@
 import { mkdirSync, rmSync } from 'node:fs'
 import { join } from 'node:path'
 import { createSleeperClient } from '@main/sources/sleeper'
+import type { ScoringRules } from '@shared/stats/scoring'
+import type { MetricInfo, StatsQuery, StatsResult, StatsStatus } from '@shared/stats/types'
 import { sqlString, StatsDb } from './db'
+import { derivedStale, rebuildDerived } from './derived/build'
 import { createDownloads } from './download'
+import { StatsQueryError } from './engine/compile'
+import { catalogueInfo } from './engine/registry'
+import { runQuery } from './engine/run'
 import type {
   RefreshOptions,
   SelfTestResult,
@@ -17,7 +23,16 @@ import { refreshStats } from './sync'
 /** The worker's state: the open database and what a refresh needs. Runnable in-process for tests. */
 export interface StatsService {
   refresh(options: RefreshOptions): Promise<StatsSyncResult>
+  /**
+   * The league's scoring rules (null without a league). When they differ from the ones the
+   * fantasy tables were built with, those are rebuilt; resolves true then.
+   */
+  setLeague(rules: ScoringRules | null): Promise<boolean>
   selfTest(): Promise<SelfTestResult>
+  /** Spec §7: one query on the read connection; it runs while a refresh writes. */
+  query(query: StatsQuery): Promise<StatsResult>
+  catalogue(): MetricInfo[]
+  status(): Promise<StatsStatus>
   /**
    * Stops a refresh now: aborts its download, interrupts its statement, and starts no other step.
    * A process must not exit while DuckDB runs a statement (Electron aborts), so closing cancels first.
@@ -32,6 +47,56 @@ export async function fetchStatsState(): Promise<StatsState> {
   return { season: Number(s.season), week: s.week, seasonType: s.season_type }
 }
 
+const LEAGUE_KEY = 'league_rules'
+
+/** Rules as stored and compared: keys sorted, so the same rules always give the same text. */
+export function rulesKey(rules: ScoringRules | null): string | null {
+  if (!rules) return null
+  const sorted = (o: Record<string, unknown>): Record<string, unknown> =>
+    Object.fromEntries(
+      Object.keys(o)
+        .sort()
+        .map((k) => [k, o[k]])
+    )
+  const overrides = rules.positionOverrides as Record<string, Record<string, number>>
+  return JSON.stringify({
+    scoring: sorted(rules.scoring),
+    positionOverrides: Object.fromEntries(
+      Object.keys(overrides)
+        .sort()
+        .map((p) => [p, sorted(overrides[p])])
+    )
+  })
+}
+
+/**
+ * Spec §11: the engine answers a team query over two one-game seasons of a throwaway schema, which
+ * proves the catalogue, the compiler and DuckDB's window functions in the packaged worker.
+ */
+async function selfTestQuery(db: StatsDb): Promise<boolean> {
+  await db.exec('CREATE SCHEMA IF NOT EXISTS self_test')
+  await db.exec('SET search_path = self_test')
+  try {
+    const game = (team: string, wins: number): string =>
+      `SELECT '${team}' AS team, 2025 AS season, 'REG' AS season_type, 1 AS week, 1 AS games, ${wins} AS wins, 0 AS ties`
+    await db.exec(
+      `CREATE OR REPLACE TABLE team_season AS ${game('BUF', 1)} UNION ALL ${game('KC', 0)}`
+    )
+    await db.exec('CREATE OR REPLACE TABLE team_week AS SELECT * FROM team_season')
+    const result = await runQuery(
+      db,
+      { entity: 'team', metrics: ['win_pct'], scope: { seasons: [2025] } },
+      { currentSeason: 2025, hasLeague: false }
+    )
+    return (
+      result.rows.map((r) => `${r.id} ${r.values.win_pct.percentile}`).join(',') === 'BUF 100,KC 0'
+    )
+  } finally {
+    await db.exec('SET search_path = main')
+    await db.exec('DROP SCHEMA self_test CASCADE')
+  }
+}
+
 export async function openStatsService(
   init: StatsWorkerInit,
   onStep: (entry: StatsLogEntry) => void,
@@ -42,15 +107,84 @@ export async function openStatsService(
   mkdirSync(init.tempDir, { recursive: true })
   const db = await StatsDb.open(init.path, { tempDirectory: join(init.tempDir, 'duckdb') })
   await bootstrapStatsDb(db, new Date())
+  // Spec §2: screens read on their own connection while a refresh writes on this one.
+  const reader = await db.connect()
   const abort = new AbortController()
   let cancelled = false
+  let busy = false
+  const stored = await db.get<{ value: string | null }>(
+    'SELECT value FROM stats_settings WHERE key = ?',
+    [LEAGUE_KEY]
+  )
+  let league = stored?.value ? (JSON.parse(stored.value) as ScoringRules) : null
   const downloads = createDownloads({ dir: init.tempDir, signal: abort.signal })
+  const whileBusy = async <T>(fn: () => Promise<T>): Promise<T> => {
+    busy = true
+    try {
+      return await fn()
+    } finally {
+      busy = false
+    }
+  }
   return {
     refresh: (options) =>
-      refreshStats(
-        { db, downloads, tempDir: init.tempDir, nflState, onStep, cancelled: () => cancelled },
-        options
+      whileBusy(() =>
+        refreshStats(
+          {
+            db,
+            downloads,
+            tempDir: init.tempDir,
+            nflState,
+            onStep,
+            cancelled: () => cancelled,
+            league: () => league
+          },
+          options
+        )
       ),
+    async setLeague(rules) {
+      const key = rulesKey(rules)
+      if (key === rulesKey(league)) return false
+      league = rules
+      await db.exec('INSERT OR REPLACE INTO stats_settings VALUES (?, ?)', [LEAGUE_KEY, key])
+      // Before the first build, the next refresh builds everything, the league's scoring included.
+      if (await derivedStale(db)) return false
+      await whileBusy(() =>
+        rebuildDerived(db, { seasons: 'all', league: rules, fantasyOnly: true })
+      )
+      return true
+    },
+    async query(query) {
+      if (await derivedStale(reader)) {
+        throw new StatsQueryError('the stats are still being built; try again in a few minutes')
+      }
+      const latest = await reader.get<{ season: number }>('SELECT max(season) AS season FROM games')
+      return runQuery(reader, query, {
+        currentSeason: latest?.season ?? new Date().getFullYear(),
+        hasLeague: league !== null
+      })
+    },
+    catalogue: () => catalogueInfo(),
+    async status() {
+      const built = !(await derivedStale(reader))
+      const through = built
+        ? await reader.get<{ season: number; season_type: 'REG' | 'POST'; week: number }>(
+            `SELECT season, season_type, week FROM team_week WHERE games = 1
+             ORDER BY season DESC, season_type = 'POST' DESC, week DESC LIMIT 1`
+          )
+        : null
+      const updated = await reader.get<{ at: string | null }>(
+        "SELECT max(finished_at) AS at FROM sync_log WHERE status = 'ok' AND rows_written > 0"
+      )
+      return {
+        available: true,
+        through: through
+          ? { season: through.season, seasonType: through.season_type, week: through.week }
+          : null,
+        updatedAt: updated?.at ?? null,
+        busy
+      }
+    },
     /**
      * Stats-analysis spec §3.3: write, read, a Parquet round trip, `read_json` and an ICU time zone,
      * through the real file (the parquet, json and icu extensions are statically linked).
@@ -75,14 +209,19 @@ export async function openStatsService(
         rows: back?.n ?? 0,
         parquet: back?.n === 1000,
         json: json?.x === 1,
-        icu: icu?.hour === 21
+        icu: icu?.hour === 21,
+        query: await selfTestQuery(db)
       }
     },
     cancel() {
       cancelled = true
       abort.abort()
       db.interrupt()
+      reader.interrupt()
     },
-    close: () => db.close()
+    close() {
+      reader.close()
+      db.close()
+    }
   }
 }
```

- [ ] **Step 7: The worker and the client**

```diff
diff --git a/src/main/stats/worker.ts b/src/main/stats/worker.ts
index f98fa48..79dad62 100644
--- a/src/main/stats/worker.ts
+++ b/src/main/stats/worker.ts
@@ -1,10 +1,12 @@
 import { parentPort, workerData } from 'node:worker_threads'
-import type { StatsReply, StatsRequest, StatsWorkerInit } from './protocol'
+import { READ_REQUESTS, type StatsReply, type StatsRequest, type StatsWorkerInit } from './protocol'
 import { openStatsService, type StatsService } from './service'
 
 /**
  * Worker entry, bundled to `out/main/statsWorker.js` (stats-analysis spec §2): the only thread that
- * opens `stats.duckdb`. Requests run one after another, in arrival order.
+ * opens `stats.duckdb`. Writes (refresh, league rules, self-test, close) run one after another, in
+ * arrival order; reads (queries, catalogue, status) run at once on the read connection, so a screen
+ * never waits behind a refresh.
  */
 const port = parentPort
 if (!port) throw new Error('statsWorker must run as a worker thread')
@@ -18,8 +20,16 @@ async function handle(request: StatsRequest): Promise<unknown> {
   switch (request.kind) {
     case 'refresh':
       return service.refresh(request.options)
+    case 'setLeague':
+      return service.setLeague(request.rules)
     case 'selfTest':
       return service.selfTest()
+    case 'query':
+      return service.query(request.query)
+    case 'catalogue':
+      return service.catalogue()
+    case 'status':
+      return service.status()
     case 'close':
       service.close()
       service = null
@@ -27,19 +37,27 @@ async function handle(request: StatsRequest): Promise<unknown> {
   }
 }
 
+async function answer(request: StatsRequest): Promise<void> {
+  try {
+    post({ kind: 'reply', id: request.id, ok: true, result: await handle(request) })
+  } catch (err) {
+    const error = err instanceof Error ? err.message : String(err)
+    post({ kind: 'reply', id: request.id, ok: false, error })
+  }
+}
+
 openStatsService(workerData as StatsWorkerInit, (entry) => post({ kind: 'step', entry })).then(
   (opened) => {
     service = opened
     port.on('message', (request: StatsRequest) => {
+      if (READ_REQUESTS.has(request.kind)) {
+        void answer(request)
+        return
+      }
       // A close must not wait behind a refresh: stop it now, then close in turn.
       if (request.kind === 'close') service?.cancel()
       queue = queue.then(async () => {
-        try {
-          post({ kind: 'reply', id: request.id, ok: true, result: await handle(request) })
-        } catch (err) {
-          const error = err instanceof Error ? err.message : String(err)
-          post({ kind: 'reply', id: request.id, ok: false, error })
-        }
+        await answer(request)
         if (request.kind === 'close') port.close()
       })
     })
```

```diff
diff --git a/src/main/stats/client.ts b/src/main/stats/client.ts
index 32bd526..3c7fa28 100644
--- a/src/main/stats/client.ts
+++ b/src/main/stats/client.ts
@@ -1,6 +1,8 @@
 import { join } from 'node:path'
 import { Worker } from 'node:worker_threads'
 import { singleFlight } from '@main/sync/background'
+import type { ScoringRules } from '@shared/stats/scoring'
+import type { MetricInfo, StatsQuery, StatsResult, StatsStatus } from '@shared/stats/types'
 import type {
   RefreshOptions,
   SelfTestResult,
@@ -15,7 +17,13 @@ import type {
 export interface StatsClient {
   /** One refresh at a time: a call while one runs returns that run. */
   refresh(options?: RefreshOptions): Promise<StatsSyncResult>
+  /** The league's scoring rules for the `league` scoring (null without a league); in turn with refreshes. */
+  setLeague(rules: ScoringRules | null): Promise<boolean>
   selfTest(): Promise<SelfTestResult>
+  /** Spec §7: runs at once, even during a refresh; rejects with the engine's message. */
+  query(query: StatsQuery): Promise<StatsResult>
+  catalogue(): Promise<MetricInfo[]>
+  status(): Promise<StatsStatus>
   /** Stops a running refresh, closes the database and ends the worker (after `CLOSE_TIMEOUT_MS` at most). */
   close(): Promise<void>
 }
@@ -71,7 +79,11 @@ export function startStatsWorker(
     refresh: singleFlight((options: RefreshOptions = {}) =>
       request<StatsSyncResult>((id) => ({ id, kind: 'refresh', options }))
     ),
+    setLeague: (rules) => request<boolean>((id) => ({ id, kind: 'setLeague', rules })),
     selfTest: () => request<SelfTestResult>((id) => ({ id, kind: 'selfTest' })),
+    query: (query) => request<StatsResult>((id) => ({ id, kind: 'query', query })),
+    catalogue: () => request<MetricInfo[]>((id) => ({ id, kind: 'catalogue' })),
+    status: () => request<StatsStatus>((id) => ({ id, kind: 'status' })),
     async close() {
       if (!dead) {
         let timer: NodeJS.Timeout | undefined
```

- [ ] **Step 8: Run the tests**

```bash
npx vitest run tests/main/stats
```

Expected: PASS (85 passed).

- [ ] **Step 9: Verify and commit**

```bash
npx prettier --write src/main/stats tests/fixtures/statsSync.ts tests/main/stats
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
git add src/main/stats/db.ts src/main/stats/protocol.ts src/main/stats/sync.ts src/main/stats/service.ts src/main/stats/worker.ts src/main/stats/client.ts tests/fixtures/statsSync.ts tests/main/stats/sync.test.ts tests/main/stats/service.test.ts tests/main/stats/client.test.ts
git commit -m "feat(stats): derived step, reads and league rules"
```

Expected: clean; 835 passed | 5 skipped.

---

### Task 6: The app: IPC, league rules, the changed event (spec §2, §5.3, §7)

**Files:**

- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/handlers.ts`, `src/main/index.ts`

**Interfaces:**

- Produces (renderer `window.api.stats`): `query(query)`, `catalogue()`, `status()`, `onChanged(listener)`.
- Produces (IPC): `stats:query`, `stats:catalogue`, `stats:status`, `stats:changed`.
- Produces (`handlers.ts`): `pushLeagueScoring(ctx)`. `startStats` sends the rules, then refreshes.

There is no test harness for the IPC handlers or the main entry; the typecheck, the build, and Task 7 cover them.

- [ ] **Step 1: The renderer API**

```diff
diff --git a/src/shared/ipc.ts b/src/shared/ipc.ts
index cf8b80a..a241675 100644
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -27,6 +27,7 @@ import type {
   WaiverAdds
 } from './types'
 import type { Rules } from './rules'
+import type { MetricInfo, StatsQuery, StatsResult, StatsStatus } from './stats/types'
 
 export interface FindLeaguesResult {
   userId: string
@@ -110,6 +111,17 @@ export interface Api {
   app: {
     version(): Promise<string>
   }
+  /** Stats-analysis spec §7: the stats section's data, with or without a league. */
+  stats: {
+    /** Runs one query in the stats worker; rejects with a readable message on an invalid query. */
+    query(query: StatsQuery): Promise<StatsResult>
+    /** Every metric the engine computes, with where it can be computed (spec §6). */
+    catalogue(): Promise<MetricInfo[]>
+    /** "Data through week N, updated <time>" (spec §5.3). */
+    status(): Promise<StatsStatus>
+    /** Fires when a rebuild finished: screens query again. Returns the unsubscribe function. */
+    onChanged(listener: () => void): () => void
+  }
 }
 
 export const IPC = {
@@ -145,5 +157,9 @@ export const IPC = {
   updateState: 'update:state',
   updateInstall: 'update:install',
   updateChanged: 'update:changed',
-  appVersion: 'app:version'
+  appVersion: 'app:version',
+  statsQuery: 'stats:query',
+  statsCatalogue: 'stats:catalogue',
+  statsStatus: 'stats:status',
+  statsChanged: 'stats:changed'
 } as const
```

```diff
diff --git a/src/preload/index.ts b/src/preload/index.ts
index fa02d6b..0315395 100644
--- a/src/preload/index.ts
+++ b/src/preload/index.ts
@@ -75,6 +75,18 @@ const api: Api = {
   },
   app: {
     version: () => ipcRenderer.invoke(IPC.appVersion)
+  },
+  stats: {
+    query: (query) => ipcRenderer.invoke(IPC.statsQuery, query),
+    catalogue: () => ipcRenderer.invoke(IPC.statsCatalogue),
+    status: () => ipcRenderer.invoke(IPC.statsStatus),
+    onChanged: (listener) => {
+      const handler = (): void => listener()
+      ipcRenderer.on(IPC.statsChanged, handler)
+      return () => {
+        ipcRenderer.removeListener(IPC.statsChanged, handler)
+      }
+    }
   }
 }
 
```

- [ ] **Step 2: The handlers**

```diff
diff --git a/src/main/ipc/handlers.ts b/src/main/ipc/handlers.ts
index f9c620c..d9f70b8 100644
--- a/src/main/ipc/handlers.ts
+++ b/src/main/ipc/handlers.ts
@@ -39,6 +39,7 @@ import type { RefreshOptions } from '@main/sync/step'
 import type { UpdateController } from '@main/updater'
 import { IPC, type FindLeaguesResult } from '@shared/ipc'
 import type { Rules } from '@shared/rules'
+import type { MetricInfo, StatsQuery, StatsResult, StatsStatus } from '@shared/stats/types'
 import { SYNC_SOURCE_GROUPS } from '@shared/syncSources'
 import type {
   League,
@@ -76,7 +77,7 @@ export interface AppContext {
   fantasycalc: FantasyCalcClient
   /**
    * The stats worker and its `stats.duckdb` (stats-analysis spec §2); null when it could not start,
-   * and the app then runs without it. Nothing reads it yet.
+   * and the app then runs without it (the stats section reports it unavailable).
    */
   stats: StatsClient | null
   news: NewsCache
@@ -184,8 +185,33 @@ let inFlight: Promise<SyncResult> | null = null
  * steps log to `stats.duckdb`'s own `sync_log`, so they neither invalidate caches nor reach the
  * status bar.
  */
-export function startStats(ctx: AppContext, options: RefreshOptions = {}): Promise<unknown> {
-  return ctx.stats ? ctx.stats.refresh(options) : Promise.resolve(null)
+export async function startStats(ctx: AppContext, options: RefreshOptions = {}): Promise<unknown> {
+  if (!ctx.stats) return null
+  await pushLeagueScoring(ctx)
+  return ctx.stats.refresh(options)
+}
+
+/**
+ * Stats-analysis spec §2, §5.2: the worker scores fantasy points under the league's rules too, so
+ * it gets them on every refresh and whenever they change (it ignores rules it already has).
+ */
+export function pushLeagueScoring(ctx: AppContext): Promise<unknown> {
+  if (!ctx.stats) return Promise.resolve(null)
+  const id = getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)
+  const rules = id ? getRules(ctx.db, id) : null
+  return ctx.stats
+    .setLeague(
+      rules ? { scoring: rules.scoring, positionOverrides: rules.positionOverrides } : null
+    )
+    .catch((err: unknown) => console.error('could not send the league rules to stats', err))
+}
+
+/** Spec §5.3: what the status line shows when the stats worker could not start. */
+const STATS_OFF: StatsStatus = { available: false, through: null, updatedAt: null, busy: false }
+
+function statsClient(ctx: AppContext): StatsClient {
+  if (!ctx.stats) throw new Error('The stats database could not be opened on this computer')
+  return ctx.stats
 }
 
 function logStatsError(err: unknown): void {
@@ -277,6 +303,7 @@ export function registerIpcHandlers(ctx: AppContext): void {
       recomputePoints(ctx.db, id, rules.updatedAt) // spec §7: rules change → rebuild player_week_points
     })
     invalidateCaches()
+    void pushLeagueScoring(ctx)
     return rules
   })
 
@@ -286,9 +313,18 @@ export function registerIpcHandlers(ctx: AppContext): void {
     const rules = await reimportRules(syncDeps(ctx), id)
     withTransaction(ctx.db, () => recomputePoints(ctx.db, id, rules.updatedAt))
     invalidateCaches()
+    void pushLeagueScoring(ctx)
     return rules
   })
 
+  ipcMain.handle(IPC.statsQuery, (_event, query: StatsQuery): Promise<StatsResult> =>
+    statsClient(ctx).query(query)
+  )
+  ipcMain.handle(IPC.statsCatalogue, (): Promise<MetricInfo[]> => statsClient(ctx).catalogue())
+  ipcMain.handle(IPC.statsStatus, (): Promise<StatsStatus> =>
+    ctx.stats ? ctx.stats.status() : Promise.resolve(STATS_OFF)
+  )
+
   ipcMain.handle(IPC.playersOptions, (): PlayersOptions => {
     const id = activeLeagueId()
     if (!id) throw new Error('No league imported')
```

- [ ] **Step 3: The changed event and the self-test's query**

```diff
diff --git a/src/main/index.ts b/src/main/index.ts
index fe603c6..e1a2909 100644
--- a/src/main/index.ts
+++ b/src/main/index.ts
@@ -16,6 +16,7 @@ import { createNflverseClient } from '@main/sources/nflverse'
 import { createSleeperClient } from '@main/sources/sleeper'
 import { createSleeperNewsClient } from '@main/sources/sleeperNews'
 import { startStatsWorker, type StatsClient } from '@main/stats/client'
+import { STATS_DERIVED_STEP } from '@main/stats/sync'
 import { installAutoUpdater } from '@main/updater'
 import { IPC } from '@shared/ipc'
 
@@ -91,10 +92,18 @@ function retireWarehouse(): void {
 /** Stats-analysis spec §2: a failure here only disables the stats section, never the app. */
 function openStats(): StatsClient | null {
   try {
-    return startStatsWorker({
-      path: join(app.getPath('userData'), 'stats.duckdb'),
-      tempDir: join(app.getPath('userData'), 'stats-tmp')
-    })
+    return startStatsWorker(
+      {
+        path: join(app.getPath('userData'), 'stats.duckdb'),
+        tempDir: join(app.getPath('userData'), 'stats-tmp')
+      },
+      (entry) => {
+        // Spec §5.3: screens query again once the derived tables are rebuilt.
+        if (entry.source === STATS_DERIVED_STEP && entry.status === 'ok') {
+          mainWindow?.webContents.send(IPC.statsChanged)
+        }
+      }
+    )
   } catch (err) {
     console.error('could not start the stats worker; the stats section is off', err)
     return null
@@ -116,7 +125,7 @@ async function runStatsSelfTest(out: string): Promise<number> {
     const client = startStatsWorker({ path: join(dir, 'stats.duckdb'), tempDir: join(dir, 'tmp') })
     const test = await client.selfTest()
     await client.close()
-    code = test.parquet && test.json && test.icu && test.rows === 1000 ? 0 : 1
+    code = test.parquet && test.json && test.icu && test.query && test.rows === 1000 ? 0 : 1
     result = { ok: code === 0, ...test }
   } catch (err) {
     result = { ok: false, error: err instanceof Error ? err.message : String(err) }
```

- [ ] **Step 4: Verify, build, and self-test the packaged app**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
npx electron-vite build && npx electron-builder --linux dir
./dist/linux-unpacked/fantasy-football-companion --no-sandbox --stats-self-test=/tmp/ffc-y-self-test.json; echo "exit $?"; cat /tmp/ffc-y-self-test.json
```

Expected: clean; 835 passed | 5 skipped; `exit 0` and `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true,"json":true,"icu":true,"query":true}`. The GPU process complains on WSL; that is harmless.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts src/main/index.ts
git add src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts src/main/index.ts
git commit -m "feat(stats): stats IPC and league rules"
```

---

### Task 7: Live checks

**Files:**

- Throwaway (never committed): `tests/zz-y-live.test.ts`

The check reads the dev profile's `companion.db` (`~/.config/FantasyCompanion/companion.db`, read-only) for the league's rules, and builds a fresh `stats.duckdb` in a temp directory. It downloads about 210 MB.

- [ ] **Step 1: Live backfill, budgets and gates**

Create `tests/zz-y-live.test.ts`:

```ts
import { mkdtempSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { getRules } from '@main/db/repos/rules'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { sleeperStatLine } from '@main/scoring/adapters'
import { scoreStatLine } from '@main/scoring/engine'
import { StatsDb } from '@main/stats/db'
import { expectedPointsSql } from '@main/stats/derived/fantasy'
import { openStatsService } from '@main/stats/service'
import { asPosition } from '@shared/rules'
import { CATALOGUE } from '@shared/stats/catalogue'
import type { StatsQuery } from '@shared/stats/types'

const APP_DB = join(homedir(), '.config', 'FantasyCompanion', 'companion.db')
const pct = (v: number): string => (100 * v).toFixed(2)

it(
  'live: backfill, derived tables, gates (throwaway; never commit)',
  { timeout: 1_800_000 },
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ffc-y-'))
    const path = join(dir, 'stats.duckdb')
    const fails: string[] = []
    const gate = (ok: boolean, what: string): void => {
      if (!ok) fails.push(what)
    }
    const app = openDatabase(APP_DB)
    const rules = getRules(app, getSetting(app, SETTING_ACTIVE_LEAGUE)!)!
    const league = { scoring: rules.scoring, positionOverrides: rules.positionOverrides }

    // 1. A fresh backfill builds every derived table.
    let peak = 0
    const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 100)
    let t = Date.now()
    const service = await openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
    await service.setLeague(league)
    const backfill = await service.refresh({})
    const derived = backfill.steps.find((s) => s.source === 'stats:derived')
    console.log({
      backfillSeconds: Math.round((Date.now() - t) / 1000),
      peakMb: Math.round(peak / 1e6),
      derived:
        derived &&
        `${derived.status} ${derived.message} ${(Date.parse(derived.finishedAt!) - Date.parse(derived.startedAt)) / 1000} s`,
      notOk: backfill.steps.filter((s) => s.status !== 'ok').map((s) => `${s.source} ${s.status}`)
    })
    gate(
      derived?.status === 'ok' && derived.message === 'all seasons',
      'derived step builds every season'
    )
    gate((Date.now() - t) / 1000 <= 600, 'backfill with derived ≤ 10 min')

    // 2. A forced daily refresh rebuilds the current season; queries answer while it runs.
    peak = 0
    t = Date.now()
    let done = false
    const refreshing = service.refresh({ force: true }).finally(() => (done = true))
    const latency: number[] = []
    while (!done) {
      const q0 = Date.now()
      await service.query({ entity: 'team', metrics: ['off_epa_play'], scope: { seasons: [2025] } })
      latency.push(Date.now() - q0)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    const daily = await refreshing
    clearInterval(timer)
    const dailyDerived = daily.steps.find((s) => s.source === 'stats:derived')
    latency.sort((a, b) => a - b)
    console.log({
      dailySeconds: Math.round((Date.now() - t) / 1000),
      dailyPeakMb: Math.round(peak / 1e6),
      derived:
        dailyDerived &&
        `${dailyDerived.message} ${(Date.parse(dailyDerived.finishedAt!) - Date.parse(dailyDerived.startedAt)) / 1000} s`,
      queriesDuringRefresh: latency.length,
      medianMs: latency[Math.floor(latency.length / 2)],
      maxMs: latency[latency.length - 1]
    })
    gate(
      (Date.parse(dailyDerived!.finishedAt!) - Date.parse(dailyDerived!.startedAt)) / 1000 <= 30,
      'current-season rebuild ≤ 30 s'
    )
    gate(latency[latency.length - 1] <= 1000, 'queries answer during a refresh')

    // 3. Performance budgets (spec §11), warm.
    const time = async (q: StatsQuery): Promise<number> => {
      await service.query(q)
      return (await service.query(q)).ms
    }
    const core = CATALOGUE.filter(
      (m) =>
        m.entity === 'player' &&
        m.tier === 'core' &&
        (m.positions === 'all' || m.positions.includes('WR'))
    )
      .map((m) => m.id)
      .slice(0, 15)
    const budgets = {
      leaderboard: await time({
        entity: 'player',
        metrics: core,
        scope: { seasons: [2025], positions: ['WR'] }
      }),
      dashboard: await time({
        entity: 'player',
        metrics: core.slice(0, 12),
        scope: { seasons: [2025], players: ['00-0039337'] },
        groupBy: ['week']
      }),
      situational: await time({
        entity: 'player',
        metrics: ['yprr', 'tprr', 'rec_epa'],
        scope: { seasons: [2025], positions: ['WR'] },
        situation: { pressure: true }
      }),
      teams: await time({
        entity: 'team',
        metrics: CATALOGUE.filter((m) => m.entity === 'team' && m.tier === 'core')
          .slice(0, 30)
          .map((m) => m.id),
        scope: { seasons: [2025] }
      })
    }
    console.log(budgets)
    gate(budgets.leaderboard <= 500 && budgets.teams <= 500, 'leaderboards ≤ 500 ms')
    gate(budgets.dashboard <= 300, 'dashboard ≤ 300 ms')
    gate(budgets.situational <= 1000, 'situational ≤ 1 s')
    for (const entity of ['player', 'team'] as const) {
      const ids = CATALOGUE.filter((m) => m.entity === entity).map((m) => m.id)
      for (let i = 0; i < ids.length; i += 40) {
        const r = await service.query({
          entity,
          metrics: ids.slice(i, i + 40),
          scope: { seasons: [2025] }
        })
        gate(r.rows.length > 0, `every ${entity} metric answers (${i})`)
      }
    }
    service.close()
    gate(statSync(path).size <= 400e6, 'file ≤ 400 MB')
    console.log({ fileMb: Math.round(statSync(path).size / 1e6) })

    const db = await StatsDb.open(path)
    // 4. The SQL scoring equals the app's scoring engine on every line (the league's rules).
    const lines = await db.all<Record<string, unknown>>(`
    SELECT s.*, f.points AS sql_points, f.position AS pos FROM fantasy_week f
    JOIN (SELECT * FROM src_sleeper UNION ALL BY NAME SELECT * FROM src_sleeper_def) s
      ON s.player_id = f.player_id AND s.season = f.season AND s.season_type = f.season_type
     AND f.week = CASE WHEN s.season_type = 'POST' THEN (CASE WHEN s.season <= 2020 THEN 17 ELSE 18 END) + s.week ELSE s.week END
    WHERE f.scoring = 'league' AND f.season IN (2019, 2025, 2026)`)
    let same = 0
    let fiftyBucket = 0
    for (const row of lines) {
      const stats: Record<string, number> = {}
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'number' && !['season', 'week', 'sql_points'].includes(k)) stats[k] = v
      }
      const pos = asPosition(row.pos as string)
      if (
        Math.abs(
          scoreStatLine(sleeperStatLine(stats, pos), rules, pos) - (row.sql_points as number)
        ) < 0.011
      )
        same++
      else if (stats.fgm_50p !== undefined && stats.fgm_50_59 === undefined) fiftyBucket++
    }
    console.log('scoring twin', { lines: lines.length, same, fiftyBucket })
    gate(
      same + fiftyBucket === lines.length,
      'SQL scoring = scoreStatLine (but the pre-2024 50+ bucket)'
    )
    const current = await db.all<{ pos: string; agree: number }>(`
    SELECT f.position AS pos, avg((abs(f.points - coalesce(s.pts_ppr, 0)) < 0.011)::INT) AS agree
    FROM fantasy_week f JOIN (SELECT * FROM src_sleeper UNION ALL BY NAME SELECT * FROM src_sleeper_def) s
      ON s.player_id = f.player_id AND s.season = f.season AND s.season_type = f.season_type AND s.week = f.week
    WHERE f.scoring = 'ppr' AND f.season = 2026 AND f.position IN ('QB', 'RB', 'WR', 'TE', 'K', 'DEF')
    GROUP BY 1 ORDER BY 1`)
    console.log(
      'PPR preset vs Sleeper pts_ppr, 2026',
      current.map((r) => `${r.pos} ${pct(r.agree)}`)
    )
    for (const r of current) gate(r.agree >= 0.98, `PPR preset ${r.pos} 2026`)

    // 5. Expected points under ffopportunity's rules reproduce its own.
    const ffo = expectedPointsSql({
      scoring: {
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -2,
        pass_2pt: 2,
        rush_yd: 0.1,
        rush_td: 6,
        rush_2pt: 2,
        rec: 1,
        rec_yd: 0.1,
        rec_td: 6,
        rec_2pt: 2
      },
      positionOverrides: {}
    })
    const xfp = await db.all<{ season: number; within: number }>(`
    SELECT f.season, avg((abs(${ffo} - f.total_fantasy_points_exp) <= 0.1)::INT) AS within
    FROM src_ff_opportunity f, (SELECT 'WR' AS position) s GROUP BY 1 ORDER BY 1`)
    console.log(
      'xFP within 0.1',
      xfp.map((r) => `${r.season} ${pct(r.within)}`)
    )
    for (const r of xfp) gate(r.within >= 0.99, `xFP ${r.season}`)

    // 6. player_week and team_week agree with nflverse's box scores.
    const box = await db.all<Record<string, number>>(`
    SELECT b.season, avg((coalesce(w.targets, 0) = coalesce(b.targets, 0))::INT) AS targets,
      avg((coalesce(w.carries, 0) = coalesce(b.carries, 0))::INT) AS carries,
      avg((coalesce(w.receptions, 0) = coalesce(b.receptions, 0))::INT) AS receptions,
      avg((coalesce(w.pass_yds, 0) = coalesce(b.passing_yards, 0))::INT) AS pass_yds,
      avg((coalesce(w.rush_yds, 0) = coalesce(b.rushing_yards, 0))::INT) AS rush_yds,
      avg((coalesce(w.rec_yds, 0) = coalesce(b.receiving_yards, 0))::INT) AS rec_yds
    FROM src_player_stats b LEFT JOIN player_week w ON w.gsis_id = b.player_id AND w.season = b.season
      AND w.season_type = b.season_type AND w.week = b.week
    WHERE b.season IS NOT NULL GROUP BY 1 ORDER BY 1`)
    console.log(
      'box',
      box.map(
        (r) =>
          `${r.season} ${pct(r.targets)} ${pct(r.carries)} ${pct(r.receptions)} ${pct(r.pass_yds)} ${pct(r.rush_yds)} ${pct(r.rec_yds)}`
      )
    )
    for (const r of box) {
      gate(
        Math.min(r.targets, r.carries, r.receptions, r.pass_yds) >= 0.999,
        `box counts ${r.season}`
      )
      gate(Math.min(r.rush_yds, r.rec_yds) >= 0.998, `box yards ${r.season}`)
    }
    const team = await db.all<Record<string, number>>(`
    SELECT b.season, avg((coalesce(t.off_pass_yds, 0) = coalesce(b.passing_yards, 0))::INT) AS pass_yds,
      avg((coalesce(t.off_carries, 0) = coalesce(b.carries, 0))::INT) AS carries,
      avg((coalesce(t.off_targets, 0) = coalesce(b.targets, 0))::INT) AS targets
    FROM src_team_stats b JOIN team_week t ON t.team = b.team AND t.game_id = b.game_id GROUP BY 1 ORDER BY 1`)
    console.log(
      'team',
      team.map((r) => `${r.season} ${pct(r.pass_yds)} ${pct(r.carries)} ${pct(r.targets)}`)
    )
    for (const r of team)
      gate(Math.min(r.pass_yds, r.carries, r.targets) >= 0.995, `team box ${r.season}`)

    // 7. Keys are unique; every scorer is linked.
    const keys = await db.get<Record<string, number>>(`SELECT
    (SELECT count(*) - count(DISTINCT (gsis_id, season, season_type, week)) FROM player_week) AS pw,
    (SELECT count(*) - count(DISTINCT (gsis_id, season, season_type)) FROM player_season) AS ps,
    (SELECT count(*) - count(DISTINCT (team, game_id)) FROM team_week) AS tw,
    (SELECT count(*) - count(DISTINCT (player_id, season, season_type, week, scoring)) FROM fantasy_week) AS fw,
    (SELECT count(*) FROM fantasy_week WHERE scoring = 'ppr' AND points <> 0 AND gsis_id IS NULL
       AND position IN ('QB', 'RB', 'WR', 'TE')) AS unlinked`)
    console.log('keys', keys)
    gate(
      Object.values(keys ?? {}).every((n) => n === 0),
      'unique keys, linked scorers'
    )
    db.close()

    console.log(fails.length === 0 ? 'ALL GATES PASSED' : `GATES FAILED: ${fails.join('; ')}`)
    if (fails.length > 0) throw new Error(fails.join('; '))
  }
)
```

```bash
npx vitest run tests/zz-y-live.test.ts --reporter=verbose
```

Expected (2026-10-17, state 2026 week 6), within the budgets the gates set:

- **Backfill:** about 160 s, the peak around 2.4 GB, `derived: 'ok all seasons 23.3 s'`, and only `stats:participation:2026` skipped.
- **Forced daily refresh:** about 15 s, peak 1.1 GB, `derived: 'seasons 2026 1.6 s'`. About 29 queries during it, median 15 ms, max 89 ms.
- **Budgets:** `{ leaderboard: 83, dashboard: 50, situational: 69, teams: 107 }` (ms), every metric answers, `{ fileMb: 350 }`.
- **Scoring twin:** `{ lines: 82958, same: 82880, fiftyBucket: 78 }`.
- **PPR preset vs Sleeper's `pts_ppr`, 2026:** DEF, QB, RB, TE, WR 100.00, K 98.31.
- **xFP within 0.1:** 99.49–99.82 in every season.
- **Box** (targets, carries, receptions, passing, rushing, receiving yards): 99.99–100 for the counts and passing yards, ≥ 99.98 rushing yards, 99.85–99.96 receiving yards. **Team:** 99.82–100.
- **Keys:** `{ pw: 0, ps: 0, tw: 0, fw: 0, unlinked: 0 }`.

and `ALL GATES PASSED`. If a gate fails, stop and report the numbers.

- [ ] **Step 2: Remove the throwaway file**

```bash
rm tests/zz-y-live.test.ts && git status --short
```

Expected: only the unrelated changes of Global Constraints.

---

### Task 8: Docs

**Files:**

- Modify: `docs/reference/stats-database.md`, `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`

- [ ] **Step 1: The data reference**

````diff
diff --git a/docs/reference/stats-database.md b/docs/reference/stats-database.md
index 48af0d1..391d484 100644
--- a/docs/reference/stats-database.md
+++ b/docs/reference/stats-database.md
@@ -1,13 +1,16 @@
 # Stats database — data reference
 
-Added in v0.25.0 (Plan X; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §2–§4, amended in §15). It replaces the SQLite stats warehouse of v0.20–v0.24 (`warehouse.db`, deleted on the first launch of v0.25.0). Every stat the free, keyless sources publish, 2019 through the current season, in a DuckDB file, `stats.duckdb` beside `companion.db`. It is about 285 MB after the backfill and settles around 305 MB under daily refreshes (measured 2026-10-16). Deleting the file makes the next refresh rebuild it in 2–3 minutes. **Nothing in the app reads it yet**: Plan Y builds the metric layer and query engine on it.
+Added in v0.25.0 (Plan X; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §2–§4, amended in §15). It replaces the SQLite stats warehouse of v0.20–v0.24 (`warehouse.db`, deleted on the first launch of v0.25.0). Every stat the free, keyless sources publish, 2019 through the current season, in a DuckDB file, `stats.duckdb` beside `companion.db`. Deleting the file makes the next refresh rebuild it in about 2½ minutes.
+
+v0.26.0 (Plan Y; spec §5–§7, amended in §16) adds the derived tables, the metric catalogue and the query engine the stats screens read through. The file is about 345 MB after the backfill (measured 2026-10-17).
 
 ## Engine
 
-- One worker thread (`out/main/statsWorker.js`, `src/main/stats/worker.ts`) owns the file. The main process talks to it through `StatsClient` (`src/main/stats/client.ts`): `refresh`, `selfTest`, `close`.
+- One worker thread (`out/main/statsWorker.js`, `src/main/stats/worker.ts`) owns the file. The main process talks to it through `StatsClient` (`src/main/stats/client.ts`): `refresh`, `setLeague`, `query`, `catalogue`, `status`, `selfTest`, `close`.
+- Writes (`refresh`, `setLeague`, `selfTest`, `close`) run one after another. Reads (`query`, `catalogue`, `status`) run at once on a second connection, so a screen never waits behind a refresh: during a forced refresh, queries took 16 ms (median) and 66 ms at most.
 - DuckDB `@duckdb/node-api` 1.5.6. Its native binding loads from `app.asar.unpacked` (`asarUnpack` in `electron-builder.yml`). Parquet, JSON and ICU are built in, and no extension is ever downloaded.
 - Settings: `memory_limit` 512 MB, 2 threads, `preserve_insertion_order` off, spill files in `<userData>/stats-tmp/duckdb`. The backfill peaks around 1.8–2.2 GB of process memory, and a forced daily refresh around 0.8 GB.
-- `FantasyCompanion.exe --stats-self-test=<file>` opens a throwaway database in the worker, writes, reads and round-trips Parquet. It checks `read_json` and an ICU time zone, writes `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true,"json":true,"icu":true}` to `<file>` and exits 0. The Release and Package check workflows run it on the Windows build.
+- `FantasyCompanion.exe --stats-self-test=<file>` opens a throwaway database in the worker, writes, reads and round-trips Parquet. It checks `read_json` and an ICU time zone, answers an engine query over a throwaway schema, writes `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true,"json":true,"icu":true,"query":true}` to `<file>` and exits 0. The Release and Package check workflows run it on the Windows build.
 - **Postseason weeks differ by source.** Sleeper numbers playoff weeks 1–4 (`season_type` `POST`); nflverse numbers them after the regular season (18–21 through 2020, 19–22 since). NGS skips the Pro Bowl week (Super Bowl 22 / 23) and QBR uses 1–4. Join postseason rows on `game_id` or on the team and the game's date, not on `week`.
 
 ## Tables
@@ -27,7 +30,7 @@ Standard columns: `season` and `week` as `INTEGER` (whatever type the file uses)
 | `src_ff_opportunity`                                         | ffverse `ep_weekly` (expected fantasy points; team totals in `*_team` columns)                                                                                                                                                                                        | player-week              | `player_id` (gsis)          |
 | `src_ngs_passing`, `src_ngs_rushing`, `src_ngs_receiving`    | nflverse `nextgen_stats` (week 0 = season)                                                                                                                                                                                                                            | player-week              | `player_gsis_id`            |
 | `src_pfr_pass`, `src_pfr_rush`, `src_pfr_rec`, `src_pfr_def` | nflverse `pfr_advstats` (weekly)                                                                                                                                                                                                                                      | player-week              | `pfr_player_id`             |
-| `src_qbr_week`, `src_qbr_season`                             | nflverse `espn_data` (ESPN's nickname moves to `team_name`; `team`, `opponent` are codes; `week` = `game_week`)                                                                                                                                                       | player-week / season     | `player_id` (espn)          |
+| `src_qbr_week`, `src_qbr_season`                             | nflverse `espn_data` (ESPN's nickname moves to `team_name`; `team`, `opponent` are codes; `week` = `game_week`; `season_type` REG / POST from ESPN's Regular / Playoffs, version 2)                                                                                   | player-week / season     | `player_id` (espn)          |
 | `src_injuries`                                               | nflverse `injuries`                                                                                                                                                                                                                                                   | player-week              | `gsis_id`                   |
 | `src_depth_charts`                                           | nflverse `depth_charts`, weekly rows through 2024                                                                                                                                                                                                                     | player × slot × week     | `gsis_id`                   |
 | `src_depth_chart_snapshots`                                  | nflverse `depth_charts`, timestamped snapshots from 2025                                                                                                                                                                                                              | player × slot × snapshot | `gsis_id`, `espn_id`        |
@@ -96,8 +99,49 @@ Rebuilt after every refresh that loaded rows (`stats:identity` in the log).
   - A file that is not published (404) is `skipped` and retried the next day; participation for the current season is the usual case.
   - A step replaces its season's rows in one transaction, so a failed load keeps the old rows.
   - **Quitting** closes the worker first: the running download is aborted, the running statement interrupted, and the step logged `interrupted`. The app quits within a few hundred milliseconds (after 3 s at most, the worker is ended). An `interrupted` step is not an attempt: the next run retries it. Steps a crashed app left `running` are marked `interrupted` on the next open, and stale temp files are cleared.
+- **The derived rebuild.** After the steps, when one loaded rows (or the derived tables are missing or older than `DERIVED_VERSION`), `stats:derived` rebuilds the derived tables for the seasons whose rows changed. A file of all seasons (players, QBR, combine) counts as the current season. A forced daily refresh rebuilds the current season in about 1.5 s. The first build (every season) takes about 25 s.
 - **Downloads.** Parquet from nflverse and ffverse, CSV for the crosswalk, JSON for Sleeper. Files are written to `<userData>/stats-tmp`, read by DuckDB, and deleted. A full backfill downloads about 210 MB of Parquet plus Sleeper's JSON and takes 2–3 minutes. A forced daily refresh runs 24 steps in about 12 s.
 
+## Derived tables
+
+Built by `src/main/stats/derived/` after each refresh (spec §5). Every rate is stored as its numerator and denominator (components), and the engine divides when it reads, so any week range or group is exact.
+
+| Table               | Grain                                        | Holds                                                                                                                                                                                                                                                                                                                                                                        |
+| ------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
+| `team_week`         | team × game (scheduled games too, `games` 0) | `off_*` (by `posteam`) and `def_*` (by `defteam`) sums of the team play components; result, points, `line_margin` (the team's expected margin), `total_line`, `implied_points`; drives (`drives`, `drive_points`, `td_drives`, `three_and_outs`, `drive_start_sum`, `def_drives`, `def_drive_points`); neutral pace; special teams from `src_team_stats`.                    |
+| `player_week`       | gsis × season × season type × week           | About 230 components: passing, dropbacks, rushing, receiving, on-field, defense (from `plays`, `on_field`, `play_players`), the box score (kicking, punting, returns, fumbles, tackles for loss), snaps, NGS, PFR, QBR, ffopportunity; `position` (the week's nflverse roster), `team`, `opponent`, `home`, the team context for shares (`tm_*`), `routes` and `routes_est`. |
+| `player_season`     | gsis × season × season type                  | `player_week` summed, with the latest team and the most common position; NGS and QBR from their season rows.                                                                                                                                                                                                                                                                 |
+| `team_season`       | team × season × season type                  | `team_week` summed over played games.                                                                                                                                                                                                                                                                                                                                        |
+| `fantasy_week`      | Sleeper id × week × scoring                  | `points` and `xpoints` under `ppr`, `half`, `std` and (with a league) `league`; `gsis_id` through `sleeper_ids`; weeks in nflverse's numbering.                                                                                                                                                                                                                              |
+| `team_fantasy_week` | defense × week × scoring                     | `fpa_qb`, `fpa_rb`, `fpa_wr`, `fpa_te`, `fpa_k`: fantasy points each position scored against it.                                                                                                                                                                                                                                                                             |
+
+- **Play components** (`src/main/stats/derived/plays.ts`) are written once, as an expression over one row of `plays`, with the role that gets the credit: `passer`, `dropback`, `rusher`, `receiver`, `onO`, `onD`, `kicker`, `punter`, `defender`. The same expressions build the weekly tables and answer situational queries, so the grains cannot disagree.
+- **Rates need their own denominators.** Participation (pressure, coverage, personnel, box) is known on 89–90 % of dropbacks through 2022 and on every one since; FTN starts in 2022. Each such rate divides by its own "known" count (`db_pressure_known`, `tgt_ftn`, …).
+- **Routes** are dropbacks a player was on the field for, blocking snaps included. In the current season (no participation yet) they are estimated as team dropbacks × offensive snap share, and `routes_est` counts the estimated weeks.
+- **NGS** publishes a week only for players over its weekly minimum (the weekly attempts of only 12 % of rushers add up to their season row), so season values come from NGS's season rows (week 0). Postseason weeks are mapped to nflverse's numbering for NGS (Pro Bowl week skipped), QBR and Sleeper (1–4).
+- **Fantasy scoring.** The presets are Sleeper's current default scoring with 1, ½ and 0 points a reception (`src/shared/stats/scoring.ts`). Lines are scored in SQL by the twin of the app's scoring engine (`DERIVED_STATS`): it gives the same points as `scoreStatLine` on 82,880 of 82,958 lines (2019, 2025, 2026, the user's league). The 78 others are pre-2024 kickers: Sleeper then had one 50+ bucket (`fgm_50p`), which counts here as 50–59. Sleeper's own stored `pts_*` for past seasons use its defaults of the time (an interception −2 through 2021, a 14–20-points-allowed defense 0), so they are not a reference before 2026.
+- **Expected points** score ffopportunity's expected stats with the same rules (bonuses and fumbles have no expected count). Under ffopportunity's own rules they match its `total_fantasy_points_exp` within 0.1 on 99.5–99.8 % of player-weeks (r = 0.999995).
+- **Agreement with nflverse** (2019–2026): targets, receptions, passing yards and sacks 100 %, carries ≥ 99.995 %, rushing yards ≥ 99.98 %, receiving yards ≥ 99.85 % (laterals) of player-weeks; team passing yards, carries and targets 99.8–100 %, rushing yards 99.3–100 % of team-games.
+- **Missing sources.** A source that is not loaded, or a column a source dropped, reads as NULL instead of failing the rebuild.
+- **Memory.** Each season is built on its own, each source into a temporary table first, on one thread: writing `player_week` on two threads needs more than the 512 MB limit.
+
+## Metric catalogue and query engine
+
+- **Catalogue** (`src/shared/stats/catalogue.ts`): 259 metrics, 177 for players and 82 for teams. Each has a formula over component sums (`{targets} / nullif({tm_targets}, 0)`), its sample component and minimum, unit, direction, tier (`core` 92, `extended` 149, `stored` 18), family, sources and coverage. 162 can be split by situation.
+- **Query** (`StatsQuery`, `src/shared/stats/types.ts`; JSON Schema in `src/shared/stats/querySchema.ts`): entity, metrics, scope, situation, groupBy, transform, sort, limit, scoring. The engine (`src/main/stats/engine/`) validates it, compiles it to parameterised SQL over the season tables, the weekly tables or the plays, and runs it for 5 s at most.
+- **Results** carry, per metric, the value (after the transform), the raw value, the sample, `qualified`, the percentile and rank among qualified rows of the same position and group, and `estimated`. Notes state the coverage the answer depends on.
+- **Qualification.** `minSample` is per 17 games, scaled to the weeks a row covers and, for situational queries, to the share of plays the situation keeps.
+- **Speed** on the full database: leaderboards of 15 metrics 60–100 ms, a player's weekly line 46 ms, situational splits 60–75 ms, five seasons of a metric 40 ms; 40 metrics over every player 0.7 s.
+
+```sql
+-- The same numbers the engine reads: 2025 receivers by yards per route run
+SELECT pl.name, s.team, s.routes, round(s.rec_yds / s.routes, 2) AS yprr,
+       round(s.targets / s.tm_targets, 3) AS target_share
+FROM player_season s JOIN players pl USING (gsis_id)
+WHERE s.season = 2025 AND s.season_type = 'REG' AND s.position = 'WR' AND s.routes >= 300
+ORDER BY yprr DESC LIMIT 10;
+```
+
 ## Reading it
 
 ```sql
````

- [ ] **Step 2: The spec amendment**

```diff
diff --git a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
index b5b4905..19d8ac6 100644
--- a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
+++ b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
@@ -1,6 +1,6 @@
 # Stats analysis — design
 
-**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.
+**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X) and 2026-10-17 (§16: Plan Y) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.
 
 **Sources:** the stats catalog (`docs/research/2026-10-09-nfl-stats-catalog.md`), the predictive-metrics catalogue (`docs/research/nfl_predictive_metrics.md`), the coverage audit (`docs/research/2026-10-14-warehouse-coverage-audit.md`), and a DuckDB vs SQLite benchmark on 2023–2025 play-by-play and participation (§3.2).
 
@@ -432,3 +432,32 @@ Measured on the live sources while Plan X was written (its Planning findings), a
   - Quitting closes the worker first (abort the download, interrupt the statement), because Electron aborts if the process exits mid-statement. Interrupted steps are retried on the next run.
   - Team columns are normalised in place in every source (`depth_charts` version 2).
   - Sleeper stat keys that are not plain identifiers are dropped. The self-test also checks `read_json` and ICU.
+
+## 16. Amendment 2026-10-17: the metric layer and the query engine (Plan Y)
+
+Measured on the live database while Plan Y was written (its Planning findings), and taken into the build. `docs/reference/stats-database.md` documents the result.
+
+- **A. Building the derived tables (§5.2).** One season at a time, each source into a temporary table first, on one thread (two threads need more than the 512 MB limit to write `player_week`'s ~230 columns). Each season is one transaction (delete, insert), instead of swapping whole tables. The first build takes about 25 s, a forced daily refresh's about 1.5 s. A source or column that is missing reads as NULL.
+- **B. Percentiles and ranks are computed by the engine (§5.2, §7.2)**, among the qualified rows of the query's own population (same position, same group). `player_season` holds sums only. Any week range, scoring or split then ranks correctly.
+- **C. Fantasy tables.** `fantasy_week` has one row per player-week and scoring (`ppr`, `half`, `std`, `league`), and `team_fantasy_week` holds the points each defense allowed by position. The presets are Sleeper's current defaults. Sleeper's stored `pts_*` follow older defaults in past seasons, so the gate is "the SQL scoring equals the app's scoring engine". Sleeper's single 50+ field-goal bucket before 2024 counts as 50–59. The team rows of ffopportunity (§15 B) are not needed.
+- **D. The query (§7.1).**
+  - It gains `scoring`.
+  - Plan Y's transforms are `raw`, `perGame`, `percentile`, `zScore` and `vsLeague`. `shrunk` and `opponentAdjusted` come with Plan Z's models. `perPlay` is dropped: the rates already are per play.
+  - The JSON Schema is written by hand, typed so that the compiler fails if it and the type drift apart.
+- **E. Qualification.** `minSample` is per 17 games, scaled to the weeks a row covers and, for situational queries, to the share of plays the situation keeps.
+- **F. The catalogue (§6.2)** has 259 metrics (177 player, 82 team); 162 can be split by situation. Left out or changed:
+  - The EPA + CPOE composite needs league standardisation and moves to Plan Z.
+  - Slot / wide / inline rates are out: participation lists positions, not alignment.
+  - Coverage EPA per defender is out: play-by-play does not name the covering defender, so coverage comes from PFR.
+  - Defender pressure rate uses pass snaps (opponent dropbacks on the field), since participation does not say who rushed.
+  - Two-minute and long-down snap shares are out.
+  - Red-zone TD % becomes the TD drive rate.
+- **G. Routes** are dropbacks on the field (blocking included), exact through the prior season and estimated in the current one (§6.2).
+- **H. Season sources.** NGS and QBR season values come from their season rows. Postseason weeks of NGS, QBR and Sleeper are mapped to nflverse's numbering.
+- **I. Reads never wait (§2).**
+  - Queries, the catalogue and the status run at once on a second connection. Refreshes and league rules take turns.
+  - A query is interrupted after 5 s.
+  - Main sends the league's scoring rules before each refresh and on every rules change. Only a change rebuilds the fantasy tables (about 2.5 s).
+- **J. Sync.** `stats:derived` follows `stats:identity`. It rebuilds the seasons whose rows changed, and the current season for an all-seasons file.
+- **K. QBR's season type** was ESPN's "Regular" / "Playoffs"; it is now REG / POST (source version 2).
+- **L. The self-test** also answers an engine query (§11: the packaged worker answers a query).
```

If Task 7 measured different numbers, write the measured ones into both files.

- [ ] **Step 3: Commit**

```bash
npx prettier --write docs/reference/stats-database.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git add docs/reference/stats-database.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git commit -m "docs: stats metric layer and query engine"
```

---

### Task 9: Verify, merge, release

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 835 passed | 5 skipped; the build lists `out/main/statsWorker.js`.

- [ ] **Step 2: The Windows self-test**

**Ask the user before pushing.** Then:

```bash
git push origin feat/stats-metrics-y:check/plan-y
gh run watch "$(gh run list --branch check/plan-y --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
git push origin --delete check/plan-y
```

Expected: green. The log shows `"query":true`.

- [ ] **Step 3: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/stats-metrics-y` against spec §2, §5–§7, §10–§11, the amendments and the Review Focus list. Fix Critical and Important findings, each in its own commit, test first, re-running Step 1 after them.

- [ ] **Step 4: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/stats-metrics-y -m "merge: feat/stats-metrics-y (plan Y)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.26.0" && git tag v0.26.0
git branch -d feat/stats-metrics-y
```

- [ ] **Step 5: Status block**

Replace this plan's Status line with the outcome:

- the merge commit and the tag;
- the Task 7 numbers;
- the review fixes and anything deferred;
- "not GUI-verified (WSLg); no window changes".

Then commit, staging this file only: `git commit -m "docs(plan): mark plan Y complete"`.

- [ ] **Step 6: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.26.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests and the packaged self-test, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.26.0 --draft=false`). The release notes should say:

- The first launch builds the stats tables in about 25 s, in the background.
- No screen changes yet: the stats screens come in the next releases.

---

## Self-review against the spec

- **§2 Architecture.** The analytics worker stays the only owner of the file. Reads run on a second connection, never behind a write (Task 5). `companion.db` is not attached: main sends the league's rules (Tasks 5–6).
- **§5 Derived layer.**
  - Sums, not averages: every metric is a formula over component sums (Tasks 2–3).
  - `player_week`, `player_season`, `team_week`, `team_season` and `fantasy_week` (with `team_fantasy_week`) are Task 2.
  - Each is rebuilt for the touched seasons only, one transaction per season (Tasks 2 and 5).
  - Freshness: `status()` gives the latest week, the update time and `busy`, and `stats:changed` tells screens to query again (Tasks 5–6).
- **§6 Catalogue.**
  - Every field of §6.1 is there; `stability` comes with Plan Z.
  - The set of §6.2 is in Task 3, less what Plan Z owns (ratings, forecasts, FG over expected, shrinkage, outlook, RAS, Speed Score) and what amendment F lists.
- **§7 Query engine.**
  - `StatsQuery` and its JSON Schema are Task 3; validation, the choice of grain, parameterised SQL, the timeout, the row cap and the per-metric context are Task 4.
  - Transforms follow amendment D.
- **§10 Toward NLQ.**
  - The JSON Schema (Task 3), descriptions written for an LLM, and results with samples and notes are all here.
  - The query log and the dimension glossary come with the NLQ spec.
- **§11 Testing.**
  - Unit tests per derived table, scoring rule, catalogue rule, compiler rule and runner behaviour.
  - Agreement gates (box score, team stats, scoring twin, expected points), performance budgets, and the packaged self-test answering a query (Tasks 6, 7 and 9).
- **Not in this plan** (by §12): models (Z) and every screen (AA–AE).
