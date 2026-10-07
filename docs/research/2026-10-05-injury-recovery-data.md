# Return-from-injury valuation: data and modelling feasibility (keyless)

Researched 2026-10-05. Everything marked **verified** was fetched or inspected
today; anything else is marked **unverified** or **estimate**.

## 0. Bottom line

- **Best keyless source:** nflverse `injuries_YYYY` (official weekly injury and
  practice reports, 2009 to 2026, refreshed daily in season) **plus** nflverse
  `roster_weekly_YYYY` (per-week roster status incl. `RES`/`R01` =
  reserve/injured, and a **`sleeper_id` column**). Snaps come from nflverse
  `snap_counts` (PFR ids) or, more simply, Sleeper's own per-player weekly stats
  (`off_snp`, `tm_off_snp`). The app already downloads nflverse files and has a
  gsis to sleeper crosswalk (`src/main/sync/identity.ts`, DynastyProcess
  `db_playerids.csv`), so joining is solved.
- **Episodes can be reconstructed.** You need the injury report **and** weekly
  rosters **and** snaps together. The injury report alone misses every IR stint,
  because IR players drop off the report. Body-part labels are coarse and drift
  from week to week.
- **Double-counting:** ROS totals are very likely already priced by the
  FantasyPros ROS consensus. FantasyPros grades ROS accuracy on _total_ points
  for the remaining slice, and the app already relies on this (Plan N shelf
  rule). Sleeper weekly projections are **RotoWire** projections. A 3-player
  spot check suggests they barely move for the first game back (-8% to +5%
  versus pre-injury), even when the player then played on a snap count. That
  is only an anecdote; it has to be measured.
- **Recommendation:** first run a one-off offline **projection-residual study**
  (a narrow option b): actual / Sleeper-projected points in games 1-3 after a
  return, by position. That single study answers the double-counting question.
  If game-1 residuals are materially below 1, ship option c: a
  **current-week-only first-game-back discount** in the lineup engine, by
  position (with at most a soft-tissue / other split). Leave ROS totals to the
  consensus. Do not build a body-part x position table as the first step.

---

## 1. Source evaluation

