# Players Screen Redesign — Design

**Status:** approved by the user on 2026-09-17 (screen section reviewed; data/query sections delegated: "let's try this and I'll check it when you're done", "be careful not to saturate the window with information and buttons").
**Builds on:** slice 1 (`v0.3.0`): nflverse stats pipeline, identity resolution, `player_week_points`, the current Players screen.

## 1. Goal

Replace the Players screen with a Sleeper-like weekly table: position tabs (incl. the league's flex slots), a `Projection | Stats` toggle, season and week selectors, `Free agents` / `Watchlist` / `Rookies` filters, Sleeper's column groups per position, and three things Sleeper does not offer — points under **this league's exact rules** in both modes, a `Δ` (actual − projected) column for played weeks, and nflverse usage columns (snap %, target share).

Non-goals: season totals in the table (the week selector is week-only; the League roster keeps season points), IDP positions (this league has none; the tab list is derived from roster slots so an IDP league would simply show no IDP tab yet), syncing Sleeper's own watchlist (not exposed by its API), player cards beyond the existing weekly-stats panel.

## 2. Data sources

### 2.1 Sleeper projections (new, unofficial)

`GET https://api.sleeper.app/projections/nfl/{season}/{week}?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF` (no `/v1`). Verified 2026-09-17 for week 2: 3,305 items, `company: "rotowire"`, positions QB/RB/WR/TE/K/DEF (+ a few FB/P/DB rows), `stats` keyed by **Sleeper's stat vocabulary** (`pass_yd`, `rush_att`, `rec_tgt`, `fgm_40_49`, `xpa`, `sack`, `pts_allow`, …) plus Sleeper's own `pts_std/ppr/half_ppr` and tier flags (`pts_allow_21_27: 1`). Item also carries `team`, `opponent`, `date`, `game_id`.

Stored as-is (the `stats` object) and **scored on read** with `scoreStatLine(stats, rules, position)` — the engine ignores the pre-computed tier/bonus flags because it derives those keys itself, so projected points follow the league's rules exactly, including custom edits, with no recompute hook.

Risk: unofficial. The sync step treats HTTP 404/410 or a non-array body as `skipped: "projections endpoint unavailable"`; nothing else depends on it (Stats mode is unaffected). No feature flag — the step's isolation is the flag.

### 2.2 Existing

`player_week_stats` + adapters (Stats mode columns), `player_week_points` (Stats mode `PTS`), `player_week_snaps` (`SNAP%`), `stats_json.target_share` (`TGT%`), `roster_players`/`teams` (owner), `players.years_exp` (rookie = 0), `player_ids` (identity), `games` (opponent, home/away, score, bye).

`games.csv` also has `gametime` (ET, `HH:MM`) which we do not store yet; it is added so the game line can show kickoff time.

## 3. Data model (migration 004)

| Table | Key | Columns |
|---|---|---|
| `player_week_projections` | `player_id, season, week` | `company`, `team`, `opponent`, `stats_json`, `updated_at` |
| `watchlist` | `player_id` | `added_at` |
| `games` | (existing) | + `gametime TEXT` (ET wall clock, nullable) |

Projections are league-independent (points are computed on read), so no `league_id`. The watchlist is app-wide (one user, one machine).

## 4. Sync

New Sleeper step `sleeper:projections:<season>:<week>` in `refreshSleeper`, after `sleeper:players`, for `week = nfl_state.display_week` of the current season (skipped when `season_type` is not `regular`). Freshness 6 h (projections move during the week); force ignores it; full-week replace inside one transaction; row-level parse failures counted in the message. Past weeks are never re-fetched — whatever was stored while the week was current is what `Δ` compares against. `importAll`/first import runs it like any other step.

## 5. Read model and IPC

All reads are SQLite-only, in the main process.

```
players.options()                 -> PlayersOptions   { seasons: number[]; currentWeek: number; lastScoredWeek: number | null;
                                                        tabs: PositionTab[]; projectionWeeks: { season, week }[] }
players.table(query: PlayersQuery) -> PlayersTable    { rows: PlayerTableRow[]; total: number }
players.weeklyStats(playerId)     -> WeekStats[]      (existing; feeds the slide-over)
watchlist.toggle(playerId)        -> boolean          (new state)
```

`PlayersQuery { season; week; mode: 'proj' | 'stats'; tab: string; search?; freeAgents?; watchlist?; rookies?; owner?: number; sort: { key: SortKey; dir: 'asc' | 'desc' } }`

`PositionTab { id: 'ALL' | 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DEF' | <flex slot name>; label; positions: Position[] }` — `ALL` = QB/RB/WR/TE/K/DEF; flex tabs come from the league's `rosterSlots` (`FLEX` → RB/WR/TE, `SUPER_FLEX` → QB/RB/WR/TE, `REC_FLEX` → WR/TE, `WRRB_FLEX` → RB/WR), in slot order, de-duplicated. Sleeper's `FB` position is displayed and filtered as `RB`.

`PlayerTableRow { playerId; fullName; position; team; byeWeek; injuryStatus; rookie; watched; ownerRosterId; ownerName; game: GameInfo | null; points: number | null; projected: number | null; delta: number | null; stats: Record<string, number>; snapPct: number | null; targetShare: number | null; statsAvailable: boolean }`

`GameInfo { opponent; home: boolean; kickoff: string | null (ISO UTC, from gameday + gametime interpreted as America/New_York); homeScore; awayScore; final: boolean }` — `null` means bye (team known) or no team.

Row assembly (`db/repos/playersTable.ts`): SQL selects the candidate players (positions of the tab, FB→RB, rostered-or-active-or-has-data, search/FA/watchlist/rookie/owner filters) joined with roster, teams, ids, watchlist; then per-week data is attached in JS from four map lookups: stats rows for `(season, week)` (by GSIS, through `playerStatLine`; DEF via `team_week_stats` + `teamStatLine` with points/yards allowed), points, projections (by Sleeper id), snaps (by PFR id), games (by nflverse team). `stats` holds Sleeper keys in both modes, plus display-only keys `fga`, `xpa` (nflverse `fg_att`, `pat_att`) and `fgm_0_39` (= `fgm_0_19 + fgm_20_29 + fgm_30_39`, both modes). `delta = points − projected` when both are numbers. Sorting happens in JS on the full candidate set, then the first 250 rows are returned with `total`.

## 6. Screen

Layout (dark theme, existing primitives; no new UI packages):

1. **Tabs row:** pill tabs from `options.tabs`; name search at the right (debounced 150 ms).
2. **Controls row (one row):** `Projection | Stats` segmented control · season select · week select (1–18; default `currentWeek`) · three small toggle chips `Free agents` `Watchlist` `Rookies` · owner select. Nothing else — no extra buttons.
3. **Table:** two header rows (group, column); click a column to sort (toggle direction); `PTS` desc by default. Row: ★ (watchlist toggle, filled when watched) · position badge · name (`R` mark for rookies, injury status in red) with a muted second line `TEAM (bye 7) · Sun 1:00 PM vs GB` / `· vs GB · W 24-20` / `· BYE` / `—` · owner · numbers, `—` for missing. Rows are capped at 250; a footer line says `Showing 250 of N — refine filters` when truncated.
4. **Slide-over:** row click opens the existing weekly-stats panel over the right edge (≈ 480 px), with a close button and Escape to close.

Column groups per tab:

| Tab | Groups (Stats mode adds USAGE; `Δ` only in Stats mode) |
|---|---|
| ALL, FLEX tabs, RB, WR, TE | FANTASY `PTS Δ` · RUSHING `ATT YD TD` · RECEIVING `REC TAR YD TD` · PASSING `CMP ATT YD TD` · USAGE `SNAP% TGT%` |
| QB | FANTASY `PTS Δ` · PASSING `CMP ATT YD TD INT` · RUSHING `ATT YD TD` · USAGE `SNAP%` |
| K | FANTASY `PTS Δ` · FIELD GOALS `FGM FGA 0–39 40–49 50+` · XP `XPM XPA` |
| DEF | FANTASY `PTS Δ` · DEFENSE `SACK INT FF FR TD SAFE BLK` · ALLOWED `PTS YDS` |

Stat keys behind the columns: rushing `rush_att rush_yd rush_td`; receiving `rec rec_tgt rec_yd rec_td`; passing `pass_cmp pass_att pass_yd pass_td pass_int`; kicking `fgm fga fgm_0_39 fgm_40_49 fgm_50p xpm xpa`; defense `sack int ff fum_rec def_td safe blk_kick pts_allow yds_allow`. Projection values are shown with one decimal, actuals as integers (fractions such as 0.5 sacks keep one decimal).

Empty states: Stats mode for a week after `lastScoredWeek` → "Week N hasn't been played yet — switch to Projection"; Projection mode with no stored projections for the week → "No projections stored for week N (they are fetched from the current week on)"; no rows after filtering → "No players match".

Kickoff times are converted from ET to the machine's local time zone in the renderer (`toLocaleString`).

## 7. Error handling

Projection fetch failures are `sync_log` rows like any other source; the toggle stays usable and the empty state explains. A player without an nflverse identity shows `—` in Stats mode (`statsAvailable = false`) but still gets projections (keyed by Sleeper id). Missing `gametime` → game line without a time.

## 8. Testing

Headless Vitest, in-memory SQLite: projections parser against a trimmed capture of the real endpoint (`tests/fixtures/sleeper/projections.json`, ≈ 20 items incl. K and DEF) and against an inline mini fixture; sync step (ok / fresh-skip / endpoint unavailable → skipped / non-regular season → skipped); repos (projections replace idempotency, watchlist toggle, `gametime` round-trip); `playersTable` (each filter, tab position sets incl. FLEX, both modes, `Δ`, `fgm_0_39`, sorting, cap + total, DEF rows, FB→RB); pure renderer view-model (`tabsFromSlots`, `columnGroups(tab, mode)`, `gameLabel` incl. ET→local, `formatCell`). UI verified manually in the dev app by the user.

## 9. Structure

```
src/main/sources/sleeper.ts            + getProjections(season, week)  (projectionsBaseUrl option, no /v1)
src/main/sources/sleeper-types.ts      + SleeperProjection
src/main/sync/mappers.ts               + mapProjections
src/main/db/migrations/004_projections.sql
src/main/db/repos/projections.ts       replaceProjections, listProjections
src/main/db/repos/watchlist.ts         toggleWatch, listWatched
src/main/db/repos/stats.ts             GameRow/upsertGames + gametime
src/main/db/repos/playersTable.ts      tabsForLeague, playersOptions, playersTable
src/main/scoring/adapters.ts           + DISPLAY_STAT_MAP (fga, xpa), fgm_0_39 helper
src/main/sync/sleeperSync.ts           + SOURCE_PROJECTIONS step
src/shared/types.ts, src/shared/ipc.ts + PlayersOptions, PlayersQuery, PlayersTable, PlayerTableRow, GameInfo, PositionTab
src/main/ipc/handlers.ts, src/preload/index.ts
src/renderer/src/lib/playersTableView.ts   columnGroups, gameLabel, formatCell, kickoffLocal
src/renderer/src/screens/PlayersScreen.tsx  rewritten
src/renderer/src/components/SlideOver.tsx   small overlay panel
```
