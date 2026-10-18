# Plan Z — Stats analysis: the models

**Status:** not started. Written 2026-10-18, fully prototyped: every task was replayed on a clean copy of `main` from this text, with the counts below. Each task's tests were seen failing before its code.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The models of spec §8, computed in the stats worker after each sync and read through the query engine.

- Team Elo and a season simulation (projected wins, playoff, division, bye, conference and Super Bowl odds).
- Opponent-adjusted EPA, SRS, Pythagorean wins and luck, turnover luck, and schedule strength played and left.
- A field-goal make model and FG over expected.
- Combine profiles: an athletic score (RAS-style) and Speed Score.
- Metric stability (year to year, split-half) on every metric, shown by the catalogue.
- The `shrunk` and `opponentAdjusted` transforms.
- A player outlook: ceiling and floor, boom and bust, trend and role change, regression flags, the remaining schedule.
- Reads for games (Elo against the market) and the outlook. 65 new catalogue metrics.
- No screen changes; ship `v0.27.0`.

**Architecture:**

- **Models** (`src/main/stats/models/`). The models are pure TypeScript over small inputs (they run on thousands of rows, spec §3.1); DuckDB feeds them and stores what they return.
  - `linear.ts`: a linear solver, logistic regression, Pearson r, a seeded generator.
  - `elo.ts`, `simulate.ts`, `adjusted.ts`, `ratings.ts` (SRS), `fieldGoal.ts`: the models themselves.
  - `profile.ts`: the combine scores, in SQL. `stability.ts`: stability, measured through the query compiler.
  - `load.ts`: what the models read. `team.ts`: the team-week rows. `columns.ts`: the columns the engine reads.
  - `build.ts`: `rebuildModels`, one transaction for every table, the simulations cached.
- **Sync.** A `stats:models` step follows `stats:derived`.
- **Engine.**
  - Catalogue formulas gain `{last:x}` (a model state at the end of the scope) and `{p80:fp}` / `{p20:fp}` (weekly quantiles).
  - Model sums join like the fantasy components.
  - Two transforms, and an internal option (no row cap, odd / even halves) that stability uses.
  - `games.ts` and `outlook.ts` answer the two new reads.
- **Worker and app.** `games`, `outlook` (and the catalogue, now with stability) are reads, answered at once. IPC `stats:games`, `stats:outlook`. Screens query again after the models step.

**Tech Stack:** Electron 39, TypeScript strict, `@duckdb/node-api` 1.5.6, `node:worker_threads`, Vitest (node environment; DuckDB runs in tests).

**Spec:** `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §6–§8 and §11 (the Plan Z row of §12), amended by this plan (Task 10 writes the amendments into the spec as §17). The data reference: `docs/reference/stats-database.md`.

## Planning findings (live data, 2026-10-18)

Measured on a full `stats.duckdb` (2019 – 2026 week 6) built by `main`, with the code in this plan, unless it says "prototype".

- **Elo** (K 20, home field 48, 0 at neutral sites and in 2020, a third regressed between seasons). Brier, Elo against the market's no-vig moneyline:

| Season    | Elo    | Vegas  |
| --------- | ------ | ------ |
| 2021      | 0.2311 | 0.2171 |
| 2022      | 0.2214 | 0.2080 |
| 2023      | 0.2326 | 0.2186 |
| 2024      | 0.2107 | 0.2010 |
| 2025      | 0.2223 | 0.2104 |
| 2021–2025 | 0.2236 | 0.2110 |

- **The season simulation.**
  - With the tiebreakers through conference record (spec §8.1), the final regular-season week reproduced every playoff field 2019–2025 but two: 2023 GB / SEA and 2024 LA / SEA went to a coin flip. With strength of victory and of schedule added, every field and every bye matches.
  - A full season of 10,000 runs took 0.8 s. The profile pointed at `10 ** x`, the margin draw and eagerly built tiebreak steps; after those, 0.55 s.
  - Every week of every season would cost about 50 s of backfill. So a sealed season's weeks run 2,000 times, once, and the current season's 10,000 times.
- **Adjusted EPA.** The ridge's prior was chosen by fitting weeks 1…w and predicting week w + 1's game EPA per play (2019–2025, weeks 3–17, 1,470 fits in 0.44 s):

| Prior (plays) | RMSE, plain | RMSE, recency-weighted |
| ------------- | ----------- | ---------------------- |
| 0             | 0.23487     | 0.23731                |
| 100           | 0.21835     | 0.21665                |
| 200           | 0.21496     | 0.21423                |
| **300**       | **0.21383** | **0.21416**            |
| 500           | 0.21359     | 0.21527                |
| 800           | 0.21446     | 0.21697                |
| league mean   | 0.22384     | 0.22390                |

- **SRS by iteration oscillates** on a schedule where every team has played once (week 1: the graph splits in two), so it is solved directly (Task 2).
- **FG make model.** Fitted on 2019–2024, tested on 2025.
  - Knots at 30 / 40 / 50 left a ±3-point kink even in-sample (45–49 −3.0, 50–54 +3.0). With a knot every 5 yards, every in-sample bucket is within ±1.4.
  - Held-out log-loss: plain 0.3607, with a season trend 0.3575 (worse in 2024), recency-weighted (half-life 2 seasons) **0.3586**. The weights adapt to better kickers without extrapolating a trend.
  - **The spec's gate cannot be met.** One season's 5-yard bucket has a 2-SE band of 2–9 points (150 kicks at 85 %), so "±3 points in each bucket" fails a calibrated model by chance. The 45–49 bucket of 2025 is +8.2 (2.4 SE) under every variant: 130 of 157 made.
  - Hosmer–Lemeshow over the eight buckets: χ² 9.8 against 15.5 (p ≈ 0.28). Total: 85.6 % made against 83.5 % expected, +2.1 points. This is the amended gate.
- **Turnover luck.** FTN's interceptions per interception-worthy throw: 0.443 (2022), 0.570, 0.653, 0.689 (2025). Charting changed, so the expected interceptions use each season's league rate.
- **The QB composite.** Qualified QB seasons (200+ dropbacks), 2019–2025: EPA per dropback 0.058 ± 0.131, CPOE 0.53 ± 3.28 (r 0.71 between them).
- **Stability.** 305 metrics measured.
  - Batching the queries by the positions a metric applies to cut the time from 60 s to 20 s.
  - Year-to-year r: target share 0.68, WOPR 0.70, boom rate 0.69, pressure rate 0.62, YPRR 0.57, EPA/dropback 0.50, Elo 0.60, CPOE 0.35, FPOE 0.20, rush success 0.12, FGOE 0.11, TD over expected 0.07, FG % 0.02.
  - Priors: target share 7 targets, YPRR 142 routes, CPOE 350 attempts.
- **The outlook.**
  - A binomial test of snap share flagged a 75 → 81 % move as z 4.9: snaps come in series. The test uses the player's own weekly spread instead.
  - On 2025's top 48 WRs and RBs and top 24 TEs and QBs, regression flags fire on 10–30 % and role changes on a handful (mostly late-season injuries). 50 ms per player.
- **Combine.** `percent_rank` gave every tied player the lowest percentile, and ties are common (a 4.50 forty), so the scores take mid-ranks.
  - DK Metcalf's athletic score is 7.2 (Kent Lee Platte's RAS: 9.07; his uses more measures and size adjustments). Hence the name "RAS-style".
  - 6,516 of 7,745 linked combine attendees have a score.
- **A Plan Y bug.** At the week and season grains, a component a player never had read NULL. So did every sum over it: Tee Higgins's 2025 opportunity share, touches and scrimmage yards were NULL. Task 1 fixes it.
- **A test-only race.** In-memory test databases spill to DuckDB's default `.tmp` in the working directory, shared by every test worker. With the heavier model tests, two workers' spill files collided ("Corrupt temporary file"). Each test database now spills to its own directory (Task 7).
- **Timings with the models** (live, Task 9's check):

| Measure                                       | Result                              | Budget   |
| --------------------------------------------- | ----------------------------------- | -------- |
| Fresh backfill (empty profile)                | 221 s: derived 24 s, models 42 s    | ≤ 10 min |
| Upgrade from v0.26.0 (the models step only)   | 41 s                                |          |
| Forced daily refresh                          | 21.5 s: derived 1.7 s, models 4.4 s | ≤ 30 s   |
| Queries during the daily refresh (36)         | median 41 ms, max 129 ms            | ≤ 1 s    |
| Peak process memory: backfill / daily refresh | 2.05 GB / 1.97 GB                   |          |
| `stats.duckdb`                                | 354 MB                              | ≤ 400 MB |

## Spec amendments (taken in this plan)

Task 10 Step 2 records these in the spec as §17. **Confirm them with the user before starting Task 1** if they have not been approved yet.

- **A. The models step.** `stats:models` follows `stats:derived` after every successful rebuild, after a `MODELS_VERSION` change, and until a run succeeds. It writes `elo_games`, `team_forecast`, `team_model_week`, `player_model_week`, `player_profile` and `metric_stability`.
  - A first build takes about 40 s: the simulations about 20 s, stability about 20 s.
  - A daily refresh's takes about 4.5 s.
- **B. The engine reads models as components (§6.1, §7).**
  - `{last:x}` is a model state at the end of the scope: a team's Elo, ratings and odds, or a player's combine profile.
  - Model sums (expected wins, FG model, turnover luck) join like the fantasy components.
  - `{p80:fp}` and `{p20:fp}` are weekly quantiles, so those metrics read the weekly tables.
  - The catalogue gains 65 metrics: 324 in all, 204 for players and 120 for teams.
  - It serves each metric's stability (`MetricInfo.stability`).
- **C. Elo (§8.1).**
  - Home field is 0 at a neutral site and in 2020. A tie moves nothing (ln 1 = 0).
  - The market's probability is the no-vig moneyline, else the spread with a 13.5-point spread of margins.
  - Measured Brier 2021–2025: Elo 0.224, Vegas 0.211.
- **D. Season simulation (§8.1).**
  - The tiebreakers add strength of victory and of schedule: those decided 2023 (GB / SEA) and 2024 (LA / SEA). With them, the final regular-season week reproduces every playoff field and bye 2019–2025.
  - Divisions are a fixed map: the database has no teams table.
  - Each run wins a game with its Elo probability; the margin for the in-run update is drawn around the Elo spread.
  - It runs as of every regular-season week, cached: 2,000 runs for a sealed season's weeks, 10,000 for the current season's, whose latest week runs again each time. The postseason keeps the end-of-season odds.
- **E. Adjusted EPA (§8.2).**
  - The ridge's prior is 300 plays per team effect. It was chosen by predicting each next week's game EPA, 2019–2025: RMSE 0.2138, against 0.2239 for the league mean alone.
  - It is fitted as of every week, for all plays, dropbacks and other runs, plain and recency-weighted.
- **F. Ratings, luck and schedule (§8.3).**
  - SRS is solved directly. Iterating oscillates on a week-1 schedule, where every team has played once.
  - Elo luck is wins minus the sum of the Elo probabilities.
  - Schedule strength (played and left) is the mean current Elo, or adjusted EPA margin, of the opponents.
  - Interception luck (FTN, 2022+) compares interceptions with the interception-worthy throws × that season's league rate: FTN's charting changed (0.44 an interception-worthy throw in 2022, 0.69 in 2025).
- **G. FG model (§8.4).**
  - Distance is a spline with a knot every 5 yards from 25 to 55. A season weighs half as much as the one two seasons after it: kickers improved from long range.
  - **The gate changes.** A one-season 5-yard bucket carries 2–9 points of noise, so ±3 points in every bucket fails even for a calibrated model. The gate is Hosmer–Lemeshow over the eight buckets of held-out 2025 (p ≥ 0.05), and the season total within ±3 points.
  - Measured: χ² 9.8 (critical 15.5), total +2.1 points.
- **H. Shrinkage (§8.5).**
  - Proportions and means take one formula: (s·v + k·μ) / (s + k). s is the sample, μ the qualified rows' sample-weighted mean, and k the metric's stability prior: the sample at which split halves say half of the rate is signal (the beta and normal priors of §8.5 in one form).
  - It applies to rates only; for anything else, a note says it was not shrunk.
- **I. The player outlook (§8.5)** is a read of its own (`outlook`), not a query:
  - ceiling and floor this season and over the last 16 games;
  - boom and bust rates;
  - trend: the last four games against the games before. Its z uses the player's own weekly spread, because a binomial test flagged every small move (snaps and routes come in series). A role change is |z| ≥ 2.
  - regression flags: the expected move back, (1 − r)(v − μ) with r the year-to-year stability, of at least one position standard deviation;
  - the remaining schedule: the opponents' fantasy points allowed to the position, against the league.
  - A `games` read lists a season's games with Elo and the market.
- **J. Stability (§8.6).**
  - It is computed within each position and pooled, and needs 30 pairs. Reliability is high from r 0.6, medium from 0.35.
  - It is measured again when a past season changes (the weekly prior-season refresh), in about 20 s.
  - Measured: 305 metrics. Target share r 0.68 > TD over expected 0.07; WOPR 0.70 > FPOE 0.20.
- **K. Transforms (§7.1).**
  - `shrunk` (H).
  - `opponentAdjusted`: the value minus the sample-weighted average of how much more than the league each opponent allowed, in the same metric and position. It is one step, not iterated; sums only, on the weekly rows.
- **L. Profile (§8.7).**
  - Combine scores are mid-rank percentiles: ties share the middle, so a common 4.50 forty is not scored the slowest.
  - The score is named "Athletic score (RAS-style)". It averages raw measures, so it is not Kent Lee Platte's RAS (DK Metcalf: 7.2 here, 9.07 there). It needs four measures.
- **M. The EPA + CPOE composite** (moved from Plan Y) averages the two in standard deviations of qualified 2019–2025 QB seasons, with fixed norms.
- **N. Plan Y follow-up.** At the week and season grains, a counted component a player never had (carries for a receiver) read NULL, so sums of components did too (touches, opportunity share, ANY/A). Play-by-play and box-score components now read 0. FTN, participation, NGS and PFR stay NULL: there, NULL means "not measured".

## Global Constraints

- **Branch** `feat/stats-models-z` off `main`.
- **Commits.** One Conventional Commit per "Commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- **Never stage these.** The working tree has unrelated changes that are not part of this plan: `.gitignore`, `.design-sync/`, `docs/design/FantasyCompanion UI/`, `docs/research/nfl_predictive_metrics.md:Zone.Identifier`, `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts`, `tsconfig.node.tsbuildinfo` and `tsconfig.web.tsbuildinfo`. Stage files by name; never run `git add -A` or `git add .`.
- **Formatting and lint.**
  - Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`.**
  - Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
  - Typecheck with `npm run typecheck`.
- **Copy the code exactly.** Every new file is given whole, and every change to an existing file as a diff that `git apply` takes as written (save it to a file and run `git apply <file>`, or make the same edit by hand). The tasks were replayed in order on a clean copy of `main`, with typecheck, lint and the full suite green after each. The final tree is byte-identical to the prototype.
- **Test counts** are those of a clean checkout. In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3.
- **Scope.**
  - No screen changes: Plans AA–AE build the screens on this.
  - The fantasy pipeline (`companion.db`, scoring, values, lineup, trade, waivers) does not change.
  - Nothing outside `src/main/stats/` reads `stats.duckdb`.
- **Network.** No test touches the network. Only the throwaway live check in Task 9 does, and it is never committed.
- **Gates.**
  - **Task 9:** every line of the live check, which ends with `ALL GATES PASSED`.
  - **Task 11 Step 2:** the Windows suite and self-test on the Package check workflow.
  - If a gate fails, stop and report the numbers to the user.
- **Release** `v0.27.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push** (`check/plan-z` in Task 11, `main` and the tag).
- **Not GUI-verifiable here** (WSLg): no window changes in this plan. Say so in the Status block.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **A model number that is wrong but plausible** (an Elo update with the wrong sign, a defense credited with the offense's effect, a simulation that leaves a playoff place empty). → Tasks 2–4: each model against hand-computed or synthetic answers. Task 9: Brier, FG calibration, the real playoff fields 2019–2025, odds that add up, adjusted EPA and SRS against raw EPA and point differential.
2. **A state read at the wrong moment** (a team's Elo after its bye, odds in the postseason, a week range that ends mid-season). → Task 5: states at the end of the scope, a bye, `weeks`, `seasonType: 'ALL'`, by week.
3. **A flag that cries wolf** (a role change that is noise, a regression flag on a stable metric). → Task 8: the weekly-spread test against noisy weeks, the expected move back by stability. Planning findings: flag rates on 2025.
4. **The first launch of v0.27.0 runs too long, or fails half way** (simulations of every past week, stability on every metric). → Task 7: the cache (only the latest week runs again), the pending flag until a run succeeds, a version change rebuilds. Task 9: the backfill and daily budgets.
5. **A model read before the models exist** (the first minutes after the update). → Task 8: model metrics, games and the outlook say "still being built"; other metrics answer.
6. **A transform that silently does nothing.** → Task 5: `shrunk` without a prior and `opponentAdjusted` on a rating return the raw value with a note.
7. **A packaged Windows app whose worker cannot answer.** → Task 11: the Package check workflow on Windows.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/stats-models-z
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/stats-models-z`.

---

### Task 1: Missing counts read as zero (amendment N)

At the week and season grains, a component a player never had (carries for a receiver) read NULL, and so did every formula that adds it: opportunity share, touches, scrimmage yards, ANY/A. The play grain already reads 0.

**Files:**

- Create: `tests/main/stats/engine/missing.test.ts`
- Modify: `src/main/stats/engine/registry.ts`, `src/main/stats/engine/compile.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/main/stats/engine/missing.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { runQuery } from '@main/stats/engine/run'
import { openTestDb } from '../../../fixtures/stats'
import { seedGame, WR } from '../../../fixtures/statsDerived'

const CTX = { currentSeason: 2025, hasLeague: false }

describe('counted components that a player never had (Plan Y follow-up)', () => {
  it('sum as 0, so a receiver without carries has an opportunity share and touches', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: null })
    const r = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['opportunity_share', 'touches', 'scrimmage_yds'],
        scope: { seasons: [2025], players: [WR] }
      },
      CTX
    )
    // Two targets of BUF's three targets and one carry; one reception for 20 yards.
    expect(r.rows[0].values.opportunity_share.value).toBeCloseTo(2 / 3, 9)
    expect(r.rows[0].values.touches.value).toBe(1)
    expect(r.rows[0].values.scrimmage_yds.value).toBe(20)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/main/stats/engine/missing.test.ts
```

Expected: FAIL, the opportunity share is `null`.

- [ ] **Step 3: Sum play-by-play and box-score components as 0 when missing**

```diff
diff --git a/src/main/stats/engine/registry.ts b/src/main/stats/engine/registry.ts
index 077bac8..cf15194 100644
--- a/src/main/stats/engine/registry.ts
+++ b/src/main/stats/engine/registry.ts
@@ -1,13 +1,34 @@
 import { CATALOGUE, componentsOf } from '@shared/stats/catalogue'
 import type { Entity, Grain, MetricDef, MetricInfo } from '@shared/stats/types'
-import { playerComponentNames } from '../derived/player'
+import { BOX_COMPONENTS, playerComponentNames } from '../derived/player'
 import { PLAYER_PLAY_COMPONENTS, TEAM_PLAY_COMPONENTS } from '../derived/plays'
-import { teamComponentNames } from '../derived/team'
+import { TEAM_BOX_COMPONENTS, teamComponentNames } from '../derived/team'

 /** Fantasy components, joined from `fantasy_week` / `team_fantasy_week` under the chosen scoring. */
 export const PLAYER_FANTASY = ['fp', 'xfp']
 export const TEAM_FANTASY = ['fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te', 'fpa_k']

+/**
+ * Components that count something every game has a record of (play-by-play, the box score): a
+ * player without such a play that week has none, so a missing value sums as 0. FTN, participation,
+ * NGS, PFR and QBR components stay NULL when missing: there, NULL means "not measured".
+ */
+export const ZERO_WHEN_MISSING: Record<Entity, ReadonlySet<string>> = {
+  player: new Set([
+    ...PLAYER_PLAY_COMPONENTS.filter((c) => c.group === 'pbp').map((c) => c.name),
+    ...Object.keys(BOX_COMPONENTS),
+    'games'
+  ]),
+  team: new Set([
+    ...TEAM_PLAY_COMPONENTS.filter((c) => c.group === 'pbp').flatMap((c) => [
+      `off_${c.name}`,
+      `def_${c.name}`
+    ]),
+    ...Object.keys(TEAM_BOX_COMPONENTS),
+    'games'
+  ])
+}
+
 /** The components each grain can sum, by entity (spec §7.2: the grain decides the tables). */
 export const COMPONENTS: Record<Entity, Record<'table' | 'play', ReadonlySet<string>>> = {
   player: {
```

```diff
diff --git a/src/main/stats/engine/compile.ts b/src/main/stats/engine/compile.ts
index 6355114..6b6ad11 100644
--- a/src/main/stats/engine/compile.ts
+++ b/src/main/stats/engine/compile.ts
@@ -18,7 +18,7 @@ import {
   type Role
 } from '../derived/plays'
 import { STATS_FIRST_SEASON } from '../sources'
-import { grainsOf, PLAYER_FANTASY, TEAM_FANTASY } from './registry'
+import { grainsOf, PLAYER_FANTASY, TEAM_FANTASY, ZERO_WHEN_MISSING } from './registry'

 /** A query the engine refuses, with a message a person (or an LLM) can act on. */
 export class StatsQueryError extends Error {}
@@ -438,10 +438,13 @@ function tableAgg(q: StatsQuery, c: Checked, params: Params): { ctes: string; di
                 FROM ${table} w ${join}
                 WHERE ${where.join(' AND ')} ${last}`
   const dims = c.groupBy
+  // A counted component a player never had (carries for a receiver) sums as 0, not NULL.
+  const zero = ZERO_WHEN_MISSING[q.entity]
+  const sumOf = (n: string): string => (zero.has(n) ? `coalesce(sum(${n}), 0)` : `sum(${n})`)
   const agg = `SELECT id, ${dims.map((d) => `${d} AS g_${d}, `).join('')}
                       arg_max(team, season * 100 + coalesce(week, 0)) AS team,
                       mode(position) AS position, sum(games)::DOUBLE AS games,
-                      ${metricColumns(c.metrics, (n) => `sum(${n})`, c.transform === 'perGame').join(', ')}
+                      ${metricColumns(c.metrics, sumOf, c.transform === 'perGame').join(', ')}
                FROM base GROUP BY id${dims.map((d) => `, ${d}`).join('')}`
   return { ctes: `base AS (${base}), agg AS (${agg})`, dims }
 }
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/main/stats
```

Expected: PASS (92 passed).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/stats/engine/registry.ts src/main/stats/engine/compile.ts tests/main/stats/engine/missing.test.ts
git add src/main/stats/engine/registry.ts src/main/stats/engine/compile.ts tests/main/stats/engine/missing.test.ts
git commit -m "fix(stats): count missing components as zero"
```

---

### Task 2: Team Elo and SRS (spec §8.1, §8.3; amendments C, F)

**Files:**

- Create: `src/main/stats/models/linear.ts`, `src/main/stats/models/elo.ts`, `src/main/stats/models/ratings.ts`, `tests/main/stats/models/elo.test.ts`, `tests/main/stats/models/linear.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/stats/models/elo.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  brier,
  ELO,
  eloShift,
  homeFieldOf,
  moneylineProbability,
  movMultiplier,
  normalCdf,
  ratingsAfter,
  runElo,
  winProbability,
  type EloGame
} from '@main/stats/models/elo'
import { srs } from '@main/stats/models/ratings'

const game = (
  o: Partial<EloGame> & Pick<EloGame, 'game_id' | 'home_team' | 'away_team'>
): EloGame => ({
  season: 2025,
  season_type: 'REG',
  week: 1,
  neutral: false,
  result: null,
  spread_line: null,
  home_moneyline: null,
  away_moneyline: null,
  ...o
})

describe('team Elo (stats-analysis spec §8.1)', () => {
  it('turns a rating gap into a win probability and a spread', () => {
    expect(winProbability(0)).toBe(0.5)
    // 400 Elo points: ten to one.
    expect(winProbability(400)).toBeCloseTo(10 / 11, 10)
    expect(winProbability(-100) + winProbability(100)).toBeCloseTo(1, 12)
    expect(homeFieldOf({ season: 2025, neutral: false })).toBe(48)
    expect(homeFieldOf({ season: 2025, neutral: true })).toBe(0)
    expect(homeFieldOf({ season: 2020, neutral: false })).toBe(0)
  })

  it('moves ratings more for a big upset than for an expected rout', () => {
    // The nfelo multiplier: ln(|MOV| + 1) × 2.2 / (winner's Elo edge × 0.001 + 2.2).
    expect(movMultiplier(7, 0)).toBeCloseTo(Math.log(8), 12)
    expect(movMultiplier(7, 200)).toBeLessThan(movMultiplier(7, -200))
    // An underdog by 100 wins by 14: it gains; a favourite by 100 winning by 14 gains less.
    const upset = eloShift(-100, 14)
    const expected = eloShift(100, 14)
    expect(upset).toBeGreaterThan(expected)
    expect(expected).toBeGreaterThan(0)
    expect(eloShift(100, -3)).toBeLessThan(0)
    // A tie moves nothing (ln 1 = 0).
    expect(eloShift(50, 0)).toBeCloseTo(0, 12)
  })

  it('runs every game in order and regresses a third to the mean between seasons', () => {
    const { rows, ratings } = runElo([
      game({ game_id: 'b', week: 2, home_team: 'KC', away_team: 'BUF', result: 3 }),
      game({ game_id: 'a', week: 1, home_team: 'BUF', away_team: 'KC', result: 10 }),
      game({ game_id: 'c', season: 2026, week: 1, home_team: 'BUF', away_team: 'KC', result: null })
    ])
    expect(rows.map((r) => r.game_id)).toEqual(['a', 'b', 'c'])
    const [a, b, c] = rows
    expect([a.home_elo_pre, a.away_elo_pre]).toEqual([1500, 1500])
    expect(a.home_wp).toBeCloseTo(winProbability(48), 12)
    expect(a.elo_spread).toBeCloseTo(48 / 25, 12)
    const shift = eloShift(48, 10)
    expect(a.home_elo_post).toBeCloseTo(1500 + shift, 9)
    // Week 2 starts from week 1's ratings.
    expect(b.away_elo_pre).toBeCloseTo(1500 + shift, 9)
    // The next season starts a third of the way back to 1500, and an unplayed game changes nothing.
    const buf = ratings.get('BUF')!
    expect(c.played).toBe(false)
    expect(c.home_elo_post).toBeNull()
    expect(c.home_elo_pre).toBeCloseTo(buf, 9)
    expect(buf - ELO.base).toBeCloseTo(((b.away_elo_post as number) - ELO.base) * (2 / 3), 9)
    // Before week 1 a team has its preseason rating; after week 1, week 1's.
    expect(ratingsAfter(rows, 2025, 0).get('BUF')).toBe(1500)
    expect(ratingsAfter(rows, 2025, 1).get('BUF')).toBeCloseTo(a.home_elo_post as number, 9)
  })

  it('prices the market from the moneylines, else from the spread', () => {
    // −150 / +130: 0.6 and 0.4348 implied, 0.58 without the vig.
    expect(moneylineProbability(-150, 130)).toBeCloseTo(0.6 / (0.6 + 100 / 230), 9)
    expect(normalCdf(0)).toBeCloseTo(0.5, 7)
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3)
    const { rows } = runElo([
      game({
        game_id: 'm',
        home_team: 'BUF',
        away_team: 'KC',
        home_moneyline: -150,
        away_moneyline: 130
      }),
      game({ game_id: 's', home_team: 'DAL', away_team: 'NYG', spread_line: 3 })
    ])
    expect(rows[0].vegas_home_wp).toBeCloseTo(0.58, 2)
    expect(rows[1].vegas_home_wp).toBeCloseTo(normalCdf(3 / 13.5), 9)
  })

  it('scores probabilities with the Brier score', () => {
    expect(
      brier([
        { p: 0.5, result: 3 },
        { p: 0.5, result: -3 }
      ])
    ).toBe(0.25)
    expect(
      brier([
        { p: 1, result: 7 },
        { p: 0.5, result: 0 }
      ])
    ).toBe(0)
  })
})

describe('the Simple Rating System (spec §8.3)', () => {
  it('adds the average opponent rating to the average margin, centred on 0', () => {
    // A beat B by 10, B beat C by 10, C beat A by 10 at home twice over: a cycle sums to 0 each.
    const cycle = srs([
      { home: 'A', away: 'B', margin: 10 },
      { home: 'B', away: 'C', margin: 10 },
      { home: 'C', away: 'A', margin: 10 }
    ])
    for (const r of cycle.values()) expect(r).toBeCloseTo(0, 4)
    // Week 1: every team has played once, so each pair splits its margin (no oscillation).
    const two = srs([
      { home: 'A', away: 'B', margin: 14 },
      { home: 'C', away: 'D', margin: -6 }
    ])
    expect([...two.values()].map((r) => Number(r.toFixed(4)))).toEqual([7, -7, -3, 3])
    // A beat C by 10; C beat B by 10: A is 10 better than C, C 10 better than B.
    const chain = srs([
      { home: 'A', away: 'C', margin: 10 },
      { home: 'C', away: 'B', margin: 10 }
    ])
    expect(chain.get('A')! - chain.get('C')!).toBeCloseTo(10, 3)
    expect(chain.get('C')).toBeCloseTo(0, 3)
  })
})
```

Create `tests/main/stats/models/linear.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { logisticFit, logisticPredict, pearson, rng, solve } from '@main/stats/models/linear'

describe('model linear algebra', () => {
  it('solves a linear system', () => {
    // 2x + y = 5, x + 3y = 10 → x = 1, y = 3.
    const x = solve(Float64Array.from([2, 1, 1, 3]), Float64Array.from([5, 10]), 2)
    expect(x[0]).toBeCloseTo(1, 12)
    expect(x[1]).toBeCloseTo(3, 12)
    expect(() => solve(Float64Array.from([1, 1, 1, 1]), Float64Array.from([1, 2]), 2)).toThrow(
      'singular'
    )
  })

  it('recovers logistic coefficients, and counts weighted rows that many times', () => {
    const random = rng(7)
    const x: number[][] = []
    const y: number[] = []
    for (let i = 0; i < 20_000; i++) {
      const d = random() * 4 - 2
      x.push([1, d])
      y.push(random() < logisticPredict([1, d], [0.5, -1.5]) ? 1 : 0)
    }
    const beta = logisticFit(x, y, { ridge: 0 })
    expect(beta[0]).toBeCloseTo(0.5, 1)
    expect(beta[1]).toBeCloseTo(-1.5, 1)
    // Two copies of a row weigh the same as weight 2.
    const once = logisticFit(
      [
        [1, 0],
        [1, 1],
        [1, 1]
      ],
      [1, 0, 1],
      { ridge: 0.1 }
    )
    const weighted = logisticFit(
      [
        [1, 0],
        [1, 1]
      ],
      [1, 0],
      { ridge: 0.1, weights: [1, 1] }
    )
    expect(weighted).not.toEqual(once)
    const doubled = logisticFit(
      [
        [1, 0],
        [1, 1],
        [1, 1]
      ],
      [1, 1, 0],
      { ridge: 0.1 }
    )
    const asWeight = logisticFit(
      [
        [1, 0],
        [1, 1],
        [1, 1]
      ],
      [1, 1, 0],
      { ridge: 0.1, weights: [1, 1, 1] }
    )
    expect(asWeight[1]).toBeCloseTo(doubled[1], 9)
  })

  it('correlates', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 12)
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 12)
    expect(pearson([1, 2], [1, 2])).toBeNaN()
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNaN()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/main/stats/models
```

Expected: FAIL, the modules do not exist.

- [ ] **Step 3: The linear algebra, Elo and SRS**

Create `src/main/stats/models/linear.ts`:

```ts
/** Small dense linear algebra for the models (spec §8: they run on thousands of rows, not millions). */

/**
 * Solves `A x = b` for a symmetric positive-definite `A` (normal equations) by Gaussian elimination
 * with partial pivoting. `A` is n × n, row-major; neither input is changed.
 */
export function solve(a: Float64Array, b: Float64Array, n: number): Float64Array {
  const m = Float64Array.from(a)
  const x = Float64Array.from(b)
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r * n + col]) > Math.abs(m[pivot * n + col])) pivot = r
    }
    if (Math.abs(m[pivot * n + col]) < 1e-12) throw new Error('singular system')
    if (pivot !== col) {
      for (let c = 0; c < n; c++) {
        const t = m[col * n + c]
        m[col * n + c] = m[pivot * n + c]
        m[pivot * n + c] = t
      }
      const t = x[col]
      x[col] = x[pivot]
      x[pivot] = t
    }
    const d = m[col * n + col]
    for (let r = col + 1; r < n; r++) {
      const f = m[r * n + col] / d
      if (f === 0) continue
      for (let c = col; c < n; c++) m[r * n + c] -= f * m[col * n + c]
      x[r] -= f * x[col]
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = x[r]
    for (let c = r + 1; c < n; c++) s -= m[r * n + c] * x[c]
    x[r] = s / m[r * n + r]
  }
  return x
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z))

/**
 * Logistic regression by iteratively reweighted least squares, with a small ridge on every
 * coefficient but the first (the intercept) so that a rare feature cannot diverge. `weights` count
 * each row that many times (default 1).
 */
export function logisticFit(
  x: number[][],
  y: number[],
  {
    ridge = 1e-3,
    iterations = 50,
    weights
  }: { ridge?: number; iterations?: number; weights?: number[] } = {}
): number[] {
  const p = x[0]?.length ?? 0
  let beta = new Float64Array(p)
  for (let it = 0; it < iterations; it++) {
    const h = new Float64Array(p * p)
    const g = new Float64Array(p)
    for (let i = 0; i < x.length; i++) {
      const row = x[i]
      let z = 0
      for (let j = 0; j < p; j++) z += row[j] * beta[j]
      const mu = sigmoid(z)
      const wi = weights?.[i] ?? 1
      const w = wi * Math.max(mu * (1 - mu), 1e-9)
      const r = wi * (y[i] - mu)
      for (let j = 0; j < p; j++) {
        g[j] += row[j] * r
        for (let k = j; k < p; k++) h[j * p + k] += w * row[j] * row[k]
      }
    }
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < j; k++) h[j * p + k] = h[k * p + j]
      if (j > 0) {
        h[j * p + j] += ridge
        g[j] -= ridge * beta[j]
      }
    }
    const step = solve(h, g, p)
    const next = beta.map((b, j) => b + step[j])
    const moved = Math.max(...step.map(Math.abs))
    beta = next
    if (moved < 1e-8) break
  }
  return [...beta]
}

/** `sigmoid(x · beta)`. */
export function logisticPredict(row: number[], beta: number[]): number {
  let z = 0
  for (let j = 0; j < beta.length; j++) z += row[j] * beta[j]
  return sigmoid(z)
}

/** Pearson correlation; NaN under three pairs or without spread. */
export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 3) return NaN
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
  }
  const mx = sx / n
  const my = sy / n
  let cov = 0
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    cov += dx * dy
    vx += dx * dx
    vy += dy * dy
  }
  return vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : NaN
}

/** Mulberry32: a small seeded generator, so a simulation repeats exactly. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
```

Create `src/main/stats/models/elo.ts`:

