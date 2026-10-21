# Plan AB — Stats analysis: the team dashboard

**Status:** complete 2026-10-20. Merged to main as `c1a96a3` and tagged `v0.29.0` on `78d08d9` (pushed and published 2026-10-20). Tasks 1–5 were executed from this text; each task's tests were seen failing, then passing, with the plan's counts plus the 3 of the untracked `tests/shared/playerImage.test.ts`.

Task 6 on the branch: `ALL GATES PASSED`. Every tab's queries 23–177 ms (splits 136–160 ms); every team in 2025 and 2026 had its games, place, roster tables, usage grid and lines. In the app: Teams 135–170 ms to the Overview, tabs 56–177 ms, Situational 215–256 ms. The walk-through ran on the branch's build with the dev league and without one, light and dark; every screenshot matched its checklist except `11-forecast-2024` (below), and all matched after the review fixes.

Windows Package check green (`"query":true`) after the review fixes.

Final review (fresh reviewer, Opus): no Critical; 4 Important and 7 Minor findings. All four Important and five Minor were fixed, each test-first in its own commit (`ed05ab2` … `3e34962`):

- (Important, also seen in the walk-through) Until a team was picked, the dashboard followed "my top scorer in scope", so a new season switched the team (BUF to GB in 2024) and remounted the screen. The team shown is now kept.
- (Important) The query hooks keep the last answer while the next loads, so › showed the previous team's players and record, and Offense to Defense showed empty lines. The dashboard takes fresh answers only (`keepLast: false`), `LinesTab` is keyed by tab, and the tiles read "—" until the games arrive.
- (Important) A team without games in range (missed playoffs, a bye week) got a page of "—". A notice says so ("DET did not play in the 2026 postseason."), and lines read "No games in this range."
- (Important) The two-minute test seeded only first-quarter plays. It now checks Q2 at 90 s and 120 s, Q4 at 30 s and 121 s, the ends of Q1 and Q3, and overtime, and fails on a broken clause.
- The chart's hover index outlived shrinking weeks (a crash); end labels carry their line's swatch and stay in the plot.
- A cancelled game (2022 BUF at CIN) showed as next; the league mean now counts the same teams as the rank.
- Failed tables (kickers, personnel, schedule strength) show their error; the results strip is a list, the percentile pill an image, and the neutral pill has ink text.

Deferred (Minor):

- the tabs have no arrow-key navigation and the leaderboard rows no keyboard focus (as in Plan AA);
- a brief ARI before my top scorer's team when rosters are still loading;
- the share tables count QB, RB, WR and TE targets only (fullbacks are RBs here).

975 tests after the fixes.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dashboard for every NFL team (spec §9.3), in Companion Stats, built on the design handoff's team page.

- Teams in the Stats nav opens it. A team row on the team leaderboard or a home board opens it too.
- Every tab shows the handoff's header:
  - team select with ‹ ›, name and division place;
  - the abbreviation and four tiles (record, points and allowed per game, margin);
  - a results strip, byes and postseason rounds included.
- Nine tabs:
  - **Overview:** the handoff's who-gets-the-ball tables, the ratings, the next game (Elo against the market), EPA by week.
  - **Offense, Defense, Special teams, Tendencies:** stat lines with a percentile pill, the rank among the 32 and the league's mean.
  - **Situational:** drives and downs, and a table of splits (red zone, two-minute, score state, quarter).
  - **Players:** usage shares week by week.
  - **Schedule:** every game with its line, Elo, weather and the opponent's strength.
  - **Forecast:** odds and adjusted EPA by week, season odds, ratings, schedule strength, luck.
- The engine gains a two-minute split.
- Ship `v0.29.0`.

**Architecture:**

- **Engine.** `situation.twoMinute` (`src/main/stats/engine/compile.ts`, the type and the JSON Schema).
- **Shared.** `src/shared/stats/nflTeams.ts`: divisions, names, `STATS_TEAMS`, `divisionOf`. The season simulation reads its divisions from there.
- **Renderer model** (`src/renderer/src/lib/stats/team.ts`, pure and unit-tested).
  - Tabs, and each stat tab's sections of lines (metric, split, label).
  - The queries: one over every team per split; the team's players; weekly rows; usage; personnel; specialists.
  - Lines with the dashboard's own ranking among the teams that qualify (ties share a rank).
  - The team's side of each game: record, results strip, next game, schedule.
  - The roster tables, the usage grid, the splits table, the division place, the opening team.