| Source                                                         | Fields relevant here                                                                                                                                                                                                                                                                                                                            | Years                                                                                                                                                                 | Access / URL (verified unless noted)                                                                                                                                                                                                                                                                                                                                                                                                                     | Keyless?                            | License / terms                                                                                            | Verdict                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **nflverse injuries** (`load_injuries`)                        | `season, season_type, game_type, team, week, gsis_id, position, full_name, first_name, last_name, report_primary_injury, report_secondary_injury, report_status (Out/Doubtful/Questionable/blank; 2024 also "Note"), practice_primary_injury, practice_secondary_injury, practice_status (DNP/Limited/Full)`; `date_modified` only through 2024 | 2009 to 2026 (`injuries_2009` ... `injuries_2026`)                                                                                                                    | `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_{YYYY}.{csv,csv.gz,parquet,rds,qs}`. Sizes: csv about 0.55-0.82 MB per season, csv.gz about 0.13-0.16 MB, parquet about 0.1 MB. `injuries_2026.*` + `timestamp.json` were updated 2026-10-05 15:53 UTC, so it is refreshed in season (daily cadence observed, exact schedule unverified). Rows: 2024 = 6,215; 2025 = 6,068 (weeks 1-18 present); 2026 = weeks 1-4 so far. | Yes                                 | Repo CC-BY-4.0 (attribution). Upstream is NFL data via an `nflapi` passthrough; upstream terms unverified. | **Primary source.** Official, keyed on `gsis_id`, includes practice status. Caveats below (no IR weeks, coarse labels, schema change in 2025).                                                                                                                                                                                                                                                    |
| **nflverse weekly rosters** (`load_rosters_weekly`)            | `season, week, game_type, team, position, status (ACT/RES/PUP/INA/DEV/CUT/...), status_description_abbr (R01 = R/Injured, R02 = R/Retired, R04 = R/PUP, R05 = R/NFIN, P-codes = practice squad ...), gsis_id, sleeper_id, espn_id, pfr_id, sportradar_id, birth_date, years_exp, depth_chart_position`                                          | 2002 to 2026                                                                                                                                                          | `https://github.com/nflverse/nflverse-data/releases/download/weekly_rosters/roster_weekly_{YYYY}.csv[.gz]`. 2025 csv is 15.4 MB, csv.gz 0.7 MB. 2026 updated 2026-10-05.                                                                                                                                                                                                                                                                                 | Yes                                 | CC-BY-4.0                                                                                                  | **Essential complement.** It is the only keyless per-week record of IR stints. It carries `sleeper_id` directly (verified, e.g. Nico Collins gsis `00-0036554` = sleeper `7569`).                                                                                                                                                                                                                 |
| **nflverse snap counts**                                       | `game_id, season, game_type, week, player, pfr_player_id, position, team, opponent, offense_snaps, offense_pct (0-1), defense_*, st_*`                                                                                                                                                                                                          | 2012 file is effectively empty (154 bytes); real data 2013-2026                                                                                                       | `.../releases/download/snap_counts/snap_counts_{YYYY}.csv[.gz]`, refreshed every 6 h in season (the app's own data-sources doc). 2025 file updated 2026-10-05.                                                                                                                                                                                                                                                                                           | Yes                                 | CC-BY-4.0 in the repo, but the data is scraped from PFR (PFR restricts redistribution; see below)          | Good for **offline** history. It is keyed on PFR id; map via `players.csv` or `db_playerids`. The app already ingests it.                                                                                                                                                                                                                                                                         |
| **nflverse weekly player stats**                               | Box score + `fantasy_points_ppr`, targets, carries, shares; `player_id` = gsis                                                                                                                                                                                                                                                                  | 1999+ per nflreadr docs (2026 verified by the app's doc)                                                                                                              | `.../releases/download/stats_player/stats_player_week_{YYYY}.csv[.gz]`                                                                                                                                                                                                                                                                                                                                                                                   | Yes                                 | CC-BY-4.0                                                                                                  | Use for post-return production and baselines. Already ingested by the app.                                                                                                                                                                                                                                                                                                                        |
| **DynastyProcess `db_playerids`** (= `load_ff_playerids`)      | `gsis_id, sleeper_id, fantasypros_id, pfr_id, espn_id, sportradar_id, ...`                                                                                                                                                                                                                                                                      | Current player universe (historical retired players partially covered, unverified)                                                                                    | `https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv`. Weekly GitHub Actions commits (last 2026-10-02).                                                                                                                                                                                                                                                                                                                  | Yes                                 | Repo GPL-3.0 (applicability to data unclear)                                                               | **Yes, it maps gsis_id to sleeper_id.** Already used by the app. For historical seasons, prefer `roster_weekly.sleeper_id` (per season).                                                                                                                                                                                                                                                          |
| **Sleeper unofficial stats / projections** (`api.sleeper.com`) | Per-player weekly stats include `off_snp`, `tm_off_snp`, `pts_ppr`, `rec_tgt`. Projections include `pts_ppr`, `rec_tgt`, `company`.                                                                                                                                                                                                             | Projections exist at least for 2019, 2024 and 2026 (verified); earlier seasons unverified                                                                             | `https://api.sleeper.com/stats/nfl/player/{sleeper_id}?season_type=regular&season=YYYY&grouping=week`; `https://api.sleeper.com/projections/nfl/player/{id}?...&grouping=week`; bulk `https://api.sleeper.com/projections/nfl/{season}/{week}?season_type=regular&position[]=WR`                                                                                                                                                                         | Yes                                 | Undocumented endpoints; no published terms for them (unverified)                                           | **Projections are RotoWire's** (`company: "rotowire"` in 2019, 2024 and 2026). Historical projections enable the double-counting test. Caveats: `last_modified` on 2024 week-10 projections is 2024-11-12 (after the games), so whether they are pre-kickoff snapshots is **unverified**. The embedded `player` object shows **current** injury status, not historical. Do not use it as history. |
| **ESPN core API**                                              | `status, date, details.type (body part), details.location, details.detail (e.g. "Surgery", "Not Specified"), details.side, details.returnDate, shortComment, longComment`                                                                                                                                                                       | **Current injury only.** Example: an athlete with an August high-ankle sprain plus a current ankle issue returns `count: 1`. Per-season team listing for 2024 is 404. | `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/{teamId}/injuries` then follow `$ref`s. `site.api.espn.com/.../nfl/injuries` returned 403 to the fetcher.                                                                                                                                                                                                                                                                         | Yes                                 | Undocumented API; terms unverified                                                                         | Richer _live_ detail (Surgery/Sprain, return date) than Sleeper, but **no history**. Usable only as a live enrichment snapshot that the app archives itself. Not suitable for building a table.                                                                                                                                                                                                   |
| **NFL.com transactions**                                       | From, To, Date, Name, Position, Transaction ("Reserve/Injured")                                                                                                                                                                                                                                                                                 | Multi-year pages (2024 verified)                                                                                                                                      | `https://www.nfl.com/transactions/league/reserve-list/{YYYY}/{month}` (HTML)                                                                                                                                                                                                                                                                                                                                                                             | Yes (scrape)                        | NFL.com terms unverified                                                                                   | IR dates only, **no injury type**. Redundant with `roster_weekly` RES status. Not needed.                                                                                                                                                                                                                                                                                                         |
| **Pro-Football-Reference**                                     | Snap counts, game logs; injury info is limited                                                                                                                                                                                                                                                                                                  | Long history                                                                                                                                                          | HTML only. Rate limit 20 req/min, bot "jail" up to a day. Data licensed from third parties, no downloads.                                                                                                                                                                                                                                                                                                                                                | Keyless but scraping is discouraged | Restrictive                                                                                                | **Reject.** nflverse already redistributes the PFR snaps.                                                                                                                                                                                                                                                                                                                                         |
| **Spotrac IR tracker**                                         | IR placements, cash                                                                                                                                                                                                                                                                                                                             | n/a                                                                                                                                                                   | `https://www.spotrac.com/nfl/injured-reserve/...` returned **HTTP 402 Payment Required**                                                                                                                                                                                                                                                                                                                                                                 | **No** (paywall)                    | Paid                                                                                                       | **Reject.**                                                                                                                                                                                                                                                                                                                                                                                       |
| **ProSportsTransactions**                                      | Injury/IR moves with free-text notes ("torn ACL")                                                                                                                                                                                                                                                                                               | Long history (unverified)                                                                                                                                             | Search page returned **403** to automated fetch                                                                                                                                                                                                                                                                                                                                                                                                          | Unclear                             | Unverified                                                                                                 | **Reject for the app.** It might serve a one-off manual lookup of severe-injury detail (unverified).                                                                                                                                                                                                                                                                                              |
| Sleeper `/players/nfl` (existing)                              | `injury_status, injury_body_part, injury_notes` (+ `practice_participation`, `news_updated` keys listed in the app's data-sources doc; population not checked here)                                                                                                                                                                             | Current snapshot                                                                                                                                                      | Existing                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Yes                                 | Existing                                                                                                   | Current state only, as the brief says. The app could **archive daily snapshots** to build its own history going forward.                                                                                                                                                                                                                                                                          |

---

## 2. Can injury episodes be reconstructed?

**Yes, with acceptable but not high reliability**, if you combine three
nflverse feeds per player-season. Injury reports alone are not enough.

### 2.1 Method (offline, per season; join on `gsis_id`)

1. **Panel:** one row per (player, team-game week). Take the team schedule from
   `games.csv` and the player's team/status that week from `roster_weekly`
   (`status`, `status_description_abbr`).
2. **Played?** `offense_snaps > 0` (snap counts) or `off_snp > 0` (Sleeper
   stats). Snap share = player snaps / team offensive snaps.
3. **Injury-missed game:** the team played, the player did not, **and** there is
   an injury signal: report_status `Out`/`Doubtful` that week, **or** roster
   status `RES` with `R01` (IR) / PUP, **or** an injury-report row with a
   body-part label in the adjacent week. Exclude "Not injury related - resting
   player", Illness, Personal, `SUS`, and week 18 rest.
4. **Episode:** a maximal run of injury-missed games, allowing bye weeks inside
   the run. **Injury game** = the last game played before the run. Flag it if
   snap share fell below about 60% of the player's baseline (in-game injury,
   e.g. Collins 2024 week 5: 9/68 snaps). Exclude that game from the baseline.
5. **Body part:** `report_primary_injury` of the first `Out`/`Doubtful` row of
   the episode. If the player went straight to IR, use the last pre-IR row or
   the **return-window row**. Players "designated to return" reappear on
   practice reports, verified: Burrow 2025 reappears week 11 "Toe"; Evans 2025
   reappears week 14 "Collarbone". Otherwise use `unknown`. Keep
   `report_secondary_injury`.
6. **Return week:** the first later game with snaps > 0. Games missed = length
   of the run.
7. **Outcomes:** snap share, opportunity share (targets/carries) and PPR in
   return games 1, 2 and 3, compared with:
   - a baseline of up to 6 healthy games before the injury game (same season;
     use the prior season if fewer than 3), **and/or**
   - the Sleeper/RotoWire projection for that game (this is the
     double-counting test, section 3).

### 2.2 Pitfalls (verified unless marked)

- **IR stints are invisible in injury reports.** IR players are not on the
  weekly report. Verified examples: Burrow 2025 (no rows weeks 3-10), Evans
  2025 collarbone (absent, then reappears week 14), Collins 2024 hamstring (only
  a week-10 Questionable row), Pacheco 2024 (only weeks 11-12), McCaffrey 2024
  (only week 2). Without `roster_weekly` you would under-count long episodes
  and over-weight short ones.
- **Coarse labels.** The report gives a body part only. "Knee" says nothing
  about ACL, MCL or meniscus, and "Ankle" does not distinguish high-ankle from
  low-ankle sprains. There are zero matches for ACL/MCL/Sprain/Strain/Surgery in
  the 2024 file. Severity has to be proxied by games missed, IR yes/no and
  practice trajectory. Sleeper `injury_notes` and ESPN `details.detail` are
  current-only, so they cannot label history.
- **Label drift within an episode.** Patterson 2024: Ankle then Knee. Pierce
  2024: Hamstring then Groin. Pacheco 2024: Ankle then Rib. Mixed secondary
  labels also occur (McCaffrey "Calf, Achilles"). Link episodes by
  consecutive missed games, not by matching body part.
- **`week` means report week.** The dictionary says "Week that injury
  occurred", but rows are the report for that week's game, e.g. Higgins 2024
  week 1 "Doubtful" for a preseason injury. Derive injury timing from snaps.
- **Old or chronic listings.** Players stay on the report with old body parts,
  often at Full practice with a blank game status. Only Out/Doubtful or a
  missed game should open an episode. Questionable rows alone should not.
- **Offseason/preseason injuries.** They show up only if the player is still
  listed in week 1, or as PUP/NFI on rosters. No body part is given until the
  player is activated or designated to return.
- **Schema/source change from 2025.** `season_type` was added, `date_modified`
  was dropped, and the source switched to an `nflapi` passthrough (nflverse-rosters
  issue #100, change merged 2026-08-06, closed "not planned"). Row counts look
  comparable (2024 6,215 vs 2025 6,068), but check per-week counts before
  pooling across the switch.
- **Team changes mid-episode** (Adams 2024: injured with LV, returned with
  NYJ). Role changes then confound "post-return" effects. Flag these or drop
  them.
- **Selection and regression to the mean.** Only returners are observed.
  Severity is unobserved, early returners differ from late ones, and the
  replacement may keep part of the role. Pre-injury windows can be hot streaks.
  Use the player's own _projection_ as the comparator, or matched uninjured
  controls, and shrink estimates.
- **ID mapping.** `injuries` and `stats` use `gsis_id`, `snap_counts` uses PFR
  ids, and `roster_weekly` carries `sleeper_id`. All of these joins are
  verified to exist.

### 2.3 Sample sizes (estimates)

Counted in the 2024 file (regular season, rows with report_status `Out`):
WR 131, RB 79, TE 73, QB 14 player-weeks. WR hamstring: 51 listed rows (23
`Out`), about 26 distinct listings, of which about 15-17 are time-loss episodes
including IR (Collins). Roughly 8-10 involve fantasy-relevant WRs. An external
anchor: Angileri et al. (Cureus 2025) counted **2,523 time-loss injuries** for
QB/RB/WR/TE/FB over 2017-2022 (WR 975, RB 578, TE 473, QB 174), about 420 per
season.

Rough cell sizes for **fantasy-relevant time-loss episodes with an in-season
return** (estimate; replace with real counts after the first pipeline run):

| Cell         | Per season | 2019-2025 (7 seasons, Sleeper-projection era verified) | 2013-2025 (13 seasons, snaps era) |
| ------------ | ---------- | ------------------------------------------------------ | --------------------------------- |
| WR hamstring | 8-10       | 55-70                                                  | 100-130                           |
| WR all types | 30-40      | 200-280                                                | 400-500                           |
| RB ankle     | 5-8        | 35-55                                                  | 65-100                            |
| RB hamstring | 4-6        | 30-40                                                  | 50-80                             |
| RB all types | 20-30      | 140-210                                                | 260-390                           |
| TE all types | 10-15      | 70-100                                                 | 130-200                           |
| QB all types | 6-10       | 40-70                                                  | 80-130                            |

Implication: **position-level** game-1 factors are estimable, with a standard
error of a few percent. Position x body-part cells are thin (30-130), so they
need hierarchical shrinkage, and only a handful of buckets are viable:
soft-tissue (hamstring/groin/calf/quad), ankle/foot, knee, concussion, other.
Severe structural injuries (ACL, Achilles) rarely return in-season. They matter
for next-season value (dynasty), not for this redraft app.

---

## 3. Double-counting analysis

**Inputs the app uses:** (1) Sleeper weekly projections, which are verified to
be RotoWire's; (2) a uniform rank-match factor to FantasyPros ROS ECR, clamped
to x0.5-x2; (3) IR/PUP zeroing.

**FantasyPros ROS ECR (ROS totals).** FantasyPros grades ROS rankings against
"final rankings based on fantasy points scored for that slice of the season",
i.e. **total** points. Experts are therefore incentivized to price both missed
games and reduced output after a return. FantasyPros publishes no rule on how
experts should treat returning players. It also notes it has "no control over
how frequently the experts update their rankings", so stale ranks are possible.
The app's Plan N already rests on this premise: "the consensus rank already
prices the expected return". **Verdict:** a return discount applied to ROS
totals would very likely double-count, and the rank-match would partly
re-scale it away anyway. There is no keyless historical archive of FP _ROS_
ECR (DynastyProcess `ecr_type` covers best-ball/dynasty/redraft
overall/positional; ROS not evident, unverified). So the ROS side can only be
validated from the app's own `ros_snapshots` going forward.

**Sleeper/RotoWire weekly projections (the per-week shape and current week).**
No RotoWire documentation on return games was found (unverified). Spot check,
2024, first game back, from the endpoints above:

| Player                                 | Pre-injury proj. avg | Return-game proj.        | Change | Return snaps vs baseline | Actual PPR | Actual / proj.                |
| -------------------------------------- | -------------------- | ------------------------ | ------ | ------------------------ | ---------- | ----------------------------- |
| Nico Collins (hamstring, IR)           | 15.85                | 16.70 (week 11)          | +5%    | 47% vs about 82%         | 9.4        | 0.56                          |
| Mike Evans (hamstring)                 | 13.21                | 12.86 (week 12)          | -3%    | 60% vs about 75%         | 11.8       | 0.92                          |
| Davante Adams (hamstring, then traded) | 14.24                | 13.11 (week 7, new team) | -8%    | 96% vs about 97%         | 6.0        | 0.46 (team-change confounded) |

Snaps recovered by game 2 for Collins (79%) and Evans (84%).

**Verdict:** with n = 3 this is anecdotal. It is consistent with weekly
projections **not** pricing a snap-count ramp, so a **current-week** discount
would probably _not_ double-count. It is also consistent with secondary claims
from non-peer-reviewed sources: snaps drop about 19-34% in game 1 back from a
hamstring and are near baseline by game 3 (fantasy-injury-news.com, citing
4for4). This must be measured. The bias of interest is the mean of
actual / projected in return games 1-3 versus all other games for the same
players. Measuring it directly against the app's own input is what removes the
double-counting risk.

---

## 4. How existing tools and analysts model it

| Tool / source                                                                          | Method                                                                                                                                                                                                                                                                    | Output                                                                                                           | Access                                      |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **4for4 Injury Index** (Adam Hutchison, 2022; 2017-2021, about 1,200 injuries)         | Lookup table by position x specific injury (hamstring strain, high-ankle, MCL...). Compares "Healthy Average" PPG with week-1 back and the 3-week average back; tracks re-injury rate. Raw comparisons, no controls or shrinkage.                                         | e.g. WR calf: -33.1% week 1, -14.1% 3-week; TE MCL: -54.0% week 1, -16.8% 3-week; RB high-ankle: -22.3% / -21.7% | Free article (2022). Tables partly visible. |
| **Footballguys Injury Index** (same author, 2024; 2017-2023, more than 2,000 injuries) | Same lookup design plus re-injury and "lingering effects" ratings. Cells are tiny (QB hamstring n=6, QB back n=7).                                                                                                                                                        | QB table free; RB/WR/TE paywalled                                                                                | Partly paid                                 |
| **Footballguys "Gameday Injury Expectations"**                                         | Expert judgement citing "historical data" without method or n                                                                                                                                                                                                             | Narrative                                                                                                        | Free                                        |
| **Draft Sharks Injury Guide** (formerly Sports Injury Predictor lineage)               | ML on about 3,500 player-seasons, 300 variables: injury probability (AUC 0.809) and games missed (R² 0.401)                                                                                                                                                               | **No post-return performance output**                                                                            | Paid                                        |
| **Fantasy Points (Dr. Edwin Porras)**, **SportsMedAnalytics (Dr. Deepak Chona)**       | Clinician judgement plus medical literature / proprietary models                                                                                                                                                                                                          | Per-player commentary, ramp-up predictions                                                                       | Paid or articles; method not public         |
| **Academic**                                                                           | Season-level fantasy PPG change. Angileri 2025: overall -0.50 PPG next season (QB -1.95, RB -0.7, WR -0.33); no association with games missed (R² = 0.0047). Gadbois 2025 review: ACL (RB/WR decline; 36-42% return to pre-injury level), ankle (RB/WR/TE decline, n=303) | Long-horizon, not first-k-games                                                                                  | Open access                                 |

Takeaway: the only published "return adjustments" are **lookup tables by
position x injury type**, built from raw before/after comparisons with small
cells and no regression-to-mean control. Professional tools rely on expert
judgement. None of them publishes a residual-versus-projection analysis.

---

## 5. Modelling options for this app (ranked by value per effort)

| Rank  | Option                                                                                                                                                                                                                                                                                   | Effort                                                                                                                                             | Value                                                                                             | Double-count risk                                               | Notes                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | **(b-narrow) Offline projection-residual study.** 2019-2025 episodes from nflverse injuries + roster_weekly + snaps. Ratio actual / Sleeper projection for games 1, 2, 3 back vs control games, by position (then soft-tissue vs other). Empirical-Bayes shrinkage to the position mean. | Medium: one script, about 7 seasons x 4 files + about 1-2k Sleeper player-projection calls (or bulk weekly calls: 7 x 18 x 4 positions, about 500) | High: answers the double-counting question and yields calibrated factors                          | None by construction (measured against the app's own input)     | Validate that historical projections are pre-kickoff. Exclude week 18 and team changes.                                                    |
| **2** | **(c) Current-week first-game-back discount** in the lineup engine, e.g. game-1 factor by position (and soft-tissue flag from `injury_body_part`/`injury_notes` when non-junk). Optional smaller game-2 factor. ROS totals unchanged.                                                    | Low. Detect "first game back" from the app's current-season snaps/stats: missed the previous team game(s) with an injury status, now active.       | Medium: start/sit and the current week of trades                                                  | Low on ROS (left to consensus). Must be calibrated by option 1. | Ship only if option 1 shows game-1 residual clearly below 1 (e.g. at most 0.9 with a CI that excludes 1).                                  |
| 3     | **(b-full) Empirical table** position x body-part bucket x games-missed bucket, 2013-2025, own-baseline vs matched uninjured controls, hierarchical shrinkage                                                                                                                            | High                                                                                                                                               | Medium: cells thin, labels coarse, 46% of Sleeper body parts are junk at inference time           | High if applied to ROS totals                                   | Only after option 1, and only where cells exceed about 50 episodes.                                                                        |
| 4     | **(a) Static prior table from the literature** (4for4/FBG/academic)                                                                                                                                                                                                                      | Very low                                                                                                                                           | Low: unadjusted raw deltas, small n, paywalled cells, different scoring/eras, season-level papers | High (consensus already prices it)                              | Acceptable only as display text ("historically, WRs back from hamstring strains play reduced snaps in game 1"), not as a value multiplier. |
| 5     | **(d) Do nothing beyond the consensus**                                                                                                                                                                                                                                                  | None                                                                                                                                               | Baseline; correct for ROS totals                                                                  | None                                                            | The right answer for ROS; possibly leaves current-week accuracy on the table.                                                              |

Age and workload: there is no keyless evidence here that they modify
_short-term_ return effects. Treat them as covariates to test in option 1
(age from `roster_weekly.birth_date`, workload from pre-injury snap share)
rather than as built-in adjustments.

---

## 6. References

- nflverse injuries release: https://github.com/nflverse/nflverse-data/releases/tag/injuries (asset API: https://api.github.com/repos/nflverse/nflverse-data/releases/58152949/assets)
- `load_injuries` docs (2009+): https://nflreadr.nflverse.com/reference/load_injuries.html
- Injuries dictionary: https://nflreadr.nflverse.com/articles/dictionary_injuries.html
- Injuries 2025+ source change / missing `date_modified`: https://github.com/nflverse/nflverse-rosters/issues/100
- nflreadr changelog: https://nflreadr.nflverse.com/news/index.html
- Weekly rosters release: https://github.com/nflverse/nflverse-data/releases/tag/weekly_rosters
- Roster status codes: https://nflverse.r-universe.dev/nflreadr/doc/dictionary_roster_status.html
- Snap counts release: https://github.com/nflverse/nflverse-data/releases/tag/snap_counts
- nflverse-data (CC-BY-4.0): https://github.com/nflverse/nflverse-data
- ff_playerids dictionary: https://nflreadr.nflverse.com/articles/dictionary_ff_playerids.html
- DynastyProcess data (GPL-3.0, weekly): https://github.com/dynastyprocess/data
- Sleeper projections (RotoWire): https://api.sleeper.com/projections/nfl/2024/10?season_type=regular&position[]=WR
- Sleeper per-player projections/stats: https://api.sleeper.com/projections/nfl/player/7569?season_type=regular&season=2024&grouping=week ; https://api.sleeper.com/stats/nfl/player/7569?season_type=regular&season=2024&grouping=week
- ESPN core injuries: https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/22/injuries
- NFL.com reserve list: https://www.nfl.com/transactions/league/reserve-list/2024/10
- Sports-Reference bot policy: https://www.sports-reference.com/bot-traffic.html
- FantasyPros ROS accuracy methodology: https://www.fantasypros.com/about/faq/football-rest-of-season-accuracy-methodology/
- 4for4 Injury Index (2022): https://www.4for4.com/2022/preseason/4for4-fantasy-football-injury-index-how-do-injuries-affect-player-performance
- Footballguys Injury Index (2024): https://www.footballguys.com/article/2024-injury-index-fantasy-performance-re-injury-rate-by-position
- Angileri et al., Cureus 2025: https://pmc.ncbi.nlm.nih.gov/articles/PMC12804431/
- Gadbois et al., Cureus 2025 review: https://pmc.ncbi.nlm.nih.gov/articles/PMC12498200/
- Draft Sharks Injury Guide methodology: https://www.draftsharks.com/injury-predictor/about
- Secondary (not peer reviewed): https://fantasy-injury-news.com/injury-guide/hamstring-strain/
- Project: /home/yhabie/project/fantasy-football-companion/docs/research/2026-09-15-data-sources.md ; /home/yhabie/project/fantasy-football-companion/src/main/sync/identity.ts ; Plan N shelf rule in /home/yhabie/project/fantasy-football-companion/docs/superpowers/plans/2026-09-22-plan-n-ros-realism.md
