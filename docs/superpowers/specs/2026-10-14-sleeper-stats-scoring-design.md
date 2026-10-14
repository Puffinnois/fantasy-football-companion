# Scoring from Sleeper's stats — design

**Date:** 2026-10-14 · **Status:** approved 2026-10-14, amended 2026-10-14 (§7: Plan W) · **Release:** `v0.23.0` (Plan W)

**Goal.** Make the app's actual fantasy points equal Sleeper's own for every player and team defense and every scoring key. To do that, the app scores Sleeper's weekly stat lines with the league's rules. nflverse stays as the fallback and as the source of usage signals.

**Constraint.** No paid API and no key. The stats endpoint is Sleeper's unofficial one, on the host the app already uses for projections.

## 1. What the app does today

Actual points come from nflverse. `recomputePoints` maps each `stats_player_week` row (through `player_ids.gsis_id`) and each `stats_team_week` row (through `player_ids.nflverse_team`) to Sleeper stat keys with `PLAYER_STAT_MAP` / `TEAM_STAT_MAP` (`src/main/scoring/adapters.ts`). It then scores the lines with the league's rules (`scoreStatLine`). Points allowed come from the final score in `games`; yards allowed from the opponent's team row.

24 Sleeper keys have no nflverse column. They score 0 and the Rules screen lists them as unsupported (`supported: false` in `src/shared/statKeys.ts`):

- **Long TDs:** `pass_td_40p` / `50p`, `rush_td_40p` / `50p`, `rec_td_40p` / `50p`.
- **Turnovers and returns:** `pass_int_td`, `pr_td`, `kr_td`.
- **Reception buckets:** `rec_0_4`, `rec_5_9`, `rec_10_19`, `rec_20_29`, `rec_30_39`.
- **Special-teams fumbles:** `st_ff`, `st_fum_rec`, `def_st_ff`, `def_st_fum_rec`.
- **Kicking:** `fgm_yds_over_30`.
- **Team defense:** `def_forced_punts`, `def_4_and_stop`, `def_3_and_out`, `def_kr_yd`, `def_pr_yd`.

## 2. Findings (live data, 2026-10-12 and 2026-10-14)

Measured on the user's league (16 teams; 41 scored keys).

- **Only four of the 24 keys are scored in this league:** `st_ff`, `st_fum_rec`, `def_st_ff` and `def_st_fum_rec`, at 1 point each. The others matter only to leagues that score them.
- **Players already match.** For every rostered player, 2026 weeks 1–4, the app's points equal Sleeper's matchup points (`players_points` from `/league/{id}/matchups/{week}`). Exception: one week-4 WR (app 2, Sleeper 0).
- **Team defenses do not.** Of 700 team-weeks (2025 and 2026, regular season), the app's DEF line scores the same as Sleeper's (`sleeper_def` in the warehouse) on **580 (83 %)**. Errors run from 1 to 7 points a week. Causes, by key:
  - `ff` / `def_st_ff` and `fum_rec` / `def_st_fum_rec`: nflverse counts special-teams forced fumbles and recoveries as ordinary ones, and Sleeper splits them. 41–58 team-weeks each.
  - Points allowed: Sleeper's figure is often a TD lower than the opponent's final score (ATL 2025 week 3: 30 vs 24). That fits Sleeper leaving out points the opponent's defense or special teams scored. 60 team-weeks change tier.
  - `def_td`: Sleeper counts more on 21 team-weeks, `sack` on 11.
