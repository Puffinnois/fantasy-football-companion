# Slice 1 — League Sync + Stats Pipeline

**Date:** 2026-09-15
**Status:** Approved in brainstorming, pending written review
**Research basis:** `docs/research/2026-09-15-data-sources.md` (live-verified 2026-09-15)

## 1. Product context

A Windows desktop companion for a single-user Sleeper fantasy football league
(redraft, one league). The long-term goal is decision support — trade, waiver
and free-agent calls backed by a per-player overview (usage, efficiency,
opponent context, projections, expert consensus, regression signals).

The full product decomposes into six slices, built in order:

1. **League sync** — Sleeper import: rules, teams, rosters, free agents
2. **Stats pipeline** — nflverse weekly data into a local DB
3. Player overview dashboard (the "is James Cook's week 1 a fluke?" screen)
4. Computed value & signals across all players
5. Expert layer — consensus rankings, analyst commentary
6. Decision tools — trade evaluator, waiver/FA recommendations

**This spec covers slices 1 and 2 together**: the plumbing everything else
reads from, plus a minimal UI that proves it works end to end.

## 2. Goals and non-goals

### Goals
- One-click import of a Sleeper league: league, teams, rosters, rules, player DB.
- Weekly NFL stats (2025 + 2026 seasons) stored locally and joined to Sleeper players.
- **Dynamic rules**: scoring, roster slots and league settings are owned by the
  app, pre-filled from Sleeper, editable by the user. Fantasy points are
  computed by the app from raw stats + rules, never trusted from a platform.
- A real, installable Windows `.exe` produced from the WSL2 dev environment.
- App always opens with whatever data it has; sync failures are visible, not fatal.

### Non-goals (this slice)
- Manual editing of teams/rosters (they always come from Sleeper).
- Matchups/schedule view, transaction history, trending adds.
- Projections, expert rankings, NGS/PFR advanced stats, red-zone stats.
- Multi-league UI (schema is keyed by `league_id`, but the UI handles one).
- Auto-update, code signing.

## 3. Tech stack

| Concern | Choice | Why |
|---|---|---|
| Shell | Electron | Windows installer buildable from Linux; one language end to end |
| Language | TypeScript (strict) everywhere | |
| UI | React, Tailwind, shadcn/ui, Recharts | Polished components, charts for later slices |
| Storage | SQLite via `better-sqlite3` | Data is small (≈5k stat rows/season); synchronous API is simple to test |
| Build/dev | `electron-vite`, `electron-builder` (NSIS target) | Hot reload; cross-build Windows from WSL |
| Tests | Vitest | Headless; in-memory SQLite |
| Lint | ESLint + Prettier | |

### Windows deliverable (hard requirement)
`npm run build:win` produces `FantasyCompanion-Setup-<version>.exe`. It runs on
Windows with nothing else installed; data lives in `%APPDATA%\FantasyCompanion`.
Building from WSL2 uses electron-builder's cross-build; the Windows-native
`better-sqlite3` binary is fetched via prebuilds for the target platform. Some
electron-builder versions need `wine` to stamp icon/version resources. Fallbacks,
in order: (a) run `npm run build:win` from Windows PowerShell on the same folder,
(b) GitHub Actions `windows-latest` runner on tags. **Producing and launching
the installer on Windows is an early milestone of the implementation plan,
immediately after the skeleton app exists.**

Dev loop: `npm run dev` runs the Linux build in a WSLg window. Dev and Windows
builds use separate user-data directories.

## 4. Architecture

Two Electron processes with a strict split.

### Main process — the data engine
Owns SQLite, all network access, ingestion and analytics. Exposes a small typed
IPC API. Three internal layers, each ignorant of the others' concerns:

- `sources/` — one module per external source (`sleeper.ts`, `nflverse.ts`).
  Fetch + parse into typed records. No DB knowledge.
- `db/` — schema, migrations, repository functions (`upsertRosters`,
  `upsertWeeklyStats`, …). No network knowledge.
- `sync/` — orchestration: call a source, write via a repository, record a
  `sync_log` row. Triggered by Setup and by the Refresh button.
- `scoring/` — pure functions: rules model + points calculator. No I/O.
- `ipc/` — handlers mapping IPC channels to the above.

Core modules (`sources`, `db`, `scoring`, `sync`) have no Electron imports so
they run under Vitest without an app.

