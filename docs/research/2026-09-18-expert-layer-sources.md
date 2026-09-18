# Expert-layer sources: rankings, market values, news, injuries (verified 2026-09-18)

Scope: keyless, free sources for (A) consensus/expert rankings and trade
values per player, and (B) player news / analyst commentary / injury
reports, for the Electron companion (main-process `fetch`, no cookies).
Hard constraint: no API keys, no sign-up, no OAuth, no HTML scraping.

Everything below was checked live on 2026-09-18 (Friday of NFL 2026
**week 2** — `GET https://api.sleeper.app/v1/state/nfl` returned
`{"week":2,"leg":2,"display_week":2,"season":"2026","season_type":"regular",
"season_start_date":"2026-09-09","season_has_scores":true}`). So "this
week" = 2; week 3 is next week and its weekly rankings are not published yet.

Tags: **VERIFIED** = HTTP 200 with inspected content; **NOT VERIFIED** = could
not be exercised from the research fetcher (POST-only, custom header, or a
403 that looks like a bot-UA block rather than a dead endpoint — retest from
Node with a browser-like `User-Agent` before declaring dead); **DEAD** = 404
or no player data.

Crosswalk note: `db_playerids.csv` (already synced) has `fantasypros_id`,
`espn_id`, `rotowire_id`, `sleeper_id`, `gsis_id`, `sportradar_id`, `mfl_id`
(full header verified: `mfl_id,sportradar_id,fantasypros_id,gsis_id,pff_id,
sleeper_id,nfl_id,espn_id,yahoo_id,fleaflicker_id,cbs_id,pfr_id,cfbref_id,
rotowire_id,rotoworld_id,ktc_id,stats_id,stats_global_id,fantasy_data_id,
swish_id,name,merge_name,position,team,birthdate,age,draft_year,draft_round,
draft_pick,draft_ovr,twitter_username,height,weight,college,db_season`).
The app's `CrosswalkRecord` (`src/main/sources/nflverse-types.ts:61`) currently
reads only sleeper/gsis/pfr/sportradar/espn — **add `fantasypros_id` and
`rotowire_id`** for the sources below.

---

## Part A — Rankings and market values

### 1. FantasyPros partner consensus rankings (ECR) — VERIFIED, keyless

Legacy partner endpoint (the documented v2 API at
`api.fantasypros.com/public/v2/json` needs `x-api-key`; this one does not).

- Base: `https://partners.fantasypros.com/api/v1/consensus-rankings.php`
- Params: `sport=nfl`, `year=2026`, `type=weekly|ros|draft`, `week=N`
  (weekly only), `position=QB|RB|WR|TE|K|DST|FLX|ALL`,
  `scoring=PPR|HALF|STD`.
- Auth: none. Responded to a non-browser UA without complaint. No CORS
  concern (main process).
- Response: `{sport, type ("Weekly PPR"), ranking_type_name, year, week,
  position_id, scoring, filters, count, total_experts, last_updated ("9/18",
  M/D with no year), players: [...]}`.
- Player record (weekly, verified week=2 RB PPR, 128 players, 153 experts,
  updated 9/18): `player_id` (**= `fantasypros_id`**), `player_name`,
  `sportsdata_id` (UUID, looks like the Sportradar id — unverified as a join),
  `player_team_id` (`DET`), `player_position_id`, `player_positions`,
  `player_short_name`, `player_eligibility`, `player_yahoo_positions`,
  `player_yahoo_id`, `cbs_player_id`, `player_page_url`, `player_filename`,
  `player_square_image_url`, `player_image_url`, `player_bye_week`,
  `player_owned_avg`, `player_owned_espn`, `player_owned_yahoo`,
  `player_opponent` (`at BUF`), `player_opponent_id`, `player_ecr_delta`,
  `rank_ecr`, `rank_min`, `rank_max`, `rank_ave`, `rank_std`, `pos_rank`
  (`RB1`), `start_sit_grade` (`A+`), `r2p_pts` (projected points, scoring
  aware: Gibbs 24.9 PPR vs 22.7 HALF), `tag` (`start`). Some records carry
  analysis notes text.
