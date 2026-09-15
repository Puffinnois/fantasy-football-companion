# Data sources for the fantasy-football companion (verified 2026-09-15)

Scope: Sleeper league + nflverse stat files, for an Electron/TypeScript/SQLite
desktop app. Everything below was checked against live URLs/APIs on
2026-09-15 (Tuesday after NFL 2026 week 1). "Verified" = HTTP 302/200 with
inspected content; "unverified" = not checked, treat as assumption.

---

## 1. nflverse-data (GitHub releases)

All files: `https://github.com/nflverse/nflverse-data/releases/download/<tag>/<file>`
(302 to `release-assets.githubusercontent.com`; follow redirects, no auth).
Each release also serves `timestamp.json` (`{"last_updated":"YYYY-MM-DD HH:MM:SS EDT"}`)
which is the cheapest freshness probe.

### 1.1 Weekly player stats (offense + defense + kicking in one file) — VERIFIED

Naming changed in 2025. Old release `player_stats` (`player_stats_YYYY.csv`) is
tagged **"DEPRECATED 2025-08-01: USE `stats_player` OR `stats_team` INSTEAD"**.

- Release tag: `stats_player` (built with `nflfastR::calculate_stats()`).
- Pattern: `stats_player_{level}_{YYYY}.{csv|csv.gz|parquet|rds|qs}` where
  `level` in `week | reg | post | regpost`.
- Weekly 2026: `https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2026.csv`
  (verified; parquet verified too). Contains season=2026, week=1, season_type=REG.
- Weekly 2025 for history: `.../stats_player/stats_player_week_2025.csv` (verified).
- Weekly ID/dims: `player_id` (**GSIS id**, e.g. `00-0023459`), `player_name`,
  `player_display_name`, `position`, `position_group`, `headshot_url`, `season`,
  `week`, `season_type`, `game_id` (`2026_01_ATL_PIT`), `team`, `opponent_team`.
  Note: the old `recent_team` column is now `team`; `interceptions` is now
  `passing_interceptions`.
- Requested columns present: `carries`, `rushing_yards`, `rushing_tds`,
  `rushing_epa`, `targets`, `receptions`, `receiving_yards`, `receiving_tds`,
  `receiving_air_yards`, `receiving_yards_after_catch`, `receiving_epa`,
  `target_share`, `air_yards_share`, `wopr` (1.5*target_share + 0.7*air_yards_share),
  `racr`, `pacr`, `fantasy_points` (standard), `fantasy_points_ppr`.
- Explosive-play counts (new): `passing_10/16/20/40`, `rushing_10/12/20/40`,
  `receiving_10/16/20/40` = number of plays gaining >= N yards.
- Also: `passing_*` (incl. `passing_epa`, `passing_cpoe`), `sacks_suffered`,
  fumbles, first downs, 2pt, `def_*` (IDP), `fg_*`/`pat_*` (K), `pt_*` (P),
  `special_teams_tds`, kick/punt returns.
- **No red-zone columns.** Options: (a) Sleeper's unofficial stats endpoint
  has `rush_rz_att` / `rec_rz_tgt` (see 2.4); (b) derive from play-by-play
  (`yardline_100 <= 20`) — pbp is a separate, much larger release (`pbp`).