```ts
/**
 * Team Elo (stats-analysis spec §8.1), nfelo-style: every game since 2019 in order, 2019 as the
 * burn-in. Pure functions over the schedule, so the model is testable without a database.
 */

export const ELO = {
  /** A new team, and the mean ratings regress to. */
  base: 1500,
  k: 20,
  /** Home field in Elo points: 0 at a neutral site and in 2020 (no fans). */
  homeField: 48,
  /** The share of a rating kept between seasons (one third regresses to the mean). */
  carry: 2 / 3,
  /** Elo points per point of spread. */
  perPoint: 25
} as const

export interface EloGame {
  game_id: string
  season: number
  season_type: 'REG' | 'POST'
  week: number
  home_team: string
  away_team: string
  neutral: boolean
  /** Home minus away; null until played. */
  result: number | null
  /** Vegas: the home team's expected margin, and the moneylines (American odds). */
  spread_line: number | null
  home_moneyline: number | null
  away_moneyline: number | null
}

export interface EloRow {
  game_id: string
  season: number
  season_type: 'REG' | 'POST'
  week: number
  home_team: string
  away_team: string
  played: boolean
  home_elo_pre: number
  away_elo_pre: number
  home_field: number
  /** The home team's win probability and expected margin, from Elo. */
  home_wp: number
  elo_spread: number
  /** The home team's win probability implied by the betting market (no-vig moneyline, else the spread). */
  vegas_home_wp: number | null
  home_elo_post: number | null
  away_elo_post: number | null
}

/** The home team's win probability for an Elo difference (home field included). */
export const winProbability = (diff: number): number =>
  1 / (1 + Math.exp((-diff * Math.LN10) / 400))

/** Home field for a game: none at a neutral site or without fans (2020). */
export const homeFieldOf = (g: Pick<EloGame, 'season' | 'neutral'>): number =>
  g.neutral || g.season === 2020 ? 0 : ELO.homeField

/** nfelo's margin-of-victory multiplier: big wins count more, less so for the favourite. */
export function movMultiplier(margin: number, winnerDiff: number): number {
  return (Math.log(Math.abs(margin) + 1) * 2.2) / (winnerDiff * 0.001 + 2.2)
}

/** The rating change of the home team (the away team's is its negative); `p` is its win probability. */
export function eloShift(diff: number, result: number, p = winProbability(diff)): number {
  const outcome = result > 0 ? 1 : result < 0 ? 0 : 0.5
  const winnerDiff = result >= 0 ? diff : -diff
  return ELO.k * movMultiplier(result, winnerDiff) * (outcome - p)
}

/** No-vig probability from two American moneylines. */
export function moneylineProbability(home: number, away: number): number | null {
  const implied = (odds: number): number => (odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100))
  if (!Number.isFinite(home) || !Number.isFinite(away) || home === 0 || away === 0) return null
  const h = implied(home)
  const a = implied(away)
  return h / (h + a)
}

/** The standard normal CDF (Abramowitz and Stegun 26.2.17, error below 1e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2)
  const p =
    d *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}

/** NFL margins around the spread have a spread of about 13.5 points. */
export const MARGIN_SD = 13.5

function vegasProbability(g: EloGame): number | null {
  if (g.home_moneyline !== null && g.away_moneyline !== null) {
    const p = moneylineProbability(g.home_moneyline, g.away_moneyline)
    if (p !== null) return p
  }
  return g.spread_line === null ? null : normalCdf(g.spread_line / MARGIN_SD)
}

const order = (a: EloGame, b: EloGame): number =>
  a.season - b.season ||
  (a.season_type === b.season_type ? 0 : a.season_type === 'REG' ? -1 : 1) ||
  a.week - b.week ||
  a.game_id.localeCompare(b.game_id)

/**
 * Runs Elo over the games in order. A played game updates both ratings; an unplayed one is rated
 * with the teams' latest ratings. A team's first game of a season starts from its rating regressed
 * a third of the way to the mean. Returns one row per game and every team's latest rating.
 */
export function runElo(games: EloGame[]): { rows: EloRow[]; ratings: Map<string, number> } {
  const ratings = new Map<string, number>()
  const seasonOf = new Map<string, number>()
  const rating = (team: string, season: number): number => {
    const last = seasonOf.get(team)
    let r = ratings.get(team) ?? ELO.base
    if (last !== undefined && last < season)
      r = ELO.base + (r - ELO.base) * ELO.carry ** (season - last)
    if (last !== season) {
      ratings.set(team, r)
      seasonOf.set(team, season)
    }
    return r
  }
  const rows: EloRow[] = []
  for (const g of [...games].sort(order)) {
    const home = rating(g.home_team, g.season)
    const away = rating(g.away_team, g.season)
    const hfa = homeFieldOf(g)
    const diff = home + hfa - away
    const played = g.result !== null
    const shift = played ? eloShift(diff, g.result as number) : 0
    if (played) {
      ratings.set(g.home_team, home + shift)
      ratings.set(g.away_team, away - shift)
    }
    rows.push({
      game_id: g.game_id,
      season: g.season,
      season_type: g.season_type,
      week: g.week,
      home_team: g.home_team,
      away_team: g.away_team,
      played,
      home_elo_pre: home,
      away_elo_pre: away,
      home_field: hfa,
      home_wp: winProbability(diff),
      elo_spread: diff / ELO.perPoint,
      vegas_home_wp: vegasProbability(g),
      home_elo_post: played ? home + shift : null,
      away_elo_post: played ? away - shift : null
    })
  }
  return { rows, ratings }
}

/** Brier score of probabilities against outcomes (a tie counts as half a win). */
export function brier(pairs: { p: number; result: number }[]): number {
  if (pairs.length === 0) return NaN
  const outcome = (r: number): number => (r > 0 ? 1 : r < 0 ? 0 : 0.5)
  return pairs.reduce((s, x) => s + (x.p - outcome(x.result)) ** 2, 0) / pairs.length
}

/**
 * Every team's rating after a week's games of a season (before its first game, its preseason
 * rating, regressed toward the mean). Teams without a game that season are left out.
 */
export function ratingsAfter(rows: EloRow[], season: number, week: number): Map<string, number> {
  const out = new Map<string, number>()
  const seen = new Set<string>()
  for (const r of rows) {
    if (r.season !== season) continue
    for (const [team, pre, post] of [
      [r.home_team, r.home_elo_pre, r.home_elo_post],
      [r.away_team, r.away_elo_pre, r.away_elo_post]
    ] as const) {
      if (!seen.has(team)) {
        seen.add(team)
        out.set(team, pre)
      }
      if (r.played && r.week <= week && post !== null) out.set(team, post)
    }
  }
  return out
}
```

Create `src/main/stats/models/ratings.ts`:

```ts
import { solve } from './linear'

/**
 * The Simple Rating System (stats-analysis spec §8.3): a team's rating is its average margin plus
 * the average rating of its opponents. A rating of +5 means five points better than an average
 * team on a neutral field.
 */

export interface MarginGame {
  home: string
  away: string
  /** Home minus away. */
  margin: number
}

/**
 * Solves the SRS equations directly: games × rating − Σ opponents' ratings = Σ margins for each
 * team. Iterating them instead oscillates when the schedule splits teams in two groups (every week
 * 1). The system is singular (a constant can be added to every rating), so a tiny ridge picks the
 * solution centred on 0 within each group of teams that played each other.
 */
export function srs(games: MarginGame[]): Map<string, number> {
  const teams = [...new Set(games.flatMap((g) => [g.home, g.away]))].sort()
  const n = teams.length
  const index = new Map(teams.map((t, i) => [t, i]))
  const a = new Float64Array(n * n)
  const b = new Float64Array(n)
  for (const g of games) {
    const h = index.get(g.home)!
    const v = index.get(g.away)!
    a[h * n + h] += 1
    a[v * n + v] += 1
    a[h * n + v] -= 1
    a[v * n + h] -= 1
    b[h] += g.margin
    b[v] -= g.margin
  }
  for (let i = 0; i < n; i++) a[i * n + i] += 1e-6
  const x = n > 0 ? solve(a, b, n) : new Float64Array()
  return new Map(teams.map((t, i) => [t, x[i]]))
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/main/stats/models
```

Expected: PASS (9 passed).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/stats/models tests/main/stats/models
git add src/main/stats/models/linear.ts src/main/stats/models/elo.ts src/main/stats/models/ratings.ts tests/main/stats/models/elo.test.ts tests/main/stats/models/linear.test.ts
git commit -m "feat(stats): team Elo and SRS"
```

---

### Task 3: The season simulation (spec §8.1; amendment D)

**Files:**

- Create: `src/main/stats/models/simulate.ts`, `tests/main/stats/models/simulate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/main/stats/models/simulate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rng } from '@main/stats/models/linear'
import { DIVISIONS, simulateSeason, type SimGame } from '@main/stats/models/simulate'

/** Every team plays its division twice (96 games); results drawn once from a seed, or unplayed. */
function divisionSchedule(played: boolean, seed = 1): SimGame[] {
  const random = rng(seed)
  const games: SimGame[] = []
  let week = 1
  for (const teams of Object.values(DIVISIONS)) {
    for (const home of teams) {
      for (const away of teams) {
        if (home === away) continue
        games.push({
          week: (week++ % 6) + 1,
          home,
          away,
          homeField: 48,
          result: played ? (random() < 0.5 ? 3 : -3) : null
        })
      }
    }
  }
  return games
}

const ratings = new Map(
  Object.values(DIVISIONS)
    .flat()
    .map((t) => [t, 1500])
)
const sum = (
  odds: ReturnType<typeof simulateSeason>,
  k: 'playoffs' | 'division' | 'bye' | 'conference' | 'superBowl'
): number => odds.reduce((s, o) => s + o[k], 0)

describe('season simulation (stats-analysis spec §8.1)', () => {
  it('fills every playoff place in every run, and repeats exactly with the same seed', () => {
    const games = divisionSchedule(false)
    const odds = simulateSeason({ season: 2025, games, ratings, runs: 400, seed: 3 })
    expect(sum(odds, 'playoffs')).toBeCloseTo(14, 9)
    expect(sum(odds, 'division')).toBeCloseTo(8, 9)
    expect(sum(odds, 'bye')).toBeCloseTo(2, 9)
    expect(sum(odds, 'conference')).toBeCloseTo(2, 9)
    expect(sum(odds, 'superBowl')).toBeCloseTo(1, 9)
    expect(odds.reduce((s, o) => s + o.wins + o.losses + o.ties, 0)).toBeCloseTo(
      2 * games.length,
      9
    )
    expect(simulateSeason({ season: 2025, games, ratings, runs: 400, seed: 3 })).toEqual(odds)
    expect(simulateSeason({ season: 2025, games, ratings, runs: 400, seed: 4 })).not.toEqual(odds)
  })

  it('seeds six teams and two byes per conference in 2019', () => {
    const odds = simulateSeason({
      season: 2019,
      games: divisionSchedule(false),
      ratings,
      runs: 200
    })
    expect(sum(odds, 'playoffs')).toBeCloseTo(12, 9)
    expect(sum(odds, 'bye')).toBeCloseTo(4, 9)
  })

  it('breaks a division tie on head-to-head', () => {
    const games = divisionSchedule(true).filter((g) => !DIVISIONS['AFC East'].includes(g.home))
    const east = (home: string, away: string, result: number): SimGame => ({
      week: 1,
      home,
      away,
      homeField: 48,
      result
    })
    // BUF and MIA finish 4–2; BUF swept MIA.
    games.push(
      east('BUF', 'MIA', 7),
      east('MIA', 'BUF', -7),
      east('BUF', 'NYJ', 7),
      east('NYJ', 'BUF', -7),
      east('BUF', 'NE', -7),
      east('NE', 'BUF', 7),
      east('MIA', 'NE', 7),
      east('NE', 'MIA', -7),
      east('MIA', 'NYJ', 7),
      east('NYJ', 'MIA', -7),
      east('NE', 'NYJ', 7),
      east('NYJ', 'NE', 7)
    )
    const odds = new Map(
      simulateSeason({ season: 2025, games, ratings, runs: 50 }).map((o) => [o.team, o])
    )
    expect([odds.get('BUF')!.division, odds.get('MIA')!.division]).toEqual([1, 0])
    expect([odds.get('BUF')!.wins, odds.get('MIA')!.wins, odds.get('NE')!.wins]).toEqual([4, 4, 3])
  })

  it('wins a game with its Elo probability', () => {
    const games: SimGame[] = [{ week: 1, home: 'KC', away: 'NYJ', homeField: 0, result: null }]
    const strong = new Map(ratings).set('KC', 1700).set('NYJ', 1300)
    const odds = new Map(
      simulateSeason({ season: 2025, games, ratings: strong, runs: 10_000 }).map((o) => [o.team, o])
    )
    // 400 Elo points: ten to one.
    expect(odds.get('KC')!.wins).toBeCloseTo(10 / 11, 1)
    expect(odds.get('KC')!.wins + odds.get('NYJ')!.wins).toBeCloseTo(1, 9)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/main/stats/models/simulate.test.ts
```

Expected: FAIL, the module does not exist.

- [ ] **Step 3: Simulate the rest of the season and the playoffs**

Create `src/main/stats/models/simulate.ts`:

```ts
import { ELO, eloShift, MARGIN_SD, winProbability } from './elo'
import { rng } from './linear'

/**
 * Season simulation (stats-analysis spec §8.1): the rest of the regular season played many times
 * from the current Elo ratings, ratings updated within each run, then the playoffs. NFL
 * tiebreakers through head-to-head, division record, common games, conference record, strength of
 * victory and strength of schedule, then a coin flip: an approximation (the points-based steps are
 * left out).
 */

/** Divisions since 2002; nflverse codes. */
export const DIVISIONS: Record<string, string[]> = {
  'AFC East': ['BUF', 'MIA', 'NE', 'NYJ'],
  'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'],
  'AFC South': ['HOU', 'IND', 'JAX', 'TEN'],
  'AFC West': ['DEN', 'KC', 'LAC', 'LV'],
  'NFC East': ['DAL', 'NYG', 'PHI', 'WAS'],
  'NFC North': ['CHI', 'DET', 'GB', 'MIN'],
  'NFC South': ['ATL', 'CAR', 'NO', 'TB'],
  'NFC West': ['ARI', 'LA', 'SF', 'SEA']
}

export const SIM_RUNS = 10_000

export interface SimGame {
  week: number
  home: string
  away: string
  /** Home field in Elo points (0 at a neutral site). */
  homeField: number
  /** Home minus away once played. */
  result: number | null
}

export interface SimInput {
  season: number
  /** The whole regular season, played games with their results. */
  games: SimGame[]
  /** Every team's rating now. */
  ratings: Map<string, number>
  runs?: number
  seed?: number
}

export interface TeamOdds {
  team: string
  wins: number
  losses: number
  ties: number
  playoffs: number
  division: number
  /** A first-round bye: the top seed (the top two in 2019). */
  bye: number
  /** Reaches the Super Bowl. */
  conference: number
  superBowl: number
}

const TEAMS = Object.values(DIVISIONS).flat().sort()
const T = TEAMS.length
const INDEX = new Map(TEAMS.map((t, i) => [t, i]))
const DIVISION_OF = new Int8Array(T)
Object.values(DIVISIONS).forEach((teams, d) =>
  teams.forEach((t) => (DIVISION_OF[INDEX.get(t)!] = d))
)
const conferenceOf = (i: number): number => (DIVISION_OF[i] < 4 ? 0 : 1)

/** One season's results: wins, losses and ties of each team against each other team. */
class Table {
  readonly w = new Uint8Array(T * T)
  readonly l = new Uint8Array(T * T)
  readonly t = new Uint8Array(T * T)
  copy(from: Table): void {
    this.w.set(from.w)
    this.l.set(from.l)
    this.t.set(from.t)
  }
  add(home: number, away: number, result: number): void {
    if (result > 0) {
      this.w[home * T + away] += 1
      this.l[away * T + home] += 1
    } else if (result < 0) {
      this.l[home * T + away] += 1
      this.w[away * T + home] += 1
    } else {
      this.t[home * T + away] += 1
      this.t[away * T + home] += 1
    }
  }
  games(a: number, b: number): number {
    const i = a * T + b
    return this.w[i] + this.l[i] + this.t[i]
  }
  /** Win % (a tie counts half) of `team` against the teams `vs` accepts. */
  pct(team: number, vs: (o: number) => boolean): number {
    let p = 0
    let g = 0
    for (let o = 0; o < T; o++) {
      if (o === team || !vs(o)) continue
      const i = team * T + o
      p += this.w[i] + this.t[i] / 2
      g += this.w[i] + this.l[i] + this.t[i]
    }
    return g > 0 ? p / g : 0
  }
  record(team: number): { pct: number; w: number; l: number; t: number } {
    let w = 0
    let l = 0
    let t = 0
    for (let i = team * T; i < team * T + T; i++) {
      w += this.w[i]
      l += this.l[i]
      t += this.t[i]
    }
    const g = w + l + t
    return { pct: g > 0 ? (w + t / 2) / g : 0, w, l, t }
  }
}

/** The teams of `group` with the best value; the rest are out of this step. */
function best(group: number[], value: (t: number) => number): number[] {
  const values = group.map(value)
  const top = Math.max(...values)
  return group.filter((_, i) => values[i] >= top - 1e-9)
}

/**
 * Picks the winner of a tie (NFL procedure, approximated). Within a division: head-to-head among
 * the tied, division record, common games, conference record. Across divisions (wild cards,
 * seeds): head-to-head when every pair met, conference record, common games (four or more).
 * When a step separates some teams but not all, it starts over with the rest; then a coin flip.
 */
function breakTie(
  group: number[],
  table: Table,
  sameDivision: boolean,
  random: () => number
): number {
  if (group.length === 1) return group[0]
  const among = (t: number): number => table.pct(t, (o) => group.includes(o))
  const common = (t: number): number => {
    const opponents = TEAMS.map((_, o) => o).filter(
      (o) => !group.includes(o) && group.every((g) => table.games(g, o) > 0)
    )
    return table.pct(t, (o) => opponents.includes(o))
  }
  const enoughCommon = (): boolean => {
    let n = Infinity
    for (const g of group) {
      let c = 0
      for (let o = 0; o < T; o++) {
        if (!group.includes(o) && group.every((x) => table.games(x, o) > 0)) c += table.games(g, o)
      }
      n = Math.min(n, c)
    }
    return n >= 4
  }
  const metAll = group.every((a) => group.every((b) => a === b || table.games(a, b) > 0))
  const division = (t: number): number => table.pct(t, (o) => DIVISION_OF[o] === DIVISION_OF[t])
  const conference = (t: number): number => table.pct(t, (o) => conferenceOf(o) === conferenceOf(t))
  const strength = (t: number, beaten: boolean): number => {
    let p = 0
    let g = 0
    for (let o = 0; o < T; o++) {
      const n = beaten ? table.w[t * T + o] : table.games(t, o)
      if (n === 0) continue
      const r = table.record(o)
      p += n * (r.w + r.t / 2)
      g += n * (r.w + r.l + r.t)
    }
    return g > 0 ? p / g : 0
  }
  const victory = (t: number): number => strength(t, true)
  const schedule = (t: number): number => strength(t, false)
  // A step that does not apply reads as a tie; common games across divisions need four of them.
  const level = (): number => 0
  const steps: (() => (t: number) => number)[] = sameDivision
    ? [() => among, () => division, () => common, () => conference, () => victory, () => schedule]
    : [
        () => (metAll ? among : level),
        () => conference,
        () => (enoughCommon() ? common : level),
        () => victory,
        () => schedule
      ]
  for (const step of steps) {
    const left = best(group, step())
    if (left.length === 1) return left[0]
    if (left.length < group.length) return breakTie(left, table, sameDivision, random)
  }
  return group[Math.floor(random() * group.length)]
}

/** Orders teams best first by win %, ties broken one place at a time (the NFL's restart rule). */
function order(
  teams: number[],
  table: Table,
  sameDivision: boolean,
  random: () => number
): number[] {
  const pct = new Map(teams.map((t) => [t, table.record(t).pct]))
  const left = [...teams]
  const out: number[] = []
  while (left.length > 0) {
    const tied = best(left, (t) => pct.get(t)!)
    const pick = breakTie(tied, table, sameDivision, random)
    out.push(pick)
    left.splice(left.indexOf(pick), 1)
  }
  return out
}

/**
 * A conference's seeds: division winners first (seeded among themselves), then the wild cards.
 * Before a wild-card comparison, only each division's best remaining team takes part.
 */
function seedConference(
  conference: number,
  table: Table,
  playoffTeams: number,
  random: () => number
): { seeds: number[]; winners: number[] } {
  const divisions = [0, 1, 2, 3].map((d) => conference * 4 + d)
  const ranked = divisions.map((d) =>
    order(
      TEAMS.map((_, i) => i).filter((i) => DIVISION_OF[i] === d),
      table,
      true,
      random
    )
  )
  const winners = ranked.map((r) => r[0])
  const seeds = order(winners, table, false, random)
  const rest = ranked.map((r) => r.slice(1))
  while (seeds.length < playoffTeams) {
    const pct = (t: number): number => table.record(t).pct
    const heads = rest.filter((r) => r.length > 0).map((r) => r[0])
    // Each division's next team; the best record among them, then the tiebreakers.
    const top = best(heads, pct)
    const pick = breakTie(top, table, false, random)
    seeds.push(pick)
    const from = rest.find((r) => r[0] === pick)!
    from.shift()
  }
  return { seeds, winners }
}

/** Playoff teams per conference: 6 through 2019, 7 since. */
export const playoffTeamsOf = (season: number): number => (season <= 2019 ? 6 : 7)

/**
 * Plays the rest of the season `runs` times. A game is won with its Elo probability; the margin
 * (for the rating update) is drawn around the Elo spread. Returns each team's averages.
 */
export function simulateSeason(input: SimInput): TeamOdds[] {
  const runs = input.runs ?? SIM_RUNS
  const random = rng(input.seed ?? input.season)
  const fixed = new Table()
  for (const g of input.games) {
    const home = INDEX.get(g.home)
    const away = INDEX.get(g.away)
    if (home !== undefined && away !== undefined && g.result !== null)
      fixed.add(home, away, g.result)
  }
  const left = input.games
    .filter((g) => g.result === null && INDEX.has(g.home) && INDEX.has(g.away))
    .sort((a, b) => a.week - b.week)
    .map((g) => ({ home: INDEX.get(g.home)!, away: INDEX.get(g.away)!, homeField: g.homeField }))
  const start = new Float64Array(T)
  TEAMS.forEach((t, i) => (start[i] = input.ratings.get(t) ?? ELO.base))
  const seedsPer = playoffTeamsOf(input.season)
  const byes = input.season <= 2019 ? 2 : 1
  const sum = {
    wins: new Float64Array(T),
    losses: new Float64Array(T),
    ties: new Float64Array(T),
    playoffs: new Float64Array(T),
    division: new Float64Array(T),
    bye: new Float64Array(T),
    conference: new Float64Array(T),
    superBowl: new Float64Array(T)
  }
  const table = new Table()
  const elo = new Float64Array(T)
  // Box–Muller gives two normals at a time; the second is kept for the next margin.
  let spare: number | null = null
  const normal = (): number => {
    if (spare !== null) {
      const z = spare
      spare = null
      return z
    }
    const r = Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12)))
    const a = 2 * Math.PI * random()
    spare = r * Math.sin(a)
    return r * Math.cos(a)
  }
  /** A margin around the Elo spread, at least a point. */
  const margin = (diff: number): number =>
    Math.max(1, Math.abs(Math.round(diff / ELO.perPoint + MARGIN_SD * normal())))
  const play = (home: number, away: number, homeField: number): number => {
    const diff = elo[home] + homeField - elo[away]
    const p = winProbability(diff)
    const result = random() < p ? margin(diff) : -margin(diff)
    const shift = eloShift(diff, result, p)
    elo[home] += shift
    elo[away] -= shift
    return result
  }
  for (let run = 0; run < runs; run++) {
    table.copy(fixed)
    elo.set(start)
    for (const g of left) table.add(g.home, g.away, play(g.home, g.away, g.homeField))
    for (let i = 0; i < T; i++) {
      const r = table.record(i)
      sum.wins[i] += r.w
      sum.losses[i] += r.l
      sum.ties[i] += r.t
    }
    const champions: number[] = []
    for (const conf of [0, 1]) {
      const { seeds, winners } = seedConference(conf, table, seedsPer, random)
      for (const w of winners) sum.division[w] += 1
      for (const s of seeds) sum.playoffs[s] += 1
      for (const s of seeds.slice(0, byes)) sum.bye[s] += 1
      // Wild card round: the bye seeds rest; then the best seed left hosts the worst.
      let alive = seeds.map((team, i) => ({ team, seed: i + 1 }))
      while (alive.length > 1) {
        const resting = alive.length === seedsPer ? alive.slice(0, byes) : []
        const playing = alive.slice(resting.length)
        const next = [...resting]
        for (let i = 0; i < playing.length / 2; i++) {
          const hi = playing[i]
          const lo = playing[playing.length - 1 - i]
          next.push(play(hi.team, lo.team, ELO.homeField) > 0 ? hi : lo)
        }
        alive = next.sort((a, b) => a.seed - b.seed)
      }
      sum.conference[alive[0].team] += 1
      champions.push(alive[0].team)
    }
    sum.superBowl[play(champions[0], champions[1], 0) > 0 ? champions[0] : champions[1]] += 1
  }
  return TEAMS.map((team, i) => ({
    team,
    wins: sum.wins[i] / runs,
    losses: sum.losses[i] / runs,
    ties: sum.ties[i] / runs,
    playoffs: sum.playoffs[i] / runs,
    division: sum.division[i] / runs,
    bye: sum.bye[i] / runs,
    conference: sum.conference[i] / runs,
    superBowl: sum.superBowl[i] / runs
  }))
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/main/stats/models
```

Expected: PASS (13 passed).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/stats/models/simulate.ts tests/main/stats/models/simulate.test.ts
git add src/main/stats/models/simulate.ts tests/main/stats/models/simulate.test.ts
git commit -m "feat(stats): simulate the season"
```

---

### Task 4: Adjusted EPA and the FG make model (spec §8.2, §8.4; amendments E, G)

**Files:**

- Create: `src/main/stats/models/adjusted.ts`, `src/main/stats/models/fieldGoal.ts`, `tests/main/stats/models/adjusted.test.ts`, `tests/main/stats/models/fieldGoal.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/stats/models/adjusted.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { fitAdjusted, recencyWeight, type EpaCell } from '@main/stats/models/adjusted'

const TEAMS = ['A', 'B', 'C', 'D']
/** Every offense against every defense, at home and away, with EPA/play = 0.05 + off + def ± home. */
function league(
  off: Record<string, number>,
  def: Record<string, number>,
  home: number,
  plays = 1000
): EpaCell[] {
  const cells: EpaCell[] = []
  for (const o of TEAMS) {
    for (const d of TEAMS) {
      if (o === d) continue
      for (const h of [1, -1]) {
        cells.push({
          off: o,
          def: d,
          home: h,
          week: 1,
          plays,
          epa: plays * (0.05 + off[o] + def[d] + home * h)
        })
      }
    }
  }
  return cells
}

describe('opponent-adjusted EPA (stats-analysis spec §8.2)', () => {
  it('separates offense, defense and home field', () => {
    const off = { A: 0.1, B: 0, C: -0.05, D: -0.05 }
    const def = { A: -0.08, B: 0.02, C: 0.03, D: 0.03 }
    const fit = fitAdjusted(league(off, def, 0.02), TEAMS, { lambda: 1e-6 })
    expect(fit.home).toBeCloseTo(0.02, 6)
    // Effects are identified up to the mean: compare differences.
    expect(fit.off.get('A')! - fit.off.get('B')!).toBeCloseTo(0.1, 6)
    expect(fit.def.get('C')! - fit.def.get('A')!).toBeCloseTo(0.11, 6)
    expect(fit.mean + fit.off.get('A')! + fit.def.get('B')!).toBeCloseTo(0.05 + 0.1 + 0.02, 6)
  })

  it('credits a defense for the offenses it faced', () => {
    // B's defense allows 0.10 only because it faced A's great offense; C allows 0.05 to D's.
    const cells: EpaCell[] = [
      { off: 'A', def: 'B', home: 0, week: 1, plays: 500, epa: 50 },
      { off: 'A', def: 'C', home: 0, week: 1, plays: 500, epa: 100 },
      { off: 'D', def: 'B', home: 0, week: 1, plays: 500, epa: -25 },
      { off: 'D', def: 'C', home: 0, week: 1, plays: 500, epa: 25 }
    ]
    const fit = fitAdjusted(cells, TEAMS, { lambda: 1e-6 })
    expect(fit.def.get('B')!).toBeLessThan(fit.def.get('C')!)
  })

  it('shrinks a team with few plays toward the mean', () => {
    const cells: EpaCell[] = [{ off: 'A', def: 'B', home: 0, week: 1, plays: 20, epa: 10 }]
    const strong = fitAdjusted(cells, TEAMS, { lambda: 1e-6 })
    const ridge = fitAdjusted(cells, TEAMS, { lambda: 300 })
    expect(Math.abs(ridge.off.get('A')!)).toBeLessThan(Math.abs(strong.off.get('A')!))
    expect(ridge.off.get('C')).toBe(0)
  })

  it('halves a week every four weeks back', () => {
    expect(recencyWeight(9)(9)).toBe(1)
    expect(recencyWeight(9)(5)).toBe(0.5)
    expect(recencyWeight(9)(1)).toBe(0.25)
  })
})
```

Create `tests/main/stats/models/fieldGoal.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  calibration,
  fgFeatures,
  fgProbability,
  fitFieldGoals,
  hosmerLemeshow,
  type FieldGoalAttempt
} from '@main/stats/models/fieldGoal'
import { rng } from '@main/stats/models/linear'

const kick = (o: Partial<FieldGoalAttempt>): FieldGoalAttempt => ({
  game_id: 'g',
  play_id: 1,
  season: 2024,
  distance: 40,
  made: true,
  roof: 'outdoors',
  surface: 'grass',
  temp: 60,
  wind: 5,
  ...o
})

/** Synthetic kicks: the make probability falls with distance and wind. */
function kicks(n: number, seed: number, season = 2024): FieldGoalAttempt[] {
  const random = rng(seed)
  return Array.from({ length: n }, (_, i) => {
    const distance = 20 + Math.floor(random() * 40)
    const wind = Math.floor(random() * 20)
    const p = 1 / (1 + Math.exp(-(6 - 0.11 * distance - 0.03 * wind)))
    return kick({ play_id: i, season, distance, wind, made: random() < p })
  })
}

describe('field-goal make probability (stats-analysis spec §8.4)', () => {
  it('reads indoor kicks without wind or cold', () => {
    const dome = fgFeatures(kick({ roof: 'dome', wind: 30, temp: 10 }))
    const calm = fgFeatures(kick({ roof: 'closed', wind: 0, temp: 70 }))
    expect(dome).toEqual(calm)
    // Missing outdoor weather reads as the average.
    expect(fgFeatures(kick({ wind: null, temp: null }))).toEqual(
      fgFeatures(kick({ wind: 8, temp: 58 }))
    )
  })

  it('fits longer and windier kicks as harder, and is calibrated on new kicks', () => {
    const beta = fitFieldGoals(kicks(20_000, 1))
    expect(fgProbability(kick({ distance: 25 }), beta)).toBeGreaterThan(
      fgProbability(kick({ distance: 50 }), beta)
    )
    expect(fgProbability(kick({ wind: 20 }), beta)).toBeLessThan(
      fgProbability(kick({ wind: 0 }), beta)
    )
    const held = calibration(kicks(5_000, 2, 2025), beta)
    expect(held.map((b) => b.from)).toEqual([20, 25, 30, 35, 40, 45, 50, 55])
    const { chi2, critical } = hosmerLemeshow(held)
    expect(critical).toBe(15.507)
    expect(chi2).toBeLessThan(critical)
  })

  it('weighs recent seasons more', () => {
    // 2019 kickers miss everything from 50; 2024 kickers make everything: the fit leans to 2024.
    const old = Array.from({ length: 400 }, (_, i) =>
      kick({ play_id: i, season: 2019, distance: i % 2 ? 50 : 30, made: i % 2 === 0 })
    )
    const recent = Array.from({ length: 400 }, (_, i) =>
      kick({ play_id: i, season: 2024, distance: i % 2 ? 50 : 30, made: true })
    )
    const beta = fitFieldGoals([...old, ...recent])
    expect(fgProbability(kick({ distance: 50 }), beta)).toBeGreaterThan(0.8)
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/main/stats/models/adjusted.test.ts tests/main/stats/models/fieldGoal.test.ts
```

Expected: FAIL, the modules do not exist.

- [ ] **Step 3: The ridge regression and the logistic FG model**

Create `src/main/stats/models/adjusted.ts`:

```ts
import { solve } from './linear'

/**
 * Opponent-adjusted EPA (stats-analysis spec §8.2): a ridge regression of play EPA on an offense
 * effect, a defense effect and home field. Plays are summed into cells (offense × defense × home ×
 * week) first, which gives the same normal equations as one row per play.
 */

export interface EpaCell {
  off: string
  def: string
  /** +1 when the offense is at home, −1 away, 0 at a neutral site. */
  home: number
  week: number
  plays: number
  epa: number
}

export interface AdjustedFit {
  /** League EPA per play at a neutral site against an average opponent. */
  mean: number
  /** EPA per play the home offense gains (and the away offense loses). */
  home: number
  /** Team effects; adjusted EPA/play is `mean + effect`. */
  off: Map<string, number>
  def: Map<string, number>
}

/** Prior strength of a team effect, in plays: chosen by predicting the next week (Plan Z findings). */
export const RIDGE_PLAYS = 300
/** The recency-weighted fit halves a week's weight every 4 weeks (spec §8.2). */
export const RECENCY_HALF_LIFE = 4

/**
 * Fits the effects on the cells. `weight(week)` scales a cell (the recency-weighted version);
 * `lambda` shrinks each team effect toward 0, so a team with few plays sits near the mean.
 */
export function fitAdjusted(
  cells: EpaCell[],
  teams: string[],
  {
    lambda = RIDGE_PLAYS,
    weight = () => 1
  }: { lambda?: number; weight?: (week: number) => number } = {}
): AdjustedFit {
  const t = teams.length
  const n = 2 + 2 * t
  const index = new Map(teams.map((team, i) => [team, i]))
  const a = new Float64Array(n * n)
  const b = new Float64Array(n)
  for (const c of cells) {
    const o = index.get(c.off)
    const d = index.get(c.def)
    if (o === undefined || d === undefined || c.plays <= 0) continue
    const w = weight(c.week)
    const cols: [number, number][] = [
      [0, 1],
      [1, c.home],
      [2 + o, 1],
      [2 + t + d, 1]
    ]
    const wn = w * c.plays
    for (const [i, xi] of cols) {
      b[i] += w * c.epa * xi
      for (const [j, xj] of cols) a[i * n + j] += wn * xi * xj
    }
  }
  for (let i = 2; i < n; i++) a[i * n + i] += lambda
  // No plays yet (before week 1): the mean and home field are 0.
  a[0] += 1e-9
  a[n + 1] += 1e-9
  const x = solve(a, b, n)
  return {
    mean: x[0],
    home: x[1],
    off: new Map(teams.map((team, i) => [team, x[2 + i]])),
    def: new Map(teams.map((team, i) => [team, x[2 + t + i]]))
  }
}

/** The weight of week `week` as of week `asOf`: half every `RECENCY_HALF_LIFE` weeks. */
export const recencyWeight =
  (asOf: number) =>
  (week: number): number =>
    0.5 ** ((asOf - week) / RECENCY_HALF_LIFE)
```

Create `src/main/stats/models/fieldGoal.ts`:

```ts
import { logisticFit, logisticPredict } from './linear'

/**
 * Field-goal make probability (stats-analysis spec §8.4): a logistic regression on distance (a
 * linear spline with a knot every 5 yards from 25 to 55), the roof, cold, wind (and wind ×
 * distance) and grass, fitted on every attempt from 2019 to the prior season. Kickers get better
 * from long range year after year, so a season counts half as much as the one two seasons after
 * it. FG over expected = makes − Σ p.
 */

export interface FieldGoalAttempt {
  game_id: string
  play_id: number
  season: number
  distance: number
  made: boolean
  /** `dome` / `closed` count as indoors. */
  roof: string | null
  surface: string | null
  temp: number | null
  wind: number | null
}

/** Outdoor weather the schedule does not record reads as the 2019–2025 outdoor average. */
const MEAN_TEMP = 58
const MEAN_WIND = 8

/** A season's weight halves every this many seasons back from the latest one fitted. */
export const FG_HALF_LIFE = 2
const KNOTS = [25, 30, 35, 40, 45, 50, 55]

export const FG_FEATURES = [
  'intercept',
  'distance',
  ...KNOTS.map((k) => `beyond${k}`),
  'indoors',
  'cold',
  'wind',
  'windDistance',
  'grass'
] as const

const indoorsOf = (roof: string | null): boolean => roof === 'dome' || roof === 'closed'

/** One attempt's features, scaled to about one unit (tens of yards, degrees and mph). */
export function fgFeatures(
  a: Omit<FieldGoalAttempt, 'game_id' | 'play_id' | 'season' | 'made'>
): number[] {
  const d = a.distance
  const indoors = indoorsOf(a.roof)
  const temp = indoors ? MEAN_TEMP : (a.temp ?? MEAN_TEMP)
  const wind = indoors ? 0 : (a.wind ?? MEAN_WIND)
  return [
    1,
    (d - 35) / 10,
    ...KNOTS.map((k) => Math.max(0, d - k) / 10),
    indoors ? 1 : 0,
    Math.max(0, 50 - temp) / 10,
    wind / 10,
    ((wind / 10) * (d - 35)) / 10,
    (a.surface ?? '').trim() === 'grass' ? 1 : 0
  ]
}

/** Fits the coefficients on the attempts given (spec: 2019 to the prior season). */
export function fitFieldGoals(attempts: FieldGoalAttempt[]): number[] {
  const latest = Math.max(...attempts.map((a) => a.season))
  return logisticFit(
    attempts.map(fgFeatures),
    attempts.map((a) => (a.made ? 1 : 0)),
    { weights: attempts.map((a) => 0.5 ** ((latest - a.season) / FG_HALF_LIFE)) }
  )
}

export const fgProbability = (a: Parameters<typeof fgFeatures>[0], beta: number[]): number =>
  logisticPredict(fgFeatures(a), beta)

export interface CalibrationBucket {
  /** The bucket's shortest distance: 18–19 count with 20–24. */
  from: number
  attempts: number
  made: number
  expected: number
  /** Made % minus expected %, in percentage points. */
  gap: number
  /** The gap in standard errors of a calibrated model's makes. */
  z: number
}

/** Spec §8.4 gate: made vs expected by 5-yard bucket (under 25 and 55+ pooled). */
export function calibration(attempts: FieldGoalAttempt[], beta: number[]): CalibrationBucket[] {
  const buckets = new Map<number, Omit<CalibrationBucket, 'gap' | 'z'> & { v: number }>()
  for (const a of attempts) {
    const from = Math.min(55, Math.max(20, Math.floor(a.distance / 5) * 5))
    const b = buckets.get(from) ?? { from, attempts: 0, made: 0, expected: 0, v: 0 }
    const p = fgProbability(a, beta)
    b.attempts += 1
    b.made += a.made ? 1 : 0
    b.expected += p
    b.v += p * (1 - p)
    buckets.set(from, b)
  }
  return [...buckets.values()]
    .sort((x, y) => x.from - y.from)
    .map(({ v, ...b }) => ({
      ...b,
      gap: (100 * (b.made - b.expected)) / b.attempts,
      z: v > 0 ? (b.made - b.expected) / Math.sqrt(v) : 0
    }))
}

/**
 * The calibration gate (amendment): a one-season bucket's gap carries 2–9 points of noise, so the
 * buckets are tested together. Hosmer–Lemeshow: Σ z² over the buckets is χ² with as many degrees
 * of freedom; it passes at p ≥ 0.05. Returns the statistic and its 5 % critical value.
 */
export function hosmerLemeshow(buckets: CalibrationBucket[]): { chi2: number; critical: number } {
  const chi2 = buckets.reduce((s, b) => s + b.z * b.z, 0)
  return { chi2, critical: CHI2_95[buckets.length] ?? Infinity }
}

/** χ² 95th percentiles by degrees of freedom. */
const CHI2_95: Record<number, number> = {
  1: 3.841,
  2: 5.991,
  3: 7.815,
  4: 9.488,
  5: 11.07,
  6: 12.592,
  7: 14.067,
  8: 15.507,
  9: 16.919,
  10: 18.307
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/main/stats/models
```

Expected: PASS (20 passed).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/stats/models/adjusted.ts src/main/stats/models/fieldGoal.ts tests/main/stats/models/adjusted.test.ts tests/main/stats/models/fieldGoal.test.ts
git add src/main/stats/models/adjusted.ts src/main/stats/models/fieldGoal.ts tests/main/stats/models/adjusted.test.ts tests/main/stats/models/fieldGoal.test.ts
git commit -m "feat(stats): adjusted EPA and FG make model"
```

---

### Task 5: Model metrics in the engine (spec §6, §7; amendments B, H, K, M)

The catalogue reads the model tables Task 7 builds: `{last:x}` states, model sums and weekly quantiles. The transforms `shrunk` and `opponentAdjusted` arrive, and an internal option that Task 6's stability uses (no row cap, odd / even halves). The tests seed the model rows they need.

**Files:**

- Create: `src/main/stats/models/columns.ts`, `tests/main/stats/engine/models.test.ts`
- Modify: `src/main/stats/engine/registry.ts`, `src/main/stats/engine/compile.ts`, `src/shared/stats/types.ts`, `src/shared/stats/catalogue.ts`, `src/shared/stats/querySchema.ts`, `tests/shared/stats/catalogue.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/stats/engine/models.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { compileQuery, StatsQueryError } from '@main/stats/engine/compile'
import { runQuery } from '@main/stats/engine/run'
import { openTestDb } from '../../../fixtures/stats'
import { seedGame, seedTable, WR } from '../../../fixtures/statsDerived'

const CTX = { currentSeason: 2025, hasLeague: false }

async function seeded(): Promise<Awaited<ReturnType<typeof openTestDb>>> {
  const db = await openTestDb()
  await seedGame(db)
  await rebuildDerived(db, { seasons: 'all', league: null })
  return db
}

describe('model metrics in the query engine (stats-analysis spec §7, §8)', () => {
  it('reads a team state at the end of the scope', async () => {
    const db = await seeded()
    // Every week has a row, byes included (week 2 is BUF's bye); the postseason has no odds.
    const row = (
      team: string,
      week: number,
      elo: number,
      odds: number | null
    ): Record<string, string | number | null> => ({
      team,
      season: 2025,
      season_type: week > 18 ? 'POST' : 'REG',
      week,
      elo,
      playoff_pct: odds
    })
    await seedTable(db, 'team_model_week', [
      row('BUF', 0, 1500, 0.5),
      row('BUF', 1, 1520, 0.6),
      row('BUF', 2, 1520, 0.7),
      row('BUF', 19, 1540, null),
      row('KC', 0, 1500, 0.5),
      row('KC', 1, 1480, 0.4),
      row('KC', 2, 1470, 0.3)
    ])
    const at = async (
      scope: Record<string, unknown>,
      groupBy?: ('week' | 'season')[]
    ): Promise<[string, unknown, number | null, number | null][]> =>
      (
        await runQuery(
          db,
          {
            entity: 'team',
            metrics: ['elo', 'playoff_pct'],
            scope: { seasons: [2025], ...scope },
            groupBy
          },
          CTX
        )
      ).rows.map((x) => [
        x.id,
        x.group.week ?? null,
        x.values.elo.value,
        x.values.playoff_pct.value
      ])
    // The regular season ends at week 2, after BUF's bye.
    expect(await at({})).toEqual([
      ['BUF', null, 1520, 0.7],
      ['KC', null, 1470, 0.3]
    ])
    expect(await at({ weeks: [1, 1] })).toEqual([
      ['BUF', null, 1520, 0.6],
      ['KC', null, 1480, 0.4]
    ])
    // With the postseason, the rating moves on and the odds stay the last ones there were.
    expect((await at({ seasonType: 'ALL' }))[0]).toEqual(['BUF', null, 1540, 0.7])
    // By week: each played week's state (a team's rows are its games).
    expect(await at({ teams: ['KC'] }, ['week'])).toEqual([['KC', 1, 1480, 0.4]])
  })

  it('computes weekly quantiles and boom weeks from weekly rows', async () => {
    const db = await seeded()
    const r = await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['fp_ceiling', 'boom_rate'],
        scope: { seasons: [2025], players: [WR] }
      },
      CTX
    )
    // A weekly quantile needs one row per game: the engine reads the weekly table.
    expect(r.grain).toBe('week')
    // One PPR week: 1 + 2 = 3 points, the best (and only) WR line that week.
    expect(r.rows[0].values.fp_ceiling.value).toBeCloseTo(3, 6)
    expect(r.rows[0].values.boom_rate.value).toBe(1)
  })

  it('shrinks a rate toward the qualified mean by its stability prior', async () => {
    const db = await seeded()
    const r = await runQuery(
      db,
      { entity: 'team', metrics: ['win_pct'], scope: { seasons: [2025] }, transform: 'shrunk' },
      { ...CTX, priors: new Map([['win_pct', 3]]) }
    )
    const value = (team: string): number | null =>
      r.rows.find((x) => x.id === team)!.values.win_pct.value
    // BUF 1–0, KC 0–1, the mean 0.5: (1 × 1 + 3 × 0.5) / 4 and (0 + 1.5) / 4.
    expect(value('BUF')).toBeCloseTo(0.625, 9)
    expect(value('KC')).toBeCloseTo(0.375, 9)
    const none = await runQuery(
      db,
      { entity: 'team', metrics: ['win_pct'], scope: { seasons: [2025] }, transform: 'shrunk' },
      CTX
    )
    expect(none.notes).toEqual(['Win %: not shrunk (no stability estimate).'])
  })

  it('adjusts for the opponents faced', async () => {
    const db = await seeded()
    const q = { entity: 'team' as const, metrics: ['off_epa_play'], scope: { seasons: [2025] } }
    const raw = await runQuery(db, q, CTX)
    const adjusted = await runQuery(db, { ...q, transform: 'opponentAdjusted' }, CTX)
    expect(adjusted.grain).toBe('week')
    // One game: each offense is exactly what its opponent allowed, so both adjust to the league.
    const v = (r: typeof raw, team: string): number =>
      r.rows.find((x) => x.id === team)!.values.off_epa_play.value!
    const league = (v(raw, 'BUF') * 4 + v(raw, 'KC') * 1) / 5
    expect(v(adjusted, 'BUF')).toBeCloseTo(league, 9)
    expect(v(adjusted, 'KC')).toBeCloseTo(league, 9)
    await expect(
      runQuery(db, { ...q, transform: 'opponentAdjusted', situation: { down: [1] } }, CTX)
    ).rejects.toThrow(StatsQueryError)
  })

  it('splits rows into odd and even weeks for the stability model only', async () => {
    const db = await seeded()
    const compiled = compileQuery(
      { entity: 'team', metrics: ['win_pct'], scope: { seasons: [2025] }, groupBy: ['season'] },
      { ...CTX, internal: { unlimited: true, halves: true } }
    )
    const rows = await db.all<{ id: string; g_half: number }>(
      compiled.sql.replaceAll('$factor', '0.5'),
      compiled.params
    )
    expect(rows.map((r) => [r.id, r.g_half]).sort()).toEqual([
      ['BUF', 1],
      ['KC', 1]
    ])
    expect(compiled.sql).not.toContain('LIMIT')
  })
})
```

```diff
diff --git a/tests/shared/stats/catalogue.test.ts b/tests/shared/stats/catalogue.test.ts
index 1b1cbbf..f12c6c4 100644
--- a/tests/shared/stats/catalogue.test.ts
+++ b/tests/shared/stats/catalogue.test.ts
@@ -12,9 +12,12 @@ describe('the metric catalogue (stats-analysis spec §6)', () => {
     expect(CATALOGUE.filter((m) => m.entity === 'team').length).toBeGreaterThan(60)
   })

