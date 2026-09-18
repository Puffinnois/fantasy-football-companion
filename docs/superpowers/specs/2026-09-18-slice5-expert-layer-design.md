# Slice 5 — Expert Layer — Design

**Status:** approved by the user on 2026-09-18 (approach and sections 1–5 reviewed one by one).
**Builds on:** slice 4 (`v0.7.0`): `PlayerValueRow` with `rosRank` per position, `PlayerWeekRow`, the `players.value` / `players.week` / `players.detail` read model, the `runStep` sync pipeline with `sync_log` and the status bar, the DynastyProcess `crosswalk` table, `PlayerDetailPanel`, `ValueHelp`.
**Research basis:** `docs/research/2026-09-18-expert-layer-sources.md` (live-verified 2026-09-18).

## 1. Goal

Put outside opinion next to our own numbers so a decision can be sanity-checked and read with its story:

1. **Consensus rankings** — where the experts rank a player this week and for the rest of the season, and where the trade market prices them, alongside our computed value. The headline is the gap between our rank and theirs.
2. **Commentary** — the recent news and analyst takes behind a player, in the detail panel, so a number has context ("target share is falling" + "coach says the rookie earned more snaps").

Delivered as two plans (H, I) under this one spec. Slice 6 (decision tools) reads `expert`, `market` and `vsMine` from the same rows; nothing of it is built here.

### Constraint: free and keyless

Every source is a public JSON endpoint with no key, sign-up, OAuth or HTML scraping. Unofficial endpoints (like the Sleeper ones already in use) are acceptable; each is isolated behind one sync step or one IPC call so its removal degrades one feature, not the app.

### Non-goals

- No news feed screen or "fresh news" table marker — commentary lives in the detail panel only.
- No FantasyPros `draft` (preseason) snapshot, no rank-history storage or ECR sparklines. FantasyPros' `player_ecr_delta` and FantasyCalc's `trend30Day` are the only movement figures.
- No nflverse injury reports; Sleeper's `injury_status` (already on every row) stays the injury chip.
- No LLM summarisation.
- Expert data for past seasons is not fetched; Experts columns are empty there.

## 2. Sources

| Need | Source | Join | Verified |
| --- | --- | --- | --- |
| Weekly and rest-of-season expert consensus | FantasyPros legacy partner API `https://partners.fantasypros.com/api/v1/consensus-rankings.php` (`sport=nfl`, `year`, `type=weekly\|ros`, `week`, `position`, `scoring=PPR\|HALF\|STD`) | `player_id` = `fantasypros_id` in the DynastyProcess crosswalk → `sleeper_id`; DST by team code | 2026-09-18 |
| Trade-market value | FantasyCalc `https://api.fantasycalc.com/values/current?isDynasty=false&numQbs=…&numTeams=…&ppr=…` | `player.sleeperId` | 2026-09-18 |
| Player news and analysis | Sleeper GraphQL `POST https://sleeper.com/graphql` `{ get_player_news(sport:"nfl", player_id:"…", limit:N){ source source_key published metadata } }` — aggregates FantasyPros, RotoWire, RotoBaller | request-side `player_id` = Sleeper id | 2026-09-18 |

Facts the design relies on (details in the research doc):

- FP weekly `position=ALL` is silently remapped to FLX (RB/WR/TE); QB, K and DST need their own calls. FP ROS `position=ALL` does return all six positions (404 players).
- FP weekly rankings for week N exist only once N is the current NFL week (`count: 0` before). Past weeks stay available.
- FP `rank_min/max/ave/std` arrive as strings in some responses and numbers in others.
- FP DST rows carry team-level `player_id`s not in the crosswalk and use `JAC` where Sleeper uses `JAX`.
- FantasyCalc accepts `numTeams=16`; `ppr` does not change its values (they are market consensus, not scoring-specific). Roughly the top 130 players only.
- Sleeper news items carry `metadata.title`, `.description` (factual one-liner), `.analysis` (analyst paragraph), `.url`; `published` is in milliseconds; team DEF ids return an empty list.

## 3. Rankings sync and storage (Plan H)

### 3.1 Source clients

Thin clients in the style of `sources/sleeper.ts`: injected `fetch`, typed payloads, parsing only.