- ROS (`type=ros`, `position=ALL`, PPR): 404 players, **only 6 experts**,
  updated 9/17, `week` = 0. Fields as above minus opponent/start-sit/`tier`.
  `ros` + `HALF` + `RB`: 135 players, 7 experts, updated 9/16.
- Draft (`type=draft`, `position=ALL`, PPR): 559 players, 177 experts,
  updated 9/10, includes `tier`. Preseason snapshot — useful as a stable
  baseline for "value vs. draft".
- Scoring: `PPR`, `HALF`, `STD` all honored (type string changes, ranks and
  `r2p_pts` differ). Pick `PPR` for this league (`rec` = 1.0).
- Positions: weekly `position=ALL` is **remapped server-side to FLX**
  (RB/WR/TE only, 447 players) — fetch QB, K, DST separately. DST rows use
  team-level `player_id` (PHI = 8230, TB = 8290) that are not in
  `db_playerids`; join DST by `player_team_id` to Sleeper's team-code DEF ids.
- Cadence: weekly rankings for week N appear once week N is the current NFL
  week (week=3 returned `count:0, total_experts:0, last_updated:"1/01"` on
  Friday of week 2; 2025 week 3 shows `last_updated: 9/21`, i.e. updated
  through Sunday morning). Drive `week` from Sleeper `state.week`. Weekly
  data refreshes several times a day Tue-Sun; ROS ~daily; draft frozen.
- Size: ~130 KB per weekly position call; ~400 KB for ROS ALL.
- Quirks: `rank_min/max/ave/std` are strings in some responses and numbers
  in others — coerce. `last_updated` lacks a year. Unofficial: could be
  gated any time; cache the last good payload per (type, week, position).
- Verdict (A): **best fit** — true expert consensus, weekly + ROS + draft,
  scoring-aware, joinable via `fantasypros_id`.

### 2. FantasyCalc redraft values — VERIFIED, keyless

- URL: `https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=1&numTeams=16&ppr=1`
- Auth: none. JSON array of ~128-150 records (top players only; not a full
  positional depth chart).