-  it('computes every metric from components the derived tables hold', () => {
-    const missing = CATALOGUE.filter((m) => !grainsOf(m).includes('season')).map((m) => m.id)
+  it('computes every metric from components the derived and model tables hold', () => {
+    const missing = CATALOGUE.filter((m) => !grainsOf(m).includes('week')).map((m) => m.id)
     expect(missing).toEqual([])
+    // Weekly quantiles need one row per game; every other metric also has a season grain.
+    const weekly = CATALOGUE.filter((m) => !grainsOf(m).includes('season')).map((m) => m.id)
+    expect(weekly).toEqual(['fp_ceiling', 'fp_floor'])
   })

   it('splits by situation exactly the metrics that come from plays', () => {
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/main/stats/engine/models.test.ts tests/shared/stats
```

Expected: FAIL: unknown metrics (`elo`, `fp_ceiling`), unknown transforms (`shrunk`, `opponentAdjusted`).

- [ ] **Step 3: The model columns**

Create `src/main/stats/models/columns.ts`:

```ts
/**
 * The model columns the query engine reads (stats-analysis spec §8): sums over a team's (player's)
 * weeks, and states at the end of a week. `build.ts` writes them; `engine/registry.ts` serves them.
 */

const KINDS = ['', '_pass', '_rush']

/** `adj_[recent_]{off,def}[_pass|_rush]_epa`: adjusted EPA per play (spec §8.2). */
export const ADJUSTED_STATES = KINDS.flatMap((kind) =>
  ['', 'recent_'].flatMap((r) => ['off', 'def'].map((side) => `adj_${r}${side}${kind}_epa`))
)

/** A team's state at the end of a week: ratings, schedule strength, the season simulation. */
export const TEAM_STATES = [
  'elo',
  'srs',
  'mov',
  ...ADJUSTED_STATES,
  'sos_elo',
  'sos_adj',
  'sos_left_elo',
  'sos_left_adj',
  'games_left',
  'proj_wins',
  'proj_losses',
  'proj_ties',
  'playoff_pct',
  'division_pct',
  'bye_pct',
  'conference_pct',
  'sb_pct'
] as const

/** Turnover luck components (spec §8.3), summed over the team's games. */
export const TURNOVER_SUMS = [
  'off_fumbles',
  'off_fumbles_lost',
  'def_fumbles',
  'def_fumbles_lost',
  'off_ftn_att',
  'off_ftn_ints',
  'off_xints',
  'def_ftn_ints',
  'def_xints'
] as const

/** Field goals the FG model rated (spec §8.4): attempts, makes and expected makes. */
export const FG_SUMS = ['fg_model_att', 'fg_model_made', 'fg_xmade'] as const

/** Sums over a team's games: Elo and Vegas expected wins, pre-game ratings, kicking, turnovers. */
export const TEAM_MODEL_SUMS = [
  'elo_games',
  'elo_wp',
  'vegas_games',
  'vegas_wp',
  'elo_pre',
  'opp_elo_pre',
  ...FG_SUMS,
  ...TURNOVER_SUMS
] as const

export const PLAYER_MODEL_SUMS = [...FG_SUMS] as const

/** A player's combine profile (spec §8.7): one row per player, the same in every season. */
export const COMBINE = [
  'height',
  'weight',
  'forty',
  'bench',
  'vertical',
  'broad_jump',
  'cone',
  'shuttle'
] as const
export const PLAYER_STATES = [
  ...COMBINE,
  ...COMBINE.map((m) => `${m}_score`),
  'ras',
  'ras_measures',
  'speed_score'
] as const
```

- [ ] **Step 4: Types, tokens, transforms and the schema**

```diff
diff --git a/src/shared/stats/types.ts b/src/shared/stats/types.ts
index 4bac759..c3eedf7 100644
--- a/src/shared/stats/types.ts
+++ b/src/shared/stats/types.ts
@@ -20,10 +20,12 @@ export type MetricUnit =

 /**
  * One catalogue entry (spec §6.1). `value` is SQL over component sums: each `{name}` is the sum of
- * that component over the rows in scope (a column of `player_week` / `team_week`, or `fp` / `xfp`
- * / `fpa_*` under the chosen scoring). `sample` names the component that measures the sample and
- * qualifies a row (`minSample` per 17 games). Descriptions are written for a person and for an
- * LLM (spec §10).
+ * that component over the rows in scope (a column of `player_week` / `team_week`, `fp` / `xfp` /
+ * `fpa_*` under the chosen scoring, or a model sum of `team_model_week` / `player_model_week`).
+ * `{last:name}` is a model state at the end of the scope (a team's Elo, adjusted EPA, playoff odds;
+ * a player's combine profile), and `{p80:fp}` / `{p20:fp}` the 80th / 20th percentile of the weekly
+ * fantasy points in scope. `sample` names the component that measures the sample and qualifies a
+ * row (`minSample` per 17 games). Descriptions are written for a person and for an LLM (spec §10).
  */
 export interface MetricDef {
   id: string
@@ -56,9 +58,28 @@ export interface MetricDef {
   scoring?: boolean
 }

+/** How much a metric carries over (spec §8.6), measured on 2019 to the prior season. */
+export interface MetricStability {
+  /** Pearson r between a player's (team's) qualified seasons, one season to the next. */
+  yearToYear: number | null
+  /** Season pairs behind it. */
+  pairs: number
+  /** Correlation of odd and even weeks of a qualified season (within-season reliability). */
+  splitHalf: number | null
+  /**
+   * The sample at which half of a rate is signal (Spearman–Brown from the split halves): the
+   * `shrunk` transform weighs the league mean as this much sample.
+   */
+  prior: number | null
+  /** From the year-to-year r: high ≥ 0.6, medium ≥ 0.35, low below. */
+  reliability: 'high' | 'medium' | 'low' | null
+}
+
 /** A catalogue entry as the engine serves it: the formula left out, where it can be computed added. */
 export interface MetricInfo extends Omit<MetricDef, 'value' | 'sample'> {
   grains: Grain[]
+  /** Null until the models have run, or for a metric without enough seasons. */
+  stability: MetricStability | null
 }

 export type GroupBy =
@@ -72,8 +93,12 @@ export type GroupBy =
   | 'coverage'
   | 'formation'

-/** `shrunk` and `opponentAdjusted` (spec §7.1) arrive with the models of Plan Z. */
-export type Transform = 'raw' | 'perGame' | 'percentile' | 'zScore' | 'vsLeague'
+/**
+ * Spec §7.1. `shrunk` pulls a rate toward its league mean by its sample (spec §8.5);
+ * `opponentAdjusted` subtracts how far the opponents faced allow more or less than average.
+ */
+export type Transform =
+  'raw' | 'perGame' | 'percentile' | 'zScore' | 'vsLeague' | 'shrunk' | 'opponentAdjusted'

 /** Stats-analysis spec §7.1: every leaderboard, card, chart and comparison is one of these. */
 export interface StatsQuery {
```

```diff
diff --git a/src/shared/stats/querySchema.ts b/src/shared/stats/querySchema.ts
index a95709b..8362c72 100644
--- a/src/shared/stats/querySchema.ts
+++ b/src/shared/stats/querySchema.ts
@@ -23,7 +23,9 @@ const TRANSFORMS: Record<Transform, true> = {
   perGame: true,
   percentile: true,
   zScore: true,
-  vsLeague: true
+  vsLeague: true,
+  shrunk: true,
+  opponentAdjusted: true
 }

 type Schema = Record<string, unknown>
@@ -105,7 +107,11 @@ export function statsQuerySchema(metricIds: string[]): Schema {
       description: 'Play-level filters; only metrics computed from plays accept them.'
     },
     groupBy: list({ enum: Object.keys(GROUP_BY) }, 'Split rows by these.'),
-    transform: { enum: Object.keys(TRANSFORMS) },
+    transform: {
+      enum: Object.keys(TRANSFORMS),
+      description:
+        'raw values; perGame (counts per game); percentile; zScore or vsLeague (against the qualified rows); shrunk (rates pulled toward the league mean by their sample); opponentAdjusted (minus how much more than average the opponents faced allow).'
+    },
     sort: {
       type: 'object',
       properties: { metric: { enum: metricIds }, dir: { enum: ['asc', 'desc'] } },
```

- [ ] **Step 5: The registry and the compiler**

```diff
diff --git a/src/main/stats/engine/registry.ts b/src/main/stats/engine/registry.ts
index cf15194..a81a306 100644
--- a/src/main/stats/engine/registry.ts
+++ b/src/main/stats/engine/registry.ts
@@ -1,12 +1,26 @@
 import { CATALOGUE, componentsOf } from '@shared/stats/catalogue'
-import type { Entity, Grain, MetricDef, MetricInfo } from '@shared/stats/types'
+import type { Entity, Grain, MetricDef, MetricInfo, MetricStability } from '@shared/stats/types'
 import { BOX_COMPONENTS, playerComponentNames } from '../derived/player'
 import { PLAYER_PLAY_COMPONENTS, TEAM_PLAY_COMPONENTS } from '../derived/plays'
 import { TEAM_BOX_COMPONENTS, teamComponentNames } from '../derived/team'
+import { PLAYER_MODEL_SUMS, PLAYER_STATES, TEAM_MODEL_SUMS, TEAM_STATES } from '../models/columns'

 /** Fantasy components, joined from `fantasy_week` / `team_fantasy_week` under the chosen scoring. */
-export const PLAYER_FANTASY = ['fp', 'xfp']
+export const PLAYER_FANTASY = ['fp', 'xfp', 'boom', 'bust']
 export const TEAM_FANTASY = ['fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te', 'fpa_k']
+/** Weekly quantiles of the fantasy points (spec §8.5 ceiling and floor): weekly rows only. */
+export const QUANTILES: Record<string, number> = { 'p80:fp': 0.8, 'p20:fp': 0.2 }
+
+/** Model sums, joined like the fantasy components, by entity. */
+export const MODEL_SUMS: Record<Entity, readonly string[]> = {
+  player: PLAYER_MODEL_SUMS,
+  team: TEAM_MODEL_SUMS
+}
+/** Model states (`{last:name}`), by entity. */
+export const STATES: Record<Entity, readonly string[]> = {
+  player: PLAYER_STATES,
+  team: TEAM_STATES
+}

 /**
  * Components that count something every game has a record of (play-by-play, the box score): a
@@ -32,11 +46,22 @@ export const ZERO_WHEN_MISSING: Record<Entity, ReadonlySet<string>> = {
 /** The components each grain can sum, by entity (spec §7.2: the grain decides the tables). */
 export const COMPONENTS: Record<Entity, Record<'table' | 'play', ReadonlySet<string>>> = {
   player: {
-    table: new Set([...playerComponentNames(), ...PLAYER_FANTASY]),
+    table: new Set([
+      ...playerComponentNames(),
+      ...PLAYER_FANTASY,
+      ...PLAYER_MODEL_SUMS,
+      ...PLAYER_STATES.map((s) => `last:${s}`),
+      ...Object.keys(QUANTILES)
+    ]),
     play: new Set([...PLAYER_PLAY_COMPONENTS.map((c) => c.name), 'games'])
   },
   team: {
-    table: new Set([...teamComponentNames(), ...TEAM_FANTASY]),
+    table: new Set([
+      ...teamComponentNames(),
+      ...TEAM_FANTASY,
+      ...TEAM_MODEL_SUMS,
+      ...TEAM_STATES.map((s) => `last:${s}`)
+    ]),
     play: new Set([
       ...TEAM_PLAY_COMPONENTS.flatMap((c) => [`off_${c.name}`, `def_${c.name}`]),
       'games'
@@ -45,24 +70,37 @@ export const COMPONENTS: Record<Entity, Record<'table' | 'play', ReadonlySet<str
 }

 /**
- * Where a metric can be computed: week and season from the derived tables; play when every
- * component comes from plays (and it does not depend on the scoring).
+ * Where a metric can be computed: week and season from the derived tables (weekly quantiles at the
+ * week grain only); play when every component comes from plays (and it does not depend on the
+ * scoring).
  */
 export function grainsOf(def: MetricDef): Grain[] {
   const parts = componentsOf(def)
   const sets = COMPONENTS[def.entity]
   const grains: Grain[] = []
-  if (parts.every((c) => sets.table.has(c))) grains.push('week', 'season')
+  if (parts.every((c) => sets.table.has(c))) {
+    grains.push('week')
+    if (!parts.some((c) => c in QUANTILES)) grains.push('season')
+  }
   if (!def.scoring && parts.every((c) => sets.play.has(c))) grains.push('play')
   return grains
 }

-/** The catalogue as the renderer and NLQ read it: no formulas, and the grains each metric has. */
-export function catalogueInfo(): MetricInfo[] {
+/**
+ * The catalogue as the renderer and NLQ read it: no formulas, the grains each metric has, and its
+ * stability once the models have measured it.
+ */
+export function catalogueInfo(
+  stability: ReadonlyMap<string, MetricStability> = new Map()
+): MetricInfo[] {
   return CATALOGUE.map((def) => {
     const info: Partial<MetricDef> = { ...def }
     delete info.value
     delete info.sample
-    return { ...(info as Omit<MetricDef, 'value' | 'sample'>), grains: grainsOf(def) }
+    return {
+      ...(info as Omit<MetricDef, 'value' | 'sample'>),
+      grains: grainsOf(def),
+      stability: stability.get(def.id) ?? null
+    }
   })
 }
```

```diff
diff --git a/src/main/stats/engine/compile.ts b/src/main/stats/engine/compile.ts
index 6b6ad11..bf8ebf2 100644
--- a/src/main/stats/engine/compile.ts
+++ b/src/main/stats/engine/compile.ts
@@ -1,4 +1,4 @@
-import { componentsOf, METRICS } from '@shared/stats/catalogue'
+import { componentsOf, METRICS, TOKEN } from '@shared/stats/catalogue'
 import { SCORINGS, type Scoring } from '@shared/stats/scoring'
 import {
   POSITION_GROUPS,
@@ -18,7 +18,14 @@ import {
   type Role
 } from '../derived/plays'
 import { STATS_FIRST_SEASON } from '../sources'
-import { grainsOf, PLAYER_FANTASY, TEAM_FANTASY, ZERO_WHEN_MISSING } from './registry'
+import {
+  grainsOf,
+  MODEL_SUMS,
+  PLAYER_FANTASY,
+  QUANTILES,
+  TEAM_FANTASY,
+  ZERO_WHEN_MISSING
+} from './registry'

 /** A query the engine refuses, with a message a person (or an LLM) can act on. */
 export class StatsQueryError extends Error {}
@@ -29,7 +36,15 @@ export const MAX_LIMIT = 1000
 /** Spec §6.1: `minSample` is for 17 games; it scales with the weeks a row covers. */
 export const FULL_SEASON = 17

-const TRANSFORMS: Transform[] = ['raw', 'perGame', 'percentile', 'zScore', 'vsLeague']
+const TRANSFORMS: Transform[] = [
+  'raw',
+  'perGame',
+  'percentile',
+  'zScore',
+  'vsLeague',
+  'shrunk',
+  'opponentAdjusted'
+]
 const TABLE_DIMS: GroupBy[] = ['season', 'week', 'team', 'opponent']
 const PLAY_DIMS: GroupBy[] = ['down', 'quarter', 'personnel', 'coverage', 'formation']
 const TEAM_CODE = /^[A-Z]{2,3}$/
@@ -64,6 +79,13 @@ export interface CompileContext {
   currentSeason: number
   /** A league is imported, so `scoring: 'league'` exists. */
   hasLeague: boolean
+  /** Each metric's stability prior (spec §8.6), the sample the `shrunk` transform gives the mean. */
+  priors?: ReadonlyMap<string, number>
+  /**
+   * For the models only, never from a query: no row cap, and each row split into its odd and
+   * even weeks (`g_half` 1 / 0) for split-half reliability (spec §8.6).
+   */
+  internal?: { unlimited?: boolean; halves?: boolean }
 }

 /** What `runQuery` runs: the weeks in scope (they scale `minSample`), then the query. */
@@ -251,6 +273,16 @@ function validate(q: StatsQuery, ctx: CompileContext): Checked {
   if (grain === 'play' && scope.lastNGames !== undefined) {
     fail('lastNGames cannot be combined with situation filters')
   }
+  if (grain === 'play' && transform === 'opponentAdjusted') {
+    fail('opponentAdjusted cannot be combined with situation filters')
+  }
+  // Opponent adjustment and weekly quantiles (ceiling, floor) need one row per game.
+  const weekly = metrics.some(
+    (m) => !grainsOf(m).includes('season') && grainsOf(m).includes('week')
+  )
+  if (grain === 'season' && (transform === 'opponentAdjusted' || weekly || ctx.internal?.halves)) {
+    grain = 'week'
+  }
   for (const m of metrics) {
     if (!grainsOf(m).includes(grain)) {
       fail(
@@ -380,7 +412,9 @@ function metricColumns(
   perGame: boolean
 ): string[] {
   return metrics.flatMap((m, i) => {
-    let value = m.value.replace(/\{([a-z0-9_]+)\}/g, (_, c: string) => sumOf(c))
+    let value = m.value.replace(TOKEN, (_, kind: string | undefined, c: string) =>
+      sumOf(kind ? `${kind}:${c}` : c)
+    )
     if (perGame && m.kind === 'count') value = `(${value}) / nullif(${sumOf('games')}, 0)`
     return [
       `(${value})::DOUBLE AS v${i}`,
@@ -390,63 +424,199 @@ function metricColumns(
   })
 }

-/** The week and season grains: rows of the derived tables, summed per output row. */
-function tableAgg(q: StatsQuery, c: Checked, params: Params): { ctes: string; dims: GroupBy[] } {
+/** A token a formula reads: a sum, a model state (`last:`) or a weekly quantile (`p80:`). */
+const isState = (t: string): boolean => t.startsWith('last:')
+const quantileCol = (t: string): string => `q_${t.replace(':', '_')}`
+
+/** Whether opponent adjustment applies: sums only (a state or a quantile has no opponents). */
+const adjustable = (m: MetricDef): boolean =>
+  componentsOf(m).every((t) => !isState(t) && !(t in QUANTILES))
+
+/**
+ * The week and season grains: rows of the derived tables, summed per output row, with the fantasy
+ * and model sums joined to them; then model states (`{last:x}`, at the end of the scope) joined to
+ * the sums. With `opponentAdjusted`, each weekly row also carries how far its opponent allows more
+ * than the league (the same metric over every row facing that opponent, minus the league's).
+ */
+function tableAgg(
+  q: StatsQuery,
+  c: Checked,
+  params: Params,
+  notes: Set<string>,
+  halves: boolean
+): { ctes: string; dims: string[] } {
   const player = q.entity === 'player'
   const season = c.grain === 'season'
   const table = `${player ? 'player' : 'team'}_${season ? 'season' : 'week'}`
   const key = player ? 'gsis_id' : 'team'
   const fantasy = player ? PLAYER_FANTASY : TEAM_FANTASY
-  const needed = new Set(['games', ...c.metrics.flatMap(neededBy)])
-  const where = [
-    `w.season IN ${params.list(q.scope.seasons)}`,
-    ...seasonTypeWhere('w.season_type', q, params)
-  ]
-  if (q.scope.weeks) {
-    where.push(`w.week BETWEEN ${params.add(q.scope.weeks[0])} AND ${params.add(q.scope.weeks[1])}`)
-  }
-  if (player && q.scope.positions) where.push(`w.position IN ${params.list(q.scope.positions)}`)
-  if (q.scope.teams) where.push(`w.team IN ${params.list(q.scope.teams)}`)
-  if (q.scope.opponents) where.push(`w.opponent IN ${params.list(q.scope.opponents)}`)
-  if (player && q.scope.players) where.push(`w.gsis_id IN ${params.list(q.scope.players)}`)
-  if (!player && !season) where.push('w.games = 1')
+  const modelSums = MODEL_SUMS[q.entity]
+  const tokens = new Set(['games', ...c.metrics.flatMap(neededBy)])
+  const states = [...tokens].filter(isState).map((t) => t.slice('last:'.length))
+  const quantiles = [...tokens].filter((t) => t in QUANTILES)
+  const needed = new Set([
+    ...[...tokens].filter((t) => !isState(t) && !(t in QUANTILES)),
+    ...quantiles.map((t) => t.split(':')[1])
+  ])
+  const adjust = c.transform === 'opponentAdjusted'
+  const zero = ZERO_WHEN_MISSING[q.entity]
+  const sumSql = (n: string): string => (zero.has(n) ? `coalesce(sum(${n}), 0)` : `sum(${n})`)
+  const seasonList = params.list(q.scope.seasons)
+  const seasonType = seasonTypeWhere('w.season_type', q, params)
+  const weeks = q.scope.weeks
+    ? [`w.week BETWEEN ${params.add(q.scope.weeks[0])} AND ${params.add(q.scope.weeks[1])}`]
+    : []

-  let join = ''
+  const joins: string[] = []
+  // A gsis id can have two Sleeper ids; one line per person and week.
   if ([...needed].some((n) => fantasy.includes(n))) {
-    // A gsis id can have two Sleeper ids; one line per person and week.
+    const scoring = params.add(c.scoring)
     const weekly = player
-      ? `SELECT gsis_id, season, season_type, week, max(points) AS fp, max(xpoints) AS xfp
-         FROM fantasy_week WHERE scoring = ${params.add(c.scoring)} AND gsis_id IS NOT NULL GROUP BY ALL`
+      ? `SELECT gsis_id, season, season_type, week, max(points) AS fp, max(xpoints) AS xfp,
+                max(boom) AS boom, max(bust) AS bust
+         FROM (SELECT *, ${BOOM_BUST} FROM fantasy_week
+               WHERE scoring = ${scoring} AND season IN ${seasonList})
+         WHERE gsis_id IS NOT NULL GROUP BY ALL`
       : `SELECT team, season, season_type, week, ${TEAM_FANTASY.map((f) => `max(${f}) AS ${f}`).join(', ')}
-         FROM team_fantasy_week WHERE scoring = ${params.add(c.scoring)} GROUP BY ALL`
-    const rows = season
-      ? `SELECT ${key}, season, season_type, ${fantasy.map((f) => `sum(${f}) AS ${f}`).join(', ')}
-         FROM (${weekly}) GROUP BY ALL`
-      : weekly
-    join = `LEFT JOIN (${rows}) f ON f.${key} = w.${key} AND f.season = w.season
-            AND f.season_type = w.season_type${season ? '' : ' AND f.week = w.week'}`
-  }
-  const cols = [...needed].map((n) => `${fantasy.includes(n) ? 'f' : 'w'}.${n}`)
+         FROM team_fantasy_week WHERE scoring = ${scoring} GROUP BY ALL`
+    joins.push(joined('f', key, season, fantasy, weekly))
+  }
+  if ([...needed].some((n) => modelSums.includes(n))) {
+    const weekly = `SELECT ${key}, season, season_type, week, ${modelSums.join(', ')}
+                    FROM ${player ? 'player' : 'team'}_model_week`
+    joins.push(joined('m', key, season, modelSums, weekly))
+  }
+  const colOf = (n: string): string =>
+    `${fantasy.includes(n) ? 'f' : modelSums.includes(n) ? 'm' : 'w'}.${n}`
+  const cols = [...needed].map((n) => `${colOf(n)} AS ${n}`)
   const last =
     q.scope.lastNGames === undefined
       ? ''
       : `QUALIFY row_number() OVER (PARTITION BY w.${key}
            ORDER BY w.season DESC, w.week DESC) <= ${params.add(q.scope.lastNGames)}`
-  const base = `SELECT w.${key} AS id, w.season, ${season ? 'NULL::INTEGER' : 'w.week'} AS week,
-                       w.team, ${player ? 'w.position' : 'NULL::VARCHAR AS position'},
-                       ${season ? 'NULL::VARCHAR' : 'w.opponent'} AS opponent, ${cols.join(', ')}
-                FROM ${table} w ${join}
-                WHERE ${where.join(' AND ')} ${last}`
-  const dims = c.groupBy
-  // A counted component a player never had (carries for a receiver) sums as 0, not NULL.
-  const zero = ZERO_WHEN_MISSING[q.entity]
-  const sumOf = (n: string): string => (zero.has(n) ? `coalesce(sum(${n}), 0)` : `sum(${n})`)
-  const agg = `SELECT id, ${dims.map((d) => `${d} AS g_${d}, `).join('')}
-                      arg_max(team, season * 100 + coalesce(week, 0)) AS team,
-                      mode(position) AS position, sum(games)::DOUBLE AS games,
-                      ${metricColumns(c.metrics, sumOf, c.transform === 'perGame').join(', ')}
-               FROM base GROUP BY id${dims.map((d) => `, ${d}`).join('')}`
-  return { ctes: `base AS (${base}), agg AS (${agg})`, dims }
+  /** The rows in scope; without `entity` filters, every row (the population an opponent faced). */
+  const rows = (entity: boolean): string => {
+    const where = [`w.season IN ${seasonList}`, ...seasonType, ...weeks]
+    if (player && q.scope.positions) where.push(`w.position IN ${params.list(q.scope.positions)}`)
+    if (entity) {
+      if (q.scope.teams) where.push(`w.team IN ${params.list(q.scope.teams)}`)
+      if (q.scope.opponents) where.push(`w.opponent IN ${params.list(q.scope.opponents)}`)
+      if (player && q.scope.players) where.push(`w.gsis_id IN ${params.list(q.scope.players)}`)
+    }
+    if (!player && !season) where.push('w.games = 1')
+    return `SELECT w.${key} AS id, w.season, ${season ? 'NULL::INTEGER' : 'w.week'} AS week,
+                   ${halves ? 'w.week % 2 AS half,' : ''}
+                   w.team, ${player ? 'w.position' : 'NULL::VARCHAR AS position'},
+                   ${season ? 'NULL::VARCHAR' : 'w.opponent'} AS opponent, ${cols.join(', ')}
+            FROM ${table} w ${joins.join(' ')}
+            WHERE ${where.join(' AND ')} ${entity ? last : ''}`
+  }
+  const ctes: string[] = [`base AS (${rows(true)})`]
+  const adjusted = adjust ? c.metrics.map(adjustable) : []
+  if (adjust) {
+    // How much more than the league each opponent allows, per metric (sums only).
+    const vs = (by: string): string =>
+      `SELECT ${by}, ${metricColumns(c.metrics, sumSql, false).join(', ')}
+       FROM pop GROUP BY ${by}`
+    ctes.push(
+      `pop AS (${rows(false)})`,
+      `allowed AS (${vs('opponent, season, position')})`,
+      `league AS (${vs('season, position')})`,
+      `faced AS (SELECT b.*, ${c.metrics
+        .map((m, i) =>
+          adjusted[i]
+            ? `a.v${i} - l.v${i} AS adj${i}, b.${m.sample}::DOUBLE AS n${i}`
+            : `NULL::DOUBLE AS adj${i}, NULL::DOUBLE AS n${i}`
+        )
+        .join(', ')}
+       FROM base b
+       LEFT JOIN allowed a ON a.opponent = b.opponent AND a.season = b.season
+         AND a.position IS NOT DISTINCT FROM b.position
+       LEFT JOIN league l ON l.season = b.season AND l.position IS NOT DISTINCT FROM b.position)`
+    )
+    c.metrics.forEach((m, i) => {
+      if (!adjusted[i]) notes.add(`${m.label}: not opponent-adjusted (a rating or a weekly range).`)
+    })
+  }
+  const dims: string[] = [...c.groupBy, ...(halves ? ['half'] : [])]
+  const sumCols = [...needed].map((n) => `${sumSql(n)} AS ${n}`)
+  const quantCols = quantiles.map(
+    (t) => `quantile_cont(${t.split(':')[1]}, ${QUANTILES[t]}) AS ${quantileCol(t)}`
+  )
+  const adjCols = adjust
+    ? c.metrics.map(
+        (_, i) =>
+          `sum(n${i} * adj${i}) FILTER (WHERE adj${i} IS NOT NULL) / nullif(sum(n${i}) FILTER (WHERE adj${i} IS NOT NULL), 0) AS o${i}`
+      )
+    : []
+  ctes.push(`sums AS (
+    SELECT id, ${dims.map((d) => `${d} AS g_${d}, `).join('')}
+           arg_max(team, season * 100 + coalesce(week, 0)) AS team,
+           mode(position) AS position,
+           ${[...sumCols, ...quantCols, ...adjCols].join(', ')}
+    FROM ${adjust ? 'faced' : 'base'} GROUP BY id${dims.map((d) => `, ${d}`).join('')})`)
+
+  // States at the end of the scope: the latest week in scope (per season or week when grouped).
+  const stateDims = c.groupBy.filter((d) => d === 'season' || d === 'week')
+  if (states.length > 0) {
+    if (player) {
+      ctes.push(`st AS (SELECT gsis_id AS id, ${states.join(', ')} FROM player_profile)`)
+    } else {
+      const where = [
+        `w.season IN ${seasonList}`,
+        ...seasonTypeWhere('w.season_type', q, params),
+        ...(q.scope.weeks
+          ? [`w.week BETWEEN ${params.add(q.scope.weeks[0])} AND ${params.add(q.scope.weeks[1])}`]
+          : [])
+      ]
+      if (q.scope.teams) where.push(`w.team IN ${params.list(q.scope.teams)}`)
+      ctes.push(`st AS (
+        SELECT w.team AS id, ${stateDims.map((d) => `w.${d} AS g_${d}, `).join('')}
+               ${states.map((x) => `arg_max(w.${x}, w.season * 100 + w.week) AS ${x}`).join(', ')}
+        FROM team_model_week w WHERE ${where.join(' AND ')}
+        GROUP BY ALL)`)
+    }
+  }
+  const sumOf = (t: string): string =>
+    isState(t) ? `st.${t.slice('last:'.length)}` : t in QUANTILES ? `s.${quantileCol(t)}` : `s.${t}`
+  const stJoin =
+    states.length > 0
+      ? `LEFT JOIN st ON st.id = s.id${player ? '' : stateDims.map((d) => ` AND st.g_${d} = s.g_${d}`).join('')}`
+      : ''
+  ctes.push(`agg AS (
+    SELECT s.id, ${dims.map((d) => `s.g_${d}, `).join('')} s.team, s.position, s.games::DOUBLE AS games,
+           ${adjust ? `${c.metrics.map((_, i) => `s.o${i}`).join(', ')}, ` : ''}
+           ${metricColumns(c.metrics, sumOf, c.transform === 'perGame').join(', ')}
+    FROM sums s ${stJoin})`)
+  return { ctes: ctes.join(',\n'), dims }
+}
+
+/**
+ * Boom and bust weeks (spec §8.5) under one scoring: a top-12 weekly finish at the position (top 24
+ * for RB and WR) is a boom, one outside the top 36 (48) a bust.
+ */
+const BOOM_BUST = `
+  CASE WHEN position IN ('QB', 'RB', 'WR', 'TE') THEN
+    (rank() OVER (PARTITION BY season, season_type, week, position ORDER BY points DESC)
+      <= CASE WHEN position IN ('RB', 'WR') THEN 24 ELSE 12 END)::INT END AS boom,
+  CASE WHEN position IN ('QB', 'RB', 'WR', 'TE') THEN
+    (rank() OVER (PARTITION BY season, season_type, week, position ORDER BY points DESC)
+      > CASE WHEN position IN ('RB', 'WR') THEN 48 ELSE 36 END)::INT END AS bust`
+
+/** A weekly side table joined to the derived rows; at the season grain, summed by season first. */
+function joined(
+  alias: string,
+  key: string,
+  season: boolean,
+  columns: readonly string[],
+  weekly: string
+): string {
+  const rows = season
+    ? `SELECT ${key}, season, season_type, ${columns.map((f) => `sum(${f}) AS ${f}`).join(', ')}
+       FROM (${weekly}) GROUP BY ALL`
+    : weekly
+  return `LEFT JOIN (${rows}) ${alias} ON ${alias}.${key} = w.${key} AND ${alias}.season = w.season
+          AND ${alias}.season_type = w.season_type${season ? '' : ` AND ${alias}.week = w.week`}`
 }

 /** The play grain: components summed again from plays under the situation filter (spec §7.2). */
@@ -615,7 +785,10 @@ export function compileQuery(q: StatsQuery, ctx: CompileContext): Compiled {
   const c = validate(q, ctx)
   const params = new Params()
   const notes = new Set<string>()
-  const { ctes, dims } = c.grain === 'play' ? playAgg(q, c, params, notes) : tableAgg(q, c, params)
+  const { ctes, dims } =
+    c.grain === 'play'
+      ? playAgg(q, c, params, notes)
+      : tableAgg(q, c, params, notes, ctx.internal?.halves ?? false)
   // Percentiles and ranks among qualified rows of the same position (players) and group.
   const group = [...(q.entity === 'player' ? ['position'] : []), ...dims.map((d) => `g_${d}`)]
   const over = (i: number, order: string): string =>
@@ -634,9 +807,23 @@ export function compileQuery(q: StatsQuery, ctx: CompileContext): Compiled {
             `avg(v${i}) FILTER (WHERE ${ok}) OVER (${among}) AS m${i}`,
             `stddev_samp(v${i}) FILTER (WHERE ${ok}) OVER (${among}) AS d${i}`
           ]
+        : []),
+      // Shrinkage pulls toward the qualified rows' mean, weighted by their samples.
+      ...(c.transform === 'shrunk'
+        ? [
+            `sum(v${i} * s${i}) FILTER (WHERE ${ok}) OVER (${among})
+               / nullif(sum(s${i}) FILTER (WHERE ${ok}) OVER (${among}), 0) AS m${i}`
+          ]
         : [])
     ]
   })
+  const prior = (m: MetricDef): number | undefined =>
+    m.kind === 'rate' ? ctx.priors?.get(m.id) : undefined
+  if (c.transform === 'shrunk') {
+    for (const m of c.metrics) {
+      if (prior(m) === undefined) notes.add(`${m.label}: not shrunk (no stability estimate).`)
+    }
+  }
   const shaped = c.metrics.map((_, i) => {
     switch (c.transform) {
       case 'percentile':
@@ -645,6 +832,15 @@ export function compileQuery(q: StatsQuery, ctx: CompileContext): Compiled {
         return `(v${i} - m${i}) / nullif(d${i}, 0) AS t${i}`
       case 'vsLeague':
         return `v${i} - m${i} AS t${i}`
+      case 'shrunk': {
+        const k = prior(c.metrics[i])
+        if (k === undefined) return `v${i} AS t${i}`
+        const pk = params.add(k)
+        return `CASE WHEN v${i} IS NOT NULL AND m${i} IS NOT NULL
+                  THEN (s${i} * v${i} + ${pk} * m${i}) / nullif(s${i} + ${pk}, 0) ELSE v${i} END AS t${i}`
+      }
+      case 'opponentAdjusted':
+        return `v${i} - coalesce(o${i}, 0) AS t${i}`
       default:
         return `v${i} AS t${i}`
     }
@@ -654,7 +850,7 @@ export function compileQuery(q: StatsQuery, ctx: CompileContext): Compiled {
     (m, i) =>
       `(s${i} > 0 AND s${i} >= ${m.minSample ?? 0} * $factor${play ? ' * coalesce(sh.share, 0)' : ''}) AS q${i}`
   )
-  const playDims = dims.filter((d) => PLAY_DIMS.includes(d))
+  const playDims = dims.filter((d) => (PLAY_DIMS as string[]).includes(d))
   const sharesJoin = play
     ? `LEFT JOIN shares sh ON ${playDims.length > 0 ? playDims.map((d) => `sh.g_${d} IS NOT DISTINCT FROM a.g_${d}`).join(' AND ') : 'true'}`
     : ''
@@ -670,7 +866,7 @@ export function compileQuery(q: StatsQuery, ctx: CompileContext): Compiled {
     FROM shaped x ${player ? 'LEFT JOIN players pl ON pl.gsis_id = x.id' : ''}
     ${q.scope.qualifiedOnly ? `WHERE q${sort}` : ''}
     ORDER BY q${sort} DESC, t${sort} ${dir.toUpperCase()} NULLS LAST, name
-    LIMIT ${q.limit ?? DEFAULT_LIMIT}`
+    ${ctx.internal?.unlimited ? '' : `LIMIT ${q.limit ?? DEFAULT_LIMIT}`}`

   // Qualification scales `minSample` to the weeks a row covers (and, at the play grain, to the
   // share of plays it keeps: 150 routes over a season is about 45 when pressured).
```

- [ ] **Step 6: The model metrics**

```diff
diff --git a/src/shared/stats/catalogue.ts b/src/shared/stats/catalogue.ts
index 47d40a4..aea62de 100644
--- a/src/shared/stats/catalogue.ts
+++ b/src/shared/stats/catalogue.ts
@@ -2,8 +2,8 @@ import type { MetricDef, PositionGroup } from './types'

 /**
  * The metric catalogue (stats-analysis spec §6): every metric the engine computes, its formula over
- * component sums, and the words a screen (or an LLM, spec §10) needs to read it. The models (Elo,
- * adjusted EPA, FG over expected, stability, shrinkage, RAS) arrive with Plan Z.
+ * component sums (and the models' states, spec §8), and the words a screen (or an LLM, spec §10)
+ * needs to read it.
  */

 type Opts = Partial<Omit<MetricDef, 'id' | 'label' | 'short' | 'description'>> &
@@ -2824,6 +2824,596 @@ const TEAM: MetricDef[] = [
   )
 ]

+const MODEL = ['FantasyCompanion models (nflverse data)']
+const COMBINE_SRC = ['NFL Scouting Combine (nflverse)']
+
+/** A team model state at the end of the scope (spec §8): one value, not a sum. */
+const state = (name: string, o: Partial<Opts> = {}): Opts => ({
+  value: `{last:${name}}`,
+  sample: 'games',
+  family: 'predictive',
+  sources: MODEL,
+  ...o
+})
+
+/**
+ * QB EPA + CPOE composite (spec §6.2, moved from Plan Y): the average of the two in standard
+ * deviations of qualified QB seasons (200+ dropbacks, 2019–2025: EPA/dropback 0.058 ± 0.131, CPOE
+ * 0.53 ± 3.28), so 0 is an average starter and +1 a top-six one.
+ */
+const COMPOSITE = `((${ratio('db_epa', 'dropbacks')} - 0.058) / 0.131 + (${ratio('cpoe_sum', 'cpoe_n')} - 0.53) / 3.28) / 2`
+
+/** Wins a team's points imply (Pythagorean expectation, exponent 2.37). */
+const PYTHAG =
+  'pow({points_for}, 2.37) / nullif(pow({points_for}, 2.37) + pow({points_against}, 2.37), 0)'
+const FUMBLES_RECOVERED = '({off_fumbles} - {off_fumbles_lost} + {def_fumbles_lost})'
+const FUMBLE_LUCK = `${FUMBLES_RECOVERED} - 0.5 * ({off_fumbles} + {def_fumbles})`
+const INT_LUCK = '({def_ftn_ints} - {def_xints}) - ({off_ftn_ints} - {off_xints})'
+
+/** Plan Z (spec §8): ratings, forecasts, luck, FG over expected, outlook and profile metrics. */
+const MODELS: MetricDef[] = [
+  team(
+    'elo',
+    'Elo rating',
+    'Elo',
+    'Team strength from game results (nfelo-style Elo: 1500 is average; 25 points ≈ one point of spread).',
+    state('elo', { unit: 'number', decimals: 0, tier: 'core' })
+  ),
+  team(
+    'srs',
+    'Simple Rating System',
+    'SRS',
+    'Average margin adjusted for the opponents faced: points better than an average team on a neutral field.',
+    state('srs', { unit: 'points', tier: 'core' })
+  ),
+  team(
+    'adj_off_epa',
+    'Adjusted EPA/play',
+    'Adj EPA',
+    'Offensive EPA per play adjusted for the defenses faced and home field (a ridge regression; garbage time left out). Our own adjustment, not DVOA.',
+    state('adj_off_epa', { unit: 'epa', decimals: 3, tier: 'core' })
+  ),
+  team(
+    'adj_def_epa',
+    'Adjusted EPA/play allowed',
+    'Adj EPA All',
+    'EPA per play allowed, adjusted for the offenses faced and home field: lower is better.',
+    state('adj_def_epa', {
+      unit: 'epa',
+      decimals: 3,
+      side: 'defense',
+      direction: 'lower',
+      tier: 'core'
+    })
+  ),
+  team(
+    'adj_net_epa',
+    'Adjusted EPA margin',
+    'Adj Net',
+    'Adjusted EPA per play on offense minus allowed on defense: the overall efficiency margin.',
+    state('adj_off_epa', {
+      value: '{last:adj_off_epa} - {last:adj_def_epa}',
+      unit: 'epa',
+      decimals: 3,
+      tier: 'core'
+    })
+  ),
+  team(
+    'adj_off_pass_epa',
+    'Adjusted EPA/dropback',
+    'Adj Pass',
+    'Adjusted EPA per dropback on offense.',
+    state('adj_off_pass_epa', { unit: 'epa', decimals: 3 })
+  ),
+  team(
+    'adj_off_rush_epa',
+    'Adjusted EPA/rush',
+    'Adj Rush',
+    'Adjusted EPA per designed run on offense.',
+    state('adj_off_rush_epa', { unit: 'epa', decimals: 3 })
+  ),
+  team(
+    'adj_def_pass_epa',
+    'Adjusted EPA/dropback allowed',
+    'Adj Pass All',
+    'Adjusted EPA per dropback allowed.',
+    state('adj_def_pass_epa', { unit: 'epa', decimals: 3, side: 'defense', direction: 'lower' })
+  ),
+  team(
+    'adj_def_rush_epa',
+    'Adjusted EPA/rush allowed',
+    'Adj Rush All',
+    'Adjusted EPA per designed run allowed.',
+    state('adj_def_rush_epa', { unit: 'epa', decimals: 3, side: 'defense', direction: 'lower' })
+  ),
+  team(
+    'adj_recent_off_epa',
+    'Recent adjusted EPA/play',
+    'Rec EPA',
+    'Adjusted EPA per play with recent games weighted more (a game counts half every 4 weeks back).',
+    state('adj_recent_off_epa', { unit: 'epa', decimals: 3 })
+  ),
+  team(
+    'adj_recent_def_epa',
+    'Recent adjusted EPA/play allowed',
+    'Rec EPA All',
+    'Adjusted EPA per play allowed, recent games weighted more.',
+    state('adj_recent_def_epa', { unit: 'epa', decimals: 3, side: 'defense', direction: 'lower' })
+  ),
+  ...(['pass', 'rush'] as const).flatMap((k) => [
+    team(
+      `adj_recent_off_${k}_epa`,
+      `Recent adjusted EPA/${k === 'pass' ? 'dropback' : 'rush'}`,
+      `Rec ${k === 'pass' ? 'Pass' : 'Rush'}`,
+      `Adjusted EPA per ${k === 'pass' ? 'dropback' : 'designed run'}, recent games weighted more.`,
+      state(`adj_recent_off_${k}_epa`, { unit: 'epa', decimals: 3, tier: 'stored' })
+    ),
+    team(
+      `adj_recent_def_${k}_epa`,
+      `Recent adjusted EPA/${k === 'pass' ? 'dropback' : 'rush'} allowed`,
+      `Rec ${k === 'pass' ? 'Pass' : 'Rush'} All`,
+      `Adjusted EPA per ${k === 'pass' ? 'dropback' : 'designed run'} allowed, recent games weighted more.`,
+      state(`adj_recent_def_${k}_epa`, {
+        unit: 'epa',
+        decimals: 3,
+        side: 'defense',
+        direction: 'lower',
+        tier: 'stored'
+      })
+    )
+  ]),
+  team(
+    'pythag_win_pct',
+    'Pythagorean win %',
+    'Pyth%',
+    'The win % a team’s points scored and allowed imply (exponent 2.37): a steadier guide to strength than the record.',
+    { value: PYTHAG, sample: 'games', unit: 'pct', family: 'predictive', tier: 'core' }
+  ),
+  team('pythag_wins', 'Pythagorean wins', 'Pyth W', 'Games × Pythagorean win %.', {
+    value: `{games} * ${PYTHAG}`,
+    sample: 'games',
+    kind: 'count',
+    unit: 'number',
+    decimals: 1,
+    family: 'predictive',
+    tier: 'core'
+  }),
+  team(
+    'luck_wins',
+    'Wins over Pythagorean',
+    'Luck',
+    'Wins (a tie half) minus Pythagorean wins: far above zero usually means close games went its way, which rarely lasts.',
+    {
+      value: `{wins} + 0.5 * {ties} - {games} * ${PYTHAG}`,
+      sample: 'games',
+      kind: 'count',
+      unit: 'number',
+      decimals: 1,
+      family: 'predictive',
+      direction: 'neutral',
+      tier: 'core'
+    }
+  ),
+  team(
+    'elo_xwins',
+    'Elo expected wins',
+    'Elo xW',
+    'The sum of the pre-game Elo win probabilities of its games.',
+    {
+      value: '{elo_wp}',
+      sample: 'elo_games',
+      kind: 'count',
+      unit: 'number',
+      decimals: 1,
+      family: 'predictive',
+      sources: MODEL
+    }
+  ),
+  team(
+    'elo_luck',
+    'Wins over Elo expectation',
+    'Elo Luck',
+    'Wins minus the Elo expected wins of its games.',
+    {
+      value: '{wins} + 0.5 * {ties} - {elo_wp}',
+      sample: 'elo_games',
+      kind: 'count',
+      unit: 'number',
+      decimals: 1,
+      family: 'predictive',
+      direction: 'neutral',
+      sources: MODEL
+    }
+  ),
+  team(
+    'vegas_xwins',
+    'Vegas expected wins',
+    'Vegas xW',
+    'The sum of the win probabilities the betting market gave its games (no-vig moneyline).',
+    {
+      value: '{vegas_wp}',
+      sample: 'vegas_games',
+      kind: 'count',
+      unit: 'number',
+      decimals: 1,
+      family: 'predictive',
+      sources: LINES
+    }
+  ),
+  team(
+    'sos_elo',
+    'Schedule strength played (Elo)',
+    'SOS',
+    'The average current Elo of the opponents faced so far: above 1500 means a hard schedule.',
+    state('sos_elo', { unit: 'number', decimals: 0, direction: 'neutral', tier: 'core' })
+  ),
+  team(
+    'sos_adj',
+    'Schedule strength played (adjusted EPA)',
+    'SOS EPA',
+    'The average adjusted EPA margin of the opponents faced so far.',
+    state('sos_adj', { unit: 'epa', decimals: 3, direction: 'neutral' })
+  ),
+  team(
+    'sos_left_elo',
+    'Remaining schedule strength (Elo)',
+    'SOS Left',
+    'The average current Elo of the regular-season opponents still to play.',
+    state('sos_left_elo', { unit: 'number', decimals: 0, direction: 'neutral', tier: 'core' })
+  ),
+  team(
+    'sos_left_adj',
+    'Remaining schedule strength (adjusted EPA)',
+    'SOS Left EPA',
+    'The average adjusted EPA margin of the regular-season opponents still to play.',
+    state('sos_left_adj', { unit: 'epa', decimals: 3, direction: 'neutral' })
+  ),
+  team(
+    'games_left',
+    'Games left',
+    'Left',
+    'Regular-season games still to play.',
+    state('games_left', { unit: 'count', decimals: 0, direction: 'neutral', tier: 'stored' })
+  ),
+  team(
+    'proj_wins',
+    'Projected wins',
+    'Proj W',
+    'Average wins over 10,000 simulations of the rest of the regular season from the current Elo ratings.',
+    state('proj_wins', { unit: 'number', decimals: 1, tier: 'core' })
+  ),
+  team(
+    'proj_losses',
+    'Projected losses',
+    'Proj L',
+    'Average losses over the simulations.',
+    state('proj_losses', { unit: 'number', decimals: 1, direction: 'lower' })
+  ),
+  team(
+    'playoff_pct',
+    'Playoff odds',
+    'Playoff%',
+    'Share of the simulated seasons in which it makes the playoffs (NFL tiebreakers, approximated).',
+    state('playoff_pct', { unit: 'pct', tier: 'core' })
+  ),
+  team(
+    'division_pct',
+    'Division odds',
+    'Div%',
+    'Share of the simulated seasons in which it wins its division.',
+    state('division_pct', { unit: 'pct', tier: 'core' })
+  ),
+  team(
+    'bye_pct',
+    'First-round bye odds',
+    'Bye%',
+    'Share of the simulated seasons in which it is the top seed (the top two in 2019).',
+    state('bye_pct', { unit: 'pct' })
+  ),
+  team(
+    'conference_pct',
+    'Conference title odds',
+    'Conf%',
+    'Share of the simulated seasons in which it reaches the Super Bowl.',
+    state('conference_pct', { unit: 'pct' })
+  ),
+  team(
+    'sb_pct',
+    'Super Bowl odds',
+    'SB%',
+    'Share of the simulated seasons in which it wins the Super Bowl.',
+    state('sb_pct', { unit: 'pct', tier: 'core' })
+  ),
+  team(
+    'fumble_recovery_pct',
+    'Fumble recovery %',
+    'FR%',
+    'Share of all fumbles in its games (its own and the opponents’) it recovered: about 50 % in the long run, so far from it is luck.',
+    {
+      value: `${FUMBLES_RECOVERED} / nullif({off_fumbles} + {def_fumbles}, 0)`,
+      sample: 'games',
+      unit: 'pct',
+      family: 'predictive',
+      direction: 'neutral',
+      sources: [...PBP, ...MODEL]
+    }
+  ),
+  team(
+    'fumble_luck',
+    'Fumble luck',
+    'Fum Luck',
+    'Fumbles recovered minus half of all fumbles in its games.',
+    {
+      value: FUMBLE_LUCK,
+      sample: 'games',
+      kind: 'count',
+      unit: 'number',
+      decimals: 1,
+      family: 'predictive',
+      direction: 'neutral',
+      sources: [...PBP, ...MODEL]
+    }
+  ),
+  team(
+    'int_luck',
+    'Interception luck',
+    'INT Luck',
+    'Interceptions made minus expected (from the interception-worthy throws it faced), minus the same for its own passes. FTN charting, from 2022.',
+    {
+      value: INT_LUCK,
+      sample: 'games',
+      kind: 'count',
+      unit: 'number',
+      decimals: 1,
+      family: 'predictive',
+      direction: 'neutral',
+      sources: [...FTN, ...MODEL],
+      firstSeason: 2022
+    }
+  ),
+  team(
+    'turnover_luck',
+    'Turnover luck',
+    'TO Luck',
+    'Fumble luck plus interception luck: turnovers gained beyond what the plays deserved. Tends to vanish the next season.',
+    {
+      value: `${FUMBLE_LUCK} + ${INT_LUCK}`,
+      sample: 'games',
+      kind: 'count',
+      unit: 'number',
+      decimals: 1,
+      family: 'predictive',
+      direction: 'neutral',
+      sources: [...PBP, ...FTN, ...MODEL],
+      firstSeason: 2022,
+      tier: 'core'
+    }
+  ),
+  team(
+    'team_fgoe',
+    'FG over expected',
+    'FGOE',
+    'Field goals made minus the FG model’s expected makes for the kicks tried.',
+    {
+      value: '{fg_model_made} - {fg_xmade}',
+      sample: 'fg_model_att',
+      kind: 'count',
+      unit: 'number',
+      decimals: 1,
+      side: 'special',
+      family: 'predictive',
+      sources: [...PBP, ...MODEL]
+    }
+  ),
+  metric(
+    'fgoe',
+    'FG over expected',
+    'FGOE',
+    'Field goals made minus expected makes, from a model of distance, roof, cold, wind and surface: kicking skill beyond the kicks tried.',
+    {
+      value: '{fg_model_made} - {fg_xmade}',
+      sample: 'fg_model_att',
+      kind: 'count',
+      unit: 'number',
+      decimals: 1,
+      positions: K,
+      minSample: 20,
+      family: 'predictive',
+      sources: [...PBP, ...MODEL],
+      tier: 'core'
+    }
+  ),
+  metric('fgoe_pct', 'FG % over expected', 'FGOE%', 'FG over expected per attempt.', {
+    value: '({fg_model_made} - {fg_xmade}) / nullif({fg_model_att}, 0)',
+    sample: 'fg_model_att',
+    unit: 'pct',
+    positions: K,
+    minSample: 20,
+    family: 'predictive',
+    sources: [...PBP, ...MODEL],
+    tier: 'core'
+  }),
+  metric(
+    'fg_expected_pct',
+    'Expected FG %',
+    'xFG%',
+    'The FG % the model expects for the kicks tried: lower means harder kicks.',
+    {
+      value: '{fg_xmade} / nullif({fg_model_att}, 0)',
+      sample: 'fg_model_att',
+      unit: 'pct',
+      positions: K,
+      minSample: 20,
+      family: 'predictive',
+      direction: 'neutral',
+      sources: [...PBP, ...MODEL]
+    }
+  ),
+  metric(
+    'epa_cpoe_composite',
+    'EPA + CPOE composite',
+    'EPA+CPOE',
+    'EPA per dropback and CPOE averaged in standard deviations of qualified QB seasons (2019–2025): 0 is an average starter, +1 a top-six passer.',
+    {
+      value: COMPOSITE,
+      sample: 'dropbacks',
+      unit: 'number',
+      decimals: 2,
+      family: 'advanced',
+      positions: QB,
+      minSample: 200,
+      sources: [...PBP, ...MODEL],
+      tier: 'core'
+    }
+  ),
+  metric(
+    'fp_ceiling',
+    'Ceiling',
+    'Ceil',
+    'The 80th percentile of the weekly fantasy points in scope, under the chosen scoring: a good week.',
+    {
+      value: '{p80:fp}',
+      sample: 'games',
+      unit: 'points',
+      family: 'predictive',
+      positions: SKILL,
+      sources: SLEEPER,
+      scoring: true,
+      tier: 'core'
+    }
+  ),
+  metric(
+    'fp_floor',
+    'Floor',
+    'Floor',
+    'The 20th percentile of the weekly fantasy points in scope: a bad week.',
+    {
+      value: '{p20:fp}',
+      sample: 'games',
+      unit: 'points',
+      family: 'predictive',
+      positions: SKILL,
+      sources: SLEEPER,
+      scoring: true,
+      tier: 'core'
+    }
+  ),
+  metric(
+    'boom_rate',
+    'Boom rate',
+    'Boom%',
+    'Share of games with a top-12 weekly finish at the position (top 24 for RB and WR), under the chosen scoring.',
+    {
+      value: '{boom} / nullif({games}, 0)',
+      sample: 'games',
+      unit: 'pct',
+      family: 'predictive',
+      positions: SKILL,
+      sources: SLEEPER,
+      scoring: true,
+      tier: 'core'
+    }
+  ),
+  metric(
+    'bust_rate',
+    'Bust rate',
+    'Bust%',
+    'Share of games finishing outside the top 36 at the position (48 for RB and WR).',
+    {
+      value: '{bust} / nullif({games}, 0)',
+      sample: 'games',
+      unit: 'pct',
+      family: 'predictive',
+      positions: SKILL,
+      direction: 'lower',
+      sources: SLEEPER,
+      scoring: true,
+      tier: 'core'
+    }
+  ),
+  metric(
+    'ras',
+    'Athletic score (RAS-style)',
+    'RAS',
+    'Combine measures scored 0–10 by percentile within the position since 2000, averaged over those he did (four at least). Our version of Kent Lee Platte’s Relative Athletic Score, so values differ from his.',
+    {
+      value: '{last:ras}',
+      sample: 'games',
+      unit: 'number',
+      decimals: 2,
+      family: 'advanced',
+      sources: COMBINE_SRC,
+      tier: 'core'
+    }
+  ),
+  metric(
+    'ras_measures',
+    'Combine measures',
+    'Measures',
+    'How many of the eight combine measures the athletic score uses: fewer than eight is a partial score.',
+    {
+      value: '{last:ras_measures}',
+      sample: 'games',
+      unit: 'count',
+      decimals: 0,
+      direction: 'neutral',
+      sources: COMBINE_SRC,
+      tier: 'stored'
+    }
+  ),
+  metric(
+    'speed_score',
+    'Speed Score',
+    'Speed',
+    'Speed for the size: 200 × weight / 40-yard time⁴ (Bill Barnwell); about 100 is average for a back.',
+    {
+      value: '{last:speed_score}',
+      sample: 'games',
+      unit: 'number',
+      decimals: 1,
+      family: 'advanced',
+      sources: COMBINE_SRC,
+      tier: 'core'
+    }
+  ),
+  ...(
+    [
+      ['height', 'Height', 'Ht', 'inches', 'number', 0, 'neutral'],
+      ['weight', 'Weight', 'Wt', 'pounds', 'number', 0, 'neutral'],
+      ['forty', '40-yard dash', '40', 'seconds', 'seconds', 2, 'lower'],
+      ['bench', 'Bench press', 'Bench', 'repetitions of 225 pounds', 'count', 0, 'higher'],
+      ['vertical', 'Vertical jump', 'Vert', 'inches', 'number', 1, 'higher'],
+      ['broad_jump', 'Broad jump', 'Broad', 'inches', 'number', 0, 'higher'],
+      ['cone', '3-cone drill', '3-Cone', 'seconds', 'seconds', 2, 'lower'],
+      ['shuttle', 'Short shuttle', 'Shuttle', 'seconds', 'seconds', 2, 'lower']
+    ] as const
+  ).flatMap(([name, label, short, what, unit, decimals, direction]) => [
+    metric(name, label, short, `The ${label.toLowerCase()} at the combine, in ${what}.`, {
+      value: `{last:${name}}`,
+      sample: 'games',
+      unit,
+      decimals,
+      direction,
+      sources: COMBINE_SRC
+    }),
+    metric(
+      `${name}_score`,
+      `${label} score`,
+      `${short} Sc`,
+      `The ${label.toLowerCase()} as a 0–10 percentile within the position over every combine since 2000.`,
+      {
+        value: `{last:${name}_score}`,
+        sample: 'games',
+        unit: 'number',
+        decimals: 1,
+        family: 'advanced',
+        sources: COMBINE_SRC,
+        tier: 'stored'
+      }
+    )
+  ])
+]
+
 export const CATALOGUE: MetricDef[] = [
   ...PASSING,
   ...RUSHING,
@@ -2832,13 +3422,17 @@ export const CATALOGUE: MetricDef[] = [
   ...FANTASY,
   ...DEFENSE,
   ...KICKING,
-  ...TEAM
+  ...TEAM,
+  ...MODELS
 ]

 export const METRICS: ReadonlyMap<string, MetricDef> = new Map(CATALOGUE.map((m) => [m.id, m]))

-/** The `{component}` names a formula reads, and its sample. */
+/** `{name}`, `{last:name}`, `{p80:name}` and `{p20:name}` in a formula (types.ts `MetricDef`). */
+export const TOKEN = /\{(?:(last|p80|p20):)?([a-z0-9_]+)\}/g
+
+/** The tokens a formula reads (`name`, `last:name`, `p80:name`), and its sample. */
 export function componentsOf(def: Pick<MetricDef, 'value' | 'sample'>): string[] {
-  const names = [...def.value.matchAll(/\{([a-z0-9_]+)\}/g)].map((m) => m[1])
+  const names = [...def.value.matchAll(TOKEN)].map((m) => (m[1] ? `${m[1]}:${m[2]}` : m[2]))
   return [...new Set([...names, def.sample])]
 }
```

- [ ] **Step 7: Run the tests**

```bash
npx vitest run tests/main/stats tests/shared/stats
```

Expected: PASS (123 passed).

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/main/stats/models/columns.ts src/main/stats/engine/registry.ts src/main/stats/engine/compile.ts src/shared/stats/types.ts src/shared/stats/catalogue.ts src/shared/stats/querySchema.ts tests/main/stats/engine/models.test.ts tests/shared/stats/catalogue.test.ts
git add src/main/stats/models/columns.ts src/main/stats/engine/registry.ts src/main/stats/engine/compile.ts src/shared/stats/types.ts src/shared/stats/catalogue.ts src/shared/stats/querySchema.ts tests/main/stats/engine/models.test.ts tests/shared/stats/catalogue.test.ts
git commit -m "feat(stats): read model metrics in the engine"
```

---

### Task 6: Metric stability (spec §8.6; amendment J)

**Files:**

- Create: `src/main/stats/models/stability.ts`, `tests/main/stats/models/stability.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/main/stats/models/stability.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rng } from '@main/stats/models/linear'
import { reliabilityOf, stabilityFrom, type StabilityRow } from '@main/stats/models/stability'

/**
 * 200 players over two seasons: a true rate each, seen through binomial-like noise of a given
 * sample per half (each season is two halves).
 */
function players(
  sd: number,
  sample: number,
  seed = 1
): { full: StabilityRow[]; halves: StabilityRow[] } {
  const random = rng(seed)
  const normal = (): number =>
    Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random())
  const full: StabilityRow[] = []
  const halves: StabilityRow[] = []
  for (let i = 0; i < 200; i++) {
    const p = Math.min(0.95, Math.max(0.05, 0.5 + sd * normal()))
    for (const season of [2023, 2024]) {
      const h = [0, 1].map(() => {
        let made = 0
        for (let k = 0; k < sample; k++) made += random() < p ? 1 : 0
        return made / sample
      })
      const id = `p${i}`
      full.push({ id, season, half: null, position: 'WR', v: (h[0] + h[1]) / 2, s: 2 * sample })
      h.forEach((v, half) => halves.push({ id, season, half, position: 'WR', v, s: sample }))
    }
  }
  return { full, halves }
}

describe('metric stability (stats-analysis spec §8.6)', () => {
  it('finds a sticky rate sticky and a noisy one noisy', () => {
    const sticky = players(0.15, 100)
    const noisy = players(0.01, 20)
    const a = stabilityFrom(sticky.full, sticky.halves, 'rate')
    const b = stabilityFrom(noisy.full, noisy.halves, 'rate')
    expect(a.pairs).toBe(200)
    expect(a.yearToYear!).toBeGreaterThan(0.75)
    expect(a.reliability).toBe('high')
    expect(b.yearToYear!).toBeLessThan(0.2)
    expect(b.reliability).toBe('low')
    expect(a.splitHalf!).toBeGreaterThan(b.splitHalf!)
  })

  it('sets the prior where half of a rate is signal', () => {
    // True spread 0.05 and binomial noise √(0.25 / n): half signal at n = 0.25 / 0.0025 = 100.
    const { full, halves } = players(0.05, 100, 3)
    const s = stabilityFrom(full, halves, 'rate')
    expect(s.prior!).toBeGreaterThan(60)
    expect(s.prior!).toBeLessThan(160)
    // A count has no prior, a state no split halves.
    expect(stabilityFrom(full, halves, 'count').prior).toBeNull()
    expect(stabilityFrom(full, null, 'rate')).toMatchObject({ splitHalf: null, prior: null })
  })

  it('reports nothing under thirty pairs', () => {
    const { full, halves } = players(0.15, 100)
    const few = stabilityFrom(full.slice(0, 40), halves.slice(0, 80), 'rate')
    expect(few).toMatchObject({ yearToYear: null, pairs: 20, reliability: null })
  })

  it('grades reliability from the year-to-year r', () => {
    expect([
      reliabilityOf(0.7),
      reliabilityOf(0.4),
      reliabilityOf(0.1),
      reliabilityOf(null)
    ]).toEqual(['high', 'medium', 'low', null])
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/main/stats/models/stability.test.ts
```

Expected: FAIL, the module does not exist.

- [ ] **Step 3: Year to year, split halves, priors**

Create `src/main/stats/models/stability.ts`:

```ts
import { CATALOGUE, componentsOf } from '@shared/stats/catalogue'
import type { Entity, MetricDef, MetricStability } from '@shared/stats/types'
import type { StatsDb } from '../db'
import { compileQuery, MAX_METRICS } from '../engine/compile'
import { grainsOf } from '../engine/registry'
import { writeTable } from '../identity'
import { STATS_FIRST_SEASON } from '../sources'
import { pearson } from './linear'

/**
 * Metric stability (stats-analysis spec §8.6), from 2019 to the prior season, regular seasons:
 * - year to year: Pearson r between a player's qualified seasons, within each position and pooled
 *   (weighted by pairs), since between-position gaps would inflate it;
 * - split-half: r between the odd and the even weeks of a qualified season (each half qualified
 *   at half the sample), corrected to a full season by Spearman–Brown;
 * - prior: the sample at which a rate is half signal, k = n × (1 − r) / r at the halves' median
 *   sample n: what the `shrunk` transform gives the league mean (spec §8.5).
 */

/** Pairs a correlation needs to be reported. */
export const MIN_PAIRS = 30
/** Reliability from the year-to-year r. */
export const RELIABILITY = { high: 0.6, medium: 0.35 } as const

export const reliabilityOf = (r: number | null): MetricStability['reliability'] =>
  r === null ? null : r >= RELIABILITY.high ? 'high' : r >= RELIABILITY.medium ? 'medium' : 'low'

/** What stability can be measured on: summed metrics with a season grain (a combine profile is constant). */
function measurable(m: MetricDef): boolean {
  const tokens = componentsOf(m)
  const states = tokens.filter((t) => t.startsWith('last:'))
  if (m.entity === 'player' && states.length > 0) return false
  return grainsOf(m).includes('season') || grainsOf(m).includes('week')
}

/** Pearson r within each group of pairs (≥ 10 pairs), pooled by pairs; null under `MIN_PAIRS`. */
function pooled(pairs: { group: string; x: number; y: number }[]): { r: number | null; n: number } {
  const by = new Map<string, { x: number[]; y: number[] }>()
  for (const p of pairs) {
    const g = by.get(p.group) ?? { x: [], y: [] }
    g.x.push(p.x)
    g.y.push(p.y)
    by.set(p.group, g)
  }
  let sum = 0
  let n = 0
  for (const g of by.values()) {
    if (g.x.length < 10) continue
    const r = pearson(g.x, g.y)
    if (!Number.isFinite(r)) continue
    sum += r * g.x.length
    n += g.x.length
  }
  return n >= MIN_PAIRS ? { r: sum / n, n } : { r: null, n }
}

async function rowsOf(
  db: StatsDb,
  entity: Entity,
  metrics: MetricDef[],
  seasons: number[],
  halves: boolean
): Promise<StabilityRow[][]> {
  const positions = metrics[0].positions
  const compiled = compileQuery(
    {
      entity,
      metrics: metrics.map((m) => m.id),
      scope: {
        seasons,
        seasonType: 'REG',
        ...(entity === 'player' && positions !== 'all' ? { positions } : {})
      },
      groupBy: ['season'],
      // Fantasy metrics are measured under PPR.
      scoring: 'ppr'
    },
    {
      currentSeason: Math.max(...seasons),
      hasLeague: false,
      internal: { unlimited: true, halves }
    }
  )
  // A season is about 17 games; a half about 8.5 (the qualification factor, spec amendment E).
  const sql = compiled.sql.replaceAll('$factor', halves ? '0.5' : '1')
  const raw = await db.all<Record<string, unknown>>(sql, compiled.params)
  return metrics.map((_, i) =>
    raw
      .filter(
        (r) => r[`q${i}`] === true && typeof r[`v${i}`] === 'number' && Number.isFinite(r[`v${i}`])
      )
      .map((r) => ({
        id: String(r.id),
        season: Number(r.g_season),
        half: halves ? Number(r.g_half) : null,
        position: (r.position as string | null) ?? null,
        v: r[`v${i}`] as number,
        s: Number(r[`s${i}`] ?? 0)
      }))
  )
}

const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted.length === 0 ? NaN : sorted[Math.floor(sorted.length / 2)]
}

/** A qualified row of a metric: one player (team) season, or one half of it. */
export interface StabilityRow {
  id: string
  season: number
  /** 1 for the odd weeks, 0 for the even ones; null for a whole season. */
  half: number | null
  position: string | null
  v: number
  /** The metric's sample. */
  s: number
}

/**
 * One metric's stability from its qualified rows: year to year from consecutive seasons, the
 * split-half r (corrected to a season) and, for a rate, the prior from the halves. `halves` is
 * null for a state (a rating at the end of the scope has no halves).
 */
export function stabilityFrom(
  full: StabilityRow[],
  halves: StabilityRow[] | null,
  kind: MetricDef['kind']
): MetricStability {
  const bySeason = new Map(full.map((r) => [`${r.id}|${r.season}`, r]))
  const yoy = pooled(
    full.flatMap((r) => {
      const next = bySeason.get(`${r.id}|${r.season + 1}`)
      return next ? [{ group: r.position ?? '', x: r.v, y: next.v }] : []
    })
  )
  let splitHalf: number | null = null
  let prior: number | null = null
  if (halves) {
    const byHalf = new Map(halves.map((r) => [`${r.id}|${r.season}|${r.half}`, r]))
    const pairs = halves
      .filter((r) => r.half === 1)
      .flatMap((r) => {
        const even = byHalf.get(`${r.id}|${r.season}|0`)
        return even ? [{ group: r.position ?? '', x: r.v, y: even.v, n: (r.s + even.s) / 2 }] : []
      })
    const half = pooled(pairs)
    if (half.r !== null) {
      splitHalf = half.r > 0 ? (2 * half.r) / (1 + half.r) : half.r
      const n = median(pairs.map((p) => p.n))
      if (kind === 'rate' && half.r > 0 && Number.isFinite(n) && n > 0) {
        prior = (n * (1 - half.r)) / half.r
      }
    }
  }
  return {
    yearToYear: yoy.r,
    pairs: yoy.n,
    splitHalf,
    prior,
    reliability: reliabilityOf(yoy.r)
  }
}

/** Measures every catalogue metric; `through` is the last season used (the prior season). */
export async function measureStability(
  db: StatsDb,
  through: number
): Promise<Map<string, MetricStability>> {
  const seasons: number[] = []
  for (let s = STATS_FIRST_SEASON; s <= through; s++) seasons.push(s)
  const out = new Map<string, MetricStability>()
  // Two seasons with games at least: there is nothing to pair before.
  const played = await db.get<{ n: number }>(
    `SELECT count(DISTINCT season)::INTEGER AS n FROM player_week
     WHERE season BETWEEN ${STATS_FIRST_SEASON} AND ${Math.trunc(through)}`
  )
  if (seasons.length < 2 || (played?.n ?? 0) < 2) return out
  // Batches share the positions they apply to, so each query reads only those players' rows.
  const batches: MetricDef[][] = []
  for (const entity of ['player', 'team'] as Entity[]) {
    const groups = new Map<string, MetricDef[]>()
    for (const m of CATALOGUE.filter((x) => x.entity === entity && measurable(x))) {
      const key = m.positions === 'all' ? 'all' : [...m.positions].sort().join(',')
      groups.set(key, [...(groups.get(key) ?? []), m])
    }
    for (const group of groups.values()) {
      for (let i = 0; i < group.length; i += MAX_METRICS) {
        batches.push(group.slice(i, i + MAX_METRICS))
      }
    }
  }
  for (const batch of batches) {
    const entity = batch[0].entity
    const full = await rowsOf(db, entity, batch, seasons, false)
    const halved = batch.filter((m) => !componentsOf(m).some((t) => t.startsWith('last:')))
    const halves = halved.length > 0 ? await rowsOf(db, entity, halved, seasons, true) : []
    batch.forEach((m, j) => {
      const h = halved.indexOf(m)
      out.set(m.id, stabilityFrom(full[j], h >= 0 ? halves[h] : null, m.kind))
    })
  }
  return out
}

export const STABILITY_COLUMNS: Record<string, string> = {
  metric_id: 'VARCHAR',
  year_to_year: 'DOUBLE',
  pairs: 'INTEGER',
  split_half: 'DOUBLE',
  prior: 'DOUBLE',
  reliability: 'VARCHAR',
  through: 'INTEGER'
}

/** Writes `metric_stability`, one row per measured metric. */
export async function writeStability(
  db: StatsDb,
  stability: Map<string, MetricStability>,
  through: number
): Promise<void> {
  await writeTable(
    db,
    'metric_stability',
    STABILITY_COLUMNS,
    [...stability].map(([id, s]) => [
      id,
      s.yearToYear,
      s.pairs,
      s.splitHalf,
      s.prior,
      s.reliability,
      through
    ])
  )
}

/** Reads `metric_stability` (empty before the models first run). */
export async function readStability(db: StatsDb): Promise<Map<string, MetricStability>> {
  const exists = await db.get(
    "SELECT 1 FROM duckdb_tables() WHERE schema_name = 'main' AND table_name = 'metric_stability'"
  )
  if (!exists) return new Map()
  const rows = await db.all<{
    metric_id: string
    year_to_year: number | null
    pairs: number
    split_half: number | null
    prior: number | null
    reliability: MetricStability['reliability']
  }>('SELECT * FROM metric_stability')
  return new Map(
    rows.map((r) => [
      r.metric_id,
      {
        yearToYear: r.year_to_year,
        pairs: r.pairs,
        splitHalf: r.split_half,
        prior: r.prior,
        reliability: r.reliability
      }
    ])
  )
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/main/stats/models
```

Expected: PASS (24 passed).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/stats/models/stability.ts tests/main/stats/models/stability.test.ts
git add src/main/stats/models/stability.ts tests/main/stats/models/stability.test.ts
git commit -m "feat(stats): measure metric stability"
```

---

### Task 7: The model tables and the models step (spec §8; amendments A, D, F, L)

**Files:**

- Create: `src/main/stats/models/load.ts`, `src/main/stats/models/team.ts`, `src/main/stats/models/profile.ts`, `src/main/stats/models/build.ts`, `tests/main/stats/models/build.test.ts`
- Modify: `src/main/stats/sync.ts`, `tests/main/stats/sync.test.ts`, `tests/fixtures/statsSync.ts`, `tests/fixtures/stats.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/stats/models/build.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { modelsStale, rebuildModels } from '@main/stats/models/build'
import { eloShift, winProbability } from '@main/stats/models/elo'
import { measureStability, readStability, writeStability } from '@main/stats/models/stability'
import { buildViews } from '@main/stats/views'
import { openTestDb } from '../../../fixtures/stats'
import { seedGame, seedTable } from '../../../fixtures/statsDerived'

const KICKER = '00-0000030'

async function seeded(): Promise<Awaited<ReturnType<typeof openTestDb>>> {
  const db = await openTestDb()
  await seedGame(db)
  // Two field goals by BUF's kicker: a 30-yard make and a 55-yard miss.
  await db.exec('ALTER TABLE src_pbp ADD COLUMN kick_distance DOUBLE')
  await db.exec('ALTER TABLE src_pbp ADD COLUMN field_goal_result VARCHAR')
  await db.exec(`INSERT INTO src_pbp BY NAME
    SELECT 100 + i AS play_id, 2025 AS season, 1 AS week, 'REG' AS season_type, 'g1' AS game_id,
           'BUF' AS posteam, 'KC' AS defteam, 'field_goal' AS play_type, 1.0 AS field_goal_attempt,
           '${KICKER}' AS kicker_player_id, d AS kick_distance, r AS field_goal_result,
           1.0 AS down, 4.0 AS qtr, 0.5 AS wp, 0.0 AS epa
    FROM (VALUES (1, 30.0, 'made'), (2, 55.0, 'missed')) t(i, d, r)`)
  await buildViews(db)
  await rebuildDerived(db, { seasons: 'all', league: null })
  return db
}

describe('the model tables (stats-analysis spec §8)', () => {
  it('rates every game, every team-week, the simulation and the kicks', async () => {
    const db = await seeded()
    expect(await modelsStale(db)).toBe(true)
    const first = await rebuildModels(db, { stability: true, through: 2024, runs: 200 })
    expect(first).toMatchObject({
      rows: { elo_games: 2, team_forecast: 64, team_model_week: 64, player_model_week: 1 },
      simulated: 2,
      measured: 0
    })
    expect(await modelsStale(db)).toBe(false)
    // g1: BUF 27–20 KC at home; g2 (week 2) is rated with the ratings after it.
    const shift = eloShift(48, 7)
    const games = await db.all<Record<string, number | boolean>>(
      'SELECT game_id, played, home_elo_pre, home_wp, home_elo_post, away_elo_pre FROM elo_games ORDER BY week'
    )
    expect(games[0]).toMatchObject({ played: true, home_elo_pre: 1500 })
    expect(games[0].home_wp).toBeCloseTo(winProbability(48), 9)
    expect(games[0].home_elo_post).toBeCloseTo(1500 + shift, 9)
    expect(games[1]).toMatchObject({ played: false })
    expect(games[1].away_elo_pre).toBeCloseTo(1500 + shift, 9)

    const week = async (team: string, w: number): Promise<Record<string, number | null>> =>
      (await db.get(`SELECT * FROM team_model_week WHERE team = '${team}' AND week = ${w}`))!
    const buf0 = await week('BUF', 0)
    const buf1 = await week('BUF', 1)
    expect(buf0).toMatchObject({
      elo: 1500,
      srs: null,
      adj_off_epa: null,
      elo_games: 0,
      games_left: 2
    })
    expect(buf1).toMatchObject({ srs: expect.closeTo(3.5, 3), mov: 7, games_left: 1, elo_games: 1 })
    expect(buf1.elo).toBeCloseTo(1500 + shift, 9)
    expect(buf1.elo_wp).toBeCloseTo(winProbability(48), 9)
    expect(buf1.sos_elo).toBeCloseTo(1500 - shift, 9)
    expect(buf1.adj_off_epa).not.toBeNull()
    expect(buf1.playoff_pct).toBeGreaterThan(0)
    expect(buf1).toMatchObject({
      fg_model_att: 2,
      fg_model_made: 1,
      off_fumbles: 0,
      off_xints: null
    })
    expect(buf1.fg_xmade).toBeGreaterThan(0.6)
    expect(buf1.fg_xmade).toBeLessThan(1.9)
    // A team without a game that week still has its row (the state at the end of the week); one
    // without a game all season has no rating.
    expect(await week('KC', 0)).toMatchObject({ elo: 1500, elo_games: 0 })
    expect(await week('DAL', 1)).toMatchObject({ elo: null, elo_games: 0 })
    expect(
      await db.get(
        `SELECT fg_model_att, fg_model_made FROM player_model_week WHERE gsis_id = '${KICKER}'`
      )
    ).toEqual({ fg_model_att: 2, fg_model_made: 1 })

    // Sealed weeks are cached: only the current season's latest week runs again.
    expect(
      (await rebuildModels(db, { stability: false, through: 2024, runs: 200 })).simulated
    ).toBe(1)
  })

  it('scores the combine by position percentile', async () => {
    const db = await seeded()
    const wr = (
      name: string,
      forty: number,
      extra: Record<string, number | null> = {}
    ): Record<string, string | number | null> => ({
      season: 2020,
      player_name: name,
      school: 'State',
      pos: 'WR',
      ht: '6-1',
      wt: 200,
      forty,
      bench: 15,
      vertical: 36,
      broad_jump: 120,
      cone: 7,
      shuttle: 4.2,
      draft_round: 1,
      draft_ovr: 10,
      ...extra
    })
    await seedTable(db, 'src_combine', [
      wr('Fast', 4.3),
      wr('Mid', 4.5),
      wr('Slow', 4.7),
      // Only height, weight and the 40: too few measures for a score.
      wr('Partial', 4.4, {
        bench: null,
        vertical: null,
        broad_jump: null,
        cone: null,
        shuttle: null
      })
    ])
    await seedTable(db, 'combine_ids', [
      {
        season: 2020,
        player_name: 'Fast',
        school: 'State',
        gsis_id: '00-0000101',
        resolution: 'pfr'
      },
      {
        season: 2020,
        player_name: 'Slow',
        school: 'State',
        gsis_id: '00-0000103',
        resolution: 'pfr'
      },
      {
        season: 2020,
        player_name: 'Partial',
        school: 'State',
        gsis_id: '00-0000104',
        resolution: 'pfr'
      }
    ])
    await rebuildModels(db, { stability: false, through: 2024, runs: 50 })
    const rows = await db.all<Record<string, number | null>>(
      'SELECT gsis_id, forty_score, ras_measures, ras, speed_score FROM player_profile ORDER BY gsis_id'
    )
    // Percentiles count every combine row, linked or not: the fastest of four 40s scores 10.
    expect(rows.map((r) => [r.gsis_id, r.forty_score, r.ras_measures])).toEqual([
      ['00-0000101', 10, 8],
      ['00-0000103', 0, 8],
      ['00-0000104', expect.closeTo(20 / 3, 6), 3]
    ])
    expect(rows[2].ras).toBeNull()
    expect(rows[0].speed_score).toBeCloseTo((200 * 200) / 4.3 ** 4, 6)
    // Every other measure ties at 5 of 10 among the three who did it.
    expect(rows[0].ras).toBeCloseTo((10 + 7 * 5) / 8, 1)
  })

  // About sixty queries over the whole catalogue.
  it(
    'measures the catalogue on the database and keeps it with the file',
    { timeout: 30_000 },
    async () => {
      const db = await openTestDb()
      await seedGame(db)
      await rebuildDerived(db, { seasons: 'all', league: null })
      await rebuildModels(db, { stability: false, through: 2024, runs: 50 })
      // One season: nothing to pair.
      expect((await measureStability(db, 2025)).size).toBe(0)
      // A copy of 2025 as 2024 pairs every player with himself: too few pairs for an r.
      for (const t of ['player_week', 'player_season', 'team_week', 'team_season']) {
        await db.exec(
          `INSERT INTO ${t} SELECT * REPLACE (2024 AS season) FROM ${t} WHERE season = 2025`
        )
      }
      const measured = await measureStability(db, 2025)
      expect(measured.get('targets')).toMatchObject({
        yearToYear: null,
        pairs: 0,
        reliability: null
      })
      expect(measured.size).toBeGreaterThan(250)
      expect(measured.has('ras')).toBe(false)
      await writeStability(db, measured, 2025)
      expect(await readStability(db)).toEqual(measured)
    }
  )
})
```

The sync tests expect the models step after the derived one. The sync fixture runs 100 simulations, and each test database spills to its own directory (Planning findings: a test-only race):

```diff
diff --git a/tests/main/stats/sync.test.ts b/tests/main/stats/sync.test.ts
index 6c6d4c5..0587ad1 100644
--- a/tests/main/stats/sync.test.ts
+++ b/tests/main/stats/sync.test.ts
@@ -233,7 +233,9 @@ describe('the derived rebuild (stats-analysis spec §5.2)', () => {
     await seedGame(db)
     const first = await runSync(db, { only: [] })
     expect(first.steps.map((s) => [s.source, s.status, s.message])).toEqual([
-      ['stats:derived', 'ok', 'all seasons']
+      ['stats:derived', 'ok', 'all seasons'],
+      // Spec §8: the models follow; 2025 is simulated before week 1 and after it (week 2 is unplayed).
+      ['stats:models', 'ok', 'simulated 2 weeks']
     ])
     expect(await db.get('SELECT count(*) AS n FROM player_week')).toEqual({ n: 7 })
     expect((await runSync(db, { only: [] })).steps).toEqual([])
@@ -253,13 +255,31 @@ describe('the derived rebuild (stats-analysis spec §5.2)', () => {
     await db.exec('ALTER TABLE player_week ADD COLUMN targets DOUBLE')
     const retried = await runSync(db, { only: [] })
     expect(retried.steps.map((s) => [s.source, s.status, s.message])).toEqual([
-      ['stats:derived', 'ok', 'seasons 2025']
+      ['stats:derived', 'ok', 'seasons 2025'],
+      // Only the latest week of the current season is simulated again.
+      ['stats:models', 'ok', 'simulated 1 week']
     ])
     expect(await db.get("SELECT value FROM stats_settings WHERE key = 'derived_pending'")).toEqual({
       value: '[]'
     })
   })

+  it('runs the models again until a run succeeds, and after a model version change (spec §8)', async () => {
+    const db = await openTestDb()
+    await seedGame(db)
+    await runSync(db, { only: [] })
+    // A failed or interrupted models step leaves its flag set.
+    await db.exec("INSERT OR REPLACE INTO stats_settings VALUES ('models_pending', '1')")
+    expect((await runSync(db, { only: [] })).steps.map((s) => [s.source, s.status])).toEqual([
+      ['stats:models', 'ok']
+    ])
+    expect((await runSync(db, { only: [] })).steps).toEqual([])
+    await db.exec("UPDATE derived_state SET version = 0 WHERE name = 'models'")
+    expect((await runSync(db, { only: [] })).steps.map((s) => [s.source, s.message])).toEqual([
+      ['stats:models', 'simulated 2 weeks']
+    ])
+  })
+
   it('scores the league’s rules when it has them', async () => {
     const db = await openTestDb()
     await seedGame(db)
```

```diff
diff --git a/tests/fixtures/statsSync.ts b/tests/fixtures/statsSync.ts
index 00402ff..96622b9 100644
--- a/tests/fixtures/statsSync.ts
+++ b/tests/fixtures/statsSync.ts
@@ -56,7 +56,8 @@ export async function runSync(db: StatsDb, options: RunOptions = {}): Promise<St
     tempDir: tempDir(),
     nflState: async () => options.state ?? STATE_2026,
     now: () => options.now ?? new Date('2026-10-16T12:00:00Z'),
-    league: () => options.league ?? null
+    league: () => options.league ?? null,
+    simulationRuns: 100
   }
   const steps = options.only ? STATS_STEPS.filter((s) => options.only?.includes(s.id)) : STATS_STEPS
   return refreshStats(deps, { force: options.force }, steps)
```

```diff
diff --git a/tests/fixtures/stats.ts b/tests/fixtures/stats.ts
index 8876ec9..246b63b 100644
--- a/tests/fixtures/stats.ts
+++ b/tests/fixtures/stats.ts
@@ -13,9 +13,17 @@ afterEach(() => {
   for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
 })

-/** An in-memory stats database with the macros and bookkeeping tables; closed after the test. */
+/**
+ * An in-memory stats database with the macros and bookkeeping tables; closed after the test. It
+ * spills to its own temp directory: DuckDB's default (`.tmp` in the working directory) is shared by
+ * every test worker, and two workers' spill files corrupt each other.
+ */
 export async function openTestDb(now = new Date('2026-10-16T12:00:00Z')): Promise<StatsDb> {
-  const db = await StatsDb.open(':memory:', { threads: 1, memoryLimit: '256MB' })
+  const db = await StatsDb.open(':memory:', {
+    threads: 1,
+    memoryLimit: '256MB',
+    tempDirectory: join(tempDir(), 'duckdb')
+  })
   opened.push(db)
   await bootstrapStatsDb(db, now)
   return db
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/main/stats/models/build.test.ts tests/main/stats/sync.test.ts
```

Expected: FAIL: `build.test.ts` cannot load `@main/stats/models/build`, and the sync tests find no `stats:models` step.

- [ ] **Step 3: What the models read, the team-week rows, the combine**

Create `src/main/stats/models/load.ts`:

```ts
import type { StatsDb } from '../db'
import { columnsOf, type Have } from '../derived/sql'
import { STATS_FIRST_SEASON } from '../sources'
import type { EpaCell } from './adjusted'
import type { EloGame } from './elo'
import type { FieldGoalAttempt } from './fieldGoal'

/** What the models read from the raw layer (stats-analysis spec §8); a missing column reads as NULL. */

/** `alias.column`, or a typed NULL when the table lacks it (a source can drop a column). */
export const col =
  (have: Have, table: string, alias: string) =>
  (name: string, type = 'DOUBLE'): string =>
    columnsOf(have, table).has(name) ? `${alias}.${name}` : `NULL::${type}`

/** A neutral site, from the schedule's location (alias `g`). */
const neutralOf = (have: Have): string =>
  `coalesce(${col(have, 'games', 'g')('location', 'VARCHAR')} = 'Neutral', false)`

/** Every game since 2019, played or scheduled; the margin is home minus away. */
export async function loadGames(db: StatsDb, have: Have): Promise<EloGame[]> {
  const g = col(have, 'games', 'g')
  return db.all<EloGame>(
    `SELECT g.game_id, g.season, season_type_of(g.game_type) AS season_type, g.week, g.home_team,
            g.away_team, ${neutralOf(have)} AS neutral,
            (g.home_score - g.away_score)::DOUBLE AS result,
            ${g('spread_line')}::DOUBLE AS spread_line,
            ${g('home_moneyline')}::DOUBLE AS home_moneyline,
            ${g('away_moneyline')}::DOUBLE AS away_moneyline
     FROM games g
     WHERE g.season >= ${STATS_FIRST_SEASON} AND season_type_of(g.game_type) IS NOT NULL`
  )
}

export type PlayKind = 'pass' | 'rush'
export type SeasonCell = EpaCell & { season: number; kind: PlayKind }

/**
 * Scrimmage plays summed by offense × defense × home × week and kind (dropbacks, other runs),
 * garbage time left out (spec §8.2: the fourth quarter with win probability outside 10–90 %).
 */
export async function loadCells(db: StatsDb, have: Have): Promise<SeasonCell[]> {
  return db.all<SeasonCell>(
    `SELECT p.season, p.week, p.posteam AS off, p.defteam AS def,
            CASE WHEN ${neutralOf(have)} THEN 0 WHEN p.posteam = g.home_team THEN 1 ELSE -1 END AS home,
            CASE WHEN p.is_dropback THEN 'pass' ELSE 'rush' END AS kind,
            count(*)::DOUBLE AS plays, sum(p.epa) AS epa
     FROM plays p JOIN games g ON g.game_id = p.game_id
     WHERE p.counts AND p.play_type IN ('pass', 'run') AND p.epa IS NOT NULL
       AND p.posteam IS NOT NULL AND p.defteam IS NOT NULL
       AND NOT (p.qtr = 4 AND (p.wp < 0.1 OR p.wp > 0.9))
     GROUP BY ALL`
  )
}

export interface Kick extends FieldGoalAttempt {
  season_type: 'REG' | 'POST'
  week: number
  kicker: string | null
  team: string | null
}

/** Every field-goal attempt with its kicker, team and weather. */
export async function loadFieldGoals(db: StatsDb, have: Have): Promise<Kick[]> {
  const p = col(have, 'plays', 'p')
  const g = col(have, 'games', 'g')
  const rows = await db.all<Omit<Kick, 'made'> & { made: unknown }>(
    `SELECT p.game_id, p.play_id::INTEGER AS play_id, p.season, p.season_type, p.week,
            ${p('kicker_player_id', 'VARCHAR')} AS kicker, p.posteam AS team,
            ${p('kick_distance')}::DOUBLE AS distance,
            ${p('field_goal_result', 'VARCHAR')} = 'made' AS made, ${g('roof', 'VARCHAR')} AS roof,
            ${g('surface', 'VARCHAR')} AS surface, ${g('temp')}::DOUBLE AS temp,
            ${g('wind')}::DOUBLE AS wind
     FROM plays p JOIN games g ON g.game_id = p.game_id
     WHERE ${p('field_goal_attempt')} = 1 AND ${p('kick_distance')} IS NOT NULL`
  )
  return rows.map((r) => ({ ...r, made: r.made === true }))
}

/**
 * Turnover luck components (spec §8.3) by team and week. Fumbles: the team's own and its
 * opponents', and those lost. Interceptions (FTN, 2022+): thrown and taken, and the expected number
 * (interception-worthy throws × that season's league rate of interceptions per such throw, since
 * FTN's charting changed: 0.44 in 2022, 0.69 in 2025). Without FTN, the expected ones are NULL.
 */
export function turnoversSql(have: Have): string {
  const p = col(have, 'plays', 'p')
  return `
  WITH att AS (
    SELECT p.season, p.week, p.posteam, p.defteam, coalesce(${p('fumble')}, 0) = 1 AS fumble,
           coalesce(${p('fumble_lost')}, 0) = 1 AS lost,
           coalesce(${p('pass_attempt')}, 0) = 1 AND coalesce(${p('sack')}, 0) = 0 AS attempt,
           coalesce(${p('interception')}, 0) = 1 AS int,
           ${p('is_interception_worthy', 'BOOLEAN')} AS worthy
    FROM plays p WHERE p.counts AND p.play_type IN ('pass', 'run')
  ),
  rate AS (
    SELECT season,
           count(*) FILTER (attempt AND int)::DOUBLE
             / nullif(count(*) FILTER (attempt AND worthy), 0) AS r
    FROM att WHERE worthy IS NOT NULL GROUP BY season
  ),
  side AS (
    SELECT season, week, posteam AS team, 'off' AS side, fumble, lost, attempt, int, worthy FROM att
    UNION ALL
    SELECT season, week, defteam, 'def', fumble, lost, attempt, int, worthy FROM att
  )
  SELECT s.team, s.season, s.week,
         count(*) FILTER (s.side = 'off' AND s.fumble) AS off_fumbles,
         count(*) FILTER (s.side = 'off' AND s.lost) AS off_fumbles_lost,
         count(*) FILTER (s.side = 'def' AND s.fumble) AS def_fumbles,
         count(*) FILTER (s.side = 'def' AND s.lost) AS def_fumbles_lost,
         count(*) FILTER (s.side = 'off' AND s.attempt AND s.worthy IS NOT NULL) AS off_ftn_att,
         count(*) FILTER (s.side = 'off' AND s.attempt AND s.worthy IS NOT NULL AND s.int) AS off_ftn_ints,
         count(*) FILTER (s.side = 'off' AND s.attempt AND s.worthy) * any_value(r.r) AS off_xints,
         count(*) FILTER (s.side = 'def' AND s.attempt AND s.worthy IS NOT NULL AND s.int) AS def_ftn_ints,
         count(*) FILTER (s.side = 'def' AND s.attempt AND s.worthy) * any_value(r.r) AS def_xints
  FROM side s LEFT JOIN rate r ON r.season = s.season
  WHERE s.team IS NOT NULL
  GROUP BY ALL`
}
```

Create `src/main/stats/models/team.ts`:

```ts
import { fitAdjusted, recencyWeight, type AdjustedFit, type EpaCell } from './adjusted'
import { ADJUSTED_STATES } from './columns'
import { ratingsAfter, type EloGame, type EloRow } from './elo'
import type { SeasonCell } from './load'
import { srs } from './ratings'
import { DIVISIONS, type TeamOdds } from './simulate'

/** Every team, by nflverse code. */
export const TEAMS = Object.values(DIVISIONS).flat().sort()

/** Regular-season weeks: 17 through 2020, 18 since. */
export const regWeeks = (season: number): number => (season <= 2020 ? 17 : 18)

type Fits = Record<string, AdjustedFit>

/**
 * Adjusted EPA as of each week of a season (spec §8.2): all plays, dropbacks and other runs, each
 * plain and recency-weighted (`recent_all`, …), from the plays of the weeks so far.
 */
export function adjustedAsOf(
  cells: SeasonCell[],
  season: number,
  lastWeek: number
): Map<number, Fits> {
  const own = cells.filter((c) => c.season === season)
  const out = new Map<number, Fits>()
  for (let w = 1; w <= lastWeek; w++) {
    const fits: Fits = {}
    for (const kind of ['all', 'pass', 'rush'] as const) {
      // The fit's cells are offense × defense × home × week; a kind keeps its own plays.
      const merged = new Map<string, EpaCell>()
      for (const c of own) {
        if (c.week > w || (kind !== 'all' && c.kind !== kind)) continue
        const key = `${c.off}|${c.def}|${c.home}|${c.week}`
        const m = merged.get(key) ?? {
          off: c.off,
          def: c.def,
          home: c.home,
          week: c.week,
          plays: 0,
          epa: 0
        }
        m.plays += c.plays
        m.epa += c.epa
        merged.set(key, m)
      }
      const list = [...merged.values()]
      fits[kind] = fitAdjusted(list, TEAMS)
      fits[`recent_${kind}`] = fitAdjusted(list, TEAMS, { weight: recencyWeight(w) })
    }
    out.set(w, fits)
  }
  return out
}

/** `adj_[recent_]{off,def}[_kind]_epa` → its fit and side. */
function adjustedOf(name: string): { fit: string; side: 'off' | 'def' } {
  const m = /^adj_(recent_)?(off|def)(?:_(pass|rush))?_epa$/.exec(name)
  if (!m) throw new Error(`not an adjusted column: ${name}`)
  return { fit: `${m[1] ?? ''}${m[3] ?? 'all'}`, side: m[2] as 'off' | 'def' }
}

/** Sums over a team's game in a week (spec §8.1: expected wins; §8.4: field goals). */
export interface GameSums {
  elo_games: number
  elo_wp: number
  vegas_games: number
  vegas_wp: number
  elo_pre: number
  opp_elo_pre: number
}

/** Per team and week (`team|season|week`): the Elo and Vegas sums of its played games. */
export function gameSums(elo: EloRow[]): Map<string, GameSums> {
  const out = new Map<string, GameSums>()
  for (const r of elo) {
    if (!r.played) continue
    for (const home of [true, false]) {
      const key = `${home ? r.home_team : r.away_team}|${r.season}|${r.week}`
      const s = out.get(key) ?? {
        elo_games: 0,
        elo_wp: 0,
        vegas_games: 0,
        vegas_wp: 0,
        elo_pre: 0,
        opp_elo_pre: 0
      }
      s.elo_games += 1
      s.elo_wp += home ? r.home_wp : 1 - r.home_wp
      if (r.vegas_home_wp !== null) {
        s.vegas_games += 1
        s.vegas_wp += home ? r.vegas_home_wp : 1 - r.vegas_home_wp
      }
      s.elo_pre += home ? r.home_elo_pre : r.away_elo_pre
      s.opp_elo_pre += home ? r.away_elo_pre : r.home_elo_pre
      out.set(key, s)
    }
  }
  return out
}

export interface FgSums {
  fg_model_att: number
  fg_model_made: number
  fg_xmade: number
}

export interface TeamWeekInput {
  season: number
  /** The last week with a played game (0 before the season). */
  lastWeek: number
  games: EloGame[]
  elo: EloRow[]
  cells: SeasonCell[]
  /** `team|week` → the simulation as of that week (regular season only). */
  forecast: Map<string, TeamOdds>
  /** `team|week` → field goals the model rated. */
  kicks: Map<string, FgSums>
  sums: Map<string, GameSums>
}

const mean = (xs: (number | null | undefined)[]): number | null => {
  const ok = xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return ok.length > 0 ? ok.reduce((a, b) => a + b, 0) / ok.length : null
}

/**
 * `team_model_week` rows of one season (spec §8): every team at the end of every week from 0
 * (before the season) to the last played one, byes included, so a state "at the end of the
 * scope" always has a row. States: Elo, SRS and average margin, adjusted EPA, schedule strength
 * played and left (opponents' current Elo and adjusted EPA margin), the simulation. Sums: the
 * team's game that week.
 */
export function teamWeekRows(input: TeamWeekInput): Record<string, unknown>[] {
  const { season, games } = input
  const own = games.filter((g) => g.season === season)
  const adjusted = adjustedAsOf(input.cells, season, input.lastWeek)
  const rows: Record<string, unknown>[] = []
  for (let w = 0; w <= input.lastWeek; w++) {
    const played = own.filter((g) => g.result !== null && g.week <= w)
    const ratings =
      played.length > 0
        ? srs(
            played.map((g) => ({
              home: g.home_team,
              away: g.away_team,
              margin: g.result as number
            }))
          )
        : new Map<string, number>()
    const fits = adjusted.get(w)
    const elo = ratingsAfter(input.elo, season, w)
    const net = (t: string): number | null =>
      fits ? (fits.all.off.get(t) ?? 0) - (fits.all.def.get(t) ?? 0) : null
    const left = own.filter((g) => g.season_type === 'REG' && g.week > w)
    const seasonType = w > regWeeks(season) ? 'POST' : 'REG'
    for (const team of TEAMS) {
      const opponents = (list: EloGame[]): string[] =>
        list
          .filter((g) => g.home_team === team || g.away_team === team)
          .map((g) => (g.home_team === team ? g.away_team : g.home_team))
      const faced = opponents(played)
      const ahead = opponents(left)
      const margins = played
        .filter((g) => g.home_team === team || g.away_team === team)
        .map((g) => (g.home_team === team ? (g.result as number) : -(g.result as number)))
      const odds = w <= regWeeks(season) ? input.forecast.get(`${team}|${w}`) : undefined
      const sums = input.sums.get(`${team}|${season}|${w}`)
      const fg = input.kicks.get(`${team}|${w}`)
      const row: Record<string, unknown> = {
        team,
        season,
        season_type: seasonType,
        week: w,
        elo: elo.get(team) ?? null,
        srs: ratings.get(team) ?? null,
        mov: mean(margins)
      }
      for (const name of ADJUSTED_STATES) {
        const { fit, side } = adjustedOf(name)
        row[name] = fits
          ? fits[fit].mean + ((side === 'off' ? fits[fit].off : fits[fit].def).get(team) ?? 0)
          : null
      }
      Object.assign(row, {
        sos_elo: mean(faced.map((o) => elo.get(o))),
        sos_adj: mean(faced.map(net)),
        sos_left_elo: mean(ahead.map((o) => elo.get(o))),
        sos_left_adj: mean(ahead.map(net)),
        games_left: ahead.length,
        proj_wins: odds?.wins ?? null,
        proj_losses: odds?.losses ?? null,
        proj_ties: odds?.ties ?? null,
        playoff_pct: odds?.playoffs ?? null,
        division_pct: odds?.division ?? null,
        bye_pct: odds?.bye ?? null,
        conference_pct: odds?.conference ?? null,
        sb_pct: odds?.superBowl ?? null,
        elo_games: sums?.elo_games ?? 0,
        elo_wp: sums?.elo_wp ?? 0,
        vegas_games: sums?.vegas_games ?? 0,
        vegas_wp: sums?.vegas_wp ?? 0,
        elo_pre: sums?.elo_pre ?? 0,
        opp_elo_pre: sums?.opp_elo_pre ?? 0,
        fg_model_att: fg?.fg_model_att ?? 0,
        fg_model_made: fg?.fg_model_made ?? 0,
        fg_xmade: fg?.fg_xmade ?? 0
      })
      rows.push(row)
    }
  }
  return rows
}
```

Create `src/main/stats/models/profile.ts`:

```ts
/**
 * Profile models (stats-analysis spec §8.7). Each combine measure is scored 0–10 by its percentile
 * within the position group over every combine since 2000 (ties share the middle); the athletic
 * score is their average, over the measures the player has (four at least, so height and weight
 * alone are not a score). Speed Score = 200 × weight / 40-time⁴ (Bill Barnwell's formula).
 */

/** Combine measures: the column, its `player_profile` name, and whether lower is better. */
export const COMBINE_MEASURES: { name: string; expr: string; lower: boolean }[] = [
  {
    name: 'height',
    expr: "try_cast(split_part(c.ht, '-', 1) AS INTEGER) * 12 + try_cast(split_part(c.ht, '-', 2) AS INTEGER)",
    lower: false
  },
  { name: 'weight', expr: 'c.wt', lower: false },
  { name: 'forty', expr: 'c.forty', lower: true },
  { name: 'bench', expr: 'c.bench', lower: false },
  { name: 'vertical', expr: 'c.vertical', lower: false },
  { name: 'broad_jump', expr: 'c.broad_jump', lower: false },
  { name: 'cone', expr: 'c.cone', lower: true },
  { name: 'shuttle', expr: 'c.shuttle', lower: true }
]

/** A relative athletic score needs this many measures. */
export const RAS_MIN_MEASURES = 4

/** Combine positions by position group (kickers, punters and snappers get no score). */
const GROUP = `CASE
    WHEN c.pos = 'QB' THEN 'QB'
    WHEN c.pos IN ('RB', 'FB') THEN 'RB'
    WHEN c.pos IN ('WR', 'CB/WR') THEN 'WR'
    WHEN c.pos = 'TE' THEN 'TE'
    WHEN c.pos IN ('OT', 'OG', 'C', 'OL', 'G') THEN 'OL'
    WHEN c.pos IN ('DT', 'DE', 'DL', 'EDGE') THEN 'DL'
    WHEN c.pos IN ('OLB', 'ILB', 'LB') THEN 'LB'
    WHEN c.pos IN ('CB', 'S', 'SAF', 'DB') THEN 'DB'
  END`

/**
 * A measure's 0–10 score: its mid-rank percentile within the position group (players tied on a
 * measure share the middle of their ranks, so a common 4.50 40 is not scored as the slowest).
 */
const score = (m: (typeof COMBINE_MEASURES)[number]): string => {
  const among = `PARTITION BY position_group, ${m.name} IS NULL`
  return `CASE WHEN ${m.name} IS NOT NULL AND position_group IS NOT NULL THEN
      10 * (rank() OVER (${among} ORDER BY ${m.name} ${m.lower ? 'DESC' : 'ASC'}) - 1
            + (count(*) OVER (PARTITION BY position_group, ${m.name}) - 1) / 2)
         / nullif(count(*) OVER (${among}) - 1, 0) END AS ${m.name}_score`
}

/**
 * `player_profile`: one row per combine attendee with a gsis id. Percentiles count every combine
 * row since 2000, linked to a player or not.
 */
const PROFILE_SQL = `
  WITH measured AS (
    SELECT c.season AS combine_season, c.player_name, c.school, c.pos AS combine_pos,
           ${GROUP} AS position_group,
           ${COMBINE_MEASURES.map((m) => `(${m.expr})::DOUBLE AS ${m.name}`).join(', ')},
           c.draft_round, c.draft_ovr
    FROM src_combine c
  ),
  scored AS (SELECT *, ${COMBINE_MEASURES.map(score).join(', ')} FROM measured),
  counted AS (
    SELECT *, ${COMBINE_MEASURES.map((m) => `(${m.name}_score IS NOT NULL)::INT`).join(' + ')} AS ras_measures
    FROM scored
  )
  SELECT i.gsis_id, s.* EXCLUDE (player_name, school),
         CASE WHEN s.ras_measures >= ${RAS_MIN_MEASURES} THEN
           (${COMBINE_MEASURES.map((m) => `coalesce(s.${m.name}_score, 0)`).join(' + ')}) / s.ras_measures END AS ras,
         CASE WHEN s.forty > 0 THEN 200 * s.weight / pow(s.forty, 4) END AS speed_score
  FROM counted s
  JOIN combine_ids i ON i.season = s.combine_season AND i.player_name = s.player_name
    AND i.school IS NOT DISTINCT FROM s.school
  WHERE i.gsis_id IS NOT NULL
  QUALIFY row_number() OVER (PARTITION BY i.gsis_id ORDER BY s.combine_season DESC) = 1`

/** Without the combine (not loaded yet), an empty table of the same shape. */
const EMPTY_PROFILE = `SELECT NULL::VARCHAR AS gsis_id, NULL::INTEGER AS combine_season,
    NULL::VARCHAR AS combine_pos, NULL::VARCHAR AS position_group,
    ${COMBINE_MEASURES.map((m) => `NULL::DOUBLE AS ${m.name}`).join(', ')},
    NULL::DOUBLE AS draft_round, NULL::DOUBLE AS draft_ovr,
    ${COMBINE_MEASURES.map((m) => `NULL::DOUBLE AS ${m.name}_score`).join(', ')},
    NULL::INTEGER AS ras_measures, NULL::DOUBLE AS ras, NULL::DOUBLE AS speed_score
  WHERE false`

/** `player_profile`'s select for the tables at hand. */
export const profileSql = (tables: ReadonlySet<string>): string =>
  tables.has('src_combine') && tables.has('combine_ids') ? PROFILE_SQL : EMPTY_PROFILE
```

- [ ] **Step 4: Rebuild the model tables**

Create `src/main/stats/models/build.ts`:

```ts
import type { StatsDb } from '../db'
import { inspect } from '../derived/build'
import { writeTable } from '../identity'
import { PLAYER_MODEL_SUMS, TEAM_MODEL_SUMS, TEAM_STATES, TURNOVER_SUMS } from './columns'
import { homeFieldOf, ratingsAfter, runElo, type EloGame, type EloRow } from './elo'
import { fgProbability, fitFieldGoals, FG_FEATURES } from './fieldGoal'
import { loadCells, loadFieldGoals, loadGames, turnoversSql, type Kick } from './load'
import { profileSql } from './profile'
import { simulateSeason, SIM_RUNS, type TeamOdds } from './simulate'
import { measureStability, writeStability } from './stability'
import { gameSums, regWeeks, teamWeekRows, type FgSums } from './team'

/** Bump to rebuild every model table (and every cached simulation) after a model change. */
export const MODELS_VERSION = 1
/** Simulations of sealed seasons' weeks (history for trend charts) run fewer times. */
export const HISTORY_RUNS = 2_000

export const MODEL_TABLES = [
  'elo_games',
  'team_forecast',
  'team_model_week',
  'player_model_week',
  'player_profile'
] as const

async function exists(db: StatsDb, table: string): Promise<boolean> {
  return (
    (await db.get("SELECT 1 FROM duckdb_tables() WHERE schema_name = 'main' AND table_name = ?", [
      table
    ])) !== null
  )
}

/** The model tables are missing or were built by an older `MODELS_VERSION`. */
export async function modelsStale(db: StatsDb): Promise<boolean> {
  const state = await db.get<{ version: number }>(
    "SELECT version FROM derived_state WHERE name = 'models'"
  )
  if ((state?.version ?? 0) < MODELS_VERSION) return true
  for (const t of MODEL_TABLES) if (!(await exists(db, t))) return true
  return false
}

/** The models need the derived tables (stability reads them) and play-by-play. */
export async function canModel(db: StatsDb): Promise<boolean> {
  return (
    (await exists(db, 'player_week')) &&
    (await exists(db, 'team_week')) &&
    (await exists(db, 'src_pbp'))
  )
}

/** Whether stability must be measured: never measured, or through an older season. */
export async function stabilityDue(db: StatsDb, through: number): Promise<boolean> {
  if (!(await exists(db, 'metric_stability'))) return true
  const row = await db.get<{ t: number | null }>('SELECT max(through) AS t FROM metric_stability')
  return (row?.t ?? 0) < through
}

export interface ModelsInput {
  /** Measure metric stability again (a past season changed, or it was never measured). */
  stability: boolean
  /** The last season stability reads: the prior season. */
  through: number
  /** Simulation runs of the current season's weeks (`SIM_RUNS`); sealed seasons run at most `HISTORY_RUNS`. */
  runs?: number
}

export interface ModelsResult {
  rows: Record<string, number>
  /** Season-weeks simulated (the others were cached). */
  simulated: number
  /** Metrics whose stability was measured; 0 when it was kept. */
  measured: number
}

type CachedOdds = TeamOdds & { runs: number }

const ODDS: (keyof TeamOdds)[] = [
  'wins',
  'losses',
  'ties',
  'playoffs',
  'division',
  'bye',
  'conference',
  'superBowl'
]

/**
 * Spec §8.1: the season simulation as of every regular-season week, cached in `team_forecast`.
 * Sealed weeks are kept; the current season's latest cached week (it may have been part-played)
 * and any new one run again. Returns `season` → `team|week` → odds, and how many weeks ran.
 */
async function simulations(
  db: StatsDb,
  games: EloGame[],
  elo: EloRow[],
  lastPlayed: Map<number, number>,
  options: { stale: boolean; current: number; runs: number }
): Promise<{ odds: Map<number, Map<string, CachedOdds>>; simulated: number }> {
  const cached =
    options.stale || !(await exists(db, 'team_forecast'))
      ? []
      : await db.all<CachedOdds & { season: number; week: number }>('SELECT * FROM team_forecast')
  const odds = new Map<number, Map<string, CachedOdds>>()
  const add = (season: number, week: number, o: CachedOdds): void => {
    const map = odds.get(season) ?? new Map<string, CachedOdds>()
    map.set(`${o.team}|${week}`, o)
    odds.set(season, map)
  }
  for (const r of cached) add(r.season, r.week, r)
  let simulated = 0
  for (const season of [...lastPlayed.keys()].sort((a, b) => a - b)) {
    const reg = games.filter((g) => g.season === season && g.season_type === 'REG')
    const last = Math.min(lastPlayed.get(season) ?? 0, regWeeks(season))
    const weeks = new Set(cached.filter((r) => r.season === season).map((r) => r.week))
    const latest = Math.max(-1, ...weeks)
    const runs = season === options.current ? options.runs : Math.min(options.runs, HISTORY_RUNS)
    for (let w = 0; w <= last; w++) {
      if (weeks.has(w) && !(season === options.current && w >= latest)) continue
      const result = simulateSeason({
        season,
        games: reg.map((g) => ({
          week: g.week,
          home: g.home_team,
          away: g.away_team,
          homeField: homeFieldOf(g),
          result: g.week <= w ? g.result : null
        })),
        ratings: ratingsAfter(elo, season, w),
        runs,
        seed: season * 100 + w
      })
      for (const o of result) add(season, w, { ...o, runs })
      simulated += 1
    }
  }
  return { odds, simulated }
}

/**
 * Spec §8.4: the FG model fitted on every attempt before the current season (all of them in a
 * first season), then each attempt's make probability summed by kicker and by team per week.
 */
function fieldGoals(
  kicks: Kick[],
  current: number
): {
  beta: number[] | null
  through: number | null
  players: Map<string, FgSums>
  teams: Map<string, FgSums>
} {
  const train = kicks.filter((k) => k.season < current)
  const fitted = train.length > 0 ? train : kicks
  const beta = fitted.length > 0 ? fitFieldGoals(fitted) : null
  const players = new Map<string, FgSums>()
  const teams = new Map<string, FgSums>()
  for (const k of beta ? kicks : []) {
    const p = fgProbability(k, beta as number[])
    const keys: [Map<string, FgSums>, string | null][] = [
      [players, k.kicker && `${k.kicker}|${k.season}|${k.season_type}|${k.week}`],
      [teams, k.team && `${k.team}|${k.season}|${k.week}`]
    ]
    for (const [map, key] of keys) {
      if (!key) continue
      const s = map.get(key) ?? { fg_model_att: 0, fg_model_made: 0, fg_xmade: 0 }
      s.fg_model_att += 1
      s.fg_model_made += k.made ? 1 : 0
      s.fg_xmade += p
      map.set(key, s)
    }
  }
  const through = fitted.length > 0 ? Math.max(...fitted.map((k) => k.season)) : null
  return { beta, through, players, teams }
}

const ELO_GAME_COLUMNS: Record<string, string> = {
  game_id: 'VARCHAR',
  season: 'INTEGER',
  season_type: 'VARCHAR',
  week: 'INTEGER',
  home_team: 'VARCHAR',
  away_team: 'VARCHAR',
  played: 'BOOLEAN',
  home_elo_pre: 'DOUBLE',
  away_elo_pre: 'DOUBLE',
  home_field: 'DOUBLE',
  home_wp: 'DOUBLE',
  elo_spread: 'DOUBLE',
  vegas_home_wp: 'DOUBLE',
  home_elo_post: 'DOUBLE',
  away_elo_post: 'DOUBLE'
}

const FORECAST_COLUMNS: Record<string, string> = {
  team: 'VARCHAR',
  season: 'INTEGER',
  week: 'INTEGER',
  runs: 'INTEGER',
  ...Object.fromEntries(ODDS.map((o) => [o, 'DOUBLE']))
}

/** `team_model_week` before the turnover sums are joined (they come from SQL). */
const TEAM_CORE_COLUMNS: Record<string, string> = {
  team: 'VARCHAR',
  season: 'INTEGER',
  season_type: 'VARCHAR',
  week: 'INTEGER',
  ...Object.fromEntries(TEAM_STATES.map((s) => [s, s === 'games_left' ? 'INTEGER' : 'DOUBLE'])),
  ...Object.fromEntries(
    TEAM_MODEL_SUMS.filter((s) => !(TURNOVER_SUMS as readonly string[]).includes(s)).map((s) => [
      s,
      'DOUBLE'
    ])
  )
}

const PLAYER_MODEL_COLUMNS: Record<string, string> = {
  gsis_id: 'VARCHAR',
  season: 'INTEGER',
  season_type: 'VARCHAR',
  week: 'INTEGER',
  ...Object.fromEntries(PLAYER_MODEL_SUMS.map((s) => [s, 'DOUBLE']))
}

const valuesOf = (columns: Record<string, string>, row: object): unknown[] =>
  Object.keys(columns).map((c) => (row as Record<string, unknown>)[c] ?? null)

/**
 * Spec §8: rebuilds the model tables from the raw and derived layers, in one transaction. Elo
 * runs over every game; adjusted EPA, SRS and schedule strength are fitted as of every week; the
 * season simulation is cached per week; the FG model is refitted. Then, when asked (a past season
 * changed), metric stability is measured on the tables just written.
 */
export async function rebuildModels(db: StatsDb, input: ModelsInput): Promise<ModelsResult> {
  const stale = await modelsStale(db)
  const have = await inspect(db)
  const games = await loadGames(db, have)
  const current = Math.max(0, ...games.map((g) => g.season))
  const { rows: elo } = runElo(games)
  const cells = await loadCells(db, have)
  const kicks = await loadFieldGoals(db, have)
  const lastPlayed = new Map<number, number>()
  for (const g of games) {
    const last = lastPlayed.get(g.season) ?? 0
    lastPlayed.set(g.season, g.result !== null ? Math.max(last, g.week) : last)
  }
  const sims = await simulations(db, games, elo, lastPlayed, {
    stale,
    current,
    runs: input.runs ?? SIM_RUNS
  })
  const fg = fieldGoals(kicks, current)
  const sums = gameSums(elo)
  const teamRows = [...lastPlayed.keys()]
    .sort((a, b) => a - b)
    .flatMap((season) => {
      const kicksOf = new Map<string, FgSums>()
      for (const [key, s] of fg.teams) {
        const [team, year, week] = key.split('|')
        if (Number(year) === season) kicksOf.set(`${team}|${week}`, s)
      }
      return teamWeekRows({
        season,
        lastWeek: lastPlayed.get(season) ?? 0,
        games,
        elo,
        cells,
        forecast: sims.odds.get(season) ?? new Map(),
        kicks: kicksOf,
        sums
      })
    })

  const written: Record<string, number> = {}
  await db.transaction(async () => {
    await writeTable(
      db,
      'elo_games',
      ELO_GAME_COLUMNS,
      elo.map((r) => valuesOf(ELO_GAME_COLUMNS, r))
    )
    await writeTable(
      db,
      'team_forecast',
      FORECAST_COLUMNS,
      [...sims.odds].flatMap(([season, map]) =>
        [...map].map(([key, o]) =>
          valuesOf(FORECAST_COLUMNS, { ...o, season, week: Number(key.split('|')[1]) })
        )
      )
    )
    await writeTable(
      db,
      'team_model_core',
      TEAM_CORE_COLUMNS,
      teamRows.map((r) => valuesOf(TEAM_CORE_COLUMNS, r))
    )
    // Fumble counts are 0 in a week without them; expected interceptions stay NULL before FTN.
    const turnover = (x: string): string =>
      x.endsWith('_xints') ? `t.${x}::DOUBLE AS ${x}` : `coalesce(t.${x}, 0)::DOUBLE AS ${x}`
    await db.exec(`CREATE OR REPLACE TABLE team_model_week AS
      SELECT c.*, ${TURNOVER_SUMS.map(turnover).join(', ')}
      FROM team_model_core c LEFT JOIN (${turnoversSql(have)}) t
        ON t.team = c.team AND t.season = c.season AND t.week = c.week`)
    await db.exec('DROP TABLE team_model_core')
    await writeTable(
      db,
      'player_model_week',
      PLAYER_MODEL_COLUMNS,
      [...fg.players].map(([key, s]) => {
        const [gsis_id, season, season_type, week] = key.split('|')
        return valuesOf(PLAYER_MODEL_COLUMNS, {
          gsis_id,
          season: Number(season),
          season_type,
          week: Number(week),
          ...s
        })
      })
    )
    await db.exec(`CREATE OR REPLACE TABLE player_profile AS ${profileSql(have.tables)}`)
    await db.exec('INSERT OR REPLACE INTO stats_settings VALUES (?, ?)', [
      'fg_model',
      JSON.stringify({ features: FG_FEATURES, beta: fg.beta, fittedThrough: fg.through })
    ])
    for (const t of MODEL_TABLES) {
      written[t] = (await db.get<{ n: number }>(`SELECT count(*)::INTEGER AS n FROM ${t}`))?.n ?? 0
    }
  })
  // Stability reads the tables just written (FG over expected, ratings); the version is saved
  // once both are in, so an interrupted step runs again.
  const stability = input.stability || stale ? await measureStability(db, input.through) : null
  await db.transaction(async () => {
    if (stability) await writeStability(db, stability, input.through)
    await db.exec(`INSERT OR REPLACE INTO derived_state VALUES ('models', ${MODELS_VERSION})`)
  })
  return { rows: written, simulated: sims.simulated, measured: stability?.size ?? 0 }
}
```

- [ ] **Step 5: The models step**

```diff
diff --git a/src/main/stats/sync.ts b/src/main/stats/sync.ts
index e3ca988..e87284e 100644
--- a/src/main/stats/sync.ts
+++ b/src/main/stats/sync.ts
@@ -10,6 +10,7 @@ import {
   setPendingSeasons
 } from './derived/build'
 import { buildIdentity } from './identity'
+import { canModel, modelsStale, rebuildModels, stabilityDue } from './models/build'
 import { INTERRUPTED_MESSAGE } from './schema'
 import { describe, replaceRows, standardSelect, type Columns } from './load'
 import { loadSleeperSeason, type StatsState } from './sleeper'
@@ -25,6 +26,9 @@ export const PRIOR_SEASON_FRESHNESS_MS = 7 * DAY
 export const STATS_LOG_PREFIX = 'stats:'
 /** The derived rebuild's step (spec §5.2): when it ends, screens query again. */
 export const STATS_DERIVED_STEP = `${STATS_LOG_PREFIX}derived`
+/** The models' step (spec §8), after the derived rebuild: screens query again when it ends. */
+export const STATS_MODELS_STEP = `${STATS_LOG_PREFIX}models`
+const MODELS_PENDING = 'models_pending'

 export interface StatsSyncDeps {
   db: StatsDb
@@ -39,6 +43,8 @@ export interface StatsSyncDeps {
   cancelled?: () => boolean
   /** The league's scoring rules for `fantasy_week` (spec §5.2); null without a league. */
   league?: () => ScoringRules | null
+  /** Season simulation runs (spec §8.1: 10,000); tests run fewer. */
+  simulationRuns?: number
 }

 /** A source of the sync: one of the files, or Sleeper's weekly lines. */
@@ -340,6 +346,44 @@ export async function refreshStats(
       })
     )
   }
+  // Spec §8: the models follow every successful rebuild, and run until one succeeds.
+  const derived = log.find((e) => e.source === STATS_DERIVED_STEP)
+  const pending = await deps.db.get<{ value: string | null }>(
+    'SELECT value FROM stats_settings WHERE key = ?',
+    [MODELS_PENDING]
+  )
+  const due = derived?.status === 'ok' || pending?.value === '1' || (await modelsStale(deps.db))
+  if (
+    due &&
+    derived?.status !== 'error' &&
+    !(await derivedStale(deps.db)) &&
+    (await canModel(deps.db)) &&
+    !deps.cancelled?.()
+  ) {
+    await deps.db.exec('INSERT OR REPLACE INTO stats_settings VALUES (?, ?)', [MODELS_PENDING, '1'])
+    // Stability reads 2019 to the prior season: measured again when one of those changed.
+    const through = state.season - 1
+    const pastChanged = seasons.some((s) => s < state.season)
+    const stability = pastChanged || stale || (await stabilityDue(deps.db, through))
+    log.push(
+      await runLogged(deps, STATS_MODELS_STEP, async () => {
+        const out = await rebuildModels(deps.db, {
+          stability,
+          through,
+          runs: deps.simulationRuns
+        })
+        await deps.db.exec('INSERT OR REPLACE INTO stats_settings VALUES (?, ?)', [
+          MODELS_PENDING,
+          '0'
+        ])
+        await deps.db.exec('CHECKPOINT')
+        const total = Object.values(out.rows).reduce((a, b) => a + b, 0)
+        const notes = [`simulated ${out.simulated} week${out.simulated === 1 ? '' : 's'}`]
+        if (out.measured > 0) notes.push(`stability of ${out.measured} metrics`)
+        return { rows: total, message: notes.join(', ') }
+      })
+    )
+  }
   return { steps: log }
 }

@@ -352,7 +396,7 @@ export function touchedSeasons(log: StatsLogEntry[], current: number): number[]
   for (const entry of log) {
     if (entry.status !== 'ok' || entry.rowsWritten === 0) continue
     const parts = entry.source.slice(STATS_LOG_PREFIX.length).split(':')
-    if (parts[0] === 'identity' || parts[0] === 'derived') continue
+    if (parts[0] === 'identity' || parts[0] === 'derived' || parts[0] === 'models') continue
     seasons.add(parts.length > 1 ? Number(parts[1]) : current)
   }
   return [...seasons].sort((a, b) => a - b)
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run tests/main/stats
```

Expected: PASS (125 passed).

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/main/stats/models src/main/stats/sync.ts tests/main/stats/models/build.test.ts tests/main/stats/sync.test.ts tests/fixtures/statsSync.ts tests/fixtures/stats.ts
git add src/main/stats/models/load.ts src/main/stats/models/team.ts src/main/stats/models/profile.ts src/main/stats/models/build.ts src/main/stats/sync.ts tests/main/stats/models/build.test.ts tests/main/stats/sync.test.ts tests/fixtures/statsSync.ts tests/fixtures/stats.ts
git commit -m "feat(stats): build the models after a rebuild"
```

---

### Task 8: Games, the outlook and stability for the app (spec §8.1, §8.5, §8.6; amendment I)

**Files:**

- Create: `src/main/stats/engine/games.ts`, `src/main/stats/engine/outlook.ts`, `tests/main/stats/engine/outlook.test.ts`
- Modify: `src/shared/stats/types.ts`, `src/main/stats/service.ts`, `src/main/stats/protocol.ts`, `src/main/stats/worker.ts`, `src/main/stats/client.ts`, `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/handlers.ts`, `src/main/index.ts`, `tests/main/stats/service.test.ts`

There is no test harness for the IPC handlers or the main entry; the typecheck, the build and Task 9 cover them.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/stats/engine/outlook.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rebuildDerived } from '@main/stats/derived/build'
import { gameForecasts } from '@main/stats/engine/games'
import { playerOutlook, signalOf, trendOf } from '@main/stats/engine/outlook'
import { rebuildModels } from '@main/stats/models/build'
import type { MetricValue, StatsRow } from '@shared/stats/types'
import { openTestDb } from '../../../fixtures/stats'
import { seedGame, WR } from '../../../fixtures/statsDerived'

const metric = (
  value: number | null,
  sample: number | null = null,
  qualified = true
): MetricValue => ({
  value,
  raw: value,
  sample,
  qualified,
  percentile: null,
  rank: null,
  estimated: false
})
const row = (values: Record<string, MetricValue>, games = 10, id = 'p'): StatsRow => ({
  id,
  name: id,
  team: 'BUF',
  position: 'WR',
  group: {},
  games,
  values
})

describe('the player outlook (stats-analysis spec §8.5)', () => {
  it('flags a role change beyond the week-to-week noise', () => {
    // 20 of 100 team targets; 12 of the last 40: 30 % against 8 of 60 (13 %) before.
    const season = row({ target_share: metric(0.2, 20) })
    const last = row({ target_share: metric(0.3, 12) })
    const weeks = [0.12, 0.14, 0.13, 0.15, 0.29, 0.31, 0.3, 0.3].map((v) =>
      row({ target_share: metric(v) })
    )
    const t = trendOf('target_share', season, last, weeks)
    expect(t.change).toBeCloseTo(0.3 - 8 / 60, 9)
    expect(t.z!).toBeGreaterThan(2)
    expect(t.roleChange).toBe('up')
    // Without three earlier games there is no test.
    expect(trendOf('target_share', season, last, weeks.slice(2)).z).toBeNull()
    // Noisy weeks: the same change is not a role change.
    const noisy = [0.05, 0.3, 0.02, 0.2, 0.5, 0.1, 0.4, 0.2].map((v) =>
      row({ target_share: metric(v) })
    )
    expect(trendOf('target_share', season, last, noisy).roleChange).toBeNull()
  })

  it('counts carries and targets for the opportunity share', () => {
    const season = row({
      opportunity_share: metric(0.25),
      carries: metric(15),
      targets: metric(10)
    })
    const last = row({ opportunity_share: metric(0.25), carries: metric(5), targets: metric(5) })
    expect(trendOf('opportunity_share', season, last, []).change).toBeCloseTo(0, 9)
  })

  it('flags a value its stability says will fall back', () => {
    const pop = Array.from({ length: 20 }, (_, i) => row({ fpoe: metric(i) }, 10, `p${i}`))
    const stability = new Map([
      [
        'fpoe',
        { yearToYear: 0.2, pairs: 500, splitHalf: 0.3, prior: null, reliability: 'low' as const }
      ]
    ])
    const hot = signalOf('fpoe', pop, pop[19], stability)
    expect(hot.mean).toBeCloseTo(9.5, 9)
    expect(hot.expectedChange).toBeCloseTo(-0.8 * 9.5, 9)
    expect(hot.signal).toBe('hot')
    expect(signalOf('fpoe', pop, pop[0], stability).signal).toBe('cold')
    expect(signalOf('fpoe', pop, pop[10], stability).signal).toBeNull()
    expect(signalOf('fpoe', pop, pop[19], new Map()).signal).toBeNull()
  })

  it('answers for a player, with the rest of his schedule', async () => {
    const db = await openTestDb()
    await seedGame(db)
    await rebuildDerived(db, { seasons: 'all', league: null })
    await rebuildModels(db, { stability: false, through: 2024, runs: 50 })
    const ctx = { currentSeason: 2025, hasLeague: false }
    const o = await playerOutlook(db, { player: WR, season: 2025 }, ctx, new Map())
    expect(o).toMatchObject({
      player: WR,
      position: 'WR',
      team: 'BUF',
      games: 1,
      scoring: 'ppr',
      boomRate: 1,
      schedule: { opponents: ['KC'] }
    })
    expect(o.ceiling.season).toBeCloseTo(3, 6)
    // Only the shares the catalogue lists for a WR (the opportunity share is a back's).
    expect(o.trend.map((t) => t.metric)).toEqual([
      'snap_share',
      'route_participation',
      'target_share',
      'carry_share'
    ])
    await expect(playerOutlook(db, { player: 'x', season: 2025 }, ctx, new Map())).rejects.toThrow(
      'gsis id'
    )
    await expect(
      playerOutlook(db, { player: '00-0099999', season: 2025 }, ctx, new Map())
    ).rejects.toThrow('no games')

    const games = await gameForecasts(db, { season: 2025, team: 'BUF' })
    expect(games.map((g) => [g.gameId, g.homeScore, g.awayScore, g.spread])).toEqual([
      ['g1', 27, 20, 2.5],
      ['g2', null, null, -1.5]
    ])
    expect(games[1].homeWinProb).toBeGreaterThan(0)
    await expect(gameForecasts(db, { season: 2025, team: 'buf' })).rejects.toThrow('team code')
  })
})
```

```diff
diff --git a/tests/main/stats/service.test.ts b/tests/main/stats/service.test.ts
index 58c50cf..3d705f5 100644
--- a/tests/main/stats/service.test.ts
+++ b/tests/main/stats/service.test.ts
@@ -3,6 +3,7 @@ import { join } from 'node:path'
 import { describe, expect, it } from 'vitest'
 import { StatsDb } from '@main/stats/db'
 import { rebuildDerived } from '@main/stats/derived/build'
+import { rebuildModels } from '@main/stats/models/build'
 import { bootstrapStatsDb } from '@main/stats/schema'
 import { openStatsService } from '@main/stats/service'
 import { tempDir } from '../../fixtures/stats'
@@ -106,6 +107,51 @@ describe('the service reads and the league rules (stats-analysis spec §5, §7)'
     }
   })

+  it('answers the model reads once the models are built (spec §8)', async () => {
+    const { dir, path } = await builtFile()
+    const open = (): ReturnType<typeof openStatsService> =>
+      openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
+    const elo = { entity: 'team' as const, metrics: ['elo'], scope: { seasons: [2025] } }
+    const before = await open()
+    try {
+      await expect(before.query(elo)).rejects.toThrow('the stats are still being built')
+      await expect(before.games({ season: 2025 })).rejects.toThrow('still being built')
+      await expect(before.outlook({ player: WR, season: 2025 })).rejects.toThrow(
+        'still being built'
+      )
+      // Metrics without a model answer meanwhile.
+      expect((await before.query({ ...elo, metrics: ['wins'] })).rows).toHaveLength(2)
+    } finally {
+      await before.close()
+    }
+    const db = await StatsDb.open(path, { threads: 1 })
+    await rebuildModels(db, { stability: false, through: 2024, runs: 50 })
+    // A prior for win % (stability is measured on two seasons or more; this file has one).
+    await db.exec(`CREATE OR REPLACE TABLE metric_stability AS SELECT 'win_pct' AS metric_id,
+      0.4::DOUBLE AS year_to_year, 100 AS pairs, 0.5::DOUBLE AS split_half, 3.0::DOUBLE AS prior,
+      'medium' AS reliability, 2024 AS through`)
+    db.close()
+    const after = await open()
+    try {
+      expect((await after.query(elo)).rows.map((r) => r.id)).toEqual(['BUF', 'KC'])
+      expect((await after.games({ season: 2025 })).map((g) => g.gameId)).toEqual(['g1', 'g2'])
+      expect((await after.outlook({ player: WR, season: 2025 })).team).toBe('BUF')
+      expect((await after.catalogue()).find((m) => m.id === 'win_pct')?.stability).toMatchObject({
+        prior: 3,
+        reliability: 'medium'
+      })
+      const shrunk = await after.query({
+        entity: 'team',
+        metrics: ['win_pct'],
+        scope: { seasons: [2025] },
+        transform: 'shrunk'
+      })
+      expect(shrunk.rows.map((r) => r.values.win_pct.value)).toEqual([0.625, 0.375])
+    } finally {
+      await after.close()
+    }
+  })
+
   it('answers queries, and rescores the league when its rules change', async () => {
     const { dir, path } = await builtFile()
     const service = await openStatsService({ path, tempDir: join(dir, 'tmp') }, () => {})
@@ -125,8 +171,9 @@ describe('the service reads and the league rules (stats-analysis spec §5, §7)'
         await service.setLeague({ positionOverrides: {}, scoring: { rec_yd: 0.1, rec: 3 } })
       ).toBe(false)
       expect((await service.query(league)).rows[0].values.fantasy_points.value).toBe(5)
-      expect(service.catalogue().find((m) => m.id === 'yprr')).toMatchObject({
-        grains: ['week', 'season', 'play']
+      expect((await service.catalogue()).find((m) => m.id === 'yprr')).toMatchObject({
+        grains: ['week', 'season', 'play'],
+        stability: null
       })
     } finally {
       await service.close()
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/main/stats/engine/outlook.test.ts tests/main/stats/service.test.ts
```

Expected: FAIL: the outlook and games modules do not exist; the service has no `games` or `outlook`, and its catalogue is not a promise.

- [ ] **Step 3: The read types**

```diff
diff --git a/src/shared/stats/types.ts b/src/shared/stats/types.ts
index c3eedf7..12caa00 100644
--- a/src/shared/stats/types.ts
+++ b/src/shared/stats/types.ts
@@ -207,3 +207,91 @@ export interface StatsStatus {
   /** A refresh or a rebuild is running. */
   busy: boolean
 }
+
+/** The games of a season with their forecasts (spec §8.1): schedules, matchups, the Forecast tab. */
+export interface GamesQuery {
+  season: number
+  /** One team's games; every game otherwise. */
+  team?: string
+  weeks?: [number, number]
+}
+
+export interface GameForecast {
+  gameId: string
+  season: number
+  seasonType: 'REG' | 'POST'
+  week: number
+  /** YYYY-MM-DD. */
+  gameday: string | null
+  home: string
+  away: string
+  neutral: boolean
+  /** Null until played. */
+  homeScore: number | null
+  awayScore: number | null
+  /** Pre-game Elo ratings, the home team's Elo win probability and expected margin. */
+  homeElo: number
+  awayElo: number
+  homeWinProb: number
+  eloSpread: number
+  /** The betting market: the home team's no-vig win probability, its expected margin, the total. */
+  vegasHomeWinProb: number | null
+  spread: number | null
+  total: number | null
+  roof: string | null
+  temp: number | null
+  wind: number | null
+}
+
+/** A player's outlook (spec §8.5), for the Forecast tab. */
+export interface OutlookQuery {
+  /** gsis id */
+  player: string
+  season: number
+  /** `ppr` by default. */
+  scoring?: Scoring
+}
+
+export interface OutlookTrend {
+  metric: string
+  season: number | null
+  last4: number | null
+  /** Last four games minus the games before them. */
+  change: number | null
+  /** The change in standard errors (two-proportion test); null without the denominators. */
+  z: number | null
+  /** |z| ≥ 2: a role change beyond noise for this sample. */
+  roleChange: 'up' | 'down' | null
+}
+
+export interface OutlookSignal {
+  metric: string
+  value: number | null
+  /** Its position's qualified mean, and how far the value should move back toward it. */
+  mean: number | null
+  expectedChange: number | null
+  /** The expected change in the position's standard deviations: 1 or more flags it. */
+  z: number | null
+  /** "Running hot" (expected to fall back) or "running cold" (expected to rise), never a promise. */
+  signal: 'hot' | 'cold' | null
+}
+
+export interface PlayerOutlook {
+  player: string
+  season: number
+  scoring: Scoring
+  position: string | null
+  team: string | null
+  games: number
+  ceiling: { season: number | null; last16: number | null }
+  floor: { season: number | null; last16: number | null }
+  boomRate: number | null
+  bustRate: number | null
+  trend: OutlookTrend[]
+  regression: OutlookSignal[]
+  /**
+   * The rest of the regular season: opponents, and how many more fantasy points per game than the
+   * league average they allowed to the position so far (positive is easier).
+   */
+  schedule: { opponents: string[]; easierBy: number | null }
+}
```

- [ ] **Step 4: The games and outlook reads**

Create `src/main/stats/engine/games.ts`:

```ts
import type { GameForecast, GamesQuery } from '@shared/stats/types'
import type { StatsDb } from '../db'
import { inspect } from '../derived/build'
import { col } from '../models/load'
import { STATS_FIRST_SEASON } from '../sources'
import { StatsQueryError } from './compile'

const TEAM_CODE = /^[A-Z]{2,3}$/

/** Spec §8.1: a season's games (one team's, or a week range) with Elo and the betting market. */
export async function gameForecasts(db: StatsDb, q: GamesQuery): Promise<GameForecast[]> {
  if (!Number.isInteger(q.season) || q.season < STATS_FIRST_SEASON || q.season > 2100) {
    throw new StatsQueryError(`season must be a year from ${STATS_FIRST_SEASON}`)
  }
  const where = ['e.season = ?']
  const params: (string | number)[] = [q.season]
  if (q.team !== undefined) {
    if (typeof q.team !== 'string' || !TEAM_CODE.test(q.team))
      throw new StatsQueryError('team must be a team code')
    where.push('(e.home_team = ? OR e.away_team = ?)')
    params.push(q.team, q.team)
  }
  if (q.weeks !== undefined) {
    const [a, b] = q.weeks
    if (!Number.isInteger(a) || !Number.isInteger(b) || a > b)
      throw new StatsQueryError('weeks must be [first, last]')
    where.push('e.week BETWEEN ? AND ?')
    params.push(a, b)
  }
  // A column the schedule lacks reads as NULL.
  const g = col(await inspect(db), 'games', 'g')
  const rows = await db.all<Record<string, unknown>>(
    `SELECT e.*, ${g('gameday', 'VARCHAR')}::VARCHAR AS gameday,
            coalesce(${g('location', 'VARCHAR')} = 'Neutral', false) AS neutral,
            g.home_score, g.away_score, ${g('spread_line')} AS spread_line,
            ${g('total_line')} AS total_line, ${g('roof', 'VARCHAR')} AS roof,
            ${g('temp')} AS temp, ${g('wind')} AS wind
     FROM elo_games e JOIN games g ON g.game_id = e.game_id
     WHERE ${where.join(' AND ')} ORDER BY e.week, gameday, e.game_id`,
    params
  )
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  return rows.map((r) => ({
    gameId: String(r.game_id),
    season: Number(r.season),
    seasonType: r.season_type as 'REG' | 'POST',
    week: Number(r.week),
    gameday: (r.gameday as string | null) ?? null,
    home: String(r.home_team),
    away: String(r.away_team),
    neutral: r.neutral === true,
    homeScore: r.played ? num(r.home_score) : null,
    awayScore: r.played ? num(r.away_score) : null,
    homeElo: Number(r.home_elo_pre),
    awayElo: Number(r.away_elo_pre),
    homeWinProb: Number(r.home_wp),
    eloSpread: Number(r.elo_spread),
    vegasHomeWinProb: num(r.vegas_home_wp),
    spread: num(r.spread_line),
    total: num(r.total_line),
    roof: (r.roof as string | null) ?? null,
    temp: num(r.temp),
    wind: num(r.wind)
  }))
}
```

Create `src/main/stats/engine/outlook.ts`:

```ts
import type {
  MetricStability,
  OutlookQuery,
  OutlookSignal,
  OutlookTrend,
  PlayerOutlook,
  StatsRow
} from '@shared/stats/types'
import { METRICS } from '@shared/stats/catalogue'
import type { StatsDb } from '../db'
import { StatsQueryError, type CompileContext } from './compile'
import { runQuery } from './run'

/** Usage shares compared last four games against the games before (spec §8.5 trend). */
export const TREND_METRICS = [
  'snap_share',
  'route_participation',
  'target_share',
  'carry_share',
  'opportunity_share'
]
/** Efficiency over expected that tends to regress (spec §8.5 regression flags). */
export const REGRESSION_METRICS = ['fpoe', 'td_over_expected', 'yacoe']
/** A role change: the last four games' share this many standard errors from the games before. */
export const ROLE_CHANGE_Z = 2
/** Running hot / cold: an expected move back of at least this many position standard deviations. */
export const SIGNAL_Z = 1
/**
 * Players with fewer games do not set the position's mean and spread: 6, or half the most games
 * anyone has played so far (early in a season).
 */
export const POPULATION_GAMES = 6

const GSIS = /^00-[0-9]{7}$/
const FANTASY_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K']

const value = (row: StatsRow | undefined, id: string): number | null =>
  row?.values[id]?.value ?? null

/**
 * The share's change, last four games against the games before (exact, from the counts: a share's
 * sample is the player's count, so its denominator is sample ÷ share; the opportunity share counts
 * carries and targets). Noise is the player's own week-to-week spread of the share (snaps and
 * routes come in series, so a binomial test would flag every small move): z = change / (s ×
 * √(1/4 + 1/k)) over the k earlier games, with s the pooled weekly standard deviation.
 */
export function trendOf(
  id: string,
  all: StatsRow | undefined,
  last: StatsRow | undefined,
  weeks: StatsRow[]
): OutlookTrend {
  const season = value(all, id)
  const last4 = value(last, id)
  const count = (row: StatsRow | undefined): number | null => {
    if (!row) return null
    if (id === 'opportunity_share') {
      const c = value(row, 'carries')
      const t = value(row, 'targets')
      return c === null || t === null ? null : c + t
    }
    return row.values[id]?.sample ?? null
  }
  const x = count(all)
  const x4 = count(last)
  const n = x !== null && season ? x / season : null
  const n4 = x4 !== null && last4 ? x4 / last4 : null
  let change: number | null = null
  if (season !== null && last4 !== null && x !== null && x4 !== null && n !== null && n4 !== null) {
    const restN = n - n4
    if (restN > 0) change = last4 - (x - x4) / restN
    else if (x === x4) change = null
  }
  // Weekly shares, oldest first: the last four, and the games before them.
  const weekly = weeks.map((w) => value(w, id)).filter((v): v is number => v !== null)
  const recent = weekly.slice(-4)
  const before = weekly.slice(0, -4)
  let z: number | null = null
  if (change !== null && recent.length === 4 && before.length >= 3) {
    const sq = (xs: number[]): number => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length
      return xs.reduce((a, b) => a + (b - m) ** 2, 0)
    }
    const sd = Math.sqrt((sq(recent) + sq(before)) / (weekly.length - 2))
    z = sd > 0 ? change / (sd * Math.sqrt(1 / 4 + 1 / before.length)) : null
  }
  return {
    metric: id,
    season,
    last4,
    change,
    z,
    roleChange: z === null ? null : z >= ROLE_CHANGE_Z ? 'up' : z <= -ROLE_CHANGE_Z ? 'down' : null
  }
}

/**
 * Running hot or cold (spec §8.5): the value regresses toward the position mean by (1 − r), r its
 * year-to-year stability, so the expected move back is (1 − r)(v − mean). Flagged at `SIGNAL_Z`
 * position standard deviations.
 */
export function signalOf(
  id: string,
  rows: StatsRow[],
  player: StatsRow | undefined,
  stability: ReadonlyMap<string, MetricStability>
): OutlookSignal {
  const v = value(player, id)
  const most = Math.max(0, ...rows.map((r) => r.games))
  const games = Math.min(POPULATION_GAMES, Math.ceil(most / 2))
  const pop = rows
    .filter((r) => r.games >= games && r.values[id]?.qualified)
    .map((r) => r.values[id].value)
    .filter((x): x is number => x !== null)
  const r = stability.get(id)?.yearToYear ?? null
  if (v === null || pop.length < 10 || r === null) {
    return { metric: id, value: v, mean: null, expectedChange: null, z: null, signal: null }
  }
  const mean = pop.reduce((a, b) => a + b, 0) / pop.length
  const sd = Math.sqrt(pop.reduce((a, b) => a + (b - mean) ** 2, 0) / (pop.length - 1))
  const expectedChange = -(1 - Math.max(0, r)) * (v - mean)
  const z = sd > 0 ? -expectedChange / sd : null
  return {
    metric: id,
    value: v,
    mean,
    expectedChange,
    z,
    signal: z === null ? null : z >= SIGNAL_Z ? 'hot' : z <= -SIGNAL_Z ? 'cold' : null
  }
}

/** Spec §8.5: ceiling, floor, boom and bust, trend and role change, regression flags, schedule. */
export async function playerOutlook(
  db: StatsDb,
  q: OutlookQuery,
  ctx: CompileContext,
  stability: ReadonlyMap<string, MetricStability>
): Promise<PlayerOutlook> {
  if (typeof q.player !== 'string' || !GSIS.test(q.player))
    throw new StatsQueryError('player must be a gsis id')
  const scoring = q.scoring ?? 'ppr'
  const scope = { seasons: [q.season], players: [q.player] }
  const counts = ['carries', 'targets']
  const season = (
    await runQuery(
      db,
      {
        entity: 'player',
        metrics: ['fp_ceiling', 'fp_floor', 'boom_rate', 'bust_rate', ...TREND_METRICS, ...counts],
        scope,
        scoring
      },
      ctx
    )
  ).rows[0]
  if (!season) throw new StatsQueryError(`no games for ${q.player} in ${q.season}`)
  const [last16, last4, weeks] = await Promise.all([
    runQuery(
      db,
      {
        entity: 'player',
        metrics: ['fp_ceiling', 'fp_floor'],
        scope: {
          ...scope,
          seasons: [q.season - 1, q.season].filter((s) => s >= 2019),
          lastNGames: 16
        },
        scoring
      },
      ctx
    ),
    runQuery(
      db,
      {
        entity: 'player',
        metrics: [...TREND_METRICS, ...counts],
        scope: { ...scope, lastNGames: 4 }
      },
      ctx
    ),
    runQuery(
      db,
      { entity: 'player', metrics: [...TREND_METRICS, ...counts], scope, groupBy: ['week'] },
      ctx
    )
  ])
  const byWeek = [...weeks.rows].sort((a, b) => Number(a.group.week) - Number(b.group.week))
  const position = season.position
  const population = position
    ? await runQuery(
        db,
        {
          entity: 'player',
          metrics: REGRESSION_METRICS,
          scope: { seasons: [q.season], positions: [position as never] },
          transform: 'perGame',
          scoring,
          limit: 1000
        },
        ctx
      )
    : null
  const me = population?.rows.find((r) => r.id === q.player)

  // The rest of the regular season, against what each opponent allowed to the position.
  const team = season.team
  let opponents: string[] = []
  let easierBy: number | null = null
  if (team) {
    opponents = (
      await db.all<{ opp: string }>(
        `SELECT CASE WHEN home_team = ? THEN away_team ELSE home_team END AS opp FROM games
         WHERE season = ? AND game_type = 'REG' AND home_score IS NULL AND ? IN (home_team, away_team)
         ORDER BY week`,
        [team, q.season, team]
      )
    ).map((r) => r.opp)
    if (position && FANTASY_POSITIONS.includes(position) && opponents.length > 0) {
      const id = `fpa_${position.toLowerCase()}`
      const allowed = await runQuery(
        db,
        { entity: 'team', metrics: [id], scope: { seasons: [q.season] }, scoring, limit: 40 },
        ctx
      )
      const by = new Map(allowed.rows.map((r) => [r.id, r.values[id]?.value ?? null]))
      const all = [...by.values()].filter((x): x is number => x !== null)
      const left = opponents.map((o) => by.get(o)).filter((x): x is number => x != null)
      if (all.length > 0 && left.length > 0) {
        const league = all.reduce((a, b) => a + b, 0) / all.length
        easierBy = left.reduce((a, b) => a + b, 0) / left.length - league
      }
    }
  }
  return {
    player: q.player,
    season: q.season,
    scoring,
    position,
    team,
    games: season.games,
    ceiling: { season: value(season, 'fp_ceiling'), last16: value(last16.rows[0], 'fp_ceiling') },
    floor: { season: value(season, 'fp_floor'), last16: value(last16.rows[0], 'fp_floor') },
    boomRate: value(season, 'boom_rate'),
    bustRate: value(season, 'bust_rate'),
    // Only the shares that apply to the position (no route participation for a QB).
    trend: TREND_METRICS.filter((id) => {
      const positions = METRICS.get(id)?.positions
      return (
        positions === 'all' || (position !== null && (positions ?? []).includes(position as never))
      )
    }).map((id) => trendOf(id, season, last4.rows[0], byWeek)),
    regression: REGRESSION_METRICS.map((id) => signalOf(id, population?.rows ?? [], me, stability)),
    schedule: { opponents, easierBy }
  }
}
```

- [ ] **Step 5: The service, the worker and the client**

```diff
diff --git a/src/main/stats/service.ts b/src/main/stats/service.ts
index 9618451..f6f41a9 100644
--- a/src/main/stats/service.ts
+++ b/src/main/stats/service.ts
@@ -2,13 +2,27 @@ import { mkdirSync, rmSync } from 'node:fs'
 import { join } from 'node:path'
 import { createSleeperClient } from '@main/sources/sleeper'
 import type { ScoringRules } from '@shared/stats/scoring'
-import type { MetricInfo, StatsQuery, StatsResult, StatsStatus } from '@shared/stats/types'
+import { componentsOf, METRICS } from '@shared/stats/catalogue'
+import type {
+  GameForecast,
+  GamesQuery,
+  MetricInfo,
+  OutlookQuery,
+  PlayerOutlook,
+  StatsQuery,
+  StatsResult,
+  StatsStatus
+} from '@shared/stats/types'
 import { sqlString, StatsDb } from './db'
 import { derivedStale, rebuildDerived } from './derived/build'
 import { createDownloads } from './download'
-import { StatsQueryError } from './engine/compile'
-import { catalogueInfo } from './engine/registry'
+import { StatsQueryError, type CompileContext } from './engine/compile'
+import { gameForecasts } from './engine/games'
+import { playerOutlook } from './engine/outlook'
+import { catalogueInfo, MODEL_SUMS, QUANTILES } from './engine/registry'
 import { runQuery } from './engine/run'
+import { modelsStale } from './models/build'
+import { readStability } from './models/stability'
 import type {
   RefreshOptions,
   SelfTestResult,
@@ -31,8 +45,13 @@ export interface StatsService {
   selfTest(): Promise<SelfTestResult>
   /** Spec §7: one query on the read connection; it runs while a refresh writes. */
   query(query: StatsQuery): Promise<StatsResult>
-  catalogue(): MetricInfo[]
+  /** The catalogue with each metric's stability (spec §8.6), once the models have measured it. */
+  catalogue(): Promise<MetricInfo[]>
   status(): Promise<StatsStatus>
+  /** Spec §8.1: a season's games with Elo and the betting market. */
+  games(query: GamesQuery): Promise<GameForecast[]>
+  /** Spec §8.5: a player's outlook. */
+  outlook(query: OutlookQuery): Promise<PlayerOutlook>
   /**
    * Stops a refresh now: aborts its download, interrupts its statement, and starts no other step.
    * A process must not exit while DuckDB runs a statement (Electron aborts), so closing cancels first.
@@ -97,6 +116,20 @@ async function selfTestQuery(db: StatsDb): Promise<boolean> {
   }
 }

+/** Whether a query reads a model table (spec §8): those exist once the first models step ran. */
+function readsModels(query: StatsQuery): boolean {
+  const sums = new Set(MODEL_SUMS[query.entity] ?? [])
+  return (query.metrics ?? []).some((id) => {
+    const def = METRICS.get(id)
+    return (
+      def !== undefined &&
+      componentsOf(def).some((t) => t.startsWith('last:') || sums.has(t) || t in QUANTILES)
+    )
+  })
+}
+
+const BUILDING = 'the stats are still being built; try again in a few minutes'
+
 /** Rules reach SQL as numbers: anything else is refused (main validates them too). */
 function checkRules(rules: ScoringRules | null): void {
   if (!rules) return
@@ -156,6 +189,13 @@ export async function openStatsService(
   /** The rules the fantasy tables were built with. */
   let built = stored?.value ?? null
   const downloads = createDownloads({ dir: init.tempDir, signal: abort.signal })
+  const contextOf = async (conn: StatsDb): Promise<CompileContext> => {
+    const latest = await conn.get<{ season: number }>('SELECT max(season) AS season FROM games')
+    return {
+      currentSeason: latest?.season ?? new Date().getFullYear(),
+      hasLeague: league !== null
+    }
+  }
   const whileBusy = async <T>(fn: () => Promise<T>): Promise<T> => {
     busy = true
     try {
@@ -203,16 +243,32 @@ export async function openStatsService(
     },
     query: (query) =>
       read(async (conn) => {
-        if (await derivedStale(conn)) {
-          throw new StatsQueryError('the stats are still being built; try again in a few minutes')
+        if (await derivedStale(conn)) throw new StatsQueryError(BUILDING)
+        if (readsModels(query) && (await modelsStale(conn))) throw new StatsQueryError(BUILDING)
+        const ctx = await contextOf(conn)
+        if (query.transform === 'shrunk') {
+          const stability = await readStability(conn)
+          ctx.priors = new Map(
+            [...stability]
+              .filter(([, s]) => s.prior !== null)
+              .map(([id, s]) => [id, s.prior as number])
+          )
+        }
+        return runQuery(conn, query, ctx)
+      }),
+    catalogue: () => read(async (conn) => catalogueInfo(await readStability(conn))),
+    games: (query) =>
+      read(async (conn) => {
+        if (await modelsStale(conn)) throw new StatsQueryError(BUILDING)
+        return gameForecasts(conn, query)
+      }),
+    outlook: (query) =>
+      read(async (conn) => {
+        if ((await derivedStale(conn)) || (await modelsStale(conn))) {
+          throw new StatsQueryError(BUILDING)
         }
-        const latest = await conn.get<{ season: number }>('SELECT max(season) AS season FROM games')
-        return runQuery(conn, query, {
-          currentSeason: latest?.season ?? new Date().getFullYear(),
-          hasLeague: league !== null
-        })
+        return playerOutlook(conn, query, await contextOf(conn), await readStability(conn))
       }),
-    catalogue: () => catalogueInfo(),
     status: () =>
       read(async (reader) => {
         const built = !(await derivedStale(reader))
```

```diff
diff --git a/src/main/stats/protocol.ts b/src/main/stats/protocol.ts
index 55af4d3..180d095 100644
--- a/src/main/stats/protocol.ts
+++ b/src/main/stats/protocol.ts
@@ -1,5 +1,5 @@
 import type { ScoringRules } from '@shared/stats/scoring'
-import type { StatsQuery } from '@shared/stats/types'
+import type { GamesQuery, OutlookQuery, StatsQuery } from '@shared/stats/types'

 export type StatsStepStatus = 'ok' | 'error' | 'skipped' | 'running' | 'interrupted'

@@ -46,7 +46,8 @@ export interface SelfTestResult {

 /**
  * Requests to the worker. `refresh`, `setLeague`, `selfTest` and `close` run one after another;
- * `query`, `catalogue` and `status` are reads and run at once on a second connection (spec §2).
+ * `query`, `catalogue`, `status`, `games` and `outlook` are reads and run at once, each on its own
+ * connection (spec §2).
  */
 export type StatsRequest =
   | { id: number; kind: 'refresh'; options: RefreshOptions }
@@ -56,12 +57,16 @@ export type StatsRequest =
   | { id: number; kind: 'query'; query: StatsQuery }
   | { id: number; kind: 'catalogue' }
   | { id: number; kind: 'status' }
+  | { id: number; kind: 'games'; query: GamesQuery }
+  | { id: number; kind: 'outlook'; query: OutlookQuery }

 /** The kinds that run at once instead of in turn. */
 export const READ_REQUESTS: ReadonlySet<StatsRequest['kind']> = new Set([
   'query',
   'catalogue',
-  'status'
+  'status',
+  'games',
+  'outlook'
 ])

 export type StatsReply =
```

```diff
diff --git a/src/main/stats/worker.ts b/src/main/stats/worker.ts
index df73c9a..a87e45d 100644
--- a/src/main/stats/worker.ts
+++ b/src/main/stats/worker.ts
@@ -5,7 +5,7 @@ import { openStatsService, type StatsService } from './service'
 /**
  * Worker entry, bundled to `out/main/statsWorker.js` (stats-analysis spec §2): the only thread that
  * opens `stats.duckdb`. Writes (refresh, league rules, self-test, close) run one after another, in
- * arrival order; reads (queries, catalogue, status) run at once on the read connection, so a screen
+ * arrival order; reads (queries, catalogue, status, games, outlook) run at once, so a screen
  * never waits behind a refresh.
  */
 const port = parentPort
@@ -30,6 +30,10 @@ async function handle(request: StatsRequest): Promise<unknown> {
       return service.catalogue()
     case 'status':
       return service.status()
+    case 'games':
+      return service.games(request.query)
+    case 'outlook':
+      return service.outlook(request.query)
     case 'close':
       await service.close()
       service = null
```

```diff
diff --git a/src/main/stats/client.ts b/src/main/stats/client.ts
index 3c7fa28..3678c11 100644
--- a/src/main/stats/client.ts
+++ b/src/main/stats/client.ts
@@ -2,7 +2,16 @@ import { join } from 'node:path'
 import { Worker } from 'node:worker_threads'
 import { singleFlight } from '@main/sync/background'
 import type { ScoringRules } from '@shared/stats/scoring'
-import type { MetricInfo, StatsQuery, StatsResult, StatsStatus } from '@shared/stats/types'
+import type {
+  GameForecast,
+  GamesQuery,
+  MetricInfo,
+  OutlookQuery,
+  PlayerOutlook,
+  StatsQuery,
+  StatsResult,
+  StatsStatus
+} from '@shared/stats/types'
 import type {
   RefreshOptions,
   SelfTestResult,
@@ -24,6 +33,10 @@ export interface StatsClient {
   query(query: StatsQuery): Promise<StatsResult>
   catalogue(): Promise<MetricInfo[]>
   status(): Promise<StatsStatus>
+  /** Spec §8.1: a season's games with Elo and the betting market. */
+  games(query: GamesQuery): Promise<GameForecast[]>
+  /** Spec §8.5: a player's outlook. */
+  outlook(query: OutlookQuery): Promise<PlayerOutlook>
   /** Stops a running refresh, closes the database and ends the worker (after `CLOSE_TIMEOUT_MS` at most). */
   close(): Promise<void>
 }
@@ -84,6 +97,8 @@ export function startStatsWorker(
     query: (query) => request<StatsResult>((id) => ({ id, kind: 'query', query })),
     catalogue: () => request<MetricInfo[]>((id) => ({ id, kind: 'catalogue' })),
     status: () => request<StatsStatus>((id) => ({ id, kind: 'status' })),
+    games: (query) => request<GameForecast[]>((id) => ({ id, kind: 'games', query })),
+    outlook: (query) => request<PlayerOutlook>((id) => ({ id, kind: 'outlook', query })),
     async close() {
       if (!dead) {
         let timer: NodeJS.Timeout | undefined
```

- [ ] **Step 6: IPC, preload, and the changed event after the models**

```diff
diff --git a/src/shared/ipc.ts b/src/shared/ipc.ts
index a241675..b91b9a1 100644
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -27,7 +27,16 @@ import type {
   WaiverAdds
 } from './types'
 import type { Rules } from './rules'
-import type { MetricInfo, StatsQuery, StatsResult, StatsStatus } from './stats/types'
+import type {
+  GameForecast,
+  GamesQuery,
+  MetricInfo,
+  OutlookQuery,
+  PlayerOutlook,
+  StatsQuery,
+  StatsResult,
+  StatsStatus
+} from './stats/types'

 export interface FindLeaguesResult {
   userId: string
@@ -115,8 +124,12 @@ export interface Api {
   stats: {
     /** Runs one query in the stats worker; rejects with a readable message on an invalid query. */
     query(query: StatsQuery): Promise<StatsResult>
-    /** Every metric the engine computes, with where it can be computed (spec §6). */
+    /** Every metric the engine computes, with where it can be computed and its stability (spec §6, §8.6). */
     catalogue(): Promise<MetricInfo[]>
+    /** A season's games with Elo and the betting market (spec §8.1). */
+    games(query: GamesQuery): Promise<GameForecast[]>
+    /** A player's ceiling, floor, trend, regression flags and schedule (spec §8.5). */
+    outlook(query: OutlookQuery): Promise<PlayerOutlook>
     /** "Data through week N, updated <time>" (spec §5.3). */
     status(): Promise<StatsStatus>
     /** Fires when a rebuild finished: screens query again. Returns the unsubscribe function. */
@@ -161,5 +174,7 @@ export const IPC = {
   statsQuery: 'stats:query',
   statsCatalogue: 'stats:catalogue',
   statsStatus: 'stats:status',
+  statsGames: 'stats:games',
+  statsOutlook: 'stats:outlook',
   statsChanged: 'stats:changed'
 } as const
```

```diff
diff --git a/src/preload/index.ts b/src/preload/index.ts
index 0315395..cd5484a 100644
--- a/src/preload/index.ts
+++ b/src/preload/index.ts
@@ -79,6 +79,8 @@ const api: Api = {
   stats: {
     query: (query) => ipcRenderer.invoke(IPC.statsQuery, query),
     catalogue: () => ipcRenderer.invoke(IPC.statsCatalogue),
+    games: (query) => ipcRenderer.invoke(IPC.statsGames, query),
+    outlook: (query) => ipcRenderer.invoke(IPC.statsOutlook, query),
     status: () => ipcRenderer.invoke(IPC.statsStatus),
     onChanged: (listener) => {
       const handler = (): void => listener()
```

```diff
diff --git a/src/main/ipc/handlers.ts b/src/main/ipc/handlers.ts
index e6265a8..b8878c2 100644
--- a/src/main/ipc/handlers.ts
+++ b/src/main/ipc/handlers.ts
@@ -39,7 +39,16 @@ import type { RefreshOptions } from '@main/sync/step'
 import type { UpdateController } from '@main/updater'
 import { IPC, type FindLeaguesResult } from '@shared/ipc'
 import type { Rules } from '@shared/rules'
-import type { MetricInfo, StatsQuery, StatsResult, StatsStatus } from '@shared/stats/types'
+import type {
+  GameForecast,
+  GamesQuery,
+  MetricInfo,
+  OutlookQuery,
+  PlayerOutlook,
+  StatsQuery,
+  StatsResult,
+  StatsStatus
+} from '@shared/stats/types'
 import { SYNC_SOURCE_GROUPS } from '@shared/syncSources'
 import type {
   League,
@@ -325,6 +334,12 @@ export function registerIpcHandlers(ctx: AppContext): void {
     statsClient(ctx).query(query)
   )
   ipcMain.handle(IPC.statsCatalogue, (): Promise<MetricInfo[]> => statsClient(ctx).catalogue())
+  ipcMain.handle(IPC.statsGames, (_event, query: GamesQuery): Promise<GameForecast[]> =>
+    statsClient(ctx).games(query)
+  )
+  ipcMain.handle(IPC.statsOutlook, (_event, query: OutlookQuery): Promise<PlayerOutlook> =>
+    statsClient(ctx).outlook(query)
+  )
   ipcMain.handle(IPC.statsStatus, (): Promise<StatsStatus> =>
     ctx.stats ? ctx.stats.status() : Promise.resolve(STATS_OFF)
   )
```

```diff
diff --git a/src/main/index.ts b/src/main/index.ts
index e1a2909..812c239 100644
--- a/src/main/index.ts
+++ b/src/main/index.ts
@@ -16,7 +16,7 @@ import { createNflverseClient } from '@main/sources/nflverse'
 import { createSleeperClient } from '@main/sources/sleeper'
 import { createSleeperNewsClient } from '@main/sources/sleeperNews'
 import { startStatsWorker, type StatsClient } from '@main/stats/client'
-import { STATS_DERIVED_STEP } from '@main/stats/sync'
+import { STATS_DERIVED_STEP, STATS_MODELS_STEP } from '@main/stats/sync'
 import { installAutoUpdater } from '@main/updater'
 import { IPC } from '@shared/ipc'

@@ -98,8 +98,9 @@ function openStats(): StatsClient | null {
         tempDir: join(app.getPath('userData'), 'stats-tmp')
       },
       (entry) => {
-        // Spec §5.3: screens query again once the derived tables are rebuilt.
-        if (entry.source === STATS_DERIVED_STEP && entry.status === 'ok') {
+        // Spec §5.3: screens query again once the derived tables (and the models) are rebuilt.
+        const rebuilt = entry.source === STATS_DERIVED_STEP || entry.source === STATS_MODELS_STEP
+        if (rebuilt && entry.status === 'ok') {
           mainWindow?.webContents.send(IPC.statsChanged)
         }
       }
```

- [ ] **Step 7: Verify**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
```

Expected: clean; 881 passed | 5 skipped.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/main/stats/engine/games.ts src/main/stats/engine/outlook.ts src/shared/stats/types.ts src/main/stats/service.ts src/main/stats/protocol.ts src/main/stats/worker.ts src/main/stats/client.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts src/main/index.ts tests/main/stats/engine/outlook.test.ts tests/main/stats/service.test.ts
git add src/main/stats/engine/games.ts src/main/stats/engine/outlook.ts src/shared/stats/types.ts src/main/stats/service.ts src/main/stats/protocol.ts src/main/stats/worker.ts src/main/stats/client.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts src/main/index.ts tests/main/stats/engine/outlook.test.ts tests/main/stats/service.test.ts
git commit -m "feat(stats): serve games, outlook and stability"
```

---

### Task 9: Live checks

**Files:**

- Throwaway (never committed): `tests/zz-z-live.test.ts`

The check reads the dev profile's `companion.db` (`~/.config/FantasyCompanion/companion.db`, read-only) for the league's rules. It builds a fresh `stats.duckdb` in `~/project/ffc-proto-z-live/fresh-z` (persistent disk: a crash on 2026-10-17 wiped `/tmp`), and downloads about 210 MB.

- [ ] **Step 1: Live backfill, budgets and gates**

Create `tests/zz-z-live.test.ts`:

```ts
import { mkdirSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { getRules } from '@main/db/repos/rules'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { StatsDb } from '@main/stats/db'
import { brier } from '@main/stats/models/elo'
import {
  calibration,
  fitFieldGoals,
  hosmerLemeshow,
  type FieldGoalAttempt
} from '@main/stats/models/fieldGoal'
import { openStatsService } from '@main/stats/service'
import type { StatsQuery } from '@shared/stats/types'

const APP_DB = join(homedir(), '.config', 'FantasyCompanion', 'companion.db')
const DIR = join(homedir(), 'project', 'ffc-proto-z-live', 'fresh-z')
const seconds = (s: { startedAt: string; finishedAt: string | null } | undefined): number =>
  s?.finishedAt ? (Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 1000 : NaN

it(
  'live: backfill with models, gates (throwaway; never commit)',
  { timeout: 3_600_000 },
  async () => {
    rmSync(DIR, { recursive: true, force: true })
    mkdirSync(DIR, { recursive: true })
    const path = join(DIR, 'stats.duckdb')
    const fails: string[] = []
    const gate = (ok: boolean, what: string): void => {
      console.log(ok ? 'ok  ' : 'FAIL', what)
      if (!ok) fails.push(what)
    }
    const app = openDatabase(APP_DB)
    const rules = getRules(app, getSetting(app, SETTING_ACTIVE_LEAGUE)!)!
    const league = { scoring: rules.scoring, positionOverrides: rules.positionOverrides }

    // 1. A fresh backfill builds the derived tables, then the models.
    let peak = 0
    const timer = setInterval(() => (peak = Math.max(peak, process.memoryUsage().rss)), 100)
    let t = Date.now()
    const service = await openStatsService({ path, tempDir: join(DIR, 'tmp') }, () => {})
    await service.setLeague(league)
    const backfill = await service.refresh({})
    const derived = backfill.steps.find((s) => s.source === 'stats:derived')
    const models = backfill.steps.find((s) => s.source === 'stats:models')
    const backfillSeconds = (Date.now() - t) / 1000
    console.log({
      backfillSeconds,
      peakMb: Math.round(peak / 1e6),
      derived: `${derived?.status} ${seconds(derived)} s`,
      models: `${models?.status} ${models?.message} ${seconds(models)} s`,
      notOk: backfill.steps.filter((s) => s.status !== 'ok').map((s) => `${s.source} ${s.status}`)
    })
    gate(
      models?.status === 'ok' && /stability of \d+ metrics/.test(models.message ?? ''),
      'models step builds and measures stability'
    )
    gate(backfillSeconds <= 600, 'backfill with models ≤ 10 min')

    // 2. A forced daily refresh: the current season's derived rows, then the models; reads answer.
    peak = 0
    t = Date.now()
    let done = false
    const refreshing = service.refresh({ force: true }).finally(() => (done = true))
    const latency: number[] = []
    while (!done) {
      const q0 = Date.now()
      await service.query({
        entity: 'team',
        metrics: ['elo', 'playoff_pct'],
        scope: { seasons: [2026] }
      })
      latency.push(Date.now() - q0)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    const daily = await refreshing
    clearInterval(timer)
    const dDerived = daily.steps.find((s) => s.source === 'stats:derived')
    const dModels = daily.steps.find((s) => s.source === 'stats:models')
    latency.sort((a, b) => a - b)
    console.log({
      dailySeconds: (Date.now() - t) / 1000,
      dailyPeakMb: Math.round(peak / 1e6),
      derived: `${dDerived?.message} ${seconds(dDerived)} s`,
      models: `${dModels?.message} ${seconds(dModels)} s`,
      queries: latency.length,
      medianMs: latency[Math.floor(latency.length / 2)],
      maxMs: latency[latency.length - 1]
    })
    gate(seconds(dDerived) + seconds(dModels) <= 30, 'current-season rebuild with models ≤ 30 s')
    gate(latency[latency.length - 1] <= 1000, 'queries answer during a refresh')

    // 3. Budgets (spec §11), warm.
    const time = async (q: StatsQuery): Promise<number> => {
      await service.query(q)
      return (await service.query(q)).ms
    }
    const budgets = {
      teams: await time({
        entity: 'team',
        metrics: [
          'elo',
          'srs',
          'adj_off_epa',
          'adj_def_epa',
          'adj_net_epa',
          'pythag_win_pct',
          'luck_wins',
          'sos_elo',
          'sos_left_elo',
          'proj_wins',
          'playoff_pct',
          'division_pct',
          'sb_pct',
          'turnover_luck',
          'off_epa_play',
          'def_epa_play'
        ],
        scope: { seasons: [2026] }
      }),
      teamWeeks: await time({
        entity: 'team',
        metrics: ['elo', 'adj_off_epa', 'playoff_pct'],
        scope: { seasons: [2025], teams: ['SEA'] },
        groupBy: ['week']
      }),
      kickers: await time({
        entity: 'player',
        metrics: ['fgoe', 'fgoe_pct', 'fg_expected_pct', 'fg_pct'],
        scope: { seasons: [2025], positions: ['K'] }
      }),
      outlookMetrics: await time({
        entity: 'player',
        metrics: [
          'fp_ceiling',
          'fp_floor',
          'boom_rate',
          'bust_rate',
          'fantasy_ppg',
          'ras',
          'speed_score'
        ],
        scope: { seasons: [2025], positions: ['WR'] }
      }),
      shrunk: await time({
        entity: 'player',
        metrics: ['yprr', 'catch_rate', 'target_share', 'qb_epa_db'],
        scope: { seasons: [2025], positions: ['WR'] },
        transform: 'shrunk'
      }),
      adjusted: await time({
        entity: 'player',
        metrics: ['yprr', 'fantasy_ppg', 'target_share'],
        scope: { seasons: [2025], positions: ['WR'] },
        transform: 'opponentAdjusted'
      }),
      adjustedTeams: await time({
        entity: 'team',
        metrics: ['off_epa_play', 'def_epa_play', 'off_success_rate'],
        scope: { seasons: [2025] },
        transform: 'opponentAdjusted'
      })
    }
    let o = Date.now()
    await service.outlook({ player: '00-0039337', season: 2026, scoring: 'league' })
    const outlookMs = Date.now() - o
    o = Date.now()
    await service.games({ season: 2026 })
    const gamesMs = Date.now() - o
    console.log({ budgets, outlookMs, gamesMs })
    gate(Math.max(...Object.values(budgets)) <= 500, 'model leaderboards ≤ 500 ms')
    gate(budgets.teamWeeks <= 300, 'team dashboard row ≤ 300 ms')
    gate(outlookMs <= 300, 'outlook ≤ 300 ms')
    gate(gamesMs <= 100, 'games ≤ 100 ms')
    const cat = await service.catalogue()
    const st = (id: string): number | null =>
      cat.find((m) => m.id === id)?.stability?.yearToYear ?? null
    console.log({
      measured: cat.filter((m) => m.stability).length,
      target_share: st('target_share'),
      td_over_expected: st('td_over_expected'),
      fpoe: st('fpoe'),
      wopr: st('wopr'),
      pressure_rate: st('pressure_rate'),
      elo: st('elo'),
      fgoe: st('fgoe')
    })
    gate(cat.filter((m) => m.stability).length >= 250, 'stability measured for 250+ metrics')
    gate(
      (st('target_share') ?? 0) > (st('td_over_expected') ?? 1),
      'target share stickier than TD over expected'
    )
    gate((st('wopr') ?? 0) > (st('fpoe') ?? 1), 'WOPR stickier than FPOE')
    await service.close()

    // 4. Model gates on the file.
    const db = await StatsDb.open(path, { threads: 2 })
    const games = await db.all<{ season: number; p: number; v: number | null; result: number }>(
      `SELECT e.season, e.home_wp AS p, e.vegas_home_wp AS v, (g.home_score - g.away_score)::DOUBLE AS result
     FROM elo_games e JOIN games g USING (game_id) WHERE e.played AND e.season BETWEEN 2021 AND 2025`
    )
    const eloBrier = brier(games.map((x) => ({ p: x.p, result: x.result })))
    const vegasBrier = brier(
      games.filter((x) => x.v !== null).map((x) => ({ p: x.v as number, result: x.result }))
    )
    console.log({ eloBrier, vegasBrier, games: games.length })
    gate(eloBrier < 0.25, 'Elo Brier 2021–2025 < 0.25')

    const kicks = (
      await db.all<Omit<FieldGoalAttempt, 'made'> & { made: unknown }>(
        `SELECT p.game_id, p.play_id::INTEGER AS play_id, p.season, p.kick_distance::DOUBLE AS distance,
            p.field_goal_result = 'made' AS made, g.roof, g.surface, g.temp::DOUBLE AS temp, g.wind::DOUBLE AS wind
     FROM plays p JOIN games g USING (game_id) WHERE p.field_goal_attempt = 1 AND p.kick_distance IS NOT NULL`
      )
    ).map((k) => ({ ...k, made: k.made === true }))
    const held = calibration(
      kicks.filter((k) => k.season === 2025),
      fitFieldGoals(kicks.filter((k) => k.season <= 2024))
    )
    const hl = hosmerLemeshow(held)
    const made = held.reduce((s, b) => s + b.made, 0)
    const expected = held.reduce((s, b) => s + b.expected, 0)
    const total = (100 * (made - expected)) / held.reduce((s, b) => s + b.attempts, 0)
    console.log({
      buckets: held.map((b) => `${b.from}: ${b.gap.toFixed(1)} (z ${b.z.toFixed(2)})`),
      hl,
      total
    })
    gate(hl.chi2 < hl.critical, 'FG calibration on 2025 (Hosmer–Lemeshow p ≥ 0.05)')
    gate(Math.abs(total) <= 3, 'FG made vs expected on 2025 within ±3 points')

    // The final regular-season week's simulation names the real playoff teams (tiebreakers).
    const fields = await db.all<{ season: number; ours: string; real: string }>(
      `WITH last AS (SELECT season, max(week) AS week FROM team_forecast GROUP BY season),
     ours AS (SELECT f.season, string_agg(f.team, ',' ORDER BY f.team) AS ours FROM team_forecast f
              JOIN last USING (season, week) WHERE f.playoffs = 1 GROUP BY f.season),
     real AS (SELECT season, string_agg(DISTINCT t, ',' ORDER BY t) AS real FROM
              (SELECT season, home_team AS t FROM games WHERE game_type <> 'REG' UNION SELECT season, away_team FROM games WHERE game_type <> 'REG')
              GROUP BY season)
     SELECT o.season, o.ours, r.real FROM ours o JOIN real r USING (season) ORDER BY 1`
    )
    console.log(
      fields.map(
        (f) => `${f.season} ${f.ours === f.real ? 'same' : `ours ${f.ours} real ${f.real}`}`
      )
    )
    gate(
      fields.length === 7 && fields.every((f) => f.ours === f.real),
      'simulated playoff fields 2019–2025 match the real ones'
    )
    const now = await db.get<{ p: number; sb: number; w: number }>(
      `SELECT sum(playoffs) AS p, sum(superBowl) AS sb, sum(wins + ties / 2) AS w FROM team_forecast
     WHERE season = 2026 AND week = (SELECT max(week) FROM team_forecast WHERE season = 2026)`
    )
    console.log({ now })
    gate(
      Math.abs(now!.p - 14) < 1e-6 && Math.abs(now!.sb - 1) < 1e-6 && Math.abs(now!.w - 272) < 1e-6,
      'current-season odds add up'
    )
    const corr = await db.get<{ adj: number; srs: number }>(
      `SELECT corr(m.adj_off_epa, t.off_epa / t.off_plays) AS adj, corr(m.srs, (t.points_for - t.points_against) / t.games) AS srs
     FROM team_model_week m JOIN team_season t ON t.team = m.team AND t.season = m.season AND t.season_type = 'REG'
     WHERE m.week = (CASE WHEN m.season <= 2020 THEN 17 ELSE 18 END) AND m.season <= 2025`
    )
    console.log({ corr })
    gate((corr?.adj ?? 0) > 0.9, 'adjusted EPA tracks raw EPA (r > 0.9)')
    gate((corr?.srs ?? 0) > 0.9, 'SRS tracks point differential (r > 0.9)')
    const fileMb = Math.round(statSync(path).size / 1e6)
    console.log({ fileMb })
    gate(fileMb <= 400, 'file ≤ 400 MB')
    db.close()
    console.log(fails.length === 0 ? 'ALL GATES PASSED' : `GATES FAILED: ${fails.join('; ')}`)
  }
)
```

```bash
npx vitest run tests/zz-z-live.test.ts --reporter=verbose
```

Expected (2026-10-18, state 2026 week 6), within the budgets the gates set:

- **Backfill:** about 220 s, peak around 2.1 GB; `stats:derived` about 24 s; `stats:models` `ok`, "simulated 138 weeks, stability of 305 metrics", about 42 s. Only `stats:participation:2026` is skipped.
- **Forced daily refresh:** about 22 s; derived "seasons 2026" 1.7 s, models "simulated 1 week" 4.4 s. About 36 queries during it, median 41 ms, max 129 ms.
- **Budgets** (ms): `{ teams: 80, teamWeeks: 19, kickers: 19, outlookMetrics: 45, shrunk: 26, adjusted: 95, adjustedTeams: 20 }`; outlook 182, games 33.
- **Stability:** 305 metrics; target share 0.684, TD over expected 0.066, FPOE 0.203, WOPR 0.695, pressure rate 0.715, Elo 0.597, FGOE 0.115.
- **Elo:** Brier 0.2236 over 1,424 games of 2021–2025; Vegas 0.2110.
- **FG, 2025 held out:** buckets 20: −0.2, 25: +0.6, 30: +1.7, 35: −1.6, 40: +1.9, 45: +8.2 (z 2.36), 50: 0.0, 55: +6.3; Hosmer–Lemeshow χ² 9.82 (critical 15.51); total +2.1 points.
- **Simulated playoff fields:** 2019–2025 all "same". 2026 now: playoffs 14, Super Bowl 1, wins 272.
- **Correlations:** adjusted EPA with raw EPA r 0.973; SRS with point differential per game r 0.982.
- **File:** `{ fileMb: 354 }`.

and `ALL GATES PASSED`. If a gate fails, stop and report the numbers.

- [ ] **Step 2: Remove the throwaway file**

```bash
rm tests/zz-z-live.test.ts && git status --short
```

Expected: only the unrelated changes of Global Constraints.

---

### Task 10: Docs

**Files:**

- Modify: `docs/reference/stats-database.md`, `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`

- [ ] **Step 1: The data reference**

````diff
diff --git a/docs/reference/stats-database.md b/docs/reference/stats-database.md
index 77a465a..9793d1a 100644
--- a/docs/reference/stats-database.md
+++ b/docs/reference/stats-database.md
@@ -4,10 +4,12 @@ Added in v0.25.0 (Plan X; spec `docs/superpowers/specs/2026-10-15-stats-analysis

 v0.26.0 (Plan Y; spec §5–§7, amended in §16) adds the derived tables, the metric catalogue and the query engine the stats screens read through. The file is about 350 MB after the backfill (measured 2026-10-17).

+v0.27.0 (Plan Z; spec §8, amended in §17) adds the models: team Elo and the season simulation, opponent-adjusted EPA, SRS, luck and schedule strength, the field-goal model, the combine profile, metric stability, shrinkage and opponent adjustment, and the player outlook.
+
 ## Engine

-- One worker thread (`out/main/statsWorker.js`, `src/main/stats/worker.ts`) owns the file. The main process talks to it through `StatsClient` (`src/main/stats/client.ts`): `refresh`, `setLeague`, `query`, `catalogue`, `status`, `selfTest`, `close`.
-- Writes (`refresh`, `setLeague`, `selfTest`, `close`) run one after another. Reads (`query`, `catalogue`, `status`) run at once, each on its own connection, so a screen never waits behind a refresh or another read. During a rebuild DuckDB runs on one thread, reads included; during a forced refresh, queries took 16 ms (median) and under 0.1 s at most. Closing refuses new reads and waits for the running ones.
+- One worker thread (`out/main/statsWorker.js`, `src/main/stats/worker.ts`) owns the file. The main process talks to it through `StatsClient` (`src/main/stats/client.ts`): `refresh`, `setLeague`, `query`, `catalogue`, `status`, `games`, `outlook`, `selfTest`, `close`.
+- Writes (`refresh`, `setLeague`, `selfTest`, `close`) run one after another. Reads (`query`, `catalogue`, `status`, `games`, `outlook`) run at once, each on its own connection, so a screen never waits behind a refresh or another read. During a rebuild DuckDB runs on one thread, reads included; during a forced refresh, queries took 16 ms (median) and under 0.1 s at most. Closing refuses new reads and waits for the running ones.
 - DuckDB `@duckdb/node-api` 1.5.6. Its native binding loads from `app.asar.unpacked` (`asarUnpack` in `electron-builder.yml`). Parquet, JSON and ICU are built in, and no extension is ever downloaded.
 - Settings: `memory_limit` 512 MB, 2 threads, `preserve_insertion_order` off, spill files in `<userData>/stats-tmp/duckdb`. The backfill peaks around 1.8–2.2 GB of process memory, and a forced daily refresh around 0.8 GB.
 - `FantasyCompanion.exe --stats-self-test=<file>` opens a throwaway database in the worker, writes, reads and round-trips Parquet. It checks `read_json` and an ICU time zone, answers an engine query over a throwaway schema, writes `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true,"json":true,"icu":true,"query":true}` to `<file>` and exits 0. The Release and Package check workflows run it on the Windows build.
@@ -100,6 +102,7 @@ Rebuilt after every refresh that loaded rows (`stats:identity` in the log).
   - A step replaces its season's rows in one transaction, so a failed load keeps the old rows.
   - **Quitting** closes the worker first: the running download is aborted, the running statement interrupted, and the step logged `interrupted`. The app quits within a few hundred milliseconds (after 3 s at most, the worker is ended). An `interrupted` step is not an attempt: the next run retries it. Steps a crashed app left `running` are marked `interrupted` on the next open, and stale temp files are cleared.
 - **The derived rebuild.** After the steps, when one loaded rows (or the derived tables are missing or older than `DERIVED_VERSION`), `stats:derived` rebuilds the derived tables for the seasons whose rows changed. A file of all seasons (players, QBR, combine) counts as the current season. A forced daily refresh rebuilds the current season in about 1.5 s. The first build (every season) takes about 25 s.
+- **The models.** `stats:models` follows every successful derived rebuild, a `MODELS_VERSION` change, and a run that failed (`models_pending`). A first build takes about 40 s, a daily one about 4.5 s (below).
 - **Downloads.** Parquet from nflverse and ffverse, CSV for the crosswalk, JSON for Sleeper. Files are written to `<userData>/stats-tmp`, read by DuckDB, and deleted. A full backfill downloads about 210 MB of Parquet plus Sleeper's JSON and takes 2–3 minutes. A forced daily refresh runs 24 steps in about 12 s.

 ## Derived tables
@@ -126,12 +129,43 @@ Built by `src/main/stats/derived/` after each refresh (spec §5). Every rate is
 - **Missing sources.** A source that is not loaded, or a column a source dropped, reads as NULL instead of failing the rebuild.
 - **Memory.** Each season is built on its own, each source into a temporary table first, on one thread: writing `player_week` on two threads needs more than the 512 MB limit.

+## Models
+
+Built by `src/main/stats/models/` (spec §8, amended in §17), after the derived tables. Every table is replaced in one transaction; the simulations are cached.
+
+| Table               | Grain                                      | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
+| ------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
+| `elo_games`         | game (scheduled games too)                 | Pre-game Elo of both teams, `home_field`, the home team's Elo win probability (`home_wp`) and expected margin (`elo_spread`), the market's no-vig probability (`vegas_home_wp`), post-game ratings.                                                                                                                                                                                                                                                                                |
+| `team_forecast`     | team × season × week (0 = before week 1)   | The season simulation as of that week: `wins`, `losses`, `ties`, `playoffs`, `division`, `bye`, `conference`, `superBowl`, and its `runs`.                                                                                                                                                                                                                                                                                                                                         |
+| `team_model_week`   | team × season × week, 0 to the last played | States at the end of the week (byes included): `elo`, `srs`, `mov`, `adj_[recent_]{off,def}[_pass,_rush]_epa`, `sos_elo`, `sos_adj`, `sos_left_elo`, `sos_left_adj`, `games_left`, the simulation (`proj_wins`, `playoff_pct`, …, `sb_pct`; NULL in the postseason). Sums over that week's game: `elo_games`, `elo_wp`, `vegas_games`, `vegas_wp`, `elo_pre`, `opp_elo_pre`, `fg_model_att`, `fg_model_made`, `fg_xmade`, fumbles and interceptions (`off_xints` NULL before FTN). |
+| `player_model_week` | kicker × week                              | `fg_model_att`, `fg_model_made`, `fg_xmade`.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
+| `player_profile`    | combine attendee with a gsis id            | Height (inches), weight, forty, bench, vertical, broad jump, cone, shuttle; each as a 0–10 `*_score` (mid-rank percentile within the position group, every combine since 2000); `ras_measures`, `ras` (four measures at least), `speed_score`.                                                                                                                                                                                                                                     |
+| `metric_stability`  | metric                                     | `year_to_year`, `pairs`, `split_half`, `prior`, `reliability`, `through` (the last season read).                                                                                                                                                                                                                                                                                                                                                                                   |
+
+- **Elo**: K 20, home field 48 (0 at a neutral site and in 2020), nfelo's margin multiplier, a third regressed to 1500 between seasons, 2019 as the burn-in. Brier 2021–2025: 0.224 (Vegas 0.211).
+- **Simulation**: 10,000 runs of the current season's remaining games from the current Elo, ratings updated within each run; tiebreakers through head-to-head, division, common games, conference, strength of victory and of schedule, then a coin flip. A sealed season's weeks run 2,000 times, once. The final week reproduces every playoff field and bye 2019–2025.
+- **Adjusted EPA**: a ridge regression (300 plays of prior per team effect) of EPA per play on offense, defense and home field, garbage time left out, as of every week; the recency-weighted version halves a game's weight every four weeks.
+- **FG model**: logistic regression on distance (a knot every 5 yards), indoors, cold, wind, wind × distance and grass, fitted on every attempt before the current season, recent seasons weighted more. Coefficients in `stats_settings` (`fg_model`).
+- **Stability**: per metric, within each position and pooled; measured on 2019 to the prior season whenever a past season changes (about 20 s).
+- **The `outlook` read** (player): ceiling and floor, boom and bust rates, usage trend (last four games against the games before), regression flags, and the remaining schedule. **The `games` read**: a season's games with Elo and the market.
+
+```sql
+-- Playoff odds now, with Elo and adjusted EPA margin
+SELECT team, round(elo) AS elo, round(adj_off_epa - adj_def_epa, 3) AS adj_net,
+       round(proj_wins, 1) AS wins, round(playoff_pct, 3) AS playoffs, round(sb_pct, 3) AS sb
+FROM team_model_week
+WHERE season = 2026 AND week = (SELECT max(week) FROM team_model_week WHERE season = 2026)
+ORDER BY sb DESC LIMIT 10;
+```
+
 ## Metric catalogue and query engine

-- **Catalogue** (`src/shared/stats/catalogue.ts`): 259 metrics, 177 for players and 82 for teams. Each has a formula over component sums (`{targets} / nullif({tm_targets}, 0)`), its sample component and minimum, unit, direction, tier (`core` 92, `extended` 149, `stored` 18), family, sources and coverage. 162 can be split by situation.
-- **Query** (`StatsQuery`, `src/shared/stats/types.ts`; JSON Schema in `src/shared/stats/querySchema.ts`): entity, metrics, scope, situation, groupBy, transform, sort, limit, scoring. The engine (`src/main/stats/engine/`) validates it, compiles it to parameterised SQL over the season tables, the weekly tables or the plays, and runs it for 5 s at most.
+- **Catalogue** (`src/shared/stats/catalogue.ts`): 324 metrics, 204 for players and 120 for teams. Each has a formula over component sums (`{targets} / nullif({tm_targets}, 0)`), model states at the end of the scope (`{last:elo}`) or weekly quantiles (`{p80:fp}`), its sample component and minimum, unit, direction, tier (`core` 116, `extended` 176, `stored` 32), family, sources and coverage. 163 can be split by situation. The catalogue the renderer reads carries each metric's stability.
+- **Missing counts.** At the week and season grains, a play-by-play or box-score component a player never had (carries for a receiver) sums as 0. FTN, participation, NGS, PFR and QBR components stay NULL when missing: there, NULL means "not measured".
+- **Query** (`StatsQuery`, `src/shared/stats/types.ts`; JSON Schema in `src/shared/stats/querySchema.ts`): entity, metrics, scope, situation, groupBy, transform (`raw`, `perGame`, `percentile`, `zScore`, `vsLeague`, `shrunk`, `opponentAdjusted`), sort, limit, scoring. The engine (`src/main/stats/engine/`) validates it, compiles it to parameterised SQL over the season tables, the weekly tables or the plays, and runs it for 5 s at most.
 - **Results** carry, per metric, the value (after the transform), the raw value, the sample, `qualified`, the percentile and rank among qualified rows of the same position and group, and `estimated`. Notes state the coverage the answer depends on.
 - **Qualification.** `minSample` is per 17 games, scaled to the weeks a row covers (about one game per opponent row) and, at the play grain, to the share of plays each row keeps (its situation and play-dimension group, among its teams' plays when the query filters teams or players on the field).
+- **Transforms.** `shrunk` pulls a rate toward the qualified rows' sample-weighted mean by its stability prior: (s·v + k·μ) / (s + k). `opponentAdjusted` subtracts the sample-weighted average of how much more than the league each opponent allowed in the same metric and position (weekly rows; sums only). A metric a transform does not apply to is returned raw, with a note.
 - **Speed** on the full database: leaderboards of 15 metrics 60–100 ms, a player's weekly line 46 ms, situational splits 60–75 ms, five seasons of a metric 40 ms; 40 metrics over every player 0.7 s.

 ```sql
````

- [ ] **Step 2: The spec amendment**

```diff
diff --git a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
index 408aa5f..9296317 100644
--- a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
+++ b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
@@ -1,6 +1,6 @@
 # Stats analysis — design

-**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X) and 2026-10-17 (§16: Plan Y) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.
+**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X), 2026-10-17 (§16: Plan Y) and 2026-10-18 (§17: Plan Z) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.

 **Sources:** the stats catalog (`docs/research/2026-10-09-nfl-stats-catalog.md`), the predictive-metrics catalogue (`docs/research/nfl_predictive_metrics.md`), the coverage audit (`docs/research/2026-10-14-warehouse-coverage-audit.md`), and a DuckDB vs SQLite benchmark on 2023–2025 play-by-play and participation (§3.2).

@@ -461,3 +461,60 @@ Measured on the live database while Plan Y was written (its Planning findings),
 - **J. Sync.** `stats:derived` follows `stats:identity`. It rebuilds the seasons whose rows changed, and the current season for an all-seasons file.
 - **K. QBR's season type** was ESPN's "Regular" / "Playoffs"; it is now REG / POST (source version 2).
 - **L. The self-test** also answers an engine query (§11: the packaged worker answers a query).
+
+## 17. Amendment 2026-10-18: the models (Plan Z)
+
+Measured on the live database while Plan Z was written (its Planning findings), and taken into the build. `docs/reference/stats-database.md` documents the result.
+
+- **A. The models step.** `stats:models` follows `stats:derived` after every successful rebuild, after a `MODELS_VERSION` change, and until a run succeeds. It writes `elo_games`, `team_forecast`, `team_model_week`, `player_model_week`, `player_profile` and `metric_stability`.
+  - A first build takes about 40 s: the simulations about 20 s, stability about 20 s.
+  - A daily refresh's takes about 4.5 s.
+- **B. The engine reads models as components (§6.1, §7).**
+  - `{last:x}` is a model state at the end of the scope: a team's Elo, ratings and odds, or a player's combine profile.
+  - Model sums (expected wins, FG model, turnover luck) join like the fantasy components.
+  - `{p80:fp}` and `{p20:fp}` are weekly quantiles, so those metrics read the weekly tables.
+  - The catalogue gains 65 metrics: 324 in all, 204 for players and 120 for teams.
+  - It serves each metric's stability (`MetricInfo.stability`).
+- **C. Elo (§8.1).**
+  - Home field is 0 at a neutral site and in 2020. A tie moves nothing (ln 1 = 0).
+  - The market's probability is the no-vig moneyline, else the spread with a 13.5-point spread of margins.
+  - Measured Brier 2021–2025: Elo 0.224, Vegas 0.211.
+- **D. Season simulation (§8.1).**
+  - The tiebreakers add strength of victory and of schedule: those decided 2023 (GB / SEA) and 2024 (LA / SEA). With them, the final regular-season week reproduces every playoff field and bye 2019–2025.
+  - Divisions are a fixed map: the database has no teams table.
+  - Each run wins a game with its Elo probability; the margin for the in-run update is drawn around the Elo spread.
+  - It runs as of every regular-season week, cached: 2,000 runs for a sealed season's weeks, 10,000 for the current season's, whose latest week runs again each time. The postseason keeps the end-of-season odds.
+- **E. Adjusted EPA (§8.2).**
+  - The ridge's prior is 300 plays per team effect. It was chosen by predicting each next week's game EPA, 2019–2025: RMSE 0.2138, against 0.2239 for the league mean alone.
+  - It is fitted as of every week, for all plays, dropbacks and other runs, plain and recency-weighted.
+- **F. Ratings, luck and schedule (§8.3).**
+  - SRS is solved directly. Iterating oscillates on a week-1 schedule, where every team has played once.
+  - Elo luck is wins minus the sum of the Elo probabilities.
+  - Schedule strength (played and left) is the mean current Elo, or adjusted EPA margin, of the opponents.
+  - Interception luck (FTN, 2022+) compares interceptions with the interception-worthy throws × that season's league rate: FTN's charting changed (0.44 an interception-worthy throw in 2022, 0.69 in 2025).
+- **G. FG model (§8.4).**
+  - Distance is a spline with a knot every 5 yards from 25 to 55. A season weighs half as much as the one two seasons after it: kickers improved from long range.
+  - **The gate changes.** A one-season 5-yard bucket carries 2–9 points of noise, so ±3 points in every bucket fails even for a calibrated model. The gate is Hosmer–Lemeshow over the eight buckets of held-out 2025 (p ≥ 0.05), and the season total within ±3 points.
+  - Measured: χ² 9.8 (critical 15.5), total +2.1 points.
+- **H. Shrinkage (§8.5).**
+  - Proportions and means take one formula: (s·v + k·μ) / (s + k). s is the sample, μ the qualified rows' sample-weighted mean, and k the metric's stability prior: the sample at which split halves say half of the rate is signal (the beta and normal priors of §8.5 in one form).
+  - It applies to rates only; for anything else, a note says it was not shrunk.
+- **I. The player outlook (§8.5)** is a read of its own (`outlook`), not a query:
+  - ceiling and floor this season and over the last 16 games;
+  - boom and bust rates;
+  - trend: the last four games against the games before. Its z uses the player's own weekly spread, because a binomial test flagged every small move (snaps and routes come in series). A role change is |z| ≥ 2.
+  - regression flags: the expected move back, (1 − r)(v − μ) with r the year-to-year stability, of at least one position standard deviation;
+  - the remaining schedule: the opponents' fantasy points allowed to the position, against the league.
+  - A `games` read lists a season's games with Elo and the market.
+- **J. Stability (§8.6).**
+  - It is computed within each position and pooled, and needs 30 pairs. Reliability is high from r 0.6, medium from 0.35.
+  - It is measured again when a past season changes (the weekly prior-season refresh), in about 20 s.
+  - Measured: 305 metrics. Target share r 0.68 > TD over expected 0.07; WOPR 0.70 > FPOE 0.20.
+- **K. Transforms (§7.1).**
+  - `shrunk` (H).
+  - `opponentAdjusted`: the value minus the sample-weighted average of how much more than the league each opponent allowed, in the same metric and position. It is one step, not iterated; sums only, on the weekly rows.
+- **L. Profile (§8.7).**
+  - Combine scores are mid-rank percentiles: ties share the middle, so a common 4.50 forty is not scored the slowest.
+  - The score is named "Athletic score (RAS-style)". It averages raw measures, so it is not Kent Lee Platte's RAS (DK Metcalf: 7.2 here, 9.07 there). It needs four measures.
+- **M. The EPA + CPOE composite** (moved from Plan Y) averages the two in standard deviations of qualified 2019–2025 QB seasons, with fixed norms.
+- **N. Plan Y follow-up.** At the week and season grains, a counted component a player never had (carries for a receiver) read NULL, so sums of components did too (touches, opportunity share, ANY/A). Play-by-play and box-score components now read 0. FTN, participation, NGS and PFR stay NULL: there, NULL means "not measured".
```

If Task 9 measured different numbers, write the measured ones into both files.

- [ ] **Step 3: Commit**

```bash
npx prettier --write docs/reference/stats-database.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git add docs/reference/stats-database.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git commit -m "docs(stats): document the models"
```

---

### Task 11: Verify, merge, release

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 881 passed | 5 skipped; the build lists `out/main/statsWorker.js`.

- [ ] **Step 2: The Windows suite and self-test**

**Ask the user before pushing.** Then:

```bash
git push origin feat/stats-models-z:check/plan-z
gh run watch "$(gh run list --branch check/plan-z --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
git push origin --delete check/plan-z
```

Expected: green. The log shows `"query":true`.

- [ ] **Step 3: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/stats-models-z` against spec §6–§8 and §11, the amendments and the Review Focus list. Fix Critical and Important findings, each in its own commit, test first, re-running Step 1 after them.

- [ ] **Step 4: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/stats-models-z -m "merge: feat/stats-models-z (plan Z)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.27.0" && git tag v0.27.0
git branch -d feat/stats-models-z
```

- [ ] **Step 5: Status block**

Replace this plan's Status line with the outcome:

- the merge commit and the tag;
- the Task 9 numbers;
- the review fixes and anything deferred;
- "not GUI-verified (WSLg); no window changes".

Then commit, staging this file only: `git commit -m "docs(plan): mark plan Z complete"`.

- [ ] **Step 6: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.27.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests and the packaged self-test, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.27.0 --draft=false`). The release notes should say:

- The first launch after the update builds the models in under a minute, in the background.
- No screen changes yet: the stats screens come in the next releases.

---

## Self-review against the spec

- **§6 Catalogue.**
  - `stability` (§6.1) is served with every metric (Tasks 6, 8).
  - The ratings, forecasts, FG over expected, outlook, RAS-style and Speed Score metrics of §6.2 are Task 5. So is the EPA + CPOE composite Plan Y moved here.
- **§7 Query engine.** `shrunk` and `opponentAdjusted` (§7.1) are Task 5. Model metrics compile through the same validation, parameters and timeout.
- **§8 Models.**
  - §8.1 Elo is Task 2, the simulation Task 3, the game forecasts Task 8.
  - §8.2 adjusted EPA is Task 4 (as of each week: Task 7).
  - §8.3 SRS is Task 2. Pythagorean wins and luck, Elo luck, turnover luck and schedule strength are Tasks 5 and 7.
  - §8.4 the FG model is Task 4, its sums Task 7.
  - §8.5 shrinkage is Task 5; ceiling, floor, boom and bust are Task 5 (metrics) and Task 8 (outlook); regression flags and trend are Task 8.
  - §8.6 stability is Task 6, run by Task 7.
  - §8.7 the profile is Task 7.
  - "Versioned (a parameter change re-runs history)": `MODELS_VERSION` (Task 7).
- **§11 Testing.** The model gates (Elo Brier, FG calibration as amended, stability plausibility) and the performance budgets are Task 9; the packaged self-test is Task 11.
- **Not in this plan** (by §12 and §13): every screen (AA–AE), our own fantasy projection model, natural-language queries.
