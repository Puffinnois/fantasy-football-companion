# Stats warehouse — design

**Date:** 2026-10-09 · **Status:** draft, awaiting review · **Plans:** T (warehouse + light sources), U (play-by-play worker), V (FTN + participation joins)

**Source:** the stats catalog (`docs/research/2026-10-09-nfl-stats-catalog.md`). Every free source below was checked live on 2026-10-09 (file names, columns, 2026 availability, sizes).

**Goal.** Ingest every NFL stat that a free, keyless source publishes, for **2019 through the current season**, into the local database, synced like the existing sources. This spec is storage only: no scoring, value, signal or UI change. Nothing reads the warehouse yet.

**Constraint.** No paid API, no API keys, no scraping of sites that forbid it.

## 1. What the app has today

| Source                         | Stored                                                                | Used                                                                       |
| ------------------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| nflverse `stats_player_week`   | every numeric column per player-week (`player_week_stats.stats_json`) | scoring (~60 columns), usage signals (target share, air-yards share, WOPR) |
| nflverse `stats_team_week`     | every numeric column per team-week                                    | DST scoring, yards allowed                                                 |
| nflverse `snap_counts`         | offense / defense / ST snaps and %                                    | snap % signal                                                              |
| nflverse `schedules/games.csv` | **10 of its 46 columns**                                              | byes, points allowed, kickoff                                              |
| DynastyProcess crosswalk       | Sleeper ↔ GSIS / PFR / ESPN / Sportradar ids                          | identity                                                                   |

Two seasons (current and prior), regular season only. `recomputePoints` scores every row of the core tables with no season filter.

**Catalog corrections.** The catalog tags Vegas lines, rest, roof, surface, weather, coaches and referee as `app`; `parseGames` drops them. Fourteen Sleeper scoring keys still score 0 (`rec_0_4`…`rec_30_39`, `pass_td_40p/50p`, `pass_int_td`, `def_3_and_out`, `def_4_and_stop`, `def_forced_punts`, …); Sleeper's own weekly stats carry all of them. Fixing scoring is out of scope here (§9).

## 2. Isolation

- The core two-season pipeline (`player_week_stats`, `team_week_stats`, `player_week_snaps`, `games`, `recomputePoints`, values, signals, UI) does not change. Extending the core tables to 8 seasons would make every `recomputePoints` run score about 4× the rows.
- The warehouse has its own tables, its own sync entry point and its own in-flight guard. Its sources duplicate the core's current and prior seasons (a few MB) so a query has one place to look.

## 3. Storage

Migration `010_warehouse.sql`:

```sql
-- One row per source × player × week. data_json: every column the source publishes for that row;
-- numbers as numbers, text as strings, arrays where a source lists several entries; empty / NA dropped.
CREATE TABLE wh_player_week (
  source TEXT NOT NULL,
  season INTEGER NOT NULL,
  season_type TEXT NOT NULL CHECK (season_type IN ('REG', 'POST')),
  week INTEGER NOT NULL,              -- 0 = a season-level row the source publishes itself (NGS, QBR)
  player_key TEXT NOT NULL,           -- the source's own id
  key_type TEXT NOT NULL CHECK (key_type IN ('gsis', 'pfr', 'espn', 'sleeper', 'cfb')),
  team TEXT,
  opponent TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, season, season_type, week, player_key)
);
CREATE INDEX idx_wh_player_week_key ON wh_player_week(player_key, season);

CREATE TABLE wh_team_week (
  source TEXT NOT NULL,
  season INTEGER NOT NULL,
  season_type TEXT NOT NULL CHECK (season_type IN ('REG', 'POST')),
  week INTEGER NOT NULL,
  team TEXT NOT NULL,                 -- nflverse team code
  opponent TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, season, season_type, week, team)
);

-- The full schedules row (all 46 columns).
CREATE TABLE wh_game (
  game_id TEXT PRIMARY KEY,
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_wh_game_season ON wh_game(season, week);

-- Season-independent profiles (combine, latest roster bio).
CREATE TABLE wh_player (
  source TEXT NOT NULL,
  player_key TEXT NOT NULL,
  key_type TEXT NOT NULL CHECK (key_type IN ('gsis', 'pfr', 'espn', 'sleeper', 'cfb')),
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (source, player_key)
);

-- Durable fetch record. sync_log is pruned after 30 days, so it cannot remember that 2019 is done.
-- season = 0 for sources published as one all-seasons file.
CREATE TABLE wh_source_state (
  source TEXT NOT NULL,
  season INTEGER NOT NULL,
  version INTEGER NOT NULL,           -- the adapter / aggregator version that wrote the rows
  rows INTEGER NOT NULL,
  fetched_at TEXT NOT NULL,
  sealed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source, season)
);
```