- **Hooks** (`useStats.ts`): `useStatsQueries` (a tab's queries together) and `useTeamGames`.
- **Components** (`src/renderer/src/components/stats/`):
  - `StatLines`: the percentile pill, a line, a section.
  - `WeekChart`: weekly lines with gaps, end labels, a legend and a hover.
  - Series colours `--s1` / `--s2` in the Stats palette.
- **Screen** (`src/renderer/src/screens/stats/StatsTeam.tsx`): the header, the tabs, each tab's body.
  - `StatsApp` keeps the team and the tab, and opens the dashboard from the nav, a team leaderboard row or a home board's team row.
  - `StatsNav`: Teams is the dashboard.
  - `StatsLeaderboard`: a team row opens it.

**Tech Stack:** Electron 39, React 19, Tailwind 4, `radix-ui` (HoverCard), `lucide-react`, TypeScript strict, Vitest (jsdom for components). No chart library: the charts are SVG.

**Spec:** `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`: §9.3, §9.6 and §11 (the Plan AB row of §12), §7.1 for the two-minute split. Amended by this plan: Task 5 writes the amendments into the spec as §19.

**Design:** the handoff in `docs/design/FantasyCompanion UI/templates/two-products/design_handoff_companion/`:

- README "8. Team", `StatsTeam.dc.html` and `stats-team.js`: the header and the tables;
- `stats-model.js` `pbar`: the percentile pill;
- `stats-compare.js` `lines`: the weekly chart.

The screens reference: `docs/reference/stats-screens.md`.

## Decisions (user, 2026-10-20)

- **The handoff's team page is the frame, the spec's tabs fill it.** The handoff header tops every tab. Its tables open the Overview, and the spec's other tabs are built in the Stats language on the engine, as Plan AA did with the Ledger.
- **Teams opens the dashboard.** Its default is the team of my top fantasy scorer, else the first. Team leaderboard rows and the home boards' team rows open it too.
- Write the plan now; execute it separately.

## Planning findings (live data, 2026-10-20)

Measured on a full `stats.duckdb` (2019 – 2026 week 6, Plan Z's live build) with the code in this plan, and in the built app on scratch profiles (`--user-data-dir`), unless it says otherwise.

- **Speed is inside the budget** (§11: dashboard first paint ≤ 300 ms).

| Measure                                                  | Result     |
| -------------------------------------------------------- | ---------- |
| A stat tab's queries (1–3, every team), warm             | 24–118 ms  |
| Situational: the lines and ten split queries at once     | 145–185 ms |
| `stats.games` for one team's season                      | 24–58 ms   |
| In the app: Teams to the Overview on screen              | 142 ms     |
| In the app: a tab from click to content                  | 66–151 ms  |
| In the app: Situational from click to content            | 275 ms     |
| A cold read (once, the 2026 splits right after the copy) | 1,237 ms   |

- **A team's rank needs every team.** With `scope.teams: ['DET']` the engine ranks DET among the rows it returns: 1st of 1. Each tab asks for all 32 teams (40 rows), one query per split, and picks the team's row.
- **The engine's rank and percentile disagree on ties.** It ranks with `rank()` and places with `percent_rank()`, so BUF's 0 special-teams touchdowns read "3rd of 32" with a red 0 percentile (29 teams tied at 0). The dashboard ranks among the teams that qualify itself:
  - a tie shares a rank ("T-3rd") and its percentile sits at the middle of the tie;
  - a team below a metric's sample in a split shows its value without a rank.
- **Two-minute had no filter.** The engine split by quarter, score margin and field zone but not the clock. `half_seconds_remaining` is in `plays`, so `situation.twoMinute` is a five-line change with a run test (amendment C). 2026 BUF: 39 offensive two-minute plays, 1st in EPA.
- **Drive metrics cannot be split.** `td_drive_rate` "does not come from plays", so the red zone reads EPA and success inside the 20, and the TD drive rate stands beside them.
- **Missing in 2026, and why.** Participation (pressure, man / zone, personnel) is published after the season, and FTN charting (blitz, play action, RPO, screens, motion) starts in 2022. Each such line says so ("Not published for 2026 yet.", "Charted from 2022.").
- **The handoff's share is not the engine's.** `target_share` divides by the team's targets in the games the player played. Ty Johnson's 10 targets read 14 % and James Cook's 11 read 8 % under "130 team targets". The Overview's tables divide by the team's total, as the handoff does (amendment A).
- **Postseason labels.** nflverse numbers the postseason on from the season's last regular week. The rounds use `regularWeeks(season)`; the first cut called 2024's Super Bowl (week 22) "WC". A division place from postseason records means nothing, so it shows in the regular season only.
- **Neutral metrics** (pass rate over expected, pace, blitz rate) have no better side. "16th most of 32" read badly; they read "16th highest", in grey.
- **Layout.** Three columns of lines truncated every label at 1440 px. Sections sit in two columns (≥ 520 px each). A line without a percentile spans its note across the bar and rank.
- **Colours.** The handoff's `--s1` / `--s2` pass the dataviz validator in light. The dark ones were outside the dark lightness band (L 0.70, 0.77), so they move to `#5d8ff2` / `#26a092` (CVD ΔE 15.1 deutan, 17.3 normal).
- **Not in the data, so not on the screen** (amendment D): coverage shell, formation mix, defensive personnel. Man / zone, shotgun rate, personnel groupings, box count and blitz rate stand in.
- **The app runs here.** The walk-through (Task 6 Step 3) drives the built app over the DevTools protocol, with the dev league and without one, in light and dark. Every tab was checked, plus 2024 and the 2024 postseason (PHI: WC, DIV, CONF, SB), the team leaderboard and a home board opening the dashboard. Its app runs refresh their scratch profiles: in one run BUF's week 6 game landed mid-walk, the screens queried again, and the record moved to 5–1.

## Spec amendments (taken in this plan)

Task 5 Step 3 records these in the spec as §19. **Confirm them with the user before starting Task 1** if they have not been approved yet.

- **A. The handoff's team page is the dashboard's frame (§9.3, §9.6).** Its header (team select with ‹ ›, name and division place, the abbreviation, four tiles, a results strip) tops every tab, and its tables (who gets the targets, the carries, who throws) open the Overview. The spec's tabs follow in the Stats language. The handoff's Defense tiles give way to the spec's ratings; defense has its own tab.
  - Teams in the nav opens the dashboard on the team viewed last; the first time, on the team of my top fantasy scorer in range, else ARI. The team leaderboard is under "Team leaderboards →" and the home's "All →"; a team row there, or on a home board, opens the dashboard.
  - A share in the Overview's tables is of the team's total in range (handoff), not the engine's share of the games a player played.
- **B. Ranks are among the league.** Each tab asks for every team (one query per split) and finds the team's row. The dashboard ranks among the teams that qualify: a tie shares a rank ("T-3rd") and its percentile sits at the middle of the tie (30 teams with no special-teams touchdown are near the median, not last). A metric with no better side reads "11th highest" and is not shaded. The percentile is the handoff profile's pill on a track; the league's mean is beside the rank.
- **C. Two-minute (§7.1).** The engine gains `situation.twoMinute`: the last two minutes of the second and fourth quarters. The Situational tab splits by red zone, two-minute, leading by 9+, within 8, trailing by 9+ and quarter, each ranked among the 32 in the same split.
- **D. What the data cannot give (§9.3).**
  - Red-zone TD % is the TD drive rate (as §16 F), with red-zone EPA and success beside it.
  - Coverage shell, formation mix and defensive personnel have no metric: man / zone rate and EPA, shotgun rate, personnel groupings, box count and blitz rate stand in. Participation's columns (pressure, coverage, personnel) end with the prior season, and a line says so.
  - The Players tab covers QB, RB, WR and TE.
- **E. Schedule and Forecast.** Games come from `stats.games`: result, Elo and market probability, the line, weather, and the opponent's Elo before the game as its strength (1550 and up hard, 1450 and below easy). The Forecast charts playoff and division odds and adjusted EPA as of each week.
- **F. Charts** are drawn as SVG (no chart library): a line per series in the handoff's `--s1` / `--s2`, checked with the dataviz validator for colour-blind separation (the dark values moved into the dark lightness band: `#5d8ff2`, `#26a092`), gaps for byes, end labels and a hover with every series that week.
- **G. Teams' names and divisions** live in `src/shared/stats/nflTeams.ts`; the season simulation reads its divisions from there. A division place is the regular season's win %, then margin (an approximation of the tiebreakers).
- **H. Measured** (2026 week 6): each tab's queries 25–120 ms, the eleven of Situational 145–170 ms; in the app, Teams 140 ms from click to the Overview and a tab 65–275 ms (budget 300 ms, §11).

## Global Constraints

- **Branch** `feat/team-dashboard-ab` off `main`.
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
- **Test counts** are those of a clean checkout (`main`: 933 passed, 5 skipped). In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3.
- **Scope.**
  - The fantasy screens do not change.
  - The stats engine changes only by `situation.twoMinute` (Task 1). The season simulation only reads its divisions from the shared table.
  - No player dashboard (Plan AC): a player row on the dashboard opens nothing yet.
  - No explorer, compare or trends (AD), no matchups (AE): Games stays disabled.
- **Network.** No test touches the network. Task 6's live check opens a copy of the live database offline; its app runs refresh their scratch profiles.
- **Gates.**
  - **Task 6:** the live check ends with `ALL GATES PASSED`, and every screenshot of the walk-through shows what its checklist says.
  - **Task 7 Step 2:** the Windows suite and self-test on the Package check workflow.
  - If a gate fails, stop and report the numbers or the screenshot to the user.
- **Release** `v0.29.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push**: `check/plan-ab` in Task 7, then `main` and the tag.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **A rank against the wrong population.** Examples: a team ranked among itself, a tie at the bottom shaded red, a team under a split's sample ranked anyway.
   - Task 2: queries never filter the team; `teamRank` ties and qualification.
   - Task 4: the queries the screen sends.
2. **A game read from the wrong side.** Examples: an away team's win probability or spread not flipped, scores swapped.
   - Task 2: `teamGames` against a home and an away game; the schedule's lines.
3. **Byes and the postseason.**
   - A missing bye card, a round mislabelled in a 17-week season, a standing from playoff records.
   - Task 2: the strip, `roundOf`. Task 4: the standing only in the regular season. Task 6: the 2024 postseason screenshot.
4. **An empty line that does not say why** (pressure in the current season, blitz before 2022). Task 2: `missingFor`. Task 6: no empty offense line or split that the season has.
5. **The two-minute split.** It must keep the last two minutes of the 2nd and 4th quarters only, and refuse nothing else. Task 1: the run test; the schema and the type agree, or the compiler fails.
6. **The wrong team opens**, or the first team flashes before my top scorer's. Task 4: with a roster, without one; StatsApp waits for the top scorer.
7. **AA's screens regress.** A team row now opens the dashboard, and Teams in the nav changed.
   - Task 4 keeps the AA app tests green, and adds the leaderboard and home routes.
8. **Charts unreadable** in dark mode or for colour-blind readers.
   - Validated series colours, a legend, end labels and a hover (Task 3).
   - Task 6: the dark screenshots.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/team-dashboard-ab
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/team-dashboard-ab`.

---

### Task 1: The two-minute split and the teams table (spec §7.1, §9.3; amendments C, G)

The engine splits off the last two minutes of each half. The teams' names and divisions move to a shared table the renderer can read.

**Files:**

- Create: `src/shared/stats/nflTeams.ts`, `tests/shared/stats/nflTeams.test.ts`
- Modify: `src/shared/stats/types.ts`, `src/shared/stats/querySchema.ts`, `src/main/stats/engine/compile.ts`, `src/main/stats/models/simulate.ts`, `tests/main/stats/engine/run.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/stats/nflTeams.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { DIVISIONS, divisionOf, STATS_TEAMS, TEAM_NAMES } from '@shared/stats/nflTeams'

describe('NFL teams as the stats rows key them', () => {
  it('has 32 teams in eight divisions of four, each named', () => {
    expect(Object.keys(DIVISIONS)).toHaveLength(8)
    expect(Object.values(DIVISIONS).every((d) => d.length === 4)).toBe(true)
    expect(STATS_TEAMS).toHaveLength(32)
    expect(STATS_TEAMS.filter((t) => !TEAM_NAMES[t])).toEqual([])
    expect(STATS_TEAMS.slice(0, 3)).toEqual(['ARI', 'ATL', 'BAL'])
  })

  it('uses nflverse codes and finds a team’s division', () => {
    expect(TEAM_NAMES.LA).toBe('Los Angeles Rams')
    expect(divisionOf('LA')).toBe('NFC West')
    expect(divisionOf('DET')).toBe('NFC North')
    expect(divisionOf('LAR')).toBeNull()
  })
})
```

```diff
diff --git a/tests/main/stats/engine/run.test.ts b/tests/main/stats/engine/run.test.ts
index 2cc120d..dbae9bf 100644
--- a/tests/main/stats/engine/run.test.ts
+++ b/tests/main/stats/engine/run.test.ts
@@ -83,6 +83,26 @@ describe('runQuery (stats-analysis spec §7)', () => {
     expect(pressured.notes[0]).toMatch(/participation/)
   })

+  it('splits the last two minutes of a half from the rest', async () => {
+    const db = await seeded()
+    const epa = async (twoMinute: boolean): Promise<unknown[]> => {
+      const r = await runQuery(
+        db,
+        {
+          entity: 'team',
+          metrics: ['off_epa_play'],
+          scope: { seasons: [2025], teams: ['BUF'] },
+          situation: { twoMinute }
+        },
+        CTX
+      )
+      return r.rows.map((x) => [x.values.off_epa_play.raw, x.values.off_epa_play.sample])
+    }
+    // Every seeded play is in the first quarter.
+    expect(await epa(false)).toEqual([[-0.175, 4]])
+    expect(await epa(true)).toEqual([])
+  })
+
   it('scales qualification to the share of plays each situational row keeps', async () => {
     const db = await seeded()
     const shares = async (q: Partial<StatsQuery>): Promise<unknown[]> => {
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/main/stats/engine/run.test.ts tests/shared/stats/nflTeams.test.ts
```

Expected: FAIL. `@shared/stats/nflTeams` does not exist, and the engine refuses `twoMinute` (`unknown situation field "twoMinute"`).

- [ ] **Step 3: The teams table**

Create `src/shared/stats/nflTeams.ts`:

```ts
/** NFL teams as the stats rows key them (nflverse codes: LA, LV, WAS). */

/** Divisions since 2002. */
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

/** Every team, alphabetical. */
export const STATS_TEAMS: string[] = Object.values(DIVISIONS).flat().sort()

export const TEAM_NAMES: Record<string, string> = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB: 'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',
  KC: 'Kansas City Chiefs',
  LA: 'Los Angeles Rams',
  LAC: 'Los Angeles Chargers',
  LV: 'Las Vegas Raiders',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE: 'New England Patriots',
  NO: 'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks',
  SF: 'San Francisco 49ers',
  TB: 'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders'
}

/** "NFC North"; null for a code the table does not know. */
export function divisionOf(team: string): string | null {
  return Object.entries(DIVISIONS).find(([, teams]) => teams.includes(team))?.[0] ?? null
}
```

```diff
diff --git a/src/main/stats/models/simulate.ts b/src/main/stats/models/simulate.ts
index 3459b49..01d1a0c 100644
--- a/src/main/stats/models/simulate.ts
+++ b/src/main/stats/models/simulate.ts
@@ -1,3 +1,4 @@
+import { DIVISIONS } from '@shared/stats/nflTeams'
 import { ELO, eloShift, MARGIN_SD, winProbability } from './elo'
 import { rng } from './linear'

@@ -10,16 +11,7 @@ import { rng } from './linear'
  */

 /** Divisions since 2002; nflverse codes. */
-export const DIVISIONS: Record<string, string[]> = {
-  'AFC East': ['BUF', 'MIA', 'NE', 'NYJ'],
-  'AFC North': ['BAL', 'CIN', 'CLE', 'PIT'],
-  'AFC South': ['HOU', 'IND', 'JAX', 'TEN'],
-  'AFC West': ['DEN', 'KC', 'LAC', 'LV'],
-  'NFC East': ['DAL', 'NYG', 'PHI', 'WAS'],
-  'NFC North': ['CHI', 'DET', 'GB', 'MIN'],
-  'NFC South': ['ATL', 'CAR', 'NO', 'TB'],
-  'NFC West': ['ARI', 'LA', 'SF', 'SEA']
-}
+export { DIVISIONS }

 export const SIM_RUNS = 10_000

```

- [ ] **Step 4: The split**

```diff
diff --git a/src/shared/stats/types.ts b/src/shared/stats/types.ts
index d38869c..9f725eb 100644
--- a/src/shared/stats/types.ts
+++ b/src/shared/stats/types.ts
@@ -129,6 +129,8 @@ export interface StatsQuery {
     scoreMargin?: [number, number]
     winProbability?: [number, number]
     neutral?: boolean
+    /** The last two minutes of either half (2nd and 4th quarters). */
+    twoMinute?: boolean
     pressure?: boolean
     blitz?: boolean
     playAction?: boolean
```

```diff
diff --git a/src/shared/stats/querySchema.ts b/src/shared/stats/querySchema.ts
index 8362c72..98083ea 100644
--- a/src/shared/stats/querySchema.ts
+++ b/src/shared/stats/querySchema.ts
@@ -69,6 +69,10 @@ export function statsQuerySchema(metricIds: string[]): Schema {
       type: 'boolean',
       description: 'Win probability 20–80 %, not the last two minutes of a half.'
     },
+    twoMinute: {
+      type: 'boolean',
+      description: 'The last two minutes of either half (2nd and 4th quarters).'
+    },
     pressure: {
       type: 'boolean',
       description: 'QB pressured (participation, through the prior season).'
```

```diff
diff --git a/src/main/stats/engine/compile.ts b/src/main/stats/engine/compile.ts
index e147074..88de4b6 100644
--- a/src/main/stats/engine/compile.ts
+++ b/src/main/stats/engine/compile.ts
@@ -178,6 +178,7 @@ const SITUATION_FIELDS = [
   'scoreMargin',
   'winProbability',
   'neutral',
+  'twoMinute',
   'pressure',
   'blitz',
   'playAction',
@@ -342,6 +343,10 @@ function situationWhere(
       'coalesce(p.wp BETWEEN 0.2 AND 0.8 AND p.qtr <= 4 AND p.half_seconds_remaining > 120, false)'
     where.push(flag(s.neutral, 'situation.neutral') ? neutral : `NOT ${neutral}`)
   }
+  if (s.twoMinute !== undefined) {
+    const late = 'coalesce(p.qtr IN (2, 4) AND p.half_seconds_remaining <= 120, false)'
+    where.push(flag(s.twoMinute, 'situation.twoMinute') ? late : `NOT ${late}`)
+  }
   if (s.pressure !== undefined) {
     part()
     where.push(`p.was_pressure = ${params.add(flag(s.pressure, 'situation.pressure'))}`)
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/main/stats/engine/run.test.ts tests/shared/stats/nflTeams.test.ts
```

Expected: PASS (10 passed). Then `npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run`: clean; 936 passed | 5 skipped.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/shared/stats/nflTeams.ts src/shared/stats/types.ts src/shared/stats/querySchema.ts src/main/stats/engine/compile.ts src/main/stats/models/simulate.ts tests/main/stats/engine/run.test.ts tests/shared/stats/nflTeams.test.ts
git add src/shared/stats/nflTeams.ts src/shared/stats/types.ts src/shared/stats/querySchema.ts src/main/stats/engine/compile.ts src/main/stats/models/simulate.ts tests/main/stats/engine/run.test.ts tests/shared/stats/nflTeams.test.ts
git commit -m "feat(stats): split the last two minutes"
```

---

### Task 2: The dashboard's model (spec §9.3; amendments A–E, G)

Everything the screen shows, as pure functions: tabs and sections, the queries, lines ranked among the league, the team's games, the roster tables, usage, splits, personnel, schedule.

**Files:**

- Create: `src/renderer/src/lib/stats/team.ts`, `tests/renderer/lib/statsTeam.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/lib/statsTeam.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  defaultTeam,
  gamesInScope,
  nextGame,
  nextGameView,
  personnelRows,
  resultCards,
  rosterView,
  scheduleRows,
  sectionQueries,
  sectionViews,
  splitQueries,
  splitRows,
  standing,
  statLine,
  TAB_SECTIONS,
  TEAM_DASH_TABS,
  teamGames,
  teamRecord,
  topScorerQuery,
  usageGrid,
  weekSeries,
  chartWeeks,
  roundOf,
  type SplitKey
} from '@/lib/stats/team'
import type { GameForecast, StatsOwnership, StatsResult } from '@shared/stats/types'
import { catalogueMap, result, row, STATUS, value } from '../../fixtures/statsScreens'

const byId = catalogueMap()
const scope = { season: 2026, seasonType: 'REG' as const, weeks: null, scoring: 'ppr' as const }
const team = (id: string, values: Parameters<typeof row>[2]): ReturnType<typeof row> =>
  row(id, id, values, { team: id, position: null })

function game(over: Partial<GameForecast>): GameForecast {
  return {
    gameId: 'g',
    season: 2026,
    seasonType: 'REG',
    week: 1,
    gameday: '2026-09-13',
    home: 'DET',
    away: 'GB',
    neutral: false,
    homeScore: null,
    awayScore: null,
    homeElo: 1550,
    awayElo: 1500,
    homeWinProb: 0.6,
    eloSpread: 2,
    vegasHomeWinProb: 0.55,
    spread: 1.5,
    total: 47.5,
    roof: 'outdoors',
    temp: 61,
    wind: 8,
    ...over
  }
}

/** DET: won week 1 at home, lost week 2 away, bye in week 3, at MIN in week 7 (not played). */
const GAMES = teamGames(
  [
    game({ gameId: '1', week: 1, homeScore: 31, awayScore: 24 }),
    game({
      gameId: '2',
      week: 2,
      home: 'CHI',
      away: 'DET',
      homeScore: 20,
      awayScore: 17,
      homeElo: 1480,
      awayElo: 1560,
      homeWinProb: 0.4,
      eloSpread: -3.2,
      vegasHomeWinProb: 0.3,
      spread: -6
    }),
    game({ gameId: '7', week: 7, home: 'MIN', away: 'DET', roof: 'dome', homeWinProb: 0.45 }),
    // Another pair's game: not DET's.
    game({ gameId: 'x', week: 1, home: 'NYJ', away: 'BUF' })
  ],
  'DET'
)

describe('the team dashboard (spec §9.3)', () => {
  it('has the spec’s nine tabs', () => {
    expect(TEAM_DASH_TABS.map((t) => t.label)).toEqual([
      'Overview',
      'Offense',
      'Defense',
      'Special teams',
      'Situational',
      'Tendencies',
      'Players',
      'Schedule',
      'Forecast'
    ])
  })

  it('names catalogue metrics only', () => {
    const ids = Object.values(TAB_SECTIONS).flatMap((s) => s.flatMap((x) => x.lines))
    expect(ids.filter((l) => !byId.has(l.metric)).map((l) => l.metric)).toEqual([])
  })

  it('asks for every team once per split, each metric once', () => {
    const qs = sectionQueries(TAB_SECTIONS.offense, scope, STATUS)
    expect([...qs.keys()]).toEqual(['all', 'redzone'])
    const all = qs.get('all')!
    expect(all).toMatchObject({
      entity: 'team',
      scope: { seasons: [2026], seasonType: 'REG' },
      transform: 'raw',
      scoring: 'ppr',
      limit: 40
    })
    expect(all.scope.teams).toBeUndefined()
    expect(new Set(all.metrics).size).toBe(all.metrics.length)
    expect(qs.get('redzone')).toMatchObject({
      metrics: ['off_epa_play', 'off_success_rate'],
      situation: { fieldZone: 'redzone' }
    })
    // Standings ride along with the Overview.
    expect(
      sectionQueries(TAB_SECTIONS.overview, { ...scope, weeks: [2, 5] }, STATUS, ['wins'])
        .get('all')!
        .metrics.slice(0, 2)
    ).toEqual(['wins', 'elo'])
  })

  it('writes a line: value, rank among the teams, the league’s mean, shading', () => {
    const r = result(
      ['off_epa_play'],
      [
        team('BUF', { off_epa_play: value(0.2, { rank: 1, percentile: 100 }) }),
        team('DET', { off_epa_play: value(0.1, { rank: 2, percentile: 50 }) }),
        team('NYJ', { off_epa_play: value(-0.3, { rank: 3, percentile: 0 }) })
      ]
    )
    const l = statLine(r, 'BUF', { metric: 'off_epa_play' }, byId, 2026)
    expect(l).toMatchObject({
      label: 'EPA per play',
      value: '+0.200',
      rank: '1st of 3',
      heat: 'h3',
      league: '0.000',
      missing: null
    })
    expect(l.title).toContain('Rank 1')
    expect(statLine(r, 'NYJ', { metric: 'off_epa_play' }, byId, 2026).heat).toBe('l3')
    // A metric with no better side reads "highest" and is not shaded.
    const n = result(['proe'], [team('DET', { proe: value(4) }), team('BUF', { proe: value(6) })])
    expect(statLine(n, 'DET', { metric: 'proe' }, byId, 2026)).toMatchObject({
      rank: '2nd highest',
      percentile: 0,
      heat: 'n'
    })
  })

  it('ranks among the qualified teams itself, ties at their middle', () => {
    const r = result(
      ['team_st_tds'],
      [
        team('KC', { team_st_tds: value(2) }),
        team('BUF', { team_st_tds: value(0) }),
        team('DET', { team_st_tds: value(0) }),
        team('NYJ', { team_st_tds: value(0) }),
        // Below the metric's sample: shown, not ranked.
        team('SF', { team_st_tds: value(5, { qualified: false }) })
      ]
    )
    expect(statLine(r, 'BUF', { metric: 'team_st_tds' }, byId, 2026)).toMatchObject({
      rank: 'T-2nd of 4',
      percentile: 100 / 3,
      heat: 'l1'
    })
    expect(statLine(r, 'SF', { metric: 'team_st_tds' }, byId, 2026)).toMatchObject({
      value: '5',
      rank: null,
      percentile: null,
      heat: 'n'
    })
  })

  it('says why a line is empty for the season', () => {
    const r = result(['off_pressure_rate', 'def_blitz_rate'], [team('DET', {})])
    r.columns = r.columns.map((c) => ({ ...c, seasons: [] }))
    expect(statLine(r, 'DET', { metric: 'off_pressure_rate' }, byId, 2026)).toMatchObject({
      value: '—',
      rank: null,
      missing: 'Not published for 2026 yet.'
    })
    expect(statLine(r, 'DET', { metric: 'def_blitz_rate' }, byId, 2021).missing).toBe(
      'Charted from 2022.'
    )
  })

  it('reads every section from its split', () => {
    const results = new Map<SplitKey, StatsResult>([
      ['all', result(['td_drive_rate'], [team('DET', { td_drive_rate: value(0.3) })])],
      ['redzone', result(['off_epa_play'], [team('DET', { off_epa_play: value(0.5) })])]
    ])
    const red = sectionViews(TAB_SECTIONS.offense, results, 'DET', byId, 2026)[3]
    expect(red.title).toBe('Red zone and third down')
    expect(red.lines.slice(0, 3).map((l) => [l.label, l.value])).toEqual([
      ['Red-zone EPA per play', '+0.500'],
      ['Red-zone success rate', '—'],
      ['Touchdown drive rate', '30.0%']
    ])
  })

  it('takes the team’s side of each game', () => {
    expect(GAMES.map((g) => [g.week, g.opponent, g.home, g.result])).toEqual([
      [1, 'GB', true, 'W'],
      [2, 'CHI', false, 'L'],
      [7, 'MIN', false, null]
    ])
    expect(GAMES[1]).toMatchObject({
      pointsFor: 17,
      pointsAgainst: 20,
      eloWinProb: 0.6,
      eloSpread: 3.2,
      vegasWinProb: 0.7,
      vegasSpread: 6,
      opponentElo: 1480,
      teamElo: 1560
    })
  })

  it('names postseason rounds from the season’s length', () => {
    expect([18, 19, 20, 21].map((w) => roundOf(2020, w))).toEqual(['WC', 'DIV', 'CONF', 'SB'])
    expect([19, 22].map((w) => roundOf(2024, w))).toEqual(['WC', 'SB'])
    const post = teamGames([game({ season: 2024, seasonType: 'POST', week: 22 })], 'DET')
    expect(post[0].round).toBe('SB')
    expect(GAMES[0].round).toBeNull()
  })

  it('sums the record and the results strip over the scope, byes included', () => {
    expect(teamRecord(GAMES)).toEqual({
      record: '1–1',
      pointsPerGame: '24.0',
      allowedPerGame: '22.0',
      margin: '+2.0',
      tone: 'good',
      played: 2
    })
    expect(teamRecord([])).toMatchObject({ record: '0–0', margin: '—', tone: 'even' })
    const cards = resultCards(GAMES, { ...scope, weeks: [1, 3] }, STATUS)
    expect(cards.map((c) => [c.week, c.opponent, c.score])).toEqual([
      ['W1', 'GB', 'W 31–24'],
      ['W2', '@CHI', 'L 17–20'],
      ['W3', 'BYE', null]
    ])
    expect(gamesInScope(GAMES, { ...scope, weeks: [2, 6] }, STATUS)).toHaveLength(1)
    expect(gamesInScope(GAMES, { ...scope, seasonType: 'POST' }, STATUS)).toEqual([])
  })

  it('previews the next game: Elo against the market, weather', () => {
    const g = nextGame(GAMES)!
    expect(g.week).toBe(7)
    expect(nextGameView(g, 'DET')).toMatchObject({
      opponent: 'MIN',
      where: 'Away',
      elo: { winProb: '55%', spread: 'DET +2.0' },
      vegas: { winProb: '45%', spread: 'DET +1.5', total: '47.5' },
      gap: 'Elo is 10 points higher than the market',
      weather: 'Indoors'
    })
    expect(nextGameView(GAMES[0], 'DET').weather).toBe('61°F, wind 8 mph')
    expect(nextGame(GAMES.slice(0, 2))).toBeNull()
  })

  it('places the team in its division', () => {
    const r = result(
      ['wins', 'losses', 'points_for', 'points_against'],
      [
        ['DET', 3, 2, 150, 140],
        ['GB', 3, 2, 160, 120],
        ['CHI', 4, 1, 100, 90],
        ['MIN', 1, 4, 80, 140]
      ].map(([id, w, l, pf, pa]) =>
        team(String(id), {
          wins: value(Number(w)),
          losses: value(Number(l)),
          points_for: value(Number(pf)),
          points_against: value(Number(pa))
        })
      )
    )
    expect(standing(r, 'DET')).toBe('3rd in the NFC North')
    expect(standing(r, 'CHI')).toBe('1st in the NFC North')
    expect(standing(r, 'XYZ')).toBeNull()
  })

  it('opens on my top scorer’s team, else the first', () => {
    const own: StatsOwnership = {
      players: { a: { name: 'Me', mine: true }, b: { name: 'Rival', mine: false } },
      teams: {}
    }
    expect(topScorerQuery(own, scope, STATUS)).toMatchObject({
      entity: 'player',
      metrics: ['fantasy_points'],
      scope: { players: ['a'] },
      limit: 1
    })
    expect(topScorerQuery(null, scope, STATUS)).toBeNull()
    const top = result(['fantasy_points'], [row('a', 'A', {}, { team: 'SEA' })])
    expect(defaultTeam(top)).toBe('SEA')
    expect(defaultTeam(null)).toBe('ARI')
  })

  it('lists who gets the targets and carries, shares against the leader', () => {
    const p = (id: string, pos: string, v: Record<string, number>): ReturnType<typeof row> =>
      row(id, id, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])), {
        position: pos,
        team: 'DET'
      })
    const v = rosterView(
      result(
        [],
        [
          p('wr', 'WR', { targets: 50, receptions: 35, rec_yds: 400 }),
          p('rb', 'RB', { targets: 25, carries: 80 }),
          p('qb', 'QB', { pass_att: 190, pass_cmp: 128, pass_yds: 1485, pass_ypa: 7.8 })
        ]
      ),
      { players: { rb: { name: 'Me', mine: true } }, teams: {} }
    )
    expect(v.teamTargets).toBe(75)
    expect(v.targets.map((r) => [r.id, r.share, r.bar, r.mine])).toEqual([
      ['wr', 50 / 75, 1, false],
      ['rb', 25 / 75, 0.5, true]
    ])
    expect(v.targets[0].cells).toEqual(['50', '35', '400', '0', '—'])
    expect(v.carries.map((r) => r.id)).toEqual(['rb'])
    expect(v.passers[0].cells).toEqual(['128/190', '1,485', '0', '0', '7.8'])
  })

  it('charts a series per metric over the weeks, gaps for byes', () => {
    const wk = result(
      ['off_epa_play'],
      [1, 2, 4]
        .map((w) => team('DET', { off_epa_play: value(w / 10) }))
        .map((r, i) => ({ ...r, group: { week: [1, 2, 4][i] } }))
    )
    const weeks = chartWeeks(wk, { ...scope, weeks: [1, 4] }, STATUS)
    expect(weeks).toEqual([1, 2, 3, 4])
    expect(weekSeries(wk, ['off_epa_play'], weeks, byId)[0].points.map((p) => p.value)).toEqual([
      0.1,
      0.2,
      null,
      0.4
    ])
    expect(chartWeeks(wk, { ...scope, seasonType: 'POST' }, STATUS)).toEqual([1, 2, 4])
  })

  it('grids usage: players with a share, highest first, a cell per week', () => {
    const season = result(
      ['snap_share'],
      [
        row('a', 'A', { snap_share: value(0.5) }),
        row('b', 'B', { snap_share: value(0.9, { estimated: true }) }),
        row('c', 'C', { snap_share: value(0) })
      ]
    )
    const weekly = result(
      ['snap_share'],
      [
        { ...row('b', 'B', { snap_share: value(0.8) }), group: { week: 1 } },
        { ...row('b', 'B', { snap_share: value(1) }), group: { week: 2 } },
        { ...row('a', 'A', { snap_share: value(0.5) }), group: { week: 2 } }
      ]
    )
    const grid = usageGrid(season, weekly, 'snap_share', [1, 2], null)
    expect(grid.map((r) => [r.id, r.season, r.estimated, r.cells])).toEqual([
      ['b', 0.9, true, [0.8, 1]],
      ['a', 0.5, false, [null, 0.5]]
    ])
  })

  it('splits by situation: plays and ranks, one query each', () => {
    const qs = splitQueries(scope, STATUS)
    expect(qs.get('twoMinute')?.situation).toEqual({ twoMinute: true })
    expect(qs.get('trailing')?.situation).toEqual({ scoreMargin: [-99, -9] })
    expect(qs.get('all')?.situation).toBeUndefined()
    const r = result(
      ['off_epa_play'],
      [team('DET', { off_epa_play: value(0.2, { sample: 74, rank: 2, percentile: 97 }) })]
    )
    const rows = splitRows(new Map([['redzone', r]]), 'DET', byId, 2026)
    expect(rows.map((x) => x.label)).toEqual([
      'All plays',
      'Red zone',
      'Two-minute',
      'Leading by 9+',
      'Within 8',
      'Trailing by 9+',
      '1st quarter',
      '2nd quarter',
      '3rd quarter',
      '4th quarter'
    ])
    expect(rows[1]).toMatchObject({ offPlays: '74', defPlays: '—' })
    expect(rows[1].cells[0]).toMatchObject({ value: '+0.200', rank: '1st', heat: 'n' })
  })

  it('mixes personnel by plays', () => {
    const r = result(
      ['off_epa_play', 'off_success_rate'],
      [
        {
          ...team('DET', { off_epa_play: value(0.1, { sample: 30 }) }),
          group: { personnel: '12' }
        },
        {
          ...team('DET', { off_epa_play: value(0.2, { sample: 70 }) }),
          group: { personnel: '11' }
        },
        { ...team('DET', { off_epa_play: value(null) }), group: { personnel: null } }
      ]
    )
    expect(personnelRows(r).map((x) => [x.personnel, x.plays, x.share, x.epa])).toEqual([
      ['11', 70, 0.7, '+0.20'],
      ['12', 30, 0.3, '+0.10']
    ])
  })

  it('lists the schedule from the team’s side', () => {
    const rows = scheduleRows(GAMES, 'DET')
    expect(rows.map((r) => [r.week, r.opponent, r.score, r.elo, r.vegas, r.line])).toEqual([
      ['1', 'GB', 'W 31–24', '60%', '55%', 'DET −1.5'],
      ['2', '@ CHI', 'L 17–20', '60%', '70%', 'DET −6.0'],
      ['7', '@ MIN', '', '55%', '45%', 'DET +1.5']
    ])
    expect(rows[1].strength).toBe('even')
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/renderer/lib/statsTeam.test.ts
```

Expected: FAIL. `@/lib/stats/team` does not exist.

- [ ] **Step 3: Write the model**

Create `src/renderer/src/lib/stats/team.ts`:

```ts
import type {
  GameForecast,
  MetricInfo,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsResultColumn,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'
import { DIVISIONS, divisionOf, STATS_TEAMS } from '@shared/stats/nflTeams'
import { cellTitle, fmtStat, heatOf, ordinal, type Heat } from './format'
import { queryScope, regularWeeks, weeksOf, type StatsScope } from './scope'

/** Spec §9.3: the team dashboard's tabs. */
export type TeamTab =
  | 'overview'
  | 'offense'
  | 'defense'
  | 'special'
  | 'situational'
  | 'tendencies'
  | 'players'
  | 'schedule'
  | 'forecast'

export const TEAM_DASH_TABS: { id: TeamTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'offense', label: 'Offense' },
  { id: 'defense', label: 'Defense' },
  { id: 'special', label: 'Special teams' },
  { id: 'situational', label: 'Situational' },
  { id: 'tendencies', label: 'Tendencies' },
  { id: 'players', label: 'Players' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'forecast', label: 'Forecast' }
]

/** Play-grain splits the dashboard reads (engine `situation`). */
export type SplitKey =
  'all' | 'redzone' | 'twoMinute' | 'leading' | 'close' | 'trailing' | 'q1' | 'q2' | 'q3' | 'q4'

export const SPLITS: Record<SplitKey, { label: string; situation?: StatsQuery['situation'] }> = {
  all: { label: 'All plays' },
  redzone: { label: 'Red zone', situation: { fieldZone: 'redzone' } },
  twoMinute: { label: 'Two-minute', situation: { twoMinute: true } },
  leading: { label: 'Leading by 9+', situation: { scoreMargin: [9, 99] } },
  close: { label: 'Within 8', situation: { scoreMargin: [-8, 8] } },
  trailing: { label: 'Trailing by 9+', situation: { scoreMargin: [-99, -9] } },
  q1: { label: '1st quarter', situation: { quarter: [1] } },
  q2: { label: '2nd quarter', situation: { quarter: [2] } },
  q3: { label: '3rd quarter', situation: { quarter: [3] } },
  q4: { label: '4th quarter', situation: { quarter: [4] } }
}

/** A stat line: a catalogue metric, under a split when it has one, with its own label if needed. */
export interface LineDef {
  metric: string
  split?: SplitKey
  label?: string
}

export interface SectionDef {
  title: string
  lines: LineDef[]
}

const at = (split: SplitKey, metric: string, label: string): LineDef => ({ metric, split, label })
const plain = (...ids: string[]): LineDef[] => ids.map((metric) => ({ metric }))

/** Spec §9.3: what each stat tab shows, grouped as the spec lists it. */
export const TAB_SECTIONS: Record<
  'overview' | 'offense' | 'defense' | 'special' | 'situational' | 'tendencies' | 'forecast',
  SectionDef[]
> = {
  overview: [
    {
      title: 'Ratings',
      lines: plain('elo', 'srs', 'adj_off_epa', 'adj_def_epa', 'off_epa_play', 'def_epa_play')
    }
  ],
  offense: [
    {
      title: 'Efficiency',
      lines: plain(
        'off_epa_play',
        'off_success_rate',
        'off_explosive_rate',
        'off_early_down_epa',
        'points_per_drive',
        'adj_off_epa'
      )
    },
    {
      title: 'Passing',
      lines: plain(
        'off_pass_epa',
        'off_pass_success',
        'off_pass_yds_game',
        'off_sack_rate',
        'off_pressure_rate'
      )
    },
    {
      title: 'Rushing',
      lines: plain(
        'off_rush_epa',
        'off_rush_success',
        'off_rush_yds_game',
        'off_line_yards',
        'off_stuff_rate'
      )
    },
    {
      title: 'Red zone and third down',
      lines: [
        at('redzone', 'off_epa_play', 'Red-zone EPA per play'),
        at('redzone', 'off_success_rate', 'Red-zone success rate'),
        ...plain('td_drive_rate', 'off_third_down_pct', 'off_fourth_down_pct')
      ]
    },
    { title: 'Ball security', lines: plain('off_turnovers', 'off_havoc_rate') }
  ],
  defense: [
    {
      title: 'Efficiency allowed',
      lines: plain(
        'def_epa_play',
        'def_success_rate',
        'def_explosive_rate',
        'def_points_per_drive',
        'adj_def_epa',
        'points_against'
      )
    },
    {
      title: 'Pass rush',
      lines: plain('def_pressure_rate', 'def_sack_rate', 'def_blitz_rate', 'def_pass_rushers')
    },
    {
      title: 'Coverage',
      lines: plain(
        'def_pass_epa',
        'def_pass_success',
        'def_man_rate',
        'def_man_epa',
        'def_zone_epa'
      )
    },
    {
      title: 'Run defense',
      lines: plain(
        'def_rush_epa',
        'def_rush_success',
        'def_stuff_rate',
        'def_line_yards',
        'def_rush_yds_game'
      )
    },
    {
      title: 'Havoc and red zone',
      lines: [
        ...plain('def_havoc_rate', 'def_turnovers'),
        at('redzone', 'def_epa_play', 'Red-zone EPA per play allowed'),
        ...plain('def_third_down_pct')
      ]
    },
    {
      title: 'Fantasy points allowed',
      lines: plain('fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te', 'fpa_k')
    }
  ],
  special: [
    { title: 'Kicking', lines: plain('team_fg_pct', 'team_fgoe') },
    { title: 'Punting', lines: plain('team_punt_net_avg') },
    { title: 'Returns', lines: plain('team_kr_avg', 'team_pr_avg', 'team_st_tds') },
    { title: 'Field position', lines: plain('start_field_position') }
  ],
  situational: [
    {
      title: 'Drives',
      lines: plain(
        'points_per_drive',
        'def_points_per_drive',
        'td_drive_rate',
        'three_and_out_rate',
        'start_field_position'
      )
    },
    {
      title: 'Third and fourth down',
      lines: plain(
        'off_third_down_pct',
        'def_third_down_pct',
        'off_fourth_down_pct',
        'def_fourth_down_pct'
      )
    }
  ],
  tendencies: [
    {
      title: 'Play calling',
      lines: plain('proe', 'neutral_proe', 'neutral_pass_rate', 'neutral_pace', 'no_huddle_rate')
    },
    {
      title: 'Offensive looks',
      lines: plain(
        'shotgun_rate',
        'team_play_action_rate',
        'rpo_rate',
        'screen_rate',
        'motion_rate',
        'personnel_11_rate',
        'personnel_12_rate',
        'personnel_21_rate'
      )
    },
    {
      title: 'Defensive looks',
      lines: plain('def_blitz_rate', 'def_pass_rushers', 'def_man_rate', 'def_box')
    }
  ],
  forecast: [
    {
      title: 'Season odds',
      lines: plain(
        'proj_wins',
        'playoff_pct',
        'division_pct',
        'bye_pct',
        'conference_pct',
        'sb_pct'
      )
    },
    {
      title: 'Ratings',
      lines: plain('elo', 'srs', 'adj_net_epa', 'adj_recent_off_epa', 'adj_recent_def_epa')
    },
    {
      title: 'Schedule strength',
      lines: plain('sos_elo', 'sos_left_elo', 'sos_adj', 'sos_left_adj')
    },
    {
      title: 'Luck',
      lines: plain(
        'pythag_wins',
        'luck_wins',
        'elo_luck',
        'turnover_luck',
        'fumble_luck',
        'int_luck'
      )
    }
  ]
}

/** Every team in the league ranks: at most 40 rows a query covers 32 teams. */
const TEAM_ROWS = 40

/** Whole-league standings come with the Overview's ratings query. */
export const STANDING_METRICS = ['wins', 'losses', 'points_for', 'points_against']

/**
 * The queries a set of sections needs: one per split, over every team (a team's rank is among the
 * league's, so the query cannot filter the team), each metric once.
 */
export function sectionQueries(
  sections: readonly SectionDef[],
  scope: StatsScope,
  status: StatsStatus | null,
  extra: readonly string[] = []
): Map<SplitKey, StatsQuery> {
  const bySplit = new Map<SplitKey, string[]>()
  const add = (split: SplitKey, metric: string): void => {
    const ids = bySplit.get(split) ?? []
    if (!ids.includes(metric)) bySplit.set(split, [...ids, metric])
  }
  for (const id of extra) add('all', id)
  for (const s of sections) for (const l of s.lines) add(l.split ?? 'all', l.metric)
  return new Map(
    [...bySplit].map(([split, metrics]) => [split, teamQuery(metrics, split, scope, status)])
  )
}

/** One query over every team, under a split. */
export function teamQuery(
  metrics: string[],
  split: SplitKey,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  const situation = SPLITS[split].situation
  return {
    entity: 'team',
    metrics,
    scope: queryScope(scope, status),
    ...(situation ? { situation } : {}),
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: TEAM_ROWS
  }
}

/** A stat line as the dashboard writes it. */
export interface StatLine {
  key: string
  metric: string
  label: string
  info: MetricInfo | null
  value: string
  /** "4th of 32" ("highest" for a metric with no better side). */
  rank: string | null
  percentile: number | null
  heat: Heat
  /** The league's average, written like the value. */
  league: string | null
  title: string
  /** Why the line is empty for the season, if it is. */
  missing: string | null
}

export interface SectionView {
  title: string
  lines: StatLine[]
}

/** "Not published for 2026 yet." or "Charted from 2022." for a metric a season lacks. */
export function missingFor(
  column: StatsResultColumn | undefined,
  info: MetricInfo | undefined,
  season: number
): string | null {
  if (!column || column.seasons.length > 0) return null
  if (info && info.firstSeason > season) return `Charted from ${info.firstSeason}.`
  return `Not published for ${season} yet.`
}

/** A team's line from a result over every team: its value, rank among the teams, the league's mean. */
export function statLine(
  result: StatsResult | undefined,
  team: string,
  line: LineDef,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): StatLine {
  const info = byId.get(line.metric) ?? null
  const label = line.label ?? info?.label ?? line.metric
  const key = `${line.split ?? 'all'}:${line.metric}`
  const column = result?.columns.find((c) => c.id === line.metric)
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const v = result?.rows.find((r) => r.id === team)?.values[line.metric]
  const values = (result?.rows ?? [])
    .map((r) => r.values[line.metric]?.value ?? null)
    .filter((x): x is number => x !== null)
  const place = result ? teamRank(result, team, line.metric, info?.direction ?? 'neutral') : null
  let rank: string | null = null
  if (place) {
    const at = `${place.tied ? 'T-' : ''}${ordinal(place.rank)}`
    rank = info?.direction === 'neutral' ? `${at} highest` : `${at} of ${place.of}`
  }
  const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  return {
    key,
    metric: line.metric,
    label,
    info,
    value: fmtStat(v?.value ?? null, f),
    rank,
    percentile: place?.percentile ?? null,
    heat: place ? heatOf(place.percentile, info?.direction ?? 'neutral') : 'n',
    league: mean === null ? null : fmtStat(mean, f),
    title:
      v && info
        ? cellTitle(
            { ...v, percentile: place?.percentile ?? null, rank: place?.rank ?? null },
            info,
            null
          )
        : '',
    missing: missingFor(column, info ?? undefined, season)
  }
}

/**
 * A team's place among the teams that qualify for a metric: its rank (best first; highest first
 * for a metric with no better side), whether it shares it, and its percentile with ties at their
 * middle, so 30 teams tied at 0 special-teams touchdowns sit near the median, not at the bottom.
 */
export function teamRank(
  result: StatsResult,
  team: string,
  metric: string,
  direction: MetricInfo['direction']
): { rank: number; tied: boolean; of: number; percentile: number } | null {
  const pool = result.rows
    .map((r) => ({ id: r.id, v: r.values[metric] }))
    .filter((x) => x.v?.qualified && x.v.value !== null)
    .map((x) => ({ id: x.id, value: x.v!.value! }))
  const me = pool.find((x) => x.id === team)
  if (!me) return null
  const better = (a: number, b: number): boolean => (direction === 'lower' ? a < b : a > b)
  const above = pool.filter((x) => better(x.value, me.value)).length
  const below = pool.filter((x) => better(me.value, x.value)).length
  const ties = pool.length - 1 - above - below
  return {
    rank: above + 1,
    tied: ties > 0,
    of: pool.length,
    percentile: pool.length > 1 ? (100 * (below + ties / 2)) / (pool.length - 1) : 50
  }
}

/** Every section of a tab, read from the results of `sectionQueries`. */
export function sectionViews(
  sections: readonly SectionDef[],
  results: ReadonlyMap<SplitKey, StatsResult>,
  team: string,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): SectionView[] {
  return sections.map((s) => ({
    title: s.title,
    lines: s.lines.map((l) => statLine(results.get(l.split ?? 'all'), team, l, byId, season))
  }))
}

/** A game from the team's side. */
export interface TeamGame {
  gameId: string
  seasonType: 'REG' | 'POST'
  week: number
  /** The postseason round (WC, DIV, CONF, SB); null in the regular season. */
  round: string | null
  gameday: string | null
  opponent: string
  home: boolean
  neutral: boolean
  played: boolean
  pointsFor: number | null
  pointsAgainst: number | null
  result: 'W' | 'L' | 'T' | null
  /** The team's Elo win probability and expected margin; the market's, when there is one. */
  eloWinProb: number
  eloSpread: number
  vegasWinProb: number | null
  /** The team's expected margin by the betting line (positive: favored). */
  vegasSpread: number | null
  total: number | null
  opponentElo: number
  teamElo: number
  roof: string | null
  temp: number | null
  wind: number | null
}

/** One team's side of each of its games (the games read lists both teams of a game). */
export function teamGames(games: readonly GameForecast[], team: string): TeamGame[] {
  return games
    .filter((g) => g.home === team || g.away === team)
    .map((g): TeamGame => {
      const home = g.home === team
      const pf = home ? g.homeScore : g.awayScore
      const pa = home ? g.awayScore : g.homeScore
      const played = pf !== null && pa !== null
      const flip = (x: number | null): number | null => (x === null ? null : home ? x : -x)
      return {
        gameId: g.gameId,
        seasonType: g.seasonType,
        week: g.week,
        round: g.seasonType === 'POST' ? roundOf(g.season, g.week) : null,
        gameday: g.gameday,
        opponent: home ? g.away : g.home,
        home,
        neutral: g.neutral,
        played,
        pointsFor: pf,
        pointsAgainst: pa,
        result: !played ? null : pf > pa ? 'W' : pf < pa ? 'L' : 'T',
        eloWinProb: home ? g.homeWinProb : 1 - g.homeWinProb,
        eloSpread: home ? g.eloSpread : -g.eloSpread,
        vegasWinProb:
          g.vegasHomeWinProb === null ? null : home ? g.vegasHomeWinProb : 1 - g.vegasHomeWinProb,
        vegasSpread: flip(g.spread),
        total: g.total,
        opponentElo: home ? g.awayElo : g.homeElo,
        teamElo: home ? g.homeElo : g.awayElo,
        roof: g.roof,
        temp: g.temp,
        wind: g.wind
      }
    })
    .sort((a, b) => a.week - b.week)
}

/** The games a scope covers: its season type and, in the regular season, its weeks. */
export function gamesInScope(
  games: readonly TeamGame[],
  scope: StatsScope,
  status: StatsStatus | null
): TeamGame[] {
  if (scope.seasonType === 'POST') return games.filter((g) => g.seasonType === 'POST')
  if (scope.seasonType === 'ALL') return [...games]
  const [a, b] = weeksOf(scope, status)
  return games.filter((g) => g.seasonType === 'REG' && g.week >= a && g.week <= b)
}

/** The header's four tiles (handoff "8. Team"): record, points per game, allowed, margin. */
export interface TeamRecord {
  record: string
  pointsPerGame: string
  allowedPerGame: string
  margin: string
  /** The margin's tone. */
  tone: 'good' | 'bad' | 'even'
  played: number
}

export function teamRecord(games: readonly TeamGame[]): TeamRecord {
  const played = games.filter((g) => g.played)
  const n = played.length
  const count = (r: TeamGame['result']): number => played.filter((g) => g.result === r).length
  const [w, l, t] = [count('W'), count('L'), count('T')]
  const pf = played.reduce((s, g) => s + (g.pointsFor ?? 0), 0)
  const pa = played.reduce((s, g) => s + (g.pointsAgainst ?? 0), 0)
  const one = { unit: 'number' as const, decimals: 1 }
  const per = (x: number): string => (n ? fmtStat(x / n, one) : '—')
  const diff = n ? (pf - pa) / n : 0
  return {
    record: t ? `${w}–${l}–${t}` : `${w}–${l}`,
    pointsPerGame: per(pf),
    allowedPerGame: per(pa),
    margin: !n ? '—' : diff > 0 ? `+${fmtStat(diff, one)}` : fmtStat(diff, one),
    tone: !n || diff === 0 ? 'even' : diff > 0 ? 'good' : 'bad',
    played: n
  }
}

/** The results strip: one card per week of the range, byes included, the postseason after. */
export interface ResultCard {
  key: string
  week: string
  opponent: string
  /** "W 31–24"; null for a bye or a game not played yet. */
  score: string | null
  result: TeamGame['result']
}

export function resultCards(
  games: readonly TeamGame[],
  scope: StatsScope,
  status: StatsStatus | null
): ResultCard[] {
  const card = (g: TeamGame): ResultCard => ({
    key: g.gameId,
    week: g.round ?? `W${g.week}`,
    opponent: `${g.home || g.neutral ? '' : '@'}${g.opponent}`,
    score: g.played ? `${g.result} ${g.pointsFor}–${g.pointsAgainst}` : null,
    result: g.result
  })
  const inScope = gamesInScope(games, scope, status)
  if (scope.seasonType === 'POST') return inScope.map(card)
  const [a, b] = weeksOf(scope, status)
  const regular = new Map(
    inScope.filter((g) => g.seasonType === 'REG').map((g) => [g.week, g] as const)
  )
  const cards: ResultCard[] = []
  for (let w = a; w <= b; w++) {
    const g = regular.get(w)
    cards.push(
      g ? card(g) : { key: `bye${w}`, week: `W${w}`, opponent: 'BYE', score: null, result: null }
    )
  }
  if (scope.seasonType === 'ALL')
    cards.push(...inScope.filter((g) => g.seasonType === 'POST').map(card))
  return cards
}

/** nflverse numbers the postseason on from the regular season's last week. */
/** A postseason game's round: nflverse numbers it on from the season's last regular week. */
export function roundOf(season: number, week: number): string {
  const n = week - regularWeeks(season)
  return ['WC', 'DIV', 'CONF', 'SB'][n - 1] ?? `W${week}`
}

/** The team's next game, from every game of the season (not only the scope's). */
export function nextGame(games: readonly TeamGame[]): TeamGame | null {
  return games.find((g) => !g.played) ?? null
}

/** "Detroit is 61 % to win by Elo, 62 % by the market." in parts the card lays out. */
export interface NextGameView {
  opponent: string
  where: string
  when: string
  elo: { winProb: string; spread: string }
  vegas: { winProb: string; spread: string; total: string } | null
  /** Elo against the market, in points of win probability ("Elo is 3 points higher"). */
  gap: string | null
  weather: string | null
}

const pct0 = (x: number): string => `${Math.round(x * 100)}%`
const spreadText = (team: string, margin: number): string =>
  Math.abs(margin) < 0.25
    ? 'Pick’em'
    : `${team} ${margin > 0 ? '−' : '+'}${Math.abs(margin).toFixed(1)}`

export function nextGameView(g: TeamGame, team: string): NextGameView {
  const date = g.gameday
    ? new Date(`${g.gameday}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      })
    : null
  const week = g.round ?? `Week ${g.week}`
  const gap = g.vegasWinProb === null ? null : Math.round((g.eloWinProb - g.vegasWinProb) * 100)
  return {
    opponent: g.opponent,
    where: g.neutral ? 'Neutral site' : g.home ? 'Home' : 'Away',
    when: date ? `${week} · ${date}` : week,
    elo: { winProb: pct0(g.eloWinProb), spread: spreadText(team, g.eloSpread) },
    vegas:
      g.vegasWinProb === null || g.vegasSpread === null
        ? null
        : {
            winProb: pct0(g.vegasWinProb),
            spread: spreadText(team, g.vegasSpread),
            total: g.total === null ? '—' : g.total.toFixed(1)
          },
    gap:
      gap === null
        ? null
        : gap === 0
          ? 'Elo agrees with the market'
          : `Elo is ${Math.abs(gap)} point${Math.abs(gap) === 1 ? '' : 's'} ${gap > 0 ? 'higher' : 'lower'} than the market`,
    weather: weatherOf(g)
  }
}

export function weatherOf(g: Pick<TeamGame, 'roof' | 'temp' | 'wind'>): string | null {
  if (g.roof === 'dome' || g.roof === 'closed') return 'Indoors'
  const parts = [
    g.temp !== null ? `${Math.round(g.temp)}°F` : null,
    g.wind !== null ? `wind ${Math.round(g.wind)} mph` : null
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

/** "2nd in the NFC North", from every team's wins and losses in scope (ties broken by margin). */
export function standing(result: StatsResult | undefined, team: string): string | null {
  const division = divisionOf(team)
  if (!result || !division) return null
  const rows = DIVISIONS[division]
    .map((code) => result.rows.find((r) => r.id === code))
    .filter((r): r is StatsRow => r !== undefined)
  if (!rows.some((r) => r.id === team)) return null
  const v = (r: StatsRow, id: string): number => r.values[id]?.value ?? 0
  const pct = (r: StatsRow): number => {
    const g = v(r, 'wins') + v(r, 'losses')
    return g ? v(r, 'wins') / g : 0
  }
  const margin = (r: StatsRow): number => v(r, 'points_for') - v(r, 'points_against')
  const order = [...rows].sort((a, b) => pct(b) - pct(a) || margin(b) - margin(a))
  return `${ordinal(order.findIndex((r) => r.id === team) + 1)} in the ${division}`
}

/** The team the dashboard first opens on: my top fantasy scorer's, else the first. */
export function defaultTeam(topScorer: StatsResult | null): string {
  const team = topScorer?.rows.find((r) => r.team && STATS_TEAMS.includes(r.team))?.team
  return team ?? STATS_TEAMS[0]
}

/** My players' fantasy points: the best one's team opens first. Null without my roster. */
export function topScorerQuery(
  ownership: StatsOwnership | null,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery | null {
  const mine = Object.entries(ownership?.players ?? {})
    .filter(([, o]) => o.mine)
    .map(([id]) => id)
  if (!mine.length) return null
  return {
    entity: 'player',
    metrics: ['fantasy_points'],
    scope: { ...queryScope(scope, status), players: mine },
    sort: { metric: 'fantasy_points', dir: 'desc' },
    scoring: scope.scoring,
    limit: 1
  }
}

const SKILL = ['QB', 'RB', 'WR', 'TE'] as const

/** Handoff "8. Team": who gets the targets, the carries, who throws. One query of the team's players. */
export const ROSTER_METRICS = [
  'targets',
  'receptions',
  'rec_yds',
  'rec_td',
  'fantasy_ppg',
  'carries',
  'rush_yds',
  'rush_ypc',
  'rush_td',
  'pass_cmp',
  'pass_att',
  'pass_yds',
  'pass_td',
  'pass_int',
  'pass_ypa'
]

export function rosterQuery(
  team: string,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return {
    entity: 'player',
    metrics: ROSTER_METRICS,
    scope: { ...queryScope(scope, status), teams: [team], positions: [...SKILL] },
    sort: { metric: 'targets', dir: 'desc' },
    scoring: scope.scoring,
    limit: 100
  }
}

export interface ShareRow {
  id: string
  name: string
  position: string | null
  mine: boolean
  /** The share of the team's total, 0–1, and the bar's length against the team's leader (0–1). */
  share: number
  bar: number
  cells: string[]
}

const num = (r: StatsRow, id: string): number => r.values[id]?.value ?? 0
const n0 = (x: number): string => fmtStat(x, { unit: 'count', decimals: 0 })
const n1 = (x: number | null): string => fmtStat(x, { unit: 'number', decimals: 1 })

/** The top rows by a count, each with its share of the team's total (handoff: player ÷ team). */
function shareRows(
  rows: StatsRow[],
  count: string,
  limit: number,
  ownership: StatsOwnership | null,
  cells: (r: StatsRow) => string[]
): ShareRow[] {
  const total = rows.reduce((s, r) => s + num(r, count), 0)
  const top = rows
    .filter((r) => num(r, count) > 0)
    .sort((a, b) => num(b, count) - num(a, count))
    .slice(0, limit)
  const lead = top.length ? num(top[0], count) : 0
  return top.map((r) => ({
    id: r.id,
    name: r.name,
    position: r.position,
    mine: ownership?.players[r.id]?.mine === true,
    share: total > 0 ? num(r, count) / total : 0,
    bar: lead > 0 ? num(r, count) / lead : 0,
    cells: cells(r)
  }))
}

export interface RosterView {
  targets: ShareRow[]
  teamTargets: number
  carries: ShareRow[]
  teamCarries: number
  passers: { id: string; name: string; mine: boolean; cells: string[] }[]
}

/** The three tables of the handoff's team page, from `rosterQuery`'s answer. */
export function rosterView(result: StatsResult, ownership: StatsOwnership | null): RosterView {
  const rows = result.rows
  const total = (id: string): number => rows.reduce((s, r) => s + num(r, id), 0)
  return {
    targets: shareRows(rows, 'targets', 8, ownership, (r) => [
      n0(num(r, 'targets')),
      n0(num(r, 'receptions')),
      n0(num(r, 'rec_yds')),
      n0(num(r, 'rec_td')),
      n1(r.values.fantasy_ppg?.value ?? null)
    ]),
    teamTargets: total('targets'),
    carries: shareRows(rows, 'carries', 5, ownership, (r) => [
      n0(num(r, 'carries')),
      n0(num(r, 'rush_yds')),
      n1(r.values.rush_ypc?.value ?? null),
      n0(num(r, 'rush_td'))
    ]),
    teamCarries: total('carries'),
    passers: rows
      .filter((r) => num(r, 'pass_att') > 0)
      .sort((a, b) => num(b, 'pass_att') - num(a, 'pass_att'))
      .slice(0, 2)
      .map((r) => ({
        id: r.id,
        name: r.name,
        mine: ownership?.players[r.id]?.mine === true,
        cells: [
          `${n0(num(r, 'pass_cmp'))}/${n0(num(r, 'pass_att'))}`,
          n0(num(r, 'pass_yds')),
          n0(num(r, 'pass_td')),
          n0(num(r, 'pass_int')),
          n1(r.values.pass_ypa?.value ?? null)
        ]
      }))
  }
}

/** A weekly series for a chart: one value per week of the range, null for a bye or no data. */
export interface WeekSeries {
  id: string
  label: string
  points: { week: number; value: number | null }[]
}

/** The team's own weekly rows (a `groupBy: ['week']` query filtered to the team). */
export function weeklyQuery(
  team: string,
  metrics: string[],
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return {
    entity: 'team',
    metrics,
    scope: { ...queryScope(scope, status), teams: [team] },
    groupBy: ['week'],
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: 40
  }
}

/** The weeks a chart spans: the scope's regular-season weeks, or the weeks the rows have. */
export function chartWeeks(
  result: StatsResult | null,
  scope: StatsScope,
  status: StatsStatus | null
): number[] {
  if (scope.seasonType === 'REG') {
    const [a, b] = weeksOf(scope, status)
    return Array.from({ length: b - a + 1 }, (_, i) => a + i)
  }
  const weeks = (result?.rows ?? []).map((r) => Number(r.group.week)).filter(Number.isFinite)
  return [...new Set(weeks)].sort((a, b) => a - b)
}

export function weekSeries(
  result: StatsResult | null,
  metrics: string[],
  weeks: number[],
  byId: ReadonlyMap<string, MetricInfo>
): WeekSeries[] {
  const byWeek = new Map((result?.rows ?? []).map((r) => [Number(r.group.week), r] as const))
  return metrics.map((id) => ({
    id,
    label: byId.get(id)?.label ?? id,
    points: weeks.map((week) => ({ week, value: byWeek.get(week)?.values[id]?.value ?? null }))
  }))
}

/** Spec §9.3 Players: usage shares across the roster, by week. */
export const USAGE_METRICS: { id: string; label: string }[] = [
  { id: 'snap_share', label: 'Snaps' },
  { id: 'route_participation', label: 'Routes' },
  { id: 'target_share', label: 'Targets' },
  { id: 'carry_share', label: 'Carries' },
  { id: 'air_yards_share', label: 'Air yards' }
]

export function usageQuery(
  team: string,
  scope: StatsScope,
  status: StatsStatus | null,
  byWeek: boolean
): StatsQuery {
  return {
    entity: 'player',
    metrics: USAGE_METRICS.map((m) => m.id),
    scope: { ...queryScope(scope, status), teams: [team], positions: [...SKILL] },
    ...(byWeek ? { groupBy: ['week' as const] } : {}),
    sort: { metric: 'snap_share', dir: 'desc' },
    limit: 1000
  }
}

export interface UsageRow {
  id: string
  name: string
  position: string | null
  mine: boolean
  season: number | null
  estimated: boolean
  cells: (number | null)[]
}

/**
 * The usage grid: every skill player with a share of `metric` in range, highest first; a cell per
 * week (null: no game for him that week).
 */
export function usageGrid(
  season: StatsResult,
  weekly: StatsResult,
  metric: string,
  weeks: number[],
  ownership: StatsOwnership | null
): UsageRow[] {
  const cells = new Map<string, Map<number, number | null>>()
  for (const r of weekly.rows) {
    const m = cells.get(r.id) ?? new Map<number, number | null>()
    m.set(Number(r.group.week), r.values[metric]?.value ?? null)
    cells.set(r.id, m)
  }
  return season.rows
    .filter((r) => (r.values[metric]?.value ?? 0) > 0)
    .sort((a, b) => (b.values[metric]?.value ?? 0) - (a.values[metric]?.value ?? 0))
    .map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      mine: ownership?.players[r.id]?.mine === true,
      season: r.values[metric]?.value ?? null,
      estimated: r.values[metric]?.estimated === true,
      cells: weeks.map((w) => cells.get(r.id)?.get(w) ?? null)
    }))
}

/** Spec §9.3 Situational: the splits table's rows and metrics. */
export const SPLIT_ROWS: SplitKey[] = [
  'all',
  'redzone',
  'twoMinute',
  'leading',
  'close',
  'trailing',
  'q1',
  'q2',
  'q3',
  'q4'
]
export const SPLIT_METRICS = [
  'off_epa_play',
  'off_success_rate',
  'def_epa_play',
  'def_success_rate'
]

export function splitQueries(
  scope: StatsScope,
  status: StatsStatus | null
): Map<SplitKey, StatsQuery> {
  return new Map(SPLIT_ROWS.map((k) => [k, teamQuery(SPLIT_METRICS, k, scope, status)]))
}

export interface SplitCell {
  value: string
  rank: string | null
  heat: Heat
  title: string
}

export interface SplitRow {
  key: SplitKey
  label: string
  offPlays: string
  defPlays: string
  cells: SplitCell[]
}

export function splitRows(
  results: ReadonlyMap<SplitKey, StatsResult>,
  team: string,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): SplitRow[] {
  return SPLIT_ROWS.map((key) => {
    const r = results.get(key)
    const row = r?.rows.find((x) => x.id === team)
    const plays = (id: string): string => {
      const s = row?.values[id]?.sample
      return s == null ? '—' : n0(s)
    }
    return {
      key,
      label: SPLITS[key].label,
      offPlays: plays('off_epa_play'),
      defPlays: plays('def_epa_play'),
      cells: SPLIT_METRICS.map((metric) => {
        const l = statLine(r, team, { metric }, byId, season)
        return {
          value: l.value,
          rank: l.rank ? l.rank.replace(/ of \d+$/, '') : null,
          heat: l.heat,
          title: l.title
        }
      })
    }
  })
}

/** Personnel groupings (participation, through the prior season): the team's mix and results. */
export function personnelQuery(
  team: string,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return {
    entity: 'team',
    metrics: ['off_epa_play', 'off_success_rate'],
    scope: { ...queryScope(scope, status), teams: [team] },
    groupBy: ['personnel'],
    sort: { metric: 'off_epa_play', dir: 'desc' },
    limit: 40
  }
}

export interface PersonnelRow {
  personnel: string
  plays: number
  share: number
  epa: string
  success: string
}

export function personnelRows(result: StatsResult): PersonnelRow[] {
  const rows = result.rows
    .map((r) => ({ r, plays: r.values.off_epa_play?.sample ?? 0 }))
    .filter(({ r, plays }) => r.group.personnel != null && plays > 0)
  const total = rows.reduce((s, x) => s + x.plays, 0)
  return rows
    .sort((a, b) => b.plays - a.plays)
    .map(({ r, plays }) => ({
      personnel: String(r.group.personnel),
      plays,
      share: total ? plays / total : 0,
      epa: fmtStat(r.values.off_epa_play?.value ?? null, { unit: 'epa', decimals: 2 }),
      success: fmtStat(r.values.off_success_rate?.value ?? null, { unit: 'pct', decimals: 1 })
    }))
}

/** Spec §9.3 Special teams: the team's kickers and punters. */
export function specialistsQuery(
  team: string,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return {
    entity: 'player',
    metrics: [
      'fg_made',
      'fg_att',
      'fg_pct',
      'fg_pct_50p',
      'fgoe',
      'pat_pct',
      'punts',
      'punt_net_avg',
      'punt_in20_rate'
    ],
    scope: { ...queryScope(scope, status), teams: [team], positions: ['K', 'P'] },
    sort: { metric: 'fg_att', dir: 'desc' },
    scoring: scope.scoring,
    limit: 20
  }
}

/** Spec §9.3 Schedule: a game as the table lists it. */
export interface ScheduleRow {
  key: string
  week: string
  date: string
  opponent: string
  result: TeamGame['result']
  score: string
  /** The team's Elo win probability, and the market's. */
  elo: string
  vegas: string
  line: string
  /** The opponent's Elo before the game, and how it compares with the league (1500). */
  opponentElo: string
  strength: 'hard' | 'easy' | 'even'
  weather: string
}

export function scheduleRows(games: readonly TeamGame[], team: string): ScheduleRow[] {
  return games.map((g) => ({
    key: g.gameId,
    week: g.round ?? String(g.week),
    date: g.gameday
      ? new Date(`${g.gameday}T12:00:00`).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        })
      : '',
    opponent: `${g.neutral ? 'vs ' : g.home ? '' : '@ '}${g.opponent}`,
    result: g.result,
    score: g.played ? `${g.result} ${g.pointsFor}–${g.pointsAgainst}` : '',
    elo: pct0(g.eloWinProb),
    vegas: g.vegasWinProb === null ? '—' : pct0(g.vegasWinProb),
    line: g.vegasSpread === null ? '—' : spreadText(team, g.vegasSpread),
    opponentElo: String(Math.round(g.opponentElo)),
    strength: g.opponentElo >= 1550 ? 'hard' : g.opponentElo <= 1450 ? 'easy' : 'even',
    weather: weatherOf(g) ?? '—'
  }))
}
```

- [ ] **Step 4: Run the tests**

```bash
npx vitest run tests/renderer/lib/statsTeam.test.ts
```

Expected: PASS (19 passed). Then the typecheck, lint and full suite: clean; 955 passed | 5 skipped.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/src/lib/stats/team.ts tests/renderer/lib/statsTeam.test.ts
git add src/renderer/src/lib/stats/team.ts tests/renderer/lib/statsTeam.test.ts
git commit -m "feat(stats): model the team dashboard"
```

---

### Task 3: Stat lines and weekly charts (spec §9.3, §9.6; amendments B, F)

The pieces every tab is made of: a line with its percentile pill, a section, a weekly chart. Also the hooks that run a tab's queries together and read a team's games.

**Files:**

- Create: `src/renderer/src/components/stats/StatLines.tsx`, `src/renderer/src/components/stats/WeekChart.tsx`, `tests/renderer/components/StatsCharts.test.tsx`
- Modify: `src/renderer/src/lib/stats/useStats.ts`, `src/renderer/src/assets/main.css`

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/components/StatsCharts.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { PercentileBar, StatSection } from '@/components/stats/StatLines'
import { WeekChart } from '@/components/stats/WeekChart'
import type { SectionView } from '@/lib/stats/team'
import { catalogueMap } from '../../fixtures/statsScreens'

afterEach(cleanup)

const byId = catalogueMap()

describe('the dashboard’s stat lines and charts', () => {
  it('writes a line: label, value, percentile pill, rank and league; or why it is empty', () => {
    const section: SectionView = {
      title: 'Passing',
      lines: [
        {
          key: 'all:off_pass_epa',
          metric: 'off_pass_epa',
          label: 'EPA per dropback',
          info: byId.get('off_pass_epa')!,
          value: '+0.283',
          rank: '3rd of 32',
          percentile: 93.5,
          heat: 'h3',
          league: '+0.060',
          title: 'Rank 3',
          missing: null
        },
        {
          key: 'all:off_pressure_rate',
          metric: 'off_pressure_rate',
          label: 'Pressure rate',
          info: byId.get('off_pressure_rate')!,
          value: '—',
          rank: null,
          percentile: null,
          heat: 'n',
          league: null,
          title: '',
          missing: 'Not published for 2026 yet.'
        }
      ]
    }
    render(<StatSection section={section} />)
    expect(screen.getByRole('heading', { name: 'Passing' })).toBeTruthy()
    const line = screen.getByText('EPA per dropback').closest('[data-metric]')!
    expect(within(line as HTMLElement).getByText('+0.283')).toBeTruthy()
    expect(within(line as HTMLElement).getByText('94')).toBeTruthy()
    expect(within(line as HTMLElement).getByText('3rd of 32')).toBeTruthy()
    expect(within(line as HTMLElement).getByText('Lg +0.060')).toBeTruthy()
    expect(screen.getByText('Not published for 2026 yet.')).toBeTruthy()
  })

  it('places the percentile pill along the track', () => {
    render(<PercentileBar percentile={25} />)
    expect(screen.getByLabelText('25th percentile')).toBeTruthy()
    expect(screen.getByText('25').getAttribute('style')).toContain('calc(25% - 13px)')
  })

  it('charts weeks with gaps, a legend, end labels, and a hover listing each series', () => {
    render(
      <WeekChart
        label="Test chart"
        format={(v) => v.toFixed(1)}
        series={[
          {
            id: 'a',
            label: 'Offense',
            points: [
              { week: 1, value: 0.2 },
              { week: 2, value: null },
              { week: 3, value: 0.4 }
            ]
          },
          {
            id: 'b',
            label: 'Defense',
            points: [
              { week: 1, value: -0.1 },
              { week: 2, value: 0.1 },
              { week: 3, value: 0 }
            ]
          }
        ]}
      />
    )
    const chart = screen.getByRole('img', { name: 'Test chart' })
    // The bye splits the first line in two.
    expect(chart.querySelectorAll('path')[0].getAttribute('d')!.match(/M/g)).toHaveLength(2)
    expect(screen.getAllByText('Offense').length).toBeGreaterThan(0)
    // Each line ends with its last value.
    const ends = [...chart.querySelectorAll('text.fill-fg-2')].map((t) => t.textContent)
    expect(ends.sort()).toEqual(['0.0', '0.4'])
    fireEvent.mouseMove(chart, { clientX: 0 })
    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('Week 1')).toBeTruthy()
    expect(within(tip).getByText('-0.1')).toBeTruthy()
  })

  it('says so when the range has no games', () => {
    render(<WeekChart label="Empty" format={String} series={[]} />)
    expect(screen.getByText('No games in this range.')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/renderer/components/StatsCharts.test.tsx
```

Expected: FAIL. `@/components/stats/StatLines` and `@/components/stats/WeekChart` do not exist.

- [ ] **Step 3: The series colours and the hooks**

```diff
diff --git a/src/renderer/src/assets/main.css b/src/renderer/src/assets/main.css
index c4dd55a..c0a271f 100644
--- a/src/renderer/src/assets/main.css
+++ b/src/renderer/src/assets/main.css
@@ -119,6 +119,9 @@
   --l1: oklch(0.95 0.03 25);
   --l2: oklch(0.905 0.06 25);
   --l3: oklch(0.85 0.1 25);
+  /* Chart series (handoff --s1, --s2), validated for colour-blind separation. */
+  --s1: #1f5ed9;
+  --s2: #00897d;
 }

 .dark .stats {
@@ -143,6 +146,8 @@
   --l1: oklch(0.265 0.04 25);
   --l2: oklch(0.33 0.075 25);
   --l3: oklch(0.41 0.11 25);
+  --s1: #5d8ff2;
+  --s2: #26a092;
 }

 @theme inline {
@@ -180,6 +185,8 @@
   --color-cobalt: var(--cobalt);
   --color-on-cobalt: var(--on-cobalt);
   --color-cobalt-soft: var(--cobalt-soft);
+  --color-s1: var(--s1);
+  --color-s2: var(--s2);
   --color-h1: var(--h1);
   --color-h2: var(--h2);
   --color-h3: var(--h3);
```

```diff
diff --git a/src/renderer/src/lib/stats/useStats.ts b/src/renderer/src/lib/stats/useStats.ts
index 487643b..42cb867 100644
--- a/src/renderer/src/lib/stats/useStats.ts
+++ b/src/renderer/src/lib/stats/useStats.ts
@@ -2,6 +2,7 @@ import { useEffect, useMemo, useState } from 'react'
 import { api } from '@/lib/api'
 import { errorMessage } from '@/lib/format'
 import type {
+  GameForecast,
   MetricInfo,
   StatsOwnership,
   StatsQuery,
@@ -111,3 +112,62 @@ export function useStatsQuery(query: StatsQuery | null, version: number): QueryS
     error: current ? done.error : null
   }
 }
+
+/**
+ * Runs several queries at once (a dashboard tab), keyed: the answers come back together, or the
+ * first error. As `useStatsQuery`, a late answer for queries that have since changed is dropped.
+ */
+export function useStatsQueries<K extends string>(
+  queries: ReadonlyMap<K, StatsQuery> | null,
+  version: number
+): { results: Map<K, StatsResult> | null; loading: boolean; error: string | null } {
+  const key = queries ? `${version}|${JSON.stringify([...queries])}` : null
+  const [done, setDone] = useState<{
+    key: string
+    results: Map<K, StatsResult> | null
+    error: string | null
+  } | null>(null)
+  useEffect(() => {
+    if (!key) return
+    let cancelled = false
+    const entries = JSON.parse(key.slice(key.indexOf('|') + 1)) as [K, StatsQuery][]
+    Promise.all(entries.map(async ([k, q]) => [k, await api.stats.query(q)] as const))
+      .then((rs) => !cancelled && setDone({ key, results: new Map(rs), error: null }))
+      .catch((err) => !cancelled && setDone({ key, results: null, error: errorMessage(err) }))
+    return () => {
+      cancelled = true
+    }
+  }, [key])
+  const current = done !== null && done.key === key
+  return {
+    results: done?.results ?? null,
+    loading: key !== null && !current,
+    error: current ? done.error : null
+  }
+}
+
+/** A season's games for one team (spec §8.1), again after a rebuild. */
+export function useTeamGames(
+  season: number,
+  team: string,
+  version: number
+): { games: GameForecast[] | null; error: string | null } {
+  const key = `${version}|${season}|${team}`
+  const [done, setDone] = useState<{
+    key: string
+    games: GameForecast[] | null
+    error: string | null
+  } | null>(null)
+  useEffect(() => {
+    let cancelled = false
+    api.stats
+      .games({ season, team })
+      .then((games) => !cancelled && setDone({ key, games, error: null }))
+      .catch((err) => !cancelled && setDone({ key, games: null, error: errorMessage(err) }))
+    return () => {
+      cancelled = true
+    }
+  }, [key, season, team])
+  const current = done !== null && done.key === key
+  return { games: current ? done.games : null, error: current ? done.error : null }
+}
```

- [ ] **Step 4: The components**

Create `src/renderer/src/components/stats/StatLines.tsx`:

```tsx
import { MetricHover, ReliabilityMarker } from '@/components/stats/MetricCard'
import type { SectionView, StatLine } from '@/lib/stats/team'
import { cn } from '@/lib/utils'

/**
 * The handoff's heat scale (Stats Profile): green above the median, red below, stronger toward the
 * ends; a metric with no better side stays grey.
 */
function heatColor(p: number, neutral: boolean): string {
  if (neutral) return 'var(--fg-3)'
  const t = Math.min(1, Math.abs(p - 0.5) / 0.5)
  return p >= 0.5
    ? `oklch(${(0.66 - 0.06 * t).toFixed(3)} ${(0.02 + 0.13 * t).toFixed(3)} 150)`
    : `oklch(${(0.66 - 0.04 * t).toFixed(3)} ${(0.02 + 0.17 * t).toFixed(3)} 25)`
}

/** Handoff "Percentile rankings": a track, a fill to the percentile, the number in a pill. */
export function PercentileBar({
  percentile,
  neutral = false
}: {
  /** 0–100. */
  percentile: number
  neutral?: boolean
}): React.JSX.Element {
  const n = Math.round(percentile)
  const color = heatColor(n / 100, neutral)
  const strong = !neutral && Math.abs(n - 50) > 18
  return (
    <div className="relative h-[22px]" aria-label={`${n}th percentile`}>
      <div className="absolute inset-x-0 top-[10px] h-[2px] rounded-[1px] bg-line" />
      <div
        className="absolute left-0 top-[9px] h-1 rounded-[2px]"
        style={{ width: `${n}%`, background: color }}
      />
      <div
        className="absolute top-0 h-[22px] w-[26px] rounded-[11px] text-center font-mono text-[11px] leading-[22px] font-semibold shadow-[0_0_0_2px_var(--panel)]"
        style={{
          left: `calc(${n}% - 13px)`,
          background: color,
          color: strong || neutral ? '#fff' : 'var(--fg)'
        }}
      >
        {n}
      </div>
    </div>
  )
}

function Line({ line }: { line: StatLine }): React.JSX.Element {
  const label = (
    <span
      tabIndex={0}
      className={cn(
        'flex min-w-0 cursor-default items-center gap-1.5 text-[12.5px] text-fg-2 outline-none',
        line.missing && 'text-fg-3'
      )}
    >
      <span className="truncate">{line.label}</span>
      {line.info && <ReliabilityMarker info={line.info} />}
    </span>
  )
  const neutral = line.info?.direction === 'neutral'
  return (
    <div
      className="grid h-[34px] grid-cols-[minmax(150px,1fr)_76px_minmax(110px,150px)_88px] items-center gap-3.5 border-t border-line-2"
      data-metric={line.key}
    >
      {line.info ? (
        <MetricHover info={line.info} missing={line.missing}>
          {label}
        </MetricHover>
      ) : (
        label
      )}
      <span
        title={line.title || undefined}
        className={cn(
          'text-right font-mono text-[12.5px] font-medium tabular-nums',
          line.value === '—' && 'text-fg-3'
        )}
      >
        {line.value}
      </span>
      {line.percentile !== null ? (
        <>
          <div className="px-[13px]">
            <PercentileBar percentile={line.percentile} neutral={neutral} />
          </div>
          <span className="flex flex-col items-end gap-1 text-right leading-none whitespace-nowrap">
            <span className="text-[11.5px] text-fg-2">{line.rank ?? ''}</span>
            {line.league !== null && (
              <span className="font-mono text-[10.5px] text-fg-3">Lg {line.league}</span>
            )}
          </span>
        </>
      ) : (
        <span className="col-span-2 px-[13px] text-[11.5px] text-fg-3">
          {line.missing ?? (line.value !== '—' ? 'Below the qualifying sample' : '')}
        </span>
      )}
    </div>
  )
}

/** A titled list of stat lines (spec §9.3): value, percentile among the teams, rank, league mean. */
export function StatSection({ section }: { section: SectionView }): React.JSX.Element {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">
        {section.title}
      </h2>
      <div className="flex flex-col border-b border-line-2">
        {section.lines.map((l) => (
          <Line key={l.key} line={l} />
        ))}
      </div>
    </section>
  )
}

/** Sections in two columns. */
export function StatSections({ sections }: { sections: SectionView[] }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(520px,1fr))] items-start gap-x-10 gap-y-7">
      {sections.map((s) => (
        <StatSection key={s.title} section={s} />
      ))}
    </div>
  )
}
```

Create `src/renderer/src/components/stats/WeekChart.tsx`:

```tsx
import { useState } from 'react'
import type { WeekSeries } from '@/lib/stats/team'

/** Series colours, in a fixed order (handoff --s1, --s2). */
const COLORS = ['var(--s1)', 'var(--s2)']

/** Round tick steps: 1, 2, 2.5, 5 × a power of ten. */
function ticks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || 1
  const raw = span / n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step)
    out.push(Number(v.toFixed(6)))
  return out
}

/**
 * A weekly line chart (handoff Compare "Fantasy points by week"): one line per series, gaps for
 * byes, a zero line when the values cross it, a legend, end labels and a hover crosshair that
 * lists every series' value that week.
 */
export function WeekChart({
  series,
  format,
  domain,
  height = 200,
  label
}: {
  series: WeekSeries[]
  format: (v: number) => string
  /** A fixed y range (odds: [0, 1]); otherwise the values' own, padded. */
  domain?: [number, number]
  height?: number
  /** What the chart shows, for screen readers. */
  label: string
}): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const weeks = series[0]?.points.map((p) => p.week) ?? []
  const values = series.flatMap((s) => s.points.map((p) => p.value)).filter((v) => v !== null)
  if (!weeks.length || !values.length) {
    return (
      <div className="flex items-center justify-center text-[13px] text-fg-3" style={{ height }}>
        No games in this range.
      </div>
    )
  }
  const W = 720
  const H = height
  const [L, R, T, B, PX] = [44, 64, 12, 26, 14]
  let [lo, hi] = domain ?? [Math.min(...values, 0), Math.max(...values, 0)]
  if (!domain) {
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.08
    lo -= pad
    hi += pad
  }
  const ys = ticks(lo, hi)
  lo = Math.min(lo, ys[0])
  hi = Math.max(hi, ys[ys.length - 1])
  const x = (i: number): number =>
    weeks.length === 1 ? (L + W - R) / 2 : L + PX + (i / (weeks.length - 1)) * (W - L - R - PX * 2)
  const y = (v: number): number => T + (1 - (v - lo) / (hi - lo || 1)) * (H - T - B)

  // End labels: at each series' last value, nudged apart when they would overlap.
  const ends = series
    .map((s, k) => {
      const i = s.points.map((p) => p.value !== null).lastIndexOf(true)
      return i < 0 ? null : { k, i, y: y(s.points[i].value!), label: s.label }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.y - b.y)
  for (let j = 1; j < ends.length; j++)
    if (ends[j].y - ends[j - 1].y < 13) ends[j].y = ends[j - 1].y + 13

  const pick = (e: React.MouseEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - box.left) / (box.width || 1)) * W
    let best = 0
    weeks.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i
    })
    setHover(best)
  }

  return (
    <figure className="m-0 flex flex-col gap-2">
      {series.length > 1 && (
        <figcaption className="flex gap-4 text-[12px] text-fg-2">
          {series.map((s, k) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="h-[3px] w-3.5 rounded-[2px]" style={{ background: COLORS[k] }} />
              {s.label}
            </span>
          ))}
        </figcaption>
      )}
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={label}
          className="block overflow-visible"
          onMouseMove={pick}
          onMouseLeave={() => setHover(null)}
        >
          {ys.map((v) => (
            <g key={v}>
              <line
                x1={L}
                x2={W - R}
                y1={y(v)}
                y2={y(v)}
                stroke={v === 0 ? 'var(--fg-3)' : 'var(--line-2)'}
                strokeWidth={1}
              />
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
          {weeks.map((w, i) => (
            <text
              key={w}
              x={x(i)}
              y={H - 6}
              textAnchor="middle"
              className="fill-fg-3 font-mono text-[10.5px]"
            >
              {w}
            </text>
          ))}
          {hover !== null && (
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={T}
              y2={H - B}
              stroke="var(--fg-3)"
              strokeDasharray="3 3"
            />
          )}
          {series.map((s, k) => {
            let d = ''
            let pen = false
            s.points.forEach((p, i) => {
              if (p.value === null) {
                pen = false
                return
              }
              d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`
              pen = true
            })
            return (
              <g key={s.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={COLORS[k]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.points.map((p, i) =>
                  p.value === null ? null : (
                    <circle
                      key={p.week}
                      cx={x(i)}
                      cy={y(p.value)}
                      r={hover === i ? 5 : 3.5}
                      fill={COLORS[k]}
                      stroke="var(--panel)"
                      strokeWidth={2}
                    />
                  )
                )}
              </g>
            )
          })}
          {ends.map((e) => (
            <text
              key={e.k}
              x={x(e.i) + 9}
              y={e.y + 4}
              className="fill-fg-2 text-[11px] font-medium"
            >
              {format(series[e.k].points[e.i].value!)}
            </text>
          ))}
        </svg>
        {hover !== null && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-0 z-10 flex -translate-x-1/2 flex-col gap-1 rounded-[8px] bg-panel px-2.5 py-2 text-[11.5px] shadow-[0_0_0_1px_var(--line),0_6px_18px_var(--shadow-c)]"
            style={{ left: `${(x(hover) / W) * 100}%` }}
          >
            <span className="font-semibold">Week {weeks[hover]}</span>
            {series.map((s, k) => (
              <span key={s.id} className="flex items-center gap-1.5 whitespace-nowrap text-fg-2">
                <span className="size-2 rounded-[2px]" style={{ background: COLORS[k] }} />
                {s.label}
                <span className="ml-auto pl-2 font-mono text-fg">
                  {s.points[hover].value === null ? 'No game' : format(s.points[hover].value!)}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/renderer/components/StatsCharts.test.tsx
```

Expected: PASS (4 passed). Then the typecheck, lint and full suite: clean; 959 passed | 5 skipped.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/renderer/src/assets/main.css src/renderer/src/lib/stats/useStats.ts src/renderer/src/components/stats/StatLines.tsx src/renderer/src/components/stats/WeekChart.tsx tests/renderer/components/StatsCharts.test.tsx
git add src/renderer/src/assets/main.css src/renderer/src/lib/stats/useStats.ts src/renderer/src/components/stats/StatLines.tsx src/renderer/src/components/stats/WeekChart.tsx tests/renderer/components/StatsCharts.test.tsx
git commit -m "feat(stats): add stat lines and week charts"
```

---

### Task 4: The team dashboard (spec §9.3; amendments A–E)

The screen, and the ways in: the Teams nav item, a team row on the team leaderboard, a team row on a home board.

**Files:**

- Create: `src/renderer/src/screens/stats/StatsTeam.tsx`, `tests/renderer/components/StatsTeam.test.tsx`
- Modify: `src/renderer/src/screens/stats/StatsApp.tsx`, `src/renderer/src/components/stats/StatsNav.tsx`, `src/renderer/src/screens/stats/StatsLeaderboard.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/components/StatsTeam.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { StatsApp } from '@/screens/stats/StatsApp'
import type { StatsScope } from '@/lib/stats/scope'
import { api } from '@/lib/api'
import type { GameForecast, StatsOwnership, StatsQuery } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'
import { catalogue, result, row, STATUS, value } from '../../fixtures/statsScreens'

vi.mock('@/lib/api', () => ({
  api: {
    stats: {
      status: vi.fn(),
      catalogue: vi.fn(),
      query: vi.fn(),
      games: vi.fn(),
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

const OWNERSHIP: StatsOwnership = {
  players: { p1: { name: 'Cook Book', mine: true } },
  teams: { SEA: { name: 'Rival', mine: false } }
}

const TEAMS = ['SEA', 'ARI', 'LA', 'SF']

/** Teams: SEA leads every metric. Players: four SEA receivers; my top scorer plays for SEA. */
function answer(q: StatsQuery): ReturnType<typeof result> {
  const vals = (i: number): Parameters<typeof row>[2] =>
    Object.fromEntries(q.metrics.map((m) => [m, value(10 - i, { sample: 50 })]))
  if (q.entity === 'team') {
    const weeks = q.groupBy?.includes('week') ? [1, 2, 3] : [null]
    const rows = TEAMS.filter((t) => !q.scope.teams || q.scope.teams.includes(t)).flatMap((t, i) =>
      weeks.map((w) => ({
        ...row(t, t, vals(i), { team: t, position: null }),
        group: w === null ? {} : { week: w }
      }))
    )
    return result(q.metrics, rows)
  }
  if (q.scope.players) return result(q.metrics, [row('p1', 'Mine', vals(0), { team: 'SEA' })])
  const weeks = q.groupBy?.includes('week') ? [1, 2, 3] : [null]
  const rows = ['p0', 'p1', 'p2'].flatMap((id, i) =>
    weeks.map((w) => ({
      ...row(id, `Player ${i}`, vals(i), { team: 'SEA', position: 'WR' }),
      group: w === null ? {} : { week: w }
    }))
  )
  return result(q.metrics, rows)
}

function game(over: Partial<GameForecast>): GameForecast {
  return {
    gameId: 'g',
    season: 2026,
    seasonType: 'REG',
    week: 1,
    gameday: '2026-09-13',
    home: 'SEA',
    away: 'SF',
    neutral: false,
    homeScore: null,
    awayScore: null,
    homeElo: 1550,
    awayElo: 1500,
    homeWinProb: 0.6,
    eloSpread: 2,
    vegasHomeWinProb: 0.55,
    spread: 1.5,
    total: 44.5,
    roof: 'outdoors',
    temp: 60,
    wind: 5,
    ...over
  }
}

const GAMES = [
  game({ gameId: 'a', week: 1, homeScore: 27, awayScore: 20 }),
  game({ gameId: 'b', week: 2, home: 'LA', away: 'SEA', homeScore: 30, awayScore: 10 }),
  game({ gameId: 'c', week: 7, home: 'ARI', away: 'SEA', homeWinProb: 0.3 })
]

const IDLE: UpdateState = { status: 'idle' } as UpdateState

function Harness({ hasLeague }: { hasLeague: boolean }): React.JSX.Element {
  const [scope, setScope] = useState<StatsScope | null>(null)
  return (
    <StatsApp
      hasLeague={hasLeague}
      leagueKey={0}
      onOpenFantasy={() => {}}
      update={IDLE}
      version="0.29.0"
      onOpenUpdate={() => {}}
      onToggleTheme={() => {}}
      scope={scope}
      onScope={setScope}
    />
  )
}

const queries = (): StatsQuery[] => stats.query.mock.calls.map((c) => c[0])

async function openTeams(hasLeague = true): Promise<void> {
  render(<Harness hasLeague={hasLeague} />)
  await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(8))
  fireEvent.click(screen.getByRole('button', { name: 'Teams' }))
}

beforeEach(() => {
  vi.resetAllMocks()
  stats.status.mockResolvedValue(STATUS)
  stats.catalogue.mockResolvedValue(catalogue())
  stats.query.mockImplementation(async (q) => answer(q))
  stats.games.mockImplementation(async (q) =>
    GAMES.filter((g) => !q.team || g.home === q.team || g.away === q.team)
  )
  stats.ownership.mockResolvedValue(OWNERSHIP)
  stats.views.mockResolvedValue([])
  stats.onChanged.mockReturnValue(() => {})
})
afterEach(cleanup)

describe('the team dashboard (spec §9.3)', () => {
  it('opens Teams on my top scorer’s team: header, record, results, nine tabs', async () => {
    await openTeams()
    expect(await screen.findByRole('heading', { name: 'SEA' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Teams' }).getAttribute('aria-current')).toBe('page')
    // The top scorer was asked among my players.
    expect(queries().some((q) => q.scope.players?.join() === 'p1')).toBe(true)
    expect(
      await screen.findByText(/^Seattle Seahawks · \d\w+ in the NFC West · Weeks 1–6$/)
    ).toBeTruthy()
    expect(screen.getByText('Defense rostered by Rival')).toBeTruthy()
    expect(await screen.findByText('1–1')).toBeTruthy()
    expect(screen.getByText('−6.5')).toBeTruthy()
    const strip = screen.getByLabelText('Results')
    expect(within(strip).getByText('W 27–20')).toBeTruthy()
    expect(within(strip).getByText('@LA')).toBeTruthy()
    expect(within(strip).getAllByText('BYE')).toHaveLength(4)
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Overview',
      'Offense',
      'Defense',
      'Special teams',
      'Situational',
      'Tendencies',
      'Players',
      'Schedule',
      'Forecast'
    ])
  })

  it('shows who gets the ball, the ratings, the next game and the EPA trend', async () => {
    await openTeams()
    expect(await screen.findByText('Who gets the targets')).toBeTruthy()
    const roster = queries().find((q) => q.metrics.includes('targets'))!
    expect(roster.scope).toMatchObject({ teams: ['SEA'], positions: ['QB', 'RB', 'WR', 'TE'] })
    expect(screen.getAllByText('Player 0').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('On your fantasy team').length).toBeGreaterThan(0)
    // Ratings over every team: SEA leads.
    const ratings = queries().find((q) => q.metrics.includes('elo'))!
    expect(ratings.scope.teams).toBeUndefined()
    expect(await screen.findByText('Elo rating')).toBeTruthy()
    expect(screen.getAllByText('1st of 4').length).toBeGreaterThan(0)
    const next = screen.getByRole('region', { name: 'Next game' })
    expect(within(next).getByText('Next: @ ARI')).toBeTruthy()
    expect(within(next).getByText('70%')).toBeTruthy()
    const chart = await screen.findByRole('img', { name: 'SEA EPA per play by week' })
    // Hovering lists every series that week.
    fireEvent.mouseMove(chart, { clientX: 0 })
    const tip = screen.getByRole('tooltip')
    expect(within(tip).getByText('Week 1')).toBeTruthy()
    expect(within(tip).getByText('Offense')).toBeTruthy()
    expect(within(tip).getByText('Defense (allowed)')).toBeTruthy()
  })

  it('moves between teams with the arrows and the select', async () => {
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    fireEvent.click(screen.getByRole('button', { name: 'Previous team' }))
    expect(await screen.findByRole('heading', { name: 'PIT' })).toBeTruthy()
    await waitFor(() => expect(stats.games).toHaveBeenLastCalledWith({ season: 2026, team: 'PIT' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Team' }), { target: { value: 'LA' } })
    expect(await screen.findByRole('heading', { name: 'LA' })).toBeTruthy()
    expect(screen.getByText(/Los Angeles Rams/)).toBeTruthy()
  })

  it('reads each stat tab over every team, red zone and two-minute splits included', async () => {
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    fireEvent.click(screen.getByRole('tab', { name: 'Offense' }))
    expect(await screen.findByText('Red-zone EPA per play')).toBeTruthy()
    expect(queries().some((q) => q.situation?.fieldZone === 'redzone')).toBe(true)

    stats.query.mockClear()
    fireEvent.click(screen.getByRole('tab', { name: 'Situational' }))
    expect(await screen.findByText('Two-minute')).toBeTruthy()
    await waitFor(() => expect(stats.query).toHaveBeenCalledTimes(11))
    expect(queries().filter((q) => q.situation?.twoMinute)).toHaveLength(1)
    expect(queries().every((q) => q.entity === 'team' && !q.scope.teams)).toBe(true)

    fireEvent.click(screen.getByRole('tab', { name: 'Defense' }))
    expect(await screen.findByText('Fantasy points allowed')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Special teams' }))
    expect(await screen.findByText('Kickers')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Tendencies' }))
    expect(await screen.findByText('Personnel groupings')).toBeTruthy()
  })

  it('grids usage by week, and lists the schedule and the forecast', async () => {
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    fireEvent.click(screen.getByRole('tab', { name: 'Players' }))
    expect(await screen.findByText('Snap share by week')).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Targets' }))
    expect(screen.getByText('Target share by week')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Schedule' }))
    expect(await screen.findByText('2026 schedule')).toBeTruthy()
    expect(screen.getByText('@ LA')).toBeTruthy()
    expect(await screen.findByText('Schedule strength')).toBeTruthy()

    fireEvent.click(screen.getByRole('tab', { name: 'Forecast' }))
    expect(await screen.findByText('Season odds')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'SEA playoff and division odds by week' })).toBeTruthy()
    const weekly = queries().find((q) => q.metrics.includes('playoff_pct') && q.groupBy)!
    expect(weekly).toMatchObject({ scope: { teams: ['SEA'] }, groupBy: ['week'] })
  })

  it('opens from the team leaderboard and from the home’s team board', async () => {
    await openTeams()
    await screen.findByRole('heading', { name: 'SEA' })
    fireEvent.click(screen.getByRole('button', { name: 'Team leaderboards →' }))
    expect(
      await screen.findByRole('heading', { name: '2026 team offense leaderboard' })
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Teams' }).getAttribute('aria-current')).toBe('page')
    fireEvent.click(within(screen.getByRole('table')).getByText('SF'))
    expect(await screen.findByRole('heading', { name: 'SF' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Leaderboards' }))
    const board = (await screen.findByText('Takeaways')).closest('section')!
    fireEvent.click(await within(board).findByText('ARI'))
    expect(await screen.findByRole('heading', { name: 'ARI' })).toBeTruthy()
  })

  it('opens on the first team without a league', async () => {
    stats.ownership.mockResolvedValue(null)
    await openTeams(false)
    expect(await screen.findByRole('heading', { name: 'ARI' })).toBeTruthy()
    expect(queries().some((q) => q.scope.players)).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to see it fail**

```bash
npx vitest run tests/renderer/components/StatsTeam.test.tsx
```

Expected: FAIL. Teams still opens the team leaderboard, so there is no team heading.

- [ ] **Step 3: The screen**

Create `src/renderer/src/screens/stats/StatsTeam.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { MineDot, PosText, Segmented, StatsSelect } from '@/components/stats/controls'
import { ScopeBar } from '@/components/stats/ScopeBar'
import { StatSection, StatSections } from '@/components/stats/StatLines'
import { WeekChart } from '@/components/stats/WeekChart'
import { fmtStat } from '@/lib/stats/format'
import { rangeLabel, type StatsScope } from '@/lib/stats/scope'
import {
  chartWeeks,
  gamesInScope,
  nextGame,
  nextGameView,
  personnelQuery,
  personnelRows,
  resultCards,
  rosterQuery,
  rosterView,
  scheduleRows,
  sectionQueries,
  sectionViews,
  specialistsQuery,
  splitQueries,
  splitRows,
  standing,
  STANDING_METRICS,
  TAB_SECTIONS,
  TEAM_DASH_TABS,
  teamGames,
  teamRecord,
  usageGrid,
  usageQuery,
  USAGE_METRICS,
  weeklyQuery,
  weekSeries,
  type SectionDef,
  type SplitKey,
  type ShareRow,
  type TeamGame,
  type TeamTab
} from '@/lib/stats/team'
import { useStatsQueries, useStatsQuery, useTeamGames, type StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import { STATS_TEAMS, TEAM_NAMES } from '@shared/stats/nflTeams'
import type { MetricInfo, StatsResult } from '@shared/stats/types'

interface TabProps {
  data: StatsData
  scope: StatsScope
  team: string
  games: TeamGame[] | null
}

const HEAT_BG: Record<string, string> = {
  h3: 'bg-h3',
  h2: 'bg-h2',
  h1: 'bg-h1',
  n: '',
  l1: 'bg-l1',
  l2: 'bg-l2',
  l3: 'bg-l3'
}

/**
 * Spec §9.3 team dashboard: the handoff's team page ("8. Team") as its header and Overview, and
 * the spec's stat tabs in the same language.
 */
export function StatsTeam({
  data,
  scope,
  onScope,
  hasLeague,
  team,
  onTeam,
  tab,
  onTab,
  onOpenLeaderboard
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  team: string
  onTeam: (team: string) => void
  tab: TeamTab
  onTab: (tab: TeamTab) => void
  /** The team leaderboard (spec §9.2). */
  onOpenLeaderboard: () => void
}): React.JSX.Element {
  const { games: raw, error: gamesError } = useTeamGames(scope.season, team, data.version)
  const games = useMemo(() => (raw ? teamGames(raw, team) : null), [raw, team])
  // The standing needs every team's record: the Overview's ratings query carries it.
  const overview = useMemo(
    () => sectionQueries(TAB_SECTIONS.overview, scope, data.status, STANDING_METRICS),
    [scope, data.status]
  )
  const { results: ratings } = useStatsQueries(overview, data.version)
  const props: TabProps = { data, scope, team, games }

  return (
    <div className="flex flex-col gap-5 px-8 pt-[22px] pb-8">
      <Header
        data={data}
        scope={scope}
        onScope={onScope}
        hasLeague={hasLeague}
        team={team}
        onTeam={onTeam}
        games={games}
        place={scope.seasonType === 'REG' ? standing(ratings?.get('all'), team) : null}
      />
      <div className="flex items-end justify-between gap-4 border-b border-line">
        <div role="tablist" aria-label="Team dashboard" className="flex gap-[22px]">
          {TEAM_DASH_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              onClick={() => onTab(t.id)}
              className={cn(
                'h-8 cursor-pointer text-[13.5px] leading-none',
                t.id === tab
                  ? 'font-semibold text-fg shadow-[inset_0_-2px_0_var(--fg)]'
                  : 'font-medium text-fg-3 hover:text-fg'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onOpenLeaderboard}
          className="mb-2 cursor-pointer text-[12.5px] font-medium text-fg-2 hover:text-cobalt"
        >
          Team leaderboards →
        </button>
      </div>
      {gamesError && <div className="text-[12.5px] text-bad">{gamesError}</div>}
      {tab === 'overview' && <Overview {...props} ratings={ratings} />}
      {(tab === 'offense' || tab === 'defense' || tab === 'special' || tab === 'tendencies') && (
        <LinesTab {...props} sections={TAB_SECTIONS[tab]} tab={tab} />
      )}
      {tab === 'situational' && <Situational {...props} />}
      {tab === 'players' && <Players {...props} />}
      {tab === 'schedule' && <Schedule {...props} />}
      {tab === 'forecast' && <Forecast {...props} />}
    </div>
  )
}

function Header({
  data,
  scope,
  onScope,
  hasLeague,
  team,
  onTeam,
  games,
  place
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  team: string
  onTeam: (team: string) => void
  games: TeamGame[] | null
  place: string | null
}): React.JSX.Element {
  const inScope = games ? gamesInScope(games, scope, data.status) : []
  const rec = teamRecord(inScope)
  const cards = games ? resultCards(games, scope, data.status) : []
  const i = STATS_TEAMS.indexOf(team)
  const step = (d: number): void =>
    onTeam(STATS_TEAMS[(i + d + STATS_TEAMS.length) % STATS_TEAMS.length])
  const owner = data.ownership?.teams[team]
  const tiles: [string, string, string?][] = [
    ['Record', rec.record],
    ['Points / game', rec.pointsPerGame],
    ['Allowed / game', rec.allowedPerGame],
    ['Margin', rec.margin, rec.tone]
  ]
  return (
    <header className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2">
            <NavButton title="Previous team" onClick={() => step(-1)}>
              <ChevronLeft className="size-3.5" />
            </NavButton>
            <StatsSelect
              title="Team"
              value={team}
              options={STATS_TEAMS.map((t) => ({ value: t, label: t }))}
              onChange={onTeam}
              className="h-[26px] font-mono"
            />
            <NavButton title="Next team" onClick={() => step(1)}>
              <ChevronRight className="size-3.5" />
            </NavButton>
            <span className="ml-2 truncate text-[12.5px] text-fg-3">
              {TEAM_NAMES[team] ?? team}
              {place ? ` · ${place}` : ''} · {rangeLabel(scope, data.status)}
            </span>
            {owner && (
              <span className="flex items-center gap-1.5 text-[12px] text-fg-2">
                {owner.mine ? <MineDot title="Your fantasy defense" /> : null}
                {owner.mine ? 'Your defense' : `Defense rostered by ${owner.name}`}
              </span>
            )}
          </div>
          <div className="flex items-end gap-[22px]">
            <h1 className="m-0 font-sans text-[52px] leading-[0.85] font-bold tracking-[-0.04em]">
              {team}
            </h1>
            <div className="flex gap-px overflow-hidden rounded-[8px] bg-line shadow-[0_0_0_1px_var(--line)]">
              {tiles.map(([label, value, tone]) => (
                <div key={label} className="flex flex-col gap-[5px] bg-panel px-3.5 py-2">
                  <span className="text-[11px] leading-none font-medium text-fg-3">{label}</span>
                  <span
                    className={cn(
                      'font-cond text-[24px] leading-[0.9] font-extrabold tabular-nums',
                      tone === 'good' && 'text-good',
                      tone === 'bad' && 'text-bad'
                    )}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <ScopeBar scope={scope} status={data.status} hasLeague={hasLeague} onChange={onScope} />
      </div>
      {cards.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Results">
          {cards.map((c) => (
            <div
              key={c.key}
              className="flex w-[58px] shrink-0 flex-col items-center gap-1 rounded-[7px] bg-panel pt-[7px] pb-1.5 shadow-[0_0_0_1px_var(--line)]"
            >
              <span className="font-mono text-[10.5px] leading-none text-fg-3">{c.week}</span>
              <span
                className={cn(
                  'font-mono text-[12.5px] leading-none font-semibold',
                  c.opponent === 'BYE' && 'text-fg-3'
                )}
              >
                {c.opponent}
              </span>
              {c.score ? (
                <span
                  className={cn(
                    'rounded-[4px] px-[5px] py-0.5 font-mono text-[10.5px] leading-none font-semibold whitespace-nowrap',
                    c.result === 'W' && 'bg-good-s text-good',
                    c.result === 'L' && 'bg-bad-s text-bad',
                    c.result === 'T' && 'bg-panel-2'
                  )}
                >
                  {c.score}
                </span>
              ) : (
                <span className="font-mono text-[10.5px] leading-none text-fg-3">—</span>
              )}
            </div>
          ))}
        </div>
      )}
    </header>
  )
}

function NavButton({
  title,
  onClick,
  children
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="flex size-[26px] cursor-pointer items-center justify-center rounded-[6px] border border-line bg-panel text-fg-2 hover:bg-hover hover:text-fg"
    >
      {children}
    </button>
  )
}

function Loading({ error }: { error?: string | null }): React.JSX.Element {
  return error ? (
    <div className="py-12 text-center text-[13px] text-bad">{error}</div>
  ) : (
    <div className="py-12 text-center text-[13px] text-fg-3">Loading…</div>
  )
}

function SectionHead({ title, note }: { title: string; note?: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">{title}</h2>
      {note && <span className="text-[12px] leading-none text-fg-3">{note}</span>}
    </div>
  )
}

/** A small mono table in the handoff's style: a header under a rule, 38px rows. */
function MiniTable({
  columns,
  head,
  rows,
  left = [],
  className
}: {
  columns: string
  head: React.ReactNode[]
  rows: { key: string; cells: React.ReactNode[] }[]
  /** Columns read left to right (text); the first always is, numbers align right. */
  left?: number[]
  className?: string
}): React.JSX.Element {
  const align = (i: number): string => (i === 0 || left.includes(i) ? 'text-left' : 'text-right')
  return (
    <div
      className={cn('flex flex-col font-mono text-[12.5px] tabular-nums', className)}
      role="table"
    >
      <div
        role="row"
        className="grid h-7 items-end gap-x-3 border-b border-fg-3 pb-[7px] text-[11px] text-fg-3"
        style={{ gridTemplateColumns: columns }}
      >
        {head.map((h, i) => (
          <span key={i} role="columnheader" className={cn(align(i), i === 0 && 'font-sans')}>
            {h}
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div
          key={r.key}
          role="row"
          className="grid h-[38px] items-center gap-x-3 border-b border-line-2"
          style={{ gridTemplateColumns: columns }}
        >
          {r.cells.map((c, i) => (
            <span key={i} role="cell" className={cn('min-w-0', align(i))}>
              {c}
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}

function PlayerName({
  name,
  position,
  mine
}: {
  name: string
  position: string | null
  mine: boolean
}): React.JSX.Element {
  return (
    <span className="flex min-w-0 items-center gap-[7px] font-sans text-[13px] font-medium whitespace-nowrap">
      {position && (
        <span className="w-[22px] shrink-0">
          <PosText position={position} />
        </span>
      )}
      <span className="truncate">{name}</span>
      {mine && <MineDot />}
    </span>
  )
}

function ShareBar({ row }: { row: ShareRow }): React.JSX.Element {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-line-2">
        <span
          className="block h-full rounded-[3px] bg-cobalt"
          style={{ width: `${Math.max(2, Math.min(100, row.bar * 100))}%` }}
        />
      </span>
      <span className="w-8 text-right font-semibold">{Math.round(row.share * 100)}%</span>
    </span>
  )
}

/** Handoff "8. Team" tables, then the spec's Overview: ratings, the next game, the EPA trend. */
function Overview({
  data,
  scope,
  team,
  games,
  ratings
}: TabProps & { ratings: Map<SplitKey, StatsResult> | null }): React.JSX.Element {
  const q = useMemo(() => rosterQuery(team, scope, data.status), [team, scope, data.status])
  const { result, error } = useStatsQuery(q, data.version)
  const weekly = useMemo(
    () => weeklyQuery(team, ['off_epa_play', 'def_epa_play'], scope, data.status),
    [team, scope, data.status]
  )
  const { result: wk } = useStatsQuery(weekly, data.version)
  const v = result ? rosterView(result, data.ownership) : null
  const sections = ratings
    ? sectionViews(TAB_SECTIONS.overview, ratings, team, data.byId, scope.season)
    : null
  const weeks = chartWeeks(wk, scope, data.status)
  const series = weekSeries(wk, ['off_epa_play', 'def_epa_play'], weeks, data.byId)
  const next = games ? nextGame(games) : null
  return (
    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] items-start gap-9">
      <div className="flex flex-col gap-7">
        {!v ? (
          <Loading error={error} />
        ) : (
          <>
            <section className="flex flex-col gap-2.5">
              <SectionHead title="Who gets the targets" note={`${v.teamTargets} team targets`} />
              <MiniTable
                columns="minmax(0,1fr) 40px 150px 36px 44px 28px 44px"
                head={['Player', 'TGT', 'Share', 'REC', 'YDS', 'TD', 'FP/G']}
                rows={v.targets.map((r) => ({
                  key: r.id,
                  cells: [
                    <PlayerName key="n" name={r.name} position={r.position} mine={r.mine} />,
                    r.cells[0],
                    <ShareBar key="s" row={r} />,
                    <span key="r" className="text-fg-2">
                      {r.cells[1]}
                    </span>,
                    r.cells[2],
                    <span key="t" className="text-fg-2">
                      {r.cells[3]}
                    </span>,
                    <span key="f" className="font-cond text-[15px] font-bold">
                      {r.cells[4]}
                    </span>
                  ]
                }))}
              />
            </section>
            <section className="flex flex-col gap-2.5">
              <SectionHead title="Who gets the carries" note={`${v.teamCarries} team carries`} />
              <MiniTable
                columns="minmax(0,1fr) 36px 120px 44px 34px 26px"
                head={['Player', 'ATT', 'Share', 'YDS', 'Y/C', 'TD']}
                rows={v.carries.map((r) => ({
                  key: r.id,
                  cells: [
                    <PlayerName key="n" name={r.name} position={r.position} mine={r.mine} />,
                    r.cells[0],
                    <ShareBar key="s" row={r} />,
                    r.cells[1],
                    <span key="y" className="text-fg-2">
                      {r.cells[2]}
                    </span>,
                    <span key="t" className="text-fg-2">
                      {r.cells[3]}
                    </span>
                  ]
                }))}
              />
            </section>
            {v.passers.length > 0 && (
              <section className="flex flex-col gap-2.5">
                <SectionHead title="Passing" />
                <MiniTable
                  columns="minmax(0,1fr) 64px 48px 28px 28px 36px"
                  head={['Quarterback', 'C/A', 'YDS', 'TD', 'INT', 'Y/A']}
                  rows={v.passers.map((r) => ({
                    key: r.id,
                    cells: [
                      <PlayerName key="n" name={r.name} position={null} mine={r.mine} />,
                      ...r.cells
                    ]
                  }))}
                />
              </section>
            )}
          </>
        )}
      </div>
      <div className="flex flex-col gap-7">
        {next && <NextGame game={next} team={team} />}
        {sections && <StatSection section={sections[0]} />}
        <section className="flex flex-col gap-2.5">
          <SectionHead title="EPA per play by week" note="Offense, and allowed by the defense" />
          <WeekChart
            series={series.map((s) =>
              s.id === 'def_epa_play'
                ? { ...s, label: 'Defense (allowed)' }
                : { ...s, label: 'Offense' }
            )}
            format={(x) => fmtStat(x, { unit: 'epa', decimals: 2 })}
            label={`${team} EPA per play by week`}
          />
        </section>
      </div>
    </div>
  )
}

/** Spec §9.1 / §9.3: the next game, Elo beside the market. */
function NextGame({ game, team }: { game: TeamGame; team: string }): React.JSX.Element {
  const v = nextGameView(game, team)
  const cell = (label: string, value: string, sub?: string): React.JSX.Element => (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] leading-none font-medium text-fg-3">{label}</span>
      <span className="font-cond text-[26px] leading-[0.9] font-extrabold tabular-nums">
        {value}
      </span>
      {sub && <span className="font-mono text-[11px] leading-none text-fg-2">{sub}</span>}
    </div>
  )
  return (
    <section
      aria-label="Next game"
      className="flex flex-col gap-3 rounded-[10px] bg-panel p-4 shadow-[0_0_0_1px_var(--line)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">
          Next: {v.where === 'Away' ? '@' : 'vs'} {v.opponent}
        </h2>
        <span className="text-[12px] leading-none text-fg-3">
          {v.when} · {v.where}
          {v.weather ? ` · ${v.weather}` : ''}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {cell('Elo win probability', v.elo.winProb, v.elo.spread)}
        {v.vegas
          ? cell('Market', v.vegas.winProb, `${v.vegas.spread} · total ${v.vegas.total}`)
          : cell('Market', '—', 'No line yet')}
      </div>
      {v.gap && <span className="text-[12px] text-fg-3">{v.gap}.</span>}
    </section>
  )
}

/** Offense, Defense, Special teams, Tendencies: the tab's stat lines, and the tab's own table. */
function LinesTab({
  data,
  scope,
  team,
  sections,
  tab
}: TabProps & { sections: SectionDef[]; tab: TeamTab }): React.JSX.Element {
  const queries = useMemo(
    () => sectionQueries(sections, scope, data.status),
    [sections, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version)
  return (
    <div className="flex flex-col gap-8">
      {results ? (
        <StatSections sections={sectionViews(sections, results, team, data.byId, scope.season)} />
      ) : (
        <Loading error={error} />
      )}
      {tab === 'special' && <Specialists data={data} scope={scope} team={team} />}
      {tab === 'tendencies' && <Personnel data={data} scope={scope} team={team} />}
    </div>
  )
}

function Specialists({ data, scope, team }: Omit<TabProps, 'games'>): React.JSX.Element | null {
  const q = useMemo(() => specialistsQuery(team, scope, data.status), [team, scope, data.status])
  const { result } = useStatsQuery(q, data.version)
  if (!result) return null
  const f = (id: string, v: number | null | undefined): string => {
    const m = data.byId.get(id)
    return fmtStat(v ?? null, { unit: m?.unit ?? 'number', decimals: m?.decimals ?? 1 })
  }
  const kickers = result.rows.filter((r) => (r.values.fg_att?.value ?? 0) > 0)
  const punters = result.rows.filter((r) => (r.values.punts?.value ?? 0) > 0)
  const cells = (r: (typeof result.rows)[number], ids: string[]): string[] =>
    ids.map((id) => f(id, r.values[id]?.value))
  return (
    <div className="grid grid-cols-2 items-start gap-9">
      <section className="flex flex-col gap-2.5">
        <SectionHead title="Kickers" />
        <MiniTable
          columns="minmax(0,1fr) 56px 56px 56px 56px 56px"
          head={['Kicker', 'FG', 'FG %', '50+ %', 'FGOE', 'XP %']}
          rows={kickers.map((r) => ({
            key: r.id,
            cells: [
              <PlayerName key="n" name={r.name} position="K" mine={false} />,
              `${f('fg_made', r.values.fg_made?.value)}/${f('fg_att', r.values.fg_att?.value)}`,
              ...cells(r, ['fg_pct', 'fg_pct_50p', 'fgoe', 'pat_pct'])
            ]
          }))}
        />
      </section>
      <section className="flex flex-col gap-2.5">
        <SectionHead title="Punters" />
        <MiniTable
          columns="minmax(0,1fr) 56px 64px 64px"
          head={['Punter', 'Punts', 'Net avg', 'Inside 20']}
          rows={punters.map((r) => ({
            key: r.id,
            cells: [
              <PlayerName key="n" name={r.name} position="P" mine={false} />,
              ...cells(r, ['punts', 'punt_net_avg', 'punt_in20_rate'])
            ]
          }))}
        />
      </section>
    </div>
  )
}

function Personnel({ data, scope, team }: Omit<TabProps, 'games'>): React.JSX.Element | null {
  const q = useMemo(() => personnelQuery(team, scope, data.status), [team, scope, data.status])
  const { result } = useStatsQuery(q, data.version)
  if (!result) return null
  const rows = personnelRows(result)
  return (
    <section className="flex max-w-[640px] flex-col gap-2.5">
      <SectionHead title="Personnel groupings" note="Offense · RB and TE on the field" />
      {rows.length === 0 ? (
        <p className="m-0 text-[12.5px] text-fg-3">
          Personnel comes from participation data, published after the season.
        </p>
      ) : (
        <MiniTable
          columns="minmax(0,1fr) 56px 150px 64px 64px"
          head={['Personnel', 'Plays', 'Share', 'EPA/play', 'Success']}
          rows={rows.map((r) => ({
            key: r.personnel,
            cells: [
              <span key="p" className="font-mono font-semibold">
                {r.personnel}
              </span>,
              fmtStat(r.plays, { unit: 'count', decimals: 0 }),
              <ShareBar
                key="s"
                row={{
                  id: r.personnel,
                  name: r.personnel,
                  position: null,
                  mine: false,
                  share: r.share,
                  bar: r.share / (rows[0].share || 1),
                  cells: []
                }}
              />,
              r.epa,
              r.success
            ]
          }))}
        />
      )}
    </section>
  )
}

/** Spec §9.3 Situational: drives and downs, then a table of splits. */
function Situational({ data, scope, team }: TabProps): React.JSX.Element {
  const sections = TAB_SECTIONS.situational
  const lineQueries = useMemo(
    () => sectionQueries(sections, scope, data.status),
    [sections, scope, data.status]
  )
  const { results: lines, error } = useStatsQueries(lineQueries, data.version)
  const sq = useMemo(() => splitQueries(scope, data.status), [scope, data.status])
  const { results: splits, error: splitError } = useStatsQueries(sq, data.version)
  const heads = ['EPA/play', 'Success', 'EPA/play allowed', 'Success allowed']
  return (
    <div className="flex flex-col gap-8">
      {lines ? (
        <StatSections sections={sectionViews(sections, lines, team, data.byId, scope.season)} />
      ) : (
        <Loading error={error} />
      )}
      <section className="flex flex-col gap-2.5">
        <SectionHead
          title="By situation"
          note="Rank among the 32 teams in the same situation · two-minute: the last two minutes of each half"
        />
        {splits ? (
          <MiniTable
            columns="minmax(0,1fr) 64px 104px 92px 64px 104px 104px"
            head={[
              'Situation',
              'Off. plays',
              ...heads.slice(0, 2),
              'Def. plays',
              ...heads.slice(2)
            ]}
            rows={splitRows(splits, team, data.byId, scope.season).map((r) => {
              const cell = (k: number): React.JSX.Element => {
                const c = r.cells[k]
                return (
                  <span
                    key={k}
                    title={c.title || undefined}
                    className={cn('-my-1 block rounded-[4px] px-1.5 py-1', HEAT_BG[c.heat])}
                  >
                    {c.value}
                    {c.rank && <span className="ml-1.5 text-[10.5px] text-fg-3">{c.rank}</span>}
                  </span>
                )
              }
              return {
                key: r.key,
                cells: [
                  <span key="l" className="font-sans text-[13px] font-medium">
                    {r.label}
                  </span>,
                  <span key="o" className="text-fg-2">
                    {r.offPlays}
                  </span>,
                  cell(0),
                  cell(1),
                  <span key="d" className="text-fg-2">
                    {r.defPlays}
                  </span>,
                  cell(2),
                  cell(3)
                ]
              }
            })}
          />
        ) : (
          <Loading error={splitError} />
        )}
      </section>
    </div>
  )
}

/** Spec §9.3 Players: usage shares across the roster, week by week. */
function Players({ data, scope, team }: TabProps): React.JSX.Element {
  const [metric, setMetric] = useState(USAGE_METRICS[0].id)
  const queries = useMemo(
    () =>
      new Map([
        ['season', usageQuery(team, scope, data.status, false)],
        ['weekly', usageQuery(team, scope, data.status, true)]
      ]),
    [team, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version)
  if (!results) return <Loading error={error} />
  const weekly = results.get('weekly')!
  const weeks = chartWeeks(weekly, scope, data.status)
  const rows = usageGrid(results.get('season')!, weekly, metric, weeks, data.ownership)
  const info: MetricInfo | undefined = data.byId.get(metric)
  const pct = (v: number | null): string =>
    v === null ? '' : fmtStat(v, { unit: 'pct', decimals: 0 })
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <SectionHead
          title={`${info?.label ?? metric} by week`}
          note={rows.some((r) => r.estimated) ? 'est.: routes estimated this season' : undefined}
        />
        <Segmented
          label="Usage"
          value={metric}
          options={USAGE_METRICS.map((m) => ({ value: m.id, label: m.label }))}
          onChange={setMetric}
        />
      </div>
      <div className="overflow-x-auto rounded-[8px] border border-line bg-panel">
        <table className="w-full border-collapse font-mono text-[12px] tabular-nums">
          <thead>
            <tr className="h-8 border-b border-line text-[11px] text-fg-3">
              <th className="sticky left-0 bg-panel px-3 text-left font-sans font-medium">
                Player
              </th>
              <th className="px-2 text-right font-medium">Range</th>
              {weeks.map((w) => (
                <th key={w} className="min-w-[44px] px-1 text-center font-medium">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="h-[34px] border-b border-line-2">
                <td className="sticky left-0 bg-panel px-3">
                  <PlayerName name={r.name} position={r.position} mine={r.mine} />
                </td>
                <td className="px-2 text-right font-semibold">
                  {pct(r.season)}
                  {r.estimated && <span className="ml-1 text-[10px] text-fg-3">est.</span>}
                </td>
                {r.cells.map((c, i) => (
                  <td key={weeks[i]} className="p-0.5 text-center">
                    <span
                      className="block rounded-[4px] py-1"
                      style={
                        c === null
                          ? undefined
                          : {
                              background: `color-mix(in oklch, var(--cobalt) ${Math.round(Math.min(1, c) * 38)}%, transparent)`
                            }
                      }
                    >
                      {c === null ? <span className="text-fg-3">·</span> : pct(c)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="py-10 text-center text-[13px] text-fg-3">No player has a share.</div>
        )}
      </div>
    </section>
  )
}

/** Spec §9.3 Schedule: every game with its result, line, Elo probability and weather. */
function Schedule({ data, scope, team, games }: TabProps): React.JSX.Element {
  const sections: SectionDef[] = useMemo(
    () => [TAB_SECTIONS.forecast.find((s) => s.title === 'Schedule strength')!],
    []
  )
  const queries = useMemo(
    () => sectionQueries(sections, scope, data.status),
    [sections, scope, data.status]
  )
  const { results } = useStatsQueries(queries, data.version)
  if (!games) return <Loading />
  const rows = scheduleRows(games, team)
  return (
    <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-9">
      <section className="flex flex-col gap-2.5">
        <SectionHead
          title={`${scope.season} schedule`}
          note="Win probability for this team · opponent Elo before the game"
        />
        <MiniTable
          columns="40px 52px minmax(0,1fr) 82px 52px 52px 76px 64px minmax(0,1fr)"
          head={[
            'Wk',
            'Date',
            'Opponent',
            'Result',
            'Elo',
            'Market',
            'Line',
            'Opp. Elo',
            'Weather'
          ]}
          rows={rows.map((r) => ({
            key: r.key,
            cells: [
              <span key="w" className="text-fg-3">
                {r.week}
              </span>,
              <span key="d" className="text-fg-2">
                {r.date}
              </span>,
              <span key="o" className="font-semibold">
                {r.opponent}
              </span>,
              r.score ? (
                <span
                  key="s"
                  className={cn(
                    'rounded-[4px] px-[5px] py-0.5 text-[11px] font-semibold whitespace-nowrap',
                    r.result === 'W' && 'bg-good-s text-good',
                    r.result === 'L' && 'bg-bad-s text-bad',
                    r.result === 'T' && 'bg-panel-2'
                  )}
                >
                  {r.score}
                </span>
              ) : (
                <span key="s" className="text-fg-3">
                  —
                </span>
              ),
              r.elo,
              r.vegas,
              <span key="l" className="text-fg-2">
                {r.line}
              </span>,
              <span
                key="e"
                className={cn(
                  r.strength === 'hard' && 'text-bad',
                  r.strength === 'easy' && 'text-good'
                )}
              >
                {r.opponentElo}
              </span>,
              <span key="x" className="truncate text-fg-2">
                {r.weather}
              </span>
            ]
          }))}
        />
      </section>
      {results && (
        <StatSection section={sectionViews(sections, results, team, data.byId, scope.season)[0]} />
      )}
    </div>
  )
}

/** The Forecast's two charts: the odds, and adjusted EPA, week by week. */
const FORECAST_WEEKLY = ['playoff_pct', 'division_pct', 'adj_off_epa', 'adj_def_epa']

/** Spec §9.3 Forecast: the next game, the season's odds and how they moved, ratings and luck. */
function Forecast({ data, scope, team, games }: TabProps): React.JSX.Element {
  const sections = TAB_SECTIONS.forecast
  const queries = useMemo(
    () => sectionQueries(sections, scope, data.status),
    [sections, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version)
  const weekly = useMemo(
    () => weeklyQuery(team, FORECAST_WEEKLY, scope, data.status),
    [team, scope, data.status]
  )
  const { result: wk } = useStatsQuery(weekly, data.version)
  const weeks = chartWeeks(wk, scope, data.status)
  const series = weekSeries(wk, FORECAST_WEEKLY, weeks, data.byId)
  const next = games ? nextGame(games) : null
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-9">
        <section className="flex flex-col gap-2.5">
          <SectionHead
            title="Playoff and division odds by week"
            note="Season simulation, as of each week"
          />
          <WeekChart
            series={series.slice(0, 2).map((s, k) => ({
              ...s,
              label: k === 0 ? 'Playoffs' : 'Division'
            }))}
            domain={[0, 1]}
            format={(x) => fmtStat(x, { unit: 'pct', decimals: 0 })}
            label={`${team} playoff and division odds by week`}
          />
        </section>
        <section className="flex flex-col gap-2.5">
          <SectionHead
            title="Adjusted EPA per play by week"
            note="Opponent-adjusted, as of each week"
          />
          <WeekChart
            series={series.slice(2).map((s, k) => ({
              ...s,
              label: k === 0 ? 'Offense' : 'Defense (allowed)'
            }))}
            format={(x) => fmtStat(x, { unit: 'epa', decimals: 2 })}
            label={`${team} adjusted EPA per play by week`}
          />
        </section>
      </div>
      {next && (
        <div className="max-w-[560px]">
          <NextGame game={next} team={team} />
        </div>
      )}
      {results ? (
        <StatSections sections={sectionViews(sections, results, team, data.byId, scope.season)} />
      ) : (
        <Loading error={error} />
      )}
    </div>
  )
}
```

- [ ] **Step 4: The ways in**

```diff
diff --git a/src/renderer/src/components/stats/StatsNav.tsx b/src/renderer/src/components/stats/StatsNav.tsx
index e57cb70..a3f854a 100644
--- a/src/renderer/src/components/stats/StatsNav.tsx
+++ b/src/renderer/src/components/stats/StatsNav.tsx
@@ -5,12 +5,13 @@ import { cn } from '@/lib/utils'
 import type { StatsStatus } from '@shared/stats/types'
 import type { UpdateState } from '@shared/types'

-export type StatsScreen = 'home' | 'players' | 'teams' | 'glossary'
+/** `team` is the team dashboard (spec §9.3), `teams` the team leaderboard. */
+export type StatsScreen = 'home' | 'players' | 'team' | 'teams' | 'glossary'

 const ITEMS: { id: StatsScreen | 'games'; label: string }[] = [
   { id: 'home', label: 'Leaderboards' },
   { id: 'players', label: 'Players' },
-  { id: 'teams', label: 'Teams' },
+  { id: 'team', label: 'Teams' },
   { id: 'games', label: 'Games' },
   { id: 'glossary', label: 'Glossary' }
 ]
@@ -27,7 +28,10 @@ interface StatsNavProps {
   onToggleTheme: () => void
 }

-/** Stats nav (handoff "Stats nav"): 52px, mark + "Companion Stats", five items, Fantasy ↗, theme. */
+/**
+ * Stats nav (handoff "Stats nav"): 52px, mark + "Companion Stats", five items, Fantasy ↗, theme.
+ * Teams opens the team dashboard.
+ */
 export function StatsNav({
   current,
   onNavigate,
@@ -53,17 +57,19 @@ export function StatsNav({
       <div className="flex gap-[22px] self-stretch text-[13.5px] leading-none font-medium">
         {ITEMS.map(({ id, label }) => {
           const soon = id === 'games'
+          // Teams opens the dashboard; the team leaderboard is under it.
+          const on = current === id || (id === 'team' && current === 'teams')
           return (
             <button
               key={id}
               type="button"
               disabled={soon}
               title={soon ? 'Game previews come in a later update' : undefined}
-              aria-current={current === id ? 'page' : undefined}
+              aria-current={on ? 'page' : undefined}
               onClick={() => !soon && onNavigate(id)}
               className={cn(
                 'flex cursor-pointer items-center disabled:cursor-default disabled:opacity-40',
-                current === id
+                on
                   ? 'text-fg shadow-[inset_0_-2px_0_var(--cobalt)]'
                   : 'text-fg-2 hover:text-fg disabled:hover:text-fg-2'
               )}
```

```diff
diff --git a/src/renderer/src/screens/stats/StatsLeaderboard.tsx b/src/renderer/src/screens/stats/StatsLeaderboard.tsx
index 86510ff..ce85fb3 100644
--- a/src/renderer/src/screens/stats/StatsLeaderboard.tsx
+++ b/src/renderer/src/screens/stats/StatsLeaderboard.tsx
@@ -81,7 +81,8 @@ export function StatsLeaderboard({
   views,
   onSaveView,
   onDeleteView,
-  onOpenView
+  onOpenView,
+  onOpenTeam
 }: {
   entity: Entity
   data: StatsData
@@ -93,6 +94,8 @@ export function StatsLeaderboard({
   onSaveView: (name: string, board: LeaderboardBoard) => Promise<void>
   onDeleteView: (view: StatsView) => Promise<void>
   onOpenView: (view: StatsView) => void
+  /** A team row opens the team dashboard (spec §9.3). */
+  onOpenTeam?: (team: string) => void
 }): React.JSX.Element {
   // The board on screen: the one opened (until the user changes it), else the default tab's.
   const [own, setOwn] = useState<{ nonce: number | null; board: LeaderboardBoard } | null>(null)
@@ -344,7 +347,11 @@ export function StatsLeaderboard({
             ownership={data.ownership}
             season={scope.season}
             selected={selected}
-            onSelect={(id) => setPicked({ nonce: opened?.nonce ?? null, id })}
+            onSelect={(id) =>
+              entity === 'team' && onOpenTeam
+                ? onOpenTeam(id)
+                : setPicked({ nonce: opened?.nonce ?? null, id })
+            }
             onSort={sortBy}
           />
         )}
```

```diff
diff --git a/src/renderer/src/screens/stats/StatsApp.tsx b/src/renderer/src/screens/stats/StatsApp.tsx
index 149ce9e..4596ad5 100644
--- a/src/renderer/src/screens/stats/StatsApp.tsx
+++ b/src/renderer/src/screens/stats/StatsApp.tsx
@@ -5,10 +5,12 @@ import { errorMessage } from '@/lib/format'
 import type { BoardDef } from '@/lib/stats/boards'
 import { bestFirst, defaultBoard, normalizeBoard } from '@/lib/stats/leaderboard'
 import { defaultScope, type StatsScope } from '@/lib/stats/scope'
-import { useStatsData } from '@/lib/stats/useStats'
+import { defaultTeam, topScorerQuery, type TeamTab } from '@/lib/stats/team'
+import { useStatsData, useStatsQuery } from '@/lib/stats/useStats'
 import { StatsGlossary } from '@/screens/stats/StatsGlossary'
 import { StatsHome } from '@/screens/stats/StatsHome'
 import { StatsLeaderboard, type LeaderboardOpen } from '@/screens/stats/StatsLeaderboard'
+import { StatsTeam } from '@/screens/stats/StatsTeam'
 import type { LeaderboardBoard, StatsView } from '@shared/stats/types'
 import type { UpdateState } from '@shared/types'

@@ -47,6 +49,9 @@ export function StatsApp({
   const [open, setOpen] = useState<LeaderboardOpen | null>(null)
   const [views, setViews] = useState<StatsView[]>([])
   const [viewsError, setViewsError] = useState<string | null>(null)
+  // The team dashboard (spec §9.3): the team chosen this session, else my top scorer's.
+  const [team, setTeam] = useState<string | null>(null)
+  const [teamTab, setTeamTab] = useState<TeamTab>('overview')

   useEffect(() => {
     void api.stats
@@ -59,12 +64,29 @@ export function StatsApp({
   const effective: StatsScope =
     scope.scoring === 'league' && !hasLeague ? { ...scope, scoring: 'ppr' } : scope

+  // The query hook keys on the query's text, so a new object each render runs nothing again.
+  const topQuery =
+    team === null && screen === 'team'
+      ? topScorerQuery(data.ownership, effective, data.status)
+      : null
+  const top = useStatsQuery(topQuery, data.version)
+  // With a roster, wait for my top scorer before choosing (no flash of the first team).
+  const shownTeam = team ?? (topQuery && top.loading ? null : defaultTeam(top.result))
+  const openTeam = (code: string): void => {
+    setTeam(code)
+    setScreen('team')
+  }
+
   const openBoard = (board: LeaderboardBoard, selected: string | null): void => {
     setOpen((o) => ({ board, selected, nonce: (o?.nonce ?? 0) + 1 }))
     setScreen(board.entity === 'player' ? 'players' : 'teams')
   }
   const openFromHome = (b: BoardDef, rowId: string | null, perGame: boolean): void => {
     const entity = b.position ? 'player' : 'team'
+    if (entity === 'team' && rowId) {
+      openTeam(rowId)
+      return
+    }
     const base = defaultBoard(entity, b.tab, data.byId)
     const columns = base.columns.includes(b.metric) ? base.columns : [b.metric, ...base.columns]
     openBoard(
@@ -136,8 +158,25 @@ export function StatsApp({
                 onSaveView={saveView}
                 onDeleteView={deleteView}
                 onOpenView={openView}
+                onOpenTeam={openTeam}
               />
             )}
+            {screen === 'team' &&
+              (shownTeam ? (
+                <StatsTeam
+                  data={data}
+                  scope={effective}
+                  onScope={setChosen}
+                  hasLeague={hasLeague}
+                  team={shownTeam}
+                  onTeam={setTeam}
+                  tab={teamTab}
+                  onTab={setTeamTab}
+                  onOpenLeaderboard={() => setScreen('teams')}
+                />
+              ) : (
+                <div className="py-20 text-center text-[13px] text-fg-3">Loading…</div>
+              ))}
             {screen === 'glossary' && <StatsGlossary catalogue={data.catalogue} />}
             {viewsError && <div className="px-8 pb-4 text-[12px] text-bad">{viewsError}</div>}
           </>
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/renderer/components/StatsTeam.test.tsx tests/renderer/components/StatsApp.test.tsx
```

Expected: PASS (14 passed: the dashboard's 7 and AA's 7, unchanged). Then the typecheck, lint and full suite: clean; 966 passed | 5 skipped.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/renderer/src/screens/stats/StatsTeam.tsx src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/screens/stats/StatsLeaderboard.tsx tests/renderer/components/StatsTeam.test.tsx
git add src/renderer/src/screens/stats/StatsTeam.tsx src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/screens/stats/StatsLeaderboard.tsx tests/renderer/components/StatsTeam.test.tsx
git commit -m "feat(stats): add the team dashboard"
```

---

### Task 5: Docs

**Files:**

- Modify: `docs/reference/stats-screens.md`, `docs/reference/stats-database.md`, `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`

- [ ] **Step 1: The screens reference**

```diff
diff --git a/docs/reference/stats-screens.md b/docs/reference/stats-screens.md
index 5ba1de2..bf69b2f 100644
--- a/docs/reference/stats-screens.md
+++ b/docs/reference/stats-screens.md
@@ -1,10 +1,10 @@
 # Stats screens — reference

-Added in v0.28.0 (Plan AA; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.1–§9.2, amended in §18). Companion Stats is the app's second product: its own shell and cobalt palette (design handoff 2026-10-16, "Companion Stats"), reachable from the Fantasy nav ("Stats ↗"), and where the app opens when no league is imported. Every number comes from the query engine (`stats.query`, data reference: `docs/reference/stats-database.md`).
+Added in v0.28.0 (Plan AA; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.1–§9.2, amended in §18); the team dashboard in v0.29.0 (Plan AB; §9.3, amended in §19). Companion Stats is the app's second product: its own shell and cobalt palette (design handoff 2026-10-16, "Companion Stats"), reachable from the Fantasy nav ("Stats ↗"), and where the app opens when no league is imported. Every number comes from the query engine (`stats.query`, data reference: `docs/reference/stats-database.md`).

 ## Shell

-- **Nav:** Leaderboards · Players · Teams · Games (later) · Glossary; "Data through 2026 week 6 · updated 2 h ago" from `stats.status()` ("updating…" while a refresh runs); "Fantasy ↗" (Setup without a league); the theme toggle.
+- **Nav:** Leaderboards · Players · Teams (the team dashboard) · Games (later) · Glossary; "Data through 2026 week 6 · updated 2 h ago" from `stats.status()` ("updating…" while a refresh runs); "Fantasy ↗" (Setup without a league); the theme toggle.
 - **Scope** (every screen, kept for the session): season (2019 → latest), Regular season / Postseason / Both, the regular season's week range, and the fantasy scoring (My league once a league is imported, else PPR, Half PPR, Standard).
 - A finished rebuild (`stats:changed`) re-reads the status and the catalogue and runs every query on screen again.

@@ -27,20 +27,42 @@ The Ledger table: one tab per position group (All offense, QB, RB, WR, TE, K, P,
 | NQ               | Below the tab's qualifier: QB dropbacks (`qb_epa_db`, 200), RB carries (`carry_share`, 50), WR / TE targets (`target_share`, 30), K field-goal attempts (20), P punts (30), defenders' defensive snaps (200), All offense's offensive snaps (200); each per 17 games, scaled to the weeks in range. "Qualified only" (default) hides them. Teams always qualify |
 | Owner mark       | With a league: amber dot for my players (my defense), a hollow ring for another team's, its name on hover                                                                                                                                                                                                                                                       |

+- **A team row** (on the team leaderboard, or a home board's) opens that team's dashboard. The team leaderboard is under the dashboard's "Team leaderboards →" and the home's "All →".
 - **Filters:** Totals / Per game, Qualified only, team (players), with a league All / My team / Free agents, search by name. Ownership and search filter the engine's rows, so percentiles stay among the whole position.
 - **Columns:** "Columns: this tab" or one family's core metrics on the tab (Traditional, Advanced, Next Gen, Charting, Predictive; extended ones fill in to 12); the column picker adds any core or extended metric of the tab (at most 40) or removes one; Reset.
 - **Sort:** a column head (best first, then the other way), or the name. The engine sorts; the table shows 50 rows at a time.
 - **Views:** a named board saved in `companion.db` (`stats_views`): entity, tab, columns, sort, per game, qualified only, team, owner filter. The season, weeks and scoring stay the screen's. Saving under an existing name (any case) replaces it.
 - **CSV:** every row the filters keep (not only the 50 shown): rank, name, team, position and gsis id (players), games, then each column unformatted, percentages in percent. Saved where the dialog says (Downloads by default), UTF-8 with a byte-order mark so Excel reads accents.

+## Team dashboard
+
+Teams in the nav opens it on the team viewed last; the first time, on the team of my top fantasy scorer in range (with a league), else ARI. ‹ › and the select move between the 32 teams.
+
+- **Header** (every tab; handoff "8. Team"): the team's name, its place in the division (regular season: win %, then point margin), the abbreviation, four tiles (record, points and points allowed per game, the margin per game in its tone), a results strip with one card per week of the range (W/L and the score, byes, postseason rounds WC / DIV / CONF / SB), and the scope bar. With a league, who rosters the team's defense.
+- **Stat lines** (Offense, Defense, Special teams, Situational, Tendencies, Forecast, the Overview's ratings): the value; a percentile pill and the rank among the teams that qualify ("3rd of 32", ties "T-3rd" with their percentile at the middle); the league's mean; the catalogue entry and reliability on the label. A metric with no better side (pass rate, pace, blitz rate) reads "11th highest" and stays grey. A line the season lacks says why ("Not published for 2026 yet.", "Charted from 2022."). Each line comes from one query over every team, one more per split.
+
+| Tab           | Shows                                                                                                                                                                                                                                                                   |
+| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
+| Overview      | Who gets the targets and the carries (share of the team's total in range, bars against the leader, FP/G under the scoring), who throws; the next game (Elo and the market's win probability and spread, total, weather); ratings; EPA per play by week                  |
+| Offense       | Efficiency, passing, rushing (line yards, stuffs), red zone (EPA and success inside the 20) and third / fourth down, ball security                                                                                                                                      |
+| Defense       | Efficiency allowed, pass rush (pressure through the prior season, sacks, blitz, rushers), coverage (man rate, EPA in man and zone, through the prior season), run defense, havoc and red zone, fantasy points allowed by position under the scoring                     |
+| Special teams | Field goals and FG over expected, net punting, returns and touchdowns, starting field position; the kickers and punters                                                                                                                                                 |
+| Situational   | Drives, third and fourth down; a table of splits (all plays, red zone, two-minute, leading by 9+, within 8, trailing by 9+, each quarter): plays, EPA and success for the offense and allowed by the defense, shaded and ranked among the 32 in the same split          |
+| Tendencies    | Play calling (PROE, neutral pass rate and pace, no-huddle), offensive looks (shotgun, play action, RPO, screens, motion, personnel), defensive looks (blitz, rushers, man rate, box); personnel groupings with plays, share, EPA and success (through the prior season) |
+| Players       | Snap, route, target, carry or air-yards share of every QB, RB, WR and TE with one, in range and week by week                                                                                                                                                            |
+| Schedule      | Every game: date, opponent, result, Elo and market win probability, the line, the opponent's Elo before it (red from 1550, green to 1450), weather; schedule strength played and left                                                                                   |
+| Forecast      | Playoff and division odds by week, adjusted EPA by week, the next game, season odds, ratings, schedule strength, luck                                                                                                                                                   |
+
+Charts: one line per series (cobalt, teal; colour-blind safe in both themes), gaps for byes, end labels, and a hover that lists every series that week.
+
 ## Glossary

 Every core and extended metric, players or teams, by family or search, with the same entry as the column hover.

 ## IPC

-`stats.ownership()` (the league's rosters keyed by gsis id and nflverse team code, from `player_ids`), `stats.views()`, `stats.saveView(name, board)`, `stats.deleteView(id)`, `stats.exportCsv(fileName, csv)`; and Plan Y's `stats.query`, `stats.catalogue`, `stats.status`, `stats.onChanged`.
+`stats.games({ season, team })` for the dashboard's header, next game and schedule; `stats.ownership()` (the league's rosters keyed by gsis id and nflverse team code, from `player_ids`), `stats.views()`, `stats.saveView(name, board)`, `stats.deleteView(id)`, `stats.exportCsv(fileName, csv)`; and Plan Y's `stats.query`, `stats.catalogue`, `stats.status`, `stats.onChanged`.

 ## Speed

-Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms.
+Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms. The team dashboard: Teams 140 ms from click to the Overview, a tab 65–150 ms, Situational (eleven queries) 275 ms.
```

- [ ] **Step 2: The database reference**

```diff
diff --git a/docs/reference/stats-database.md b/docs/reference/stats-database.md
index d2a51c7..a0a283d 100644
--- a/docs/reference/stats-database.md
+++ b/docs/reference/stats-database.md
@@ -162,7 +162,7 @@ ORDER BY sb DESC LIMIT 10;

 - **Catalogue** (`src/shared/stats/catalogue.ts`): 324 metrics, 204 for players and 120 for teams. Each has a formula over component sums (`{targets} / nullif({tm_targets}, 0)`), model states at the end of the scope (`{last:elo}`) or weekly quantiles (`{p80:fp}`), its sample component and minimum, unit, direction, tier (`core` 116, `extended` 176, `stored` 32), family, sources and coverage. 163 can be split by situation. The catalogue the renderer reads carries each metric's stability.
 - **Missing counts.** At the week and season grains, a play-by-play or box-score component a player never had (carries for a receiver) sums as 0. FTN, participation, NGS, PFR and QBR components stay NULL when missing: there, NULL means "not measured".
-- **Query** (`StatsQuery`, `src/shared/stats/types.ts`; JSON Schema in `src/shared/stats/querySchema.ts`): entity, metrics, scope, situation, groupBy, transform (`raw`, `perGame`, `percentile`, `zScore`, `vsLeague`, `shrunk`, `opponentAdjusted`), sort, limit, scoring. The engine (`src/main/stats/engine/`) validates it, compiles it to parameterised SQL over the season tables, the weekly tables or the plays, and runs it for 5 s at most.
+- **Query** (`StatsQuery`, `src/shared/stats/types.ts`; JSON Schema in `src/shared/stats/querySchema.ts`): entity, metrics, scope, situation (down, distance, quarter, field zone, score margin, win probability, neutral, two-minute — the last two minutes of the 2nd and 4th quarters, since v0.29.0 — and the participation and charting filters), groupBy, transform (`raw`, `perGame`, `percentile`, `zScore`, `vsLeague`, `shrunk`, `opponentAdjusted`), sort, limit, scoring. The engine (`src/main/stats/engine/`) validates it, compiles it to parameterised SQL over the season tables, the weekly tables or the plays, and runs it for 5 s at most.
 - **Results** carry, per metric, the value (after the transform), the raw value, the sample, `qualified`, the percentile and rank among qualified rows of the same position and group, and `estimated`. Notes state the coverage the answer depends on.
 - **Qualification.** `minSample` is per 17 games, scaled to the weeks a row covers (about one game per opponent row) and, at the play grain, to the share of plays each row keeps (its situation and play-dimension group, among its teams' plays when the query filters teams or players on the field).
 - **Transforms.** `shrunk` pulls a rate toward the qualified rows' sample-weighted mean by its stability prior: (s·v + k·μ) / (s + k). `opponentAdjusted` subtracts the sample-weighted average of how much more than the league each opponent allowed in the same metric and position (weekly rows; rates only, since a total is not comparable with the league total). A metric a transform does not apply to is returned raw, with a note.
```

- [ ] **Step 3: The spec amendment**

```diff
diff --git a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
index 75da58f..41e70b7 100644
--- a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
+++ b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
@@ -1,6 +1,6 @@
 # Stats analysis — design

-**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X), 2026-10-17 (§16: Plan Y), 2026-10-18 (§17: Plan Z) and 2026-10-20 (§18: Plan AA) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.
+**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X), 2026-10-17 (§16: Plan Y), 2026-10-18 (§17: Plan Z), 2026-10-20 (§18: Plan AA) and 2026-10-20 (§19: Plan AB) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.

 **Sources:** the stats catalog (`docs/research/2026-10-09-nfl-stats-catalog.md`), the predictive-metrics catalogue (`docs/research/nfl_predictive_metrics.md`), the coverage audit (`docs/research/2026-10-14-warehouse-coverage-audit.md`), and a DuckDB vs SQLite benchmark on 2023–2025 play-by-play and participation (§3.2).

@@ -540,3 +540,21 @@ Decided with the user and measured on the live database while Plan AA was writte
 - **I. CSV** holds every row the filters keep: unformatted numbers, percentages in percent, gsis ids. It is saved through a dialog (Downloads by default), in UTF-8 with a byte-order mark for Excel.
 - **J. The scope** (season, season type, the regular season's weeks, scoring) is shared by every Stats screen for the session and not saved. Postseason and Both have no week range.
 - **K. Measured** (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a 40-column query 265 ms (budgets 300 ms and 500 ms, §11).
+
+## 19. Amendment 2026-10-20: the team dashboard (Plan AB)
+
+Decided with the user and measured on the live database while Plan AB was written (its Planning findings), and taken into the build. `docs/reference/stats-screens.md` documents the result.
+
+- **A. The handoff's team page is the dashboard's frame (§9.3, §9.6).** Its header (team select with ‹ ›, name and division place, the abbreviation, four tiles, a results strip) tops every tab, and its tables (who gets the targets, the carries, who throws) open the Overview. The spec's tabs follow in the Stats language. The handoff's Defense tiles give way to the spec's ratings; defense has its own tab.
+  - Teams in the nav opens the dashboard on the team viewed last; the first time, on the team of my top fantasy scorer in range, else ARI. The team leaderboard is under "Team leaderboards →" and the home's "All →"; a team row there, or on a home board, opens the dashboard.
+  - A share in the Overview's tables is of the team's total in range (handoff), not the engine's share of the games a player played.
+- **B. Ranks are among the league.** Each tab asks for every team (one query per split) and finds the team's row. The dashboard ranks among the teams that qualify: a tie shares a rank ("T-3rd") and its percentile sits at the middle of the tie (30 teams with no special-teams touchdown are near the median, not last). A metric with no better side reads "11th highest" and is not shaded. The percentile is the handoff profile's pill on a track; the league's mean is beside the rank.
+- **C. Two-minute (§7.1).** The engine gains `situation.twoMinute`: the last two minutes of the second and fourth quarters. The Situational tab splits by red zone, two-minute, leading by 9+, within 8, trailing by 9+ and quarter, each ranked among the 32 in the same split.
+- **D. What the data cannot give (§9.3).**
+  - Red-zone TD % is the TD drive rate (as §16 F), with red-zone EPA and success beside it.
+  - Coverage shell, formation mix and defensive personnel have no metric: man / zone rate and EPA, shotgun rate, personnel groupings, box count and blitz rate stand in. Participation's columns (pressure, coverage, personnel) end with the prior season, and a line says so.
+  - The Players tab covers QB, RB, WR and TE.
+- **E. Schedule and Forecast.** Games come from `stats.games`: result, Elo and market probability, the line, weather, and the opponent's Elo before the game as its strength (1550 and up hard, 1450 and below easy). The Forecast charts playoff and division odds and adjusted EPA as of each week.
+- **F. Charts** are drawn as SVG (no chart library): a line per series in the handoff's `--s1` / `--s2`, checked with the dataviz validator for colour-blind separation (the dark values moved into the dark lightness band: `#5d8ff2`, `#26a092`), gaps for byes, end labels and a hover with every series that week.
+- **G. Teams' names and divisions** live in `src/shared/stats/nflTeams.ts`; the season simulation reads its divisions from there. A division place is the regular season's win %, then margin (an approximation of the tiebreakers).
+- **H. Measured** (2026 week 6): each tab's queries 25–120 ms, the eleven of Situational 145–170 ms; in the app, Teams 140 ms from click to the Overview and a tab 65–275 ms (budget 300 ms, §11).
```

If Task 6 measures different numbers, write the measured ones into the screens reference and the spec.

- [ ] **Step 4: Commit**

```bash
npx prettier --write docs/reference/stats-screens.md docs/reference/stats-database.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git add docs/reference/stats-screens.md docs/reference/stats-database.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git commit -m "docs(stats): document the team dashboard"
```

---

### Task 6: Live checks

**Files:**

- Throwaway (never committed): `tests/zz-ab-live.test.ts`
- Outside the repo: `~/project/ffc-proto-ab-live/` (the database copy, scratch profiles, the driver and its screenshots)

The live check reads a copy of Plan Z's live database, `~/project/ffc-proto-z-live/fresh-z/stats.duckdb` (2026 week 6), offline. If it is gone, build one first: run the built app once on an empty scratch profile (`--user-data-dir`). It backfills in about 4 minutes; copy its `stats.duckdb`.

The walk-through also copies the dev profile's `companion.db` (`~/.config/FantasyCompanion/companion.db`), so the scratch app has the dev league. The dev profile itself is only read.

- [ ] **Step 1: The database copy**

```bash
mkdir -p ~/project/ffc-proto-ab-live/tmp && cp ~/project/ffc-proto-z-live/fresh-z/stats.duckdb ~/project/ffc-proto-ab-live/work.duckdb
```

- [ ] **Step 2: The dashboard's queries on live data**

Create `tests/zz-ab-live.test.ts`:

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { openStatsService } from '@main/stats/service'
import { defaultScope } from '@/lib/stats/scope'
import {
  nextGame,
  personnelQuery,
  rosterQuery,
  rosterView,
  sectionQueries,
  sectionViews,
  splitQueries,
  splitRows,
  standing,
  STANDING_METRICS,
  TAB_SECTIONS,
  teamGames,
  usageGrid,
  usageQuery,
  weeklyQuery,
  type SplitKey
} from '@/lib/stats/team'
import { STATS_TEAMS } from '@shared/stats/nflTeams'
import type { MetricInfo, StatsQuery, StatsResult } from '@shared/stats/types'

// Plan AB Task 7: the dashboard's queries on the live database. Throwaway, never committed.
const LIVE = join(homedir(), 'project', 'ffc-proto-ab-live')
const BUDGET = { tab: 300, cold: 2000 }

it('plan AB live gates', { timeout: 900_000 }, async () => {
  const service = await openStatsService(
    { path: join(LIVE, 'work.duckdb'), tempDir: join(LIVE, 'tmp') },
    () => {},
    async () => {
      throw new Error('offline: no refresh in this check')
    }
  )
  const all = async <K extends string>(qs: Map<K, StatsQuery>): Promise<Map<K, StatsResult>> =>
    new Map(await Promise.all([...qs].map(async ([k, q]) => [k, await service.query(q)] as const)))
  try {
    const status = await service.status()
    const byId = new Map<string, MetricInfo>((await service.catalogue()).map((m) => [m.id, m]))
    console.log('state', JSON.stringify(status.through))
    const ids = Object.values(TAB_SECTIONS).flatMap((s) => s.flatMap((x) => x.lines))
    expect(ids.filter((l) => !byId.has(l.metric)).map((l) => l.metric)).toEqual([])

    for (const season of [status.through!.season - 1, status.through!.season]) {
      const scope = { ...defaultScope(status, false), season }
      // Each tab's queries at once, cold then warm: the tab's first paint.
      const tabs: [string, (team: string) => Map<string, StatsQuery>][] = [
        ...(Object.keys(TAB_SECTIONS) as (keyof typeof TAB_SECTIONS)[]).map(
          (tab) =>
            [
              tab,
              (team: string) =>
                new Map<string, StatsQuery>([
                  ...sectionQueries(
                    TAB_SECTIONS[tab],
                    scope,
                    status,
                    tab === 'overview' ? STANDING_METRICS : []
                  ),
                  ...(tab === 'overview'
                    ? ([
                        ['roster', rosterQuery(team, scope, status)],
                        [
                          'weekly',
                          weeklyQuery(team, ['off_epa_play', 'def_epa_play'], scope, status)
                        ]
                      ] as const)
                    : []),
                  ...(tab === 'tendencies'
                    ? ([['personnel', personnelQuery(team, scope, status)]] as const)
                    : [])
                ])
            ] as [string, (team: string) => Map<string, StatsQuery>]
        ),
        ['splits', () => splitQueries(scope, status)],
        [
          'players',
          (team) =>
            new Map([
              ['season', usageQuery(team, scope, status, false)],
              ['weekly', usageQuery(team, scope, status, true)]
            ])
        ]
      ]
      for (const [tab, make] of tabs) {
        let t = Date.now()
        await all(make('DET'))
        const cold = Date.now() - t
        t = Date.now()
        await all(make('KC'))
        const ms = Date.now() - t
        console.log(`${season} ${tab}: ${ms} ms (cold ${cold}), ${make('DET').size} queries`)
        expect(cold, `${season} ${tab} cold`).toBeLessThan(BUDGET.cold)
        expect(ms, `${season} ${tab}`).toBeLessThan(BUDGET.tab)
      }

      // Every team: a record, a standing, its players, a usage grid, its lines.
      const overview = await all(
        sectionQueries(TAB_SECTIONS.overview, scope, status, STANDING_METRICS)
      )
      const offense = await all(sectionQueries(TAB_SECTIONS.offense, scope, status))
      const splits = await all(splitQueries(scope, status))
      let t = Date.now()
      const empty: string[] = []
      for (const team of STATS_TEAMS) {
        const games = teamGames(await service.games({ season, team }), team)
        expect(games.filter((g) => g.seasonType === 'REG').length, `${team} games`).toBe(17)
        if (season === status.through!.season)
          expect(nextGame(games), `${team} next`).not.toBeNull()
        expect(standing(overview.get('all' as SplitKey), team), team).toMatch(/in the [AN]FC /)
        const v = rosterView(await service.query(rosterQuery(team, scope, status)), null)
        expect(v.targets.length, `${team} targets`).toBeGreaterThan(3)
        expect(v.passers.length, `${team} passers`).toBeGreaterThan(0)
        const [us, uw] = await Promise.all([
          service.query(usageQuery(team, scope, status, false)),
          service.query(usageQuery(team, scope, status, true))
        ])
        expect(usageGrid(us, uw, 'snap_share', [1], null).length, `${team} usage`).toBeGreaterThan(
          8
        )
        for (const s of sectionViews(TAB_SECTIONS.offense, offense, team, byId, season))
          for (const l of s.lines)
            if (l.value === '—' && !l.missing) empty.push(`${team} ${l.label}`)
        for (const r of splitRows(splits, team, byId, season))
          if (r.offPlays === '—') empty.push(`${team} ${r.label}`)
      }
      console.log(
        `${season}: 32 teams' games, rosters and usage in ${Date.now() - t} ms; empty: ${empty.join(', ') || '-'}`
      )
      expect(empty).toEqual([])
      const det = sectionViews(TAB_SECTIONS.overview, overview, 'DET', byId, season)[0]
      console.log(
        `${season} DET ratings: ${det.lines.map((l) => `${l.label} ${l.value} ${l.rank}`).join(' | ')}`
      )
    }
    console.log('ALL GATES PASSED')
  } finally {
    await service.close()
  }
})
```

```bash
npx vitest run tests/zz-ab-live.test.ts --reporter=verbose
```

Expected (2026-10-20, state 2026 week 6), within the budgets the gates set:

- **Every tab's queries at once** (DET cold, then KC warm; budget 300 ms, a cold read 2 s):

| Tab                  | Queries | 2025 ms | 2026 ms |
| -------------------- | ------- | ------- | ------- |
| Overview             | 3       | 118     | 69      |
| Offense              | 2       | 72      | 72      |
| Defense              | 2       | 110     | 102     |
| Special teams        | 1       | 36      | 32      |
| Situational (lines)  | 1       | 29      | 24      |
| Situational (splits) | 10      | 155     | 143     |
| Tendencies           | 2       | 50      | 47      |
| Players              | 2       | 90      | 44      |
| Forecast             | 1       | 73      | 74      |

Cold reads were within a few ms of warm, except once the 2026 splits right after the copy (1,237 ms).

- **Every team, both seasons:** 17 regular-season games, a next game in 2026, a place in its division, four or more receivers and a passer, eight or more players in the usage grid, no empty offense line or split that the season has data for (32 teams in 4.8–7.3 s).
- **DET 2026:** Elo 1,549 (12th of 32), SRS 2.4 (11th), adjusted EPA/play +0.083 (4th), allowed +0.066 (30th), EPA/play +0.180 (3rd), allowed +0.155 (31st). 2025: Elo 1,578 (10th).

and `ALL GATES PASSED`. If a gate fails, stop and report the numbers. Then remove the file (`npm run typecheck` does not take it: the node config has no `@/` alias):

```bash
rm tests/zz-ab-live.test.ts && git status --short
```

Expected: only the unrelated changes of Global Constraints.

- [ ] **Step 3: The app, walked through**

The driver is Plan AA's: it starts the built app on a scratch profile with remote debugging, follows a list of steps over the DevTools protocol and saves screenshots. Copy it, or create `~/project/ffc-proto-ab-live/drive.mjs`:

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

Create `~/project/ffc-proto-ab-live/steps-ab.json` (with the dev league; a tab is clicked through `[role=tab]`, since the nav has a Players button too):

```json
[
  {
    "size": [1440, 900],
    "wait": 8000
  },
  {
    "click": "Stats \u2197"
  },
  {
    "wait": 2500
  },
  {
    "click": "Teams"
  },
  {
    "wait": 3000
  },
  {
    "shot": "01-overview"
  },
  {
    "eval": "(() => { const s = document.querySelector('svg[role=img]'); s.scrollIntoView(); const r = s.getBoundingClientRect(); s.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.x + r.width * 0.5, clientY: r.y + 40 })); return r.width })()"
  },
  {
    "wait": 500
  },
  {
    "shot": "02-overview-chart"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Offense').click()"
  },
  {
    "wait": 2500
  },
  {
    "eval": "document.querySelector('main').scrollTo(0,0)"
  },
  {
    "shot": "03-offense"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Defense').click()"
  },
  {
    "wait": 2500
  },
  {
    "eval": "document.querySelector('main').scrollTo(0,0)"
  },
  {
    "shot": "04-defense"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Special teams').click()"
  },
  {
    "wait": 2500
  },
  {
    "eval": "document.querySelector('main').scrollTo(0,0)"
  },
  {
    "shot": "05-special"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Situational').click()"
  },
  {
    "wait": 2500
  },
  {
    "eval": "document.querySelector('main').scrollTo(0,0)"
  },
  {
    "shot": "06-situational"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Tendencies').click()"
  },
  {
    "wait": 2500
  },
  {
    "eval": "document.querySelector('main').scrollTo(0,0)"
  },
  {
    "shot": "07-tendencies"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Players').click()"
  },
  {
    "wait": 2500
  },
  {
    "eval": "document.querySelector('main').scrollTo(0,0)"
  },
  {
    "shot": "08-players"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Schedule').click()"
  },
  {
    "wait": 2500
  },
  {
    "eval": "document.querySelector('main').scrollTo(0,0)"
  },
  {
    "shot": "09-schedule"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Forecast').click()"
  },
  {
    "wait": 2500
  },
  {
    "eval": "document.querySelector('main').scrollTo(0,0)"
  },
  {
    "shot": "10-forecast"
  },
  {
    "select": ["Season", "2024"]
  },
  {
    "wait": 2500
  },
  {
    "shot": "11-forecast-2024"
  },
  {
    "select": ["Team", "PHI"]
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Tendencies').click()"
  },
  {
    "wait": 2500
  },
  {
    "shot": "12-phi-2024-tendencies"
  },
  {
    "select": ["Season type", "POST"]
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Overview').click()"
  },
  {
    "wait": 2500
  },
  {
    "shot": "13-phi-2024-post"
  },
  {
    "select": ["Season type", "REG"]
  },
  {
    "select": ["Season", "2026"]
  },
  {
    "eval": "[...document.querySelectorAll('button')].find((b) => b.title === 'Switch theme').click()"
  },
  {
    "wait": 2500
  },
  {
    "shot": "14-overview-dark"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Players').click()"
  },
  {
    "wait": 2000
  },
  {
    "shot": "15-players-dark"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Defense').click()"
  },
  {
    "wait": 2000
  },
  {
    "shot": "16-defense-dark"
  },
  {
    "eval": "[...document.querySelectorAll('button')].find((b) => b.title === 'Switch theme').click()"
  },
  {
    "click": "Team leaderboards \u2192"
  },
  {
    "wait": 2000
  },
  {
    "shot": "17-team-leaderboard"
  },
  {
    "eval": "document.querySelectorAll('tbody tr')[2].click()"
  },
  {
    "wait": 2500
  },
  {
    "shot": "18-from-leaderboard"
  },
  {
    "click": "Leaderboards"
  },
  {
    "wait": 2500
  },
  {
    "eval": "(() => { const s = [...document.querySelectorAll('section')].find((x) => x.textContent.includes('Takeaways')); s.querySelectorAll('button')[1].click(); return 'ok' })()"
  },
  {
    "wait": 2500
  },
  {
    "shot": "19-from-home-board"
  }
]
```

Create `~/project/ffc-proto-ab-live/steps-ab-noleague.json`:

```json
[
  { "size": [1440, 900], "wait": 8000 },
  { "click": "Teams" },
  { "wait": 3000 },
  { "shot": "21-noleague-overview" },
  {
    "eval": "[...document.querySelectorAll('select')].find((s) => s.title === 'Fantasy scoring').textContent"
  },
  { "eval": "document.querySelectorAll('[title=\"On your fantasy team\"]').length" },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Defense').click()"
  },
  { "wait": 2500 },
  { "shot": "22-noleague-defense" }
]
```

Create `~/project/ffc-proto-ab-live/steps-ab-timing.json` (each tab from click to content; the last two numbers are not meaningful, since Forecast also shows "Elo rating" and the next team's heading changes before its data):

```json
[
  {
    "size": [1440, 900],
    "wait": 8000
  },
  {
    "click": "Stats \u2197"
  },
  {
    "wait": 2500
  },
  {
    "eval": "new Promise((res) => { const t0 = performance.now(); [...document.querySelectorAll('nav button')].find((b) => b.textContent === 'Teams').click(); const tick = () => { if ([...document.querySelectorAll('main *')].some((e) => e.textContent === 'Elo rating') && document.querySelector('main').textContent.includes('Who gets the targets')) res('Teams: ' + Math.round(performance.now() - t0) + ' ms'); else setTimeout(tick, 5) }; tick() })"
  },
  {
    "wait": 1000
  },
  {
    "eval": "new Promise((res) => { const t0 = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Offense').click(); const tick = () => { const ok = [...document.querySelectorAll('main *')].some((e) => e.childElementCount === 0 && e.textContent === 'Red-zone EPA per play') && !document.querySelector('main').textContent.includes('Loading\u2026'); if (ok) res('Offense: ' + Math.round(performance.now() - t0) + ' ms'); else setTimeout(tick, 5) }; tick() })"
  },
  {
    "wait": 800
  },
  {
    "eval": "new Promise((res) => { const t0 = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Defense').click(); const tick = () => { const ok = [...document.querySelectorAll('main *')].some((e) => e.childElementCount === 0 && e.textContent === 'Fantasy points allowed to QBs') && !document.querySelector('main').textContent.includes('Loading\u2026'); if (ok) res('Defense: ' + Math.round(performance.now() - t0) + ' ms'); else setTimeout(tick, 5) }; tick() })"
  },
  {
    "wait": 800
  },
  {
    "eval": "new Promise((res) => { const t0 = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Special teams').click(); const tick = () => { const ok = [...document.querySelectorAll('main *')].some((e) => e.childElementCount === 0 && e.textContent === 'Kickers') && !document.querySelector('main').textContent.includes('Loading\u2026'); if (ok) res('Special teams: ' + Math.round(performance.now() - t0) + ' ms'); else setTimeout(tick, 5) }; tick() })"
  },
  {
    "wait": 800
  },
  {
    "eval": "new Promise((res) => { const t0 = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Situational').click(); const tick = () => { const ok = [...document.querySelectorAll('main *')].some((e) => e.childElementCount === 0 && e.textContent === 'Two-minute') && !document.querySelector('main').textContent.includes('Loading\u2026'); if (ok) res('Situational: ' + Math.round(performance.now() - t0) + ' ms'); else setTimeout(tick, 5) }; tick() })"
  },
  {
    "wait": 800
  },
  {
    "eval": "new Promise((res) => { const t0 = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Tendencies').click(); const tick = () => { const ok = [...document.querySelectorAll('main *')].some((e) => e.childElementCount === 0 && e.textContent === 'Personnel groupings') && !document.querySelector('main').textContent.includes('Loading\u2026'); if (ok) res('Tendencies: ' + Math.round(performance.now() - t0) + ' ms'); else setTimeout(tick, 5) }; tick() })"
  },
  {
    "wait": 800
  },
  {
    "eval": "new Promise((res) => { const t0 = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Players').click(); const tick = () => { const ok = [...document.querySelectorAll('main *')].some((e) => e.childElementCount === 0 && e.textContent === 'Snap share by week') && !document.querySelector('main').textContent.includes('Loading\u2026'); if (ok) res('Players: ' + Math.round(performance.now() - t0) + ' ms'); else setTimeout(tick, 5) }; tick() })"
  },
  {
    "wait": 800
  },
  {
    "eval": "new Promise((res) => { const t0 = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Schedule').click(); const tick = () => { const ok = [...document.querySelectorAll('main *')].some((e) => e.childElementCount === 0 && e.textContent === 'Schedule strength') && !document.querySelector('main').textContent.includes('Loading\u2026'); if (ok) res('Schedule: ' + Math.round(performance.now() - t0) + ' ms'); else setTimeout(tick, 5) }; tick() })"
  },
  {
    "wait": 800
  },
  {
    "eval": "new Promise((res) => { const t0 = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Forecast').click(); const tick = () => { const ok = [...document.querySelectorAll('main *')].some((e) => e.childElementCount === 0 && e.textContent === 'Super Bowl odds') && !document.querySelector('main').textContent.includes('Loading\u2026'); if (ok) res('Forecast: ' + Math.round(performance.now() - t0) + ' ms'); else setTimeout(tick, 5) }; tick() })"
  },
  {
    "wait": 800
  },
  {
    "eval": "new Promise((res) => { const t0 = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === 'Overview').click(); const tick = () => { const ok = [...document.querySelectorAll('main *')].some((e) => e.childElementCount === 0 && e.textContent === 'Elo rating') && !document.querySelector('main').textContent.includes('Loading\u2026'); if (ok) res('Overview: ' + Math.round(performance.now() - t0) + ' ms'); else setTimeout(tick, 5) }; tick() })"
  },
  {
    "wait": 800
  },
  {
    "eval": "new Promise((res) => { const t0 = performance.now(); document.querySelector('button[title=\"Next team\"]').click(); const h = document.querySelector('h1').textContent; const tick = () => { const m = document.querySelector('main').textContent; if (document.querySelector('h1').textContent !== h && m.includes('Who gets the targets') && !m.includes('Loading')) res('Next team: ' + Math.round(performance.now() - t0) + ' ms'); else setTimeout(tick, 5) }; tick() })"
  }
]
```

```bash
npx electron-vite build
L=~/project/ffc-proto-ab-live
rm -rf $L/gui && mkdir -p $L/gui/profile $L/gui/profile-noleague $L/gui/profile-timing
cp ~/.config/FantasyCompanion/companion.db $L/gui/profile/ && cp $L/work.duckdb $L/gui/profile/stats.duckdb
cp ~/.config/FantasyCompanion/companion.db $L/gui/profile-timing/ && cp $L/work.duckdb $L/gui/profile-timing/stats.duckdb
cp $L/work.duckdb $L/gui/profile-noleague/stats.duckdb
node $L/drive.mjs $L/gui/profile $L/steps-ab.json $L/gui/shots
node $L/drive.mjs $L/gui/profile-noleague $L/steps-ab-noleague.json $L/gui/shots
node $L/drive.mjs $L/gui/profile-timing $L/steps-ab-timing.json $L/gui/timing
```

Expected: no `NOT FOUND` in the output. The timing run prints each tab from click to content, under 300 ms; measured: Teams 142 ms, tabs 66–151 ms, Situational 275 ms.

The dev league's top scorer plays for BUF on 2026-10-20. If the dashboard opens on another team, the checklist holds for that team.

The scratch app may refresh while it runs. A game that lands mid-walk changes the record, and the screens query again. That is expected.

Open each screenshot in `$L/gui/shots` and check:

| Shot                                   | Shows                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-overview`                          | Teams underlined in the nav; "Buffalo Bills · 1st in the AFC East · Weeks 1–6"; BUF 52px; four tiles (margin green); 58px result cards; the targets and carries tables with share bars and amber dots; the next game card (Elo, Market, gap); Ratings lines with pills. |
| `02-overview-chart`                    | EPA per play by week: two lines (cobalt, teal), a legend, end labels; the hover lists both series for the week.                                                                                                                                                         |
| `03-offense` … `07-tendencies`         | Two columns of sections, labels whole; pills green / red by percentile, grey on neutral lines ("11th highest"); "Not published for 2026 yet." spanning on pressure, man / zone and personnel lines.                                                                     |
| `06-situational`                       | Drives, third and fourth down; the splits table, ten rows from All plays to 4th quarter, plays and shaded ranked cells.                                                                                                                                                 |
| `08-players`                           | Snap share by week: a cobalt cell per game, dots for weeks without one, the range share first.                                                                                                                                                                          |
| `09-schedule`                          | 17 games: result chips, Elo and market probability, the line from BUF's side, opponent Elo in red / green, weather left-aligned; schedule strength lines at the right.                                                                                                  |
| `10-forecast`                          | Odds by week (0–100 %) and adjusted EPA by week; the next game; season odds, ratings, schedule strength and luck lines.                                                                                                                                                 |
| `11-forecast-2024`                     | 2024: 18 result cards with a bye; the charts over weeks 1–18; no next game.                                                                                                                                                                                             |
| `12-phi-2024-tendencies`               | PHI 2024: personnel and man coverage lines filled; the personnel groupings table.                                                                                                                                                                                       |
| `13-phi-2024-post`                     | Postseason: no division place; cards WC GB, DIV LA, CONF WAS, SB KC; ranks "of 14".                                                                                                                                                                                     |
| `14-overview-dark` … `16-defense-dark` | The dark Stats palette; pills, cells and both chart lines legible.                                                                                                                                                                                                      |
| `17-team-leaderboard`                  | The 2026 team offense leaderboard, Teams still underlined.                                                                                                                                                                                                              |
| `18-from-leaderboard`                  | The dashboard of the leaderboard's third team.                                                                                                                                                                                                                          |
| `19-from-home-board`                   | The dashboard of the takeaways board's first team.                                                                                                                                                                                                                      |
| `21-noleague-overview`                 | ARI; scoring PPR (the eval prints "PPRHalf PPRStandard"); no amber dots (the eval prints 0); no "Defense rostered by".                                                                                                                                                  |
| `22-noleague-defense`                  | The Defense tab, fantasy points allowed under PPR.                                                                                                                                                                                                                      |

If a screenshot differs, stop and show it to the user.

---

### Task 7: Verify, merge, release

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 966 passed | 5 skipped; the build succeeds.

- [ ] **Step 2: The Windows suite and self-test**

**Ask the user before pushing.** Then:

```bash
git push origin feat/team-dashboard-ab:check/plan-ab
gh run watch "$(gh run list --branch check/plan-ab --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
git push origin --delete check/plan-ab
```

Expected: green. The log shows `"query":true`.

- [ ] **Step 3: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/team-dashboard-ab`. It reviews against spec §9.3 and §11, the amendments, the handoff and the Review Focus list. Fix Critical and Important findings, each in its own commit, test first. Re-run Step 1 after them, and the Task 6 walk-through after a screen change.

- [ ] **Step 4: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/team-dashboard-ab -m "merge: feat/team-dashboard-ab (plan AB)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.29.0" && git tag v0.29.0
git branch -d feat/team-dashboard-ab
```

- [ ] **Step 5: Status block**

Replace this plan's Status line with the outcome:

- the merge commit and the tag;
- the Task 6 numbers and the walk-through;
- the review fixes and anything deferred.

Then commit, staging this file only: `git commit -m "docs(plan): mark plan AB complete"`.

- [ ] **Step 6: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.29.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests and the packaged self-test, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.29.0 --draft=false`). The release notes should say:

- Team dashboards in Companion Stats: open Teams for any team, 2019 to today. Overview, offense, defense, special teams, situational splits, tendencies, usage by week, schedule and forecast, each stat ranked among the 32 teams.
- The next game with Elo beside the betting market, and playoff odds week by week.
- The player dashboard comes in the next release.

---

## Self-review against the spec

- **§9.3 Team dashboard**, tab by tab (Tasks 2–4):
  - **Overview:** record, points for and against (header); Elo and SRS; adjusted EPA for offense and defense with ranks; the weekly EPA trend; the next game (Elo and Vegas); key players (the handoff's tables).
  - **Offense:** efficiency (EPA, success, explosives); passing and rushing; line yards; sack rate allowed; red zone and third down.
  - **Defense:**
    - efficiency allowed;
    - pass rush (pressure, sacks, blitz);
    - coverage (man / zone and EPA allowed; shell out, amendment D);
    - run defense (stuffs, line yards allowed);
    - havoc;
    - fantasy points allowed by position.
  - **Special teams:** kicking, punting, returns, field position, FGOE.
  - **Situational:** drives, red zone, third / fourth down, two-minute (amendment C), by quarter and score state.
  - **Tendencies:** PROE, neutral pace, personnel, motion, play action, RPO, screens; defensive box, blitz and coverage mix (formation and defensive personnel out, amendment D).
  - **Players:** snap, route, target, carry and air-yards share across the roster, by week.
  - **Schedule:** the game log with result, Vegas line, Elo probability and weather; the remaining schedule with its strength.
  - **Forecast:**
    - short term: the next game's probability and spread, Elo against Vegas;
    - long term: simulated wins and playoff odds, the adjusted EPA trend, remaining schedule strength, luck.
- **§9.6 Design.** The handoff's team page for the header and the Overview's tables (amendment A), and its profile's percentile pill. The weekly chart follows its Compare chart and the dataviz skill (amendment F). The stat tabs, the splits table, the usage grid and the schedule have no mockup: they are built in the handoff's Stats language and are worth a pass in Claude Design.
- **§7.1 Query.** `situation.twoMinute` (Task 1).
- **§11 Testing.**
  - Unit tests for the model and the teams table; component tests for the lines, the chart and the screen.
  - The dashboard budget on live data, in the worker and in the app (Task 6).
  - The packaged smoke test (Task 7 Step 2).
- **Not in this plan** (by §12 and §13): the player dashboard and the slide-over link (AC); the chart explorer, compare and trends (AD); matchups and Games (AE); natural-language queries.