- Full header (verified): player_id, player_name, player_display_name, position,
  position_group, headshot_url, season, week, season_type, game_id, team,
  opponent_team, completions, attempts, passing_yards, passing_tds,
  passing_interceptions, sacks_suffered, sack_yards_lost, sack_fumbles,
  sack_fumbles_lost, passing_air_yards, passing_yards_after_catch,
  passing_first_downs, passing_epa, passing_cpoe, passing_2pt_conversions, pacr,
  passing_10, passing_16, passing_20, passing_40, carries, rushing_yards,
  rushing_tds, rushing_fumbles, rushing_fumbles_lost, rushing_first_downs,
  rushing_epa, rushing_2pt_conversions, rushing_10, rushing_12, rushing_20,
  rushing_40, receptions, targets, receiving_yards, receiving_tds,
  receiving_fumbles, receiving_fumbles_lost, receiving_air_yards,
  receiving_yards_after_catch, receiving_first_downs, receiving_epa,
  receiving_2pt_conversions, receiving_10, receiving_16, receiving_20,
  receiving_40, racr, target_share, air_yards_share, wopr, special_teams_tds,
  def_tackles_solo, def_tackles_with_assist, def_tackle_assists,
  def_tackles_for_loss, def_tackles_for_loss_yards, def_fumbles_forced,
  def_sacks, def_sack_yards, def_qb_hits, def_interceptions,
  def_interception_yards, def_pass_defended, def_tds, def_fumbles, def_safeties,
  def_punt_blocks, def_pat_blocks, def_fg_blocks, def_2pt_atts, def_2pt_made,
  misc_yards, fumble_recovery_own, fumble_recovery_yards_own,
  fumble_recovery_opp, fumble_recovery_yards_opp, fumble_recovery_tds,
  penalties, penalty_yards, fumbles_forced_by_opp, fumbles_not_forced,
  fumbles_out_of_bounds, fumbles_total, fumbles_lost_total, punt_returns,
  punt_return_yards, kickoff_returns, kickoff_return_yards, fg_made, fg_att,
  fg_missed, fg_blocked, fg_long, fg_pct, fg_made_0_19 ... fg_made_60_,
  fg_missed_0_19 ... fg_missed_60_, fg_made_list, fg_missed_list,
  fg_blocked_list, fg_made_distance, fg_missed_distance, fg_blocked_distance,
  pat_made, pat_att, pat_missed, pat_blocked, pat_pct, gwfg_made, gwfg_att,
  gwfg_missed, gwfg_blocked, gwfg_distance, pt_att, pt_blocked, pt_long,
  pt_yards, pt_inside_20, pt_out_of_bounds, pt_downed, pt_touchback,
  pt_fair_caught, pt_returned, pt_return_yards, pt_return_tds, pt_net_yards,
  fantasy_points, fantasy_points_ppr

### 1.2 Snap counts — VERIFIED (2026 exists, week 1 present)

- `https://github.com/nflverse/nflverse-data/releases/download/snap_counts/snap_counts_2026.csv`
  (also csv.gz/parquet/rds/qs). Pattern `snap_counts_YYYY.*`, 2012+.
- Header: `game_id, pfr_game_id, season, game_type, week, player,
  pfr_player_id, position, team, opponent, offense_snaps, offense_pct,
  defense_snaps, defense_pct, st_snaps, st_pct`
- ID is **`pfr_player_id`** (e.g. `StraCo01`). No GSIS id. Join via
  `players.csv` (`pfr_id` -> `gsis_id`) or `ff_playerids` (`pfr_id`).
- `offense_pct` is a 0-1 fraction (e.g. `1`, `0.08`), not a percentage.
- Cadence: every 6 h (00/06/12/18 UTC) in season.

### 1.3 Next Gen Stats weekly — VERIFIED (combined files only)

- Per-season files (`ngs_YYYY_rushing.csv.gz`) **stopped at 2023**; `ngs_2025_*`
  and `ngs_2026_*` return 404. Current data lives only in all-seasons files:
  - `https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_rushing.csv.gz`
  - `https://github.com/nflverse/nflverse-data/releases/download/nextgen_stats/ngs_receiving.csv.gz`
  - `.../nextgen_stats/ngs_passing.csv.gz`; `.parquet` also exists (verified for receiving).
- Release timestamp 2026-09-15 08:22 EDT (refreshed today; 2026 rows not
  directly inspected because the file is gzipped — assert on first load).
- ID is **`player_gsis_id`**; dims `season`, `season_type` (REG/POST), `week`,
  `player_display_name`, `player_position`, `team_abbr`. Convention: `week = 0`
  rows are season-to-date aggregates (filter `week > 0` for weekly).
- Rushing: `rush_attempts, rush_yards, expected_rush_yards,
  rush_yards_over_expected, rush_yards_over_expected_per_att,
  rush_pct_over_expected, avg_rush_yards, rush_touchdowns, efficiency,
  percent_attempts_gte_eight_defenders, avg_time_to_los`.
- Receiving: `targets, receptions, catch_percentage, yards, rec_touchdowns,
  avg_cushion, avg_separation, avg_intended_air_yards,
  percent_share_of_intended_air_yards, avg_yac, avg_expected_yac,
  avg_yac_above_expectation`.