- `sources/fantasypros.ts` — `getRankings({ type, week?, position, scoring })` → `{ count, totalExperts, players: FpPlayer[] }`, coercing the `rank_*` fields to numbers.
- `sources/fantasycalc.ts` — `getValues({ numTeams, numQbs, ppr })` → `FcRecord[]`.

### 3.2 Sync steps

New `sync/expertSync.ts`, called by `refreshAll` and `importAll` after nflverse (it needs the crosswalk). One `runStep` per unit so every unit shows in the status bar and `sync_log`:

| Source key | Calls | Freshness |
| --- | --- | --- |
| `fantasypros:weekly:{season}:{week}` for weeks 1…current week | 4 (QB, FLX, K, DST) | past weeks 30 d; current week 3 h |
| `fantasypros:ros:{season}` | 1 (`position=ALL`) | 12 h |
| `fantasycalc:{season}` | 1 | 12 h |

- Regular season only (`nfl_state.seasonType === 'regular'`); otherwise one skipped step with a message, like projections.
- Weekly loop stops at the first 404/410 so a retired endpoint costs one request per refresh. Current week with `count: 0` → `SkipStep('not published yet')`.
- **Scoring format** derives from the rules' `rec` points: `≥ 1 → PPR`, `0 < rec < 1 → HALF`, else `STD` (this league: PPR). FantasyCalc gets `ppr` from the same value, `numTeams` from the league's team count, `numQbs = 2` when the roster has a `SUPER_FLEX` slot else `1`.
- FantasyPros steps only: a stored `scoring` that differs from the current format counts as stale, so a rules change bypasses freshness and the rows are replaced on the next refresh. FantasyCalc values are format-agnostic and keep their plain freshness.
- Any step that writes rows calls `invalidateCaches()`.

### 3.3 Joining FantasyPros rows to Sleeper ids

- Migration `005_experts.sql` adds `fantasypros_id TEXT` to `crosswalk` (with `CrosswalkRecord.fantasyprosId` and the CSV parser column) and deletes the crosswalk step's `sync_log` rows so the next refresh re-downloads it with the new column.
- Player rows: FP `player_id` → `crosswalk.fantasypros_id` → `sleeper_id`. No hit → the existing name+position identity rule against Sleeper players. Still no hit → dropped and counted; the step message always reads `"{matched} matched, {unmatched} unmatched"`.
- DST rows: `player_team_id` → Sleeper DEF id (the team code), through a `FP_TO_SLEEPER_TEAM` alias map in `@shared/teams.ts` (`JAC → JAX`; extend if others appear).
- A matched Sleeper id that has no `players` row is stored anyway (harmless; nothing renders it).

### 3.4 Tables

```sql
CREATE TABLE expert_ranks (
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,          -- 0 = rest of season
  player_id TEXT NOT NULL,        -- Sleeper id
  scoring TEXT NOT NULL,          -- PPR | HALF | STD
  rank_ecr INTEGER NOT NULL,      -- overall consensus rank
  pos_rank INTEGER NOT NULL,      -- numeric part of "RB12"
  rank_ave REAL, rank_std REAL, rank_min INTEGER, rank_max INTEGER,
  experts INTEGER NOT NULL,
  grade TEXT,                     -- weekly start_sit_grade, null for ROS
  proj_pts REAL,                  -- weekly r2p_pts, null for ROS
  updated_at TEXT NOT NULL,
  PRIMARY KEY (season, week, player_id)
);
CREATE TABLE market_values (
  season INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  value INTEGER NOT NULL,
  overall_rank INTEGER NOT NULL,
  pos_rank INTEGER NOT NULL,
  tier INTEGER,
  trend_30d INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (season, player_id)
);
```

Writes replace per `(season, week)` for `expert_ranks` and per `season` for `market_values`, in one transaction each, mirroring `replaceProjections`.

## 4. Rankings read model and table (Plan H)

### 4.1 Shared types (`src/shared/types.ts`)