- Record: `player{ id, name, mflId, sleeperId ("9221"), position,
  maybeTeam ("DET"), maybeAge, maybeYoe, espnId, fleaflickerId, ffpcId,
  maybeBirthday, maybeHeight, maybeWeight, maybeCollege, maybeDraftInfo }`,
  `value` (10698 for #1), `overallRank`, `positionRank`, `trend30Day`,
  `redraftValue`, `combinedValue`, `redraftDynastyValueDifference`,
  `redraftDynastyValuePercDifference`, `maybeMovingStandardDeviation(+Perc,
  +Adjusted)`, `displayTrend`, `starter`, `maybeTier`, `maybeAdp` (null),
  `maybeTradeFrequency`, `maybeRosterPercent`, `maybeOwner`.
- Join: **`sleeperId` directly** (also `espnId`, `mflId`).
- Scoring/league params: `numTeams=16` accepted (list length changed 150 to
  128), but `ppr=0.5` returned **identical** top values to `ppr=1` — treat
  the values as effectively format-agnostic trade-market consensus, not a
  scoring-specific ranking.
- Cadence: values derive from real trades in Sleeper/MFL leagues; recomputed
  roughly daily (`trend30Day` present; no `last_updated` field — use the
  response date).
- Size: ~120 KB.
- Verdict (A): **good secondary** — trade-market value + tier + 30-day trend,
  sleeper_id-native, but shallow (~150 players) and not week-specific.

### 3. DynastyProcess values (`values-players.csv`, `values.csv`) — VERIFIED but DYNASTY-only

- URLs (302 from `github.com/dynastyprocess/data/raw/master/files/...` to
  `https://raw.githubusercontent.com/dynastyprocess/data/master/files/values-players.csv`
  and `.../values.csv`).
- Header (both): `player,pos,team,age,draft_year,ecr_1qb,ecr_2qb,ecr_pos,
  value_1qb,value_2qb,scrape_date,fp_id`. `values.csv` adds ~300 rows of
  picks (`pos = "PICK"`, e.g. `2027 Early 1st`). `scrape_date` = 2026-09-18,
  ~700 player rows.
- `ecr_*` is FantasyPros **dynasty** ECR (repo is dynasty-focused; ordering
  Chase > JSN > Bijan with ages attached confirms it). No redraft ECR, no
  weekly. Repo README: "updated via GitHub Actions on a weekly basis".
- Join: `fp_id` = `fantasypros_id`.
- Verdict (A): **not fit** for a redraft league — skip. (Keep in mind only
  as a keepers/dynasty extension.)

### 4. ESPN fantasy `kona_player_info` — VERIFIED shape; filter header NOT VERIFIED

- URL: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leaguedefaults/3?view=kona_player_info`
  (`leaguedefaults/3` = PPR defaults; `/1` = standard). Optional
  `&scoringPeriodId=N`.
- Auth: none. Without the `X-Fantasy-Filter` header it returns only **5
  players** (alphabetical, incl. free agents). The app must send
  `X-Fantasy-Filter: {"players":{"limit":400,"sortPercOwned":{"sortPriority":1,"sortAsc":false}}}`
  (community-documented; WebFetch cannot set headers so the filtered call is
  unverified today).
- Top-level: `{players:[...], ratings}`. Player entry: `id` (**espn_id**),
  `onTeamId`, `player{ fullName, defaultPositionId, proTeamId, injuryStatus
  ("ACTIVE"), injured, ownership{ percentOwned, percentStarted,
  percentChange, auctionValueAverage, averageDraftPosition },
  draftRanksByRankType{ STANDARD|PPR|ELIMINATION|SUPERFLEX: {rank,...} },
  stats[ {scoringPeriodId, statSourceId (0 actual/1 projected),
  statSplitTypeId, appliedTotal, stats{}} ] }`, `ratings{ "0": {
  positionalRanking, totalRanking, totalRating } }`.
- `ratings["0"]` is **season-to-date performance rank** (Achane RB25 /
  total 117 after two weeks), not an expert projection rank;
  `draftRanksByRankType.PPR.rank` is the preseason ESPN draft rank;
  `ownership.percentStarted` is the closest thing to a start/sit crowd
  signal. Passing `scoringPeriodId=2` did not add a `"2"` key to `ratings`.
- Scoring: PPR vs STD via `leaguedefaults/3` vs `/1` and the rank-type keys.
- Cadence: live (ownership changes intraday).
- Size: ~5-10 KB per player with stats — 400 players ~3 MB; trim with a
  `filterStatsForTopScoringPeriodIds` filter or accept the size.
- Verdict (A): **useful supplement** (ESPN crowd start%/own%, projected
  points), not a consensus expert rank. Lower priority than 1 and 2.

### 5. Sleeper trending + `search_rank` — VERIFIED (trending), known (players)

- `https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=25`
  and `.../trending/drop?...` — JSON array `[{"count":398115,"player_id":"6130"}, ...]`.
  `player_id` is the **sleeper_id** (team DEFs appear as `"DET"`, `"JAX"`).
  Requires a `User-Agent` (Sleeper 403s without one — same as the rest of the
  Sleeper API).
- Player object (`/v1/players/nfl`, see 2026-09-15 doc §2.3): `search_rank`
  is Sleeper's internal relevance/ADP-like ordinal (9999999 = irrelevant);
  there is **no `adp`, no positional rank, no ECR**.
- Verdict (A): trending counts are a good "waiver heat" column; `search_rank`
  is only a sort tiebreaker. Not an expert rank.

### 6. BorisChen tiers (plain text) — VERIFIED (current-week files); weekly-* variants 403

- Working: `https://s3-us-west-1.amazonaws.com/fftiers/out/text_RB.txt`
  (standard), `text_RB-PPR.txt`, `text_RB-HALF.txt`, `text_FLX-PPR.txt`
  (same pattern for QB/WR/TE/K/DST). Lines: `Tier 1: Jahmyr Gibbs, Bijan
  Robinson, Christian McCaffrey` — names only, comma-separated, 9-14 tiers.
- `weekly-RB-PPR.txt` returned **403** (bucket denies that key; either
  renamed or private). No ROS text file found.
- These are the **current-week start/sit tiers** (derived from FantasyPros
  ECR clustering); updated several times a week in season. No ids, no team,
  suffix-heavy names (`James Cook III`, `Kenneth Walker III`) — join needs
  name normalisation via `merge_name`. FLX list excludes players already in
  the top RB/WR tiers (starts at Pickens/DeVonta Smith).
- Verdict (A): nice-to-have tier labels; redundant with source 1, which
  already gives `rank_ecr`/`rank_std` per player with an id. Skip for v1.

### 7. Other ranking leads — checked, not usable

- **KeepTradeCut**: HTML-only (values embedded in page JS); no JSON endpoint.
  Skip. (`ktc_id` exists in the crosswalk if this changes.)
- **nflverse / ffverse**: no ECR release. `ffpros` is an R scraper of
  FantasyPros pages, not a data feed. DynastyProcess `db_fpecr.parquet`
  (historical FP ECR archive) — NOT VERIFIED (parquet/gz, could not inspect);
  weekly cadence, likely dynasty pages. Not needed given source 1.
- **FantasyPros v2 API** (`api.fantasypros.com/public/v2/json`) — requires
  `x-api-key`. Skip.

---

## Part B — News, analyst commentary, injuries

### 8. ESPN "now" news feed — VERIFIED, keyless

- URL: `https://now.core.api.espn.com/v1/sports/news?sport=football&league=nfl&limit=50`
- Auth: none. Top-level `{resultsCount, resultsLimit, resultsOffset,
  headlines:[...]}`. **Hard cap 50** per call (`limit=200` still returned
  `resultsLimit: 50`); no offset paging observed beyond `resultsOffset`.
- Headline: `headline`, `description`, `published` (ISO), `lastModified`,
  `type` (`HeadlineNews` | `Story` | ...), `premium`, `byline`, `links.web.href`,
  `categories:[ {type:"league", uid:"s:20~l:28", description:"NFL"},
  {type:"team", teamId:4, description:"Cincinnati Bengals"},
  {type:"athlete", athleteId:3915511, description:"Joe Burrow",
  uid:"s:20~l:28~a:3915511"}, {type:"series"...}, {type:"editorialindicator"...} ]`.
- Join: `categories[type=athlete].athleteId` = **espn_id**; `teamId` = ESPN
  team id. 5 of the first 6 headlines carried at least one athlete tag.
- Quirk: `league=nfl` is **not strict** — a college-football story leaked
  in. Filter on a category `uid` starting `s:20~l:28`.
- Cadence: minutes (news wire). Size ~60 KB for 50.
- Verdict (B): **good** for a "recent NFL news mentioning this player"
  list joined by espn_id; short descriptions only (no analysis body).

### 9. ESPN `site.api.espn.com` news / athlete news / fantasy player news — DEAD (403 from curl too)

- `https://site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50`
- `https://site.api.espn.com/apis/site/v2/sports/football/nfl/athletes/{espn_id}/news`
- `https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?limit=50&playerId={espn_id}`
  (ESPN fantasy app's per-player news with fantasy analysis blurbs)
- All paths on `site.api.espn.com` — including the known-good `/teams` —
  returned **403** to the research fetcher, so this is a UA/IP block of the
  fetcher, not a dead API. `site.web.api.espn.com/apis/common/v3/.../athletes/{id}/news`
  returned **404** (path appears retired).
- Retested 2026-09-18 from the dev shell with `curl` and a Mozilla UA: still
  **403 "Access Denied"** (Akamai edge) on `/news` and `/athletes/{id}/news`.
  Treat the host as blocked for non-browser clients; do not build on it.

### 10. ESPN core injuries (RotoWire-style commentary) — VERIFIED, keyless

- Per athlete (season-scoped; the unscoped path 404s):
  `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/seasons/2026/athletes/{espn_id}/injuries?limit=20`
  → `{count, items:[ {$ref, id, date ("2026-09-18T16:30Z"), status
  ("Questionable"), type{id,name,description,abbreviation}, shortComment,
  longComment, details{ fantasyStatus{description,abbreviation}, type
  ("Back"), location ("Torso"), detail ("Soreness"), side, returnDate
  ("2026-09-20") }, athlete.$ref, team.$ref} ]}` — items are **inline**.
- Per team: `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/{teamId}/injuries?limit=100`
  → `$ref`-only list (54 refs for CIN = season history), each needing a
  follow-up GET; the athlete path above is cheaper for a detail panel.
- Commentary is analyst-written ("Burrow (back) was a full participant in
  Friday's practice and feels good, Jay Morrison of SI.com reports." +
  a 2-3 sentence `longComment`). This is the closest keyless equivalent to a
  Rotoworld blurb, with an **espn_id** join and a real timestamp.
- Cadence: as injuries/practice reports land (multiple per day Wed-Sun).
- Verdict (B): **best keyless per-player commentary** — injury-scoped only
  (no role-change/coach-quote items unless injury related).

### 11. nflverse injuries — VERIFIED

- `https://github.com/nflverse/nflverse-data/releases/download/injuries/injuries_2026.csv`
  (302 to `release-assets.githubusercontent.com`; parquet variant exists).
  `timestamp.json` on the same release: `{"last_updated":"2026-09-18 08:12:40 EDT"}`.
- Header (2026 build): `season,season_type,game_type,team,week,gsis_id,
  position,full_name,first_name,last_name,report_primary_injury,
  report_secondary_injury,report_status,practice_primary_injury,
  practice_secondary_injury,practice_status`. **No `date_modified` column**
  in this build (older seasons had it). 784 rows, weeks 1-2 present.
- Values: `report_status` in `Out|Doubtful|Questionable|""`,
  `practice_status` in `Full Participation in Practice|Limited Participation
  in Practice|Did Not Participate In Practice`.
- Join: **gsis_id** (already the stats key). Cadence: daily in season
  (~08:00 ET). Size: 45 KB.
- Verdict (B): **best official injury-report table** (Wed/Thu/Fri practice
  designations) for a status chip; no free text.

### 12. Sleeper player injury fields — known (2026-09-15 doc §2.3)

`injury_status`, `injury_body_part`, `injury_notes`, `injury_start_date`,
`practice_participation`, `practice_description`, `news_updated`. Confirmed:
`news_updated` is an **epoch-ms timestamp only** — no headline or text.
Use it as a "something changed" trigger to refetch §10/§13 for that player.

### 13. Sleeper GraphQL `get_player_news` — VERIFIED (2026-09-18, curl POST), keyless

- `POST https://sleeper.com/graphql` with body
  `{"query":"{get_player_news(sport:\"nfl\",player_id:\"9221\",limit:10){source published metadata}}"}`
  and headers `content-type: application/json` + a `User-Agent`. No
  Authorization needed for this read (per bealmot/sleeper-mcp `reads.py` /
  `API-NOTES.md`; writes and league-private reads need a token).
- Live result: HTTP 200 with a plain UA. Fields per item: `source`
  (`fantasy_pros` | `rotowire` | `rotoballer`), `source_key`, `player_id`,
  `published` (**milliseconds**), `metadata{title, description, analysis,
  url, topic_id}`. `analysis` is a full analyst paragraph (fantasy take),
  `description` the factual one-liner, `url` links to the source article.
- Depth: `limit:50` returned 50 items for Mahomes (4046), Bijan (8155) and a
  2024 rookie (11566), oldest items 3–9 months back — so 50 covers a whole
  season for any one player. Team DEF ids (e.g. `TEN`) return an empty list.
- Join: `player_id` = sleeper_id (request-side; no join needed).
- Risk: undocumented, may change without notice. Content overlaps §10/§14
  (RotoWire) but adds FantasyPros + RotoBaller and the analysis text.
- Verdict (B): **primary source** — per-player, sleeper_id-native, three
  analyst outlets with commentary, no ID join. Fetch per player on demand.

### 14. RotoWire RSS — VERIFIED, keyless

- `https://www.rotowire.com/rss/news.php?sport=NFL` — RSS 2.0, channel
  `ttl` 10 min. **Only 5 items** per fetch (`count=50` ignored).
- Item: `title` = `"{Player Name}: {Status headline}"` (`Chris Olave:
  Questionable for Sunday`), `link` =
  `https://www.rotowire.com//football/player/chris-olave-15895` (**trailing
  number = `rotowire_id`**, in the crosswalk), `pubDate`, `description`
  (first sentence of the blurb + "Visit RotoWire.com for more..."), `guid`
  (`nfl637886`). No category/team element; team appears in prose only.
- Verdict (B): clean player attribution and freshest items, but a 5-item
  window means polling every ~10 min to build history; truncated text.
  Good as a lightweight ticker, not as the detail-panel body.

### 15. Other news leads — checked

- **FantasyPros RSS** `https://www.fantasypros.com/nfl/rss/news.php` — DEAD
  (404); the player-news page has no `<link rel=alternate>` feed. Player
  news is only in the keyed v2 API.
- **CBS** `https://www.cbssports.com/rss/headlines/fantasy/football/` — DEAD
  (404, with or without slash). `https://www.cbssports.com/rss/headlines/nfl/`
  works (40 items) but is general team/game coverage, no player tags.
- **Yahoo** `https://sports.yahoo.com/nfl/rss.xml` — VERIFIED (15 items),
  general NFL articles, `dc:creator` only, no player tags. Skip.
- **NBC Sports / Rotoworld** player news — HTML page only; no keyless JSON
  endpoint found. Skip.
- **FantasySP** `https://www.fantasysp.com/rss/nfl/allplayer/` — 404. Skip.
- **Reddit** `https://www.reddit.com/r/fantasyfootball/new/.rss` — could
  not be fetched from this environment; Reddit RSS generally needs a
  descriptive `User-Agent` and is not player-attributable. Skip.

---

## Recommendation

### A. Rankings / values in the player table

1. **FantasyPros partner ECR (§1)** — primary. Per NFL week (from Sleeper
   `state.week`), fetch `type=weekly` for `QB, RB, WR, TE, K, DST` +
   `FLX` with `scoring=PPR`; fetch `type=ros&position=ALL&scoring=PPR`
   daily; fetch `type=draft&position=ALL` once as the preseason baseline.
   Store `rank_ecr, pos_rank, rank_ave, rank_std, rank_min, rank_max,
   start_sit_grade, r2p_pts, player_owned_avg, total_experts,
   last_updated`. Beware the tiny ROS expert pool (6-7) — label it.
   Join: `players.player_id` = `sleeper_id` <- `db_playerids.sleeper_id`
   where `db_playerids.fantasypros_id` = `player_id`; DST via
   `player_team_id` = Sleeper DEF id. Fallback for unmatched: `merge_name`
   + position.
2. **FantasyCalc (§2)** — secondary "trade value" + `maybeTier` +
   `trend30Day` column. Join: `player.sleeperId` directly. Refresh daily.
   Optional later: ESPN kona (§4) for `percentStarted` once the
   `X-Fantasy-Filter` call is verified from Node.

### B. News / commentary in the detail panel

1. **ESPN core injuries per athlete (§10)** — on panel open, GET
   `.../seasons/2026/athletes/{espn_id}/injuries`; render `date`, `status`,
   `shortComment`, `longComment`, `details.returnDate`. Join:
   `players.espn_id` (Sleeper provides it) or `db_playerids.espn_id`.
2. **ESPN now news (§8)** — poll every ~15 min, keep a rolling store, index
   by `categories[type=athlete].athleteId`; filter to `s:20~l:28`. Same
   espn_id join.
3. **nflverse injuries (§11)** — daily; official `report_status` /
   `practice_status` chip by `gsis_id` (already the stats key).
4. **RotoWire RSS (§14)** — 10-min poll ticker; attribute by parsing the
   trailing id in `link` -> `db_playerids.rotowire_id` -> `sleeper_id`
   (fall back to title prefix before `:` + `merge_name`).
5. **Sleeper GraphQL `get_player_news` (§13) — verified, primary.** Supersedes
   4 (RotoWire is one of its three sources) and covers non-injury news with
   analyst text, sleeper_id-native. §9 `site.api.espn.com` is dead (403).

Trigger optimisation: use Sleeper `news_updated` (§12) deltas from the
existing player sync to decide which players' §10/§13 to refetch.