### Renderer — the UI
React app, purely presentational. Calls the IPC API through a typed client
generated from `shared/` types; never touches SQLite or the network.
`contextIsolation: true`, `nodeIntegration: false`, preload exposes only the
whitelisted API.

### IPC API (slice 1)

```
setup.findLeagues(username)            -> LeagueSummary[]
league.import(leagueId)                -> SyncResult      # full first import
league.get()                           -> League | null
league.teams()                         -> Team[]          # includes record, pts
league.roster(rosterId)                -> RosterPlayer[]  # slot, player, points
rules.get()                            -> Rules
rules.update(rules)                    -> Rules           # marks source=custom, recomputes points
rules.reimportFromSleeper()            -> Rules
players.search(filter)                 -> PlayerRow[]     # pos/team/owner/FA, season pts, last-week pts
players.weeklyStats(playerId, season)  -> WeekStats[]
sync.refresh()                         -> SyncResult      # sleeper + nflverse
sync.status()                          -> SyncStatus      # last runs, nfl week, errors
```

## 5. Data sources

### Sleeper — `https://api.sleeper.app/v1`, JSON, no auth
| Endpoint | Used for |
|---|---|
| `user/{username}` → `user/{id}/leagues/nfl/{season}` | Setup: list your leagues |
| `league/{id}` | `settings`, `scoring_settings`, `roster_positions`, name, season |
| `league/{id}/users`, `league/{id}/rosters` | Teams (owner, name, avatar, record) and rosters (`players`, `starters`, `reserve`, `taxi`) |
| `players/nfl` | ≈5 MB player DB. Cached; re-fetched at most once per 24 h |
| `state/nfl` | Current `season`, `week`, `display_week`, `season_type` |

Rate guidance: stay under 1000 calls/min (we make ~5 per sync).

### nflverse — CSV over HTTPS, refreshed after each game day
| File | Key | Used for |
|---|---|---|
| `nflverse-data/releases/download/stats_player/stats_player_week_{season}.csv` | `player_id` (GSIS) | Offense, kicking and IDP weekly stats: carries, targets, `target_share`, `air_yards_share`, `wopr`, `racr`, `rushing_epa`, `receiving_epa`, explosive-play counts, `fg_made_*`, `pat_*`, `def_*` |
| `…/stats_team/stats_team_week_{season}.csv` | `team` | Team offense + defense weekly (opponent context, team-DEF scoring) |
| `…/snap_counts/snap_counts_{season}.csv` | `pfr_player_id` | `offense_snaps`, `offense_pct` (0–1 fraction) |
| `…/schedules/games.csv` | `game_id` | Scores → points allowed for DEF scoring; bye weeks |
| `raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv` | — | ID crosswalk: `sleeper_id`, `gsis_id`, `pfr_id`, `sportradar_id`, `espn_id`; nulls are literal `"NA"` |

Seasons ingested: current (`state/nfl.season`) and previous. The nflverse
weekly-stats file replaced the deprecated `player_stats/player_stats_{season}`
in 2025; the Rams are `LA` in nflverse and `LAR` in Sleeper.

Deferred to slice 3: NGS (all-seasons `ngs_rushing.csv.gz` / `ngs_receiving.csv.gz`
only — per-season files stopped in 2023), PFR advanced stats (lag several days),
Sleeper's unofficial stats/projections endpoints (the only cheap red-zone source).

## 6. Player identity resolution

Rosters use Sleeper ids; weekly stats use GSIS; snap counts use PFR. The
canonical key is the **Sleeper `player_id`**. A `player_ids` table maps it to
the others, resolved in this order, first hit wins, `resolution` recorded:

1. `db_playerids` crosswalk row with matching `sleeper_id`
2. Sleeper's own `gsis_id` (trimmed — it sometimes carries a leading space)
3. Crosswalk row with matching `sportradar_id`
4. Exact match on normalized `full_name` + `position` (last resort, flagged)

Team defenses: Sleeper DEF `player_id` is the team code (`LAR`); it is stored in
`player_ids.nflverse_team` after an exception table (`LAR→LA`, and any
others the crosswalk reveals). Unresolved players are kept in `players`, get a
`sync_log` warning with a count, and display "stats unavailable" in the UI.
They are never dropped.

## 7. Rules model and scoring engine

