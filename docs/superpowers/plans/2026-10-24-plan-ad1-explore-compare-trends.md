# Plan AD1 — Stats analysis: Explore, Compare and Trends

**Status:** written 2026-10-24, not executed. Generated from the prototype's task commits (branch `proto/plan-ad1`), replayed on a clean copy of `main` with typecheck, lint and the full suite green after each task; the final tree is byte-identical to the prototype.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Explore in Companion Stats (spec §9.5), with its first two tools.

- **Explore** in the Stats nav, between Teams and Games: Chart (the chart explorer, Plan AD2; disabled) · Compare · Trends, over the shared scope, each tab keeping its state for the session.
- **Compare:** three slots side by side, players at one position or teams.
  - Cards (the handoff's player cards; teams with record, division place and Elo) with a swap select; an open slot is a dashed card.
  - Rows: a player position's leaderboard groups, or the team groups (offense, defense, special teams, situational), each cell ranked among the position's qualified players or the 32 with the handoff's pill-dot bar; the best value bold and counted toward "Leads n of m".
  - A weekly chart: fantasy points, or a team's EPA per play (offense or defense), with the pool's median dashed.
- **Trends:** a metric by season, 2019 → now, for a player or a team and up to two more.
  - The position's qualified median and middle half each season; a season below the qualifier hollow; team changes and ages on the axis; a hover card.
  - A table (the change from the season before toned by the better side, percentile, rank, sample) and career at a glance (six core metrics as percentile sparklines).
  - One season only: "Trends need two seasons"; coverage notes ("Charted from 2022.", "Not published for 2026 yet.", "Estimated for 2026.").
- **Entry points:** the player and team dashboards' Compare buttons seed Compare; a stat line's trend icon opens Trends on its metric.
- **Data:** red-zone TD rates for teams, both sides (new `team_week` drive counts, `DERIVED_VERSION` 3); a defense's sack and pressure rates named for what it does; a by-season query qualifies each season against its own weeks.
- Ship `v0.34.0`.

**Architecture:**

- **Derived and engine** (`src/main/stats/`): `rz_drives`, `rz_td_drives` and the opponents' in `derived/team.ts`; `bySeason` in `engine/compile.ts` and a per-season qualification factor in `engine/run.ts`.
- **Catalogue** (`src/shared/stats/catalogue.ts`): `off_rz_td_pct`, `def_rz_td_pct`; `teamPair` takes the defense's own text (`defenseText`).
- **Renderer models** (pure, unit-tested):
  - `src/renderer/src/lib/stats/compare.ts`: groups, the query over the position or the 32, the pool, the rows and leads, the cards, default and seeded slots, slot options, the weekly chart and its median; `CompareState`.
  - `src/renderer/src/lib/stats/trends.ts`: core metrics, the metric list, the by-season query, a line ranked per season, the band, the career span, teams by season from weekly rows, ages, the table, coverage notes, career at a glance; `TrendsState`.
- **Charts:** `WeekChart` keeps a slot's colour and marker shape (circle, square, diamond), draws a dashed reference line and flips a lower-is-better axis; `SeasonChart` (new) for Trends. `--s3` joins the series colours.
- **Screens:** `StatsExplore` (the sub-tabs and the scope bar), `StatsCompare`, `StatsTrends`; `StatsNav` gains Explore; `StatsApp` keeps Explore's tab and each tab's state and routes the dashboards' Compare and trend icons. `StatLines` lines take `onTrend`.

**Tech Stack:** Electron 39, React 19, Tailwind 4, `lucide-react`, TypeScript strict, Vitest (jsdom for components), DuckDB (`@duckdb/node-api`) in the stats worker. No chart library: SVG as Plan AB's `WeekChart`.

**Spec:** `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`: §9.5 (Explore), §9.6, §11, the Plan AD row of §12; §6.2 and §7.2 for the metric and the qualification change. Amended by this plan: Task 4 writes the amendments into the spec as §22 and splits the Plan AD row.

**Design:** the "Stats Explore" Claude Design canvas and its handoff, `docs/design/2026-10-23-stats-explore-handoff/` (README sections "7. Compare" amended, "14. Trends", the navigation rows; the view-model specs `stats-compare-teams.js`, `stats-trends.js`); the brief `docs/design/2026-10-23-stats-explore-brief.md`. The handoff's player compare: `docs/design/FantasyCompanion UI/templates/two-products/design_handoff_companion/` README "7. Compare" and `StatsCompare.dc.html`.

The screens reference: `docs/reference/stats-screens.md`.

## Decisions (user, 2026-10-23 and 2026-10-24)

- **One Explore item** between Teams and Games, with Chart · Compare · Trends sub-tabs. **AD is split:** AD1 Compare and Trends (`v0.34.0`), AD2 the chart explorer (`v0.35.0`); AE moves to `v0.36.0` (v0.31.0–v0.33.0 went to dev mode and its notes).
- **Compare** is the handoff's three-slot player compare at one position, **plus the same layout for teams**; the team dashboard gets a Compare button.
- **Explore and Trends were mocked first** ("Stats Explore" canvas), then this plan.
- **Red zone:** add the teams' red-zone TD rate to the catalogue (it had none).
- **Labels:** rename `def_sack_rate` and `def_pressure_rate` to "Sack rate (defense)" and "Pressure rate (defense)"; ids unchanged.
- **Age curve:** later. Trends shows his age under each season and no curve.
- **Colours:** shapes only. `--s1` / `--s2` stay; every series has its own marker shape.

## Planning findings (live data, 2026-10-24)

Measured on a full `stats.duckdb` (2019 – 2026 week 7, a fresh v0.33.0 backfill on a scratch profile) with the code in this plan, and in the built app on a scratch profile with the dev league, unless it says otherwise.

- **The backfill can miss whole seasons.** Its play-by-play steps for 2020 and 2021 failed (`stats:pbp:2020 error fetch failed`) and are not retried within a day: `player_season` had no targets for those seasons and the WR yards-per-route band was empty for them. Deleting the two `sync_log` rows and running the app again filled them (2020: 525 player-seasons with targets, 2021: 535). Task 5 says how.
- **A by-season query held every season to the average of the seasons in scope.** `rowWeeks` divided the weeks in scope by the seasons, so over 2019–2026 each season needed about 16 weeks' sample: 2026 week 7 qualified 48 of its 98 WRs (QBs 20 of 34, DBs 44 of 158), and full seasons slightly more than their own (2025 WRs 115, not 110). Trends ranks each season among that season's qualified players, so the engine now qualifies each season against its own weeks (amendment D): 98, 34 and 158, the same as a 2026-only query.
- **Red-zone TD rate.** No team metric existed; the brief asked for one. Drives with a play inside the opponent's 20 and those ending in a touchdown are counted in `team_week` (offense and the opponents'): 2025 60.7 % on average (47.5–71.7 %, PHI first on 60 such drives), 2026 62.9 % (46.7–84.6 %). The derived rebuild takes 25.5 s.
- **Compare is fast enough as one query over the position.** 21–89 ms for the nine positions and the 32 teams (63–367 rows), the weekly chart 12–37 ms. In the app: Explore to Compare on screen 160–205 ms, a position or Players / Teams 135–185 ms (budget 300 ms, §11).
- **Defaults read right.** 2026 week 7: WR Smith-Njigba, Nacua, Olave; RB Walker, Robinson, Cook; with the dev league my best WR (Jalen Coker) takes slot 3. Teams by Elo: SF, BUF, SEA. Seeded: BUF with SEA (1,647) and SF (1,654), KC with CHI and NE, NYJ with MIA and ARI.
- **Pressure rate is participation data**, through the prior season only, both sides (`lastSeason: 'prior'`), and a DL's pressure rate too: its Compare row reads "Not published for 2026 yet." and is not counted toward Leads.
- **A team's rows are never per game.** The walk-through showed FG over expected labelled "per game" with the season total; team rows ignore Totals / Per game.
- **Trends is one query per position.** Every row at the position grouped by season (296–3,386 rows) gives the lines, the band and every season's rank: 44–188 ms; a team's 45 ms. In the app: the Trends tab 245–255 ms, a new metric 220–290 ms.
- **Trades.** 31 WR seasons of 2024–25 have two teams. A query grouped by season and team returns them by games (Davante Adams 2024 read "NYJ → LV"); his weekly rows give the order (LV weeks 1–3, NYJ from week 7): "LV → NYJ", and "GB 2019–21, LV 2022–24, NYJ 2024, LAR since 2025".
- **One season.** 40 of the 625 WRs with a row since 2019 have only 2026 (Carnell Tate, TEN): "Trends need two seasons; he has one." with his 2026 value and rank.
- **Team metrics are `positions: 'all'`.** The position check alone let them into a player's metric list; picking "EPA per play" for James Cook answered `"off_epa_play" is a team metric, not a player one`. Player lists now ask for player metrics.
- **Ages.** The dashboard's header shows his age that season on September 1, this season's today; Trends uses the same rule (Cook 27 in October 2026).
- **State across tabs.** A late default (Compare's first slots) written from a stale copy undid the Players / Teams choice; Explore's state updates from the state as it is then. Trends follows the dashboards' player until something is picked in it, then keeps its own.

## Spec amendments (taken in this plan)

Task 4 Step 3 records these in the spec as §22. **Confirm them with the user before starting Task 1** if they have not been approved yet.

- **A. Explore (§9.5, §9.1).** One nav item between Teams and Games; sub-tabs Chart (Plan AD2), Compare, Trends, each keeping its state for the session. AD is split: AD1 Compare and Trends, AD2 the chart explorer.
- **B. Compare** is three slots (not 2–4): the handoff's player compare at one position, and the same layout for teams. Players: the position leaderboard's groups, ranked among the position's qualified players who meet the metric's own sample (§21 B); counts per game or totals. Teams: Offense, Defense, Special teams, Situational, among the 32. The best value bold and counted toward "Leads n of m" (none on a tie between every slot, or a metric with no better side). Defaults: the top three, my best player in slot 3 when none of mine is there; teams by Elo. A dashboard's Compare seeds that player and the position's top two, or that team and the two teams nearest it in Elo. A weekly chart with the pool's median.
- **C. Trends.** A metric by season, 2019 → now, for a player or a team and up to two more of the same position; one query over the position by season; the position's qualified median and 25th–75th band; hollow non-qualified seasons; team changes and ages under each season; deltas toned by the better side; six core metrics at a glance; coverage notes; "Trends need two seasons". The age curve is deferred.
- **D. Qualification by season (§7.2).** A query grouped by season (not by week) qualifies each season against its own weeks.
- **E. Catalogue (§6.2).** `off_rz_td_pct`, `def_rz_td_pct` (touchdown drives among drives with a play inside the opponent's 20); `team_week` gains the drive counts, `DERIVED_VERSION` 3. A defense's sack and pressure rates are named for what it does.
- **F. Entry points.** The player and team dashboards' Compare buttons; a stat line's trend icon (on hover or focus; not on split lines).
- **G. Charts.** Every series has its own marker shape as well as its colour; `--s3` joins the series colours.
- **H. Measured** (2026 week 7): the numbers above.

## Global Constraints

- **Branch** `feat/compare-trends-ad1` off `main`.
- **Commits.** One Conventional Commit per "Commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- **Never stage these.** The working tree has unrelated changes that are not part of this plan:
  - `.gitignore`, `.design-sync/`, `docs/design/FantasyCompanion UI/`;
  - `docs/research/nfl_predictive_metrics.md:Zone.Identifier`;
  - `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts`;
  - `tsconfig.node.tsbuildinfo`, `tsconfig.web.tsbuildinfo`.

  Stage files by name; never run `git add -A` or `git add .`.

- **Formatting and lint.**
  - Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`** (it rewrites the Sleeper fixtures).
  - Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
  - Typecheck with `npm run typecheck`.
- **Copy the code exactly.** Every new file is given whole. Every change to an existing file is a diff that `git apply` takes as written: save it to a file and run `git apply <file>`, or make the same edit by hand. The tasks were replayed in order on a clean copy of `main`, with typecheck, lint and the full suite green after each, and the final tree is byte-identical to the prototype.
- **Test counts** are those of a clean checkout (`main`: 1109 passed, 5 skipped). In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3.
- **Scope.**
  - The engine changes only by the per-season qualification (Task 1); the derived tables only by the drive counts.
  - The player and team dashboards change only by their Compare buttons and the stat lines' trend icon; the shared chart by slot colours, shapes, a reference line and a flipped axis.
  - No chart explorer (AD2: its tab is disabled), no age curve, no matchups (AE): Games stays disabled.
- **Network.** No test touches the network. Task 5's live check opens a copy of the live database offline; its app runs refresh their scratch profiles.
- **Gates.**
  - **Task 5:** the live check ends with `ALL GATES PASSED`, and every screenshot of the walk-through shows what its checklist says.
  - **Task 6 Step 2:** the Windows suite and self-test on the Package check workflow.
  - If a gate fails, stop and report the numbers or the screenshot to the user.
- **Release** `v0.34.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push**: `check/plan-ad1` in Task 6, then `main` and the tag.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **A rank against the wrong population.** Examples: a slot ranked among every player with a game, a season ranked among all eight seasons, a season in progress held to a full season's sample.
   - Task 1: the per-season factor (compile and run tests). Task 2: `comparePool`, `compareView` (a player below the qualifier has a value and no percentile), `trendLine` (each season among its own pool).
   - Task 5: 2026 qualified counts equal a 2026-only query's.
2. **The wrong best value.** Examples: the higher drop rate bold, a neutral metric "led", a tie between all three bolding everyone, a missing row counted toward Leads.
   - Task 2: `compareView`'s leads (lower is better, neutral, ties, a missing row).
3. **A team's row or a player's list from the other entity.** Examples: team rows per game, a team metric in a player's Trends list, a player's swap select listing another position.
   - Task 2: `trendMetrics` (player metrics only), `slotOptions`. Task 3: FG over expected is not "per game".
4. **A team change read backwards.** Examples: a traded player's teams in games order, a team mark under every season.
   - Task 2: `teamsBySeason` from weeks in any order, `teamMarks`, `teamRuns`. Task 5: the 2024–25 trades.
5. **State that undoes a choice.** Examples: the default slots overwriting Players / Teams, Trends snapping back to the dashboard's player after a position change, a new metric losing the player.
   - Task 3: the Explore tests (Teams after the defaults, following the dashboard until a choice).
6. **The engine change leaks.** The per-season factor must apply only to queries grouped by season and not by week; other queries keep one factor.
   - Task 1: `bySeason` in compile tests; the run test's two seasons.
7. **AA's, AB's and AC's screens regress.** The dashboards' headers gain Compare, the stat lines a trend icon, the shared chart colours and shapes.
   - Task 3 keeps the dashboard and chart tests green and adds the routes.
8. **Too slow.** Trends reads every row at the position for eight seasons. Task 5: in budget in the worker and in the app.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/compare-trends-ad1
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/compare-trends-ad1`.

---

### Task 1: Red-zone TD rates, qualification by season (spec §6.2, §7.2; amendments D, E)

`team_week` counts the drives with a play inside the opponent's 20 and those ending in a touchdown, for the offense and its opponents, and the catalogue reads them as each side's red-zone TD rate. A defense's sack and pressure rates get their own names. A query grouped by season (and not by week) qualifies each season against that season's weeks: `weeksSql` answers one row per season and `$factor` becomes a `CASE` on the row's season.

**Files:**

- Modify: `src/main/stats/derived/build.ts`, `src/main/stats/derived/team.ts`, `src/main/stats/engine/compile.ts`, `src/main/stats/engine/run.ts`, `src/shared/stats/catalogue.ts`, `src/shared/stats/samples.ts`, `tests/main/stats/derived/build.test.ts`, `tests/main/stats/engine/compile.test.ts`, `tests/main/stats/engine/run.test.ts`, `tests/shared/stats/catalogue.test.ts`

- [ ] **Step 1: Write the failing tests**

Modify `tests/main/stats/derived/build.test.ts`:

```diff
diff --git a/tests/main/stats/derived/build.test.ts b/tests/main/stats/derived/build.test.ts
index 510e52f..741252a 100644
--- a/tests/main/stats/derived/build.test.ts
+++ b/tests/main/stats/derived/build.test.ts
@@ -179,6 +179,11 @@ describe('the derived tables (stats-analysis spec §5)', () => {
       td_drives: 1,
       drive_points: 7,
       def_drives: 1,
+      // The touchdown drive reached the 8; KC's one drive never got inside the 20.
+      rz_drives: 1,
+      rz_td_drives: 1,
+      def_rz_drives: 0,
+      def_rz_td_drives: 0,
       line_margin: 2.5,
       total_line: 48.5,
       implied_points: 25.5
```

Modify `tests/main/stats/engine/compile.test.ts`:

```diff
diff --git a/tests/main/stats/engine/compile.test.ts b/tests/main/stats/engine/compile.test.ts
index a4843e3..fa5224b 100644
--- a/tests/main/stats/engine/compile.test.ts
+++ b/tests/main/stats/engine/compile.test.ts
@@ -81,6 +81,10 @@ describe('compileQuery (stats-analysis spec §7.2)', () => {
     )
     // Home or road: half the games.
     expect(compile({ scope: { seasons: [2025], home: false } }).rowWeeks(18, 1)).toBe(9)
+    // A row per season qualifies against its own season's weeks (a partial season too).
+    expect(compile({ scope: { seasons: [2025, 2026] }, groupBy: ['season'] }).bySeason).toBe(true)
+    expect(compile({ groupBy: ['season', 'week'] }).bySeason).toBe(false)
+    expect(compile({ scope: { seasons: [2024, 2025] } }).bySeason).toBe(false)
   })

   it('notes coverage the answer depends on', () => {
```

Modify `tests/main/stats/engine/run.test.ts`:

```diff
diff --git a/tests/main/stats/engine/run.test.ts b/tests/main/stats/engine/run.test.ts
index 5dce516..a3f472c 100644
--- a/tests/main/stats/engine/run.test.ts
+++ b/tests/main/stats/engine/run.test.ts
@@ -61,6 +61,27 @@ describe('runQuery (stats-analysis spec §7)', () => {
     expect(r.columns[1]).toMatchObject({ id: 'catch_rate', unit: 'pct', seasons: [2025] })
   })

+  it('qualifies each season of a by-season query against that season’s weeks', async () => {
+    const db = await seeded()
+    // A full 2024 before 2025's one week: the average (9 weeks) would hold 2025 to half a season.
+    await db.exec(`INSERT INTO team_week (team, season, season_type, week, games)
+                   SELECT 'BUF', 2024, 'REG', w, 1 FROM range(1, 18) t(w)`)
+    const r = await runQuery(
+      db,
+      {
+        entity: 'player',
+        metrics: ['target_share'],
+        scope: { seasons: [2024, 2025], positions: ['WR'] },
+        groupBy: ['season']
+      },
+      CTX
+    )
+    // 30 targets per 17 games: one week needs 1.8; his 2 qualify.
+    expect(r.rows.map((x) => [x.id, x.group.season, x.values.target_share.qualified])).toEqual([
+      [WR, 2025, true]
+    ])
+  })
+
   it('splits by situation from the plays', async () => {
     const db = await seeded()
     const r = await runQuery(
```

Modify `tests/shared/stats/catalogue.test.ts`:

```diff
diff --git a/tests/shared/stats/catalogue.test.ts b/tests/shared/stats/catalogue.test.ts
index c0c680e..deed2d0 100644
--- a/tests/shared/stats/catalogue.test.ts
+++ b/tests/shared/stats/catalogue.test.ts
@@ -69,6 +69,29 @@ describe('the metric catalogue (stats-analysis spec §6)', () => {
     expect(Object.keys(schema.properties.situation.properties ?? {})).toContain('withOnField')
   })

+  it('reads a defense’s sacks and pressures as its own, red-zone drives both ways', () => {
+    const m = (id: string): (typeof CATALOGUE)[number] => CATALOGUE.find((x) => x.id === id)!
+    // A defense's sack and pressure rates are what it does to the passer: higher is better.
+    expect([m('def_sack_rate'), m('def_pressure_rate')].map((x) => [x.label, x.direction])).toEqual(
+      [
+        ['Sack rate (defense)', 'higher'],
+        ['Pressure rate (defense)', 'higher']
+      ]
+    )
+    expect(m('off_rz_td_pct')).toMatchObject({
+      label: 'Red-zone TD rate',
+      sample: 'rz_drives',
+      side: 'offense',
+      direction: 'higher'
+    })
+    expect(m('def_rz_td_pct')).toMatchObject({
+      label: 'Red-zone TD rate allowed',
+      sample: 'def_rz_drives',
+      side: 'defense',
+      direction: 'lower'
+    })
+  })
+
   it('names what every sample counts (spec §9.2)', () => {
     expect(CATALOGUE.filter((m) => !SAMPLE_LABELS[m.sample]).map((m) => m.sample)).toEqual([])
   })
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/stats/derived/build.test.ts tests/main/stats/engine/compile.test.ts tests/main/stats/engine/run.test.ts tests/shared/stats/catalogue.test.ts
```

Expected: 4 test files fail: 4 failed | 35 passed. The catalogue has no `off_rz_td_pct` and still says "Sack rate allowed"; `team_week` has no `rz_drives`; `bySeason` is undefined; 2025's WR is held to the average of 2024 and 2025 and does not qualify.

- [ ] **Step 3: Count the drives, add the metrics, qualify by season**

Modify `src/main/stats/derived/build.ts`:

```diff
diff --git a/src/main/stats/derived/build.ts b/src/main/stats/derived/build.ts
index b7db0bc..72ddda1 100644
--- a/src/main/stats/derived/build.ts
+++ b/src/main/stats/derived/build.ts
@@ -7,7 +7,7 @@ import type { Built, Have } from './sql'
 import { teamSeasonSelect, teamWeekSelect } from './team'

 /** Bump to rebuild every season into new tables after a change to how they are built. */
-export const DERIVED_VERSION = 2
+export const DERIVED_VERSION = 3

 /** The derived tables in build order: each reads the ones before it. */
 export const DERIVED_TABLES = [
```

Modify `src/main/stats/derived/team.ts`:

```diff
diff --git a/src/main/stats/derived/team.ts b/src/main/stats/derived/team.ts
index 09f01bc..71f9ea7 100644
--- a/src/main/stats/derived/team.ts
+++ b/src/main/stats/derived/team.ts
@@ -32,6 +32,10 @@ export function teamComponentNames(): string[] {
     'drive_start_sum',
     'def_drives',
     'def_drive_points',
+    'rz_drives',
+    'rz_td_drives',
+    'def_rz_drives',
+    'def_rz_td_drives',
     'pace_secs',
     'pace_plays',
     'implied_points',
@@ -66,7 +70,8 @@ export function teamWeekSelect(have: Have, season: number): Built {
              any_value(p.fixed_drive_result) = 'Touchdown' AS td,
              count(*) FILTER (p.counts AND p.play_type IN ('pass', 'run')) <= 3
                AND any_value(p.fixed_drive_result) = 'Punt' AS three_out,
-             arg_min(p.yardline_100, p.play_id) AS start_yardline
+             arg_min(p.yardline_100, p.play_id) AS start_yardline,
+             coalesce(bool_or(p.yardline_100 <= 20), false) AS rz
       FROM plays p
       WHERE p.posteam IS NOT NULL AND p.fixed_drive IS NOT NULL AND p.season = ${season}
         AND coalesce(p.kickoff_attempt, 0) = 0
@@ -75,7 +80,8 @@ export function teamWeekSelect(have: Have, season: number): Built {
     drives AS (
       SELECT game_id, team, count(*) AS drives, sum(points) AS drive_points,
              count(*) FILTER (td) AS td_drives, count(*) FILTER (three_out) AS three_and_outs,
-             sum(start_yardline) AS drive_start_sum
+             sum(start_yardline) AS drive_start_sum,
+             count(*) FILTER (rz) AS rz_drives, count(*) FILTER (rz AND td) AS rz_td_drives
       FROM drive GROUP BY ALL
     ),
     pace AS (
@@ -108,6 +114,8 @@ export function teamWeekSelect(have: Have, season: number): Built {
            o.* EXCLUDE (team, game_id), d.* EXCLUDE (team, game_id),
            dr.drives, dr.drive_points, dr.td_drives, dr.three_and_outs, dr.drive_start_sum,
            od.drives AS def_drives, od.drive_points AS def_drive_points,
+           dr.rz_drives, dr.rz_td_drives,
+           od.rz_drives AS def_rz_drives, od.rz_td_drives AS def_rz_td_drives,
            pc.pace_secs, pc.pace_plays,
            ${Object.entries(TEAM_BOX_COMPONENTS)
              .map(([name, col]) => `${boxCols.has(col) ? `b.${col}` : 'NULL::DOUBLE'} AS ${name}`)
```

Modify `src/main/stats/engine/compile.ts`:

```diff
diff --git a/src/main/stats/engine/compile.ts b/src/main/stats/engine/compile.ts
index d743085..0cf752c 100644
--- a/src/main/stats/engine/compile.ts
+++ b/src/main/stats/engine/compile.ts
@@ -97,6 +97,12 @@ export interface Compiled {
   transform: Transform
   weeksSql: string
   weeksParams: Value[]
+  /**
+   * A row per season (no finer week grain): each season qualifies against its own weeks, so a
+   * season in progress is not held to the average of the seasons in scope. `weeksSql` then
+   * answers one row per season and `$factor` reads the row's season.
+   */
+  bySeason: boolean
   /** `$factor` is replaced by the qualification factor before it runs. */
   sql: string
   params: Value[]
@@ -902,6 +908,8 @@ export function compileQuery(q: StatsQuery, ctx: CompileContext): Compiled {

   // Qualification scales `minSample` to the weeks a row covers (and, at the play grain, to the
   // share of plays it keeps: 150 routes over a season is about 45 when pressured).
+  const bySeason =
+    c.groupBy.includes('season') && !c.groupBy.includes('week') && q.scope.lastNGames === undefined
   const wp = new Params()
   const weeksWhere = [
     `season IN ${wp.list(q.scope.seasons)}`,
@@ -933,9 +941,10 @@ export function compileQuery(q: StatsQuery, ctx: CompileContext): Compiled {
     grain: c.grain,
     metrics: c.metrics,
     transform: c.transform,
-    weeksSql: `SELECT count(DISTINCT (season, season_type, week))::INTEGER AS weeks FROM team_week
-               WHERE ${weeksWhere.join(' AND ')}`,
+    weeksSql: `SELECT ${bySeason ? 'season, ' : ''}count(DISTINCT (season, season_type, week))::INTEGER AS weeks
+               FROM team_week WHERE ${weeksWhere.join(' AND ')}${bySeason ? ' GROUP BY season' : ''}`,
     weeksParams: wp.values,
+    bySeason,
     sql,
     params: params.values,
     rowWeeks: (weeks, seasons) => {
```

Modify `src/main/stats/engine/run.ts`:

```diff
diff --git a/src/main/stats/engine/run.ts b/src/main/stats/engine/run.ts
index 71bfec0..fa4c72e 100644
--- a/src/main/stats/engine/run.ts
+++ b/src/main/stats/engine/run.ts
@@ -26,10 +26,24 @@ export async function runQuery(
   }, timeoutMs)
   let rows: Record<string, unknown>[]
   try {
-    const scope = await db.get<{ weeks: number }>(compiled.weeksSql, compiled.weeksParams)
-    const seasons = new Set(query.scope.seasons).size
-    const factor = compiled.rowWeeks(scope?.weeks ?? 0, seasons) / FULL_SEASON
-    rows = await db.all(compiled.sql.replaceAll('$factor', factor.toFixed(6)), compiled.params)
+    let factor: string
+    if (compiled.bySeason) {
+      // Each season's own weeks: a row reads its season's factor.
+      const weeks = await db.all<{ season: number; weeks: number }>(
+        compiled.weeksSql,
+        compiled.weeksParams
+      )
+      const when = weeks.map(
+        (w) =>
+          `WHEN ${Number(w.season)} THEN ${(compiled.rowWeeks(w.weeks, 1) / FULL_SEASON).toFixed(6)}`
+      )
+      factor = when.length ? `(CASE a.g_season ${when.join(' ')} ELSE 0 END)` : '0'
+    } else {
+      const scope = await db.get<{ weeks: number }>(compiled.weeksSql, compiled.weeksParams)
+      const seasons = new Set(query.scope.seasons).size
+      factor = (compiled.rowWeeks(scope?.weeks ?? 0, seasons) / FULL_SEASON).toFixed(6)
+    }
+    rows = await db.all(compiled.sql.replaceAll('$factor', factor), compiled.params)
   } catch (err) {
     if (timedOut) throw new StatsQueryError(`the query took longer than ${timeoutMs / 1000} s`)
     throw err
```

Modify `src/shared/stats/catalogue.ts`:

```diff
diff --git a/src/shared/stats/catalogue.ts b/src/shared/stats/catalogue.ts
index 88587db..aae0a9f 100644
--- a/src/shared/stats/catalogue.ts
+++ b/src/shared/stats/catalogue.ts
@@ -2159,9 +2159,13 @@ function teamPair(
   label: string,
   short: string,
   description: string,
-  o: Opts & { defense?: MetricDef['direction'] }
+  o: Opts & {
+    defense?: MetricDef['direction']
+    /** The defense's own label, short label and description, when "allowed" would misread it. */
+    defenseText?: [string, string, string]
+  }
 ): MetricDef[] {
-  const { defense, ...rest } = o
+  const { defense, defenseText, ...rest } = o
   const side = (prefix: 'off' | 'def'): Opts => ({
     ...rest,
     value: rest.value.replaceAll('{x_', `{${prefix}_`),
@@ -2169,24 +2173,23 @@ function teamPair(
   })
   const flip = (d: MetricDef['direction']): MetricDef['direction'] =>
     d === 'higher' ? 'lower' : d === 'lower' ? 'higher' : 'neutral'
+  const [defLabel, defShort, defDescription] = defenseText ?? [
+    `${label} allowed`,
+    `${short} All`,
+    `Allowed by the defense: ${description.charAt(0).toLowerCase()}${description.slice(1)}`
+  ]
   return [
     metric(`off_${id}`, label, short, description, {
       ...side('off'),
       entity: 'team',
       side: 'offense'
     }),
-    metric(
-      `def_${id}`,
-      `${label} allowed`,
-      `${short} All`,
-      `Allowed by the defense: ${description.charAt(0).toLowerCase()}${description.slice(1)}`,
-      {
-        ...side('def'),
-        entity: 'team',
-        side: 'defense',
-        direction: defense ?? flip(rest.direction ?? 'higher')
-      }
-    )
+    metric(`def_${id}`, defLabel, defShort, defDescription, {
+      ...side('def'),
+      entity: 'team',
+      side: 'defense',
+      direction: defense ?? flip(rest.direction ?? 'higher')
+    })
   ]
 }

@@ -2371,7 +2374,8 @@ const TEAM: MetricDef[] = [
     sample: 'x_dropbacks',
     unit: 'pct',
     direction: 'lower',
-    defense: 'higher'
+    defense: 'higher',
+    defenseText: ['Sack rate (defense)', 'Sk% Def', 'The defense’s sacks per dropback faced.']
   }),
   ...teamPair(
     'pressure_rate',
@@ -2385,6 +2389,11 @@ const TEAM: MetricDef[] = [
       family: 'advanced',
       direction: 'lower',
       defense: 'higher',
+      defenseText: [
+        'Pressure rate (defense)',
+        'Prss% Def',
+        'Share of dropbacks faced the defense pressured (participation, through the prior season).'
+      ],
       sources: PART,
       lastSeason: 'prior'
     }
@@ -2441,6 +2450,26 @@ const TEAM: MetricDef[] = [
     'Share of drives ending in a touchdown.',
     { value: ratio('td_drives', 'drives'), sample: 'drives', unit: 'pct', family: 'advanced' }
   ),
+  team(
+    'off_rz_td_pct',
+    'Red-zone TD rate',
+    'RZ TD%',
+    'Share of drives reaching the opponent’s 20 that end in a touchdown.',
+    { value: ratio('rz_td_drives', 'rz_drives'), sample: 'rz_drives', unit: 'pct' }
+  ),
+  team(
+    'def_rz_td_pct',
+    'Red-zone TD rate allowed',
+    'RZ TD% All',
+    'Share of the opponents’ drives reaching the defense’s 20 that end in a touchdown.',
+    {
+      value: ratio('def_rz_td_drives', 'def_rz_drives'),
+      sample: 'def_rz_drives',
+      unit: 'pct',
+      side: 'defense',
+      direction: 'lower'
+    }
+  ),
   team(
     'three_and_out_rate',
     'Three-and-out rate',
```

Modify `src/shared/stats/samples.ts`:

```diff
diff --git a/src/shared/stats/samples.ts b/src/shared/stats/samples.ts
index 8f10fb3..a55b0d6 100644
--- a/src/shared/stats/samples.ts
+++ b/src/shared/stats/samples.ts
@@ -28,6 +28,7 @@ export const SAMPLE_LABELS: Readonly<Record<string, string>> = {
   def_pass_snaps: 'pass snaps',
   def_plays: 'plays faced',
   def_pressure_known: 'dropbacks faced with pressure charted',
+  def_rz_drives: 'red-zone drives faced',
   def_snaps: 'defensive snaps',
   def_third_att: 'third downs faced',
   def_zone: 'dropbacks in zone coverage',
@@ -77,6 +78,7 @@ export const SAMPLE_LABELS: Readonly<Record<string, string>> = {
   routes: 'routes',
   routes_man: 'routes against man',
   routes_zone: 'routes against zone',
+  rz_drives: 'red-zone drives',
   tackle_depth_n: 'tackles with a depth',
   targets: 'targets',
   tgt_contested: 'contested targets',
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/stats/derived/build.test.ts tests/main/stats/engine/compile.test.ts tests/main/stats/engine/run.test.ts tests/shared/stats/catalogue.test.ts
```

Expected: 4 passed: 39 passed.

- [ ] **Step 5: Format, typecheck, lint, the whole suite**

```bash
npx prettier --check src/main/stats/derived/build.ts src/main/stats/derived/team.ts src/main/stats/engine/compile.ts src/main/stats/engine/run.ts src/shared/stats/catalogue.ts src/shared/stats/samples.ts tests/main/stats/derived/build.test.ts tests/main/stats/engine/compile.test.ts tests/main/stats/engine/run.test.ts tests/shared/stats/catalogue.test.ts
npm run typecheck
npx eslint src tests electron.vite.config.ts
npx vitest run
```

Expected: prettier and typecheck clean, no lint problems, 1111 passed, 5 skipped.

- [ ] **Step 6: Commit**

```bash
git add src/main/stats/derived/build.ts src/main/stats/derived/team.ts src/main/stats/engine/compile.ts src/main/stats/engine/run.ts src/shared/stats/catalogue.ts src/shared/stats/samples.ts tests/main/stats/derived/build.test.ts tests/main/stats/engine/compile.test.ts tests/main/stats/engine/run.test.ts tests/shared/stats/catalogue.test.ts
git commit -F - <<'EOF'
feat(stats): red-zone TD rates, qualify by season

team_week counts the drives that reach the opponent's 20 and those
that end in a touchdown, both sides; the catalogue reads them as
off_rz_td_pct and def_rz_td_pct. A defense's sack and pressure rates
are named for what it does ("Sack rate (defense)"), not "allowed".
DERIVED_VERSION 3: one rebuild on first launch.

A query grouped by season over several seasons qualifies each season
against its own weeks: the season in progress was held to the average
of the seasons in scope.
EOF
```

---

### Task 2: The Compare and Trends models (spec §9.5; amendments B, C)

Two pure modules the screens read. Compare: the rows (a player position's leaderboard groups, or the four team groups), one query over the position or the 32, the pool a slot ranks among, each row's cells and the best value, the cards, the default and seeded slots, the swap options, the weekly chart and the pool's median. Trends: the metric list, six core metrics, one query over the position by season, a line ranked among each season's pool, the band, the career span, his teams from his weekly rows, ages, the table, coverage notes and career at a glance.

**Files:**

- Create: `src/renderer/src/lib/stats/compare.ts`, `src/renderer/src/lib/stats/trends.ts`, `tests/renderer/lib/statsCompare.test.ts`, `tests/renderer/lib/statsTrends.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/lib/statsCompare.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  chartMetric,
  compareGroups,
  compareQuery,
  comparePool,
  compareSeries,
  compareView,
  defaultSlots,
  playerCard,
  slotOptions,
  teamCard,
  TEAM_GROUPS,
  weeklyCompareQuery,
  type Slots
} from '@/lib/stats/compare'
import type { StatsOwnership, StatsResult } from '@shared/stats/types'
import { catalogueMap, result, row, STATUS, value } from '../../fixtures/statsScreens'

const byId = catalogueMap()
const scope = { season: 2026, seasonType: 'REG' as const, weeks: null, scoring: 'ppr' as const }

/** Five WRs ranked by receiving yards; p3 below the WR qualifier (target share), p9 a TE. */
function receivers(): StatsResult {
  const v = (n: number, qualified = true): ReturnType<typeof value> =>
    value(n, { qualified, sample: 40 })
  const wr = (
    id: string,
    name: string,
    yds: number,
    drops: number,
    over = {}
  ): ReturnType<typeof row> =>
    row(
      id,
      name,
      {
        rec_yds: v(yds),
        target_share: v(yds / 1000, id !== 'p3'),
        drop_rate: v(drops),
        rec_adot: v(10)
      },
      over
    )
  return result(
    ['rec_yds', 'target_share', 'drop_rate', 'rec_adot'],
    [
      wr('p0', 'Ja’Marr Chase', 700, 0.02),
      wr('p1', 'Puka Nacua', 650, 0.05),
      wr('p2', 'CeeDee Lamb', 500, 0.03),
      wr('p4', 'Zay Flowers', 400, 0.08),
      wr('p3', 'Few Snaps', 900, 0.01),
      wr('p9', 'Tight End', 990, 0.01, { position: 'TE' })
    ]
  )
}

const groups = [{ label: 'Receiving', metrics: ['rec_yds', 'drop_rate', 'rec_adot'] }]

describe('Compare (stats-analysis spec §9.5)', () => {
  it('rows a player position by its leaderboard groups, teams by the four team groups', () => {
    expect(compareGroups('player', 'WR', byId).map((g) => g.label)).toEqual([
      'Usage',
      'Receiving',
      'Efficiency',
      'Fantasy'
    ])
    const teams = compareGroups('team', 'WR', byId)
    expect(teams.map((g) => g.label)).toEqual(TEAM_GROUPS.map(([label]) => label))
    // Every team metric is in the catalogue (the red-zone rates came with Plan AD1).
    expect(teams.flatMap((g) => g.metrics)).toEqual(TEAM_GROUPS.flatMap(([, ids]) => ids))
  })

  it('asks for the whole position with its qualifier and sort, or every team with its record', () => {
    const q = compareQuery('player', 'WR', groups, scope, STATUS, true)
    expect(q).toMatchObject({
      entity: 'player',
      transform: 'perGame',
      scope: { seasons: [2026], positions: ['WR'] },
      limit: 5000
    })
    expect(q.metrics).toEqual(['rec_yds', 'drop_rate', 'rec_adot', 'target_share'])
    const t = compareQuery('team', 'WR', compareGroups('team', 'WR', byId), scope, STATUS, true)
    // Team rows are rates: never per game. The card needs the record and Elo.
    expect(t).toMatchObject({ entity: 'team', transform: 'raw', limit: 40 })
    expect(t.scope.positions).toBeUndefined()
    expect(t.metrics).toEqual(
      expect.arrayContaining(['wins', 'losses', 'points_for', 'points_against', 'elo'])
    )
  })

  it('ranks each slot among the position’s qualified players and leads by the better side', () => {
    const res = receivers()
    const pool = comparePool('player', 'WR', res)
    expect([...pool].sort()).toEqual(['p0', 'p1', 'p2', 'p4'])
    const slots: Slots = ['p1', 'p3', 'p0']
    const view = compareView(res, slots, groups, byId, pool, false, 2026)
    const [yds, drops, adot] = view.groups[0].rows
    // p3 (900 yds) is below the qualifier: no percentile, but his value can still lead the row.
    expect(yds.cells.map((c) => [c?.text, c?.percentile ?? null, c?.lead])).toEqual([
      ['650', (100 * 2) / 3, false],
      ['900', null, true],
      ['700', 100, false]
    ])
    expect(yds.sub).toBe('total')
    // Lower is better for drops: p3's 1% leads; Chase 2% is the pool's best (100th).
    expect(drops.cells.map((c) => c?.lead)).toEqual([false, true, false])
    expect(drops.cells[2]?.percentile).toBe(100)
    expect(drops.cells[2]?.rank).toBe('#1')
    // aDOT has no better side: nobody leads it, and it is not counted.
    expect(adot.cells.some((c) => c?.lead)).toBe(false)
    expect(view.leads).toEqual([0, 2, 0])
    expect(view.counted).toBe(2)
  })

  it('leaves an open slot empty and leads nobody on a tie between every slot', () => {
    const res = receivers()
    const pool = comparePool('player', 'WR', res)
    const view = compareView(res, ['p0', null, 'p0'], groups, byId, pool, true, 2026)
    const yds = view.groups[0].rows[0]
    expect(yds.cells[1]).toBeNull()
    expect(yds.cells.some((c) => c?.lead)).toBe(false)
    expect(yds.sub).toBe('per game')
  })

  it('says why a row is empty for the season', () => {
    const res = receivers()
    const empty: StatsResult = {
      ...res,
      columns: res.columns.map((c) => (c.id === 'drop_rate' ? { ...c, seasons: [] } : c))
    }
    const pool = comparePool('player', 'WR', empty)
    const drops = compareView(empty, ['p0', 'p1', null], groups, byId, pool, false, 2026).groups[0]
      .rows[1]
    expect(drops.missing).toBe('Not published for 2026 yet.')
    expect(drops.cells[0]).toMatchObject({ text: '—', percentile: null, lead: false })
  })

  it('opens on a seed and the top two, or the top three with my best player in slot 3', () => {
    const res = receivers()
    const pool = comparePool('player', 'WR', res)
    expect(defaultSlots('player', 'WR', res, pool, 'p4')).toEqual(['p4', 'p0', 'p1'])
    expect(defaultSlots('player', 'WR', res, pool, null)).toEqual(['p0', 'p1', 'p2'])
    expect(defaultSlots('player', 'WR', res, pool, null, new Set(['p4']))).toEqual([
      'p0',
      'p1',
      'p4'
    ])
    // Mine already shown: nothing swapped.
    expect(defaultSlots('player', 'WR', res, pool, null, new Set(['p1']))).toEqual([
      'p0',
      'p1',
      'p2'
    ])
  })

  it('seeds a team with the two nearest it in Elo, else the top three', () => {
    const elo = (id: string, e: number | null): ReturnType<typeof row> =>
      row(id, id, { elo: value(e) }, { position: null })
    const res = result(
      ['elo'],
      [elo('BUF', 1650), elo('KC', 1700), elo('DET', 1610), elo('NYJ', 1400), elo('MIA', 1630)]
    )
    const pool = comparePool('team', 'WR', res)
    expect(defaultSlots('team', 'WR', res, pool, 'BUF')).toEqual(['BUF', 'MIA', 'DET'])
    expect(defaultSlots('team', 'WR', res, pool, null)).toEqual(['KC', 'BUF', 'MIA'])
  })

  it('lists my players first, then the pool, then the rest at the position; every team A–Z', () => {
    const res = receivers()
    const pool = comparePool('player', 'WR', res)
    const own: StatsOwnership = { players: { p2: { name: 'Me', mine: true } }, teams: {} }
    expect(slotOptions('player', 'WR', res, pool, own).map((o) => o.label)).toEqual([
      'CeeDee Lamb · SEA · your team',
      'Ja’Marr Chase · SEA',
      'Puka Nacua · SEA',
      'Zay Flowers · SEA',
      'Few Snaps · SEA'
    ])
    const teams = slotOptions('team', 'WR', undefined, new Set(), null)
    expect(teams).toHaveLength(32)
    expect(teams[0]).toEqual({ value: 'ARI', label: 'ARI · Arizona Cardinals' })
  })

  it('writes the cards: a player’s name and games, a team’s record, place and Elo', () => {
    const res = receivers()
    expect(playerCard(res, 'p0', comparePool('player', 'WR', res))).toEqual({
      id: 'p0',
      first: 'Ja’Marr',
      last: 'Chase',
      team: 'SEA',
      games: '6 G',
      qualified: true
    })
    expect(playerCard(res, 'p3', comparePool('player', 'WR', res)).qualified).toBe(false)
    const team = (id: string, w: number, l: number, e: number): ReturnType<typeof row> =>
      row(
        id,
        id,
        {
          wins: value(w),
          losses: value(l),
          points_for: value(150),
          points_against: value(120),
          elo: value(e)
        },
        { position: null }
      )
    const t = result(
      ['wins', 'losses', 'points_for', 'points_against', 'elo'],
      [team('BUF', 5, 1, 1651.6), team('MIA', 2, 4, 1500), team('NE', 3, 3, 1490)]
    )
    expect(teamCard(t, 'BUF')).toEqual({
      id: 'BUF',
      name: 'Buffalo Bills',
      record: '5–1',
      place: '1st in the AFC East',
      elo: '1,652'
    })
  })

  it('charts fantasy points (a team’s EPA per play) by week, with the pool’s weekly median', () => {
    expect(chartMetric('player', 'WR', 'offense')).toBe('fantasy_points')
    expect(chartMetric('player', 'DL', 'offense')).toBe('sacks')
    expect(chartMetric('team', 'WR', 'defense')).toBe('def_epa_play')
    expect(weeklyCompareQuery('player', 'WR', 'fantasy_points', scope, STATUS)).toMatchObject({
      metrics: ['fantasy_points', 'target_share'],
      groupBy: ['week'],
      scope: { positions: ['WR'] }
    })
    const wk = (id: string, week: number, fp: number): ReturnType<typeof row> =>
      row(id, id, { fantasy_points: value(fp) }, { group: { week }, games: 1 })
    const weekly = result(
      ['fantasy_points'],
      [wk('p0', 1, 20), wk('p1', 1, 10), wk('p2', 1, 4), wk('p0', 3, 30), wk('p1', 3, 12)]
    )
    const { series, median } = compareSeries(
      weekly,
      ['p0', null, 'p1'],
      ['Chase', '', 'Nacua'],
      'fantasy_points',
      [1, 2, 3],
      new Set(['p0', 'p1', 'p2'])
    )
    expect(series.map((s) => [s.slot, s.label, s.points.map((p) => p.value)])).toEqual([
      [0, 'Chase', [20, null, 30]],
      [2, 'Nacua', [10, null, 12]]
    ])
    expect(median.points.map((p) => p.value)).toEqual([10, null, 21])
  })
})
```

Create `tests/renderer/lib/statsTrends.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  careerSpan,
  gamesBySeason,
  glanceViews,
  playerTeamsQuery,
  seasonAge,
  teamMarks,
  teamRuns,
  teamsBySeason,
  trendBand,
  trendCore,
  trendDelta,
  trendLine,
  trendMetrics,
  trendNotes,
  trendQuery,
  trendRows,
  trendSeasons
} from '@/lib/stats/trends'
import type { StatsResult } from '@shared/stats/types'
import { catalogue, catalogueMap, result, row, STATUS, value } from '../../fixtures/statsScreens'

const byId = catalogueMap()
const scope = { season: 2026, seasonType: 'REG' as const, weeks: null, scoring: 'ppr' as const }

/**
 * WRs by season: p1 (ours) every season but 2023; p2 and p3 the pool; p4 below the WR qualifier
 * (target share) in 2025; a TE never counts.
 */
function bySeason(): StatsResult {
  const wr = (
    id: string,
    season: number,
    yprr: number,
    qualified = true,
    over = {}
  ): ReturnType<typeof row> =>
    row(
      id,
      id,
      {
        yprr: value(yprr, { qualified, sample: 300 }),
        target_share: value(0.2, { qualified, sample: 60 })
      },
      { group: { season }, ...over }
    )
  return result(
    ['yprr', 'target_share'],
    [
      wr('p1', 2022, 1.4),
      wr('p2', 2022, 2.0),
      wr('p3', 2022, 1.0),
      wr('p1', 2024, 2.5),
      wr('p2', 2024, 1.5),
      wr('p3', 2024, 1.0),
      wr('p1', 2025, 2.2, false),
      wr('p2', 2025, 1.8),
      wr('p3', 2025, 1.2),
      wr('p4', 2025, 3.0, false),
      wr('t1', 2025, 4.0, true, { position: 'TE' })
    ]
  )
}

const SEASONS = [2021, 2022, 2023, 2024, 2025]

describe('Trends (stats-analysis spec §9.5)', () => {
  it('spans 2019 to the season the data runs through', () => {
    expect(trendSeasons(STATUS)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])
  })

  it('offers the entity’s season-grain metrics by family, and six core ones at a glance', () => {
    const wr = trendMetrics('player', 'WR', catalogue())
    expect(wr.map((g) => g.family)).toEqual([
      'traditional',
      'advanced',
      'ngs',
      'charting',
      'predictive'
    ])
    const ids = wr.flatMap((g) => g.metrics.map((m) => m.id))
    expect(ids).toEqual(expect.arrayContaining(['yprr', 'separation', 'target_share']))
    expect(ids).not.toContain('qb_epa_db')
    // A team metric (positions 'all') is never a player's.
    expect(ids.filter((id) => byId.get(id)!.entity !== 'player')).toEqual([])
    expect(ids.every((id) => byId.get(id)!.tier !== 'stored')).toBe(true)
    const team = trendMetrics('team', 'WR', catalogue()).flatMap((g) => g.metrics)
    expect(team.every((m) => m.entity === 'team')).toBe(true)
    expect(trendCore('player', 'WR', byId)).toEqual([
      'target_share',
      'air_yards_share',
      'yprr',
      'separation',
      'route_participation',
      'fantasy_ppg'
    ])
    expect(trendCore('team', 'WR', byId)).toContain('off_rz_td_pct')
  })

  it('asks for every row at the position by season, with the qualifier', () => {
    expect(trendQuery('player', 'WR', ['yprr'], scope, STATUS, true)).toMatchObject({
      entity: 'player',
      metrics: ['yprr', 'target_share'],
      scope: { seasons: trendSeasons(STATUS), seasonType: 'REG', positions: ['WR'] },
      groupBy: ['season'],
      transform: 'perGame',
      limit: 5000
    })
    const t = trendQuery('team', 'WR', ['off_epa_play'], scope, STATUS, false)
    expect(t.metrics).toEqual(['off_epa_play'])
    expect(t.scope.positions).toBeUndefined()
    expect(playerTeamsQuery('p1', scope, STATUS)).toMatchObject({
      scope: { players: ['p1'] },
      groupBy: ['season', 'week']
    })
  })

  it('ranks each season among that season’s qualified players at the position', () => {
    const line = trendLine(bySeason(), 'p1', 'yprr', SEASONS, 'player', 'WR', 'higher')
    expect(line.map((p) => [p.season, p.value, p.qualified, p.rank, p.of])).toEqual([
      [2021, null, false, null, 0],
      [2022, 1.4, true, 2, 3],
      [2023, null, false, null, 0],
      [2024, 2.5, true, 1, 3],
      // Not qualified in 2025: a value, no rank (p4 and the TE never count either).
      [2025, 2.2, false, null, 0]
    ])
    expect(line[3].percentile).toBe(100)
  })

  it('bands the qualified pool’s 25th to 75th percentile each season', () => {
    const band = trendBand(bySeason(), 'yprr', [2024, 2025, 2026], 'player', 'WR')
    expect(band[0]).toEqual({ season: 2024, p25: 1.25, median: 1.5, p75: 2 })
    // 2025: p2 and p3 only (p1, p4 below the qualifier; the TE another position).
    expect(band[1]).toEqual({ season: 2025, p25: 1.35, median: 1.5, p75: 1.65 })
    expect(band[2]).toEqual({ season: 2026, p25: null, median: null, p75: null })
  })

  it('spans a career from the first season to the last, a missed season kept', () => {
    expect(careerSpan(bySeason(), 'p1', SEASONS)).toEqual([2022, 2023, 2024, 2025])
    expect(careerSpan(bySeason(), 'nobody', SEASONS)).toEqual([])
  })

  it('marks his first team and every change, a trade in the order he played for them', () => {
    const week = (season: number, w: number, team: string): ReturnType<typeof row> =>
      row('p1', 'p1', { games: value(1) }, { group: { season, week: w }, team, games: 1 })
    const weekly = result(
      ['games'],
      // The engine sorts by games: a traded season's weeks come in any order.
      [
        week(2024, 9, 'NYJ'),
        week(2021, 1, 'LV'),
        week(2022, 1, 'LV'),
        week(2023, 1, 'LV'),
        week(2023, 2, 'LV'),
        week(2023, 8, 'LA'),
        week(2024, 1, 'LA'),
        week(2023, 7, 'LA')
      ]
    )
    const teams = teamsBySeason(weekly)
    const span = [2021, 2022, 2023, 2024]
    expect([...teamMarks(span, teams)]).toEqual([
      [2021, 'LV'],
      [2023, 'LV → LAR'],
      [2024, 'LAR → NYJ']
    ])
    expect(teamRuns(span, teams)).toBe('LV 2021–23, LAR 2023–24, NYJ since 2024')
    expect(teamRuns([2021], new Map([[2021, ['LV']]]))).toBe('')
    expect([...gamesBySeason(weekly)]).toEqual([
      [2024, 2],
      [2021, 1],
      [2022, 1],
      [2023, 4]
    ])
  })

  it('writes the change from the season before, toned by the better side', () => {
    expect(trendDelta(byId.get('target_share'), 0.25, 0.229, false)).toEqual({
      text: '+2.1 pts',
      tone: 'good'
    })
    expect(trendDelta(byId.get('yprr'), 1.96, 2.2, false)).toEqual({ text: '−0.24', tone: 'bad' })
    // Lower is better: fewer drops read good.
    expect(trendDelta(byId.get('drop_rate'), 0.04, 0.06, false).tone).toBe('good')
    expect(trendDelta(byId.get('rec_adot'), 12, 10, false).tone).toBe('none')
    expect(trendDelta(byId.get('yprr'), null, 2, false)).toEqual({ text: '—', tone: 'none' })
  })

  it('tables the seasons newest first, a season below the qualifier marked', () => {
    const info = byId.get('yprr')
    const line = trendLine(bySeason(), 'p1', 'yprr', [2024, 2025], 'player', 'WR', 'higher')
    const rows = trendRows(
      line,
      info,
      [
        { season: 2024, team: 'NYJ', games: 17, age: 25 },
        { season: 2025, team: 'NYJ', games: 6, age: 26 }
      ],
      false
    )
    expect(rows.map((r) => [r.season, r.value, r.delta, r.deltaTone, r.rank, r.sample])).toEqual([
      [2025, '2.20', '−0.30', 'bad', '—', 'Not qualified · 300 routes'],
      [2024, '2.50', '—', 'none', '1st of 3', '300 routes']
    ])
    // His age that season, this season's today (as the dashboard's header).
    const today = new Date(2026, 9, 24)
    expect(seasonAge('1999-09-25', 2025, today)).toBe(25)
    expect(seasonAge('1999-09-25', 2026, today)).toBe(27)
  })

  it('says what the metric’s coverage leaves out of the span', () => {
    expect(trendNotes(byId.get('contested_catch_rate'), [2020, 2021, 2022], 2026, false)).toEqual([
      'Charted from 2022.'
    ])
    expect(trendNotes(byId.get('yprr_man'), [2024, 2025, 2026], 2026, false)).toEqual([
      'Not published for 2026 yet.'
    ])
    expect(trendNotes(byId.get('route_participation'), [2025, 2026], 2026, true)).toEqual([
      'Estimated for 2026.'
    ])
  })

  it('glances at each core metric: its last value, percentile and a sparkline', () => {
    const [yprr] = glanceViews(
      bySeason(),
      'p1',
      ['yprr'],
      [2022, 2023, 2024, 2025, 2026],
      'player',
      'WR',
      byId,
      2026,
      false
    )
    // No 2026 row: the last value is 2025's, said so.
    expect(yprr).toMatchObject({
      label: 'Yards per route run',
      value: '2.20 (2025)',
      percentile: null
    })
    expect(yprr.spark).toEqual([50, null, 100, null, null])
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/renderer/lib/statsCompare.test.ts tests/renderer/lib/statsTrends.test.ts
```

Expected: both files fail to import `@/lib/stats/compare` and `@/lib/stats/trends` (no tests run).

- [ ] **Step 3: The models**

Create `src/renderer/src/lib/stats/compare.ts`:

```ts
import { cellTitle, fmtStat } from '@/lib/stats/format'
import { qualifies } from '@/lib/stats/leaderboard'
import { appliesToPosition, inFantasy, positionTab, TILES } from '@/lib/stats/player'
import { queryScope, type StatsScope } from '@/lib/stats/scope'
import { missingFor, standing, STANDING_METRICS, teamRank, type WeekSeries } from '@/lib/stats/team'
import { STATS_TEAMS, TEAM_NAMES } from '@shared/stats/nflTeams'
import type {
  MetricInfo,
  PositionGroup,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'

/** Compare (spec §9.5): three slots, players at one position or teams. */
export type CompareEntity = 'player' | 'team'

/** The three slots, in series order (--s1, --s2, --s3); null is an open slot. */
export type Slots = [string | null, string | null, string | null]

export const NO_SLOTS: Slots = [null, null, null]

/**
 * Compare › Teams rows (handoff README §7): offense, defense, special teams and situational,
 * percentiles among the 32. An "allowed" metric is better lower: its percentile says so.
 */
export const TEAM_GROUPS: [string, string[]][] = [
  [
    'Offense',
    [
      'off_epa_play',
      'off_success_rate',
      'off_explosive_rate',
      'off_pass_epa',
      'off_rush_epa',
      'off_sack_rate'
    ]
  ],
  [
    'Defense',
    ['def_epa_play', 'def_success_rate', 'def_explosive_rate', 'def_pressure_rate', 'def_sack_rate']
  ],
  ['Special teams', ['team_fgoe', 'team_punt_net_avg']],
  ['Situational', ['off_third_down_pct', 'off_rz_td_pct', 'def_third_down_pct', 'def_rz_td_pct']]
]

/** A team card's record, division place and Elo. */
const TEAM_CARD = [...STANDING_METRICS, 'elo']

export interface CompareGroupDef {
  label: string
  metrics: string[]
}

/** The rows Compare shows: a player position's leaderboard groups, or the team groups. */
export function compareGroups(
  entity: CompareEntity,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): CompareGroupDef[] {
  const groups = entity === 'team' ? TEAM_GROUPS : positionTab(position).groups
  return groups
    .map(([label, ids]) => ({
      label,
      metrics: ids.filter((id) => {
        const info = byId.get(id)
        return entity === 'team'
          ? info?.entity === 'team'
          : info?.entity === 'player' && appliesToPosition(info, position)
      })
    }))
    .filter((g) => g.metrics.length > 0)
}

/** Every player at the position (a rank is among the position), or every team. */
const ROWS: Record<CompareEntity, number> = { player: 5000, team: 40 }

/**
 * One query over the position, or the 32 teams: the rows, the qualifier and the sort (players), the
 * record and Elo (teams). Counts per game when asked (players); team rows are rates.
 */
export function compareQuery(
  entity: CompareEntity,
  position: PositionGroup,
  groups: readonly CompareGroupDef[],
  scope: StatsScope,
  status: StatsStatus | null,
  perGame: boolean
): StatsQuery {
  const tab = positionTab(position)
  const extra = entity === 'player' ? [tab.qualifier, tab.sort] : TEAM_CARD
  const metrics = [
    ...new Set([...groups.flatMap((g) => g.metrics), ...extra.filter((m) => m !== undefined)])
  ]
  return {
    entity,
    metrics,
    scope: {
      ...queryScope(scope, status),
      ...(entity === 'player' ? { positions: [position] } : {})
    },
    transform: entity === 'player' && perGame ? 'perGame' : 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: ROWS[entity]
  }
}

/** Who a slot ranks among: the position's qualified players, or every team. */
export function comparePool(
  entity: CompareEntity,
  position: PositionGroup,
  result: StatsResult | undefined
): Set<string> {
  const rows = result?.rows ?? []
  if (entity === 'team') return new Set(rows.map((r) => r.id))
  const tab = positionTab(position)
  return new Set(rows.filter((r) => r.position === position && qualifies(r, tab)).map((r) => r.id))
}

export interface CompareCell {
  text: string
  /** 0–100 among the pool; null below the metric's sample or outside the pool. */
  percentile: number | null
  /** "#4". */
  rank: string | null
  /** The best value of the row (no lead on a tie between every slot, or a neutral metric). */
  lead: boolean
  title: string
}

export interface CompareRow {
  metric: string
  label: string
  /** "per game" or "total" for a count (players). */
  sub: string
  info: MetricInfo | null
  /** One per slot; null for an open slot. */
  cells: (CompareCell | null)[]
  /** Why the row is empty for the season ("Not published for 2026 yet."). */
  missing: string | null
}

export interface CompareView {
  groups: { label: string; rows: CompareRow[] }[]
  /** Rows each slot leads. */
  leads: number[]
  /** Rows that can be led: a better side and data. */
  counted: number
}

/** Every row, each slot ranked among the pool; the best value in a row leads it. */
export function compareView(
  result: StatsResult | undefined,
  slots: Slots,
  groups: readonly CompareGroupDef[],
  byId: ReadonlyMap<string, MetricInfo>,
  pool: ReadonlySet<string>,
  perGame: boolean,
  season: number
): CompareView {
  const among = (r: StatsRow): boolean => pool.has(r.id)
  const leads = slots.map(() => 0)
  let counted = 0
  const view = groups.map((g) => ({
    label: g.label,
    rows: g.metrics.map((metric): CompareRow => {
      const info = byId.get(metric) ?? null
      const column = result?.columns.find((c) => c.id === metric)
      const missing = missingFor(column, info ?? undefined, season)
      const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
      const direction = info?.direction ?? 'neutral'
      const counts = info?.kind === 'count' && perGame
      const values = slots.map((id) =>
        id ? (result?.rows.find((r) => r.id === id)?.values[metric] ?? null) : null
      )
      const nums = values.map((v) => v?.value ?? null)
      const filled = nums.filter((v): v is number => v !== null)
      const best =
        direction === 'neutral' || filled.length < 2
          ? null
          : direction === 'lower'
            ? Math.min(...filled)
            : Math.max(...filled)
      const tie = best !== null && filled.every((v) => v === best)
      if (best !== null && !missing) counted++
      return {
        metric,
        label: info?.label ?? metric,
        sub: info?.kind === 'count' ? (counts ? 'per game' : 'total') : '',
        info,
        missing,
        cells: slots.map((id, k) => {
          if (!id) return null
          const v = values[k]
          const lead = !missing && !tie && best !== null && nums[k] === best
          if (lead) leads[k]++
          const place = result ? teamRank(result, id, metric, direction, among) : null
          return {
            text: missing ? '—' : fmtStat(v?.value ?? null, f, counts),
            percentile: missing ? null : (place?.percentile ?? null),
            rank: place && !missing ? `#${place.rank}` : null,
            lead,
            title:
              v && info && place
                ? cellTitle({ ...v, percentile: place.percentile, rank: place.rank }, info, null)
                : v?.value != null
                  ? 'Below the qualifying sample'
                  : ''
          }
        })
      }
    })
  }))
  return { groups: view, leads, counted }
}

export interface PlayerCard {
  id: string
  first: string
  last: string
  team: string | null
  games: string
  qualified: boolean
}

export interface TeamCard {
  id: string
  name: string
  record: string
  /** "1st in the AFC East". */
  place: string | null
  elo: string | null
}

/** A slot's card: the player's name split as the handoff draws it, his team and games. */
export function playerCard(
  result: StatsResult | undefined,
  id: string,
  pool: ReadonlySet<string>
): PlayerCard {
  const r = result?.rows.find((x) => x.id === id)
  const name = r?.name ?? id
  const [first, ...rest] = name.split(' ')
  return {
    id,
    first: rest.length ? first : '',
    last: rest.length ? rest.join(' ') : first,
    team: r?.team ?? null,
    games: r ? `${r.games} G` : '0 G',
    qualified: pool.has(id)
  }
}

/** A team's card: its name, record, place in its division and Elo. */
export function teamCard(result: StatsResult | undefined, id: string): TeamCard {
  const r = result?.rows.find((x) => x.id === id)
  const v = (m: string): number | null => r?.values[m]?.value ?? null
  const ties = v('ties') ?? 0
  return {
    id,
    name: TEAM_NAMES[id] ?? id,
    record: r ? `${v('wins') ?? 0}–${v('losses') ?? 0}${ties ? `–${ties}` : ''}` : '0–0',
    place: standing(result, id),
    elo: v('elo') === null ? null : Math.round(v('elo')!).toLocaleString('en-US')
  }
}

/** The pool best first by the position's leaderboard sort (players), or by Elo (teams). */
function ranked(
  entity: CompareEntity,
  position: PositionGroup,
  result: StatsResult,
  pool: ReadonlySet<string>
): StatsRow[] {
  const metric = entity === 'team' ? 'elo' : positionTab(position).sort
  return result.rows
    .filter((r) => pool.has(r.id))
    .sort((a, b) => (b.values[metric]?.value ?? -Infinity) - (a.values[metric]?.value ?? -Infinity))
}

/**
 * The slots Compare opens with (handoff README §7). Seeded: that player and the position's top two
 * others, or that team and the two nearest it in Elo. Otherwise the top three, my best player at
 * the position in slot 3 when none of mine is there (players); the top three by Elo (teams).
 */
export function defaultSlots(
  entity: CompareEntity,
  position: PositionGroup,
  result: StatsResult,
  pool: ReadonlySet<string>,
  seed: string | null,
  mine: ReadonlySet<string> = new Set()
): Slots {
  const order = ranked(entity, position, result, pool)
  const ids = (rows: StatsRow[]): string[] => rows.map((r) => r.id)
  let out: string[]
  if (seed && entity === 'team') {
    const elo = (id: string): number | null =>
      result.rows.find((r) => r.id === id)?.values.elo?.value ?? null
    const e = elo(seed)
    const near =
      e === null
        ? ids(order).filter((id) => id !== seed)
        : ids(order)
            .filter((id) => id !== seed && elo(id) !== null)
            .sort((a, b) => Math.abs(elo(a)! - e) - Math.abs(elo(b)! - e))
    out = [seed, ...near.slice(0, 2)]
  } else if (seed) {
    out = [
      seed,
      ...ids(order)
        .filter((id) => id !== seed)
        .slice(0, 2)
    ]
  } else {
    out = ids(order).slice(0, 3)
    const best = order.find((r) => mine.has(r.id))
    if (entity === 'player' && best && !out.some((id) => mine.has(id)) && out.length === 3)
      out[2] = best.id
  }
  return [out[0] ?? null, out[1] ?? null, out[2] ?? null]
}

/** A slot's choices: my players first ("· your team"), then the pool best first; every team A–Z. */
export function slotOptions(
  entity: CompareEntity,
  position: PositionGroup,
  result: StatsResult | undefined,
  pool: ReadonlySet<string>,
  ownership: StatsOwnership | null
): { value: string; label: string }[] {
  if (entity === 'team') {
    return STATS_TEAMS.map((t) => ({ value: t, label: `${t} · ${TEAM_NAMES[t] ?? t}` }))
  }
  if (!result) return []
  const mine = (id: string): boolean => ownership?.players[id]?.mine === true
  const order = ranked(entity, position, result, pool)
  const rest = result.rows.filter((r) => !pool.has(r.id) && r.position === position)
  return [...order.filter((r) => mine(r.id)), ...order.filter((r) => !mine(r.id)), ...rest].map(
    (r) => ({
      value: r.id,
      label: `${r.name} · ${r.team ?? 'FA'}${mine(r.id) ? ' · your team' : ''}`
    })
  )
}

/**
 * The weekly chart's metric: fantasy points where the position scores them, else its first tile;
 * a team's EPA per play, offense or defense.
 */
export function chartMetric(
  entity: CompareEntity,
  position: PositionGroup,
  side: 'offense' | 'defense'
): string {
  if (entity === 'team') return side === 'offense' ? 'off_epa_play' : 'def_epa_play'
  return inFantasy(position) ? 'fantasy_points' : TILES[position][0]
}

/** The chart's rows: every player at the position (or team) by week, for the slots and the median. */
export function weeklyCompareQuery(
  entity: CompareEntity,
  position: PositionGroup,
  metric: string,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  const tab = positionTab(position)
  const metrics = entity === 'player' && tab.qualifier ? [metric, tab.qualifier] : [metric]
  return {
    entity,
    metrics: [...new Set(metrics)],
    scope: {
      ...queryScope(scope, status),
      ...(entity === 'player' ? { positions: [position] } : {})
    },
    groupBy: ['week'],
    transform: 'raw',
    sort: { metric, dir: 'desc' },
    scoring: scope.scoring,
    limit: 5000
  }
}

/**
 * One line per filled slot and the median of the pool each week (dashed in the chart). A week
 * without a slot's row is a gap (a bye or a game he missed).
 */
export function compareSeries(
  result: StatsResult | null,
  slots: Slots,
  labels: readonly string[],
  metric: string,
  weeks: readonly number[],
  pool: ReadonlySet<string>
): { series: (WeekSeries & { slot: number })[]; median: WeekSeries } {
  const rows = result?.rows ?? []
  const at = (id: string, week: number): number | null =>
    rows.find((r) => r.id === id && Number(r.group.week) === week)?.values[metric]?.value ?? null
  const series = slots.flatMap((id, slot) =>
    id
      ? [
          {
            id,
            slot,
            label: labels[slot] ?? id,
            points: weeks.map((week) => ({ week, value: at(id, week) }))
          }
        ]
      : []
  )
  const median = (week: number): number | null => {
    const vs = rows
      .filter((r) => Number(r.group.week) === week && pool.has(r.id) && r.games > 0)
      .map((r) => r.values[metric]?.value)
      .filter((v): v is number => v !== null && v !== undefined)
      .sort((a, b) => a - b)
    if (!vs.length) return null
    const m = Math.floor(vs.length / 2)
    return vs.length % 2 ? vs[m] : (vs[m - 1] + vs[m]) / 2
  }
  return {
    series,
    median: {
      id: 'median',
      label: 'Median',
      points: weeks.map((week) => ({ week, value: median(week) }))
    }
  }
}

/** "Percentiles vs 110 qualified WRs", "Percentiles vs all 32 teams". */
export function poolNote(
  entity: CompareEntity,
  position: PositionGroup,
  pool: ReadonlySet<string>
): string {
  return entity === 'team'
    ? `Percentiles vs all ${pool.size} teams. Allowed metrics rank lower as better.`
    : `Percentiles vs ${pool.size} qualified ${position}s.`
}
```

Create `src/renderer/src/lib/stats/trends.ts`:

```ts
import { fmtStat, ordinal } from '@/lib/stats/format'
import { qualifies } from '@/lib/stats/leaderboard'
import { ageOn, appliesToPosition, positionTab } from '@/lib/stats/player'
import { FIRST_SEASON, latestSeason, type StatsScope } from '@/lib/stats/scope'
import { teamRank } from '@/lib/stats/team'
import { teamAbbr } from '@shared/stats/nflTeams'
import type {
  MetricFamily,
  MetricInfo,
  PositionGroup,
  StatsQuery,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'

/** Trends (spec §9.5): a metric by season, 2019 → now, for a player or a team. */
export type TrendEntity = 'player' | 'team'

/** Up to two more series for context: --s2 (square) and --s3 (diamond). */
export const MAX_COMPARISONS = 2

/** "Career at a glance": six core metrics per position, or a team's offense. */
export const TREND_CORE: Record<PositionGroup | 'team', string[]> = {
  QB: ['qb_epa_db', 'cpoe', 'qb_success', 'pass_anya', 'sack_rate', 'fantasy_ppg'],
  RB: ['carry_share', 'snap_share', 'rush_ypc', 'ryoe_att', 'target_share', 'fantasy_ppg'],
  WR: [
    'target_share',
    'air_yards_share',
    'yprr',
    'separation',
    'route_participation',
    'fantasy_ppg'
  ],
  TE: ['target_share', 'route_participation', 'yprr', 'separation', 'snap_share', 'fantasy_ppg'],
  K: ['fg_pct', 'fgoe_pct', 'fg_pct_50p', 'pat_pct', 'kicker_epa', 'fantasy_ppg'],
  P: ['punt_net_avg', 'punt_in20_rate', 'punter_epa', 'punt_avg', 'punt_tb_rate'],
  DL: ['pressures', 'sacks', 'qb_hits', 'tfl', 'def_stuffs', 'def_snap_share'],
  LB: ['tackles', 'tfl', 'def_stuffs', 'missed_tackle_pct', 'pressures', 'def_snap_share'],
  DB: [
    'coverage_ypt',
    'coverage_cmp_pct',
    'coverage_rating',
    'pass_defended',
    'def_ints',
    'def_snap_share'
  ],
  OL: ['snap_share', 'on_field_epa'],
  team: [
    'off_epa_play',
    'off_success_rate',
    'off_explosive_rate',
    'off_pass_epa',
    'off_rush_epa',
    'off_rz_td_pct'
  ]
}

const FAMILIES: MetricFamily[] = ['traditional', 'advanced', 'ngs', 'charting', 'predictive']

/** Whether a metric belongs on a Trends chart for this entity (season grain, not stored-only). */
function trendable(
  info: MetricInfo | undefined,
  entity: TrendEntity,
  position: PositionGroup
): boolean {
  if (!info || info.tier === 'stored' || !info.grains.includes('season')) return false
  // A team metric applies to 'all' positions: a player's list asks for player metrics too.
  return entity === 'team'
    ? info.entity === 'team'
    : info.entity === 'player' && appliesToPosition(info, position)
}

/** The core metrics a position (or a team) shows at a glance, those the catalogue has. */
export function trendCore(
  entity: TrendEntity,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): string[] {
  return TREND_CORE[entity === 'team' ? 'team' : position].filter((id) =>
    trendable(byId.get(id), entity, position)
  )
}

/** The metric select: every metric for the entity, grouped by family, the catalogue's order. */
export function trendMetrics(
  entity: TrendEntity,
  position: PositionGroup,
  catalogue: readonly MetricInfo[]
): { family: MetricFamily; metrics: MetricInfo[] }[] {
  return FAMILIES.map((family) => ({
    family,
    metrics: catalogue.filter((m) => m.family === family && trendable(m, entity, position))
  })).filter((g) => g.metrics.length > 0)
}

/** The seasons Trends spans: 2019 through the season the data runs through. */
export function trendSeasons(status: StatsStatus | null, now = new Date()): number[] {
  const last = latestSeason(status, now)
  return Array.from({ length: last - FIRST_SEASON + 1 }, (_, i) => FIRST_SEASON + i)
}

/**
 * Every row at the position (or every team) by season: the line, the comparisons, the band and the
 * ranks of each season come from one query. Whole seasons; counts per game when asked.
 */
export function trendQuery(
  entity: TrendEntity,
  position: PositionGroup,
  metrics: string[],
  scope: StatsScope,
  status: StatsStatus | null,
  perGame: boolean
): StatsQuery {
  const qualifier = entity === 'player' ? positionTab(position).qualifier : undefined
  const ids = [...new Set([...metrics, ...(qualifier ? [qualifier] : [])])]
  return {
    entity,
    metrics: ids,
    scope: {
      seasons: trendSeasons(status),
      seasonType: scope.seasonType,
      ...(entity === 'player' ? { positions: [position] } : {})
    },
    groupBy: ['season'],
    transform: perGame ? 'perGame' : 'raw',
    sort: { metric: ids[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: 5000
  }
}

/**
 * A player's games by week, each with that week's team: his teams in the order he played for them
 * (the team changes on the axis). About 20 rows a season.
 */
export function playerTeamsQuery(
  player: string,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return {
    entity: 'player',
    metrics: ['games'],
    scope: { seasons: trendSeasons(status), seasonType: scope.seasonType, players: [player] },
    groupBy: ['season', 'week'],
    transform: 'raw',
    sort: { metric: 'games', dir: 'desc' },
    scoring: scope.scoring,
    limit: 1000
  }
}

const seasonOf = (r: StatsRow): number => Number(r.group.season)

/** A season's rows of a by-season result. */
function inSeason(result: StatsResult, season: number): StatsResult {
  return { ...result, rows: result.rows.filter((r) => seasonOf(r) === season) }
}

/** Who a season ranks among: the position's players its leaderboard qualifies, or every team. */
function poolIn(
  rows: readonly StatsRow[],
  entity: TrendEntity,
  position: PositionGroup
): Set<string> {
  if (entity === 'team') return new Set(rows.map((r) => r.id))
  const tab = positionTab(position)
  return new Set(rows.filter((r) => r.position === position && qualifies(r, tab)).map((r) => r.id))
}

export interface TrendPoint {
  season: number
  value: number | null
  /** In the pool that season: the position's qualifier (players) and the metric's own sample. */
  qualified: boolean
  /** 0–100 among the season's pool; null when not qualified. */
  percentile: number | null
  rank: number | null
  of: number
  sample: number | null
  estimated: boolean
}

/** One entity's line: its value each season, ranked among that season's pool. */
export function trendLine(
  result: StatsResult | null,
  id: string,
  metric: string,
  seasons: readonly number[],
  entity: TrendEntity,
  position: PositionGroup,
  direction: MetricInfo['direction']
): TrendPoint[] {
  return seasons.map((season) => {
    const sub = result ? inSeason(result, season) : null
    const r = sub?.rows.find((x) => x.id === id)
    const v = r?.values[metric]
    const pool = sub ? poolIn(sub.rows, entity, position) : new Set<string>()
    const place =
      sub && pool.has(id) ? teamRank(sub, id, metric, direction, (x) => pool.has(x.id)) : null
    return {
      season,
      value: v?.value ?? null,
      qualified: place !== null,
      percentile: place?.percentile ?? null,
      rank: place?.rank ?? null,
      of: place?.of ?? 0,
      sample: v?.sample ?? null,
      estimated: v?.estimated ?? false
    }
  })
}

export interface BandPoint {
  season: number
  p25: number | null
  median: number | null
  p75: number | null
}

const quantile = (sorted: readonly number[], q: number): number | null => {
  if (!sorted.length) return null
  const i = (sorted.length - 1) * q
  const lo = Math.floor(i)
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo)
}

/** The position's qualified 25th, 50th and 75th percentile values each season. */
export function trendBand(
  result: StatsResult | null,
  metric: string,
  seasons: readonly number[],
  entity: TrendEntity,
  position: PositionGroup
): BandPoint[] {
  return seasons.map((season) => {
    const rows = (result?.rows ?? []).filter((r) => seasonOf(r) === season)
    const pool = poolIn(rows, entity, position)
    const vs = rows
      .filter((r) => pool.has(r.id) && r.values[metric]?.qualified)
      .map((r) => r.values[metric]!.value)
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b)
    return {
      season,
      p25: quantile(vs, 0.25),
      median: quantile(vs, 0.5),
      p75: quantile(vs, 0.75)
    }
  })
}

/** The seasons a player or team has rows: from the first to the last (a missed season stays). */
export function careerSpan(
  result: StatsResult | null,
  id: string,
  seasons: readonly number[]
): number[] {
  const has = new Set((result?.rows ?? []).filter((r) => r.id === id).map(seasonOf))
  const first = seasons.findIndex((s) => has.has(s))
  if (first < 0) return []
  let last = seasons.length - 1
  while (!has.has(seasons[last])) last--
  return seasons.slice(first, last + 1)
}

/** A player's team(s) each season, in the order he played for them (his weekly rows). */
export function teamsBySeason(result: StatsResult | null): Map<number, string[]> {
  const out = new Map<number, string[]>()
  const weeks = [...(result?.rows ?? [])]
    .filter((r) => r.team && r.games > 0)
    .sort((a, b) => seasonOf(a) - seasonOf(b) || Number(a.group.week) - Number(b.group.week))
  for (const r of weeks) {
    const s = seasonOf(r)
    const teams = out.get(s) ?? []
    if (teams[teams.length - 1] !== r.team) out.set(s, [...teams, r.team!])
  }
  return out
}

/** His games each season, from the same weekly rows. */
export function gamesBySeason(result: StatsResult | null): Map<number, number> {
  const out = new Map<number, number>()
  for (const r of result?.rows ?? []) out.set(seasonOf(r), (out.get(seasonOf(r)) ?? 0) + r.games)
  return out
}

/** The axis's team marks: the team under his first season and every season it changed. */
export function teamMarks(
  span: readonly number[],
  teams: ReadonlyMap<number, string[]>
): Map<number, string> {
  const marks = new Map<number, string>()
  let prev: string | null = null
  for (const s of span) {
    const ts = teams.get(s)
    if (!ts?.length) continue
    const label = ts.map(teamAbbr).join(' → ')
    if (ts[0] !== prev || ts.length > 1) marks.set(s, label)
    prev = ts[ts.length - 1]
  }
  return marks
}

/** "BRK 2021–23, HAR since 2024": a player's teams over his seasons. */
export function teamRuns(span: readonly number[], teams: ReadonlyMap<number, string[]>): string {
  const runs: { team: string; from: number; to: number }[] = []
  for (const s of span) {
    for (const t of teams.get(s) ?? []) {
      const last = runs[runs.length - 1]
      if (last && last.team === t) last.to = s
      else runs.push({ team: t, from: s, to: s })
    }
  }
  if (runs.length < 2) return ''
  return runs
    .map((r, i) =>
      i === runs.length - 1
        ? `${teamAbbr(r.team)} since ${r.from}`
        : `${teamAbbr(r.team)} ${r.from}${r.to > r.from ? `–${String(r.to).slice(2)}` : ''}`
    )
    .join(', ')
}

/** His age that season (September 1), this season's today: as the player dashboard's header. */
export function seasonAge(
  birthDate: string | null,
  season: number,
  today = new Date()
): number | null {
  return ageOn(birthDate, season < today.getFullYear() ? new Date(season, 8, 1) : today)
}

export interface TrendRow {
  season: number
  team: string
  age: number | null
  games: number | null
  value: string
  /** Signed, written like the value ("+0.25", "+2.1 pts" for a rate in percent). */
  delta: string
  deltaTone: 'good' | 'bad' | 'none'
  percentile: number | null
  /** "12th of 110"; "—" when not qualified. */
  rank: string
  sample: string
  qualified: boolean
}

/** The change from the season before, toned by the metric's better side. */
export function trendDelta(
  info: MetricInfo | undefined,
  now: number | null,
  before: number | null,
  perGame: boolean
): { text: string; tone: 'good' | 'bad' | 'none' } {
  if (now === null || before === null) return { text: '—', tone: 'none' }
  const d = now - before
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±'
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const text =
    info?.unit === 'pct'
      ? `${sign}${Math.abs(d * 100).toFixed(1)} pts`
      : `${sign}${fmtStat(Math.abs(d), f, perGame).replace(/^[+−-]/, '')}`
  const direction = info?.direction ?? 'neutral'
  const tone =
    d === 0 || direction === 'neutral'
      ? 'none'
      : d > 0 === (direction === 'higher')
        ? 'good'
        : 'bad'
  return { text, tone }
}

/** The table under the chart, newest first. */
export function trendRows(
  points: readonly TrendPoint[],
  info: MetricInfo | undefined,
  rows: { season: number; team: string; games: number | null; age: number | null }[],
  perGame: boolean
): TrendRow[] {
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const sampleLabel = info?.sampleLabel ?? 'sample'
  return points
    .map((p, i) => {
      const meta = rows.find((r) => r.season === p.season)
      const delta = trendDelta(info, p.value, i > 0 ? points[i - 1].value : null, perGame)
      return {
        season: p.season,
        team: meta?.team ?? '',
        age: meta?.age ?? null,
        games: meta?.games ?? null,
        value:
          p.value === null
            ? info && p.season < info.firstSeason
              ? 'not charted'
              : '—'
            : `${fmtStat(p.value, f, perGame)}${p.estimated ? ' est.' : ''}`,
        delta: delta.text,
        deltaTone: delta.tone,
        percentile: p.percentile,
        rank: p.rank !== null ? `${ordinal(p.rank)} of ${p.of}` : '—',
        sample:
          p.sample === null
            ? ''
            : `${p.qualified ? '' : 'Not qualified · '}${Math.round(p.sample).toLocaleString('en-US')} ${sampleLabel}`,
        qualified: p.qualified
      }
    })
    .reverse()
}

/**
 * What a metric's coverage says about the span: "Charted from 2022.", "Next Gen Stats from 2019.",
 * "Not published for 2026 yet.", "Routes for 2026 are estimated."
 */
export function trendNotes(
  info: MetricInfo | undefined,
  span: readonly number[],
  current: number,
  estimated: boolean
): string[] {
  if (!info || !span.length) return []
  const notes: string[] = []
  if (info.firstSeason > span[0]) {
    notes.push(
      info.family === 'charting'
        ? `Charted from ${info.firstSeason}.`
        : info.family === 'ngs'
          ? `Next Gen Stats from ${info.firstSeason}.`
          : `From ${info.firstSeason}.`
    )
  }
  if (info.lastSeason === 'prior' && span.includes(current)) {
    notes.push(`Not published for ${current} yet.`)
  }
  if (estimated) notes.push(`Estimated for ${current}.`)
  return notes
}

export interface GlanceView {
  metric: string
  label: string
  /** The last value ("(2025)" after it when the last value is not the latest season). */
  value: string
  percentile: number | null
  /** Percentile by season over the span, for the sparkline. */
  spark: (number | null)[]
  note: string | null
}

/** "Career at a glance": per core metric, its last value and percentile, and a sparkline. */
export function glanceViews(
  result: StatsResult | null,
  id: string,
  metrics: readonly string[],
  span: readonly number[],
  entity: TrendEntity,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>,
  current: number,
  perGame: boolean
): GlanceView[] {
  return metrics.map((metric) => {
    const info = byId.get(metric)
    const points = trendLine(
      result,
      id,
      metric,
      span,
      entity,
      position,
      info?.direction ?? 'neutral'
    )
    const last = [...points].reverse().find((p) => p.value !== null) ?? null
    const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
    const latest = span[span.length - 1]
    return {
      metric,
      label: info?.label ?? metric,
      value: last
        ? `${fmtStat(last.value, f, perGame)}${last.estimated ? ' est.' : ''}${last.season !== latest ? ` (${last.season})` : ''}`
        : '—',
      percentile: last?.percentile ?? null,
      spark: points.map((p) => p.percentile),
      note: trendNotes(info, span, current, last?.estimated ?? false)[0] ?? null
    }
  })
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/renderer/lib/statsCompare.test.ts tests/renderer/lib/statsTrends.test.ts
```

Expected: 2 passed: 21 passed.

- [ ] **Step 5: Format, typecheck, lint, the whole suite**

```bash
npx prettier --check src/renderer/src/lib/stats/compare.ts src/renderer/src/lib/stats/trends.ts tests/renderer/lib/statsCompare.test.ts tests/renderer/lib/statsTrends.test.ts
npm run typecheck
npx eslint src tests electron.vite.config.ts
npx vitest run
```

Expected: prettier and typecheck clean, no lint problems, 1132 passed, 5 skipped.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/lib/stats/compare.ts src/renderer/src/lib/stats/trends.ts tests/renderer/lib/statsCompare.test.ts tests/renderer/lib/statsTrends.test.ts
git commit -F - <<'EOF'
feat(stats): add the Compare and Trends models

Compare: three slots of players at one position (their leaderboard
groups) or teams (offense, defense, special teams, situational), each
ranked among the position's qualified players or the 32, the best
value leading its row; seeded slots, the cards, the weekly chart with
the pool's median.

Trends: a metric by season from one by-season query over the
position, ranked among each season's pool, the 25th-75th band, team
changes, deltas by the better side, career at a glance and coverage
notes.
EOF
```

---

### Task 3: Explore, Compare and Trends on screen (spec §9.5, §9.6; amendments A–C, F, G)

Explore joins the Stats nav with its sub-tabs (Chart disabled until Plan AD2), the scope bar at the right. Compare and Trends are built in the handoff's Stats language: the handoff's player cards and pill-dot bars, the new `SeasonChart`, and the canvas's Trends. `StatsApp` keeps Explore's tab and each tab's state (`CompareState`, `TrendsState`, now in the models) and routes the dashboards' Compare buttons and the stat lines' trend icon. State updates are functional: a late default never undoes a newer choice.

**Files:**

- Create: `src/renderer/src/components/stats/SeasonChart.tsx`, `src/renderer/src/screens/stats/StatsCompare.tsx`, `src/renderer/src/screens/stats/StatsExplore.tsx`, `src/renderer/src/screens/stats/StatsTrends.tsx`, `tests/renderer/components/StatsExplore.test.tsx`
- Modify: `src/renderer/src/assets/main.css`, `src/renderer/src/components/stats/StatLines.tsx`, `src/renderer/src/components/stats/StatsNav.tsx`, `src/renderer/src/components/stats/WeekChart.tsx`, `src/renderer/src/lib/stats/compare.ts`, `src/renderer/src/lib/stats/player.ts`, `src/renderer/src/lib/stats/trends.ts`, `src/renderer/src/screens/stats/StatsApp.tsx`, `src/renderer/src/screens/stats/StatsPlayer.tsx`, `src/renderer/src/screens/stats/StatsTeam.tsx`, `tests/renderer/components/StatsCharts.test.tsx`, `tests/renderer/components/StatsPlayer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Modify `tests/renderer/components/StatsCharts.test.tsx`:

```diff
diff --git a/tests/renderer/components/StatsCharts.test.tsx b/tests/renderer/components/StatsCharts.test.tsx
index 9e84986..3b09393 100644
--- a/tests/renderer/components/StatsCharts.test.tsx
+++ b/tests/renderer/components/StatsCharts.test.tsx
@@ -2,8 +2,10 @@
 import { afterEach, describe, expect, it } from 'vitest'
 import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
 import { PercentileBar, StatSection } from '@/components/stats/StatLines'
+import { SeasonChart } from '@/components/stats/SeasonChart'
 import { WeekChart } from '@/components/stats/WeekChart'
 import type { SectionView } from '@/lib/stats/team'
+import type { TrendPoint } from '@/lib/stats/trends'
 import { catalogueMap } from '../../fixtures/statsScreens'

 afterEach(cleanup)
@@ -116,6 +118,71 @@ describe('the dashboard’s stat lines and charts', () => {
     expect(end.querySelector('rect')!.getAttribute('fill')).toBe('var(--s1)')
   })

+  it('keeps a slot’s colour and shape, dashes the median, and flips a lower-is-better axis', () => {
+    const points = (vs: number[]): { week: number; value: number }[] =>
+      vs.map((value, i) => ({ week: i + 1, value }))
+    const props = {
+      label: 'Slots',
+      format: (v: number) => v.toFixed(2),
+      series: [
+        { id: 'a', slot: 0, label: 'BUF', points: points([0.1, 0.2]) },
+        { id: 'c', slot: 2, label: 'MIA', points: points([-0.1, 0]) }
+      ],
+      reference: { id: 'median', label: 'League median', points: points([0, 0]) }
+    }
+    const { rerender } = render(<WeekChart {...props} />)
+    const chart = screen.getByRole('img', { name: 'Slots' })
+    expect(chart.querySelector('[data-reference]')!.getAttribute('stroke-dasharray')).toBe('5 4')
+    // Slot 3 (an open slot 2 between) keeps --s3 and draws diamonds.
+    const diamonds = [...chart.querySelectorAll('path[fill="var(--s3)"]')]
+    expect(diamonds).toHaveLength(2)
+    expect(screen.getByText('League median')).toBeTruthy()
+    const top = (): number =>
+      Number(chart.querySelector('rect[fill="var(--s1)"]')!.getAttribute('y'))
+    const y = top()
+    rerender(<WeekChart {...props} flip />)
+    expect(top()).toBeGreaterThan(y)
+  })
+
+  it('charts seasons: the band and median, a season not qualified hollow, team changes', () => {
+    const point = (season: number, value: number | null, qualified = true): TrendPoint => ({
+      season,
+      value,
+      qualified,
+      percentile: qualified ? 60 : null,
+      rank: qualified ? 10 : null,
+      of: 90,
+      sample: 300,
+      estimated: false
+    })
+    render(
+      <SeasonChart
+        label="YPRR by season"
+        format={(v) => v.toFixed(2)}
+        series={[
+          { id: 'p1', label: 'Okafor', points: [point(2024, 1.9), point(2025, 2.2, false)] },
+          { id: 'p2', label: 'Reyes', points: [point(2024, 1.5), point(2025, 1.6)] }
+        ]}
+        band={[
+          { season: 2024, p25: 1.3, median: 1.6, p75: 2 },
+          { season: 2025, p25: 1.2, median: 1.6, p75: 1.9 }
+        ]}
+        marks={new Map([[2025, 'BUF']])}
+        ages={new Map([[2025, 25]])}
+        hoverInfo={(season) => ({ title: String(season), lines: ['2.20'] })}
+      />
+    )
+    const chart = screen.getByRole('img', { name: 'YPRR by season' })
+    expect(chart.querySelector('[data-band]')).toBeTruthy()
+    expect(chart.querySelector('[data-median]')!.getAttribute('stroke-dasharray')).toBe('5 4')
+    // Only the main series marks a season below the qualifier hollow.
+    expect(chart.querySelectorAll('[data-hollow]')).toHaveLength(1)
+    expect(chart.querySelector('[data-team-mark]')!.textContent).toBe('BUF')
+    expect(screen.getByText('age 25')).toBeTruthy()
+    fireEvent.mouseEnter(chart.querySelectorAll('rect[fill="transparent"]')[1])
+    expect(within(screen.getByRole('tooltip')).getByText('2025')).toBeTruthy()
+  })
+
   it('says so when the range has no games', () => {
     render(<WeekChart label="Empty" format={String} series={[]} />)
     expect(screen.getByText('No games in this range.')).toBeTruthy()
```

Create `tests/renderer/components/StatsExplore.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { StatsApp } from '@/screens/stats/StatsApp'
import type { StatsScope } from '@/lib/stats/scope'
import { api } from '@/lib/api'
import type { StatsOwnership, StatsQuery } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'
import { bio, catalogue, result, row, STATUS, value } from '../../fixtures/statsScreens'

vi.mock('@/lib/api', () => ({
  api: {
    players: { detail: vi.fn() },
    stats: {
      status: vi.fn(),
      catalogue: vi.fn(),
      query: vi.fn(),
      games: vi.fn(),
      outlook: vi.fn(),
      player: vi.fn(),
      link: vi.fn(),
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

globalThis.ResizeObserver ??= class {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
} as unknown as typeof ResizeObserver

const OWNERSHIP: StatsOwnership = { players: { p1: { name: 'Me', mine: true } }, teams: {} }

/** Elo, wins and losses: KC first in Elo, BUF and MIA close together. */
const TEAMS: Record<string, [number, number, number]> = {
  BUF: [1650, 5, 1],
  MIA: [1630, 3, 3],
  NE: [1500, 2, 4],
  KC: [1700, 6, 0]
}
/** Seasons each player has rows in (p2 a rookie), and p1's teams by season. */
const SEASONS: Record<string, number[]> = {
  p0: [2025, 2026],
  p1: [2025, 2026],
  p2: [2026],
  p3: [2025, 2026]
}
const P1_TEAMS: Record<number, string> = { 2025: 'NYJ', 2026: 'BUF' }

function answer(q: StatsQuery): ReturnType<typeof result> {
  const by = q.groupBy ?? []
  if (q.entity === 'team') {
    const teams = q.scope.teams ?? Object.keys(TEAMS)
    const rows = teams.flatMap((t) => {
      const [elo, w, l] = TEAMS[t] ?? [1500, 3, 3]
      const values = Object.fromEntries(
        q.metrics.map((m) => [
          m,
          value(m === 'elo' ? elo : m === 'wins' ? w : m === 'losses' ? l : elo / 10000)
        ])
      )
      const groups = by.includes('week') ? [1, 2, 3].map((week) => ({ week })) : [{}]
      return groups.map((group) => ({ ...row(t, t, values, { team: t, position: null }), group }))
    })
    return result(q.metrics, rows)
  }
  // My top scorer: p1, a RB on Buffalo.
  if (q.scope.players && q.limit === 1)
    return result(q.metrics, [
      row('p1', 'Player One', { fantasy_points: value(200) }, { position: 'RB', team: 'BUF' })
    ])
  const position = q.scope.positions?.[0] ?? 'RB'
  const ids = q.scope.players ?? ['p0', 'p1', 'p2', 'p3']
  const rows = ids.flatMap((id) => {
    const i = Number(id.slice(1))
    const values = Object.fromEntries(
      q.metrics.map((m) => [m, value(100 - i * 10, { qualified: i < 3, sample: 40 })])
    )
    const name = ['Player Zero', 'Player One', 'Player Two', 'Player Three'][i]
    const base = row(id, name, values, { position, team: 'BUF' })
    if (by.includes('season')) {
      return SEASONS[id].map((season) => ({
        ...base,
        team: id === 'p1' ? P1_TEAMS[season] : 'BUF',
        group: {
          season,
          ...(by.includes('team') ? { team: id === 'p1' ? P1_TEAMS[season] : 'BUF' } : {})
        }
      }))
    }
    if (by.includes('week')) return [1, 2, 3].map((week) => ({ ...base, group: { week } }))
    if (by.length) return []
    return [base]
  })
  return result(q.metrics, rows)
}

const IDLE: UpdateState = { status: 'idle' } as UpdateState

function Harness(): React.JSX.Element {
  const [scope, setScope] = useState<StatsScope | null>(null)
  return (
    <StatsApp
      hasLeague
      leagueKey={0}
      onOpenFantasy={() => {}}
      update={IDLE}
      version="0.34.0"
      onOpenUpdate={() => {}}
      onToggleTheme={() => {}}
      scope={scope}
      onScope={setScope}
    />
  )
}

async function open(item: string): Promise<void> {
  render(<Harness />)
  await waitFor(() => expect(stats.catalogue).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: item }))
}

const swaps = async (what = 'player'): Promise<string[]> => {
  await waitFor(() =>
    expect(screen.getAllByRole('combobox', { name: `Swap ${what}` }).length).toBeGreaterThan(0)
  )
  return screen
    .getAllByRole('combobox', { name: `Swap ${what}` })
    .map((s) => (s as HTMLSelectElement).value)
}

beforeEach(() => {
  vi.resetAllMocks()
  stats.status.mockResolvedValue(STATUS)
  stats.catalogue.mockResolvedValue(catalogue())
  stats.query.mockImplementation(async (q) => answer(q))
  stats.games.mockResolvedValue([])
  stats.outlook.mockRejectedValue(new Error('no outlook'))
  stats.player.mockImplementation(async ({ player }) =>
    bio(player, { position: 'RB', status: null, birthDate: '2000-03-01' })
  )
  stats.link.mockResolvedValue(null)
  stats.ownership.mockResolvedValue(OWNERSHIP)
  stats.views.mockResolvedValue([])
  stats.onChanged.mockReturnValue(() => {})
})
afterEach(cleanup)

describe('Explore: Compare and Trends (stats-analysis spec §9.5)', () => {
  it('sits between Teams and Games: Compare first, the chart explorer later', async () => {
    await open('Explore')
    const nav = screen.getByRole('navigation')
    expect(
      within(nav)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(expect.arrayContaining(['Teams', 'Explore', 'Games']))
    const tabs = within(screen.getByRole('tablist', { name: 'Explore' })).getAllByRole('tab')
    expect(tabs.map((t) => [t.textContent, (t as HTMLButtonElement).disabled])).toEqual([
      ['Chart', true],
      ['Compare', false],
      ['Trends', false]
    ])
    expect(screen.getByRole('tab', { name: 'Compare', selected: true })).toBeTruthy()
    expect(await screen.findByRole('heading', { name: 'Head to head' })).toBeTruthy()
  })

  it('compares the position’s top three, leads rows, removes and adds a player', async () => {
    await open('Explore')
    fireEvent.click(await screen.findByRole('radio', { name: 'WR' }))
    expect(await swaps()).toEqual(['p0', 'p1', 'p2'])
    // p0 has the best value in every row with a better side.
    expect((await screen.findAllByText(/^Leads \d+ of \d+$/))[0].textContent).toMatch(
      /^Leads [1-9]/
    )
    const query = stats.query.mock.calls
      .map((c) => c[0])
      .find((q) => q.scope.positions?.[0] === 'WR' && !q.groupBy && q.limit === 5000)
    // The whole position (a rank is among it), counts per game.
    expect(query).toMatchObject({ transform: 'perGame' })
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove from comparison' })[2])
    expect(await screen.findByText('Add a third player…')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Add a player' }), {
      target: { value: 'p3' }
    })
    expect(await swaps()).toEqual(['p0', 'p1', 'p3'])
    // The weekly chart with the median of the position's qualified players.
    expect(await screen.findByRole('img', { name: 'Fantasy points by week' })).toBeTruthy()
    expect(screen.getByText('Median qualified WR')).toBeTruthy()
  })

  it('compares teams: the top three by Elo, their record, division place and Elo', async () => {
    await open('Explore')
    fireEvent.click(await screen.findByRole('radio', { name: 'Teams' }))
    expect(await swaps('team')).toEqual(['KC', 'BUF', 'MIA'])
    expect(screen.getByText('1,650')).toBeTruthy()
    expect(screen.getByText('5–1')).toBeTruthy()
    expect(screen.getByText('2nd in the AFC East')).toBeTruthy()
    // A team's FG over expected is its total, not per game.
    expect(document.querySelector('[data-metric="team_fgoe"]')!.textContent).not.toContain(
      'per game'
    )
    // The defense chart runs upside down: lower EPA allowed is better.
    fireEvent.click(screen.getByRole('radio', { name: 'Defense' }))
    expect(await screen.findByText('Flipped so up is better · gaps are byes')).toBeTruthy()
  })

  it('a player dashboard’s Compare seeds him with his position’s top two', async () => {
    await open('Players')
    await screen.findByRole('tablist', { name: 'Player dashboard' })
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }))
    expect(await swaps()).toEqual(['p1', 'p0', 'p2'])
    expect(screen.getByRole('radio', { name: 'RB', checked: true })).toBeTruthy()
  })

  it('a team dashboard’s Compare seeds the team and the two nearest it in Elo', async () => {
    await open('Teams')
    fireEvent.click(await screen.findByRole('button', { name: 'Compare' }))
    expect(await swaps('team')).toEqual(['BUF', 'MIA', 'KC'])
  })

  it('a stat line’s trend icon opens Trends on that metric, his teams under the seasons', async () => {
    await open('Players')
    await screen.findByRole('tablist', { name: 'Player dashboard' })
    const icons = await screen.findAllByRole('button', { name: / by season$/ })
    const metric = icons[0].closest('[data-metric]')!.getAttribute('data-metric')!.slice(4)
    fireEvent.click(icons[0])
    expect(await screen.findByRole('tab', { name: 'Trends', selected: true })).toBeTruthy()
    await waitFor(() =>
      expect((screen.getByRole('combobox', { name: 'Metric' }) as HTMLSelectElement).value).toBe(
        metric
      )
    )
    expect(await screen.findByRole('heading', { name: 'Player One' })).toBeTruthy()
    expect(screen.getByText('NYJ 2025, BUF since 2026')).toBeTruthy()
    // The table, newest first; the first season has no change before it.
    const seasons = screen.getAllByText(/^202[56]$/, { selector: 'span' }).map((s) => s.textContent)
    expect(seasons.slice(-2)).toEqual(['2026', '2025'])
    expect(screen.getByRole('heading', { name: 'Career at a glance' })).toBeTruthy()
  })

  it('says a one-season player’s trends need two seasons', async () => {
    await open('Explore')
    fireEvent.click(await screen.findByRole('tab', { name: 'Trends' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'WR' }))
    const search = await screen.findByRole('combobox', { name: 'Find a WR' })
    await waitFor(() =>
      expect(document.querySelectorAll('datalist option').length).toBeGreaterThan(0)
    )
    fireEvent.change(search, { target: { value: 'Player Two · BUF' } })
    expect(await screen.findByText('Trends need two seasons; he has one.')).toBeTruthy()
  })

  it('follows the dashboard’s player until a choice here, then keeps it', async () => {
    await open('Players')
    await screen.findByRole('tablist', { name: 'Player dashboard' })
    fireEvent.click(screen.getByRole('button', { name: 'Explore' }))
    fireEvent.click(await screen.findByRole('tab', { name: 'Trends' }))
    // Player One (RB) from the dashboard; a new metric keeps him.
    expect(await screen.findByRole('heading', { name: 'Player One' })).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Metric' }), {
      target: { value: 'rush_ypc' }
    })
    expect(await screen.findByRole('heading', { name: 'Player One' })).toBeTruthy()
    // Another position leaves him: a search picks the next one.
    fireEvent.click(screen.getByRole('radio', { name: 'WR' }))
    expect(await screen.findByText('Find a WR to see his seasons.')).toBeTruthy()
  })
})
```

Modify `tests/renderer/components/StatsPlayer.test.tsx`:

```diff
diff --git a/tests/renderer/components/StatsPlayer.test.tsx b/tests/renderer/components/StatsPlayer.test.tsx
index 4a9a24b..31714d2 100644
--- a/tests/renderer/components/StatsPlayer.test.tsx
+++ b/tests/renderer/components/StatsPlayer.test.tsx
@@ -237,9 +237,9 @@ describe('the player dashboard (stats-analysis spec §9.4)', () => {
       expect(within(rail).getAllByRole('button', { name: /Player \d/ })).toHaveLength(3)
     )
     expect(within(rail).getByRole('button', { current: true }).textContent).toContain('Player 1')
-    // Compare comes with Plan AD.
+    // Compare (Plan AD1) opens Explore with him seeded.
     expect((screen.getByRole('button', { name: 'Compare' }) as HTMLButtonElement).disabled).toBe(
-      true
+      false
     )
   })

```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/renderer/components/StatsCharts.test.tsx tests/renderer/components/StatsExplore.test.tsx tests/renderer/components/StatsPlayer.test.tsx
```

Expected: 3 test files fail: 9 failed | 16 passed. `SeasonChart` does not exist (the chart file does not import), there is no Explore in the nav, and the player dashboard's Compare is still disabled.

- [ ] **Step 3: The charts, the screens, the routes**

`--s3`, the handoff's third series colour, in both themes:

Modify `src/renderer/src/assets/main.css`:

```diff
diff --git a/src/renderer/src/assets/main.css b/src/renderer/src/assets/main.css
index eff380b..944239e 100644
--- a/src/renderer/src/assets/main.css
+++ b/src/renderer/src/assets/main.css
@@ -119,9 +119,10 @@
   --l1: oklch(0.95 0.03 25);
   --l2: oklch(0.905 0.06 25);
   --l3: oklch(0.85 0.1 25);
-  /* Chart series (handoff --s1, --s2), validated for colour-blind separation. */
+  /* Chart series (handoff --s1, --s2, --s3); each series also has its own marker shape. */
   --s1: #1f5ed9;
   --s2: #00897d;
+  --s3: #c2378a;
 }

 .dark .stats {
@@ -148,6 +149,7 @@
   --l3: oklch(0.41 0.11 25);
   --s1: #5d8ff2;
   --s2: #26a092;
+  --s3: #e47fb8;
 }

 @theme inline {
@@ -187,6 +189,7 @@
   --color-cobalt-soft: var(--cobalt-soft);
   --color-s1: var(--s1);
   --color-s2: var(--s2);
+  --color-s3: var(--s3);
   --color-h1: var(--h1);
   --color-h2: var(--h2);
   --color-h3: var(--h3);
```

Create `src/renderer/src/components/stats/SeasonChart.tsx`:

```tsx
import { useState } from 'react'
import { Marker, Swatch, type SeriesShape } from '@/components/stats/WeekChart'
import type { BandPoint, TrendPoint } from '@/lib/stats/trends'

const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)']
const SHAPES: SeriesShape[] = ['circle', 'square', 'diamond']

/** Round tick steps: 1, 2, 2.5, 5 × a power of ten. */
function ticks(lo: number, hi: number, n = 4): number[] {
  const raw = (hi - lo || 1) / n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step)
    out.push(Number(v.toFixed(6)))
  return out
}

export interface SeasonSeries {
  id: string
  label: string
  points: TrendPoint[]
}

/**
 * Trends' chart (spec §9.5): a metric by season. The position's qualified median dashed over its
 * 25th–75th band, the entity's line (a season he did not qualify hollow) and up to two more;
 * under each season its team when it changed and his age. Lower-is-better metrics run upside down.
 */
export function SeasonChart({
  series,
  band,
  format,
  label,
  flip = false,
  marks,
  ages,
  hoverInfo
}: {
  series: SeasonSeries[]
  band: BandPoint[]
  format: (v: number) => string
  label: string
  flip?: boolean
  /** A team abbreviation under the seasons it changed. */
  marks: ReadonlyMap<number, string>
  ages: ReadonlyMap<number, number>
  /** The hover card's lines for a season of the main series. */
  hoverInfo: (season: number) => { title: string; lines: string[] } | null
}): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const seasons = band.map((b) => b.season)
  const values = [
    ...series.flatMap((s) => s.points.map((p) => p.value)),
    ...band.flatMap((b) => [b.p25, b.p75])
  ].filter((v): v is number => v !== null)
  if (!seasons.length || !values.length) {
    return <div className="py-16 text-center text-[13px] text-fg-3">No seasons to chart.</div>
  }
  const W = 892
  const H = 300
  const [L, R, T, B] = [52, 20, 18, 54]
  let lo = Math.min(...values)
  let hi = Math.max(...values)
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.12
  lo -= pad
  hi += pad
  const ys = ticks(lo, hi)
  lo = Math.min(lo, ys[0])
  hi = Math.max(hi, ys[ys.length - 1])
  const step = (W - L - R) / seasons.length
  const x = (i: number): number => L + step * (i + 0.5)
  const y = (v: number): number => {
    const t = (v - lo) / (hi - lo || 1)
    return T + (flip ? t : 1 - t) * (H - T - B)
  }
  const line = (vs: (number | null)[]): string => {
    let d = ''
    let pen = false
    vs.forEach((v, i) => {
      if (v === null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`
      pen = true
    })
    return d
  }
  const full = band.every((b) => b.p25 !== null && b.p75 !== null)
  const area = full
    ? `${band.map((b, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(b.p75!).toFixed(1)}`).join('')}${[
        ...band
      ]
        .map((b, i) => ({ b, i }))
        .reverse()
        .map(({ b, i }) => `L${x(i).toFixed(1)} ${y(b.p25!).toFixed(1)}`)
        .join('')}Z`
    : ''
  const info = hover !== null ? hoverInfo(seasons[hover]) : null
  return (
    <figure className="m-0 flex flex-col gap-2">
      <figcaption className="flex flex-wrap items-center gap-4 text-[11.5px] text-fg-3">
        {series.map((s, k) => (
          <span key={s.id} className="flex items-center gap-1.5 text-fg-2">
            <Swatch slot={k} />
            {s.label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="w-3.5 border-t-[1.5px] border-dashed border-fg-3" />
          Median
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-3.5 rounded-[2px] bg-fg-3/15" />
          25th–75th
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full border-[1.5px] border-fg-3" />
          Not qualified
        </span>
      </figcaption>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={label}
          className="block overflow-visible"
          onMouseLeave={() => setHover(null)}
        >
          {ys.map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line-2)" strokeWidth={1} />
              <text
                x={L - 8}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-fg-3 font-mono text-[10.5px]"
              >
                {format(v)}
              </text>
            </g>
          ))}
          {area && <path d={area} fill="var(--fg-3)" fillOpacity={0.12} data-band="" />}
          <path
            d={line(band.map((b) => b.median))}
            fill="none"
            stroke="var(--fg-3)"
            strokeWidth={1.5}
            strokeDasharray="5 4"
            data-median=""
          />
          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--line)" />
          )}
          {series.map((s, k) => (
            <g key={s.id} data-series={s.id}>
              <path
                d={line(s.points.map((p) => p.value))}
                fill="none"
                stroke={COLORS[k]}
                strokeWidth={k === 0 ? 2.5 : 2}
                strokeLinejoin="round"
              />
              {s.points.map((p, i) =>
                p.value === null ? null : k === 0 && !p.qualified ? (
                  <circle
                    key={p.season}
                    cx={x(i)}
                    cy={y(p.value)}
                    r={hover === i ? 6 : 4.5}
                    fill="var(--panel)"
                    stroke={COLORS[k]}
                    strokeWidth={2}
                    data-hollow=""
                  />
                ) : (
                  <Marker
                    key={p.season}
                    shape={SHAPES[k]}
                    cx={x(i)}
                    cy={y(p.value)}
                    r={hover === i && k === 0 ? 6 : 4}
                    fill={COLORS[k]}
                  />
                )
              )}
            </g>
          ))}
          {seasons.map((season, i) => (
            <g key={season}>
              <text
                x={x(i)}
                y={H - B + 18}
                textAnchor="middle"
                className="fill-fg-2 font-mono text-[11px]"
              >
                {season}
              </text>
              {ages.has(season) && (
                <text
                  x={x(i)}
                  y={H - B + 31}
                  textAnchor="middle"
                  className="fill-fg-3 text-[10.5px]"
                >
                  age {ages.get(season)}
                </text>
              )}
              {marks.has(season) && (
                <text
                  x={x(i)}
                  y={H - B + 45}
                  textAnchor="middle"
                  className="fill-fg font-mono text-[9.5px] font-semibold"
                  data-team-mark=""
                >
                  {marks.get(season)}
                </text>
              )}
              <rect
                x={x(i) - step / 2}
                y={T}
                width={step}
                height={H - T}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
            </g>
          ))}
        </svg>
        {info && hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-2 z-10 flex w-[210px] flex-col gap-1 rounded-[9px] bg-panel px-3 py-2.5 text-[11.5px] shadow-[0_0_0_1px_var(--line),0_10px_28px_var(--shadow-c)]"
            style={
              x(hover) > W * 0.62
                ? { right: `${(1 - (x(hover) - 18) / W) * 100}%` }
                : { left: `${((x(hover) + 18) / W) * 100}%` }
            }
          >
            <span className="font-semibold text-fg">{info.title}</span>
            {info.lines.map((l) => (
              <span key={l} className="text-fg-2">
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}
```

Modify `src/renderer/src/components/stats/StatLines.tsx`:

```diff
diff --git a/src/renderer/src/components/stats/StatLines.tsx b/src/renderer/src/components/stats/StatLines.tsx
index 31c894c..c5f9300 100644
--- a/src/renderer/src/components/stats/StatLines.tsx
+++ b/src/renderer/src/components/stats/StatLines.tsx
@@ -1,3 +1,4 @@
+import { TrendingUp } from 'lucide-react'
 import { MetricHover, ReliabilityMarker } from '@/components/stats/MetricCard'
 import type { SectionView, StatLine } from '@/lib/stats/team'
 import { cn } from '@/lib/utils'
@@ -49,7 +50,14 @@ export function PercentileBar({
   )
 }

-function Line({ line }: { line: StatLine }): React.JSX.Element {
+function Line({
+  line,
+  onTrend
+}: {
+  line: StatLine
+  /** Opens Trends on this metric (spec §9.5); a situational line has none. */
+  onTrend?: (metric: string) => void
+}): React.JSX.Element {
   const label = (
     <span
       tabIndex={0}
@@ -65,9 +73,20 @@ function Line({ line }: { line: StatLine }): React.JSX.Element {
   const neutral = line.info?.direction === 'neutral'
   return (
     <div
-      className="grid h-[34px] grid-cols-[minmax(150px,1fr)_76px_minmax(110px,150px)_88px] items-center gap-3.5 border-t border-line-2"
+      className="group relative grid h-[34px] grid-cols-[minmax(150px,1fr)_76px_minmax(110px,150px)_88px] items-center gap-3.5 border-t border-line-2"
       data-metric={line.key}
     >
+      {onTrend && line.key.startsWith('all:') && (
+        <button
+          type="button"
+          onClick={() => onTrend(line.metric)}
+          aria-label={`${line.label} by season`}
+          title="See it by season in Trends"
+          className="absolute top-1/2 -left-7 flex size-[22px] -translate-y-1/2 cursor-pointer items-center justify-center rounded-[6px] text-cobalt opacity-0 shadow-[0_0_0_1px_var(--line)] group-hover:opacity-100 hover:bg-hover focus-visible:opacity-100"
+        >
+          <TrendingUp className="size-3.5" />
+        </button>
+      )}
       {line.info ? (
         <MetricHover info={line.info} missing={line.missing}>
           {label}
@@ -110,9 +129,11 @@ function Line({ line }: { line: StatLine }): React.JSX.Element {
  * rank, league mean; a note beside the title says what the data covers.
  */
 export function StatSection({
-  section
+  section,
+  onTrend
 }: {
   section: SectionView & { note?: string }
+  onTrend?: (metric: string) => void
 }): React.JSX.Element {
   return (
     <section className="flex flex-col gap-2">
@@ -126,7 +147,7 @@ export function StatSection({
       </div>
       <div className="flex flex-col border-b border-line-2">
         {section.lines.map((l) => (
-          <Line key={l.key} line={l} />
+          <Line key={l.key} line={l} onTrend={onTrend} />
         ))}
       </div>
     </section>
@@ -135,14 +156,16 @@ export function StatSection({

 /** Sections in two columns. */
 export function StatSections({
-  sections
+  sections,
+  onTrend
 }: {
   sections: (SectionView & { note?: string })[]
+  onTrend?: (metric: string) => void
 }): React.JSX.Element {
   return (
     <div className="grid grid-cols-[repeat(auto-fit,minmax(520px,1fr))] items-start gap-x-10 gap-y-7">
       {sections.map((s) => (
-        <StatSection key={s.title} section={s} />
+        <StatSection key={s.title} section={s} onTrend={onTrend} />
       ))}
     </div>
   )
```

Modify `src/renderer/src/components/stats/StatsNav.tsx`:

```diff
diff --git a/src/renderer/src/components/stats/StatsNav.tsx b/src/renderer/src/components/stats/StatsNav.tsx
index 006d84e..280791a 100644
--- a/src/renderer/src/components/stats/StatsNav.tsx
+++ b/src/renderer/src/components/stats/StatsNav.tsx
@@ -8,14 +8,15 @@ import type { UpdateState } from '@shared/types'

 /**
  * `player` and `team` are the dashboards (spec §9.4, §9.3), `players` and `teams` the
- * leaderboards.
+ * leaderboards, `explore` Compare and Trends (§9.5).
  */
-export type StatsScreen = 'home' | 'player' | 'players' | 'team' | 'teams' | 'glossary'
+export type StatsScreen = 'home' | 'player' | 'players' | 'team' | 'teams' | 'explore' | 'glossary'

 const ITEMS: { id: StatsScreen | 'games'; label: string }[] = [
   { id: 'home', label: 'Leaderboards' },
   { id: 'player', label: 'Players' },
   { id: 'team', label: 'Teams' },
+  { id: 'explore', label: 'Explore' },
   { id: 'games', label: 'Games' },
   { id: 'glossary', label: 'Glossary' }
 ]
@@ -36,8 +37,8 @@ interface StatsNavProps {
 }

 /**
- * Stats nav (handoff "Stats nav"): 52px, mark + "Companion Stats", five items, Fantasy ↗, theme.
- * Players and Teams open the dashboards.
+ * Stats nav (handoff "Stats nav"): 52px, mark + "Companion Stats", six items, Fantasy ↗, theme.
+ * Players and Teams open the dashboards, Explore Compare and Trends.
  */
 export function StatsNav({
   current,
```

Modify `src/renderer/src/components/stats/WeekChart.tsx`:

```diff
diff --git a/src/renderer/src/components/stats/WeekChart.tsx b/src/renderer/src/components/stats/WeekChart.tsx
index 6c3065f..e78db22 100644
--- a/src/renderer/src/components/stats/WeekChart.tsx
+++ b/src/renderer/src/components/stats/WeekChart.tsx
@@ -1,8 +1,56 @@
 import { useState } from 'react'
 import type { WeekSeries } from '@/lib/stats/team'

-/** Series colours, in a fixed order (handoff --s1, --s2). */
-const COLORS = ['var(--s1)', 'var(--s2)']
+/** Series colours, in a fixed order (handoff --s1, --s2, --s3). */
+const COLORS = ['var(--s1)', 'var(--s2)', 'var(--s3)']
+
+/** A series' marker: each slot its own shape, so the lines read apart without colour. */
+export type SeriesShape = 'circle' | 'square' | 'diamond'
+const SHAPES: SeriesShape[] = ['circle', 'square', 'diamond']
+
+/** A series on the chart; `slot` fixes its colour and shape (Compare keeps a slot's). */
+export type ChartSeries = WeekSeries & { slot?: number }
+
+export function Marker({
+  shape,
+  cx,
+  cy,
+  r,
+  fill
+}: {
+  shape: SeriesShape
+  cx: number
+  cy: number
+  r: number
+  fill: string
+}): React.JSX.Element {
+  const stroke = { stroke: 'var(--panel)', strokeWidth: 2 }
+  if (shape === 'square') {
+    return (
+      <rect x={cx - r} y={cy - r} width={2 * r} height={2 * r} rx={1} fill={fill} {...stroke} />
+    )
+  }
+  if (shape === 'diamond') {
+    const d = r * 1.3
+    return (
+      <path
+        d={`M${cx} ${cy - d}L${cx + d} ${cy}L${cx} ${cy + d}L${cx - d} ${cy}Z`}
+        fill={fill}
+        {...stroke}
+      />
+    )
+  }
+  return <circle cx={cx} cy={cy} r={r} fill={fill} {...stroke} />
+}
+
+/** A legend swatch: the series' colour in its marker shape. */
+export function Swatch({ slot }: { slot: number }): React.JSX.Element {
+  return (
+    <svg width={10} height={10} viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
+      <Marker shape={SHAPES[slot % 3]} cx={5} cy={5} r={3.2} fill={COLORS[slot % 3]} />
+    </svg>
+  )
+}

 /** Round tick steps: 1, 2, 2.5, 5 × a power of ten. */
 function ticks(lo: number, hi: number, n = 4): number[] {
@@ -26,21 +74,32 @@ export function WeekChart({
   format,
   domain,
   height = 200,
-  label
+  width = 720,
+  label,
+  reference,
+  flip = false
 }: {
-  series: WeekSeries[]
+  series: ChartSeries[]
   format: (v: number) => string
   /** A fixed y range (odds: [0, 1]); otherwise the values' own, padded. */
   domain?: [number, number]
   height?: number
   /** What the chart shows, for screen readers. */
   label: string
+  /** The viewBox width: a wide chart keeps its height. */
+  width?: number
+  /** A dashed reference line (Compare: the pool's median each week). */
+  reference?: WeekSeries
+  /** Lower is better: the axis runs upside down, so up is always better. */
+  flip?: boolean
 }): React.JSX.Element {
   const [hovered, setHover] = useState<number | null>(null)
   const weeks = series[0]?.points.map((p) => p.week) ?? []
   // The weeks can shrink under a resting mouse (another team's postseason): drop a stale index.
   const hover = hovered !== null && hovered < weeks.length ? hovered : null
-  const values = series.flatMap((s) => s.points.map((p) => p.value)).filter((v) => v !== null)
+  const values = [...series, ...(reference ? [reference] : [])]
+    .flatMap((s) => s.points.map((p) => p.value))
+    .filter((v) => v !== null)
   if (!weeks.length || !values.length) {
     return (
       <div className="flex items-center justify-center text-[13px] text-fg-3" style={{ height }}>
@@ -48,8 +107,10 @@ export function WeekChart({
       </div>
     )
   }
-  const W = 720
+  const W = width
   const H = height
+  const color = (k: number): string => COLORS[(series[k].slot ?? k) % 3]
+  const shape = (k: number): SeriesShape => SHAPES[(series[k].slot ?? k) % 3]
   const [L, R, T, B, PX] = [44, 72, 12, 26, 14]
   let [lo, hi] = domain ?? [Math.min(...values, 0), Math.max(...values, 0)]
   if (!domain) {
@@ -62,7 +123,23 @@ export function WeekChart({
   hi = Math.max(hi, ys[ys.length - 1])
   const x = (i: number): number =>
     weeks.length === 1 ? (L + W - R) / 2 : L + PX + (i / (weeks.length - 1)) * (W - L - R - PX * 2)
-  const y = (v: number): number => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B)
+  const y = (v: number): number => {
+    const t = (v - lo) / (hi - lo || 1)
+    return T + (flip ? t : 1 - t) * (H - T - B)
+  }
+  const path = (s: WeekSeries): string => {
+    let d = ''
+    let pen = false
+    s.points.forEach((p, i) => {
+      if (p.value === null) {
+        pen = false
+        return
+      }
+      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`
+      pen = true
+    })
+    return d
+  }

   // End labels: at each series' last value, nudged apart when they would overlap.
   const ends = series
@@ -87,14 +164,20 @@ export function WeekChart({

   return (
     <figure className="m-0 flex flex-col gap-2">
-      {series.length > 1 && (
+      {(series.length > 1 || reference) && (
         <figcaption className="flex gap-4 text-[12px] text-fg-2">
           {series.map((s, k) => (
             <span key={s.id} className="flex items-center gap-1.5">
-              <span className="h-[3px] w-3.5 rounded-[2px]" style={{ background: COLORS[k] }} />
+              <Swatch slot={s.slot ?? k} />
               {s.label}
             </span>
           ))}
+          {reference && (
+            <span className="flex items-center gap-1.5 text-fg-3">
+              <span className="w-3.5 border-t-[1.5px] border-dashed border-fg-3" />
+              {reference.label}
+            </span>
+          )}
         </figcaption>
       )}
       <div className="relative">
@@ -148,55 +231,45 @@ export function WeekChart({
               strokeDasharray="3 3"
             />
           )}
-          {series.map((s, k) => {
-            let d = ''
-            let pen = false
-            s.points.forEach((p, i) => {
-              if (p.value === null) {
-                pen = false
-                return
-              }
-              d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`
-              pen = true
-            })
-            return (
-              <g key={s.id}>
-                <path
-                  d={d}
-                  fill="none"
-                  stroke={COLORS[k]}
-                  strokeWidth={2}
-                  strokeLinejoin="round"
-                  strokeLinecap="round"
-                />
-                {s.points.map((p, i) =>
-                  p.value === null ? null : (
-                    <circle
-                      key={p.week}
-                      cx={x(i)}
-                      cy={y(p.value)}
-                      r={hover === i ? 5 : 3.5}
-                      fill={COLORS[k]}
-                      stroke="var(--panel)"
-                      strokeWidth={2}
-                    />
-                  )
-                )}
-              </g>
-            )
-          })}
+          {reference && (
+            <path
+              d={path(reference)}
+              fill="none"
+              stroke="var(--fg-3)"
+              strokeWidth={1.5}
+              strokeDasharray="5 4"
+              data-reference=""
+            />
+          )}
+          {series.map((s, k) => (
+            <g key={s.id}>
+              <path
+                d={path(s)}
+                fill="none"
+                stroke={color(k)}
+                strokeWidth={2}
+                strokeLinejoin="round"
+                strokeLinecap="round"
+              />
+              {s.points.map((p, i) =>
+                p.value === null ? null : (
+                  <Marker
+                    key={p.week}
+                    shape={shape(k)}
+                    cx={x(i)}
+                    cy={y(p.value)}
+                    r={hover === i ? 5 : 3.5}
+                    fill={color(k)}
+                  />
+                )
+              )}
+            </g>
+          ))}
           {ends.map((e) => {
             const y0 = Math.min(Math.max(e.y, T + 4), H - B)
             return (
               <g key={e.k} data-end={series[e.k].id}>
-                <rect
-                  x={x(e.i) + 8}
-                  y={y0 - 1.5}
-                  width={6}
-                  height={3}
-                  rx={1.5}
-                  fill={COLORS[e.k]}
-                />
+                <rect x={x(e.i) + 8} y={y0 - 1.5} width={6} height={3} rx={1.5} fill={color(e.k)} />
                 <text x={x(e.i) + 17} y={y0 + 4} className="fill-fg-2 text-[11px] font-medium">
                   {format(series[e.k].points[e.i].value!)}
                 </text>
@@ -213,13 +286,21 @@ export function WeekChart({
             <span className="font-semibold">Week {weeks[hover]}</span>
             {series.map((s, k) => (
               <span key={s.id} className="flex items-center gap-1.5 whitespace-nowrap text-fg-2">
-                <span className="size-2 rounded-[2px]" style={{ background: COLORS[k] }} />
+                <Swatch slot={s.slot ?? k} />
                 {s.label}
                 <span className="ml-auto pl-2 font-mono text-fg">
                   {s.points[hover].value === null ? 'No game' : format(s.points[hover].value!)}
                 </span>
               </span>
             ))}
+            {reference && reference.points[hover].value !== null && (
+              <span className="flex items-center gap-1.5 whitespace-nowrap text-fg-3">
+                {reference.label}
+                <span className="ml-auto pl-2 font-mono">
+                  {format(reference.points[hover].value!)}
+                </span>
+              </span>
+            )}
           </div>
         )}
       </div>
```

`CompareState` lives with the model (a screen file exports components only):

Modify `src/renderer/src/lib/stats/compare.ts`:

```diff
diff --git a/src/renderer/src/lib/stats/compare.ts b/src/renderer/src/lib/stats/compare.ts
index 254b960..bf2b6e9 100644
--- a/src/renderer/src/lib/stats/compare.ts
+++ b/src/renderer/src/lib/stats/compare.ts
@@ -22,6 +22,26 @@ export type Slots = [string | null, string | null, string | null]

 export const NO_SLOTS: Slots = [null, null, null]

+/** What Compare shows, kept by StatsApp across tabs; `slots` null until the defaults are chosen. */
+export interface CompareState {
+  entity: CompareEntity
+  position: PositionGroup
+  perGame: boolean
+  slots: Slots | null
+  /** The player or team Compare was opened from (a dashboard's Compare button). */
+  seed: string | null
+  side: 'offense' | 'defense'
+}
+
+export const DEFAULT_COMPARE: CompareState = {
+  entity: 'player',
+  position: 'WR',
+  perGame: true,
+  slots: null,
+  seed: null,
+  side: 'offense'
+}
+
 /**
  * Compare › Teams rows (handoff README §7): offense, defense, special teams and situational,
  * percentiles among the 32. An "allowed" metric is better lower: its percentile says so.
```

The position chip's fill moves out of `StatsPlayer` so Trends shares it:

Modify `src/renderer/src/lib/stats/player.ts`:

```diff
diff --git a/src/renderer/src/lib/stats/player.ts b/src/renderer/src/lib/stats/player.ts
index 607df7e..88079e7 100644
--- a/src/renderer/src/lib/stats/player.ts
+++ b/src/renderer/src/lib/stats/player.ts
@@ -623,6 +623,15 @@ export const CORE_METRICS: Record<PositionGroup, string[]> = {
   OL: ['snap_share', 'on_field_epa']
 }

+/** A position chip's fill (defenders, punters and teams in slate). */
+export const POS_BG: Record<string, string> = {
+  QB: 'bg-pos-qb',
+  RB: 'bg-pos-rb',
+  WR: 'bg-pos-wr',
+  TE: 'bg-pos-te',
+  K: 'bg-pos-k'
+}
+
 /** Whether a metric is about this position (spec §6.1 `positions`). */
 export function appliesToPosition(info: MetricInfo | undefined, position: PositionGroup): boolean {
   return !!info && (info.positions === 'all' || info.positions.includes(position))
```

`TrendsState`, with `follow`: Trends shows the dashboards' player until something is picked in it:

Modify `src/renderer/src/lib/stats/trends.ts`:

```diff
diff --git a/src/renderer/src/lib/stats/trends.ts b/src/renderer/src/lib/stats/trends.ts
index cf7f053..51da591 100644
--- a/src/renderer/src/lib/stats/trends.ts
+++ b/src/renderer/src/lib/stats/trends.ts
@@ -17,6 +17,29 @@ import type {
 /** Trends (spec §9.5): a metric by season, 2019 → now, for a player or a team. */
 export type TrendEntity = 'player' | 'team'

+/** What Trends shows, kept by StatsApp across tabs. */
+export interface TrendsState {
+  entity: TrendEntity
+  /** Null: the player or team a dashboard showed last, while `follow`; else none until a search. */
+  id: string | null
+  position: PositionGroup
+  metric: string | null
+  comparisons: string[]
+  perGame: boolean
+  /** Until something is picked here, Trends follows the dashboards' player (or team). */
+  follow: boolean
+}
+
+export const DEFAULT_TRENDS: TrendsState = {
+  entity: 'player',
+  id: null,
+  position: 'WR',
+  metric: null,
+  comparisons: [],
+  perGame: true,
+  follow: true
+}
+
 /** Up to two more series for context: --s2 (square) and --s3 (diamond). */
 export const MAX_COMPARISONS = 2

```

Modify `src/renderer/src/screens/stats/StatsApp.tsx`:

```diff
diff --git a/src/renderer/src/screens/stats/StatsApp.tsx b/src/renderer/src/screens/stats/StatsApp.tsx
index 4db880a..4eab857 100644
--- a/src/renderer/src/screens/stats/StatsApp.tsx
+++ b/src/renderer/src/screens/stats/StatsApp.tsx
@@ -5,11 +5,14 @@ import { useNoteContext, useNoteScreen } from '@/lib/dev/noteContext'
 import { errorMessage } from '@/lib/format'
 import type { NavLocation } from '@/lib/navHistory'
 import type { BoardDef } from '@/lib/stats/boards'
+import { DEFAULT_COMPARE, type CompareState } from '@/lib/stats/compare'
 import { bestFirst, defaultBoard, normalizeBoard } from '@/lib/stats/leaderboard'
 import { defaultPlayer, positionTab, railQuery, type PlayerTab } from '@/lib/stats/player'
 import { defaultScope, type StatsScope } from '@/lib/stats/scope'
 import { defaultTeam, topScorerQuery, type TeamTab } from '@/lib/stats/team'
+import { DEFAULT_TRENDS, type TrendsState } from '@/lib/stats/trends'
 import { useStatsData, useStatsQuery } from '@/lib/stats/useStats'
+import { StatsExplore, type ExploreTab } from '@/screens/stats/StatsExplore'
 import { StatsGlossary } from '@/screens/stats/StatsGlossary'
 import { StatsHome } from '@/screens/stats/StatsHome'
 import { StatsLeaderboard, type LeaderboardOpen } from '@/screens/stats/StatsLeaderboard'
@@ -81,6 +84,10 @@ export function StatsApp({
   // The player dashboard (spec §9.4): the player chosen this session, else my top scorer.
   const [player, setPlayer] = useState<PlayerRef | null>(null)
   const [playerTab, setPlayerTab] = useState<PlayerTab>('overview')
+  // Explore (spec §9.5): its tab and each tab's state, kept for the session.
+  const [exploreTab, setExploreTab] = useState<ExploreTab>('compare')
+  const [compare, setCompare] = useState<CompareState>(DEFAULT_COMPARE)
+  const [trends, setTrends] = useState<TrendsState>(DEFAULT_TRENDS)
   // A focus from Fantasy opens its dashboard once.
   const [focused, setFocused] = useState<number | null>(null)
   if (focus && focus.nonce !== focused) {
@@ -146,6 +153,35 @@ export function StatsApp({
     setPlayer({ id, position })
     setScreen('player')
   }
+  // A dashboard's Compare: that player and his position's top two, or that team and the two
+  // nearest it in Elo.
+  const openCompare = (
+    entity: CompareState['entity'],
+    id: string,
+    position: PositionGroup
+  ): void => {
+    setCompare((c) => ({ ...c, entity, position, slots: null, seed: id }))
+    setExploreTab('compare')
+    setScreen('explore')
+  }
+  // A stat line's trend icon: that metric over his (its) seasons.
+  const openTrends = (
+    entity: TrendsState['entity'],
+    id: string,
+    position: PositionGroup | null,
+    metric: string
+  ): void => {
+    setTrends((t) => ({
+      ...t,
+      entity,
+      id,
+      position: position ?? t.position,
+      metric,
+      comparisons: []
+    }))
+    setExploreTab('trends')
+    setScreen('explore')
+  }

   // N-002: the page for Back. A dashboard waiting for its default is a page too, with no team or
   // player yet: Back from it returns to the page before, and its default then fills it in.
@@ -280,6 +316,8 @@ export function StatsApp({
                   onTab={setTeamTab}
                   onOpenLeaderboard={() => setScreen('teams')}
                   onOpenPlayer={openPlayer}
+                  onCompare={() => openCompare('team', shownTeam, 'WR')}
+                  onTrend={(metric) => openTrends('team', shownTeam, null, metric)}
                 />
               ) : (
                 waiting
@@ -301,10 +339,39 @@ export function StatsApp({
                   onOpenLeaderboard={(position) =>
                     openBoard(defaultBoard('player', position, data.byId), shownPlayer.id)
                   }
+                  onCompare={(position) => openCompare('player', shownPlayer.id, position)}
+                  onTrend={(position, metric) =>
+                    openTrends('player', shownPlayer.id, position, metric)
+                  }
                 />
               ) : (
                 waiting
               ))}
+            {screen === 'explore' && (
+              <StatsExplore
+                data={data}
+                scope={effective}
+                onScope={setChosen}
+                hasLeague={hasLeague}
+                tab={exploreTab}
+                onTab={setExploreTab}
+                compare={compare}
+                onCompare={setCompare}
+                trends={trends}
+                onTrends={setTrends}
+                trendsFallback={
+                  trends.entity === 'team'
+                    ? team
+                      ? { id: team, position: null }
+                      : null
+                    : player?.position
+                      ? { id: player.id, position: player.position }
+                      : null
+                }
+                onOpenPlayer={openPlayer}
+                onOpenTeam={openTeam}
+              />
+            )}
             {screen === 'glossary' && <StatsGlossary catalogue={data.catalogue} />}
             {viewsError && <div className="px-8 pb-4 text-[12px] text-bad">{viewsError}</div>}
           </>
```

Create `src/renderer/src/screens/stats/StatsCompare.tsx`:

```tsx
import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { Segmented, StatsSelect } from '@/components/stats/controls'
import { Loading } from '@/components/stats/parts'
import { PercentileBar } from '@/components/stats/StatLines'
import { Swatch, WeekChart } from '@/components/stats/WeekChart'
import {
  chartMetric,
  compareGroups,
  comparePool,
  compareQuery,
  compareSeries,
  compareView,
  defaultSlots,
  playerCard,
  poolNote,
  slotOptions,
  teamCard,
  weeklyCompareQuery,
  type CompareEntity,
  type CompareRow,
  type CompareState,
  type Slots
} from '@/lib/stats/compare'
import { fmtStat } from '@/lib/stats/format'
import { RAIL_POSITIONS } from '@/lib/stats/player'
import { rangeLabel, type StatsScope } from '@/lib/stats/scope'
import { chartWeeks } from '@/lib/stats/team'
import { useStatsQuery, type StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import { teamAbbr } from '@shared/stats/nflTeams'
import type { PositionGroup, StatsResult } from '@shared/stats/types'

const FRESH = { keepLast: false }
const GRID = 'grid grid-cols-[200px_repeat(3,minmax(0,1fr))] gap-x-4'

/**
 * Compare (spec §9.5, handoff "7. Compare"): three slots side by side, players at one position or
 * teams, every row ranked among the position's qualified players or the 32, and a weekly chart.
 */
export function StatsCompare({
  data,
  scope,
  state,
  onState,
  onOpenPlayer,
  onOpenTeam
}: {
  data: StatsData
  scope: StatsScope
  state: CompareState
  /** Updates from the state as it is then: a late default never undoes a newer choice. */
  onState: (update: (state: CompareState) => CompareState) => void
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
  onOpenTeam: (team: string) => void
}): React.JSX.Element {
  const { entity, position } = state
  // Team rows are rates and season totals (FG over expected): never per game.
  const perGame = entity === 'player' && state.perGame
  const groups = useMemo(
    () => compareGroups(entity, position, data.byId),
    [entity, position, data.byId]
  )
  const q = useMemo(
    () => compareQuery(entity, position, groups, scope, data.status, perGame),
    [entity, position, groups, scope, data.status, perGame]
  )
  const { result, error } = useStatsQuery(q, data.version, FRESH)
  const pool = useMemo(
    () => comparePool(entity, position, result ?? undefined),
    [entity, position, result]
  )
  const mine = useMemo(
    () =>
      new Set(
        Object.entries(data.ownership?.players ?? {})
          .filter(([, o]) => o.mine)
          .map(([id]) => id)
      ),
    [data.ownership]
  )
  const chosen = useMemo(
    () =>
      state.slots ??
      (result ? defaultSlots(entity, position, result, pool, state.seed, mine) : null),
    [state.slots, result, entity, position, pool, state.seed, mine]
  )
  // Once on screen, the default slots stay: a new range does not swap the players.
  useEffect(() => {
    if (state.slots !== null || chosen === null) return
    onState((s) =>
      s.slots === null && s.entity === entity && s.position === position && s.seed === state.seed
        ? { ...s, slots: chosen }
        : s
    )
  }, [state.slots, state.seed, chosen, entity, position, onState])

  const set = (next: Partial<CompareState>): void => onState((s) => ({ ...s, ...next }))
  const setSlot = (k: number, id: string | null): void => {
    if (!chosen) return
    const next = [...chosen] as Slots
    next[k] = id
    set({ slots: next })
  }
  const view = useMemo(
    () =>
      chosen
        ? compareView(result ?? undefined, chosen, groups, data.byId, pool, perGame, scope.season)
        : null,
    [chosen, result, groups, data.byId, pool, perGame, scope.season]
  )
  const filled = chosen?.filter((id) => id !== null).length ?? 0

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-center gap-3.5">
        <Segmented
          label="Players or teams"
          value={entity}
          options={[
            { value: 'player', label: 'Players' },
            { value: 'team', label: 'Teams' }
          ]}
          onChange={(e) => set({ entity: e, slots: null, seed: null })}
        />
        {entity === 'player' && (
          <Segmented
            label="Position"
            value={position}
            options={RAIL_POSITIONS.map((p) => ({ value: p, label: p }))}
            onChange={(p) => set({ position: p, slots: null, seed: null })}
          />
        )}
        {entity === 'player' && (
          <Segmented
            label="Totals or per game"
            value={perGame ? 'per' : 'total'}
            options={[
              { value: 'total', label: 'Totals' },
              { value: 'per', label: 'Per game' }
            ]}
            onChange={(v) => set({ perGame: v === 'per' })}
          />
        )}
      </div>
      {error ? (
        <Loading error={error} />
      ) : !chosen || !view || !result ? (
        <Loading />
      ) : (
        <>
          <div className={cn(GRID, 'items-stretch')}>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <h1 className="m-0 text-[28px] leading-none font-bold tracking-[-0.03em]">
                Head to head
              </h1>
              <div className="text-[12.5px] text-fg-2">
                {rangeLabel(scope, data.status)}
                {entity === 'player' && ` · ${perGame ? 'per game' : 'totals'}`}
              </div>
              <div className="text-[12px] leading-[1.4] text-pretty text-fg-3">
                {poolNote(entity, position, pool)} Best value in each row is bold.
              </div>
            </div>
            {chosen.map((id, k) => (
              <SlotCard
                key={k}
                slot={k}
                id={id}
                entity={entity}
                position={position}
                result={result}
                pool={pool}
                leads={filled > 1 ? `Leads ${view.leads[k]} of ${view.counted}` : ''}
                canRemove={filled > 1}
                options={slotOptions(entity, position, result, pool, data.ownership)}
                onPick={(v) => setSlot(k, v)}
                onRemove={() => setSlot(k, null)}
                onOpen={() =>
                  id && (entity === 'team' ? onOpenTeam(id) : onOpenPlayer(id, position))
                }
              />
            ))}
          </div>
          <div className="flex flex-col">
            {view.groups.map((g) => (
              <div key={g.label} className="flex flex-col">
                <div
                  className={cn(
                    GRID,
                    'h-[34px] items-end border-b border-fg-3 pb-[7px] font-mono text-[11px] leading-none tracking-[0.04em] text-fg-3 uppercase'
                  )}
                >
                  <span className="text-fg">{g.label}</span>
                  <span>Value · percentile · rank</span>
                </div>
                {g.rows.map((r) => (
                  <MetricRow key={r.metric} row={r} />
                ))}
              </div>
            ))}
          </div>
          <WeeklyChart
            data={data}
            scope={scope}
            state={state}
            slots={chosen}
            result={result}
            pool={pool}
            onSide={(side) => set({ side })}
          />
        </>
      )}
    </div>
  )
}

function SlotCard({
  slot,
  id,
  entity,
  position,
  result,
  pool,
  leads,
  canRemove,
  options,
  onPick,
  onRemove,
  onOpen
}: {
  slot: number
  id: string | null
  entity: CompareEntity
  position: PositionGroup
  result: StatsResult
  pool: ReadonlySet<string>
  leads: string
  canRemove: boolean
  options: { value: string; label: string }[]
  onPick: (id: string) => void
  onRemove: () => void
  onOpen: () => void
}): React.JSX.Element {
  const what = entity === 'team' ? 'team' : 'player'
  if (!id) {
    return (
      <div className="flex min-w-0 flex-col justify-center gap-3 rounded-[10px] border-[1.5px] border-dashed border-line px-4 py-3.5">
        <div className="flex items-center gap-2 text-[13px] font-medium text-fg-2">
          <Swatch slot={slot} />
          Add a {slot === 2 ? 'third' : slot === 1 ? 'second' : 'first'} {what}…
        </div>
        <StatsSelect
          title={`Add a ${what}`}
          value=""
          options={[{ value: '', label: `Choose a ${what}` }, ...options]}
          onChange={(v) => v && onPick(v)}
          className="w-full"
        />
      </div>
    )
  }
  const picks = options.some((o) => o.value === id)
    ? options
    : [{ value: id, label: id }, ...options]
  const head = (children: React.ReactNode): React.JSX.Element => (
    <div className="flex items-center gap-2 text-[12px] leading-none text-fg-2">
      <Swatch slot={slot} />
      {children}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove from comparison"
          title="Remove from comparison"
          className="ml-auto flex size-[22px] cursor-pointer items-center justify-center rounded-[5px] text-fg-3 hover:bg-hover hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
  const swap = (
    <StatsSelect
      title={`Swap ${what}`}
      value={id}
      options={picks}
      onChange={onPick}
      className="w-full bg-paper text-fg-2"
    />
  )
  if (entity === 'team') {
    const c = teamCard(result, id)
    return (
      <div className="flex min-w-0 flex-col gap-2.5 rounded-[10px] bg-panel px-4 pt-3.5 pb-3 shadow-[0_0_0_1px_var(--line)]">
        {head(
          <>
            <span className="font-mono text-[11.5px] text-fg">{c.record}</span>
            {c.place && (
              <>
                <span className="text-fg-3">·</span>
                <span className="truncate">{c.place}</span>
              </>
            )}
          </>
        )}
        <button
          type="button"
          onClick={onOpen}
          title="Open the team dashboard"
          className="flex min-w-0 cursor-pointer items-baseline gap-2.5 text-left hover:text-cobalt"
        >
          <span className="font-cond text-[34px] leading-[0.9] font-extrabold">{teamAbbr(id)}</span>
          <span className="truncate text-[14px] text-fg-2">{c.name}</span>
        </button>
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-fg-2">
            Elo <span className="font-mono font-semibold text-fg">{c.elo ?? '—'}</span>
          </span>
          <span className="font-mono text-[11px] text-fg-3">{leads}</span>
        </div>
        {swap}
      </div>
    )
  }
  const c = playerCard(result, id, pool)
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-[10px] bg-panel px-4 pt-3.5 pb-3 shadow-[0_0_0_1px_var(--line)]">
      {head(
        <>
          <span className="font-mono text-[11.5px] font-semibold text-fg">
            {c.team ? teamAbbr(c.team) : 'FA'}
          </span>
          <span className="text-fg-3">·</span>
          <span>{c.games}</span>
          {!c.qualified && (
            <span
              title={`Below the ${position} leaderboard’s qualifying sample, so no percentiles`}
              className="rounded-[4px] px-[5px] py-[3px] font-mono text-[10.5px] text-fg-3 shadow-[inset_0_0_0_1px_var(--line)]"
            >
              NQ
            </span>
          )}
        </>
      )}
      <button
        type="button"
        onClick={onOpen}
        title="Open his dashboard"
        className="flex min-w-0 cursor-pointer flex-col gap-0.5 text-left hover:text-cobalt"
      >
        <span className="truncate text-[15px] leading-[1.1] text-fg-2">{c.first}</span>
        <span className="truncate text-[26px] leading-[1.05] font-bold tracking-[-0.03em]">
          {c.last}
        </span>
      </button>
      <div className="flex justify-end font-mono text-[11px] text-fg-3">{leads}</div>
      {swap}
    </div>
  )
}

function MetricRow({ row }: { row: CompareRow }): React.JSX.Element {
  return (
    <div
      className={cn(GRID, 'h-[38px] items-center border-b border-line-2')}
      data-metric={row.metric}
    >
      <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        <span className="truncate text-[12.5px] text-fg-2">{row.label}</span>
        {row.sub && <span className="font-mono text-[10.5px] text-fg-3">{row.sub}</span>}
      </div>
      {row.missing ? (
        <span className="col-span-3 text-[12px] text-fg-3">{row.missing}</span>
      ) : (
        row.cells.map((c, k) =>
          c === null ? (
            <span key={k} />
          ) : (
            <div
              key={k}
              title={c.title || undefined}
              className="grid min-w-0 grid-cols-[62px_minmax(0,1fr)_34px] items-center gap-3"
            >
              <span
                className={cn(
                  'font-mono tabular-nums',
                  c.lead ? 'text-[13.5px] font-bold text-fg' : 'text-[13px] text-fg-2'
                )}
              >
                {c.text}
              </span>
              {c.percentile !== null ? (
                <div className="px-[13px]">
                  <PercentileBar
                    percentile={c.percentile}
                    neutral={row.info?.direction === 'neutral'}
                  />
                </div>
              ) : (
                <span className="h-[2px] rounded-[1px] bg-line-2" />
              )}
              <span className="text-right font-mono text-[11px] text-fg-3">{c.rank ?? ''}</span>
            </div>
          )
        )
      )}
    </div>
  )
}

function WeeklyChart({
  data,
  scope,
  state,
  slots,
  result,
  pool,
  onSide
}: {
  data: StatsData
  scope: StatsScope
  state: CompareState
  slots: Slots
  result: StatsResult
  pool: ReadonlySet<string>
  onSide: (side: 'offense' | 'defense') => void
}): React.JSX.Element {
  const { entity, position } = state
  const metric = chartMetric(entity, position, state.side)
  const info = data.byId.get(metric)
  const q = useMemo(
    () => weeklyCompareQuery(entity, position, metric, scope, data.status),
    [entity, position, metric, scope, data.status]
  )
  const { result: weekly, error } = useStatsQuery(q, data.version, FRESH)
  const weeks = chartWeeks(weekly, scope, data.status)
  const labels = slots.map((id) => {
    if (!id) return ''
    if (entity === 'team') return teamAbbr(id)
    const name = result.rows.find((r) => r.id === id)?.name ?? id
    return name.split(' ').slice(1).join(' ') || name
  })
  const { series, median } = compareSeries(weekly, slots, labels, metric, weeks, pool)
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const flip = info?.direction === 'lower'
  const title = `${info?.label ?? metric} by week`
  return (
    <section className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">{title}</h2>
          <span className="text-[12px] text-fg-3">
            {flip ? 'Flipped so up is better · gaps are byes' : 'Gaps are byes or games missed'}
          </span>
        </div>
        {entity === 'team' && (
          <Segmented
            label="Offense or defense"
            value={state.side}
            options={[
              { value: 'offense', label: 'Offense' },
              { value: 'defense', label: 'Defense' }
            ]}
            onChange={onSide}
          />
        )}
      </div>
      {error ? (
        <Loading error={error} />
      ) : !weekly ? (
        <Loading />
      ) : (
        <WeekChart
          series={series}
          reference={{
            ...median,
            label: entity === 'team' ? 'League median' : `Median qualified ${position}`
          }}
          format={(v) => fmtStat(v, f)}
          width={1216}
          height={230}
          flip={flip}
          label={title}
        />
      )}
    </section>
  )
}
```

Create `src/renderer/src/screens/stats/StatsExplore.tsx`:

```tsx
import { ScopeBar } from '@/components/stats/ScopeBar'
import type { CompareState } from '@/lib/stats/compare'
import type { StatsScope } from '@/lib/stats/scope'
import type { TrendsState } from '@/lib/stats/trends'
import type { StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import { StatsCompare } from '@/screens/stats/StatsCompare'
import { StatsTrends } from '@/screens/stats/StatsTrends'
import type { PositionGroup } from '@shared/stats/types'

/** Explore's sub-tabs (spec §9.5): the chart explorer comes with Plan AD2. */
export type ExploreTab = 'chart' | 'compare' | 'trends'

const TABS: { id: ExploreTab; label: string; soon?: string }[] = [
  { id: 'chart', label: 'Chart', soon: 'The chart explorer comes in a later update' },
  { id: 'compare', label: 'Compare' },
  { id: 'trends', label: 'Trends' }
]

/** Explore (handoff "Explore"): Chart · Compare · Trends over the shared scope. */
export function StatsExplore({
  data,
  scope,
  onScope,
  hasLeague,
  tab,
  onTab,
  compare,
  onCompare,
  trends,
  onTrends,
  trendsFallback,
  onOpenPlayer,
  onOpenTeam
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  tab: ExploreTab
  onTab: (tab: ExploreTab) => void
  compare: CompareState
  onCompare: (update: (state: CompareState) => CompareState) => void
  trends: TrendsState
  onTrends: (update: (state: TrendsState) => TrendsState) => void
  /** Trends' player or team when none is picked: the one a dashboard showed last. */
  trendsFallback: { id: string; position: PositionGroup | null } | null
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
  onOpenTeam: (team: string) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5 px-8 pt-[18px] pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3.5">
        <div
          role="tablist"
          aria-label="Explore"
          className="flex gap-0.5 rounded-[7px] bg-panel-2 p-0.5"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              disabled={!!t.soon}
              title={t.soon}
              onClick={() => onTab(t.id)}
              className={cn(
                'h-[26px] cursor-pointer rounded-[5px] px-3.5 text-[12.5px] disabled:cursor-default disabled:opacity-40',
                t.id === tab
                  ? 'bg-panel font-semibold text-fg shadow-[0_0_0_1px_var(--line)]'
                  : 'font-medium text-fg-2 hover:text-fg disabled:hover:text-fg-2'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <ScopeBar scope={scope} status={data.status} hasLeague={hasLeague} onChange={onScope} />
      </div>
      {tab === 'compare' && (
        <StatsCompare
          data={data}
          scope={scope}
          state={compare}
          onState={onCompare}
          onOpenPlayer={onOpenPlayer}
          onOpenTeam={onOpenTeam}
        />
      )}
      {tab === 'trends' && (
        <StatsTrends
          data={data}
          scope={scope}
          state={trends}
          onState={onTrends}
          fallback={trendsFallback}
        />
      )}
    </div>
  )
}
```

Modify `src/renderer/src/screens/stats/StatsPlayer.tsx`:

```diff
diff --git a/src/renderer/src/screens/stats/StatsPlayer.tsx b/src/renderer/src/screens/stats/StatsPlayer.tsx
index 65116cf..4407c35 100644
--- a/src/renderer/src/screens/stats/StatsPlayer.tsx
+++ b/src/renderer/src/screens/stats/StatsPlayer.tsx
@@ -40,6 +40,7 @@ import {
   playerTabs,
   pointsSeries,
   positionGroup,
+  POS_BG,
   positionTab,
   profileQuery,
   projectionView,
@@ -80,14 +81,6 @@ import type { PlayerBio, PositionGroup, StatsRow } from '@shared/stats/types'
 /** The dashboard is about one player: never another player's (or tab's) answers while his own load. */
 const FRESH = { keepLast: false }

-const POS_BG: Record<string, string> = {
-  QB: 'bg-pos-qb',
-  RB: 'bg-pos-rb',
-  WR: 'bg-pos-wr',
-  TE: 'bg-pos-te',
-  K: 'bg-pos-k'
-}
-
 interface TabProps {
   data: StatsData
   scope: StatsScope
@@ -96,6 +89,8 @@ interface TabProps {
   bio: PlayerBio | null
   /** The league's key with a league (Fantasy's projections), null without one. */
   league: number | null
+  /** A stat line's trend icon: Trends on that metric (spec §9.5). */
+  onTrend?: (metric: string) => void
 }

 /** The player shown: his gsis id and the position group his dashboard follows. */
@@ -120,7 +115,9 @@ export function StatsPlayer({
   onOpenTeam,
   onOpenLeaderboard,
   leagueKey = 0,
-  onOpenFantasyPlayer
+  onOpenFantasyPlayer,
+  onCompare,
+  onTrend
 }: {
   data: StatsData
   scope: StatsScope
@@ -137,6 +134,10 @@ export function StatsPlayer({
   leagueKey?: number
   /** His file in Companion Fantasy (spec §9.4), with a league. */
   onOpenFantasyPlayer?: (playerId: string) => void
+  /** Compare him with his position's top two (spec §9.5). */
+  onCompare?: (position: PositionGroup) => void
+  /** Trends on a metric of his (spec §9.5). */
+  onTrend?: (position: PositionGroup, metric: string) => void
 }): React.JSX.Element {
   const { bio, error: bioError } = usePlayerBio(player.id, data.version)
   // Dev-mode spec §3: the dashboard's player and tab.
@@ -255,6 +256,7 @@ export function StatsPlayer({
               onOpenTeam={onOpenTeam}
               leagueKey={leagueKey}
               onOpenFantasyPlayer={onOpenFantasyPlayer}
+              onCompare={onCompare && (() => onCompare(position))}
             />
             <div className="flex items-end justify-between gap-4 border-b border-line">
               <div role="tablist" aria-label="Player dashboard" className="flex gap-[22px]">
@@ -298,6 +300,7 @@ export function StatsPlayer({
               position={position}
               bio={bio}
               league={hasLeague ? leagueKey : null}
+              onTrend={onTrend && ((m) => onTrend(position, m))}
             />
           </div>
         )}
@@ -336,7 +339,8 @@ function Header({
   rank,
   onOpenTeam,
   leagueKey,
-  onOpenFantasyPlayer
+  onOpenFantasyPlayer,
+  onCompare
 }: {
   data: StatsData
   scope: StatsScope
@@ -350,6 +354,7 @@ function Header({
   onOpenTeam: (team: string) => void
   leagueKey: number
   onOpenFantasyPlayer?: (playerId: string) => void
+  onCompare?: () => void
 }): React.JSX.Element {
   const h = playerHeader(bio, row, scope, data.status)
   const team = row?.team ?? bio.team
@@ -422,9 +427,10 @@ function Header({
         <div className="flex items-center gap-2">
           <button
             type="button"
-            disabled
-            title="Compare comes in a later update"
-            className="flex h-8 cursor-default items-center rounded-[8px] bg-cobalt px-3.5 text-[12.5px] font-medium text-on-cobalt opacity-40"
+            disabled={!onCompare}
+            onClick={onCompare}
+            title="Compare him with his position’s top two"
+            className="flex h-8 cursor-pointer items-center rounded-[8px] bg-cobalt px-3.5 text-[12.5px] font-medium text-on-cobalt hover:opacity-90 disabled:cursor-default disabled:opacity-40"
           >
             Compare
           </button>
@@ -452,7 +458,7 @@ function Header({
 }

 /** The handoff's tiles, the percentile rankings, fantasy points by week, the season and the career. */
-function Overview({ data, scope, player, position, bio }: TabProps): React.JSX.Element {
+function Overview({ data, scope, player, position, bio, onTrend }: TabProps): React.JSX.Element {
   const kind = kindOf(position)
   const sections = useMemo(() => overviewSections(position, data.byId), [position, data.byId])
   const queries = useMemo(
@@ -517,7 +523,10 @@ function Overview({ data, scope, player, position, bio }: TabProps): React.JSX.E
       </div>
       <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-8">
         {views[0] ? (
-          <StatSection section={{ ...views[0], note: `vs ${pool} qualified ${position}s` }} />
+          <StatSection
+            section={{ ...views[0], note: `vs ${pool} qualified ${position}s` }}
+            onTrend={onTrend}
+          />
         ) : (
           <span />
         )}
@@ -596,7 +605,8 @@ function LinesTab({
   scope,
   player,
   position,
-  tab
+  tab,
+  onTrend
 }: TabProps & { tab: PlayerTab }): React.JSX.Element {
   const sections = useMemo(() => sectionsFor(tab, position, data.byId), [tab, position, data.byId])
   const queries = useMemo(
@@ -608,6 +618,7 @@ function LinesTab({
   return (
     <StatSections
       sections={playerSectionViews(sections, results, player, position, data.byId, scope.season)}
+      onTrend={onTrend}
     />
   )
 }
```

Modify `src/renderer/src/screens/stats/StatsTeam.tsx`:

```diff
diff --git a/src/renderer/src/screens/stats/StatsTeam.tsx b/src/renderer/src/screens/stats/StatsTeam.tsx
index 6c4b239..68fe419 100644
--- a/src/renderer/src/screens/stats/StatsTeam.tsx
+++ b/src/renderer/src/screens/stats/StatsTeam.tsx
@@ -64,6 +64,8 @@ interface TabProps {
   games: TeamGame[] | null
   /** A player's name opens his dashboard (spec §9.4). */
   onOpenPlayer?: (id: string, position: PositionGroup | null) => void
+  /** A stat line's trend icon: Trends on that metric (spec §9.5). */
+  onTrend?: (metric: string) => void
 }

 /**
@@ -80,7 +82,9 @@ export function StatsTeam({
   tab,
   onTab,
   onOpenLeaderboard,
-  onOpenPlayer
+  onOpenPlayer,
+  onCompare,
+  onTrend
 }: {
   data: StatsData
   scope: StatsScope
@@ -93,6 +97,9 @@ export function StatsTeam({
   /** The team leaderboard (spec §9.2). */
   onOpenLeaderboard: () => void
   onOpenPlayer?: (id: string, position: PositionGroup | null) => void
+  /** Compare the team with the two nearest it in Elo (spec §9.5). */
+  onCompare?: () => void
+  onTrend?: (metric: string) => void
 }): React.JSX.Element {
   const { games: raw, error: gamesError } = useTeamGames(scope.season, team, data.version)
   const games = useMemo(() => (raw ? teamGames(raw, team) : null), [raw, team])
@@ -102,7 +109,7 @@ export function StatsTeam({
     [scope, data.status]
   )
   const { results: ratings } = useStatsQueries(overview, data.version, FRESH)
-  const props: TabProps = { data, scope, team, games, onOpenPlayer }
+  const props: TabProps = { data, scope, team, games, onOpenPlayer, onTrend }

   return (
     <div className="flex flex-col gap-5 px-8 pt-[22px] pb-8">
@@ -115,6 +122,7 @@ export function StatsTeam({
         onTeam={onTeam}
         games={games}
         place={scope.seasonType === 'REG' ? standing(ratings?.get('all'), team) : null}
+        onCompare={onCompare}
       />
       <div className="flex items-end justify-between gap-4 border-b border-line">
         <div role="tablist" aria-label="Team dashboard" className="flex gap-[22px]">
@@ -170,7 +178,8 @@ function Header({
   team,
   onTeam,
   games,
-  place
+  place,
+  onCompare
 }: {
   data: StatsData
   scope: StatsScope
@@ -180,6 +189,7 @@ function Header({
   onTeam: (team: string) => void
   games: TeamGame[] | null
   place: string | null
+  onCompare?: () => void
 }): React.JSX.Element {
   const inScope = games ? gamesInScope(games, scope, data.status) : []
   // Until the team's games arrive, no tile shows another team's record.
@@ -246,7 +256,19 @@ function Header({
             </div>
           </div>
         </div>
-        <ScopeBar scope={scope} status={data.status} hasLeague={hasLeague} onChange={onScope} />
+        <div className="flex shrink-0 flex-col items-end gap-3">
+          <ScopeBar scope={scope} status={data.status} hasLeague={hasLeague} onChange={onScope} />
+          {onCompare && (
+            <button
+              type="button"
+              onClick={onCompare}
+              title="Compare with the two teams nearest in Elo"
+              className="flex h-8 cursor-pointer items-center rounded-[8px] bg-cobalt px-3.5 text-[12.5px] font-medium text-on-cobalt hover:opacity-90"
+            >
+              Compare
+            </button>
+          )}
+        </div>
       </div>
       {cards.length > 0 && (
         <div className="flex gap-1.5 overflow-x-auto pb-1" role="list" aria-label="Results">
@@ -308,7 +330,8 @@ function Overview({
   team,
   games,
   ratings,
-  onOpenPlayer
+  onOpenPlayer,
+  onTrend
 }: TabProps & { ratings: Map<SplitKey, StatsResult> | null }): React.JSX.Element {
   const open = (id: string, position: string | null): (() => void) | undefined =>
     onOpenPlayer ? () => onOpenPlayer(id, positionGroup(position)) : undefined
@@ -419,7 +442,7 @@ function Overview({
       </div>
       <div className="flex flex-col gap-7">
         {next && <NextGame game={next} team={team} />}
-        {sections && <StatSection section={sections[0]} />}
+        {sections && <StatSection section={sections[0]} onTrend={onTrend} />}
         <section className="flex flex-col gap-2.5">
           <SectionHead title="EPA per play by week" note="Offense, and allowed by the defense" />
           <WeekChart
@@ -481,7 +504,8 @@ function LinesTab({
   team,
   sections,
   tab,
-  onOpenPlayer
+  onOpenPlayer,
+  onTrend
 }: TabProps & { sections: SectionDef[]; tab: TeamTab }): React.JSX.Element {
   const queries = useMemo(
     () => sectionQueries(sections, scope, data.status),
@@ -491,7 +515,10 @@ function LinesTab({
   return (
     <div className="flex flex-col gap-8">
       {results ? (
-        <StatSections sections={sectionViews(sections, results, team, data.byId, scope.season)} />
+        <StatSections
+          sections={sectionViews(sections, results, team, data.byId, scope.season)}
+          onTrend={onTrend}
+        />
       ) : (
         <Loading error={error} />
       )}
```

Create `src/renderer/src/screens/stats/StatsTrends.tsx`:

```tsx
import { useId, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Segmented } from '@/components/stats/controls'
import { Loading } from '@/components/stats/parts'
import { SeasonChart, type SeasonSeries } from '@/components/stats/SeasonChart'
import { Swatch } from '@/components/stats/WeekChart'
import { familyLabel, fmtStat, ordinal } from '@/lib/stats/format'
import { POS_BG, RAIL_POSITIONS } from '@/lib/stats/player'
import type { StatsScope } from '@/lib/stats/scope'
import {
  careerSpan,
  gamesBySeason,
  glanceViews,
  MAX_COMPARISONS,
  playerTeamsQuery,
  seasonAge,
  teamMarks,
  teamRuns,
  teamsBySeason,
  trendBand,
  trendCore,
  trendLine,
  trendMetrics,
  trendNotes,
  trendQuery,
  trendRows,
  trendSeasons,
  type GlanceView,
  type TrendEntity,
  type TrendsState
} from '@/lib/stats/trends'
import { usePlayerBio, useStatsQuery, type StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import { STATS_TEAMS, TEAM_NAMES, teamAbbr } from '@shared/stats/nflTeams'
import type { PositionGroup, StatsResult } from '@shared/stats/types'

const FRESH = { keepLast: false }

/** Players or teams a search offers: every one with a row at the position since 2019. */
function searchOptions(
  entity: TrendEntity,
  result: StatsResult | null
): { id: string; label: string }[] {
  if (entity === 'team')
    return STATS_TEAMS.map((t) => ({ id: t, label: `${teamAbbr(t)} · ${TEAM_NAMES[t] ?? t}` }))
  const latest = new Map<string, { name: string; team: string | null; season: number }>()
  for (const r of result?.rows ?? []) {
    const season = Number(r.group.season)
    const was = latest.get(r.id)
    if (!was || season > was.season) latest.set(r.id, { name: r.name, team: r.team, season })
  }
  return [...latest]
    .map(([id, p]) => ({ id, label: `${p.name} · ${p.team ? teamAbbr(p.team) : 'FA'}` }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** A search box over a datalist: picking a name opens it. */
function Search({
  options,
  placeholder,
  onPick,
  autoFocus
}: {
  options: { id: string; label: string }[]
  placeholder: string
  onPick: (id: string) => void
  autoFocus?: boolean
}): React.JSX.Element {
  const [text, setText] = useState('')
  const list = useId()
  return (
    <>
      <input
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        list={list}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => {
          const hit = options.find((o) => o.label === e.target.value)
          if (hit) {
            onPick(hit.id)
            setText('')
          } else setText(e.target.value)
        }}
        className="h-7 w-[220px] rounded-[6px] border border-line bg-panel px-2.5 text-[12.5px] text-fg placeholder:text-fg-3"
      />
      <datalist id={list}>
        {options.map((o) => (
          <option key={o.id} value={o.label} />
        ))}
      </datalist>
    </>
  )
}

/**
 * Trends (spec §9.5): a metric by season, 2019 → now, for a player or a team and up to two more,
 * the position's qualified median and middle half each season, a table and the core metrics.
 */
export function StatsTrends({
  data,
  scope,
  state,
  onState,
  fallback
}: {
  data: StatsData
  scope: StatsScope
  state: TrendsState
  onState: (update: (state: TrendsState) => TrendsState) => void
  /** The dashboard's player or team, when no one is picked yet. */
  fallback: { id: string; position: PositionGroup | null } | null
}): React.JSX.Element {
  const { entity, perGame } = state
  const isPlayer = entity === 'player'
  const following = state.id === null && state.follow && fallback !== null
  const id = following ? fallback.id : state.id
  const position = following ? (fallback.position ?? state.position) : state.position
  // The first choice here keeps the player followed (a new metric is his), then stops following.
  const set = (next: Partial<TrendsState>): void =>
    onState((s) => ({
      ...s,
      ...(following ? { id: fallback.id, position } : {}),
      follow: false,
      ...next
    }))
  const groups = useMemo(
    () => trendMetrics(entity, position, data.catalogue),
    [entity, position, data.catalogue]
  )
  const offered = groups.flatMap((g) => g.metrics.map((m) => m.id))
  const core = useMemo(() => trendCore(entity, position, data.byId), [entity, position, data.byId])
  const metric =
    state.metric && offered.includes(state.metric) ? state.metric : (core[0] ?? offered[0])
  const info = data.byId.get(metric)
  const q = useMemo(
    () => trendQuery(entity, position, [metric, ...core], scope, data.status, perGame),
    [entity, position, metric, core, scope, data.status, perGame]
  )
  const { result, error } = useStatsQuery(q, data.version, FRESH)
  const tq = useMemo(
    () => (isPlayer && id ? playerTeamsQuery(id, scope, data.status) : null),
    [isPlayer, id, scope, data.status]
  )
  const { result: teamRows } = useStatsQuery(tq, data.version, FRESH)
  const { bio } = usePlayerBio(isPlayer ? id : null, data.version)
  const options = useMemo(() => searchOptions(entity, result), [entity, result])
  const [adding, setAdding] = useState(false)

  const seasons = trendSeasons(data.status)
  const current = seasons[seasons.length - 1]
  const span = id ? careerSpan(result, id, seasons) : []
  const teams = teamsBySeason(teamRows)
  const ids = id ? [id, ...state.comparisons.filter((c) => c !== id).slice(0, MAX_COMPARISONS)] : []
  const nameOf = (x: string): string =>
    isPlayer
      ? ([...(result?.rows ?? [])].reverse().find((r) => r.id === x)?.name ?? bio?.name ?? x)
      : (TEAM_NAMES[x] ?? x)
  const shortOf = (x: string): string =>
    isPlayer ? nameOf(x).split(' ').slice(1).join(' ') || nameOf(x) : teamAbbr(x)
  const direction = info?.direction ?? 'neutral'
  const lines = ids.map((x) => trendLine(result, x, metric, span, entity, position, direction))
  const main = lines[0] ?? []
  const estimated = main.some((p) => p.estimated && p.season === current)
  const notes = trendNotes(info, span, current, estimated)
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const fmt = (v: number): string => fmtStat(v, f, perGame)
  const ages = new Map(
    isPlayer && bio
      ? span.flatMap((s) => {
          const a = seasonAge(bio.birthDate, s)
          return a === null ? [] : [[s, a] as const]
        })
      : []
  )
  const played = gamesBySeason(teamRows)
  // Players: his weekly rows; teams: the by-season row.
  const games = (season: number): number | null =>
    played.get(season) ??
    result?.rows.find((r) => r.id === id && Number(r.group.season) === season)?.games ??
    null
  const rows = trendRows(
    main,
    info,
    span.map((s) => ({
      season: s,
      team: isPlayer ? (teams.get(s) ?? []).map(teamAbbr).join(' → ') : '',
      games: games(s),
      age: ages.get(s) ?? null
    })),
    perGame
  )
  const glance = id
    ? glanceViews(result, id, core, span, entity, position, data.byId, current, perGame)
    : []
  const series: SeasonSeries[] = ids.map((x, k) => ({ id: x, label: shortOf(x), points: lines[k] }))
  const runs = isPlayer ? teamRuns(span, teams) : ''
  const lastTeam = isPlayer ? (teams.get(span[span.length - 1])?.at(-1) ?? bio?.team ?? null) : id

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3.5">
        <Segmented
          label="Players or teams"
          value={entity}
          options={[
            { value: 'player', label: 'Players' },
            { value: 'team', label: 'Teams' }
          ]}
          onChange={(e) => set({ entity: e, id: null, comparisons: [], metric: null })}
        />
        {isPlayer && (
          <Segmented
            label="Position"
            value={position}
            options={RAIL_POSITIONS.map((p) => ({ value: p, label: p }))}
            onChange={(p) => set({ position: p, id: null, comparisons: [], metric: null })}
          />
        )}
        <Search
          options={options}
          placeholder={isPlayer ? `Find a ${position}` : 'Find a team'}
          onPick={(x) => set({ id: x, position, comparisons: [] })}
        />
        <select
          aria-label="Metric"
          title="Metric"
          value={metric}
          onChange={(e) => set({ metric: e.target.value })}
          className="h-7 max-w-[260px] cursor-pointer rounded-[6px] border border-line bg-panel px-1.5 text-[12.5px] font-medium text-fg"
        >
          {groups.map((g) => (
            <optgroup key={g.family} label={familyLabel(g.family)}>
              {g.metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {info?.kind === 'count' && (
          <Segmented
            label="Totals or per game"
            value={perGame ? 'per' : 'total'}
            options={[
              { value: 'total', label: 'Totals' },
              { value: 'per', label: 'Per game' }
            ]}
            onChange={(v) => set({ perGame: v === 'per' })}
          />
        )}
      </div>
      {!id ? (
        <div className="py-16 text-center text-[13px] text-fg-3">
          {isPlayer ? `Find a ${position} to see his seasons.` : 'Find a team to see its seasons.'}
        </div>
      ) : error ? (
        <Loading error={error} />
      ) : !result ? (
        <Loading />
      ) : (
        <>
          <div className="flex items-center justify-between gap-5">
            <div className="flex min-w-0 items-center gap-3.5">
              <span
                className={cn(
                  'flex h-[22px] items-center rounded-[5px] px-[7px] font-mono text-[12px] font-bold text-on-pos',
                  (isPlayer && POS_BG[position]) || 'bg-pos-def'
                )}
              >
                {isPlayer ? position : teamAbbr(id)}
              </span>
              <div className="flex min-w-0 flex-col gap-[5px]">
                <h1 className="m-0 truncate text-[24px] leading-none font-bold tracking-[-0.03em]">
                  {nameOf(id)}
                </h1>
                <div className="flex items-center gap-[7px] text-[12.5px] leading-none whitespace-nowrap text-fg-2">
                  {lastTeam && (
                    <span className="font-mono text-[11.5px] font-semibold text-fg">
                      {teamAbbr(lastTeam)}
                    </span>
                  )}
                  {[
                    isPlayer && bio ? ageLine(bio.birthDate, span) : null,
                    !span.length
                      ? null
                      : isPlayer
                        ? `${ordinal(span.length)} season`
                        : `${span[0]}–${span[span.length - 1]}`,
                    runs || null
                  ]
                    .filter(Boolean)
                    .map((t) => (
                      <span key={t} className="flex items-center gap-[7px]">
                        <span className="text-fg-3">·</span>
                        {t}
                      </span>
                    ))}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              {ids.map((x, k) => (
                <span
                  key={x}
                  className="flex h-7 items-center gap-[7px] rounded-[14px] pr-1 pl-2.5 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--line)]"
                >
                  <Swatch slot={k} />
                  {shortOf(x)}
                  {k > 0 ? (
                    <button
                      type="button"
                      aria-label={`Remove ${shortOf(x)}`}
                      onClick={() => set({ comparisons: state.comparisons.filter((c) => c !== x) })}
                      className="flex size-5 cursor-pointer items-center justify-center rounded-full text-fg-3 hover:bg-hover hover:text-fg"
                    >
                      <X className="size-3" />
                    </button>
                  ) : (
                    <span className="w-1.5" />
                  )}
                </span>
              ))}
              {ids.length <= MAX_COMPARISONS &&
                (adding ? (
                  <Search
                    autoFocus
                    options={options.filter((o) => !ids.includes(o.id))}
                    placeholder="Add a comparison"
                    onPick={(x) => {
                      set({ comparisons: [...state.comparisons, x] })
                      setAdding(false)
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="flex h-7 cursor-pointer items-center rounded-[14px] border-[1.5px] border-dashed border-line px-[11px] text-[12px] font-medium text-fg-2 hover:text-fg"
                  >
                    + Add a comparison
                  </button>
                ))}
            </div>
          </div>
          <div className="flex items-start gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {span.length < 2 ? (
                <div className="flex flex-col items-center gap-2 rounded-[10px] border-[1.5px] border-dashed border-line px-6 py-16 text-center">
                  <div className="text-[15px] font-semibold">
                    {span.length === 0
                      ? `No ${info?.label.toLowerCase() ?? metric} for ${isPlayer ? 'him' : 'it'} since ${seasons[0]}.`
                      : `Trends need two seasons; ${isPlayer ? 'he has' : 'it has'} one.`}
                  </div>
                  {span.length === 1 && main[0]?.value !== null && (
                    <div className="max-w-[440px] text-[12.5px] leading-[1.5] text-fg-2">
                      {span[0]}: {fmt(main[0].value!)} {info?.label.toLowerCase()}
                      {main[0].rank !== null
                        ? `, ${ordinal(Math.round(main[0].percentile!))} percentile (${ordinal(main[0].rank)} of ${main[0].of}).`
                        : ', not qualified.'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-[10px] bg-panel px-2 pt-3 pb-1 shadow-[0_0_0_1px_var(--line)]">
                  <div className="flex items-baseline justify-between gap-3 px-2">
                    <span className="text-[11.5px] font-medium text-fg-2">
                      {info?.label}
                      {direction === 'lower' ? ' ↓' : ''} · per season
                    </span>
                    {notes.length > 0 && (
                      <span className="text-[11px] font-medium text-warn">{notes.join(' ')}</span>
                    )}
                  </div>
                  <SeasonChart
                    series={series}
                    band={trendBand(result, metric, span, entity, position)}
                    format={fmt}
                    label={`${info?.label ?? metric} by season`}
                    flip={direction === 'lower'}
                    marks={isPlayer ? teamMarks(span, teams) : new Map()}
                    ages={ages}
                    hoverInfo={(season) => {
                      const p = main.find((x) => x.season === season)
                      if (!p || p.value === null) return null
                      const r = rows.find((x) => x.season === season)
                      return {
                        title: `${season}${r?.team ? ` · ${r.team}` : ''}`,
                        lines: [
                          `${fmt(p.value)}${p.estimated ? ' est.' : ''}`,
                          p.rank !== null
                            ? `${ordinal(p.rank)} of ${p.of} · ${ordinal(Math.round(p.percentile!))} percentile`
                            : 'Not qualified',
                          r?.sample ?? ''
                        ].filter(Boolean)
                      }
                    }}
                  />
                </div>
              )}
              <SeasonTable rows={rows} label={info?.label ?? metric} isPlayer={isPlayer} />
            </div>
            <aside className="flex w-[300px] shrink-0 flex-col gap-2">
              <div className="flex items-baseline justify-between px-0.5 pb-1">
                <h2 className="m-0 text-[14px] leading-none font-semibold tracking-[-0.01em]">
                  Career at a glance
                </h2>
                <span className="text-[11.5px] text-fg-3">
                  {span.length ? `${span[0]}–${span[span.length - 1]}` : ''}
                </span>
              </div>
              {glance.map((g) => (
                <GlanceCard
                  key={g.metric}
                  view={g}
                  on={g.metric === metric}
                  onPick={() => set({ metric: g.metric })}
                />
              ))}
              <p className="m-0 px-0.5 pt-1 text-[11px] leading-[1.45] text-fg-3">
                Sparklines are percentile vs {isPlayer ? `${position}s` : 'teams'} each season; the
                dotted line is the median. Click one to chart it.
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}

/** "age 27" now, from the bio, at the latest season in the span. */
function ageLine(birthDate: string | null, span: readonly number[]): string | null {
  const a = span.length ? seasonAge(birthDate, span[span.length - 1]) : null
  return a === null ? null : `age ${a}`
}

function SeasonTable({
  rows,
  label,
  isPlayer
}: {
  rows: ReturnType<typeof trendRows>
  label: string
  isPlayer: boolean
}): React.JSX.Element {
  const cols = isPlayer
    ? 'grid-cols-[56px_80px_40px_36px_minmax(0,1fr)_minmax(0,1fr)_48px_minmax(0,1.2fr)_minmax(0,1.2fr)]'
    : 'grid-cols-[56px_36px_minmax(0,1fr)_minmax(0,1fr)_48px_minmax(0,1.2fr)_minmax(0,1.2fr)]'
  const head = [
    'Season',
    ...(isPlayer ? ['Team', 'Age'] : []),
    'G',
    label,
    'Δ vs prior',
    'Pct',
    'Rank',
    'Sample'
  ]
  return (
    <div className="overflow-hidden rounded-[10px] bg-panel shadow-[0_0_0_1px_var(--line)]">
      <div
        className={cn(
          'grid h-8 items-center gap-2.5 border-b border-line px-3.5 font-mono text-[11px] tracking-[0.04em] text-fg-3 uppercase',
          cols
        )}
      >
        {head.map((h, i) => (
          <span key={i} className={cn('truncate', i > (isPlayer ? 1 : 0) && 'text-right')}>
            {h}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div
          key={r.season}
          className={cn(
            'grid h-[34px] items-center gap-2.5 border-b border-line-2 px-3.5 last:border-b-0',
            cols,
            !r.qualified && 'opacity-55'
          )}
        >
          <span className="font-mono text-[12px] font-semibold">{r.season}</span>
          {isPlayer && <span className="truncate font-mono text-[11.5px] text-fg-2">{r.team}</span>}
          {isPlayer && (
            <span className="text-right font-mono text-[12px] text-fg-2">{r.age ?? ''}</span>
          )}
          <span className="text-right font-mono text-[12px] text-fg-2">{r.games ?? ''}</span>
          <span className="text-right font-mono text-[12.5px] font-semibold tabular-nums">
            {r.value}
          </span>
          <span
            className={cn(
              'text-right font-mono text-[12px] font-medium',
              r.deltaTone === 'good'
                ? 'text-good'
                : r.deltaTone === 'bad'
                  ? 'text-bad'
                  : 'text-fg-3'
            )}
          >
            {r.delta}
          </span>
          <span className="flex justify-end">
            <PctChip percentile={r.percentile} qualified={r.qualified} />
          </span>
          <span className="truncate text-right text-[12px] text-fg-2">{r.rank}</span>
          <span className="truncate text-right text-[12px] text-fg-3">{r.sample}</span>
        </div>
      ))}
    </div>
  )
}

/** The handoff's soft percentile chip: ≥75 good, ≤25 bad; "NQ" outlined below the qualifier. */
function PctChip({
  percentile,
  qualified
}: {
  percentile: number | null
  qualified: boolean
}): React.JSX.Element {
  if (percentile === null) {
    return (
      <span className="flex h-[18px] min-w-[30px] items-center justify-center rounded-[4px] px-1 font-mono text-[10.5px] font-semibold text-fg-3 shadow-[inset_0_0_0_1px_var(--line)]">
        {qualified ? '—' : 'NQ'}
      </span>
    )
  }
  const n = Math.round(percentile)
  return (
    <span
      className={cn(
        'flex h-[18px] min-w-[30px] items-center justify-center rounded-[4px] px-1 font-mono text-[10.5px] font-semibold',
        n >= 75 ? 'bg-good-s text-good' : n <= 25 ? 'bg-bad-s text-bad' : 'text-fg-3'
      )}
    >
      {n}
    </span>
  )
}

function GlanceCard({
  view,
  on,
  onPick
}: {
  view: GlanceView
  on: boolean
  onPick: () => void
}): React.JSX.Element {
  const pts = view.spark
  const n = pts.length
  const xy = pts.map((p, i) =>
    p === null ? null : ([n > 1 ? 4 + (104 * i) / (n - 1) : 56, 30 - 0.26 * p] as const)
  )
  let d = ''
  let pen = false
  xy.forEach((p) => {
    if (!p) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`
    pen = true
  })
  const last = [...xy].reverse().find((p) => p !== null) ?? null
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cn(
        'grid cursor-pointer grid-cols-[minmax(0,1fr)_112px] items-center gap-2.5 rounded-[9px] bg-panel px-3 py-2.5 text-left',
        on ? 'shadow-[0_0_0_1.5px_var(--cobalt)]' : 'shadow-[0_0_0_1px_var(--line)] hover:bg-hover'
      )}
    >
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate text-[12px] text-fg-2">{view.label}</span>
        <span className="flex items-center gap-[7px]">
          <span className="font-mono text-[14px] font-semibold tabular-nums">{view.value}</span>
          <PctChip
            percentile={view.percentile}
            qualified={view.percentile !== null || view.value === '—'}
          />
        </span>
        {view.note && <span className="text-[10.5px] font-medium text-warn">{view.note}</span>}
      </span>
      <svg width={112} height={34} viewBox="0 0 112 34" aria-hidden="true">
        <path d="M0 17H112" stroke="var(--line)" strokeDasharray="2 3" />
        <path d={d} fill="none" stroke="var(--s1)" strokeWidth={1.75} strokeLinejoin="round" />
        {last && <circle cx={last[0]} cy={last[1]} r={3} fill="var(--s1)" />}
      </svg>
    </button>
  )
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/renderer/components/StatsCharts.test.tsx tests/renderer/components/StatsExplore.test.tsx tests/renderer/components/StatsPlayer.test.tsx
```

Expected: 3 passed: 32 passed.

- [ ] **Step 5: Format, typecheck, lint, the whole suite**

```bash
npx prettier --check src/renderer/src/assets/main.css src/renderer/src/components/stats/SeasonChart.tsx src/renderer/src/components/stats/StatLines.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/components/stats/WeekChart.tsx src/renderer/src/lib/stats/compare.ts src/renderer/src/lib/stats/player.ts src/renderer/src/lib/stats/trends.ts src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/screens/stats/StatsCompare.tsx src/renderer/src/screens/stats/StatsExplore.tsx src/renderer/src/screens/stats/StatsPlayer.tsx src/renderer/src/screens/stats/StatsTeam.tsx src/renderer/src/screens/stats/StatsTrends.tsx tests/renderer/components/StatsCharts.test.tsx tests/renderer/components/StatsExplore.test.tsx tests/renderer/components/StatsPlayer.test.tsx
npm run typecheck
npx eslint src tests electron.vite.config.ts
npx vitest run
```

Expected: prettier and typecheck clean, no lint problems, 1142 passed, 5 skipped.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/assets/main.css src/renderer/src/components/stats/SeasonChart.tsx src/renderer/src/components/stats/StatLines.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/components/stats/WeekChart.tsx src/renderer/src/lib/stats/compare.ts src/renderer/src/lib/stats/player.ts src/renderer/src/lib/stats/trends.ts src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/screens/stats/StatsCompare.tsx src/renderer/src/screens/stats/StatsExplore.tsx src/renderer/src/screens/stats/StatsPlayer.tsx src/renderer/src/screens/stats/StatsTeam.tsx src/renderer/src/screens/stats/StatsTrends.tsx tests/renderer/components/StatsCharts.test.tsx tests/renderer/components/StatsExplore.test.tsx tests/renderer/components/StatsPlayer.test.tsx
git commit -F - <<'EOF'
feat(stats): add Explore with Compare and Trends

Explore sits between Teams and Games: Chart (Plan AD2, disabled),
Compare and Trends over the shared scope, each tab's state kept for
the session.

Compare: three cards (players at a position, or teams with record,
division place and Elo), the rows ranked with the handoff's pill-dot
bars, the best value bold, and a weekly chart with the pool's median
(a team's defense flipped so up is better).

Trends: a metric by season with the position's median and middle
half, a season below the qualifier hollow, team changes and ages on
the axis, up to two comparisons, a table with deltas, and career at a
glance.

The player and team dashboards' Compare buttons seed Compare; a stat
line's trend icon opens Trends on its metric. Charts give each series
its own marker shape; --s3 joins the series colours.
EOF
```

---

### Task 4: Docs

The spec gets §22 (the amendments) and the split of Plan AD in §12; the screens reference gets Explore, the dashboards' Compare and trend icon, and the speeds; the data reference the drive counts, the catalogue's count and qualification by season.

**Files:**

- Modify: `docs/reference/stats-database.md`, `docs/reference/stats-screens.md`, `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`

- [ ] **Step 1: `docs/reference/stats-database.md`**

Modify `docs/reference/stats-database.md`:

```diff
diff --git a/docs/reference/stats-database.md b/docs/reference/stats-database.md
index d145266..97308b7 100644
--- a/docs/reference/stats-database.md
+++ b/docs/reference/stats-database.md
@@ -102,7 +102,7 @@ Rebuilt after every refresh that loaded rows (`stats:identity` in the log).
   - A file that is not published (404) is `skipped` and retried the next day; participation for the current season is the usual case.
   - A step replaces its season's rows in one transaction, so a failed load keeps the old rows.
   - **Quitting** closes the worker first: the running download is aborted, the running statement interrupted, and the step logged `interrupted`. The app quits within a few hundred milliseconds (after 3 s at most, the worker is ended). An `interrupted` step is not an attempt: the next run retries it. Steps a crashed app left `running` are marked `interrupted` on the next open, and stale temp files are cleared.
-- **The derived rebuild.** After the steps, when one loaded rows (or the derived tables are missing or older than `DERIVED_VERSION`), `stats:derived` rebuilds the derived tables for the seasons whose rows changed. A file of all seasons (players, QBR, combine) counts as the current season. A forced daily refresh rebuilds the current season in about 1.5 s. The first build (every season) takes about 25 s.
+- **The derived rebuild.** After the steps, when one loaded rows (or the derived tables are missing or older than `DERIVED_VERSION`), `stats:derived` rebuilds the derived tables for the seasons whose rows changed. A file of all seasons (players, QBR, combine) counts as the current season. A forced daily refresh rebuilds the current season in about 1.5 s. The first build (every season) takes about 25 s (25.5 s with v0.34.0's drive counts).
 - **The models.** `stats:models` follows every successful derived rebuild, a `MODELS_VERSION` change, and a run that failed (`models_pending`). A first build takes about 40 s, a daily one about 4.5 s (below).
 - **Downloads.** Parquet from nflverse and ffverse, CSV for the crosswalk, JSON for Sleeper. Files are written to `<userData>/stats-tmp`, read by DuckDB, and deleted. A full backfill downloads about 210 MB of Parquet plus Sleeper's JSON and takes 2–3 minutes. A forced daily refresh runs 24 steps in about 12 s.

@@ -110,14 +110,14 @@ Rebuilt after every refresh that loaded rows (`stats:identity` in the log).

 Built by `src/main/stats/derived/` after each refresh (spec §5). Every rate is stored as its numerator and denominator (components), and the engine divides when it reads, so any week range or group is exact.

-| Table               | Grain                                        | Holds                                                                                                                                                                                                                                                                                                                                                                                         |
-| ------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
-| `team_week`         | team × game (scheduled games too, `games` 0) | `off_*` (by `posteam`) and `def_*` (by `defteam`) sums of the team play components; result, points, `line_margin` (the team's expected margin), `total_line`, `implied_points`; drives (`drives`, `drive_points`, `td_drives`, `three_and_outs`, `drive_start_sum`, `def_drives`, `def_drive_points`); neutral pace; special teams from `src_team_stats`.                                     |
-| `player_week`       | gsis × season × season type × week           | About 230 components: passing, dropbacks, rushing, receiving, on-field, defense (from `plays`, `on_field`, `play_players`), the box score (kicking, punting, returns, fumbles, tackles for loss), snaps, NGS, PFR, QBR, ffopportunity; `position` (the week's nflverse roster), `team`, `opponent`, `home`, the team context for shares (`tm_*`), `routes` and `routes_est`, the paired sums. |
-| `player_season`     | gsis × season × season type                  | `player_week` summed, with the latest team and the most common position; NGS and QBR from their season rows.                                                                                                                                                                                                                                                                                  |
-| `team_season`       | team × season × season type                  | `team_week` summed over played games.                                                                                                                                                                                                                                                                                                                                                         |
-| `fantasy_week`      | Sleeper id × week × scoring                  | `points` and `xpoints` under `ppr`, `half`, `std` and (with a league) `league`; `gsis_id` through `sleeper_ids`; weeks in nflverse's numbering.                                                                                                                                                                                                                                               |
-| `team_fantasy_week` | defense × week × scoring                     | `fpa_qb`, `fpa_rb`, `fpa_wr`, `fpa_te`, `fpa_k`: fantasy points each position scored against it.                                                                                                                                                                                                                                                                                              |
+| Table               | Grain                                        | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
+| ------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
+| `team_week`         | team × game (scheduled games too, `games` 0) | `off_*` (by `posteam`) and `def_*` (by `defteam`) sums of the team play components; result, points, `line_margin` (the team's expected margin), `total_line`, `implied_points`; drives (`drives`, `drive_points`, `td_drives`, `three_and_outs`, `drive_start_sum`, `def_drives`, `def_drive_points`; since v0.34.0 `rz_drives` and `rz_td_drives`, drives with a play inside the opponent's 20 and those of them ending in a touchdown, and the opponents' `def_rz_drives`, `def_rz_td_drives`); neutral pace; special teams from `src_team_stats`. |
+| `player_week`       | gsis × season × season type × week           | About 230 components: passing, dropbacks, rushing, receiving, on-field, defense (from `plays`, `on_field`, `play_players`), the box score (kicking, punting, returns, fumbles, tackles for loss), snaps, NGS, PFR, QBR, ffopportunity; `position` (the week's nflverse roster), `team`, `opponent`, `home`, the team context for shares (`tm_*`), `routes` and `routes_est`, the paired sums.                                                                                                                                                        |
+| `player_season`     | gsis × season × season type                  | `player_week` summed, with the latest team and the most common position; NGS and QBR from their season rows.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
+| `team_season`       | team × season × season type                  | `team_week` summed over played games.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
+| `fantasy_week`      | Sleeper id × week × scoring                  | `points` and `xpoints` under `ppr`, `half`, `std` and (with a league) `league`; `gsis_id` through `sleeper_ids`; weeks in nflverse's numbering.                                                                                                                                                                                                                                                                                                                                                                                                      |
+| `team_fantasy_week` | defense × week × scoring                     | `fpa_qb`, `fpa_rb`, `fpa_wr`, `fpa_te`, `fpa_k`: fantasy points each position scored against it.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

 - **Play components** (`src/main/stats/derived/plays.ts`) are written once, as an expression over one row of `plays`, with the role that gets the credit: `passer`, `dropback`, `rusher`, `receiver`, `onO`, `onD`, `kicker`, `punter`, `defender`. The same expressions build the weekly tables and answer situational queries, so the grains cannot disagree.
 - **Rates need their own denominators.** Participation (pressure, coverage, personnel, box) is known on 89–90 % of dropbacks through 2022 and on every one since; FTN starts in 2022. Each such rate divides by its own "known" count (`db_pressure_known`, `tgt_ftn`, …).
@@ -168,10 +168,11 @@ ORDER BY sb DESC LIMIT 10;

 ## Metric catalogue and query engine

-- **Catalogue** (`src/shared/stats/catalogue.ts`): 324 metrics, 204 for players and 120 for teams. Each has a formula over component sums (`{targets} / nullif({tm_targets}, 0)`), model states at the end of the scope (`{last:elo}`) or weekly quantiles (`{p80:fp}`), its sample component and minimum, unit, direction, tier (`core` 116, `extended` 176, `stored` 32), family, sources and coverage. 163 can be split by situation. The catalogue the renderer reads carries each metric's stability.
+- **Catalogue** (`src/shared/stats/catalogue.ts`): 326 metrics, 204 for players and 122 for teams. Each has a formula over component sums (`{targets} / nullif({tm_targets}, 0)`), model states at the end of the scope (`{last:elo}`) or weekly quantiles (`{p80:fp}`), its sample component and minimum, unit, direction, tier (`core` 116, `extended` 178, `stored` 32), family, sources and coverage. 163 can be split by situation. The catalogue the renderer reads carries each metric's stability.
 - **A played week without a team.** 69 of 190,218 played player-weeks (0.04 %, 2019–2026 week 6) have no `team` in `player_week` (Eddy Pineiro, 2025 week 1): his sources for that week did not name one. The player dashboard's game log takes the team of his nearest game.
 - **Missing counts.** At the week and season grains, a play-by-play or box-score component a player never had (carries for a receiver) sums as 0. FTN, participation, NGS, PFR and QBR components stay NULL when missing: there, NULL means "not measured".
 - **Query** (`StatsQuery`, `src/shared/stats/types.ts`; JSON Schema in `src/shared/stats/querySchema.ts`): entity, metrics, scope, situation (down, distance, quarter, field zone, score margin, win probability, neutral, two-minute — the last two minutes of the 2nd and 4th quarters, since v0.29.0 — and the participation and charting filters), home or road games (`scope.home`, since v0.30.0: the weekly tables' `home`, a play's game in `games`; qualification counts half the weeks), `situation.withoutOnField` counting only plays participation lists (since v0.30.0: a play it does not cover is not one a player sat out), groupBy, transform (`raw`, `perGame`, `percentile`, `zScore`, `vsLeague`, `shrunk`, `opponentAdjusted`), sort, limit, scoring. The engine (`src/main/stats/engine/`) validates it, compiles it to parameterised SQL over the season tables, the weekly tables or the plays, and runs it for 5 s at most.
+- **Qualification by season.** A query grouped by season (and not by week) qualifies each season's rows against that season's own weeks (since v0.34.0): over 2019–2026 every season was held to the average of the eight: 2026 week 7 qualified 48 of its 98 WRs (QBs 20 of 34, DBs 44 of 158), and full seasons slightly more than their own (2025 WRs 115, not 110).
 - **Results** carry, per metric, the value (after the transform), the raw value, the sample, `qualified`, the percentile and rank among qualified rows of the same position and group, and `estimated`. Notes state the coverage the answer depends on.
 - **Qualification.** `minSample` is per 17 games, scaled to the weeks a row covers (about one game per opponent row) and, at the play grain, to the share of plays each row keeps (its situation and play-dimension group, among its teams' plays when the query filters teams or players on the field).
 - **Transforms.** `shrunk` pulls a rate toward the qualified rows' sample-weighted mean by its stability prior: (s·v + k·μ) / (s + k). `opponentAdjusted` subtracts the sample-weighted average of how much more than the league each opponent allowed in the same metric and position (weekly rows; rates only, since a total is not comparable with the league total). A metric a transform does not apply to is returned raw, with a note.
```

- [ ] **Step 2: `docs/reference/stats-screens.md`**

Modify `docs/reference/stats-screens.md`:

```diff
diff --git a/docs/reference/stats-screens.md b/docs/reference/stats-screens.md
index 0a786d8..ee23992 100644
--- a/docs/reference/stats-screens.md
+++ b/docs/reference/stats-screens.md
@@ -1,10 +1,10 @@
 # Stats screens — reference

-Added in v0.28.0 (Plan AA; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.1–§9.2, amended in §18); the team dashboard in v0.29.0 (Plan AB; §9.3, amended in §19); the player dashboard in v0.30.0 (Plan AC; §9.4, amended in §21). Companion Stats is the app's second product: its own shell and cobalt palette (design handoff 2026-10-16, "Companion Stats"), reachable from the Fantasy nav ("Stats ↗"), and where the app opens when no league is imported. Every number comes from the query engine (`stats.query`, data reference: `docs/reference/stats-database.md`).
+Added in v0.28.0 (Plan AA; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.1–§9.2, amended in §18); the team dashboard in v0.29.0 (Plan AB; §9.3, amended in §19); the player dashboard in v0.30.0 (Plan AC; §9.4, amended in §21); Explore's Compare and Trends in v0.34.0 (Plan AD1; §9.5, amended in §22). Companion Stats is the app's second product: its own shell and cobalt palette (design handoff 2026-10-16, "Companion Stats"), reachable from the Fantasy nav ("Stats ↗"), and where the app opens when no league is imported. Every number comes from the query engine (`stats.query`, data reference: `docs/reference/stats-database.md`).

 ## Shell

-- **Nav:** Leaderboards · Players (the player dashboard) · Teams (the team dashboard) · Games (later) · Glossary; "Data through 2026 week 6 · updated 2 h ago" from `stats.status()` ("updating…" while a refresh runs); "Fantasy ↗" (Setup without a league); the theme toggle.
+- **Nav:** Leaderboards · Players (the player dashboard) · Teams (the team dashboard) · Explore (Compare, Trends; the chart explorer later) · Games (later) · Glossary; "Data through 2026 week 6 · updated 2 h ago" from `stats.status()` ("updating…" while a refresh runs); "Fantasy ↗" (Setup without a league); the theme toggle.
 - **Scope** (every screen, kept for the session): season (2019 → latest), Regular season / Postseason / Both, the regular season's week range, and the fantasy scoring (My league once a league is imported, else PPR, Half PPR, Standard).
 - A finished rebuild (`stats:changed`) re-reads the status and the catalogue and runs every query on screen again.

@@ -39,8 +39,8 @@ The Ledger table: one tab per position group (All offense, QB, RB, WR, TE, K, P,

 Teams in the nav opens it on the team viewed last; the first time, on the team of my top fantasy scorer in range (with a league), else ARI. ‹ › and the select move between the 32 teams.

-- **Header** (every tab; handoff "8. Team"): the team's name, its place in the division (regular season: win %, then point margin), the abbreviation, four tiles (record, points and points allowed per game, the margin per game in its tone), a results strip with one card per week of the range (W/L and the score, byes, postseason rounds WC / DIV / CONF / SB), and the scope bar. With a league, who rosters the team's defense.
-- **Stat lines** (Offense, Defense, Special teams, Situational, Tendencies, Forecast, the Overview's ratings): the value; a percentile pill and the rank among the teams that qualify ("3rd of 32", ties "T-3rd" with their percentile at the middle); the league's mean; the catalogue entry and reliability on the label. A metric with no better side (pass rate, pace, blitz rate) reads "11th highest" and stays grey. A line the season lacks says why ("Not published for 2026 yet.", "Charted from 2022."). Each line comes from one query over every team, one more per split.
+- **Header** (every tab; handoff "8. Team"): the team's name, its place in the division (regular season: win %, then point margin), the abbreviation, four tiles (record, points and points allowed per game, the margin per game in its tone), a results strip with one card per week of the range (W/L and the score, byes, postseason rounds WC / DIV / CONF / SB), and the scope bar; Compare (opens Explore › Compare with the team and the two teams nearest it in Elo). With a league, who rosters the team's defense.
+- **Stat lines** (Offense, Defense, Special teams, Situational, Tendencies, Forecast, the Overview's ratings): the value; a percentile pill and the rank among the teams that qualify ("3rd of 32", ties "T-3rd" with their percentile at the middle); the league's mean; the catalogue entry and reliability on the label. A metric with no better side (pass rate, pace, blitz rate) reads "11th highest" and stays grey. A line the season lacks says why ("Not published for 2026 yet.", "Charted from 2022."). Each line comes from one query over every team, one more per split. Hovering a line (or focusing it) shows a trend icon at its left: Explore › Trends on that metric for the team. Split lines have none.

 | Tab           | Shows                                                                                                                                                                                                                                                                   |
 | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
@@ -54,16 +54,16 @@ Teams in the nav opens it on the team viewed last; the first time, on the team o
 | Schedule      | Every game: date, opponent, result, Elo and market win probability, the line, the opponent's Elo before it (red from 1550, green to 1450), weather; schedule strength played and left                                                                                   |
 | Forecast      | Playoff and division odds by week, adjusted EPA by week, the next game, season odds, ratings, schedule strength, luck                                                                                                                                                   |

-Charts: one line per series (cobalt, teal; colour-blind safe in both themes), gaps for byes, end labels, and a hover that lists every series that week.
+Charts: one line per series (cobalt, teal, magenta, each with its own marker: circle, square, diamond, so the lines read apart without colour), gaps for byes, end labels, and a hover that lists every series that week.

 ## Player dashboard

 Players in the nav opens it on the player viewed last; the first time, on my top fantasy scorer in range (with a league, once the rosters have loaded), else the leading WR by receiving yards. A Fantasy player file's "Full stats ↗" opens it too (a team defense opens its team dashboard).

 - **Rail** (handoff "6. Player profile"): the nine positions (QB, RB, WR, TE, K, P, DL, LB, DB), a search, a rank-by metric (the position leaderboard's columns), and the players the position's leaderboard qualifies, best first, the value in a chip shaded by its percentile. The player shown stays listed below the qualifier ("NQ"). ↑ / ↓ or J / K move the selection; picking a position opens its leader; 25 rows, then "Show 25 more".
-- **Header** (every tab): Sleeper's headshot (initials when it does not load), the position chip, the team (opens its dashboard), games in range, "Not qualified", the status tag, the fantasy rank under the scoring ("WR4 in PPR", fantasy positions); the name he goes by (first, then last); number, his age that season, season of his career, draft, college, size; the scope bar; Compare (Plan AD); with a league and a fantasy position, the owner chip ("On your fantasy team", "Rostered by …", "Free agent in your league") that opens his Fantasy file.
+- **Header** (every tab): Sleeper's headshot (initials when it does not load), the position chip, the team (opens its dashboard), games in range, "Not qualified", the status tag, the fantasy rank under the scoring ("WR4 in PPR", fantasy positions); the name he goes by (first, then last); number, his age that season, season of his career, draft, college, size; the scope bar; Compare (opens Explore › Compare with him and his position's top two); with a league and a fantasy position, the owner chip ("On your fantasy team", "Rostered by …", "Free agent in your league") that opens his Fantasy file.
 - **Status tag:** the latest roster week's reserve list (IR, PUP, NFI, SUS, RES) or the latest week's injury report (OUT, D, Q; DNP or LP in practice before a game status), the latest season only. Hover: the status, the injury and the week.
-- **Stat lines** (as the team dashboard's): value, percentile pill and rank among his position's players the leaderboard qualifies who also meet the metric's own sample ("4th of 110"), the qualified players' mean ("Lg"). Below the qualifier, values without ranks. An empty line says why: "Not published for 2026 yet.", "Charted from 2022.", "No plays in this split.", "No NFL Next Gen Stats value for him." (NGS and ESPN QBR publish players over their own minimums).
+- **Stat lines** (as the team dashboard's): value, percentile pill and rank among his position's players the leaderboard qualifies who also meet the metric's own sample ("4th of 110"), the qualified players' mean ("Lg"). Below the qualifier, values without ranks. An empty line says why: "Not published for 2026 yet.", "Charted from 2022.", "No plays in this split.", "No NFL Next Gen Stats value for him." (NGS and ESPN QBR publish players over their own minimums). A line's trend icon (on hover or focus) opens Explore › Trends on that metric for him.

 | Position group | Tabs                                                                                   |
 | -------------- | -------------------------------------------------------------------------------------- |
@@ -82,6 +82,31 @@ Players in the nav opens it on the player viewed last; the first time, on my top
 | Forecast                                                                                                                       | The next game and its defense against the position (among the 32, a stingy one in red); with a league and this season, Sleeper's projection, the rest of the season and its rank, FantasyPros' rank; the range of outcomes (ceiling, floor, boom, bust), role (last 4 against before), running hot or cold, the schedule from here, the core rates raw and shrunk |
 | Profile                                                                                                                        | Bio (born, size, college, draft, rookie season, team now), the combine with percentiles among his position since 2000, the athletic score (RAS-style) and Speed Score, career by season and in all                                                                                                                                                                |

+## Explore
+
+Explore in the nav opens the tab used last (Compare the first time). Its sub-tabs sit at the left of the bar, the scope bar at its right: Chart (the chart explorer, Plan AD2; disabled), Compare, Trends. Each tab keeps its players, teams and choices for the session; Back returns to the page before Explore.
+
+### Compare
+
+Three slots side by side (handoff "7. Compare"): players at one position (the nine of the rail) or teams.
+
+- **Cards:** the series marker (--s1 circle, --s2 square, --s3 diamond), × to remove one (two must stay). Players: team, games, NQ below the position's qualifier, the name (opens his dashboard), "Leads n of m", a swap select (my players first, "· your team", then the position's qualified players best first, then the rest). Teams: record and division place, the abbreviation and name (opens the team dashboard), Elo, "Leads n of m", a swap select of the 32. An open slot is a dashed card, "Add a third player…".
+- **Defaults:** players, the position's top three by its leaderboard's sort, my best player at the position in slot 3 when none of mine is there; teams, the top three by Elo. From a dashboard's Compare: that player and the position's top two, or that team and the two teams nearest it in Elo. The slots stay when the range changes.
+- **Rows:** players, the position leaderboard's groups (WR: Usage, Receiving, Efficiency, Fantasy); teams, Offense (EPA per play, success rate, explosive-play rate, EPA per dropback, EPA per carry, sack rate), Defense (the same allowed; pressure and sack rate as the defense's own), Special teams (FG over expected, net punting), Situational (third down and red-zone TD rate, both sides). Each cell: the value (counts per game or totals for players), the handoff's pill-dot bar of its percentile and its rank ("#4") among the position's qualified players who meet the metric's sample, or the 32. The best value of a row is bold (none on a tie between all three, or a metric with no better side). A row the season lacks says why ("Not published for 2026 yet.": pressure rate is participation data).
+- **Chart:** fantasy points by week (players at positions without fantasy points: their first tile, sacks for DL), or a team's EPA per play by week, offense or defense, with the median of the pool each week dashed. Lower-is-better runs upside down ("Flipped so up is better").
+
+### Trends
+
+A metric by season, 2019 → now, for a player or a team, and up to two more of the same position (or teams) for context.
+
+- **Bar:** Players / Teams, the position (players), a search (everyone with a row at the position since 2019, or the 32 teams), the metric (every core and extended metric with a season grain, by family), Totals / Per game for a count.
+- **Header:** the position chip, the name, the team now, his age, his season of the league, his teams ("NYJ 2021–23, BUF since 2024"); a pill per series, × on a comparison; "+ Add a comparison" (a search).
+- **Chart:** the metric each season of his span (his first season to his last; a season without a row stays on the axis). The position's qualified median dashed over its 25th–75th percentile band; his line (a season below the qualifier hollow) and the comparisons (squares, diamonds). Under each season: his age, and his team when it changed (a trade: "NYJ → LAR"). Hover: the season, team, value, "12th of 110 · 89th percentile" or "Not qualified", the sample. Coverage notes beside the title: "Charted from 2022.", "Next Gen Stats from 2019.", "Not published for 2026 yet.", "Estimated for 2026.".
+- **Table:** newest first: season, team (teams: none), age, games, the value ("not charted" before the metric starts, "est." when estimated), the change from the season before in the tone of the metric's better side (points for a rate in percent), the percentile chip (NQ), rank, sample. A season below the qualifier is faded.
+- **Career at a glance:** six core metrics of the position (WR: target share, air-yards share, YPRR, separation, route participation, fantasy points per game; teams: EPA per play, success rate, explosive-play rate, EPA per dropback, EPA per carry, red-zone TD rate): the last value ("(2025)" when it is not this season's), its percentile chip, a note, a sparkline of the percentile each season. Clicking one charts it.
+- **One season:** "Trends need two seasons; he has one." with that season's value and rank.
+- Every season is ranked among that season's pool: one query over the position by season, each season qualified against its own weeks (the season in progress too).
+
 ## Glossary

 Every core and extended metric, players or teams, by family or search, with the same entry as the column hover.
@@ -92,4 +117,4 @@ Every core and extended metric, players or teams, by family or search, with the

 ## Speed

-Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms. The team dashboard: Teams 140 ms from click to the Overview, a tab 65–150 ms, Situational (eleven queries) 275 ms. The player dashboard: Players 230–290 ms from click to the Overview, a tab 70–135 ms, Splits 265–480 ms, a rail position 135–275 ms.
+Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms. The team dashboard: Teams 140 ms from click to the Overview, a tab 65–150 ms, Situational (eleven queries) 275 ms. The player dashboard: Players 230–290 ms from click to the Overview, a tab 70–135 ms, Splits 265–480 ms, a rail position 135–275 ms. Explore (2026 week 7): Compare on screen 160–205 ms from click, a position or Players / Teams 135–185 ms; the Trends tab 245–255 ms, a new metric 220–290 ms.
```

- [ ] **Step 3: `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`**

Modify `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`:

```diff
diff --git a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
index d129051..9934310 100644
--- a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
+++ b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
@@ -379,10 +379,11 @@ Built now, so NLQ later is translation only:
 | AA   | Stats navigation + standalone launch, leaderboards, custom views, CSV                                                                                                                                                        | v0.28.0 |
 | AB   | Team dashboard                                                                                                                                                                                                               | v0.29.0 |
 | AC   | Player dashboard (all positions) + slide-over link                                                                                                                                                                           | v0.30.0 |
-| AD   | Chart explorer, compare, multi-season trends                                                                                                                                                                                 | v0.31.0 |
-| AE   | Matchup preview                                                                                                                                                                                                              | v0.32.0 |
+| AD1  | Compare (players and teams), multi-season trends, Explore                                                                                                                                                                    | v0.34.0 |
+| AD2  | Chart explorer                                                                                                                                                                                                               | v0.35.0 |
+| AE   | Matchup preview                                                                                                                                                                                                              | v0.36.0 |

-X, Y and Z have no visible UI change beyond a working warehouse; they run while the design overhaul finishes. Each plan is written when the previous one ships, so later plans use what was learned.
+X, Y and Z have no visible UI change beyond a working warehouse; they run while the design overhaul finishes. Each plan is written when the previous one ships, so later plans use what was learned. v0.31.0–v0.33.0 went to dev mode and its notes, so AD (split in two, §22) and AE moved up.

 ## 13. Out of scope

@@ -584,3 +585,20 @@ Decided with the user and measured on the live database while Plan AC was writte
 - **G. The two products link (§9.4).** The player file gains the handoff's "Full stats ↗" (a team defense opens its team dashboard). The dashboard gains the handoff's owner chip ("On your fantasy team", "Rostered by …", "Free agent in your league"), which opens his Fantasy file, for QB, RB, WR, TE and K only (no IDP in Fantasy, §13). The ids map through the league's `player_ids` (`stats.link`).
 - **H. What the data cannot give.** A line a source left a player out of says so ("No NFL Next Gen Stats value for him.": NGS and ESPN QBR publish players over their own minimums); a split whose source has nothing for the season says "Not published for 2026 yet." or "Charted from 2022.". Compare stays disabled until Plan AD. Counts are totals (no per-game switch on the dashboard).
 - **I. Measured** (2026 week 6): each tab's queries 21–137 ms, Splits (10–16 queries) 181–342 ms, Forecast 197–252 ms with the outlook; in the app, Players 230–290 ms from click to the Overview, a tab 70–135 ms, Splits 265–480 ms, a rail position 135–275 ms (budgets 300 ms, and 1 s for situational queries, §11).
+
+## 22. Amendment 2026-10-24: Explore, Compare and Trends (Plan AD1)
+
+Decided with the user (2026-10-23 and 2026-10-24) and measured on the live database while Plan AD1 was written (its Planning findings), and taken into the build. The design is the "Stats Explore" canvas and its handoff (`docs/design/2026-10-23-stats-explore-handoff/`); `docs/reference/stats-screens.md` documents the result.
+
+- **A. Explore (§9.5, §9.1).** One nav item between Teams and Games. Its sub-tabs at the left of the bar: Chart (the chart explorer, Plan AD2), Compare, Trends, each keeping its state for the session. AD is split: AD1 Compare and Trends, AD2 the chart explorer.
+- **B. Compare** is three slots (not 2–4): the handoff's player compare at one position, and the same layout for teams.
+  - Players: the position leaderboard's groups, each cell ranked among the position's qualified players who meet the metric's own sample (§21 B); counts per game or totals. Teams: Offense, Defense, Special teams, Situational, among the 32.
+  - The best value of a row is bold and counts toward "Leads n of m" (none on a tie between every slot, or a metric with no better side).
+  - Defaults: the position's top three by its leaderboard's sort, my best player in slot 3 when none of mine is there; teams by Elo. A dashboard's Compare seeds that player and the position's top two, or that team and the two teams nearest it in Elo.
+  - A weekly chart: fantasy points (players), EPA per play offense or defense (teams), the pool's median each week dashed; lower-is-better upside down.
+- **C. Trends.** A metric by season, 2019 → now, for a player or a team and up to two more of the same position. One query over the position grouped by season gives the lines, the position's qualified median and 25th–75th band, and each season's rank among that season's pool. A season below the qualifier is a hollow point and a faded row. Team changes and his age under each season; the change from the season before toned by the better side; six core metrics at a glance as percentile sparklines; coverage notes ("Charted from 2022.", "Not published for 2026 yet.", "Estimated for 2026."). One season: "Trends need two seasons". The age curve (§9.5 "age context") is deferred: it needs a typical value by age that the engine does not serve yet.
+- **D. Qualification by season (§7.2).** A query grouped by season (not by week) qualifies each season against its own weeks. Before, every season was held to the average of the seasons in scope: 2026 week 7 qualified 48 of its 98 WRs (QBs 20 of 34, DBs 44 of 158).
+- **E. Catalogue (§6.2).** Red-zone TD rate for teams, both sides (`off_rz_td_pct`, `def_rz_td_pct`: touchdown drives among drives with a play inside the opponent's 20); `team_week` gains the drive counts, `DERIVED_VERSION` 3 (one rebuild, about 25 s). 2025: 60.7 % on average (47.5–71.7 %). A defense's sack and pressure rates are named for what it does ("Sack rate (defense)", "Pressure rate (defense)"), not "allowed".
+- **F. Entry points.** The player and team dashboards' Compare buttons; a stat line's trend icon (on hover or focus; not on split lines) opens Trends on its metric.
+- **G. Charts.** Every series has its own marker shape (circle, square, diamond) as well as its colour; --s3 joins the series colours. --s1 and --s2 stay (the user chose shapes over a new --s2 for colour-blind separation).
+- **H. Measured** (2026 week 7): in the worker, Compare's query 21–89 ms (nine positions and the teams), its weekly chart 12–37 ms, Trends' query over a position's eight seasons 44–188 ms, the derived rebuild 25.5 s; in the app, Explore to Compare on screen 160–205 ms, a position or Players / Teams 135–185 ms, the Trends tab 245–255 ms, a new metric 220–290 ms (budget 300 ms, §11).
```

- [ ] **Step 4: Format and commit**

```bash
npx prettier --check docs/reference/stats-database.md docs/reference/stats-screens.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git add docs/reference/stats-database.md docs/reference/stats-screens.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git commit -m "docs(stats): Explore, Compare and Trends (spec §22)"
```

---

### Task 5: Live checks

**Files:**

- Throwaway (never committed): `tests/zz-ad1-live.test.ts`
- Outside the repo: `~/project/ffc-proto-ad1-live/` (the database copy, scratch profiles, the driver, the steps and the screenshots)

The live check reads a copy of a full live database, `~/project/ffc-proto-ad1-live/base.duckdb` (2026 week 7, built for this plan), offline. If it is gone, build one: run the built app once on an empty scratch profile (`--user-data-dir`); it backfills in about 5 minutes; copy its `stats.duckdb`. Then check every season has plays:

```bash
cd ~/project/ffc-proto-ad1-live && node q.mjs base.duckdb "SELECT source, status, message FROM sync_log WHERE status <> 'ok'"
```

A failed step (`stats:pbp:2021 error fetch failed`) is not retried within a day: delete its `sync_log` row in the profile's file, run the app on that profile again until the file stops growing, and copy it again. (`q.mjs` opens a file read-only with `@duckdb/node-api` and prints each statement's rows; link the repo's `node_modules` into the folder to run it.)

The walk-through also copies the dev profile's `companion.db` (`~/.config/FantasyCompanion/companion.db`), so the scratch app has the dev league. The dev profile itself is only read.

- [ ] **Step 1: The database copy**

The check copies `base.duckdb` to `work.duckdb` itself and rebuilds its derived tables to `DERIVED_VERSION` 3 first.

```bash
mkdir -p ~/project/ffc-proto-ad1-live/tmp
```

- [ ] **Step 2: Compare's and Trends' queries on live data**

Create `tests/zz-ad1-live.test.ts`:

```ts
import { appendFileSync, copyFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { StatsDb } from '@main/stats/db'
import { openStatsService } from '@main/stats/service'
import {
  chartMetric,
  compareGroups,
  comparePool,
  compareQuery,
  compareView,
  defaultSlots,
  TEAM_GROUPS,
  weeklyCompareQuery
} from '@/lib/stats/compare'
import { RAIL_POSITIONS } from '@/lib/stats/player'
import { defaultScope } from '@/lib/stats/scope'
import {
  careerSpan,
  playerTeamsQuery,
  teamMarks,
  teamsBySeason,
  trendBand,
  trendCore,
  trendLine,
  trendQuery,
  trendSeasons
} from '@/lib/stats/trends'
import type { MetricInfo, StatsQuery, StatsResult } from '@shared/stats/types'

// Plan AD1 planning check on the live database. Throwaway, never committed.
const LIVE = join(homedir(), 'project', 'ffc-proto-ad1-live')
const OUT = join(LIVE, 'findings.txt')
const log = (...a: unknown[]): void => appendFileSync(OUT, a.map(String).join(' ') + '\n')

it('plan AD1 live findings', { timeout: 1_800_000 }, async () => {
  writeFileSync(OUT, '')
  copyFileSync(join(LIVE, 'base.duckdb'), join(LIVE, 'work.duckdb'))
  const raw = await StatsDb.open(join(LIVE, 'work.duckdb'), {
    tempDirectory: join(LIVE, 'tmp', 'duckdb')
  })
  let t = Date.now()
  await rebuildDerived(raw, { seasons: 'all', league: null })
  await raw.exec('CHECKPOINT')
  log('rebuild v3 ms', Date.now() - t)
  raw.close()
  const service = await openStatsService(
    { path: join(LIVE, 'work.duckdb'), tempDir: join(LIVE, 'tmp') },
    () => {},
    async () => {
      throw new Error('offline')
    }
  )
  const timed = async (q: StatsQuery): Promise<[StatsResult, number]> => {
    const s = Date.now()
    const r = await service.query(q)
    return [r, Date.now() - s]
  }
  try {
    const status = await service.status()
    const byId = new Map<string, MetricInfo>((await service.catalogue()).map((m) => [m.id, m]))
    log('through', JSON.stringify(status.through))
    const scope = defaultScope(status, false)
    const s2025 = { ...scope, season: 2025 }

    // Red-zone TD rates: league means and range, both sides.
    for (const season of [2025, 2026]) {
      const [rz] = await timed({
        entity: 'team',
        metrics: ['off_rz_td_pct', 'def_rz_td_pct', 'td_drive_rate'],
        scope: { seasons: [season] },
        limit: 40
      })
      const vals = (m: string): number[] =>
        rz.rows.map((r) => r.values[m].value).filter((v): v is number => v !== null)
      const stat = (a: number[]): string =>
        `mean ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3)} min ${Math.min(...a).toFixed(3)} max ${Math.max(...a).toFixed(3)} n ${a.length}`
      log(season, 'off_rz', stat(vals('off_rz_td_pct')), '| def_rz', stat(vals('def_rz_td_pct')))
    }
    const [rzSample] = await timed({
      entity: 'team',
      metrics: ['off_rz_td_pct'],
      scope: { seasons: [2025] },
      limit: 40
    })
    log(
      'rz samples 2025',
      rzSample.rows
        .slice(0, 3)
        .map(
          (r) =>
            `${r.id} ${r.values.off_rz_td_pct.value?.toFixed(3)} on ${r.values.off_rz_td_pct.sample}`
        )
        .join(', ')
    )

    // By-season qualification: 2026 in a 2019–2026 query matches a 2026-only query.
    for (const position of ['WR', 'QB', 'DB'] as const) {
      const metric = trendCore('player', position, byId)[0]
      const [all, ms] = await timed(trendQuery('player', position, [metric], scope, status, false))
      const single = await service.query({
        entity: 'player',
        metrics: [metric],
        scope: { seasons: [2026], positions: [position] },
        limit: 5000
      })
      const q26 = all.rows.filter(
        (r) => r.group.season === 2026 && r.values[metric].qualified
      ).length
      const q26s = single.rows.filter((r) => r.values[metric].qualified).length
      const q25 = all.rows.filter(
        (r) => r.group.season === 2025 && r.values[metric].qualified
      ).length
      log(
        position,
        metric,
        'by-season 2026 qualified',
        q26,
        'single-season',
        q26s,
        '2025',
        q25,
        'rows',
        all.rows.length,
        ms,
        'ms'
      )
      expect(q26).toBe(q26s)
    }

    // Compare: one query per position over the whole position, and the teams; then weekly.
    for (const position of RAIL_POSITIONS) {
      const groups = compareGroups('player', position, byId)
      const [res, ms] = await timed(compareQuery('player', position, groups, scope, status, true))
      const pool = comparePool('player', position, res)
      const slots = defaultSlots('player', position, res, pool, null)
      const view = compareView(res, slots, groups, byId, pool, true, scope.season)
      const [wk, wms] = await timed(
        weeklyCompareQuery(
          'player',
          position,
          chartMetric('player', position, 'offense'),
          scope,
          status
        )
      )
      const empty = view.groups
        .flatMap((g) => g.rows)
        .filter((r) => r.missing)
        .map((r) => `${r.metric}: ${r.missing}`)
      log(
        position,
        'compare',
        ms,
        'ms rows',
        res.rows.length,
        'pool',
        pool.size,
        'slots',
        slots.map((id) => res.rows.find((r) => r.id === id)?.name).join(' / '),
        'weekly',
        wms,
        'ms',
        wk.rows.length,
        'rows',
        empty.length ? `missing: ${empty.join('; ')}` : ''
      )
    }
    const tgroups = compareGroups('team', 'WR', byId)
    expect(tgroups.flatMap((g) => g.metrics)).toEqual(TEAM_GROUPS.flatMap(([, ids]) => ids))
    const [teams, tms] = await timed(compareQuery('team', 'WR', tgroups, scope, status, false))
    const tpool = comparePool('team', 'WR', teams)
    const tview = compareView(
      teams,
      ['BUF', 'KC', 'DET'],
      tgroups,
      byId,
      tpool,
      false,
      scope.season
    )
    log(
      'teams compare',
      tms,
      'ms; missing rows',
      tview.groups
        .flatMap((g) => g.rows)
        .filter((r) => r.missing)
        .map((r) => `${r.metric}: ${r.missing}`)
        .join('; ')
    )
    for (const seed of ['BUF', 'KC', 'NYJ']) {
      const s = defaultSlots('team', 'WR', teams, tpool, seed)
      log(
        'seed',
        seed,
        s
          .map(
            (id) => `${id} ${Math.round(teams.rows.find((r) => r.id === id)!.values.elo.value!)}`
          )
          .join(', ')
      )
    }
    log('top3 elo', defaultSlots('team', 'WR', teams, tpool, null).join(', '))
    const [, tw] = await timed(weeklyCompareQuery('team', 'WR', 'def_epa_play', scope, status))
    log('teams weekly', tw, 'ms')
    const [t25] = await timed(compareQuery('team', 'WR', tgroups, s2025, status, false))
    log(
      '2025 pressure rate (defense) rows with value',
      t25.rows.filter((r) => r.values.def_pressure_rate.value !== null).length
    )

    // Trends: the query per position (metric + core), a trade, rookies, a team.
    const seasons = trendSeasons(status)
    for (const position of RAIL_POSITIONS) {
      const core = trendCore('player', position, byId)
      t = Date.now()
      const [res, ms] = await timed(trendQuery('player', position, core, scope, status, true))
      log(position, 'trends', ms, 'ms rows', res.rows.length, 'core', core.length)
      if (position === 'WR') {
        const ids = [...new Set(res.rows.map((r) => r.id))]
        const spans = ids.map((id) => careerSpan(res, id, seasons))
        const rookies = ids.filter((id, i) => spans[i].length === 1 && spans[i][0] === 2026)
        log('WR ids', ids.length, '2026-only (one season)', rookies.length)
        const band = trendBand(res, 'yprr', seasons, 'player', 'WR')
        log(
          'WR yprr band',
          band
            .map(
              (b) =>
                `${b.season}: ${b.p25?.toFixed(2)}/${b.median?.toFixed(2)}/${b.p75?.toFixed(2)}`
            )
            .join(' ')
        )
      }
    }
    // A traded player: two teams in one season.
    const trades = await service.query({
      entity: 'player',
      metrics: ['games'],
      scope: { seasons: [2024, 2025], positions: ['WR'] },
      groupBy: ['season', 'team'],
      limit: 5000
    })
    const count = new Map<string, number>()
    for (const r of trades.rows)
      count.set(`${r.id}|${r.group.season}`, (count.get(`${r.id}|${r.group.season}`) ?? 0) + 1)
    const traded = [...count].filter(([, n]) => n > 1).map(([k]) => k)
    log(
      'WR seasons with two teams 2024–25',
      traded.length,
      traded
        .slice(0, 3)
        .map(
          (k) =>
            trades.rows.find((r) => `${r.id}|${r.group.season}` === k)?.name + ' ' + k.split('|')[1]
        )
        .join(', ')
    )
    if (traded.length) {
      const id = traded[0].split('|')[0]
      const [tr] = await timed(playerTeamsQuery(id, scope, status))
      const teamsBy = teamsBySeason(tr)
      const [all] = await timed(trendQuery('player', 'WR', ['yprr'], scope, status, false))
      const span = careerSpan(all, id, seasons)
      log('marks', [...teamMarks(span, teamsBy)].map(([s, m]) => `${s}:${m}`).join(' '))
      const line = trendLine(all, id, 'yprr', span, 'player', 'WR', 'higher')
      log(
        'line',
        line
          .map(
            (p) => `${p.season} ${p.value?.toFixed(2)} ${p.qualified ? `${p.rank}/${p.of}` : 'NQ'}`
          )
          .join(' | ')
      )
    }
    const [team, tsm] = await timed(
      trendQuery('team', 'WR', trendCore('team', 'WR', byId), scope, status, false)
    )
    log('team trends', tsm, 'ms rows', team.rows.length)
    log('ALL GATES PASSED')
  } finally {
    await service.close()
  }
})
```

Run it:

```bash
npx vitest run tests/zz-ad1-live.test.ts && cat ~/project/ffc-proto-ad1-live/findings.txt
```

Expected: 1 passed, and `findings.txt` ends with `ALL GATES PASSED`. Check it against the planning findings:

- the rebuild takes about 25 s;
- red-zone TD rates average about 61 % both sides in 2025, every team between 45 % and 75 %;
- each position's 2026 qualified count by season equals the 2026-only count (WR 98, QB 34, DB 158 in week 7: the check asserts it);
- Compare's query under 100 ms for every position and the teams, its weekly chart under 50 ms; the DL row and the teams' defense row "pressure rate: Not published for 2026 yet.";
- each Trends query under 300 ms; the WR yards-per-route band has all eight seasons;
- a 2024–25 trade reads in the order he played ("SEA → NYG" for Dee Williams 2024).

- [ ] **Step 3: The app, walked through**

The driver is Plan AA's: copy `drive.mjs` from Plan AC's Task 7 Step 3 into `~/project/ffc-proto-ad1-live/`. Build the app, make the scratch profile, and save these steps as `~/project/ffc-proto-ad1-live/steps-ad1.json` (a tab, a radio and a nav button are clicked by their text through `eval`, since the nav has a Teams button and Explore a Teams radio):

```json
[
  {
    "size": [1440, 900],
    "wait": 20000
  },
  {
    "click": "Stats \u2197"
  },
  {
    "wait": 60000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Explore').click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('select[title=\"Swap player\"]').length === 3 && document.querySelector('[data-metric]')) return 'explore-compare ' + Math.round(performance.now() - t) + ' ms' } return 'explore-compare timeout' })()"
  },
  {
    "wait": 1500
  },
  {
    "shot": "01-compare-wr"
  },
  {
    "eval": "(() => { const m = [...document.querySelectorAll('main')].pop(); m.scrollTo(0, 700); return m.scrollTop })()"
  },
  {
    "wait": 800
  },
  {
    "shot": "02-compare-wr-chart"
  },
  {
    "eval": "(() => { const m = [...document.querySelectorAll('main')].pop(); m.scrollTo(0, 0); return m.scrollTop })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === 'RB').click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if ([...document.querySelectorAll('select[title=\"Swap player\"]')].length === 3 && !document.body.textContent.includes('Loading')) return 'compare-rb ' + Math.round(performance.now() - t) + ' ms' } return 'compare-rb timeout' })()"
  },
  {
    "wait": 800
  },
  {
    "shot": "03-compare-rb"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === 'Teams').click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('select[title=\"Swap team\"]').length === 3) return 'compare-teams ' + Math.round(performance.now() - t) + ' ms' } return 'compare-teams timeout' })()"
  },
  {
    "wait": 1500
  },
  {
    "shot": "04-compare-teams"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"Defense\"); if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()"
  },
  {
    "eval": "(() => { const m = [...document.querySelectorAll('main')].pop(); m.scrollTo(0, 900); return m.scrollTop })()"
  },
  {
    "wait": 1500
  },
  {
    "shot": "05-compare-teams-defense"
  },
  {
    "eval": "(() => { const m = [...document.querySelectorAll('main')].pop(); m.scrollTo(0, 0); return m.scrollTop })()"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === \"Players\"); if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()"
  },
  {
    "wait": 4000
  },
  {
    "shot": "06-player"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Compare').click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('select[title=\"Swap player\"]').length === 3 && document.querySelector('[data-metric]')) return 'compare-seeded ' + Math.round(performance.now() - t) + ' ms' } return 'compare-seeded timeout' })()"
  },
  {
    "wait": 1000
  },
  {
    "shot": "07-compare-seeded"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === \"Players\"); if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()"
  },
  {
    "wait": 4000
  },
  {
    "hover": "Snap share"
  },
  {
    "wait": 500
  },
  {
    "shot": "08-trend-icon"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => document.querySelector('[aria-label$=\" by season\"]').click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelector('[aria-label=\"YPRR by season\"], svg[aria-label$=\"by season\"]') && document.querySelector('h2') && [...document.querySelectorAll('h2')].some((h) => h.textContent === 'Career at a glance')) return 'trends-from-line ' + Math.round(performance.now() - t) + ' ms' } return 'trends-from-line timeout' })()"
  },
  {
    "wait": 1500
  },
  {
    "shot": "09-trends-player"
  },
  {
    "eval": "(() => { const el = document.querySelector('svg[aria-label$=\"by season\"] rect[fill=\"transparent\"]'); const r = [...document.querySelectorAll('svg[aria-label$=\"by season\"] rect[fill=\"transparent\"]')]; return r.length })()"
  },
  {
    "eval": "(() => { const m = [...document.querySelectorAll('main')].pop(); m.scrollTo(0, 600); return m.scrollTop })()"
  },
  {
    "wait": 800
  },
  {
    "shot": "10-trends-table"
  },
  {
    "eval": "(() => { const m = [...document.querySelectorAll('main')].pop(); m.scrollTo(0, 0); return m.scrollTop })()"
  },
  {
    "select": ["Metric", "yprr"]
  },
  {
    "wait": 2500
  },
  {
    "shot": "11-trends-yprr"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === \"Teams\"); if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Compare').click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('select[title=\"Swap team\"]').length === 3) return 'team-compare ' + Math.round(performance.now() - t) + ' ms' } return 'team-compare timeout' })()"
  },
  {
    "wait": 1500
  },
  {
    "shot": "12-team-compare-seeded"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === \"Teams\"); if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('[role=tab]')].find((e) => e.textContent.trim() === \"Offense\"); if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const b = document.querySelector('[aria-label$=\" by season\"]'); if (!b) return 'NOT FOUND'; b.click(); return b.getAttribute('aria-label') })()"
  },
  {
    "wait": 3000
  },
  {
    "shot": "13-trends-team"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === 'Players'); if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()"
  },
  {
    "wait": 1500
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"WR\"); if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()"
  },
  {
    "wait": 3500
  },
  {
    "eval": "(() => { const input = document.querySelector('input[type=search]'); const opt = [...document.querySelectorAll('datalist option')].find((o) => o.value.startsWith(\"Carnell Tate\")); if (!opt) return 'NO OPTION ' + document.querySelectorAll('datalist option').length; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, opt.value); input.dispatchEvent(new Event('input', { bubbles: true })); return opt.value })()"
  },
  {
    "wait": 3000
  },
  {
    "shot": "14-trends-rookie"
  },
  {
    "eval": "(() => { const input = document.querySelector('input[type=search]'); const opt = [...document.querySelectorAll('datalist option')].find((o) => o.value.startsWith(\"Davante Adams\")); if (!opt) return 'NO OPTION ' + document.querySelectorAll('datalist option').length; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, opt.value); input.dispatchEvent(new Event('input', { bubbles: true })); return opt.value })()"
  },
  {
    "wait": 3000
  },
  {
    "shot": "15-trends-trade"
  },
  {
    "select": ["Metric", "rec_yds"]
  },
  {
    "wait": 2500
  },
  {
    "shot": "16-trends-trade-recyds"
  },
  {
    "eval": "(() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === '+ Add a comparison'); b.click(); return 'ok' })()"
  },
  {
    "wait": 500
  },
  {
    "eval": "(() => { const input = [...document.querySelectorAll('input[type=search]')].pop(); const opt = [...document.querySelectorAll('datalist option')].find((o) => o.value.startsWith(\"Ja'Marr Chase\")); if (!opt) return 'NO OPTION ' + document.querySelectorAll('datalist option').length; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, opt.value); input.dispatchEvent(new Event('input', { bubbles: true })); return opt.value })()"
  },
  {
    "wait": 3000
  },
  {
    "shot": "17-trends-comparison"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"Teams\"); if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()"
  },
  {
    "wait": 1500
  },
  {
    "eval": "(() => { const input = document.querySelector('input[type=search]'); const opt = [...document.querySelectorAll('datalist option')].find((o) => o.value.startsWith(\"BUF\")); if (!opt) return 'NO OPTION ' + document.querySelectorAll('datalist option').length; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, opt.value); input.dispatchEvent(new Event('input', { bubbles: true })); return opt.value })()"
  },
  {
    "wait": 3000
  },
  {
    "shot": "18-trends-team"
  },
  {
    "click": "[aria-label=\"Switch theme\"]"
  },
  {
    "wait": 1500
  },
  {
    "shot": "19-trends-team-dark"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"Players\"); if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"WR\"); if (!el) return 'NOT FOUND'; el.click(); return 'clicked' })()"
  },
  {
    "wait": 2500
  },
  {
    "eval": "(() => { const input = document.querySelector('input[type=search]'); const opt = [...document.querySelectorAll('datalist option')].find((o) => o.value.startsWith(\"Davante Adams\")); if (!opt) return 'NO OPTION ' + document.querySelectorAll('datalist option').length; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, opt.value); input.dispatchEvent(new Event('input', { bubbles: true })); return opt.value })()"
  },
  {
    "wait": 3000
  },
  {
    "shot": "20-trends-trade-dark"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('[role=tab]')].find((e) => e.textContent.trim() === 'Compare'); el.click(); return 'clicked' })()"
  },
  {
    "wait": 3000
  },
  {
    "shot": "21-compare-dark"
  }
]
```

```bash
npx electron-vite build
L=~/project/ffc-proto-ad1-live; rm -rf $L/walk && mkdir -p $L/walk && cp $L/base.duckdb $L/walk/stats.duckdb && cp ~/.config/FantasyCompanion/companion.db $L/walk/companion.db
cd $L && APP=<this repo> node drive.mjs walk steps-ad1.json shots
```

Expected: no `NOT FOUND`, `NO OPTION` or `timeout` in the output; the timed steps under 300 ms. Each screenshot shows:

| Shot  | Shows                                                                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01    | Explore active in the nav; Chart greyed, Compare selected; WR: Smith-Njigba, Nacua and my WR (Coker, "· your team") in slot 3; pill-dot bars, ranks, bold leaders, "Leads n of m" |
| 02    | The rows' end and "Fantasy points by week": three series in --s1 / --s2 / --s3 with circles, squares and diamonds, gaps, the dashed "Median qualified WR"                         |
| 03    | RB's top three                                                                                                                                                                    |
| 04    | Teams: SF, BUF, SEA by Elo with record, "1st in the NFC West", Elo, Leads; "Pressure rate (defense)" reads "Not published for 2026 yet."; "Sack rate (defense)"                   |
| 05    | Special teams (FG over expected without "per game") and Situational with both red-zone rows; "EPA per play allowed by week", "Flipped so up is better"                            |
| 06–07 | James Cook's dashboard; Compare opens Explore with Cook, Walker and Robinson at RB                                                                                                |
| 08    | A trend icon at the left of the hovered "Snap share" line                                                                                                                         |
| 09–11 | Trends for Cook: chart, band, median, ages, "BUF" under 2022; table newest first; yards per route run with a hollow 2022, "est." for 2026, "Estimated for 2026."                  |
| 12    | BUF's Compare: BUF, SEA, SF                                                                                                                                                       |
| 13    | Trends for BUF from an Offense line: "2019–2026" in the header, no team column                                                                                                    |
| 14    | Carnell Tate (WR, TEN): "Trends need two seasons; he has one." with his value and rank                                                                                            |
| 15–16 | Davante Adams: "GB 2019–21, LV 2022–24, NYJ 2024, LAR since 2025"; "LV → NYJ" under 2024; receiving yards per game                                                                |
| 17    | Ja'Marr Chase added: a teal square series and a "Chase ×" pill                                                                                                                    |
| 18–21 | BUF's Trends, then dark: the team, Adams and Compare read in dark                                                                                                                 |

- [ ] **Step 4: Speed in the app**

Time Explore on a profile the app has already scored (the walk-through's, after its run): Explore to Compare, a position, Players / Teams, the Trends tab and a new metric, three runs each, with the timed `eval` steps of Step 3. Expected: under 300 ms each (measured: 135–290 ms).

- [ ] **Step 5: Clean up**

```bash
rm tests/zz-ad1-live.test.ts
git status --short
```

Expected: only the unrelated changes of Global Constraints. Keep `~/project/ffc-proto-ad1-live/` until the release; ask the user before deleting it.

---

### Task 6: Verify, merge, release

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 1142 passed | 5 skipped; the build succeeds.

- [ ] **Step 2: The Windows suite and self-test**

**Ask the user before pushing.** Then:

```bash
git push origin feat/compare-trends-ad1:check/plan-ad1
gh run watch "$(gh run list --branch check/plan-ad1 --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
git push origin --delete check/plan-ad1
```

Expected: green. The log shows `"query":true`.

- [ ] **Step 3: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/compare-trends-ad1`. It reviews against spec §9.5 and §11, the amendments, the handoff and the Review Focus list. Fix Critical and Important findings, each in its own commit, test first. Re-run Step 1 after them, and the Task 5 walk-through after a screen change.

- [ ] **Step 4: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/compare-trends-ad1 -m "merge: feat/compare-trends-ad1 (plan AD1)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.34.0" && git tag v0.34.0
git branch -d feat/compare-trends-ad1
```

- [ ] **Step 5: Status block**

Replace this plan's Status line with the outcome:

- the merge commit and the tag;
- the Task 5 numbers and the walk-through;
- the review fixes and anything deferred.

Then commit, staging this file only: `git commit -m "docs(plan): mark plan AD1 complete"`.

- [ ] **Step 6: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.34.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests and the packaged self-test, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.34.0 --draft=false`). The release notes should say:

- Explore in Companion Stats: Compare and Trends.
- Compare: three players at a position, or three teams, side by side, every row ranked among the position (or the 32) with the best value in bold, and a weekly chart against the median. Open it from a dashboard's Compare button.
- Trends: any metric by season since 2019 for a player or a team, against the position's median and middle half, with team changes, ages, year-over-year changes and career at a glance. Open it from the trend icon beside any stat line.
- Teams gain a red-zone TD rate, offense and defense; a defense's sack and pressure rates are named for what it does.
- A fix: by-season answers now qualify each season against its own weeks (the season in progress was held to a full season's sample).
- The chart explorer comes in the next release. The first launch rebuilds the stats tables (about 30 seconds).

---

## Self-review against the spec

- **§9.5 Explore and matchups** (Tasks 1–3):
  - **Compare:** "2–4 players or teams side by side, every metric with percentiles, and a weekly overlay chart". Three slots (amendment B: the handoff's compare); every row of the position's leaderboard groups, or the team groups, with percentiles and ranks among the position's qualified players or the 32; the weekly chart with the pool's median. Not every catalogue metric: the position's groups, as the handoff's.
  - **Multi-season trends:** "a metric by season for a player or team (2019 → now), with year-over-year deltas and age context". The metric by season against the position's median and middle half, the deltas toned by the better side, his age under each season. The age curve (typical value by age) is deferred (amendment C): it needs a value by age the engine does not serve.
  - **Chart explorer:** Plan AD2. Its tab is in Explore, disabled. **Matchup preview:** Plan AE.
- **§9.6 Design.** The handoff's player compare for Compare's players; the "Stats Explore" canvas for Compare's teams, Trends and the navigation; the Stats language (soft chips, pill-dot bars, the heat colour, light and dark). Shapes besides colours for the series (decision: colours).
- **§6.2, §7.2.** The red-zone TD rates and the defense's own names (amendment E); qualification by season (amendment D) — both found while planning, both in Task 1.
- **§11 Testing.**
  - Unit tests for the drive counts, the metrics, the per-season qualification and both models; component tests for the charts, Explore, the dashboards' entry points and the state across tabs.
  - The budget on live data, in the worker and in the app (Task 5).
  - The packaged smoke test (Task 6 Step 2).
- **Not in this plan** (by §12 and §13): the chart explorer (AD2); matchups and Games (AE); the age curve; natural-language queries.
