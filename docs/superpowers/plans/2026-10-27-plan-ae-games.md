# Plan AE — Stats analysis: Games and the matchup preview

**Status:** complete 2026-10-27. Merged to main as `df894a6` and tagged `v0.36.0` on `e6e5cf6` (not pushed yet). Tasks 1–4 were applied from this text step by step: each task's tests were seen failing as the plan says, then passing, and each task commit is identical to the prototype's. Counts, with the 3 of the untracked `tests/shared/playerImage.test.ts`: 1,164 → 1,183 → 1,186, and 1,190 after the fixes below (Windows Package check: 1,187 of a clean checkout, `"query":true`). Spec amendments A–H (§24) approved by the user 2026-10-27.

Task 5: `ALL GATES PASSED` (re-run after the fixes: a preview's queries 58–110 ms, a box score's 43–83 ms; `short` 0, `noRusher` 0, `noMatchup` 0, `missingRows` 213). The walk-through matched its checklist, light and dark, with and without a league (shot 06 shows the rail's second game, IND @ MIN: its row above is corrected). In the app, three runs alone: Games 130–222 ms (the first after launch included), another game 40–41 ms, a final week's box score 95–136 ms, the Preview tab 16–25 ms.

Fixes, test-first in their own commit:

- `cb7364b` test(stats): "the derived rebuild" tests in `sync.test.ts` (about 2.5 s alone, before and after this plan) timed out at vitest's 5 s under the whole suite: 30 s, as the service tests.
- (Walk-through) `cec0ff5`: on a new game the key players rendered from the season's rows before the players of the last game (or the final game's box score) and the pass rushers had loaded, a flash of players who would not play. They wait for both now.
- (Final review, Important) `018257e`: my games were not marked before my players' first game of the season; my players' teams read the season before too.
- (Final review, Important) `c5dc6bb`: a week 1 game not played yet chooses its key players and pass rushers from last season's teams, so offseason moves are missing. A warning line says so; the real fix (a roster read from `src_rosters`) is left for the user to decide.
- (Final review, Minor) `7d04f52`: TAKE counted a defender's recoveries of his own team's fumbles; it is the team's `def_turnovers` now (a fourth, one-metric box query; reference and spec §24 E amended).
- (Final review, Minor) `2ebc000`: no PROJ column for a postseason game (Sleeper projects the regular season). `30669c6`: a line says PROJ is under the league's scoring when the screen's is another.

Final review (fresh reviewer, Opus): no Critical; left open for the user: a starter hurt in his team's last game still leads the key players (the injury report and reserve list could filter the pool), and the week 1 roster read above.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the matchup preview (spec §9.5), the last screen of the stats-analysis spec, in the Stats nav's **Games** item (disabled until now).

- **Rail:** a season's games week by week (the handoff's "9. Game"): the next game's week at first, my games first with the amber dot, then by kickoff, the scores or the kickoff and the home team's line, the teams on a bye.
- **Preview** (any game): the header (record, Elo and last four results before the game, the Elo win probability or the score); the forecast (Elo against the market, the line, implied points, conditions); **phase by phase**, each offense against the other defense, ranked among the 32 with a bar leaning to the side with the edge; **key matchups**, each team's QB, RB, two WRs and TE against the other defense's rank at the position, with Sleeper's projection when a league is imported, and the other defense's top pass rusher against the line.
- **Box score** (a final game, which opens on it): the handoff's top five fantasy performances, passing, rushing and receiving tables, kicking and defense.
- Ship `v0.36.0`.

**Architecture:**