- Passing: `avg_time_to_throw, avg_completed_air_yards, avg_intended_air_yards,
  aggressiveness, completion_percentage_above_expectation, ...`
- Coverage caveat: NGS only lists qualifying players (min-attempt thresholds),
  so many RB2/WR3 weeks are absent. Cadence: nightly 3-5 am ET.

### 1.4 PFR advanced weekly stats — VERIFIED, but LAGGING

- Pattern `advstats_week_{rush|rec|pass|def}_YYYY.csv` (+ gz/parquet/rds/qs);
  season aggregates `advstats_season_{type}.csv` (all years) and
  `advstats_season_{type}_YYYY.*`. Years 2018+.
- `https://github.com/nflverse/nflverse-data/releases/download/pfr_advstats/advstats_week_rush_2026.csv`
- `https://github.com/nflverse/nflverse-data/releases/download/pfr_advstats/advstats_week_rec_2026.csv`
- rush header: `game_id, pfr_game_id, season, week, game_type, team, opponent,
  pfr_player_name, pfr_player_id, carries, rushing_yards_before_contact,
  rushing_yards_before_contact_avg, rushing_yards_after_contact,
  rushing_yards_after_contact_avg, rushing_broken_tackles,
  receiving_broken_tackles`
- rec header: `game_id, pfr_game_id, season, week, game_type, team, opponent,
  pfr_player_name, pfr_player_id, rushing_broken_tackles,
  receiving_broken_tackles, passing_drops, passing_drop_pct, receiving_drop,
  receiving_drop_pct, receiving_int, receiving_rat`
- ID is **`pfr_player_id`**. No GSIS id.
- **Surprise:** as of 2026-09-15 16:26 UTC the 2026 weekly files contain only 2
  of 16 week-1 games (`2026_01_NE_SEA`, `2026_01_SF_LA`, i.e. the Thu/Fri
  games). Sunday/Monday games are not yet scraped. Treat PFR advstats as
  "arrives days later, may be partial"; never block a weekly refresh on it.
  Cadence per docs: daily 07:00 UTC.

### 1.5 Players master — VERIFIED

- `https://github.com/nflverse/nflverse-data/releases/download/players/players.csv`
  (7.3 MB; also csv.gz 2.5 MB, parquet, rds). Updated 2026-09-15 13:05 UTC.
- ID columns: `gsis_id, esb_id, nfl_id, pfr_id, pff_id, otc_id, espn_id, smart_id`.
  **No `sleeper_id`, no `sportradar_id`, no `yahoo_id`.**
- Other useful: `display_name, first_name, last_name, position, position_group,
  ngs_position, birth_date, height, weight, headshot, college_name,
  jersey_number, rookie_season, last_season, latest_team, status
  (e.g. ACT/DEV/RET), draft_year, draft_round, draft_pick, draft_team,
  years_of_experience`.
- Use it for `pfr_id -> gsis_id` (snap counts, PFR advstats) and for
  position/headshot/draft metadata. Cadence: daily.

### 1.6 ff_playerids crosswalk (ffverse / DynastyProcess) — VERIFIED

- Canonical URL used by `nflreadr::load_ff_playerids()`:
  `https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv`
  (302 -> `https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv`).
- Header: `mfl_id, sportradar_id, fantasypros_id, gsis_id, pff_id, sleeper_id,
  nfl_id, espn_id, yahoo_id, fleaflicker_id, cbs_id, pfr_id, cfbref_id,
  rotowire_id, rotoworld_id, ktc_id, stats_id, stats_global_id,
  fantasy_data_id, swish_id, name, merge_name, position, team, birthdate, age,
  draft_year, draft_round, draft_pick, draft_ovr, twitter_username, height,
  weight, college, db_season`
- Confirmed both **`gsis_id`** and **`sleeper_id`** present. 2026 rookies are
  in (e.g. Fernando Mendoza: gsis `00-0041562`, sleeper `13269`).
- Quirks: missing values are the literal string `NA` (R export) — parse as
  null. `team` uses MFL codes (`LVR`, `LAR`, `KCC`, `GBP`, `NEP`, `NOS`,
  `SFO`, `TBB`...), not nflverse codes; do not join on team. Whether team
  DST rows exist was not verified — do not rely on it for DEF.

### 1.7 Team-level / defense — VERIFIED ready-made weekly team table

