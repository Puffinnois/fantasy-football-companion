# Plan AC — Stats analysis: the player dashboard

**Status:** complete 2026-10-21. Merged to main as `63b23d3` and tagged `v0.30.0` on `3f9ef44` (not pushed yet). Tasks 1–6 were executed from this text; each task's tests were seen failing as the plan says, then passing, with the plan's counts plus the 3 of the untracked `tests/shared/playerImage.test.ts`, and each task's tree was identical to the prototype's commit.

Task 7: `ALL GATES PASSED` (195 s). The pools, Chase's 2025 lines and every tab's speed matched: Splits at most 373 ms (budget 1 s), no empty line without a reason, every played game with its result. The walk-through **stopped at its gate** first: with the dev league the dashboard opened on Bryce Young, not James Cook. Cause: `base.duckdb` holds no league points, so `setLeague` scored every season in place, oldest first, while `hasLeague` was already true; a league read of 2026 mid-scoring found no points for anyone, the top-scorer query (limit 1) returned an arbitrary rostered player and the default kept him. The same happens to a user who imports a league once Stats is built. Fixed with the user's approval (below). After the fixes, every screenshot matched its checklist, with the league and without, light and dark. In the app (a scored copy, three runs): Players 202–243 ms to the Overview, tabs 65–141 ms, Forecast 179–181 ms, Splits 253–269 ms (a lineman's 287–358 ms), a rail position 129–184 ms.

Windows Package check green after all fixes (1,032 tests; `"query":true`).

Fixes, each test-first in its own commit:

- (Walk-through) `016d91a`: during a league's first scoring, league-scored `query` and `outlook` answer "the league’s scoring is still being applied"; the screens query again when it is done. New rules for a league already scored apply in place as before. `d27d2bd`: the team and player defaults wait while my top scorer's query fails, not only while it loads (the team dashboard had fallen back to ARI).

Final review (fresh reviewer, Opus): no Critical; 2 Important and 3 Minor findings, all fixed:

- (Important) `2344904`: a defender's quarter and down splits passed the engine's 1,000-row cap (a season of DBs has about 1,500 player-quarters), so rows were cut: blank cells or shifted ranks for every 2025 DB, 193 of 194 DL, 98 of 161 LB. The engine's `MAX_LIMIT` is 5,000 now (the JSON Schema too), and the position queries ask for it; re-measured on live data, no player affected.
- (Important) `4bc49d3`: with and without a teammate listed his team now in every season (DJ Moore, CHI in 2025, offered Buffalo's players). It takes the team of his row in scope.
- (Minor) `56e0971`: a default waiting on a failed query says why instead of a bare "Loading…". `0bb1e6f`: the Forecast no longer flashes "Not in your league’s player list." while the link is read (`usePlayerLink` is undefined meanwhile). `928a4f8`: a player with no row yet in the current season (PUP) reads "Did not play" for his team's games, not "Bye". `fb462c6`: in the rail, the last position picked wins, and a player chosen since cancels a pick.

Deferred: nothing. The tests: 1,035 passed, 5 skipped (1,032 in a clean checkout).

Note for later walk-throughs: Task 7 copies `base.duckdb`, which holds no league points, so the league run starts with the first scoring (Players waits until the startup refresh sends the league). Time the app on a copy the app has already scored.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dashboard for every player (spec §9.4), in Companion Stats, built on the design handoff's player profile.

- Players in the Stats nav opens it, on my top fantasy scorer (else the leading WR). A player row on a leaderboard, a home board or a team dashboard's tables opens it too, and so does a Fantasy player file's "Full stats ↗".
- The handoff's frame:
  - a rail of the position's qualified players (nine positions, a search, a rank-by metric, ↑ / ↓);
  - a header: Sleeper's headshot, position, team, games in range, the status tag (IR, Q, OUT …), the fantasy rank under the scoring, number, age, season, draft, college, size;
  - with a league, the owner chip that opens his Fantasy file.
- The spec's tabs by position group:
  - **Overview:** the handoff's tiles and percentile rankings, fantasy points by week against expected, the season and career lines.
  - **Stat tabs** (Passing, Under pressure, Rushing, Usage, Receiving, vs Coverage, Kicking, Punting, Pass rush, Coverage, Run defense & tackling): stat lines ranked among the position's qualified players.
  - **Game log:** every week of the range, results from his team's side.
  - **Splits:** home and road, last 4, quarter, score, down, red zone, and the position's play splits, ranked in each split; by opponent; with and without a teammate.
  - **Forecast:** the next matchup, the projections (with a league), range of outcomes, role, running hot or cold, schedule, stability-weighted rates.
  - **Profile:** bio, combine percentiles, athletic score, Speed Score, career by season.
- The engine gains home and road games (`scope.home`), counts "without a player on the field" only on plays participation lists, and serves a player's bio and status (`stats.player`). Fantasy and Stats map players through the league's id map (`stats.link`).
- Ship `v0.30.0`.

**Architecture:**

- **Engine** (`src/main/stats/engine/`): `scope.home` in `compile.ts` (the type and the JSON Schema too); `withoutOnField` on participation-known plays; `player.ts`, the `player` read (worker, service, client, protocol, IPC, preload).
- **Main:** `playerLink` (`src/main/db/repos/ownership.ts`) behind `stats.link`.
- **Renderer model** (`src/renderer/src/lib/stats/player.ts`, pure and unit-tested):
  - position groups and their tabs, each stat tab's sections of lines (metric, split, label);
  - the queries, one per split over the position, and lines ranked among the pool his position's leaderboard qualifies (`team.ts`'s `statLine` and `teamRank` take an `among` filter);
  - the rail, the header, the tiles, the fantasy rank;
  - the game log, the splits table, opponents and teammates;
  - the Forecast's views (matchup, outlook, shrunk rates, projections) and the Profile's (combine, career).
- **Shared parts** (`src/renderer/src/components/stats/parts.tsx`): the mono table, section head, loading line, player name (a button when it opens a dashboard), shaded split cell and the headshot, moved out of the team dashboard. `StatLines` sections take a note. Hooks in `useStats.ts`: `usePlayerBio`, `usePlayerOutlook`, `useSeasonGames`, `usePlayerLink`, `useFantasyDetail`; `useStatsData` says when the rosters arrived.
- **Screens:**
  - `PlayerRail` (`components/stats/PlayerRail.tsx`) and `StatsPlayer` (`screens/stats/StatsPlayer.tsx`): the header, the tabs, each tab's body.
  - `StatsApp` keeps the player and the tab, opens the dashboard from the nav, the leaderboards, the home and the team dashboard, and a focus from Fantasy. `StatsNav`: Players is the dashboard.
- **Both products:** `src/renderer/src/lib/productLinks.ts` (a context App provides); the player file's "Full stats ↗"; App switches products with a focus each way.

**Tech Stack:** Electron 39, React 19, Tailwind 4, `radix-ui` (HoverCard), `lucide-react`, TypeScript strict, Vitest (jsdom for components), DuckDB (`@duckdb/node-api`) in the stats worker. No chart library: the chart is Plan AB's SVG `WeekChart`.

**Spec:** `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`: §9.4, §9.6 and §11 (the Plan AC row of §12), §7.1 for home and road games. Amended by this plan: Task 6 writes the amendments into the spec as §21.

**Design:** the handoff in `docs/design/FantasyCompanion UI/templates/two-products/design_handoff_companion/`:

- README "6. Player profile", `StatsProfile.dc.html` and `stats-model.js` (`VIEWS` tiles, `LOG` columns, the profile): the rail, the header, the tiles, the percentile rankings;
- README "3. Player file" and `FantasyPlayerPanel.dc.html`: the "Full stats ↗" pill;
- README "Tone rules": the injury tags, the matchup tone, the percentile chips.

The screens reference: `docs/reference/stats-screens.md`.

## Decisions (user, 2026-10-21)

- **The handoff's player profile is the frame.** Players in the nav opens a ranked rail beside the player's header and tabs, as the handoff draws it and as Plan AB did for teams. The player leaderboards move under "Player leaderboards →".
- **The header shows a photo:** Sleeper's headshot (the app already allows `sleepercdn.com`), the initials when there is none or it does not load.
- Write the plan now; execute it separately.

## Planning findings (live data, 2026-10-21)

Measured on a full `stats.duckdb` (2019 – 2026 week 6, a fresh v0.29.1 backfill) with the code in this plan, and in the built app on scratch profiles (`--user-data-dir`), unless it says otherwise.

- **Speed is inside the budget** (§11: dashboard first paint ≤ 300 ms; a situational query ≤ 1 s).

| Measure                                                                    | Result                                                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A tab's queries at once, over the position (warm, nine positions, 2025–26) | Overview 23–131 ms, stat tabs 21–136 ms, Game log 23–80 ms, Profile 72–137 ms |
| Splits (10–16 queries)                                                     | 181–342 ms                                                                    |
| Forecast (the outlook, the defense, the shrunk rates)                      | 197–252 ms                                                                    |
| The `player` read                                                          | 35–65 ms                                                                      |
| In the app: Players to the Overview on screen                              | 229–289 ms                                                                    |
| In the app: a tab from click to content                                    | 72–133 ms; Forecast 191 ms; Profile 111–121 ms                                |
| In the app: Splits from click to content                                   | 266–270 ms (a lineman's 342–478 ms)                                           |
| In the app: a rail position to its leader's Overview                       | 135–273 ms                                                                    |

- **A rank needs the position.** As Plan AB found for teams: a query filtered to the player ranks him 1st of 1. Each line asks for every player at his position (one query per split) and ranks him among the players his position's leaderboard qualifies (Plan AA's tab qualifier) who also meet the metric's own sample. 2025 pools: QB 38, RB 63, WR 110, TE 48, K 29, P 31, DL 194, LB 161, DB 229; 2026 week 6: 34, 66, 106, 46, 31, 33, 181, 168, 223.
- **Splits in the same budget.** Twelve split queries over every WR take 330 ms at once, and filtering them to one player saves little (200 ms): the plays are scanned either way. Quarters, downs and man / zone are one grouped query each, so a tab sends 10–16 queries.
- **No home / road filter.** `player_week` and `team_week` carry `home`, and a play's game is in `games`, so `scope.home` is a few lines (amendment C). Cook 2026: 57 carries at home, 60 on the road, 117 in all.
- **"Without him on the field" counted plays participation does not cover.** The walk-through showed James Cook 2026 "without Dawson Knox": 627 yards, all of his. Participation for the current season is published after it ends, so every 2026 play passed `NOT EXISTS (on_field …)`. The filter now needs the play listed (amendment C).
- **Status now.** `src_rosters`' latest week (2026 week 7) has the reserve lists in `status_description_abbr`; checked against known cases: R01 / R48 injured reserve (Davante Adams), R04 PUP (Aiyuk, Chubb in 2024, Micah Parsons now), R05 non-football injury (Mixon 2025), R40 suspended (Addison, Rice 2025). The week's injury report starts with practice (Wednesday) and gains a game status on Friday. 70 of the 1,000 players with 2026 fantasy points carry a status. The read takes 35–65 ms.
- **Names.** nflverse's `first_name` is the legal one: "John Stafford", "William Anderson". The header splits the display name, as the handoff does ("Matthew", "Stafford"; "Will", "Anderson Jr.").
- **Empty lines and why.** NGS and ESPN QBR publish players over their own minimums: 8 qualified 2025 QBs have no QBR, about 50 WR seasons no separation, several RBs no RYOE. Such lines say "No NFL Next Gen Stats value for him." A participation split in 2026 says "Not published for 2026 yet."; an FTN one before 2022 "Charted from 2022.". The live sweep (Task 7) finds no empty line without a reason across every qualified player of 2025 and 2026.
- **A played week without a team.** 69 of 190,218 played player-weeks have no `team` in `player_week` (Eddy Pineiro, 2025 week 1); the game log takes the team of his nearest game, and every played game of every qualified player then shows its result.
- **The matchup tone.** The defense's ranks read as defenses ("1st allows the least"), so a plain pill shaded a tough matchup green. The Forecast flips the shading to the player's side, as the handoff's matchup tone says (a stingy defense red).
- **Teammates.** The most-snapped teammate is a lineman on for every snap: "without" him is empty. The list puts receivers and backs first, then quarterbacks, then linemen.
- **The fantasy side agrees.** With the dev league, Jahmyr Gibbs' Forecast shows Sleeper's 25.5 next week, 309.1 rest of season (RB1) and FantasyPros RB1, as his Fantasy file does. My top scorer on 2026-10-21 is James Cook (BUF).
- **Rosters before the default.** Without waiting for the league's rosters, the dashboard opened on the leading WR before my top scorer was known (the team dashboard had the same flash, a Plan AB minor). `useStatsData` now says when the rosters arrived.
- **The app runs here.** The walk-through (Task 7 Step 3) drives the built app over the DevTools protocol with Plan AA's driver, on a copy of the dev league and without one, light and dark: every position group's tabs, 2024 for participation, the leaderboard, home and team routes, and both products' links.

## Spec amendments (taken in this plan)

Task 6 Step 3 records these in the spec as §21. **Confirm them with the user before starting Task 1** if they have not been approved yet.

- **A. The handoff's player profile is the dashboard's frame (§9.4, §9.6).** A rail (the nine positions, a search, a rank-by metric, the qualified players best first with the value shaded by percentile; ↑ / ↓ or J / K) beside the profile: a header with Sleeper's headshot (initials when it does not load), the handoff's tiles and percentile rankings opening the Overview, then the spec's tabs by position group.
  - Players in the nav opens it on the player viewed last; the first time, on my top fantasy scorer in range, else the leading WR. With a league, the default waits for the rosters (the team dashboard's too: no flash of the first team). Picking a position in the rail opens its leader.
  - The player leaderboards are under "Player leaderboards →" and the home's "All →". A player row there, on a home board or in a team dashboard's tables opens the dashboard.
  - The name is the one he goes by (nflverse's `first_name` is the legal one: John for Matthew Stafford). His age is his age that season.
- **B. Ranks are among the position.** Each line asks for every player at his position and ranks him among those his position's leaderboard qualifies (§18 D) who also meet the metric's own sample, "4th of 110"; ties as §19 B. Below the qualifier, values without ranks. "Lg" is the qualified players' mean.
- **C. Splits (§9.4, §7.1).** The engine gains `scope.home` (home or road games; qualification counts half the weeks). The Splits tab: all, home, away, last 4 games, each quarter and down (one grouped query each), red zone and score state, then pressured and clean pocket, blitzed or not and play action (QB) or man and zone (WR, TE); each cell ranked among the position's qualified players in the same split. Then his rows by opponent, and with and without a teammate on the field (participation; receivers and backs first in the list, a lineman on for every snap leaves "without" empty). `situation.withoutOnField` now counts only plays participation lists: before, every play of the current season (no participation yet) counted as one without him.
- **D. The game log** reads his weekly rows with their opponent and each result from the side of the team he played for that week. A week without his row is a bye, or "Did not play", for the team he played for nearest that week. 69 of 190,218 played player-weeks (0.04 %) have no team in `player_week`; the log takes the team of his nearest game.
- **E. Forecast (offense).** The next game and its defense against the position, ranked among the 32 with the handoff's matchup tone (a stingy defense reads red). With a league and in the current season, Fantasy's file gives Sleeper's projection of the next game, the rest of the season and its rank, and FantasyPros' rank (the league's scoring); without one, a line says a league adds them. Then §8.5: the range of outcomes, role (the last 4 games against the games before), running hot or cold, the schedule from here, and the core rates raw and shrunk (the stability-weighted profile).
- **F. The status now** comes from a new read, `stats.player`: the latest roster week's reserve list (`src_rosters` R01 / R48 injured reserve, R04 PUP, R05 non-football injury, R40 suspended, another RES "Reserve") or the latest week's injury report (Out, Doubtful, Questionable; a missed or limited practice before a game status). The latest season only. Fantasy's Sleeper injury status is not used: Stats works without a league.
- **G. The two products link (§9.4).** The player file gains the handoff's "Full stats ↗" (a team defense opens its team dashboard). The dashboard gains the handoff's owner chip ("On your fantasy team", "Rostered by …", "Free agent in your league"), which opens his Fantasy file, for QB, RB, WR, TE and K only (no IDP in Fantasy, §13). The ids map through the league's `player_ids` (`stats.link`).
- **H. What the data cannot give.** A line a source left a player out of says so ("No NFL Next Gen Stats value for him.": NGS and ESPN QBR publish players over their own minimums); a split whose source has nothing for the season says "Not published for 2026 yet." or "Charted from 2022.". Compare stays disabled until Plan AD. Counts are totals (no per-game switch on the dashboard).
- **I. Measured** (2026 week 6): each tab's queries 21–137 ms, Splits (10–16 queries) 181–342 ms, Forecast 197–252 ms with the outlook; in the app, Players 230–290 ms from click to the Overview, a tab 70–135 ms, Splits 265–480 ms, a rail position 135–275 ms (budgets 300 ms, and 1 s for situational queries, §11).

## Global Constraints

- **Branch** `feat/player-dashboard-ac` off `main`.
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
- **Test counts** are those of a clean checkout (`main`: 978 passed, 5 skipped). In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3.
- **Scope.**
  - The fantasy screens change only by the player file's "Full stats ↗" pill; App only by the product links.
  - The stats engine changes by `scope.home` and the `withoutOnField` fix (Task 1); the worker gains the `player` read. The team dashboard changes only by its player names opening the player dashboard, the shared parts, and waiting for the rosters before its default team.
  - Compare stays disabled (Plan AD). No explorer or trends (AD), no matchups (AE): Games stays disabled. No IDP in Fantasy (§13): defenders get no Fantasy chip.
- **Network.** No test touches the network. Task 7's live check opens a copy of the live database offline; its app runs refresh their scratch profiles, and the headshots load from `sleepercdn.com`.
- **Gates.**
  - **Task 7:** the live check ends with `ALL GATES PASSED`, and every screenshot of the walk-through shows what its checklist says.
  - **Task 8 Step 2:** the Windows suite and self-test on the Package check workflow.
  - If a gate fails, stop and report the numbers or the screenshot to the user.
- **Release** `v0.30.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push**: `check/plan-ac` in Task 8, then `main` and the tag.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **A rank against the wrong population.** Examples: a player ranked among himself, among every player with a game, or a TE among WRs; a split ranked among everyone in it.
   - Task 2: `poolOf`, `playerSectionViews` (the pool and the metric's own sample), `splitTable`.
   - Task 4: the queries the screen sends never filter the player where a rank needs the position.
2. **A game read from the wrong side or the wrong team.** Examples: a road game written as home; a traded player's old team's results; a week a source left without his team; a bye shown as a game he missed; postseason weeks mislabelled.
   - Task 2: `gameLog` with a trade, a bye, a missed game, a team-less week, the postseason.
   - Task 7: every played game of every qualified player has its result.
3. **The wrong player opens, or another flashes first.** Examples: the leading WR before my top scorer when the rosters load late; a focus from Fantasy whose position is unknown until the bio arrives; a position picked in the rail.
   - Task 4: with and without a roster; the rail's position pick. Task 5: a focus opens the player (his tabs from his bio).
4. **An empty line that does not say why.** Examples: participation in the current season, FTN before 2022, a source that left him out.
   - Task 2: `playerLine`'s reasons. Task 7: the sweep over every qualified player.
5. **The wrong player across products.** Examples: a Sleeper id mapped to another gsis, a defense opened as a player, a defender with a Fantasy chip, a link without a league.
   - Task 1: `playerLink` both ways (the rostered id first, a defense's team). Task 5: the pill, the chip, App's switch.
6. **A stale status.** Last week's "Out", 2025's suspension, today's IR on a 2024 page. Task 1: the read takes the latest week only. Task 2: no tag on a past season.
7. **The engine changes leak.** `scope.home` must keep the right half at the week and the play grains and scale qualification; `withoutOnField` must drop only unlisted plays. Task 1: run and compile tests.
8. **AA's and AB's screens regress.** Players in the nav, a leaderboard row, a home board's row and the team dashboard's names now open the player dashboard; the team dashboard's parts moved to `parts.tsx`.
   - Task 4 keeps the AA and AB app tests green and adds the routes.
9. **Too slow.** Splits sends up to 16 queries. Task 7: every tab within budget, in the worker and in the app.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/player-dashboard-ac
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/player-dashboard-ac`.

---

### Task 1: A player read, home and road games (spec §7.1, §9.4; amendments C, F, G)

The engine splits home games from road games and counts "without a player on the field" only on plays participation lists. The worker serves a player's identity and status now, and main maps a player between the two products.

**Files:**

- Create: `src/main/stats/engine/player.ts`, `tests/main/stats/engine/player.test.ts`
- Modify: `src/main/db/repos/ownership.ts`, `src/main/ipc/handlers.ts`, `src/main/stats/client.ts`, `src/main/stats/engine/compile.ts`, `src/main/stats/protocol.ts`, `src/main/stats/service.ts`, `src/main/stats/worker.ts`, `src/preload/index.ts`, `src/shared/ipc.ts`, `src/shared/stats/querySchema.ts`, `src/shared/stats/types.ts`, `tests/main/db/ownershipRepo.test.ts`, `tests/main/stats/engine/compile.test.ts`, `tests/main/stats/engine/run.test.ts`, `tests/main/stats/service.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/main/stats/engine/player.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { playerBio } from '@main/stats/engine/player'
import { openTestDb } from '../../../fixtures/stats'
import { seedTable, type Row } from '../../../fixtures/statsDerived'

const CHASE = '00-0036900'
const ADAMS = '00-0031381'
const RICE = '00-0039004'

async function seeded(): Promise<Awaited<ReturnType<typeof openTestDb>>> {
  const db = await openTestDb()
  const player = (gsis_id: string, name: string, over: Row = {}): Row => ({
    gsis_id,
    name,
    first_name: name.split(' ')[0],
    last_name: name.split(' ').slice(1).join(' '),
    position: 'WR',
    birth_date: '2000-03-01',
    height: 72,
    weight: 205,
    college: 'LSU',
    draft_year: 2021,
    draft_round: 1,
    draft_pick: 5,
    draft_team: 'CIN',
    rookie_season: 2021,
    team: 'CIN',
    sleeper_id: '7564',
    ...over
  })
  await seedTable(db, 'players', [
    player(CHASE, "Ja'Marr Chase"),
    player(ADAMS, 'Davante Adams', {
      draft_year: null,
      draft_round: null,
      draft_pick: null,
      team: 'LV',
      sleeper_id: null
    }),
    player(RICE, 'Rashee Rice', { team: 'KC' })
  ])
  const roster = (gsis_id: string, season: number, week: number, over: Row = {}): Row => ({
    gsis_id,
    season,
    week,
    team: 'CIN',
    jersey_number: 1,
    status: 'ACT',
    status_description_abbr: 'A01',
    ...over
  })
  await seedTable(db, 'src_rosters', [
    roster(CHASE, 2025, 18),
    roster(CHASE, 2026, 6),
    roster(CHASE, 2026, 7),
    // Adams went on injured reserve in week 7; Rice was suspended in 2025 and is back.
    roster(ADAMS, 2026, 7, {
      team: 'LA',
      jersey_number: 17,
      status: 'RES',
      status_description_abbr: 'R01'
    }),
    roster(RICE, 2025, 3, { team: 'KC', status: 'RES', status_description_abbr: 'R40' }),
    roster(RICE, 2026, 7, { team: 'KC' })
  ])
  const report = (gsis_id: string, season: number, week: number, over: Row = {}): Row => ({
    gsis_id,
    season,
    week,
    report_status: null,
    report_primary_injury: null,
    practice_primary_injury: 'Hamstring',
    practice_status: 'Limited Participation in Practice',
    ...over
  })
  await seedTable(db, 'src_injuries', [
    report(CHASE, 2026, 7, { report_status: 'Questionable', report_primary_injury: 'Ankle' }),
    // Last week's report is over.
    report(RICE, 2026, 6, { report_status: 'Out' })
  ])
  await seedTable(db, 'player_season', [
    { gsis_id: CHASE, season: 2021, games: 17 },
    { gsis_id: CHASE, season: 2026, games: 6 },
    { gsis_id: CHASE, season: 2024, games: 17 },
    { gsis_id: CHASE, season: 2025, games: 0 }
  ])
  return db
}

describe('a player’s identity and status (stats-analysis spec §9.4)', () => {
  it('reads the bio, the draft, his team and number now, the seasons he played', async () => {
    const bio = await playerBio(await seeded(), { player: CHASE })
    expect(bio).toMatchObject({
      id: CHASE,
      name: "Ja'Marr Chase",
      firstName: "Ja'Marr",
      lastName: 'Chase',
      position: 'WR',
      team: 'CIN',
      jersey: 1,
      birthDate: '2000-03-01',
      height: 72,
      weight: 205,
      college: 'LSU',
      draft: { year: 2021, round: 1, pick: 5, team: 'CIN' },
      rookieSeason: 2021,
      seasons: [2021, 2024, 2026],
      sleeperId: '7564'
    })
  })

  it('reports the latest week’s injury report, practice and game status', async () => {
    expect((await playerBio(await seeded(), { player: CHASE })).status).toEqual({
      season: 2026,
      week: 7,
      reserve: null,
      report: 'Questionable',
      practice: 'Limited',
      injury: 'Ankle'
    })
  })

  it('reports a reserve list from the latest roster week only', async () => {
    const db = await seeded()
    const adams = await playerBio(db, { player: ADAMS })
    expect(adams).toMatchObject({ team: 'LA', jersey: 17, draft: null, sleeperId: null })
    expect(adams.status).toMatchObject({ reserve: 'IR', report: null, week: 7 })
    // Suspended in 2025, healthy now; last week's "Out" is not this week's.
    expect((await playerBio(db, { player: RICE })).status).toBeNull()
  })

  it('refuses an id that is not a gsis id, and says when there is no such player', async () => {
    const db = await seeded()
    await expect(playerBio(db, { player: "x' OR 1=1" })).rejects.toThrow('gsis id')
    await expect(playerBio(db, { player: '00-0000000' })).rejects.toThrow('no player 00-0000000')
  })
})
```

```diff
diff --git a/tests/main/stats/engine/compile.test.ts b/tests/main/stats/engine/compile.test.ts
index 6f3c554..6cddf08 100644
--- a/tests/main/stats/engine/compile.test.ts
+++ b/tests/main/stats/engine/compile.test.ts
@@ -34,6 +34,10 @@ describe('compileQuery (stats-analysis spec §7.2)', () => {
     refuses({ metric: 'targets' } as never, 'unknown query field "metric"')
     refuses({ situation: { fieldZone: 'toString' as never } }, /fieldZone must be/)
     refuses({ sort: null as never }, 'sort must be { metric, dir }')
+    refuses(
+      { scope: { seasons: [2025], home: 'yes' as never } },
+      'scope.home must be true or false'
+    )
   })

   it('reads the season tables, the weekly ones, or the plays, as the query needs', () => {
@@ -44,6 +48,7 @@ describe('compileQuery (stats-analysis spec §7.2)', () => {
     expect(compile({ groupBy: ['team'] }).grain).toBe('week')
     // A traded player's season row holds both teams' games: a team filter reads the weeks.
     expect(compile({ scope: { seasons: [2025], teams: ['KC'] } }).grain).toBe('week')
+    expect(compile({ scope: { seasons: [2025], home: true } }).grain).toBe('week')
     expect(compile({ situation: { down: [3] } }).grain).toBe('play')
     expect(compile({ groupBy: ['personnel'] }).grain).toBe('play')
     expect(compile({}).sql).toContain('FROM player_season w')
@@ -74,6 +79,8 @@ describe('compileQuery (stats-analysis spec §7.2)', () => {
     expect(compile({ scope: { seasons: [2025], opponents: ['DET', 'GB'] } }).rowWeeks(18, 1)).toBe(
       2
     )
+    // Home or road: half the games.
+    expect(compile({ scope: { seasons: [2025], home: false } }).rowWeeks(18, 1)).toBe(9)
   })

   it('notes coverage the answer depends on', () => {
```

```diff
diff --git a/tests/main/stats/engine/run.test.ts b/tests/main/stats/engine/run.test.ts
index e5f40ac..5dce516 100644
--- a/tests/main/stats/engine/run.test.ts
+++ b/tests/main/stats/engine/run.test.ts
@@ -133,6 +133,59 @@ describe('runQuery (stats-analysis spec §7)', () => {
     expect(await sum(false)).toEqual([8 + 16 + 32 + 64, 4])
   })

+  it('splits home games from road games, by the weeks and by the plays', async () => {
+    const db = await seeded()
+    // Week 1: BUF hosts KC.
+    const carries = async (
+      home: boolean,
+      situation?: StatsQuery['situation']
+    ): Promise<unknown[]> => {
+      const r = await runQuery(
+        db,
+        {
+          entity: 'player',
+          metrics: ['carries'],
+          scope: { seasons: [2025], positions: ['RB'], home },
+          ...(situation ? { situation } : {})
+        },
+        CTX
+      )
+      return r.rows.map((x) => [x.id, x.values.carries.raw])
+    }
+    expect(await carries(true)).toEqual([[RB, 1]])
+    expect(await carries(false)).toEqual([[KC_RB, 1]])
+    expect(await carries(true, { quarter: [1] })).toEqual([[RB, 1]])
+    expect(await carries(false, { quarter: [1] })).toEqual([[KC_RB, 1]])
+    const team = await runQuery(
+      db,
+      { entity: 'team', metrics: ['off_epa_play'], scope: { seasons: [2025], home: false } },
+      CTX
+    )
+    expect(team.rows.map((x) => x.id)).toEqual(['KC'])
+  })
+
+  it('counts plays without a player on the field only where participation lists the play', async () => {
+    const db = await seeded()
+    const carries = async (without: string): Promise<unknown[]> => {
+      const r = await runQuery(
+        db,
+        {
+          entity: 'player',
+          metrics: ['carries'],
+          scope: { seasons: [2025], players: [RB] },
+          situation: { withoutOnField: [without] }
+        },
+        CTX
+      )
+      return r.rows.map((x) => x.values.carries.raw)
+    }
+    // Play 3, his carry: KC's back was not on the field.
+    expect(await carries(KC_RB)).toEqual([1])
+    // Participation not published for the play: not a play without him.
+    await db.exec('DELETE FROM on_field WHERE play_id = 3')
+    expect(await carries(KC_RB)).toEqual([])
+  })
+
   it('scales qualification to the share of plays each situational row keeps', async () => {
     const db = await seeded()
     const shares = async (q: Partial<StatsQuery>): Promise<unknown[]> => {
```

```diff
diff --git a/tests/main/stats/service.test.ts b/tests/main/stats/service.test.ts
index d1b0266..650fc6d 100644
--- a/tests/main/stats/service.test.ts
+++ b/tests/main/stats/service.test.ts
@@ -136,6 +136,10 @@ describe('the service reads and the league rules (stats-analysis spec §5, §7)'
       expect((await after.query(elo)).rows.map((r) => r.id)).toEqual(['BUF', 'KC'])
       expect((await after.games({ season: 2025 })).map((g) => g.gameId)).toEqual(['g1', 'g2'])
       expect((await after.outlook({ player: WR, season: 2025 })).team).toBe('BUF')
+      expect(await after.player({ player: WR })).toMatchObject({
+        name: 'Wes Wideout',
+        seasons: [2025]
+      })
       expect((await after.catalogue()).find((m) => m.id === 'win_pct')?.stability).toMatchObject({
         prior: 3,
         reliability: 'medium'
```

```diff
diff --git a/tests/main/db/ownershipRepo.test.ts b/tests/main/db/ownershipRepo.test.ts
index 4e4a783..dc03d6c 100644
--- a/tests/main/db/ownershipRepo.test.ts
+++ b/tests/main/db/ownershipRepo.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from 'vitest'
-import { leagueOwnership } from '@main/db/repos/ownership'
+import { leagueOwnership, playerLink } from '@main/db/repos/ownership'
 import { replacePlayerIds, type PlayerIdRecord } from '@main/db/repos/playerIds'
 import { seedLeague } from '../../fixtures/db'

@@ -41,3 +41,43 @@ describe('league ownership', () => {
     expect(leagueOwnership(seedLeague(), 'L9')).toEqual({ players: {}, teams: {} })
   })
 })
+
+describe('the same player in both products', () => {
+  const seeded = (): ReturnType<typeof seedLeague> => {
+    const db = seedLeague()
+    replacePlayerIds(
+      db,
+      [
+        // 7564 is on a roster; 1234 shares his gsis id and is on none.
+        ids('1234', { gsisId: '00-0036900' }),
+        ids('7564', { gsisId: '00-0036900' }),
+        ids('LAR', { nflverseTeam: 'LA', resolution: 'team' }),
+        ids('9509', { resolution: 'unresolved' })
+      ],
+      't'
+    )
+    return db
+  }
+
+  it('finds a Sleeper id’s gsis id, or a defense’s team', () => {
+    const db = seeded()
+    expect(playerLink(db, { sleeper: '7564' })).toEqual({
+      sleeper: '7564',
+      gsis: '00-0036900',
+      team: null
+    })
+    expect(playerLink(db, { sleeper: 'LAR' })).toEqual({ sleeper: 'LAR', gsis: null, team: 'LA' })
+    expect(playerLink(db, { sleeper: '9509' })).toBeNull()
+    expect(playerLink(db, { sleeper: 'nope' })).toBeNull()
+  })
+
+  it('finds a gsis id’s Sleeper id, the rostered one first', () => {
+    const db = seeded()
+    expect(playerLink(db, { gsis: '00-0036900' })).toEqual({
+      sleeper: '7564',
+      gsis: '00-0036900',
+      team: null
+    })
+    expect(playerLink(db, { gsis: '00-0000000' })).toBeNull()
+  })
+})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/main/stats/engine/player.test.ts tests/main/stats/engine/run.test.ts tests/main/stats/engine/compile.test.ts tests/main/stats/service.test.ts tests/main/db/ownershipRepo.test.ts
```

Expected: FAIL. 8 failed | 21 passed, and `player.test.ts` does not load:

- `@main/stats/engine/player` does not exist;
- `playerLink is not a function` (twice), and the service has no read (`after.player is not a function`);
- the engine refuses `home`: `unknown scope field "home"` (three compile tests and the home / road run test);
- without a player on the field, a play participation does not list still counts: `expected [ 1 ] to deeply equal []`.

- [ ] **Step 3: Home and road games; plays without a player**

The types carry the player read too (used in Step 4).

```diff
diff --git a/src/shared/stats/types.ts b/src/shared/stats/types.ts
index 9f725eb..1ad8fc5 100644
--- a/src/shared/stats/types.ts
+++ b/src/shared/stats/types.ts
@@ -116,6 +116,8 @@ export interface StatsQuery {
     positions?: PositionGroup[]
     teams?: string[]
     opponents?: string[]
+    /** Home games (true) or road games (false): the schedule's home team, at a neutral site too. */
+    home?: boolean
     /** gsis ids */
     players?: string[]
     qualifiedOnly?: boolean
@@ -300,6 +302,63 @@ export interface PlayerOutlook {
   schedule: { opponents: string[]; easierBy: number | null }
 }

+/** A player's identity (spec §9.4): the dashboard's header and Profile. */
+export interface PlayerBioQuery {
+  /** gsis id */
+  player: string
+}
+
+/** Now (spec §9.4 header): on a reserve list, or on the latest week's injury report. */
+export interface PlayerStatus {
+  season: number
+  week: number
+  /** The latest roster's reserve list: injured reserve, PUP, non-football injury, suspended, other. */
+  reserve: 'IR' | 'PUP' | 'NFI' | 'Suspended' | 'Reserve' | null
+  /** The game status on the report (from Friday). */
+  report: 'Out' | 'Doubtful' | 'Questionable' | null
+  /** Practice that week: did not practice, limited, full. */
+  practice: 'DNP' | 'Limited' | 'Full' | null
+  /** The injury the report names ("Hamstring"). */
+  injury: string | null
+}
+
+export interface PlayerBio {
+  /** gsis id */
+  id: string
+  name: string
+  firstName: string | null
+  lastName: string | null
+  /** nflverse position: WR, CB, ILB, … */
+  position: string | null
+  /** His team on his latest roster, and his number there. */
+  team: string | null
+  jersey: number | null
+  /** YYYY-MM-DD */
+  birthDate: string | null
+  /** Inches and pounds. */
+  height: number | null
+  weight: number | null
+  college: string | null
+  draft: { year: number; round: number; pick: number; team: string | null } | null
+  rookieSeason: number | null
+  /** Seasons with a game, 2019 on, oldest first. */
+  seasons: number[]
+  /** Sleeper's id: the headshot. */
+  sleeperId: string | null
+  /** Null when healthy (or no longer on a roster). */
+  status: PlayerStatus | null
+}
+
+/**
+ * The same player in both products (spec §9.4): his Sleeper id in Fantasy; his gsis id in Stats, or
+ * the team's nflverse code for a team defense.
+ */
+export interface PlayerLink {
+  sleeper: string
+  gsis: string | null
+  team: string | null
+}
+
 /** Who rosters a player (or a team defense) in the imported league (spec §9.2). */
 export interface StatsOwner {
   /** The fantasy team's name. */
```

```diff
diff --git a/src/shared/stats/querySchema.ts b/src/shared/stats/querySchema.ts
index 98083ea..6a6f460 100644
--- a/src/shared/stats/querySchema.ts
+++ b/src/shared/stats/querySchema.ts
@@ -55,6 +55,10 @@ export function statsQuerySchema(metricIds: string[]): Schema {
     positions: list({ enum: [...POSITION_GROUPS] }, 'Position groups (players).'),
     teams: list(team, 'Team codes (nflverse: LA, LV, WAS, …).'),
     opponents: list(team, 'Opponent team codes.'),
+    home: {
+      type: 'boolean',
+      description: 'Home games (true) or road games (false), as the schedule lists the home team.'
+    },
     players: list(gsis, 'gsis player ids.'),
     qualifiedOnly: { type: 'boolean', description: 'Only rows over the metric’s minimum sample.' }
   }
```

```diff
diff --git a/src/main/stats/engine/compile.ts b/src/main/stats/engine/compile.ts
index 220f642..c27c8a8 100644
--- a/src/main/stats/engine/compile.ts
+++ b/src/main/stats/engine/compile.ts
@@ -168,6 +168,7 @@ const SCOPE_FIELDS = [
   'positions',
   'teams',
   'opponents',
+  'home',
   'players',
   'qualifiedOnly'
 ]
@@ -238,6 +239,7 @@ function validate(q: StatsQuery, ctx: CompileContext): Checked {
   }
   if (scope.teams !== undefined) texts(scope.teams, 'scope.teams', TEAM_CODE)
   if (scope.opponents !== undefined) texts(scope.opponents, 'scope.opponents', TEAM_CODE)
+  if (scope.home !== undefined) flag(scope.home, 'scope.home')
   if (scope.players !== undefined) texts(scope.players, 'scope.players', GSIS)
   if (scope.qualifiedOnly !== undefined) flag(scope.qualifiedOnly, 'scope.qualifiedOnly')
   const groupBy = q.groupBy ?? []
@@ -267,6 +269,7 @@ function validate(q: StatsQuery, ctx: CompileContext): Checked {
     scope.weeks !== undefined ||
     scope.lastNGames !== undefined ||
     scope.opponents !== undefined ||
+    scope.home !== undefined ||
     scope.teams !== undefined ||
     groupBy.some((g) => g !== 'season')
   ) {
@@ -395,7 +398,9 @@ function situationWhere(
   }
   if (s.withoutOnField !== undefined) {
     part()
-    where.push(`NOT EXISTS (${onField(texts(s.withoutOnField, 'situation.withoutOnField', GSIS))})`)
+    // Only plays participation lists: a play it does not cover is not one he sat out.
+    const ids = texts(s.withoutOnField, 'situation.withoutOnField', GSIS)
+    where.push(`${ON_FIELD_KNOWN} AND NOT EXISTS (${onField(ids)})`)
   }
   return where
 }
@@ -513,6 +518,7 @@ function tableAgg(
     if (entity) {
       if (q.scope.teams) where.push(`w.team IN ${params.list(q.scope.teams)}`)
       if (q.scope.opponents) where.push(`w.opponent IN ${params.list(q.scope.opponents)}`)
+      if (q.scope.home !== undefined) where.push(`w.home = ${params.add(q.scope.home)}`)
       if (player && q.scope.players) where.push(`w.gsis_id IN ${params.list(q.scope.players)}`)
     }
     if (!player && !season) where.push('w.games = 1')
@@ -661,6 +667,10 @@ function playAgg(
     }
     if (q.scope.teams) w.push(`${team} IN ${params.list(q.scope.teams)}`)
     if (q.scope.opponents) w.push(`${opp} IN ${params.list(q.scope.opponents)}`)
+    if (q.scope.home !== undefined) {
+      const side = q.scope.home ? 'home_team' : 'away_team'
+      w.push(`EXISTS (SELECT 1 FROM games g WHERE g.game_id = p.game_id AND g.${side} = ${team})`)
+    }
     if (player && q.scope.players) w.push(`${id} IN ${params.list(q.scope.players)}`)
     return w
   }
@@ -934,7 +944,9 @@ export function compileQuery(q: StatsQuery, ctx: CompileContext): Compiled {
       // A team meets an opponent about once a season.
       if (c.groupBy.includes('opponent')) return bySeason ? 1 : seasons
       if (q.scope.opponents) return q.scope.opponents.length * (bySeason ? 1 : seasons)
-      return bySeason ? weeks / Math.max(1, seasons) : weeks
+      // Home or road: about half the games.
+      const half = q.scope.home === undefined ? 1 : 0.5
+      return (bySeason ? weeks / Math.max(1, seasons) : weeks) * half
     },
     notes: [...notes]
   }
```

- [ ] **Step 4: The player read**

Create `src/main/stats/engine/player.ts`:

```ts
import type { PlayerBio, PlayerBioQuery, PlayerStatus } from '@shared/stats/types'
import type { StatsDb } from '../db'
import { inspect } from '../derived/build'
import { col } from '../models/load'
import { StatsQueryError } from './compile'

const GSIS = /^00-[0-9]{7}$/

/** nflverse roster codes of the reserve lists (`status_description_abbr` when `status` is RES). */
const RESERVE: Record<string, NonNullable<PlayerStatus['reserve']>> = {
  R01: 'IR',
  R48: 'IR',
  R04: 'PUP',
  R05: 'NFI',
  R40: 'Suspended'
}

const REPORT: Record<string, PlayerStatus['report']> = {
  Out: 'Out',
  Doubtful: 'Doubtful',
  Questionable: 'Questionable'
}

const PRACTICE: Record<string, PlayerStatus['practice']> = {
  'Did Not Participate In Practice': 'DNP',
  'Limited Participation in Practice': 'Limited',
  'Full Participation in Practice': 'Full'
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Spec §9.4 header and Profile: a player's identity (`players`), his team and number on his latest
 * roster, the seasons he played, and his status now: a reserve list on the latest roster week, or
 * the latest week's injury report (both only in the latest season, so a past injury is not shown).
 */
export async function playerBio(db: StatsDb, q: PlayerBioQuery): Promise<PlayerBio> {
  if (typeof q.player !== 'string' || !GSIS.test(q.player))
    throw new StatsQueryError('player must be a gsis id')
  const have = await inspect(db)
  if (!have.tables.has('players')) throw new StatsQueryError('the players table is not built yet')
  const p = await db.get<Record<string, unknown>>('SELECT * FROM players WHERE gsis_id = ?', [
    q.player
  ])
  if (!p) throw new StatsQueryError(`no player ${q.player}`)

  const r = col(have, 'src_rosters', 'r')
  const roster = have.tables.has('src_rosters')
    ? await db.get<Record<string, unknown>>(
        `WITH latest AS (
           SELECT season, max(week) AS week FROM src_rosters
           WHERE season = (SELECT max(season) FROM src_rosters) GROUP BY season)
         SELECT r.season, r.week, ${r('team', 'VARCHAR')} AS team, ${r('jersey_number')} AS jersey,
                ${r('status', 'VARCHAR')} AS status,
                ${r('status_description_abbr', 'VARCHAR')} AS code,
                r.season = l.season AND r.week = l.week AS now
         FROM src_rosters r, latest l WHERE r.gsis_id = ?
         ORDER BY r.season DESC, r.week DESC LIMIT 1`,
        [q.player]
      )
    : null
  const i = col(have, 'src_injuries', 'i')
  const report = have.tables.has('src_injuries')
    ? await db.get<Record<string, unknown>>(
        `WITH latest AS (
           SELECT season, max(week) AS week FROM src_injuries
           WHERE season = (SELECT max(season) FROM src_injuries) GROUP BY season)
         SELECT i.season, i.week, ${i('report_status', 'VARCHAR')} AS report,
                ${i('practice_status', 'VARCHAR')} AS practice,
                coalesce(${i('report_primary_injury', 'VARCHAR')},
                         ${i('practice_primary_injury', 'VARCHAR')}) AS injury
         FROM src_injuries i JOIN latest l ON i.season = l.season AND i.week = l.week
         WHERE i.gsis_id = ? ORDER BY report IS NULL LIMIT 1`,
        [q.player]
      )
    : null
  const seasons = have.tables.has('player_season')
    ? await db.all<{ season: number }>(
        'SELECT DISTINCT season FROM player_season WHERE gsis_id = ? AND games > 0 ORDER BY season',
        [q.player]
      )
    : []

  const reserve =
    roster?.now === true && roster.status === 'RES'
      ? (RESERVE[String(roster.code)] ?? 'Reserve')
      : null
  const reportStatus = REPORT[String(report?.report)] ?? null
  const practice = PRACTICE[String(report?.practice)] ?? null
  const status: PlayerStatus | null =
    reserve || reportStatus || practice === 'DNP' || practice === 'Limited'
      ? {
          season: Number(reserve ? roster!.season : report!.season),
          week: Number(reserve ? roster!.week : report!.week),
          reserve,
          report: reportStatus,
          practice,
          injury: text(report?.injury)
        }
      : null
  const year = num(p.draft_year)
  const round = num(p.draft_round)
  const pick = num(p.draft_pick)
  return {
    id: q.player,
    name: text(p.name) ?? q.player,
    firstName: text(p.first_name),
    lastName: text(p.last_name),
    position: text(p.position),
    team: text(roster?.team) ?? text(p.team),
    jersey: num(roster?.jersey),
    birthDate: text(p.birth_date)?.slice(0, 10) ?? null,
    height: num(p.height),
    weight: num(p.weight),
    college: text(p.college),
    draft:
      year !== null && round !== null && pick !== null
        ? { year, round, pick, team: text(p.draft_team) }
        : null,
    rookieSeason: num(p.rookie_season),
    seasons: seasons.map((s) => Number(s.season)),
    sleeperId: text(p.sleeper_id),
    status
  }
}
```

```diff
diff --git a/src/main/stats/protocol.ts b/src/main/stats/protocol.ts
index 180d095..599c119 100644
--- a/src/main/stats/protocol.ts
+++ b/src/main/stats/protocol.ts
@@ -1,5 +1,5 @@
 import type { ScoringRules } from '@shared/stats/scoring'
-import type { GamesQuery, OutlookQuery, StatsQuery } from '@shared/stats/types'
+import type { GamesQuery, OutlookQuery, PlayerBioQuery, StatsQuery } from '@shared/stats/types'

 export type StatsStepStatus = 'ok' | 'error' | 'skipped' | 'running' | 'interrupted'

@@ -46,7 +46,7 @@ export interface SelfTestResult {

 /**
  * Requests to the worker. `refresh`, `setLeague`, `selfTest` and `close` run one after another;
- * `query`, `catalogue`, `status`, `games` and `outlook` are reads and run at once, each on its own
+ * `query`, `catalogue`, `status`, `games`, `outlook` and `player` are reads and run at once, each on its own
  * connection (spec §2).
  */
 export type StatsRequest =
@@ -59,6 +59,7 @@ export type StatsRequest =
   | { id: number; kind: 'status' }
   | { id: number; kind: 'games'; query: GamesQuery }
   | { id: number; kind: 'outlook'; query: OutlookQuery }
+  | { id: number; kind: 'player'; query: PlayerBioQuery }

 /** The kinds that run at once instead of in turn. */
 export const READ_REQUESTS: ReadonlySet<StatsRequest['kind']> = new Set([
@@ -66,7 +67,8 @@ export const READ_REQUESTS: ReadonlySet<StatsRequest['kind']> = new Set([
   'catalogue',
   'status',
   'games',
-  'outlook'
+  'outlook',
+  'player'
 ])

 export type StatsReply =
```

```diff
diff --git a/src/main/stats/worker.ts b/src/main/stats/worker.ts
index a87e45d..c0d2579 100644
--- a/src/main/stats/worker.ts
+++ b/src/main/stats/worker.ts
@@ -34,6 +34,8 @@ async function handle(request: StatsRequest): Promise<unknown> {
       return service.games(request.query)
     case 'outlook':
       return service.outlook(request.query)
+    case 'player':
+      return service.player(request.query)
     case 'close':
       await service.close()
       service = null
```

```diff
diff --git a/src/main/stats/service.ts b/src/main/stats/service.ts
index f6f41a9..d341ecf 100644
--- a/src/main/stats/service.ts
+++ b/src/main/stats/service.ts
@@ -8,6 +8,8 @@ import type {
   GamesQuery,
   MetricInfo,
   OutlookQuery,
+  PlayerBio,
+  PlayerBioQuery,
   PlayerOutlook,
   StatsQuery,
   StatsResult,
@@ -19,6 +21,7 @@ import { createDownloads } from './download'
 import { StatsQueryError, type CompileContext } from './engine/compile'
 import { gameForecasts } from './engine/games'
 import { playerOutlook } from './engine/outlook'
+import { playerBio } from './engine/player'
 import { catalogueInfo, MODEL_SUMS, QUANTILES } from './engine/registry'
 import { runQuery } from './engine/run'
 import { modelsStale } from './models/build'
@@ -52,6 +55,8 @@ export interface StatsService {
   games(query: GamesQuery): Promise<GameForecast[]>
   /** Spec §8.5: a player's outlook. */
   outlook(query: OutlookQuery): Promise<PlayerOutlook>
+  /** Spec §9.4: a player's identity and status now. */
+  player(query: PlayerBioQuery): Promise<PlayerBio>
   /**
    * Stops a refresh now: aborts its download, interrupts its statement, and starts no other step.
    * A process must not exit while DuckDB runs a statement (Electron aborts), so closing cancels first.
@@ -269,6 +274,7 @@ export async function openStatsService(
         }
         return playerOutlook(conn, query, await contextOf(conn), await readStability(conn))
       }),
+    player: (query) => read((conn) => playerBio(conn, query)),
     status: () =>
       read(async (reader) => {
         const built = !(await derivedStale(reader))
```

```diff
diff --git a/src/main/stats/client.ts b/src/main/stats/client.ts
index 3678c11..ea76328 100644
--- a/src/main/stats/client.ts
+++ b/src/main/stats/client.ts
@@ -7,6 +7,8 @@ import type {
   GamesQuery,
   MetricInfo,
   OutlookQuery,
+  PlayerBio,
+  PlayerBioQuery,
   PlayerOutlook,
   StatsQuery,
   StatsResult,
@@ -37,6 +39,8 @@ export interface StatsClient {
   games(query: GamesQuery): Promise<GameForecast[]>
   /** Spec §8.5: a player's outlook. */
   outlook(query: OutlookQuery): Promise<PlayerOutlook>
+  /** Spec §9.4: a player's identity and status now. */
+  player(query: PlayerBioQuery): Promise<PlayerBio>
   /** Stops a running refresh, closes the database and ends the worker (after `CLOSE_TIMEOUT_MS` at most). */
   close(): Promise<void>
 }
@@ -99,6 +103,7 @@ export function startStatsWorker(
     status: () => request<StatsStatus>((id) => ({ id, kind: 'status' })),
     games: (query) => request<GameForecast[]>((id) => ({ id, kind: 'games', query })),
     outlook: (query) => request<PlayerOutlook>((id) => ({ id, kind: 'outlook', query })),
+    player: (query) => request<PlayerBio>((id) => ({ id, kind: 'player', query })),
     async close() {
       if (!dead) {
         let timer: NodeJS.Timeout | undefined
```

- [ ] **Step 5: The link and the IPC**

```diff
diff --git a/src/main/db/repos/ownership.ts b/src/main/db/repos/ownership.ts
index 8cc256c..1e5964f 100644
--- a/src/main/db/repos/ownership.ts
+++ b/src/main/db/repos/ownership.ts
@@ -1,4 +1,4 @@
-import type { StatsOwner, StatsOwnership } from '@shared/stats/types'
+import type { PlayerLink, StatsOwner, StatsOwnership } from '@shared/stats/types'
 import type { Db } from '../connection'

 interface OwnerRow {
@@ -31,3 +31,28 @@ export function leagueOwnership(db: Db, leagueId: string): StatsOwnership {
   }
   return { players, teams }
 }
+
+/**
+ * Stats-analysis spec §9.4: the same player in both products, from the league's id map
+ * (`player_ids`). A gsis id two Sleeper ids share opens the rostered one first.
+ */
+export function playerLink(db: Db, id: { sleeper: string } | { gsis: string }): PlayerLink | null {
+  const row = (
+    'sleeper' in id
+      ? db
+          .prepare(
+            `SELECT player_id, gsis_id, nflverse_team FROM player_ids
+             WHERE player_id = ? AND (gsis_id IS NOT NULL OR nflverse_team IS NOT NULL)`
+          )
+          .get(id.sleeper)
+      : db
+          .prepare(
+            `SELECT i.player_id, i.gsis_id, i.nflverse_team FROM player_ids i WHERE i.gsis_id = ?
+             ORDER BY EXISTS (SELECT 1 FROM roster_players rp WHERE rp.player_id = i.player_id) DESC,
+                      i.player_id
+             LIMIT 1`
+          )
+          .get(id.gsis)
+  ) as { player_id: string; gsis_id: string | null; nflverse_team: string | null } | undefined
+  return row ? { sleeper: row.player_id, gsis: row.gsis_id, team: row.nflverse_team } : null
+}
```

```diff
diff --git a/src/shared/ipc.ts b/src/shared/ipc.ts
index 2d77323..229980d 100644
--- a/src/shared/ipc.ts
+++ b/src/shared/ipc.ts
@@ -33,6 +33,9 @@ import type {
   LeaderboardBoard,
   MetricInfo,
   OutlookQuery,
+  PlayerBio,
+  PlayerBioQuery,
+  PlayerLink,
   PlayerOutlook,
   StatsOwnership,
   StatsQuery,
@@ -133,6 +136,13 @@ export interface Api {
     games(query: GamesQuery): Promise<GameForecast[]>
     /** A player's ceiling, floor, trend, regression flags and schedule (spec §8.5). */
     outlook(query: OutlookQuery): Promise<PlayerOutlook>
+    /** A player's identity and status now (spec §9.4). */
+    player(query: PlayerBioQuery): Promise<PlayerBio>
+    /**
+     * The same player in the other product (spec §9.4), from the league's id map: his gsis id
+     * (or a defense's team) from a Sleeper id, or his Sleeper id from a gsis id; null if unknown.
+     */
+    link(id: { sleeper: string } | { gsis: string }): Promise<PlayerLink | null>
     /** "Data through week N, updated <time>" (spec §5.3). */
     status(): Promise<StatsStatus>
     /** Fires when a rebuild finished: screens query again. Returns the unsubscribe function. */
@@ -188,6 +198,8 @@ export const IPC = {
   statsStatus: 'stats:status',
   statsGames: 'stats:games',
   statsOutlook: 'stats:outlook',
+  statsPlayer: 'stats:player',
+  statsLink: 'stats:link',
   statsChanged: 'stats:changed',
   statsOwnership: 'stats:ownership',
   statsViews: 'stats:views',
```

```diff
diff --git a/src/preload/index.ts b/src/preload/index.ts
index fdaedca..815ecff 100644
--- a/src/preload/index.ts
+++ b/src/preload/index.ts
@@ -81,6 +81,8 @@ const api: Api = {
     catalogue: () => ipcRenderer.invoke(IPC.statsCatalogue),
     games: (query) => ipcRenderer.invoke(IPC.statsGames, query),
     outlook: (query) => ipcRenderer.invoke(IPC.statsOutlook, query),
+    player: (query) => ipcRenderer.invoke(IPC.statsPlayer, query),
+    link: (id) => ipcRenderer.invoke(IPC.statsLink, id),
     status: () => ipcRenderer.invoke(IPC.statsStatus),
     onChanged: (listener) => {
       const handler = (): void => listener()
```

```diff
diff --git a/src/main/ipc/handlers.ts b/src/main/ipc/handlers.ts
index e745afd..5acf2d0 100644
--- a/src/main/ipc/handlers.ts
+++ b/src/main/ipc/handlers.ts
@@ -6,7 +6,7 @@ import { runEngine, runEngineStream } from '@main/engine/runEngine'
 import { listExpertRanks } from '@main/db/repos/expertRanks'
 import { getLeague, leagueRosterPositions } from '@main/db/repos/leagues'
 import { listMatchups } from '@main/db/repos/matchups'
-import { leagueOwnership } from '@main/db/repos/ownership'
+import { leagueOwnership, playerLink } from '@main/db/repos/ownership'
 import { playersOptions, playersWeek } from '@main/db/repos/playersWeek'
 import { latestPointsWeek, NO_POINTS_CONTEXT } from '@main/db/repos/points'
 import { getRules, saveRules } from '@main/db/repos/rules'
@@ -49,6 +49,9 @@ import type {
   LeaderboardBoard,
   MetricInfo,
   OutlookQuery,
+  PlayerBio,
+  PlayerBioQuery,
+  PlayerLink,
   PlayerOutlook,
   StatsOwnership,
   StatsQuery,
@@ -347,6 +350,14 @@ export function registerIpcHandlers(ctx: AppContext): void {
   ipcMain.handle(IPC.statsOutlook, (_event, query: OutlookQuery): Promise<PlayerOutlook> =>
     statsClient(ctx).outlook(query)
   )
+  ipcMain.handle(IPC.statsPlayer, (_event, query: PlayerBioQuery): Promise<PlayerBio> =>
+    statsClient(ctx).player(query)
+  )
+  ipcMain.handle(
+    IPC.statsLink,
+    (_event, id: { sleeper: string } | { gsis: string }): PlayerLink | null =>
+      playerLink(ctx.db, id)
+  )
   ipcMain.handle(IPC.statsStatus, (): Promise<StatsStatus> =>
     ctx.stats ? ctx.stats.status() : Promise.resolve(STATS_OFF)
   )
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run tests/main/stats/engine/player.test.ts tests/main/stats/engine/run.test.ts tests/main/stats/engine/compile.test.ts tests/main/stats/service.test.ts tests/main/db/ownershipRepo.test.ts
```

Expected: PASS (33 passed). Then `npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run`: clean; 986 passed | 5 skipped.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/main/db/repos/ownership.ts src/main/ipc/handlers.ts src/main/stats/client.ts src/main/stats/engine/compile.ts src/main/stats/engine/player.ts src/main/stats/protocol.ts src/main/stats/service.ts src/main/stats/worker.ts src/preload/index.ts src/shared/ipc.ts src/shared/stats/querySchema.ts src/shared/stats/types.ts tests/main/db/ownershipRepo.test.ts tests/main/stats/engine/compile.test.ts tests/main/stats/engine/player.test.ts tests/main/stats/engine/run.test.ts tests/main/stats/service.test.ts
git add src/main/db/repos/ownership.ts src/main/ipc/handlers.ts src/main/stats/client.ts src/main/stats/engine/compile.ts src/main/stats/engine/player.ts src/main/stats/protocol.ts src/main/stats/service.ts src/main/stats/worker.ts src/preload/index.ts src/shared/ipc.ts src/shared/stats/querySchema.ts src/shared/stats/types.ts tests/main/db/ownershipRepo.test.ts tests/main/stats/engine/compile.test.ts tests/main/stats/engine/player.test.ts tests/main/stats/engine/run.test.ts tests/main/stats/service.test.ts
git commit -m "feat(stats): read a player, split home games"
```

---

### Task 2: The dashboard’s model (spec §9.4; amendments A–F, H)

Everything the screen shows, as pure functions: position groups and their tabs, the lines ranked among the position, the rail, the header, the tiles, the game log, the splits, the Forecast's and the Profile's views.

**Files:**

- Create: `src/renderer/src/lib/stats/player.ts`, `tests/renderer/lib/statsPlayer.test.ts`
- Modify: `src/renderer/src/lib/stats/team.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/lib/statsPlayer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ageOn,
  bornOf,
  careerQuery,
  careerRows,
  combineView,
  defaultPlayer,
  fantasyRank,
  fantasyRankQuery,
  gameLog,
  gameLogQuery,
  kindOf,
  nextMatchup,
  opponentRows,
  outlookView,
  overviewSections,
  playerHeader,
  playerSectionQueries,
  playerSectionViews,
  playerTabs,
  poolOf,
  positionGroup,
  projectionView,
  railQuery,
  railRows,
  sectionsFor,
  shrunkRows,
  SPLIT_METRICS,
  splitTable,
  splitTableQueries,
  statusChip,
  tabFor,
  teammateOptions,
  tileViews,
  type PlayerSplitKey
} from '@/lib/stats/player'
import type { GameForecast, PlayerBio, PlayerOutlook, StatsResult } from '@shared/stats/types'
import type { PlayerDetail } from '@shared/types'
import { catalogueMap, result, row, STATUS, value } from '../../fixtures/statsScreens'

const byId = catalogueMap()
const scope = { season: 2026, seasonType: 'REG' as const, weeks: null, scoring: 'ppr' as const }

const BIO: PlayerBio = {
  id: 'p1',
  name: 'Ja’Marr Chase',
  firstName: 'Ja’Marr',
  lastName: 'Chase',
  position: 'WR',
  team: 'CIN',
  jersey: 1,
  birthDate: '2000-03-01',
  height: 72,
  weight: 205,
  college: 'LSU',
  draft: { year: 2021, round: 1, pick: 5, team: 'CIN' },
  rookieSeason: 2021,
  seasons: [2021, 2022, 2025, 2026],
  sleeperId: '7564',
  status: null
}

/** Four WRs; p3 is below the WR tab's qualifier (target share sample), p9 a TE. */
function receivers(metrics: string[], over: Record<string, number | null> = {}): StatsResult {
  const vals = (base: number, qualified = true): Parameters<typeof row>[2] =>
    Object.fromEntries(metrics.map((m) => [m, value(over[m] ?? base, { qualified, sample: 40 })]))
  return result(metrics, [
    row('p0', 'Top', vals(30)),
    row('p1', 'Mine', vals(20)),
    row('p3', 'Small', vals(50, false)),
    row('p2', 'Low', vals(10)),
    row('p9', 'Tight', vals(99), { position: 'TE' })
  ])
}

describe('the player dashboard model (stats-analysis spec §9.4)', () => {
  it('gives each position group its tabs, and keeps a tab its position has', () => {
    expect(playerTabs('QB').map((t) => t.label)).toEqual([
      'Overview',
      'Passing',
      'Under pressure',
      'Rushing',
      'Game log',
      'Splits',
      'Forecast',
      'Profile'
    ])
    expect(playerTabs('TE').map((t) => t.id)).toEqual(playerTabs('WR').map((t) => t.id))
    expect(playerTabs('WR').map((t) => t.label)).toContain('vs Coverage')
    expect(playerTabs('K').map((t) => t.label)).toEqual([
      'Overview',
      'Kicking',
      'Game log',
      'Profile'
    ])
    expect(playerTabs('P').map((t) => t.label)).toContain('Punting')
    expect(playerTabs('LB').map((t) => t.label)).toEqual([
      'Overview',
      'Pass rush',
      'Coverage',
      'Run defense & tackling',
      'Game log',
      'Splits',
      'Profile'
    ])
    expect(tabFor('splits', 'WR')).toBe('splits')
    expect(tabFor('splits', 'K')).toBe('overview')
    expect(tabFor('passing', 'RB')).toBe('overview')
    expect([positionGroup('CB'), positionGroup('ILB'), positionGroup('FB')]).toEqual([
      'DB',
      'LB',
      'RB'
    ])
    expect(kindOf('TE')).toBe('REC')
  })

  it('shows only the lines about the position, and no empty section', () => {
    // Coverage metrics are for LBs and DBs: a lineman's Coverage tab keeps what is on the ball.
    expect(sectionsFor('coverage', 'DL', byId).map((s) => s.title)).toEqual(['On the ball'])
    expect(sectionsFor('coverage', 'DB', byId)[0].lines.map((l) => l.metric)).toContain(
      'coverage_rating'
    )
    // Separation is NGS's for WR and TE only.
    const rb = sectionsFor('receiving', 'RB', byId).flatMap((s) => s.lines.map((l) => l.metric))
    expect(rb).not.toContain('separation')
    expect(overviewSections('QB', byId)[0].lines.map((l) => l.metric)).toContain('qb_epa_db')
  })

  it('asks the position once per split, each metric once, the qualifier in every tab', () => {
    const qs = playerSectionQueries(sectionsFor('pressure', 'QB', byId), 'QB', scope, STATUS)
    expect([...qs.keys()]).toEqual(['all', 'pressured', 'clean', 'noBlitz', 'blitz'])
    const all = qs.get('all')!
    expect(all.scope).toMatchObject({ seasons: [2026], positions: ['QB'] })
    expect(all.scope.players).toBeUndefined()
    expect(all.metrics).toContain('qb_epa_db')
    expect(new Set(all.metrics).size).toBe(all.metrics.length)
    expect(qs.get('pressured')!.situation).toEqual({ pressure: true })
    expect(qs.get('blitz')!.metrics).toEqual(['qb_success', 'cpoe'])
    // The splits table: game splits through the scope, grouped play splits in one query each.
    const t = splitTableQueries('WR', scope, STATUS)
    expect(t.get('home')!.scope.home).toBe(true)
    expect(t.get('last4')!.scope.lastNGames).toBe(4)
    expect(t.get('quarter')!.groupBy).toEqual(['quarter'])
    expect(t.get('coverage')!.groupBy).toEqual(['coverage'])
    expect(t.get('all')!.metrics).toContain('target_share')
    expect(splitTableQueries('RB', scope, STATUS).has('coverage')).toBe(false)
    expect(splitTableQueries('K', scope, STATUS).size).toBe(0)
  })

  it('ranks a player among the position’s qualified players only', () => {
    const r = receivers(['target_share', 'rec_yds'])
    expect([...poolOf(r, 'WR')].sort()).toEqual(['p0', 'p1', 'p2'])
    const results = new Map<PlayerSplitKey, StatsResult>([['all', r]])
    const sections = [{ title: 'S', lines: [{ metric: 'rec_yds' }] }]
    const [line] = playerSectionViews(sections, results, 'p1', 'WR', byId, 2026)[0].lines
    // p3 (50, not qualified) and p9 (a TE) are not counted: 2nd of 3.
    expect(line).toMatchObject({ value: '20', rank: '2nd of 3', percentile: 50 })
    const [small] = playerSectionViews(sections, results, 'p3', 'WR', byId, 2026)[0].lines
    expect(small).toMatchObject({ value: '50', rank: null, percentile: null })
    const split = playerSectionViews(
      [{ title: 'S', lines: [{ metric: 'qb_success', split: 'blitz', label: 'vs blitz' }] }],
      new Map([
        ['all', r],
        ['blitz', result(['qb_success'], [row('p0', 'Top', { qb_success: value(0.5) })])]
      ]),
      'p1',
      'WR',
      byId,
      2026
    )[0].lines[0]
    expect(split).toMatchObject({ key: 'blitz:qb_success', missing: 'No plays in this split.' })
    // Nobody in a split whose source has nothing for the season says why.
    const why = (split: PlayerSplitKey, season: number): string | null =>
      playerSectionViews(
        [{ title: 'S', lines: [{ metric: 'qb_success', split, label: 'x' }] }],
        new Map([
          ['all', r],
          [split, result(['qb_success'], [])]
        ]),
        'p1',
        'WR',
        byId,
        season
      )[0].lines[0].missing
    expect(why('pressured', 2026)).toBe('Not published for 2026 yet.')
    expect(why('blitz', 2021)).toBe('Charted from 2022.')
    // He has a row, others have the metric, he has none: the source left him out.
    const ngs = playerSectionViews(
      [{ title: 'S', lines: [{ metric: 'separation' }] }],
      new Map([
        [
          'all',
          result(
            ['separation', 'target_share'],
            [
              row('p0', 'Top', { separation: value(3.1), target_share: value(0.3) }),
              row('p1', 'Mine', { separation: value(null), target_share: value(0.2) })
            ]
          )
        ]
      ]),
      'p1',
      'WR',
      byId,
      2026
    )[0].lines[0]
    expect(ngs.missing).toBe('No NFL Next Gen Stats value for him.')
  })

  it('writes the tiles with a percentile chip among the qualified', () => {
    const r = receivers(['rec_yds', 'target_share', 'rec_ypt', 'fantasy_ppg'], { rec_ypt: 7.6 })
    const tiles = tileViews(r, 'p0', 'WR', byId, 2026)
    expect(tiles.map((t) => t.label)).toEqual([
      'Receiving yards',
      'Target share',
      'Yards per target',
      'Fantasy points per game'
    ])
    expect(tiles[0]).toMatchObject({ value: '30', chip: '100th pct', heat: 'good' })
    // Every receiver ties on yards per target: the middle.
    expect(tiles[2]).toMatchObject({ chip: '50th pct', heat: 'mid' })
  })

  it('places a player by fantasy points at his position, ties sharing', () => {
    const q = fantasyRankQuery('WR', scope, STATUS)!
    expect(q).toMatchObject({ metrics: ['fantasy_points'], scope: { positions: ['WR'] } })
    expect(fantasyRankQuery('DL', scope, STATUS)).toBeNull()
    const r = result(
      ['fantasy_points'],
      [
        row('a', 'A', { fantasy_points: value(100) }),
        row('b', 'B', { fantasy_points: value(90) }),
        row('c', 'C', { fantasy_points: value(90) })
      ]
    )
    expect(fantasyRank(r, 'c', 'WR', scope)).toBe('WR2 in PPR')
    expect(fantasyRank(r, 'z', 'WR', scope)).toBeNull()
  })

  it('writes the header: number, age, season, draft, college, size, games in range', () => {
    const h = playerHeader(
      BIO,
      row('p1', 'x', {}, { games: 6 }),
      scope,
      STATUS,
      new Date(2026, 1, 28)
    )
    expect(h).toMatchObject({
      first: 'Ja’Marr',
      last: 'Chase',
      games: '6 G · Weeks 1–6',
      status: null
    })
    expect(h.facts).toEqual([
      '#1',
      'Age 25',
      '6th season',
      '2021 Round 1, pick 5 (CIN)',
      'LSU',
      '6′0″, 205 lb'
    ])
    expect(ageOn('2000-03-01', new Date(2026, 2, 1))).toBe(26)
    expect(bornOf('2000-03-01', new Date(2026, 2, 1))).toBe('Mar 1, 2000 · age 26')
    // The name he goes by, not nflverse's legal first name.
    const stafford = playerHeader(
      { ...BIO, name: 'Matthew Stafford', firstName: 'John', lastName: 'Stafford' },
      null,
      scope,
      STATUS
    )
    expect([stafford.first, stafford.last]).toEqual(['Matthew', 'Stafford'])
    // His age that season.
    expect(
      playerHeader(BIO, null, { ...scope, season: 2023 }, STATUS, new Date(2026, 9, 21)).facts[1]
    ).toBe('Age 23')
    const jr = playerHeader({ ...BIO, name: 'Will Anderson Jr.' }, null, scope, STATUS)
    expect([jr.first, jr.last]).toEqual(['Will', 'Anderson Jr.'])
    const rookie = playerHeader(
      { ...BIO, draft: null, rookieSeason: 2026, jersey: null, college: null },
      null,
      scope,
      STATUS
    )
    expect(rookie.facts.slice(1, 3)).toEqual(['Rookie', 'Undrafted'])
    expect(rookie.games).toBe('0 G · Weeks 1–6')
    // Until his row is known, the range alone (no "0 G" flash).
    expect(playerHeader(BIO, undefined, scope, STATUS).games).toBe('Weeks 1–6')
  })

  it('tags the status: reserve lists and Out are bad, Questionable and practice warn', () => {
    const st = (over: Partial<NonNullable<PlayerBio['status']>>): PlayerBio['status'] => ({
      season: 2026,
      week: 7,
      reserve: null,
      report: null,
      practice: null,
      injury: 'Ankle',
      ...over
    })
    expect(statusChip(st({ reserve: 'IR' }))).toEqual({
      tag: 'IR',
      tone: 'bad',
      title: 'Injured reserve (week 7 roster)'
    })
    expect(statusChip(st({ report: 'Questionable', practice: 'Limited' }))).toEqual({
      tag: 'Q',
      tone: 'warn',
      title: 'Questionable · Ankle (week 7 report)'
    })
    expect(statusChip(st({ report: 'Out' }))?.tone).toBe('bad')
    expect(statusChip(st({ practice: 'DNP' }))).toMatchObject({ tag: 'DNP', tone: 'warn' })
    expect(statusChip(st({ reserve: 'Suspended' }))?.tag).toBe('SUS')
    expect(statusChip(null)).toBeNull()
    // Today's status is not 2024's.
    const past = playerHeader(
      { ...BIO, status: st({ reserve: 'IR' }) },
      null,
      { ...scope, season: 2024 },
      STATUS
    )
    expect(past.status).toBeNull()
  })

  it('lists the rail: qualified players, best first, the shown one kept, ranks before the search', () => {
    const q = railQuery('WR', 'rec_yds', scope, STATUS, byId)
    expect(q.metrics).toEqual(['rec_yds', 'target_share'])
    expect(railQuery('QB', 'qb_epa_db', scope, STATUS, byId).metrics).toEqual(['qb_epa_db'])
    const r = receivers(['rec_yds', 'target_share'])
    const own = { players: { p2: { name: 'Me', mine: true } }, teams: {} }
    const rows = railRows(r, 'WR', 'rec_yds', byId, own, '', null)
    expect(rows.map((x) => [x.id, x.rank, x.value])).toEqual([
      ['p0', 1, '30'],
      ['p1', 2, '20'],
      ['p2', 3, '10']
    ])
    expect(rows[2].owner).toEqual({ name: 'Me', mine: true })
    expect(rows[0].heat).toBe('h3')
    // The shown player stays, unranked, below the qualifier; the search keeps true ranks.
    expect(railRows(r, 'WR', 'rec_yds', byId, null, '', 'p3').map((x) => x.id)).toContain('p3')
    expect(
      railRows(r, 'WR', 'rec_yds', byId, null, 'low', null).map((x) => [x.id, x.rank])
    ).toEqual([['p2', 3]])
  })

  it('opens on my top scorer, else the first leader', () => {
    const mine = result(['fantasy_points'], [row('m', 'Mine', {}, { position: 'RB' })])
    const lead = result(['rec_yds'], [row('l', 'Lead', {}, { position: 'WR' })])
    expect(defaultPlayer(mine, lead)).toEqual({ id: 'm', position: 'RB' })
    expect(defaultPlayer(null, lead)).toEqual({ id: 'l', position: 'WR' })
    expect(defaultPlayer(null, null)).toBeNull()
  })
})

function game(over: Partial<GameForecast>): GameForecast {
  return {
    gameId: 'g',
    season: 2026,
    seasonType: 'REG',
    week: 1,
    gameday: '2026-09-13',
    home: 'CIN',
    away: 'CLE',
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

describe('the game log, splits and the rest (stats-analysis spec §9.4)', () => {
  const metrics = gameLogQuery('p1', 'REC', scope, STATUS).metrics
  const week = (
    w: number,
    team: string,
    opponent: string,
    yards: number
  ): ReturnType<typeof row> => ({
    ...row(
      'p1',
      'Mine',
      Object.fromEntries(metrics.map((m) => [m, value(m === 'rec_yds' ? yards : 1)])),
      {
        team
      }
    ),
    group: { week: w, opponent }
  })

  it('asks for the player’s weeks with their opponent', () => {
    const q = gameLogQuery('p1', 'REC', scope, STATUS)
    expect(q).toMatchObject({ groupBy: ['week', 'opponent'], scope: { players: ['p1'] } })
    expect(q.metrics).toEqual(
      expect.arrayContaining(['targets', 'fantasy_points', 'expected_points'])
    )
    expect(gameLogQuery('p1', 'DEF', scope, STATUS).metrics).not.toContain('fantasy_points')
  })

  it('logs every week: results from his team’s side, byes, games he missed, a trade', () => {
    // CIN: home win in week 1, at PIT (lost) in week 2, bye in week 3, CIN week 4 (he missed it).
    // Traded to KC: KC at DEN in week 5 (lost), not played yet in week 6.
    const games = [
      game({ gameId: '1', week: 1, homeScore: 27, awayScore: 20 }),
      game({ gameId: '2', week: 2, home: 'PIT', away: 'CIN', homeScore: 30, awayScore: 10 }),
      game({ gameId: '4', week: 4, home: 'CIN', away: 'BAL', homeScore: 3, awayScore: 6 }),
      game({ gameId: '5', week: 5, home: 'DEN', away: 'KC', homeScore: 24, awayScore: 21 }),
      game({ gameId: '6', week: 6, home: 'KC', away: 'LV', gameday: '2026-10-19' }),
      game({ gameId: '9', week: 4, home: 'KC', away: 'LAC', homeScore: 1, awayScore: 0 })
    ]
    const r = result(metrics, [
      week(2, 'CIN', 'PIT', 80),
      // A week a source left without his team: the nearest game's.
      { ...week(1, 'CIN', 'CLE', 120), team: null },
      week(5, 'KC', 'DEN', 40)
    ])
    const log = gameLog(r, games, 'REC', byId, scope, STATUS)
    expect(log.map((l) => [l.week, l.opponent, l.score ?? l.note])).toEqual([
      ['W1', 'CLE', 'W 27–20'],
      ['W2', '@ PIT', 'L 10–30'],
      ['W3', '', 'Bye'],
      ['W4', 'BAL', 'Did not play'],
      ['W5', '@ DEN', 'L 21–24'],
      ['W6', 'LV', 'Not played yet']
    ])
    expect(log[0].cells[4]).toBe('120')
    expect(log[0]).toMatchObject({ points: '1.0', expected: '1.0' })
    expect(log[2].cells.every((c) => c === '')).toBe(true)
  })

  it('names postseason rounds, and shows the postseason’s games only', () => {
    const r = result(metrics, [week(20, 'CIN', 'BUF', 70)])
    const games = [
      game({ week: 20, seasonType: 'POST', home: 'BUF', away: 'CIN', homeScore: 27, awayScore: 24 })
    ]
    expect(
      gameLog(r, games, 'REC', byId, { ...scope, seasonType: 'POST' }, STATUS).map((l) => [
        l.week,
        l.opponent,
        l.score
      ])
    ).toEqual([['DIV', '@ BUF', 'L 24–27']])
  })

  it('splits a grouped answer into rows, each ranked among the qualified in that split', () => {
    const kinds = splitTableQueries('WR', scope, STATUS)
    const all = receivers([...kinds.get('all')!.metrics])
    const quarters = result(
      kinds.get('quarter')!.metrics,
      [1, 2, 3, 4].flatMap((q) =>
        ['p0', 'p1', 'p3'].map((id, i) => ({
          ...row(
            id,
            id,
            Object.fromEntries(
              kinds
                .get('quarter')!
                .metrics.map((m) => [m, value(q * 10 + (id === 'p1' ? 5 : i), { sample: 7 })])
            )
          ),
          group: { quarter: q }
        }))
      )
    )
    const table = splitTable(
      new Map([
        ['all', all],
        ['quarter', quarters]
      ]),
      'p1',
      'WR',
      byId,
      2026
    )
    expect(table.map((g) => g.title)).toEqual([
      'Games',
      'Quarter',
      'Score',
      'Down and field',
      'Coverage'
    ])
    const q = table[1].rows
    expect(q.map((r) => r.label)).toEqual([
      '1st quarter',
      '2nd quarter',
      '3rd quarter',
      '4th quarter'
    ])
    // p1 has 15 receptions in the 1st quarter against p0's 10; p3 is not in the pool.
    expect(q[0]).toMatchObject({ plays: '7' })
    expect(q[0].cells[0]).toMatchObject({ value: '15', rank: '1st' })
    expect(table[0].rows[1]).toMatchObject({ label: 'Home', plays: '—' })
    // A metric with no better side ranks "highest": the cell keeps the place only.
    const adot = table[0].rows[0].cells[SPLIT_METRICS.REC.indexOf('rec_adot')]
    expect(adot.rank).toMatch(/^(T-)?\d+(st|nd|rd|th)$/)
    expect(table[4].note).toMatch(/after each season/)
  })

  it('reads the outlook, the shrunk rates, the combine, the career, opponents and teammates', () => {
    const o: PlayerOutlook = {
      player: 'p1',
      season: 2026,
      scoring: 'ppr',
      position: 'WR',
      team: 'CIN',
      games: 6,
      ceiling: { season: 30.2, last16: 28 },
      floor: { season: 8.1, last16: null },
      boomRate: 0.5,
      bustRate: 0.1,
      trend: [
        {
          metric: 'target_share',
          season: 0.3,
          last4: 0.36,
          change: 0.09,
          z: 2.2,
          roleChange: 'up'
        },
        {
          metric: 'carry_share',
          season: null,
          last4: null,
          change: null,
          z: null,
          roleChange: null
        },
        // A receiver's carries: nothing to say.
        {
          metric: 'opportunity_share',
          season: 0,
          last4: 0,
          change: null,
          z: null,
          roleChange: null
        }
      ],
      regression: [
        { metric: 'fpoe', value: 25, mean: 2, expectedChange: -18, z: 1.4, signal: 'hot' },
        { metric: 'yacoe', value: 0.1, mean: 0, expectedChange: -0.05, z: 0.1, signal: null }
      ],
      schedule: { opponents: ['BAL', 'PIT'], easierBy: -1.25 }
    }
    const v = outlookView(o, byId)
    expect(v.range[0]).toMatchObject({ season: '30.2', last16: '28.0' })
    expect(v.range[1].last16).toBe('—')
    expect(v.rates).toEqual([
      { label: 'Boom weeks', value: '50%' },
      { label: 'Bust weeks', value: '10%' }
    ])
    expect(v.trend).toEqual([
      {
        metric: 'target_share',
        label: 'Target share',
        season: '30.0%',
        last4: '36.0%',
        change: '+9.0%',
        flag: 'up'
      }
    ])
    expect(v.signals[0].text).toBe('Running hot: expect it to fall by about 18.0.')
    expect(v.signals[1].text).toBe('In line with what the position sustains.')
    expect(v.schedule).toBe(
      '2 games left. Their defenses allowed 1.3 fewer fantasy points per game to the position than average.'
    )

    const shrunk = result(
      ['target_share'],
      [row('p1', 'x', { target_share: value(0.25, { raw: 0.3 }) })]
    )
    expect(shrunkRows(shrunk, 'p1', byId)[0]).toMatchObject({ raw: '30.0%', shrunk: '25.0%' })

    const combine = combineView(
      result(
        ['forty', 'forty_score', 'height', 'height_score', 'ras', 'ras_measures', 'speed_score'],
        [
          row('p1', 'x', {
            forty: value(4.34),
            forty_score: value(9.5),
            height: value(72),
            height_score: value(null),
            ras: value(7.44),
            ras_measures: value(7),
            speed_score: value(112.6)
          })
        ]
      )
    )
    expect(combine.rows.find((r) => r.id === 'forty')).toMatchObject({
      value: '4.34 s',
      percentile: 95
    })
    expect(combine.rows.find((r) => r.id === 'height')).toMatchObject({
      value: '6′0″',
      percentile: null
    })
    expect(combine).toMatchObject({ ras: '7.4', measures: 7, speedScore: '113' })

    const cq = careerQuery(BIO, 'REC', scope, true)!
    expect(cq.scope).toEqual({
      seasons: [2021, 2022, 2025, 2026],
      seasonType: 'REG',
      players: ['p1']
    })
    const seasons = result(cq.metrics, [
      { ...row('p1', 'x', {}, { team: 'CIN' }), group: { season: 2021 } },
      { ...row('p1', 'x', {}, { team: 'KC' }), group: { season: 2026 } }
    ])
    expect(careerRows(seasons, 'REC', byId).map((r) => r.label)).toEqual(['2026 KC', '2021 CIN'])
    expect(careerQuery({ ...BIO, seasons: [] }, 'REC', scope, false)).toBeNull()

    const opp = result(
      ['receptions'],
      [
        { ...row('p1', 'x', { receptions: value(5) }), group: { opponent: 'PIT' } },
        { ...row('p1', 'x', { receptions: value(9) }), group: { opponent: 'BAL' } }
      ]
    )
    expect(opponentRows(opp, 'WR', byId).map((r) => r.label)).toEqual(['BAL', 'PIT'])

    const mates = result(
      ['off_snaps'],
      [
        row('p1', 'Me', { off_snaps: value(300) }),
        row('q', 'Quarterback', { off_snaps: value(310) }, { position: 'QB' }),
        row('z', 'Zero', { off_snaps: value(0) })
      ]
    )
    expect(teammateOptions(mates, 'p1')).toEqual([{ value: 'q', label: 'Quarterback (QB)' }])
    // Receivers and backs before the quarterback and the line.
    const more = result(
      ['off_snaps'],
      [
        row('t', 'Tackle', { off_snaps: value(400) }, { position: 'OL' }),
        row('q', 'Quarterback', { off_snaps: value(390) }, { position: 'QB' }),
        row('w', 'Wideout', { off_snaps: value(300) }, { position: 'WR' })
      ]
    )
    expect(teammateOptions(more, 'p1').map((o) => o.value)).toEqual(['w', 'q', 't'])
  })

  it('ranks the next opponent’s defense among the 32, skipping games played', () => {
    const games = [
      game({ week: 6, homeScore: 20, awayScore: 10 }),
      game({ gameId: '7', week: 7, home: 'BAL', away: 'CIN', gameday: '2026-10-25' })
    ]
    const defense = result(
      ['fpa_wr'],
      ['BAL', 'PIT', 'CLE'].map((t, i) =>
        row(t, t, { fpa_wr: value(20 + i) }, { team: t, position: null })
      )
    )
    const m = nextMatchup(games, 'CIN', defense, 'WR', byId, 2026, new Date('2026-10-21'))!
    expect(m).toMatchObject({ opponent: 'BAL', where: 'Away' })
    expect(m.when).toMatch(/^Week 7 · Sun, Oct 25/)
    // BAL allows the fewest: 1st of the 3, and bad news for a receiver (the handoff's tone).
    expect(m.lines[0]).toMatchObject({
      label: 'Fantasy points to WRs',
      value: '20.0',
      rank: '1st of 3',
      percentile: 0,
      heat: 'l3'
    })
    expect(nextMatchup(games, 'CIN', defense, 'WR', byId, 2026, new Date('2026-11-01'))).toBeNull()
  })

  it('reads the fantasy side’s projections, with a league', () => {
    const detail = {
      row: { rosPoints: 151.25, rosRank: 9, expert: { ecrPosRank: 7 } },
      weeks: [
        { week: 6, played: true, projected: 14 },
        { week: 7, played: false, projected: null, opponent: null },
        { week: 8, played: false, projected: 16.36, opponent: 'BAL' }
      ],
      schedule: []
    } as unknown as PlayerDetail
    expect(projectionView(detail, 'WR')).toEqual({
      next: { week: 8, opponent: 'BAL', points: '16.4' },
      ros: '151.3',
      rosRank: 'WR9',
      experts: 'WR7'
    })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/renderer/lib/statsPlayer.test.ts tests/renderer/lib/statsTeam.test.ts
```

Expected: FAIL. `@/lib/stats/player` does not exist (`Cannot find package '@/lib/stats/player'`). The team dashboard's model tests still pass (21).

- [ ] **Step 3: A line ranked among a pool**

`statLine` and `teamRank` take an optional filter of the rows that rank (the team dashboard passes none).

```diff
diff --git a/src/renderer/src/lib/stats/team.ts b/src/renderer/src/lib/stats/team.ts
index 25eec0d..d7207f1 100644
--- a/src/renderer/src/lib/stats/team.ts
+++ b/src/renderer/src/lib/stats/team.ts
@@ -342,13 +342,17 @@ export function missingFor(
   return `Not published for ${season} yet.`
 }

-/** A team's line from a result over every team: its value, rank among the teams, the league's mean. */
+/**
+ * A team's line from a result over every team: its value, rank among the teams, the league's mean.
+ * `among` narrows who is ranked (a player's dashboard: his position's qualified players).
+ */
 export function statLine(
   result: StatsResult | undefined,
   team: string,
   line: LineDef,
   byId: ReadonlyMap<string, MetricInfo>,
-  season: number
+  season: number,
+  among?: (row: StatsRow) => boolean
 ): StatLine {
   const info = byId.get(line.metric) ?? null
   const label = line.label ?? info?.label ?? line.metric
@@ -357,10 +361,15 @@ export function statLine(
   const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
   const v = result?.rows.find((r) => r.id === team)?.values[line.metric]
   // The league's mean is over the teams the rank counts (qualified), else over every value.
-  const all = (result?.rows ?? []).map((r) => r.values[line.metric]).filter((x) => x?.value != null)
+  const all = (result?.rows ?? [])
+    .filter((r) => !among || among(r))
+    .map((r) => r.values[line.metric])
+    .filter((x) => x?.value != null)
   const counted = all.filter((x) => x!.qualified)
   const values = (counted.length ? counted : all).map((x) => x!.value!)
-  const place = result ? teamRank(result, team, line.metric, info?.direction ?? 'neutral') : null
+  const place = result
+    ? teamRank(result, team, line.metric, info?.direction ?? 'neutral', among)
+    : null
   let rank: string | null = null
   if (place) {
     const at = `${place.tied ? 'T-' : ''}${ordinal(place.rank)}`
@@ -400,9 +409,11 @@ export function teamRank(
   result: StatsResult,
   team: string,
   metric: string,
-  direction: MetricInfo['direction']
+  direction: MetricInfo['direction'],
+  among?: (row: StatsRow) => boolean
 ): { rank: number; tied: boolean; of: number; percentile: number } | null {
   const pool = result.rows
+    .filter((r) => !among || among(r))
     .map((r) => ({ id: r.id, v: r.values[metric] }))
     .filter((x) => x.v?.qualified && x.v.value !== null)
     .map((x) => ({ id: x.id, value: x.v!.value! }))
```

- [ ] **Step 4: The model**

Create `src/renderer/src/lib/stats/player.ts`:

```ts
import type { PlayerDetail } from '@shared/types'
import type {
  GameForecast,
  MetricInfo,
  PlayerBio,
  PlayerOutlook,
  PositionGroup,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'
import { fmtStat, heatOf, ordinal, reliabilityOf, type Heat } from './format'
import { qualifies, rankWithinTab, searchKey, tabOf, type TabDef } from './leaderboard'
import {
  queryScope,
  rangeLabel,
  regularWeeks,
  SCORING_LABELS,
  weeksOf,
  type StatsScope
} from './scope'
import {
  roundOf,
  statLine,
  teamGames,
  type SectionView,
  type StatLine,
  type TeamGame
} from './team'

/** Spec §9.4: the rail's positions, defenders included. */
export const RAIL_POSITIONS: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'K', 'P', 'DL', 'LB', 'DB']

/** nflverse positions by group: a player's group when he has no rows in scope. */
const GROUP_OF: Record<string, PositionGroup> = {
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  HB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  P: 'P',
  DE: 'DL',
  DT: 'DL',
  NT: 'DL',
  DL: 'DL',
  OLB: 'LB',
  ILB: 'LB',
  MLB: 'LB',
  LB: 'LB',
  CB: 'DB',
  S: 'DB',
  FS: 'DB',
  SS: 'DB',
  SAF: 'DB',
  DB: 'DB',
  T: 'OL',
  G: 'OL',
  C: 'OL',
  OT: 'OL',
  OG: 'OL',
  OL: 'OL'
}

export function positionGroup(position: string | null): PositionGroup | null {
  return position ? (GROUP_OF[position] ?? null) : null
}

/** The dashboards by position group (spec §9.4): WR and TE share one, so do the defenders. */
export type PlayerKind = 'QB' | 'RB' | 'REC' | 'K' | 'P' | 'DEF' | 'OTHER'

export function kindOf(position: PositionGroup | null): PlayerKind {
  switch (position) {
    case 'QB':
    case 'RB':
    case 'K':
    case 'P':
      return position
    case 'WR':
    case 'TE':
      return 'REC'
    case 'DL':
    case 'LB':
    case 'DB':
      return 'DEF'
    default:
      return 'OTHER'
  }
}

/** Fantasy points exist for these (spec §9.4 header: fantasy rank under the scoring). */
const FANTASY: PlayerKind[] = ['QB', 'RB', 'REC', 'K']
/** Expected points, the Forecast and its outlook: offense only. */
const OFFENSE: PlayerKind[] = ['QB', 'RB', 'REC']

export type PlayerTab =
  | 'overview'
  | 'passing'
  | 'pressure'
  | 'rushing'
  | 'usage'
  | 'receiving'
  | 'vsCoverage'
  | 'kicking'
  | 'punting'
  | 'passRush'
  | 'coverage'
  | 'tackling'
  | 'log'
  | 'splits'
  | 'forecast'
  | 'profile'

const TAB_LABELS: Record<PlayerTab, string> = {
  overview: 'Overview',
  passing: 'Passing',
  pressure: 'Under pressure',
  rushing: 'Rushing',
  usage: 'Usage',
  receiving: 'Receiving',
  vsCoverage: 'vs Coverage',
  kicking: 'Kicking',
  punting: 'Punting',
  passRush: 'Pass rush',
  coverage: 'Coverage',
  tackling: 'Run defense & tackling',
  log: 'Game log',
  splits: 'Splits',
  forecast: 'Forecast',
  profile: 'Profile'
}

/** Spec §9.4's tabs by position group. */
const KIND_TABS: Record<PlayerKind, PlayerTab[]> = {
  QB: ['overview', 'passing', 'pressure', 'rushing', 'log', 'splits', 'forecast', 'profile'],
  RB: ['overview', 'usage', 'rushing', 'receiving', 'log', 'splits', 'forecast', 'profile'],
  REC: ['overview', 'usage', 'receiving', 'vsCoverage', 'log', 'splits', 'forecast', 'profile'],
  K: ['overview', 'kicking', 'log', 'profile'],
  P: ['overview', 'punting', 'log', 'profile'],
  DEF: ['overview', 'passRush', 'coverage', 'tackling', 'log', 'splits', 'profile'],
  OTHER: ['overview', 'log', 'profile']
}

export function playerTabs(position: PositionGroup | null): { id: PlayerTab; label: string }[] {
  return KIND_TABS[kindOf(position)].map((id) => ({ id, label: TAB_LABELS[id] }))
}

/** The tab to show for a player: the one chosen, if his position has it. */
export function tabFor(tab: PlayerTab, position: PositionGroup | null): PlayerTab {
  return KIND_TABS[kindOf(position)].includes(tab) ? tab : 'overview'
}

/** Play-grain and game splits a player's lines and the Splits tab read. */
export type PlayerSplitKey =
  | 'all'
  | 'home'
  | 'away'
  | 'last4'
  | 'quarter'
  | 'down'
  | 'redzone'
  | 'leading'
  | 'close'
  | 'trailing'
  | 'pressured'
  | 'clean'
  | 'blitz'
  | 'noBlitz'
  | 'playAction'
  | 'noPlayAction'
  | 'coverage'
  | 'man'
  | 'zone'

interface SplitDef {
  label: string
  scope?: Partial<StatsQuery['scope']>
  situation?: StatsQuery['situation']
  /** One query, one row per value (quarters, downs, man and zone). */
  groupBy?: 'quarter' | 'down' | 'coverage'
}

export const PLAYER_SPLITS: Record<PlayerSplitKey, SplitDef> = {
  all: { label: 'All plays' },
  home: { label: 'Home', scope: { home: true } },
  away: { label: 'Away', scope: { home: false } },
  last4: { label: 'Last 4 games', scope: { lastNGames: 4 } },
  quarter: { label: 'By quarter', groupBy: 'quarter' },
  down: { label: 'By down', groupBy: 'down' },
  redzone: { label: 'Red zone', situation: { fieldZone: 'redzone' } },
  leading: { label: 'Leading by 9+', situation: { scoreMargin: [9, 99] } },
  close: { label: 'Within 8', situation: { scoreMargin: [-8, 8] } },
  trailing: { label: 'Trailing by 9+', situation: { scoreMargin: [-99, -9] } },
  pressured: { label: 'Pressured', situation: { pressure: true } },
  clean: { label: 'Clean pocket', situation: { pressure: false } },
  blitz: { label: 'Blitzed', situation: { blitz: true } },
  noBlitz: { label: 'Not blitzed', situation: { blitz: false } },
  playAction: { label: 'Play action', situation: { playAction: true } },
  noPlayAction: { label: 'No play action', situation: { playAction: false } },
  coverage: { label: 'By coverage', groupBy: 'coverage' },
  man: { label: 'vs Man', situation: { coverage: 'man' } },
  zone: { label: 'vs Zone', situation: { coverage: 'zone' } }
}

/** The source a split's plays are picked by: participation, or FTN charting. */
const SPLIT_SOURCE: Partial<Record<PlayerSplitKey, 'participation' | 'ftn'>> = {
  pressured: 'participation',
  clean: 'participation',
  coverage: 'participation',
  man: 'participation',
  zone: 'participation',
  blitz: 'ftn',
  noBlitz: 'ftn',
  playAction: 'ftn',
  noPlayAction: 'ftn'
}
/** FTN charting's first season. */
const FTN_FIRST = 2022

export interface PlayerLineDef {
  metric: string
  split?: PlayerSplitKey
  label?: string
}

export interface PlayerSectionDef {
  title: string
  /** A caveat under the title (coverage of the data). */
  note?: string
  lines: PlayerLineDef[]
}

const plain = (...ids: string[]): PlayerLineDef[] => ids.map((metric) => ({ metric }))
const at = (split: PlayerSplitKey, metric: string, label: string): PlayerLineDef => ({
  metric,
  split,
  label
})

const PARTICIPATION = 'Participation data: published after each season.'
const CHARTED = 'FTN charting, from 2022.'

/** Spec §9.4: each stat tab's sections, by position group. */
export const PLAYER_SECTIONS: Partial<
  Record<PlayerTab, Partial<Record<PlayerKind, PlayerSectionDef[]>>>
> = {
  passing: {
    QB: [
      {
        title: 'Volume',
        lines: plain('pass_att', 'pass_cmp', 'pass_yds', 'pass_td', 'pass_int', 'sacks_taken')
      },
      {
        title: 'Efficiency',
        lines: plain(
          'qb_epa_db',
          'qb_success',
          'cpoe',
          'epa_cpoe_composite',
          'pass_anya',
          'pass_nya',
          'passer_rating',
          'qbr'
        )
      },
      {
        title: 'Accuracy and decisions',
        lines: plain(
          'pass_cmp_pct',
          'xcmp_pct',
          'bad_throw_pct',
          'int_worthy_rate',
          'pass_td_rate',
          'pass_int_rate'
        )
      },
      {
        title: 'Style',
        lines: plain(
          'pass_adot',
          'air_to_sticks',
          'time_to_throw',
          'aggressiveness',
          'deep_rate',
          'deep_epa',
          'play_action_rate',
          'play_action_epa'
        )
      }
    ]
  },
  pressure: {
    QB: [
      {
        title: 'How often',
        lines: plain('qb_pressured_pct', 'qb_pressure_pfr', 'sack_rate', 'p2s_rate', 'sacks_taken')
      },
      {
        title: 'Pressured and clean',
        note: PARTICIPATION,
        lines: [
          ...plain('pressured_epa', 'clean_epa'),
          at('pressured', 'qb_success', 'Success rate when pressured'),
          at('clean', 'qb_success', 'Success rate from a clean pocket'),
          at('pressured', 'cpoe', 'CPOE when pressured'),
          at('clean', 'cpoe', 'CPOE from a clean pocket')
        ]
      },
      {
        title: 'Against the blitz',
        note: CHARTED,
        lines: [
          ...plain('blitz_epa'),
          at('noBlitz', 'qb_epa_db', 'EPA per dropback, not blitzed'),
          at('blitz', 'qb_success', 'Success rate vs the blitz'),
          at('noBlitz', 'qb_success', 'Success rate, not blitzed'),
          at('blitz', 'cpoe', 'CPOE vs the blitz')
        ]
      },
      { title: 'Pocket', lines: plain('time_to_throw', 'bad_throw_pct') }
    ]
  },
  rushing: {
    QB: [
      { title: 'Production', lines: plain('carries', 'rush_yds', 'rush_td', 'rush_ypc') },
      {
        title: 'Runs',
        lines: plain('designed_runs', 'scrambles', 'scramble_yds', 'rush_epa', 'rush_success')
      },
      { title: 'Near the goal line', lines: plain('rz_carries', 'i10_carries', 'i5_carries') }
    ],
    RB: [
      { title: 'Production', lines: plain('carries', 'rush_yds', 'rush_td', 'rush_ypc') },
      {
        title: 'Efficiency',
        lines: plain(
          'rush_epa',
          'rush_success',
          'ryoe',
          'ryoe_att',
          'rush_pct_over_expected',
          'explosive_run_rate',
          'breakaway_pct',
          'stuff_rate'
        )
      },
      {
        title: 'Contact and fronts',
        lines: plain('ybc_att', 'yac_att', 'broken_tackles_touch', 'box8_rate')
      },
      { title: 'Near the goal line', lines: plain('rz_carries', 'i10_carries', 'i5_carries') }
    ]
  },
  usage: {
    RB: [
      {
        title: 'Shares',
        lines: plain(
          'snap_share',
          'carry_share',
          'opportunity_share',
          'target_share',
          'route_participation',
          'rz_opportunity_share'
        )
      },
      {
        title: 'Volume',
        lines: plain('touches', 'high_value_touches', 'weighted_opportunities', 'routes')
      }
    ],
    REC: [
      {
        title: 'Shares',
        lines: plain(
          'snap_share',
          'route_participation',
          'target_share',
          'air_yards_share',
          'wopr',
          'rz_opportunity_share'
        )
      },
      {
        title: 'Looks',
        lines: plain('routes', 'targets', 'rec_adot', 'ez_targets', 'i10_targets')
      }
    ]
  },
  receiving: {
    RB: [
      {
        title: 'Production',
        lines: plain('targets', 'receptions', 'rec_yds', 'rec_td', 'catch_rate', 'rec_ypr')
      },
      {
        title: 'Efficiency',
        lines: plain('yprr', 'tprr', 'rec_epa', 'yac_rec', 'yacoe', 'broken_tackles_touch')
      },
      { title: 'Hands', note: CHARTED, lines: plain('drops', 'drop_rate', 'catchable_pct') }
    ],
    REC: [
      {
        title: 'Production',
        lines: plain(
          'targets',
          'receptions',
          'rec_yds',
          'rec_td',
          'catch_rate',
          'rec_ypr',
          'rec_ypt'
        )
      },
      {
        title: 'Efficiency',
        lines: plain('yprr', 'tprr', 'fd_per_route', 'racr', 'rec_epa')
      },
      {
        title: 'After the catch',
        lines: plain('yac_rec', 'yacoe', 'broken_tackles_touch')
      },
      {
        title: 'Hands',
        note: CHARTED,
        lines: plain(
          'drops',
          'drop_rate',
          'catchable_pct',
          'contested_targets',
          'contested_catch_rate'
        )
      }
    ]
  },
  vsCoverage: {
    REC: [
      {
        title: 'Man and zone',
        note: PARTICIPATION,
        lines: [
          ...plain('tprr_man', 'tprr_zone', 'yprr_man', 'yprr_zone'),
          at('man', 'rec_epa', 'EPA per target vs man'),
          at('zone', 'rec_epa', 'EPA per target vs zone'),
          at('man', 'catch_rate', 'Catch rate vs man'),
          at('zone', 'catch_rate', 'Catch rate vs zone')
        ]
      },
      { title: 'Getting open', note: 'Next Gen Stats.', lines: plain('separation', 'cushion') },
      {
        title: 'Contested',
        note: CHARTED,
        lines: plain('contested_targets', 'contested_catch_rate', 'catchable_pct')
      }
    ]
  },
  kicking: {
    K: [
      {
        title: 'Field goals',
        lines: plain(
          'fg_made',
          'fg_att',
          'fg_pct',
          'fg_pct_0_39',
          'fg_pct_40_49',
          'fg_pct_50p',
          'fg_made_50p'
        )
      },
      {
        title: 'Against the model',
        lines: plain('fgoe', 'fgoe_pct', 'fg_expected_pct', 'kicker_epa')
      },
      { title: 'Extra points and kickoffs', lines: plain('pat_pct', 'kickoff_tb_pct') }
    ]
  },
  punting: {
    P: [
      {
        title: 'Punting',
        lines: plain(
          'punts',
          'punt_avg',
          'punt_net_avg',
          'punt_in20_rate',
          'punt_tb_rate',
          'punter_epa'
        )
      }
    ]
  },
  passRush: {
    DEF: [
      {
        title: 'Pass rush',
        lines: plain('pressures', 'sacks', 'qb_hits', 'hurries', 'pressure_rate', 'blitz_rate')
      }
    ]
  },
  coverage: {
    DEF: [
      {
        title: 'In coverage',
        note: 'Pro Football Reference charting: the defender a pass was thrown at.',
        lines: plain(
          'coverage_targets',
          'coverage_cmp_pct',
          'coverage_ypt',
          'coverage_rating',
          'coverage_adot',
          'coverage_yac',
          'coverage_td',
          'coverage_int'
        )
      },
      { title: 'On the ball', lines: plain('pass_defended', 'def_ints') }
    ]
  },
  tackling: {
    DEF: [
      {
        title: 'Tackling',
        lines: plain(
          'tackles',
          'solo_tackles',
          'assisted_tackles',
          'missed_tackle_pct',
          'tackle_depth'
        )
      },
      { title: 'Run defense', lines: plain('tfl', 'def_stuffs') },
      {
        title: 'Playmaking',
        lines: plain('forced_fumbles', 'fumble_recoveries', 'def_tds')
      },
      {
        title: 'Snaps',
        lines: plain('def_snaps', 'def_snap_share', 'on_field_def_epa')
      }
    ]
  }
}

/** Overview (spec §9.4): the handoff's four tiles, then 6–8 core metrics with percentiles. */
export const TILES: Record<PositionGroup, string[]> = {
  QB: ['pass_yds', 'pass_td', 'pass_ypa', 'fantasy_ppg'],
  RB: ['rush_yds', 'rush_ypc', 'touches', 'fantasy_ppg'],
  WR: ['rec_yds', 'target_share', 'rec_ypt', 'fantasy_ppg'],
  TE: ['rec_yds', 'target_share', 'rec_ypt', 'fantasy_ppg'],
  K: ['fg_made', 'fg_pct', 'fg_pct_50p', 'fantasy_ppg'],
  P: ['punt_net_avg', 'punt_avg', 'punt_in20_rate', 'punter_epa'],
  DL: ['sacks', 'pressures', 'qb_hits', 'tackles'],
  LB: ['tackles', 'tfl', 'sacks', 'pass_defended'],
  DB: ['def_ints', 'pass_defended', 'coverage_rating', 'tackles'],
  OL: ['snap_share', 'off_snaps', 'fumbles_lost', 'penalties']
}

const RECEIVER_CORE = [
  'target_share',
  'air_yards_share',
  'wopr',
  'route_participation',
  'yprr',
  'tprr',
  'separation',
  'fpoe'
]

export const CORE_METRICS: Record<PositionGroup, string[]> = {
  QB: [
    'qb_epa_db',
    'cpoe',
    'qb_success',
    'epa_cpoe_composite',
    'pass_anya',
    'qbr',
    'pass_adot',
    'fpoe'
  ],
  RB: [
    'snap_share',
    'carry_share',
    'opportunity_share',
    'high_value_touches',
    'rush_ypc',
    'ryoe_att',
    'target_share',
    'fpoe'
  ],
  WR: RECEIVER_CORE,
  TE: RECEIVER_CORE,
  K: ['fg_pct', 'fgoe', 'fgoe_pct', 'fg_pct_50p', 'pat_pct', 'kicker_epa'],
  P: ['punt_net_avg', 'punt_in20_rate', 'punter_epa', 'punt_avg', 'punt_tb_rate'],
  DL: ['pressures', 'sacks', 'qb_hits', 'tfl', 'def_stuffs', 'missed_tackle_pct', 'def_snap_share'],
  LB: [
    'tackles',
    'tfl',
    'def_stuffs',
    'missed_tackle_pct',
    'pressures',
    'coverage_rating',
    'def_snap_share'
  ],
  DB: [
    'coverage_ypt',
    'coverage_cmp_pct',
    'coverage_rating',
    'pass_defended',
    'def_ints',
    'missed_tackle_pct',
    'def_snap_share'
  ],
  OL: ['snap_share', 'on_field_epa']
}

/** Whether a metric is about this position (spec §6.1 `positions`). */
export function appliesToPosition(info: MetricInfo | undefined, position: PositionGroup): boolean {
  return !!info && (info.positions === 'all' || info.positions.includes(position))
}

/** The sections a tab shows for a position: lines about other positions dropped, empty sections too. */
export function sectionsFor(
  tab: PlayerTab,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): PlayerSectionDef[] {
  const defs = PLAYER_SECTIONS[tab]?.[kindOf(position)] ?? []
  return defs
    .map((s) => ({
      ...s,
      lines: s.lines.filter((l) => appliesToPosition(byId.get(l.metric), position))
    }))
    .filter((s) => s.lines.length > 0)
}

/** Overview: the core metrics as one section, the tiles riding in the same query. */
export function overviewSections(
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): PlayerSectionDef[] {
  const lines = CORE_METRICS[position]
    .filter((id) => appliesToPosition(byId.get(id), position))
    .map((metric) => ({ metric }))
  return lines.length ? [{ title: 'Percentile rankings', lines }] : []
}

/** The leaderboard tab of a position: its qualifier decides who is ranked (spec §18 D). */
export function positionTab(position: PositionGroup): TabDef {
  return tabOf('player', position)
}

/** The weekly rows of every player at a position, at most this many a query. */
const POSITION_ROWS = 1000

/** One query over the position (a rank is among the position), under a split. */
export function positionQuery(
  metrics: string[],
  position: PositionGroup,
  split: PlayerSplitKey,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  const s = PLAYER_SPLITS[split]
  return {
    entity: 'player',
    metrics,
    scope: { ...queryScope(scope, status), positions: [position], ...s.scope },
    ...(s.situation ? { situation: s.situation } : {}),
    ...(s.groupBy ? { groupBy: [s.groupBy] } : {}),
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: POSITION_ROWS
  }
}

/**
 * The queries a set of sections needs: one per split, over the position, each metric once. The
 * position's qualifier rides along in the `all` query: it decides who is ranked in every split.
 */
export function playerSectionQueries(
  sections: readonly PlayerSectionDef[],
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null,
  extra: readonly string[] = []
): Map<PlayerSplitKey, StatsQuery> {
  const bySplit = new Map<PlayerSplitKey, string[]>()
  const add = (split: PlayerSplitKey, metric: string): void => {
    const ids = bySplit.get(split) ?? []
    if (!ids.includes(metric)) bySplit.set(split, [...ids, metric])
  }
  for (const id of extra) add('all', id)
  for (const s of sections) for (const l of s.lines) add(l.split ?? 'all', l.metric)
  const qualifier = positionTab(position).qualifier
  if (qualifier) add('all', qualifier)
  return new Map(
    [...bySplit].map(([split, metrics]) => [
      split,
      positionQuery(metrics, position, split, scope, status)
    ])
  )
}

/**
 * Who a player's lines rank among: the position's players its leaderboard qualifies (spec §18 D),
 * read from the `all` query. Each metric still needs its own sample (`statLine`).
 */
export function poolOf(all: StatsResult | undefined, position: PositionGroup): Set<string> {
  const tab = positionTab(position)
  return new Set(
    (all?.rows ?? []).filter((r) => r.position === position && qualifies(r, tab)).map((r) => r.id)
  )
}

/** Every section of a tab, ranked among the pool. */
export function playerSectionViews(
  sections: readonly PlayerSectionDef[],
  results: ReadonlyMap<PlayerSplitKey, StatsResult>,
  player: string,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): (SectionView & { note?: string })[] {
  const pool = poolOf(results.get('all'), position)
  const among = (r: StatsRow): boolean => pool.has(r.id)
  return sections.map((s) => ({
    title: s.title,
    ...(s.note ? { note: s.note } : {}),
    lines: s.lines.map((l) =>
      playerLine(results.get(l.split ?? 'all'), player, l, byId, season, among)
    )
  }))
}

/** A player's line: `statLine` keyed by split, "of 110" among his position's qualified players. */
export function playerLine(
  result: StatsResult | undefined,
  player: string,
  line: PlayerLineDef,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number,
  among: (row: StatsRow) => boolean
): StatLine {
  const l = statLine(
    result,
    player,
    { metric: line.metric, label: line.label },
    byId,
    season,
    among
  )
  const source = line.split ? SPLIT_SOURCE[line.split] : undefined
  let missing = l.missing
  if (l.missing === 'No games in this range.' && line.split && line.split !== 'all') {
    // Nobody in the split: its source has nothing for the season.
    if (source === 'ftn' && season < FTN_FIRST) missing = `Charted from ${FTN_FIRST}.`
    else if (source === 'participation' && !result?.rows.length)
      missing = `Not published for ${season} yet.`
    else missing = 'No plays in this split.'
  }
  // Others have a value and he has a row, but not this one: its source left him out (Next Gen
  // Stats and ESPN QBR publish players over their own minimums).
  if (missing === null && l.value === '—' && result?.rows.some((r) => r.id === player)) {
    const source = l.info?.sources[0]?.replace(/ \(nflverse\)$/, '') ?? 'its source'
    missing = `No ${source} value for him.`
  }
  return { ...l, key: `${line.split ?? 'all'}:${line.metric}`, missing }
}

/** "WR12": a player's place by fantasy points at his position (spec §9.4 header). */
export function fantasyRankQuery(
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery | null {
  if (!FANTASY.includes(kindOf(position))) return null
  return {
    entity: 'player',
    metrics: ['fantasy_points'],
    scope: { ...queryScope(scope, status), positions: [position] },
    sort: { metric: 'fantasy_points', dir: 'desc' },
    scoring: scope.scoring,
    limit: POSITION_ROWS
  }
}

export function fantasyRank(
  result: StatsResult | null,
  player: string,
  position: PositionGroup,
  scope: StatsScope
): string | null {
  const rows = (result?.rows ?? []).filter((r) => (r.values.fantasy_points?.value ?? null) !== null)
  const i = rows.findIndex((r) => r.id === player)
  if (i < 0) return null
  const mine = rows[i].values.fantasy_points.value!
  const rank = rows.filter((r) => r.values.fantasy_points.value! > mine).length + 1
  return `${position}${rank} in ${SCORING_LABELS[scope.scoring]}`
}

/** The header (handoff "6. Player profile", spec §9.4). */
export interface PlayerHeader {
  first: string
  last: string
  /** "#1 · Age 26 · 6th season · 2021 Round 1, pick 5 (CIN) · LSU" in parts. */
  facts: string[]
  /** "6 G · Weeks 1–6". */
  games: string
  status: { tag: string; tone: 'bad' | 'warn'; title: string } | null
}

/** "Sep 25, 1999 · age 27". */
export function bornOf(birthDate: string | null, today = new Date()): string | null {
  if (!birthDate) return null
  const day = new Date(`${birthDate}T12:00:00`)
  if (Number.isNaN(day.getTime())) return birthDate
  const date = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const age = ageOn(birthDate, today)
  return age === null ? date : `${date} · age ${age}`
}

/** Whole years between a birth date and a day. */
export function ageOn(birthDate: string | null, day: Date): number | null {
  if (!birthDate) return null
  const [y, m, d] = birthDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const had = day.getMonth() + 1 > m || (day.getMonth() + 1 === m && day.getDate() >= d)
  return day.getFullYear() - y - (had ? 0 : 1)
}

/** "6′1″, 205 lb" from inches and pounds. */
export function sizeOf(height: number | null, weight: number | null): string | null {
  const h = height ? `${Math.floor(height / 12)}′${height % 12}″` : null
  const w = weight ? `${weight} lb` : null
  return [h, w].filter(Boolean).join(', ') || null
}

export function draftOf(bio: Pick<PlayerBio, 'draft'>): string {
  const d = bio.draft
  if (!d) return 'Undrafted'
  return `${d.year} Round ${d.round}, pick ${d.pick}${d.team ? ` (${d.team})` : ''}`
}

/** A status chip (handoff tone rules): Questionable warns; Doubtful, Out and the reserve lists are bad. */
export function statusChip(status: PlayerBio['status']): PlayerHeader['status'] {
  if (!status) return null
  const injury = status.injury ? ` · ${status.injury}` : ''
  const when = `week ${status.week} report`
  if (status.reserve) {
    const tag = { IR: 'IR', PUP: 'PUP', NFI: 'NFI', Suspended: 'SUS', Reserve: 'RES' }[
      status.reserve
    ]
    const words = {
      IR: 'Injured reserve',
      PUP: 'Physically unable to perform',
      NFI: 'Non-football injury list',
      Suspended: 'Suspended',
      Reserve: 'On a reserve list'
    }[status.reserve]
    return { tag, tone: 'bad', title: `${words} (week ${status.week} roster)` }
  }
  if (status.report) {
    const tag = { Out: 'OUT', Doubtful: 'D', Questionable: 'Q' }[status.report]
    return {
      tag,
      tone: status.report === 'Questionable' ? 'warn' : 'bad',
      title: `${status.report}${injury} (${when})`
    }
  }
  if (status.practice === 'DNP' || status.practice === 'Limited') {
    const words = status.practice === 'DNP' ? 'Did not practice' : 'Limited in practice'
    return { tag: status.practice, tone: 'warn', title: `${words}${injury} (${when})` }
  }
  return null
}

/** `row`: his row in scope; null when he has none, undefined while it loads. */
export function playerHeader(
  bio: PlayerBio,
  row: StatsRow | null | undefined,
  scope: StatsScope,
  status: StatsStatus | null,
  today = new Date()
): PlayerHeader {
  const [first, ...rest] = bio.name.split(' ')
  // His age that season (on September 1); this season's, today.
  const age = ageOn(
    bio.birthDate,
    scope.season < today.getFullYear() ? new Date(scope.season, 8, 1) : today
  )
  const year = bio.rookieSeason ? scope.season - bio.rookieSeason + 1 : null
  const facts = [
    bio.jersey !== null ? `#${bio.jersey}` : null,
    age !== null ? `Age ${age}` : null,
    year === null || year < 1 ? null : year === 1 ? 'Rookie' : `${ordinal(year)} season`,
    draftOf(bio),
    bio.college,
    sizeOf(bio.height, bio.weight)
  ].filter((x): x is string => !!x)
  const range = rangeLabel(scope, status)
  // The name as he goes by (nflverse's first_name is the legal one: John for Matthew Stafford).
  return {
    first: rest.length ? first : '',
    last: rest.length ? rest.join(' ') : first,
    facts,
    games: row === undefined ? range : `${row?.games ?? 0} G · ${range}`,
    status:
      scope.season === (status?.through?.season ?? scope.season) ? statusChip(bio.status) : null
  }
}

/** A tile (handoff): the value, and its percentile among the position as a chip. */
export interface TileView {
  metric: string
  label: string
  value: string
  chip: string
  heat: 'good' | 'bad' | 'mid'
  title: string
}

export function tileViews(
  all: StatsResult | undefined,
  player: string,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): TileView[] {
  const pool = poolOf(all, position)
  return TILES[position].map((metric) => {
    const l = statLine(all, player, { metric }, byId, season, (r) => pool.has(r.id))
    const p = l.percentile
    const neutral = l.info?.direction === 'neutral'
    return {
      metric,
      label: l.label,
      value: l.value,
      chip: p === null || neutral ? '' : `${ordinal(p)} pct`,
      heat: p === null || neutral ? 'mid' : p >= 75 ? 'good' : p <= 25 ? 'bad' : 'mid',
      title: l.title
    }
  })
}

/** Spec §9.2: a rail of the position's players, ranked by a metric. */
export function railQuery(
  position: PositionGroup,
  metric: string,
  scope: StatsScope,
  status: StatsStatus | null,
  byId: ReadonlyMap<string, MetricInfo>
): StatsQuery {
  const qualifier = positionTab(position).qualifier
  const metrics = qualifier && qualifier !== metric ? [metric, qualifier] : [metric]
  return {
    entity: 'player',
    metrics,
    scope: { ...queryScope(scope, status), positions: [position] },
    transform: 'raw',
    sort: { metric, dir: byId.get(metric)?.direction === 'lower' ? 'asc' : 'desc' },
    scoring: scope.scoring,
    limit: POSITION_ROWS
  }
}

/** The rail's rank-by choices: the position's leaderboard columns. */
export function railMetrics(
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): { value: string; label: string }[] {
  const ids = positionTab(position).groups.flatMap(([, ids]) => ids)
  return ids.filter((id) => byId.has(id)).map((id) => ({ value: id, label: byId.get(id)!.label }))
}

export interface RailRow {
  id: string
  name: string
  team: string | null
  position: string | null
  /** Among the qualified, before the search narrows the list. */
  rank: number | null
  value: string
  heat: Heat
  title: string
  owner: { name: string; mine: boolean } | null
  qualified: boolean
}

/**
 * The rail (handoff profile list): the qualified players, best first, with the value as a shaded
 * chip; the player shown stays listed even below the qualifier. A search narrows the list.
 */
export function railRows(
  result: StatsResult,
  position: PositionGroup,
  metric: string,
  byId: ReadonlyMap<string, MetricInfo>,
  ownership: StatsOwnership | null,
  search: string,
  keep: string | null
): RailRow[] {
  const tab = positionTab(position)
  const ranked = rankWithinTab(result, tab)
  const info = byId.get(metric)
  const f = { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind }
  const needle = searchKey(search.trim())
  let rank = 0
  return ranked.rows
    .filter((r) => r.position === position)
    .map((r): RailRow => {
      const v = r.values[metric]
      const q = qualifies(r, tab)
      if (q) rank++
      const pct = v?.percentile ?? null
      return {
        id: r.id,
        name: r.name,
        team: r.team,
        position: r.position,
        rank: q ? rank : null,
        value: fmtStat(v?.value ?? null, f),
        heat: heatOf(pct, info?.direction ?? 'neutral'),
        title: pct === null ? '' : `${ordinal(pct)} percentile among qualified ${position}s`,
        owner: ownership?.players[r.id] ?? null,
        qualified: q
      }
    })
    .filter(
      (r) => (r.qualified || r.id === keep) && (!needle || searchKey(r.name).includes(needle))
    )
}

/** The player the dashboard first opens on: my top fantasy scorer, else the rail's first WR. */
export function defaultPlayer(
  topScorer: StatsResult | null,
  leaders: StatsResult | null
): { id: string; position: PositionGroup } | null {
  for (const r of [...(topScorer?.rows ?? []), ...(leaders?.rows ?? [])]) {
    const position = positionGroup(r.position)
    if (position && RAIL_POSITIONS.includes(position)) return { id: r.id, position }
  }
  return null
}

/** The player's own rows: by week (the log, the charts) or by season (career), in one query. */
export function playerQuery(
  player: string,
  metrics: string[],
  scope: StatsScope,
  status: StatsStatus | null,
  groupBy?: StatsQuery['groupBy']
): StatsQuery {
  return {
    entity: 'player',
    metrics,
    scope: { ...queryScope(scope, status), players: [player] },
    ...(groupBy ? { groupBy } : {}),
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: 100
  }
}

/** Overview (spec §9.4): weekly fantasy points against expected points. */
export function pointsSeries(kind: PlayerKind): string[] {
  return OFFENSE.includes(kind)
    ? ['fantasy_points', 'expected_points']
    : FANTASY.includes(kind)
      ? ['fantasy_points']
      : []
}

/** A season or career line: the position's counting stats. */
export const LINE_METRICS: Record<PlayerKind, string[]> = {
  QB: [
    'pass_cmp',
    'pass_att',
    'pass_yds',
    'pass_td',
    'pass_int',
    'rush_yds',
    'rush_td',
    'fantasy_points'
  ],
  RB: ['carries', 'rush_yds', 'rush_td', 'receptions', 'rec_yds', 'rec_td', 'fantasy_points'],
  REC: ['targets', 'receptions', 'rec_yds', 'rec_td', 'rec_ypr', 'fantasy_points'],
  K: ['fg_made', 'fg_att', 'fg_pct', 'fg_made_50p', 'pat_pct', 'fantasy_points'],
  P: ['punts', 'punt_avg', 'punt_net_avg', 'punt_in20_rate'],
  DEF: ['tackles', 'tfl', 'sacks', 'qb_hits', 'pass_defended', 'def_ints', 'forced_fumbles'],
  OTHER: ['off_snaps', 'snap_share']
}

export interface LineRow {
  key: string
  label: string
  games: string
  cells: string[]
}

/** The columns of a line, short labels from the catalogue. */
export function lineHead(kind: PlayerKind, byId: ReadonlyMap<string, MetricInfo>): string[] {
  return LINE_METRICS[kind].map((id) => byId.get(id)?.short ?? id)
}

const valueOf = (
  row: StatsRow | undefined,
  id: string,
  byId: ReadonlyMap<string, MetricInfo>
): string => {
  const m = byId.get(id)
  return fmtStat(row?.values[id]?.value ?? null, {
    unit: m?.unit ?? 'number',
    decimals: m?.decimals ?? 1,
    kind: m?.kind
  })
}

/** A row of a line table: the scope's season, the career, or one season of it. */
export function lineRow(
  key: string,
  label: string,
  row: StatsRow | undefined,
  kind: PlayerKind,
  byId: ReadonlyMap<string, MetricInfo>
): LineRow {
  return {
    key,
    label,
    games: row ? String(row.games) : '—',
    cells: LINE_METRICS[kind].map((id) => valueOf(row, id, byId))
  }
}

/** Profile (spec §9.4): career by season, newest first. */
export function careerRows(
  result: StatsResult | null,
  kind: PlayerKind,
  byId: ReadonlyMap<string, MetricInfo>
): LineRow[] {
  return (result?.rows ?? [])
    .map((r) => ({ r, season: Number(r.group.season) }))
    .filter((x) => Number.isFinite(x.season))
    .sort((a, b) => b.season - a.season)
    .map(({ r, season }) =>
      lineRow(String(season), `${season}${r.team ? ` ${r.team}` : ''}`, r, kind, byId)
    )
}

export function careerQuery(
  bio: PlayerBio,
  kind: PlayerKind,
  scope: StatsScope,
  bySeason: boolean
): StatsQuery | null {
  if (bio.seasons.length === 0) return null
  const metrics = LINE_METRICS[kind]
  return {
    entity: 'player',
    metrics,
    scope: { seasons: bio.seasons, seasonType: 'REG', players: [bio.id] },
    ...(bySeason ? { groupBy: ['season' as const] } : {}),
    transform: 'raw',
    sort: { metric: metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: 100
  }
}

/** The game log's columns by position group (handoff `LOG`, spec §9.4). */
export const LOG_COLUMNS: Record<PlayerKind, { label: string; metrics: string[] }[]> = {
  QB: [
    { label: 'C/A', metrics: ['pass_cmp', 'pass_att'] },
    { label: 'YDS', metrics: ['pass_yds'] },
    { label: 'TD', metrics: ['pass_td'] },
    { label: 'INT', metrics: ['pass_int'] },
    { label: 'SK', metrics: ['sacks_taken'] },
    { label: 'EPA/DB', metrics: ['qb_epa_db'] },
    { label: 'RUSH', metrics: ['carries', 'rush_yds'] }
  ],
  RB: [
    { label: 'SNAP', metrics: ['snap_share'] },
    { label: 'ATT', metrics: ['carries'] },
    { label: 'YDS', metrics: ['rush_yds'] },
    { label: 'Y/C', metrics: ['rush_ypc'] },
    { label: 'REC', metrics: ['receptions', 'targets'] },
    { label: 'REC YD', metrics: ['rec_yds'] },
    { label: 'TD', metrics: ['total_td'] }
  ],
  REC: [
    { label: 'SNAP', metrics: ['snap_share'] },
    { label: 'ROUTE', metrics: ['route_participation'] },
    { label: 'TGT', metrics: ['targets'] },
    { label: 'REC', metrics: ['receptions'] },
    { label: 'YDS', metrics: ['rec_yds'] },
    { label: 'TD', metrics: ['rec_td'] },
    { label: 'aDOT', metrics: ['rec_adot'] }
  ],
  K: [
    { label: 'FG', metrics: ['fg_made', 'fg_att'] },
    { label: '50+', metrics: ['fg_made_50p'] },
    { label: 'XP %', metrics: ['pat_pct'] },
    { label: 'FGOE', metrics: ['fgoe'] }
  ],
  P: [
    { label: 'PUNTS', metrics: ['punts'] },
    { label: 'AVG', metrics: ['punt_avg'] },
    { label: 'NET', metrics: ['punt_net_avg'] },
    { label: 'IN 20', metrics: ['punt_in20_rate'] },
    { label: 'EPA', metrics: ['punter_epa'] }
  ],
  DEF: [
    { label: 'SNAP', metrics: ['def_snap_share'] },
    { label: 'TKL', metrics: ['tackles'] },
    { label: 'TFL', metrics: ['tfl'] },
    { label: 'SCK', metrics: ['sacks'] },
    { label: 'QBH', metrics: ['qb_hits'] },
    { label: 'PRS', metrics: ['pressures'] },
    { label: 'PD', metrics: ['pass_defended'] },
    { label: 'INT', metrics: ['def_ints'] }
  ],
  OTHER: [
    { label: 'SNAPS', metrics: ['off_snaps'] },
    { label: 'SNAP', metrics: ['snap_share'] }
  ]
}

/** The log's metrics: its columns', then fantasy and expected points where they exist. */
export function logMetrics(kind: PlayerKind): string[] {
  const ids = LOG_COLUMNS[kind].flatMap((c) => c.metrics)
  return [...new Set([...ids, ...pointsSeries(kind)])]
}

export function gameLogQuery(
  player: string,
  kind: PlayerKind,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  return playerQuery(player, logMetrics(kind), scope, status, ['week', 'opponent'])
}

export interface LogRow {
  key: string
  /** "W3", or a postseason round. */
  week: string
  /** "DET", "@ DET"; empty on a bye. */
  opponent: string
  /** "W 27–20"; null for a bye, a game not played, or one he missed. */
  score: string | null
  result: 'W' | 'L' | 'T' | null
  /** "Bye", "Did not play"; null when he played. */
  note: string | null
  cells: string[]
  points: string | null
  expected: string | null
}

/**
 * The game log (handoff "Game log", spec §9.4): one row per week of the range. A week he has no
 * row in is a bye when the team he played for nearest that week had no game, else "Did not play".
 * Results come from the season's games, from the side of the team he played for that week.
 */
export function gameLog(
  result: StatsResult | null,
  games: readonly GameForecast[] | null,
  kind: PlayerKind,
  byId: ReadonlyMap<string, MetricInfo>,
  scope: StatsScope,
  status: StatsStatus | null
): LogRow[] {
  const rows = (result?.rows ?? [])
    .map((r) => ({ r, week: Number(r.group.week) }))
    .filter((x) => Number.isFinite(x.week))
    .sort((a, b) => a.week - b.week)
  const byWeek = new Map(rows.map((x) => [x.week, x.r] as const))
  const sides = new Map<string, TeamGame[]>()
  const sideOf = (team: string): TeamGame[] => {
    if (!sides.has(team)) sides.set(team, teamGames(games ?? [], team))
    return sides.get(team)!
  }
  const label = (week: number): string =>
    week > regularWeeks(scope.season) ? roundOf(scope.season, week) : `W${week}`
  const cell = (r: StatsRow, c: { metrics: string[] }): string => {
    if (c.metrics.length === 2) {
      const [a, b] = c.metrics.map((id) => valueOf(r, id, byId))
      return c.metrics[1] === 'rush_yds' ? `${a}-${b}` : `${a}/${b}`
    }
    return valueOf(r, c.metrics[0], byId)
  }
  // The team he played for nearest a week (before it, else after): a week a source left without
  // his team, and the weeks he has no row.
  const teamNear = (week: number): string | null => {
    const known = rows.filter((x) => x.r.team !== null)
    const near = known.filter((x) => x.week <= week).at(-1) ?? known.find((x) => x.week > week)
    return near?.r.team ?? null
  }
  const played = (r: StatsRow, week: number): LogRow => {
    const team = r.team ?? teamNear(week) ?? ''
    const g = sideOf(team).find((x) => x.week === week)
    const opp = String(r.group.opponent ?? g?.opponent ?? '')
    const away = g ? !g.home && !g.neutral : false
    return {
      key: `w${week}`,
      week: label(week),
      opponent: `${away ? '@ ' : ''}${opp}`,
      score: g?.played ? `${g.result} ${g.pointsFor}–${g.pointsAgainst}` : null,
      result: g?.result ?? null,
      note: null,
      cells: LOG_COLUMNS[kind].map((c) => cell(r, c)),
      points: FANTASY.includes(kind) ? valueOf(r, 'fantasy_points', byId) : null,
      expected: OFFENSE.includes(kind) ? valueOf(r, 'expected_points', byId) : null
    }
  }
  if (scope.seasonType === 'POST') return rows.map((x) => played(x.r, x.week))
  const [a, b] = weeksOf(scope, status)
  const out: LogRow[] = []
  for (let w = a; w <= b; w++) {
    const r = byWeek.get(w)
    if (r) {
      out.push(played(r, w))
      continue
    }
    const team = teamNear(w)
    const g = team ? sideOf(team).find((x) => x.week === w && x.seasonType === 'REG') : undefined
    out.push({
      key: `w${w}`,
      week: `W${w}`,
      opponent: g ? `${!g.home && !g.neutral ? '@ ' : ''}${g.opponent}` : '',
      score: null,
      result: null,
      note: g ? (g.played ? 'Did not play' : 'Not played yet') : 'Bye',
      cells: LOG_COLUMNS[kind].map(() => ''),
      points: null,
      expected: null
    })
  }
  if (scope.seasonType === 'ALL')
    out.push(...rows.filter((x) => x.week > b).map((x) => played(x.r, x.week)))
  return out
}

interface SplitGroup {
  title: string
  splits: PlayerSplitKey[]
  note?: string
}

const BASE_GROUPS: SplitGroup[] = [
  { title: 'Games', splits: ['all', 'home', 'away', 'last4'] },
  { title: 'Quarter', splits: ['quarter'] },
  { title: 'Score', splits: ['leading', 'close', 'trailing'] },
  { title: 'Down and field', splits: ['down', 'redzone'] }
]

/** Spec §9.4 Splits: the rows of the splits table, by position group. */
export const SPLIT_GROUPS: Record<PlayerKind, SplitGroup[]> = {
  QB: [
    ...BASE_GROUPS,
    { title: 'Pressure', splits: ['pressured', 'clean'], note: PARTICIPATION },
    {
      title: 'Blitz and play action',
      splits: ['blitz', 'noBlitz', 'playAction', 'noPlayAction'],
      note: CHARTED
    }
  ],
  RB: BASE_GROUPS,
  REC: [...BASE_GROUPS, { title: 'Coverage', splits: ['coverage'], note: PARTICIPATION }],
  K: [],
  P: [],
  DEF: BASE_GROUPS,
  OTHER: []
}

/**
 * The splits table's columns, by position group: metrics the plays give in every season (per-route
 * rates need participation, published after the season).
 */
export const SPLIT_METRICS: Record<PlayerKind, string[]> = {
  QB: ['qb_epa_db', 'qb_success', 'cpoe', 'pass_cmp_pct', 'pass_ypa', 'pass_td', 'pass_int'],
  RB: ['rush_yds', 'rush_ypc', 'rush_td', 'rush_epa', 'rush_success', 'targets', 'rec_yds'],
  REC: ['receptions', 'rec_yds', 'rec_td', 'catch_rate', 'rec_ypt', 'rec_epa', 'rec_adot'],
  K: [],
  P: [],
  DEF: ['tackles', 'solo_tackles', 'sacks', 'qb_hits', 'pass_defended', 'def_ints', 'def_stuffs'],
  OTHER: []
}

/**
 * The rate whose sample is a split row's plays (a count's sample is its games): dropbacks, carries,
 * targets. Defenders count games.
 */
const PLAYS_OF: Partial<Record<PlayerKind, { metric: string; label: string }>> = {
  QB: { metric: 'qb_epa_db', label: 'Dropbacks' },
  RB: { metric: 'rush_ypc', label: 'Carries' },
  REC: { metric: 'catch_rate', label: 'Targets' }
}

/** One query per split of the table, over the position; the qualifier rides in `all`. */
export function splitTableQueries(
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): Map<PlayerSplitKey, StatsQuery> {
  const kind = kindOf(position)
  const metrics = SPLIT_METRICS[kind]
  if (!metrics.length) return new Map()
  const qualifier = positionTab(position).qualifier
  return new Map(
    SPLIT_GROUPS[kind]
      .flatMap((g) => g.splits)
      .map((k) => [
        k,
        positionQuery(
          k === 'all' && qualifier && !metrics.includes(qualifier)
            ? [...metrics, qualifier]
            : metrics,
          position,
          k,
          scope,
          status
        )
      ])
  )
}

export interface SplitCell {
  value: string
  rank: string | null
  heat: Heat
  title: string
}

export interface PlayerSplitRow {
  key: string
  label: string
  /** The player's sample in the split: dropbacks, carries, targets, tackles. */
  plays: string
  cells: SplitCell[]
}

const QUARTERS = ['1st quarter', '2nd quarter', '3rd quarter', '4th quarter']
const DOWNS = ['1st down', '2nd down', '3rd down']

/**
 * The splits table (spec §9.4): one row per split (a grouped split gives a row per value), each
 * cell ranked among the position's qualified players in the same split.
 */
export function splitTable(
  results: ReadonlyMap<PlayerSplitKey, StatsResult>,
  player: string,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): { title: string; note?: string; rows: PlayerSplitRow[] }[] {
  const kind = kindOf(position)
  const metrics = SPLIT_METRICS[kind]
  const pool = poolOf(results.get('all'), position)
  const row = (key: string, label: string, r: StatsResult | undefined): PlayerSplitRow => {
    const mine = r?.rows.find((x) => x.id === player)
    const by = PLAYS_OF[kind]
    const plays = by ? mine?.values[by.metric]?.sample : mine?.games
    return {
      key,
      label,
      plays: plays == null ? '—' : fmtStat(plays, { unit: 'count', decimals: 0 }),
      cells: metrics.map((metric) => {
        const l = statLine(r, player, { metric }, byId, season, (x) => pool.has(x.id))
        return {
          value: l.value,
          rank: l.rank ? l.rank.replace(/ (of \d+|highest)$/, '') : null,
          heat: l.heat,
          title: l.title
        }
      })
    }
  }
  const sub = (
    r: StatsResult | undefined,
    dim: 'quarter' | 'down' | 'coverage',
    value: string | number
  ): StatsResult | undefined => r && { ...r, rows: r.rows.filter((x) => x.group[dim] === value) }
  return SPLIT_GROUPS[kind].map((g) => ({
    title: g.title,
    ...(g.note ? { note: g.note } : {}),
    rows: g.splits.flatMap((k): PlayerSplitRow[] => {
      const r = results.get(k)
      if (k === 'quarter')
        return QUARTERS.map((label, i) => row(`q${i + 1}`, label, sub(r, 'quarter', i + 1)))
      if (k === 'down')
        return DOWNS.map((label, i) => row(`d${i + 1}`, label, sub(r, 'down', i + 1)))
      if (k === 'coverage')
        return [
          row('man', 'vs Man', sub(r, 'coverage', 'man')),
          row('zone', 'vs Zone', sub(r, 'coverage', 'zone'))
        ]
      return [row(k, PLAYER_SPLITS[k].label, r)]
    })
  }))
}

/** The splits table's head: plays, then each metric's short label. */
export function splitHead(
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): string[] {
  const kind = kindOf(position)
  return [
    PLAYS_OF[kind]?.label ?? 'Games',
    ...SPLIT_METRICS[kind].map((id) => byId.get(id)?.short ?? id)
  ]
}

/** By opponent (spec §9.4): the player's own rows, one per opponent. */
export function opponentQuery(
  player: string,
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery | null {
  const metrics = SPLIT_METRICS[kindOf(position)]
  if (!metrics.length) return null
  return playerQuery(player, metrics, scope, status, ['opponent'])
}

export function opponentRows(
  result: StatsResult | null,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>
): LineRow[] {
  const metrics = SPLIT_METRICS[kindOf(position)]
  return (result?.rows ?? [])
    .filter((r) => r.group.opponent != null)
    .sort((a, b) => String(a.group.opponent).localeCompare(String(b.group.opponent)))
    .map((r) => ({
      key: String(r.group.opponent),
      label: String(r.group.opponent),
      games: String(r.games),
      cells: metrics.map((id) => valueOf(r, id, byId))
    }))
}

/** With and without a teammate on the field (participation, through the prior season). */
export function teammateQueries(
  player: string,
  teammate: string,
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): Map<'with' | 'without', StatsQuery> | null {
  const metrics = SPLIT_METRICS[kindOf(position)]
  if (!metrics.length) return null
  const base = playerQuery(player, metrics, scope, status)
  return new Map([
    ['with', { ...base, situation: { withOnField: [teammate] } }],
    ['without', { ...base, situation: { withoutOnField: [teammate] } }]
  ])
}

/** Teammates to split by: his team's players in scope with the most snaps, offense or defense. */
export function teammatesQuery(
  team: string,
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery {
  const defense = kindOf(position) === 'DEF'
  const metric = defense ? 'def_snaps' : 'off_snaps'
  return {
    entity: 'player',
    metrics: [metric],
    scope: {
      ...queryScope(scope, status),
      teams: [team],
      positions: defense ? ['DL', 'LB', 'DB'] : ['QB', 'RB', 'WR', 'TE', 'OL']
    },
    sort: { metric, dir: 'desc' },
    limit: 30
  }
}

export function teammateOptions(
  result: StatsResult | null,
  player: string
): { value: string; label: string }[] {
  // Receivers and backs first: a lineman or a quarterback on the field for every snap leaves
  // "without him" empty. Most snaps first within each.
  const order = (p: string | null): number => (p === 'QB' ? 1 : p === 'OL' ? 2 : 0)
  return (result?.rows ?? [])
    .filter((r) => r.id !== player && (Object.values(r.values)[0]?.value ?? 0) > 0)
    .slice(0, 20)
    .sort((a, b) => order(a.position) - order(b.position))
    .map((r) => ({ value: r.id, label: `${r.name} (${r.position ?? '—'})` }))
}

/** Forecast (spec §9.4): the next opponent's defense against the position. */
const ALLOWED: Partial<Record<PositionGroup, string>> = {
  QB: 'fpa_qb',
  RB: 'fpa_rb',
  WR: 'fpa_wr',
  TE: 'fpa_te',
  K: 'fpa_k'
}

export function opponentDefenseQuery(
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null
): StatsQuery | null {
  const fpa = ALLOWED[position]
  if (!fpa) return null
  return {
    entity: 'team',
    metrics: [fpa, 'adj_def_epa', position === 'RB' ? 'def_rush_epa' : 'def_pass_epa'],
    scope: queryScope(scope, status),
    transform: 'raw',
    sort: { metric: fpa, dir: 'desc' },
    scoring: scope.scoring,
    limit: 40
  }
}

const MATCHUP_LABELS: Record<string, string> = {
  adj_def_epa: 'Adjusted EPA allowed',
  def_pass_epa: 'EPA/dropback allowed',
  def_rush_epa: 'EPA/carry allowed'
}

export interface MatchupView {
  opponent: string
  where: string
  when: string
  lines: StatLine[]
}

/** The next game and how its defense fares against the position, ranked among the 32. */
export function nextMatchup(
  games: readonly GameForecast[] | null,
  team: string | null,
  defense: StatsResult | null,
  position: PositionGroup,
  byId: ReadonlyMap<string, MetricInfo>,
  season: number,
  today = new Date()
): MatchupView | null {
  if (!games || !team) return null
  const ahead = (g: TeamGame): boolean =>
    g.gameday === null || new Date(`${g.gameday}T23:59:59`) >= today
  const g = teamGames(games, team).find((x) => !x.played && ahead(x))
  if (!g) return null
  const date = g.gameday
    ? new Date(`${g.gameday}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      })
    : null
  const week = g.round ?? `Week ${g.week}`
  // The handoff's matchup tone: from the player's side, a stingy defense is bad news.
  const lines = (defense?.columns ?? []).map((c) => {
    const l = statLine(
      defense!,
      g.opponent,
      { metric: c.id, label: MATCHUP_LABELS[c.id] },
      byId,
      season
    )
    const p = l.percentile === null ? null : 100 - l.percentile
    return {
      ...l,
      label: c.id === ALLOWED[position] ? `Fantasy points to ${position}s` : l.label,
      percentile: p,
      heat: heatOf(p, l.info?.direction ?? 'neutral')
    }
  })
  return {
    opponent: g.opponent,
    where: g.neutral ? 'Neutral site' : g.home ? 'Home' : 'Away',
    when: date ? `${week} · ${date}` : week,
    lines
  }
}

/** Forecast: the outlook (spec §8.5) as the tab writes it. */
export interface OutlookView {
  range: { label: string; season: string; last16: string }[]
  rates: { label: string; value: string }[]
  trend: {
    metric: string
    label: string
    season: string
    last4: string
    change: string
    flag: 'up' | 'down' | null
  }[]
  signals: {
    metric: string
    label: string
    value: string
    mean: string
    text: string
    signal: 'hot' | 'cold' | null
  }[]
  schedule: string | null
}

export function outlookView(o: PlayerOutlook, byId: ReadonlyMap<string, MetricInfo>): OutlookView {
  const pts = (x: number | null): string => fmtStat(x, { unit: 'points', decimals: 1 })
  const pct = (x: number | null): string => fmtStat(x, { unit: 'pct', decimals: 0 })
  const f = (id: string, x: number | null, signed = false): string => {
    const m = byId.get(id)
    const text = fmtStat(x, { unit: m?.unit ?? 'number', decimals: m?.decimals ?? 1 })
    return signed && x !== null && x > 0 && !text.startsWith('+') ? `+${text}` : text
  }
  const label = (id: string): string => byId.get(id)?.label ?? id
  return {
    range: [
      {
        label: 'Ceiling (80th percentile week)',
        season: pts(o.ceiling.season),
        last16: pts(o.ceiling.last16)
      },
      {
        label: 'Floor (20th percentile week)',
        season: pts(o.floor.season),
        last16: pts(o.floor.last16)
      }
    ],
    rates: [
      { label: 'Boom weeks', value: pct(o.boomRate) },
      { label: 'Bust weeks', value: pct(o.bustRate) }
    ],
    // A share he never has (a receiver's carries) says nothing.
    trend: o.trend
      .filter((t) => t.season !== null && !(t.season === 0 && !t.last4))
      .map((t) => ({
        metric: t.metric,
        label: label(t.metric),
        season: f(t.metric, t.season),
        last4: f(t.metric, t.last4),
        change: t.change === null ? '—' : f(t.metric, t.change, true),
        flag: t.roleChange
      })),
    signals: o.regression
      .filter((s) => s.value !== null)
      .map((s) => ({
        metric: s.metric,
        label: label(s.metric),
        value: f(s.metric, s.value, true),
        mean: f(s.metric, s.mean),
        signal: s.signal,
        text:
          s.signal === null || s.expectedChange === null
            ? 'In line with what the position sustains.'
            : `Running ${s.signal}: expect it to ${s.signal === 'hot' ? 'fall' : 'rise'} by about ${f(s.metric, Math.abs(s.expectedChange))}.`
      })),
    schedule:
      o.schedule.easierBy === null
        ? null
        : `${o.schedule.opponents.length} games left. Their defenses allowed ${pts(Math.abs(o.schedule.easierBy))} ${o.schedule.easierBy >= 0 ? 'more' : 'fewer'} fantasy points per game to the position than average.`
  }
}

/**
 * Forecast: the stability-weighted profile, each core rate raw and shrunk (spec §8.5, §8.6). Over
 * the position: shrinkage pulls toward the position's mean.
 */
export function shrunkQuery(
  position: PositionGroup,
  scope: StatsScope,
  status: StatsStatus | null,
  byId: ReadonlyMap<string, MetricInfo>
): StatsQuery | null {
  const rates = CORE_METRICS[position].filter((id) => byId.get(id)?.kind === 'rate')
  if (!rates.length) return null
  return {
    entity: 'player',
    metrics: rates,
    scope: { ...queryScope(scope, status), positions: [position] },
    transform: 'shrunk',
    sort: { metric: rates[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: POSITION_ROWS
  }
}

export interface ShrunkRow {
  metric: string
  label: string
  raw: string
  shrunk: string
  reliability: string | null
  info: MetricInfo | null
}

export function shrunkRows(
  result: StatsResult | null,
  player: string,
  byId: ReadonlyMap<string, MetricInfo>
): ShrunkRow[] {
  const r = result?.rows.find((x) => x.id === player)
  return (result?.columns ?? []).map((c) => {
    const info = byId.get(c.id) ?? null
    const f = { unit: c.unit, decimals: c.decimals }
    return {
      metric: c.id,
      label: c.label,
      raw: fmtStat(r?.values[c.id]?.raw ?? null, f),
      shrunk: fmtStat(r?.values[c.id]?.value ?? null, f),
      reliability: info ? (reliabilityOf(info)?.level ?? null) : null,
      info
    }
  })
}

/** Profile (spec §9.4, §8.7): combine measures with their 0–10 score within the position. */
export const COMBINE: { id: string; label: string }[] = [
  { id: 'height', label: 'Height' },
  { id: 'weight', label: 'Weight' },
  { id: 'forty', label: '40-yard dash' },
  { id: 'bench', label: 'Bench press' },
  { id: 'vertical', label: 'Vertical jump' },
  { id: 'broad_jump', label: 'Broad jump' },
  { id: 'cone', label: '3-cone drill' },
  { id: 'shuttle', label: 'Short shuttle' }
]

export function profileQuery(bio: PlayerBio): StatsQuery | null {
  if (bio.seasons.length === 0) return null
  return {
    entity: 'player',
    metrics: [
      'ras',
      'ras_measures',
      'speed_score',
      ...COMBINE.flatMap((m) => [m.id, `${m.id}_score`])
    ],
    scope: { seasons: bio.seasons, seasonType: 'ALL', players: [bio.id] },
    transform: 'raw',
    limit: 1
  }
}

export interface CombineRow {
  id: string
  label: string
  value: string
  /** 0–100: the score's place within the position group's combines since 2000. */
  percentile: number | null
}

const COMBINE_TEXT: Record<string, (v: number) => string> = {
  height: (v) => `${Math.floor(v / 12)}′${Math.round(v % 12)}″`,
  weight: (v) => `${Math.round(v)} lb`,
  forty: (v) => `${v.toFixed(2)} s`,
  bench: (v) => `${Math.round(v)} reps`,
  vertical: (v) => `${v.toFixed(1)}″`,
  broad_jump: (v) => `${Math.floor(v / 12)}′${Math.round(v % 12)}″`,
  cone: (v) => `${v.toFixed(2)} s`,
  shuttle: (v) => `${v.toFixed(2)} s`
}

export function combineView(result: StatsResult | null): {
  rows: CombineRow[]
  ras: string | null
  measures: number | null
  speedScore: string | null
} {
  const r = result?.rows[0]
  const v = (id: string): number | null => r?.values[id]?.value ?? null
  return {
    rows: COMBINE.map((m) => {
      const x = v(m.id)
      const score = v(`${m.id}_score`)
      return {
        id: m.id,
        label: m.label,
        value: x === null ? '—' : COMBINE_TEXT[m.id](x),
        percentile: score === null ? null : Math.max(0, Math.min(100, score * 10))
      }
    }),
    ras: v('ras') === null ? null : v('ras')!.toFixed(1),
    measures: v('ras_measures'),
    speedScore: v('speed_score') === null ? null : Math.round(v('speed_score')!).toString()
  }
}

/** Forecast (spec §9.4), with a league: Sleeper's projection, the rest of season, the experts. */
export interface ProjectionView {
  next: { week: number; opponent: string | null; points: string } | null
  ros: string
  rosRank: string | null
  experts: string | null
}

export function projectionView(detail: PlayerDetail, position: PositionGroup): ProjectionView {
  const next = detail.weeks.find((w) => !w.played && w.projected !== null) ?? null
  const pts = (x: number | null): string => fmtStat(x, { unit: 'points', decimals: 1 })
  return {
    next: next ? { week: next.week, opponent: next.opponent, points: pts(next.projected) } : null,
    ros: pts(detail.row.rosPoints),
    rosRank: detail.row.rosRank === null ? null : `${position}${detail.row.rosRank}`,
    experts: detail.row.expert ? `${position}${detail.row.expert.ecrPosRank}` : null
  }
}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/renderer/lib/statsPlayer.test.ts tests/renderer/lib/statsTeam.test.ts
```

Expected: PASS (38 passed). Then `npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run`: clean; 1003 passed | 5 skipped.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/renderer/src/lib/stats/player.ts src/renderer/src/lib/stats/team.ts tests/renderer/lib/statsPlayer.test.ts
git add src/renderer/src/lib/stats/player.ts src/renderer/src/lib/stats/team.ts tests/renderer/lib/statsPlayer.test.ts
git commit -m "feat(stats): model the player dashboard"
```

---

### Task 3: Shared parts and the data hooks (spec §9.4, §9.6)

The team dashboard's small pieces move to `parts.tsx` so the player dashboard can use them, beside a shaded split cell and the headshot. A section can carry a note. The hooks read a player's bio, his outlook, a season's games, his Fantasy id and his Fantasy file.

**Files:**

- Create: `src/renderer/src/components/stats/parts.tsx`, `tests/renderer/components/StatsParts.test.tsx`
- Modify: `src/renderer/src/components/stats/StatLines.tsx`, `src/renderer/src/lib/stats/player.ts`, `src/renderer/src/lib/stats/useStats.ts`, `src/renderer/src/screens/stats/StatsTeam.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/components/StatsParts.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Headshot, HeatCell, PlayerName } from '@/components/stats/parts'
import { StatSection } from '@/components/stats/StatLines'

afterEach(cleanup)

describe('the dashboards’ shared pieces', () => {
  it('shows Sleeper’s headshot, and the initials without one or when it fails to load', () => {
    render(<Headshot name="Ja'Marr Chase" sleeperId="7564" />)
    const img = screen.getByRole('img', { name: "Ja'Marr Chase" })
    expect(img.getAttribute('src')).toBe(
      'https://sleepercdn.com/content/nfl/players/thumb/7564.jpg'
    )
    fireEvent.error(img)
    expect(screen.getByRole('img', { name: "Ja'Marr Chase" }).textContent).toBe('JC')
    cleanup()
    render(<Headshot name="Brandon Aubrey" sleeperId={null} />)
    expect(screen.getByRole('img', { name: 'Brandon Aubrey' }).textContent).toBe('BA')
  })

  it('opens a player from his name when the table can', () => {
    const open = vi.fn()
    render(<PlayerName name="Tee Higgins" position="WR" mine onOpen={open} />)
    fireEvent.click(screen.getByRole('button', { name: /Tee Higgins/ }))
    expect(open).toHaveBeenCalledOnce()
    cleanup()
    render(<PlayerName name="Tee Higgins" position="WR" mine={false} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shades a split cell and writes its rank', () => {
    render(<HeatCell value="+0.31" rank="2nd" heat="h3" title="2nd among qualified WRs" />)
    const cell = screen.getByTitle('2nd among qualified WRs')
    expect(cell.className).toContain('bg-h3')
    expect(cell.textContent).toBe('+0.312nd')
  })

  it('says what a section’s data covers beside its title', () => {
    render(
      <StatSection section={{ title: 'Man and zone', note: 'Participation data.', lines: [] }} />
    )
    expect(screen.getByRole('heading', { name: 'Man and zone' })).toBeTruthy()
    expect(screen.getByText('Participation data.')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/renderer/components/StatsParts.test.tsx tests/renderer/components/StatsTeam.test.tsx tests/renderer/components/StatsCharts.test.tsx
```

Expected: FAIL. `@/components/stats/parts` does not exist (`Failed to resolve import`). The team dashboard's and the charts' tests still pass (16).

- [ ] **Step 3: The parts**

The headshot URL is a function of the model (a component file exports components only).

Create `src/renderer/src/components/stats/parts.tsx`:

```tsx
import { useState } from 'react'
import { MineDot, PosText } from '@/components/stats/controls'
import type { Heat } from '@/lib/stats/format'
import { headshotUrl } from '@/lib/stats/player'
import { cn } from '@/lib/utils'

/** The dashboards' small pieces (handoff "Stats"): loading lines, section heads, mono tables. */

export function Loading({ error }: { error?: string | null }): React.JSX.Element {
  return error ? (
    <div className="py-12 text-center text-[13px] text-bad">{error}</div>
  ) : (
    <div className="py-12 text-center text-[13px] text-fg-3">Loading…</div>
  )
}

export function SectionHead({ title, note }: { title: string; note?: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">{title}</h2>
      {note && <span className="text-[12px] leading-none text-fg-3">{note}</span>}
    </div>
  )
}

/** A cell's background by its percentile step (the Ledger's seven). */
const HEAT_BG: Record<Heat, string> = {
  h3: 'bg-h3',
  h2: 'bg-h2',
  h1: 'bg-h1',
  n: '',
  l1: 'bg-l1',
  l2: 'bg-l2',
  l3: 'bg-l3'
}

/** A value shaded by its percentile, its rank beside it, the detail on hover (the splits tables). */
export function HeatCell({
  value,
  rank,
  heat,
  title
}: {
  value: string
  rank: string | null
  heat: Heat
  title: string
}): React.JSX.Element {
  return (
    <span
      title={title || undefined}
      className={cn('-my-1 block rounded-[4px] px-1.5 py-1', HEAT_BG[heat])}
    >
      {value}
      {rank && <span className="ml-1.5 text-[10.5px] text-fg-3">{rank}</span>}
    </span>
  )
}

/** A small mono table in the handoff's style: a header under a rule, 38px rows. */
export function MiniTable({
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

/** A player's name in a table: position, name, my-player dot; a button when it opens his dashboard. */
export function PlayerName({
  name,
  position,
  mine,
  onOpen
}: {
  name: string
  position: string | null
  mine: boolean
  onOpen?: () => void
}): React.JSX.Element {
  const label = (
    <>
      {position && (
        <span className="w-[22px] shrink-0">
          <PosText position={position} />
        </span>
      )}
      <span className="truncate">{name}</span>
      {mine && <MineDot />}
    </>
  )
  const style =
    'flex min-w-0 items-center gap-[7px] font-sans text-[13px] font-medium whitespace-nowrap'
  return onOpen ? (
    <button
      type="button"
      title={`Open ${name}’s dashboard`}
      onClick={onOpen}
      className={cn(style, 'cursor-pointer text-left hover:text-cobalt')}
    >
      {label}
    </button>
  ) : (
    <span className={style}>{label}</span>
  )
}

export function NavButton({
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

/**
 * Spec §9.4 header photo: the player's Sleeper headshot, his initials when there is none or it
 * does not load (offline).
 */
export function Headshot({
  name,
  sleeperId,
  size = 64
}: {
  name: string
  sleeperId: string | null
  size?: number
}): React.JSX.Element {
  const [failed, setFailed] = useState<string | null>(null)
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const box = 'shrink-0 overflow-hidden rounded-full bg-panel-2 shadow-[0_0_0_1px_var(--line)]'
  if (!sleeperId || failed === sleeperId) {
    return (
      <div
        role="img"
        aria-label={name}
        className={cn(box, 'flex items-center justify-center font-semibold text-fg-3')}
        style={{ width: size, height: size, fontSize: size * 0.34 }}
      >
        {initials}
      </div>
    )
  }
  return (
    <img
      src={headshotUrl(sleeperId)}
      alt={name}
      onError={() => setFailed(sleeperId)}
      className={cn(box, 'object-cover')}
      style={{ width: size, height: size }}
    />
  )
}
```

```diff
diff --git a/src/renderer/src/lib/stats/player.ts b/src/renderer/src/lib/stats/player.ts
index bf2985c..cf3d709 100644
--- a/src/renderer/src/lib/stats/player.ts
+++ b/src/renderer/src/lib/stats/player.ts
@@ -814,6 +814,11 @@ export interface PlayerHeader {
   status: { tag: string; tone: 'bad' | 'warn'; title: string } | null
 }

+/** Sleeper's picture of a player (the renderer's CSP allows sleepercdn.com). */
+export function headshotUrl(sleeperId: string): string {
+  return `https://sleepercdn.com/content/nfl/players/thumb/${encodeURIComponent(sleeperId)}.jpg`
+}
+
 /** "Sep 25, 1999 · age 27". */
 export function bornOf(birthDate: string | null, today = new Date()): string | null {
   if (!birthDate) return null
```

```diff
diff --git a/src/renderer/src/components/stats/StatLines.tsx b/src/renderer/src/components/stats/StatLines.tsx
index ffe431d..31c894c 100644
--- a/src/renderer/src/components/stats/StatLines.tsx
+++ b/src/renderer/src/components/stats/StatLines.tsx
@@ -105,13 +105,25 @@ function Line({ line }: { line: StatLine }): React.JSX.Element {
   )
 }

-/** A titled list of stat lines (spec §9.3): value, percentile among the teams, rank, league mean. */
-export function StatSection({ section }: { section: SectionView }): React.JSX.Element {
+/**
+ * A titled list of stat lines (spec §9.3): value, percentile among the teams (a player's position),
+ * rank, league mean; a note beside the title says what the data covers.
+ */
+export function StatSection({
+  section
+}: {
+  section: SectionView & { note?: string }
+}): React.JSX.Element {
   return (
     <section className="flex flex-col gap-2">
-      <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">
-        {section.title}
-      </h2>
+      <div className="flex items-baseline justify-between gap-3">
+        <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">
+          {section.title}
+        </h2>
+        {section.note && (
+          <span className="text-right text-[11.5px] leading-none text-fg-3">{section.note}</span>
+        )}
+      </div>
       <div className="flex flex-col border-b border-line-2">
         {section.lines.map((l) => (
           <Line key={l.key} line={l} />
@@ -122,7 +134,11 @@ export function StatSection({ section }: { section: SectionView }): React.JSX.El
 }

 /** Sections in two columns. */
-export function StatSections({ sections }: { sections: SectionView[] }): React.JSX.Element {
+export function StatSections({
+  sections
+}: {
+  sections: (SectionView & { note?: string })[]
+}): React.JSX.Element {
   return (
     <div className="grid grid-cols-[repeat(auto-fit,minmax(520px,1fr))] items-start gap-x-10 gap-y-7">
       {sections.map((s) => (
```

```diff
diff --git a/src/renderer/src/screens/stats/StatsTeam.tsx b/src/renderer/src/screens/stats/StatsTeam.tsx
index 0fb6d2b..ba23f65 100644
--- a/src/renderer/src/screens/stats/StatsTeam.tsx
+++ b/src/renderer/src/screens/stats/StatsTeam.tsx
@@ -1,6 +1,14 @@
 import { useMemo, useState } from 'react'
 import { ChevronLeft, ChevronRight } from 'lucide-react'
-import { MineDot, PosText, Segmented, StatsSelect } from '@/components/stats/controls'
+import { MineDot, Segmented, StatsSelect } from '@/components/stats/controls'
+import {
+  HeatCell,
+  Loading,
+  MiniTable,
+  NavButton,
+  PlayerName,
+  SectionHead
+} from '@/components/stats/parts'
 import { ScopeBar } from '@/components/stats/ScopeBar'
 import { StatSection, StatSections } from '@/components/stats/StatLines'
 import { WeekChart } from '@/components/stats/WeekChart'
@@ -55,16 +63,6 @@ interface TabProps {
   games: TeamGame[] | null
 }

-const HEAT_BG: Record<string, string> = {
-  h3: 'bg-h3',
-  h2: 'bg-h2',
-  h1: 'bg-h1',
-  n: '',
-  l1: 'bg-l1',
-  l2: 'bg-l2',
-  l3: 'bg-l3'
-}
-
 /**
  * Spec §9.3 team dashboard: the handoff's team page ("8. Team") as its header and Overview, and
  * the spec's stat tabs in the same language.
@@ -284,117 +282,6 @@ function Header({
   )
 }

-function NavButton({
-  title,
-  onClick,
-  children
-}: {
-  title: string
-  onClick: () => void
-  children: React.ReactNode
-}): React.JSX.Element {
-  return (
-    <button
-      type="button"
-      title={title}
-      aria-label={title}
-      onClick={onClick}
-      className="flex size-[26px] cursor-pointer items-center justify-center rounded-[6px] border border-line bg-panel text-fg-2 hover:bg-hover hover:text-fg"
-    >
-      {children}
-    </button>
-  )
-}
-
-function Loading({ error }: { error?: string | null }): React.JSX.Element {
-  return error ? (
-    <div className="py-12 text-center text-[13px] text-bad">{error}</div>
-  ) : (
-    <div className="py-12 text-center text-[13px] text-fg-3">Loading…</div>
-  )
-}
-
-function SectionHead({ title, note }: { title: string; note?: string }): React.JSX.Element {
-  return (
-    <div className="flex items-baseline justify-between gap-3">
-      <h2 className="m-0 text-[15px] leading-none font-semibold tracking-[-0.01em]">{title}</h2>
-      {note && <span className="text-[12px] leading-none text-fg-3">{note}</span>}
-    </div>
-  )
-}
-
-/** A small mono table in the handoff's style: a header under a rule, 38px rows. */
-function MiniTable({
-  columns,
-  head,
-  rows,
-  left = [],
-  className
-}: {
-  columns: string
-  head: React.ReactNode[]
-  rows: { key: string; cells: React.ReactNode[] }[]
-  /** Columns read left to right (text); the first always is, numbers align right. */
-  left?: number[]
-  className?: string
-}): React.JSX.Element {
-  const align = (i: number): string => (i === 0 || left.includes(i) ? 'text-left' : 'text-right')
-  return (
-    <div
-      className={cn('flex flex-col font-mono text-[12.5px] tabular-nums', className)}
-      role="table"
-    >
-      <div
-        role="row"
-        className="grid h-7 items-end gap-x-3 border-b border-fg-3 pb-[7px] text-[11px] text-fg-3"
-        style={{ gridTemplateColumns: columns }}
-      >
-        {head.map((h, i) => (
-          <span key={i} role="columnheader" className={cn(align(i), i === 0 && 'font-sans')}>
-            {h}
-          </span>
-        ))}
-      </div>
-      {rows.map((r) => (
-        <div
-          key={r.key}
-          role="row"
-          className="grid h-[38px] items-center gap-x-3 border-b border-line-2"
-          style={{ gridTemplateColumns: columns }}
-        >
-          {r.cells.map((c, i) => (
-            <span key={i} role="cell" className={cn('min-w-0', align(i))}>
-              {c}
-            </span>
-          ))}
-        </div>
-      ))}
-    </div>
-  )
-}
-
-function PlayerName({
-  name,
-  position,
-  mine
-}: {
-  name: string
-  position: string | null
-  mine: boolean
-}): React.JSX.Element {
-  return (
-    <span className="flex min-w-0 items-center gap-[7px] font-sans text-[13px] font-medium whitespace-nowrap">
-      {position && (
-        <span className="w-[22px] shrink-0">
-          <PosText position={position} />
-        </span>
-      )}
-      <span className="truncate">{name}</span>
-      {mine && <MineDot />}
-    </span>
-  )
-}
-
 function ShareBar({ row }: { row: ShareRow }): React.JSX.Element {
   return (
     <span className="flex items-center gap-2">
@@ -717,16 +604,7 @@ function Situational({ data, scope, team }: TabProps): React.JSX.Element {
             rows={splitRows(splits, team, data.byId, scope.season).map((r) => {
               const cell = (k: number): React.JSX.Element => {
                 const c = r.cells[k]
-                return (
-                  <span
-                    key={k}
-                    title={c.title || undefined}
-                    className={cn('-my-1 block rounded-[4px] px-1.5 py-1', HEAT_BG[c.heat])}
-                  >
-                    {c.value}
-                    {c.rank && <span className="ml-1.5 text-[10.5px] text-fg-3">{c.rank}</span>}
-                  </span>
-                )
+                return <HeatCell key={k} {...c} />
               }
               return {
                 key: r.key,
```

- [ ] **Step 4: The hooks**

```diff
diff --git a/src/renderer/src/lib/stats/useStats.ts b/src/renderer/src/lib/stats/useStats.ts
index d40a7f3..c800c31 100644
--- a/src/renderer/src/lib/stats/useStats.ts
+++ b/src/renderer/src/lib/stats/useStats.ts
@@ -1,9 +1,14 @@
 import { useEffect, useMemo, useState } from 'react'
 import { api } from '@/lib/api'
 import { errorMessage } from '@/lib/format'
+import type { PlayerDetail } from '@shared/types'
 import type {
   GameForecast,
   MetricInfo,
+  OutlookQuery,
+  PlayerBio,
+  PlayerLink,
+  PlayerOutlook,
   StatsOwnership,
   StatsQuery,
   StatsResult,
@@ -182,3 +187,103 @@ export function useTeamGames(
   const current = done !== null && done.key === key
   return { games: current ? done.games : null, error: current ? done.error : null }
 }
+
+/** A read keyed by text (`version|request`): again when the key changes, a stale answer dropped. */
+function useKeyed<T>(
+  key: string | null,
+  run: (request: string) => Promise<T>
+): { data: T | null; loading: boolean; error: string | null } {
+  const [done, setDone] = useState<{ key: string; data: T | null; error: string | null } | null>(
+    null
+  )
+  useEffect(() => {
+    if (key === null) return
+    let cancelled = false
+    run(key.slice(key.indexOf('|') + 1))
+      .then((data) => !cancelled && setDone({ key, data, error: null }))
+      .catch((err) => !cancelled && setDone({ key, data: null, error: errorMessage(err) }))
+    return () => {
+      cancelled = true
+    }
+  }, [key, run])
+  const current = done !== null && done.key === key
+  return {
+    data: current ? done.data : null,
+    loading: key !== null && !current,
+    error: current ? done.error : null
+  }
+}
+
+const readBio = (request: string): Promise<PlayerBio> => api.stats.player(JSON.parse(request))
+const readOutlook = (request: string): Promise<PlayerOutlook> =>
+  api.stats.outlook(JSON.parse(request))
+const readGames = (request: string): Promise<GameForecast[]> => api.stats.games(JSON.parse(request))
+const readLink = (request: string): Promise<PlayerLink | null> =>
+  api.stats.link(JSON.parse(request))
+const readDetail = (request: string): Promise<PlayerDetail> => {
+  const { season, id } = JSON.parse(request) as { season: number; id: string }
+  return api.players.detail(season, id)
+}
+
+/** Spec §9.4: a player's identity and status now, again after a rebuild. */
+export function usePlayerBio(
+  player: string | null,
+  version: number
+): { bio: PlayerBio | null; error: string | null } {
+  const { data, error } = useKeyed(
+    player ? `${version}|${JSON.stringify({ player })}` : null,
+    readBio
+  )
+  return { bio: data, error }
+}
+
+/** Spec §8.5: a player's outlook (the Forecast tab). */
+export function usePlayerOutlook(
+  query: OutlookQuery | null,
+  version: number
+): { outlook: PlayerOutlook | null; error: string | null } {
+  const { data, error } = useKeyed(
+    query ? `${version}|${JSON.stringify(query)}` : null,
+    readOutlook
+  )
+  return { outlook: data, error }
+}
+
+/** Every game of a season (a player's log reads his team's side of each). */
+export function useSeasonGames(
+  season: number | null,
+  version: number
+): { games: GameForecast[] | null; error: string | null } {
+  const { data, error } = useKeyed(
+    season === null ? null : `${version}|${JSON.stringify({ season })}`,
+    readGames
+  )
+  return { games: data, error }
+}
+
+/**
+ * The same player in Fantasy (spec §9.4): his Sleeper id from the league's id map, read again when
+ * the league changes (`leagueKey`); null without a league.
+ */
+export function usePlayerLink(gsis: string | null, leagueKey: number | null): PlayerLink | null {
+  const { data } = useKeyed(
+    gsis && leagueKey !== null ? `${leagueKey}|${JSON.stringify({ gsis })}` : null,
+    readLink
+  )
+  return data
+}
+
+/** Fantasy's file on a player (projections, rest of season, experts): with a league only. */
+export function useFantasyDetail(
+  season: number | null,
+  sleeperId: string | null,
+  leagueKey: number
+): { detail: PlayerDetail | null; error: string | null } {
+  const { data, error } = useKeyed(
+    season !== null && sleeperId
+      ? `${leagueKey}|${JSON.stringify({ season, id: sleeperId })}`
+      : null,
+    readDetail
+  )
+  return { detail: data, error }
+}
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/renderer/components/StatsParts.test.tsx tests/renderer/components/StatsTeam.test.tsx tests/renderer/components/StatsCharts.test.tsx
```

Expected: PASS (20 passed). Then `npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run`: clean; 1007 passed | 5 skipped.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/renderer/src/components/stats/StatLines.tsx src/renderer/src/components/stats/parts.tsx src/renderer/src/lib/stats/player.ts src/renderer/src/lib/stats/useStats.ts src/renderer/src/screens/stats/StatsTeam.tsx tests/renderer/components/StatsParts.test.tsx
git add src/renderer/src/components/stats/StatLines.tsx src/renderer/src/components/stats/parts.tsx src/renderer/src/lib/stats/player.ts src/renderer/src/lib/stats/useStats.ts src/renderer/src/screens/stats/StatsTeam.tsx tests/renderer/components/StatsParts.test.tsx
git commit -m "feat(stats): add shared dashboard parts"
```

---

### Task 4: The player dashboard (spec §9.4; amendments A–E, H)

The rail and the screen, and the routes to them: Players in the nav, a leaderboard's player row, a home board's player row, the team dashboard's names, and "Player leaderboards →" back. With a league, the default waits for the rosters (the team dashboard's too).

**Files:**

- Create: `src/renderer/src/components/stats/PlayerRail.tsx`, `src/renderer/src/screens/stats/StatsPlayer.tsx`, `tests/renderer/components/StatsPlayer.test.tsx`
- Modify: `src/renderer/src/components/stats/StatsNav.tsx`, `src/renderer/src/lib/stats/useStats.ts`, `src/renderer/src/screens/stats/StatsApp.tsx`, `src/renderer/src/screens/stats/StatsLeaderboard.tsx`, `src/renderer/src/screens/stats/StatsTeam.tsx`, `tests/fixtures/statsScreens.ts`, `tests/renderer/components/StatsApp.test.tsx`

- [ ] **Step 1: Write the failing tests**

Plan AA's app tests reached the player leaderboard through Players in the nav: they now go through "Player leaderboards →".

```diff
diff --git a/tests/fixtures/statsScreens.ts b/tests/fixtures/statsScreens.ts
index 0eb9f70..c2ef579 100644
--- a/tests/fixtures/statsScreens.ts
+++ b/tests/fixtures/statsScreens.ts
@@ -5,6 +5,7 @@ import type {
   MetricInfo,
   MetricStability,
   MetricValue,
+  PlayerBio,
   StatsResult,
   StatsRow,
   StatsStatus
@@ -88,3 +89,26 @@ export function result(
     ...over
   }
 }
+
+/** A player as `stats.player()` reads him: "Player 0" for p0, a WR on SEA. */
+export function bio(id: string, over: Partial<PlayerBio> = {}): PlayerBio {
+  return {
+    id,
+    name: `Player ${id.slice(1)}`,
+    firstName: 'Player',
+    lastName: id.slice(1),
+    position: 'WR',
+    team: 'SEA',
+    jersey: 11,
+    birthDate: '2000-01-15',
+    height: 73,
+    weight: 200,
+    college: 'Ohio State',
+    draft: { year: 2021, round: 1, pick: 10, team: 'SEA' },
+    rookieSeason: 2021,
+    seasons: [2025, 2026],
+    sleeperId: null,
+    status: null,
+    ...over
+  }
+}
```

Create `tests/renderer/components/StatsPlayer.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { StatsApp } from '@/screens/stats/StatsApp'
import type { StatsScope } from '@/lib/stats/scope'
import { api } from '@/lib/api'
import type { GameForecast, PlayerOutlook, StatsOwnership, StatsQuery } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'
import { bio, catalogue, result, row, STATUS, value } from '../../fixtures/statsScreens'

vi.mock('@/lib/api', () => ({
  api: {
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

const OWNERSHIP: StatsOwnership = { players: { p1: { name: 'Cook Book', mine: true } }, teams: {} }

const OPP: Record<number, string> = { 1: 'ARI', 2: 'LA', 3: 'SF' }
const DIMS: Record<string, (string | number)[]> = {
  week: [1, 2, 3],
  opponent: ['ARI', 'LA', 'SF'],
  quarter: [1, 2, 3, 4],
  down: [1, 2, 3],
  coverage: ['man', 'zone'],
  season: [2025, 2026],
  team: ['SEA']
}

/** Players p0–p3 at the asked position (p3 below the qualifier); my top scorer p1 is a RB. */
function answer(q: StatsQuery): ReturnType<typeof result> {
  if (q.entity === 'team') {
    const rows = ['ARI', 'LA', 'SF'].map((t, i) =>
      row(t, t, Object.fromEntries(q.metrics.map((m) => [m, value(20 - i)])), {
        team: t,
        position: null
      })
    )
    return result(q.metrics, rows)
  }
  // My top scorer: my roster's ids, the best one.
  if (q.scope.players && q.limit === 1)
    return result(q.metrics, [
      row('p1', 'Player 1', { fantasy_points: value(200) }, { position: 'RB' })
    ])
  const position = q.scope.positions?.[0] ?? 'WR'
  const ids = q.scope.players ?? ['p0', 'p1', 'p2', 'p3']
  const groups = (q.groupBy ?? [])
    .reduce<Record<string, string | number>[]>(
      (acc, g) => acc.flatMap((a) => DIMS[g].map((v) => ({ ...a, [g]: v }))),
      [{}]
    )
    // A week has one opponent: SEA's schedule.
    .filter(
      (g) => g.week === undefined || g.opponent === undefined || g.opponent === OPP[Number(g.week)]
    )
  const rows = ids.flatMap((id) => {
    const i = Number(id.slice(1))
    const values = Object.fromEntries(
      q.metrics.map((m) => [m, value(100 - i * 10, { qualified: i < 3, sample: 40 })])
    )
    return groups.map((group) => ({
      ...row(id, `Player ${i}`, values, { position, team: 'SEA' }),
      group
    }))
  })
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
    away: 'ARI',
    neutral: false,
    homeScore: 27,
    awayScore: 20,
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
  game({ gameId: 'a', week: 1 }),
  game({ gameId: 'b', week: 2, home: 'LA', away: 'SEA', homeScore: 30, awayScore: 10 }),
  game({
    gameId: 'c',
    week: 7,
    gameday: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    home: 'ARI',
    away: 'SEA',
    homeScore: null,
    awayScore: null
  })
]

const OUTLOOK: PlayerOutlook = {
  player: 'p1',
  season: 2026,
  scoring: 'league',
  position: 'RB',
  team: 'SEA',
  games: 6,
  ceiling: { season: 24.2, last16: 22 },
  floor: { season: 9.1, last16: 8 },
  boomRate: 0.5,
  bustRate: 0,
  trend: [
    { metric: 'carry_share', season: 0.6, last4: 0.7, change: 0.12, z: 2.4, roleChange: 'up' }
  ],
  regression: [{ metric: 'fpoe', value: 20, mean: 1, expectedChange: -14, z: 1.3, signal: 'hot' }],
  schedule: { opponents: ['ARI', 'LA'], easierBy: 1.5 }
}

const IDLE: UpdateState = { status: 'idle' } as UpdateState

function Harness({ hasLeague }: { hasLeague: boolean }): React.JSX.Element {
  const [scope, setScope] = useState<StatsScope | null>(null)
  return (
    <StatsApp
      hasLeague={hasLeague}
      leagueKey={0}
      onOpenFantasy={() => {}}
      update={IDLE}
      version="0.30.0"
      onOpenUpdate={() => {}}
      onToggleTheme={() => {}}
      scope={scope}
      onScope={setScope}
    />
  )
}

const queries = (): StatsQuery[] => stats.query.mock.calls.map((c) => c[0])

async function openPlayers(hasLeague = true): Promise<void> {
  render(<Harness hasLeague={hasLeague} />)
  await waitFor(() => expect(stats.catalogue).toHaveBeenCalled())
  fireEvent.click(screen.getByRole('button', { name: 'Players' }))
  await screen.findByRole('tablist', { name: 'Player dashboard' })
}

const tab = (name: string): void => {
  fireEvent.click(screen.getByRole('tab', { name, selected: false }))
}

beforeEach(() => {
  vi.resetAllMocks()
  stats.status.mockResolvedValue(STATUS)
  stats.catalogue.mockResolvedValue(catalogue())
  stats.query.mockImplementation(async (q) => answer(q))
  stats.games.mockResolvedValue(GAMES)
  stats.outlook.mockResolvedValue(OUTLOOK)
  stats.player.mockImplementation(async ({ player }) =>
    bio(player, player === 'p1' ? { position: 'RB', status: null } : {})
  )
  stats.link.mockResolvedValue(null)
  stats.ownership.mockResolvedValue(OWNERSHIP)
  stats.views.mockResolvedValue([])
  stats.onChanged.mockReturnValue(() => {})
})
afterEach(cleanup)

describe('the player dashboard (stats-analysis spec §9.4)', () => {
  it('opens on my top scorer: header, his position’s tabs, the rail at his position', async () => {
    await openPlayers()
    expect(screen.getByRole('heading', { name: 'Player 1' })).toBeTruthy()
    expect(
      screen.getByText(/^#11 · Age \d+ · 6th season · 2021 Round 1, pick 10 \(SEA\)/)
    ).toBeTruthy()
    expect(await screen.findByText('6 G · Weeks 1–6')).toBeTruthy()
    expect(await screen.findByText('RB2 in My league')).toBeTruthy()
    expect(
      within(screen.getByRole('tablist', { name: 'Player dashboard' }))
        .getAllByRole('tab')
        .map((t) => t.textContent)
    ).toEqual([
      'Overview',
      'Usage',
      'Rushing',
      'Receiving',
      'Game log',
      'Splits',
      'Forecast',
      'Profile'
    ])
    const rail = screen.getByRole('complementary', { name: 'Players' })
    expect(within(rail).getByRole('radio', { name: 'RB', checked: true })).toBeTruthy()
    // The qualified three; the one shown is marked.
    await waitFor(() =>
      expect(within(rail).getAllByRole('button', { name: /Player \d/ })).toHaveLength(3)
    )
    expect(within(rail).getByRole('button', { current: true }).textContent).toContain('Player 1')
    // Compare comes with Plan AD.
    expect((screen.getByRole('button', { name: 'Compare' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('opens on the leading WR without a roster', async () => {
    stats.ownership.mockResolvedValue(null)
    await openPlayers(false)
    expect(screen.getByRole('heading', { name: 'Player 0' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'vs Coverage' })).toBeTruthy()
  })

  it('ranks every line among the position, never filtering the player', async () => {
    await openPlayers()
    await screen.findByText('Percentile rankings')
    tab('Rushing')
    await screen.findByText('Efficiency')
    const ranked = queries().filter((q) => q.scope.positions?.[0] === 'RB' && !q.groupBy)
    expect(ranked.length).toBeGreaterThan(2)
    expect(ranked.every((q) => q.scope.players === undefined)).toBe(true)
    // Player 1 is 2nd of the three qualified RBs.
    const line = document.querySelector('[data-metric="all:rush_ypc"]') as HTMLElement
    expect(within(line).getByText('2nd of 3')).toBeTruthy()
  })

  it('moves through the rail: a row, the arrow keys, another position’s leader, the rank-by', async () => {
    await openPlayers()
    const rail = screen.getByRole('complementary', { name: 'Players' })
    fireEvent.click(await within(rail).findByRole('button', { name: /Player 2/ }))
    expect(await screen.findByRole('heading', { name: 'Player 2' })).toBeTruthy()
    fireEvent.keyDown(rail, { key: 'ArrowUp' })
    expect(await screen.findByRole('heading', { name: 'Player 1' })).toBeTruthy()
    fireEvent.keyDown(rail, { key: 'j' })
    expect(await screen.findByRole('heading', { name: 'Player 2' })).toBeTruthy()
    fireEvent.click(within(rail).getByRole('radio', { name: 'QB' }))
    expect(await screen.findByRole('heading', { name: 'Player 0' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Under pressure' })).toBeTruthy()
    fireEvent.change(within(rail).getByRole('combobox', { name: 'Rank by' }), {
      target: { value: 'qb_epa_db' }
    })
    await waitFor(() =>
      expect(queries().at(-1)).toMatchObject({
        metrics: ['qb_epa_db'],
        scope: { positions: ['QB'] }
      })
    )
  })

  it('scrolls the rail to the player shown once his row is listed', async () => {
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    try {
      // The dashboard opens on him before the rail has loaded.
      await openPlayers()
      await waitFor(() => expect(scroll).toHaveBeenCalled())
      expect(scroll.mock.contexts.at(-1)).toHaveProperty(
        'textContent',
        expect.stringContaining('Player 1')
      )
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
    }
  })

  it('logs his games with the results, and splits them', async () => {
    await openPlayers()
    tab('Game log')
    const log = await screen.findByRole('table')
    expect(within(log).getByText('W 27–20')).toBeTruthy()
    expect(within(log).getByText('@ LA')).toBeTruthy()
    expect(within(log).getByText('L 10–30')).toBeTruthy()
    // Weeks 4–6: SEA has no game in this schedule.
    expect(within(log).getAllByText('Bye').length).toBe(3)
    tab('Splits')
    expect(await screen.findByText('By situation')).toBeTruthy()
    expect(screen.getByText('1st quarter')).toBeTruthy()
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.getByText('By opponent')).toBeTruthy()
    const home = queries().find((q) => q.scope.home === true)!
    expect(home.scope.positions).toEqual(['RB'])
  })

  it('forecasts: next game, range, role, running hot, weighted rates', async () => {
    await openPlayers()
    tab('Forecast')
    expect(await screen.findByText('@ ARI')).toBeTruthy()
    expect(screen.getByText('ARI’s defense')).toBeTruthy()
    expect(screen.getByText('24.2')).toBeTruthy()
    expect(screen.getByText('Rising')).toBeTruthy()
    expect(screen.getByText('Running hot: expect it to fall by about 14.0.')).toBeTruthy()
    expect(stats.outlook).toHaveBeenCalledWith({ player: 'p1', season: 2026, scoring: 'league' })
    await waitFor(() => expect(queries().some((q) => q.transform === 'shrunk')).toBe(true))
  })

  it('profiles him: bio, combine, career by season', async () => {
    await openPlayers()
    tab('Profile')
    expect(await screen.findByText('Ohio State')).toBeTruthy()
    expect(await screen.findByText('Career by season')).toBeTruthy()
    expect(await screen.findByText('2026 SEA')).toBeTruthy()
    const career = queries().find((q) => q.groupBy?.includes('season'))!
    expect(career.scope).toEqual({ seasons: [2025, 2026], seasonType: 'REG', players: ['p1'] })
  })

  it('tags an injury, opens his team, and lists his position’s leaderboard', async () => {
    stats.player.mockImplementation(async ({ player }) =>
      bio(player, {
        position: 'RB',
        status: {
          season: 2026,
          week: 7,
          reserve: null,
          report: 'Questionable',
          practice: 'Limited',
          injury: 'Ankle'
        }
      })
    )
    await openPlayers()
    expect(screen.getByTitle('Questionable · Ankle (week 7 report)').textContent).toBe('Q')
    fireEvent.click(screen.getByRole('button', { name: 'Player leaderboards →' }))
    expect(
      await screen.findByRole('heading', { name: '2026 running back leaderboard' })
    ).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'RB', selected: true })).toBeTruthy()
    // A player row opens his dashboard.
    fireEvent.click(await screen.findByText('Player 2'))
    expect(await screen.findByRole('heading', { name: 'Player 2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'SEA' }))
    expect(await screen.findByText('Seattle Seahawks', { exact: false })).toBeTruthy()
  })

  it('opens a player from a home board’s row and from the team dashboard', async () => {
    render(<Harness hasLeague />)
    const qb = await screen.findAllByText('Player 0')
    fireEvent.click(qb[0])
    expect(await screen.findByRole('heading', { name: 'Player 0' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Passing' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Teams' }))
    fireEvent.click((await screen.findAllByTitle('Open Player 2’s dashboard'))[0])
    expect(await screen.findByRole('heading', { name: 'Player 2' })).toBeTruthy()
  })
})
```

```diff
diff --git a/tests/renderer/components/StatsApp.test.tsx b/tests/renderer/components/StatsApp.test.tsx
index b0dee88..9962e8a 100644
--- a/tests/renderer/components/StatsApp.test.tsx
+++ b/tests/renderer/components/StatsApp.test.tsx
@@ -7,7 +7,7 @@ import type { StatsScope } from '@/lib/stats/scope'
 import { api } from '@/lib/api'
 import type { StatsOwnership, StatsQuery, StatsView } from '@shared/stats/types'
 import type { UpdateState } from '@shared/types'
-import { catalogue, result, row, STATUS, value } from '../../fixtures/statsScreens'
+import { bio, catalogue, result, row, STATUS, value } from '../../fixtures/statsScreens'

 vi.mock('@/lib/api', () => ({
   api: {
@@ -15,6 +15,7 @@ vi.mock('@/lib/api', () => ({
       status: vi.fn(),
       catalogue: vi.fn(),
       query: vi.fn(),
+      player: vi.fn(),
       ownership: vi.fn(),
       views: vi.fn(),
       saveView: vi.fn(),
@@ -83,11 +84,18 @@ function renderApp(hasLeague = true): void {

 const lastQuery = (): StatsQuery => stats.query.mock.calls.at(-1)![0]

+/** The player leaderboards are under the player dashboard (spec §9.4), at his position. */
+async function openPlayerBoards(): Promise<void> {
+  fireEvent.click(screen.getByRole('button', { name: 'Players' }))
+  fireEvent.click(await screen.findByRole('button', { name: 'Player leaderboards →' }))
+}
+
 beforeEach(() => {
   vi.resetAllMocks()
   stats.status.mockResolvedValue(STATUS)
   stats.catalogue.mockResolvedValue(catalogue())
   stats.query.mockImplementation(async (q) => answer(q))
+  stats.player.mockImplementation(async ({ player }) => bio(player))
   stats.ownership.mockResolvedValue(OWNERSHIP)
   stats.views.mockResolvedValue([])
   stats.onChanged.mockReturnValue(() => {})
@@ -121,7 +129,7 @@ describe('Companion Stats', () => {

   it('sorts by a column, hides rows below the sample until asked, and filters my team', async () => {
     renderApp()
-    fireEvent.click(screen.getByRole('button', { name: 'Players' }))
+    await openPlayerBoards()
     fireEvent.click(await screen.findByRole('tab', { name: 'WR' }))
     await screen.findByText('Player 2')
     expect(screen.queryByText('Player 3')).toBeNull()
@@ -160,7 +168,8 @@ describe('Companion Stats', () => {
     stats.saveView.mockResolvedValue(saved)
     stats.exportCsv.mockResolvedValue('/home/me/Downloads/stats.csv')
     renderApp()
-    fireEvent.click(screen.getByRole('button', { name: 'Players' }))
+    await openPlayerBoards()
+    fireEvent.click(await screen.findByRole('tab', { name: 'All offense' }))
     await screen.findByText('Player 2')

     fireEvent.click(screen.getByRole('button', { name: 'CSV' }))
@@ -197,8 +206,8 @@ describe('Companion Stats', () => {
     const scoring = screen.getByRole('combobox', { name: 'Fantasy scoring' })
     expect(within(scoring).queryByText('My league')).toBeNull()
     expect(screen.queryByRole('button', { name: 'My players' })).toBeNull()
-    fireEvent.click(screen.getByRole('button', { name: 'Players' }))
-    await screen.findByText('Player 2')
+    await openPlayerBoards()
+    await screen.findByRole('table')
     expect(screen.queryByRole('combobox', { name: 'Fantasy rosters' })).toBeNull()
   })

```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/renderer/components/StatsPlayer.test.tsx tests/renderer/components/StatsApp.test.tsx tests/renderer/components/StatsTeam.test.tsx
```

Expected: FAIL. 13 failed | 15 passed. The dashboard does not exist (`Unable to find role="tablist" and name "Player dashboard"`, ten tests), and Plan AA's app tests find no `Player leaderboards →` (three). The team dashboard's tests still pass.

- [ ] **Step 3: The rail**

Create `src/renderer/src/components/stats/PlayerRail.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { OwnerMark, PosText, StatsSelect } from '@/components/stats/controls'
import type { Heat } from '@/lib/stats/format'
import { RAIL_POSITIONS, railMetrics, type RailRow } from '@/lib/stats/player'
import { cn } from '@/lib/utils'
import type { MetricInfo, PositionGroup } from '@shared/stats/types'

/** Rows the rail shows at first, and each "Show more" adds. */
const PAGE = 25

const CHIP: Record<Heat, string> = {
  h3: 'bg-good-s text-good font-semibold',
  h2: 'bg-good-s text-good font-semibold',
  h1: 'bg-panel-2 text-fg',
  n: 'bg-panel-2 text-fg',
  l1: 'bg-panel-2 text-fg',
  l2: 'bg-bad-s text-bad font-semibold',
  l3: 'bg-bad-s text-bad font-semibold'
}

/**
 * The handoff's profile list (332px rail): a position, a search, a rank-by metric, the qualified
 * players best first with the value in a shaded chip. ↑ / ↓ (or J / K) move the selection.
 */
export function PlayerRail({
  position,
  onPosition,
  metric,
  onMetric,
  rows,
  loading,
  error,
  range,
  byId,
  selected,
  onSelect
}: {
  position: PositionGroup
  onPosition: (position: PositionGroup) => void
  metric: string
  onMetric: (metric: string) => void
  /** Before the search: the rail filters them itself. */
  rows: (search: string) => RailRow[]
  loading: boolean
  error: string | null
  range: string
  byId: ReadonlyMap<string, MetricInfo>
  selected: string | null
  onSelect: (id: string) => void
}): React.JSX.Element {
  const [search, setSearch] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const shownRows = rows(search)
  // The selected player is listed, however far down he ranks.
  const shown = Math.max(limit, shownRows.findIndex((r) => r.id === selected) + 1)
  // Scrolled to once his row is listed (the rail may load after him).
  const listed = shownRows.some((r) => r.id === selected)
  const selectedRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (listed) selectedRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selected, listed])

  const move = (d: number): void => {
    if (!shownRows.length) return
    const i = shownRows.findIndex((r) => r.id === selected)
    const next = shownRows[Math.max(0, Math.min(shownRows.length - 1, i + d))]
    if (next) onSelect(next.id)
  }
  const onKey = (e: React.KeyboardEvent): void => {
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'SELECT') return
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault()
      move(1)
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault()
      move(-1)
    }
  }
  const info = byId.get(metric)
  return (
    <aside
      aria-label="Players"
      tabIndex={0}
      onKeyDown={onKey}
      className="flex min-h-0 w-[332px] shrink-0 flex-col border-r border-line outline-none"
    >
      <div className="flex shrink-0 flex-col gap-2.5 border-b border-line px-3.5 pt-3.5 pb-3">
        <div
          role="radiogroup"
          aria-label="Position"
          className="flex gap-0.5 rounded-[7px] bg-panel-2 p-0.5"
        >
          {RAIL_POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={p === position}
              onClick={() => {
                setSearch('')
                setLimit(PAGE)
                onPosition(p)
              }}
              className={cn(
                'h-6 flex-1 cursor-pointer rounded-[5px] font-mono text-[11.5px] leading-none',
                p === position
                  ? 'bg-panel font-semibold text-fg shadow-[0_0_0_1px_var(--line)]'
                  : 'font-medium text-fg-2 hover:text-fg'
              )}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[6px] border border-line bg-panel px-2 text-fg-3">
            <Search className="size-[13px] shrink-0" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Player"
              aria-label="Search players"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none"
            />
          </label>
          <StatsSelect
            title="Rank by"
            value={metric}
            options={railMetrics(position, byId)}
            onChange={onMetric}
            className="w-[150px]"
          />
        </div>
      </div>
      <div className="flex shrink-0 justify-between border-b border-line-2 px-3.5 py-2 font-mono text-[11px] leading-none text-fg-3">
        <span>
          {shownRows.length} PLAYERS · {range.toUpperCase()}
        </span>
        <span>{info?.short ?? ''}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto [scrollbar-width:thin]">
        {error && <div className="px-3.5 py-6 text-[12.5px] text-bad">{error}</div>}
        {loading && !shownRows.length && (
          <div className="py-10 text-center text-[13px] text-fg-3">Loading…</div>
        )}
        {shownRows.slice(0, shown).map((r) => {
          const on = r.id === selected
          return (
            <button
              key={r.id}
              ref={on ? selectedRef : undefined}
              type="button"
              aria-current={on ? 'true' : undefined}
              onClick={() => onSelect(r.id)}
              className={cn(
                'grid h-10 w-full cursor-pointer grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2 border-b border-line-2 pr-3.5 pl-3 text-left',
                on ? 'bg-sel' : 'hover:bg-hover'
              )}
            >
              <span className="text-right font-mono text-[11.5px] text-fg-3">{r.rank ?? 'NQ'}</span>
              <span className="flex min-w-0 flex-col gap-[3px]">
                <span className="truncate text-[13px] leading-[1.1] font-medium">{r.name}</span>
                <span className="flex items-center gap-[5px] font-mono text-[11px] leading-none text-fg-3">
                  <PosText position={r.position} />
                  {r.team}
                  <OwnerMark owner={r.owner} />
                </span>
              </span>
              <span
                title={r.title || undefined}
                className={cn(
                  'min-w-11 rounded-[5px] px-[7px] py-1 text-right font-mono text-[12px] leading-none',
                  CHIP[r.heat]
                )}
              >
                {r.value}
              </span>
            </button>
          )
        })}
        {shownRows.length > shown && (
          <div className="px-3.5 py-3">
            <button
              type="button"
              onClick={() => setLimit(shown + PAGE)}
              className="h-7 w-full cursor-pointer rounded-[6px] border border-line bg-panel text-[12px] font-medium hover:bg-hover"
            >
              Show {Math.min(PAGE, shownRows.length - shown)} more
            </button>
          </div>
        )}
        {!loading && !error && shownRows.length === 0 && (
          <div className="px-3.5 py-10 text-center text-[12.5px] text-fg-3">
            {search ? 'No player by that name.' : 'No qualified player in this range.'}
          </div>
        )}
      </div>
    </aside>
  )
}
```

- [ ] **Step 4: The screen**

Create `src/renderer/src/screens/stats/StatsPlayer.tsx`:

```tsx
import { useMemo, useState } from 'react'
import { StatsSelect } from '@/components/stats/controls'
import { ReliabilityMarker } from '@/components/stats/MetricCard'
import { Headshot, HeatCell, Loading, MiniTable, SectionHead } from '@/components/stats/parts'
import { PlayerRail } from '@/components/stats/PlayerRail'
import { ScopeBar } from '@/components/stats/ScopeBar'
import { PercentileBar, StatSection, StatSections } from '@/components/stats/StatLines'
import { WeekChart } from '@/components/stats/WeekChart'
import { api } from '@/lib/api'
import { fmtStat } from '@/lib/stats/format'
import { qualifies } from '@/lib/stats/leaderboard'
import {
  bornOf,
  careerQuery,
  careerRows,
  combineView,
  fantasyRank,
  fantasyRankQuery,
  gameLog,
  gameLogQuery,
  kindOf,
  lineHead,
  lineRow,
  LINE_METRICS,
  LOG_COLUMNS,
  nextMatchup,
  opponentDefenseQuery,
  opponentQuery,
  opponentRows,
  outlookView,
  overviewSections,
  playerHeader,
  playerQuery,
  playerSectionQueries,
  playerSectionViews,
  playerTabs,
  pointsSeries,
  positionGroup,
  positionTab,
  profileQuery,
  railQuery,
  railRows,
  sectionsFor,
  shrunkQuery,
  shrunkRows,
  sizeOf,
  splitHead,
  splitTable,
  splitTableQueries,
  tabFor,
  teammateOptions,
  teammateQueries,
  teammatesQuery,
  tileViews,
  TILES,
  type PlayerKind,
  type PlayerTab
} from '@/lib/stats/player'
import { rangeLabel, type StatsScope } from '@/lib/stats/scope'
import { chartWeeks, weekSeries } from '@/lib/stats/team'
import {
  usePlayerBio,
  usePlayerOutlook,
  useSeasonGames,
  useStatsQueries,
  useStatsQuery,
  type StatsData
} from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import type { PlayerBio, PositionGroup, StatsRow } from '@shared/stats/types'

/** The dashboard is about one player: never another player's (or tab's) answers while his own load. */
const FRESH = { keepLast: false }

const POS_BG: Record<string, string> = {
  QB: 'bg-pos-qb',
  RB: 'bg-pos-rb',
  WR: 'bg-pos-wr',
  TE: 'bg-pos-te',
  K: 'bg-pos-k'
}

interface TabProps {
  data: StatsData
  scope: StatsScope
  player: string
  position: PositionGroup
  bio: PlayerBio | null
}

/** The player shown: his gsis id and the position group his dashboard follows. */
export interface PlayerRef {
  id: string
  position: PositionGroup | null
}

/**
 * Spec §9.4 player dashboard: the handoff's player profile ("6. Player profile": the ranked rail,
 * the header, tiles, percentile rankings) as its frame, and the spec's tabs by position group.
 */
export function StatsPlayer({
  data,
  scope,
  onScope,
  hasLeague,
  player,
  onPlayer,
  tab,
  onTab,
  onOpenTeam,
  onOpenLeaderboard
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  player: PlayerRef
  onPlayer: (player: PlayerRef) => void
  tab: PlayerTab
  onTab: (tab: PlayerTab) => void
  onOpenTeam: (team: string) => void
  /** The player leaderboard at his position (spec §9.2). */
  onOpenLeaderboard: (position: PositionGroup) => void
}): React.JSX.Element {
  const { bio, error: bioError } = usePlayerBio(player.id, data.version)
  const position: PositionGroup | null =
    player.position ?? positionGroup(bio?.id === player.id ? bio.position : null)
  // The rail follows the player shown; a position picked in it shows until its leader opens.
  const [picking, setPicking] = useState<PositionGroup | null>(null)
  if (picking !== null && picking === position) setPicking(null)
  const railPosition: PositionGroup = picking ?? position ?? 'WR'
  const [rankBy, setRankBy] = useState<Partial<Record<PositionGroup, string>>>({})
  const metric = rankBy[railPosition] ?? positionTab(railPosition).sort
  const rq = useMemo(
    () => railQuery(railPosition, metric, scope, data.status, data.byId),
    [railPosition, metric, scope, data.status, data.byId]
  )
  const rail = useStatsQuery(rq, data.version)
  const railFor = (search: string): ReturnType<typeof railRows> =>
    rail.result
      ? railRows(rail.result, railPosition, metric, data.byId, data.ownership, search, player.id)
      : []
  // A position picked in the rail opens its first player (the rail's own query, asked here).
  const pick = (p: PositionGroup): void => {
    if (p === position) {
      setPicking(null)
      return
    }
    setPicking(p)
    const m = rankBy[p] ?? positionTab(p).sort
    void api.stats
      .query(railQuery(p, m, scope, data.status, data.byId))
      .then((r) => {
        const top = railRows(r, p, m, data.byId, null, '', null)[0]
        if (top) onPlayer({ id: top.id, position: p })
      })
      .catch(() => {})
  }

  // His row in scope (the rail's query): undefined until it is known.
  const row =
    rail.result && position === railPosition && !rail.loading
      ? (rail.result.rows.find((r) => r.id === player.id) ?? null)
      : undefined
  const fq = useMemo(
    () => (position ? fantasyRankQuery(position, scope, data.status) : null),
    [position, scope, data.status]
  )
  const { result: fr } = useStatsQuery(fq, data.version, FRESH)
  const shown: PlayerTab = position ? tabFor(tab, position) : 'overview'

  return (
    <div className="flex min-h-0 flex-1">
      <PlayerRail
        position={railPosition}
        onPosition={pick}
        metric={metric}
        onMetric={(m) => setRankBy((r) => ({ ...r, [railPosition]: m }))}
        rows={railFor}
        loading={rail.loading}
        error={rail.error}
        range={rangeLabel(scope, data.status)}
        byId={data.byId}
        selected={player.id}
        onSelect={(id) => onPlayer({ id, position: railPosition })}
      />
      <div className="min-w-0 flex-1 overflow-auto [scrollbar-width:thin]">
        {bioError ? (
          <Loading error={bioError} />
        ) : !bio || bio.id !== player.id || !position ? (
          <Loading />
        ) : (
          <div className="flex flex-col gap-5 px-8 pt-[22px] pb-8">
            <Header
              data={data}
              scope={scope}
              onScope={onScope}
              hasLeague={hasLeague}
              bio={bio}
              position={position}
              row={row}
              qualified={row ? qualifies(row, positionTab(position)) : true}
              rank={position ? fantasyRank(fr, player.id, position, scope) : null}
              onOpenTeam={onOpenTeam}
            />
            <div className="flex items-end justify-between gap-4 border-b border-line">
              <div role="tablist" aria-label="Player dashboard" className="flex gap-[22px]">
                {playerTabs(position).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={t.id === shown}
                    onClick={() => onTab(t.id)}
                    className={cn(
                      'h-8 cursor-pointer text-[13.5px] leading-none whitespace-nowrap',
                      t.id === shown
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
                onClick={() => onOpenLeaderboard(position)}
                className="mb-2 cursor-pointer text-[12.5px] font-medium whitespace-nowrap text-fg-2 hover:text-cobalt"
              >
                Player leaderboards →
              </button>
            </div>
            {row === null && (
              <div className="rounded-[8px] bg-panel-2 px-4 py-3 text-[13px] text-fg-2">
                {bio.name} played no games in {rangeLabel(scope, data.status)}.
              </div>
            )}
            <TabBody
              key={`${player.id}:${shown}`}
              tab={shown}
              data={data}
              scope={scope}
              player={player.id}
              position={position}
              bio={bio}
            />
          </div>
        )}
      </div>
    </div>
  )
}

function TabBody(props: TabProps & { tab: PlayerTab }): React.JSX.Element {
  const { tab, ...rest } = props
  switch (tab) {
    case 'overview':
      return <Overview {...rest} />
    case 'log':
      return <GameLog {...rest} />
    case 'splits':
      return <Splits {...rest} />
    case 'forecast':
      return <Forecast {...rest} />
    case 'profile':
      return <Profile {...rest} />
    default:
      return <LinesTab {...rest} tab={tab} />
  }
}

function Header({
  data,
  scope,
  onScope,
  hasLeague,
  bio,
  position,
  row,
  qualified,
  rank,
  onOpenTeam
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  bio: PlayerBio
  position: PositionGroup
  row: StatsRow | null | undefined
  qualified: boolean
  rank: string | null
  onOpenTeam: (team: string) => void
}): React.JSX.Element {
  const h = playerHeader(bio, row, scope, data.status)
  const team = row?.team ?? bio.team
  return (
    <header className="flex items-end justify-between gap-6">
      <div className="flex min-w-0 items-end gap-4">
        <Headshot name={bio.name} sleeperId={bio.sleeperId} size={72} />
        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] leading-none font-medium text-fg-2">
            <span
              className={cn(
                'rounded-[4px] px-[7px] py-1 font-mono text-[11.5px] font-semibold text-on-pos',
                POS_BG[position] ?? 'bg-pos-def'
              )}
            >
              {position}
            </span>
            {team && (
              <button
                type="button"
                title="Open the team’s dashboard"
                onClick={() => onOpenTeam(team)}
                className="cursor-pointer underline decoration-line underline-offset-[3px] hover:text-cobalt"
              >
                {team}
              </button>
            )}
            <span className="text-fg-3">·</span>
            <span>{h.games}</span>
            {row && !qualified && (
              <span
                title={`Below the ${position} leaderboard’s qualifying sample`}
                className="rounded-[4px] px-1.5 py-[3px] font-mono text-[11px] text-fg-3 shadow-[inset_0_0_0_1px_var(--line)]"
              >
                Not qualified
              </span>
            )}
            {h.status && (
              <span
                title={h.status.title}
                className={cn(
                  'rounded-[4px] px-1.5 py-[3px] font-mono text-[11px] font-semibold',
                  h.status.tone === 'bad' ? 'bg-bad-s text-bad' : 'bg-warn-s text-warn'
                )}
              >
                {h.status.tag}
              </span>
            )}
            {rank && (
              <span className="rounded-[4px] bg-panel-2 px-1.5 py-[3px] font-mono text-[11px] text-fg-2">
                {rank}
              </span>
            )}
          </div>
          <h1 className="m-0 flex flex-col gap-0.5">
            <span className="text-[20px] leading-none font-normal tracking-[-0.01em] text-fg-2">
              {h.first}
            </span>{' '}
            <span className="text-[40px] leading-none font-bold tracking-[-0.035em]">{h.last}</span>
          </h1>
          <span className="text-[12px] leading-[1.35] text-fg-3">{h.facts.join(' · ')}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-3">
        <ScopeBar scope={scope} status={data.status} hasLeague={hasLeague} onChange={onScope} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled
            title="Compare comes in a later update"
            className="flex h-8 cursor-default items-center rounded-[8px] bg-cobalt px-3.5 text-[12.5px] font-medium text-on-cobalt opacity-40"
          >
            Compare
          </button>
        </div>
      </div>
    </header>
  )
}

/** The handoff's tiles, the percentile rankings, fantasy points by week, the season and the career. */
function Overview({ data, scope, player, position, bio }: TabProps): React.JSX.Element {
  const kind = kindOf(position)
  const sections = useMemo(() => overviewSections(position, data.byId), [position, data.byId])
  const queries = useMemo(
    () => playerSectionQueries(sections, position, scope, data.status, TILES[position]),
    [sections, position, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version, FRESH)
  const points = pointsSeries(kind)
  const wq = useMemo(
    () => (points.length ? playerQuery(player, points, scope, data.status, ['week']) : null),
    [player, points, scope, data.status]
  )
  const { result: weekly } = useStatsQuery(wq, data.version, FRESH)
  const lq = useMemo(() => {
    const m = new Map([['season', playerQuery(player, LINE_METRICS[kind], scope, data.status)]])
    const career = bio ? careerQuery(bio, kind, scope, false) : null
    if (career) m.set('career', career)
    return m
  }, [player, kind, scope, data.status, bio])
  const { results: lines } = useStatsQueries(lq, data.version, FRESH)
  if (!results) return <Loading error={error} />
  const all = results.get('all')
  const tiles = tileViews(all, player, position, data.byId, scope.season)
  const views = playerSectionViews(sections, results, player, position, data.byId, scope.season)
  const pool = all
    ? all.rows.filter((r) => r.position === position && qualifies(r, positionTab(position))).length
    : 0
  const weeks = chartWeeks(weekly, scope, data.status)
  const series = weekSeries(weekly, points, weeks, data.byId).map((s) => ({
    ...s,
    label: s.id === 'expected_points' ? 'Expected' : 'Fantasy points'
  }))
  return (
    <div className="flex flex-col gap-7">
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-[10px] bg-line shadow-[0_0_0_1px_var(--line)]">
        {tiles.map((t) => (
          <div
            key={t.metric}
            className="flex flex-col gap-2 bg-panel px-4 py-3.5"
            title={t.title || undefined}
          >
            <span className="text-[12px] leading-[1.2] font-medium text-fg-3">{t.label}</span>
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-cond text-[40px] leading-[0.85] font-extrabold tabular-nums">
                {t.value}
              </span>
              {t.chip && (
                <span
                  className={cn(
                    'rounded-[4px] px-1.5 py-[3px] font-mono text-[11px] leading-none',
                    t.heat === 'good' && 'bg-good-s font-semibold text-good',
                    t.heat === 'bad' && 'bg-bad-s font-semibold text-bad',
                    t.heat === 'mid' && 'font-medium text-fg-3'
                  )}
                >
                  {t.chip}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] items-start gap-8">
        {views[0] ? (
          <StatSection section={{ ...views[0], note: `vs ${pool} qualified ${position}s` }} />
        ) : (
          <span />
        )}
        <div className="flex flex-col gap-7">
          {points.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <SectionHead
                title="Fantasy points by week"
                note={points.length > 1 ? 'Against expected points, same scoring' : undefined}
              />
              <WeekChart
                series={series}
                format={(x) => fmtStat(x, { unit: 'points', decimals: 1 })}
                label={`${bio?.name ?? 'Player'} fantasy points by week`}
              />
            </section>
          )}
          <section className="flex flex-col gap-2.5">
            <SectionHead title="Season and career" note="Career: regular seasons since 2019" />
            <LineTable
              kind={kind}
              data={data}
              rows={[
                lineRow(
                  'season',
                  String(scope.season),
                  lines?.get('season')?.rows[0],
                  kind,
                  data.byId
                ),
                lineRow('career', 'Career', lines?.get('career')?.rows[0], kind, data.byId)
              ]}
            />
          </section>
        </div>
      </div>
    </div>
  )
}

function LineTable({
  kind,
  data,
  rows,
  first = 'Season'
}: {
  kind: PlayerKind
  data: StatsData
  rows: ReturnType<typeof lineRow>[]
  first?: string
}): React.JSX.Element {
  const head = lineHead(kind, data.byId)
  return (
    <MiniTable
      columns={`minmax(0,1fr) 32px ${head.map(() => 'minmax(40px,auto)').join(' ')}`}
      head={[first, 'G', ...head]}
      rows={rows.map((r) => ({
        key: r.key,
        cells: [
          <span key="l" className="font-sans text-[13px] font-medium">
            {r.label}
          </span>,
          <span key="g" className="text-fg-2">
            {r.games}
          </span>,
          ...r.cells
        ]
      }))}
    />
  )
}

/** A stat tab: its sections, ranked among the position's qualified players. */
function LinesTab({
  data,
  scope,
  player,
  position,
  tab
}: TabProps & { tab: PlayerTab }): React.JSX.Element {
  const sections = useMemo(() => sectionsFor(tab, position, data.byId), [tab, position, data.byId])
  const queries = useMemo(
    () => playerSectionQueries(sections, position, scope, data.status),
    [sections, position, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version, FRESH)
  if (!results) return <Loading error={error} />
  return (
    <StatSections
      sections={playerSectionViews(sections, results, player, position, data.byId, scope.season)}
    />
  )
}

/** Handoff "Game log": a row per week, the result from his team's side, fantasy and expected points. */
function GameLog({ data, scope, player, position }: TabProps): React.JSX.Element {
  const kind = kindOf(position)
  const q = useMemo(
    () => gameLogQuery(player, kind, scope, data.status),
    [player, kind, scope, data.status]
  )
  const { result, error } = useStatsQuery(q, data.version, FRESH)
  const { games } = useSeasonGames(scope.season, data.version)
  if (!result) return <Loading error={error} />
  const rows = gameLog(result, games, kind, data.byId, scope, data.status)
  const cols = LOG_COLUMNS[kind]
  const fp = rows.some((r) => r.points !== null)
  const xfp = rows.some((r) => r.expected !== null)
  const head = [
    'Wk',
    'Opp',
    'Result',
    ...cols.map((c) => c.label),
    ...(fp ? ['FP'] : []),
    ...(xfp ? ['xFP'] : [])
  ]
  return (
    <section className="flex flex-col gap-2.5">
      <SectionHead
        title="Game log"
        note={`${rangeLabel(scope, data.status)}${xfp ? ' · xFP: expected fantasy points' : ''}`}
      />
      <MiniTable
        columns={`36px 64px 84px ${cols.map(() => 'minmax(44px,1fr)').join(' ')}${fp ? ' 52px' : ''}${xfp ? ' 52px' : ''}`}
        head={head}
        left={[1, 2]}
        rows={rows.map((r) => ({
          key: r.key,
          cells: [
            <span key="w" className="text-fg-3">
              {r.week}
            </span>,
            <span key="o" className="font-semibold whitespace-nowrap">
              {r.opponent || '—'}
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
              <span key="s" className="text-[11.5px] whitespace-nowrap text-fg-3">
                {r.note ?? '—'}
              </span>
            ),
            ...r.cells.map((c, i) => (
              <span key={`c${i}`} className={cn(r.note && 'text-fg-3')}>
                {c}
              </span>
            )),
            ...(fp
              ? [
                  <span key="fp" className="font-cond text-[16px] font-bold">
                    {r.points ?? ''}
                  </span>
                ]
              : []),
            ...(xfp
              ? [
                  <span key="xfp" className="text-fg-2">
                    {r.expected ?? ''}
                  </span>
                ]
              : [])
          ]
        }))}
      />
    </section>
  )
}

/** Spec §9.4 Splits: games, quarters, score, downs and the position's play splits; opponents; a teammate. */
function Splits({ data, scope, player, position, bio }: TabProps): React.JSX.Element {
  const queries = useMemo(
    () => splitTableQueries(position, scope, data.status),
    [position, scope, data.status]
  )
  const { results, error } = useStatsQueries(queries, data.version, FRESH)
  const oq = useMemo(
    () => opponentQuery(player, position, scope, data.status),
    [player, position, scope, data.status]
  )
  const { result: opp } = useStatsQuery(oq, data.version, FRESH)
  if (!results) return <Loading error={error} />
  const head = splitHead(position, data.byId)
  const columns = `minmax(130px,1fr) 72px ${head
    .slice(1)
    .map(() => 'minmax(84px,1fr)')
    .join(' ')}`
  const groups = splitTable(results, player, position, data.byId, scope.season)
  const oppRows = opponentRows(opp, position, data.byId)
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2.5">
        <SectionHead
          title="By situation"
          note={`Rank among qualified ${position}s in the same split`}
        />
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="m-0 text-[12.5px] leading-none font-semibold text-fg-2">
                  {g.title}
                </h3>
                {g.note && <span className="text-[11.5px] leading-none text-fg-3">{g.note}</span>}
              </div>
              <MiniTable
                columns={columns}
                head={['Split', ...head]}
                rows={g.rows.map((r) => ({
                  key: r.key,
                  cells: [
                    <span key="l" className="font-sans text-[13px] font-medium">
                      {r.label}
                    </span>,
                    <span key="p" className="text-fg-2">
                      {r.plays}
                    </span>,
                    ...r.cells.map((c, i) => <HeatCell key={i} {...c} />)
                  ]
                }))}
              />
            </div>
          ))}
        </div>
      </section>
      {oppRows.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <SectionHead title="By opponent" />
          <MiniTable
            columns={`minmax(130px,1fr) 72px ${head
              .slice(1)
              .map(() => 'minmax(84px,1fr)')
              .join(' ')}`}
            head={['Opponent', 'G', ...head.slice(1)]}
            rows={oppRows.map((r) => ({
              key: r.key,
              cells: [
                <span key="l" className="font-semibold">
                  {r.label}
                </span>,
                <span key="g" className="text-fg-2">
                  {r.games}
                </span>,
                ...r.cells
              ]
            }))}
          />
        </section>
      )}
      {bio?.team && (
        <Teammate
          data={data}
          scope={scope}
          player={player}
          position={position}
          team={bio.team}
          head={head}
        />
      )}
    </div>
  )
}

/** With and without a teammate on the field (participation, through the prior season). */
function Teammate({
  data,
  scope,
  player,
  position,
  team,
  head
}: Omit<TabProps, 'bio'> & { team: string; head: string[] }): React.JSX.Element | null {
  const mq = useMemo(
    () => teammatesQuery(team, position, scope, data.status),
    [team, position, scope, data.status]
  )
  const { result: mates } = useStatsQuery(mq, data.version, FRESH)
  const options = teammateOptions(mates, player)
  const [picked, setPicked] = useState<string | null>(null)
  const mate = options.some((o) => o.value === picked) ? picked : (options[0]?.value ?? null)
  // The query hook keys on the queries' text: a new map each render runs nothing again.
  const tq = mate ? teammateQueries(player, mate, position, scope, data.status) : null
  const { results, error } = useStatsQueries(tq, data.version, FRESH)
  if (!options.length) return null
  const label = options.find((o) => o.value === mate)?.label ?? ''
  const metrics = (results?.get('with')?.columns ?? []).map((c) => c.id)
  const rowOf = (key: 'with' | 'without'): string[] => {
    const r = results?.get(key)?.rows[0]
    return metrics.map((id) => {
      const m = data.byId.get(id)
      return fmtStat(r?.values[id]?.value ?? null, {
        unit: m?.unit ?? 'number',
        decimals: m?.decimals ?? 1,
        kind: m?.kind
      })
    })
  }
  const empty = results && !results.get('with')?.rows.length && !results.get('without')?.rows.length
  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-4">
        <SectionHead
          title="With and without a teammate"
          note="On the field together or not · participation data, published after each season"
        />
        <StatsSelect
          title="Teammate"
          value={mate ?? ''}
          options={options}
          onChange={setPicked}
          className="w-[220px]"
        />
      </div>
      {error ? (
        <Loading error={error} />
      ) : empty ? (
        <p className="m-0 text-[12.5px] text-fg-3">
          Not published for {scope.season} yet: participation comes out after the season.
        </p>
      ) : (
        <MiniTable
          columns={`minmax(130px,1fr) ${head
            .slice(1)
            .map(() => 'minmax(84px,1fr)')
            .join(' ')}`}
          head={['On the field', ...head.slice(1)]}
          rows={(['with', 'without'] as const).map((k) => ({
            key: k,
            cells: [
              <span key="l" className="font-sans text-[13px] font-medium">
                {k === 'with' ? 'With' : 'Without'} {label.replace(/ \(.*\)$/, '')}
              </span>,
              ...rowOf(k)
            ]
          }))}
        />
      )}
    </section>
  )
}

/** Spec §9.4 Forecast: the next matchup, the range of outcomes, trend, regression, schedule, profile. */
function Forecast({ data, scope, player, position, bio }: TabProps): React.JSX.Element {
  const oq = useMemo(
    () => ({ player, season: scope.season, scoring: scope.scoring }),
    [player, scope.season, scope.scoring]
  )
  const { outlook, error } = usePlayerOutlook(oq, data.version)
  const { games } = useSeasonGames(scope.season, data.version)
  const dq = useMemo(
    () => opponentDefenseQuery(position, scope, data.status),
    [position, scope, data.status]
  )
  const { result: defense } = useStatsQuery(dq, data.version, FRESH)
  const sq = useMemo(
    () => shrunkQuery(position, scope, data.status, data.byId),
    [position, scope, data.status, data.byId]
  )
  const { result: shrunk } = useStatsQuery(sq, data.version, FRESH)
  if (!outlook) return <Loading error={error} />
  const v = outlookView(outlook, data.byId)
  const next = nextMatchup(
    games,
    bio?.team ?? outlook.team,
    defense,
    position,
    data.byId,
    scope.season
  )
  const rates = shrunkRows(shrunk, player, data.byId)
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-9">
      <div className="flex flex-col gap-7">
        <section className="flex flex-col gap-2.5">
          <SectionHead title="Next game" note="Short term" />
          {next ? (
            <div className="flex flex-col gap-3 rounded-[10px] bg-panel p-4 shadow-[0_0_0_1px_var(--line)]">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] leading-none font-semibold">
                  {next.where === 'Away' ? '@' : 'vs'} {next.opponent}
                </span>
                <span className="text-[12px] leading-none text-fg-3">
                  {next.when} · {next.where}
                </span>
              </div>
              <StatSection
                section={{
                  title: `${next.opponent}’s defense`,
                  note: 'Among the 32: 1st allows the least',
                  lines: next.lines
                }}
              />
            </div>
          ) : (
            <p className="m-0 text-[12.5px] text-fg-3">
              No game left in the {scope.season} season.
            </p>
          )}
        </section>
        <section className="flex flex-col gap-2.5">
          <SectionHead
            title="Range of outcomes"
            note={`${scope.season} weeks, and his last 16 games`}
          />
          <MiniTable
            columns="minmax(0,1fr) 80px 80px"
            head={['Weekly fantasy points', String(scope.season), 'Last 16']}
            rows={v.range.map((r) => ({
              key: r.label,
              cells: [
                <span key="l" className="font-sans text-[13px]">
                  {r.label}
                </span>,
                r.season,
                r.last16
              ]
            }))}
          />
          <div className="flex gap-6 text-[12.5px] text-fg-2">
            {v.rates.map((r) => (
              <span key={r.label}>
                {r.label}: <span className="font-mono font-semibold text-fg">{r.value}</span>
              </span>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-2.5">
          <SectionHead title="Schedule from here" note="Long term" />
          <p className="m-0 text-[12.5px] text-fg-2">{v.schedule ?? 'No games left to rate.'}</p>
        </section>
      </div>
      <div className="flex flex-col gap-7">
        <section className="flex flex-col gap-2.5">
          <SectionHead title="Role" note="Last 4 games against the games before" />
          {v.trend.length ? (
            <MiniTable
              columns="minmax(0,1fr) 72px 72px 72px 64px"
              head={['Share', 'Season', 'Last 4', 'Change', '']}
              rows={v.trend.map((t) => ({
                key: t.metric,
                cells: [
                  <span key="l" className="font-sans text-[13px]">
                    {t.label}
                  </span>,
                  t.season,
                  t.last4,
                  t.change,
                  t.flag ? (
                    <span
                      key="f"
                      className={cn(
                        'text-[11px] font-semibold',
                        t.flag === 'up' ? 'text-good' : 'text-bad'
                      )}
                    >
                      {t.flag === 'up' ? 'Rising' : 'Falling'}
                    </span>
                  ) : (
                    ''
                  )
                ]
              }))}
            />
          ) : (
            <p className="m-0 text-[12.5px] text-fg-3">Not enough games yet.</p>
          )}
        </section>
        <section className="flex flex-col gap-2.5">
          <SectionHead title="Running hot or cold" note="Against what the position sustains" />
          {v.signals.map((s) => (
            <div key={s.metric} className="flex flex-col gap-1 border-t border-line-2 pt-2">
              <span className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="text-fg-2">{s.label}</span>
                <span className="font-mono">
                  {s.value} <span className="text-fg-3">· mean {s.mean}</span>
                </span>
              </span>
              <span
                className={cn(
                  'text-[12px]',
                  s.signal === 'hot' ? 'text-bad' : s.signal === 'cold' ? 'text-good' : 'text-fg-3'
                )}
              >
                {s.text}
              </span>
            </div>
          ))}
        </section>
        {rates.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <SectionHead
              title="Stability-weighted rates"
              note={`Pulled toward the ${position} mean by sample`}
            />
            <MiniTable
              columns="minmax(0,1fr) 72px 72px"
              head={['Rate', 'Raw', 'Weighted']}
              rows={rates.map((r) => ({
                key: r.metric,
                cells: [
                  <span key="l" className="flex items-center gap-1.5 font-sans text-[13px]">
                    {r.label}
                    {r.info && <ReliabilityMarker info={r.info} />}
                  </span>,
                  <span key="r" className="text-fg-2">
                    {r.raw}
                  </span>,
                  <span key="s" className="font-semibold">
                    {r.shrunk}
                  </span>
                ]
              }))}
            />
          </section>
        )}
      </div>
    </div>
  )
}

/** Spec §9.4 Profile: bio, combine with position percentiles, athletic score, career by season. */
function Profile({ data, scope, position, bio }: TabProps): React.JSX.Element {
  const kind = kindOf(position)
  const pq = useMemo(() => (bio ? profileQuery(bio) : null), [bio])
  const { result: profile } = useStatsQuery(pq, data.version, FRESH)
  const cq = useMemo(() => {
    const seasons = bio ? careerQuery(bio, kind, scope, true) : null
    const total = bio ? careerQuery(bio, kind, scope, false) : null
    return seasons && total
      ? new Map([
          ['seasons', seasons],
          ['career', total]
        ])
      : null
  }, [bio, kind, scope])
  const { results: career, error } = useStatsQueries(cq, data.version, FRESH)
  if (!bio) return <Loading />
  const c = combineView(profile)
  const facts: [string, string | null][] = [
    ['Born', bornOf(bio.birthDate)],
    ['Size', sizeOf(bio.height, bio.weight)],
    ['College', bio.college],
    [
      'Draft',
      bio.draft
        ? `${bio.draft.year} · round ${bio.draft.round}, pick ${bio.draft.pick}${bio.draft.team ? ` · ${bio.draft.team}` : ''}`
        : 'Undrafted'
    ],
    ['Rookie season', bio.rookieSeason ? String(bio.rookieSeason) : null],
    ['Team now', bio.team ? `${bio.team}${bio.jersey !== null ? ` · #${bio.jersey}` : ''}` : null]
  ]
  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-9">
        <section className="flex flex-col gap-2.5">
          <SectionHead title="Bio" />
          <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[12.5px]">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-fg-3">{k}</dt>
                <dd className="m-0 text-fg">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="flex flex-col gap-2.5">
          <SectionHead
            title="Combine"
            note={`Percentile among ${position}s at every combine since 2000`}
          />
          {c.rows.every((r) => r.value === '—') ? (
            <p className="m-0 text-[12.5px] text-fg-3">No combine measurements for {bio.name}.</p>
          ) : (
            <>
              <div className="flex gap-6 text-[12.5px] text-fg-2">
                <span title="Each measure scored 0–10 by its percentile within the position, averaged (at least four measures); not Kent Lee Platte's RAS">
                  Athletic score (RAS-style){' '}
                  <span className="font-mono font-semibold text-fg">{c.ras ?? '—'}</span>
                  {c.measures !== null && (
                    <span className="text-fg-3"> · {c.measures} measures</span>
                  )}
                </span>
                <span title="200 × weight ÷ 40-time⁴">
                  Speed Score{' '}
                  <span className="font-mono font-semibold text-fg">{c.speedScore ?? '—'}</span>
                </span>
              </div>
              <div className="flex flex-col border-b border-line-2">
                {c.rows.map((r) => (
                  <div
                    key={r.id}
                    className="grid h-[34px] grid-cols-[130px_76px_minmax(110px,1fr)] items-center gap-3.5 border-t border-line-2 text-[12.5px]"
                  >
                    <span className="text-fg-2">{r.label}</span>
                    <span className={cn('text-right font-mono', r.value === '—' && 'text-fg-3')}>
                      {r.value}
                    </span>
                    {r.percentile !== null ? (
                      <div className="px-[13px]">
                        <PercentileBar percentile={r.percentile} />
                      </div>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
      <section className="flex flex-col gap-2.5">
        <SectionHead title="Career by season" note="Regular seasons since 2019" />
        {career ? (
          <LineTable
            kind={kind}
            data={data}
            first="Season"
            rows={[
              ...careerRows(career.get('seasons') ?? null, kind, data.byId),
              lineRow('career', 'Career', career.get('career')?.rows[0], kind, data.byId)
            ]}
          />
        ) : (
          <Loading error={error} />
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 5: The routes**

```diff
diff --git a/src/renderer/src/lib/stats/useStats.ts b/src/renderer/src/lib/stats/useStats.ts
index c800c31..e2e9a9d 100644
--- a/src/renderer/src/lib/stats/useStats.ts
+++ b/src/renderer/src/lib/stats/useStats.ts
@@ -21,6 +21,8 @@ export interface StatsData {
   catalogue: MetricInfo[]
   byId: ReadonlyMap<string, MetricInfo>
   ownership: StatsOwnership | null
+  /** The rosters' first answer arrived (the dashboards open on my top scorer only then). */
+  ownershipReady: boolean
   /** Bumped when a rebuild finished (spec §5.3): screens query again. */
   version: number
   error: string | null
@@ -34,6 +36,7 @@ export function useStatsData(leagueKey: number): StatsData {
   const [status, setStatus] = useState<StatsStatus | null>(null)
   const [catalogue, setCatalogue] = useState<MetricInfo[]>([])
   const [ownership, setOwnership] = useState<StatsOwnership | null>(null)
+  const [ownershipReady, setOwnershipReady] = useState(false)
   const [version, setVersion] = useState(0)
   const [error, setError] = useState<string | null>(null)

@@ -58,6 +61,7 @@ export function useStatsData(leagueKey: number): StatsData {
       .ownership()
       .then((o) => alive && setOwnership(o))
       .catch(() => alive && setOwnership(null))
+      .finally(() => alive && setOwnershipReady(true))
     return () => {
       alive = false
     }
@@ -78,7 +82,7 @@ export function useStatsData(leagueKey: number): StatsData {
   }, [status?.busy])

   const byId = useMemo(() => new Map(catalogue.map((m) => [m.id, m])), [catalogue])
-  return { status, catalogue, byId, ownership, version, error }
+  return { status, catalogue, byId, ownership, ownershipReady, version, error }
 }

 export interface QueryState {
```

```diff
diff --git a/src/renderer/src/components/stats/StatsNav.tsx b/src/renderer/src/components/stats/StatsNav.tsx
index a3f854a..70523d2 100644
--- a/src/renderer/src/components/stats/StatsNav.tsx
+++ b/src/renderer/src/components/stats/StatsNav.tsx
@@ -5,12 +5,15 @@ import { cn } from '@/lib/utils'
 import type { StatsStatus } from '@shared/stats/types'
 import type { UpdateState } from '@shared/types'

-/** `team` is the team dashboard (spec §9.3), `teams` the team leaderboard. */
-export type StatsScreen = 'home' | 'players' | 'team' | 'teams' | 'glossary'
+/**
+ * `player` and `team` are the dashboards (spec §9.4, §9.3), `players` and `teams` the
+ * leaderboards.
+ */
+export type StatsScreen = 'home' | 'player' | 'players' | 'team' | 'teams' | 'glossary'

 const ITEMS: { id: StatsScreen | 'games'; label: string }[] = [
   { id: 'home', label: 'Leaderboards' },
-  { id: 'players', label: 'Players' },
+  { id: 'player', label: 'Players' },
   { id: 'team', label: 'Teams' },
   { id: 'games', label: 'Games' },
   { id: 'glossary', label: 'Glossary' }
@@ -30,7 +33,7 @@ interface StatsNavProps {

 /**
  * Stats nav (handoff "Stats nav"): 52px, mark + "Companion Stats", five items, Fantasy ↗, theme.
- * Teams opens the team dashboard.
+ * Players and Teams open the dashboards.
  */
 export function StatsNav({
   current,
@@ -57,8 +60,11 @@ export function StatsNav({
       <div className="flex gap-[22px] self-stretch text-[13.5px] leading-none font-medium">
         {ITEMS.map(({ id, label }) => {
           const soon = id === 'games'
-          // Teams opens the dashboard; the team leaderboard is under it.
-          const on = current === id || (id === 'team' && current === 'teams')
+          // Players and Teams open the dashboards; the leaderboards are under them.
+          const on =
+            current === id ||
+            (id === 'team' && current === 'teams') ||
+            (id === 'player' && current === 'players')
           return (
             <button
               key={id}
```

```diff
diff --git a/src/renderer/src/screens/stats/StatsApp.tsx b/src/renderer/src/screens/stats/StatsApp.tsx
index eb815f6..ba7b63b 100644
--- a/src/renderer/src/screens/stats/StatsApp.tsx
+++ b/src/renderer/src/screens/stats/StatsApp.tsx
@@ -4,14 +4,16 @@ import { api } from '@/lib/api'
 import { errorMessage } from '@/lib/format'
 import type { BoardDef } from '@/lib/stats/boards'
 import { bestFirst, defaultBoard, normalizeBoard } from '@/lib/stats/leaderboard'
+import { defaultPlayer, positionTab, railQuery, type PlayerTab } from '@/lib/stats/player'
 import { defaultScope, type StatsScope } from '@/lib/stats/scope'
 import { defaultTeam, topScorerQuery, type TeamTab } from '@/lib/stats/team'
 import { useStatsData, useStatsQuery } from '@/lib/stats/useStats'
 import { StatsGlossary } from '@/screens/stats/StatsGlossary'
 import { StatsHome } from '@/screens/stats/StatsHome'
 import { StatsLeaderboard, type LeaderboardOpen } from '@/screens/stats/StatsLeaderboard'
+import { StatsPlayer, type PlayerRef } from '@/screens/stats/StatsPlayer'
 import { StatsTeam } from '@/screens/stats/StatsTeam'
-import type { LeaderboardBoard, StatsView } from '@shared/stats/types'
+import type { LeaderboardBoard, PositionGroup, StatsView } from '@shared/stats/types'
 import type { UpdateState } from '@shared/types'

 interface StatsAppProps {
@@ -30,7 +32,8 @@ interface StatsAppProps {

 /**
  * Companion Stats (stats-analysis spec §9, design handoff "Companion Stats"): its own shell and
- * nav, the scope shared by every screen (§9.1), the Stats home and the leaderboards (§9.2).
+ * nav, the scope shared by every screen (§9.1), the Stats home and the leaderboards (§9.2), the
+ * team and player dashboards (§9.3, §9.4).
  */
 export function StatsApp({
   hasLeague,
@@ -52,6 +55,9 @@ export function StatsApp({
   // The team dashboard (spec §9.3): the team chosen this session, else my top scorer's.
   const [team, setTeam] = useState<string | null>(null)
   const [teamTab, setTeamTab] = useState<TeamTab>('overview')
+  // The player dashboard (spec §9.4): the player chosen this session, else my top scorer.
+  const [player, setPlayer] = useState<PlayerRef | null>(null)
+  const [playerTab, setPlayerTab] = useState<PlayerTab>('overview')

   useEffect(() => {
     void api.stats
@@ -65,19 +71,35 @@ export function StatsApp({
     scope.scoring === 'league' && !hasLeague ? { ...scope, scoring: 'ppr' } : scope

   // The query hook keys on the query's text, so a new object each render runs nothing again.
-  const topQuery =
-    team === null && screen === 'team'
-      ? topScorerQuery(data.ownership, effective, data.status)
-      : null
+  const needsDefault =
+    (team === null && screen === 'team') || (player === null && screen === 'player')
+  const topQuery = needsDefault ? topScorerQuery(data.ownership, effective, data.status) : null
   const top = useStatsQuery(topQuery, data.version)
-  // With a roster, wait for my top scorer before choosing (no flash of the first team).
-  const shownTeam = team ?? (topQuery && top.loading ? null : defaultTeam(top.result))
+  // Without my roster, the player dashboard opens on the leading WR.
+  const leadersQuery =
+    player === null && screen === 'player' && data.byId.size > 0
+      ? railQuery('WR', positionTab('WR').sort, effective, data.status, data.byId)
+      : null
+  const leaders = useStatsQuery(leadersQuery, data.version)
+  // With a league, wait for its rosters and my top scorer before choosing (no flash of the first).
+  const rosters = !hasLeague || data.ownershipReady
+  const shownTeam = team ?? (!rosters || (topQuery && top.loading) ? null : defaultTeam(top.result))
   // Once on screen, the default is the team: a new season or range does not switch it.
   if (team === null && screen === 'team' && shownTeam !== null) setTeam(shownTeam)
   const openTeam = (code: string): void => {
     setTeam(code)
     setScreen('team')
   }
+  const shownPlayer =
+    player ??
+    (!rosters || (topQuery && top.loading) || leaders.loading
+      ? null
+      : defaultPlayer(top.result, leaders.result))
+  if (player === null && screen === 'player' && shownPlayer !== null) setPlayer(shownPlayer)
+  const openPlayer = (id: string, position: PositionGroup | null): void => {
+    setPlayer({ id, position })
+    setScreen('player')
+  }

   const openBoard = (board: LeaderboardBoard, selected: string | null): void => {
     setOpen((o) => ({ board, selected, nonce: (o?.nonce ?? 0) + 1 }))
@@ -89,6 +111,10 @@ export function StatsApp({
       openTeam(rowId)
       return
     }
+    if (b.position && rowId) {
+      openPlayer(rowId, b.position)
+      return
+    }
     const base = defaultBoard(entity, b.tab, data.byId)
     const columns = base.columns.includes(b.metric) ? base.columns : [b.metric, ...base.columns]
     openBoard(
@@ -161,6 +187,7 @@ export function StatsApp({
                 onDeleteView={deleteView}
                 onOpenView={openView}
                 onOpenTeam={openTeam}
+                onOpenPlayer={openPlayer}
               />
             )}
             {screen === 'team' &&
@@ -175,6 +202,26 @@ export function StatsApp({
                   tab={teamTab}
                   onTab={setTeamTab}
                   onOpenLeaderboard={() => setScreen('teams')}
+                  onOpenPlayer={openPlayer}
+                />
+              ) : (
+                <div className="py-20 text-center text-[13px] text-fg-3">Loading…</div>
+              ))}
+            {screen === 'player' &&
+              (shownPlayer ? (
+                <StatsPlayer
+                  data={data}
+                  scope={effective}
+                  onScope={setChosen}
+                  hasLeague={hasLeague}
+                  player={shownPlayer}
+                  onPlayer={setPlayer}
+                  tab={playerTab}
+                  onTab={setPlayerTab}
+                  onOpenTeam={openTeam}
+                  onOpenLeaderboard={(position) =>
+                    openBoard(defaultBoard('player', position, data.byId), shownPlayer.id)
+                  }
                 />
               ) : (
                 <div className="py-20 text-center text-[13px] text-fg-3">Loading…</div>
```

```diff
diff --git a/src/renderer/src/screens/stats/StatsLeaderboard.tsx b/src/renderer/src/screens/stats/StatsLeaderboard.tsx
index ce85fb3..c1b476d 100644
--- a/src/renderer/src/screens/stats/StatsLeaderboard.tsx
+++ b/src/renderer/src/screens/stats/StatsLeaderboard.tsx
@@ -23,11 +23,18 @@ import {
   tabOf,
   tabsOf
 } from '@/lib/stats/leaderboard'
+import { positionGroup } from '@/lib/stats/player'
 import { rangeLabel, type StatsScope } from '@/lib/stats/scope'
 import { useStatsQuery, type StatsData } from '@/lib/stats/useStats'
 import { cn } from '@/lib/utils'
 import { NFL_TEAMS, toNflverseTeam } from '@shared/teams'
-import type { Entity, LeaderboardBoard, MetricFamily, StatsView } from '@shared/stats/types'
+import type {
+  Entity,
+  LeaderboardBoard,
+  MetricFamily,
+  PositionGroup,
+  StatsView
+} from '@shared/stats/types'

 /** Rows rendered at a time; "Show more" adds as many. */
 const PAGE = 50
@@ -82,7 +89,8 @@ export function StatsLeaderboard({
   onSaveView,
   onDeleteView,
   onOpenView,
-  onOpenTeam
+  onOpenTeam,
+  onOpenPlayer
 }: {
   entity: Entity
   data: StatsData
@@ -96,6 +104,8 @@ export function StatsLeaderboard({
   onOpenView: (view: StatsView) => void
   /** A team row opens the team dashboard (spec §9.3). */
   onOpenTeam?: (team: string) => void
+  /** A player row opens the player dashboard (spec §9.4). */
+  onOpenPlayer?: (id: string, position: PositionGroup | null) => void
 }): React.JSX.Element {
   // The board on screen: the one opened (until the user changes it), else the default tab's.
   const [own, setOwn] = useState<{ nonce: number | null; board: LeaderboardBoard } | null>(null)
@@ -347,11 +357,12 @@ export function StatsLeaderboard({
             ownership={data.ownership}
             season={scope.season}
             selected={selected}
-            onSelect={(id) =>
-              entity === 'team' && onOpenTeam
-                ? onOpenTeam(id)
-                : setPicked({ nonce: opened?.nonce ?? null, id })
-            }
+            onSelect={(id) => {
+              if (entity === 'team' && onOpenTeam) onOpenTeam(id)
+              else if (entity === 'player' && onOpenPlayer)
+                onOpenPlayer(id, positionGroup(rows.find((r) => r.id === id)?.position ?? null))
+              else setPicked({ nonce: opened?.nonce ?? null, id })
+            }}
             onSort={sortBy}
           />
         )}
```

```diff
diff --git a/src/renderer/src/screens/stats/StatsTeam.tsx b/src/renderer/src/screens/stats/StatsTeam.tsx
index ba23f65..5c0eed1 100644
--- a/src/renderer/src/screens/stats/StatsTeam.tsx
+++ b/src/renderer/src/screens/stats/StatsTeam.tsx
@@ -13,6 +13,7 @@ import { ScopeBar } from '@/components/stats/ScopeBar'
 import { StatSection, StatSections } from '@/components/stats/StatLines'
 import { WeekChart } from '@/components/stats/WeekChart'
 import { fmtStat } from '@/lib/stats/format'
+import { positionGroup } from '@/lib/stats/player'
 import { rangeLabel, type StatsScope } from '@/lib/stats/scope'
 import {
   chartWeeks,
@@ -51,7 +52,7 @@ import {
 import { useStatsQueries, useStatsQuery, useTeamGames, type StatsData } from '@/lib/stats/useStats'
 import { cn } from '@/lib/utils'
 import { STATS_TEAMS, TEAM_NAMES } from '@shared/stats/nflTeams'
-import type { MetricInfo, StatsResult } from '@shared/stats/types'
+import type { MetricInfo, PositionGroup, StatsResult } from '@shared/stats/types'

 /** The dashboard is about one team: never another team's (or tab's) answers while its own load. */
 const FRESH = { keepLast: false }
@@ -61,6 +62,8 @@ interface TabProps {
   scope: StatsScope
   team: string
   games: TeamGame[] | null
+  /** A player's name opens his dashboard (spec §9.4). */
+  onOpenPlayer?: (id: string, position: PositionGroup | null) => void
 }

 /**
@@ -76,7 +79,8 @@ export function StatsTeam({
   onTeam,
   tab,
   onTab,
-  onOpenLeaderboard
+  onOpenLeaderboard,
+  onOpenPlayer
 }: {
   data: StatsData
   scope: StatsScope
@@ -88,6 +92,7 @@ export function StatsTeam({
   onTab: (tab: TeamTab) => void
   /** The team leaderboard (spec §9.2). */
   onOpenLeaderboard: () => void
+  onOpenPlayer?: (id: string, position: PositionGroup | null) => void
 }): React.JSX.Element {
   const { games: raw, error: gamesError } = useTeamGames(scope.season, team, data.version)
   const games = useMemo(() => (raw ? teamGames(raw, team) : null), [raw, team])
@@ -97,7 +102,7 @@ export function StatsTeam({
     [scope, data.status]
   )
   const { results: ratings } = useStatsQueries(overview, data.version, FRESH)
-  const props: TabProps = { data, scope, team, games }
+  const props: TabProps = { data, scope, team, games, onOpenPlayer }

   return (
     <div className="flex flex-col gap-5 px-8 pt-[22px] pb-8">
@@ -302,8 +307,11 @@ function Overview({
   scope,
   team,
   games,
-  ratings
+  ratings,
+  onOpenPlayer
 }: TabProps & { ratings: Map<SplitKey, StatsResult> | null }): React.JSX.Element {
+  const open = (id: string, position: string | null): (() => void) | undefined =>
+    onOpenPlayer ? () => onOpenPlayer(id, positionGroup(position)) : undefined
   const q = useMemo(() => rosterQuery(team, scope, data.status), [team, scope, data.status])
   const { result, error } = useStatsQuery(q, data.version, FRESH)
   const weekly = useMemo(
@@ -333,7 +341,13 @@ function Overview({
                 rows={v.targets.map((r) => ({
                   key: r.id,
                   cells: [
-                    <PlayerName key="n" name={r.name} position={r.position} mine={r.mine} />,
+                    <PlayerName
+                      key="n"
+                      name={r.name}
+                      position={r.position}
+                      mine={r.mine}
+                      onOpen={open(r.id, r.position)}
+                    />,
                     r.cells[0],
                     <ShareBar key="s" row={r} />,
                     <span key="r" className="text-fg-2">
@@ -358,7 +372,13 @@ function Overview({
                 rows={v.carries.map((r) => ({
                   key: r.id,
                   cells: [
-                    <PlayerName key="n" name={r.name} position={r.position} mine={r.mine} />,
+                    <PlayerName
+                      key="n"
+                      name={r.name}
+                      position={r.position}
+                      mine={r.mine}
+                      onOpen={open(r.id, r.position)}
+                    />,
                     r.cells[0],
                     <ShareBar key="s" row={r} />,
                     r.cells[1],
@@ -381,7 +401,13 @@ function Overview({
                   rows={v.passers.map((r) => ({
                     key: r.id,
                     cells: [
-                      <PlayerName key="n" name={r.name} position={null} mine={r.mine} />,
+                      <PlayerName
+                        key="n"
+                        name={r.name}
+                        position={null}
+                        mine={r.mine}
+                        onOpen={open(r.id, 'QB')}
+                      />,
                       ...r.cells
                     ]
                   }))}
@@ -454,7 +480,8 @@ function LinesTab({
   scope,
   team,
   sections,
-  tab
+  tab,
+  onOpenPlayer
 }: TabProps & { sections: SectionDef[]; tab: TeamTab }): React.JSX.Element {
   const queries = useMemo(
     () => sectionQueries(sections, scope, data.status),
@@ -468,13 +495,20 @@ function LinesTab({
       ) : (
         <Loading error={error} />
       )}
-      {tab === 'special' && <Specialists data={data} scope={scope} team={team} />}
+      {tab === 'special' && (
+        <Specialists data={data} scope={scope} team={team} onOpenPlayer={onOpenPlayer} />
+      )}
       {tab === 'tendencies' && <Personnel data={data} scope={scope} team={team} />}
     </div>
   )
 }

-function Specialists({ data, scope, team }: Omit<TabProps, 'games'>): React.JSX.Element | null {
+function Specialists({
+  data,
+  scope,
+  team,
+  onOpenPlayer
+}: Omit<TabProps, 'games'>): React.JSX.Element | null {
   const q = useMemo(() => specialistsQuery(team, scope, data.status), [team, scope, data.status])
   const { result, error } = useStatsQuery(q, data.version, FRESH)
   if (error) return <Loading error={error} />
@@ -497,7 +531,13 @@ function Specialists({ data, scope, team }: Omit<TabProps, 'games'>): React.JSX.
           rows={kickers.map((r) => ({
             key: r.id,
             cells: [
-              <PlayerName key="n" name={r.name} position="K" mine={false} />,
+              <PlayerName
+                key="n"
+                name={r.name}
+                position="K"
+                mine={false}
+                onOpen={onOpenPlayer && (() => onOpenPlayer(r.id, 'K'))}
+              />,
               `${f('fg_made', r.values.fg_made?.value)}/${f('fg_att', r.values.fg_att?.value)}`,
               ...cells(r, ['fg_pct', 'fg_pct_50p', 'fgoe', 'pat_pct'])
             ]
@@ -512,7 +552,13 @@ function Specialists({ data, scope, team }: Omit<TabProps, 'games'>): React.JSX.
           rows={punters.map((r) => ({
             key: r.id,
             cells: [
-              <PlayerName key="n" name={r.name} position="P" mine={false} />,
+              <PlayerName
+                key="n"
+                name={r.name}
+                position="P"
+                mine={false}
+                onOpen={onOpenPlayer && (() => onOpenPlayer(r.id, 'P'))}
+              />,
               ...cells(r, ['punts', 'punt_net_avg', 'punt_in20_rate'])
             ]
           }))}
@@ -635,7 +681,7 @@ function Situational({ data, scope, team }: TabProps): React.JSX.Element {
 }

 /** Spec §9.3 Players: usage shares across the roster, week by week. */
-function Players({ data, scope, team }: TabProps): React.JSX.Element {
+function Players({ data, scope, team, onOpenPlayer }: TabProps): React.JSX.Element {
   const [metric, setMetric] = useState(USAGE_METRICS[0].id)
   const queries = useMemo(
     () =>
@@ -686,7 +732,12 @@ function Players({ data, scope, team }: TabProps): React.JSX.Element {
             {rows.map((r) => (
               <tr key={r.id} className="h-[34px] border-b border-line-2">
                 <td className="sticky left-0 bg-panel px-3">
-                  <PlayerName name={r.name} position={r.position} mine={r.mine} />
+                  <PlayerName
+                    name={r.name}
+                    position={r.position}
+                    mine={r.mine}
+                    onOpen={onOpenPlayer && (() => onOpenPlayer(r.id, positionGroup(r.position)))}
+                  />
                 </td>
                 <td className="px-2 text-right font-semibold">
                   {pct(r.season)}
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run tests/renderer/components/StatsPlayer.test.tsx tests/renderer/components/StatsApp.test.tsx tests/renderer/components/StatsTeam.test.tsx
```

Expected: PASS (28 passed). Then `npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run`: clean; 1017 passed | 5 skipped.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/renderer/src/components/stats/PlayerRail.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/lib/stats/useStats.ts src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/screens/stats/StatsLeaderboard.tsx src/renderer/src/screens/stats/StatsPlayer.tsx src/renderer/src/screens/stats/StatsTeam.tsx tests/fixtures/statsScreens.ts tests/renderer/components/StatsApp.test.tsx tests/renderer/components/StatsPlayer.test.tsx
git add src/renderer/src/components/stats/PlayerRail.tsx src/renderer/src/components/stats/StatsNav.tsx src/renderer/src/lib/stats/useStats.ts src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/screens/stats/StatsLeaderboard.tsx src/renderer/src/screens/stats/StatsPlayer.tsx src/renderer/src/screens/stats/StatsTeam.tsx tests/fixtures/statsScreens.ts tests/renderer/components/StatsApp.test.tsx tests/renderer/components/StatsPlayer.test.tsx
git commit -m "feat(stats): add the player dashboard"
```

---

### Task 5: Both products open each other’s players (spec §9.4; amendments E, G)

The Fantasy player file gains "Full stats ↗" (a team defense opens its team dashboard), and the dashboard the owner chip that opens his Fantasy file, for fantasy positions. With a league and in the current season, the Forecast shows his Fantasy file's projections.

**Files:**

- Create: `src/renderer/src/lib/productLinks.ts`, `tests/renderer/components/PlayerDetailPanel.test.tsx`
- Modify: `src/renderer/src/App.tsx`, `src/renderer/src/components/PlayerDetailPanel.tsx`, `src/renderer/src/lib/stats/player.ts`, `src/renderer/src/screens/stats/StatsApp.tsx`, `src/renderer/src/screens/stats/StatsPlayer.tsx`, `tests/renderer/components/App.test.tsx`, `tests/renderer/components/StatsPlayer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/components/PlayerDetailPanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { api } from '@/lib/api'
import { ProductLinksContext } from '@/lib/productLinks'
import type { PlayerLink } from '@shared/stats/types'
import type { DetailTarget } from '@shared/types'

vi.mock('@/lib/api', () => ({
  api: {
    players: { detail: vi.fn(), news: vi.fn() },
    stats: { link: vi.fn() },
    watchlist: { toggle: vi.fn() }
  }
}))

const CHASE: DetailTarget = {
  playerId: '7564',
  fullName: "Ja'Marr Chase",
  position: 'WR',
  team: 'CIN',
  statsAvailable: true
}

function renderPanel(openStats: ((link: PlayerLink) => void) | null, player = CHASE): void {
  const panel = <PlayerDetailPanel season={2026} player={player} onClose={() => {}} />
  render(
    openStats ? (
      <ProductLinksContext.Provider value={{ openStats }}>{panel}</ProductLinksContext.Provider>
    ) : (
      panel
    )
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  // The file itself never loads here: only its top bar matters.
  vi.mocked(api.players.detail).mockReturnValue(new Promise(() => {}))
  vi.mocked(api.players.news).mockReturnValue(new Promise(() => {}))
})
afterEach(cleanup)

describe('the player file’s link to Companion Stats (spec §9.4)', () => {
  it('opens the player’s dashboard by his gsis id', async () => {
    const link = { sleeper: '7564', gsis: '00-0036900', team: null }
    vi.mocked(api.stats.link).mockResolvedValue(link)
    const openStats = vi.fn()
    renderPanel(openStats)
    const pill = screen.getByRole('button', { name: /Full stats ↗/ }) as HTMLButtonElement
    await waitFor(() => expect(pill.disabled).toBe(false))
    expect(api.stats.link).toHaveBeenCalledWith({ sleeper: '7564' })
    fireEvent.click(pill)
    expect(openStats).toHaveBeenCalledWith(link)
  })

  it('opens a defense’s team, and stays off for a player Stats does not know', async () => {
    vi.mocked(api.stats.link).mockResolvedValue({ sleeper: 'LAR', gsis: null, team: 'LA' })
    const openStats = vi.fn()
    renderPanel(openStats, {
      ...CHASE,
      playerId: 'LAR',
      fullName: 'Los Angeles Rams',
      position: 'DEF'
    })
    const pill = screen.getByRole('button', { name: /Full stats ↗/ }) as HTMLButtonElement
    await waitFor(() => expect(pill.disabled).toBe(false))
    fireEvent.click(pill)
    expect(openStats).toHaveBeenCalledWith({ sleeper: 'LAR', gsis: null, team: 'LA' })
    cleanup()
    vi.mocked(api.stats.link).mockResolvedValue(null)
    renderPanel(vi.fn())
    await waitFor(() => expect(api.stats.link).toHaveBeenCalledTimes(2))
    expect(
      (screen.getByRole('button', { name: /Full stats ↗/ }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('has no link outside the app', () => {
    renderPanel(null)
    expect(screen.queryByRole('button', { name: /Full stats ↗/ })).toBeNull()
    expect(api.stats.link).not.toHaveBeenCalled()
  })
})
```

```diff
diff --git a/tests/renderer/components/App.test.tsx b/tests/renderer/components/App.test.tsx
index 571bcbd..62709d4 100644
--- a/tests/renderer/components/App.test.tsx
+++ b/tests/renderer/components/App.test.tsx
@@ -18,11 +18,15 @@ vi.mock('@/screens/stats/StatsApp', () => ({
   StatsApp: ({
     onOpenFantasy,
     scope,
-    onScope
+    onScope,
+    focus,
+    onOpenFantasyPlayer
   }: {
     onOpenFantasy: () => void
     scope: { season: number } | null
     onScope: (s: unknown) => void
+    focus: { kind: string; id?: string; team?: string; nonce: number } | null
+    onOpenFantasyPlayer: (id: string) => void
   }) => (
     <>
       <button type="button" onClick={onOpenFantasy}>
@@ -31,6 +35,10 @@ vi.mock('@/screens/stats/StatsApp', () => ({
       <button type="button" onClick={() => onScope({ season: 2023 })}>
         Season {scope?.season ?? 'default'}
       </button>
+      <span>Stats focus: {focus ? `${focus.kind} ${focus.id ?? focus.team}` : 'none'}</span>
+      <button type="button" onClick={() => onOpenFantasyPlayer('7564')}>
+        Open his file
+      </button>
     </>
   )
 }))
@@ -42,7 +50,37 @@ vi.mock('@/components/TopNav', () => ({
   )
 }))
 vi.mock('@/screens/SetupScreen', () => ({ SetupScreen: () => <div>Setup screen</div> }))
-vi.mock('@/screens/LeagueScreen', () => ({ LeagueScreen: () => <div>League screen</div> }))
+vi.mock('@/screens/LeagueScreen', async () => {
+  const { useProductLinks } = await import('@/lib/productLinks')
+  return {
+    // A player file's "Full stats ↗" as the screens' panels call it.
+    LeagueScreen: () => {
+      const links = useProductLinks()
+      return (
+        <>
+          <div>League screen</div>
+          <button
+            type="button"
+            onClick={() => links?.openStats({ sleeper: '7564', gsis: '00-0036900', team: null })}
+          >
+            Full stats of Chase
+          </button>
+          <button
+            type="button"
+            onClick={() => links?.openStats({ sleeper: 'LAR', gsis: null, team: 'LA' })}
+          >
+            Full stats of the Rams
+          </button>
+        </>
+      )
+    }
+  }
+})
+vi.mock('@/screens/PlayersScreen', () => ({
+  PlayersScreen: ({ focus }: { focus: { playerId: string } | null }) => (
+    <div>Players screen on {focus?.playerId ?? 'nobody'}</div>
+  )
+}))
 vi.mock('@/components/UpdateDialog', () => ({ UpdateDialog: () => null }))

 const LEAGUE: League = {
@@ -89,4 +127,26 @@ describe('App: two products (stats-analysis spec §9.1)', () => {
     fireEvent.click(await screen.findByRole('button', { name: 'Fantasy nav on league' }))
     expect(await screen.findByRole('button', { name: 'Season 2023' })).toBeTruthy()
   })
+
+  it('opens each product on the other’s player (spec §9.4)', async () => {
+    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
+    render(<App />)
+    fireEvent.click(await screen.findByRole('button', { name: 'Full stats of Chase' }))
+    expect(await screen.findByText('Stats focus: player 00-0036900')).toBeTruthy()
+    fireEvent.click(screen.getByRole('button', { name: 'Open his file' }))
+    expect(await screen.findByText('Players screen on 7564')).toBeTruthy()
+    fireEvent.click(screen.getByRole('button', { name: 'Fantasy nav on players' }))
+    // Stats ↗ from the nav opens Stats without a focus.
+    expect(await screen.findByText('Stats focus: none')).toBeTruthy()
+    fireEvent.click(screen.getByRole('button', { name: 'Stats product' }))
+    fireEvent.click(await screen.findByRole('button', { name: 'Fantasy nav on players' }))
+    expect(screen.queryByText('League screen')).toBeNull()
+  })
+
+  it('opens a defense’s team dashboard', async () => {
+    vi.mocked(api.league.get).mockResolvedValue(LEAGUE)
+    render(<App />)
+    fireEvent.click(await screen.findByRole('button', { name: 'Full stats of the Rams' }))
+    expect(await screen.findByText('Stats focus: team LA')).toBeTruthy()
+  })
 })
```

```diff
diff --git a/tests/renderer/components/StatsPlayer.test.tsx b/tests/renderer/components/StatsPlayer.test.tsx
index 0ee0d9e..6ae962a 100644
--- a/tests/renderer/components/StatsPlayer.test.tsx
+++ b/tests/renderer/components/StatsPlayer.test.tsx
@@ -2,7 +2,7 @@
 import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
 import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
 import { useState } from 'react'
-import { StatsApp } from '@/screens/stats/StatsApp'
+import { StatsApp, type StatsFocus } from '@/screens/stats/StatsApp'
 import type { StatsScope } from '@/lib/stats/scope'
 import { api } from '@/lib/api'
 import type { GameForecast, PlayerOutlook, StatsOwnership, StatsQuery } from '@shared/stats/types'
@@ -11,6 +11,7 @@ import { bio, catalogue, result, row, STATUS, value } from '../../fixtures/stats

 vi.mock('@/lib/api', () => ({
   api: {
+    players: { detail: vi.fn() },
     stats: {
       status: vi.fn(),
       catalogue: vi.fn(),
@@ -149,10 +150,20 @@ const OUTLOOK: PlayerOutlook = {

 const IDLE: UpdateState = { status: 'idle' } as UpdateState

-function Harness({ hasLeague }: { hasLeague: boolean }): React.JSX.Element {
+function Harness({
+  hasLeague,
+  focus = null,
+  onOpenFantasyPlayer
+}: {
+  hasLeague: boolean
+  focus?: StatsFocus | null
+  onOpenFantasyPlayer?: (id: string) => void
+}): React.JSX.Element {
   const [scope, setScope] = useState<StatsScope | null>(null)
   return (
     <StatsApp
+      focus={focus}
+      onOpenFantasyPlayer={onOpenFantasyPlayer}
       hasLeague={hasLeague}
       leagueKey={0}
       onOpenFantasy={() => {}}
@@ -369,4 +380,85 @@ describe('the player dashboard (stats-analysis spec §9.4)', () => {
     fireEvent.click((await screen.findAllByTitle('Open Player 2’s dashboard'))[0])
     expect(await screen.findByRole('heading', { name: 'Player 2' })).toBeTruthy()
   })
+
+  it('opens what Fantasy asks, and his Fantasy file from the owner chip', async () => {
+    stats.link.mockResolvedValue({ sleeper: '9999', gsis: 'p2', team: null })
+    const open = vi.fn()
+    render(
+      <Harness
+        hasLeague
+        focus={{ kind: 'player', id: 'p2', nonce: 1 }}
+        onOpenFantasyPlayer={open}
+      />
+    )
+    // His position comes from his bio: a WR.
+    expect(await screen.findByRole('heading', { name: 'Player 2' })).toBeTruthy()
+    expect(screen.getByRole('tab', { name: 'vs Coverage' })).toBeTruthy()
+    const chip = await screen.findByRole('button', { name: /Free agent in your league/ })
+    expect(screen.getByText(/Free agent in your league/, { selector: 'button' })).toBe(chip)
+    await waitFor(() => expect((chip as HTMLButtonElement).disabled).toBe(false))
+    fireEvent.click(chip)
+    expect(stats.link).toHaveBeenCalledWith({ gsis: 'p2' })
+    expect(open).toHaveBeenCalledWith('9999')
+    // The Forecast reads his Fantasy file's projections, under the league's scoring.
+    vi.mocked(api.players.detail).mockResolvedValue({
+      row: { rosPoints: 151.25, rosRank: 9, expert: { ecrPosRank: 7 } },
+      weeks: [{ week: 7, played: false, projected: 16.36, opponent: 'ARI' }],
+      schedule: []
+    } as never)
+    tab('Forecast')
+    expect(await screen.findByText('16.4 pts · week 7 vs ARI')).toBeTruthy()
+    expect(screen.getByText('151.3 pts · WR9')).toBeTruthy()
+    expect(api.players.detail).toHaveBeenCalledWith(2026, '9999')
+  })
+
+  it('keeps defenders out of Fantasy, and says what the Forecast needs without a league', async () => {
+    stats.player.mockImplementation(async ({ player }) => bio(player, { position: 'CB' }))
+    render(
+      <Harness
+        hasLeague
+        focus={{ kind: 'player', id: 'p2', nonce: 1 }}
+        onOpenFantasyPlayer={vi.fn()}
+      />
+    )
+    expect(await screen.findByRole('tab', { name: 'Run defense & tackling' })).toBeTruthy()
+    expect(
+      // The chip's own text (a rail row's name carries my player's dot label).
+      screen.queryByText(/On your fantasy team|Rostered by|Free agent in your league/, {
+        selector: 'button'
+      })
+    ).toBeNull()
+    cleanup()
+    stats.ownership.mockResolvedValue(null)
+    stats.player.mockImplementation(async ({ player }) => bio(player))
+    render(<Harness hasLeague={false} focus={{ kind: 'player', id: 'p2', nonce: 1 }} />)
+    await screen.findByRole('heading', { name: 'Player 2' })
+    tab('Forecast')
+    expect(
+      await screen.findByText('Import a league for Sleeper’s projection and FantasyPros’ rank.')
+    ).toBeTruthy()
+  })
+
+  it('opens a defense’s team, and shows no Fantasy chip without a league', async () => {
+    stats.games.mockResolvedValue(GAMES)
+    render(<Harness hasLeague={false} focus={{ kind: 'team', team: 'LA', nonce: 1 }} />)
+    expect(await screen.findByRole('heading', { name: 'LA' })).toBeTruthy()
+    cleanup()
+    stats.ownership.mockResolvedValue(null)
+    render(
+      <Harness
+        hasLeague={false}
+        focus={{ kind: 'player', id: 'p1', nonce: 1 }}
+        onOpenFantasyPlayer={vi.fn()}
+      />
+    )
+    expect(await screen.findByRole('heading', { name: 'Player 1' })).toBeTruthy()
+    expect(
+      // The chip's own text (a rail row's name carries my player's dot label).
+      screen.queryByText(/On your fantasy team|Rostered by|Free agent in your league/, {
+        selector: 'button'
+      })
+    ).toBeNull()
+    expect(stats.link).not.toHaveBeenCalled()
+  })
 })
```

- [ ] **Step 2: Run them to see them fail**

```bash
npx vitest run tests/renderer/components/PlayerDetailPanel.test.tsx tests/renderer/components/App.test.tsx tests/renderer/components/StatsPlayer.test.tsx
```

Expected: FAIL. `@/lib/productLinks` does not exist (`Failed to resolve import`, the App and player file tests), and the three new dashboard tests fail: StatsApp takes no focus yet (`Unable to find role="heading" and name "Player 2"`, `"LA"`; `role="tab" and name "Run defense & tackling"`). The other ten pass.

- [ ] **Step 3: Fantasy to Stats**

Create `src/renderer/src/lib/productLinks.ts`:

```ts
import { createContext, useContext } from 'react'
import type { PlayerLink } from '@shared/stats/types'

/**
 * Stats-analysis spec §9.4: the two products open each other's player pages. App provides the
 * handlers; outside it (a screen rendered on its own) there are none.
 */
export interface ProductLinks {
  /** Companion Stats on the player's dashboard, or a team defense's team dashboard. */
  openStats: (link: PlayerLink) => void
}

export const ProductLinksContext = createContext<ProductLinks | null>(null)

export function useProductLinks(): ProductLinks | null {
  return useContext(ProductLinksContext)
}
```

```diff
diff --git a/src/renderer/src/components/PlayerDetailPanel.tsx b/src/renderer/src/components/PlayerDetailPanel.tsx
index 590126d..6642971 100644
--- a/src/renderer/src/components/PlayerDetailPanel.tsx
+++ b/src/renderer/src/components/PlayerDetailPanel.tsx
@@ -2,6 +2,7 @@ import { useEffect, useState } from 'react'
 import { Star, X } from 'lucide-react'
 import {
   InjuryTag,
+  Mark,
   MeChip,
   PosChip,
   RookieTag,
@@ -22,7 +23,9 @@ import {
   splitName,
   type ReadTone
 } from '@/lib/playerFileView'
+import { useProductLinks } from '@/lib/productLinks'
 import { cn } from '@/lib/utils'
+import type { PlayerLink } from '@shared/stats/types'
 import type { DetailTarget, PlayerDetail } from '@shared/types'

 interface PlayerDetailPanelProps {
@@ -44,11 +47,13 @@ function Pill({
   on,
   onClick,
   title,
+  disabled,
   children
 }: {
   on?: boolean
   onClick: () => void
   title: string
+  disabled?: boolean
   children: React.ReactNode
 }): React.JSX.Element {
   return (
@@ -56,11 +61,12 @@ function Pill({
       type="button"
       title={title}
       onClick={onClick}
+      disabled={disabled}
       className={cn(
-        'flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full pr-3 pl-2.5 font-cond text-[13px] leading-none font-bold tracking-[0.08em] uppercase',
+        'flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full pr-3 pl-2.5 font-cond text-[13px] leading-none font-bold tracking-[0.08em] uppercase disabled:cursor-default disabled:opacity-40',
         on
           ? 'bg-brand text-on-brand'
-          : 'border border-line text-fg-2 hover:border-ink hover:text-fg'
+          : 'border border-line text-fg-2 hover:border-ink hover:text-fg disabled:hover:border-line disabled:hover:text-fg-2'
       )}
     >
       {children}
@@ -141,6 +147,21 @@ export function PlayerDetailPanel({
   const [watch, setWatch] = useState<{ playerId: string; on: boolean } | null>(null)
   const playerId = player?.playerId ?? null
   const key = playerId === null ? null : `${season}|${playerId}`
+  // Spec §9.4: "Full stats ↗" opens the player (a defense: its team) in Companion Stats.
+  const links = useProductLinks()
+  const [link, setLink] = useState<{ playerId: string; link: PlayerLink | null } | null>(null)
+
+  useEffect(() => {
+    if (playerId === null || links === null) return
+    let cancelled = false
+    void api.stats
+      .link({ sleeper: playerId })
+      .then((l) => !cancelled && setLink({ playerId, link: l }))
+      .catch(() => !cancelled && setLink({ playerId, link: null }))
+    return () => {
+      cancelled = true
+    }
+  }, [playerId, links])

   useEffect(() => {
     if (playerId === null || key === null) return
@@ -172,6 +193,7 @@ export function PlayerDetailPanel({
   const error = failed?.key === key ? failed.message : null
   const row = detail?.row ?? null
   const watched = watch?.playerId === player.playerId ? watch.on : (row?.watched ?? false)
+  const statsLink = link?.playerId === player.playerId ? link.link : null

   async function toggleWatch(): Promise<void> {
     if (player === null) return
@@ -249,6 +271,20 @@ export function PlayerDetailPanel({
               <Star className="size-3.5" fill={watched ? 'currentColor' : 'none'} />
               {watched ? 'Watching' : 'Watch'}
             </Pill>
+            {links && (
+              <Pill
+                onClick={() => statsLink && links.openStats(statsLink)}
+                disabled={!statsLink}
+                title={
+                  statsLink
+                    ? 'Open in Companion Stats'
+                    : 'Not in the stats database: no nflverse id for this player'
+                }
+              >
+                <Mark product="stats" size={14} />
+                Full stats ↗
+              </Pill>
+            )}
             <button
               type="button"
               title="Close (Esc)"
```

```diff
diff --git a/src/renderer/src/App.tsx b/src/renderer/src/App.tsx
index d828756..37ac604 100644
--- a/src/renderer/src/App.tsx
+++ b/src/renderer/src/App.tsx
@@ -1,4 +1,4 @@
-import { useCallback, useEffect, useState } from 'react'
+import { useCallback, useEffect, useMemo, useState } from 'react'
 import { TopNav, type Screen } from '@/components/TopNav'
 import { UpdateDialog } from '@/components/UpdateDialog'
 import { SetupScreen } from '@/screens/SetupScreen'
@@ -8,9 +8,10 @@ import { PlayersScreen } from '@/screens/PlayersScreen'
 import { LineupScreen } from '@/screens/LineupScreen'
 import { TradeScreen } from '@/screens/TradeScreen'
 import { WaiverScreen } from '@/screens/WaiverScreen'
-import { StatsApp } from '@/screens/stats/StatsApp'
+import { StatsApp, type StatsFocus } from '@/screens/stats/StatsApp'
 import type { StatsScope } from '@/lib/stats/scope'
 import { api } from '@/lib/api'
+import { ProductLinksContext, type ProductLinks } from '@/lib/productLinks'
 import { useTheme } from '@/lib/theme'
 import { useUpdateState } from '@/lib/useUpdateState'

@@ -35,6 +36,22 @@ export default function App(): React.JSX.Element {
     setFocus((f) => ({ playerId, nonce: (f?.nonce ?? 0) + 1 }))
     setScreen('players')
   }, [])
+  // Spec §9.4: a player file's "Full stats ↗" opens Stats on his dashboard (a defense: its team).
+  const [statsFocus, setStatsFocus] = useState<StatsFocus | null>(null)
+  const links = useMemo<ProductLinks>(
+    () => ({
+      openStats: (link) => {
+        setStatsFocus((f) => {
+          const nonce = (f?.nonce ?? 0) + 1
+          return link.gsis
+            ? { kind: 'player', id: link.gsis, nonce }
+            : { kind: 'team', team: link.team ?? '', nonce }
+        })
+        setProduct('stats')
+      }
+    }),
+    []
+  )

   useEffect(() => {
     void api.app
@@ -100,6 +117,11 @@ export default function App(): React.JSX.Element {
             if (!hasLeague) setScreen('setup')
             setProduct('fantasy')
           }}
+          focus={statsFocus}
+          onOpenFantasyPlayer={(playerId) => {
+            openPlayer(playerId)
+            setProduct('fantasy')
+          }}
           update={update}
           version={version}
           onOpenUpdate={() => setUpdateOpen(true)}
@@ -113,44 +135,49 @@ export default function App(): React.JSX.Element {
   }

   return (
-    <div className="flex h-full flex-col">
-      <TopNav
-        current={screen}
-        onNavigate={setScreen}
-        hasLeague={hasLeague}
-        update={update}
-        version={version}
-        onOpenUpdate={() => setUpdateOpen(true)}
-        theme={theme}
-        onToggleTheme={toggleTheme}
-        refreshKey={dataVersion}
-        onRefreshed={bumpData}
-        onOpenStats={() => setProduct('stats')}
-      />
-      <main
-        className={
-          FULL_BLEED.includes(screen)
-            ? 'flex min-h-0 flex-1 flex-col'
-            : 'min-h-0 flex-1 overflow-auto px-8 py-6'
-        }
-      >
-        {screen === 'setup' && (
-          <SetupScreen
-            onImported={() => {
-              setHasLeague(true)
-              bumpData()
-            }}
-            onGoLeague={() => setScreen('league')}
-          />
-        )}
-        {screen === 'league' && <LeagueScreen key={dataVersion} onOpenPlayer={openPlayer} />}
-        {screen === 'rules' && <RulesScreen onSaved={bumpData} />}
-        {screen === 'players' && <PlayersScreen dataVersion={dataVersion} focus={focus} />}
-        {screen === 'lineup' && <LineupScreen dataVersion={dataVersion} />}
-        {screen === 'trade' && <TradeScreen dataVersion={dataVersion} />}
-        {screen === 'waivers' && <WaiverScreen dataVersion={dataVersion} />}
-      </main>
-      {updateDialog}
-    </div>
+    <ProductLinksContext.Provider value={links}>
+      <div className="flex h-full flex-col">
+        <TopNav
+          current={screen}
+          onNavigate={setScreen}
+          hasLeague={hasLeague}
+          update={update}
+          version={version}
+          onOpenUpdate={() => setUpdateOpen(true)}
+          theme={theme}
+          onToggleTheme={toggleTheme}
+          refreshKey={dataVersion}
+          onRefreshed={bumpData}
+          onOpenStats={() => {
+            setStatsFocus(null)
+            setProduct('stats')
+          }}
+        />
+        <main
+          className={
+            FULL_BLEED.includes(screen)
+              ? 'flex min-h-0 flex-1 flex-col'
+              : 'min-h-0 flex-1 overflow-auto px-8 py-6'
+          }
+        >
+          {screen === 'setup' && (
+            <SetupScreen
+              onImported={() => {
+                setHasLeague(true)
+                bumpData()
+              }}
+              onGoLeague={() => setScreen('league')}
+            />
+          )}
+          {screen === 'league' && <LeagueScreen key={dataVersion} onOpenPlayer={openPlayer} />}
+          {screen === 'rules' && <RulesScreen onSaved={bumpData} />}
+          {screen === 'players' && <PlayersScreen dataVersion={dataVersion} focus={focus} />}
+          {screen === 'lineup' && <LineupScreen dataVersion={dataVersion} />}
+          {screen === 'trade' && <TradeScreen dataVersion={dataVersion} />}
+          {screen === 'waivers' && <WaiverScreen dataVersion={dataVersion} />}
+        </main>
+        {updateDialog}
+      </div>
+    </ProductLinksContext.Provider>
   )
 }
```

- [ ] **Step 4: Stats to Fantasy, and the projections**

```diff
diff --git a/src/renderer/src/screens/stats/StatsApp.tsx b/src/renderer/src/screens/stats/StatsApp.tsx
index ba7b63b..5211649 100644
--- a/src/renderer/src/screens/stats/StatsApp.tsx
+++ b/src/renderer/src/screens/stats/StatsApp.tsx
@@ -16,6 +16,10 @@ import { StatsTeam } from '@/screens/stats/StatsTeam'
 import type { LeaderboardBoard, PositionGroup, StatsView } from '@shared/stats/types'
 import type { UpdateState } from '@shared/types'

+/** What Fantasy asks Stats to open (spec §9.4); a new nonce opens it again. */
+export type StatsFocus =
+  { kind: 'player'; id: string; nonce: number } | { kind: 'team'; team: string; nonce: number }
+
 interface StatsAppProps {
   hasLeague: boolean
   /** Bumped when league data changed: the rosters are read again. */
@@ -28,6 +32,10 @@ interface StatsAppProps {
   /** The scope chosen this session (spec §18 J), kept by App across product switches; null: the default. */
   scope: StatsScope | null
   onScope: (scope: StatsScope) => void
+  /** A player (or a defense's team) to open, from a Fantasy player file. */
+  focus?: StatsFocus | null
+  /** Opens a player's file in Fantasy, by his Sleeper id (spec §9.4). */
+  onOpenFantasyPlayer?: (playerId: string) => void
 }

 /**
@@ -44,7 +52,9 @@ export function StatsApp({
   onOpenUpdate,
   onToggleTheme,
   scope: chosen,
-  onScope: setChosen
+  onScope: setChosen,
+  focus = null,
+  onOpenFantasyPlayer
 }: StatsAppProps): React.JSX.Element {
   const data = useStatsData(leagueKey)
   const [screen, setScreen] = useState<StatsScreen>('home')
@@ -58,6 +68,18 @@ export function StatsApp({
   // The player dashboard (spec §9.4): the player chosen this session, else my top scorer.
   const [player, setPlayer] = useState<PlayerRef | null>(null)
   const [playerTab, setPlayerTab] = useState<PlayerTab>('overview')
+  // A focus from Fantasy opens its dashboard once.
+  const [focused, setFocused] = useState<number | null>(null)
+  if (focus && focus.nonce !== focused) {
+    setFocused(focus.nonce)
+    if (focus.kind === 'player') {
+      setPlayer({ id: focus.id, position: null })
+      setScreen('player')
+    } else {
+      setTeam(focus.team)
+      setScreen('team')
+    }
+  }

   useEffect(() => {
     void api.stats
@@ -219,6 +241,8 @@ export function StatsApp({
                   tab={playerTab}
                   onTab={setPlayerTab}
                   onOpenTeam={openTeam}
+                  leagueKey={leagueKey}
+                  onOpenFantasyPlayer={onOpenFantasyPlayer}
                   onOpenLeaderboard={(position) =>
                     openBoard(defaultBoard('player', position, data.byId), shownPlayer.id)
                   }
```

```diff
diff --git a/src/renderer/src/screens/stats/StatsPlayer.tsx b/src/renderer/src/screens/stats/StatsPlayer.tsx
index 4ef2217..001c9e9 100644
--- a/src/renderer/src/screens/stats/StatsPlayer.tsx
+++ b/src/renderer/src/screens/stats/StatsPlayer.tsx
@@ -1,4 +1,6 @@
 import { useMemo, useState } from 'react'
+import { ArrowUpRight } from 'lucide-react'
+import { Mark } from '@/components/edition'
 import { StatsSelect } from '@/components/stats/controls'
 import { ReliabilityMarker } from '@/components/stats/MetricCard'
 import { Headshot, HeatCell, Loading, MiniTable, SectionHead } from '@/components/stats/parts'
@@ -18,6 +20,7 @@ import {
   fantasyRankQuery,
   gameLog,
   gameLogQuery,
+  inFantasy,
   kindOf,
   lineHead,
   lineRow,
@@ -38,6 +41,7 @@ import {
   positionGroup,
   positionTab,
   profileQuery,
+  projectionView,
   railQuery,
   railRows,
   sectionsFor,
@@ -59,7 +63,9 @@ import {
 import { rangeLabel, type StatsScope } from '@/lib/stats/scope'
 import { chartWeeks, weekSeries } from '@/lib/stats/team'
 import {
+  useFantasyDetail,
   usePlayerBio,
+  usePlayerLink,
   usePlayerOutlook,
   useSeasonGames,
   useStatsQueries,
@@ -86,6 +92,8 @@ interface TabProps {
   player: string
   position: PositionGroup
   bio: PlayerBio | null
+  /** The league's key with a league (Fantasy's projections), null without one. */
+  league: number | null
 }

 /** The player shown: his gsis id and the position group his dashboard follows. */
@@ -108,7 +116,9 @@ export function StatsPlayer({
   tab,
   onTab,
   onOpenTeam,
-  onOpenLeaderboard
+  onOpenLeaderboard,
+  leagueKey = 0,
+  onOpenFantasyPlayer
 }: {
   data: StatsData
   scope: StatsScope
@@ -121,6 +131,10 @@ export function StatsPlayer({
   onOpenTeam: (team: string) => void
   /** The player leaderboard at his position (spec §9.2). */
   onOpenLeaderboard: (position: PositionGroup) => void
+  /** Bumped when league data changed: the link to Fantasy is read again. */
+  leagueKey?: number
+  /** His file in Companion Fantasy (spec §9.4), with a league. */
+  onOpenFantasyPlayer?: (playerId: string) => void
 }): React.JSX.Element {
   const { bio, error: bioError } = usePlayerBio(player.id, data.version)
   const position: PositionGroup | null =
@@ -202,6 +216,8 @@ export function StatsPlayer({
               qualified={row ? qualifies(row, positionTab(position)) : true}
               rank={position ? fantasyRank(fr, player.id, position, scope) : null}
               onOpenTeam={onOpenTeam}
+              leagueKey={leagueKey}
+              onOpenFantasyPlayer={onOpenFantasyPlayer}
             />
             <div className="flex items-end justify-between gap-4 border-b border-line">
               <div role="tablist" aria-label="Player dashboard" className="flex gap-[22px]">
@@ -244,6 +260,7 @@ export function StatsPlayer({
               player={player.id}
               position={position}
               bio={bio}
+              league={hasLeague ? leagueKey : null}
             />
           </div>
         )}
@@ -280,7 +297,9 @@ function Header({
   row,
   qualified,
   rank,
-  onOpenTeam
+  onOpenTeam,
+  leagueKey,
+  onOpenFantasyPlayer
 }: {
   data: StatsData
   scope: StatsScope
@@ -292,9 +311,15 @@ function Header({
   qualified: boolean
   rank: string | null
   onOpenTeam: (team: string) => void
+  leagueKey: number
+  onOpenFantasyPlayer?: (playerId: string) => void
 }): React.JSX.Element {
   const h = playerHeader(bio, row, scope, data.status)
   const team = row?.team ?? bio.team
+  const fantasy =
+    hasLeague && onOpenFantasyPlayer && inFantasy(position) ? onOpenFantasyPlayer : null
+  const link = usePlayerLink(fantasy ? bio.id : null, leagueKey)
+  const owner = data.ownership?.players[bio.id] ?? null
   return (
     <header className="flex items-end justify-between gap-6">
       <div className="flex min-w-0 items-end gap-4">
@@ -366,6 +391,23 @@ function Header({
           >
             Compare
           </button>
+          {fantasy && (
+            <button
+              type="button"
+              disabled={!link}
+              onClick={() => link && fantasy(link.sleeper)}
+              title={link ? 'Open in Companion Fantasy' : 'Not in your league’s player list'}
+              className="flex h-8 cursor-pointer items-center gap-2 rounded-[8px] px-3 text-[12.5px] font-medium text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover hover:text-fg disabled:cursor-default disabled:opacity-50"
+            >
+              <Mark size={14} />
+              {owner?.mine
+                ? 'On your fantasy team'
+                : owner
+                  ? `Rostered by ${owner.name}`
+                  : 'Free agent in your league'}
+              <ArrowUpRight className="size-[13px]" />
+            </button>
+          )}
         </div>
       </div>
     </header>
@@ -719,7 +761,7 @@ function Teammate({
   position,
   team,
   head
-}: Omit<TabProps, 'bio'> & { team: string; head: string[] }): React.JSX.Element | null {
+}: Omit<TabProps, 'bio' | 'league'> & { team: string; head: string[] }): React.JSX.Element | null {
   const mq = useMemo(
     () => teammatesQuery(team, position, scope, data.status),
     [team, position, scope, data.status]
@@ -790,7 +832,7 @@ function Teammate({
 }

 /** Spec §9.4 Forecast: the next matchup, the range of outcomes, trend, regression, schedule, profile. */
-function Forecast({ data, scope, player, position, bio }: TabProps): React.JSX.Element {
+function Forecast({ data, scope, player, position, bio, league }: TabProps): React.JSX.Element {
   const oq = useMemo(
     () => ({ player, season: scope.season, scoring: scope.scoring }),
     [player, scope.season, scope.scoring]
@@ -847,6 +889,13 @@ function Forecast({ data, scope, player, position, bio }: TabProps): React.JSX.E
             </p>
           )}
         </section>
+        <Projections
+          data={data}
+          scope={scope}
+          player={player}
+          position={position}
+          league={league}
+        />
         <section className="flex flex-col gap-2.5">
           <SectionHead
             title="Range of outcomes"
@@ -968,6 +1017,70 @@ function Forecast({ data, scope, player, position, bio }: TabProps): React.JSX.E
   )
 }

+/**
+ * Spec §9.4 Forecast, with a league: Sleeper's projection of the next game, the rest of the season
+ * and its rank, FantasyPros' rank, from the Fantasy side (its scoring: the league's).
+ */
+function Projections({
+  data,
+  scope,
+  player,
+  position,
+  league
+}: Omit<TabProps, 'bio'>): React.JSX.Element {
+  const current = scope.season === data.status?.through?.season
+  const link = usePlayerLink(league !== null && current ? player : null, league)
+  const { detail, error } = useFantasyDetail(
+    link ? scope.season : null,
+    link?.sleeper ?? null,
+    league ?? 0
+  )
+  const v = detail ? projectionView(detail, position) : null
+  const note =
+    league === null
+      ? 'Import a league for Sleeper’s projection and FantasyPros’ rank.'
+      : !current
+        ? `Projections are for the ${data.status?.through?.season ?? 'current'} season.`
+        : link === null
+          ? 'Not in your league’s player list.'
+          : error
+  const rows: [string, string][] = v
+    ? [
+        [
+          'Next game (Sleeper)',
+          v.next
+            ? `${v.next.points} pts · week ${v.next.week}${v.next.opponent ? ` vs ${v.next.opponent}` : ''}`
+            : '—'
+        ],
+        ['Rest of season', `${v.ros} pts${v.rosRank ? ` · ${v.rosRank}` : ''}`],
+        ['FantasyPros rank', v.experts ?? '—']
+      ]
+    : []
+  return (
+    <section className="flex flex-col gap-2.5">
+      <SectionHead
+        title="Projections"
+        note={league === null ? undefined : 'Your league’s scoring'}
+      />
+      {note ? (
+        <p className="m-0 text-[12.5px] text-fg-3">{note}</p>
+      ) : (
+        <div className="flex flex-col border-b border-line-2">
+          {rows.map(([k, val]) => (
+            <div
+              key={k}
+              className="flex h-[34px] items-center justify-between gap-3 border-t border-line-2 text-[12.5px]"
+            >
+              <span className="text-fg-2">{k}</span>
+              <span className="font-mono font-medium">{val}</span>
+            </div>
+          ))}
+        </div>
+      )}
+    </section>
+  )
+}
+
 /** Spec §9.4 Profile: bio, combine with position percentiles, athletic score, career by season. */
 function Profile({ data, scope, position, bio }: TabProps): React.JSX.Element {
   const kind = kindOf(position)
```

```diff
diff --git a/src/renderer/src/lib/stats/player.ts b/src/renderer/src/lib/stats/player.ts
index cf3d709..a712a21 100644
--- a/src/renderer/src/lib/stats/player.ts
+++ b/src/renderer/src/lib/stats/player.ts
@@ -96,6 +96,11 @@ const FANTASY: PlayerKind[] = ['QB', 'RB', 'REC', 'K']
 /** Expected points, the Forecast and its outlook: offense only. */
 const OFFENSE: PlayerKind[] = ['QB', 'RB', 'REC']

+/** A position the fantasy side scores (spec §13: no IDP), so a player there has a Fantasy file. */
+export function inFantasy(position: PositionGroup | null): boolean {
+  return FANTASY.includes(kindOf(position))
+}
+
 export type PlayerTab =
   | 'overview'
   | 'passing'
```

- [ ] **Step 5: Run the tests**

```bash
npx vitest run tests/renderer/components/PlayerDetailPanel.test.tsx tests/renderer/components/App.test.tsx tests/renderer/components/StatsPlayer.test.tsx
```

Expected: PASS (21 passed). Then `npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run`: clean; 1025 passed | 5 skipped.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/renderer/src/App.tsx src/renderer/src/components/PlayerDetailPanel.tsx src/renderer/src/lib/productLinks.ts src/renderer/src/lib/stats/player.ts src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/screens/stats/StatsPlayer.tsx tests/renderer/components/App.test.tsx tests/renderer/components/PlayerDetailPanel.test.tsx tests/renderer/components/StatsPlayer.test.tsx
git add src/renderer/src/App.tsx src/renderer/src/components/PlayerDetailPanel.tsx src/renderer/src/lib/productLinks.ts src/renderer/src/lib/stats/player.ts src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/screens/stats/StatsPlayer.tsx tests/renderer/components/App.test.tsx tests/renderer/components/PlayerDetailPanel.test.tsx tests/renderer/components/StatsPlayer.test.tsx
git commit -m "feat(app): open players across the two products"
```

---

### Task 6: Docs

**Files:**

- Modify: `docs/reference/stats-database.md`, `docs/reference/stats-screens.md`, `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`

- [ ] **Step 1: The data reference**

````diff
diff --git a/docs/reference/stats-database.md b/docs/reference/stats-database.md
index b5249c8..3bf14af 100644
--- a/docs/reference/stats-database.md
+++ b/docs/reference/stats-database.md
@@ -8,8 +8,8 @@ v0.27.0 (Plan Z; spec §8, amended in §17) adds the models: team Elo and the se

 ## Engine

-- One worker thread (`out/main/statsWorker.js`, `src/main/stats/worker.ts`) owns the file. The main process talks to it through `StatsClient` (`src/main/stats/client.ts`): `refresh`, `setLeague`, `query`, `catalogue`, `status`, `games`, `outlook`, `selfTest`, `close`.
-- Writes (`refresh`, `setLeague`, `selfTest`, `close`) run one after another. Reads (`query`, `catalogue`, `status`, `games`, `outlook`) run at once, each on its own connection, so a screen never waits behind a refresh or another read. During a rebuild DuckDB runs on one thread, reads included; during a forced refresh, queries took 16 ms (median) and under 0.1 s at most. Closing refuses new reads and waits for the running ones.
+- One worker thread (`out/main/statsWorker.js`, `src/main/stats/worker.ts`) owns the file. The main process talks to it through `StatsClient` (`src/main/stats/client.ts`): `refresh`, `setLeague`, `query`, `catalogue`, `status`, `games`, `outlook`, `player`, `selfTest`, `close`.
+- Writes (`refresh`, `setLeague`, `selfTest`, `close`) run one after another. Reads (`query`, `catalogue`, `status`, `games`, `outlook`, `player`) run at once, each on its own connection, so a screen never waits behind a refresh or another read. During a rebuild DuckDB runs on one thread, reads included; during a forced refresh, queries took 16 ms (median) and under 0.1 s at most. Closing refuses new reads and waits for the running ones.
 - DuckDB `@duckdb/node-api` 1.5.6. Its native binding loads from `app.asar.unpacked` (`asarUnpack` in `electron-builder.yml`). Parquet, JSON and ICU are built in, and no extension is ever downloaded.
 - Settings: `memory_limit` 512 MB, 2 threads, `preserve_insertion_order` off, spill files in `<userData>/stats-tmp/duckdb`. The backfill peaks around 1.8–2.2 GB of process memory, and a forced daily refresh around 0.8 GB.
 - `FantasyCompanion.exe --stats-self-test=<file>` opens a throwaway database in the worker, writes, reads and round-trips Parquet. It checks `read_json` and an ICU time zone, answers an engine query over a throwaway schema, writes `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true,"json":true,"icu":true,"query":true}` to `<file>` and exits 0. The Release and Package check workflows run it on the Windows build.
@@ -154,7 +154,7 @@ Built by `src/main/stats/models/` (spec §8, amended in §17), after the derived
 - **Adjusted EPA**: a ridge regression (300 plays of prior per team effect) of EPA per play on offense, defense and home field, garbage time left out, as of every week; the recency-weighted version halves a game's weight every four weeks.
 - **FG model**: logistic regression on distance (a knot every 5 yards), indoors, cold, wind, wind × distance and grass, fitted on every attempt before the current season, recent seasons weighted more. Coefficients in `stats_settings` (`fg_model`).
 - **Stability**: per metric, within each position and pooled; measured on 2019 to the prior season whenever a past season changes (about 20 s).
-- **The `outlook` read** (player): ceiling and floor, boom and bust rates, usage trend (last four games against the games before), regression flags, and the remaining schedule. **The `games` read**: a season's games with Elo and the market.
+- **The `outlook` read** (player): ceiling and floor, boom and bust rates, usage trend (last four games against the games before), regression flags, and the remaining schedule. **The `games` read**: a season's games with Elo and the market. **The `player` read** (v0.30.0): a player's identity (`players`), his team and number on his latest roster week, the seasons he played, and his status now: the reserve list on the latest roster week of the latest season (`src_rosters` `status` RES with `status_description_abbr` R01 / R48 injured reserve, R04 PUP, R05 non-football injury, R40 suspended, else "Reserve") or the latest week's injury report (`src_injuries`: game status, practice, the injury).

 ```sql
 -- Playoff odds now, with Elo and adjusted EPA margin
@@ -168,8 +168,9 @@ ORDER BY sb DESC LIMIT 10;
 ## Metric catalogue and query engine

 - **Catalogue** (`src/shared/stats/catalogue.ts`): 324 metrics, 204 for players and 120 for teams. Each has a formula over component sums (`{targets} / nullif({tm_targets}, 0)`), model states at the end of the scope (`{last:elo}`) or weekly quantiles (`{p80:fp}`), its sample component and minimum, unit, direction, tier (`core` 116, `extended` 176, `stored` 32), family, sources and coverage. 163 can be split by situation. The catalogue the renderer reads carries each metric's stability.
+- **A played week without a team.** 69 of 190,218 played player-weeks (0.04 %, 2019–2026 week 6) have no `team` in `player_week` (Eddy Pineiro, 2025 week 1): his sources for that week did not name one. The player dashboard's game log takes the team of his nearest game.
 - **Missing counts.** At the week and season grains, a play-by-play or box-score component a player never had (carries for a receiver) sums as 0. FTN, participation, NGS, PFR and QBR components stay NULL when missing: there, NULL means "not measured".
-- **Query** (`StatsQuery`, `src/shared/stats/types.ts`; JSON Schema in `src/shared/stats/querySchema.ts`): entity, metrics, scope, situation (down, distance, quarter, field zone, score margin, win probability, neutral, two-minute — the last two minutes of the 2nd and 4th quarters, since v0.29.0 — and the participation and charting filters), groupBy, transform (`raw`, `perGame`, `percentile`, `zScore`, `vsLeague`, `shrunk`, `opponentAdjusted`), sort, limit, scoring. The engine (`src/main/stats/engine/`) validates it, compiles it to parameterised SQL over the season tables, the weekly tables or the plays, and runs it for 5 s at most.
+- **Query** (`StatsQuery`, `src/shared/stats/types.ts`; JSON Schema in `src/shared/stats/querySchema.ts`): entity, metrics, scope, situation (down, distance, quarter, field zone, score margin, win probability, neutral, two-minute — the last two minutes of the 2nd and 4th quarters, since v0.29.0 — and the participation and charting filters), home or road games (`scope.home`, since v0.30.0: the weekly tables' `home`, a play's game in `games`; qualification counts half the weeks), `situation.withoutOnField` counting only plays participation lists (since v0.30.0: a play it does not cover is not one a player sat out), groupBy, transform (`raw`, `perGame`, `percentile`, `zScore`, `vsLeague`, `shrunk`, `opponentAdjusted`), sort, limit, scoring. The engine (`src/main/stats/engine/`) validates it, compiles it to parameterised SQL over the season tables, the weekly tables or the plays, and runs it for 5 s at most.
 - **Results** carry, per metric, the value (after the transform), the raw value, the sample, `qualified`, the percentile and rank among qualified rows of the same position and group, and `estimated`. Notes state the coverage the answer depends on.
 - **Qualification.** `minSample` is per 17 games, scaled to the weeks a row covers (about one game per opponent row) and, at the play grain, to the share of plays each row keeps (its situation and play-dimension group, among its teams' plays when the query filters teams or players on the field).
 - **Transforms.** `shrunk` pulls a rate toward the qualified rows' sample-weighted mean by its stability prior: (s·v + k·μ) / (s + k). `opponentAdjusted` subtracts the sample-weighted average of how much more than the league each opponent allowed in the same metric and position (weekly rows; rates only, since a total is not comparable with the league total). A metric a transform does not apply to is returned raw, with a note.
````

- [ ] **Step 2: The screens reference**

```diff
diff --git a/docs/reference/stats-screens.md b/docs/reference/stats-screens.md
index bf69b2f..0a786d8 100644
--- a/docs/reference/stats-screens.md
+++ b/docs/reference/stats-screens.md
@@ -1,16 +1,16 @@
 # Stats screens — reference

-Added in v0.28.0 (Plan AA; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.1–§9.2, amended in §18); the team dashboard in v0.29.0 (Plan AB; §9.3, amended in §19). Companion Stats is the app's second product: its own shell and cobalt palette (design handoff 2026-10-16, "Companion Stats"), reachable from the Fantasy nav ("Stats ↗"), and where the app opens when no league is imported. Every number comes from the query engine (`stats.query`, data reference: `docs/reference/stats-database.md`).
+Added in v0.28.0 (Plan AA; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.1–§9.2, amended in §18); the team dashboard in v0.29.0 (Plan AB; §9.3, amended in §19); the player dashboard in v0.30.0 (Plan AC; §9.4, amended in §21). Companion Stats is the app's second product: its own shell and cobalt palette (design handoff 2026-10-16, "Companion Stats"), reachable from the Fantasy nav ("Stats ↗"), and where the app opens when no league is imported. Every number comes from the query engine (`stats.query`, data reference: `docs/reference/stats-database.md`).

 ## Shell

-- **Nav:** Leaderboards · Players · Teams (the team dashboard) · Games (later) · Glossary; "Data through 2026 week 6 · updated 2 h ago" from `stats.status()` ("updating…" while a refresh runs); "Fantasy ↗" (Setup without a league); the theme toggle.
+- **Nav:** Leaderboards · Players (the player dashboard) · Teams (the team dashboard) · Games (later) · Glossary; "Data through 2026 week 6 · updated 2 h ago" from `stats.status()` ("updating…" while a refresh runs); "Fantasy ↗" (Setup without a league); the theme toggle.
 - **Scope** (every screen, kept for the session): season (2019 → latest), Regular season / Postseason / Both, the regular season's week range, and the fantasy scoring (My league once a league is imported, else PPR, Half PPR, Standard).
 - A finished rebuild (`stats:changed`) re-reads the status and the catalogue and runs every query on screen again.

 ## Leaderboards (home)

-Eight boards, the top six of each: QB passing yards and yards per attempt, RB rushing yards and touches, WR receiving yards and target share, TE receiving yards, team takeaways (`def_turnovers`). A row needs the metric's own qualification and half the regular-season games in range (one in the postseason). Totals or per game. With a league, "My players" marks my players with an amber dot and adds my best one under a dashed line when he ranks outside the top six. "All →" or a row opens the full leaderboard sorted by that metric (the row selected). Saved views are listed above the boards.
+Eight boards, the top six of each: QB passing yards and yards per attempt, RB rushing yards and touches, WR receiving yards and target share, TE receiving yards, team takeaways (`def_turnovers`). A row needs the metric's own qualification and half the regular-season games in range (one in the postseason). Totals or per game. With a league, "My players" marks my players with an amber dot and adds my best one under a dashed line when he ranks outside the top six. "All →" opens the full leaderboard sorted by that metric; a row opens that player's (or team's) dashboard. Saved views are listed above the boards.

 ## Players and Teams

@@ -28,6 +28,7 @@ The Ledger table: one tab per position group (All offense, QB, RB, WR, TE, K, P,
 | Owner mark       | With a league: amber dot for my players (my defense), a hollow ring for another team's, its name on hover                                                                                                                                                                                                                                                       |

 - **A team row** (on the team leaderboard, or a home board's) opens that team's dashboard. The team leaderboard is under the dashboard's "Team leaderboards →" and the home's "All →".
+- **A player row** (on a player leaderboard, a home board, or a team dashboard's tables) opens that player's dashboard. The player leaderboards are under the dashboard's "Player leaderboards →" (at his position, his row selected) and the home's "All →".
 - **Filters:** Totals / Per game, Qualified only, team (players), with a league All / My team / Free agents, search by name. Ownership and search filter the engine's rows, so percentiles stay among the whole position.
 - **Columns:** "Columns: this tab" or one family's core metrics on the tab (Traditional, Advanced, Next Gen, Charting, Predictive; extended ones fill in to 12); the column picker adds any core or extended metric of the tab (at most 40) or removes one; Reset.
 - **Sort:** a column head (best first, then the other way), or the name. The engine sorts; the table shows 50 rows at a time.
@@ -55,14 +56,40 @@ Teams in the nav opens it on the team viewed last; the first time, on the team o

 Charts: one line per series (cobalt, teal; colour-blind safe in both themes), gaps for byes, end labels, and a hover that lists every series that week.

+## Player dashboard
+
+Players in the nav opens it on the player viewed last; the first time, on my top fantasy scorer in range (with a league, once the rosters have loaded), else the leading WR by receiving yards. A Fantasy player file's "Full stats ↗" opens it too (a team defense opens its team dashboard).
+
+- **Rail** (handoff "6. Player profile"): the nine positions (QB, RB, WR, TE, K, P, DL, LB, DB), a search, a rank-by metric (the position leaderboard's columns), and the players the position's leaderboard qualifies, best first, the value in a chip shaded by its percentile. The player shown stays listed below the qualifier ("NQ"). ↑ / ↓ or J / K move the selection; picking a position opens its leader; 25 rows, then "Show 25 more".
+- **Header** (every tab): Sleeper's headshot (initials when it does not load), the position chip, the team (opens its dashboard), games in range, "Not qualified", the status tag, the fantasy rank under the scoring ("WR4 in PPR", fantasy positions); the name he goes by (first, then last); number, his age that season, season of his career, draft, college, size; the scope bar; Compare (Plan AD); with a league and a fantasy position, the owner chip ("On your fantasy team", "Rostered by …", "Free agent in your league") that opens his Fantasy file.
+- **Status tag:** the latest roster week's reserve list (IR, PUP, NFI, SUS, RES) or the latest week's injury report (OUT, D, Q; DNP or LP in practice before a game status), the latest season only. Hover: the status, the injury and the week.
+- **Stat lines** (as the team dashboard's): value, percentile pill and rank among his position's players the leaderboard qualifies who also meet the metric's own sample ("4th of 110"), the qualified players' mean ("Lg"). Below the qualifier, values without ranks. An empty line says why: "Not published for 2026 yet.", "Charted from 2022.", "No plays in this split.", "No NFL Next Gen Stats value for him." (NGS and ESPN QBR publish players over their own minimums).
+
+| Position group | Tabs                                                                                   |
+| -------------- | -------------------------------------------------------------------------------------- |
+| QB             | Overview · Passing · Under pressure · Rushing · Game log · Splits · Forecast · Profile |
+| RB             | Overview · Usage · Rushing · Receiving · Game log · Splits · Forecast · Profile        |
+| WR, TE         | Overview · Usage · Receiving · vs Coverage · Game log · Splits · Forecast · Profile    |
+| K, P           | Overview · Kicking (Punting) · Game log · Profile                                      |
+| DL, LB, DB     | Overview · Pass rush · Coverage · Run defense & tackling · Game log · Splits · Profile |
+
+| Tab                                                                                                                            | Shows                                                                                                                                                                                                                                                                                                                                                             |
+| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
+| Overview                                                                                                                       | The handoff's four tiles (value, percentile chip), the percentile rankings (6–8 core metrics), fantasy points by week against expected points, the season and career lines (regular seasons since 2019)                                                                                                                                                           |
+| Passing, Under pressure, Rushing, Usage, Receiving, vs Coverage, Kicking, Punting, Pass rush, Coverage, Run defense & tackling | Stat lines in sections; Under pressure and vs Coverage add play splits (pressured and clean, blitzed and not, man and zone) ranked among the position in the same split                                                                                                                                                                                           |
+| Game log                                                                                                                       | A row per week of the range: opponent (@ on the road), result from his team's side, the position's columns, fantasy and expected points; a bye or "Did not play" for the team he played for nearest that week; postseason rounds                                                                                                                                  |
+| Splits                                                                                                                         | Games (all, home, away, last 4), quarter, score (leading by 9+, within 8, trailing by 9+), down and red zone, and pressure, blitz and play action (QB) or man and zone (WR, TE): his plays, then each metric shaded and ranked among his position in that split; by opponent; with and without a teammate on the field                                            |
+| Forecast                                                                                                                       | The next game and its defense against the position (among the 32, a stingy one in red); with a league and this season, Sleeper's projection, the rest of the season and its rank, FantasyPros' rank; the range of outcomes (ceiling, floor, boom, bust), role (last 4 against before), running hot or cold, the schedule from here, the core rates raw and shrunk |
+| Profile                                                                                                                        | Bio (born, size, college, draft, rookie season, team now), the combine with percentiles among his position since 2000, the athletic score (RAS-style) and Speed Score, career by season and in all                                                                                                                                                                |
+
 ## Glossary

 Every core and extended metric, players or teams, by family or search, with the same entry as the column hover.

 ## IPC

-`stats.games({ season, team })` for the dashboard's header, next game and schedule; `stats.ownership()` (the league's rosters keyed by gsis id and nflverse team code, from `player_ids`), `stats.views()`, `stats.saveView(name, board)`, `stats.deleteView(id)`, `stats.exportCsv(fileName, csv)`; and Plan Y's `stats.query`, `stats.catalogue`, `stats.status`, `stats.onChanged`.
+`stats.games({ season, team })` for the dashboard's header, next game and schedule (`{ season }` for a player's log); `stats.player({ player })` for a player's bio and status; `stats.outlook({ player, season, scoring })` for his Forecast; `stats.link({ sleeper } | { gsis })` (the same player in both products, from `player_ids`); `stats.ownership()` (the league's rosters keyed by gsis id and nflverse team code, from `player_ids`), `stats.views()`, `stats.saveView(name, board)`, `stats.deleteView(id)`, `stats.exportCsv(fileName, csv)`; and Plan Y's `stats.query`, `stats.catalogue`, `stats.status`, `stats.onChanged`.

 ## Speed

-Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms. The team dashboard: Teams 140 ms from click to the Overview, a tab 65–150 ms, Situational (eleven queries) 275 ms.
+Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms. The team dashboard: Teams 140 ms from click to the Overview, a tab 65–150 ms, Situational (eleven queries) 275 ms. The player dashboard: Players 230–290 ms from click to the Overview, a tab 70–135 ms, Splits 265–480 ms, a rail position 135–275 ms.
```

- [ ] **Step 3: The spec: §21 and the status line**

```diff
diff --git a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
index ea7c398..d129051 100644
--- a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
+++ b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
@@ -1,6 +1,6 @@
 # Stats analysis — design

-**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X), 2026-10-17 (§16: Plan Y), 2026-10-18 (§17: Plan Z), 2026-10-20 (§18: Plan AA) and 2026-10-20 (§19: Plan AB) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.
+**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X), 2026-10-17 (§16: Plan Y), 2026-10-18 (§17: Plan Z), 2026-10-20 (§18: Plan AA), 2026-10-20 (§19: Plan AB), 2026-10-21 (§20: paired sums) and 2026-10-21 (§21: Plan AC) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.

 **Sources:** the stats catalog (`docs/research/2026-10-09-nfl-stats-catalog.md`), the predictive-metrics catalogue (`docs/research/nfl_predictive_metrics.md`), the coverage audit (`docs/research/2026-10-14-warehouse-coverage-audit.md`), and a DuckDB vs SQLite benchmark on 2023–2025 play-by-play and participation (§3.2).

@@ -567,3 +567,20 @@ Found while checking Plans AA and AB on live data. Sources are published at diff
 - At the play grain, a target pairs with routes when participation lists the play's players.
 - Broken tackles per touch counts a missing PFR side as 0: it was blank for the receivers without a PFR rushing row (52 of 112 qualifying 2025 WRs).
 - `DERIVED_VERSION` 2: the first refresh after the update rebuilds the derived tables and the models (about 50 s), then measures stability again.
+
+## 21. Amendment 2026-10-21: the player dashboard (Plan AC)
+
+Decided with the user and measured on the live database while Plan AC was written (its Planning findings), and taken into the build. `docs/reference/stats-screens.md` documents the result.
+
+- **A. The handoff's player profile is the dashboard's frame (§9.4, §9.6).** A rail (the nine positions, a search, a rank-by metric, the qualified players best first with the value shaded by percentile; ↑ / ↓ or J / K) beside the profile: a header with Sleeper's headshot (initials when it does not load), the handoff's tiles and percentile rankings opening the Overview, then the spec's tabs by position group.
+  - Players in the nav opens it on the player viewed last; the first time, on my top fantasy scorer in range, else the leading WR. With a league, the default waits for the rosters (the team dashboard's too: no flash of the first team). Picking a position in the rail opens its leader.
+  - The player leaderboards are under "Player leaderboards →" and the home's "All →". A player row there, on a home board or in a team dashboard's tables opens the dashboard.
+  - The name is the one he goes by (nflverse's `first_name` is the legal one: John for Matthew Stafford). His age is his age that season.
+- **B. Ranks are among the position.** Each line asks for every player at his position and ranks him among those his position's leaderboard qualifies (§18 D) who also meet the metric's own sample, "4th of 110"; ties as §19 B. Below the qualifier, values without ranks. "Lg" is the qualified players' mean.
+- **C. Splits (§9.4, §7.1).** The engine gains `scope.home` (home or road games; qualification counts half the weeks). The Splits tab: all, home, away, last 4 games, each quarter and down (one grouped query each), red zone and score state, then pressured and clean pocket, blitzed or not and play action (QB) or man and zone (WR, TE); each cell ranked among the position's qualified players in the same split. Then his rows by opponent, and with and without a teammate on the field (participation; receivers and backs first in the list, a lineman on for every snap leaves "without" empty). `situation.withoutOnField` now counts only plays participation lists: before, every play of the current season (no participation yet) counted as one without him.
+- **D. The game log** reads his weekly rows with their opponent and each result from the side of the team he played for that week. A week without his row is a bye, or "Did not play", for the team he played for nearest that week. 69 of 190,218 played player-weeks (0.04 %) have no team in `player_week`; the log takes the team of his nearest game.
+- **E. Forecast (offense).** The next game and its defense against the position, ranked among the 32 with the handoff's matchup tone (a stingy defense reads red). With a league and in the current season, Fantasy's file gives Sleeper's projection of the next game, the rest of the season and its rank, and FantasyPros' rank (the league's scoring); without one, a line says a league adds them. Then §8.5: the range of outcomes, role (the last 4 games against the games before), running hot or cold, the schedule from here, and the core rates raw and shrunk (the stability-weighted profile).
+- **F. The status now** comes from a new read, `stats.player`: the latest roster week's reserve list (`src_rosters` R01 / R48 injured reserve, R04 PUP, R05 non-football injury, R40 suspended, another RES "Reserve") or the latest week's injury report (Out, Doubtful, Questionable; a missed or limited practice before a game status). The latest season only. Fantasy's Sleeper injury status is not used: Stats works without a league.
+- **G. The two products link (§9.4).** The player file gains the handoff's "Full stats ↗" (a team defense opens its team dashboard). The dashboard gains the handoff's owner chip ("On your fantasy team", "Rostered by …", "Free agent in your league"), which opens his Fantasy file, for QB, RB, WR, TE and K only (no IDP in Fantasy, §13). The ids map through the league's `player_ids` (`stats.link`).
+- **H. What the data cannot give.** A line a source left a player out of says so ("No NFL Next Gen Stats value for him.": NGS and ESPN QBR publish players over their own minimums); a split whose source has nothing for the season says "Not published for 2026 yet." or "Charted from 2022.". Compare stays disabled until Plan AD. Counts are totals (no per-game switch on the dashboard).
+- **I. Measured** (2026 week 6): each tab's queries 21–137 ms, Splits (10–16 queries) 181–342 ms, Forecast 197–252 ms with the outlook; in the app, Players 230–290 ms from click to the Overview, a tab 70–135 ms, Splits 265–480 ms, a rail position 135–275 ms (budgets 300 ms, and 1 s for situational queries, §11).
```

- [ ] **Step 4: Commit**

```bash
npx prettier --write docs/reference/stats-database.md docs/reference/stats-screens.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git add docs/reference/stats-database.md docs/reference/stats-screens.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git commit -m "docs(stats): document the player dashboard"
```

---

### Task 7: Live checks

**Files:**

- Throwaway (never committed): `tests/zz-ac-live.test.ts`
- Outside the repo: `~/project/ffc-proto-ac-live/` (the database copy, scratch profiles, the driver and its screenshots)

The live check reads a copy of a full live database, `~/project/ffc-proto-ac-live/base.duckdb` (2026 week 6, built for this plan), offline. If it is gone, build one first: run the built app once on an empty scratch profile (`--user-data-dir`). It backfills in about 5 minutes; copy its `stats.duckdb`. If a step fails to download (`stats:pbp:2021 error fetch failed`), it is not retried within a day: delete that step's `sync_log` row in the copy and refresh again.

The walk-through also copies the dev profile's `companion.db` (`~/.config/FantasyCompanion/companion.db`), so the scratch app has the dev league. The dev profile itself is only read.

- [ ] **Step 1: The database copy**

```bash
mkdir -p ~/project/ffc-proto-ac-live/tmp && cp ~/project/ffc-proto-ac-live/base.duckdb ~/project/ffc-proto-ac-live/work.duckdb
```

- [ ] **Step 2: The dashboard's queries on live data**

Create `tests/zz-ac-live.test.ts`:

```ts
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { openStatsService } from '@main/stats/service'
import { qualifies } from '@/lib/stats/leaderboard'
import {
  careerQuery,
  gameLog,
  gameLogQuery,
  kindOf,
  LINE_METRICS,
  opponentDefenseQuery,
  opponentQuery,
  overviewSections,
  playerQuery,
  playerSectionQueries,
  playerSectionViews,
  playerTabs,
  pointsSeries,
  positionTab,
  profileQuery,
  RAIL_POSITIONS,
  railQuery,
  railRows,
  sectionsFor,
  shrunkQuery,
  splitTable,
  splitTableQueries,
  teammatesQuery,
  TILES,
  type PlayerTab
} from '@/lib/stats/player'
import { defaultScope, type StatsScope } from '@/lib/stats/scope'
import type {
  MetricInfo,
  PlayerBio,
  PositionGroup,
  StatsQuery,
  StatsResult
} from '@shared/stats/types'

// Plan AC Task 7: the player dashboard's queries on the live database. Throwaway, never committed.
const LIVE = join(homedir(), 'project', 'ffc-proto-ac-live')
const BUDGET = { tab: 300, splits: 1000, cold: 2000 }

it('plan AC live gates', { timeout: 1_800_000 }, async () => {
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

    // Every metric the dashboard names is in the catalogue.
    const named = new Set<string>()
    for (const p of RAIL_POSITIONS) {
      for (const t of playerTabs(p))
        for (const s of sectionsFor(t.id, p, byId)) for (const l of s.lines) named.add(l.metric)
      for (const id of [...TILES[p], ...LINE_METRICS[kindOf(p)]]) named.add(id)
    }
    expect([...named].filter((id) => !byId.has(id))).toEqual([])

    /** A tab's queries, as the screen sends them at once. */
    const tabQueries = (
      tab: PlayerTab,
      id: string,
      p: PositionGroup,
      scope: StatsScope,
      bio: PlayerBio
    ): Map<string, StatsQuery> => {
      const kind = kindOf(p)
      const m = new Map<string, StatsQuery>()
      const add = (k: string, q: StatsQuery | null): void => {
        if (q) m.set(k, q)
      }
      switch (tab) {
        case 'overview': {
          for (const [k, q] of playerSectionQueries(
            overviewSections(p, byId),
            p,
            scope,
            status,
            TILES[p]
          ))
            add(`o:${k}`, q)
          const pts = pointsSeries(kind)
          if (pts.length) add('weekly', playerQuery(id, pts, scope, status, ['week']))
          add('season', playerQuery(id, LINE_METRICS[kind], scope, status))
          add('career', careerQuery(bio, kind, scope, false))
          add('rail', railQuery(p, positionTab(p).sort, scope, status, byId))
          return m
        }
        case 'log':
          add('log', gameLogQuery(id, kind, scope, status))
          return m
        case 'splits':
          for (const [k, q] of splitTableQueries(p, scope, status)) add(`s:${k}`, q)
          add('opponent', opponentQuery(id, p, scope, status))
          if (bio.team) add('mates', teammatesQuery(bio.team, p, scope, status))
          return m
        case 'forecast':
          add('defense', opponentDefenseQuery(p, scope, status))
          add('shrunk', shrunkQuery(p, scope, status, byId))
          return m
        case 'profile':
          add('profile', profileQuery(bio))
          add('seasons', careerQuery(bio, kind, scope, true))
          add('career', careerQuery(bio, kind, scope, false))
          return m
        default:
          for (const [k, q] of playerSectionQueries(sectionsFor(tab, p, byId), p, scope, status))
            add(k, q)
          return m
      }
    }

    for (const season of [status.through!.season - 1, status.through!.season]) {
      const scope = { ...defaultScope(status, false), season }
      const games = await service.games({ season })
      for (const p of RAIL_POSITIONS) {
        const rail = await service.query(railQuery(p, positionTab(p).sort, scope, status, byId))
        const rows = railRows(rail, p, positionTab(p).sort, byId, null, '', null)
        const [first, second] = rows
        const bios = [
          await service.player({ player: first.id }),
          await service.player({ player: second.id })
        ]
        const times: string[] = []
        for (const t of playerTabs(p)) {
          let at = Date.now()
          await all(tabQueries(t.id, first.id, p, scope, bios[0]))
          if (t.id === 'forecast')
            await service.outlook({ player: first.id, season, scoring: scope.scoring })
          const cold = Date.now() - at
          at = Date.now()
          await all(tabQueries(t.id, second.id, p, scope, bios[1]))
          if (t.id === 'forecast')
            await service.outlook({ player: second.id, season, scoring: scope.scoring })
          const ms = Date.now() - at
          times.push(`${t.id} ${ms}`)
          expect(cold, `${season} ${p} ${t.id} cold`).toBeLessThan(BUDGET.cold)
          expect(ms, `${season} ${p} ${t.id}`).toBeLessThan(
            t.id === 'splits' ? BUDGET.splits : BUDGET.tab
          )
        }
        console.log(`${season} ${p} (${bios[1].name}): ${times.join(', ')}`)

        // Every qualified player: a bio, a log of his games with their results, no empty line the
        // season has, a place in each split he has plays in.
        let at = Date.now()
        const empty: string[] = []
        const noResult: string[] = []
        const lineTabs = playerTabs(p)
          .map((t) => t.id)
          .filter((t) => sectionsFor(t, p, byId).length > 0)
        const tabResults = new Map(
          await Promise.all(
            lineTabs.map(
              async (t) =>
                [
                  t,
                  await all(playerSectionQueries(sectionsFor(t, p, byId), p, scope, status))
                ] as const
            )
          )
        )
        const splits = await all(splitTableQueries(p, scope, status))
        for (const r of rows) {
          const bio = await service.player({ player: r.id })
          expect(bio.name, r.id).toBeTruthy()
          const log = gameLog(
            await service.query(gameLogQuery(r.id, kindOf(p), scope, status)),
            games,
            kindOf(p),
            byId,
            scope,
            status
          )
          const played = log.filter((l) => l.note === null)
          expect(played.length, `${r.name} games`).toBeGreaterThan(0)
          for (const l of played) if (!l.score) noResult.push(`${r.name} ${l.week}`)
          for (const [t, res] of tabResults)
            for (const s of playerSectionViews(sectionsFor(t, p, byId), res, r.id, p, byId, season))
              for (const l of s.lines)
                if (l.value === '—' && !l.missing) empty.push(`${r.name} ${t}:${l.label}`)
          if (splits.size) {
            const rowsOf = splitTable(splits, r.id, p, byId, season).flatMap((g) => g.rows)
            expect(rowsOf.find((x) => x.key === 'all')?.plays, `${r.name} all plays`).not.toBe('—')
          }
        }
        const pool = rail.rows.filter(
          (x) => x.position === p && qualifies(x, positionTab(p))
        ).length
        console.log(
          `${season} ${p}: ${rows.length} qualified (pool ${pool}) in ${Date.now() - at} ms; empty lines ${empty.length}${empty.length ? ` (${[...new Set(empty.map((e) => e.split(' ').slice(-2).join(' ')))].slice(0, 8).join(', ')})` : ''}; games without a result ${noResult.length}`
        )
        expect(noResult).toEqual([])
        expect(empty).toEqual([])
        at = Date.now()
      }
    }
    // Known values (2025, a sealed season).
    const scope = { ...defaultScope(status, false), season: 2025 }
    const wr = await all(
      playerSectionQueries(overviewSections('WR', byId), 'WR', scope, status, TILES.WR)
    )
    const chase = playerSectionViews(
      overviewSections('WR', byId),
      wr,
      '00-0036900',
      'WR',
      byId,
      2025
    )[0]
    console.log(
      `2025 Chase: ${chase.lines.map((l) => `${l.label} ${l.value} ${l.rank}`).join(' | ')}`
    )
    expect(chase.lines.find((l) => l.metric === 'target_share')?.rank).toMatch(/of \d+$/)
    console.log('ALL GATES PASSED')
  } finally {
    await service.close()
  }
})
```

```bash
npx vitest run tests/zz-ac-live.test.ts --reporter=verbose
```

Expected (2026-10-21, state 2026 week 6), within the budgets the gates set:

- **Every tab's queries at once** (the position's leader cold, then its second warm; budget 300 ms, Splits 1 s, a cold read 2 s):

| Tab                     | 2025 ms | 2026 ms |
| ----------------------- | ------- | ------- |
| Overview                | 23–131  | 24–87   |
| Stat tabs               | 21–136  | 23–121  |
| Game log                | 34–80   | 23–53   |
| Splits                  | 230–342 | 181–275 |
| Forecast (with outlook) | 242–249 | 197–252 |
| Profile                 | 72–137  | 72–117  |

Each position's line prints its tabs (`2026 WR (Chris Olave): overview 76, usage 60, receiving 121, vsCoverage 58, log 44, splits 189, forecast 252, profile 117`).

- **Every qualified player, both seasons:** a bio, a game log whose every played game has its result, no line empty without a reason, a sample in the splits table's "All plays" row (2025: QB 38, RB 63, WR 110, TE 48, K 29, P 31, DL 194, LB 161, DB 229; 2026: 34, 66, 106, 46, 31, 33, 181, 168, 223).
- **Ja'Marr Chase 2025:** target share 32.2 % (3rd of 110), air-yards share 35.9 % (16th), WOPR 0.73 (5th), route participation 96.5 % (2nd of 109), YPRR 2.26 (14th of 109), TPRR 29.6 % (4th of 109), separation 3.13 (24th of 85), FPOE 6.9 (33rd of 110).

and `ALL GATES PASSED`. If a gate fails, stop and report the numbers. Then remove the file (`npm run typecheck` does not take it: the node config has no `@/` alias):

```bash
rm tests/zz-ac-live.test.ts && git status --short
```

Expected: only the unrelated changes of Global Constraints.

- [ ] **Step 3: The app, walked through**

The driver is Plan AA's: it starts the built app on a scratch profile with remote debugging, follows a list of steps over the DevTools protocol and saves screenshots. Copy it from Plan AB's Task 6, or create `~/project/ffc-proto-ac-live/drive.mjs`:

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

Create `~/project/ffc-proto-ac-live/steps-ac.json` (with the dev league; a tab is clicked through `[role=tab]` and a rail position through `[role=radio]`, since the nav has a Players button too):

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
    "wait": 3000
  },
  {
    "click": "Players"
  },
  {
    "wait": 6000
  },
  {
    "shot": "01-overview"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Usage\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "02-usage"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Rushing\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "03-rushing"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Receiving\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "04-receiving"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Game log\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "05-log"
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a.nextElementSibling.scrollTo(0, 99999); return a.nextElementSibling.scrollHeight })()"
  },
  {
    "wait": 400
  },
  {
    "shot": "05-log-b"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Splits\").click()"
  },
  {
    "wait": 5000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "06-splits"
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a.nextElementSibling.scrollTo(0, 99999); return a.nextElementSibling.scrollHeight })()"
  },
  {
    "wait": 400
  },
  {
    "shot": "06-splits-b"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Forecast\").click()"
  },
  {
    "wait": 5000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "07-forecast"
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a.nextElementSibling.scrollTo(0, 99999); return a.nextElementSibling.scrollHeight })()"
  },
  {
    "wait": 400
  },
  {
    "shot": "07-forecast-b"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Profile\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "08-profile"
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a.nextElementSibling.scrollTo(0, 99999); return a.nextElementSibling.scrollHeight })()"
  },
  {
    "wait": 400
  },
  {
    "shot": "08-profile-b"
  },
  {
    "eval": "[...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"QB\").click()"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "10-qb"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Passing\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "11-qb-passing"
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a.nextElementSibling.scrollTo(0, 99999); return a.nextElementSibling.scrollHeight })()"
  },
  {
    "wait": 400
  },
  {
    "shot": "11-qb-passing-b"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Under pressure\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "12-qb-pressure"
  },
  {
    "eval": "(() => { const s = document.querySelector('select[title=Season]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, '2024'); s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok' })()"
  },
  {
    "wait": 5000
  },
  {
    "shot": "13-qb-pressure-2024"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Splits\").click()"
  },
  {
    "wait": 5000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "14-qb-splits-2024"
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a.nextElementSibling.scrollTo(0, 99999); return a.nextElementSibling.scrollHeight })()"
  },
  {
    "wait": 400
  },
  {
    "shot": "14-qb-splits-2024-b"
  },
  {
    "eval": "(() => { const s = document.querySelector('select[title=Season]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, '2026'); s.dispatchEvent(new Event('change', { bubbles: true })); return 'ok' })()"
  },
  {
    "wait": 4000
  },
  {
    "eval": "[...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"WR\").click()"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "20-wr"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"vs Coverage\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "21-wr-coverage"
  },
  {
    "eval": "[...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"TE\").click()"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "22-te"
  },
  {
    "eval": "[...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"K\").click()"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "30-k"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Kicking\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "31-k-kicking"
  },
  {
    "eval": "[...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"P\").click()"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "32-p"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Game log\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "33-p-log"
  },
  {
    "eval": "[...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"DL\").click()"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "40-dl"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Pass rush\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "41-dl-passrush"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Coverage\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "42-dl-coverage"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Run defense & tackling\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "43-dl-tackling"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Splits\").click()"
  },
  {
    "wait": 5000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "44-dl-splits"
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a.nextElementSibling.scrollTo(0, 99999); return a.nextElementSibling.scrollHeight })()"
  },
  {
    "wait": 400
  },
  {
    "shot": "44-dl-splits-b"
  },
  {
    "eval": "[...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"LB\").click()"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "45-lb"
  },
  {
    "eval": "[...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"DB\").click()"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "46-db"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Coverage\").click()"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "47-db-coverage"
  },
  {
    "eval": "document.querySelector('button[title=\"Switch theme\"]').click()"
  },
  {
    "wait": 800
  },
  {
    "shot": "50-dark"
  },
  {
    "eval": "[...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"RB\").click()"
  },
  {
    "wait": 4000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "51-dark-rb"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Forecast\").click()"
  },
  {
    "wait": 5000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "52-dark-forecast"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Splits\").click()"
  },
  {
    "wait": 5000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a && a.nextElementSibling.scrollTo(0, 0); return !!a })()"
  },
  {
    "shot": "53-dark-splits"
  },
  {
    "eval": "document.querySelector('button[title=\"Switch theme\"]').click()"
  },
  {
    "wait": 500
  },
  {
    "click": "Player leaderboards \u2192"
  },
  {
    "wait": 3000
  },
  {
    "shot": "60-leaderboard"
  },
  {
    "eval": "(() => { const r = document.querySelectorAll('tbody tr')[2]; r.click(); return r.textContent.slice(0, 30) })()"
  },
  {
    "wait": 4000
  },
  {
    "shot": "61-from-leaderboard"
  },
  {
    "click": "Leaderboards"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(() => { const b = [...document.querySelectorAll('section button')].find((x) => /^1/.test(x.textContent.trim())); b.click(); return b.textContent.slice(0, 30) })()"
  },
  {
    "wait": 4000
  },
  {
    "shot": "62-from-home"
  },
  {
    "click": "Teams"
  },
  {
    "wait": 5000
  },
  {
    "shot": "63-team"
  },
  {
    "eval": "(() => { const b = document.querySelector('button[title^=\"Open \"][title$=\"dashboard\"]'); b.click(); return b.title })()"
  },
  {
    "wait": 5000
  },
  {
    "shot": "64-from-team"
  },
  {
    "eval": "(() => { const b = [...document.querySelectorAll('button')].find((x) => /fantasy team|Rostered by|Free agent in your league/.test(x.textContent)); return b ? (b.disabled ? 'disabled' : (b.click(), 'clicked: ' + b.textContent)) : 'none' })()"
  },
  {
    "wait": 4000
  },
  {
    "shot": "65-fantasy-file"
  },
  {
    "eval": "(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Full stats')); return b ? (b.disabled ? 'disabled' : (b.click(), 'clicked')) : 'none' })()"
  },
  {
    "wait": 5000
  },
  {
    "shot": "66-full-stats"
  }
]
```

Create `~/project/ffc-proto-ac-live/steps-ac-noleague.json`:

```json
[
  {
    "size": [1440, 900],
    "wait": 15000
  },
  {
    "shot": "70-noleague-home"
  },
  {
    "click": "Players"
  },
  {
    "wait": 6000
  },
  {
    "shot": "71-noleague-default"
  },
  {
    "eval": "document.querySelectorAll('[title=\"On your fantasy team\"]').length"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Forecast\").click()"
  },
  {
    "wait": 4000
  },
  {
    "shot": "72-noleague-forecast"
  },
  {
    "eval": "[...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Splits\").click()"
  },
  {
    "wait": 5000
  },
  {
    "eval": "(() => { const a = document.querySelector('aside[aria-label=Players]'); a.nextElementSibling.scrollTo(0, 99999); return 1 })()"
  },
  {
    "wait": 400
  },
  {
    "shot": "73-noleague-teammate"
  },
  {
    "eval": "[...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"K\").click()"
  },
  {
    "wait": 4000
  },
  {
    "shot": "74-noleague-k"
  }
]
```

Create `~/project/ffc-proto-ac-live/steps-ac-timing.json` (each step clicks, then waits for the tab's content and prints the time):

```json
[
  {
    "size": [1440, 900],
    "wait": 25000
  },
  {
    "click": "Stats \u2197"
  },
  {
    "wait": 5000
  },
  {
    "click": "Leaderboards"
  },
  {
    "wait": 3000
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('nav button')].find((t) => t.textContent === 'Players').click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[data-metric]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Players\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Usage\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[data-metric]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Usage\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Rushing\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[data-metric]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Rushing\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Receiving\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[data-metric]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Receiving\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Game log\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[role=table]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Game log\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Splits\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[role=table]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Splits\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Forecast\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[role=table]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Forecast\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Profile\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[role=table]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Profile\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Overview\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[data-metric]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Overview\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"QB\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[data-metric]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Rail QB\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1500
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"WR\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[data-metric]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Rail WR\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1500
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=radio]')].find((t) => t.textContent === \"DL\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[data-metric]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"Rail DL\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  },
  {
    "wait": 1500
  },
  {
    "eval": "(async () => { const t = performance.now(); [...document.querySelectorAll('[role=tab]')].find((t) => t.textContent === \"Splits\").click(); const done = () => !document.body.innerText.includes('Loading\u2026') && document.querySelector('[role=tablist][aria-label=\"Player dashboard\"]') && document.querySelector('[role=table]'); await new Promise((r) => setTimeout(r, 0)); for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setTimeout(r, 5)); return \"DL Splits\" + ': ' + Math.round(performance.now() - t) + ' ms' })()"
  }
]
```

```bash
npx electron-vite build
L=~/project/ffc-proto-ac-live
rm -rf $L/gui && mkdir -p $L/gui/profile $L/gui/profile-noleague $L/gui/profile-timing
cp ~/.config/FantasyCompanion/companion.db $L/gui/profile/ && cp $L/work.duckdb $L/gui/profile/stats.duckdb
cp ~/.config/FantasyCompanion/companion.db $L/gui/profile-timing/ && cp $L/work.duckdb $L/gui/profile-timing/stats.duckdb
cp $L/work.duckdb $L/gui/profile-noleague/stats.duckdb
APP=$PWD node $L/drive.mjs $L/gui/profile $L/steps-ac.json $L/gui/shots
APP=$PWD node $L/drive.mjs $L/gui/profile-noleague $L/steps-ac-noleague.json $L/gui/shots
APP=$PWD node $L/drive.mjs $L/gui/profile-timing $L/steps-ac-timing.json $L/gui/timing
```

Expected: no `NOT FOUND` in the output. Run the timing profile alone (a test run beside it doubles the times). It prints each click to content, under 300 ms but Splits (budget 1 s); measured: Players 229–289 ms; tabs 72–133 ms; Forecast 191 ms; Profile 111–121 ms; Splits 266–270 ms (a lineman's 342–478 ms); a rail position 135–273 ms.

The dev league's top scorer is James Cook (BUF) on 2026-10-21. If the dashboard opens on another player, the checklist holds for that player. The scratch app refreshes while it runs: a first paint can wait for it, and a game that lands mid-walk changes the numbers. That is expected.

Open each screenshot in `$L/gui/shots` and check:

| Shot                                         | Shows                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01-overview`                                | Players underlined; the rail at RB, James Cook selected (amber dot); his headshot, RB chip, BUF, "6 G · Weeks 1–6", "RB8 in My league"; "James" / "Cook"; the facts line; Compare greyed; "On your fantasy team ↗"; four tiles with percentile chips; percentile rankings "vs 66 qualified RBs"; fantasy points by week (two lines); the season and career lines. |
| `02-usage` … `04-receiving`                  | Two columns of sections; pills and "14th of 59"-style ranks; "Lg" means; no empty line without a note.                                                                                                                                                                                                                                                            |
| `05-log`, `05-log-b`                         | Weeks 1–6: "@ HOU W 36–31" … "@ LV W 33–30", his columns, FP bold and xFP grey.                                                                                                                                                                                                                                                                                   |
| `06-splits`, `06-splits-b`                   | Games (home 57 + away 60 = 117 carries), quarters, score, downs and red zone, shaded cells with ranks; by opponent; the teammate table saying participation is not published for 2026.                                                                                                                                                                            |
| `07-forecast`, `07-forecast-b`               | The next game (week 8 vs BAL) with BAL's defense in the player's tone; Projections (Sleeper's next game, rest of season and rank, FantasyPros); range of outcomes; role; running hot or cold; schedule; stability-weighted rates.                                                                                                                                 |
| `08-profile`, `08-profile-b`                 | Bio ("Sep 25, 1999 · age 27"); combine with percentile pills, athletic score and Speed Score; career by season, 2022–2026 and Career.                                                                                                                                                                                                                             |
| `10-qb` … `12-qb-pressure`                   | The QB rail; "Matthew" / "Stafford" (not "John"); Passing sections; Under pressure with "Not published for 2026 yet." on participation lines and filled blitz lines.                                                                                                                                                                                              |
| `13-qb-pressure-2024`, `14-qb-splits-2024-b` | 2024: pressured and clean lines filled and ranked; the splits' pressure, blitz and play-action groups; by opponent; with and without a WR teammate, both rows filled.                                                                                                                                                                                             |
| `20-wr` … `22-te`                            | WR and TE dashboards; vs Coverage with the man / zone note.                                                                                                                                                                                                                                                                                                       |
| `30-k` … `33-p-log`                          | Kicker: no Splits or Forecast tab, tiles and FG lines; punter: no fantasy rank, its log.                                                                                                                                                                                                                                                                          |
| `40-dl` … `47-db-coverage`                   | Defenders: "Will" / "Anderson Jr."; no Fantasy chip; Pass rush, Coverage (a lineman's: on the ball only), Run defense & tackling, splits with games played.                                                                                                                                                                                                       |
| `50-dark` … `53-dark-splits`                 | The dark Stats palette: rail chips, pills, the chart and the shaded split cells legible.                                                                                                                                                                                                                                                                          |
| `60-leaderboard`, `61-from-leaderboard`      | "Player leaderboards →" opens the RB leaderboard; its third row opens that player's dashboard.                                                                                                                                                                                                                                                                    |
| `62-from-home`                               | The passing-yards board's first row opens Matthew Stafford's dashboard.                                                                                                                                                                                                                                                                                           |
| `63-team`, `64-from-team`                    | The team dashboard; a name in its tables opens that player's dashboard.                                                                                                                                                                                                                                                                                           |
| `65-fantasy-file`, `66-full-stats`           | The owner chip opens the Fantasy Players board with his file; its "Full stats ↗" pill (mini Stats mark) brings his Stats dashboard back.                                                                                                                                                                                                                          |
| `70-noleague-home` … `74-noleague-k`         | Without a league: the leading WR (the eval prints 0 amber dots), PPR, no owner chip; the Forecast's "Import a league for Sleeper's projection and FantasyPros' rank."; the teammate note; the kicker under PPR.                                                                                                                                                   |

If a screenshot differs, stop and show it to the user.

---

### Task 8: Verify, merge, release

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 1025 passed | 5 skipped; the build succeeds.

- [ ] **Step 2: The Windows suite and self-test**

**Ask the user before pushing.** Then:

```bash
git push origin feat/player-dashboard-ac:check/plan-ac
gh run watch "$(gh run list --branch check/plan-ac --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
git push origin --delete check/plan-ac
```

Expected: green. The log shows `"query":true`.

- [ ] **Step 3: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/player-dashboard-ac`. It reviews against spec §9.4 and §11, the amendments, the handoff and the Review Focus list. Fix Critical and Important findings, each in its own commit, test first. Re-run Step 1 after them, and the Task 7 walk-through after a screen change.

- [ ] **Step 4: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/player-dashboard-ac -m "merge: feat/player-dashboard-ac (plan AC)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.30.0" && git tag v0.30.0
git branch -d feat/player-dashboard-ac
```

- [ ] **Step 5: Status block**

Replace this plan's Status line with the outcome:

- the merge commit and the tag;
- the Task 7 numbers and the walk-through;
- the review fixes and anything deferred.

Then commit, staging this file only: `git commit -m "docs(plan): mark plan AC complete"`.

- [ ] **Step 6: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.30.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests and the packaged self-test, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.30.0 --draft=false`). The release notes should say:

- Player dashboards in Companion Stats: open Players for anyone, defenders, kickers and punters included, 2019 to today. Overview, stat tabs by position, game log, splits (home and road, quarter, score, down, pressure, coverage), forecast and profile, each stat ranked among the position's qualified players.
- The two products link: "Full stats ↗" on a Fantasy player file, and the owner chip on a Stats dashboard back to Fantasy.
- A fix: "without a teammate on the field" no longer counts plays the participation data does not cover (the current season's).
- Compare, the chart explorer and trends come in the next release.

---

## Self-review against the spec

- **§9.4 Player dashboard** (Tasks 2–5):
  - **Header:** photo (amendment A), team, position, age, experience, draft, injury status (amendment F), fantasy rank under the chosen scoring.
  - **Tabs by position group:** QB, RB, WR / TE, K / P and DL / LB / DB, exactly the spec's table (Kicking or Punting by position).
  - **Overview:** core cards with percentiles (the handoff's four tiles and 6–8 percentile rankings), weekly fantasy points against expected, the season line and the career line.
  - **Splits:** home / away (amendment C), by opponent, last N (4), by quarter and score state, and the play-grain splits the position supports: pressure, blitz and play action (QB), coverage (WR, TE), with / without a teammate on the field. Formation and personnel splits are left out: the dashboard's columns already need participation in the current season, and a personnel split of one player's plays is mostly one grouping.
  - **Forecast (offense):**
    - short term: the next opponent's defense against the position (fantasy points allowed and adjusted EPA, ranked among the 32), the Sleeper / FantasyPros projection (with a league, amendment E), ceiling and floor;
    - long term: trend and role change, regression flags, the rest-of-season projection (with a league) and schedule strength, the stability-weighted profile (core rates raw and shrunk).
  - **Profile:** bio, combine with position percentiles, RAS (the athletic score, §17 L), Speed Score, career by season.
  - **The slide-over link:** "Full stats ↗" on the Fantasy player file (the handoff's name for "Open stats dashboard"), and the dashboard links back with a league (amendment G).
- **§9.6 Design.** The handoff's player profile for the rail, the header, the tiles and the percentile rankings, its player file's "Full stats ↗" pill and its tone rules (amendment A). The stat tabs, the game log columns beyond the handoff's, the splits, the Forecast and the Profile have no mockup: they are built in the handoff's Stats language and are worth a pass in Claude Design.
- **§7.1 Query.** `scope.home`; `withoutOnField` on listed plays (Task 1).
- **§11 Testing.**
  - Unit tests for the engine changes, the read, the link, the model; component tests for the parts, the screen and both products' links.
  - The dashboard budget on live data, in the worker and in the app (Task 7).
  - The packaged smoke test (Task 8 Step 2).
- **Not in this plan** (by §12 and §13): Compare (the button stays disabled), the chart explorer and multi-season trend charts (AD); matchups and Games (AE); natural-language queries; IDP in Fantasy.