- **Main process:** `stats.games` gains each game's `kickoff` (UTC from nflverse's Eastern `gameday` + `gametime`). No engine, catalogue or derived-table change, no `DERIVED_VERSION` bump.
- **Renderer model** (pure, unit-tested) `src/renderer/src/lib/stats/games.ts`: the weeks and the default week, the rail, the byes, my teams, the header, the forecast, the scope before a game, the phases and their three narrow queries, `mergeResults`, the faces, the key players and their pool, the pass rusher, the projections map, the box score's three queries and its view.
- **Screen** `src/renderer/src/screens/stats/StatsGames.tsx`; `useWeekProjections` in `useStats.ts` (Fantasy's `players.week` and `stats.link`); `StatsNav` enables Games; `StatsApp` keeps the screen's state for the session and opens the team and player dashboards from it.

**Tech Stack:** Electron 39, React 19, Tailwind 4, TypeScript strict, Vitest (jsdom for components), DuckDB (`@duckdb/node-api`) in the stats worker. No chart library.

**Spec:** `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`: §8.1 (games and forecasts), §9.1, §9.5 (matchup preview), §9.6, §11, the Plan AE row of §12. Amended by this plan: Task 4 writes the amendments into the spec as §24.

**Design:** the handoff's "9. Game" (`docs/design/FantasyCompanion UI/templates/two-products/StatsGame.dc.html`, `stats-games.js`; untracked) and the "Stats Games" Claude Design canvas (https://claude.ai/artifact/13F6UNo5c77akg1hs3BGfL, private; approved by the user 2026-10-27): an upcoming game with and without a league, a final game's box score and its pre-game view.

The screens reference: `docs/reference/stats-screens.md`.

## Decisions (user, 2026-10-27)

- **Games, two views.** The preview lives in the Stats nav's Games item with the handoff's week rail: any game opens a Preview; a final game also has the handoff's Box score and opens on it. No separate Matchups item (§9.1 named one).
- **Mockup first:** the "Stats Games" canvas, approved before this plan.
- **Key matchups:** each team's leading QB, RB, WRs and TE against the opposing defense's rank against the position, and each defense's top pass rusher against the other line. No receiver–cornerback pairs: participation (who covered whom) ends with the prior season.
- **With a league:** my games marked and first in the rail, my players marked in the matchups, and Sleeper's projection for the week.
- **AE is `v0.36.0`.**

## Planning findings (live data, 2026-10-27)

Measured on a full `stats.duckdb` (a fresh v0.35.0 backfill, 2019 – 2026 week 7, week 8 next) with the code in this plan, and in the built app on scratch profiles with the dev league, unless it says otherwise.

- **Kickoff times are complete:** every game of every season has `gameday` and `gametime`. `stats.games` did not pass them on; the rail and the header need them, so `GameForecast` gains `kickoff` (nflverse lists Eastern time).
- **Weather is thin.** nflverse fills temperature and wind after a game, and in 2026 not since week 5: 45 of 272 games have them, none of the unplayed; 107 of 284 in 2022. The roof is known except for 26 games of 2026 (`''`). So the conditions card says "No weather in the schedule yet." more often than not, and shows the roof when it can.
- **The betting line** exists for next week's games only (none from week 9 on in 2026); without one the forecast is Elo alone.
- **One wide query is slow.** DuckDB ranks every metric in its own window step, 10–30 ms each even over a few dozen rows (`EXPLAIN ANALYZE`: 24 `WINDOW` operators for 12 counts). A 19-metric box score took 279–365 ms as one query, 114–135 ms as three narrow ones at once (each read has its own connection). The 24-metric matchup query took 205–231 ms. Both are split into three; `mergeResults` joins the answers by row.
- **Key players must have played.** Picked by fantasy points before the game alone, the key players include the injured: GB's RB was Josh Jacobs, out in week 7. The pool is each team's last game (a final game: its own box score), so MarShawn Lloyd leads instead. Every team of the 226 previews checked had its five key players, a pass rusher and a matchup rank at each position.
- **Ranks within a position need an explicit order.** The players' rank at the position ("WR3") came from the query's row order at first; it sorts by fantasy points now (a test caught it).
- **The first and last weeks.** A week 1 game reads the season before (2019 week 1 has nothing before it: a line says so); a postseason game its regular season. The rail labels the postseason by round (Wild card … Super Bowl).
- **Speed.** In the worker, every game of 2026 weeks 1–8, 2025 (every fourth week and the postseason) and 2019 weeks 1–2: a preview's queries at once 84–204 ms (median 142), a box score's 64–132 ms (median 107). In the app, three runs: Games on screen 219–225 ms from click (342 ms the first time after launch, a cold database), another game 37–42 ms, a final week's box score 141–156 ms, the Preview tab 29–44 ms.

## Spec amendments (taken in this plan)

Task 4 Step 2 records these in the spec as §24. **Confirm them with the user before starting Task 1** if they have not been approved yet.

- **A. Games (§9.1, §9.5).** The matchup preview lives in the Games nav item, not a Matchups item. A rail of a week's games (the shared scope's season, the screen's own week): my games first, then by kickoff; the byes. Any game opens a Preview; a final game also has the Box score and opens on it.
- **B. The preview.** The header (record, Elo and last four results before the game; the Elo win probability or the score), the forecast (Elo against the market and whether they agree, the line, implied points, conditions), phase by phase over the weeks before the game (week 1: the season before; the postseason: its regular season), each side ranked among the 32 on its own better side with the edge in a bar and in words. "Coverage vs receivers" is the passing rows and the receivers' matchups.
- **C. Key matchups.** QB, RB, two WRs and TE by fantasy points before the game among the players of the team's last game, against the other defense's rank in fantasy points allowed to the position; the other defense's top pass rusher against the line's sack rate. No receiver–cornerback pairs.
- **D. With a league:** my players marked and Sleeper's projection for the week; a final game the points scored. Without one, a line says a league adds them.
- **E. The box score:** the handoff's, with the kicker's field goals and the defense's sacks, takeaways and touchdowns from its defenders. No extra points, no team-defense fantasy points.
- **F. Kickoff (§8.1):** `stats.games` gains `kickoff`.
- **G. Narrow queries:** a wide query is split into narrow ones that run at once.
- **H. Measured** (2026 week 7 data): the numbers above.

## Global Constraints

- **Branch** `feat/games-ae` off `main`.
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
- **Test counts** are those of a clean checkout (`main`: 1161 passed, 5 skipped). In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3.
- **Scope.**
  - The main process changes only by `kickoff` in `stats.games`: no engine, catalogue, derived-table or IPC change.
  - The other Stats screens change only by the nav: Games enabled. Their test fixtures gain `kickoff: null`.
  - No receiver–cornerback pairs, no age curve, no natural-language queries.
- **Network.** No test touches the network. Task 5's live check opens a copy of the live database offline; its app runs refresh their scratch profiles.
- **Gates.**
  - **Task 5:** the live check ends with `ALL GATES PASSED`, and every screenshot of the walk-through shows what its checklist says.
  - **Task 6 Step 2:** the Windows suite and self-test on the Package check workflow.
  - If a gate fails, stop and report the numbers or the screenshot to the user.
- **Release** `v0.36.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push**: `check/plan-ae` in Task 6, then `main` and the tag.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **A preview that peeks at the result.** Examples: a final game's phases read with its own week, the record or last four including the game, a key player chosen by the points he scored in it.
   - Task 2: `beforeGame` (weeks before; week 1 the season before; the postseason its regular season), `headerView` (record and form before), `keySide` (points before the game, "scored" apart). Task 3: "Team stats: week 1, before the game".
2. **An edge on the wrong side.** Examples: a lower-is-better metric (sack rate, stuff rate) ranked high-is-good, the bar leaning to the wrong team, a matchup rank upside down (1st must be the toughest).
   - Task 2: `faceView` with sack rate, `keySide`'s matchup ranks and tones. Task 5: the walk-through.
3. **Key players who will not play.** Examples: an injured starter leading, a player traded away, a backup above the starter.
   - Task 2: `participants`, `keyPool`, `keySide` (a player out of the last game left out). Task 5: every team has five key players.
4. **Numbers from another game.** Examples: a previous game's phases shown while the new one loads, a stale box score.
   - Task 3: every preview and box-score query asks for fresh answers (`keepLast: false`); the component tests switch weeks and games.
5. **A state that strands the user.** Examples: a Box score tab for a game not played, "Loading…" forever in 2019 week 1, no projections without saying why.
   - Task 2: `beforeGame` null, `forecastView` without a line. Task 3: the disabled tab, the no-league line. Task 5: 2019 week 1, the wild card, the no-league profile.
6. **Too slow.** One wide query per view would be 200–370 ms. Task 2 splits them; Task 5 measures the worker and the app.

---

### Task 0: Branch

- [x] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/games-ae
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/games-ae`.

---

### Task 1: Each game's kickoff (spec §8.1; amendment F)

`stats.games` passes each game's kickoff on, in UTC: nflverse lists `gameday` and `gametime` in Eastern time. The test fixture's games gain a day and a time (the second none), and the renderer's test fixtures of `GameForecast` gain `kickoff: null`.

**Files:**

- Modify: `src/shared/stats/types.ts`, `src/main/stats/engine/games.ts`
- Modify (tests): `tests/fixtures/statsDerived.ts`, `tests/main/stats/engine/outlook.test.ts`, `tests/renderer/components/StatsPlayer.test.tsx`, `tests/renderer/components/StatsTeam.test.tsx`, `tests/renderer/lib/statsPlayer.test.ts`, `tests/renderer/lib/statsTeam.test.ts`

- [x] **Step 1: Write the failing test**

Modify `tests/fixtures/statsDerived.ts`:

```diff
diff --git a/tests/fixtures/statsDerived.ts b/tests/fixtures/statsDerived.ts
index ecbb86d..8761fa6 100644
--- a/tests/fixtures/statsDerived.ts
+++ b/tests/fixtures/statsDerived.ts
@@ -338,6 +338,8 @@ export async function seedGame(db: StatsDb): Promise<void> {
       season: 2025,
       game_type: 'REG',
       week: 1,
+      gameday: '2025-09-07',
+      gametime: '13:00',
       home_team: 'BUF',
       away_team: 'KC',
       home_score: 27,
@@ -356,6 +358,8 @@ export async function seedGame(db: StatsDb): Promise<void> {
       season: 2025,
       game_type: 'REG',
       week: 2,
+      gameday: '2025-09-14',
+      gametime: null,
       home_team: 'KC',
       away_team: 'BUF',
       home_score: null,
```

Modify `tests/main/stats/engine/outlook.test.ts`:

```diff
diff --git a/tests/main/stats/engine/outlook.test.ts b/tests/main/stats/engine/outlook.test.ts
index 277a784..ffcb054 100644
--- a/tests/main/stats/engine/outlook.test.ts
+++ b/tests/main/stats/engine/outlook.test.ts
@@ -115,6 +115,11 @@ describe('the player outlook (stats-analysis spec §8.5)', () => {
       ['g2', null, null, -1.5]
     ])
     expect(games[1].homeWinProb).toBeGreaterThan(0)
+    // The kickoff in UTC: nflverse lists Eastern time (1:00 PM EDT); none without a time.
+    expect(games.map((g) => [g.gameday, g.kickoff])).toEqual([
+      ['2025-09-07', '2025-09-07T17:00:00.000Z'],
+      ['2025-09-14', null]
+    ])
     await expect(gameForecasts(db, { season: 2025, team: 'buf' })).rejects.toThrow('team code')
   })
 })
```

- [x] **Step 2: Run it and see it fail**

```bash
npx vitest run tests/main/stats/engine/outlook.test.ts
```

Expected: FAIL in "answers for a player, with the rest of his schedule": the kickoffs read `undefined`.

- [x] **Step 3: Implement**

Modify `src/shared/stats/types.ts`:

```diff
diff --git a/src/shared/stats/types.ts b/src/shared/stats/types.ts
index 1ad8fc5..053ceb6 100644
--- a/src/shared/stats/types.ts
+++ b/src/shared/stats/types.ts
@@ -229,6 +229,8 @@ export interface GameForecast {
   week: number
   /** YYYY-MM-DD. */
   gameday: string | null
+  /** The kickoff as an ISO time in UTC (nflverse lists Eastern time); null without a time. */
+  kickoff: string | null
   home: string
   away: string
   neutral: boolean
```

Modify `src/main/stats/engine/games.ts`:

```diff
diff --git a/src/main/stats/engine/games.ts b/src/main/stats/engine/games.ts
index 7622ed9..634bb71 100644
--- a/src/main/stats/engine/games.ts
+++ b/src/main/stats/engine/games.ts
@@ -31,6 +31,8 @@ export async function gameForecasts(db: StatsDb, q: GamesQuery): Promise<GameFor
   const g = col(await inspect(db), 'games', 'g')
   const rows = await db.all<Record<string, unknown>>(
     `SELECT e.*, ${g('gameday', 'VARCHAR')}::VARCHAR AS gameday,
+            epoch_ms(timezone('America/New_York', try_strptime(${g('gameday', 'VARCHAR')} || ' ' ||
+              ${g('gametime', 'VARCHAR')}, '%Y-%m-%d %H:%M'))) AS kickoff_ms,
             coalesce(${g('location', 'VARCHAR')} = 'Neutral', false) AS neutral,
             g.home_score, g.away_score, ${g('spread_line')} AS spread_line,
             ${g('total_line')} AS total_line, ${g('roof', 'VARCHAR')} AS roof,
@@ -47,6 +49,7 @@ export async function gameForecasts(db: StatsDb, q: GamesQuery): Promise<GameFor
     seasonType: r.season_type as 'REG' | 'POST',
     week: Number(r.week),
     gameday: (r.gameday as string | null) ?? null,
+    kickoff: num(r.kickoff_ms) === null ? null : new Date(num(r.kickoff_ms)!).toISOString(),
     home: String(r.home_team),
     away: String(r.away_team),
     neutral: r.neutral === true,
```

The renderer's test fixtures build a `GameForecast` whole:

Modify `tests/renderer/components/StatsPlayer.test.tsx`:

```diff
diff --git a/tests/renderer/components/StatsPlayer.test.tsx b/tests/renderer/components/StatsPlayer.test.tsx
index 31714d2..d6e8d02 100644
--- a/tests/renderer/components/StatsPlayer.test.tsx
+++ b/tests/renderer/components/StatsPlayer.test.tsx
@@ -97,6 +97,7 @@ function game(over: Partial<GameForecast>): GameForecast {
     seasonType: 'REG',
     week: 1,
     gameday: '2026-09-13',
+    kickoff: null,
     home: 'SEA',
     away: 'ARI',
     neutral: false,
```

Modify `tests/renderer/components/StatsTeam.test.tsx`:

```diff
diff --git a/tests/renderer/components/StatsTeam.test.tsx b/tests/renderer/components/StatsTeam.test.tsx
index 6e8fb6b..068f255 100644
--- a/tests/renderer/components/StatsTeam.test.tsx
+++ b/tests/renderer/components/StatsTeam.test.tsx
@@ -76,6 +76,7 @@ function game(over: Partial<GameForecast>): GameForecast {
     seasonType: 'REG',
     week: 1,
     gameday: '2026-09-13',
+    kickoff: null,
     home: 'SEA',
     away: 'SF',
     neutral: false,
```

Modify `tests/renderer/lib/statsPlayer.test.ts`:

```diff
diff --git a/tests/renderer/lib/statsPlayer.test.ts b/tests/renderer/lib/statsPlayer.test.ts
index 363d358..7d76b23 100644
--- a/tests/renderer/lib/statsPlayer.test.ts
+++ b/tests/renderer/lib/statsPlayer.test.ts
@@ -388,6 +388,7 @@ function game(over: Partial<GameForecast>): GameForecast {
     seasonType: 'REG',
     week: 1,
     gameday: '2026-09-13',
+    kickoff: null,
     home: 'CIN',
     away: 'CLE',
     neutral: false,
```

Modify `tests/renderer/lib/statsTeam.test.ts`:

```diff
diff --git a/tests/renderer/lib/statsTeam.test.ts b/tests/renderer/lib/statsTeam.test.ts
index 9c87149..ad49c3e 100644
--- a/tests/renderer/lib/statsTeam.test.ts
+++ b/tests/renderer/lib/statsTeam.test.ts
@@ -42,6 +42,7 @@ function game(over: Partial<GameForecast>): GameForecast {
     seasonType: 'REG',
     week: 1,
     gameday: '2026-09-13',
+    kickoff: null,
     home: 'DET',
     away: 'GB',
     neutral: false,
```

- [x] **Step 4: Run the tests**

```bash
npx vitest run tests/main/stats/engine/outlook.test.ts && npm run typecheck && npx vitest run
```

Expected: 4 passed; typecheck clean; the suite 1161 passed | 5 skipped.

- [x] **Step 5: Commit**

```bash
npx prettier --check src/shared/stats/types.ts src/main/stats/engine/games.ts tests/fixtures/statsDerived.ts tests/main/stats/engine/outlook.test.ts tests/renderer/components/StatsPlayer.test.tsx tests/renderer/components/StatsTeam.test.tsx tests/renderer/lib/statsPlayer.test.ts tests/renderer/lib/statsTeam.test.ts
git add src/shared/stats/types.ts src/main/stats/engine/games.ts tests/fixtures/statsDerived.ts tests/main/stats/engine/outlook.test.ts tests/renderer/components/StatsPlayer.test.tsx tests/renderer/components/StatsTeam.test.tsx tests/renderer/lib/statsPlayer.test.ts tests/renderer/lib/statsTeam.test.ts
git commit -m "feat(stats): each game's kickoff"
```

---

### Task 2: The Games model (spec §9.5; amendments A–E, G)

One pure module the screen reads: the weeks and the default week, the rail (my games first, the kickoff, the home team's line), the byes, my teams, the header (record, Elo and form before the game), the forecast (Elo against the market, the line, the conditions), the scope before a game, the phases and their three narrow queries, `mergeResults`, the faces (each side ranked on its own better side, the edge), the key players (their pool, their rank at the position, the defense's rank against it, scored or projected), the pass rusher, Sleeper's projections by gsis id, and the box score's three queries and its view.

**Files:**

- Create: `src/renderer/src/lib/stats/games.ts`, `tests/renderer/lib/statsGames.test.ts`

- [x] **Step 1: Write the failing tests**

Create `tests/renderer/lib/statsGames.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  beforeGame,
  BOX_METRICS,
  boxQueries,
  boxView,
  byeTeams,
  defaultWeek,
  faceView,
  forecastView,
  headerView,
  homeLine,
  keyPool,
  keySide,
  lastGames,
  matchupQueries,
  mergeResults,
  myPlayersQuery,
  myTeams,
  participants,
  participantsQuery,
  PHASES,
  projectionMap,
  railGames,
  rushersQuery,
  seasonPlayersQuery,
  weekOptions
} from '@/lib/stats/games'
import type { GameForecast, StatsOwnership, StatsResult } from '@shared/stats/types'
import type { PlayerWeekRow } from '@shared/types'
import { catalogueMap, result, row, value } from '../../fixtures/statsScreens'

const byId = catalogueMap()
const TZ = 'America/New_York'

function game(over: Partial<GameForecast>): GameForecast {
  return {
    gameId: 'g',
    season: 2026,
    seasonType: 'REG',
    week: 1,
    gameday: '2026-09-13',
    kickoff: '2026-09-13T17:00:00.000Z',
    home: 'KC',
    away: 'BUF',
    neutral: false,
    homeScore: null,
    awayScore: null,
    homeElo: 1600,
    awayElo: 1550,
    homeWinProb: 0.62,
    eloSpread: 3.1,
    vegasHomeWinProb: 0.6,
    spread: 2.5,
    total: 48.5,
    roof: 'outdoors',
    temp: null,
    wind: null,
    ...over
  }
}

const final = (over: Partial<GameForecast>, home: number, away: number): GameForecast =>
  game({ ...over, homeScore: home, awayScore: away })

/** BUF's season: W, L, W in weeks 1–3, a bye in week 4, at KC in week 5 (not played yet). */
const SEASON: GameForecast[] = [
  final({ gameId: 'w1', week: 1, home: 'BUF', away: 'MIA' }, 27, 20),
  final({ gameId: 'w1b', week: 1, home: 'KC', away: 'NE' }, 30, 10),
  final({ gameId: 'w2', week: 2, home: 'NYJ', away: 'BUF' }, 24, 17),
  final({ gameId: 'w2b', week: 2, home: 'NE', away: 'KC' }, 20, 23),
  final({ gameId: 'w3', week: 3, home: 'BUF', away: 'NE' }, 31, 31),
  final({ gameId: 'w3b', week: 3, home: 'KC', away: 'MIA' }, 21, 14),
  final({ gameId: 'w4', week: 4, home: 'KC', away: 'NYJ', gameday: '2026-10-04' }, 35, 3),
  game({
    gameId: 'w5',
    week: 5,
    home: 'KC',
    away: 'BUF',
    gameday: '2026-10-11',
    kickoff: '2026-10-12T00:20:00.000Z'
  }),
  game({
    gameId: 'w5b',
    week: 5,
    home: 'MIA',
    away: 'NE',
    gameday: '2026-10-11',
    kickoff: '2026-10-11T17:00:00.000Z',
    spread: -3,
    roof: 'dome'
  }),
  game({ gameId: 'w6', week: 6, home: 'NYJ', away: 'KC', gameday: '2026-10-18' })
]

describe('the week and its games (stats-analysis spec §9.5, Plan AE)', () => {
  it('lists the weeks, the postseason by round', () => {
    expect(weekOptions(SEASON).map((w) => w.label)).toEqual([
      'Week 1',
      'Week 2',
      'Week 3',
      'Week 4',
      'Week 5',
      'Week 6'
    ])
    const post = [
      game({ season: 2025, seasonType: 'POST', week: 19 }),
      game({ season: 2025, seasonType: 'POST', week: 22 })
    ]
    expect(weekOptions(post)).toEqual([
      { value: 19, label: 'Wild card' },
      { value: 22, label: 'Super Bowl' }
    ])
  })

  it('opens on the next game’s week, past a postponed one; else the last played', () => {
    expect(defaultWeek(SEASON, new Date('2026-10-06T12:00:00'))).toBe(5)
    // Week 5 is past its day with no score (postponed): the next game is week 6's.
    expect(defaultWeek(SEASON, new Date('2026-10-13T12:00:00'))).toBe(6)
    expect(defaultWeek(SEASON.slice(0, 7), new Date('2027-02-01T12:00:00'))).toBe(4)
    expect(defaultWeek([], new Date())).toBeNull()
  })

  it('puts my games first, then by kickoff; the home team’s line', () => {
    const rail = railGames(SEASON, 5, new Set<string>(), TZ)
    expect(rail.map((r) => r.id)).toEqual(['w5b', 'w5'])
    expect(rail[0]).toMatchObject({ away: 'NE', home: 'MIA', when: 'Sun 1:00 PM', line: '+3.0' })
    expect(rail[1]).toMatchObject({ when: 'Sun 8:20 PM', line: '−2.5', played: false })
    expect(railGames(SEASON, 5, new Set(['BUF']), TZ).map((r) => [r.id, r.mine])).toEqual([
      ['w5', true],
      ['w5b', false]
    ])
    expect(railGames(SEASON, 2, new Set(), TZ)[0]).toMatchObject({
      played: true,
      awayScore: '17',
      homeScore: '24',
      awayWon: false,
      homeWon: true
    })
    expect([homeLine(null), homeLine(0), homeLine(-7)]).toEqual([null, 'PK', '+7.0'])
    // Rams: nflverse LA, shown LAR.
    expect(railGames([game({ home: 'LA' })], 1, new Set(), TZ)[0].home).toBe('LAR')
  })

  it('names the teams on a bye', () => {
    expect(byeTeams(SEASON, 4)).toEqual(['BUF', 'MIA', 'NE'])
    expect(byeTeams(SEASON, 9)).toEqual([])
  })

  it('marks my games by my players’ teams and my team defenses', () => {
    const own: StatsOwnership = {
      players: { p1: { name: 'Me', mine: true }, p2: { name: 'Them', mine: false } },
      teams: { NYJ: { name: 'Me', mine: true } }
    }
    const q = myPlayersQuery(own, 2026)!
    expect(q.scope.players).toEqual(['p1'])
    const players = result(['games'], [row('p1', 'Me', { games: value(5) }, { team: 'BUF' })])
    expect([...myTeams(own, players)].sort()).toEqual(['BUF', 'NYJ'])
    expect(myPlayersQuery({ players: {}, teams: {} }, 2026)).toBeNull()
  })
})

describe('the header and the forecast', () => {
  it('records the teams before the game: their record, Elo and last four', () => {
    const h = headerView(SEASON, SEASON[7], TZ)
    expect(h.away).toMatchObject({
      abbr: 'BUF',
      name: 'Buffalo Bills',
      meta: '1–1–1 · Elo 1,550 · away',
      big: '38%',
      dim: true
    })
    expect(h.away.form.map((f) => f.result)).toEqual(['W', 'L', 'T'])
    expect(h.away.form[1].title).toBe('Week 2: L 17–24 at NYJ')
    expect(h.home).toMatchObject({ meta: '4–0 · Elo 1,600 · home', big: '62%', dim: false })
    expect(h.status).toBe('Sun, Oct 11 · 8:20 PM')
    expect(h.sub).toBe('Week 5 · Outdoors')
    // A final game: the scores, the loser quieter.
    const f = headerView(SEASON, SEASON[2], TZ)
    expect([f.away.big, f.away.dim, f.home.big, f.home.dim]).toEqual(['17', true, '24', false])
    expect(f.status).toBe('Final · Week 2')
    expect(f.away.form.map((x) => x.result)).toEqual(['W'])
    // No kickoff time yet: the day; the week moves under it.
    const neutral = headerView(SEASON, game({ neutral: true, roof: 'dome', kickoff: null }), TZ)
    expect([neutral.status, neutral.sub]).toEqual([
      'Sun, Sep 13',
      'Week 1 · Neutral site · Indoors'
    ])
    expect(headerView(SEASON, game({ kickoff: null, gameday: null }), TZ).status).toBe(
      'Date to be set'
    )
  })

  it('says whether Elo and the market agree, and how the game went', () => {
    const f = forecastView(game({}))
    expect(f.probs).toEqual([
      { label: 'Elo', away: '38%', home: '62%', awayShare: expect.closeTo(0.38, 9) },
      { label: 'Market', away: '40%', home: '60%', awayShare: expect.closeTo(0.4, 9) }
    ])
    expect(f.agree).toBe('Elo and the market agree: KC by 2.5.')
    expect(f.tiles).toEqual([
      { key: 'Spread', value: 'KC −2.5', sub: 'Elo: KC −3.1' },
      { key: 'Total', value: '48.5', sub: 'over / under' },
      { key: 'Implied', value: '23.0–25.5', sub: 'BUF – KC points' }
    ])
    expect(forecastView(game({ homeWinProb: 0.7 })).agree).toBe(
      'Elo likes KC more than the market does (70% against 60%).'
    )
    expect(forecastView(game({ homeWinProb: 0.5 })).agree).toBe(
      'Elo likes BUF more than the market does (50% against 40%).'
    )
    const none = forecastView(game({ vegasHomeWinProb: null, spread: null, total: null }))
    expect(none.probs).toHaveLength(1)
    expect(none.agree).toBe('No betting line for this game: Elo only.')
    expect(none.tiles.map((t) => t.value)).toEqual(['—', '—'])
    expect(forecastView(final({}, 20, 24)).result).toEqual({
      text: 'BUF won 24–20 · an upset',
      upset: true
    })
    expect(forecastView(final({}, 31, 7)).result).toEqual({
      text: 'KC won 31–7 · the favorite won',
      upset: false
    })
  })

  it('gives the conditions the schedule has', () => {
    expect(forecastView(game({ roof: 'dome' })).conditions.big).toBe('Indoors')
    expect(forecastView(game({ temp: 34.4, wind: 18 })).conditions).toEqual({
      big: '34°F',
      line: 'Outdoors · wind 18 mph · enough to slow the passing game',
      note: 'From the schedule.'
    })
    expect(forecastView(game({})).conditions).toEqual({
      big: 'Outdoors',
      line: 'No weather in the schedule yet.',
      note: null
    })
    expect(forecastView(game({ roof: '' })).conditions.big).toBe('—')
  })
})

/** Two teams' phases: KC's offense strong, BUF's defense middling, pressure not published. */
function teams(): StatsResult {
  const ids = PHASES.flatMap((p) => p.rows.flatMap(([, o, d]) => [o, d]))
  const rows = ['KC', 'BUF', 'NE'].map((t, i) =>
    row(
      t,
      t,
      Object.fromEntries(
        ids.map((id) => [id, value(id.includes('pressure') ? null : (3 - i) / 10)])
      ),
      { team: t, position: null }
    )
  )
  const r = result(ids, rows)
  return {
    ...r,
    columns: r.columns.map((c) => (c.id.includes('pressure') ? { ...c, seasons: [] } : c))
  }
}

describe('phase by phase', () => {
  it('reads the weeks before the game; week 1 the season before; the postseason its season', () => {
    expect(beforeGame(game({ week: 5 }))).toEqual({
      scope: { seasons: [2026], seasonType: 'REG', weeks: [1, 4] },
      season: 2026,
      label: 'weeks 1–4'
    })
    expect(beforeGame(game({ week: 2 }))!.label).toBe('week 1')
    expect(beforeGame(game({ week: 1 }))).toEqual({
      scope: { seasons: [2025], seasonType: 'REG' },
      season: 2025,
      label: 'the 2025 season'
    })
    expect(beforeGame(game({ season: 2019, week: 1 }))).toBeNull()
    expect(beforeGame(game({ seasonType: 'POST', week: 20 }))!.label).toBe(
      'the 2026 regular season'
    )
  })

  it('asks every team for the phases in three queries, all in the catalogue', () => {
    const qs = matchupQueries(beforeGame(game({ week: 5 }))!, 'half')
    expect([...qs.keys()]).toEqual(['off', 'def', 'fpa'])
    for (const q of qs.values()) {
      expect(q).toMatchObject({ entity: 'team', scoring: 'half', limit: 40 })
      for (const id of q.metrics) expect(byId.get(id)?.entity, id).toBe('team')
    }
    expect(qs.get('fpa')!.metrics).toEqual(['fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te'])
    // Each pair is an offense's metric and the defense's.
    for (const [, o, d] of PHASES.flatMap((p) => p.rows)) {
      expect(byId.get(o)!.side, o).toBe('offense')
      expect(byId.get(d)!.side, d).toBe('defense')
    }
  })

  it('merges narrow answers into one row per team', () => {
    const a = result(['wins'], [row('KC', 'KC', { wins: value(1) })])
    const b = result(
      ['losses'],
      [row('KC', 'KC', { losses: value(2) }), row('NE', 'NE', { losses: value(3) })]
    )
    const m = mergeResults([a, b])!
    expect(m.rows.map((r) => [r.id, Object.keys(r.values)])).toEqual([
      ['KC', ['wins', 'losses']],
      ['NE', ['losses']]
    ])
    expect(m.columns.map((c) => c.id)).toEqual(['wins', 'losses'])
    expect(mergeResults([])).toBeNull()
  })

  it('leans each row to the side with the edge, each side on its own better side', () => {
    const f = faceView(teams(), 'KC', 'BUF', byId, 2026)
    expect([f.off, f.def]).toEqual(['KC', 'BUF'])
    const epa = f.groups[0].rows[0]
    // KC's offense is 1st of 3; BUF's defense allows the middle value: 2nd of 3.
    expect(epa.off).toMatchObject({ value: '+0.300', rank: '1st', percentile: 100 })
    expect(epa.def).toMatchObject({ rank: '2nd', percentile: 50 })
    expect(epa.edge).toBe(50)
    // Sack rate: lower is better for an offense, higher for a defense.
    const sack = f.groups.find((g) => g.label === 'Protection vs pass rush')!.rows[0]
    expect(sack.off!.rank).toBe('3rd')
    expect(sack.def!.rank).toBe('2nd')
    expect(sack.edge).toBe(-50)
    const pressure = f.groups.find((g) => g.label === 'Protection vs pass rush')!.rows[1]
    expect(pressure).toMatchObject({ off: null, def: null, missing: 'Not published for 2026 yet.' })
    expect(f.summary).toMatch(
      /^Biggest edge: (KC offense|BUF defense), on .+ \(50 percentile points\)\.$/
    )
  })
})

/** The players before the game: KC's QB and receivers, a backup who did not play. */
function players(): StatsResult {
  const p = (id: string, team: string, position: string, fp: number): ReturnType<typeof row> =>
    row(
      id,
      id.toUpperCase(),
      { fantasy_points: value(fp), fantasy_ppg: value(fp / 4) },
      { team, position }
    )
  return result(
    ['fantasy_points', 'fantasy_ppg'],
    [
      p('q1', 'KC', 'QB', 100),
      p('q2', 'BUF', 'QB', 90),
      p('q3', 'KC', 'QB', 20),
      p('r1', 'KC', 'RB', 60),
      p('w1', 'KC', 'WR', 70),
      p('w2', 'KC', 'WR', 50),
      p('w3', 'KC', 'WR', 40),
      p('w4', 'NE', 'WR', 80),
      p('t1', 'KC', 'TE', 30)
    ]
  )
}

/** Fantasy points each defense allows by position: BUF the stingiest at WR. */
function allowed(): StatsResult {
  const ids = ['fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te', 'off_sack_rate', 'def_sack_rate']
  const teamsRows = Array.from({ length: 32 }, (_, i) =>
    row(
      i === 0 ? 'BUF' : i === 31 ? 'KC' : `T${i}`,
      'x',
      Object.fromEntries(
        ids.map((id) => [id, value(id.includes('sack') ? 0.03 + i / 1000 : 10 + i)])
      ),
      { position: null }
    )
  )
  return result(ids, teamsRows)
}

describe('key matchups', () => {
  it('finds each team’s last game and who played in it', () => {
    expect(lastGames(SEASON, SEASON[7])).toEqual({ BUF: 3, KC: 4 })
    const q = participantsQuery(SEASON[7], { BUF: 3, KC: 4 })!
    expect(q.scope).toMatchObject({ weeks: [3, 4], teams: ['BUF', 'KC'] })
    expect(q.groupBy).toEqual(['week'])
    expect(participantsQuery(SEASON[0], {})).toBeNull()
    const played = result(
      ['games'],
      [
        { ...row('a', 'A', {}, { team: 'KC' }), group: { week: 4 } },
        { ...row('b', 'B', {}, { team: 'KC' }), group: { week: 3 } },
        { ...row('c', 'C', {}, { team: 'BUF' }), group: { week: 3 } }
      ]
    )
    const by = participants(played, { BUF: 3, KC: 4 })
    expect(by.get('KC')!.map((r) => r.id)).toEqual(['a'])
    expect(by.get('BUF')!.map((r) => r.id)).toEqual(['c'])
  })

  it('picks the leading QB, RB, two WRs and TE among the players of his last game', () => {
    const season = players()
    const pool = season.rows.filter((r) => r.team === 'KC' && r.id !== 'w1')
    const side = keySide('KC', 'BUF', {
      played: pool,
      season,
      matchups: allowed(),
      rushers: null,
      ownership: { players: { w2: { name: 'Me', mine: true } }, teams: {} },
      scored: null,
      projected: new Map([['q1', 21.36]]),
      range: 'weeks 1–4'
    })
    // w1 (out last game) is left out; q3 trails q1.
    expect(side.players.map((p) => p.id)).toEqual(['q1', 'r1', 'w2', 'w3', 't1'])
    expect(side.players[0]).toMatchObject({
      meta: 'FP/G 25.0 · QB1',
      mine: false,
      matchup: { opponent: 'BUF', rank: '1st', tone: 'bad' },
      last: { value: '21.4', label: 'Sleeper' }
    })
    expect(side.players[0].matchup!.title).toBe(
      'BUF allows the fewest fantasy points per game to QBs (1st is the toughest)'
    )
    // WR ranks among every WR before the game: w4 (NE) leads.
    expect(side.players[2]).toMatchObject({ meta: 'FP/G 12.5 · WR3', mine: true, last: null })
    // KC's defense allows the most: a good matchup for BUF.
    const buf = keySide('BUF', 'KC', {
      played: null,
      season,
      matchups: allowed(),
      rushers: null,
      ownership: null,
      scored: new Map([['q2', 7]]),
      projected: null,
      range: ''
    })
    expect(buf.players.map((p) => [p.id, p.matchup!.tone, p.last])).toEqual([
      ['q2', 'good', { value: '7.0', label: 'scored' }]
    ])
  })

  it('pairs the other defense’s top rusher with the line’s sack rate', () => {
    const rushers = result(
      ['sacks', 'qb_hits'],
      [
        row(
          'd1',
          'Edge One',
          { sacks: value(4), qb_hits: value(9) },
          { team: 'BUF', position: 'DL' }
        ),
        row(
          'd2',
          'Edge Two',
          { sacks: value(4), qb_hits: value(12) },
          { team: 'BUF', position: 'LB' }
        ),
        row('d3', 'Other', { sacks: value(9), qb_hits: value(20) }, { team: 'KC', position: 'DL' })
      ]
    )
    const side = keySide('KC', 'BUF', {
      played: null,
      season: players(),
      matchups: allowed(),
      rushers,
      ownership: null,
      scored: null,
      projected: null,
      range: 'weeks 1–4'
    })
    expect(side.rush!.head).toBe('BUF’s top rusher against the KC line')
    expect(side.rush!.line).toBe(
      'Edge Two (BUF LB): 4.0 sacks and 12 QB hits in weeks 1–4. KC allows a sack on 6.1% of dropbacks (32nd of 32). BUF’s defense ranks 32nd in sack rate.'
    )
    const q = rushersQuery(beforeGame(game({ week: 5 }))!, ['BUF', 'KC'])
    expect(q.scope).toMatchObject({ teams: ['BUF', 'KC'], positions: ['DL', 'LB', 'DB'] })
  })

  it('reads the players’ points before the game, at the four positions', () => {
    const q = seasonPlayersQuery(beforeGame(game({ week: 5 }))!, 'std')
    expect(q).toMatchObject({
      entity: 'player',
      scoring: 'std',
      scope: { weeks: [1, 4], positions: ['QB', 'RB', 'WR', 'TE'] }
    })
  })

  it('maps Sleeper’s projections to gsis ids', () => {
    const rows = [
      { playerId: '100', projected: 12.5 },
      { playerId: '200', projected: null }
    ] as PlayerWeekRow[]
    const ids = new Map<string, string | null>([
      ['g1', '100'],
      ['g2', '200'],
      ['g3', null]
    ])
    expect([...projectionMap(rows, ids)]).toEqual([['g1', 12.5]])
  })
})

describe('the box score (handoff "9. Game")', () => {
  const g = final({ week: 5, home: 'KC', away: 'BUF' }, 27, 20)

  function box(): StatsResult {
    const v = (o: Record<string, number>): Record<string, ReturnType<typeof value>> =>
      Object.fromEntries(Object.entries(o).map(([k, x]) => [k, value(x)]))
    return result(BOX_METRICS, [
      row(
        'qb',
        'Kc Qb',
        v({
          fantasy_points: 24.3,
          pass_cmp: 22,
          pass_att: 31,
          pass_yds: 280,
          pass_td: 2,
          pass_int: 1,
          carries: 3,
          rush_yds: 12
        }),
        { team: 'KC', position: 'QB' }
      ),
      row(
        'rb',
        'Kc Rb',
        v({
          fantasy_points: 18,
          carries: 18,
          rush_yds: 90,
          rush_td: 1,
          targets: 3,
          receptions: 2,
          rec_yds: 15
        }),
        { team: 'KC', position: 'RB' }
      ),
      row(
        'wr',
        'Kc Wr',
        v({ fantasy_points: 20, targets: 9, receptions: 7, rec_yds: 110, rec_td: 1 }),
        { team: 'KC', position: 'WR' }
      ),
      row('k', 'Kc K', v({ fantasy_points: 9, fg_made: 2, fg_att: 3 }), {
        team: 'KC',
        position: 'K'
      }),
      row('dl', 'Kc Dl', v({ sacks: 1.5, fumble_recoveries: 1 }), { team: 'KC', position: 'DL' }),
      row('db', 'Kc Db', v({ sacks: 1, def_ints: 1, def_tds: 1 }), { team: 'KC', position: 'DB' }),
      row('bq', 'Buf Qb', v({ fantasy_points: 5, pass_cmp: 10, pass_att: 25, pass_yds: 90 }), {
        team: 'BUF',
        position: 'QB'
      }),
      row('bt', 'Buf Te', v({ fantasy_points: 1, targets: 2 }), { team: 'BUF', position: 'TE' })
    ])
  }

  it('asks for the game in three narrow queries', () => {
    const qs = boxQueries(g, 'ppr')
    expect([...qs.keys()]).toEqual(['pass', 'run', 'rest'])
    expect([...qs.values()].flatMap((q) => q.metrics)).toEqual(BOX_METRICS)
    for (const q of qs.values())
      expect(q.scope).toMatchObject({
        seasons: [2026],
        seasonType: 'REG',
        weeks: [5, 5],
        teams: ['BUF', 'KC']
      })
    for (const id of BOX_METRICS) expect(byId.get(id)?.entity, id).toBe('player')
  })

  it('writes each team’s tables, kicker and defense, and the top performances', () => {
    const v = boxView(box(), g, { players: { wr: { name: 'Me', mine: true } }, teams: {} })
    const [buf, kc] = v.sides
    expect(kc.tables.map((t) => [t.title, t.rows.map((r) => r.id)])).toEqual([
      ['Passing', ['qb']],
      ['Rushing', ['rb', 'qb']],
      ['Receiving', ['wr', 'rb']]
    ])
    expect(kc.tables[0].rows[0]).toMatchObject({ cells: ['22/31', '280', '2', '1'], fp: '24.3' })
    expect(kc.tables[1].rows[0].cells).toEqual(['18', '90', '5.0', '1'])
    expect(kc.tables[2].rows[0]).toMatchObject({ cells: ['7/9', '110', '1'], mine: true })
    expect(kc.kicker).toEqual({ id: 'k', name: 'Kc K', fg: '2/3', fp: '9.0' })
    expect(kc.defense).toEqual({ sacks: '2.5', takeaways: '2', tds: '1' })
    expect(buf.tables.map((t) => t.title)).toEqual(['Passing', 'Receiving'])
    expect(buf.kicker).toBeNull()
    expect(v.top.map((t) => t.id)).toEqual(['qb', 'wr', 'rb', 'k', 'bq'])
    // Defenders score no fantasy points here: not in "scored".
    expect([...v.scored.keys()].sort()).toEqual(['bq', 'bt', 'k', 'qb', 'rb', 'wr'])
    // The key players of a final game: those with a pass, carry or target in it.
    expect(keyPool('KC', box(), new Map())!.map((r) => r.id)).toEqual(['qb', 'rb', 'wr'])
    expect(keyPool('KC', null, new Map())).toBeNull()
  })
})
```

- [x] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/renderer/lib/statsGames.test.ts
```

Expected: FAIL: `Failed to resolve import "@/lib/stats/games"`.

- [x] **Step 3: Implement**

Create `src/renderer/src/lib/stats/games.ts`:

```ts
import { kickoffLabel } from '@/lib/playersTableView'
import { fmtStat, ordinal } from '@/lib/stats/format'
import { roundOf, teamRank } from '@/lib/stats/team'
import { TEAM_NAMES, teamAbbr } from '@shared/stats/nflTeams'
import type { Scoring } from '@shared/stats/scoring'
import type {
  GameForecast,
  MetricInfo,
  PositionGroup,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsRow
} from '@shared/stats/types'
import type { PlayerWeekRow } from '@shared/types'

/** Games (stats-analysis spec §9.5, Plan AE): a week's games, a preview and a box score. */

export type GamesTab = 'preview' | 'box'

/** The screen's own choices, kept for the session; the season and scoring are the shared scope's. */
export interface GamesState {
  /** null: the week of the next game, else the last played. */
  week: number | null
  /** A game id; null: the rail's first. */
  game: string | null
  /** null: the box score once the game is final, else the preview. */
  tab: GamesTab | null
}

export const DEFAULT_GAMES: GamesState = { week: null, game: null, tab: null }

export const isPlayed = (g: GameForecast): boolean => g.homeScore !== null && g.awayScore !== null

const ROUNDS: Record<string, string> = {
  WC: 'Wild card',
  DIV: 'Divisional round',
  CONF: 'Conference championships',
  SB: 'Super Bowl'
}

/** "Week 8", or the postseason round ("Wild card"). */
export function weekLabel(season: number, seasonType: 'REG' | 'POST', week: number): string {
  return seasonType === 'POST' ? (ROUNDS[roundOf(season, week)] ?? `Week ${week}`) : `Week ${week}`
}

/** The season's weeks with games, regular season first. */
export function weekOptions(games: readonly GameForecast[]): { value: number; label: string }[] {
  const weeks = new Map<number, string>()
  for (const g of games) weeks.set(g.week, weekLabel(g.season, g.seasonType, g.week))
  return [...weeks].sort((a, b) => a[0] - b[0]).map(([value, label]) => ({ value, label }))
}

/** YYYY-MM-DD in the machine's time zone. */
const localDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The week the screen opens on: the next game's (the first not played whose day has not passed: a
 * game past its day without a score was postponed), else the last week played.
 */
export function defaultWeek(games: readonly GameForecast[], today = new Date()): number | null {
  const day = localDay(today)
  const ahead = games
    .filter((g) => !isPlayed(g) && (g.gameday === null || g.gameday >= day))
    .sort((a, b) => a.week - b.week)
  if (ahead.length) return ahead[0].week
  const played = games.filter(isPlayed)
  if (played.length) return Math.max(...played.map((g) => g.week))
  return games[0]?.week ?? null
}

/** My fantasy players' teams this season: the games with my players are marked and come first. */
export function myPlayersQuery(
  ownership: StatsOwnership | null,
  season: number
): StatsQuery | null {
  const mine = Object.entries(ownership?.players ?? {})
    .filter(([, o]) => o.mine)
    .map(([id]) => id)
  if (!mine.length) return null
  return {
    entity: 'player',
    metrics: ['games'],
    scope: { seasons: [season], seasonType: 'ALL', players: mine },
    transform: 'raw',
    sort: { metric: 'games', dir: 'desc' },
    limit: 100
  }
}

export function myTeams(
  ownership: StatsOwnership | null,
  players: StatsResult | null
): ReadonlySet<string> {
  const teams = new Set<string>()
  for (const r of players?.rows ?? []) if (r.team) teams.add(r.team)
  for (const [team, o] of Object.entries(ownership?.teams ?? {})) if (o.mine) teams.add(team)
  return teams
}

/** A rail item (handoff "9. Game"): away over home, the scores or the kickoff and the line. */
export interface RailGame {
  id: string
  away: string
  home: string
  played: boolean
  awayScore: string
  homeScore: string
  awayWon: boolean
  homeWon: boolean
  /** "Sun 1:00 PM" before the game. */
  when: string
  /** The home team's line ("−3.5", "+2.5", "PK"); null without one. */
  line: string | null
  mine: boolean
}

/** The home team's line as a book writes it: negative when it is favored. */
export function homeLine(spread: number | null): string | null {
  if (spread === null) return null
  if (Math.abs(spread) < 0.25) return 'PK'
  return `${spread > 0 ? '−' : '+'}${Math.abs(spread).toFixed(1)}`
}

/** A week's games: mine first, then by kickoff, then the away team. */
export function railGames(
  games: readonly GameForecast[],
  week: number,
  mine: ReadonlySet<string>,
  timeZone?: string
): RailGame[] {
  const isMine = (g: GameForecast): boolean => mine.has(g.home) || mine.has(g.away)
  const at = (g: GameForecast): number => (g.kickoff ? Date.parse(g.kickoff) : Infinity)
  return games
    .filter((g) => g.week === week)
    .sort(
      (a, b) =>
        Number(isMine(b)) - Number(isMine(a)) || at(a) - at(b) || a.away.localeCompare(b.away)
    )
    .map((g) => {
      const played = isPlayed(g)
      return {
        id: g.gameId,
        away: teamAbbr(g.away),
        home: teamAbbr(g.home),
        played,
        awayScore: played ? String(g.awayScore) : '',
        homeScore: played ? String(g.homeScore) : '',
        awayWon: played && g.awayScore! > g.homeScore!,
        homeWon: played && g.homeScore! > g.awayScore!,
        when: g.kickoff ? kickoffLabel(g.kickoff, timeZone) : (g.gameday ?? 'TBD'),
        line: homeLine(g.spread),
        mine: isMine(g)
      }
    })
}

/** The teams with a regular-season week off: every team of the season not playing that week. */
export function byeTeams(games: readonly GameForecast[], week: number): string[] {
  const reg = games.filter((g) => g.seasonType === 'REG')
  if (!reg.some((g) => g.week === week)) return []
  const all = new Set(reg.flatMap((g) => [g.home, g.away]))
  for (const g of reg) if (g.week === week) [g.home, g.away].forEach((t) => all.delete(t))
  return [...all].sort().map(teamAbbr)
}

/** One side of the header: the team, its record and Elo before the game, its last four results. */
export interface HeaderSide {
  team: string
  abbr: string
  name: string
  meta: string
  form: { result: 'W' | 'L' | 'T'; title: string }[]
  /** Its score, or its Elo win probability before the game. */
  big: string
  /** The loser's score, or the underdog's probability, reads quieter. */
  dim: boolean
}

export interface HeaderView {
  away: HeaderSide
  home: HeaderSide
  played: boolean
  bigLabel: string
  status: string
  sub: string
}

const pct0 = (x: number): string => `${Math.round(x * 100)}%`

/** "Sun, Nov 1 · 4:25 PM" in `timeZone` (default: the machine's). */
export function kickoffText(iso: string, timeZone?: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone
  })
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone })
  return `${day} · ${time}`
}

/** "Indoors" under a dome or a closed roof, "Outdoors", or nothing when the schedule does not say. */
export function roofText(roof: string | null): string | null {
  if (roof === 'dome' || roof === 'closed') return 'Indoors'
  if (roof === 'outdoors' || roof === 'open') return 'Outdoors'
  return null
}

export function headerView(
  games: readonly GameForecast[],
  g: GameForecast,
  timeZone?: string
): HeaderView {
  const played = isPlayed(g)
  const before = games.filter((x) => isPlayed(x) && x.week < g.week)
  const side = (team: string, home: boolean): HeaderSide => {
    const results = before
      .filter((x) => x.home === team || x.away === team)
      .sort((a, b) => a.week - b.week)
      .map((x) => {
        const us = x.home === team ? x.homeScore! : x.awayScore!
        const them = x.home === team ? x.awayScore! : x.homeScore!
        const opp = teamAbbr(x.home === team ? x.away : x.home)
        const result: 'W' | 'L' | 'T' = us > them ? 'W' : us < them ? 'L' : 'T'
        return {
          result,
          title: `${weekLabel(x.season, x.seasonType, x.week)}: ${result} ${us}–${them} ${x.home === team ? 'vs' : 'at'} ${opp}`
        }
      })
    const count = (r: string): number => results.filter((x) => x.result === r).length
    const t = count('T')
    const record = `${count('W')}–${count('L')}${t ? `–${t}` : ''}`
    const elo = Math.round(home ? g.homeElo : g.awayElo).toLocaleString('en-US')
    const p = home ? g.homeWinProb : 1 - g.homeWinProb
    const us = home ? g.homeScore : g.awayScore
    const them = home ? g.awayScore : g.homeScore
    return {
      team,
      abbr: teamAbbr(team),
      name: TEAM_NAMES[team] ?? team,
      meta: `${record} · Elo ${elo} · ${g.neutral ? 'neutral site' : home ? 'home' : 'away'}`,
      form: results.slice(-4),
      big: played ? String(us) : pct0(p),
      dim: played ? us! < them! : p < 0.5
    }
  }
  const week = weekLabel(g.season, g.seasonType, g.week)
  const roof = roofText(g.roof)
  return {
    away: side(g.away, false),
    home: side(g.home, true),
    played,
    bigLabel: played ? 'Final' : 'Win probability · Elo',
    status: played
      ? `Final · ${week}`
      : g.kickoff
        ? kickoffText(g.kickoff, timeZone)
        : g.gameday
          ? new Date(`${g.gameday}T12:00:00`).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })
          : 'Date to be set',
    sub: [played ? null : week, g.neutral ? 'Neutral site' : null, roof].filter(Boolean).join(' · ')
  }
}

/** "The forecast" (spec §9.5): Elo and the market, the line, the conditions. */
export interface ForecastView {
  probs: { label: string; away: string; home: string; awayShare: number }[]
  agree: string
  /** After the game: who won, and whether the favorite did. */
  result: { text: string; upset: boolean } | null
  tiles: { key: string; value: string; sub: string }[]
  conditions: { big: string; line: string; note: string | null }
}

/** "KC −3.5", "Pick’em": the favorite and its margin. */
function spreadText(home: string, away: string, homeMargin: number): string {
  if (Math.abs(homeMargin) < 0.25) return 'Pick’em'
  return `${teamAbbr(homeMargin > 0 ? home : away)} −${Math.abs(homeMargin).toFixed(1)}`
}

export function forecastView(g: GameForecast): ForecastView {
  const [A, H] = [teamAbbr(g.away), teamAbbr(g.home)]
  const probs = [{ label: 'Elo', hp: g.homeWinProb }]
  if (g.vegasHomeWinProb !== null) probs.push({ label: 'Market', hp: g.vegasHomeWinProb })
  let agree = 'No betting line for this game: Elo only.'
  if (g.vegasHomeWinProb !== null) {
    const gap = g.homeWinProb - g.vegasHomeWinProb
    const fav = g.vegasHomeWinProb >= 0.5 ? H : A
    if (Math.abs(gap) < 0.04)
      agree = `Elo and the market agree: ${fav} ${g.spread !== null && Math.abs(g.spread) >= 0.25 ? `by ${Math.abs(g.spread).toFixed(1)}` : 'in a coin flip'}.`
    else {
      const team = gap > 0 ? H : A
      const elo = gap > 0 ? g.homeWinProb : 1 - g.homeWinProb
      const market = gap > 0 ? g.vegasHomeWinProb : 1 - g.vegasHomeWinProb
      agree = `Elo likes ${team} more than the market does (${pct0(elo)} against ${pct0(market)}).`
    }
  }
  let result: ForecastView['result'] = null
  if (isPlayed(g)) {
    const hs = g.homeScore!
    const as = g.awayScore!
    const favHome = (g.vegasHomeWinProb ?? g.homeWinProb) >= 0.5
    if (hs === as) result = { text: `A ${hs}–${as} tie`, upset: false }
    else {
      const homeWon = hs > as
      result = {
        text: `${homeWon ? H : A} won ${Math.max(hs, as)}–${Math.min(hs, as)} · ${homeWon === favHome ? 'the favorite won' : 'an upset'}`,
        upset: homeWon !== favHome
      }
    }
  }
  const tiles = [
    g.spread === null
      ? { key: 'Spread', value: '—', sub: `Elo: ${spreadText(g.home, g.away, g.eloSpread)}` }
      : {
          key: 'Spread',
          value: spreadText(g.home, g.away, g.spread),
          sub: `Elo: ${spreadText(g.home, g.away, g.eloSpread)}`
        },
    { key: 'Total', value: g.total === null ? '—' : g.total.toFixed(1), sub: 'over / under' }
  ]
  if (g.total !== null && g.spread !== null) {
    const home = (g.total + g.spread) / 2
    tiles.push({
      key: 'Implied',
      value: `${(g.total - home).toFixed(1)}–${home.toFixed(1)}`,
      sub: `${A} – ${H} points`
    })
  }
  const roof = roofText(g.roof)
  let conditions: ForecastView['conditions']
  if (roof === 'Indoors')
    conditions = {
      big: 'Indoors',
      line: g.roof === 'closed' ? 'Roof closed: no weather.' : 'A dome: no weather.',
      note: null
    }
  else if (g.temp !== null || g.wind !== null) {
    const wind = g.wind === null ? null : Math.round(g.wind)
    conditions = {
      big: g.temp === null ? 'Outdoors' : `${Math.round(g.temp)}°F`,
      line: [
        'Outdoors',
        wind === null ? null : `wind ${wind} mph`,
        wind !== null && wind >= 15 ? 'enough to slow the passing game' : null
      ]
        .filter(Boolean)
        .join(' · '),
      note: isPlayed(g) ? 'At kickoff.' : 'From the schedule.'
    }
  } else
    conditions = {
      big: roof ?? '—',
      line: isPlayed(g) ? 'No weather in the schedule.' : 'No weather in the schedule yet.',
      note: null
    }
  return {
    probs: probs.map((p) => ({
      label: p.label,
      away: pct0(1 - p.hp),
      home: pct0(p.hp),
      awayShare: 1 - p.hp
    })),
    agree,
    result,
    tiles,
    conditions
  }
}

/**
 * The stats a preview reads: the weeks of the season before the game. Week 1 reads the season
 * before; a postseason game, its regular season. null: nothing before it (2019 week 1).
 */
export interface BeforeScope {
  scope: StatsQuery['scope']
  season: number
  label: string
}

export function beforeGame(g: GameForecast, firstSeason = 2019): BeforeScope | null {
  if (g.seasonType === 'POST')
    return {
      scope: { seasons: [g.season], seasonType: 'REG' },
      season: g.season,
      label: `the ${g.season} regular season`
    }
  if (g.week === 1) {
    if (g.season - 1 < firstSeason) return null
    return {
      scope: { seasons: [g.season - 1], seasonType: 'REG' },
      season: g.season - 1,
      label: `the ${g.season - 1} season`
    }
  }
  const last = g.week - 1
  return {
    scope: { seasons: [g.season], seasonType: 'REG', weeks: [1, last] },
    season: g.season,
    label: last === 1 ? 'week 1' : `weeks 1–${last}`
  }
}

/** Phase by phase (spec §9.5): each row is a label, the offense's metric and the defense's. */
export const PHASES: { label: string; rows: [string, string, string][] }[] = [
  {
    label: 'Overall',
    rows: [
      ['Adjusted EPA per play', 'adj_off_epa', 'adj_def_epa'],
      ['Success rate', 'off_success_rate', 'def_success_rate'],
      ['Explosive-play rate', 'off_explosive_rate', 'def_explosive_rate']
    ]
  },
  {
    label: 'Passing',
    rows: [
      ['EPA per dropback', 'off_pass_epa', 'def_pass_epa'],
      ['Dropback success rate', 'off_pass_success', 'def_pass_success']
    ]
  },
  {
    label: 'Rushing',
    rows: [
      ['EPA per carry', 'off_rush_epa', 'def_rush_epa'],
      ['Stuff rate', 'off_stuff_rate', 'def_stuff_rate']
    ]
  },
  {
    label: 'Protection vs pass rush',
    rows: [
      ['Sack rate', 'off_sack_rate', 'def_sack_rate'],
      ['Pressure rate', 'off_pressure_rate', 'def_pressure_rate']
    ]
  },
  {
    label: 'Finishing',
    rows: [
      ['Red-zone TD rate', 'off_rz_td_pct', 'def_rz_td_pct'],
      ['Third-down %', 'off_third_down_pct', 'def_third_down_pct']
    ]
  }
]

/** Fantasy points a defense allows, by the position it faces. */
export const ALLOWED: Record<KeyPosition, string> = {
  QB: 'fpa_qb',
  RB: 'fpa_rb',
  WR: 'fpa_wr',
  TE: 'fpa_te'
}

type KeyPosition = 'QB' | 'RB' | 'WR' | 'TE'

/**
 * Answers to several queries over the same rows, as one: each row's values together. DuckDB ranks
 * every metric in its own window step (10–30 ms each, even over 32 rows), so a screen splits a
 * wide query into a few narrow ones that run at once.
 */
export function mergeResults(results: readonly StatsResult[]): StatsResult | null {
  if (!results.length) return null
  const rows = new Map<string, StatsRow>()
  for (const r of results)
    for (const row of r.rows) {
      const had = rows.get(row.id)
      rows.set(row.id, had ? { ...had, values: { ...had.values, ...row.values } } : row)
    }
  return {
    grain: results[0].grain,
    columns: results.flatMap((r) => r.columns),
    rows: [...rows.values()],
    total: rows.size,
    notes: [...new Set(results.flatMap((r) => r.notes))],
    ms: Math.max(...results.map((r) => r.ms))
  }
}

/**
 * Every team before the game: the offenses' phases, the defenses' and the fantasy points each
 * defense allows by position, as three queries that run at once.
 */
export function matchupQueries(
  before: BeforeScope,
  scoring: Scoring
): Map<'off' | 'def' | 'fpa', StatsQuery> {
  const q = (metrics: string[]): StatsQuery => ({
    entity: 'team',
    metrics,
    scope: before.scope,
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring,
    limit: 40
  })
  const rows = PHASES.flatMap((p) => p.rows)
  return new Map([
    ['off', q(rows.map(([, o]) => o))],
    ['def', q(rows.map(([, , d]) => d))],
    ['fpa', q(Object.values(ALLOWED))]
  ])
}

/** A team's value of a metric, ranked among the teams. */
export interface TeamCell {
  value: string
  rank: string
  percentile: number
  title: string
}

function teamCell(
  result: StatsResult,
  team: string,
  metric: string,
  byId: ReadonlyMap<string, MetricInfo>
): TeamCell | null {
  const info = byId.get(metric)
  const v = result.rows.find((r) => r.id === team)?.values[metric]?.value ?? null
  const place = teamRank(result, team, metric, info?.direction ?? 'neutral')
  if (v === null || !place) return null
  const value = fmtStat(v, {
    unit: info?.unit ?? 'number',
    decimals: info?.decimals ?? 1,
    kind: info?.kind
  })
  const rank = `${place.tied ? 'T-' : ''}${ordinal(place.rank)}`
  return {
    value,
    rank,
    percentile: place.percentile,
    title: `${info?.label ?? metric}: ${value}, ${rank} of ${place.of}${info?.direction === 'lower' ? ' (lower is better)' : ''}`
  }
}

export interface FaceRow {
  label: string
  off: TeamCell | null
  def: TeamCell | null
  /** The offense's percentile minus the defense's (each on its own better side): + leans offense. */
  edge: number | null
  /** Why the row is empty ("Not published for 2026 yet."). */
  missing: string | null
}

export interface FaceView {
  off: string
  def: string
  groups: { label: string; rows: FaceRow[] }[]
  summary: string | null
}

/** One offense against the other defense, phase by phase. */
export function faceView(
  result: StatsResult,
  off: string,
  def: string,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): FaceView {
  let best: { edge: number; label: string } | null = null
  const groups = PHASES.map((p) => ({
    label: p.label,
    rows: p.rows.map(([label, o, d]): FaceRow => {
      const oc = teamCell(result, off, o, byId)
      const dc = teamCell(result, def, d, byId)
      const published = (id: string): boolean =>
        (result.columns.find((c) => c.id === id)?.seasons.length ?? 0) > 0
      const missing =
        published(o) && published(d)
          ? null
          : (byId.get(o)?.firstSeason ?? 0) > season
            ? `Charted from ${byId.get(o)!.firstSeason}.`
            : `Not published for ${season} yet.`
      const edge = oc && dc && !missing ? Math.round(oc.percentile - dc.percentile) : null
      if (edge !== null && (!best || Math.abs(edge) > Math.abs(best.edge))) best = { edge, label }
      return { label, off: missing ? null : oc, def: missing ? null : dc, edge, missing }
    })
  }))
  const b = best as { edge: number; label: string } | null
  const lower = (s: string): string => (/^[A-Z]{2}/.test(s) ? s : s[0].toLowerCase() + s.slice(1))
  return {
    off: teamAbbr(off),
    def: teamAbbr(def),
    groups,
    summary:
      b && b.edge !== 0
        ? `Biggest edge: ${b.edge > 0 ? `${teamAbbr(off)} offense` : `${teamAbbr(def)} defense`}, on ${lower(b.label)} (${Math.abs(b.edge)} percentile points).`
        : null
  }
}

/** Every QB, RB, WR and TE before the game: their fantasy points, the order of the key players. */
export function seasonPlayersQuery(before: BeforeScope, scoring: Scoring): StatsQuery {
  return {
    entity: 'player',
    metrics: ['fantasy_points', 'fantasy_ppg'],
    scope: { ...before.scope, positions: ['QB', 'RB', 'WR', 'TE'] },
    transform: 'raw',
    sort: { metric: 'fantasy_points', dir: 'desc' },
    scoring,
    limit: 5000
  }
}

/** Each team's last game before this one, this season: its players are the ones who play. */
export function lastGames(
  games: readonly GameForecast[],
  g: GameForecast
): Partial<Record<string, number>> {
  const out: Partial<Record<string, number>> = {}
  for (const team of [g.away, g.home]) {
    const before = games.filter(
      (x) => isPlayed(x) && x.week < g.week && (x.home === team || x.away === team)
    )
    if (before.length) out[team] = Math.max(...before.map((x) => x.week))
  }
  return out
}

/**
 * Who played in each team's last game (before a game not played yet): the key players are chosen
 * among them, so a player out for the season is not. A final game reads its own box score.
 */
export function participantsQuery(
  g: GameForecast,
  last: Partial<Record<string, number>>
): StatsQuery | null {
  const weeks = Object.values(last).filter((w): w is number => w !== undefined)
  if (!weeks.length) return null
  return {
    entity: 'player',
    metrics: ['games'],
    scope: {
      seasons: [g.season],
      seasonType: 'ALL',
      weeks: [Math.min(...weeks), Math.max(...weeks)],
      teams: Object.keys(last),
      positions: ['QB', 'RB', 'WR', 'TE']
    },
    groupBy: ['week'],
    transform: 'raw',
    sort: { metric: 'games', dir: 'desc' },
    limit: 1000
  }
}

/** The players of each team's last game, by team. */
export function participants(
  result: StatsResult | null,
  last: Partial<Record<string, number>>
): Map<string, StatsRow[]> {
  const out = new Map<string, StatsRow[]>()
  for (const r of result?.rows ?? []) {
    if (!r.team || r.group.week !== last[r.team]) continue
    out.set(r.team, [...(out.get(r.team) ?? []), r])
  }
  return out
}

/** The box score (handoff "9. Game"): every player of both teams that week. */
export const BOX_METRICS = [
  'fantasy_points',
  'pass_cmp',
  'pass_att',
  'pass_yds',
  'pass_td',
  'pass_int',
  'carries',
  'rush_yds',
  'rush_td',
  'targets',
  'receptions',
  'rec_yds',
  'rec_td',
  'fg_made',
  'fg_att',
  'sacks',
  'def_ints',
  'fumble_recoveries',
  'def_tds'
]

/** The box score as three queries that run at once: passing, rushing and receiving, the rest. */
export function boxQueries(
  g: GameForecast,
  scoring: Scoring
): Map<'pass' | 'run' | 'rest', StatsQuery> {
  const q = (metrics: string[], positions: PositionGroup[]): StatsQuery => ({
    entity: 'player',
    metrics,
    scope: {
      seasons: [g.season],
      seasonType: g.seasonType,
      weeks: [g.week, g.week],
      teams: [g.away, g.home],
      positions
    },
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring,
    limit: 300
  })
  const [pass, run, rest] = [
    BOX_METRICS.slice(0, 6),
    BOX_METRICS.slice(6, 13),
    BOX_METRICS.slice(13)
  ]
  return new Map([
    ['pass', q(pass, ['QB', 'RB', 'WR', 'TE', 'K'])],
    ['run', q(run, ['QB', 'RB', 'WR', 'TE'])],
    ['rest', q(rest, ['K', 'DL', 'LB', 'DB'])]
  ])
}

/**
 * The players a team's key players are chosen from: those with a pass, a carry or a target in a
 * final game's box score, else those of its last game before.
 */
export function keyPool(
  team: string,
  box: StatsResult | null,
  last: ReadonlyMap<string, StatsRow[]>
): StatsRow[] | null {
  if (box)
    return box.rows.filter(
      (r) =>
        r.team === team &&
        ['pass_att', 'carries', 'targets'].some((id) => (r.values[id]?.value ?? 0) > 0)
    )
  return last.get(team) ?? null
}

/** Each defense's leading pass rusher before the game. */
export function rushersQuery(before: BeforeScope, teams: string[]): StatsQuery {
  return {
    entity: 'player',
    metrics: ['sacks', 'qb_hits'],
    scope: { ...before.scope, teams, positions: ['DL', 'LB', 'DB'] },
    transform: 'raw',
    sort: { metric: 'sacks', dir: 'desc' },
    limit: 300
  }
}

const num = (r: StatsRow | undefined, id: string): number => r?.values[id]?.value ?? 0
const one = (x: number): string => x.toFixed(1)

export type Tone = 'good' | 'bad' | 'neutral'

/** A key player against the other defense (spec §9.5 "key player matchups"). */
export interface KeyPlayer {
  id: string
  name: string
  position: KeyPosition
  mine: boolean
  /** "FP/G 17.9 · WR6": his points per game and his rank at the position before the game. */
  meta: string
  /** The defense's rank against the position: 1 allows the fewest points (handoff's matchup chip). */
  matchup: { opponent: string; rank: string; tone: Tone; title: string } | null
  /** Sleeper's projection before the game, the points he scored after it; null without either. */
  last: { value: string; label: string } | null
}

export interface KeySide {
  team: string
  players: KeyPlayer[]
  rush: { head: string; line: string } | null
}

const SLOTS: [KeyPosition, number][] = [
  ['QB', 1],
  ['RB', 1],
  ['WR', 2],
  ['TE', 1]
]

/**
 * A team's key players: its leading QB, RB, two WRs and TE by fantasy points before the game,
 * among the players of its last game (or its box score); the season's rows when it has none.
 */
export function keySide(
  team: string,
  opponent: string,
  options: {
    played: StatsRow[] | null
    season: StatsResult | null
    matchups: StatsResult | null
    rushers: StatsResult | null
    ownership: StatsOwnership | null
    /** Fantasy points in this game (a final game's box score). */
    scored: ReadonlyMap<string, number> | null
    /** Sleeper's projection for this game, by gsis id. */
    projected: ReadonlyMap<string, number> | null
    range: string
  }
): KeySide {
  const { played, season, matchups, rushers, ownership, scored, projected, range } = options
  const rows = season?.rows ?? []
  const points = new Map(rows.map((r) => [r.id, num(r, 'fantasy_points')]))
  const pool: StatsRow[] = played ?? rows.filter((r) => r.team === team)
  const players: KeyPlayer[] = []
  for (const [position, n] of SLOTS) {
    const at = rows
      .filter((r) => r.position === position)
      .sort((a, b) => (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0))
    const picks = pool
      .filter((r) => r.position === position)
      .sort((a, b) => (points.get(b.id) ?? -1) - (points.get(a.id) ?? -1))
      .slice(0, n)
    for (const r of picks) {
      const own = at.find((x) => x.id === r.id)
      const rank = own ? at.indexOf(own) + 1 : null
      const place = matchups ? teamRank(matchups, opponent, ALLOWED[position], 'lower') : null
      const tone: Tone = !place
        ? 'neutral'
        : place.rank <= 11
          ? 'bad'
          : place.rank >= 22
            ? 'good'
            : 'neutral'
      const s = scored?.get(r.id)
      const p = projected?.get(r.id)
      players.push({
        id: r.id,
        name: r.name,
        position,
        mine: ownership?.players[r.id]?.mine === true,
        meta: own
          ? `FP/G ${one(num(own, 'fantasy_ppg'))} · ${position}${rank}`
          : 'No games before this one',
        matchup: place
          ? {
              opponent: teamAbbr(opponent),
              rank: ordinal(place.rank),
              tone,
              title: `${teamAbbr(opponent)} allows the ${place.rank === 1 ? 'fewest' : `${ordinal(place.rank)}-fewest`} fantasy points per game to ${position}s (1st is the toughest)`
            }
          : null,
        last:
          s !== undefined
            ? { value: one(s), label: 'scored' }
            : p !== undefined
              ? { value: one(p), label: 'Sleeper' }
              : null
      })
    }
  }
  // The other defense's leading pass rusher against this team's protection.
  const rusher = (rushers?.rows ?? [])
    .filter((r) => r.team === opponent)
    .sort((a, b) => num(b, 'sacks') - num(a, 'sacks') || num(b, 'qb_hits') - num(a, 'qb_hits'))[0]
  let rush: KeySide['rush'] = null
  if (rusher && matchups) {
    const ours = teamRank(matchups, team, 'off_sack_rate', 'lower')
    const theirs = teamRank(matchups, opponent, 'def_sack_rate', 'higher')
    const rate = matchups.rows.find((r) => r.id === team)?.values.off_sack_rate?.value ?? null
    rush = {
      head: `${teamAbbr(opponent)}’s top rusher against the ${teamAbbr(team)} line`,
      line: [
        `${rusher.name} (${teamAbbr(opponent)} ${rusher.position ?? ''}): ${one(num(rusher, 'sacks'))} sacks and ${num(rusher, 'qb_hits')} QB hits in ${range}.`,
        rate !== null && ours
          ? `${teamAbbr(team)} allows a sack on ${(rate * 100).toFixed(1)}% of dropbacks (${ordinal(ours.rank)} of ${ours.of}).`
          : null,
        theirs
          ? `${teamAbbr(opponent)}’s defense ranks ${ordinal(theirs.rank)} in sack rate.`
          : null
      ]
        .filter(Boolean)
        .join(' ')
    }
  }
  return { team: teamAbbr(team), players, rush }
}

/** Sleeper's projections for a week, by gsis id, from Fantasy's rows and the id map. */
export function projectionMap(
  rows: readonly PlayerWeekRow[],
  sleeperIds: ReadonlyMap<string, string | null>
): Map<string, number> {
  const bySleeper = new Map(rows.map((r) => [r.playerId, r.projected]))
  const out = new Map<string, number>()
  for (const [gsis, sleeper] of sleeperIds) {
    const p = sleeper ? bySleeper.get(sleeper) : undefined
    if (p !== undefined && p !== null) out.set(gsis, p)
  }
  return out
}

/** A box-score table: its title, column heads, rows. */
export interface BoxTable {
  title: string
  heads: string[]
  rows: { id: string; name: string; mine: boolean; cells: string[]; fp: string }[]
}

export interface BoxSide {
  team: string
  tables: BoxTable[]
  kicker: { id: string; name: string; fg: string; fp: string } | null
  defense: { sacks: string; takeaways: string; tds: string }
}

export interface BoxView {
  top: { id: string; name: string; team: string; position: string; mine: boolean; fp: string }[]
  sides: [BoxSide, BoxSide]
  /** Fantasy points by gsis id: the key players' "scored". */
  scored: Map<string, number>
}

const n0 = (x: number): string => String(Math.round(x))

export function boxView(
  result: StatsResult,
  g: GameForecast,
  ownership: StatsOwnership | null
): BoxView {
  const mine = (id: string): boolean => ownership?.players[id]?.mine === true
  const fp = (r: StatsRow): string => one(num(r, 'fantasy_points'))
  const line = (r: StatsRow, cells: string[]): BoxTable['rows'][number] => ({
    id: r.id,
    name: r.name,
    mine: mine(r.id),
    cells,
    fp: fp(r)
  })
  const side = (team: string): BoxSide => {
    const rows = result.rows.filter((r) => r.team === team)
    const by = (id: string) => (a: StatsRow, b: StatsRow) => num(b, id) - num(a, id)
    const passing = rows.filter((r) => num(r, 'pass_att') > 0).sort(by('pass_att'))
    const rushing = rows.filter((r) => num(r, 'carries') > 0).sort(by('rush_yds'))
    const receiving = rows.filter((r) => num(r, 'targets') > 0).sort(by('rec_yds'))
    const k = rows.filter((r) => r.position === 'K').sort(by('fg_att'))[0]
    const defenders = rows.filter((r) => ['DL', 'LB', 'DB'].includes(r.position ?? ''))
    const sum = (id: string): number => defenders.reduce((s, r) => s + num(r, id), 0)
    return {
      team: teamAbbr(team),
      tables: [
        {
          title: 'Passing',
          heads: ['C/A', 'YDS', 'TD', 'INT'],
          rows: passing.map((r) =>
            line(r, [
              `${n0(num(r, 'pass_cmp'))}/${n0(num(r, 'pass_att'))}`,
              n0(num(r, 'pass_yds')),
              n0(num(r, 'pass_td')),
              n0(num(r, 'pass_int'))
            ])
          )
        },
        {
          title: 'Rushing',
          heads: ['ATT', 'YDS', 'AVG', 'TD'],
          rows: rushing.map((r) =>
            line(r, [
              n0(num(r, 'carries')),
              n0(num(r, 'rush_yds')),
              one(num(r, 'rush_yds') / num(r, 'carries')),
              n0(num(r, 'rush_td'))
            ])
          )
        },
        {
          title: 'Receiving',
          heads: ['REC/TGT', 'YDS', 'TD'],
          rows: receiving.map((r) =>
            line(r, [
              `${n0(num(r, 'receptions'))}/${n0(num(r, 'targets'))}`,
              n0(num(r, 'rec_yds')),
              n0(num(r, 'rec_td'))
            ])
          )
        }
      ].filter((t) => t.rows.length > 0),
      kicker: k
        ? {
            id: k.id,
            name: k.name,
            fg: `${n0(num(k, 'fg_made'))}/${n0(num(k, 'fg_att'))}`,
            fp: fp(k)
          }
        : null,
      defense: {
        sacks: one(sum('sacks')).replace(/\.0$/, ''),
        takeaways: n0(sum('def_ints') + sum('fumble_recoveries')),
        tds: n0(sum('def_tds'))
      }
    }
  }
  const scoring: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'K']
  const scored = new Map<string, number>()
  for (const r of result.rows) {
    const v = r.values.fantasy_points?.value
    if (v !== null && v !== undefined && scoring.includes(r.position as PositionGroup))
      scored.set(r.id, v)
  }
  return {
    top: result.rows
      .filter((r) => scored.has(r.id))
      .sort((a, b) => scored.get(b.id)! - scored.get(a.id)!)
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        name: r.name,
        team: teamAbbr(r.team ?? ''),
        position: r.position ?? '',
        mine: mine(r.id),
        fp: fp(r)
      })),
    sides: [side(g.away), side(g.home)],
    scored
  }
}
```

- [x] **Step 4: Run the tests**

```bash
npx vitest run tests/renderer/lib/statsGames.test.ts && npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
```

Expected: 19 passed; typecheck and lint clean; the suite 1180 passed | 5 skipped.

- [x] **Step 5: Commit**

```bash
npx prettier --check src/renderer/src/lib/stats/games.ts tests/renderer/lib/statsGames.test.ts
git add src/renderer/src/lib/stats/games.ts tests/renderer/lib/statsGames.test.ts
git commit -m "feat(stats): the Games model"
```

---

### Task 3: Games on screen (spec §9.5, §9.6; amendments A–E, G)

`StatsGames`: the rail (Season, Week, the games, the byes), the bar (Preview · Box score, what the team stats cover, the fantasy scoring), the header, and the Preview (the forecast, phase by phase, key matchups) or the Box score. Every query is fresh (`keepLast: false`). `useWeekProjections` reads Sleeper's projections for the key players of a game not played yet, with a league. The nav enables Games; `StatsApp` keeps its week, game and tab for the session and opens the dashboards from it.

**Files:**

- Create: `src/renderer/src/screens/stats/StatsGames.tsx`, `tests/renderer/components/StatsGames.test.tsx`
- Modify: `src/renderer/src/lib/stats/useStats.ts`, `src/renderer/src/components/stats/StatsNav.tsx`, `src/renderer/src/screens/stats/StatsApp.tsx`, `tests/renderer/components/StatsShell.test.tsx`

- [x] **Step 1: Write the failing tests**

Create `tests/renderer/components/StatsGames.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { StatsApp } from '@/screens/stats/StatsApp'
import type { StatsScope } from '@/lib/stats/scope'
import { api } from '@/lib/api'
import type { GameForecast, StatsOwnership, StatsQuery } from '@shared/stats/types'
import type { PlayersWeek, UpdateState } from '@shared/types'
import { catalogue, result, row, STATUS, value } from '../../fixtures/statsScreens'

vi.mock('@/lib/api', () => ({
  api: {
    players: { detail: vi.fn(), week: vi.fn() },
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
const players = vi.mocked(api.players)

/** p1 (mine) plays for BUF. */
const OWNERSHIP: StatsOwnership = { players: { bw1: { name: 'Me', mine: true } }, teams: {} }

const day = (offset: number): string =>
  new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10)

function game(over: Partial<GameForecast>): GameForecast {
  return {
    gameId: 'g',
    season: 2026,
    seasonType: 'REG',
    week: 1,
    gameday: day(-30),
    kickoff: null,
    home: 'KC',
    away: 'BUF',
    neutral: false,
    homeScore: null,
    awayScore: null,
    homeElo: 1600,
    awayElo: 1550,
    homeWinProb: 0.62,
    eloSpread: 3.1,
    vegasHomeWinProb: 0.6,
    spread: 2.5,
    total: 48.5,
    roof: 'outdoors',
    temp: null,
    wind: null,
    ...over
  }
}

/** Week 1 and 2 final, week 3 next: MIA at NE, then BUF at KC (mine, so first). */
const GAMES: GameForecast[] = [
  game({ gameId: 'a1', week: 1, home: 'BUF', away: 'MIA', homeScore: 27, awayScore: 20 }),
  game({ gameId: 'b1', week: 1, home: 'KC', away: 'NE', homeScore: 30, awayScore: 10 }),
  game({ gameId: 'a2', week: 2, home: 'NE', away: 'BUF', homeScore: 13, awayScore: 23 }),
  game({ gameId: 'b2', week: 2, home: 'MIA', away: 'KC', homeScore: 20, awayScore: 24 }),
  game({ gameId: 'c3', week: 3, home: 'NE', away: 'MIA', gameday: day(5) }),
  game({ gameId: 'a3', week: 3, home: 'KC', away: 'BUF', gameday: day(6) })
]
const TEAMS = ['BUF', 'KC', 'MIA', 'NE']

/** [id, name, team, position] */
const PLAYERS: [string, string, string, string][] = [
  ['bq', 'Buffalo Passer', 'BUF', 'QB'],
  ['br', 'Buffalo Back', 'BUF', 'RB'],
  ['bw1', 'Buffalo Wideout', 'BUF', 'WR'],
  ['bw2', 'Buffalo Slot', 'BUF', 'WR'],
  ['bt', 'Buffalo End', 'BUF', 'TE'],
  ['be', 'Buffalo Rusher', 'BUF', 'DL'],
  ['kq', 'Kansas Passer', 'KC', 'QB'],
  ['kw', 'Kansas Wideout', 'KC', 'WR'],
  ['kk', 'Kansas Kicker', 'KC', 'K'],
  ['ke', 'Kansas Rusher', 'KC', 'LB']
]

function answer(q: StatsQuery): ReturnType<typeof result> {
  if (q.entity === 'team') {
    const rows = TEAMS.map((t, i) =>
      row(t, t, Object.fromEntries(q.metrics.map((m) => [m, value((i + 1) / 10)])), {
        team: t,
        position: null
      })
    )
    return result(q.metrics, rows)
  }
  const s = q.scope
  const rows = PLAYERS.filter(
    ([id, , team, position]) =>
      (!s.players || s.players.includes(id)) &&
      (!s.teams || s.teams.includes(team)) &&
      (!s.positions || s.positions.includes(position as never))
  ).map(([id, name, team, position], i) =>
    row(id, name, Object.fromEntries(q.metrics.map((m) => [m, value(20 - i)])), {
      team,
      position
    })
  )
  if (q.groupBy?.includes('week')) {
    const [a, b] = s.weeks!
    return result(
      q.metrics,
      rows.flatMap((r) =>
        Array.from({ length: b - a + 1 }, (_, k) => ({ ...r, group: { week: a + k } }))
      )
    )
  }
  return result(q.metrics, rows)
}

const IDLE: UpdateState = { status: 'idle' } as UpdateState

function Harness({ hasLeague = true }: { hasLeague?: boolean }): React.JSX.Element {
  const [scope, setScope] = useState<StatsScope | null>(null)
  return (
    <StatsApp
      hasLeague={hasLeague}
      leagueKey={0}
      onOpenFantasy={() => {}}
      update={IDLE}
      version="0.36.0"
      onOpenUpdate={() => {}}
      onToggleTheme={() => {}}
      scope={scope}
      onScope={setScope}
    />
  )
}

async function openGames(hasLeague = true): Promise<void> {
  render(<Harness hasLeague={hasLeague} />)
  await waitFor(() => expect(stats.catalogue).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Games' }))
}

const railTeams = (): string[] =>
  within(screen.getByRole('list', { name: 'Games' }))
    .getAllByRole('listitem')
    .map((b) => b.textContent ?? '')

beforeEach(() => {
  vi.resetAllMocks()
  stats.status.mockResolvedValue(STATUS)
  stats.catalogue.mockResolvedValue(catalogue())
  stats.query.mockImplementation(async (q) => answer(q))
  stats.games.mockResolvedValue(GAMES)
  stats.outlook.mockRejectedValue(new Error('no outlook'))
  stats.player.mockRejectedValue(new Error('no bio'))
  stats.link.mockImplementation(async (id) =>
    'gsis' in id ? { sleeper: `s-${id.gsis}`, gsis: id.gsis, team: null } : null
  )
  stats.ownership.mockResolvedValue(OWNERSHIP)
  stats.views.mockResolvedValue([])
  stats.onChanged.mockReturnValue(() => {})
  players.week.mockResolvedValue({
    rows: [{ playerId: 's-bw1', projected: 14.25 }]
  } as PlayersWeek)
})
afterEach(cleanup)

describe('Games (stats-analysis spec §9.5, Plan AE)', () => {
  it('opens on the next week, my game first, with its preview', async () => {
    await openGames()
    await waitFor(() => expect(railTeams()).toHaveLength(2))
    expect(railTeams()[0]).toMatch(/^BUF.*KC/)
    expect((screen.getByRole('combobox', { name: 'Week' }) as HTMLSelectElement).value).toBe('3')
    // Not played: the box score waits.
    expect(screen.getByRole('tab', { name: 'Preview', selected: true })).toBeTruthy()
    expect((screen.getByRole('tab', { name: 'Box score' }) as HTMLButtonElement).disabled).toBe(
      true
    )
    expect(screen.getByText('The forecast')).toBeTruthy()
    expect(screen.getByText('Elo and the market agree: KC by 2.5.')).toBeTruthy()
    // Each offense against the other defense, before the game (weeks 1–2).
    expect(await screen.findByLabelText('BUF offense against KC defense')).toBeTruthy()
    expect(screen.getByLabelText('KC offense against BUF defense')).toBeTruthy()
    expect(screen.getByText('Team stats: weeks 1–2')).toBeTruthy()
    const matchup = stats.query.mock.calls
      .map((c) => c[0])
      .find((q) => q.metrics.includes('fpa_wr'))
    expect(matchup!.scope).toMatchObject({ seasons: [2026], weeks: [1, 2] })
    // The key players, mine marked, with Sleeper's projection.
    const buf = await screen.findByLabelText('BUF key players')
    expect(within(buf).getByText('Buffalo Wideout')).toBeTruthy()
    await waitFor(() => expect(within(buf).getByText('14.3')).toBeTruthy())
    expect(players.week).toHaveBeenCalledWith({ season: 2026, week: 3 })
    expect(within(buf).getByText(/Kansas Rusher \(KC LB\)/)).toBeTruthy()
  })

  it('opens a final game on its box score; its preview is the forecast before kickoff', async () => {
    await openGames()
    await waitFor(() => expect(railTeams()).toHaveLength(2))
    fireEvent.change(screen.getByRole('combobox', { name: 'Week' }), { target: { value: '2' } })
    await waitFor(() => expect(railTeams()[0]).toMatch(/^BUF23NE13/))
    expect(screen.getByRole('tab', { name: 'Box score', selected: true })).toBeTruthy()
    expect(await screen.findByRole('table', { name: 'BUF Passing' })).toBeTruthy()
    // The box score: three narrow queries (the week's players in week 3's preview group by week).
    const box = stats.query.mock.calls
      .map((c) => c[0])
      .filter((q) => !q.groupBy && q.scope.weeks?.[0] === 2 && q.scope.weeks[1] === 2)
    expect(box).toHaveLength(3)
    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(await screen.findByText('The forecast before kickoff')).toBeTruthy()
    expect(screen.getByText('BUF won 23–13 · an upset')).toBeTruthy()
    expect(screen.getByText('Team stats: week 1, before the game')).toBeTruthy()
  })

  it('without a league: no projections, a line says why; a team opens its dashboard', async () => {
    await openGames(false)
    await waitFor(() => expect(railTeams()).toHaveLength(2))
    expect(await screen.findByText(/Import a league in Fantasy/)).toBeTruthy()
    expect(players.week).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTitle('Open the Kansas City Chiefs dashboard'))
    await waitFor(() => expect(stats.games).toHaveBeenCalledWith({ season: 2026, team: 'KC' }))
  })
})
```

The nav's test: Games is enabled now.

Modify `tests/renderer/components/StatsShell.test.tsx`:

```diff
diff --git a/tests/renderer/components/StatsShell.test.tsx b/tests/renderer/components/StatsShell.test.tsx
index 42a5a17..1b95ca2 100644
--- a/tests/renderer/components/StatsShell.test.tsx
+++ b/tests/renderer/components/StatsShell.test.tsx
@@ -96,7 +96,9 @@ describe('the Stats nav', () => {
     expect(screen.getByRole('button', { name: 'Leaderboards' }).getAttribute('aria-current')).toBe(
       'page'
     )
-    expect((screen.getByRole('button', { name: 'Games' }) as HTMLButtonElement).disabled).toBe(true)
+    // Games opens the week's games (Plan AE).
+    fireEvent.click(screen.getByRole('button', { name: 'Games' }))
+    expect(onNavigate).toHaveBeenCalledWith('games')
     fireEvent.click(screen.getByRole('button', { name: 'Glossary' }))
     expect(onNavigate).toHaveBeenCalledWith('glossary')
     expect(screen.getByText('Data through 2026 week 6 · updating…')).toBeTruthy()
```

- [x] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/renderer/components/StatsGames.test.tsx tests/renderer/components/StatsShell.test.tsx
```

Expected: FAIL: the Games screen's 3 tests (no "Games" list: the button is disabled) and the nav's ("Games" not called).

- [x] **Step 3: Implement**

Modify `src/renderer/src/lib/stats/useStats.ts`:

```diff
diff --git a/src/renderer/src/lib/stats/useStats.ts b/src/renderer/src/lib/stats/useStats.ts
index 4197809..7c6e65e 100644
--- a/src/renderer/src/lib/stats/useStats.ts
+++ b/src/renderer/src/lib/stats/useStats.ts
@@ -1,6 +1,7 @@
 import { useEffect, useMemo, useState } from 'react'
 import { api } from '@/lib/api'
 import { errorMessage } from '@/lib/format'
+import { projectionMap } from '@/lib/stats/games'
 import type { PlayerDetail } from '@shared/types'
 import type {
   GameForecast,
@@ -229,6 +230,40 @@ const readDetail = (request: string): Promise<PlayerDetail> => {
   return api.players.detail(season, id)
 }

+const readProjections = async (request: string): Promise<Map<string, number>> => {
+  const { ids, season, week } = JSON.parse(request) as {
+    ids: string[]
+    season: number
+    week: number
+  }
+  const [fantasy, links] = await Promise.all([
+    api.players.week({ season, week }),
+    Promise.all(
+      ids.map(async (gsis) => [gsis, (await api.stats.link({ gsis }))?.sleeper ?? null] as const)
+    )
+  ])
+  return projectionMap(fantasy.rows, new Map(links))
+}
+
+/**
+ * Sleeper's projections of a week for some players (Games, Plan AE), by gsis id, from Fantasy's
+ * file: with a league only (null without one, or while they are read).
+ */
+export function useWeekProjections(
+  ids: readonly string[] | null,
+  season: number,
+  week: number,
+  leagueKey: number
+): ReadonlyMap<string, number> | null {
+  const { data } = useKeyed(
+    ids && ids.length
+      ? `${leagueKey}|${JSON.stringify({ ids: [...ids].sort(), season, week })}`
+      : null,
+    readProjections
+  )
+  return data
+}
+
 /** Spec §9.4: a player's identity and status now, again after a rebuild. */
 export function usePlayerBio(
   player: string | null,
```

Modify `src/renderer/src/components/stats/StatsNav.tsx`:

```diff
diff --git a/src/renderer/src/components/stats/StatsNav.tsx b/src/renderer/src/components/stats/StatsNav.tsx
index 280791a..74831db 100644
--- a/src/renderer/src/components/stats/StatsNav.tsx
+++ b/src/renderer/src/components/stats/StatsNav.tsx
@@ -8,11 +8,12 @@ import type { UpdateState } from '@shared/types'

 /**
  * `player` and `team` are the dashboards (spec §9.4, §9.3), `players` and `teams` the
- * leaderboards, `explore` Compare and Trends (§9.5).
+ * leaderboards, `explore` Chart, Compare and Trends, `games` the week's games (§9.5).
  */
-export type StatsScreen = 'home' | 'player' | 'players' | 'team' | 'teams' | 'explore' | 'glossary'
+export type StatsScreen =
+  'home' | 'player' | 'players' | 'team' | 'teams' | 'explore' | 'games' | 'glossary'

-const ITEMS: { id: StatsScreen | 'games'; label: string }[] = [
+const ITEMS: { id: StatsScreen; label: string }[] = [
   { id: 'home', label: 'Leaderboards' },
   { id: 'player', label: 'Players' },
   { id: 'team', label: 'Teams' },
@@ -38,7 +39,7 @@ interface StatsNavProps {

 /**
  * Stats nav (handoff "Stats nav"): 52px, mark + "Companion Stats", six items, Fantasy ↗, theme.
- * Players and Teams open the dashboards, Explore Compare and Trends.
+ * Players and Teams open the dashboards, Explore its tools, Games the week's games.
  */
 export function StatsNav({
   current,
@@ -66,7 +67,6 @@ export function StatsNav({
       </div>
       <div className="flex gap-[22px] self-stretch text-[13.5px] leading-none font-medium">
         {ITEMS.map(({ id, label }) => {
-          const soon = id === 'games'
           // Players and Teams open the dashboards; the leaderboards are under them.
           const on =
             current === id ||
@@ -76,15 +76,11 @@ export function StatsNav({
             <button
               key={id}
               type="button"
-              disabled={soon}
-              title={soon ? 'Game previews come in a later update' : undefined}
               aria-current={on ? 'page' : undefined}
-              onClick={() => !soon && onNavigate(id)}
+              onClick={() => onNavigate(id)}
               className={cn(
-                'flex cursor-pointer items-center disabled:cursor-default disabled:opacity-40',
-                on
-                  ? 'text-fg shadow-[inset_0_-2px_0_var(--cobalt)]'
-                  : 'text-fg-2 hover:text-fg disabled:hover:text-fg-2'
+                'flex cursor-pointer items-center',
+                on ? 'text-fg shadow-[inset_0_-2px_0_var(--cobalt)]' : 'text-fg-2 hover:text-fg'
               )}
             >
               {label}
```

Modify `src/renderer/src/screens/stats/StatsApp.tsx`:

```diff
diff --git a/src/renderer/src/screens/stats/StatsApp.tsx b/src/renderer/src/screens/stats/StatsApp.tsx
index 3cc3249..962f1ef 100644
--- a/src/renderer/src/screens/stats/StatsApp.tsx
+++ b/src/renderer/src/screens/stats/StatsApp.tsx
@@ -7,6 +7,7 @@ import type { NavLocation } from '@/lib/navHistory'
 import type { BoardDef } from '@/lib/stats/boards'
 import { compareFromPicks, DEFAULT_CHART, type ChartState } from '@/lib/stats/chart'
 import { DEFAULT_COMPARE, type CompareState } from '@/lib/stats/compare'
+import { DEFAULT_GAMES, type GamesState } from '@/lib/stats/games'
 import { bestFirst, defaultBoard, normalizeBoard } from '@/lib/stats/leaderboard'
 import { defaultPlayer, positionTab, railQuery, type PlayerTab } from '@/lib/stats/player'
 import { defaultScope, type StatsScope } from '@/lib/stats/scope'
@@ -14,6 +15,7 @@ import { defaultTeam, topScorerQuery, type TeamTab } from '@/lib/stats/team'
 import { DEFAULT_TRENDS, type TrendsState } from '@/lib/stats/trends'
 import { useStatsData, useStatsQuery } from '@/lib/stats/useStats'
 import { StatsExplore, type ExploreTab } from '@/screens/stats/StatsExplore'
+import { StatsGames } from '@/screens/stats/StatsGames'
 import { StatsGlossary } from '@/screens/stats/StatsGlossary'
 import { StatsHome } from '@/screens/stats/StatsHome'
 import { StatsLeaderboard, type LeaderboardOpen } from '@/screens/stats/StatsLeaderboard'
@@ -55,7 +57,7 @@ interface StatsAppProps {
 /**
  * Companion Stats (stats-analysis spec §9, design handoff "Companion Stats"): its own shell and
  * nav, the scope shared by every screen (§9.1), the Stats home and the leaderboards (§9.2), the
- * team and player dashboards (§9.3, §9.4).
+ * team and player dashboards (§9.3, §9.4), Explore and Games (§9.5).
  */
 export function StatsApp({
   hasLeague,
@@ -90,6 +92,8 @@ export function StatsApp({
   const [chart, setChart] = useState<ChartState>(DEFAULT_CHART)
   const [compare, setCompare] = useState<CompareState>(DEFAULT_COMPARE)
   const [trends, setTrends] = useState<TrendsState>(DEFAULT_TRENDS)
+  // Games (spec §9.5): the week and game chosen, kept for the session.
+  const [games, setGames] = useState<GamesState>(DEFAULT_GAMES)
   // A focus from Fantasy opens its dashboard once.
   const [focused, setFocused] = useState<number | null>(null)
   if (focus && focus.nonce !== focused) {
@@ -382,6 +386,19 @@ export function StatsApp({
                 onOpenTeam={openTeam}
               />
             )}
+            {screen === 'games' && (
+              <StatsGames
+                data={data}
+                scope={effective}
+                onScope={setChosen}
+                hasLeague={hasLeague}
+                leagueKey={leagueKey}
+                state={games}
+                onState={setGames}
+                onOpenTeam={openTeam}
+                onOpenPlayer={openPlayer}
+              />
+            )}
             {screen === 'glossary' && <StatsGlossary catalogue={data.catalogue} />}
             {viewsError && <div className="px-8 pb-4 text-[12px] text-bad">{viewsError}</div>}
           </>
```

Create `src/renderer/src/screens/stats/StatsGames.tsx`:

```tsx
import { MineDot, PosText, StatsSelect } from '@/components/stats/controls'
import { Loading, SectionHead } from '@/components/stats/parts'
import { heatColor } from '@/lib/stats/format'
import {
  beforeGame,
  boxQueries,
  boxView,
  byeTeams,
  defaultWeek,
  faceView,
  forecastView,
  headerView,
  isPlayed,
  keyPool,
  keySide,
  lastGames,
  matchupQueries,
  mergeResults,
  myPlayersQuery,
  myTeams,
  participants,
  participantsQuery,
  railGames,
  rushersQuery,
  seasonPlayersQuery,
  weekLabel,
  weekOptions,
  type BoxView,
  type FaceView,
  type ForecastView,
  type GamesState,
  type GamesTab,
  type HeaderSide,
  type HeaderView,
  type KeySide,
  type RailGame,
  type TeamCell
} from '@/lib/stats/games'
import { SCORING_LABELS, seasonOptions, type StatsScope } from '@/lib/stats/scope'
import {
  useSeasonGames,
  useStatsQueries,
  useStatsQuery,
  useWeekProjections,
  type StatsData
} from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import type { Scoring } from '@shared/stats/scoring'
import type { PositionGroup } from '@shared/stats/types'

/**
 * Games (stats-analysis spec §9.5, Plan AE; handoff "9. Game" and the "Stats Games" canvas): a
 * week's games in a rail; a game's preview (the forecast, each offense against the other defense
 * phase by phase, the key matchups) and, once it is final, its box score.
 */
export function StatsGames({
  data,
  scope,
  onScope,
  hasLeague,
  leagueKey,
  state,
  onState,
  onOpenTeam,
  onOpenPlayer
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  leagueKey: number
  state: GamesState
  onState: (update: (state: GamesState) => GamesState) => void
  onOpenTeam: (team: string) => void
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
}): React.JSX.Element {
  const season = scope.season
  const { games, error } = useSeasonGames(season, data.version)
  const mineQuery = useStatsQuery(myPlayersQuery(data.ownership, season), data.version)
  const mine = myTeams(data.ownership, mineQuery.result)
  const weeks = games ? weekOptions(games) : []
  const week =
    state.week !== null && weeks.some((w) => w.value === state.week)
      ? state.week
      : games
        ? defaultWeek(games)
        : null
  const rail = games && week !== null ? railGames(games, week, mine) : []
  const picked = rail.find((r) => r.id === state.game) ?? rail[0] ?? null
  const game = games?.find((g) => g.gameId === picked?.id) ?? null
  const played = game !== null && isPlayed(game)
  const tab: GamesTab = !played ? 'preview' : (state.tab ?? 'box')
  const before = game ? beforeGame(game) : null

  // The preview's queries: each team before the game, its players, the pass rushers. Answers
  // are this game's only: another game's numbers must not stand in while its own load.
  const fresh = { keepLast: false }
  const matchups = useStatsQueries(
    before ? matchupQueries(before, scope.scoring) : null,
    data.version,
    fresh
  )
  const matchup = matchups.results ? mergeResults([...matchups.results.values()]) : null
  const seasonPlayers = useStatsQuery(
    before ? seasonPlayersQuery(before, scope.scoring) : null,
    data.version,
    fresh
  )
  const last = games && game && !played ? lastGames(games, game) : {}
  const lastPlayers = useStatsQuery(
    game && !played ? participantsQuery(game, last) : null,
    data.version,
    fresh
  )
  const rushers = useStatsQuery(
    before && game ? rushersQuery(before, [game.away, game.home]) : null,
    data.version,
    fresh
  )
  const boxes = useStatsQueries(
    game && played ? boxQueries(game, scope.scoring) : null,
    data.version,
    fresh
  )
  const box = boxes.results ? mergeResults([...boxes.results.values()]) : null
  const boxed = box && game ? boxView(box, game, data.ownership) : null
  const pools = participants(lastPlayers.result, last)
  const sideOf = (
    team: string,
    opponent: string,
    projected: ReadonlyMap<string, number> | null
  ): KeySide =>
    keySide(team, opponent, {
      played: keyPool(team, played ? box : null, pools),
      season: seasonPlayers.result,
      matchups: matchup,
      rushers: rushers.result,
      ownership: data.ownership,
      scored: boxed?.scored ?? null,
      projected,
      range: before?.label ?? ''
    })
  // Sleeper's projections for the key players of a game not played yet, with a league.
  const keyIds =
    game &&
    hasLeague &&
    !played &&
    game.seasonType === 'REG' &&
    seasonPlayers.result &&
    !lastPlayers.loading
      ? [sideOf(game.away, game.home, null), sideOf(game.home, game.away, null)].flatMap((s) =>
          s.players.map((p) => p.id)
        )
      : null
  const projected = useWeekProjections(keyIds, season, game?.week ?? 0, leagueKey)
  const keys =
    game && seasonPlayers.result
      ? [sideOf(game.away, game.home, projected), sideOf(game.home, game.away, projected)]
      : null

  const set = (update: Partial<GamesState>): void => onState((s) => ({ ...s, ...update }))
  const byes = games && week !== null ? byeTeams(games, week) : []
  const scorings = (['league', 'ppr', 'half', 'std'] as Scoring[])
    .filter((s) => s !== 'league' || hasLeague)
    .map((s) => ({ value: s, label: SCORING_LABELS[s] }))

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex min-h-0 w-[240px] shrink-0 flex-col border-r border-line">
        <div className="flex shrink-0 flex-col gap-[9px] border-b border-line px-3.5 pt-3 pb-2.5">
          <div className="flex items-center gap-2">
            <StatsSelect
              title="Season"
              value={season}
              options={seasonOptions(data.status).map((s) => ({ value: s, label: String(s) }))}
              onChange={(s) => {
                onScope({ ...scope, season: s, weeks: null })
                set({ week: null, game: null, tab: null })
              }}
            />
            {week !== null && (
              <StatsSelect
                title="Week"
                value={week}
                options={weeks}
                onChange={(w) => set({ week: w, game: null, tab: null })}
                className="min-w-0 flex-1"
              />
            )}
          </div>
          <span className="font-mono text-[11px] leading-none text-fg-3">
            {rail.length} GAMES{byes.length ? ` · ${byes.length} BYES` : ''}
          </span>
        </div>
        <div
          role="list"
          aria-label="Games"
          className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]"
        >
          {rail.map((r) => (
            <RailItem
              key={r.id}
              game={r}
              on={r.id === picked?.id}
              onClick={() => set({ game: r.id, tab: null })}
            />
          ))}
          {byes.length > 0 && (
            <div className="px-4 py-3 font-mono text-[11px] leading-normal text-fg-3">
              BYES · {byes.join(' · ')}
            </div>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-auto [scrollbar-width:thin]">
        <div className="flex h-[52px] shrink-0 items-center justify-between gap-4 border-b border-line px-8">
          <div
            role="tablist"
            aria-label="Game"
            className="flex gap-0.5 rounded-[7px] bg-panel-2 p-0.5"
          >
            {(
              [
                ['preview', 'Preview'],
                ['box', 'Box score']
              ] as [GamesTab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                disabled={id === 'box' && !played}
                title={
                  id === 'box' && !played ? 'The box score comes once the game is final' : undefined
                }
                onClick={() => set({ tab: id })}
                className={cn(
                  'h-[26px] cursor-pointer rounded-[5px] px-3.5 text-[12.5px] disabled:cursor-default disabled:opacity-50',
                  tab === id
                    ? 'bg-panel font-semibold text-fg shadow-[0_0_0_1px_var(--line)]'
                    : 'font-medium text-fg-2 hover:text-fg disabled:hover:text-fg-2'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3.5">
            {game && (
              <span className="text-[12px] text-fg-3">
                {tab === 'box'
                  ? `${weekLabel(season, game.seasonType, game.week)} · ${season}`
                  : before
                    ? `Team stats: ${before.label}${played ? ', before the game' : ''}`
                    : 'No games before this one'}
              </span>
            )}
            <StatsSelect
              title="Fantasy scoring"
              value={scope.scoring}
              options={scorings}
              onChange={(s) => onScope({ ...scope, scoring: s })}
            />
          </div>
        </div>
        {error || !games ? (
          <Loading error={error} />
        ) : !game ? (
          <div className="py-20 text-center text-[13px] text-fg-3">No games in {season} yet.</div>
        ) : (
          <div className="flex flex-col gap-[26px] px-8 pt-[22px] pb-8">
            <Header view={headerView(games, game)} onOpenTeam={onOpenTeam} />
            {tab === 'preview' ? (
              <>
                <Forecast view={forecastView(game)} played={played} />
                {!before && (
                  <div className="text-[13px] text-fg-3">
                    The stats start with the {season} season: no games before this one to compare
                    the teams by.
                  </div>
                )}
                {before && (
                  <section className="flex flex-col gap-3">
                    <SectionHead
                      title="Phase by phase"
                      note="Each offense against the other defense · rank among 32 · the bar leans to the side with the edge"
                    />
                    {matchups.error ? (
                      <Loading error={matchups.error} />
                    ) : !matchup ? (
                      <Loading />
                    ) : (
                      <div className="grid grid-cols-2 items-start gap-9">
                        {[
                          faceView(matchup, game.away, game.home, data.byId, before.season),
                          faceView(matchup, game.home, game.away, data.byId, before.season)
                        ].map((f, i) => (
                          <Face key={f.off} view={f} offense={i === 0 ? 1 : 2} />
                        ))}
                      </div>
                    )}
                  </section>
                )}
                {before && (
                  <section className="flex flex-col gap-3">
                    <SectionHead
                      title="Key matchups"
                      note="Matchup rank: the defense's rank against the position in fantasy points allowed, 1st = toughest"
                    />
                    {seasonPlayers.error || rushers.error ? (
                      <Loading error={seasonPlayers.error ?? rushers.error} />
                    ) : !keys ? (
                      <Loading />
                    ) : (
                      <div className="grid grid-cols-2 items-start gap-9">
                        {keys.map((k, i) => (
                          <Keys
                            key={k.team}
                            side={k}
                            series={i === 0 ? 1 : 2}
                            lastHead={played ? 'FP' : hasLeague ? 'PROJ' : ''}
                            onOpenPlayer={onOpenPlayer}
                          />
                        ))}
                      </div>
                    )}
                    {!hasLeague && !played && (
                      <span className="text-[12px] text-fg-3">
                        Import a league in Fantasy to see Sleeper&apos;s projection for each player
                        this week and to mark your players.
                      </span>
                    )}
                  </section>
                )}
              </>
            ) : boxes.error ? (
              <Loading error={boxes.error} />
            ) : !boxed ? (
              <Loading />
            ) : (
              <Box view={boxed} onOpenPlayer={onOpenPlayer} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function RailItem({
  game: g,
  on,
  onClick
}: {
  game: RailGame
  on: boolean
  onClick: () => void
}): React.JSX.Element {
  const line = (team: string, right: string, won: boolean, lost: boolean): React.JSX.Element => (
    <span
      className={cn(
        'flex justify-between gap-2 font-mono text-[12.5px] leading-none tabular-nums',
        won && 'font-semibold',
        lost && 'text-fg-3'
      )}
    >
      <span>{team}</span>
      <span className={cn(!g.played && 'text-fg-3')}>{right}</span>
    </span>
  )
  return (
    <button
      type="button"
      role="listitem"
      aria-current={on ? 'true' : undefined}
      onClick={onClick}
      className={cn(
        'relative flex w-full cursor-pointer flex-col gap-[5px] border-b border-line-2 py-[9px] pr-3.5 pl-4 text-left',
        on ? 'bg-sel' : 'hover:bg-hover'
      )}
    >
      {line(g.away, g.played ? g.awayScore : g.when, g.awayWon, g.played && !g.awayWon)}
      {line(g.home, g.played ? g.homeScore : (g.line ?? ''), g.homeWon, g.played && !g.homeWon)}
      {g.mine && (
        <span className="absolute top-1/2 left-1.5 flex -translate-y-1/2">
          <MineDot title="Your fantasy players in this game" />
        </span>
      )}
    </button>
  )
}

const SHAPE = { 1: 'rounded-full bg-s1', 2: 'rounded-[2px] bg-s2' } as const

function Header({
  view,
  onOpenTeam
}: {
  view: HeaderView
  onOpenTeam: (team: string) => void
}): React.JSX.Element {
  const side = (s: HeaderSide, home: boolean): React.JSX.Element => (
    <button
      type="button"
      title={`Open the ${s.name} dashboard`}
      onClick={() => onOpenTeam(s.team)}
      className={cn(
        'flex cursor-pointer items-center gap-[22px]',
        home ? 'flex-row-reverse justify-end text-left' : 'justify-end text-right'
      )}
    >
      <span className={cn('flex flex-col gap-[7px]', home ? 'items-start' : 'items-end')}>
        <span className={cn('flex items-center gap-2', home && 'flex-row-reverse')}>
          <span className={cn('size-2.5', SHAPE[home ? 2 : 1])} />
          <span className="text-[34px] leading-[0.9] font-bold tracking-[-0.04em]">{s.abbr}</span>
        </span>
        <span className="text-[12.5px] leading-none text-fg-2">{s.name}</span>
        <span className="font-mono text-[11px] leading-none text-fg-3">{s.meta}</span>
        <span className="flex gap-[3px]">
          {s.form.map((f, i) => (
            <span
              key={i}
              title={f.title}
              className={cn(
                'flex size-[17px] items-center justify-center rounded-[4px] font-mono text-[10px] font-semibold',
                f.result === 'W'
                  ? 'bg-good-s text-good'
                  : f.result === 'L'
                    ? 'bg-bad-s text-bad'
                    : 'bg-panel-2 text-fg-2'
              )}
            >
              {f.result}
            </span>
          ))}
        </span>
      </span>
      <span className={cn('flex flex-col gap-1.5', home ? 'items-start' : 'items-end')}>
        <span
          className={cn(
            'font-cond text-[72px] leading-[0.8] font-extrabold tabular-nums',
            s.dim && 'text-fg-3'
          )}
        >
          {s.big}
        </span>
        <span className="font-mono text-[10.5px] leading-none text-fg-3 uppercase">
          {view.bigLabel}
        </span>
      </span>
    </button>
  )
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-7 border-b border-line pb-5">
      {side(view.away, false)}
      <div className="flex min-w-[170px] flex-col items-center gap-2">
        <span className="rounded-[5px] bg-panel-2 px-[9px] py-[5px] font-mono text-[11px] leading-none font-semibold text-fg-2">
          {view.status}
        </span>
        {view.sub && <span className="text-[12px] leading-none text-fg-3">{view.sub}</span>}
      </div>
      {side(view.home, true)}
    </header>
  )
}

function Forecast({ view, played }: { view: ForecastView; played: boolean }): React.JSX.Element {
  const card =
    'flex min-w-0 flex-col gap-3 rounded-[10px] bg-panel px-4 py-3.5 shadow-[0_0_0_1px_var(--line)]'
  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        title={played ? 'The forecast before kickoff' : 'The forecast'}
        note="Elo from our model · the market from the betting line, without the vig"
      />
      <div className="grid grid-cols-[1.35fr_1fr_0.85fr] gap-3.5">
        <div className={card}>
          <span className="text-[12.5px] leading-none font-semibold">Win probability</span>
          {view.probs.map((p) => (
            <div
              key={p.label}
              className="grid grid-cols-[52px_34px_minmax(0,1fr)_34px] items-center gap-2"
            >
              <span className="text-[12px] leading-none text-fg-2">{p.label}</span>
              <span className="text-right font-mono text-[12px] leading-none font-semibold">
                {p.away}
              </span>
              <div
                title={`${p.label}: ${p.away} – ${p.home}`}
                className="flex h-2.5 overflow-hidden rounded-[5px]"
              >
                <span className="bg-s1" style={{ width: `${(p.awayShare * 100).toFixed(1)}%` }} />
                <span className="flex-1 bg-s2" />
              </div>
              <span className="font-mono text-[12px] leading-none font-semibold">{p.home}</span>
            </div>
          ))}
          <span className="text-[12px] leading-[1.45] text-fg-2">{view.agree}</span>
          {view.result && (
            <span
              className={cn(
                'self-start rounded-[5px] px-2 py-1 font-mono text-[11.5px] leading-none font-semibold',
                view.result.upset ? 'bg-bad-s text-bad' : 'bg-panel-2 text-fg-2'
              )}
            >
              {view.result.text}
            </span>
          )}
        </div>
        <div className={card}>
          <span className="text-[12.5px] leading-none font-semibold">The line</span>
          <div className="grid grid-cols-3 gap-2.5">
            {view.tiles.map((t) => (
              <div key={t.key} className="flex min-w-0 flex-col gap-1.5">
                <span className="font-mono text-[10.5px] leading-none tracking-[0.04em] text-fg-3 uppercase">
                  {t.key}
                </span>
                <span className="font-cond text-[26px] leading-[0.9] font-extrabold whitespace-nowrap tabular-nums">
                  {t.value}
                </span>
                <span className="text-[11.5px] leading-[1.3] text-fg-3">{t.sub}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={cn(card, 'gap-2.5')}>
          <span className="text-[12.5px] leading-none font-semibold">Conditions</span>
          <span className="font-cond text-[26px] leading-[0.9] font-extrabold">
            {view.conditions.big}
          </span>
          <span className="text-[12px] leading-[1.4] text-fg-2">{view.conditions.line}</span>
          {view.conditions.note && (
            <span className="text-[11.5px] leading-[1.4] text-fg-3">{view.conditions.note}</span>
          )}
        </div>
      </div>
    </section>
  )
}

/** A rank chip shaded by the percentile (the handoff's heat scale). */
function RankChip({ cell }: { cell: TeamCell }): React.JSX.Element {
  const strong = Math.abs(cell.percentile - 50) > 20
  return (
    <span
      className="flex h-[18px] items-center justify-center rounded-[9px] font-mono text-[10.5px] leading-none font-semibold"
      style={{
        background: heatColor(cell.percentile / 100, false),
        color: strong ? '#fff' : 'var(--fg)'
      }}
    >
      {cell.rank}
    </span>
  )
}

function Face({ view, offense }: { view: FaceView; offense: 1 | 2 }): React.JSX.Element {
  const defense = offense === 1 ? 2 : 1
  const columns = 'grid grid-cols-[minmax(0,1fr)_54px_38px_104px_38px_54px] items-center gap-[7px]'
  return (
    <div
      className="flex min-w-0 flex-col"
      aria-label={`${view.off} offense against ${view.def} defense`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b-2 border-fg pb-2">
        <span className="flex items-center gap-[7px] text-[16px] leading-none font-bold tracking-[-0.02em]">
          <span className={cn('size-[9px]', SHAPE[offense])} />
          {view.off} offense
        </span>
        <span className="font-mono text-[11px] leading-none text-fg-3">VS</span>
        <span className="flex items-center justify-end gap-[7px] text-[16px] leading-none font-bold tracking-[-0.02em]">
          {view.def} defense
          <span className={cn('size-[9px]', SHAPE[defense])} />
        </span>
      </div>
      {view.summary && (
        <div className="pt-[9px] pb-1 text-[12px] leading-[1.4] text-fg-2">{view.summary}</div>
      )}
      {view.groups.map((g) => (
        <div key={g.label} className="flex flex-col">
          <div className="flex h-[26px] items-end border-b border-line pb-[5px] font-mono text-[10.5px] leading-none tracking-[0.04em] text-fg-3 uppercase">
            {g.label}
          </div>
          {g.rows.map((r) =>
            r.missing || !r.off || !r.def ? (
              <div
                key={r.label}
                className="flex h-[34px] items-center justify-between gap-2.5 border-b border-line-2"
              >
                <span className="text-[12.5px] text-fg-2">{r.label}</span>
                <span className="text-[11.5px] text-fg-3">{r.missing ?? 'No value'}</span>
              </div>
            ) : (
              <div
                key={r.label}
                data-phase={r.label}
                title={`${view.off}: ${r.off.title}\n${view.def}: ${r.def.title}`}
                className={cn(columns, 'h-[34px] border-b border-line-2')}
              >
                <span className="truncate text-[12.5px] text-fg-2">{r.label}</span>
                <span
                  className={cn(
                    'text-right font-mono text-[12.5px] tabular-nums',
                    r.edge! > 0 && 'font-bold'
                  )}
                >
                  {r.off.value}
                </span>
                <RankChip cell={r.off} />
                <div className="relative h-[18px]">
                  <span className="absolute inset-x-0 top-2 h-0.5 rounded-[1px] bg-line-2" />
                  <span className="absolute top-0.5 bottom-0.5 left-1/2 w-px bg-fg-3" />
                  <span
                    className={cn(
                      'absolute top-[5px] h-2 rounded-[2px]',
                      r.edge! > 0 ? SHAPE_BG[offense] : SHAPE_BG[defense]
                    )}
                    style={{
                      left: `${r.edge! > 0 ? 50 - Math.abs(r.edge!) / 2 : 50}%`,
                      width: `${Math.abs(r.edge!) / 2}%`
                    }}
                  />
                </div>
                <RankChip cell={r.def} />
                <span
                  className={cn('font-mono text-[12.5px] tabular-nums', r.edge! < 0 && 'font-bold')}
                >
                  {r.def.value}
                </span>
              </div>
            )
          )}
        </div>
      ))}
    </div>
  )
}

const SHAPE_BG = { 1: 'bg-s1', 2: 'bg-s2' } as const

const TONE = {
  good: 'bg-good-s text-good',
  bad: 'bg-bad-s text-bad',
  neutral: 'text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]'
} as const

function Keys({
  side,
  series,
  lastHead,
  onOpenPlayer
}: {
  side: KeySide
  series: 1 | 2
  lastHead: string
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
}): React.JSX.Element {
  const columns = 'grid grid-cols-[30px_minmax(0,1fr)_74px_64px] items-center gap-2.5'
  return (
    <div className="flex min-w-0 flex-col" aria-label={`${side.team} key players`}>
      <div
        className={cn(
          columns,
          'h-[26px] items-end border-b-2 border-fg pb-1.5 font-mono text-[10.5px] leading-none text-fg-3'
        )}
      >
        <span />
        <span className="flex items-center gap-[7px] font-sans text-[16px] font-bold tracking-[-0.02em] text-fg">
          <span className={cn('size-[9px]', SHAPE[series])} />
          {side.team}
        </span>
        <span className="text-center">MATCHUP</span>
        <span className="text-right">{lastHead}</span>
      </div>
      {side.players.map((p) => (
        <button
          key={p.id}
          type="button"
          title={`Open ${p.name}’s dashboard`}
          onClick={() => onOpenPlayer(p.id, p.position)}
          className={cn(
            columns,
            'h-[46px] cursor-pointer border-b border-line-2 text-left hover:bg-hover'
          )}
        >
          <PosText position={p.position} />
          <span className="flex min-w-0 flex-col gap-[5px]">
            <span className="flex items-center gap-1.5 text-[13px] leading-none font-medium">
              <span className="truncate">{p.name}</span>
              {p.mine && <MineDot />}
            </span>
            <span className="font-mono text-[11px] leading-none text-fg-3">{p.meta}</span>
          </span>
          {p.matchup ? (
            <span
              title={p.matchup.title}
              className={cn(
                'flex h-[22px] items-center justify-self-center rounded-[5px] px-2 font-mono text-[11px] leading-none font-semibold',
                TONE[p.matchup.tone]
              )}
            >
              {p.matchup.opponent} {p.matchup.rank}
            </span>
          ) : (
            <span />
          )}
          <span className="flex flex-col items-end gap-1">
            <span className="font-cond text-[17px] leading-none font-bold tabular-nums">
              {p.last?.value ?? (lastHead ? '—' : '')}
            </span>
            {p.last && (
              <span className="font-mono text-[10px] leading-none text-fg-3">{p.last.label}</span>
            )}
          </span>
        </button>
      ))}
      {side.rush && (
        <div className="mt-3 flex flex-col gap-1.5 rounded-[8px] px-[13px] py-[11px] shadow-[inset_0_0_0_1px_var(--line)]">
          <span className="text-[12px] leading-none font-semibold">
            Pass rush <span className="font-normal text-fg-3">· {side.rush.head}</span>
          </span>
          <span className="text-[12px] leading-[1.45] text-fg-2">{side.rush.line}</span>
        </div>
      )}
    </div>
  )
}

function Box({
  view,
  onOpenPlayer
}: {
  view: BoxView
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
}): React.JSX.Element {
  const COLS: Record<string, string> = {
    Passing: 'minmax(0,1fr) 56px 40px 26px 26px 40px',
    Rushing: 'minmax(0,1fr) 34px 40px 36px 26px 40px',
    Receiving: 'minmax(0,1fr) 56px 40px 26px 40px'
  }
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2.5">
        <SectionHead title="Top fantasy performances" />
        <div className="grid grid-cols-5 gap-2.5">
          {view.top.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onOpenPlayer(t.id, t.position as PositionGroup)}
              className="flex min-w-0 cursor-pointer flex-col gap-2 rounded-[8px] bg-panel px-3 py-2.5 text-left shadow-[0_0_0_1px_var(--line)] hover:bg-hover"
            >
              <span className="flex items-center gap-1.5 font-mono text-[11px] leading-none text-fg-3">
                <PosText position={t.position} />
                {t.team}
                {t.mine && <MineDot />}
              </span>
              <span className="truncate text-[13px] leading-[1.1] font-medium">{t.name}</span>
              <span className="font-cond text-[28px] leading-[0.85] font-extrabold tabular-nums">
                {t.fp}
                <span className="ml-1 font-mono text-[11px] font-medium text-fg-3">FP</span>
              </span>
            </button>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-2 items-start gap-9">
        {view.sides.map((s) => (
          <div
            key={s.team}
            aria-label={`${s.team} box score`}
            className="flex min-w-0 flex-col gap-[18px] font-mono text-[12.5px] tabular-nums"
          >
            <div className="flex items-baseline gap-2 border-b-2 border-fg pb-2">
              <span className="font-sans text-[18px] leading-none font-bold tracking-[-0.02em]">
                {s.team}
              </span>
              <span className="font-sans text-[12px] leading-none text-fg-3">box score</span>
            </div>
            {s.tables.map((t) => (
              <div
                key={t.title}
                role="table"
                aria-label={`${s.team} ${t.title}`}
                className="flex flex-col"
              >
                <div
                  role="row"
                  className="grid h-6 items-end gap-x-2.5 border-b border-fg-3 pb-1.5 text-[11px] text-fg-3"
                  style={{ gridTemplateColumns: COLS[t.title] }}
                >
                  <span role="columnheader" className="font-sans font-semibold text-fg">
                    {t.title}
                  </span>
                  {[...t.heads, 'FP'].map((h) => (
                    <span key={h} role="columnheader" className="text-right">
                      {h}
                    </span>
                  ))}
                </div>
                {t.rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="row"
                    onClick={() => onOpenPlayer(r.id, null)}
                    className="grid h-8 cursor-pointer items-center gap-x-2.5 border-b border-line-2 text-left hover:bg-hover"
                    style={{ gridTemplateColumns: COLS[t.title] }}
                  >
                    <span
                      role="cell"
                      className="flex min-w-0 items-center gap-1.5 font-sans text-[12.5px] font-medium"
                    >
                      <span className="truncate">{r.name}</span>
                      {r.mine && <MineDot />}
                    </span>
                    {r.cells.map((c, i) => (
                      <span key={i} role="cell" className="text-right">
                        {c}
                      </span>
                    ))}
                    <span role="cell" className="text-right font-cond text-[15px] font-bold">
                      {r.fp}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-[7px] rounded-[8px] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
                <span className="font-sans text-[12px] leading-none font-semibold">
                  Kicking
                  {s.kicker && <span className="font-normal text-fg-3"> · {s.kicker.name}</span>}
                </span>
                {s.kicker ? (
                  <span className="flex gap-3 text-fg-2">
                    <span>FG {s.kicker.fg}</span>
                    <span className="ml-auto font-cond text-[15px] font-bold text-fg">
                      {s.kicker.fp}
                    </span>
                  </span>
                ) : (
                  <span className="text-fg-3">No field goal tries</span>
                )}
              </div>
              <div className="flex flex-col gap-[7px] rounded-[8px] px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--line)]">
                <span className="font-sans text-[12px] leading-none font-semibold">Defense</span>
                <span className="flex gap-3 text-fg-2">
                  <span>SACK {s.defense.sacks}</span>
                  <span>TAKE {s.defense.takeaways}</span>
                  <span>TD {s.defense.tds}</span>
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [x] **Step 4: Run the tests**

```bash
npx vitest run tests/renderer/components/StatsGames.test.tsx tests/renderer/components/StatsShell.test.tsx && npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run
```

Expected: both files pass; typecheck and lint clean; the suite 1183 passed | 5 skipped.

- [x] **Step 5: Commit**

```bash
npx prettier --check src/renderer/src/screens/stats/StatsGames.tsx tests/renderer/components/StatsGames.test.tsx src/renderer/src/lib/stats/useStats.ts src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/screens/stats/StatsApp.tsx tests/renderer/components/StatsShell.test.tsx
git add src/renderer/src/screens/stats/StatsGames.tsx tests/renderer/components/StatsGames.test.tsx src/renderer/src/lib/stats/useStats.ts src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/screens/stats/StatsApp.tsx tests/renderer/components/StatsShell.test.tsx
git commit -m "feat(stats): Games, the matchup preview"
```

---

### Task 4: Docs

The screens reference gets Games and its speeds; the spec gets §24 (the amendments).

**Files:**

- Modify: `docs/reference/stats-screens.md`, `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`

- [x] **Step 1: `docs/reference/stats-screens.md`**

Modify `docs/reference/stats-screens.md`:

```diff
diff --git a/docs/reference/stats-screens.md b/docs/reference/stats-screens.md
index b557bb7..89ff248 100644
--- a/docs/reference/stats-screens.md
+++ b/docs/reference/stats-screens.md
@@ -1,10 +1,10 @@
 # Stats screens — reference

-Added in v0.28.0 (Plan AA; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.1–§9.2, amended in §18); the team dashboard in v0.29.0 (Plan AB; §9.3, amended in §19); the player dashboard in v0.30.0 (Plan AC; §9.4, amended in §21); Explore's Compare and Trends in v0.34.0 (Plan AD1; §9.5, amended in §22). Companion Stats is the app's second product: its own shell and cobalt palette (design handoff 2026-10-16, "Companion Stats"), reachable from the Fantasy nav ("Stats ↗"), and where the app opens when no league is imported. Every number comes from the query engine (`stats.query`, data reference: `docs/reference/stats-database.md`).
+Added in v0.28.0 (Plan AA; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.1–§9.2, amended in §18); the team dashboard in v0.29.0 (Plan AB; §9.3, amended in §19); the player dashboard in v0.30.0 (Plan AC; §9.4, amended in §21); Explore's Compare and Trends in v0.34.0 (Plan AD1; §9.5, amended in §22) and its chart explorer in v0.35.0 (Plan AD2; §23); Games in v0.36.0 (Plan AE; §9.5, amended in §24). Companion Stats is the app's second product: its own shell and cobalt palette (design handoff 2026-10-16, "Companion Stats"), reachable from the Fantasy nav ("Stats ↗"), and where the app opens when no league is imported. Every number comes from the query engine (`stats.query`, data reference: `docs/reference/stats-database.md`).

 ## Shell

-- **Nav:** Leaderboards · Players (the player dashboard) · Teams (the team dashboard) · Explore (Compare, Trends; the chart explorer later) · Games (later) · Glossary; "Data through 2026 week 6 · updated 2 h ago" from `stats.status()` ("updating…" while a refresh runs); "Fantasy ↗" (Setup without a league); the theme toggle.
+- **Nav:** Leaderboards · Players (the player dashboard) · Teams (the team dashboard) · Explore (Chart, Compare, Trends) · Games (a week's games: previews and box scores) · Glossary; "Data through 2026 week 6 · updated 2 h ago" from `stats.status()` ("updating…" while a refresh runs); "Fantasy ↗" (Setup without a league); the theme toggle.
 - **Scope** (every screen, kept for the session): season (2019 → latest), Regular season / Postseason / Both, the regular season's week range, and the fantasy scoring (My league once a league is imported, else PPR, Half PPR, Standard).
 - A finished rebuild (`stats:changed`) re-reads the status and the catalogue and runs every query on screen again.

@@ -118,14 +118,27 @@ A metric by season, 2019 → now, for a player or a team, and up to two more of
 - **One season:** "Trends need two seasons; he has one." with that season's value and rank.
 - Every season is ranked among that season's pool: one query over the position by season, each season qualified against its own weeks (the season in progress too).

+## Games
+
+A season's games week by week (handoff "9. Game", the "Stats Games" canvas): the season is the shared scope's, the week the screen's own (the next game's week at first, else the last played; kept for the session).
+
+- **Rail (240px):** Season and Week (the postseason by round), "14 GAMES · 4 BYES"; each game away over home with the scores (the winner bold) or, before it, the kickoff ("Sun 1:00 PM", the machine's time zone) and the home team's line ("−3.5"). Games with my fantasy players carry the amber dot and come first, then by kickoff. The teams on a bye under the list.
+- **Bar:** Preview · Box score (the box score once the game is final; a final game opens on it), what the team stats cover ("Team stats: weeks 1–7", "…, before the game"), the fantasy scoring.
+- **Header:** each team (a click opens its dashboard) with its record, Elo and last four results before the game, and its Elo win probability, or its score once final; the kickoff or "Final · Week 7", indoors or outdoors.
+- **The forecast** ("before kickoff" for a final game): Elo's and the market's win probability as bars, whether they agree ("Elo likes GB more than the market does (67% against 62%)."), and the result against the favorite; the spread (the market's, Elo's under it), the total and each team's implied points; the conditions (indoors, or the temperature and wind; nflverse fills them in late: none since 2026 week 5).
+- **Phase by phase:** each offense against the other defense over the weeks before the game (week 1: the season before; a postseason game: its regular season; 2019 week 1 has nothing before it and says so). Overall (adjusted EPA, success rate, explosive-play rate), Passing (EPA and success per dropback), Rushing (EPA per carry, stuff rate), Protection vs pass rush (sack rate, pressure rate), Finishing (red-zone TD rate, third-down %). Each side's value and its rank among the 32 on its own better side, in a chip shaded by percentile; a bar from the centre leans toward the side with the edge (the offense's percentile minus the defense's, half the width at 100 points); the larger value of the edge in bold; the biggest edge in words. A metric the season lacks: "Not published for 2026 yet.".
+- **Key matchups:** each team's QB, RB, two WRs and TE by fantasy points before the game, among the players of its last game (a final game: its box score), with points per game and their rank at the position; the other defense's rank against the position in fantasy points allowed per game (1st the toughest; 11th or better red, 22nd or worse green); with a league, my players marked and Sleeper's projection for the week (a final game: the points each scored). Then the other defense's leading pass rusher (sacks, then QB hits) against the line's sack rate. A row opens the player's dashboard.
+- **Box score:** the top five fantasy performances, then per team passing, rushing and receiving (the fantasy points last), the kicker's field goals and the defense's sacks, takeaways and touchdowns (its defenders' sums). A row opens the player's dashboard.
+- The preview reads the matchup as three narrow queries at once (offenses, defenses, fantasy points allowed), and the box score as three (passing; rushing and receiving; kickers and defenders): DuckDB ranks each metric in its own window step, so one wide query is slower.
+
 ## Glossary

 Every core and extended metric, players or teams, by family or search, with the same entry as the column hover.

 ## IPC

-`stats.games({ season, team })` for the dashboard's header, next game and schedule (`{ season }` for a player's log); `stats.player({ player })` for a player's bio and status; `stats.outlook({ player, season, scoring })` for his Forecast; `stats.link({ sleeper } | { gsis })` (the same player in both products, from `player_ids`); `stats.ownership()` (the league's rosters keyed by gsis id and nflverse team code, from `player_ids`), `stats.views()`, `stats.saveView(name, board)`, `stats.deleteView(id)`, `stats.exportCsv(fileName, csv)`; and Plan Y's `stats.query`, `stats.catalogue`, `stats.status`, `stats.onChanged`.
+`stats.games({ season, team })` for the dashboard's header, next game and schedule (`{ season }` for a player's log and Games, each game with its `kickoff`); Fantasy's `players.week({ season, week })` for Sleeper's projections in Games; `stats.player({ player })` for a player's bio and status; `stats.outlook({ player, season, scoring })` for his Forecast; `stats.link({ sleeper } | { gsis })` (the same player in both products, from `player_ids`); `stats.ownership()` (the league's rosters keyed by gsis id and nflverse team code, from `player_ids`), `stats.views()`, `stats.saveView(name, board)`, `stats.deleteView(id)`, `stats.exportCsv(fileName, csv)`; and Plan Y's `stats.query`, `stats.catalogue`, `stats.status`, `stats.onChanged`.

 ## Speed

-Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms. The team dashboard: Teams 140 ms from click to the Overview, a tab 65–150 ms, Situational (eleven queries) 275 ms. The player dashboard: Players 230–290 ms from click to the Overview, a tab 70–135 ms, Splits 265–480 ms, a rail position 135–275 ms. Explore (2026 week 7): the chart on screen 60–106 ms from click, a position 41–105 ms, Teams 28–70 ms; Compare on screen 160–205 ms from click, a position or Players / Teams 135–185 ms; the Trends tab 245–255 ms, a new metric 220–290 ms.
+Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms. The team dashboard: Teams 140 ms from click to the Overview, a tab 65–150 ms, Situational (eleven queries) 275 ms. The player dashboard: Players 230–290 ms from click to the Overview, a tab 70–135 ms, Splits 265–480 ms, a rail position 135–275 ms. Explore (2026 week 7): the chart on screen 60–106 ms from click, a position 41–105 ms, Teams 28–70 ms; Compare on screen 160–205 ms from click, a position or Players / Teams 135–185 ms; the Trends tab 245–255 ms, a new metric 220–290 ms. Games (2026 week 7 data): on screen 219–225 ms from click (342 ms the first time after launch), another game 37–42 ms, a final week's box score 141–156 ms, the Preview tab 29–44 ms; in the worker, a preview's queries at once 84–204 ms, a box score's 64–132 ms.
```

- [x] **Step 2: `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`**

Modify `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`:

```diff
diff --git a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
index 17fc442..322d8f1 100644
--- a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
+++ b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
@@ -1,6 +1,6 @@
 # Stats analysis — design

-**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X), 2026-10-17 (§16: Plan Y), 2026-10-18 (§17: Plan Z), 2026-10-20 (§18: Plan AA), 2026-10-20 (§19: Plan AB), 2026-10-21 (§20: paired sums) and 2026-10-21 (§21: Plan AC) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.
+**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X), 2026-10-17 (§16: Plan Y), 2026-10-18 (§17: Plan Z), 2026-10-20 (§18: Plan AA), 2026-10-20 (§19: Plan AB), 2026-10-21 (§20: paired sums), 2026-10-21 (§21: Plan AC), 2026-10-24 (§22: Plan AD1), 2026-10-25 (§23: Plan AD2) and 2026-10-27 (§24: Plan AE) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.

 **Sources:** the stats catalog (`docs/research/2026-10-09-nfl-stats-catalog.md`), the predictive-metrics catalogue (`docs/research/nfl_predictive_metrics.md`), the coverage audit (`docs/research/2026-10-14-warehouse-coverage-audit.md`), and a DuckDB vs SQLite benchmark on 2023–2025 play-by-play and participation (§3.2).

@@ -615,3 +615,16 @@ Decided with the user (2026-10-23 to 2026-10-25) and measured on the live databa
 - **F. Picks.** Shift-click (a dot or a table row) picks up to three; "Compare these" opens Compare with them in its slots. No lasso (user, 2026-10-25). A click opens the player's or team's dashboard.
 - **G. States.** Fewer than 10 dots: "Too few qualifiers to chart", with the full range of weeks and "Show all" when they would help. An axis the season lacks: "Pressure rate is not published for 2026 yet." with the season before, or "… starts in 2022.".
 - **H. Measured** (2026 week 7): every preset's query 15–47 ms in the worker (with size and colour 32 ms), 30–167 qualified dots; in the app (three runs), Explore to the chart on screen 60–106 ms, a position 41–105 ms, Teams 28–70 ms, Compare from the picks 85–92 ms (budget 300 ms, §11).
+
+## 24. Amendment 2026-10-27: Games and the matchup preview (Plan AE)
+
+Decided with the user (2026-10-27) and measured on the live database while Plan AE was written (its Planning findings), and taken into the build. The design is the "Stats Games" canvas, built on the handoff's "9. Game"; `docs/reference/stats-screens.md` documents the result.
+
+- **A. Games (§9.1, §9.5).** The matchup preview lives in the Stats nav's Games item, not a separate Matchups item (user, 2026-10-27). A rail of a week's games: the shared scope's season, the screen's own week (the next game's at first, else the last played), my games first with the amber dot, then by kickoff, and the teams on a bye. Any game opens a Preview; a final game also has the handoff's Box score and opens on it.
+- **B. The preview.** The header: each team's record, Elo and last four results before the game, and its Elo win probability (its score once final). The forecast: Elo against the market's no-vig probability and whether they agree; the spread (the market's and Elo's), the total and each team's implied points; the conditions. Phase by phase: each offense against the other defense over the weeks before the game (week 1 reads the season before, a postseason game its regular season; 2019 week 1 has nothing before it and says so): adjusted EPA, success and explosive-play rate; EPA and success per dropback; EPA per carry and stuff rate; sack and pressure rate (protection against the pass rush); red-zone TD rate and third-down rate. Each side is ranked among the 32 on its own better side; the bar leans toward the side with the edge (the offense's percentile minus the defense's), and the biggest edge is said in words. §9.5's "coverage vs receivers" is the passing rows and the receivers' key matchups: coverage is charted through the prior season only.
+- **C. Key matchups** (user, 2026-10-27). Each team's QB, RB, two WRs and TE by fantasy points before the game, chosen among the players of its last game (a player out does not lead; a final game: its box score), against the other defense's rank in fantasy points allowed per game to the position (1st the toughest; the handoff's tones: 11th or better bad, 22nd or worse good). Then the other defense's leading pass rusher (sacks, then QB hits) against the line's sack rate. No receiver–cornerback pairs: participation ends with the prior season.
+- **D. With a league** (user, 2026-10-27): my players marked, and Sleeper's projection for the week from Fantasy's file (regular-season games not played yet); a final game shows the points each scored. Without one, a line says a league adds them.
+- **E. The box score** (handoff "9. Game"): the top five fantasy performances; passing, rushing and receiving per team; the kicker's field goals; the defense's sacks, takeaways (interceptions and fumble recoveries) and touchdowns, its defenders' sums. No extra points (the catalogue has their rate only) and no team-defense fantasy points (Stats scores no D/ST).
+- **F. Kickoff (§8.1).** `stats.games` gains each game's `kickoff` (UTC, from nflverse's Eastern `gameday` and `gametime`); the screens show it in the machine's time zone.
+- **G. Narrow queries.** DuckDB ranks every metric in its own window step, 10–30 ms each even over a few dozen rows: a 19-metric box score took 279–365 ms as one query and 114–135 ms as three narrow ones at once. Games splits its wide queries that way: the matchup into offenses, defenses and fantasy points allowed; the box score into passing, rushing and receiving, and the rest.
+- **H. Measured** (2026 week 7 data, week 8 next): every game of 2026 weeks 1–8, 2025 (every fourth week and the postseason) and 2019 weeks 1–2: a preview's queries at once 84–204 ms (median 142), a box score's 64–132 ms; every team had its five key players, a pass rusher and matchup ranks. Weather is thin: none for games not played yet, none in 2026 since week 5 (45 of 272 games), 107 of 284 in 2022. In the app (three runs): Games on screen 219–225 ms from click (342 ms the first time after launch), another game 37–42 ms, a final week's box score 141–156 ms, the Preview tab 29–44 ms (budget 300 ms, §11).
```

- [x] **Step 3: Format and commit**

```bash
npx prettier --check docs/reference/stats-screens.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git add docs/reference/stats-screens.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git commit -m "docs(stats): Games (spec §24)"
```

---

### Task 5: Live checks

**Files:**

- Throwaway (never committed): `tests/zz-ae-live.test.ts`
- Outside the repo: `~/project/ffc-proto-ae-live/` (the database copy, scratch profiles, the driver, the steps and the screenshots)

The live check reads a copy of a full live database, `~/project/ffc-proto-ae-live/base.duckdb` (2026 week 7, week 8 next: a fresh v0.35.0 backfill), offline. If it is gone, build one: run the built app once on an empty scratch profile (`--user-data-dir`); it backfills in about 5 minutes; copy its `stats.duckdb`. Then check the sync log:

```bash
cd ~/project/ffc-proto-ae-live && node q.mjs base.duckdb "SELECT source, status, message FROM sync_log WHERE status <> 'ok'"
```

Only `stats:participation:2026 skipped` is expected. A failed step (`stats:pbp:2021 error fetch failed`) is not retried within a day: delete its `sync_log` row in the profile's file, run the app on that profile again until the file stops growing, and copy it again. (`q.mjs` opens a file read-only with `@duckdb/node-api` and prints each statement's rows; link the repo's `node_modules` into the folder to run it.) A newer database moves the numbers below with the weeks played; the checklists hold for whatever week is next.

The walk-through also copies the dev profile's `companion.db` (`~/.config/FantasyCompanion/companion.db`), so the scratch app has the dev league. The dev profile itself is only read.

- [x] **Step 1: Every preview and box score on live data**

Create `tests/zz-ae-live.test.ts`:

```ts
import { appendFileSync, copyFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { openStatsService } from '@main/stats/service'
import {
  beforeGame,
  boxQueries,
  boxView,
  byeTeams,
  defaultWeek,
  faceView,
  forecastView,
  isPlayed,
  keyPool,
  keySide,
  lastGames,
  matchupQueries,
  mergeResults,
  participants,
  participantsQuery,
  rushersQuery,
  seasonPlayersQuery
} from '@/lib/stats/games'
import type { GameForecast, MetricInfo, StatsQuery, StatsResult } from '@shared/stats/types'

// Plan AE planning check on the live database. Throwaway, never committed.
const LIVE = join(homedir(), 'project', 'ffc-proto-ae-live')
const OUT = join(LIVE, 'findings.txt')
const log = (...a: unknown[]): void => appendFileSync(OUT, a.map(String).join(' ') + '\n')

it('plan AE live findings', { timeout: 1_800_000 }, async () => {
  writeFileSync(OUT, '')
  copyFileSync(join(LIVE, 'base.duckdb'), join(LIVE, 'work.duckdb'))
  const service = await openStatsService(
    { path: join(LIVE, 'work.duckdb'), tempDir: join(LIVE, 'tmp') },
    () => {},
    async () => {
      throw new Error('offline')
    }
  )
  const failures: string[] = []
  const gate = (ok: boolean, what: string): void => {
    log(ok ? 'ok  ' : 'FAIL', what)
    if (!ok) failures.push(what)
  }
  const all = async (qs: (StatsQuery | null)[]): Promise<[(StatsResult | null)[], number]> => {
    const s = Date.now()
    const rs = await Promise.all(qs.map((q) => (q ? service.query(q) : Promise.resolve(null))))
    return [rs, Date.now() - s]
  }
  try {
    const byId = new Map<string, MetricInfo>((await service.catalogue()).map((m) => [m.id, m]))
    const times: number[] = []
    const boxTimes: number[] = []
    const gaps: Record<string, number> = {
      games: 0,
      short: 0,
      noRusher: 0,
      noMatchup: 0,
      missingRows: 0
    }
    const check = async (games: GameForecast[], g: GameForecast): Promise<void> => {
      const before = beforeGame(g)
      if (!before) {
        log('no before', g.gameId)
        return
      }
      const played = isPlayed(g)
      const last = played ? {} : lastGames(games, g)
      const m = [...matchupQueries(before, 'ppr').values()]
      const b = played ? [...boxQueries(g, 'ppr').values()] : []
      const [rs, ms] = await all([
        ...m,
        seasonPlayersQuery(before, 'ppr'),
        played ? null : participantsQuery(g, last),
        rushersQuery(before, [g.away, g.home]),
        ...b
      ])
      times.push(ms)
      const matchup = mergeResults(rs.slice(0, 3) as StatsResult[])!
      const [season, part, rush] = rs.slice(3, 6)
      const box = played ? mergeResults(rs.slice(6) as StatsResult[]) : null
      if (played) {
        const [, bms] = await all(b)
        boxTimes.push(bms)
      }
      const scored = box ? boxView(box, g, null).scored : null
      gaps.games++
      for (const [t, o] of [
        [g.away, g.home],
        [g.home, g.away]
      ]) {
        const f = faceView(matchup, t, o, byId, before.season)
        gaps.missingRows += f.groups.flatMap((x) => x.rows).filter((r) => !r.off || !r.def).length
        const k = keySide(t, o, {
          played: keyPool(t, box, participants(part, last)),
          season,
          matchups: matchup,
          rushers: rush,
          ownership: null,
          scored,
          projected: null,
          range: before.label
        })
        if (k.players.length < 5) {
          gaps.short++
          log('short', g.gameId, t, k.players.map((p) => `${p.position} ${p.name}`).join(', '))
        }
        if (!k.rush) gaps.noRusher++
        if (k.players.some((p) => !p.matchup)) gaps.noMatchup++
      }
    }
    for (const season of [2026, 2025, 2019]) {
      const games = await service.games({ season })
      const w = defaultWeek(games, new Date('2026-10-27T12:00:00'))
      log(
        `season ${season}: ${games.length} games, opens on week ${w}, kickoff ${games.filter((g) => g.kickoff).length}, line ${games.filter((g) => g.spread !== null).length}, weather ${games.filter((g) => g.temp !== null).length}, roof unknown ${games.filter((g) => !g.roof).length}`
      )
      const pick =
        season === 2026
          ? games.filter((g) => g.week <= 8)
          : season === 2025
            ? games.filter((g) => g.week % 4 === 1 || g.seasonType === 'POST')
            : games.filter((g) => g.week <= 2)
      for (const g of pick) await check(games, g)
      if (season === 2026) {
        log('byes week 8', byeTeams(games, 8).join(' '))
        const next = games.filter((g) => g.week === 8)
        log(
          'week 8 forecasts',
          next
            .map((g) => forecastView(g).agree)
            .slice(0, 4)
            .join(' | ')
        )
        gate(
          next.every((g) => g.kickoff !== null),
          'every week 8 game has a kickoff'
        )
      }
    }
    const sorted = (xs: number[]): string => {
      const s = [...xs].sort((a, b) => a - b)
      return `${s[0]}–${s[s.length - 1]} ms (median ${s[Math.floor(s.length / 2)]})`
    }
    log('preview batch', times.length, 'games', sorted(times))
    log('box batch', boxTimes.length, 'games', sorted(boxTimes))
    log('gaps', JSON.stringify(gaps))
    const p90 = [...times].sort((a, b) => a - b)[Math.floor(times.length * 0.9)]
    gate(p90 < 300, `preview batch p90 under 300 ms (${p90})`)
    const b90 = [...boxTimes].sort((a, b) => a - b)[Math.floor(boxTimes.length * 0.9)]
    gate(b90 < 300, `box batch p90 under 300 ms (${b90})`)
    gate(gaps.noMatchup === 0, 'every key player has a matchup rank')
  } finally {
    await service.close()
  }
  log(failures.length ? `GATES FAILED: ${failures.length}` : 'ALL GATES PASSED')
  expect(failures).toEqual([])
})
```

Run it:

```bash
mkdir -p ~/project/ffc-proto-ae-live/tmp
npx vitest run tests/zz-ae-live.test.ts && cat ~/project/ffc-proto-ae-live/findings.txt
```

Expected: 1 passed, and `findings.txt` ends with `ALL GATES PASSED`. Check it against the planning findings:

- 2026: 272 games, opens on week 8, kickoff 272, line 121, weather 45, roof unknown 26; byes in week 8 HOU NO NYG SF; every week 8 game has a kickoff;
- 2019 week 1: "no before" for each of its 16 games;
- the preview batch over 226 games 84–204 ms (median 142), the box batch over 212 games 64–132 ms (median 107), both p90 under 300 ms;
- `gaps`: `short` 0 (every team has its five key players), `noRusher` 0, `noMatchup` 0; `missingRows` about 210 (pressure rate, not published for 2026, on both sides of each 2026 game after week 1).

- [x] **Step 2: The app, walked through**

The driver is Plan AA's: copy `drive.mjs` from Plan AC's Task 7 Step 3 (`docs/superpowers/plans/2026-10-21-plan-ac-player-dashboard.md`) into `~/project/ffc-proto-ae-live/`. Save the steps:

Create `~/project/ffc-proto-ae-live/steps-ae.json`:

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
    "wait": 30000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Games').click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Games\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1500
  },
  {
    "shot": "01-preview"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('flex-col overflow-auto')); el.scrollTo(0, 650); return el.scrollTop })()"
  },
  {
    "wait": 600
  },
  {
    "shot": "02-preview-keys"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('flex-col overflow-auto')); el.scrollTo(0, 0); return el.scrollTop })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => document.querySelectorAll('[aria-label=Games] [role=listitem]')[2].click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Rail game 3\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => document.querySelectorAll('[aria-label=Games] [role=listitem]')[5].click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Rail game 6\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 800
  },
  {
    "shot": "03-another-game"
  },
  {
    "select": ["Week", "7"]
  },
  {
    "wait": 2500
  },
  {
    "shot": "04-final-box"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('flex-col overflow-auto')); el.scrollTo(0, 500); return el.scrollTop })()"
  },
  {
    "wait": 600
  },
  {
    "shot": "05-final-box-lower"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('flex-col overflow-auto')); el.scrollTo(0, 0); return el.scrollTop })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => document.querySelectorAll('[aria-label=Games] [role=listitem]')[1].click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[role=table][aria-label$=\"Passing\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Final game 2 (box)\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=tab]')].find((e) => e.textContent.trim() === 'Preview').click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Preview tab\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 800
  },
  {
    "shot": "06-final-preview"
  },
  {
    "select": ["Season", "2025"]
  },
  {
    "wait": 2500
  },
  {
    "select": ["Week", "19"]
  },
  {
    "wait": 3000
  },
  {
    "shot": "07-wildcard-box"
  },
  {
    "select": ["Season", "2019"]
  },
  {
    "wait": 2500
  },
  {
    "select": ["Week", "1"]
  },
  {
    "wait": 2000
  },
  {
    "click": "Preview"
  },
  {
    "wait": 1500
  },
  {
    "shot": "08-2019-week1"
  },
  {
    "select": ["Season", "2026"]
  },
  {
    "wait": 3000
  },
  {
    "click": "[title='Switch theme']"
  },
  {
    "wait": 2000
  },
  {
    "shot": "09-dark"
  },
  {
    "click": "[title^='Open the']"
  },
  {
    "wait": 2500
  },
  {
    "shot": "10-team-dashboard"
  }
]
```

Create `~/project/ffc-proto-ae-live/steps-ae-noleague.json`:

```json
[
  {
    "size": [1440, 900],
    "wait": 20000
  },
  {
    "wait": 30000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Games').click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Games (no league)\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1500
  },
  {
    "shot": "11-noleague"
  },
  {
    "eval": "(() => { const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('flex-col overflow-auto')); el.scrollTo(0, 650); return el.scrollTop })()"
  },
  {
    "wait": 600
  },
  {
    "shot": "12-noleague-keys"
  }
]
```

```bash
npx electron-vite build
L=~/project/ffc-proto-ae-live
rm -rf $L/gui && mkdir -p $L/gui/profile $L/gui/profile-noleague
cp ~/.config/FantasyCompanion/companion.db $L/gui/profile/ && cp $L/base.duckdb $L/gui/profile/stats.duckdb
cp $L/base.duckdb $L/gui/profile-noleague/stats.duckdb
APP=$PWD node $L/drive.mjs $L/gui/profile $L/steps-ae.json $L/gui/shots
APP=$PWD node $L/drive.mjs $L/gui/profile-noleague $L/steps-ae-noleague.json $L/gui/shots
```

Expected: no `NOT FOUND` in the output. Each screenshot shows:

| Shot  | Shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01    | Games active; the rail: "2026", "Week 8", "14 GAMES · 4 BYES", CAR @ GB first ("Thu 8:15 PM", GB "−3.5"), amber dots on my games, "BYES · HOU · NO · NYG · SF" at the bottom; Preview selected, Box score disabled; "Team stats: weeks 1–7", "My league"; the header CAR 33% (quieter) and GB 67%, "Thu, Oct 29 · 8:15 PM", "Week 8 · Outdoors", records 3–3 and 4–3 with Elo and four result chips; the forecast: Elo 33/67 and market 38/62 bars, "Elo likes GB more than the market does (67% against 62%).", "GB −3.5" with "Elo: GB −4.9", total 47.5, implied 22.0–25.5, "Outdoors · No weather in the schedule yet."; phase by phase: "CAR offense VS GB defense" and "GB offense VS CAR defense", the rank chips shaded, the bars leaning, "Biggest edge: GB defense, on stuff rate (42 percentile points)." |
| 02    | Pressure rate "Not published for 2026 yet." on both sides; key matchups: CAR Bryce Young (QB12, "GB 5th" red), Chuba Hubbard, Tetairoa McMillan, Jalen Coker, Darren Waller; GB Jordan Love, MarShawn Lloyd, Christian Watson, Matthew Golden, Tucker Kraft; amber dots on mine; PROJ with Sleeper's projections; the two pass-rush cards (Lukas Van Ness, Princely Umanmielen)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 03    | KC @ DEN: "Sun, Nov 1 · 4:25 PM", "KC −1.5", "Elo likes DEN more than the market does (65% against 47%)."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 04    | Week 7: the rail with the scores, the winner bold; NE @ CHI 24–30 on its Box score ("Week 7 · 2026"): top five Drake Maye 28.4, Luther Burden III 23.7, Rhamondre Stevenson 22.5, Caleb Williams 22.1, Colston Loveland 19.9; NE's and CHI's passing, rushing and receiving tables                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 05    | Lower: the receiving tables, Kicking (NE Andy Borregales FG 1/1 7.0; CHI Cairo Santos FG 3/4 14.0) and Defense (NE SACK 3 TAKE 0 TD 0; CHI SACK 2 TAKE 1 TD 0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 06    | The rail's second game, IND @ MIN, on its Preview: "The forecast before kickoff", "MIN won 16–10 · the favorite won", "Team stats: weeks 1–6, before the game", the key players' points scored (FP)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 07    | 2025 Wild card: "6 GAMES" and no byes; LAR 34 at CAR 31 on its box score (Puka Nacua 34.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 08    | 2019 Week 1, Preview: LAR 30 at CAR 27, the forecast (87°F, wind 3 mph, "At kickoff."), "The stats start with the 2019 season: no games before this one to compare the teams by."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 09    | Dark: week 8, CAR @ GB                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 10    | A team in the header: the Carolina Panthers' dashboard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 11–12 | No league: no amber dots, no PROJ column, "Import a league in Fantasy to see Sleeper's projection for each player this week and to mark your players."                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

- [x] **Step 3: Speed in the app**

Create `~/project/ffc-proto-ae-live/steps-ae-timing.json`:

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
    "wait": 40000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Games').click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Games\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => document.querySelectorAll('[aria-label=Games] [role=listitem]')[4].click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Another game\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => { const el = document.querySelector('select[title=Week]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '7'); el.dispatchEvent(new Event('change', { bubbles: true })) })(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[role=table][aria-label$=\"Passing\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Week 7 (box)\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=tab]')].find((e) => e.textContent.trim() === 'Preview').click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Preview tab\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => { const el = document.querySelector('select[title=Week]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '5'); el.dispatchEvent(new Event('change', { bubbles: true })) })(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[role=table][aria-label$=\"Passing\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Week 5 (box)\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "{ const el = document.querySelector('select[title=Week]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '8'); el.dispatchEvent(new Event('change', { bubbles: true })) }"
  },
  {
    "wait": 1500
  },
  {
    "eval": "[...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Leaderboards').click()"
  },
  {
    "wait": 1500
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Games').click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Games\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => document.querySelectorAll('[aria-label=Games] [role=listitem]')[5].click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Another game\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => { const el = document.querySelector('select[title=Week]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '7'); el.dispatchEvent(new Event('change', { bubbles: true })) })(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[role=table][aria-label$=\"Passing\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Week 7 (box)\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=tab]')].find((e) => e.textContent.trim() === 'Preview').click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Preview tab\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => { const el = document.querySelector('select[title=Week]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '5'); el.dispatchEvent(new Event('change', { bubbles: true })) })(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[role=table][aria-label$=\"Passing\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Week 5 (box)\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "{ const el = document.querySelector('select[title=Week]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '8'); el.dispatchEvent(new Event('change', { bubbles: true })) }"
  },
  {
    "wait": 1500
  },
  {
    "eval": "[...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Leaderboards').click()"
  },
  {
    "wait": 1500
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Games').click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Games\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => document.querySelectorAll('[aria-label=Games] [role=listitem]')[6].click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Another game\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => { const el = document.querySelector('select[title=Week]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '7'); el.dispatchEvent(new Event('change', { bubbles: true })) })(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[role=table][aria-label$=\"Passing\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Week 7 (box)\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=tab]')].find((e) => e.textContent.trim() === 'Preview').click())(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[aria-label$=\"key players\"]') && document.querySelector('[aria-label$=\"defense\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Preview tab\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => { const el = document.querySelector('select[title=Week]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '5'); el.dispatchEvent(new Event('change', { bubbles: true })) })(); await new Promise((r) => setTimeout(r, 0)); const done = () => document.querySelector('[role=table][aria-label$=\"Passing\"]') && !document.body.innerText.includes('Loading\u2026'); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Week 5 (box)\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1000
  },
  {
    "eval": "{ const el = document.querySelector('select[title=Week]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, '8'); el.dispatchEvent(new Event('change', { bubbles: true })) }"
  },
  {
    "wait": 1500
  },
  {
    "eval": "[...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Leaderboards').click()"
  },
  {
    "wait": 1500
  }
]
```

```bash
mkdir -p $L/gui/profile-timing && cp ~/.config/FantasyCompanion/companion.db $L/gui/profile-timing/ && cp $L/base.duckdb $L/gui/profile-timing/stats.duckdb
APP=$PWD node $L/drive.mjs $L/gui/profile-timing $L/steps-ae-timing.json $L/gui/timing
```

Run it alone (a test run beside it doubles the times). Expected: each timed step under 300 ms but the first "Games" of the run, the first read after launch (measured: Games 219–225 ms and 342 ms first, another game 37–42 ms, a final week's box score 141–156 ms, the Preview tab 29–44 ms).

- [x] **Step 4: Clean up**

```bash
rm tests/zz-ae-live.test.ts
git status --short
```

Expected: only the unrelated changes of Global Constraints. Keep `~/project/ffc-proto-ae-live/` until the release; ask the user before deleting it.

---

### Task 6: Verify, merge, release

- [x] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 1183 passed | 5 skipped (1186 with the untracked `playerImage` tests); the build succeeds.

- [x] **Step 2: The Windows suite and self-test**

**Ask the user before pushing.** Then:

```bash
git push origin feat/games-ae:check/plan-ae
gh run watch "$(gh run list --branch check/plan-ae --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
git push origin --delete check/plan-ae
```

Expected: green. The log shows `"query":true`.

- [x] **Step 3: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/games-ae`. It reviews against spec §8.1, §9.5 and §11, the amendments, the handoff, the "Stats Games" canvas and the Review Focus list. Fix Critical and Important findings, each in its own commit, test first. Re-run Step 1 after them, and the Task 5 walk-through after a screen change.

- [x] **Step 4: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/games-ae -m "merge: feat/games-ae (plan AE)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.36.0" && git tag v0.36.0
git branch -d feat/games-ae
```

- [x] **Step 5: Status block**

Replace this plan's Status line with the outcome:

- the merge commit and the tag;
- the Task 5 numbers and the walk-through;
- the review fixes and anything deferred.

Then commit, staging this file only: `git commit -m "docs(plan): mark plan AE complete"`.

- [ ] **Step 6: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.36.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests and the packaged self-test, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.36.0 --draft=false`). The release notes should say:

- Games arrives in Companion Stats: every game of a season, week by week, your games first.
- Before a game, a preview: Elo and the betting market, the line, each offense against the other defense phase by phase, and the key matchups, with Sleeper's projections when a league is imported.
- After it, the box score: the top fantasy performances, passing, rushing, receiving, kicking and defense.
- No stats rebuild on first launch.

---

## Self-review against the spec

- **§9.5 Matchup preview** (Tasks 2–3): "any game; both teams side by side, each offense against the opposing defense by phase (pass, rush, pass rush vs protection, coverage vs receivers), Elo and Vegas forecast, weather, key player matchups."
  - Any game of any season from the rail; both teams in the header and side by side below.
  - Each offense against the other defense: overall, passing, rushing, protection against the pass rush, finishing; coverage against receivers is the passing rows and the receivers' matchups (amendment B; coverage is charted through the prior season only).
  - Elo and the market (the "Vegas forecast") with the line and implied points; the weather the schedule has (amendment H: thin).
  - Key player matchups: the decisions of 2026-10-27 (amendment C), with the projections a league adds (D).
- **§9.1:** the Games item instead of a Matchups item (amendment A); the season and scoring are the shared scope's.
- **§8.1:** `stats.games` with the kickoff (amendment F).
- **§9.6 Design.** The handoff's "9. Game" (rail, scoreboard header, top performances, box score) and the "Stats Games" canvas (forecast cards, the phase rows with rank chips and the edge bar, the key matchups with the matchup chips and the pass-rush card), light and dark, --s1 / --s2 with their shapes for the two teams.
- **§11 Testing.**
  - Unit tests for the model (weeks, rail, byes, header, forecast, scopes, phases, faces, key players, pass rush, projections, box score); component tests for the nav, the preview with and without a league, a final game's box score and pre-game view, a team's dashboard from the header.
  - The budget on live data, in the worker and in the app (Task 5).
  - The packaged smoke test (Task 6 Step 2).
- **Not in this plan** (by §12 and §13): receiver–cornerback pairs; the age curve; natural-language queries (their own spec, next).