- `https://github.com/nflverse/nflverse-data/releases/download/stats_team/stats_team_week_2026.csv`
  (32 rows for week 1; same column set as player stats minus player columns,
  plus `timeouts`). Dims: `season, week, team, season_type, game_id,
  opponent_team`. Rams are `LA` (not `LAR`).
- A team's row = its own offense (`passing_yards`, `carries`...) and its own
  defense (`def_sacks`, `def_interceptions`, `def_tds`, `fumble_recovery_opp`,
  `def_safeties`, `def_punt_blocks`, ...).
- "Yards allowed" = opponent row's offense totals; "points allowed" is NOT in
  the file — take `home_score/away_score` from
  `https://github.com/nflverse/nflverse-data/releases/download/schedules/games.csv`
  (verified) or from Sleeper's DEF stats (`pts_allow`). Sleeper DST scoring
  is easier to reproduce from Sleeper's own stats endpoint (2.4).
- Player-level `def_*` columns exist in `stats_player_week` for IDP leagues.

### 1.8 Update cadence (nflverse docs, in season)

| Dataset | Refresh |
|---|---|
| pbp / stats_player / stats_team | nightly after each game day + extra runs during game days; raw pbp ~15 min after a game |
| snap_counts | 00/06/12/18 UTC |
| nextgen_stats | nightly 03:00-05:00 ET |
| pfr_advstats | daily 07:00 UTC (observed multi-day lag, see 1.4) |
| players / rosters / depth charts | daily 07:00 UTC |
| schedules (games.csv) | every 5 min |

Practical rule: refresh nflverse on Tuesday morning ET for a complete week;
poll `timestamp.json` per release and skip downloads if unchanged.

---

## 2. Sleeper API — VERIFIED (docs.sleeper.com + live calls)

Base: `https://api.sleeper.app/v1`. No auth. Rate guidance: "stay under 1000
API calls per minute, otherwise you risk being IP-blocked."

### 2.1 Endpoints

| Purpose | Endpoint |
|---|---|
| League | `GET /league/<league_id>` |
| League users | `GET /league/<league_id>/users` -> `user_id, username, display_name, avatar, metadata.team_name, is_owner` |
| Rosters | `GET /league/<league_id>/rosters` -> `roster_id, owner_id, league_id, players[], starters[], reserve[], settings{wins,losses,ties,fpts,fpts_decimal,fpts_against,fpts_against_decimal,waiver_position,waiver_budget_used,total_moves}` |
| Matchups | `GET /league/<league_id>/matchups/<week>` -> `roster_id, matchup_id, points, custom_points, players[], starters[]` (live responses also carry `players_points{}`/`starters_points[]`; not in docs example, verify on your league) |
| Transactions | `GET /league/<league_id>/transactions/<round>` (`round` = week) -> `type (trade/free_agent/waiver), transaction_id, status, roster_ids[], adds{pid:roster_id}, drops{}, draft_picks[], waiver_budget[], leg, created, status_updated, creator, consenter_ids[]` |
| Traded picks / brackets / drafts | `/league/<id>/traded_picks`, `/winners_bracket`, `/losers_bracket`, `/drafts`, `/draft/<draft_id>/picks` |
| All players | `GET /players/nfl` (~5 MB JSON object keyed by `player_id`). Docs: "use this call sparingly... once per day at most". Cache to SQLite. Verified extras: `?position=K&active=true` filters server-side (returns only K); `GET /v1/players/nfl/<player_id>` returns a single player (undocumented, verified with 4046). |
| Trending | `GET /players/nfl/trending/<add|drop>?lookback_hours=24&limit=25` -> `[{player_id, count}]` |
| NFL state | `GET /state/nfl` |

Live `/state/nfl` today: `{"week":2,"leg":2,"season":"2026","season_type":"regular",
"league_season":"2026","previous_season":"2025","season_start_date":"2026-09-09",
"display_week":1,"league_create_season":"2026","season_has_scores":true}`.
Note `week` (2) has already rolled while `display_week` (1) has not; use
`display_week` for "last completed week" on Tuesdays.

### 2.2 League object

Fields: `league_id, name, season, season_type, sport, status, total_rosters,
draft_id, previous_league_id, avatar, settings{}, scoring_settings{},
roster_positions[]`.

