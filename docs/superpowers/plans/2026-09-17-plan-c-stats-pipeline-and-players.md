# Plan C — nflverse Stats Pipeline, Points & Players Screen

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app downloads nflverse weekly stats, snap counts, team stats, the game schedule and the DynastyProcess ID crosswalk; resolves every Sleeper player to its nflverse ids; materializes per-player-week fantasy points under the league's rules; and shows points on the League screen, a new Players screen with a weekly-stats side panel, and a "Stats" freshness label in the status bar.

**Architecture:** A new `sources/nflverse.ts` (CSV over HTTPS, no DB knowledge) feeds five new tables via `db/repos/{stats,playerIds,points}.ts`. A pure `sync/identity.ts` resolves Sleeper → nflverse ids in the spec's order; pure `scoring/adapters.ts` maps nflverse columns to Sleeper stat keys; `scoring/recompute.ts` joins ids + stats + rules into `player_week_points`. `sync/nflverseSync.ts` orchestrates the steps with the same `runStep` / `sync_log` / freshness pattern as the Sleeper sync (extracted into `sync/step.ts`), and `sync/refresh.ts` chains Sleeper → nflverse. Three new IPC calls (`league.pointsContext`, `players.search`, `players.weeklyStats`) read SQLite only.

**Tech Stack:** Same as Plans A/B — Electron 39, electron-vite 5, React 19, TypeScript 5 (strict), Tailwind 4, shadcn/ui, lucide-react, `node:sqlite`, `node:zlib` (gunzip), Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-15-slice1-league-sync-stats-pipeline-design.md` §5 (nflverse files), §6 (identity resolution), §7 (`toStatLine`, `recomputePoints`), §8 (`player_ids`, `player_week_stats`, `player_week_snaps`, `team_week_stats`, `games`, `player_week_points`), §9 (sync pipeline, freshness windows), §10 screens 2 and 4 + status bar, §11 (skipped vs error, row-level parse failures), §12 tests. Column names come from `docs/research/2026-09-15-data-sources.md` §1.1–1.7 and were re-verified live on 2026-09-17 (every column the adapters read exists in `stats_player_week_2026.csv`; all four `.csv.gz` URLs return 200). This plan covers spec milestones 5, 6 (the DB half), 7 and 8.

**Builds on:** Plan B (`v0.2.0`, HEAD `246762e`). Interfaces used from Plan B: `Rules` / `StatKey` / `Position` / `POSITIONS` (`src/shared/rules.ts`), `STAT_KEYS` with `supported` flags (`src/shared/statKeys.ts`), `StatLine`, `DERIVED_STATS`, `scoreStatLine` (`src/main/scoring/engine.ts`), `getRules` / `saveRules` (`src/main/db/repos/rules.ts`), `startSync` / `finishSync` / `getLastSync` (`src/main/db/repos/syncLog.ts`), the Sleeper sync (`src/main/sync/sleeperSync.ts`), the `rules.update` handler's marked `recomputePoints` hook (`src/main/ipc/handlers.ts`).

## Global Constraints

- Node **≥ 22.13** in WSL (`.nvmrc` pins 22); every shell below starts with `source ~/.nvm/nvm.sh && nvm use` from the project root. Electron **≥ 35**.
- Storage is Node's built-in `node:sqlite` (`DatabaseSync`). **No native modules** in `dependencies`. `node:sqlite` binds only `null | number | bigint | string | Uint8Array` — convert booleans to `0/1`, never pass `undefined`. `.all()` results are cast `as unknown as Row[]` (Plan A pattern).
- `contextIsolation: true`, `nodeIntegration: false`; the renderer never touches SQLite or the network. All nflverse calls go through `src/main/sources/nflverse.ts`; all Sleeper calls through `src/main/sources/sleeper.ts`.
- Core modules (`sources`, `db`, `scoring`, `sync`, `shared`) import nothing from `electron`.
- Repositories never open transactions; callers wrap them in `withTransaction` (Plan A/B convention). `recomputePoints` follows the same rule.
- `StatKey` uses **Sleeper's scoring vocabulary**. Unknown keys from Sleeper are kept. Every catalogue key with `supported: true` that is not in `DERIVED_STATS` **must be emitted by an adapter** (Task 5 has the contract test).
- Every network-touching sync step writes a `sync_log` row (`running` → `ok` | `error` | `skipped`). Sources are independent: one failing never blocks another. A missing upstream file (HTTP 404) is `skipped` with a clear message, never `error`. All fetches time out after 30 s. Retry once on 429/5xx (Sleeper behaviour, mirrored).
- Computed scores are rounded to **2 decimals** (`scoreStatLine` already does); sums shown in the UI are rounded to 2 decimals in the repository.
- nflverse team codes differ from Sleeper's for the Rams (`LA` vs `LAR`); the crosswalk's `team` column uses MFL codes and is **never** joined on.
- Dark theme only. Use the existing shadcn primitives in `src/renderer/src/components/ui/` (badge, button, card, input, table) plus native `<select>` styled like `RulesScreen`'s `selectClass`; no new UI packages.
- Git: `main` branch, Conventional Commits (summary ≤ 50 chars, imperative), atomic commits, ending with the `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>` line required by the environment. Work on branch `feat/stats-pipeline-and-players` (created with the plan commit).
- Verification before every commit: `npm run typecheck && npm run lint && npm test` all clean. Lint enforces Prettier formatting — if it reports formatting errors, run `npm run format` and re-lint; the code blocks below are written for Prettier's 100-column, no-semicolon style but line breaks may differ. `tsconfig.node.json` typechecks `tests/**` too, so test literals must satisfy the shared types.
- When a task says "add an import" to a file that already imports from that module, **merge into the existing import line** (one import per module; the lint config rejects duplicates).
- UI tasks (9, 10): the code given is the functional baseline. After it typechecks and the human check passes, the implementer may load the `frontend-design` skill to refine spacing, hierarchy and colour — without changing component names, props or IPC usage.

## Design decisions (deviations from / refinements of the spec — flag to the user if they disagree)

1. **Stats rows store the numeric columns as JSON** (`stats_json`, keyed by nflverse column name) next to the dimension columns, instead of one SQL column per numeric field (spec §8 says "every numeric column"). The file has ~150 columns and the set changed in 2025; JSON keeps every column, survives renames, and nothing in slice 1 queries a stat column in SQL. List-valued text columns (`fg_made_list`, …) are dropped as the spec says; `"NA"`/empty become absent keys.
2. **A `crosswalk` table is added** (spec §8 has none) holding the DynastyProcess file, so identities can be re-resolved whenever the Sleeper players DB changes without re-downloading the crosswalk.
3. **Only regular-season rows are stored** (`season_type = 'REG'` for stats/snaps, `game_type = 'REG'` for games). Fantasy weeks are regular-season weeks; postseason rows would pollute season totals.
4. **`.csv.gz` is fetched** for the three nflverse release files (gunzipped with `node:zlib`; ~5× fewer bytes per refresh); `games.csv` and the crosswalk are plain CSV. Detection is by gzip magic bytes, not URL.
5. **Adapter semantics where Sleeper and nflverse vocabularies differ:** `xpmiss` = `pat_missed + pat_blocked`, `fgmiss` = `fg_missed + fg_blocked` (blocked kicks count as misses; the per-distance `fgmiss_*` buckets exclude blocked kicks because nflverse gives no distance for them); `fum` / `fum_lost` = sack + rushing + receiving fumbles; `fum_rec` = own + opponent recoveries for players, opponent recoveries for a team DEF; `idp_tkl` = `def_tackles_solo + def_tackles_with_assist`; `pass_inc` = `attempts − completions`; DEF `yds_allow` = opponent `rushing_yards + passing_yards − sack_yards_lost` (net yards); DEF `pts_allow` = opponent's score from `games`.
6. **`player_ids` is rebuilt for every row of `players`** (~11k Sleeper players) on each identity run; the `sync_log` message counts unresolved players **on league rosters only** (the total includes thousands of inactive players and would be noise).
7. **"Last week" = the latest week that has any `player_week_points` row for the league's season**, exposed via `league.pointsContext()`. Using `nfl_state.week − 1` would show an empty column on Tuesdays before nflverse publishes.
8. **Freshness windows:** current-season stats and snaps 6 h (spec), games 6 h, crosswalk 24 h (spec), **previous-season stats and snaps 7 days** (the file never changes). `app:identity` and `app:points` are logged sync steps but run **only when an input changed** (crosswalk or players re-fetched; stats/games re-fetched; empty tables) or on force — no `skipped: fresh` noise every refresh.
9. **Per-season `sync_log` sources** (`nflverse:stats:2026`, `nflverse:snaps:2025`, …) so an unpublished new season is `skipped` while the previous season stays `ok`. `runStep` therefore takes `freshnessMs` as a parameter instead of a lookup table, and may return a message alongside the row count. This is a small refactor of `sleeperSync.ts` (Task 2) with no behaviour change for Sleeper.
10. **In-flight refresh guard** (deferred from Plan B): the on-launch background refresh and the Refresh button now share one promise, because nflverse steps take seconds and would otherwise download twice.
11. **`listRoster` gains an optional `PointsContext`** (default = no points) so Plan A/B tests keep compiling; the handler passes the real context.
12. `fantasy_points` / `fantasy_points_ppr` from nflverse are stored in `stats_json` like any other column but never used for scoring — the app's rules are the only source of points.
13. Plan ends with a `0.3.0` version bump, Windows build and tag, mirroring Plan B's Task 7.

**The user's real league** (16 teams, 43 scoring keys, no bonus keys, DEF tiers `pts_allow_0..35p` = 10/7/4/1/0/-1/-4, `fum_rec: 2`): after this plan, every rostered player with a `crosswalk` or `sleeper_gsis` resolution shows season and last-week points; the four unsupported ST keys score 0 as before. Task 11's human check reads a few players' week-N points against Sleeper's matchup page — expect matches for offense, K within ±1 (blocked-kick handling) and DEF differences only from the unsupported ST keys.

## File map

```
src/main/sources/csv.ts                     parseCsv, numOrNull, strOrNull
src/main/sources/nflverse-types.ts          PlayerWeekStatsRecord, TeamWeekStatsRecord, SnapCountRecord, GameRecord, CrosswalkRecord
src/main/sources/nflverse.ts                parse* functions, ParseResult, NflverseClient, createNflverseClient, NflverseHttpError
src/main/sync/step.ts                       SyncDeps, RefreshOptions, SkipStep, StepOutcome, nowOf, isFresh, runStep   (extracted from sleeperSync)
src/main/sync/sleeperSync.ts                uses step.ts (no behaviour change)
src/main/db/migrations/003_stats.sql        crosswalk, player_ids, player_week_stats, team_week_stats, player_week_snaps, games, player_week_points
src/main/db/migrations/index.ts             + migration 3
src/main/db/repos/stats.ts                  replacePlayerWeekStats, replaceTeamWeekStats, replaceSnaps, upsertGames, listPlayerWeeks, listAllPlayerWeeks, listTeamWeeks, listGames, listSnaps, teamByeWeeks
src/main/db/repos/playerIds.ts              replaceCrosswalk, listCrosswalk, replacePlayerIds, getPlayerIds, countPlayerIds, listPlayerIdentitySources, listScoringIdentities, countUnresolvedRostered
src/main/db/repos/points.ts                 PointsContext, NO_POINTS_CONTEXT, replacePoints, countPoints, latestPointsWeek, listWeekPoints
src/main/db/repos/playersQuery.ts           searchPlayers, playerWeeklyStats
src/main/db/repos/teams.ts                  listRoster + points/bye/statsAvailable
src/main/db/repos/syncLog.ts                + getLastSyncLike
src/shared/teams.ts                         SLEEPER_TO_NFLVERSE_TEAM, toNflverseTeam, NFL_TEAMS
src/main/sync/identity.ts                   normalizeName, indexCrosswalk, resolvePlayer, resolvePlayers
src/main/scoring/adapters.ts                PLAYER_STAT_MAP, TEAM_STAT_MAP, playerStatLine, teamStatLine, offensiveYards
src/main/scoring/recompute.ts               recomputePoints, pointsAllowedIndex
src/main/sync/nflverseSync.ts               SOURCE_* constants, refreshNflverse
src/main/sync/refresh.ts                    refreshAll, importAll
src/shared/types.ts                         RosterPlayer + fields, PlayerFilter, PlayerRow, WeekStats, PointsContext, SyncStatus.lastNflverseSync
src/shared/ipc.ts                           + league.pointsContext, players.search, players.weeklyStats
src/main/ipc/handlers.ts                    + handlers, in-flight guard, recompute on rules.update, nflverse client in AppContext
src/main/index.ts                           nflverse client, background refreshAll via guard
src/preload/index.ts                        + bridge entries
src/renderer/src/lib/format.ts              + fmtPoints
src/renderer/src/lib/playersView.ts         pure: weekColumns(position), OWNER_FA
src/renderer/src/screens/LeagueScreen.tsx   Bye / Pts / Wk N columns
src/renderer/src/screens/PlayersScreen.tsx  Players table + weekly side panel
src/renderer/src/components/StatusBar.tsx   Stats label
src/renderer/src/components/Sidebar.tsx     enable Players
src/renderer/src/App.tsx                    route Players, bump on app:points, RulesScreen onSaved
src/renderer/src/screens/RulesScreen.tsx    onSaved prop
tests/fixtures/nflverse.ts                  inline mini CSVs (exact-value assertions) + crosswalk rows
tests/fixtures/nflverse/*.csv               real files trimmed to 50 rows (structural assertions); capture.sh
tests/fixtures/db.ts                        seedLeague(): migrated in-memory DB with league, teams, rosters, players, rules
tests/main/sources/{csv,nflverse}.test.ts
tests/main/sync/{step,identity,nflverseSync}.test.ts
tests/main/db/{migrate,statsRepo,playerIdsRepo,playersQuery}.test.ts
tests/main/scoring/{adapters,recompute}.test.ts
tests/renderer/lib/{format,playersView}.test.ts
```

---

### Task 1: CSV parser and nflverse source client

**Files:**
- Create: `src/main/sources/csv.ts`
- Create: `src/main/sources/nflverse-types.ts`
- Create: `src/main/sources/nflverse.ts`
- Create: `tests/fixtures/nflverse.ts`
- Create: `tests/fixtures/nflverse/capture.sh` (+ the five captured `.csv` files it writes)
- Test: `tests/main/sources/csv.test.ts`, `tests/main/sources/nflverse.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `parseCsv(text): Record<string, string>[]`, `numOrNull`, `strOrNull`; record types `PlayerWeekStatsRecord`, `TeamWeekStatsRecord`, `SnapCountRecord`, `GameRecord`, `CrosswalkRecord`; `ParseResult<T> = { records: T[]; skipped: number }`; `parsePlayerWeekStats`, `parseTeamWeekStats`, `parseSnapCounts`, `parseGames`, `parseCrosswalk`; `NflverseClient` (`getPlayerWeekStats(season) | null`, `getTeamWeekStats(season) | null`, `getSnapCounts(season) | null`, `getGames()`, `getCrosswalk()`), `createNflverseClient(options)`, `NflverseHttpError`. Test fixtures `playerStatsCsv`, `teamStatsCsv`, `snapCountsCsv`, `gamesCsv`, `crosswalkCsv` (strings).

- [ ] **Step 1: Write the failing CSV parser tests**

`tests/main/sources/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { numOrNull, parseCsv, strOrNull } from '@main/sources/csv'

describe('parseCsv', () => {
  it('parses header + rows into objects', () => {
    expect(parseCsv('a,b\n1,2\n3,4\n')).toEqual([
      { a: '1', b: '2' },
      { a: '3', b: '4' }
    ])
  })

  it('handles quoted fields with commas, doubled quotes, CRLF and BOM', () => {
    const text = '﻿name,url\r\n"Beckham, Odell","https://x/img?f_auto,q_auto"\r\n"He said ""hi""",""\r\n'
    expect(parseCsv(text)).toEqual([
      { name: 'Beckham, Odell', url: 'https://x/img?f_auto,q_auto' },
      { name: 'He said "hi"', url: '' }
    ])
  })

  it('ignores blank lines and a missing trailing newline', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([{ a: '1', b: '2' }])
  })

  it('fills missing trailing columns with empty strings', () => {
    expect(parseCsv('a,b,c\n1,2')).toEqual([{ a: '1', b: '2', c: '' }])
  })

  it('returns [] for empty input', () => {
    expect(parseCsv('')).toEqual([])
  })
})

describe('numOrNull / strOrNull', () => {
  it('treats "NA", empty and undefined as null', () => {
    expect(numOrNull('NA')).toBeNull()
    expect(numOrNull('')).toBeNull()
    expect(numOrNull(undefined)).toBeNull()
    expect(numOrNull('abc')).toBeNull()
    expect(numOrNull('0.08')).toBe(0.08)
    expect(numOrNull('-2')).toBe(-2)
    expect(strOrNull('NA')).toBeNull()
    expect(strOrNull('')).toBeNull()
    expect(strOrNull('LA')).toBe('LA')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/sources/csv.test.ts`
Expected: FAIL — cannot resolve `@main/sources/csv`.

- [ ] **Step 3: Write the CSV parser**

`src/main/sources/csv.ts`:

```ts
/**
 * Minimal RFC 4180 parser: quoted fields (nflverse quotes `headshot_url`, which contains commas),
 * doubled quotes inside quoted fields, LF or CRLF line ends, optional BOM. Returns one object per
 * data row keyed by the header. Blank lines are ignored; short rows are padded with ''.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  const [header, ...body] = rows
  if (!header) return []
  return body.map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => {
      obj[h] = r[idx] ?? ''
    })
    return obj
  })
}

/** R exports write missing values as the literal "NA" or an empty field. */
export function numOrNull(value: string | undefined): number | null {
  if (value === undefined || value === '' || value === 'NA') return null
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

export function strOrNull(value: string | undefined): string | null {
  return value === undefined || value === '' || value === 'NA' ? null : value
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main/sources/csv.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Write the inline fixtures and the capture script**

`tests/fixtures/nflverse.ts` — small hand-written files with the real column names. Rows are chosen so later tasks can assert exact numbers (Barkley week 1 = 18.4 PPR points under the `rules()` fixture; LA DEF week 1 allows 9 points):

```ts
/** Trimmed nflverse-shaped CSVs. Column names are real; values are invented for exact assertions. */

export const playerStatsCsv = `player_id,player_name,player_display_name,position,position_group,headshot_url,season,week,season_type,game_id,team,opponent_team,completions,attempts,passing_yards,passing_tds,passing_interceptions,carries,rushing_yards,rushing_tds,receptions,targets,receiving_yards,receiving_tds,fg_made,fg_made_list,fantasy_points_ppr
00-0034844,S.Barkley,Saquon Barkley,RB,RB,"https://x/img?f_auto,q_auto",2025,1,REG,2025_01_DAL_PHI,PHI,DAL,0,0,0,0,0,18,60,1,4,5,24,0,0,,20.4
00-0034844,S.Barkley,Saquon Barkley,RB,RB,"https://x/img?f_auto,q_auto",2025,2,REG,2025_02_PHI_KC,PHI,KC,0,0,0,0,0,22,88,0,2,3,10,0,0,,11.8
00-0036322,J.Jefferson,Justin Jefferson,WR,WR,"",2025,1,REG,2025_01_MIN_CHI,MIN,CHI,0,0,0,0,0,0,0,0,4,7,68,0,0,,10.8
00-0025565,N.Folk,Nick Folk,K,SPEC,"",2025,1,REG,2025_01_NYJ_PIT,NYJ,PIT,0,0,NA,0,0,0,0,0,0,0,0,0,1,45,0
,J.Nobody,John Nobody,WR,WR,"",2025,1,REG,2025_01_A_B,A,B,0,0,0,0,0,0,0,0,0,0,0,0,0,,0
00-0034844,S.Barkley,Saquon Barkley,RB,RB,"",2025,19,POST,2025_19_GB_PHI,PHI,GB,0,0,0,0,0,20,100,1,1,1,5,0,0,,17.5
`

export const teamStatsCsv = `season,week,team,season_type,game_id,opponent_team,passing_yards,sack_yards_lost,rushing_yards,def_sacks,def_interceptions,def_tds,timeouts
2025,1,PHI,REG,2025_01_DAL_PHI,DAL,220,12,150,3,1,0,3
2025,1,DAL,REG,2025_01_DAL_PHI,PHI,300,20,80,1,0,1,2
2025,1,LA,REG,2025_01_HOU_LA,HOU,180,5,120,4,2,1,3
2025,1,HOU,REG,2025_01_HOU_LA,LA,250,30,60,2,0,0,1
`

export const snapCountsCsv = `game_id,pfr_game_id,season,game_type,week,player,pfr_player_id,position,team,opponent,offense_snaps,offense_pct,defense_snaps,defense_pct,st_snaps,st_pct
2025_01_DAL_PHI,202509040phi,2025,REG,1,Saquon Barkley,BarkSa00,RB,PHI,DAL,55,0.83,0,0,2,0.07
2025_02_PHI_KC,202509140kan,2025,REG,2,Saquon Barkley,BarkSa00,RB,PHI,KC,60,0.9,0,0,0,0
2025_01_DAL_PHI,202509040phi,2025,REG,1,Ghost Player,,RB,PHI,DAL,1,0.01,0,0,0,0
`

export const gamesCsv = `game_id,season,game_type,week,gameday,weekday,gametime,away_team,away_score,home_team,home_score,location
2025_01_DAL_PHI,2025,REG,1,2025-09-04,Thursday,20:20,DAL,20,PHI,24,Home
2025_01_HOU_LA,2025,REG,1,2025-09-07,Sunday,16:05,HOU,9,LA,14,Home
2025_02_PHI_KC,2025,REG,2,2025-09-14,Sunday,16:25,PHI,20,KC,17,Home
2025_03_DAL_CHI,2025,REG,3,2025-09-21,Sunday,16:25,DAL,,CHI,,Home
2025_19_GB_PHI,2025,WC,19,2026-01-10,Saturday,16:30,GB,,PHI,,Home
`

export const crosswalkCsv = `mfl_id,sportradar_id,fantasypros_id,gsis_id,pff_id,sleeper_id,nfl_id,espn_id,yahoo_id,fleaflicker_id,cbs_id,pfr_id,cfbref_id,rotowire_id,rotoworld_id,ktc_id,stats_id,stats_global_id,fantasy_data_id,swish_id,name,merge_name,position,team,birthdate,age,draft_year,draft_round,draft_pick,draft_ovr,twitter_username,height,weight,college,db_season
13604,sr-1,17240,00-0034844,45164,4866,NA,3929630,NA,NA,NA,BarkSa00,saquon-barkley-1,NA,NA,NA,NA,NA,NA,NA,Saquon Barkley,saquon barkley,RB,PHI,1997-02-09,29.6,2018,1,2,2,NA,72,233,Penn State,2026
14836,sr-2,19236,00-0036322,NA,6794,NA,4262921,NA,NA,NA,JeffJu00,NA,NA,NA,NA,NA,NA,NA,NA,Justin Jefferson,justin jefferson,WR,MIN,2000-06-16,26.3,2020,1,22,22,NA,73,195,LSU,2026
15281,sr-3,NA,00-0037248,NA,NA,NA,NA,NA,NA,NA,CookJa01,NA,NA,NA,NA,NA,NA,NA,NA,James Cook,james cook,RB,BUF,1999-09-25,27,2022,2,31,63,NA,71,190,Georgia,2026
16000,NA,NA,00-0036900,NA,NA,NA,NA,NA,NA,NA,ChasJa00,NA,NA,NA,NA,NA,NA,NA,NA,Ja'Marr Chase,jamarr chase,WR,CIN,2000-03-01,26.5,2021,1,5,5,NA,72,201,LSU,2026
16001,NA,NA,NA,NA,9509,NA,NA,NA,NA,NA,RobiBi01,NA,NA,NA,NA,NA,NA,NA,NA,Bijan Robinson,bijan robinson,RB,ATL,2002-01-30,24.6,2023,1,8,8,NA,71,215,Texas,2026
`
```

`tests/fixtures/nflverse/capture.sh` (make it executable: `chmod +x`). It re-captures the real-file fixtures — the first 50 data rows of each 2025 file — for the structural tests:

```bash
#!/usr/bin/env bash
# Re-captures tests/fixtures/nflverse/*.csv from the live sources (first 50 data rows each).
# Usage: tests/fixtures/nflverse/capture.sh   (needs curl + gunzip; `head` closing the pipe is expected)
set -eu
dir="$(cd "$(dirname "$0")" && pwd)"
base=https://github.com/nflverse/nflverse-data/releases/download
curl -sL "$base/stats_player/stats_player_week_2025.csv.gz" | gunzip | head -n 51 > "$dir/stats_player_week.csv"
curl -sL "$base/stats_team/stats_team_week_2025.csv.gz" | gunzip | head -n 51 > "$dir/stats_team_week.csv"
curl -sL "$base/snap_counts/snap_counts_2025.csv.gz" | gunzip | head -n 51 > "$dir/snap_counts.csv"
curl -sL "$base/schedules/games.csv" | awk -F, 'NR == 1 || $2 == "2025"' | head -n 51 > "$dir/games.csv"
curl -sL https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv | head -n 51 > "$dir/db_playerids.csv"
wc -l "$dir"/*.csv
```

Run it once now: `tests/fixtures/nflverse/capture.sh` — expected: five files of 51 lines each. Commit the captured files with the task (they are test fixtures, ~150 KB total).

- [ ] **Step 6: Write the failing nflverse source tests**

`tests/main/sources/nflverse.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import {
  createNflverseClient,
  NflverseHttpError,
  parseCrosswalk,
  parseGames,
  parsePlayerWeekStats,
  parseSnapCounts,
  parseTeamWeekStats
} from '@main/sources/nflverse'
import * as fx from '../../fixtures/nflverse'

const real = (name: string): string =>
  readFileSync(new URL(`../../fixtures/nflverse/${name}`, import.meta.url), 'utf8')

describe('parsePlayerWeekStats', () => {
  it('maps dims, keeps numeric columns as stats, drops NA/list/text columns', () => {
    const { records, skipped } = parsePlayerWeekStats(fx.playerStatsCsv)
    expect(skipped).toBe(1) // the row with an empty player_id
    expect(records).toHaveLength(5)
    const barkley = records[0]
    expect(barkley).toMatchObject({
      gsisId: '00-0034844',
      season: 2025,
      week: 1,
      seasonType: 'REG',
      playerName: 'Saquon Barkley',
      position: 'RB',
      team: 'PHI',
      opponent: 'DAL'
    })
    expect(barkley.stats).toMatchObject({ carries: 18, rushing_yards: 60, rushing_tds: 1, receptions: 4 })
    expect(barkley.stats).not.toHaveProperty('headshot_url')
    expect(barkley.stats).not.toHaveProperty('player_name')
    const folk = records.find((r) => r.gsisId === '00-0025565')!
    expect(folk.stats).not.toHaveProperty('passing_yards') // NA
    expect(folk.stats).not.toHaveProperty('fg_made_list') // list column, even when single-valued
    expect(folk.stats.fg_made).toBe(1)
    expect(records.find((r) => r.week === 19)?.seasonType).toBe('POST')
  })

  it('parses the captured real file', () => {
    const { records, skipped } = parsePlayerWeekStats(real('stats_player_week.csv'))
    expect(skipped).toBe(0)
    expect(records).toHaveLength(50)
    for (const r of records) {
      expect(r.gsisId).toMatch(/^00-\d{7}$/)
      expect(r.season).toBe(2025)
      expect(r.week).toBeGreaterThan(0)
      expect(Object.keys(r.stats).length).toBeGreaterThan(50)
    }
  })
})

describe('parseTeamWeekStats', () => {
  it('parses inline and real files', () => {
    const { records } = parseTeamWeekStats(fx.teamStatsCsv)
    expect(records).toHaveLength(4)
    expect(records[2]).toMatchObject({ team: 'LA', season: 2025, week: 1, opponent: 'HOU' })
    expect(records[2].stats).toMatchObject({ def_sacks: 4, def_interceptions: 2, passing_yards: 180 })
    const realRows = parseTeamWeekStats(real('stats_team_week.csv')).records
    expect(realRows).toHaveLength(50)
    expect(realRows.every((r) => r.team.length >= 2 && r.team.length <= 3)).toBe(true)
  })
})

describe('parseSnapCounts', () => {
  it('skips rows without a pfr id and keeps fractions as-is', () => {
    const { records, skipped } = parseSnapCounts(fx.snapCountsCsv)
    expect(skipped).toBe(1)
    expect(records[0]).toMatchObject({
      pfrId: 'BarkSa00',
      season: 2025,
      week: 1,
      gameType: 'REG',
      team: 'PHI',
      opponent: 'DAL',
      position: 'RB',
      offenseSnaps: 55,
      offensePct: 0.83,
      stSnaps: 2
    })
    expect(parseSnapCounts(real('snap_counts.csv')).records).toHaveLength(50)
  })
})

describe('parseGames', () => {
  it('parses scores as numbers and future games as null', () => {
    const { records } = parseGames(fx.gamesCsv)
    expect(records).toHaveLength(5)
    expect(records[0]).toEqual({
      gameId: '2025_01_DAL_PHI',
      season: 2025,
      week: 1,
      gameType: 'REG',
      gameday: '2025-09-04',
      homeTeam: 'PHI',
      awayTeam: 'DAL',
      homeScore: 24,
      awayScore: 20
    })
    expect(records[3]).toMatchObject({ homeScore: null, awayScore: null })
    expect(records[4].gameType).toBe('WC')
    expect(parseGames(real('games.csv')).records.every((g) => g.season === 2025)).toBe(true)
  })
})

describe('parseCrosswalk', () => {
  it('turns NA into null and keeps the ids we join on', () => {
    const { records } = parseCrosswalk(fx.crosswalkCsv)
    expect(records).toHaveLength(5)
    expect(records[0]).toEqual({
      sleeperId: '4866',
      gsisId: '00-0034844',
      pfrId: 'BarkSa00',
      sportradarId: 'sr-1',
      espnId: '3929630',
      name: 'Saquon Barkley',
      position: 'RB'
    })
    expect(records[2].sleeperId).toBeNull()
    expect(records[4].gsisId).toBeNull()
    const realRows = parseCrosswalk(real('db_playerids.csv')).records
    expect(realRows).toHaveLength(50)
    expect(realRows.some((r) => r.sleeperId !== null && r.gsisId !== null)).toBe(true)
  })
})

describe('createNflverseClient', () => {
  function fetchOnce(responses: Response[]): typeof fetch {
    const queue = [...responses]
    return vi.fn(async () => queue.shift() ?? new Response('unexpected call', { status: 500 }))
  }

  it('returns null for an unpublished season (404)', async () => {
    const client = createNflverseClient({ fetchImpl: fetchOnce([new Response('', { status: 404 })]) })
    expect(await client.getPlayerWeekStats(2027)).toBeNull()
  })

  it('gunzips .csv.gz bodies and parses them', async () => {
    const body = gzipSync(Buffer.from(fx.teamStatsCsv))
    const client = createNflverseClient({ fetchImpl: fetchOnce([new Response(body)]) })
    const result = await client.getTeamWeekStats(2025)
    expect(result?.records).toHaveLength(4)
  })

  it('retries once on 503, then succeeds', async () => {
    const fetchImpl = fetchOnce([new Response('down', { status: 503 }), new Response(fx.gamesCsv)])
    const client = createNflverseClient({ fetchImpl, retryDelayMs: 0 })
    expect((await client.getGames()).records).toHaveLength(5)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('throws NflverseHttpError on other failures and on a missing required file', async () => {
    const client = createNflverseClient({ fetchImpl: fetchOnce([new Response('nope', { status: 403 })]) })
    await expect(client.getCrosswalk()).rejects.toBeInstanceOf(NflverseHttpError)
    const missing = createNflverseClient({ fetchImpl: fetchOnce([new Response('', { status: 404 })]) })
    await expect(missing.getGames()).rejects.toThrow(/404/)
  })

  it('builds the documented URLs', async () => {
    const fetchImpl = fetchOnce([new Response(fx.snapCountsCsv)])
    await createNflverseClient({ fetchImpl }).getSnapCounts(2026)
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2026.csv.gz',
      expect.anything()
    )
  })
})
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npx vitest run tests/main/sources/nflverse.test.ts`
Expected: FAIL — cannot resolve `@main/sources/nflverse`.

- [ ] **Step 8: Write the record types**

`src/main/sources/nflverse-types.ts`:

```ts
/** One row of `stats_player_week_{season}.csv`. Keyed by GSIS id. */
export interface PlayerWeekStatsRecord {
  gsisId: string
  season: number
  week: number
  /** `REG` | `POST` */
  seasonType: string
  playerName: string | null
  position: string | null
  team: string | null
  opponent: string | null
  /** Every numeric column keyed by its nflverse name; NA / empty / list columns are absent. */
  stats: Record<string, number>
}

/** One row of `stats_team_week_{season}.csv`: the team's own offense and its own defense. */
export interface TeamWeekStatsRecord {
  team: string
  season: number
  week: number
  seasonType: string
  opponent: string | null
  stats: Record<string, number>
}

/** One row of `snap_counts_{season}.csv`. Keyed by PFR id; percentages are 0–1 fractions. */
export interface SnapCountRecord {
  pfrId: string
  season: number
  week: number
  /** `REG` | `WC` | `DIV` | `CON` | `SB` */
  gameType: string
  player: string | null
  position: string | null
  team: string | null
  opponent: string | null
  offenseSnaps: number | null
  offensePct: number | null
  defenseSnaps: number | null
  defensePct: number | null
  stSnaps: number | null
  stPct: number | null
}

/** One row of `schedules/games.csv`. Scores are null until the game is played. */
export interface GameRecord {
  gameId: string
  season: number
  week: number
  gameType: string
  gameday: string | null
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
}

/** One row of the DynastyProcess `db_playerids.csv` crosswalk. `team` is deliberately not read (MFL codes). */
export interface CrosswalkRecord {
  sleeperId: string | null
  gsisId: string | null
  pfrId: string | null
  sportradarId: string | null
  espnId: string | null
  name: string | null
  position: string | null
}
```

- [ ] **Step 9: Write the parsers and the client**

`src/main/sources/nflverse.ts`:

```ts
import { gunzipSync } from 'node:zlib'
import { numOrNull, parseCsv, strOrNull } from './csv'
import type {
  CrosswalkRecord,
  GameRecord,
  PlayerWeekStatsRecord,
  SnapCountRecord,
  TeamWeekStatsRecord
} from './nflverse-types'

export interface ParseResult<T> {
  records: T[]
  /** Rows missing a key field (id, season or week); logged by the sync, never fatal. */
  skipped: number
}

const PLAYER_DIMS = new Set([
  'player_id',
  'player_name',
  'player_display_name',
  'position',
  'position_group',
  'headshot_url',
  'season',
  'week',
  'season_type',
  'game_id',
  'team',
  'opponent_team'
])
const TEAM_DIMS = new Set(['season', 'week', 'team', 'season_type', 'game_id', 'opponent_team'])
/** Text columns that would parse as a number when they hold a single value ("45"). */
const LIST_COLUMNS = new Set(['fg_made_list', 'fg_missed_list', 'fg_blocked_list'])

function numericColumns(row: Record<string, string>, dims: Set<string>): Record<string, number> {
  const stats: Record<string, number> = {}
  for (const [col, raw] of Object.entries(row)) {
    if (dims.has(col) || LIST_COLUMNS.has(col)) continue
    const n = numOrNull(raw)
    if (n !== null) stats[col] = n
  }
  return stats
}

export function parsePlayerWeekStats(text: string): ParseResult<PlayerWeekStatsRecord> {
  const records: PlayerWeekStatsRecord[] = []
  let skipped = 0
  for (const row of parseCsv(text)) {
    const gsisId = strOrNull(row.player_id)
    const season = numOrNull(row.season)
    const week = numOrNull(row.week)
    if (!gsisId || season === null || week === null) {
      skipped++
      continue
    }
    records.push({
      gsisId,
      season,
      week,
      seasonType: row.season_type ?? '',
      playerName: strOrNull(row.player_display_name),
      position: strOrNull(row.position),
      team: strOrNull(row.team),
      opponent: strOrNull(row.opponent_team),
      stats: numericColumns(row, PLAYER_DIMS)
    })
  }
  return { records, skipped }
}

export function parseTeamWeekStats(text: string): ParseResult<TeamWeekStatsRecord> {
  const records: TeamWeekStatsRecord[] = []
  let skipped = 0
  for (const row of parseCsv(text)) {
    const team = strOrNull(row.team)
    const season = numOrNull(row.season)
    const week = numOrNull(row.week)
    if (!team || season === null || week === null) {
      skipped++
      continue
    }
    records.push({
      team,
      season,
      week,
      seasonType: row.season_type ?? '',
      opponent: strOrNull(row.opponent_team),
      stats: numericColumns(row, TEAM_DIMS)
    })
  }
  return { records, skipped }
}

export function parseSnapCounts(text: string): ParseResult<SnapCountRecord> {
  const records: SnapCountRecord[] = []
  let skipped = 0
  for (const row of parseCsv(text)) {
    const pfrId = strOrNull(row.pfr_player_id)
    const season = numOrNull(row.season)
    const week = numOrNull(row.week)
    if (!pfrId || season === null || week === null) {
      skipped++
      continue
    }
    records.push({
      pfrId,
      season,
      week,
      gameType: row.game_type ?? '',
      player: strOrNull(row.player),
      position: strOrNull(row.position),
      team: strOrNull(row.team),
      opponent: strOrNull(row.opponent),
      offenseSnaps: numOrNull(row.offense_snaps),
      offensePct: numOrNull(row.offense_pct),
      defenseSnaps: numOrNull(row.defense_snaps),
      defensePct: numOrNull(row.defense_pct),
      stSnaps: numOrNull(row.st_snaps),
      stPct: numOrNull(row.st_pct)
    })
  }
  return { records, skipped }
}

export function parseGames(text: string): ParseResult<GameRecord> {
  const records: GameRecord[] = []
  let skipped = 0
  for (const row of parseCsv(text)) {
    const gameId = strOrNull(row.game_id)
    const season = numOrNull(row.season)
    const week = numOrNull(row.week)
    const homeTeam = strOrNull(row.home_team)
    const awayTeam = strOrNull(row.away_team)
    if (!gameId || season === null || week === null || !homeTeam || !awayTeam) {
      skipped++
      continue
    }
    records.push({
      gameId,
      season,
      week,
      gameType: row.game_type ?? '',
      gameday: strOrNull(row.gameday),
      homeTeam,
      awayTeam,
      homeScore: numOrNull(row.home_score),
      awayScore: numOrNull(row.away_score)
    })
  }
  return { records, skipped }
}

export function parseCrosswalk(text: string): ParseResult<CrosswalkRecord> {
  const records = parseCsv(text).map((row) => ({
    sleeperId: strOrNull(row.sleeper_id),
    gsisId: strOrNull(row.gsis_id)?.trim() ?? null,
    pfrId: strOrNull(row.pfr_id),
    sportradarId: strOrNull(row.sportradar_id),
    espnId: strOrNull(row.espn_id),
    name: strOrNull(row.name),
    position: strOrNull(row.position)
  }))
  return { records, skipped: 0 }
}

export interface NflverseClient {
  /** `null` when the season's file is not published yet (HTTP 404). */
  getPlayerWeekStats(season: number): Promise<ParseResult<PlayerWeekStatsRecord> | null>
  getTeamWeekStats(season: number): Promise<ParseResult<TeamWeekStatsRecord> | null>
  getSnapCounts(season: number): Promise<ParseResult<SnapCountRecord> | null>
  getGames(): Promise<ParseResult<GameRecord>>
  getCrosswalk(): Promise<ParseResult<CrosswalkRecord>>
}

export class NflverseHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`nflverse ${status} for ${url}`)
    this.name = 'NflverseHttpError'
  }
}

export interface NflverseClientOptions {
  fetchImpl?: typeof fetch
  releasesUrl?: string
  crosswalkUrl?: string
  timeoutMs?: number
  retryDelayMs?: number
}

export const NFLVERSE_RELEASES_URL = 'https://github.com/nflverse/nflverse-data/releases/download'
export const CROSSWALK_URL =
  'https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv'

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

export function createNflverseClient(options: NflverseClientOptions = {}): NflverseClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const releasesUrl = options.releasesUrl ?? NFLVERSE_RELEASES_URL
  const crosswalkUrl = options.crosswalkUrl ?? CROSSWALK_URL
  const timeoutMs = options.timeoutMs ?? 30_000
  const retryDelayMs = options.retryDelayMs ?? 1_000

  /** Follows GitHub's redirect (fetch default), gunzips `.gz` bodies (detected by magic bytes). */
  async function getText(url: string): Promise<string | null> {
    for (let attempt = 0; ; attempt++) {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (res.status === 404) return null
      if (res.ok) {
        const bytes = new Uint8Array(await res.arrayBuffer())
        const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
        return new TextDecoder().decode(gzipped ? gunzipSync(bytes) : bytes)
      }
      if (attempt === 0 && isRetryable(res.status)) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
        continue
      }
      throw new NflverseHttpError(res.status, url)
    }
  }

  const release = (tag: string, file: string): string => `${releasesUrl}/${tag}/${file}`

  async function optional<T>(
    url: string,
    parse: (text: string) => ParseResult<T>
  ): Promise<ParseResult<T> | null> {
    const text = await getText(url)
    return text === null ? null : parse(text)
  }

  async function required<T>(
    url: string,
    parse: (text: string) => ParseResult<T>
  ): Promise<ParseResult<T>> {
    const result = await optional(url, parse)
    if (!result) throw new NflverseHttpError(404, url)
    return result
  }

  return {
    getPlayerWeekStats: (season) =>
      optional(release('stats_player', `stats_player_week_${season}.csv.gz`), parsePlayerWeekStats),
    getTeamWeekStats: (season) =>
      optional(release('stats_team', `stats_team_week_${season}.csv.gz`), parseTeamWeekStats),
    getSnapCounts: (season) =>
      optional(release('snap_counts', `snap_counts_${season}.csv.gz`), parseSnapCounts),
    getGames: () => required(release('schedules', 'games.csv'), parseGames),
    getCrosswalk: () => required(crosswalkUrl, parseCrosswalk)
  }
}
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npx vitest run tests/main/sources`
Expected: all pass (6 csv + 11 nflverse).

- [ ] **Step 11: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/sources/csv.ts src/main/sources/nflverse-types.ts src/main/sources/nflverse.ts tests/fixtures/nflverse.ts tests/fixtures/nflverse tests/main/sources/csv.test.ts tests/main/sources/nflverse.test.ts
git commit -m "feat(sources): add nflverse csv client and parsers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Extract the sync step runner (`SkipStep`, explicit freshness, step messages)

**Files:**
- Create: `src/main/sync/step.ts`
- Modify: `src/main/sync/sleeperSync.ts` (remove the moved definitions, use `runStep` from `step.ts`)
- Modify: `src/main/ipc/handlers.ts:12-18` (import `SyncDeps` from `@main/sync/step`)
- Test: `tests/main/sync/step.test.ts`; existing `tests/main/sync/sleeperSync.test.ts` must stay green unchanged.

**Interfaces:**
- Consumes: `startSync`, `finishSync`, `getLastSync` (`@main/db/repos/syncLog`), `SleeperClient`.
- Produces: `SyncDeps { db, sleeper, now?, onStep? }`, `RefreshOptions { force? }`, `class SkipStep extends Error`, `type StepOutcome = number | { rows: number; message: string | null }`, `nowOf(deps): Date`, `isFresh(db, source, freshnessMs, now): boolean`, `runStep(deps, source, freshnessMs, force, fn: () => Promise<StepOutcome>): Promise<SyncLogEntry>`. `sleeperSync.ts` keeps exporting `SOURCE_STATE`, `SOURCE_LEAGUE`, `SOURCE_PLAYERS`, `SOURCE_RULES`, `FRESHNESS_MS`, `importLeague`, `refreshSleeper`, `reimportRules` and re-exports `SyncDeps` / `RefreshOptions` types.

- [ ] **Step 1: Write the failing step-runner tests**

`tests/main/sync/step.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getLastSync } from '@main/db/repos/syncLog'
import type { SleeperClient } from '@main/sources/sleeper'
import { isFresh, runStep, SkipStep, type SyncDeps } from '@main/sync/step'

describe('runStep', () => {
  let db: Db
  let clock: Date
  let deps: SyncDeps
  const HOUR = 3_600_000

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    clock = new Date('2026-09-17T12:00:00.000Z')
    deps = { db, sleeper: {} as SleeperClient, now: () => clock }
  })

  it('records ok with the returned row count', async () => {
    const entry = await runStep(deps, 'x', HOUR, false, async () => 7)
    expect(entry).toMatchObject({ source: 'x', status: 'ok', rowsWritten: 7, message: null })
    expect(getLastSync(db, 'x', 'ok')?.id).toBe(entry.id)
  })

  it('records ok with a message when the step returns one', async () => {
    const entry = await runStep(deps, 'x', HOUR, false, async () => ({ rows: 3, message: '2 unresolved' }))
    expect(entry).toMatchObject({ status: 'ok', rowsWritten: 3, message: '2 unresolved' })
  })

  it('records skipped when the step throws SkipStep', async () => {
    const entry = await runStep(deps, 'x', HOUR, false, async () => {
      throw new SkipStep('2027 not published yet')
    })
    expect(entry).toMatchObject({ status: 'skipped', message: '2027 not published yet', rowsWritten: 0 })
  })

  it('records error for any other throw', async () => {
    const entry = await runStep(deps, 'x', HOUR, false, async () => {
      throw new Error('boom')
    })
    expect(entry).toMatchObject({ status: 'error', message: 'boom' })
  })

  it('skips as fresh inside the window, runs again after it, and force ignores the window', async () => {
    await runStep(deps, 'x', HOUR, false, async () => 1)
    clock = new Date(clock.getTime() + 30 * 60_000)
    expect(isFresh(db, 'x', HOUR, clock)).toBe(true)
    expect(await runStep(deps, 'x', HOUR, false, async () => 1)).toMatchObject({ status: 'skipped', message: 'fresh' })
    expect(await runStep(deps, 'x', HOUR, true, async () => 1)).toMatchObject({ status: 'ok' })
    clock = new Date(clock.getTime() + 2 * HOUR)
    expect(await runStep(deps, 'x', HOUR, false, async () => 1)).toMatchObject({ status: 'ok' })
  })

  it('never treats a step as fresh when freshnessMs is 0', async () => {
    await runStep(deps, 'x', 0, false, async () => 1)
    expect(await runStep(deps, 'x', 0, false, async () => 1)).toMatchObject({ status: 'ok' })
  })

  it('calls onStep with the finished entry and survives a throwing listener', async () => {
    const seen: string[] = []
    const entry = await runStep(
      { ...deps, onStep: (e) => { seen.push(e.status); throw new Error('ui crashed') } },
      'x',
      HOUR,
      false,
      async () => 1
    )
    expect(entry.status).toBe('ok')
    expect(seen).toEqual(['ok'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/sync/step.test.ts`
Expected: FAIL — cannot resolve `@main/sync/step`.

- [ ] **Step 3: Create `step.ts`**

`src/main/sync/step.ts`:

```ts
import type { Db } from '@main/db/connection'
import { finishSync, getLastSync, startSync } from '@main/db/repos/syncLog'
import type { SleeperClient } from '@main/sources/sleeper'
import type { SyncLogEntry } from '@shared/types'

export interface SyncDeps {
  db: Db
  sleeper: SleeperClient
  now?: () => Date
  onStep?: (entry: SyncLogEntry) => void
}

export interface RefreshOptions {
  force?: boolean
}

/** Thrown by a step body to record `skipped` (e.g. upstream file not published yet) instead of `error`. */
export class SkipStep extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkipStep'
  }
}

/** A step returns the rows it wrote, optionally with a message shown in the status bar / sync log. */
export type StepOutcome = number | { rows: number; message: string | null }

export function nowOf(deps: SyncDeps): Date {
  return (deps.now ?? (() => new Date()))()
}

export function isFresh(db: Db, source: string, freshnessMs: number, now: Date): boolean {
  const last = getLastSync(db, source, 'ok')
  if (!last?.finishedAt) return false
  return now.getTime() - new Date(last.finishedAt).getTime() < freshnessMs
}

/**
 * Runs one sync step under a `sync_log` row. `freshnessMs` of 0 means "always run".
 * The step body is responsible for its own transaction; a throw rolls that back and is
 * recorded here as `error` (or `skipped` for `SkipStep`). Never throws.
 */
export async function runStep(
  deps: SyncDeps,
  source: string,
  freshnessMs: number,
  force: boolean,
  fn: () => Promise<StepOutcome>
): Promise<SyncLogEntry> {
  const id = startSync(deps.db, source, nowOf(deps).toISOString())
  let entry: SyncLogEntry
  if (!force && isFresh(deps.db, source, freshnessMs, nowOf(deps))) {
    entry = finishSync(deps.db, id, 'skipped', nowOf(deps).toISOString(), 'fresh', 0)
  } else {
    try {
      const outcome = await fn()
      const rows = typeof outcome === 'number' ? outcome : outcome.rows
      const message = typeof outcome === 'number' ? null : outcome.message
      entry = finishSync(deps.db, id, 'ok', nowOf(deps).toISOString(), message, rows)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const status = err instanceof SkipStep ? 'skipped' : 'error'
      entry = finishSync(deps.db, id, status, nowOf(deps).toISOString(), message, 0)
    }
  }
  try {
    deps.onStep?.(entry)
  } catch {
    // progress reporting must never affect the sync itself
  }
  return entry
}
```

- [ ] **Step 4: Point `sleeperSync.ts` at it**

In `src/main/sync/sleeperSync.ts`:

1. Replace the import of `finishSync, getLastSync, startSync` from `@main/db/repos/syncLog` with `import { finishSync, startSync } from '@main/db/repos/syncLog'` (still used by `reimportRules`).
2. Add `import { nowOf, runStep as runSyncStep, type RefreshOptions, type SyncDeps } from './step'` and `export type { RefreshOptions, SyncDeps } from './step'`.
3. Delete the local `SyncDeps`, `RefreshOptions`, `nowOf`, `isFresh` and `runStep` definitions (everything from `export interface SyncDeps {` through the end of the old `runStep` function).
4. Add, where the old `runStep` was:

```ts
function runStep(
  deps: SyncDeps,
  source: string,
  force: boolean,
  fn: () => Promise<number>
): Promise<SyncLogEntry> {
  return runSyncStep(deps, source, FRESHNESS_MS[source] ?? 0, force, fn)
}
```

`FRESHNESS_MS`, the `SOURCE_*` constants, `syncState`, `syncLeague`, `syncPlayers`, `importLeague`, `refreshSleeper`, `reimportRules` stay as they are. Delete the now-unused `import type { SleeperClient } from '@main/sources/sleeper'` line (it only served the moved `SyncDeps`).

In `src/main/ipc/handlers.ts` change the sleeperSync import to:

```ts
import { importLeague, refreshSleeper, reimportRules, SOURCE_LEAGUE } from '@main/sync/sleeperSync'
import type { SyncDeps } from '@main/sync/step'
```

- [ ] **Step 5: Run all tests to verify they pass**

Run: `npm test`
Expected: the 7 new step tests pass and the 81 existing tests (including `sleeperSync.test.ts`) still pass — 88 total.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/sync/step.ts src/main/sync/sleeperSync.ts src/main/ipc/handlers.ts tests/main/sync/step.test.ts
git commit -m "refactor(sync): extract step runner with skip support

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Migration 003 and the stats repositories

**Files:**
- Create: `src/main/db/migrations/003_stats.sql`
- Modify: `src/main/db/migrations/index.ts`
- Create: `src/main/db/repos/stats.ts`
- Modify: `tests/main/db/migrate.test.ts` (version 3, new tables)
- Test: `tests/main/db/statsRepo.test.ts`

**Interfaces:**
- Consumes: record types from Task 1 (`PlayerWeekStatsRecord`, `TeamWeekStatsRecord`, `SnapCountRecord`, `GameRecord`), `parse*` functions for test setup.
- Produces: tables `crosswalk`, `player_ids`, `player_week_stats`, `team_week_stats`, `player_week_snaps`, `games`, `player_week_points`; repo functions `replacePlayerWeekStats(db, season, records, updatedAt): number`, `replaceTeamWeekStats(db, season, records, updatedAt): number`, `replaceSnaps(db, season, records, updatedAt): number`, `upsertGames(db, records, updatedAt): number`, `listPlayerWeeks(db, gsisId, season): PlayerWeekRow[]`, `listAllPlayerWeeks(db): PlayerWeekRow[]`, `listTeamWeeks(db): TeamWeekRow[]`, `listGames(db): GameRow[]`, `listSnaps(db, pfrId, season): SnapRow[]`, `teamByeWeeks(db, season): Map<string, number>`. Row types `PlayerWeekRow { gsisId, season, week, team, opponent, position, stats }`, `TeamWeekRow { team, season, week, opponent, stats }`, `GameRow { gameId, season, week, gameType, homeTeam, awayTeam, homeScore, awayScore }`, `SnapRow { week, offenseSnaps, offensePct, defenseSnaps, defensePct, stSnaps, stPct }`. (The `crosswalk`, `player_ids` and `player_week_points` repos are Tasks 4 and 6.)

- [ ] **Step 1: Update the migration test and write the failing repo tests**

In `tests/main/db/migrate.test.ts`: change `expect(version).toBe(2)` to `expect(version).toBe(3)`, `expect(row.n).toBe(2)` to `expect(row.n).toBe(3)`, and add to the `arrayContaining` list:

```ts
        'crosswalk',
        'player_ids',
        'player_week_stats',
        'team_week_stats',
        'player_week_snaps',
        'games',
        'player_week_points',
```

`tests/main/db/statsRepo.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import {
  listAllPlayerWeeks,
  listGames,
  listPlayerWeeks,
  listSnaps,
  listTeamWeeks,
  replacePlayerWeekStats,
  replaceSnaps,
  replaceTeamWeekStats,
  teamByeWeeks,
  upsertGames
} from '@main/db/repos/stats'
import {
  parseGames,
  parsePlayerWeekStats,
  parseSnapCounts,
  parseTeamWeekStats
} from '@main/sources/nflverse'
import * as fx from '../../fixtures/nflverse'

const TS = '2026-09-17T12:00:00.000Z'
const reg = parsePlayerWeekStats(fx.playerStatsCsv).records.filter((r) => r.seasonType === 'REG')

describe('stats repos', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('replacePlayerWeekStats replaces a season idempotently and round-trips stats', () => {
    expect(replacePlayerWeekStats(db, 2025, reg, TS)).toBe(4)
    expect(replacePlayerWeekStats(db, 2025, reg, TS)).toBe(4)
    expect(listAllPlayerWeeks(db)).toHaveLength(4)
    const weeks = listPlayerWeeks(db, '00-0034844', 2025)
    expect(weeks.map((w) => w.week)).toEqual([1, 2])
    expect(weeks[0]).toMatchObject({ team: 'PHI', opponent: 'DAL', position: 'RB' })
    expect(weeks[0].stats).toMatchObject({ rushing_yards: 60, receptions: 4 })
    expect(listPlayerWeeks(db, '00-0034844', 2024)).toEqual([])
  })

  it('replacePlayerWeekStats only touches the given season', () => {
    replacePlayerWeekStats(db, 2025, reg, TS)
    replacePlayerWeekStats(db, 2024, reg.map((r) => ({ ...r, season: 2024 })), TS)
    replacePlayerWeekStats(db, 2025, [], TS)
    expect(listAllPlayerWeeks(db).map((r) => r.season)).toEqual([2024, 2024, 2024, 2024])
  })

  it('replaceTeamWeekStats and listTeamWeeks', () => {
    const teams = parseTeamWeekStats(fx.teamStatsCsv).records
    expect(replaceTeamWeekStats(db, 2025, teams, TS)).toBe(4)
    const rows = listTeamWeeks(db)
    expect(rows.map((r) => r.team).sort()).toEqual(['DAL', 'HOU', 'LA', 'PHI'])
    expect(rows.find((r) => r.team === 'LA')).toMatchObject({ opponent: 'HOU', week: 1 })
    expect(rows.find((r) => r.team === 'LA')?.stats.def_sacks).toBe(4)
  })

  it('replaceSnaps and listSnaps', () => {
    const snaps = parseSnapCounts(fx.snapCountsCsv).records
    expect(replaceSnaps(db, 2025, snaps, TS)).toBe(2)
    expect(listSnaps(db, 'BarkSa00', 2025)).toEqual([
      { week: 1, offenseSnaps: 55, offensePct: 0.83, defenseSnaps: 0, defensePct: 0, stSnaps: 2, stPct: 0.07 },
      { week: 2, offenseSnaps: 60, offensePct: 0.9, defenseSnaps: 0, defensePct: 0, stSnaps: 0, stPct: 0 }
    ])
  })

  it('upsertGames updates scores on conflict', () => {
    const games = parseGames(fx.gamesCsv).records
    expect(upsertGames(db, games, TS)).toBe(5)
    const played = games.map((g) => (g.gameId === '2025_03_DAL_CHI' ? { ...g, homeScore: 31, awayScore: 10 } : g))
    upsertGames(db, played, TS)
    expect(listGames(db)).toHaveLength(5)
    expect(listGames(db).find((g) => g.gameId === '2025_03_DAL_CHI')).toMatchObject({ homeScore: 31, awayScore: 10 })
  })

  it('teamByeWeeks finds the regular-season week a team has no game', () => {
    upsertGames(
      db,
      [
        { gameId: 'g1', season: 2025, week: 1, gameType: 'REG', gameday: null, homeTeam: 'PHI', awayTeam: 'DAL', homeScore: null, awayScore: null },
        { gameId: 'g2', season: 2025, week: 2, gameType: 'REG', gameday: null, homeTeam: 'KC', awayTeam: 'PHI', homeScore: null, awayScore: null },
        { gameId: 'g3', season: 2025, week: 2, gameType: 'REG', gameday: null, homeTeam: 'DAL', awayTeam: 'LA', homeScore: null, awayScore: null },
        { gameId: 'g4', season: 2025, week: 3, gameType: 'REG', gameday: null, homeTeam: 'PHI', awayTeam: 'LA', homeScore: null, awayScore: null },
        { gameId: 'g5', season: 2025, week: 3, gameType: 'REG', gameday: null, homeTeam: 'KC', awayTeam: 'DAL', homeScore: null, awayScore: null },
        { gameId: 'p1', season: 2025, week: 19, gameType: 'WC', gameday: null, homeTeam: 'KC', awayTeam: 'LA', homeScore: null, awayScore: null }
      ],
      TS
    )
    const byes = teamByeWeeks(db, 2025)
    expect(byes.get('KC')).toBe(1)
    expect(byes.get('LA')).toBe(1)
    expect(byes.has('PHI')).toBe(false)
    expect(byes.has('DAL')).toBe(false)
    expect(teamByeWeeks(db, 2024).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/db`
Expected: `migrate.test.ts` fails on version 2 ≠ 3; `statsRepo.test.ts` fails to resolve `@main/db/repos/stats`.

- [ ] **Step 3: Write the migration**

`src/main/db/migrations/003_stats.sql`:

```sql
-- DynastyProcess id crosswalk, kept so identities can be re-resolved without re-downloading.
CREATE TABLE crosswalk (
  sleeper_id TEXT,
  gsis_id TEXT,
  pfr_id TEXT,
  sportradar_id TEXT,
  espn_id TEXT,
  name TEXT,
  position TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_crosswalk_sleeper ON crosswalk(sleeper_id);
CREATE INDEX idx_crosswalk_gsis ON crosswalk(gsis_id);

-- Sleeper player_id -> nflverse ids. nflverse_team is set for team defenses only.
CREATE TABLE player_ids (
  player_id TEXT PRIMARY KEY REFERENCES players(player_id) ON DELETE CASCADE,
  gsis_id TEXT,
  pfr_id TEXT,
  sportradar_id TEXT,
  espn_id TEXT,
  nflverse_team TEXT,
  resolution TEXT NOT NULL CHECK (resolution IN ('crosswalk', 'sleeper_gsis', 'sportradar', 'name', 'team', 'unresolved')),
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_player_ids_gsis ON player_ids(gsis_id);
CREATE INDEX idx_player_ids_team ON player_ids(nflverse_team);

-- Numeric nflverse columns live in stats_json keyed by column name; the file's column set changes between seasons.
CREATE TABLE player_week_stats (
  gsis_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  season_type TEXT NOT NULL,
  player_name TEXT,
  position TEXT,
  team TEXT,
  opponent TEXT,
  stats_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (gsis_id, season, week)
);
CREATE INDEX idx_player_week_stats_season ON player_week_stats(season, week);

CREATE TABLE team_week_stats (
  team TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  season_type TEXT NOT NULL,
  opponent TEXT,
  stats_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team, season, week)
);

CREATE TABLE player_week_snaps (
  pfr_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  team TEXT,
  opponent TEXT,
  position TEXT,
  offense_snaps INTEGER,
  offense_pct REAL,
  defense_snaps INTEGER,
  defense_pct REAL,
  st_snaps INTEGER,
  st_pct REAL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (pfr_id, season, week)
);

CREATE TABLE games (
  game_id TEXT PRIMARY KEY,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  game_type TEXT NOT NULL,
  gameday TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_score INTEGER,
  away_score INTEGER,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_games_season ON games(season, week);

-- Materialized fantasy points under the league's rules; rebuilt by recomputePoints.
CREATE TABLE player_week_points (
  league_id TEXT NOT NULL REFERENCES leagues(league_id) ON DELETE CASCADE,
  player_id TEXT NOT NULL,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  points REAL NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (league_id, player_id, season, week)
);
CREATE INDEX idx_player_week_points_week ON player_week_points(league_id, season, week);
```

`src/main/db/migrations/index.ts` — add `import statsSql from './003_stats.sql?raw'` and `{ version: 3, name: 'stats', sql: statsSql }` to the array.

- [ ] **Step 4: Write the repository**

`src/main/db/repos/stats.ts`:

```ts
import type {
  GameRecord,
  PlayerWeekStatsRecord,
  SnapCountRecord,
  TeamWeekStatsRecord
} from '@main/sources/nflverse-types'
import type { Db } from '../connection'

export interface PlayerWeekRow {
  gsisId: string
  season: number
  week: number
  team: string | null
  opponent: string | null
  position: string | null
  stats: Record<string, number>
}

export interface TeamWeekRow {
  team: string
  season: number
  week: number
  opponent: string | null
  stats: Record<string, number>
}

export interface GameRow {
  gameId: string
  season: number
  week: number
  gameType: string
  homeTeam: string
  awayTeam: string
  homeScore: number | null
  awayScore: number | null
}

export interface SnapRow {
  week: number
  offenseSnaps: number | null
  offensePct: number | null
  defenseSnaps: number | null
  defensePct: number | null
  stSnaps: number | null
  stPct: number | null
}

interface PlayerWeekDbRow {
  gsis_id: string
  season: number
  week: number
  team: string | null
  opponent: string | null
  position: string | null
  stats_json: string
}

interface TeamWeekDbRow {
  team: string
  season: number
  week: number
  opponent: string | null
  stats_json: string
}

interface GameDbRow {
  game_id: string
  season: number
  week: number
  game_type: string
  home_team: string
  away_team: string
  home_score: number | null
  away_score: number | null
}

interface SnapDbRow {
  week: number
  offense_snaps: number | null
  offense_pct: number | null
  defense_snaps: number | null
  defense_pct: number | null
  st_snaps: number | null
  st_pct: number | null
}

const PLAYER_WEEK_SELECT =
  'SELECT gsis_id, season, week, team, opponent, position, stats_json FROM player_week_stats'

function toPlayerWeek(r: PlayerWeekDbRow): PlayerWeekRow {
  return {
    gsisId: r.gsis_id,
    season: r.season,
    week: r.week,
    team: r.team,
    opponent: r.opponent,
    position: r.position,
    stats: JSON.parse(r.stats_json) as Record<string, number>
  }
}

/** Full-file replace for one season (the nflverse file is regenerated whole). Wrap in `withTransaction`. */
export function replacePlayerWeekStats(
  db: Db,
  season: number,
  records: PlayerWeekStatsRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM player_week_stats WHERE season = ?').run(season)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO player_week_stats
       (gsis_id, season, week, season_type, player_name, position, team, opponent, stats_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(
      r.gsisId,
      season,
      r.week,
      r.seasonType,
      r.playerName,
      r.position,
      r.team,
      r.opponent,
      JSON.stringify(r.stats),
      updatedAt
    )
    written++
  }
  return written
}

export function replaceTeamWeekStats(
  db: Db,
  season: number,
  records: TeamWeekStatsRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM team_week_stats WHERE season = ?').run(season)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO team_week_stats (team, season, week, season_type, opponent, stats_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(r.team, season, r.week, r.seasonType, r.opponent, JSON.stringify(r.stats), updatedAt)
    written++
  }
  return written
}

export function replaceSnaps(
  db: Db,
  season: number,
  records: SnapCountRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM player_week_snaps WHERE season = ?').run(season)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO player_week_snaps
       (pfr_id, season, week, team, opponent, position, offense_snaps, offense_pct, defense_snaps, defense_pct,
        st_snaps, st_pct, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(
      r.pfrId,
      season,
      r.week,
      r.team,
      r.opponent,
      r.position,
      r.offenseSnaps,
      r.offensePct,
      r.defenseSnaps,
      r.defensePct,
      r.stSnaps,
      r.stPct,
      updatedAt
    )
    written++
  }
  return written
}

/** Games are keyed globally; scores fill in as the season progresses. */
export function upsertGames(db: Db, records: GameRecord[], updatedAt: string): number {
  const stmt = db.prepare(
    `INSERT INTO games (game_id, season, week, game_type, gameday, home_team, away_team, home_score, away_score, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(game_id) DO UPDATE SET season = excluded.season, week = excluded.week,
       game_type = excluded.game_type, gameday = excluded.gameday, home_team = excluded.home_team,
       away_team = excluded.away_team, home_score = excluded.home_score, away_score = excluded.away_score,
       updated_at = excluded.updated_at`
  )
  let written = 0
  for (const g of records) {
    stmt.run(
      g.gameId,
      g.season,
      g.week,
      g.gameType,
      g.gameday,
      g.homeTeam,
      g.awayTeam,
      g.homeScore,
      g.awayScore,
      updatedAt
    )
    written++
  }
  return written
}

export function listPlayerWeeks(db: Db, gsisId: string, season: number): PlayerWeekRow[] {
  const rows = db
    .prepare(`${PLAYER_WEEK_SELECT} WHERE gsis_id = ? AND season = ? ORDER BY week`)
    .all(gsisId, season) as unknown as PlayerWeekDbRow[]
  return rows.map(toPlayerWeek)
}

export function listAllPlayerWeeks(db: Db): PlayerWeekRow[] {
  const rows = db
    .prepare(`${PLAYER_WEEK_SELECT} ORDER BY season, week`)
    .all() as unknown as PlayerWeekDbRow[]
  return rows.map(toPlayerWeek)
}

export function listTeamWeeks(db: Db): TeamWeekRow[] {
  const rows = db
    .prepare('SELECT team, season, week, opponent, stats_json FROM team_week_stats ORDER BY season, week')
    .all() as unknown as TeamWeekDbRow[]
  return rows.map((r) => ({
    team: r.team,
    season: r.season,
    week: r.week,
    opponent: r.opponent,
    stats: JSON.parse(r.stats_json) as Record<string, number>
  }))
}

export function listGames(db: Db): GameRow[] {
  const rows = db
    .prepare(
      'SELECT game_id, season, week, game_type, home_team, away_team, home_score, away_score FROM games ORDER BY season, week'
    )
    .all() as unknown as GameDbRow[]
  return rows.map((r) => ({
    gameId: r.game_id,
    season: r.season,
    week: r.week,
    gameType: r.game_type,
    homeTeam: r.home_team,
    awayTeam: r.away_team,
    homeScore: r.home_score,
    awayScore: r.away_score
  }))
}

export function listSnaps(db: Db, pfrId: string, season: number): SnapRow[] {
  const rows = db
    .prepare(
      `SELECT week, offense_snaps, offense_pct, defense_snaps, defense_pct, st_snaps, st_pct
       FROM player_week_snaps WHERE pfr_id = ? AND season = ? ORDER BY week`
    )
    .all(pfrId, season) as unknown as SnapDbRow[]
  return rows.map((r) => ({
    week: r.week,
    offenseSnaps: r.offense_snaps,
    offensePct: r.offense_pct,
    defenseSnaps: r.defense_snaps,
    defensePct: r.defense_pct,
    stSnaps: r.st_snaps,
    stPct: r.st_pct
  }))
}

/**
 * nflverse team code -> bye week, derived from the regular-season schedule: the first week
 * (1..max scheduled week) in which the team has no game. Empty when no games are stored.
 */
export function teamByeWeeks(db: Db, season: number): Map<string, number> {
  const rows = db
    .prepare("SELECT week, home_team, away_team FROM games WHERE season = ? AND game_type = 'REG'")
    .all(season) as unknown as { week: number; home_team: string; away_team: string }[]
  const played = new Map<string, Set<number>>()
  let maxWeek = 0
  for (const r of rows) {
    maxWeek = Math.max(maxWeek, r.week)
    for (const team of [r.home_team, r.away_team]) {
      if (!played.has(team)) played.set(team, new Set())
      played.get(team)?.add(r.week)
    }
  }
  const byes = new Map<string, number>()
  for (const [team, weeks] of played) {
    for (let w = 1; w <= maxWeek; w++) {
      if (!weeks.has(w)) {
        byes.set(team, w)
        break
      }
    }
  }
  return byes
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/db`
Expected: all pass (migrate 3 + repos + rulesRepo + statsRepo 6).

- [ ] **Step 6: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/db/migrations/003_stats.sql src/main/db/migrations/index.ts src/main/db/repos/stats.ts tests/main/db/migrate.test.ts tests/main/db/statsRepo.test.ts
git commit -m "feat(db): add stats, games, ids and points tables

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Player identity resolution

**Files:**
- Create: `src/shared/teams.ts`
- Create: `src/main/sync/identity.ts`
- Create: `src/main/db/repos/playerIds.ts`
- Test: `tests/main/sync/identity.test.ts`, `tests/main/db/playerIdsRepo.test.ts`

**Interfaces:**
- Consumes: `CrosswalkRecord` (Task 1); tables `crosswalk`, `player_ids` (Task 3); `upsertPlayers`, `PlayerRecord` (Plan A) and `replaceTeams` / `replaceRosterPlayers` (Plan A) in tests.
- Produces: `SLEEPER_TO_NFLVERSE_TEAM`, `toNflverseTeam(sleeperTeam): string`, `NFL_TEAMS: readonly string[]` (`src/shared/teams.ts`); `Resolution` union, `PlayerIdRecord { playerId, gsisId, pfrId, sportradarId, espnId, nflverseTeam, resolution }`, `PlayerIdentitySource { playerId, fullName, position, gsisId, sportradarId, espnId }`, `ScoringIdentity { playerId, position, gsisId, nflverseTeam }`; repo functions `replaceCrosswalk(db, records, updatedAt): number`, `listCrosswalk(db): CrosswalkRecord[]`, `replacePlayerIds(db, records, updatedAt): number`, `getPlayerIds(db, playerId): PlayerIdRecord | null`, `countPlayerIds(db): number`, `listPlayerIdentitySources(db): PlayerIdentitySource[]`, `listScoringIdentities(db): ScoringIdentity[]`, `countUnresolvedRostered(db, leagueId): number`; pure `normalizeName(name): string`, `indexCrosswalk(rows): CrosswalkIndex`, `resolvePlayer(p, index): PlayerIdRecord`, `resolvePlayers(players, crosswalk): PlayerIdRecord[]`.

- [ ] **Step 1: Write the failing resolver tests**

`tests/main/sync/identity.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseCrosswalk } from '@main/sources/nflverse'
import { normalizeName, resolvePlayer, resolvePlayers, indexCrosswalk } from '@main/sync/identity'
import type { PlayerIdentitySource } from '@main/db/repos/playerIds'
import { toNflverseTeam } from '@shared/teams'
import { crosswalkCsv } from '../../fixtures/nflverse'

const index = indexCrosswalk(parseCrosswalk(crosswalkCsv).records)

function src(overrides: Partial<PlayerIdentitySource> & { playerId: string }): PlayerIdentitySource {
  return { fullName: '', position: null, gsisId: null, sportradarId: null, espnId: null, ...overrides }
}

describe('normalizeName', () => {
  it('lowercases, strips punctuation and generational suffixes', () => {
    expect(normalizeName("Ja'Marr Chase")).toBe('jamarr chase')
    expect(normalizeName('Odell Beckham Jr.')).toBe('odell beckham')
    expect(normalizeName('D.J. Moore')).toBe('dj moore')
    expect(normalizeName('Kenneth Walker III')).toBe('kenneth walker')
    expect(normalizeName('  Amon-Ra   St. Brown ')).toBe('amonra st brown')
  })
})

describe('resolvePlayer', () => {
  it('1. crosswalk row by sleeper_id wins and brings pfr/espn ids', () => {
    const r = resolvePlayer(src({ playerId: '4866', fullName: 'Saquon Barkley', position: 'RB', gsisId: '00-9999999' }), index)
    expect(r).toEqual({
      playerId: '4866',
      gsisId: '00-0034844',
      pfrId: 'BarkSa00',
      sportradarId: 'sr-1',
      espnId: '3929630',
      nflverseTeam: null,
      resolution: 'crosswalk'
    })
  })

  it("2. falls back to Sleeper's own gsis_id (trimmed) and enriches from the crosswalk by gsis", () => {
    const r = resolvePlayer(src({ playerId: '8259', fullName: 'James Cook', position: 'RB', gsisId: ' 00-0037248' }), index)
    expect(r).toMatchObject({ gsisId: '00-0037248', pfrId: 'CookJa01', resolution: 'sleeper_gsis' })
  })

  it('2b. a crosswalk row without gsis still yields pfr_id when Sleeper has the gsis', () => {
    const r = resolvePlayer(src({ playerId: '9509', fullName: 'Bijan Robinson', position: 'RB', gsisId: '00-0039013' }), index)
    expect(r).toMatchObject({ gsisId: '00-0039013', pfrId: 'RobiBi01', resolution: 'sleeper_gsis' })
  })

  it('3. matches on sportradar_id when there is no gsis on the Sleeper side', () => {
    const r = resolvePlayer(src({ playerId: '5555', fullName: 'Someone Else', position: 'RB', sportradarId: 'sr-3' }), index)
    expect(r).toMatchObject({ gsisId: '00-0037248', pfrId: 'CookJa01', sportradarId: 'sr-3', resolution: 'sportradar' })
  })

  it('4. last resort: normalized name + position, flagged', () => {
    const r = resolvePlayer(src({ playerId: '7777', fullName: "JA'MARR CHASE", position: 'WR' }), index)
    expect(r).toMatchObject({ gsisId: '00-0036900', pfrId: 'ChasJa00', resolution: 'name' })
    const wrongPos = resolvePlayer(src({ playerId: '7778', fullName: "Ja'Marr Chase", position: 'TE' }), index)
    expect(wrongPos.resolution).toBe('unresolved')
  })

  it('keeps unresolved players with Sleeper-side ids intact', () => {
    const r = resolvePlayer(src({ playerId: '1234', fullName: 'Retired Guy', position: 'QB', sportradarId: 'sr-x', espnId: '42' }), index)
    expect(r).toEqual({
      playerId: '1234',
      gsisId: null,
      pfrId: null,
      sportradarId: 'sr-x',
      espnId: '42',
      nflverseTeam: null,
      resolution: 'unresolved'
    })
  })

  it('team defenses map to the nflverse team code', () => {
    expect(resolvePlayer(src({ playerId: 'LAR', position: 'DEF' }), index)).toMatchObject({ nflverseTeam: 'LA', gsisId: null, resolution: 'team' })
    expect(resolvePlayer(src({ playerId: 'KC', position: 'DEF' }), index)).toMatchObject({ nflverseTeam: 'KC', resolution: 'team' })
    expect(toNflverseTeam('LAR')).toBe('LA')
    expect(toNflverseTeam('WAS')).toBe('WAS')
  })

  it('resolvePlayers resolves a batch in order', () => {
    const out = resolvePlayers(
      [src({ playerId: 'LAR', position: 'DEF' }), src({ playerId: '4866', fullName: 'Saquon Barkley', position: 'RB' })],
      parseCrosswalk(crosswalkCsv).records
    )
    expect(out.map((r) => [r.playerId, r.resolution])).toEqual([
      ['LAR', 'team'],
      ['4866', 'crosswalk']
    ])
  })
})
```

`tests/main/db/playerIdsRepo.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { upsertLeague } from '@main/db/repos/leagues'
import {
  countPlayerIds,
  countUnresolvedRostered,
  getPlayerIds,
  listCrosswalk,
  listPlayerIdentitySources,
  listScoringIdentities,
  replaceCrosswalk,
  replacePlayerIds
} from '@main/db/repos/playerIds'
import { upsertPlayers } from '@main/db/repos/players'
import { replaceRosterPlayers, replaceTeams } from '@main/db/repos/teams'
import { parseCrosswalk } from '@main/sources/nflverse'
import { mapLeague, mapPlayers, mapRosterPlayers, mapTeams } from '@main/sync/mappers'
import { crosswalkCsv } from '../../fixtures/nflverse'
import * as fx from '../../fixtures/sleeper'

const TS = '2026-09-17T12:00:00.000Z'

describe('playerIds repo', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
    upsertLeague(db, mapLeague(fx.league, TS), TS)
    replaceTeams(db, 'L1', mapTeams('L1', fx.rosters, fx.users, 'u1'), TS)
    replaceRosterPlayers(db, 'L1', mapRosterPlayers(fx.rosters), TS)
    upsertPlayers(db, mapPlayers(fx.players), TS)
  })

  it('replaceCrosswalk round-trips and is idempotent', () => {
    const rows = parseCrosswalk(crosswalkCsv).records
    expect(replaceCrosswalk(db, rows, TS)).toBe(5)
    expect(replaceCrosswalk(db, rows, TS)).toBe(5)
    expect(listCrosswalk(db)).toEqual(rows)
  })

  it('listPlayerIdentitySources exposes the Sleeper-side ids of every player', () => {
    const sources = listPlayerIdentitySources(db)
    expect(sources).toHaveLength(Object.keys(fx.players).length)
    expect(sources.find((s) => s.playerId === '4866')).toEqual({
      playerId: '4866',
      fullName: 'Saquon Barkley',
      position: 'RB',
      gsisId: '00-0034844',
      sportradarId: 'sr-1',
      espnId: '3929630'
    })
  })

  it('replacePlayerIds, getPlayerIds, listScoringIdentities, counts', () => {
    expect(countPlayerIds(db)).toBe(0)
    const n = replacePlayerIds(
      db,
      [
        { playerId: '4866', gsisId: '00-0034844', pfrId: 'BarkSa00', sportradarId: null, espnId: null, nflverseTeam: null, resolution: 'crosswalk' },
        { playerId: 'LAR', gsisId: null, pfrId: null, sportradarId: null, espnId: null, nflverseTeam: 'LA', resolution: 'team' },
        { playerId: '6794', gsisId: null, pfrId: null, sportradarId: null, espnId: null, nflverseTeam: null, resolution: 'unresolved' }
      ],
      TS
    )
    expect(n).toBe(3)
    expect(countPlayerIds(db)).toBe(3)
    expect(getPlayerIds(db, '4866')?.pfrId).toBe('BarkSa00')
    expect(getPlayerIds(db, 'nope')).toBeNull()
    expect(listScoringIdentities(db)).toEqual([
      { playerId: '4866', position: 'RB', gsisId: '00-0034844', nflverseTeam: null },
      { playerId: 'LAR', position: 'DEF', gsisId: null, nflverseTeam: 'LA' }
    ])
    // roster 1 = 4866, 6794, 8259, LAR; roster 2 = 7564, 9509. Unresolved or missing: 6794, 8259, 7564, 9509.
    expect(countUnresolvedRostered(db, 'L1')).toBe(4)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/sync/identity.test.ts tests/main/db/playerIdsRepo.test.ts`
Expected: FAIL — cannot resolve `@main/sync/identity`, `@main/db/repos/playerIds`, `@shared/teams`.

- [ ] **Step 3: Write the shared team helpers**

`src/shared/teams.ts`:

```ts
/** Sleeper's 32 NFL team codes (also its DEF player_ids). */
export const NFL_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND',
  'JAX', 'KC', 'LAC', 'LAR', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF',
  'TB', 'TEN', 'WAS'
] as const

/** Where nflverse spells a team differently from Sleeper. Extend if a crosswalk mismatch shows up. */
export const SLEEPER_TO_NFLVERSE_TEAM: Record<string, string> = { LAR: 'LA' }

export function toNflverseTeam(sleeperTeam: string): string {
  return SLEEPER_TO_NFLVERSE_TEAM[sleeperTeam] ?? sleeperTeam
}
```

- [ ] **Step 4: Write the repository**

`src/main/db/repos/playerIds.ts`:

```ts
import type { CrosswalkRecord } from '@main/sources/nflverse-types'
import type { Db } from '../connection'

export type Resolution = 'crosswalk' | 'sleeper_gsis' | 'sportradar' | 'name' | 'team' | 'unresolved'

export interface PlayerIdRecord {
  playerId: string
  gsisId: string | null
  pfrId: string | null
  sportradarId: string | null
  espnId: string | null
  /** nflverse team code, team defenses only. */
  nflverseTeam: string | null
  resolution: Resolution
}

/** What the resolver needs from the `players` table. */
export interface PlayerIdentitySource {
  playerId: string
  fullName: string
  position: string | null
  gsisId: string | null
  sportradarId: string | null
  espnId: string | null
}

/** What `recomputePoints` needs: every resolvable player with its Sleeper position. */
export interface ScoringIdentity {
  playerId: string
  position: string | null
  gsisId: string | null
  nflverseTeam: string | null
}

interface CrosswalkRow {
  sleeper_id: string | null
  gsis_id: string | null
  pfr_id: string | null
  sportradar_id: string | null
  espn_id: string | null
  name: string | null
  position: string | null
}

interface PlayerIdRow {
  player_id: string
  gsis_id: string | null
  pfr_id: string | null
  sportradar_id: string | null
  espn_id: string | null
  nflverse_team: string | null
  resolution: Resolution
}

interface SourceRow {
  player_id: string
  full_name: string
  position: string | null
  gsis_id: string | null
  sportradar_id: string | null
  espn_id: string | null
}

interface ScoringRow {
  player_id: string
  position: string | null
  gsis_id: string | null
  nflverse_team: string | null
}

export function replaceCrosswalk(db: Db, records: CrosswalkRecord[], updatedAt: string): number {
  db.exec('DELETE FROM crosswalk')
  const insert = db.prepare(
    `INSERT INTO crosswalk (sleeper_id, gsis_id, pfr_id, sportradar_id, espn_id, name, position, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(r.sleeperId, r.gsisId, r.pfrId, r.sportradarId, r.espnId, r.name, r.position, updatedAt)
    written++
  }
  return written
}

export function listCrosswalk(db: Db): CrosswalkRecord[] {
  const rows = db
    .prepare(
      'SELECT sleeper_id, gsis_id, pfr_id, sportradar_id, espn_id, name, position FROM crosswalk ORDER BY rowid'
    )
    .all() as unknown as CrosswalkRow[]
  return rows.map((r) => ({
    sleeperId: r.sleeper_id,
    gsisId: r.gsis_id,
    pfrId: r.pfr_id,
    sportradarId: r.sportradar_id,
    espnId: r.espn_id,
    name: r.name,
    position: r.position
  }))
}

export function replacePlayerIds(db: Db, records: PlayerIdRecord[], updatedAt: string): number {
  db.exec('DELETE FROM player_ids')
  const insert = db.prepare(
    `INSERT INTO player_ids (player_id, gsis_id, pfr_id, sportradar_id, espn_id, nflverse_team, resolution, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(
      r.playerId,
      r.gsisId,
      r.pfrId,
      r.sportradarId,
      r.espnId,
      r.nflverseTeam,
      r.resolution,
      updatedAt
    )
    written++
  }
  return written
}

export function getPlayerIds(db: Db, playerId: string): PlayerIdRecord | null {
  const r = db
    .prepare(
      'SELECT player_id, gsis_id, pfr_id, sportradar_id, espn_id, nflverse_team, resolution FROM player_ids WHERE player_id = ?'
    )
    .get(playerId) as PlayerIdRow | undefined
  if (!r) return null
  return {
    playerId: r.player_id,
    gsisId: r.gsis_id,
    pfrId: r.pfr_id,
    sportradarId: r.sportradar_id,
    espnId: r.espn_id,
    nflverseTeam: r.nflverse_team,
    resolution: r.resolution
  }
}

export function countPlayerIds(db: Db): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM player_ids').get() as { n: number }).n
}

export function listPlayerIdentitySources(db: Db): PlayerIdentitySource[] {
  const rows = db
    .prepare(
      'SELECT player_id, full_name, position, gsis_id, sportradar_id, espn_id FROM players ORDER BY player_id'
    )
    .all() as unknown as SourceRow[]
  return rows.map((r) => ({
    playerId: r.player_id,
    fullName: r.full_name,
    position: r.position,
    gsisId: r.gsis_id,
    sportradarId: r.sportradar_id,
    espnId: r.espn_id
  }))
}

export function listScoringIdentities(db: Db): ScoringIdentity[] {
  const rows = db
    .prepare(
      `SELECT i.player_id, p.position, i.gsis_id, i.nflverse_team
       FROM player_ids i JOIN players p ON p.player_id = i.player_id
       WHERE i.gsis_id IS NOT NULL OR i.nflverse_team IS NOT NULL
       ORDER BY i.player_id`
    )
    .all() as unknown as ScoringRow[]
  return rows.map((r) => ({
    playerId: r.player_id,
    position: r.position,
    gsisId: r.gsis_id,
    nflverseTeam: r.nflverse_team
  }))
}

/** Rostered players in the league with no usable nflverse id (missing row or `unresolved`). */
export function countUnresolvedRostered(db: Db, leagueId: string): number {
  return (
    db
      .prepare(
        `SELECT COUNT(DISTINCT rp.player_id) AS n
         FROM roster_players rp LEFT JOIN player_ids i ON i.player_id = rp.player_id
         WHERE rp.league_id = ? AND (i.player_id IS NULL OR i.resolution = 'unresolved')`
      )
      .get(leagueId) as { n: number }
  ).n
}
```

- [ ] **Step 5: Write the resolver**

`src/main/sync/identity.ts`:

```ts
import type { PlayerIdentitySource, PlayerIdRecord, Resolution } from '@main/db/repos/playerIds'
import type { CrosswalkRecord } from '@main/sources/nflverse-types'
import { toNflverseTeam } from '@shared/teams'

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

/** Lowercase, letters/digits only, generational suffix dropped: "Odell Beckham Jr." -> "odell beckham". */
export function normalizeName(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1])) words.pop()
  return words.join(' ')
}

export interface CrosswalkIndex {
  bySleeper: Map<string, CrosswalkRecord>
  byGsis: Map<string, CrosswalkRecord>
  bySportradar: Map<string, CrosswalkRecord>
  /** key = `${normalizeName(name)}|${position}` */
  byName: Map<string, CrosswalkRecord>
}

function nameKey(name: string, position: string): string {
  return `${normalizeName(name)}|${position}`
}

/** First row wins per key, so duplicate crosswalk rows never flip a resolution between runs. */
export function indexCrosswalk(rows: CrosswalkRecord[]): CrosswalkIndex {
  const index: CrosswalkIndex = {
    bySleeper: new Map(),
    byGsis: new Map(),
    bySportradar: new Map(),
    byName: new Map()
  }
  const put = (map: Map<string, CrosswalkRecord>, key: string | null, row: CrosswalkRecord): void => {
    if (key && !map.has(key)) map.set(key, row)
  }
  for (const row of rows) {
    put(index.bySleeper, row.sleeperId, row)
    put(index.byGsis, row.gsisId, row)
    put(index.bySportradar, row.sportradarId, row)
    if (row.name && row.position) put(index.byName, nameKey(row.name, row.position), row)
  }
  return index
}

/**
 * Spec §6 order, first hit wins: crosswalk by sleeper_id → Sleeper's own gsis_id (trimmed) →
 * crosswalk by sportradar_id → normalized name + position. Team defenses map to a team code.
 * Whatever crosswalk row was matched also supplies pfr/espn ids for snap counts etc.
 */
export function resolvePlayer(p: PlayerIdentitySource, index: CrosswalkIndex): PlayerIdRecord {
  const base = {
    playerId: p.playerId,
    gsisId: null,
    pfrId: null,
    sportradarId: p.sportradarId,
    espnId: p.espnId,
    nflverseTeam: null
  }
  if (p.position === 'DEF') {
    return { ...base, nflverseTeam: toNflverseTeam(p.playerId), resolution: 'team' }
  }
  const sleeperGsis = p.gsisId?.trim() || null
  let row = index.bySleeper.get(p.playerId)
  let resolution: Resolution = 'unresolved'
  let gsisId: string | null = null
  if (row?.gsisId) {
    resolution = 'crosswalk'
    gsisId = row.gsisId
  } else if (sleeperGsis) {
    resolution = 'sleeper_gsis'
    gsisId = sleeperGsis
    row ??= index.byGsis.get(sleeperGsis)
  } else {
    const bySr = p.sportradarId ? index.bySportradar.get(p.sportradarId) : undefined
    const byName = p.position ? index.byName.get(nameKey(p.fullName, p.position)) : undefined
    if (bySr?.gsisId) {
      resolution = 'sportradar'
      gsisId = bySr.gsisId
      row = bySr
    } else if (byName?.gsisId) {
      resolution = 'name'
      gsisId = byName.gsisId
      row = byName
    } else {
      row = undefined
    }
  }
  return {
    ...base,
    gsisId,
    pfrId: row?.pfrId ?? null,
    sportradarId: row?.sportradarId ?? p.sportradarId,
    espnId: row?.espnId ?? p.espnId,
    resolution
  }
}

export function resolvePlayers(
  players: PlayerIdentitySource[],
  crosswalk: CrosswalkRecord[]
): PlayerIdRecord[] {
  const index = indexCrosswalk(crosswalk)
  return players.map((p) => resolvePlayer(p, index))
}
```

Note on test "1.": Barkley's Sleeper `gsisId` is deliberately wrong (`00-9999999`) to prove the crosswalk row wins. Note on "keeps unresolved…": `row` is reset to `undefined` in the unresolved branch so a sleeper_id row without gsis does not leak its (possibly stale) pfr id — but in "2b." the same row *is* used because Sleeper supplied the gsis.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/main/sync/identity.test.ts tests/main/db/playerIdsRepo.test.ts`
Expected: 8 + 3 pass.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/shared/teams.ts src/main/sync/identity.ts src/main/db/repos/playerIds.ts tests/main/sync/identity.test.ts tests/main/db/playerIdsRepo.test.ts
git commit -m "feat(sync): resolve sleeper players to nflverse ids

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: nflverse → Sleeper stat-line adapters

**Files:**
- Create: `src/main/scoring/adapters.ts`
- Test: `tests/main/scoring/adapters.test.ts`

**Interfaces:**
- Consumes: `StatLine`, `DERIVED_STATS` (`@main/scoring/engine`), `STAT_KEYS` (`@shared/statKeys`).
- Produces: `PLAYER_STAT_MAP: Record<StatKey, string[]>`, `TEAM_STAT_MAP: Record<StatKey, string[]>`, `playerStatLine(stats: Record<string, number>): StatLine`, `TeamContext { pointsAllowed: number | null; yardsAllowed: number | null }`, `teamStatLine(stats, ctx): StatLine`, `offensiveYards(stats): number`.

- [ ] **Step 1: Write the failing adapter tests**

`tests/main/scoring/adapters.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  offensiveYards,
  PLAYER_STAT_MAP,
  playerStatLine,
  TEAM_STAT_MAP,
  teamStatLine
} from '@main/scoring/adapters'
import { DERIVED_STATS } from '@main/scoring/engine'
import { STAT_KEYS } from '@shared/statKeys'

describe('playerStatLine', () => {
  it('maps offense, sums multi-column keys, derives incompletions, stays sparse', () => {
    const line = playerStatLine({
      completions: 20,
      attempts: 30,
      passing_yards: 250,
      passing_tds: 2,
      passing_interceptions: 1,
      sacks_suffered: 3,
      carries: 4,
      rushing_yards: 22,
      sack_fumbles: 1,
      rushing_fumbles: 1,
      receiving_fumbles: 0,
      sack_fumbles_lost: 1,
      rushing_fumbles_lost: 0,
      receiving_fumbles_lost: 0,
      fumble_recovery_own: 1,
      fumble_recovery_opp: 0
    })
    expect(line).toEqual({
      pass_cmp: 20,
      pass_att: 30,
      pass_inc: 10,
      pass_yd: 250,
      pass_td: 2,
      pass_int: 1,
      pass_sack: 3,
      rush_att: 4,
      rush_yd: 22,
      fum: 2,
      fum_lost: 1,
      fum_rec: 1
    })
  })

  it('maps kicking buckets including the 50+ roll-ups and blocked kicks as misses', () => {
    const line = playerStatLine({
      pat_made: 3,
      pat_missed: 0,
      pat_blocked: 1,
      fg_made: 3,
      fg_missed: 1,
      fg_blocked: 1,
      fg_made_40_49: 1,
      fg_made_50_59: 1,
      fg_made_60_: 1,
      fg_missed_50_59: 1,
      fg_missed_60_: 0,
      fg_made_distance: 155
    })
    expect(line).toMatchObject({
      xpm: 3,
      xpmiss: 1,
      fgm: 3,
      fgmiss: 2,
      fgm_40_49: 1,
      fgm_50_59: 1,
      fgm_60p: 1,
      fgm_50p: 2,
      fgmiss_50p: 1,
      fgm_yds: 155
    })
    expect(line).not.toHaveProperty('fgm_0_19')
  })

  it('maps IDP columns', () => {
    const line = playerStatLine({
      def_tackles_solo: 5,
      def_tackles_with_assist: 2,
      def_tackle_assists: 3,
      def_sacks: 1.5,
      def_punt_blocks: 1,
      def_fg_blocks: 0
    })
    expect(line).toMatchObject({ idp_tkl: 7, idp_tkl_solo: 5, idp_tkl_ast: 3, idp_sack: 1.5, idp_blk_kick: 1 })
    expect(line).not.toHaveProperty('sack') // team-DEF keys never come from a player row
  })
})

describe('teamStatLine', () => {
  it('maps the team row plus points/yards allowed from context', () => {
    const line = teamStatLine(
      { def_sacks: 4, def_interceptions: 2, def_fumbles_forced: 1, fumble_recovery_opp: 1, def_tds: 1, special_teams_tds: 0, def_pat_blocks: 1, def_2pt_made: 0, def_pass_defended: 5, def_safeties: 0 },
      { pointsAllowed: 9, yardsAllowed: 280 }
    )
    expect(line).toEqual({
      sack: 4,
      int: 2,
      ff: 1,
      fum_rec: 1,
      safe: 0,
      blk_kick: 1,
      def_td: 1,
      def_st_td: 0,
      def_2pt: 0,
      def_pass_def: 5,
      pts_allow: 9,
      yds_allow: 280
    })
  })

  it('omits pts/yds allowed when unknown', () => {
    const line = teamStatLine({ def_sacks: 1 }, { pointsAllowed: null, yardsAllowed: null })
    expect(line).toEqual({ sack: 1 })
  })

  it('offensiveYards = rushing + passing - sack yards', () => {
    expect(offensiveYards({ rushing_yards: 120, passing_yards: 180, sack_yards_lost: 5 })).toBe(295)
    expect(offensiveYards({})).toBe(0)
  })
})

describe('adapter contract with the stat-key catalogue', () => {
  it('emits every supported, non-derived catalogue key from a full row', () => {
    const one = (cols: string[]): Record<string, number> => Object.fromEntries(cols.map((c) => [c, 1]))
    const playerRow = one([...Object.values(PLAYER_STAT_MAP).flat(), 'attempts', 'completions'])
    const teamRow = one(Object.values(TEAM_STAT_MAP).flat())
    const emitted = new Set([
      ...Object.keys(playerStatLine(playerRow)),
      ...Object.keys(teamStatLine(teamRow, { pointsAllowed: 0, yardsAllowed: 0 }))
    ])
    const expected = STAT_KEYS.filter((k) => k.supported && !(k.key in DERIVED_STATS)).map((k) => k.key)
    const missing = expected.filter((k) => !emitted.has(k))
    expect(missing).toEqual([])
  })

  it('never emits a key the catalogue marks unsupported', () => {
    const unsupported = new Set(STAT_KEYS.filter((k) => !k.supported).map((k) => k.key))
    for (const key of [...Object.keys(PLAYER_STAT_MAP), ...Object.keys(TEAM_STAT_MAP), 'pass_inc']) {
      expect(unsupported.has(key), key).toBe(false)
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/scoring/adapters.test.ts`
Expected: FAIL — cannot resolve `@main/scoring/adapters`.

- [ ] **Step 3: Write the adapters**

`src/main/scoring/adapters.ts`:

```ts
import type { StatKey } from '@shared/rules'
import type { StatLine } from './engine'

type Stats = Record<string, number>

function sum(stats: Stats, cols: string[]): number {
  return cols.reduce((total, col) => total + (stats[col] ?? 0), 0)
}

/**
 * nflverse `stats_player_week` columns → Sleeper stat keys. A key is emitted when any of its
 * source columns is present; multi-column keys are sums (see plan decision 5 for the choices).
 * `pass_inc` is `attempts − completions` and handled in `playerStatLine`.
 */
export const PLAYER_STAT_MAP: Record<StatKey, string[]> = {
  // passing
  pass_yd: ['passing_yards'],
  pass_td: ['passing_tds'],
  pass_int: ['passing_interceptions'],
  pass_2pt: ['passing_2pt_conversions'],
  pass_att: ['attempts'],
  pass_cmp: ['completions'],
  pass_sack: ['sacks_suffered'],
  pass_fd: ['passing_first_downs'],
  pass_cmp_40p: ['passing_40'],
  // rushing
  rush_yd: ['rushing_yards'],
  rush_td: ['rushing_tds'],
  rush_2pt: ['rushing_2pt_conversions'],
  rush_att: ['carries'],
  rush_fd: ['rushing_first_downs'],
  rush_40p: ['rushing_40'],
  // receiving
  rec: ['receptions'],
  rec_yd: ['receiving_yards'],
  rec_td: ['receiving_tds'],
  rec_2pt: ['receiving_2pt_conversions'],
  rec_tgt: ['targets'],
  rec_fd: ['receiving_first_downs'],
  rec_40p: ['receiving_40'],
  // misc offense
  fum: ['sack_fumbles', 'rushing_fumbles', 'receiving_fumbles'],
  fum_lost: ['sack_fumbles_lost', 'rushing_fumbles_lost', 'receiving_fumbles_lost'],
  fum_rec: ['fumble_recovery_own', 'fumble_recovery_opp'],
  fum_rec_td: ['fumble_recovery_tds'],
  st_td: ['special_teams_tds'],
  pr_yd: ['punt_return_yards'],
  kr_yd: ['kickoff_return_yards'],
  // kicking (blocked kicks count as misses; distance buckets exclude blocked kicks)
  xpm: ['pat_made'],
  xpmiss: ['pat_missed', 'pat_blocked'],
  fgm: ['fg_made'],
  fgmiss: ['fg_missed', 'fg_blocked'],
  fgm_0_19: ['fg_made_0_19'],
  fgm_20_29: ['fg_made_20_29'],
  fgm_30_39: ['fg_made_30_39'],
  fgm_40_49: ['fg_made_40_49'],
  fgm_50p: ['fg_made_50_59', 'fg_made_60_'],
  fgm_50_59: ['fg_made_50_59'],
  fgm_60p: ['fg_made_60_'],
  fgmiss_0_19: ['fg_missed_0_19'],
  fgmiss_20_29: ['fg_missed_20_29'],
  fgmiss_30_39: ['fg_missed_30_39'],
  fgmiss_40_49: ['fg_missed_40_49'],
  fgmiss_50p: ['fg_missed_50_59', 'fg_missed_60_'],
  fgm_yds: ['fg_made_distance'],
  // IDP
  idp_tkl: ['def_tackles_solo', 'def_tackles_with_assist'],
  idp_tkl_solo: ['def_tackles_solo'],
  idp_tkl_ast: ['def_tackle_assists'],
  idp_tkl_loss: ['def_tackles_for_loss'],
  idp_qb_hit: ['def_qb_hits'],
  idp_sack: ['def_sacks'],
  idp_sack_yd: ['def_sack_yards'],
  idp_int: ['def_interceptions'],
  idp_int_ret_yd: ['def_interception_yards'],
  idp_pass_def: ['def_pass_defended'],
  idp_ff: ['def_fumbles_forced'],
  idp_fum_rec: ['fumble_recovery_opp'],
  idp_fum_ret_yd: ['fumble_recovery_yards_opp'],
  idp_def_td: ['def_tds'],
  idp_safe: ['def_safeties'],
  idp_blk_kick: ['def_punt_blocks', 'def_pat_blocks', 'def_fg_blocks']
}

/** nflverse `stats_team_week` defensive columns → Sleeper team-DEF keys. */
export const TEAM_STAT_MAP: Record<StatKey, string[]> = {
  sack: ['def_sacks'],
  int: ['def_interceptions'],
  ff: ['def_fumbles_forced'],
  fum_rec: ['fumble_recovery_opp'],
  safe: ['def_safeties'],
  blk_kick: ['def_punt_blocks', 'def_pat_blocks', 'def_fg_blocks'],
  def_td: ['def_tds'],
  def_st_td: ['special_teams_tds'],
  def_2pt: ['def_2pt_made'],
  def_pass_def: ['def_pass_defended']
}

function mapColumns(stats: Stats, map: Record<StatKey, string[]>): StatLine {
  const line: StatLine = {}
  for (const [key, cols] of Object.entries(map)) {
    if (cols.some((c) => c in stats)) line[key] = sum(stats, cols)
  }
  return line
}

export function playerStatLine(stats: Stats): StatLine {
  const line = mapColumns(stats, PLAYER_STAT_MAP)
  if ('attempts' in stats || 'completions' in stats) {
    line.pass_inc = sum(stats, ['attempts']) - sum(stats, ['completions'])
  }
  return line
}

export interface TeamContext {
  /** Opponent's score from `games`; null when the game is not in the table yet. */
  pointsAllowed: number | null
  /** Opponent's net offensive yards from its `team_week_stats` row; null when missing. */
  yardsAllowed: number | null
}

export function teamStatLine(stats: Stats, ctx: TeamContext): StatLine {
  const line = mapColumns(stats, TEAM_STAT_MAP)
  if (ctx.pointsAllowed !== null) line.pts_allow = ctx.pointsAllowed
  if (ctx.yardsAllowed !== null) line.yds_allow = ctx.yardsAllowed
  return line
}

/** Net offensive yards as the NFL counts them: rushing + passing − yards lost to sacks. */
export function offensiveYards(stats: Stats): number {
  return sum(stats, ['rushing_yards', 'passing_yards']) - sum(stats, ['sack_yards_lost'])
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main/scoring/adapters.test.ts`
Expected: 8 pass. If the contract test lists a missing key, add it to the right map — do not change the catalogue.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/scoring/adapters.ts tests/main/scoring/adapters.test.ts
git commit -m "feat(scoring): map nflverse columns to stat lines

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: `player_week_points` repository and `recomputePoints`

**Files:**
- Modify: `src/shared/types.ts` (+ `PointsContext`)
- Create: `src/main/db/repos/points.ts`
- Create: `src/main/scoring/recompute.ts`
- Create: `tests/fixtures/db.ts`
- Test: `tests/main/scoring/recompute.test.ts`

**Interfaces:**
- Consumes: `getRules` (Plan B), `scoreStatLine` (Plan B), `POSITIONS` (`@shared/rules`), `playerStatLine` / `teamStatLine` / `offensiveYards` (Task 5), `listScoringIdentities` (Task 4), `listAllPlayerWeeks` / `listTeamWeeks` / `listGames` (Task 3).
- Produces: `PointsContext { season: number; lastWeek: number | null }` (in `@shared/types`), `NO_POINTS_CONTEXT`, `PointsRecord { playerId, season, week, points }`, `replacePoints(db, leagueId, records, updatedAt): number`, `countPoints(db, leagueId): number`, `latestPointsWeek(db, leagueId, season): number | null`, `listWeekPoints(db, leagueId, playerId, season): { week; points }[]`; `recomputePoints(db, leagueId, updatedAt): number` (caller wraps in `withTransaction`); `pointsAllowedIndex(games): Map<string, number>` keyed `team|season|week`. Test helper `seedLeague(): Db` — migrated in-memory DB with league `L1`, teams, rosters, all fixture players and the `rules()` fixture saved.

- [ ] **Step 1: Write the shared DB fixture**

`tests/fixtures/db.ts`:

```ts
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { upsertLeague } from '@main/db/repos/leagues'
import { upsertPlayers } from '@main/db/repos/players'
import { saveRules } from '@main/db/repos/rules'
import { SETTING_ACTIVE_LEAGUE, SETTING_MY_USER, setSetting } from '@main/db/repos/settings'
import { replaceRosterPlayers, replaceTeams } from '@main/db/repos/teams'
import { mapLeague, mapPlayers, mapRosterPlayers, mapTeams } from '@main/sync/mappers'
import type { Rules } from '@shared/rules'
import { rules } from './rules'
import * as fx from './sleeper'

export const SEED_TS = '2026-09-17T12:00:00.000Z'

/**
 * A migrated in-memory DB with league L1 (2 teams, rosters from the Sleeper fixture), every
 * fixture player, and the given rules (default: the 12-team PPR `rules()` fixture) as the active league.
 */
export function seedLeague(leagueRules: Rules = rules()): Db {
  const db = openDatabase(':memory:')
  migrate(db)
  upsertLeague(db, mapLeague(fx.league, SEED_TS), SEED_TS)
  replaceTeams(db, 'L1', mapTeams('L1', fx.rosters, fx.users, 'u1'), SEED_TS)
  replaceRosterPlayers(db, 'L1', mapRosterPlayers(fx.rosters), SEED_TS)
  upsertPlayers(db, mapPlayers(fx.players), SEED_TS)
  saveRules(db, 'L1', leagueRules)
  setSetting(db, SETTING_ACTIVE_LEAGUE, 'L1')
  setSetting(db, SETTING_MY_USER, 'u1')
  return db
}
```

(`fx.league.season` is `'2026'` in the Sleeper fixture — check `tests/fixtures/sleeper.ts`; the recompute tests below use season 2025 stats and pass the season explicitly, so it does not matter here. Task 8's query tests use `Number(league.season)` and insert stats under that season.)

- [ ] **Step 2: Write the failing recompute tests**

`tests/main/scoring/recompute.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { withTransaction, type Db } from '@main/db/connection'
import { replacePlayerIds } from '@main/db/repos/playerIds'
import { countPoints, latestPointsWeek, listWeekPoints, replacePoints } from '@main/db/repos/points'
import { saveRules } from '@main/db/repos/rules'
import {
  replacePlayerWeekStats,
  replaceTeamWeekStats,
  upsertGames
} from '@main/db/repos/stats'
import { pointsAllowedIndex, recomputePoints } from '@main/scoring/recompute'
import { parseGames, parsePlayerWeekStats, parseTeamWeekStats } from '@main/sources/nflverse'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as fx from '../../fixtures/nflverse'
import { rules } from '../../fixtures/rules'

const defRules = rules({
  scoring: { ...rules().scoring, sack: 1, int: 2, pts_allow_0: 10, pts_allow_1_6: 7, pts_allow_7_13: 4, pts_allow_14_20: 1 }
})

describe('recomputePoints', () => {
  let db: Db

  beforeEach(() => {
    db = seedLeague(defRules)
    replacePlayerIds(
      db,
      [
        { playerId: '4866', gsisId: '00-0034844', pfrId: 'BarkSa00', sportradarId: null, espnId: null, nflverseTeam: null, resolution: 'crosswalk' },
        { playerId: '6794', gsisId: '00-0036322', pfrId: null, sportradarId: null, espnId: null, nflverseTeam: null, resolution: 'crosswalk' },
        { playerId: 'LAR', gsisId: null, pfrId: null, sportradarId: null, espnId: null, nflverseTeam: 'LA', resolution: 'team' },
        { playerId: '8259', gsisId: null, pfrId: null, sportradarId: null, espnId: null, nflverseTeam: null, resolution: 'unresolved' }
      ],
      SEED_TS
    )
    const reg = parsePlayerWeekStats(fx.playerStatsCsv).records.filter((r) => r.seasonType === 'REG')
    replacePlayerWeekStats(db, 2025, reg, SEED_TS)
    replaceTeamWeekStats(db, 2025, parseTeamWeekStats(fx.teamStatsCsv).records, SEED_TS)
    upsertGames(db, parseGames(fx.gamesCsv).records, SEED_TS)
  })

  it('scores every resolved player-week and team-DEF week under the league rules', () => {
    const n = withTransaction(db, () => recomputePoints(db, 'L1', SEED_TS))
    // Barkley wk1, wk2, Jefferson wk1, LA DEF wk1 (Folk has no player_ids row; 8259 is unresolved)
    expect(n).toBe(4)
    expect(countPoints(db, 'L1')).toBe(4)
    // 60*0.1 + 6 + 4*1 + 24*0.1 = 18.4 ; 88*0.1 + 2 + 1 = 11.8
    expect(listWeekPoints(db, 'L1', '4866', 2025)).toEqual([
      { week: 1, points: 18.4 },
      { week: 2, points: 11.8 }
    ])
    // 4 rec + 6.8 = 10.8
    expect(listWeekPoints(db, 'L1', '6794', 2025)).toEqual([{ week: 1, points: 10.8 }])
    // 4 sacks + 2 int * 2 + 9 points allowed (7-13 tier = 4) = 12
    expect(listWeekPoints(db, 'L1', 'LAR', 2025)).toEqual([{ week: 1, points: 12 }])
    expect(latestPointsWeek(db, 'L1', 2025)).toBe(2)
    expect(latestPointsWeek(db, 'L1', 2024)).toBeNull()
  })

  it('is a full rebuild: rules changes replace old points', () => {
    withTransaction(db, () => recomputePoints(db, 'L1', SEED_TS))
    saveRules(db, 'L1', rules({ ...defRules, scoring: { ...defRules.scoring, rec: 0.5 } }))
    withTransaction(db, () => recomputePoints(db, 'L1', SEED_TS))
    expect(countPoints(db, 'L1')).toBe(4)
    expect(listWeekPoints(db, 'L1', '4866', 2025)[0].points).toBe(16.4)
  })

  it('returns 0 and clears points when the league has no rules', () => {
    withTransaction(db, () => recomputePoints(db, 'L1', SEED_TS))
    db.prepare('DELETE FROM rules WHERE league_id = ?').run('L1')
    expect(withTransaction(db, () => recomputePoints(db, 'L1', SEED_TS))).toBe(0)
    expect(countPoints(db, 'L1')).toBe(0)
  })

  it('replacePoints is idempotent per league', () => {
    const rows = [{ playerId: '4866', season: 2025, week: 1, points: 1 }]
    expect(replacePoints(db, 'L1', rows, SEED_TS)).toBe(1)
    expect(replacePoints(db, 'L1', rows, SEED_TS)).toBe(1)
    expect(countPoints(db, 'L1')).toBe(1)
  })

  it('pointsAllowedIndex reads both sides of a played game and skips unplayed ones', () => {
    const idx = pointsAllowedIndex(parseGames(fx.gamesCsv).records)
    expect(idx.get('PHI|2025|1')).toBe(20)
    expect(idx.get('DAL|2025|1')).toBe(24)
    expect(idx.get('LA|2025|1')).toBe(9)
    expect(idx.has('CHI|2025|3')).toBe(false)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/main/scoring/recompute.test.ts`
Expected: FAIL — cannot resolve `@main/db/repos/points` / `@main/scoring/recompute`.

- [ ] **Step 4: Write the points repository**

First add the context type to `src/shared/types.ts` (after `RosterPlayer`):

```ts
/** Which season the UI shows points for and which week is "last week" (null = no points yet). */
export interface PointsContext {
  season: number
  lastWeek: number | null
}
```

`src/main/db/repos/points.ts`:

```ts
import type { PointsContext } from '@shared/types'
import type { Db } from '../connection'

export type { PointsContext }

export const NO_POINTS_CONTEXT: PointsContext = { season: 0, lastWeek: null }

export interface PointsRecord {
  playerId: string
  season: number
  week: number
  points: number
}

/** Replaces every points row of the league. Wrap in `withTransaction`. */
export function replacePoints(
  db: Db,
  leagueId: string,
  records: PointsRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM player_week_points WHERE league_id = ?').run(leagueId)
  const insert = db.prepare(
    'INSERT OR REPLACE INTO player_week_points (league_id, player_id, season, week, points, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  let written = 0
  for (const r of records) {
    insert.run(leagueId, r.playerId, r.season, r.week, r.points, updatedAt)
    written++
  }
  return written
}

export function countPoints(db: Db, leagueId: string): number {
  return (
    db.prepare('SELECT COUNT(*) AS n FROM player_week_points WHERE league_id = ?').get(leagueId) as {
      n: number
    }
  ).n
}

export function latestPointsWeek(db: Db, leagueId: string, season: number): number | null {
  const row = db
    .prepare('SELECT MAX(week) AS w FROM player_week_points WHERE league_id = ? AND season = ?')
    .get(leagueId, season) as { w: number | null }
  return row.w
}

export function listWeekPoints(
  db: Db,
  leagueId: string,
  playerId: string,
  season: number
): { week: number; points: number }[] {
  return db
    .prepare(
      'SELECT week, points FROM player_week_points WHERE league_id = ? AND player_id = ? AND season = ? ORDER BY week'
    )
    .all(leagueId, playerId, season) as unknown as { week: number; points: number }[]
}
```

- [ ] **Step 5: Write `recomputePoints`**

`src/main/scoring/recompute.ts`:

```ts
import type { Db } from '@main/db/connection'
import { listScoringIdentities } from '@main/db/repos/playerIds'
import { replacePoints, type PointsRecord } from '@main/db/repos/points'
import { getRules } from '@main/db/repos/rules'
import { listAllPlayerWeeks, listGames, listTeamWeeks, type GameRow } from '@main/db/repos/stats'
import { POSITIONS, type Position } from '@shared/rules'
import { offensiveYards, playerStatLine, teamStatLine } from './adapters'
import { scoreStatLine } from './engine'

function asPosition(value: string | null): Position | null {
  return (POSITIONS as readonly string[]).includes(value ?? '') ? (value as Position) : null
}

const key = (team: string, season: number, week: number): string => `${team}|${season}|${week}`

/** `team|season|week` → points that team allowed, for games with a final score. */
export function pointsAllowedIndex(games: Pick<GameRow, 'season' | 'week' | 'homeTeam' | 'awayTeam' | 'homeScore' | 'awayScore'>[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const g of games) {
    if (g.homeScore === null || g.awayScore === null) continue
    index.set(key(g.homeTeam, g.season, g.week), g.awayScore)
    index.set(key(g.awayTeam, g.season, g.week), g.homeScore)
  }
  return index
}

/**
 * Rebuilds `player_week_points` for the league from every stored stats row (spec §7): players
 * via `player_ids.gsis_id`, team defenses via `player_ids.nflverse_team` with points/yards allowed
 * from `games` / the opponent's team row. Returns the number of rows written. Wrap in `withTransaction`.
 */
export function recomputePoints(db: Db, leagueId: string, updatedAt: string): number {
  const rules = getRules(db, leagueId)
  if (!rules) return replacePoints(db, leagueId, [], updatedAt)

  const byGsis = new Map<string, { playerId: string; position: Position | null }[]>()
  const byTeam = new Map<string, string[]>()
  for (const id of listScoringIdentities(db)) {
    if (id.gsisId) {
      const list = byGsis.get(id.gsisId) ?? []
      list.push({ playerId: id.playerId, position: asPosition(id.position) })
      byGsis.set(id.gsisId, list)
    }
    if (id.nflverseTeam) byTeam.set(id.nflverseTeam, [...(byTeam.get(id.nflverseTeam) ?? []), id.playerId])
  }

  const out: PointsRecord[] = []
  for (const row of listAllPlayerWeeks(db)) {
    const owners = byGsis.get(row.gsisId)
    if (!owners) continue
    const line = playerStatLine(row.stats)
    for (const o of owners) {
      out.push({ playerId: o.playerId, season: row.season, week: row.week, points: scoreStatLine(line, rules, o.position) })
    }
  }

  const teamWeeks = listTeamWeeks(db)
  const teamIndex = new Map(teamWeeks.map((t) => [key(t.team, t.season, t.week), t]))
  const allowed = pointsAllowedIndex(listGames(db))
  for (const t of teamWeeks) {
    const owners = byTeam.get(t.team)
    if (!owners) continue
    const opponent = t.opponent ? teamIndex.get(key(t.opponent, t.season, t.week)) : undefined
    const line = teamStatLine(t.stats, {
      pointsAllowed: allowed.get(key(t.team, t.season, t.week)) ?? null,
      yardsAllowed: opponent ? offensiveYards(opponent.stats) : null
    })
    for (const playerId of owners) {
      out.push({ playerId, season: t.season, week: t.week, points: scoreStatLine(line, rules, 'DEF') })
    }
  }
  return replacePoints(db, leagueId, out, updatedAt)
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/main/scoring/recompute.test.ts`
Expected: 5 pass.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/shared/types.ts src/main/db/repos/points.ts src/main/scoring/recompute.ts tests/fixtures/db.ts tests/main/scoring/recompute.test.ts
git commit -m "feat(scoring): materialize player week points

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: nflverse sync orchestration and the combined refresh

**Files:**
- Create: `src/main/sync/nflverseSync.ts`
- Create: `src/main/sync/refresh.ts`
- Test: `tests/main/sync/nflverseSync.test.ts`

**Interfaces:**
- Consumes: `runStep`, `SkipStep`, `nowOf`, `SyncDeps`, `RefreshOptions` (Task 2); `NflverseClient` (Task 1); repos from Tasks 3, 4, 6; `getNflState`, `getSetting`/`SETTING_ACTIVE_LEAGUE`; `importLeague`, `refreshSleeper`, `SOURCE_PLAYERS` (Plan A/B); `recomputePoints` (Task 6); `resolvePlayers` (Task 4).
- Produces: `SOURCE_CROSSWALK = 'nflverse:crosswalk'`, `SOURCE_GAMES = 'nflverse:games'`, `SOURCE_IDENTITY = 'app:identity'`, `SOURCE_POINTS = 'app:points'`, `sourceStats(season)`, `sourceSnaps(season)`, `STATS_SOURCE_PREFIX = 'nflverse:stats:'`, `NflverseSyncDeps extends SyncDeps { nflverse: NflverseClient }`, `NflverseRefreshOptions extends RefreshOptions { playersChanged?: boolean }`, `refreshNflverse(deps, options?): Promise<SyncResult>`; `refreshAll(deps, options?): Promise<SyncResult>`, `importAll(deps, leagueId, myUserId): Promise<SyncResult>`.

- [ ] **Step 1: Write the failing sync tests**

`tests/main/sync/nflverseSync.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '@main/db/connection'
import { countPlayerIds, getPlayerIds, listCrosswalk } from '@main/db/repos/playerIds'
import { countPoints } from '@main/db/repos/points'
import { setNflState } from '@main/db/repos/state'
import { listAllPlayerWeeks, listGames, listSnaps, listTeamWeeks } from '@main/db/repos/stats'
import { getLastSync } from '@main/db/repos/syncLog'
import type { NflverseClient, ParseResult } from '@main/sources/nflverse'
import {
  parseCrosswalk,
  parseGames,
  parsePlayerWeekStats,
  parseSnapCounts,
  parseTeamWeekStats
} from '@main/sources/nflverse'
import type { SleeperClient } from '@main/sources/sleeper'
import {
  refreshNflverse,
  SOURCE_CROSSWALK,
  SOURCE_GAMES,
  SOURCE_IDENTITY,
  SOURCE_POINTS,
  sourceSnaps,
  sourceStats,
  type NflverseSyncDeps
} from '@main/sync/nflverseSync'
import { seedLeague } from '../../fixtures/db'
import * as fx from '../../fixtures/nflverse'

/** Re-labels fixture rows (all season 2025) with the requested season so both seasons load. */
function forSeason<T extends { season: number }>(result: ParseResult<T>, season: number): ParseResult<T> {
  return { records: result.records.map((r) => ({ ...r, season })), skipped: result.skipped }
}

function fakeNflverse(overrides: Partial<NflverseClient> = {}): NflverseClient {
  return {
    getPlayerWeekStats: vi.fn(async (season) => forSeason(parsePlayerWeekStats(fx.playerStatsCsv), season)),
    getTeamWeekStats: vi.fn(async (season) => forSeason(parseTeamWeekStats(fx.teamStatsCsv), season)),
    getSnapCounts: vi.fn(async (season) => forSeason(parseSnapCounts(fx.snapCountsCsv), season)),
    getGames: vi.fn(async () => {
      const g = parseGames(fx.gamesCsv)
      return { records: [...g.records, ...forSeason(g, 2026).records.map((r) => ({ ...r, gameId: `2026${r.gameId.slice(4)}` }))], skipped: 0 }
    }),
    getCrosswalk: vi.fn(async () => parseCrosswalk(fx.crosswalkCsv)),
    ...overrides
  }
}

describe('refreshNflverse', () => {
  let db: Db
  let clock: Date
  const HOUR = 3_600_000

  function deps(nflverse = fakeNflverse()): NflverseSyncDeps {
    return { db, sleeper: {} as SleeperClient, nflverse, now: () => clock }
  }

  beforeEach(() => {
    db = seedLeague()
    clock = new Date('2026-09-17T12:00:00.000Z')
    setNflState(db, { season: '2026', week: 3, displayWeek: 3, seasonType: 'regular', fetchedAt: clock.toISOString() })
  })

  it('does nothing without an NFL state row', async () => {
    db.exec('DELETE FROM nfl_state')
    expect((await refreshNflverse(deps())).steps).toEqual([])
  })

  it('runs crosswalk, identity, both seasons, games and points in order and writes everything', async () => {
    const result = await refreshNflverse(deps())
    expect(result.steps.map((s) => [s.source, s.status])).toEqual([
      [SOURCE_CROSSWALK, 'ok'],
      [SOURCE_IDENTITY, 'ok'],
      [sourceStats(2025), 'ok'],
      [sourceSnaps(2025), 'ok'],
      [sourceStats(2026), 'ok'],
      [sourceSnaps(2026), 'ok'],
      [SOURCE_GAMES, 'ok'],
      [SOURCE_POINTS, 'ok']
    ])
    expect(listCrosswalk(db)).toHaveLength(5)
    expect(countPlayerIds(db)).toBe(7) // every fixture player
    expect(getPlayerIds(db, '4866')?.resolution).toBe('crosswalk')
    expect(getPlayerIds(db, 'LAR')?.nflverseTeam).toBe('LA')
    // 4 REG rows per season (the POST row is dropped)
    expect(listAllPlayerWeeks(db)).toHaveLength(8)
    expect(listTeamWeeks(db)).toHaveLength(8)
    expect(listSnaps(db, 'BarkSa00', 2026)).toHaveLength(2)
    // 4 REG games per season (the WC game is dropped)
    expect(listGames(db)).toHaveLength(8)
    expect(countPoints(db, 'L1')).toBeGreaterThan(0)
    const identity = result.steps.find((s) => s.source === SOURCE_IDENTITY)
    // rostered: 4866 6794 8259 7564 9509 LAR; 8259/7564/9509 resolve via Sleeper gsis → only 0 unresolved
    expect(identity?.message).toBeNull()
  })

  it('reports unresolved rostered players in the identity message', async () => {
    // no Sleeper gsis, no sportradar id, and a name the crosswalk cannot match
    db.prepare("UPDATE players SET gsis_id = NULL, full_name = 'Unknown Person' WHERE player_id IN ('8259', '7564')").run()
    const result = await refreshNflverse(deps())
    expect(result.steps.find((s) => s.source === SOURCE_IDENTITY)?.message).toBe('2 rostered players unresolved')
  })

  it('marks an unpublished season as skipped, not error, and still recomputes', async () => {
    const nflverse = fakeNflverse({
      getPlayerWeekStats: vi.fn(async (season) => (season === 2026 ? null : forSeason(parsePlayerWeekStats(fx.playerStatsCsv), season)))
    })
    const result = await refreshNflverse(deps(nflverse))
    const stats2026 = result.steps.find((s) => s.source === sourceStats(2026))
    expect(stats2026).toMatchObject({ status: 'skipped', message: '2026 stats not published yet' })
    expect(result.steps.find((s) => s.source === sourceStats(2025))?.status).toBe('ok')
    expect(result.steps.find((s) => s.source === SOURCE_POINTS)?.status).toBe('ok')
  })

  it('a failing source does not block the others', async () => {
    const nflverse = fakeNflverse({ getGames: vi.fn(async () => { throw new Error('github down') }) })
    const result = await refreshNflverse(deps(nflverse))
    expect(result.steps.find((s) => s.source === SOURCE_GAMES)).toMatchObject({ status: 'error', message: 'github down' })
    expect(result.steps.filter((s) => s.status === 'ok')).toHaveLength(7)
    expect(getLastSync(db, SOURCE_GAMES, 'error')).not.toBeNull()
  })

  it('skips fresh sources on the next refresh and then runs no identity/points steps', async () => {
    await refreshNflverse(deps())
    clock = new Date(clock.getTime() + HOUR)
    const again = await refreshNflverse(deps())
    expect(again.steps.map((s) => s.status)).toEqual(['skipped', 'skipped', 'skipped', 'skipped', 'skipped', 'skipped'])
    expect(again.steps.map((s) => s.source)).not.toContain(SOURCE_IDENTITY)
    expect(again.steps.map((s) => s.source)).not.toContain(SOURCE_POINTS)
  })

  it('uses a 7-day window for the previous season and 6 h for the current one', async () => {
    await refreshNflverse(deps())
    clock = new Date(clock.getTime() + 7 * HOUR)
    const again = await refreshNflverse(deps())
    expect(again.steps.find((s) => s.source === sourceStats(2025))?.status).toBe('skipped')
    expect(again.steps.find((s) => s.source === sourceStats(2026))?.status).toBe('ok')
    expect(again.steps.find((s) => s.source === SOURCE_POINTS)?.status).toBe('ok')
  })

  it('re-resolves identities when the Sleeper players DB changed, even with a fresh crosswalk', async () => {
    await refreshNflverse(deps())
    clock = new Date(clock.getTime() + HOUR)
    const again = await refreshNflverse(deps(), { playersChanged: true })
    expect(again.steps.find((s) => s.source === SOURCE_CROSSWALK)?.status).toBe('skipped')
    expect(again.steps.find((s) => s.source === SOURCE_IDENTITY)?.status).toBe('ok')
    expect(again.steps.find((s) => s.source === SOURCE_POINTS)?.status).toBe('ok')
  })

  it('force re-runs everything', async () => {
    await refreshNflverse(deps())
    const again = await refreshNflverse(deps(), { force: true })
    expect(again.steps.every((s) => s.status === 'ok')).toBe(true)
    expect(again.steps).toHaveLength(8)
  })

  it('skips points when no league is active', async () => {
    db.prepare("DELETE FROM app_settings WHERE key = 'active_league_id'").run()
    const result = await refreshNflverse(deps())
    expect(result.steps.map((s) => s.source)).not.toContain(SOURCE_POINTS)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/sync/nflverseSync.test.ts`
Expected: FAIL — cannot resolve `@main/sync/nflverseSync`.

- [ ] **Step 3: Write the orchestration**

`src/main/sync/nflverseSync.ts`:

```ts
import { withTransaction } from '@main/db/connection'
import {
  countPlayerIds,
  countUnresolvedRostered,
  listCrosswalk,
  listPlayerIdentitySources,
  replaceCrosswalk,
  replacePlayerIds
} from '@main/db/repos/playerIds'
import { countPoints } from '@main/db/repos/points'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { getNflState } from '@main/db/repos/state'
import {
  replacePlayerWeekStats,
  replaceSnaps,
  replaceTeamWeekStats,
  upsertGames
} from '@main/db/repos/stats'
import { recomputePoints } from '@main/scoring/recompute'
import type { NflverseClient } from '@main/sources/nflverse'
import type { SyncLogEntry, SyncResult } from '@shared/types'
import { resolvePlayers } from './identity'
import { nowOf, runStep, SkipStep, type RefreshOptions, type SyncDeps } from './step'

export const SOURCE_CROSSWALK = 'nflverse:crosswalk'
export const SOURCE_GAMES = 'nflverse:games'
export const SOURCE_IDENTITY = 'app:identity'
export const SOURCE_POINTS = 'app:points'
export const STATS_SOURCE_PREFIX = 'nflverse:stats:'
export const sourceStats = (season: number): string => `${STATS_SOURCE_PREFIX}${season}`
export const sourceSnaps = (season: number): string => `nflverse:snaps:${season}`

const HOUR = 60 * 60 * 1000
export const CROSSWALK_FRESHNESS_MS = 24 * HOUR
export const NFLVERSE_FRESHNESS_MS = 6 * HOUR
/** A finished season's files never change; re-fetch weekly just in case of upstream corrections. */
export const PAST_SEASON_FRESHNESS_MS = 7 * 24 * HOUR

export interface NflverseSyncDeps extends SyncDeps {
  nflverse: NflverseClient
}

export interface NflverseRefreshOptions extends RefreshOptions {
  /** The Sleeper players DB was re-fetched this run: re-resolve identities even if the crosswalk is fresh. */
  playersChanged?: boolean
}

const ok = (entry: SyncLogEntry): boolean => entry.status === 'ok'

/**
 * Spec §9: crosswalk → identity → stats (both seasons) → snaps → games → points. Each step logs to
 * `sync_log` and is independent; `app:identity` / `app:points` run only when an input changed.
 */
export async function refreshNflverse(
  deps: NflverseSyncDeps,
  options: NflverseRefreshOptions = {}
): Promise<SyncResult> {
  const force = options.force ?? false
  const steps: SyncLogEntry[] = []
  const state = getNflState(deps.db)
  if (!state) return { steps }
  const current = Number(state.season)
  const seasons = [current - 1, current]
  const leagueId = getSetting(deps.db, SETTING_ACTIVE_LEAGUE)
  const ts = (): string => nowOf(deps).toISOString()

  const crosswalk = await runStep(deps, SOURCE_CROSSWALK, CROSSWALK_FRESHNESS_MS, force, async () => {
    const result = await deps.nflverse.getCrosswalk()
    return withTransaction(deps.db, () => replaceCrosswalk(deps.db, result.records, ts()))
  })
  steps.push(crosswalk)

  let identityChanged = false
  if (force || ok(crosswalk) || options.playersChanged || countPlayerIds(deps.db) === 0) {
    const identity = await runStep(deps, SOURCE_IDENTITY, 0, true, async () => {
      const records = resolvePlayers(listPlayerIdentitySources(deps.db), listCrosswalk(deps.db))
      const rows = withTransaction(deps.db, () => replacePlayerIds(deps.db, records, ts()))
      const unresolved = leagueId ? countUnresolvedRostered(deps.db, leagueId) : 0
      return { rows, message: unresolved ? `${unresolved} rostered players unresolved` : null }
    })
    steps.push(identity)
    identityChanged = ok(identity)
  }

  let statsChanged = false
  for (const season of seasons) {
    const freshness = season === current ? NFLVERSE_FRESHNESS_MS : PAST_SEASON_FRESHNESS_MS
    const stats = await runStep(deps, sourceStats(season), freshness, force, async () => {
      const [players, teams] = await Promise.all([
        deps.nflverse.getPlayerWeekStats(season),
        deps.nflverse.getTeamWeekStats(season)
      ])
      if (!players || !teams) throw new SkipStep(`${season} stats not published yet`)
      const regPlayers = players.records.filter((r) => r.seasonType === 'REG')
      const regTeams = teams.records.filter((r) => r.seasonType === 'REG')
      const rows = withTransaction(
        deps.db,
        () =>
          replacePlayerWeekStats(deps.db, season, regPlayers, ts()) +
          replaceTeamWeekStats(deps.db, season, regTeams, ts())
      )
      const skipped = players.skipped + teams.skipped
      return { rows, message: skipped ? `${skipped} unparseable rows skipped` : null }
    })
    steps.push(stats)
    statsChanged ||= ok(stats)

    steps.push(
      await runStep(deps, sourceSnaps(season), freshness, force, async () => {
        const snaps = await deps.nflverse.getSnapCounts(season)
        if (!snaps) throw new SkipStep(`${season} snap counts not published yet`)
        const reg = snaps.records.filter((r) => r.gameType === 'REG')
        return withTransaction(deps.db, () => replaceSnaps(deps.db, season, reg, ts()))
      })
    )
  }

  const games = await runStep(deps, SOURCE_GAMES, NFLVERSE_FRESHNESS_MS, force, async () => {
    const result = await deps.nflverse.getGames()
    const wanted = result.records.filter((g) => g.gameType === 'REG' && seasons.includes(g.season))
    return withTransaction(deps.db, () => upsertGames(deps.db, wanted, ts()))
  })
  steps.push(games)

  if (
    leagueId &&
    (force || identityChanged || statsChanged || ok(games) || countPoints(deps.db, leagueId) === 0)
  ) {
    steps.push(
      await runStep(deps, SOURCE_POINTS, 0, true, async () =>
        withTransaction(deps.db, () => recomputePoints(deps.db, leagueId, ts()))
      )
    )
  }
  return { steps }
}
```

`src/main/sync/refresh.ts`:

```ts
import type { SyncResult } from '@shared/types'
import { refreshNflverse, type NflverseSyncDeps } from './nflverseSync'
import { importLeague, refreshSleeper, SOURCE_PLAYERS } from './sleeperSync'
import type { RefreshOptions } from './step'

/** Refresh button / on-launch: Sleeper first (it sets the NFL season), then nflverse. */
export async function refreshAll(
  deps: NflverseSyncDeps,
  options: RefreshOptions = {}
): Promise<SyncResult> {
  const sleeper = await refreshSleeper(deps, options)
  const playersChanged = sleeper.steps.some((s) => s.source === SOURCE_PLAYERS && s.status === 'ok')
  const nflverse = await refreshNflverse(deps, { ...options, playersChanged })
  return { steps: [...sleeper.steps, ...nflverse.steps] }
}

/** Setup → Import: the Sleeper first import followed by the full nflverse pipeline. */
export async function importAll(
  deps: NflverseSyncDeps,
  leagueId: string,
  myUserId: string | null
): Promise<SyncResult> {
  const sleeper = await importLeague(deps, leagueId, myUserId)
  const nflverse = await refreshNflverse(deps, { playersChanged: true })
  return { steps: [...sleeper.steps, ...nflverse.steps] }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main/sync/nflverseSync.test.ts`
Expected: 10 pass. If the "runs … in order" test's `countPlayerIds` expectation differs, count the players in `tests/fixtures/sleeper.ts` (`Object.keys(fx.players).length`) and use that number.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/sync/nflverseSync.ts src/main/sync/refresh.ts tests/main/sync/nflverseSync.test.ts
git commit -m "feat(sync): add nflverse pipeline and combined refresh

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Shared types, read queries, IPC handlers and preload

**Files:**
- Modify: `src/shared/types.ts` (`RosterPlayer` fields, `PlayerFilter`, `PlayerRow`, `WeekStats`, `SyncStatus.lastNflverseSync`)
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/db/repos/points.ts` (+ `POINTS_CTE`, `round2`)
- Modify: `src/main/db/repos/teams.ts` (`listRoster`)
- Modify: `src/main/db/repos/syncLog.ts` (+ `getLastSyncLike`)
- Create: `src/main/db/repos/playersQuery.ts`
- Modify: `src/main/ipc/handlers.ts`, `src/main/index.ts`, `src/preload/index.ts`
- Test: `tests/main/db/playersQuery.test.ts`; `tests/main/db/repos.test.ts` and `tests/main/sync/sleeperSync.test.ts` keep calling `listRoster(db, 'L1', 1)` unchanged.

**Interfaces:**
- Consumes: `PointsContext`, `NO_POINTS_CONTEXT`, `latestPointsWeek`, `listWeekPoints` (Task 6); `teamByeWeeks`, `listPlayerWeeks`, `listSnaps`, `listTeamWeeks` (Task 3); `getPlayerIds` (Task 4); `toNflverseTeam` (Task 4); `recomputePoints` (Task 6); `refreshAll`, `importAll`, `NflverseSyncDeps`, `STATS_SOURCE_PREFIX` (Task 7); `createNflverseClient` (Task 1).
- Produces: shared `RosterPlayer` (+ `byeWeek`, `seasonPoints`, `lastWeekPoints`, `statsAvailable`), `OwnerFilter = 'all' | 'fa' | number`, `PlayerFilter { query?, position?, team?, owner? }`, `PlayerRow`, `WeekSnaps`, `WeekStats`, `SyncStatus.lastNflverseSync`; `Api.league.pointsContext()`, `Api.players.search(filter)`, `Api.players.weeklyStats(playerId)`; IPC channels `league:pointsContext`, `players:search`, `players:weeklyStats`; repo `searchPlayers(db, leagueId, ctx, filter, limit?)`, `playerWeeklyStats(db, leagueId, playerId, season)`, `POINTS_CTE`, `round2`; `startRefresh(ctx, options?)` (in-flight guarded) and `AppContext.nflverse`.

- [ ] **Step 1: Extend the shared types and the IPC contract**

`src/shared/types.ts` — replace the `RosterPlayer` interface and `SyncStatus`, and add the new types:

```ts
export interface RosterPlayer {
  playerId: string
  slot: RosterSlot
  starterIndex: number | null
  fullName: string
  position: string | null
  team: string | null
  status: string | null
  injuryStatus: string | null
  byeWeek: number | null
  /** Sum of this season's app-computed points; null when no scored week exists. */
  seasonPoints: number | null
  /** Points in `PointsContext.lastWeek`; null when the player has no row for it (bye, DNP). */
  lastWeekPoints: number | null
  /** false = no nflverse identity: the UI shows "stats unavailable". */
  statsAvailable: boolean
}

export type OwnerFilter = 'all' | 'fa' | number

export interface PlayerFilter {
  /** Case-insensitive substring of the full name. */
  query?: string
  position?: string
  /** Sleeper NFL team code. */
  team?: string
  /** 'fa' = free agents only; a number = that roster id. */
  owner?: OwnerFilter
}

export interface PlayerRow {
  playerId: string
  fullName: string
  position: string | null
  team: string | null
  status: string | null
  injuryStatus: string | null
  ownerRosterId: number | null
  ownerName: string | null
  byeWeek: number | null
  seasonPoints: number | null
  lastWeekPoints: number | null
  statsAvailable: boolean
}

export interface WeekSnaps {
  offenseSnaps: number | null
  offensePct: number | null
}

/** One week of raw nflverse stats for a player (or a team defense), with the app's points. */
export interface WeekStats {
  season: number
  week: number
  team: string | null
  opponent: string | null
  points: number | null
  stats: Record<string, number>
  snaps: WeekSnaps | null
}
```

and in `SyncStatus` add `lastNflverseSync: SyncLogEntry | null` after `lastSleeperSync`.

`src/shared/ipc.ts` — extend the imports (`PlayerFilter`, `PlayerRow`, `PointsContext`, `WeekStats`), the `Api` interface and the channel map:

```ts
  league: {
    get(): Promise<League | null>
    teams(): Promise<Team[]>
    roster(rosterId: number): Promise<RosterPlayer[]>
    /** Season shown and the latest scored week; the League/Players screens label their columns with it. */
    pointsContext(): Promise<PointsContext>
  }
  players: {
    /** Scored positions only; ordered by season points; at most 200 rows. */
    search(filter: PlayerFilter): Promise<PlayerRow[]>
    /** Raw weekly stats + snaps + points for the league's season. [] when the player has no nflverse identity. */
    weeklyStats(playerId: string): Promise<WeekStats[]>
  }
```

```ts
  leaguePointsContext: 'league:pointsContext',
  playersSearch: 'players:search',
  playersWeeklyStats: 'players:weeklyStats',
```

- [ ] **Step 2: Write the failing query tests**

`tests/main/db/playersQuery.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { replacePlayerIds } from '@main/db/repos/playerIds'
import { playerWeeklyStats, searchPlayers } from '@main/db/repos/playersQuery'
import { replacePoints } from '@main/db/repos/points'
import { replacePlayerWeekStats, replaceSnaps, replaceTeamWeekStats, upsertGames } from '@main/db/repos/stats'
import { listRoster } from '@main/db/repos/teams'
import { parsePlayerWeekStats, parseSnapCounts, parseTeamWeekStats } from '@main/sources/nflverse'
import type { PointsContext } from '@shared/types'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as fx from '../../fixtures/nflverse'

const SEASON = 2026 // the Sleeper fixture league's season
const ctx: PointsContext = { season: SEASON, lastWeek: 2 }
const game = (week: number, home: string, away: string): Parameters<typeof upsertGames>[1][number] => ({
  gameId: `${SEASON}_${week}_${away}_${home}`, season: SEASON, week, gameType: 'REG', gameday: null,
  homeTeam: home, awayTeam: away, homeScore: null, awayScore: null
})

describe('points-aware queries', () => {
  let db: Db

  beforeEach(() => {
    db = seedLeague()
    replacePlayerIds(
      db,
      [
        { playerId: '4866', gsisId: '00-0034844', pfrId: 'BarkSa00', sportradarId: null, espnId: null, nflverseTeam: null, resolution: 'crosswalk' },
        { playerId: '6794', gsisId: '00-0036322', pfrId: null, sportradarId: null, espnId: null, nflverseTeam: null, resolution: 'crosswalk' },
        { playerId: '7564', gsisId: '00-0036900', pfrId: null, sportradarId: null, espnId: null, nflverseTeam: null, resolution: 'sleeper_gsis' },
        { playerId: '9509', gsisId: '00-0039013', pfrId: null, sportradarId: null, espnId: null, nflverseTeam: null, resolution: 'sleeper_gsis' },
        { playerId: 'LAR', gsisId: null, pfrId: null, sportradarId: null, espnId: null, nflverseTeam: 'LA', resolution: 'team' },
        { playerId: '8259', gsisId: null, pfrId: null, sportradarId: null, espnId: null, nflverseTeam: null, resolution: 'unresolved' }
      ],
      SEED_TS
    )
    replacePoints(
      db,
      'L1',
      [
        { playerId: '4866', season: SEASON, week: 1, points: 18.4 },
        { playerId: '4866', season: SEASON, week: 2, points: 11.8 },
        { playerId: '6794', season: SEASON, week: 1, points: 10.8 },
        { playerId: 'LAR', season: SEASON, week: 1, points: 12 },
        { playerId: '7564', season: SEASON, week: 1, points: 25 },
        { playerId: '9509', season: SEASON, week: 2, points: 9 },
        { playerId: '4866', season: SEASON - 1, week: 1, points: 99 }
      ],
      SEED_TS
    )
    // PHI plays weeks 1 and 3 only -> bye week 2; MIN plays 1-3 (no bye found in a 3-week sample)
    upsertGames(db, [game(1, 'PHI', 'MIN'), game(2, 'MIN', 'LA'), game(3, 'PHI', 'LA'), game(1, 'LA', 'BUF'), game(2, 'BUF', 'ATL'), game(3, 'MIN', 'ATL')], SEED_TS)
  })

  it('listRoster adds season/last-week points, bye and availability', () => {
    const roster = listRoster(db, 'L1', 1, ctx)
    const barkley = roster.find((p) => p.playerId === '4866')
    expect(barkley).toMatchObject({ seasonPoints: 30.2, lastWeekPoints: 11.8, byeWeek: 2, statsAvailable: true })
    expect(roster.find((p) => p.playerId === '6794')).toMatchObject({ seasonPoints: 10.8, lastWeekPoints: null, byeWeek: null })
    expect(roster.find((p) => p.playerId === '8259')).toMatchObject({ seasonPoints: null, lastWeekPoints: null, statsAvailable: false })
    expect(roster.find((p) => p.playerId === 'LAR')).toMatchObject({ seasonPoints: 12, statsAvailable: true })
  })

  it('listRoster without a context returns no points (Plan A/B callers)', () => {
    expect(listRoster(db, 'L1', 1).every((p) => p.seasonPoints === null && p.byeWeek === null)).toBe(true)
  })

  it('searchPlayers orders by season points and joins the owner', () => {
    const rows = searchPlayers(db, 'L1', ctx, {})
    expect(rows.map((r) => r.playerId)).toEqual(['4866', '7564', 'LAR', '6794', '9509', '8259'])
    expect(rows[0]).toMatchObject({ fullName: 'Saquon Barkley', ownerRosterId: 1, ownerName: 'Cook Book', seasonPoints: 30.2, lastWeekPoints: 11.8, byeWeek: 2 })
    expect(rows.map((r) => r.playerId)).not.toContain('1234') // Inactive, no team, not rostered
  })

  it('searchPlayers filters by position, team, owner and name', () => {
    expect(searchPlayers(db, 'L1', ctx, { position: 'WR' }).map((r) => r.playerId)).toEqual(['7564', '6794'])
    expect(searchPlayers(db, 'L1', ctx, { team: 'PHI' }).map((r) => r.playerId)).toEqual(['4866'])
    expect(searchPlayers(db, 'L1', ctx, { owner: 2 }).map((r) => r.playerId)).toEqual(['7564', '9509'])
    expect(searchPlayers(db, 'L1', ctx, { query: 'jeff' }).map((r) => r.playerId)).toEqual(['6794'])
    expect(searchPlayers(db, 'L1', ctx, { query: '%_\\' })).toEqual([])
    db.prepare("DELETE FROM roster_players WHERE player_id = '9509'").run()
    expect(searchPlayers(db, 'L1', ctx, { owner: 'fa' })).toMatchObject([{ playerId: '9509', ownerRosterId: null, ownerName: null }])
  })

  it('playerWeeklyStats merges stats, snaps and points for a player, team rows for a DEF', () => {
    const reg = parsePlayerWeekStats(fx.playerStatsCsv).records.filter((r) => r.seasonType === 'REG')
    replacePlayerWeekStats(db, SEASON, reg.map((r) => ({ ...r, season: SEASON })), SEED_TS)
    replaceTeamWeekStats(db, SEASON, parseTeamWeekStats(fx.teamStatsCsv).records.map((r) => ({ ...r, season: SEASON })), SEED_TS)
    replaceSnaps(db, SEASON, parseSnapCounts(fx.snapCountsCsv).records.map((r) => ({ ...r, season: SEASON })), SEED_TS)

    const weeks = playerWeeklyStats(db, 'L1', '4866', SEASON)
    expect(weeks).toHaveLength(2)
    expect(weeks[0]).toMatchObject({ season: SEASON, week: 1, team: 'PHI', opponent: 'DAL', points: 18.4, snaps: { offenseSnaps: 55, offensePct: 0.83 } })
    expect(weeks[0].stats.rushing_yards).toBe(60)
    expect(weeks[1]).toMatchObject({ week: 2, points: 11.8, snaps: { offenseSnaps: 60, offensePct: 0.9 } })

    const def = playerWeeklyStats(db, 'L1', 'LAR', SEASON)
    expect(def).toHaveLength(1)
    expect(def[0]).toMatchObject({ week: 1, team: 'LA', opponent: 'HOU', points: 12, snaps: null })
    expect(def[0].stats.def_sacks).toBe(4)

    expect(playerWeeklyStats(db, 'L1', '8259', SEASON)).toEqual([])
    expect(playerWeeklyStats(db, 'L1', 'nobody', SEASON)).toEqual([])
  })
})
```

(`'Cook Book'` is roster 1's `metadata.team_name` in `tests/fixtures/sleeper.ts`; `ownerName` is `COALESCE(team_name, display_name)`, so roster 2 — no team name — shows `'Rival'`.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/main/db/playersQuery.test.ts`
Expected: FAIL — cannot resolve `@main/db/repos/playersQuery`.

- [ ] **Step 4: Add the shared CTE and rounding to the points repo**

Append to `src/main/db/repos/points.ts`:

```ts
/**
 * CTE giving each player's season total and last-week points. Bind, in order:
 * `lastWeek` (nullable), `leagueId`, `season` — before the outer query's own parameters.
 */
export const POINTS_CTE = `WITH pts AS (
  SELECT player_id, SUM(points) AS season_points,
         SUM(CASE WHEN week = ? THEN points END) AS last_week_points
  FROM player_week_points WHERE league_id = ? AND season = ? GROUP BY player_id
)`

/** SQL SUMs of 2-decimal values carry float noise (30.200000000000003). */
export function round2(value: number | null): number | null {
  return value === null ? null : Math.round(value * 100) / 100
}
```

- [ ] **Step 5: Extend `listRoster`**

In `src/main/db/repos/teams.ts` add imports:

```ts
import { toNflverseTeam } from '@shared/teams'
import type { PointsContext } from '@shared/types'
import { NO_POINTS_CONTEXT, POINTS_CTE, round2 } from './points'
import { teamByeWeeks } from './stats'
```

extend `RosterRow` with `season_points: number | null`, `last_week_points: number | null`, `stats_available: number`, and replace `listRoster`:

```ts
export function listRoster(
  db: Db,
  leagueId: string,
  rosterId: number,
  ctx: PointsContext = NO_POINTS_CONTEXT
): RosterPlayer[] {
  const byes = teamByeWeeks(db, ctx.season)
  const rows = db
    .prepare(
      `${POINTS_CTE}
       SELECT rp.player_id, rp.slot, rp.starter_index,
         COALESCE(p.full_name, rp.player_id) AS full_name, p.position, p.team, p.status, p.injury_status,
         pts.season_points, pts.last_week_points,
         CASE WHEN i.gsis_id IS NOT NULL OR i.nflverse_team IS NOT NULL THEN 1 ELSE 0 END AS stats_available
       FROM roster_players rp
       LEFT JOIN players p ON p.player_id = rp.player_id
       LEFT JOIN pts ON pts.player_id = rp.player_id
       LEFT JOIN player_ids i ON i.player_id = rp.player_id
       WHERE rp.league_id = ? AND rp.roster_id = ?
       ORDER BY CASE rp.slot WHEN 'starter' THEN 0 WHEN 'bench' THEN 1 WHEN 'ir' THEN 2 ELSE 3 END,
         rp.starter_index, p.position, full_name`
    )
    .all(ctx.lastWeek, leagueId, ctx.season, leagueId, rosterId) as unknown as RosterRow[]
  return rows.map((r) => ({
    playerId: r.player_id,
    slot: r.slot,
    starterIndex: r.starter_index,
    fullName: r.full_name,
    position: r.position,
    team: r.team,
    status: r.status,
    injuryStatus: r.injury_status,
    byeWeek: r.team ? (byes.get(toNflverseTeam(r.team)) ?? null) : null,
    seasonPoints: round2(r.season_points),
    lastWeekPoints: round2(r.last_week_points),
    statsAvailable: r.stats_available === 1
  }))
}
```

- [ ] **Step 6: Write the players query repo**

`src/main/db/repos/playersQuery.ts`:

```ts
import { toNflverseTeam } from '@shared/teams'
import type { PlayerFilter, PlayerRow, PointsContext, WeekStats } from '@shared/types'
import type { Db } from '../connection'
import { getPlayerIds } from './playerIds'
import { listWeekPoints, POINTS_CTE, round2 } from './points'
import { listPlayerWeeks, listSnaps, listTeamWeeks, teamByeWeeks } from './stats'

const SCORED_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'DL', 'LB', 'DB']

interface SearchRow {
  player_id: string
  full_name: string
  position: string | null
  team: string | null
  status: string | null
  injury_status: string | null
  owner_roster_id: number | null
  owner_name: string | null
  season_points: number | null
  last_week_points: number | null
  stats_available: number
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

/**
 * Players screen table: scored positions that are rostered, have points, or are active on an NFL
 * team. Ordered by season points, then Sleeper's search rank.
 */
export function searchPlayers(
  db: Db,
  leagueId: string,
  ctx: PointsContext,
  filter: PlayerFilter,
  limit = 200
): PlayerRow[] {
  const where = [
    `p.position IN (${SCORED_POSITIONS.map(() => '?').join(', ')})`,
    `(rp.player_id IS NOT NULL OR pts.season_points IS NOT NULL
      OR (p.team IS NOT NULL AND COALESCE(p.status, '') != 'Inactive'))`
  ]
  const params: (string | number | null)[] = [ctx.lastWeek, leagueId, ctx.season, leagueId, ...SCORED_POSITIONS]
  if (filter.position) {
    where.push('p.position = ?')
    params.push(filter.position)
  }
  if (filter.team) {
    where.push('p.team = ?')
    params.push(filter.team)
  }
  if (filter.query?.trim()) {
    where.push("p.full_name LIKE ? ESCAPE '\\'")
    params.push(`%${escapeLike(filter.query.trim())}%`)
  }
  if (filter.owner === 'fa') where.push('rp.player_id IS NULL')
  else if (typeof filter.owner === 'number') {
    where.push('rp.roster_id = ?')
    params.push(filter.owner)
  }
  params.push(limit)

  const byes = teamByeWeeks(db, ctx.season)
  const rows = db
    .prepare(
      `${POINTS_CTE}
       SELECT p.player_id, p.full_name, p.position, p.team, p.status, p.injury_status,
         rp.roster_id AS owner_roster_id, COALESCE(t.team_name, t.display_name) AS owner_name,
         pts.season_points, pts.last_week_points,
         CASE WHEN i.gsis_id IS NOT NULL OR i.nflverse_team IS NOT NULL THEN 1 ELSE 0 END AS stats_available
       FROM players p
       LEFT JOIN pts ON pts.player_id = p.player_id
       LEFT JOIN roster_players rp ON rp.player_id = p.player_id AND rp.league_id = ?
       LEFT JOIN teams t ON t.league_id = rp.league_id AND t.roster_id = rp.roster_id
       LEFT JOIN player_ids i ON i.player_id = p.player_id
       WHERE ${where.join(' AND ')}
       ORDER BY pts.season_points DESC NULLS LAST, p.search_rank ASC NULLS LAST, p.full_name
       LIMIT ?`
    )
    .all(...params) as unknown as SearchRow[]
  return rows.map((r) => ({
    playerId: r.player_id,
    fullName: r.full_name,
    position: r.position,
    team: r.team,
    status: r.status,
    injuryStatus: r.injury_status,
    ownerRosterId: r.owner_roster_id,
    ownerName: r.owner_name,
    byeWeek: r.team ? (byes.get(toNflverseTeam(r.team)) ?? null) : null,
    seasonPoints: round2(r.season_points),
    lastWeekPoints: round2(r.last_week_points),
    statsAvailable: r.stats_available === 1
  }))
}

/** Side panel: raw weekly rows for one player (team rows for a DEF) with snaps and the app's points. */
export function playerWeeklyStats(
  db: Db,
  leagueId: string,
  playerId: string,
  season: number
): WeekStats[] {
  const ids = getPlayerIds(db, playerId)
  if (!ids) return []
  const points = new Map(listWeekPoints(db, leagueId, playerId, season).map((p) => [p.week, p.points]))
  if (ids.nflverseTeam) {
    return listTeamWeeks(db)
      .filter((t) => t.team === ids.nflverseTeam && t.season === season)
      .map((t) => ({
        season,
        week: t.week,
        team: t.team,
        opponent: t.opponent,
        points: points.get(t.week) ?? null,
        stats: t.stats,
        snaps: null
      }))
  }
  if (!ids.gsisId) return []
  const snaps = new Map(
    (ids.pfrId ? listSnaps(db, ids.pfrId, season) : []).map((s) => [s.week, s])
  )
  return listPlayerWeeks(db, ids.gsisId, season).map((w) => {
    const s = snaps.get(w.week)
    return {
      season,
      week: w.week,
      team: w.team,
      opponent: w.opponent,
      points: points.get(w.week) ?? null,
      stats: w.stats,
      snaps: s ? { offenseSnaps: s.offenseSnaps, offensePct: s.offensePct } : null
    }
  })
}
```

Add to `src/main/db/repos/syncLog.ts`:

```ts
/** Latest entry whose source starts with `prefix` (e.g. every `nflverse:stats:<season>`). */
export function getLastSyncLike(db: Db, prefix: string, status: SyncStatusKind): SyncLogEntry | null {
  const row = db
    .prepare('SELECT * FROM sync_log WHERE source LIKE ? AND status = ? ORDER BY id DESC LIMIT 1')
    .get(`${prefix}%`, status) as Row | undefined
  return row ? toEntry(row) : null
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/main/db`
Expected: all pass, including the 5 new `playersQuery` tests and the untouched `repos.test.ts` / `rulesRepo.test.ts`.

- [ ] **Step 8: Wire the handlers, main entry and preload**

`src/main/ipc/handlers.ts` — full replacement of the imports/context/handlers that change (keep `setupFindLeagues`, `leagueGet`, `leagueTeams`, `rulesGet`, `rulesReimport` as they are):

```ts
import { ipcMain, type BrowserWindow } from 'electron'
import { withTransaction, type Db } from '@main/db/connection'
import { getLeague } from '@main/db/repos/leagues'
import { playerWeeklyStats, searchPlayers } from '@main/db/repos/playersQuery'
import { latestPointsWeek, NO_POINTS_CONTEXT } from '@main/db/repos/points'
import { getRules, saveRules } from '@main/db/repos/rules'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { getNflState } from '@main/db/repos/state'
import { getLastError, getLastSync, getLastSyncLike } from '@main/db/repos/syncLog'
import { listRoster, listTeams } from '@main/db/repos/teams'
import { normalizeRules } from '@main/scoring/normalize'
import { recomputePoints } from '@main/scoring/recompute'
import type { NflverseClient } from '@main/sources/nflverse'
import type { SleeperClient } from '@main/sources/sleeper'
import { mapLeagueSummary } from '@main/sync/mappers'
import { STATS_SOURCE_PREFIX, type NflverseSyncDeps } from '@main/sync/nflverseSync'
import { importAll, refreshAll } from '@main/sync/refresh'
import { reimportRules, SOURCE_LEAGUE } from '@main/sync/sleeperSync'
import type { RefreshOptions } from '@main/sync/step'
import { IPC, type FindLeaguesResult } from '@shared/ipc'
import type { Rules } from '@shared/rules'
import type {
  League,
  PlayerFilter,
  PlayerRow,
  PointsContext,
  RosterPlayer,
  SyncResult,
  SyncStatus,
  Team,
  WeekStats
} from '@shared/types'

export interface AppContext {
  db: Db
  sleeper: SleeperClient
  nflverse: NflverseClient
  getWindow: () => BrowserWindow | null
}

export function syncDeps(ctx: AppContext): NflverseSyncDeps {
  return {
    db: ctx.db,
    sleeper: ctx.sleeper,
    nflverse: ctx.nflverse,
    onStep: (entry) => ctx.getWindow()?.webContents.send(IPC.syncProgress, entry)
  }
}

let inFlight: Promise<SyncResult> | null = null

/** One refresh at a time: the on-launch refresh and the Refresh button share the same promise. */
export function startRefresh(ctx: AppContext, options: RefreshOptions = {}): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = refreshAll(syncDeps(ctx), options).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

function pointsContext(ctx: AppContext, leagueId: string): PointsContext {
  const league = getLeague(ctx.db, leagueId)
  if (!league) return NO_POINTS_CONTEXT
  const season = Number(league.season)
  return { season, lastWeek: latestPointsWeek(ctx.db, leagueId, season) }
}
```

and the handler bodies that change or are new:

```ts
  ipcMain.handle(
    IPC.setupImportLeague,
    (_event, leagueId: string, userId: string | null): Promise<SyncResult> =>
      importAll(syncDeps(ctx), leagueId, userId)
  )

  ipcMain.handle(IPC.leagueRoster, (_event, rosterId: number): RosterPlayer[] => {
    const id = activeLeagueId()
    return id ? listRoster(ctx.db, id, rosterId, pointsContext(ctx, id)) : []
  })

  ipcMain.handle(IPC.leaguePointsContext, (): PointsContext => {
    const id = activeLeagueId()
    return id ? pointsContext(ctx, id) : NO_POINTS_CONTEXT
  })

  ipcMain.handle(IPC.rulesUpdate, (_event, input: Rules): Rules => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    const rules = normalizeRules(input, new Date().toISOString())
    withTransaction(ctx.db, () => {
      saveRules(ctx.db, id, rules)
      recomputePoints(ctx.db, id, rules.updatedAt) // spec §7: rules change → rebuild player_week_points
    })
    return rules
  })

  ipcMain.handle(IPC.playersSearch, (_event, filter: PlayerFilter): PlayerRow[] => {
    const id = activeLeagueId()
    return id ? searchPlayers(ctx.db, id, pointsContext(ctx, id), filter ?? {}) : []
  })

  ipcMain.handle(IPC.playersWeeklyStats, (_event, playerId: string): WeekStats[] => {
    const id = activeLeagueId()
    return id ? playerWeeklyStats(ctx.db, id, playerId, pointsContext(ctx, id).season) : []
  })

  ipcMain.handle(IPC.syncRefresh, (_event, force: boolean): Promise<SyncResult> =>
    startRefresh(ctx, { force })
  )

  ipcMain.handle(IPC.syncStatus, (): SyncStatus => ({
    nflState: getNflState(ctx.db),
    lastSleeperSync: getLastSync(ctx.db, SOURCE_LEAGUE, 'ok'),
    lastNflverseSync: getLastSyncLike(ctx.db, STATS_SOURCE_PREFIX, 'ok'),
    lastError: getLastError(ctx.db),
    activeLeagueId: activeLeagueId()
  }))
```

`src/main/index.ts`: change the handler import to `import { registerIpcHandlers, startRefresh, type AppContext } from '@main/ipc/handlers'`, add `import { createNflverseClient } from '@main/sources/nflverse'`, drop the `refreshSleeper` import, add `nflverse: createNflverseClient(),` to `ctx`, and replace the background refresh line with:

```ts
  if (getSetting(ctx.db, SETTING_ACTIVE_LEAGUE)) {
    startRefresh(ctx).catch((err) => console.error('background refresh failed', err))
  }
```

`src/preload/index.ts` — add to `league`: `pointsContext: () => ipcRenderer.invoke(IPC.leaguePointsContext),` and a new namespace after `rules`:

```ts
  players: {
    search: (filter) => ipcRenderer.invoke(IPC.playersSearch, filter),
    weeklyStats: (playerId) => ipcRenderer.invoke(IPC.playersWeeklyStats, playerId)
  },
```

- [ ] **Step 9: Typecheck, lint, test, commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/shared/types.ts src/shared/ipc.ts src/main/db/repos/points.ts src/main/db/repos/teams.ts src/main/db/repos/syncLog.ts src/main/db/repos/playersQuery.ts src/main/ipc/handlers.ts src/main/index.ts src/preload/index.ts tests/main/db/playersQuery.test.ts
git commit -m "feat(ipc): expose points, player search and weekly stats

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Points on the League screen, status bar "Stats" label, App wiring

**Files:**
- Modify: `src/renderer/src/lib/format.ts` (+ `fmtPoints`, `fmtPct`)
- Modify: `src/renderer/src/screens/LeagueScreen.tsx`
- Modify: `src/renderer/src/components/StatusBar.tsx`
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/screens/RulesScreen.tsx` (`onSaved` prop)
- Test: `tests/renderer/lib/format.test.ts` (+ cases)

**Interfaces:**
- Consumes: `api.league.pointsContext()`, `RosterPlayer` fields, `SyncStatus.lastNflverseSync` (Task 8).
- Produces: `fmtPoints(value: number | null): string` (`'—'` for null, else 1 decimal), `fmtPct(value: number | null): string` (`'—'` or `'83%'`); `RulesScreen` accepts `onSaved?: () => void`.

- [ ] **Step 1: Write the failing format tests**

Append to `tests/renderer/lib/format.test.ts` (add `fmtPct, fmtPoints` to the existing import from `@/lib/format`):

```ts
describe('fmtPoints / fmtPct', () => {
  it('formats points with one decimal and null as a dash', () => {
    expect(fmtPoints(null)).toBe('—')
    expect(fmtPoints(0)).toBe('0.0')
    expect(fmtPoints(18.4)).toBe('18.4')
    expect(fmtPoints(11.75)).toBe('11.8')
  })

  it('formats 0-1 fractions as whole percentages', () => {
    expect(fmtPct(null)).toBe('—')
    expect(fmtPct(0.83)).toBe('83%')
    expect(fmtPct(1)).toBe('100%')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/lib/format.test.ts`
Expected: FAIL — `fmtPoints` is not exported.

- [ ] **Step 3: Implement the formatters**

Append to `src/renderer/src/lib/format.ts`:

```ts
export function fmtPoints(value: number | null): string {
  return value === null ? '—' : value.toFixed(1)
}

/** nflverse percentages are 0–1 fractions. */
export function fmtPct(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/lib/format.test.ts`
Expected: all pass.

- [ ] **Step 5: Add the columns to the League screen**

In `src/renderer/src/screens/LeagueScreen.tsx`:

1. Imports: add `fmtPoints` to the `@/lib/format` import; add `PointsContext` to the `@shared/types` type import.
2. State: `const [ctx, setCtx] = useState<PointsContext | null>(null)`.
3. In the first `useEffect` (the one that loads league and teams) add:

```ts
    void api.league
      .pointsContext()
      .then(setCtx)
      .catch((err) => setError(errorMessage(err)))
```

4. Replace the table header row and the body row with:

```tsx
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Pos</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="w-14">Team</TableHead>
                      <TableHead className="w-12 text-right">Bye</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-16 text-right">Pts</TableHead>
                      <TableHead className="w-16 text-right">
                        {ctx?.lastWeek ? `Wk ${ctx.lastWeek}` : 'Last'}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.players.map((p) => (
                      <TableRow key={p.playerId}>
                        <TableCell>
                          <PositionBadge position={p.position} />
                        </TableCell>
                        <TableCell className="font-medium">{p.fullName}</TableCell>
                        <TableCell className="text-muted-foreground">{p.team ?? 'FA'}</TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {p.byeWeek ?? '—'}
                        </TableCell>
                        <TableCell className={cn('text-xs', p.injuryStatus && 'text-destructive')}>
                          {p.injuryStatus ?? ''}
                        </TableCell>
                        {p.statsAvailable ? (
                          <>
                            <TableCell className="text-right font-medium tabular-nums">
                              {fmtPoints(p.seasonPoints)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {fmtPoints(p.lastWeekPoints)}
                            </TableCell>
                          </>
                        ) : (
                          <TableCell
                            colSpan={2}
                            className="text-right text-xs text-muted-foreground"
                            title="This player could not be matched to nflverse data"
                          >
                            stats unavailable
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
```

- [ ] **Step 6: Status bar and App wiring**

`src/renderer/src/components/StatusBar.tsx`: replace `<span>Stats: not yet</span>` with

```tsx
      <span>Stats: {relativeTime(status?.lastNflverseSync?.finishedAt)}</span>
```

`src/renderer/src/App.tsx`: make the progress listener also bump on the points step, and pass `onSaved` to the Rules screen:

```tsx
  useEffect(
    () =>
      api.sync.onProgress((entry) => {
        if ((entry.source === 'sleeper:league' || entry.source === 'app:points') && entry.status === 'ok')
          bumpData()
      }),
    [bumpData]
  )
```

```tsx
          {screen === 'rules' && <RulesScreen onSaved={bumpData} />}
```

`src/renderer/src/screens/RulesScreen.tsx`: add the prop and call it after a successful save:

```tsx
interface RulesScreenProps {
  /** Called after rules are saved (points were recomputed) so other screens reload. */
  onSaved?: () => void
}

export function RulesScreen({ onSaved }: RulesScreenProps = {}): React.JSX.Element {
```

and in `save()` change `adopt(await api.rules.update(draft))` to

```ts
      adopt(await api.rules.update(draft))
      onSaved?.()
```

`SetupScreen` needs no change: it already lists every progress entry by `source`, so the nflverse steps appear during the first import.

- [ ] **Step 7: Verify, human check, commit**

```bash
npm run typecheck && npm run lint && npm test
npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu
```

(The extra flags are what keeps Electron alive under this WSL; they are irrelevant for the Windows build.) Human check in the dev window, with the dev DB that already has the league imported:

1. Click **Refresh** in the status bar. The progress steps run for ~10–40 s (two seasons of stats). Afterwards the status bar shows `Stats: just now`.
2. League screen: every rostered player with a resolution shows `Pts` and `Wk N` (N = latest scored week); players on bye that week show `—` in the week column; the Bye column shows a week for every NFL team; unresolved players show "stats unavailable".
3. Rules screen: change `rec` from 1 to 0.5, Save, go back to League: PPR-dependent totals dropped. Set it back and Save.
4. Nothing regressed on Setup / Rules.

If the dev DB has no league, run Setup first (username `puffinn`, league `Emoney Offline Chat`).

```bash
git add src/renderer/src/lib/format.ts src/renderer/src/screens/LeagueScreen.tsx src/renderer/src/components/StatusBar.tsx src/renderer/src/App.tsx src/renderer/src/screens/RulesScreen.tsx tests/renderer/lib/format.test.ts
git commit -m "feat(ui): show points on league screen and stats status

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Players screen with the weekly-stats side panel

**Files:**
- Create: `src/renderer/src/lib/playersView.ts`
- Create: `src/renderer/src/screens/PlayersScreen.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx` (enable Players)
- Modify: `src/renderer/src/App.tsx` (route)
- Test: `tests/renderer/lib/playersView.test.ts`

**Interfaces:**
- Consumes: `api.players.search`, `api.players.weeklyStats`, `api.league.pointsContext`, `api.league.teams` (Task 8); `NFL_TEAMS` (`@shared/teams`); `fmtPoints`, `fmtPct` (Task 9); `PositionBadge`, shadcn `Input`, `Card`, `Table`.
- Produces: pure `weekColumns(position: string | null): WeekColumn[]` (`WeekColumn { key: string; label: string; format?: 'pct' }`), `formatStat(value: number | undefined, format?: 'pct'): string`, `parseOwner(value: string): OwnerFilter`; `PlayersScreen` component (no props).

- [ ] **Step 1: Write the failing view-model tests**

`tests/renderer/lib/playersView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatStat, parseOwner, weekColumns } from '@/lib/playersView'

describe('weekColumns', () => {
  it('picks position-specific nflverse columns', () => {
    expect(weekColumns('QB').map((c) => c.key)).toEqual([
      'completions', 'attempts', 'passing_yards', 'passing_tds', 'passing_interceptions', 'carries', 'rushing_yards', 'rushing_tds'
    ])
    expect(weekColumns('RB').map((c) => c.key)).toContain('targets')
    expect(weekColumns('TE')).toEqual(weekColumns('WR'))
    expect(weekColumns('WR').find((c) => c.key === 'target_share')?.format).toBe('pct')
    expect(weekColumns('K').map((c) => c.key)).toEqual(['fg_made', 'fg_att', 'fg_long', 'pat_made', 'pat_att'])
    expect(weekColumns('DEF').map((c) => c.key)).toContain('def_sacks')
    expect(weekColumns('LB').map((c) => c.key)).toContain('def_tackles_solo')
    expect(weekColumns(null)).toEqual(weekColumns('LB'))
  })
})

describe('formatStat', () => {
  it('formats missing, integer, fractional and percentage values', () => {
    expect(formatStat(undefined)).toBe('—')
    expect(formatStat(60)).toBe('60')
    expect(formatStat(2.5)).toBe('2.5')
    expect(formatStat(0.234, 'pct')).toBe('23%')
  })
})

describe('parseOwner', () => {
  it('maps the select value to an OwnerFilter', () => {
    expect(parseOwner('all')).toBe('all')
    expect(parseOwner('fa')).toBe('fa')
    expect(parseOwner('3')).toBe(3)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/lib/playersView.test.ts`
Expected: FAIL — cannot resolve `@/lib/playersView`.

- [ ] **Step 3: Implement the view-model**

`src/renderer/src/lib/playersView.ts`:

```ts
import type { OwnerFilter } from '@shared/types'

export interface WeekColumn {
  /** nflverse column name inside `WeekStats.stats`. */
  key: string
  label: string
  format?: 'pct'
}

const c = (key: string, label: string, format?: 'pct'): WeekColumn => ({ key, label, format })

const QB: WeekColumn[] = [
  c('completions', 'Cmp'),
  c('attempts', 'Att'),
  c('passing_yards', 'Pass Yd'),
  c('passing_tds', 'Pass TD'),
  c('passing_interceptions', 'Int'),
  c('carries', 'Car'),
  c('rushing_yards', 'Rush Yd'),
  c('rushing_tds', 'Rush TD')
]
const RB: WeekColumn[] = [
  c('carries', 'Car'),
  c('rushing_yards', 'Rush Yd'),
  c('rushing_tds', 'Rush TD'),
  c('targets', 'Tgt'),
  c('receptions', 'Rec'),
  c('receiving_yards', 'Rec Yd'),
  c('receiving_tds', 'Rec TD')
]
const WR: WeekColumn[] = [
  c('targets', 'Tgt'),
  c('receptions', 'Rec'),
  c('receiving_yards', 'Rec Yd'),
  c('receiving_tds', 'Rec TD'),
  c('target_share', 'Tgt %', 'pct'),
  c('receiving_air_yards', 'Air Yd'),
  c('carries', 'Car'),
  c('rushing_yards', 'Rush Yd')
]
const K: WeekColumn[] = [
  c('fg_made', 'FGM'),
  c('fg_att', 'FGA'),
  c('fg_long', 'Long'),
  c('pat_made', 'XPM'),
  c('pat_att', 'XPA')
]
const DEF: WeekColumn[] = [
  c('def_sacks', 'Sacks'),
  c('def_interceptions', 'Int'),
  c('def_fumbles_forced', 'FF'),
  c('fumble_recovery_opp', 'FR'),
  c('def_tds', 'TD'),
  c('def_safeties', 'Saf')
]
const IDP: WeekColumn[] = [
  c('def_tackles_solo', 'Solo'),
  c('def_tackle_assists', 'Ast'),
  c('def_sacks', 'Sacks'),
  c('def_interceptions', 'Int'),
  c('def_pass_defended', 'PD'),
  c('def_fumbles_forced', 'FF')
]

const BY_POSITION: Record<string, WeekColumn[]> = { QB, RB, WR, TE: WR, K, DEF }

/** Raw-stat columns for the side panel; IDP set for DL/LB/DB and unknown positions. */
export function weekColumns(position: string | null): WeekColumn[] {
  return BY_POSITION[position ?? ''] ?? IDP
}

export function formatStat(value: number | undefined, format?: 'pct'): string {
  if (value === undefined) return '—'
  if (format === 'pct') return `${Math.round(value * 100)}%`
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/** The owner `<select>` value: 'all' | 'fa' | a roster id as a string. */
export function parseOwner(value: string): OwnerFilter {
  return value === 'all' || value === 'fa' ? value : Number(value)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/lib/playersView.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Build the screen**

`src/renderer/src/screens/PlayersScreen.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { PositionBadge } from '@/components/PositionBadge'
import { api } from '@/lib/api'
import { errorMessage, fmtPct, fmtPoints } from '@/lib/format'
import { formatStat, parseOwner, weekColumns } from '@/lib/playersView'
import { cn } from '@/lib/utils'
import { NFL_TEAMS } from '@shared/teams'
import type { PlayerFilter, PlayerRow, PointsContext, Team, WeekStats } from '@shared/types'

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'
const POSITION_OPTIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

export function PlayersScreen(): React.JSX.Element {
  const [ctx, setCtx] = useState<PointsContext | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [query, setQuery] = useState('')
  const [position, setPosition] = useState('')
  const [team, setTeam] = useState('')
  const [owner, setOwner] = useState('all')
  const [rows, setRows] = useState<PlayerRow[]>([])
  const [selected, setSelected] = useState<PlayerRow | null>(null)
  const [weeks, setWeeks] = useState<WeekStats[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api.league
      .pointsContext()
      .then(setCtx)
      .catch((err) => setError(errorMessage(err)))
    void api.league
      .teams()
      .then(setTeams)
      .catch((err) => setError(errorMessage(err)))
  }, [])

  useEffect(() => {
    const filter: PlayerFilter = {
      query: query.trim() || undefined,
      position: position || undefined,
      team: team || undefined,
      owner: parseOwner(owner)
    }
    const handle = setTimeout(() => {
      void api.players
        .search(filter)
        .then((list) => {
          setError(null)
          setRows(list)
        })
        .catch((err) => setError(errorMessage(err)))
    }, 150)
    return () => clearTimeout(handle)
  }, [query, position, team, owner])

  useEffect(() => {
    if (!selected) {
      setWeeks([])
      return
    }
    void api.players
      .weeklyStats(selected.playerId)
      .then(setWeeks)
      .catch((err) => setError(errorMessage(err)))
  }, [selected])

  const lastLabel = ctx?.lastWeek ? `Wk ${ctx.lastWeek}` : 'Last'
  const columns = weekColumns(selected?.position ?? null)

  return (
    <div className="space-y-6">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div>
        <h1 className="text-2xl font-semibold">Players</h1>
        <p className="text-sm text-muted-foreground">
          {ctx ? `${ctx.season} season · points under this league's rules` : ''}
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Search name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 w-56"
            />
            <select className={selectClass} value={position} onChange={(e) => setPosition(e.target.value)}>
              <option value="">All positions</option>
              {POSITION_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select className={selectClass} value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">All NFL teams</option>
              {NFL_TEAMS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select className={selectClass} value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="all">Any owner</option>
              <option value="fa">Free agents</option>
              {teams.map((t) => (
                <option key={t.rosterId} value={String(t.rosterId)}>
                  {t.teamName ?? t.displayName}
                </option>
              ))}
            </select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Pos</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="w-14">Team</TableHead>
                <TableHead className="w-12 text-right">Bye</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead className="w-16 text-right">Pts</TableHead>
                <TableHead className="w-16 text-right">{lastLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow
                  key={p.playerId}
                  onClick={() => setSelected(p)}
                  className={cn('cursor-pointer', selected?.playerId === p.playerId && 'bg-accent/60')}
                >
                  <TableCell>
                    <PositionBadge position={p.position} />
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.fullName}
                    {p.injuryStatus && (
                      <span className="ml-2 text-xs text-destructive">{p.injuryStatus}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.team ?? 'FA'}</TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {p.byeWeek ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.ownerName ?? <span className="italic">Free agent</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {p.statsAvailable ? fmtPoints(p.seasonPoints) : '—'}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {p.statsAvailable ? fmtPoints(p.lastWeekPoints) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                    No players match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {selected ? (
                <>
                  <PositionBadge position={selected.position} />
                  <span>{selected.fullName}</span>
                  <span className="text-sm font-normal text-muted-foreground">
                    {selected.team ?? 'FA'}
                  </span>
                  {selected.ownerName ? (
                    <Badge variant="secondary">{selected.ownerName}</Badge>
                  ) : (
                    <Badge variant="outline">Free agent</Badge>
                  )}
                </>
              ) : (
                'Select a player'
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selected && !selected.statsAvailable && (
              <p className="text-sm text-muted-foreground">
                Stats unavailable — this player could not be matched to nflverse data.
              </p>
            )}
            {selected && selected.statsAvailable && weeks.length === 0 && (
              <p className="text-sm text-muted-foreground">No games yet this season.</p>
            )}
            {weeks.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Wk</TableHead>
                    <TableHead className="w-14">Opp</TableHead>
                    <TableHead className="w-14 text-right">Pts</TableHead>
                    {selected?.position !== 'DEF' && (
                      <TableHead className="w-14 text-right">Snap%</TableHead>
                    )}
                    {columns.map((col) => (
                      <TableHead key={col.key} className="text-right">
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {weeks.map((w) => (
                    <TableRow key={w.week}>
                      <TableCell className="tabular-nums">{w.week}</TableCell>
                      <TableCell className="text-muted-foreground">{w.opponent ?? '—'}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {fmtPoints(w.points)}
                      </TableCell>
                      {selected?.position !== 'DEF' && (
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {fmtPct(w.snaps?.offensePct ?? null)}
                        </TableCell>
                      )}
                      {columns.map((col) => (
                        <TableCell key={col.key} className="text-right tabular-nums">
                          {formatStat(w.stats[col.key], col.format)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Enable the screen in the sidebar and App**

`src/renderer/src/components/Sidebar.tsx`: change the Players item to `enabled: (hasLeague) => hasLeague` and delete the `{!isEnabled && id === 'players' && (…soon…)}` block.

`src/renderer/src/App.tsx`: `import { PlayersScreen } from '@/screens/PlayersScreen'` and add the route after the Rules one:

```tsx
          {screen === 'players' && <PlayersScreen key={dataVersion} />}
```

- [ ] **Step 7: Verify, human check, commit**

```bash
npm run typecheck && npm run lint && npm test
npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu
```

Human check: Players in the sidebar is enabled; the table lists players by season points with owner names and "Free agent"; the name search, position, NFL team and owner filters narrow the list (Free agents shows unrostered players only); clicking a row fills the side panel with weekly rows (QB shows passing columns, RB rushing/receiving, K field goals, DEF sacks/int with no Snap% column); Snap% shows for offense players; a player without an nflverse identity shows the "Stats unavailable" message.

```bash
git add src/renderer/src/lib/playersView.ts src/renderer/src/screens/PlayersScreen.tsx src/renderer/src/components/Sidebar.tsx src/renderer/src/App.tsx tests/renderer/lib/playersView.test.ts
git commit -m "feat(ui): add players screen with weekly stats

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Windows build with real data, tag v0.3.0

**Files:**
- Modify: `package.json` (`"version": "0.3.0"`)
- Modify: this plan (progress notes)

- [ ] **Step 1: Bump the version and commit**

Change `"version": "0.2.0"` to `"version": "0.3.0"` in `package.json` (and `package-lock.json`'s two top-level `version` fields via `npm install --package-lock-only`).

```bash
npm run typecheck && npm run lint && npm test
git add package.json package-lock.json
git commit -m "build: bump version to 0.3.0

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Build the Windows installer**

```bash
npm run build:win
ls -la dist/FantasyCompanion-Setup-0.3.0.exe
cp dist/FantasyCompanion-Setup-0.3.0.exe /mnt/c/Users/habie/OneDrive/Bureau/
```

Expected: the installer exists (~95 MB; wine is already installed for the NSIS step per Plan A/B).

- [ ] **Step 3: Human check on Windows**

Install **over** 0.2.0 (the existing `%APPDATA%\FantasyCompanion\companion.db` must migrate to schema version 3 on launch — no dialog, no data loss: League and Rules screens still show the imported league). Then:

1. Within a minute of launch the status bar shows `Stats: just now` (the background refresh downloaded two seasons; the sync-error indicator stays off). If it shows an error, click it: the message names the failing source.
2. League → your roster: season points and `Wk N` for every starter with an nflverse identity; compare **three players' week-N points with Sleeper's matchup page** — offense should match exactly, K within ±1 (blocked-kick handling), DEF may differ by the unsupported ST keys (`def_st_ff`, `def_st_fum_rec`).
3. Players: filter Free agents + RB; click one; the side panel shows weekly rows with Snap%.
4. Rules: change `rec` to 0.5, Save, League totals drop; re-import from Sleeper restores them.
5. Close and relaunch: everything above still shows (points are stored, not recomputed on launch unless stale).

Record the three comparison values (player, week, app points, Sleeper points) in the progress notes.

- [ ] **Step 4: Tag, progress notes, merge**

Append a `## Progress notes (YYYY-MM-DD)` section to this plan (deviations, human-check results, the comparison values, the build path), commit it as `docs(plan): mark plan C complete`, then:

```bash
git tag -a v0.3.0 -m "Plan C: nflverse stats pipeline, points, players screen"
```

Merge `feat/stats-pipeline-and-players` into `main` with a regular merge (the repo convention keeps atomic commits) and push if a remote exists — use the `superpowers:finishing-a-development-branch` skill.

---

## Self-review notes

- **Spec coverage:** §5 nflverse files and the crosswalk (T1; `.csv.gz` decision 4), "NA" → null and trimmed ids (T1 `numOrNull`/`strOrNull`, `parseCrosswalk` trims gsis); §6 resolution order, `resolution` recorded, DEF team-code exception table, unresolved players kept with a `sync_log` count and "stats unavailable" in the UI (T4 resolver, T7 identity message, T9/T10 UI); §7 `toStatLine` adapters (T5, contract test against the catalogue's `supported` flags), `recomputePoints` after every stats sync and rules change (T6, T7 `app:points`, T8 `rules.update`); §8 tables `player_ids`, `player_week_stats`, `player_week_snaps`, `team_week_stats`, `games`, `player_week_points` (T3; JSON columns per decision 1, plus `crosswalk` per decision 2); §9 first import runs the full pipeline (T7 `importAll`), refresh honours freshness windows with force override (T2/T7), on-launch background refresh (T8 `startRefresh`), one transaction per source (every step wraps its writes in `withTransaction`), no network on the render path (all new IPC handlers read SQLite); §10 League roster with bye / season / last-week points (T9), Players table with position / team / owner-or-FA / season / last-week and a side panel with raw weekly stats + snaps (T10), status bar `Stats` label (T9); §11 `skipped` for unpublished files (T7 `SkipStep`), per-row parse failures counted (T1 `skipped`, surfaced in the step message), retry once on 429/5xx, 30 s timeout (T1); §12 parser fixtures from the real files (T1 capture script), repo idempotency (T3, T4, T6), identity order and flags (T4), sync orchestration with mocked sources — success, per-source failure, freshness skip (T7); milestone 8 Windows build (T11).
- **Placeholder scan:** none — every step has code or an exact command; UI polish is explicitly optional and after the human check.
- **Type consistency:** `ParseResult<T>` (T1) is what `NflverseClient` returns and what the T7 fakes build; `PlayerIdRecord.resolution: Resolution` matches the SQL `CHECK` list (T3/T4); `PointsContext` is defined once in `@shared/types` (T6) and consumed by `points.ts`, `teams.ts`, `playersQuery.ts`, handlers and both screens; `runStep`'s `StepOutcome` (T2) is what T7 returns (`number` or `{ rows, message }`); `listRoster(db, leagueId, rosterId, ctx?)` keeps the three-argument calls in Plan A/B tests compiling (T8); `STATS_SOURCE_PREFIX` (T7) is what `getLastSyncLike` matches (T8); `NflverseSyncDeps` (T7) is what `syncDeps` returns (T8), and it extends `SyncDeps` so the Sleeper functions accept it; `toNflverseTeam` lives in `@shared/teams` (T4) so both `identity.ts` (sync layer) and the repos (db layer) use it without a layering inversion.