```ts
/** Experts' rest-of-season consensus; null when FantasyPros has no ROS row for the player. */
export interface ExpertRos {
  ecrRank: number        // overall across positions
  ecrPosRank: number     // within the player's position
  spread: number         // rank_std — how much the experts disagree
  experts: number
  /** ecrPosRank − rosRank: positive = we rank the player higher than the experts. Null when either rank is missing. */
  ecrDelta: number | null
}
/** FantasyCalc trade-market consensus; null outside its top list. */
export interface MarketValue { value: number; posRank: number; tier: number | null; trend30d: number }
/** This week's start/sit consensus; null when the week isn't published or the player is unranked. */
export interface ExpertWeek { ecrPosRank: number; grade: string | null; projPts: number | null; spread: number }

// additions
PlayerValueRow.expert: ExpertRos | null
PlayerValueRow.market: MarketValue | null
PlayerWeekRow.expert: ExpertWeek | null
ValueContext.expert: { scoring: 'PPR' | 'HALF' | 'STD'; ecrUpdatedAt: string | null; marketUpdatedAt: string | null }
```

### 4.2 Where it's computed

- `value/expert.ts` (pure): given the build's rows and the loaded `expert_ranks` (week 0) and `market_values` rows for the season, attach `expert` and `market` and compute `ecrDelta`. Called from `value/build.ts` after ranks are assigned. Loaded once per build, alongside series.
- `players.week` joins the `expert_ranks` row for its `(season, week)` in the existing week query and fills `PlayerWeekRow.expert`.
- No new IPC channels for rankings.
- Ranking basis: ECR `pos_rank` and our `rosRank` are both ordinal within position, so `ecrDelta` needs no team-count adjustment. FLEX is folded into our replacement level but not into ECR — stated in the help text like the existing FLEX note.

### 4.3 Table

- New `Column.kind = 'expert'` with an `ExpertField` key; `cellValue` / `cellText` / header tooltips handle it like `value` and `signal` columns, so sorting works unchanged (nulls last).
- **Value mode** — an **Experts** group after Signals (before Mine when shown): `ECR` (ROS position rank), `Δ ECR` (signed), `Spread`, `Mkt` (FantasyCalc value), `Trend` (30-day, signed).
  - `Δ ECR` tone: **green** when `> +3` (the market ranks them lower than we do — a buy cue), **amber** when `< −3` (a sell-high cue), muted otherwise.
- **Projection mode** — an **Experts** group after Fantasy: `ECR` (weekly position rank) and `Grade`. Stats mode is unchanged.
- `ValueHelp.tsx` gains an Experts paragraph: sources, scoring format from `context.expert.scoring`, what `Δ ECR` means, freshness from `ecrUpdatedAt` / `marketUpdatedAt`, the FLEX note, and that past seasons have no expert data.
- `docs/reference/value-and-signals.md` gains an Experts section listing every new field.

## 5. Player news (Plan I)

### 5.1 Client and mapper

`sources/sleeperNews.ts` — `getPlayerNews(playerId, limit)` POSTs the GraphQL query with the User-Agent the Sleeper client already sends, 8 s timeout. A pure mapper produces:

```ts
export interface NewsItem {
  id: string                    // `${source}:${source_key}`
  source: string                // 'fantasy_pros' | 'rotowire' | 'rotoballer' | other
  publishedAt: string           // ISO, from the millisecond timestamp
  title: string
  description: string | null
  analysis: string | null
  url: string | null
}
export interface PlayerNews { items: NewsItem[]; fetchedAt: string }
```

A response without `data.get_player_news` as an array is a fetch error.

### 5.2 IPC and cache