- `roster_positions` example: `["QB","RB","RB","WR","WR","TE","FLEX","FLEX","DEF","BN",...]`
- `settings` keys: `num_teams, playoff_teams, playoff_week_start, playoff_type,
  start_week, leg, last_scored_leg, trade_deadline, waiver_type,
  waiver_budget, waiver_day_of_week, waiver_clear_days, daily_waivers,
  reserve_slots, taxi_slots, max_keepers, pick_trading, type, ...`
- `scoring_settings` keys (verified sample): `pass_yd (0.04), pass_td, pass_int,
  pass_2pt, rush_yd (0.1), rush_td, rush_2pt, rec (PPR value), rec_yd, rec_td,
  rec_2pt, fum_lost, fum, fum_rec, bonus_rec_yd_100, bonus_rush_yd_100,
  bonus_pass_yd_300, bonus_pass_yd_400, bonus_rec_te (if enabled), xpm,
  xpmiss, fgm_0_19, fgm_20_29, fgm_30_39, fgm_40_49, fgm_50p, fgmiss_*,
  sack, int, ff, fum_rec, safe, blk_kick, def_td, st_td, pts_allow_0,
  pts_allow_1_6, pts_allow_7_13, pts_allow_14_20, pts_allow_21_27,
  pts_allow_28_34, pts_allow_35p, idp_*`. Values are floats with float noise
  (`0.03999999910593033`) — round to 2-3 dp when displaying.

### 2.3 Player object (from `/players/nfl`)

External IDs present: `gsis_id, espn_id, yahoo_id, sportradar_id, rotowire_id,
rotoworld_id, fantasy_data_id, stats_id, swish_id, pandascore_id, opta_id,
oddsjam_id, kalshi_id`. **No `pfr_id`.** Other fields: `player_id, full_name,
first_name, last_name, position, fantasy_positions[], team, status, active,
age, birth_date, years_exp, number, depth_chart_position, depth_chart_order,
injury_status, injury_body_part, injury_notes, practice_participation,
news_updated, search_rank, hashtag, metadata{rookie_year}`.

`gsis_id` population (live sample): established skill players have it
(Mahomes `00-0033873`), but it is **null for many kickers** (e.g. Brandon
Aubrey, DAL K1) and for fringe/FA/rookie players, and some values carry a
**leading space** (`" 00-0035057"`). Team defenses use `player_id` = team
abbreviation (`"DET"`, `"PHI"`) and have no gsis_id.

### 2.4 Undocumented projections / stats endpoints — WORKING TODAY, UNOFFICIAL

Both respond 200 with a JSON array (no `/v1` prefix):

- `https://api.sleeper.app/projections/nfl/2026/1?season_type=regular&position[]=RB&position[]=WR&position[]=QB&position[]=TE`
- `https://api.sleeper.app/stats/nfl/2026/1?season_type=regular&position[]=RB&position[]=WR&position[]=QB&position[]=TE`

Item shape (both): `{ player_id, season:"2026", week:1, season_type, sport,
category:"proj"|"stat", company:"rotowire"|"sportradar", team, opponent,
game_id, date, week_shard, last_modified, updated_at, status,
player:{first_name,last_name,position,fantasy_positions,team,injury_status,
years_exp,metadata,...}, stats:{...} }`.

`stats` keys seen in week-1 stats: `pts_std, pts_ppr, pts_half_ppr,
pos_rank_std/ppr/half_ppr, gp, gs, gms_active, off_snp, st_snp, tm_off_snp,
tm_def_snp, tm_st_snp, rush_att, rush_yd, rush_td, rush_fd, rush_lng,
rush_ypa, rush_yac, rush_rz_att, rush_tkl_loss, rec, rec_tgt, rec_yd, rec_td,
rec_fd, rec_lng, rec_ypr, rec_ypt, rec_air_yd, rec_yar, rec_drop, rec_rz_tgt,
rec_0_4/5_9/10_19/20_29/30_39/40p, rec_td_40p, rec_td_lng, rush_rec_yd,
anytime_tds, first_td, bonus_rec_yd_100, bonus_rush_rec_yd_100, bonus_rec_wr,
bonus_fd_wr, fum, fum_lost, kr*, pr*, penalty*, idp_*`. Projections carry a
subset plus `adp_dd_ppr`, `pos_adp_dd_ppr`.