- **Ids.** Rows keep the source's own id. Joins to Sleeper players go through `player_ids` / `crosswalk` at read time. No identity change.
- **Replace granularity.** A step replaces all rows of its (source, season) in one transaction, as the core does per season. All-seasons files replace only the seasons ≥ 2019 they contain.
- **Season types.** REG and POST are both kept. nflverse POST weeks are stored as numbered in the file (19–22); Sleeper POST weeks as Sleeper numbers them (1–4).
- **Size.** Estimate 200–300 MB for 8 seasons (Sleeper stats ≈ 70 MB, the play-by-play and participation aggregates most of the rest). Each plan's manual check records the real figure.

## 4. Sync

New `src/main/sync/warehouseSync.ts` with `refreshWarehouse(deps, options)`, built on the existing `runStep` / `SkipStep`.

### 4.1 When it runs

- `startRefresh` (IPC) runs `refreshAll` as today. When that settles, it starts `refreshWarehouse` in the background under its own `warehouseInFlight` guard. The Refresh result does not wait for it. `importAll` does the same after an import.
- Steps run one at a time in the order of §5, then §6, oldest season first. Each step commits on its own, so quitting mid-backfill loses at most the step in progress and the next launch resumes.
- The season range is `WAREHOUSE_FIRST_SEASON = 2019` through the Sleeper NFL state season. Without an NFL state the warehouse does nothing, as `refreshNflverse` does.

### 4.2 Freshness and sealing

`wh_source_state` is written on success only. A step runs only if it has **not been attempted in the last 24 h**, whatever the outcome (the last `sync_log` row for the step). Otherwise it runs when one of these holds for any source it writes:

1. no `wh_source_state` row, or its `version` is below the adapter's current version;
2. the season is the current season;
3. the season is the prior season and `fetched_at` is ≥ 7 days old;
4. the season is older and not sealed.

The 24 h attempt rule stops a skip or an error from repeating every refresh. Without it, a missing participation file would re-download play-by-play on every run (§6.1).

A successful fetch of a season ≤ current − 2 sets `sealed = 1`. A sealed season is never fetched again, **even on a forced refresh**, until its version is bumped. All-seasons files (`season = 0`) are never sealed and follow rule 2.