- **Sleeper's own lines reproduce Sleeper's points exactly.** Sleeper's weekly stat lines (`/stats/nfl/{season}/{week}`), scored with the league's rules by the app's existing `scoreStatLine`, equal Sleeper's matchup points for **1,066 of 1,066** rostered player-weeks (2026 weeks 1–4, team defenses included).
- **The endpoint.**
  - `https://api.sleeper.app/stats/nfl/{season}/{week}?season_type=regular&position[]=…` is the same host as the projections the app already reads.
  - It returns one row per player: `player_id` (Sleeper's), `team`, `opponent`, `game_id`, `stats` and a `player` object. Team defenses have `player_id` = the team code, which is already their `players.player_id`.
  - Every fantasy row of a week is a known `players.player_id`.
  - Size: about 115 KB gzipped for QB / RB / WR / TE / K / DEF, about 2 s a request.
- **Sleeper drops zero values.** A shutout's DEF row has no `pts_allow` key, and that would score as no tier at all. Sleeper's rows also publish their own tier keys (`pts_allow_0: 1`, `yds_allow_100_199: 1`).
  - Over all 544 DEF game rows of 2025, deriving the tiers from `pts_allow ?? 0` and `yds_allow ?? 0` matches Sleeper's published tiers 544 / 544.
  - The 7 rows without `pts_allow` are exactly the 7 shutouts.
- **Kickers.** Sleeper's K lines carry `fga` and `xpa`, the display-only attempts the app takes from nflverse today, plus its own distance buckets.

## 3. Design

### 3.1 Source

- New client method `getStats(season, week)` on the Sleeper client (`src/main/sources/sleeper.ts`):
  - It calls `GET {projectionsBaseUrl}/stats/nfl/{season}/{week}?season_type=regular` with the position filter projections use (QB, RB, WR, TE, K, DEF).
  - When the league scores any `idp_*` key, it also asks for DL, LB and DB.
  - It returns `null` when the endpoint is gone (404 / 410), as `getProjections` does.
- Seasons: the current and the prior season, the same two the core keeps. Regular season only.
  - Prior season: weeks 1–18.
  - Current season: weeks 1 through the state week while the state is `regular` (the week in progress included, so points update during the week as they do on Sleeper); weeks 1–18 when the state is `post` or `off`; none in `pre`.

### 3.2 Storage

New app-database migration `010_sleeper_stats.sql`:

```sql
-- One Sleeper stat line per player-week, as Sleeper publishes it (zeros are absent upstream).
CREATE TABLE sleeper_week_stats (
  player_id TEXT NOT NULL,          -- Sleeper player id; team defenses use the team code
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  team TEXT,                        -- Sleeper team code, as published
  opponent TEXT,
  stats_json TEXT NOT NULL,         -- the row's `stats` object, numbers only
  updated_at TEXT NOT NULL,
  PRIMARY KEY (player_id, season, week)
);
CREATE INDEX idx_sleeper_week_stats_week ON sleeper_week_stats(season, week);
```

- **Replace granularity.** A step replaces all rows of its (season, week) in one transaction.
- **Which rows are kept.** Rows with `gp ≥ 1`, or with any non-zero scoring stat. The embedded `player` object and the rank and points fields (`pos_rank_*`, `pts_*`) are not stored. Sleeper's own fantasy points are not used: the league's rules decide.
- **Size.** About 470 fantasy rows a week, roughly 1–2 MB a season.

### 3.3 Sync

- One step per week: `sleeper:stats:<season>:<week>`, run inside `refreshNflverse` after the nflverse stats steps and before identity and points.
- A stats step that writes rows marks the stats as changed, so `app:points` re-runs, exactly as an nflverse stats step does today.
- Freshness:
  - the state week and the week before it: 6 h (stat corrections land during the week);
  - older weeks of the current season: 7 days;
  - prior-season weeks: 30 days.
  - A forced refresh re-runs only the current season's state week and the week before it.
- **A gone endpoint** (`null`, or a body that is not a list) is a skip: "stats endpoint unavailable". The loop stops after the first one, as projections do, so a retired endpoint costs one request a refresh. Scoring then falls back to nflverse (§3.5).
- **First sync** after the upgrade: about 23 requests (18 prior-season weeks plus the current season's weeks so far), roughly 45 s on the user's link, during the Refresh.

### 3.4 Reading a Sleeper line

`sleeperStatLine(stats, position)` (in `src/main/scoring/adapters.ts`) turns a stored row into a `StatLine`:

- Every numeric key is copied as it is. Sleeper's keys are the app's keys.
- **Zeros restored.** On a DEF line that played (`gp ≥ 1`), a missing `pts_allow` or `yds_allow` becomes 0, so the derived tiers fire on shutouts (§2: 544 / 544).

No other key needs this. Every other derived key, such as the yardage bonuses, compares against a threshold above zero, so absent and 0 give the same result.

### 3.5 Scoring

`recomputePoints` builds one line per player-week. Sleeper comes first:

1. **Sleeper line.** For every `sleeper_week_stats` row of a player in `players`, score `sleeperStatLine` with the player's position (DEF for team defenses). The row's key is `(player_id, season, week)`. No identity mapping is involved.
2. **nflverse fallback.** For every player-week that has no Sleeper row, score the nflverse line as today: players through `player_ids.gsis_id`, defenses through `player_ids.nflverse_team`.

The engine (`scoreStatLine`, `DERIVED_STATS`) does not change.

**Effects.**

- Rostered players whose gsis id never resolved now get points.
- With the endpoint gone, every week falls back to nflverse and the app scores exactly as it does today.

### 3.6 Display

The weekly stat columns show the line that was scored: the Players screen (`playersWeek.ts`) and the value-mode series (`value/series.ts`).

- A player-week with a Sleeper row shows `sleeperStatLine` (it carries `fga` and `xpa`; `withKickingBuckets` still adds `fgm_0_39`).
- Otherwise the nflverse line shows as today.

Usage signals (target share, rush share, air-yards share, WOPR, snap %) stay on nflverse. Sleeper does not publish them in that form.

### 3.7 Rules screen

The 24 keys of §1 become `supported: true` in `src/shared/statKeys.ts`, and the field's doc comment changes to "scored: from Sleeper's stat lines, or from nflverse when Sleeper has none". Keys the app does not know keep their "Other" section.

## 4. Testing

No test touches the network.

- **Fixture.** `tests/fixtures/sleeper/stats_2026_4.json`: a captured week, trimmed. It keeps:
  - a QB, an RB, a WR (with reception buckets), a TE and a K;
  - two DEF rows;
  - a shutout DEF row: KC from 2025 week 7, stored as captured.
  - one row with `gp` 0 and no stats.
- **Client.** `getStats` builds the URL with the position filter, adds the IDP positions when asked, and returns `null` on 404 / 410.
- **Mapper.**
  - Rows are filtered by `gp` and non-zero stats.
  - The `player` object and the `pts_*` / `pos_rank_*` fields are dropped.
- **`sleeperStatLine`.**
  - Keys are copied.
  - On a DEF shutout `pts_allow` is restored to 0, and `pts_allow_0` scores.
  - A player line gets no restored keys.
- **Scoring.** In `recomputePoints`:
  - A Sleeper row wins over an nflverse row for the same player-week.
  - A player-week with only nflverse is scored from nflverse.
  - A player with no gsis id is scored from Sleeper.
  - A league scoring `def_st_ff` gets those points on a Sleeper DEF line.
  - The fixture's lines scored with a fixture league equal hand-worked totals.
- **Sync.** With a fake Sleeper client:
  - the step runs per week, with the freshness rules;
  - the state-week window is correct (`regular`, `post`, `pre`);
  - a gone endpoint is skipped and stops the loop;
  - an ok stats step triggers `app:points`.
- **Display.** The Players-week row and the series show the Sleeper line when one exists.
- **Existing tests.** Every scoring and display test built on nflverse lines still passes, because they have no Sleeper rows.

## 5. Acceptance (manual, in the plan)

- **Points gate.** On the user's league, after a refresh, the app's `player_week_points` must equal Sleeper's matchup `players_points` for every rostered player in every completed week of the current season, within 0.01. If not, stop and report.
- **DEF agreement.** Recorded, not gated: the share of 2025–2026 team-weeks whose app points equal Sleeper's (83 % before, 100 % expected).
- **First-sync time and the app-database size** go in the plan's Status block.

## 6. Out of scope

- The postseason; the core is regular season only.
- Projections, which are already Sleeper's.
- Values, signals or the lineup model, beyond what the new points feed them.
- Removing the nflverse stats sync, which signals and the fallback need.
- The warehouse, whose `sleeper` source is unchanged and not read.
- Sleeper's `pts_*` fields; the league's rules decide.

## 7. Amendment 2026-10-14: Plan W

Plan W was built against Sleeper's live stats for the user's league. With these changes, the app's points equal Sleeper's matchup points for every rostered player in every completed 2026 week (1,066 of 1,066 player-weeks, weeks 1–4), measured 2026-10-14.

- **The stats sync is its own function** (§3.3).
  - `refreshSleeperStats` runs in `refreshAll` and `importAll`, after the Sleeper sync and before nflverse.
  - A stored week sets `refreshNflverse`'s `sleeperStatsChanged`, which re-runs `app:points`.
  - nflverse's own steps keep their order.
- **Rows kept: `gp ≥ 1`** (§3.2). A row without `gp` carries only ranks, `gms_active` and team snap counts (304 of 780 rows in 2026 week 4).
- **Fields dropped: exactly `pts_std`, `pts_ppr`, `pts_half_ppr`, `pts_idp` and `pos_rank_*`** (§3.2). `pts_allow` and its tiers are defense stats; dropping every `pts_*` key scored every defense as a shutout.
- **The catalogue** (§3.7).
  - Every catalogue key is `supported`.
  - A new `nflverse` flag marks the keys the nflverse fallback computes; the adapter contract tests check it.
  - The Rules screen's note lists only keys outside the catalogue: "Not known to this app (scored as 0)".
- **`statsAvailable` keeps its meaning** (§3.6). It still means "has an nflverse identity" and still gates the usage signals. A player scored only from Sleeper gets points and a stat line but no usage signals.
- **First sync:** 23 requests in 5.6 s; the app database grows by about 4.4 MB.