Value: gives **red-zone usage (`rush_rz_att`, `rec_rz_tgt`), snap counts and
team snap totals keyed directly by Sleeper `player_id`**, plus Sleeper's own
pts under std/ppr/half. Risk: unofficial, may change or be shut off without
notice; keys are sparse (absent = 0). Wrap in a feature flag and keep
nflverse as the system of record.

---

## 3. Player ID mapping recommendation

Join key for stats = nflverse `gsis_id` (= `stats_player_week.player_id` =
`ngs.player_gsis_id`). Sleeper key = `player_id` (string). Build a local
`player_xref(sleeper_id PK, gsis_id, pfr_id, espn_id, sportradar_id, name,
position, team, source, updated_at)` table as follows:

1. **Primary: ff_playerids** (`sleeper_id -> gsis_id, pfr_id, sportradar_id, ...`).
   Single curated file, includes 2026 rookies already, has `pfr_id` for the
   snap-count / PFR joins (Sleeper has no pfr_id). Treat `"NA"` as null.
2. **Secondary: Sleeper's own `gsis_id`** (after `trim()`), used when
   ff_playerids has no row or a null gsis_id. Independent source, so also use
   it to flag disagreements.
3. **Tertiary: `sportradar_id`** — present in both Sleeper and ff_playerids;
   good tie-breaker when gsis is missing on one side.
4. **Fallback:** normalized name (`merge_name` in ff_playerids, lowercased,
   punctuation/suffix stripped) + position, then optionally team.
5. **DEF:** Sleeper `player_id` is a team code; map to nflverse team codes
   (`LAR -> LA`; verify `WAS`, `JAX`, `LV` match — they did in week-1 data).
6. **K:** rely on ff_playerids (Sleeper gsis_id often null for kickers).

Caveats: rookies may be missing from Sleeper `gsis_id` until Sleeper
backfills; players never active (practice squad, FA) often lack gsis in both;
`players.csv` cannot bridge to Sleeper on its own (no sleeper_id), but is the
best `pfr_id <-> gsis_id` source. Store unmatched Sleeper ids in a review
table instead of dropping them.

---

## 4. Recommended ingestion set for a first version

Weekly job (Tue morning ET, plus on-demand), in order:

1. Sleeper `/state/nfl` -> current `season`, `display_week`.
2. Sleeper league bundle: `/league/<id>`, `/users`, `/rosters`,
   `/matchups/<w>` for w in 1..display_week, `/transactions/<w>`.
   Cache `/players/nfl` once per day (position filter not needed; store whole
   object, ~5 MB).
3. nflverse `players/timestamp.json`; if changed, `players.csv.gz`.
4. `dynastyprocess db_playerids.csv` (daily is plenty) -> rebuild `player_xref`.
5. `stats_player/stats_player_week_2026.csv.gz` (full-file replace; small) and
   `stats_player_week_2025.csv.gz` once for baselines.
6. `stats_team/stats_team_week_2026.csv.gz` + `schedules/games.csv` for
   opponent/defense context and points allowed.
7. `snap_counts/snap_counts_2026.csv.gz` (join via `pfr_id`).
8. Optional, feature-flagged: Sleeper `/stats/nfl/<season>/<week>` for
   `rush_rz_att`, `rec_rz_tgt`, `off_snp`; Sleeper `/projections/...` for
   the coming week.
9. Defer: NGS combined files (~large, qualifying players only) and PFR advstats
   (lags days, partial) to v2; if added, load NGS with `week > 0`.

Storage note: keep raw files in a `cache/` dir keyed by release timestamp;
tables `player_week_stats` (PK gsis_id, season, week, season_type),
`team_week_stats`, `snap_counts` (PK pfr_player_id, game_id), `player_xref`,
plus Sleeper `league`, `roster`, `matchup`, `transaction`, `sleeper_player`.

## Sources

- nflverse releases: https://github.com/nflverse/nflverse-data/releases
- nflverse update schedule: https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html
- nflfastR stats variables: https://nflfastr.com/reference/nfl_stats_variables.html
- NGS dictionary: https://nflreadr.nflverse.com/articles/dictionary_nextgen_stats.html
- ff_playerids: https://github.com/dynastyprocess/data/raw/master/files/db_playerids.csv
- Sleeper API docs: https://docs.sleeper.com