- One new channel `players.news(playerId)` → `PlayerNews`, limit 25 (covers a season for any one player).
- Main keeps an in-memory cache keyed by player id, 15-minute TTL. Failures are not cached. A `force` flag bypasses the cache (the panel's retry link).
- No table: news is transient and always refetchable; offline the panel shows the failure state.
- Not part of the sync pipeline: nothing in the status bar or `sync_log`.

### 5.3 Detail panel

`PlayerDetailPanel` gains a **News** `Section` under the game log, requested when the panel opens, in parallel with `players.detail` so the numbers never wait on the news.

- Item: source badge (`FP` / `RW` / `RB`, else the raw source), relative time ("2h", "3d", then a date), **title** (a link, opens in the system browser through the existing window-open handler), `description` under it, `analysis` collapsed behind an "Analysis" toggle — open by default on the newest item only.
- Newest first; 8 shown, "Show more" reveals the rest.
- States: loading skeleton; "Couldn't load news" with a retry link; "No news" for an empty list. The section is not rendered for DEF rows.
- All strings render as text, never HTML.

## 6. Error handling

Sync side — every failure ends in a `sync_log` row, never a thrown refresh:

- Endpoint gated or removed → `error` on that step; stored rows keep showing and the help panel shows their age from `ecrUpdatedAt` / `marketUpdatedAt`.
- Current week not yet published → `skipped: not published yet`; weekly Experts cells stay empty until the next refresh.
- Off-season → one skipped step.
- Crosswalk re-download failing after migration 005 → `expert_ranks` stays empty and the FP step message reads `"0 matched, N unmatched"`; no half-joined state.

Read side — `ecrDelta` null when either rank is missing; `market` null outside FantasyCalc's list; both render as empty cells, sorted last.

News side — shape drift or network failure → error state with retry; the cache never stores a failure.

Request budget per refresh in steady state: 4 (current week) + 1 (ROS) + 1 (FantasyCalc) ≈ 6 requests, ~1 MB; the one-time backfill adds 4 per past week of the season. News: one POST per player per panel open per 15 minutes.

## 7. Testing

- **Fixtures** (small, trimmed from real payloads captured 2026-09-18): FP weekly RB with a string-typed `rank_ave`, FP weekly DST with a `JAC` row, an FP ROS `ALL` slice covering all six positions, a FantasyCalc slice, one GraphQL news response.
- **Pure units**: the three mappers (coercion, `pos_rank` parsing, ms → ISO, DST alias, unmatched counting); scoring-format derivation from rules; `numQbs` from roster slots; `value/expert.ts` attach and the `ecrDelta` sign convention.
- **Sync steps** with a fake fetch: freshness buckets per week; `count: 0` → skipped; 404 stops the loop; scoring change bypasses freshness; unmatched message; `invalidateCaches` only when rows were written.
- **Repos**: replace semantics on an in-memory `node:sqlite` DB; migration 005 applies on top of 004 and clears the crosswalk step's freshness.
- **Renderer view functions**: `columnGroups` shows Experts in value and proj modes only; `cellValue` / `cellText` for the `expert` kind; Δ tone thresholds; news view model (relative time, badge label).
- **Component**: `PlayerDetailPanel` news states (loading / error+retry / empty / list / hidden for DEF) with a mocked `api`.
- **Manual**: dev-app check against the live endpoints (Value mode, Projection mode, one detail panel), then the Windows installer check per version.

## 8. Structure

```
src/main/sources/fantasypros.ts        FP client + payload types
src/main/sources/fantasycalc.ts        FC client + payload types
src/main/sources/sleeperNews.ts        GraphQL news client
src/main/sync/expertSync.ts            steps: weekly, ros, fantasycalc; join + scoring format
src/main/db/migrations/005_experts.sql expert_ranks, market_values, crosswalk.fantasypros_id
src/main/db/repos/expertRanks.ts       replace/read per (season, week)
src/main/db/repos/marketValues.ts      replace/read per season
src/main/value/expert.ts               pure attach of expert/market blocks + ecrDelta
src/main/ipc/handlers.ts               players.news + cache
src/shared/types.ts                    ExpertRos, MarketValue, ExpertWeek, NewsItem, PlayerNews
src/shared/teams.ts                    FP_TO_SLEEPER_TEAM
src/renderer/src/lib/playersTableView.ts   Column.kind 'expert', Experts groups
src/renderer/src/lib/newsView.ts       relative time, badge label
src/renderer/src/components/ValueHelp.tsx  Experts paragraph
src/renderer/src/components/PlayerDetailPanel.tsx  News section
docs/reference/value-and-signals.md    Experts section
```

## 9. Phasing

- **Plan H — expert rankings** (§3, §4, sync/read parts of §6): clients → migration + crosswalk column → repos → sync steps → value/week attach → table columns + help → data reference. Tag `v0.8.0`.
- **Plan I — player news** (§5, news parts of §6): client + mapper → IPC + cache → panel section + states. Tag `v0.9.0`.

Slice 5 is complete at `v0.9.0`.