`force` (the Refresh button's forced mode) bypasses the 24 h attempt rule for the current and prior seasons only.

Each source has a first season (2019 unless the table says otherwise). Earlier seasons are never attempted, so FTN for 2019–2021 is not a recurring skip.

### 4.3 Logging and errors

- Steps log to `sync_log` as `wh:<source>:<season>` (`wh:<source>` for all-seasons files).
- `getLastError` (the status bar's last error) ignores `wh:` sources. Warehouse failures stay visible in `sync_log` only, so an optional source cannot make the app look broken.
- HTTP 404 → `SkipStep('<file> not published yet')`, as today.
- Rows missing a key field (id, season, week) are skipped and counted in the step message.
- New or renamed columns land in `data_json`; only a missing key column fails the step, naming the column.
- A failed step rolls back its own transaction; earlier seasons are untouched.
- Downloads reuse the nflverse client's retry and timeout. Timeout is 120 s for play-by-play and participation, 30 s otherwise.
- **`.csv` fallback.** Older nflverse seasons exist only as plain `.csv` (e.g. `injuries_2019.csv`, `advstats_week_rec_2019.csv`, `depth_charts_2019.csv`, every `ftn_charting_*` and `pbp_participation_*`). The fetcher asks for `<name>.csv.gz` and, on 404, for `<name>.csv`. Gzip is detected by magic bytes, as today.

## 5. Light sources (Plan T)

Each source is an adapter in `src/main/sources/warehouse/` that fetches, parses and returns rows; a registry lists them with their target table, key type, season range and version.

| Source         | File / endpoint                                                                 | Id      | Table       | Notes                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------- | ------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sleeper`      | `https://api.sleeper.com/stats/nfl/{season}/{week}?season_type={regular\|post}` | sleeper | player-week | The `stats` object is `data_json`; `team`, `opponent` from the row; the embedded `player` object is not stored. REG weeks 1–17 (2019–2020) or 1–18; POST weeks 1–4. Current season: REG weeks 1 through the state week, POST weeks once the state is in the postseason. One step per season (`wh:sleeper:<season>`) issues all its week requests and writes `sleeper`, `sleeper_def` and `sleeper_team`. |
| `sleeper_def`  | same response, rows whose `player_id` is a team code                            | team    | team-week   | Fantasy DST lines (`def_3_and_out`, `fan_pts_allow_*`, …)                                                                                                                                                                                                                                                                                                                                                |
| `sleeper_team` | same response, rows `TEAM_<code>`                                               | team    | team-week   | Team offense (3rd / 4th down, goal-to-go, red zone, yards per play, …)                                                                                                                                                                                                                                                                                                                                   |

**Team codes.** Every warehouse `team` / `opponent` column and team-week key uses nflverse codes. Sleeper codes go through `toNflverseTeam` (`LAR` → `LA`). QBR uses ESPN codes, mapped `LAR` → `LA` and `WSH` → `WAS`. Historic codes the sources share (`OAK` in 2019) are kept as published.
| `schedules` | nflverse `schedules/games.csv` | game_id | `wh_game` | All 46 columns, seasons ≥ 2019. One all-seasons step. |
| `nflverse_player` | `stats_player/stats_player_week_{yr}` | gsis | player-week | Text dimension columns kept in `data_json` too |
| `nflverse_team` | `stats_team/stats_team_week_{yr}` | team | team-week | |
| `snaps` | `snap_counts/snap_counts_{yr}` | pfr | player-week | |
| `ff_opportunity` | `https://github.com/ffverse/ffopportunity/releases/download/latest-data/ep_weekly_{yr}.csv` | gsis | player-week | Expected fantasy points per category and in total, with the `_team` columns |
| `ngs_pass`, `ngs_rush`, `ngs_rec` | `nextgen_stats/ngs_{passing,rushing,receiving}.csv.gz` | gsis | player-week | One all-seasons file each; week 0 = season row |
| `pfr_pass`, `pfr_rush`, `pfr_rec`, `pfr_def` | `pfr_advstats/advstats_week_{pass,rush,rec,def}_{yr}` | pfr | player-week | |
| `qbr` | `espn_data/qbr_week_level.csv.gz` and `qbr_season_level.csv.gz` | espn | player-week | All-seasons files; the season file is week 0. `season_type` `Regular` / `Playoffs` → REG / POST. |
| `injuries` | `injuries/injuries_{yr}` | gsis | player-week | Report and practice status, primary and secondary injury |
| `depth_charts` | `depth_charts/depth_charts_{yr}` | gsis | player-week | `data_json.entries`: one `{ formation, position, rank }` per slot. ≤ 2024 the file has `week`. From 2025 it holds timestamped snapshots (`dt`); week _w_ takes the last snapshot before that week's first kickoff in `wh_game`, and the current season adds the latest snapshot as the current state week. |
| `rosters` | `weekly_rosters/roster_weekly_{yr}` | gsis | player-week, plus `wh_player` | Player-week: status, team, depth-chart position, `sleeper_id`. `wh_player` (source `rosters`): the latest bio (height, weight, birth date, college, draft club / number, entry year). |
| `combine` | `combine/combine.csv.gz` | pfr, else cfb | `wh_player` | Every year since 2000 (current veterans were drafted before 2019). Rows with neither id are skipped and counted. One all-seasons step. |

nflverse files are under `https://github.com/nflverse/nflverse-data/releases/download/<tag>/`.

**Not stored.** Anything the catalog tags `drv` (passer rating, ANY/A, Pythagorean wins, SRS, …): formulas over stored columns, computed by whatever reads them later.

**Considered and left out.**

- ESPN's site API (FPI, power index): keyless but undocumented and unstable. QBR comes through nflverse.
- Pro-Football-Reference scraping (AV): blocks bots; terms forbid scraping.
- The NGS website (max speed, …): no bulk feed.
- nfelo / rbsdm: Elo and EPA+CPOE are derivable.
- Paid-only metrics (routes run, TPRR / YPRR, PFF grades, ESPN win rates, DVOA): no free source. Participation (§6) gives a route proxy.

## 6. Play-by-play aggregation (Plans U and V)

### 6.1 Mechanics

- One step per season, `wh:pbp:<season>`, producing three sources: `pbp`, `ftn` (first season 2022) and `part` (participation, published for 2016–2025 today). It runs when any of the three is due under §4.2; `wh_source_state` is kept per source. When it runs, it downloads play-by-play plus each due source's file (the joins need play-by-play). A 404 for FTN or participation (participation for 2026 today) is a per-source skip; the 24 h attempt rule retries it daily, and the source is picked up once it is published.
- The main process downloads `pbp/play_by_play_{yr}.csv.gz` (~19 MB for a season), `ftn_charting/ftn_charting_{yr}.csv` (~8 MB) and `pbp_participation/pbp_participation_{yr}.csv` (~21–49 MB). It transfers the bytes to a new worker entry, `src/main/warehouse/worker.ts` (bundled to `out/main/warehouseWorker.js`, like `engineWorker`).
- The worker gunzips, reads rows one at a time and aggregates. It posts back `{ playerWeeks, teamWeeks, skipped }` per source. The main process writes one transaction per source.
- `src/main/sources/csv.ts` gains `forEachCsvRow(text, onRow)`; `parseCsv` is rebuilt on it (one parser, existing tests unchanged).
- FTN and participation have no player ids. During the play-by-play pass the worker builds a compact play index keyed by `game_id` + `play_id` (posteam, defteam, passer / rusher / receiver ids, play kind, EPA, yards, air yards, complete). FTN joins on (`nflverse_game_id`, `nflverse_play_id`); participation on (`nflverse_game_id`, `play_id`). Rows that find no play are counted in the step message.
- Plays with `play_deleted = 1` or `aborted_play = 1` are dropped. Only `season_type` REG and POST are aggregated.
- **Sums and counts only, never rates.** A rate (EPA per dropback, success rate, catch rate) is computed when read; sums add across weeks and seasons. An average is stored as a sum and a count (`*_sum`, `*_n`).
- **Versions.** Each of `pbp`, `ftn`, `part` has an aggregator version. Bumping it re-aggregates every season, sealed or not, once.

### 6.2 `pbp` player-week (key: gsis)

Role is taken from the play's id columns. "Inside the 20 / 10 / 5" uses `yardline_100` at the snap. "Deep" means `air_yards ≥ 20`. "End zone" means `air_yards ≥ yardline_100`. "Success" is the `success` column. "Early down" means downs 1–2.

- **Passer** (`passer_player_id`, plays with `qb_dropback = 1`, including sacks and scrambles): `dropbacks`; `qb_epa_sum`, `success_n`; `air_epa_sum`, `yac_epa_sum`; `cpoe_sum`, `cpoe_n`; deep `att` / `cmp` / `yds` / `td` / `int`; `scrambles`, `scramble_yds`; `kneels`, `spikes`; `long_cmp`; attempts inside the 20 and 10; end-zone attempts; early-down dropbacks and their EPA sum; third-down attempts and conversions; `wpa_sum`.
- **Rusher** (`rusher_player_id`, `rush_attempt = 1`): `carries`, `designed_carries` (not `qb_scramble`); `epa_sum`, `success_n`; `stuffs` (`yards_gained ≤ 0`); runs of 10+ / 15+ / 20+; `long`; carries and TDs inside the 20 / 10 / 5; goal-to-go carries; carries and yards by `run_location` (left / middle / right) and by `run_gap` (end / tackle / guard); first downs; `wpa_sum`.
- **Receiver** (`receiver_player_id`, pass attempts that are not sacks): `targets`; targets inside the 20 / 10 / 5; end-zone and deep targets; `air_yards_sum`; `epa_sum`, `success_n`; `xyac_sum`, `xyac_n` (`xyac_mean_yardage` on completions); `yac_sum`; first downs; `long`; third-down targets; `wpa_sum`.
- **High-value touches:** carries inside the 10 plus targets.
- **Kicker:** kicker EPA sum; kickoffs, touchbacks, onside attempts and recoveries.
- **Punter:** punts, punt EPA sum, inside-20, touchbacks, fair catches, blocked.
- **Returner** (kick and punt separately): returns, yards, long, TDs, fair catches.
- **Defender:** stuffs credited (a solo or assist tackle on a run with `yards_gained ≤ 0`); tackle depth sum and count.
- **Any player** (`penalty_player_id`): penalties, penalty yards, count per `penalty_type` (a map in `data_json`).

### 6.3 `pbp` team-week (key: team)

Every metric twice: `off_*` for the team as `posteam`, `def_*` for the same plays as `defteam`.

- Plays, pass plays, rush plays; EPA sums and success counts for each.
- Early-down plays and EPA sum.
- Explosive plays (runs of 10+, passes of 20+).
- `xpass_sum`, `pass_oe_sum` and their count.
- Neutral plays (`wp` 0.20–0.80, quarters 1–3), neutral passes, and the seconds between consecutive neutral snaps (sum and count) for pace.
- No-huddle and shotgun counts.
- Third- and fourth-down attempts and conversions; fourth downs and the go-for-it count (a pass or run on 4th down, not a punt or field goal).
- Two-point attempts and conversions.
- Drives (`fixed_drive`): count, plays, yards, time of possession (seconds), points, start field position sum, three-and-outs, ending in a score / turnover / punt.
- Red-zone trips (a drive reaching `yardline_100 ≤ 20`) and red-zone TDs; goal-to-go drives and TDs.
- Turnovers, penalties and penalty yards, kickoff touchbacks, special-teams EPA sum.
- `def_*` only: forced punts, fourth-down stops, havoc plays (TFL + forced fumble + interception + pass defended).

### 6.4 `ftn` (2022+, Plan V)

- **Passer:** play-action dropbacks and EPA sum; RPOs; screens; out-of-pocket throws; interception-worthy throws; throwaways; counts per `read_thrown`; dropbacks and EPA sum against the blitz (`n_blitzers > 0`); QB-fault sacks; QB sneaks.
- **Receiver:** catchable targets; contested targets and catches; created receptions; drops; screen targets.
- **Rusher:** box-count sum and count; carries into 8+ defenders in the box; RPO carries.
- **Team** (`off_*` / `def_*`): motion, play-action, RPO, screen, trick-play and no-huddle counts; blitzes, pass-rusher sum, box sum.

### 6.5 `part` (participation, Plan V)

- **Player** (gsis in `offense_players`): offensive plays on the field; **dropbacks on the field** (the free route proxy, so targets and yards per route run can be computed); snaps per `offense_personnel` group (a map); routes on targeted plays (`route`, a map); targets and receiving yards against man vs. zone (`defense_man_zone_type`).
- **Passer:** `time_to_throw` sum and count; pressured dropbacks (`was_pressure`) and their EPA sum.
- **Defender** (gsis in `defense_players`): defensive snaps on the field.
- **Team** (`off_*` / `def_*`): counts per offensive and defensive personnel group and per formation; box sum and count; pass-rusher sum and count; man vs. zone counts; counts per `defense_coverage_type`; pressured plays.

## 7. Testing

No test touches the network.

- **Fixtures.** `tests/fixtures/nflverse/capture.sh` captures small slices of each §5 source and a Sleeper stats response. A hand-built set of about 20 play-by-play rows, with matching FTN and participation rows, has its aggregates worked out by hand in the test file.
- **Migration.** The five tables exist with their keys and checks.
- **Adapters.** Empty and NA dropped, text kept; key types; week-0 rows; QBR season types and team codes; Sleeper team codes; Sleeper rows split into players / `sleeper_def` / `sleeper_team`; depth-chart snapshot → week mapping; combine id fallback; `.csv.gz` → `.csv` fallback.
- **CSV.** `forEachCsvRow`; every existing `parseCsv` test still passes.
- **Aggregation** (pure functions, in-process; the worker file stays as thin as `engine/worker.ts`). Each metric family against the hand-worked numbers; offense / defense mirroring; deleted and aborted plays dropped; join misses counted; sums, not rates.
- **Sync** (fake clients):
  - seasons ≤ current − 2 sealed after one success and not refetched, even forced;
  - a version bump refetches a sealed season;
  - current / prior freshness;
  - no step re-runs within 24 h of its last attempt, whatever the outcome (forced current / prior excepted);
  - seasons before a source's first season are never attempted;
  - 404 → skipped;
  - a `wh:` error is absent from `getLastError`;
  - a partial backfill resumes;
  - the `startRefresh` result does not wait for the warehouse;
  - a second refresh during a warehouse run does not start another one.
- **Manual check, each plan.** Run the app against the live sources; record first-sync time and database size in the plan's Status block.

## 8. Plans

- **T: warehouse and light sources.** Migration, `wh_source_state` and sealing, `refreshWarehouse` and its wiring, the `.csv` fallback, the `getLastError` filter, every §5 adapter.
- **U: play-by-play.** `forEachCsvRow`, the worker entry, the play index, the §6.2–6.3 `pbp` metrics.
- **V: FTN and participation.** The §6.4–6.5 joins and metrics.

Each plan ends with a release, as before.

## 9. Out of scope

- Anything that reads the warehouse: UI, signals, values, research queries.
- Changing scoring to use Sleeper's stats (would make the 14 unsupported keys score). It is a natural next spec once `sleeper` rows exist.
- Identity changes (e.g. using `rosters.sleeper_id` to resolve players).
- Seasons before 2019, play-level storage, paid sources.