### Rules model (`shared/rules.ts`)
```ts
interface Rules {
  source: 'sleeper' | 'custom';
  updatedAt: string;
  scoring: Record<StatKey, number>;          // e.g. { rec: 1, rec_yd: 0.1, rush_td: 6, fum_lost: -2, bonus_rush_yd_100: 3 }
  positionOverrides?: Partial<Record<Position, Partial<Record<StatKey, number>>>>; // e.g. TE premium
  rosterSlots: { slot: Slot; count: number }[];  // QB, RB, WR, TE, FLEX, SUPER_FLEX, K, DEF, BN, IR, TAXI …
  settings: {
    numTeams: number;
    waiverType: 'faab' | 'priority';
    faabBudget?: number;
    tradeDeadlineWeek?: number;
    playoffStartWeek?: number;
    playoffTeams?: number;
  };
}
```
`StatKey` uses Sleeper's scoring vocabulary (`pass_yd`, `pass_td`, `rush_yd`,
`rec`, `rec_yd`, `fum_lost`, `bonus_rec_te`, `fgm_40_49`, `def_sack`,
`pts_allow_0`, …) so Sleeper import is a near-identity mapping and custom rules
use a vocabulary users already know.

### Import mapping
`scoring_settings` → `scoring` key-for-key (unknown keys kept, so nothing is
lost); `roster_positions` (array with repeats) → `rosterSlots` counts;
`settings.{num_teams, waiver_type, waiver_budget, trade_deadline,
playoff_week_start, playoff_teams}` → `settings`.

### Scoring engine (`main/scoring/`)
- `toStatLine(row: PlayerWeekStats | TeamWeekStats + points allowed): Partial<Record<StatKey, number>>`
  — one adapter per nflverse table mapping columns to `StatKey`s
  (`rushing_yards→rush_yd`, `fg_made_40_49→fgm_40_49`, team `def_sacks→def_sack`, …).
- `scoreStatLine(line, rules, position): number` — sum of `stat × points`,
  position overrides applied, bonus thresholds evaluated (e.g.
  `bonus_rush_yd_100` fires when `rush_yd >= 100`).
- `recomputePoints(leagueId)` — rebuilds `player_week_points` for all
  player-weeks. Runs after every stats sync and every rules change (<1 s at
  this data size).

Honest limit: K and DEF scoring cover what nflverse publishes. Sleeper stat
keys with no nflverse column (rare special-teams or IDP categories) score 0 and
are listed as "unsupported" on the Rules screen.

## 8. Data model (SQLite)

All tables have `updated_at`. Composite keys as listed.

| Table | Key | Notable columns |
|---|---|---|
| `nfl_state` | singleton | `season`, `week`, `display_week`, `season_type`, `fetched_at` |
| `leagues` | `league_id` | `name`, `season`, `status`, `sleeper_raw` (JSON), `synced_at` |
| `teams` | `league_id, roster_id` | `owner_id`, `display_name`, `team_name`, `avatar`, `wins`, `losses`, `ties`, `fpts`, `fpts_against`, `is_me` |
| `roster_players` | `league_id, roster_id, player_id` | `slot` (`starter` / `bench` / `ir` / `taxi`), `starter_index` |
| `players` | `player_id` (Sleeper) | `full_name`, `first_name`, `last_name`, `position`, `fantasy_positions`, `team`, `status`, `injury_status`, `age`, `years_exp`, `depth_chart_order`, `bye_week`, `search_rank` |
| `player_ids` | `player_id` | `gsis_id`, `pfr_id`, `sportradar_id`, `espn_id`, `nflverse_team` (DEF only), `resolution` |
| `rules` | `league_id` | `source`, `settings_json`, `updated_at` |
| `scoring_rules` | `league_id, stat_key, position?` | `points` |
| `roster_slots` | `league_id, slot` | `count` |
| `player_week_stats` | `gsis_id, season, week` | `team`, `opponent`, `position`, every numeric column of the nflverse file (list-valued text columns such as `fg_made_list` are dropped) |
| `player_week_snaps` | `pfr_id, season, week` | `team`, `offense_snaps`, `offense_pct` |
| `team_week_stats` | `team, season, week` | `opponent`, offense + `def_*` columns |
| `games` | `game_id` | `season`, `week`, `home_team`, `away_team`, `home_score`, `away_score`, `gameday` |
| `player_week_points` | `league_id, player_id, season, week` | `points` (materialized) |
| `sync_log` | `id` | `source`, `started_at`, `finished_at`, `status` (`ok` / `error` / `skipped`), `message`, `rows_written` |

Schema is versioned; migrations are plain SQL files applied at startup.

## 9. Sync behaviour

- **First import** (Setup): `state/nfl` → league → users + rosters → players
  (if stale) → crosswalk → nflverse weekly/team/snaps/games for both seasons →
  identity resolution → `recomputePoints`. Progress reported per step to the UI.
- **Refresh** (status bar): same pipeline; each source skipped if fetched
  within its freshness window (Sleeper league/rosters: 10 min; players DB: 24 h;
  nflverse: 6 h; crosswalk: 24 h). Force option ignores windows.
- **On launch**: runs Refresh in the background if any source is stale. Never
  blocks the UI.
- Each source writes inside one SQLite transaction; a failure rolls back that
  source only. Sources are independent — one failing never blocks another.
- No network on the render path. All screens read SQLite only.

## 10. UI (slice 1)

Sidebar with four screens; persistent status bar.

1. **Setup** (first launch, or "Change league"): enter Sleeper username → pick a
   league (or paste a league id) → import with per-step progress. Pick which
   roster is "me" (defaults to the roster owned by the entered username).
2. **League**: card grid of teams (owner, record, PF/PA), your team pinned
   first. Click → roster grouped by starter slots / bench / IR, each player with
   position, NFL team, bye, season points and last-week points (computed by the
   app's rules).
3. **Rules**: editable scoring table (stat key, points, per-position override),
   roster slot counts, league settings. Badge `Imported from Sleeper` /
   `Customized`. "Re-import from Sleeper" warns before overwriting custom rules.
   Lists unsupported stat keys.
4. **Players**: searchable/filterable table (position, NFL team, owner or
   *Free Agent*, season points, last-week points). Row click opens a side panel
   with raw weekly stats + snaps for the current season — the placeholder for
   the slice-3 overview.

**Status bar**: last Sleeper sync, last nflverse sync, NFL week, Refresh button,
and a warning indicator that opens the latest `sync_log` errors.

Visual direction: dark theme by default, dense but readable tables, position
colour coding consistent across screens. Detailed styling decided at
implementation with the frontend-design skill.

## 11. Error handling

- Every sync step logs to `sync_log`; the UI surfaces the last error per source.
- Missing upstream file (e.g. new season not yet published) → `skipped` with a
  clear message, not `error`.
- Parse failures on individual CSV rows are counted and logged; the row is
  skipped, the batch continues.
- Sleeper HTTP errors: 429 → wait and retry once; 5xx → retry once; 4xx → fail
  that source with the body message.
- All fetches have a 30 s timeout.
- DB open failure or migration failure is the only fatal startup error; it
  shows a dialog with the DB path.

## 12. Testing

Headless with Vitest, in-memory SQLite.

1. **Source parsers** — fixtures captured from the real APIs
   (`tests/fixtures/sleeper/*.json`, `tests/fixtures/nflverse/*.csv` trimmed to
   ~50 rows). Assert typed output; assert `"NA"` → null; assert trimmed ids.
2. **Repositories + scoring** — upsert idempotency; identity resolution order
   and flags; scoring engine against hand-computed points for PPR, half-PPR,
   TE-premium, yardage bonuses, K distance buckets, DEF points-allowed tiers.
3. **Sync orchestration** — sources mocked; assert DB + `sync_log` state on
   success, per-source failure, and freshness skip.

UI: manual verification in slice 1.

## 13. Project structure

```
src/
  main/     sources/ db/ scoring/ sync/ ipc/ index.ts
  preload/  index.ts
  renderer/ screens/ components/ lib/ main.tsx
  shared/   types (League, Team, Player, Rules, …), ipc contract
tests/      fixtures/ + mirrors src/main
docs/       research/ superpowers/specs/
electron-builder.yml  electron.vite.config.ts  package.json
```

Git: `main` branch, Conventional Commits, atomic commits.

## 14. Milestones (for the implementation plan)

1. Skeleton app (electron-vite + React + Tailwind + shadcn) opens a window in WSLg.
2. **Windows installer built and launched on Windows** (validates the toolchain).
3. SQLite + migrations + `sync_log`; Sleeper source + league/teams/rosters/players repos; Setup + League screens.
4. Rules model, Sleeper import mapping, Rules screen.
5. nflverse sources + crosswalk + identity resolution + stats/snaps/team/games repos.
6. Scoring engine + `player_week_points`; points appear on League and Players screens.
7. Players screen with stats side panel; status bar; refresh/freshness logic.
8. Second Windows build with real data; polish.
