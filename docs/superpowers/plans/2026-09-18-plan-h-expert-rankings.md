# Plan H — Expert rankings (slice 5, phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put outside opinion next to our numbers: FantasyPros expert-consensus ranks (this week and rest of season) and FantasyCalc trade-market values, synced by keyless JSON endpoints, stored per season, joined to Sleeper ids, and shown as an _Experts_ column group in Value mode (`ECR`, `Δ ECR`, `SPREAD`, `MKT`, `TREND`) and Projection mode (`ECR`, `GRADE`) — the headline being `Δ ECR = ecrPosRank − rosRank`, the gap between our rank and theirs.

**Architecture:** Two thin source clients (`sources/fantasypros.ts`, `sources/fantasycalc.ts`: injected `fetch`, typed payloads, number coercion, `null` on 404/410) feed one new sync module `sync/expertSync.ts` that runs after nflverse inside `refreshAll` / `importAll` — one `runStep` per unit (`fantasypros:weekly:{season}:{week}`, `fantasypros:ros:{season}`, `fantasycalc:{season}`) so every unit lands in `sync_log` and the status bar. Migration 005 adds the two tables and a `fantasypros_id` column to the crosswalk; FP rows join to Sleeper ids through that column, then the existing name + position rule, DST rows through a team-code alias map. The read side is pure: `value/expert.ts` attaches `expert` / `market` blocks and `ecrDelta` to the value rows from rows loaded once per build; `players.week` joins the week's rows. No new IPC channels. The renderer gains a `Column.kind = 'expert'` and the two groups, an amber "warn" tone, and an _Experts_ paragraph in the help panel.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4, shadcn primitives, `node:sqlite`, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-18-slice5-expert-layer-design.md` (§1 goal + constraint, §2 sources, §3 sync/storage, §4 read model + table, §6 sync/read error handling, §7 testing, §8 structure, §9 phasing row H). **Research:** `docs/research/2026-09-18-expert-layer-sources.md` §1 (FantasyPros payload) and §2 (FantasyCalc payload). **Builds on:** `v0.7.0` — `src/main/sync/{step,refresh,sleeperSync,nflverseSync,identity}.ts` (`runStep`, `SkipStep`, `isFresh`, `nowOf`, `normalizeName`), `src/main/sources/{sleeper,nflverse}.ts` (client style), `src/main/db/repos/{projections,playerIds,playersWeek}.ts` (`replaceProjections` replace semantics, `listCrosswalk`, `listPlayerIdentitySources`, `playersWeek`), `src/main/value/build.ts` (`assembleValue`, `buildValueSeason`), `src/renderer/src/lib/playersTableView.ts` (`Column`, `columnGroups`, `cellValue`, `cellText`, `sortValue`, `signalTone`), `PlayersScreen.tsx` cell rendering, `ValueHelp.tsx`, `tests/fixtures/{db,season,sleeper,nflverse}.ts` (`seedLeague`: league `L1`, 2 teams, players 4866 Barkley RB / 6794 Jefferson WR / 8259 Cook RB / 7564 Chase WR / 9509 Bijan RB / `LAR` DEF / 1234 "Retired Guy" QB with no team; `crosswalkCsv`: Barkley `fantasypros_id` 17240, Jefferson 19236, Cook and Chase without Sleeper or FP ids, Bijan with a Sleeper id only).

## Global Constraints

- Same as Plans C–G: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use`), `node:sqlite` only, no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`; repositories never open transactions (callers wrap in `withTransaction`).
- **Free and keyless** (spec §1): every source is a public JSON endpoint with no key, sign-up, OAuth or HTML scraping; each is isolated behind its own sync step so its removal degrades one feature, not the app.
- **Sync never throws** (spec §6): every failure ends in a `sync_log` row (`error`, or `skipped` via `SkipStep`); stored rows keep showing.
- **Regular season only**, current season only: `nfl_state.season_type !== 'regular'` → one skipped step; past seasons get no expert rows (their Experts cells are empty).
- **Request budget** per steady-state refresh ≈ 6 (4 current-week FP calls + 1 ROS + 1 FantasyCalc); the one-time backfill adds 4 per past week. A retired endpoint costs 1 request (weekly loop stops at the first 404/410, ROS then skips without a request).
- **No new IPC channels**; `players.value` / `players.week` / `players.detail` payloads grow. `valueCache` / `weekCache` invalidation is untouched: `syncDeps().onStep` already clears both on every `ok` step, which covers the new steps by construction.
- **Scoring format** (spec §3.2): FantasyPros `scoring` = `PPR` when the rules' base `rec` points ≥ 1, `HALF` when 0 < rec < 1, else `STD`; FantasyCalc gets `ppr` = the same `rec` value, `numTeams` = the league's team count, `numQbs = 2` when the roster has a `SUPER_FLEX` slot else `1`.
- **Freshness**: FP past weeks 30 d, FP current week 3 h, FP ROS 12 h, FantasyCalc 12 h; a stored FP `scoring` that differs from the current format bypasses freshness (FantasyCalc values are format-agnostic and keep plain freshness).
- Every number is computed in the main process; the renderer formats, tones and sorts. `Δ ECR` needs no team-count adjustment (both ranks are ordinal within position).
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits, summary ≤ 50 chars, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Branch `feat/expert-rankings` from `main`.
- Existing `tests/**` are typechecked: when a shared type gains a required field, update the fixture literals named in the task (Task 1 lists every one).
- Spec deviations locked in here:
  - **`spread: number | null`** on `ExpertRos` / `ExpertWeek` (spec: `number`) — FantasyPros omits `rank_std` on some rows; the DB column is nullable and the UI renders `—`.
  - **`scoringFormat(rules)` lives in `src/shared/rules.ts`** (spec §8 puts "scoring format" in `expertSync.ts`): the sync and the value build both need it, and it is a rules-domain fact. The `ScoringFormat` type and a named `ExpertContext` interface live in `src/shared/types.ts`.
  - **Weekly loop also stops on an `error` step** (spec only names 404/410): a gated endpoint (403) would otherwise cost one request per week per refresh. After an error the ROS step still tries once (a transient failure on one week must not hide ROS); after a 404/410 it skips without a request.
  - **Current week for the weekly loop** = `max(nfl_state.week, nfl_state.display_week)` clamped 1–18, so both Sleeper counters are covered around the Tuesday rollover; an unpublished week costs one request (FLX is called first; its `count: 0` short-circuits the other three) and logs `skipped: not published yet`.
  - **FantasyCalc rows without a `sleeperId` are dropped** and the step message reads `"{n} without a Sleeper id"` (spec gives no FC message); `numTeams` comes from `leagues.total_rosters`.
  - **Malformed FP rows** (no numeric `rank_ecr` or no parsable `pos_rank`) are dropped by the mapper and counted as `skipped`, separately from "unmatched".
  - **Tone**: a third cell tone `'warn'` (Tailwind `text-amber-400`) for `Δ ECR < −3`; `TREND` follows the generic sign colouring (green ≥ 0 / red < 0) like every other signed column; `GRADE` sorts by an ordinal (`F` … `A+`) and renders the letter.
  - The Experts group in Value mode sits **after Signals and before Mine** (spec §4.3), so `columnGroups('…', 'value', true)` now returns five groups.

---

## File map

| File                                                             | Responsibility                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts` (modify)                                   | `ScoringFormat`, `ExpertRos`, `MarketValue`, `ExpertWeek`, `ExpertContext`; `PlayerWeekRow.expert`, `PlayerValueRow.expert` / `.market`, `ValueContext.expert` |
| `src/shared/rules.ts` (modify)                                   | `scoringFormat(rules)`                                                                                                                                         |
| `src/shared/teams.ts` (modify)                                   | `FP_TO_SLEEPER_TEAM`, `toSleeperDefId`                                                                                                                         |
| `src/main/db/migrations/005_experts.sql` (create) + `index.ts`   | `expert_ranks`, `market_values`, `crosswalk.fantasypros_id`, forget the crosswalk step's freshness                                                             |
| `src/main/sources/nflverse-types.ts`, `nflverse.ts` (modify)     | `CrosswalkRecord.fantasyprosId` + CSV column                                                                                                                   |
| `src/main/db/repos/playerIds.ts` (modify)                        | store / list `fantasypros_id`                                                                                                                                  |
| `src/main/sources/fantasypros.ts` (create)                       | payload types, `num`, `parsePosRank`, `mapFpRankings`, `FantasyProsClient`, `createFantasyProsClient`                                                          |
| `src/main/sources/fantasycalc.ts` (create)                       | payload types, `mapFcValues`, `FantasyCalcClient`, `createFantasyCalcClient`                                                                                   |
| `src/main/db/repos/expertRanks.ts` (create)                      | `ROS_WEEK`, `ExpertRankRecord` / `ExpertRankRow`, `replaceExpertRanks`, `listExpertRanks`, `storedScoring`                                                     |
| `src/main/db/repos/marketValues.ts` (create)                     | `MarketValueRecord` / `MarketValueRow`, `replaceMarketValues`, `listMarketValues`                                                                              |
| `src/main/sync/expertSync.ts` (create)                           | sources + freshness constants, `numQbsFor`, `buildFpJoinIndex`, `joinFantasyPros`, `refreshExperts`                                                            |
| `src/main/sync/refresh.ts` (modify)                              | `AppSyncDeps`; experts after nflverse in `refreshAll` / `importAll`                                                                                            |
| `src/main/ipc/handlers.ts`, `src/main/index.ts` (modify)         | `AppContext.fantasypros` / `.fantasycalc`; `syncDeps` returns `AppSyncDeps`; clients created at startup                                                        |
| `src/main/value/expert.ts` (create)                              | pure: `ExpertBundle`, `NO_EXPERTS`, `indexExperts`, `ecrDelta`, `expertRos`, `marketValue`, `expertWeek`                                                       |
| `src/main/value/build.ts` (modify)                               | `assembleValue(bundle, experts)`; `buildValueSeason` loads ROS ranks + market values; `context.expert`                                                         |
| `src/main/db/repos/playersWeek.ts` (modify)                      | join the week's `expert_ranks` → `PlayerWeekRow.expert`                                                                                                        |
| `src/renderer/src/lib/playersTableView.ts` (modify)              | `'expert'` kind, `ExpertField`, `EXPERTS_VALUE` / `EXPERTS_WEEK` groups, `expertValue` / `expertText` / `expertTone`, `GRADE_ORDER`, `ECR_DELTA_TONE`, sorting |
| `src/renderer/src/screens/PlayersScreen.tsx` (modify)            | expert cells (text + `warn` tone)                                                                                                                              |
| `src/renderer/src/components/ValueHelp.tsx` (modify)             | _Experts_ section (column descriptions, sources, scoring, Δ ECR reading, freshness)                                                                            |
| `docs/reference/value-and-signals.md` (modify)                   | `ValueContext.expert`, Experts fields on both row types, table rows, constants, module map                                                                     |
| `tests/fixtures/fantasypros.ts`, `fantasycalc.ts` (create)       | trimmed payloads (spec §7)                                                                                                                                     |
| `tests/shared/rules.test.ts`, `teams.test.ts` (create)           | `scoringFormat`, `toSleeperDefId`                                                                                                                              |
| `tests/main/sources/fantasypros.test.ts`, `fantasycalc.test.ts`  | mappers + clients with a fake fetch                                                                                                                            |
| `tests/main/db/expertRepos.test.ts` (create)                     | replace semantics, `storedScoring`, ordering                                                                                                                   |
| `tests/main/db/migrate.test.ts`, `playerIdsRepo`, `nflverse`     | version 5, tables, crosswalk column + freshness reset                                                                                                          |
| `tests/main/sync/expertSync.test.ts`, `refresh.test.ts` (create) | steps with fake clients (spec §7), pipeline order                                                                                                              |
| `tests/main/value/expert.test.ts` (create) + `build.test.ts`     | pure attach + `ecrDelta`; build integration                                                                                                                    |
| `tests/main/db/playersWeek.test.ts` (modify)                     | `PlayerWeekRow.expert`                                                                                                                                         |
| `tests/renderer/lib/playersTableView.test.ts` (modify)           | fixture literals; Experts groups, cells, tones, sort                                                                                                           |

---

### Task 1: Shared types, `scoringFormat`, and null stubs

Types first so every later task compiles against them; the build and week query fill `expert: null` / `market: null` until Task 6, so the app typechecks and behaves exactly as `v0.7.0`. `context.expert.scoring` is real from here (it only needs the rules).

**Files:**

- Modify: `src/shared/types.ts` (`PlayerWeekRow` ~line 95–110, `PlayerValueRow` ~181–201, `ValueContext` ~203–216; new types before `PlayerValueRow`)
- Modify: `src/shared/rules.ts` (append after `roundPoints`)
- Modify: `src/main/value/build.ts` (imports; the row literal in `assembleValue`; the `context` literal)
- Modify: `src/main/db/repos/playersWeek.ts` (the row literal at the end of `playersWeek`)
- Modify: `tests/renderer/lib/playersTableView.test.ts` (`row` literal ~line 24, `valueRow` ~49, the three `ValueContext` literals ~453, ~475, ~503)
- Modify: `tests/main/value/build.test.ts` (`reports the context…` test)
- Create: `tests/shared/rules.test.ts`

**Interfaces:**

- Produces: `ScoringFormat`, `ExpertRos`, `MarketValue`, `ExpertWeek`, `ExpertContext` (shared); `PlayerWeekRow.expert: ExpertWeek | null`; `PlayerValueRow.expert: ExpertRos | null`, `.market: MarketValue | null`; `ValueContext.expert: ExpertContext`; `scoringFormat(rules: Rules | null): ScoringFormat`.

- [x] **Step 1: Write the failing test for `scoringFormat`**

`tests/shared/rules.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { scoringFormat } from '@shared/rules'
import { rules } from '../fixtures/rules'

describe('scoringFormat', () => {
  const withRec = (rec: number) => rules({ scoring: { ...rules().scoring, rec } })

  it('is PPR at 1 point per reception or more, HALF between 0 and 1, STD at 0', () => {
    expect(scoringFormat(withRec(1))).toBe('PPR')
    expect(scoringFormat(withRec(1.5))).toBe('PPR')
    expect(scoringFormat(withRec(0.5))).toBe('HALF')
    expect(scoringFormat(withRec(0.25))).toBe('HALF')
    expect(scoringFormat(withRec(0))).toBe('STD')
  })

  it('is STD without rules or without a rec entry', () => {
    expect(scoringFormat(null)).toBe('STD')
    const { rec: _rec, ...rest } = rules().scoring
    expect(scoringFormat(rules({ scoring: rest }))).toBe('STD')
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/shared/rules.test.ts`
Expected: FAIL — `scoringFormat` is not exported from `@shared/rules`.

- [x] **Step 3: Add the shared types**

In `src/shared/types.ts`, insert before `/** One player's season value (spec §2); …` (`PlayerValueRow`):

```ts
/** FantasyPros scoring bucket, derived from the league's base `rec` points (slice 5 spec §3.2). */
export type ScoringFormat = 'PPR' | 'HALF' | 'STD'

/** Experts' rest-of-season consensus (FantasyPros ECR); null when they have no ROS row for the player. */
export interface ExpertRos {
  /** Overall consensus rank across positions. */
  ecrRank: number
  /** Consensus rank within the player's position. */
  ecrPosRank: number
  /** Standard deviation of the experts' ranks — how much they disagree; null when FantasyPros omits it. */
  spread: number | null
  experts: number
  /** ecrPosRank − rosRank: positive = we rank the player higher than the experts. Null when either rank is missing. */
  ecrDelta: number | null
}

/** FantasyCalc trade-market consensus; null outside its top list (~130 players). */
export interface MarketValue {
  value: number
  posRank: number
  tier: number | null
  trend30d: number
}

/** This week's start/sit consensus; null when the week isn't published or the player is unranked. */
export interface ExpertWeek {
  ecrPosRank: number
  /** FantasyPros start/sit grade ("A+" … "F"). */
  grade: string | null
  /** FantasyPros' own projected points under the synced scoring format. */
  projPts: number | null
  spread: number | null
}

/** Provenance of the expert blocks: which scoring bucket was synced and how old the stored rows are. */
export interface ExpertContext {
  scoring: ScoringFormat
  /** `updated_at` of the stored ROS rankings; null when none are stored for the season. */
  ecrUpdatedAt: string | null
  /** `updated_at` of the stored market values; null when none are stored for the season. */
  marketUpdatedAt: string | null
}
```

In `PlayerWeekRow`, after `targetShare: number | null`:

```ts
/** FantasyPros start/sit consensus for this week; null when unpublished or unranked. */
expert: ExpertWeek | null
```

In `PlayerValueRow`, after `droppable: Droppable | null`:

```ts
/** FantasyPros rest-of-season consensus; null when the experts have no row for the player. */
expert: ExpertRos | null
/** FantasyCalc trade-market value; null outside its list. */
market: MarketValue | null
```

In `ValueContext`, after `replacement: …`:

```ts
expert: ExpertContext
```

- [x] **Step 4: Add `scoringFormat` to `src/shared/rules.ts`**

At the top of the file add `import type { ScoringFormat } from './types'`, and append:

```ts
/** Slice 5 spec §3.2: the base `rec` points decide the FantasyPros bucket — ≥ 1 PPR, between 0 and 1 HALF, else STD. */
export function scoringFormat(rules: Rules | null): ScoringFormat {
  const rec = rules?.scoring.rec ?? 0
  return rec >= 1 ? 'PPR' : rec > 0 ? 'HALF' : 'STD'
}
```

- [x] **Step 5: Stub the new fields in the build and the week query**

`src/main/value/build.ts`: change the `@shared/rules` import to `import { LINEUP_POSITIONS, scoringFormat } from '@shared/rules'`. In the `rows` map literal, after `droppable: …`:

```ts
      expert: null,
      market: null,
```

In the returned `context` literal, after `replacement`:

```ts
      expert: { scoring: scoringFormat(bundle.rules), ecrUpdatedAt: null, marketUpdatedAt: null }
```

`src/main/db/repos/playersWeek.ts`: in the row literal returned by `playersWeek`, after `targetShare,`:

```ts
      expert: null,
```

- [x] **Step 6: Update the typed fixture literals**

`tests/renderer/lib/playersTableView.test.ts`:

- `row` (`PlayerWeekRow`): after `targetShare: null,` add `expert: null,`.
- `valueRow` (`PlayerValueRow`): after `droppable: null,` add `expert: null,` and `market: null,`.
- The three `ValueContext` literals (`describes replacement levels…`, `titles value headers…`, `describe('mine group')`): after `replacement: …` add `expert: { scoring: 'PPR', ecrUpdatedAt: null, marketUpdatedAt: null }`.

`tests/main/value/build.test.ts`, test `reports the context and replacement levels per position`: extend the first `toMatchObject` with

```ts
      teamCount: 2,
      expert: { scoring: 'PPR', ecrUpdatedAt: null, marketUpdatedAt: null }
```

- [x] **Step 7: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green; `tests/shared/rules.test.ts` 2 passed; total 256 → 258.

- [x] **Step 8: Commit**

```bash
git add src/shared/types.ts src/shared/rules.ts src/main/value/build.ts src/main/db/repos/playersWeek.ts tests/shared/rules.test.ts tests/renderer/lib/playersTableView.test.ts tests/main/value/build.test.ts
git commit -m "feat(types): expert and market row fields, scoring format"
```

---

### Task 2: Migration 005, crosswalk `fantasypros_id`, DST team alias

**Files:**

- Create: `src/main/db/migrations/005_experts.sql`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/main/sources/nflverse-types.ts:60-69` (`CrosswalkRecord`), `src/main/sources/nflverse.ts:162-173` (`parseCrosswalk`)
- Modify: `src/main/db/repos/playerIds.ts:36-44` (`CrosswalkRow`), `72-108` (`replaceCrosswalk`, `listCrosswalk`)
- Modify: `src/shared/teams.ts` (append)
- Modify: `tests/main/db/migrate.test.ts`, `tests/main/sources/nflverse.test.ts:120-140`
- Create: `tests/shared/teams.test.ts`

**Interfaces:**

- Produces: tables `expert_ranks(season, week, player_id, scoring, rank_ecr, pos_rank, rank_ave, rank_std, rank_min, rank_max, experts, grade, proj_pts, updated_at)` and `market_values(season, player_id, value, overall_rank, pos_rank, tier, trend_30d, updated_at)`; `crosswalk.fantasypros_id`; `CrosswalkRecord.fantasyprosId: string | null`; `FP_TO_SLEEPER_TEAM`, `toSleeperDefId(fpTeam: string): string`.

- [x] **Step 1: Write the failing tests**

`tests/main/db/migrate.test.ts`: in `creates all slice-1 tables…` change `expect(version).toBe(4)` to `toBe(5)` and add `'expert_ranks'`, `'market_values'` to the `arrayContaining` list; in `is idempotent` change `expect(row.n).toBe(4)` to `toBe(5)`. Add:

```ts
it('005 adds crosswalk.fantasypros_id and forgets the crosswalk step so it is re-downloaded', () => {
  const db = openDatabase(':memory:')
  // apply 001–004 by hand, then a crosswalk step that would otherwise still be fresh
  db.exec(
    `CREATE TABLE schema_version (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)`
  )
  for (const m of migrations.slice(0, 4)) {
    db.exec(m.sql)
    db.prepare('INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)').run(
      m.version,
      m.name,
      'x'
    )
  }
  db.prepare(
    `INSERT INTO sync_log (source, started_at, finished_at, status, message, rows_written)
       VALUES ('nflverse:crosswalk', 't', 't', 'ok', NULL, 10), ('nflverse:games', 't', 't', 'ok', NULL, 1)`
  ).run()

  expect(migrate(db)).toBe(5)
  const columns = (db.prepare('PRAGMA table_info(crosswalk)').all() as { name: string }[]).map(
    (c) => c.name
  )
  expect(columns).toContain('fantasypros_id')
  const sources = (
    db.prepare('SELECT source FROM sync_log ORDER BY source').all() as {
      source: string
    }[]
  ).map((r) => r.source)
  expect(sources).toEqual(['nflverse:games'])
})
```

Add `import { migrations } from '@main/db/migrations'` to the file's imports.

`tests/main/sources/nflverse.test.ts`, `parseCrosswalk` test: in the `records[0]` `toEqual` add `fantasyprosId: '17240',` after `sleeperId: '4866',`; after `expect(records[2].sleeperId).toBeNull()` add `expect(records[2].fantasyprosId).toBeNull()` and `expect(records[1].fantasyprosId).toBe('19236')`.

`tests/shared/teams.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FP_TO_SLEEPER_TEAM, toSleeperDefId } from '@shared/teams'

describe('toSleeperDefId', () => {
  it('maps FantasyPros team codes to Sleeper DEF ids, JAC → JAX, others unchanged', () => {
    expect(toSleeperDefId('JAC')).toBe('JAX')
    expect(toSleeperDefId('PHI')).toBe('PHI')
    expect(toSleeperDefId('LAR')).toBe('LAR')
    expect(FP_TO_SLEEPER_TEAM).toEqual({ JAC: 'JAX' })
  })
})
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/db/migrate.test.ts tests/main/sources/nflverse.test.ts tests/shared/teams.test.ts`
Expected: FAIL — version 4, no `fantasyprosId`, `toSleeperDefId` missing.

- [x] **Step 3: Write the migration**

`src/main/db/migrations/005_experts.sql`:

```sql
-- FantasyPros consensus rankings (slice 5 spec §3.4): week 0 = rest of season, 1–18 = weekly start/sit.
CREATE TABLE expert_ranks (
  season INTEGER NOT NULL,
  week INTEGER NOT NULL,
  player_id TEXT NOT NULL,        -- Sleeper id (team code for DEF)
  scoring TEXT NOT NULL CHECK (scoring IN ('PPR', 'HALF', 'STD')),
  rank_ecr INTEGER NOT NULL,      -- overall consensus rank
  pos_rank INTEGER NOT NULL,      -- numeric part of "RB12"
  rank_ave REAL,
  rank_std REAL,
  rank_min INTEGER,
  rank_max INTEGER,
  experts INTEGER NOT NULL,
  grade TEXT,                     -- weekly start_sit_grade, null for ROS
  proj_pts REAL,                  -- weekly r2p_pts, null for ROS
  updated_at TEXT NOT NULL,
  PRIMARY KEY (season, week, player_id)
);

-- FantasyCalc redraft trade values (format-agnostic market consensus, top ~130 players).
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

-- FantasyPros rows join to Sleeper ids through this column. Forget the crosswalk step's freshness
-- (source = SOURCE_CROSSWALK in sync/nflverseSync.ts) so the next refresh re-downloads the file with it.
ALTER TABLE crosswalk ADD COLUMN fantasypros_id TEXT;
CREATE INDEX idx_crosswalk_fantasypros ON crosswalk(fantasypros_id);
DELETE FROM sync_log WHERE source = 'nflverse:crosswalk';
```

`src/main/db/migrations/index.ts`: add `import expertsSql from './005_experts.sql?raw'` and `{ version: 5, name: 'experts', sql: expertsSql }` at the end of `migrations`.

- [x] **Step 4: Carry the column through the crosswalk record, parser and repo**

`src/main/sources/nflverse-types.ts`, `CrosswalkRecord`: add `fantasyprosId: string | null` after `sleeperId`.

`src/main/sources/nflverse.ts`, `parseCrosswalk`: add `fantasyprosId: strOrNull(row.fantasypros_id),` after `sleeperId: …`.

`src/main/db/repos/playerIds.ts`:

- `CrosswalkRow`: add `fantasypros_id: string | null` after `sleeper_id`.
- `replaceCrosswalk`: the INSERT becomes
  ```ts
  const insert = db.prepare(
    `INSERT INTO crosswalk (sleeper_id, fantasypros_id, gsis_id, pfr_id, sportradar_id, espn_id, name, position, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  ```
  and the `insert.run(...)` passes `r.fantasyprosId` right after `r.sleeperId`.
- `listCrosswalk`: select `sleeper_id, fantasypros_id, gsis_id, pfr_id, sportradar_id, espn_id, name, position` and map `fantasyprosId: r.fantasypros_id` after `sleeperId`.

- [x] **Step 5: Add the alias map to `src/shared/teams.ts`**

Append:

```ts
/** Where FantasyPros spells a team differently from Sleeper (DST rows join by team code). Extend if a DST row goes unmatched. */
export const FP_TO_SLEEPER_TEAM: Record<string, string> = { JAC: 'JAX' }

/** Sleeper's DEF player id for a FantasyPros team code. */
export function toSleeperDefId(fpTeam: string): string {
  return FP_TO_SLEEPER_TEAM[fpTeam] ?? fpTeam
}
```

- [x] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green. `tests/main/db/playerIdsRepo.test.ts` (`replaceCrosswalk round-trips`) passes unchanged because both sides now carry `fantasyprosId`; `identity.test.ts` unchanged. 258 → 260 tests.

- [x] **Step 7: Commit**

```bash
git add src/main/db/migrations/005_experts.sql src/main/db/migrations/index.ts src/main/sources/nflverse-types.ts src/main/sources/nflverse.ts src/main/db/repos/playerIds.ts src/shared/teams.ts tests/main/db/migrate.test.ts tests/main/sources/nflverse.test.ts tests/shared/teams.test.ts
git commit -m "feat(db): expert tables and crosswalk fantasypros_id"
```

---

### Task 3: Source clients — FantasyPros and FantasyCalc

Thin clients in the style of `sources/sleeper.ts`: injected `fetch`, one retry on 429/5xx, `null` on 404/410, typed payloads, and pure mappers exported for tests.

**Files:**

- Create: `src/main/sources/fantasypros.ts`, `src/main/sources/fantasycalc.ts`
- Create: `tests/fixtures/fantasypros.ts`, `tests/fixtures/fantasycalc.ts`
- Create: `tests/main/sources/fantasypros.test.ts`, `tests/main/sources/fantasycalc.test.ts`

**Interfaces:**

- Consumes: `ScoringFormat` (Task 1).
- Produces: `FpPosition`, `FpQuery`, `FpPlayer`, `FpRankings`, `FpRawPlayer`, `FpRawResponse`, `num`, `parsePosRank`, `mapFpRankings`, `FantasyProsClient.getRankings(query): Promise<FpRankings | null>`, `createFantasyProsClient(options)`; `FcQuery`, `FcRecord`, `FcRawRecord`, `mapFcValues`, `FantasyCalcClient.getValues(query): Promise<FcRecord[] | null>`, `createFantasyCalcClient(options)`.

- [x] **Step 1: Write the fixtures**

`tests/fixtures/fantasypros.ts` (trimmed from the 2026 week-2 PPR captures; ids 17240 / 19236 are the crosswalk fixture's `fantasypros_id`s, 3000x are not in it):

```ts
import type { FpRawResponse } from '@main/sources/fantasypros'

/** Weekly FLX page; `rank_*` come as strings in this capture. */
export const weeklyFlx: FpRawResponse = {
  count: 3,
  total_experts: 153,
  players: [
    {
      player_id: 17240,
      player_name: 'Saquon Barkley',
      player_team_id: 'PHI',
      player_position_id: 'RB',
      rank_ecr: 1,
      rank_min: '1',
      rank_max: '3',
      rank_ave: '1.4',
      rank_std: '0.6',
      pos_rank: 'RB1',
      start_sit_grade: 'A+',
      r2p_pts: '22.4'
    },
    {
      player_id: 19236,
      player_name: 'Justin Jefferson',
      player_team_id: 'MIN',
      player_position_id: 'WR',
      rank_ecr: 2,
      rank_min: 1,
      rank_max: 5,
      rank_ave: 2.1,
      rank_std: 1.2,
      pos_rank: 'WR1',
      start_sit_grade: 'A',
      r2p_pts: 19.8
    },
    {
      player_id: 30001,
      player_name: 'James Cook',
      player_team_id: 'BUF',
      player_position_id: 'RB',
      rank_ecr: 9,
      rank_ave: '8.7',
      rank_std: '2.3',
      pos_rank: 'RB5',
      start_sit_grade: 'B+',
      r2p_pts: 15.1
    }
  ]
}

export const weeklyQb: FpRawResponse = {
  count: 1,
  total_experts: 120,
  players: [
    {
      player_id: 30005,
      player_name: 'Retired Guy',
      player_team_id: null,
      player_position_id: 'QB',
      rank_ecr: 4,
      rank_ave: 4.2,
      rank_std: 1.1,
      pos_rank: 'QB4',
      start_sit_grade: 'B',
      r2p_pts: 18
    }
  ]
}

export const weeklyK: FpRawResponse = {
  count: 1,
  total_experts: 40,
  players: [
    {
      player_id: 30004,
      player_name: 'Jake Elliott',
      player_team_id: 'PHI',
      player_position_id: 'K',
      rank_ecr: 1,
      rank_ave: 1.5,
      rank_std: 0.8,
      pos_rank: 'K1',
      start_sit_grade: 'A',
      r2p_pts: 9
    }
  ]
}

/** DST rows carry team-level ids; FantasyPros spells Jacksonville `JAC`, Sleeper `JAX`. */
export const weeklyDst: FpRawResponse = {
  count: 2,
  total_experts: 60,
  players: [
    {
      player_id: 8250,
      player_name: 'Los Angeles Rams',
      player_team_id: 'LAR',
      player_position_id: 'DST',
      rank_ecr: 3,
      rank_ave: 3.4,
      rank_std: 1.9,
      pos_rank: 'DST3',
      start_sit_grade: 'A-',
      r2p_pts: 8.5
    },
    {
      player_id: 8240,
      player_name: 'Jacksonville Jaguars',
      player_team_id: 'JAC',
      player_position_id: 'DST',
      rank_ecr: 12,
      rank_ave: '12.5',
      rank_std: '3.1',
      pos_rank: 'DST12',
      start_sit_grade: 'C',
      r2p_pts: 6.2
    }
  ]
}

/** What the current week looks like before FantasyPros publishes it. */
export const unpublished: FpRawResponse = { count: 0, total_experts: 0, players: [] }

/**
 * ROS `position=ALL`: all six positions. Kelce and Elliott have no crosswalk id and no Sleeper
 * player of that name in the fixture (unmatched); "No Rank" has no usable rank (skipped).
 */
export const rosAll: FpRawResponse = {
  count: 9,
  total_experts: 6,
  players: [
    {
      player_id: 17240,
      player_name: 'Saquon Barkley',
      player_team_id: 'PHI',
      player_position_id: 'RB',
      rank_ecr: 1,
      rank_min: 1,
      rank_max: 2,
      rank_ave: 1.2,
      rank_std: 0.5,
      pos_rank: 'RB1'
    },
    {
      player_id: 19236,
      player_name: 'Justin Jefferson',
      player_team_id: 'MIN',
      player_position_id: 'WR',
      rank_ecr: 2,
      rank_ave: 2.5,
      rank_std: 1,
      pos_rank: 'WR1'
    },
    {
      player_id: 30001,
      player_name: 'James Cook',
      player_team_id: 'BUF',
      player_position_id: 'RB',
      rank_ecr: 12,
      rank_ave: '12.8',
      rank_std: '3.2',
      pos_rank: 'RB5'
    },
    {
      player_id: 30003,
      player_name: 'Travis Kelce',
      player_team_id: 'KC',
      player_position_id: 'TE',
      rank_ecr: 20,
      rank_ave: 21,
      rank_std: 4,
      pos_rank: 'TE1'
    },
    {
      player_id: 30005,
      player_name: 'Retired Guy',
      player_team_id: null,
      player_position_id: 'QB',
      rank_ecr: 40,
      rank_ave: 41,
      rank_std: 6,
      pos_rank: 'QB4'
    },
    {
      player_id: 8250,
      player_name: 'Los Angeles Rams',
      player_team_id: 'LAR',
      player_position_id: 'DST',
      rank_ecr: 140,
      rank_ave: 141,
      rank_std: 8,
      pos_rank: 'DST3'
    },
    {
      player_id: 30004,
      player_name: 'Jake Elliott',
      player_team_id: 'PHI',
      player_position_id: 'K',
      rank_ecr: 150,
      rank_ave: 152,
      rank_std: 9,
      pos_rank: 'K1'
    },
    {
      player_id: 8240,
      player_name: 'Jacksonville Jaguars',
      player_team_id: 'JAC',
      player_position_id: 'DST',
      rank_ecr: 160,
      rank_ave: 161,
      pos_rank: 'DST12'
    },
    {
      player_id: 30009,
      player_name: 'No Rank',
      player_team_id: 'NYJ',
      player_position_id: 'WR',
      rank_ecr: 'n/a',
      pos_rank: null
    }
  ]
}
```

`tests/fixtures/fantasycalc.ts`:

```ts
import type { FcRawRecord } from '@main/sources/fantasycalc'

/** Four records of `/values/current?isDynasty=false`; the rookie has no Sleeper id yet. */
export const values: FcRawRecord[] = [
  {
    player: { name: 'Justin Jefferson', sleeperId: '6794', position: 'WR' },
    value: 10512,
    overallRank: 1,
    positionRank: 1,
    trend30Day: 120,
    maybeTier: 1
  },
  {
    player: { name: 'Saquon Barkley', sleeperId: '4866', position: 'RB' },
    value: 9340,
    overallRank: 2,
    positionRank: 1,
    trend30Day: -310,
    maybeTier: 1
  },
  {
    player: { name: 'James Cook', sleeperId: '8259', position: 'RB' },
    value: 6100,
    overallRank: 15,
    positionRank: 6,
    trend30Day: 0,
    maybeTier: null
  },
  {
    player: { name: 'Unknown Rookie', sleeperId: null, position: 'WR' },
    value: 900,
    overallRank: 120,
    positionRank: 50,
    trend30Day: 40,
    maybeTier: 9
  }
]
```

- [x] **Step 2: Write the failing client tests**

`tests/main/sources/fantasypros.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  createFantasyProsClient,
  FantasyProsHttpError,
  mapFpRankings,
  num,
  parsePosRank
} from '@main/sources/fantasypros'
import * as fx from '../../fixtures/fantasypros'

function fakeFetch(responses: Array<{ status: number; body?: unknown }>): typeof fetch {
  const queue = [...responses]
  return vi.fn(async () => {
    const next = queue.shift()
    if (!next) throw new Error('no more fake responses')
    const body = next.body === undefined ? null : JSON.stringify(next.body)
    return new Response(body, {
      status: next.status,
      headers: { 'content-type': 'application/json' }
    })
  }) as unknown as typeof fetch
}

describe('num / parsePosRank', () => {
  it('coerces numbers and numeric strings, null otherwise', () => {
    expect(num(3)).toBe(3)
    expect(num('1.4')).toBe(1.4)
    expect(num('')).toBeNull()
    expect(num('n/a')).toBeNull()
    expect(num(null)).toBeNull()
    expect(num(undefined)).toBeNull()
  })

  it('reads the numeric part of a position rank', () => {
    expect(parsePosRank('RB12')).toBe(12)
    expect(parsePosRank('DST3')).toBe(3)
    expect(parsePosRank('RB')).toBeNull()
    expect(parsePosRank(null)).toBeNull()
    expect(parsePosRank(undefined)).toBeNull()
  })
})

describe('mapFpRankings', () => {
  it('coerces the string-typed rank fields and parses pos_rank', () => {
    const page = mapFpRankings(fx.weeklyFlx)
    expect(page).toMatchObject({ count: 3, totalExperts: 153, skipped: 0 })
    expect(page.players[0]).toEqual({
      playerId: '17240',
      name: 'Saquon Barkley',
      team: 'PHI',
      position: 'RB',
      rankEcr: 1,
      posRank: 1,
      rankAve: 1.4,
      rankStd: 0.6,
      rankMin: 1,
      rankMax: 3,
      grade: 'A+',
      projPts: 22.4
    })
    expect(page.players[2]).toMatchObject({ rankMin: null, rankMax: null, rankAve: 8.7 })
  })

  it('keeps DST team codes as FantasyPros spells them, nulls the weekly-only fields on ROS rows, skips unusable rows', () => {
    expect(mapFpRankings(fx.weeklyDst).players[1]).toMatchObject({
      team: 'JAC',
      position: 'DST',
      posRank: 12
    })
    const ros = mapFpRankings(fx.rosAll)
    expect(ros.skipped).toBe(1)
    expect(ros.players).toHaveLength(8)
    expect(ros.players[0]).toMatchObject({ grade: null, projPts: null })
    expect(ros.players.find((p) => p.name === 'Retired Guy')?.team).toBeNull()
    expect(ros.players.find((p) => p.name === 'Jacksonville Jaguars')?.rankStd).toBeNull()
    expect(mapFpRankings({ count: 0, total_experts: 0 })).toEqual({
      count: 0,
      totalExperts: 0,
      players: [],
      skipped: 0
    })
  })
})

describe('createFantasyProsClient', () => {
  it('builds the query string and maps the payload', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: fx.weeklyFlx }])
    const client = createFantasyProsClient({ fetchImpl, baseUrl: 'https://example.test/cr.php' })
    const page = await client.getRankings({
      type: 'weekly',
      year: 2026,
      week: 2,
      position: 'FLX',
      scoring: 'PPR'
    })
    expect(page?.players.map((p) => p.playerId)).toEqual(['17240', '19236', '30001'])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/cr.php?sport=nfl&year=2026&type=weekly&position=FLX&scoring=PPR&week=2',
      expect.anything()
    )
  })

  it('omits week for ROS, returns null on 404/410, retries once on 5xx, throws otherwise', async () => {
    const fetchImpl = fakeFetch([
      { status: 200, body: fx.rosAll },
      { status: 404 },
      { status: 410 },
      { status: 503, body: 'down' },
      { status: 200, body: fx.rosAll },
      { status: 403, body: 'forbidden' }
    ])
    const client = createFantasyProsClient({ fetchImpl, retryDelayMs: 0 })
    const ros = { type: 'ros', year: 2026, position: 'ALL', scoring: 'HALF' } as const
    expect((await client.getRankings(ros))?.totalExperts).toBe(6)
    expect(String(vi.mocked(fetchImpl).mock.calls[0][0])).toContain(
      'type=ros&position=ALL&scoring=HALF'
    )
    expect(String(vi.mocked(fetchImpl).mock.calls[0][0])).not.toContain('week=')
    expect(await client.getRankings(ros)).toBeNull()
    expect(await client.getRankings(ros)).toBeNull()
    expect((await client.getRankings(ros))?.count).toBe(9)
    await expect(client.getRankings(ros)).rejects.toBeInstanceOf(FantasyProsHttpError)
    expect(fetchImpl).toHaveBeenCalledTimes(6)
  })
})
```

`tests/main/sources/fantasycalc.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  createFantasyCalcClient,
  FantasyCalcHttpError,
  mapFcValues
} from '@main/sources/fantasycalc'
import * as fx from '../../fixtures/fantasycalc'

function fakeFetch(responses: Array<{ status: number; body?: unknown }>): typeof fetch {
  const queue = [...responses]
  return vi.fn(async () => {
    const next = queue.shift()
    if (!next) throw new Error('no more fake responses')
    const body = next.body === undefined ? null : JSON.stringify(next.body)
    return new Response(body, {
      status: next.status,
      headers: { 'content-type': 'application/json' }
    })
  }) as unknown as typeof fetch
}

describe('mapFcValues', () => {
  it('reads the Sleeper id, ranks, trend and tier; null id stays null', () => {
    const records = mapFcValues(fx.values)
    expect(records[1]).toEqual({
      sleeperId: '4866',
      name: 'Saquon Barkley',
      position: 'RB',
      value: 9340,
      overallRank: 2,
      positionRank: 1,
      trend30Day: -310,
      tier: 1
    })
    expect(records[2].tier).toBeNull()
    expect(records[3].sleeperId).toBeNull()
    expect(
      mapFcValues([{ ...fx.values[0], player: { ...fx.values[0].player, sleeperId: 9221 } }])[0]
        .sleeperId
    ).toBe('9221')
    expect(mapFcValues([{ ...fx.values[0], trend30Day: null }])[0].trend30Day).toBe(0)
  })
})

describe('createFantasyCalcClient', () => {
  it('builds the query string and maps the array', async () => {
    const fetchImpl = fakeFetch([{ status: 200, body: fx.values }])
    const client = createFantasyCalcClient({
      fetchImpl,
      baseUrl: 'https://example.test/values/current'
    })
    const records = await client.getValues({ numTeams: 16, numQbs: 1, ppr: 1 })
    expect(records?.map((r) => r.sleeperId)).toEqual(['6794', '4866', '8259', null])
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.test/values/current?isDynasty=false&numQbs=1&numTeams=16&ppr=1',
      expect.anything()
    )
  })

  it('returns null on 404/410, retries once on 429, throws on other errors', async () => {
    const fetchImpl = fakeFetch([
      { status: 410 },
      { status: 429, body: 'slow' },
      { status: 200, body: [] },
      { status: 500, body: 'a' },
      { status: 500, body: 'b' }
    ])
    const client = createFantasyCalcClient({ fetchImpl, retryDelayMs: 0 })
    const q = { numTeams: 12, numQbs: 2, ppr: 0.5 }
    expect(await client.getValues(q)).toBeNull()
    expect(await client.getValues(q)).toEqual([])
    await expect(client.getValues(q)).rejects.toBeInstanceOf(FantasyCalcHttpError)
    expect(fetchImpl).toHaveBeenCalledTimes(5)
  })
})
```

- [x] **Step 3: Run them to verify they fail**

Run: `npx vitest run tests/main/sources/fantasypros.test.ts tests/main/sources/fantasycalc.test.ts`
Expected: FAIL — modules not found.

- [x] **Step 4: Write `src/main/sources/fantasypros.ts`**

```ts
import type { ScoringFormat } from '@shared/types'

export type FpRankingType = 'weekly' | 'ros'
/** Weekly `ALL` is remapped to FLX server-side (RB/WR/TE); ROS `ALL` really covers every position. */
export type FpPosition = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST' | 'FLX' | 'ALL'

export interface FpQuery {
  type: FpRankingType
  year: number
  /** Weekly only. */
  week?: number
  position: FpPosition
  scoring: ScoringFormat
}

/** One ranked player, numbers coerced (the API sends `rank_*` as strings in some responses). */
export interface FpPlayer {
  /** FantasyPros id (= crosswalk `fantasypros_id`); a team-level id for DST rows. */
  playerId: string
  name: string
  /** FantasyPros team code (`JAC`, not Sleeper's `JAX`); null for free agents. */
  team: string | null
  /** QB RB WR TE K DST. */
  position: string
  rankEcr: number
  /** Numeric part of `pos_rank` ("RB12" → 12). */
  posRank: number
  rankAve: number | null
  rankStd: number | null
  rankMin: number | null
  rankMax: number | null
  /** Weekly only: `start_sit_grade` ("A+"). */
  grade: string | null
  /** Weekly only: `r2p_pts`, FantasyPros' projected points under the requested scoring. */
  projPts: number | null
}

export interface FpRankings {
  /** 0 = not published yet (the current week before FantasyPros opens it). */
  count: number
  totalExperts: number
  players: FpPlayer[]
  /** Rows without a numeric `rank_ecr` or a parsable `pos_rank`. */
  skipped: number
}

/** Raw `consensus-rankings.php` player; only the fields we read. */
export interface FpRawPlayer {
  player_id: number | string
  player_name: string
  player_team_id?: string | null
  player_position_id: string
  rank_ecr: number | string
  rank_min?: number | string | null
  rank_max?: number | string | null
  rank_ave?: number | string | null
  rank_std?: number | string | null
  pos_rank?: string | null
  start_sit_grade?: string | null
  r2p_pts?: number | string | null
}

export interface FpRawResponse {
  count: number
  total_experts: number
  players?: FpRawPlayer[]
}

const POS_RANK = /^[A-Z]+(\d+)$/

/** "RB12" → 12; null for anything else. */
export function parsePosRank(value: string | null | undefined): number | null {
  const m = POS_RANK.exec(value ?? '')
  return m ? Number(m[1]) : null
}

/** Numbers arrive as numbers or numeric strings; anything else is null. */
export function num(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : null
}

export function mapFpRankings(raw: FpRawResponse): FpRankings {
  const players: FpPlayer[] = []
  let skipped = 0
  for (const p of raw.players ?? []) {
    const rankEcr = num(p.rank_ecr)
    const posRank = parsePosRank(p.pos_rank)
    if (rankEcr === null || posRank === null) {
      skipped++
      continue
    }
    players.push({
      playerId: String(p.player_id),
      name: p.player_name,
      team: p.player_team_id || null,
      position: p.player_position_id,
      rankEcr,
      posRank,
      rankAve: num(p.rank_ave),
      rankStd: num(p.rank_std),
      rankMin: num(p.rank_min),
      rankMax: num(p.rank_max),
      grade: p.start_sit_grade || null,
      projPts: num(p.r2p_pts)
    })
  }
  return { count: raw.count, totalExperts: raw.total_experts, players, skipped }
}

export class FantasyProsHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body: string
  ) {
    super(`FantasyPros ${status} for ${url}: ${body.slice(0, 200)}`)
    this.name = 'FantasyProsHttpError'
  }
}

export interface FantasyProsClient {
  /** `null` when the endpoint is gone (404/410). */
  getRankings(query: FpQuery): Promise<FpRankings | null>
}

export interface FantasyProsClientOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  retryDelayMs?: number
}

/** Legacy partner endpoint: keyless, no CORS concern in the main process (research §1). */
export const FANTASYPROS_URL = 'https://partners.fantasypros.com/api/v1/consensus-rankings.php'

export function createFantasyProsClient(options: FantasyProsClientOptions = {}): FantasyProsClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? FANTASYPROS_URL
  const timeoutMs = options.timeoutMs ?? 30_000
  const retryDelayMs = options.retryDelayMs ?? 1_000

  return {
    async getRankings(query) {
      const params = new URLSearchParams({
        sport: 'nfl',
        year: String(query.year),
        type: query.type,
        position: query.position,
        scoring: query.scoring
      })
      if (query.week !== undefined) params.set('week', String(query.week))
      const url = `${baseUrl}?${params}`
      for (let attempt = 0; ; attempt++) {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
        if (res.status === 404 || res.status === 410) return null
        if (res.ok) return mapFpRankings((await res.json()) as FpRawResponse)
        const body = await res.text()
        if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
          continue
        }
        throw new FantasyProsHttpError(res.status, url, body)
      }
    }
  }
}
```

- [x] **Step 5: Write `src/main/sources/fantasycalc.ts`**

```ts
export interface FcQuery {
  numTeams: number
  numQbs: number
  /** Points per reception; accepted but does not change the values (research §2). */
  ppr: number
}

export interface FcRecord {
  /** Sleeper id; null for players FantasyCalc has not mapped yet (the sync drops them). */
  sleeperId: string | null
  name: string
  position: string
  value: number
  overallRank: number
  positionRank: number
  trend30Day: number
  tier: number | null
}

/** Raw `/values/current` record; only the fields we read. */
export interface FcRawRecord {
  player: { name: string; sleeperId?: string | number | null; position: string }
  value: number
  overallRank: number
  positionRank: number
  trend30Day?: number | null
  maybeTier?: number | null
}

export function mapFcValues(raw: FcRawRecord[]): FcRecord[] {
  return raw.map((r) => {
    const id = r.player.sleeperId
    return {
      sleeperId: id === null || id === undefined || id === '' ? null : String(id),
      name: r.player.name,
      position: r.player.position,
      value: r.value,
      overallRank: r.overallRank,
      positionRank: r.positionRank,
      trend30Day: r.trend30Day ?? 0,
      tier: r.maybeTier ?? null
    }
  })
}

export class FantasyCalcHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    body: string
  ) {
    super(`FantasyCalc ${status} for ${url}: ${body.slice(0, 200)}`)
    this.name = 'FantasyCalcHttpError'
  }
}

export interface FantasyCalcClient {
  /** `null` when the endpoint is gone (404/410). */
  getValues(query: FcQuery): Promise<FcRecord[] | null>
}

export interface FantasyCalcClientOptions {
  fetchImpl?: typeof fetch
  baseUrl?: string
  timeoutMs?: number
  retryDelayMs?: number
}

export const FANTASYCALC_URL = 'https://api.fantasycalc.com/values/current'

export function createFantasyCalcClient(options: FantasyCalcClientOptions = {}): FantasyCalcClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseUrl = options.baseUrl ?? FANTASYCALC_URL
  const timeoutMs = options.timeoutMs ?? 30_000
  const retryDelayMs = options.retryDelayMs ?? 1_000

  return {
    async getValues(query) {
      const params = new URLSearchParams({
        isDynasty: 'false',
        numQbs: String(query.numQbs),
        numTeams: String(query.numTeams),
        ppr: String(query.ppr)
      })
      const url = `${baseUrl}?${params}`
      for (let attempt = 0; ; attempt++) {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
        if (res.status === 404 || res.status === 410) return null
        if (res.ok) return mapFcValues((await res.json()) as FcRawRecord[])
        const body = await res.text()
        if (attempt === 0 && (res.status === 429 || res.status >= 500)) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
          continue
        }
        throw new FantasyCalcHttpError(res.status, url, body)
      }
    }
  }
}
```

- [x] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green; 260 → 269 tests.

- [x] **Step 7: Commit**

```bash
git add src/main/sources/fantasypros.ts src/main/sources/fantasycalc.ts tests/fixtures/fantasypros.ts tests/fixtures/fantasycalc.ts tests/main/sources/fantasypros.test.ts tests/main/sources/fantasycalc.test.ts
git commit -m "feat(sources): FantasyPros and FantasyCalc clients"
```

---

### Task 4: Repositories — `expert_ranks` and `market_values`

Replace-per-key semantics mirroring `replaceProjections`; callers wrap in `withTransaction`.

**Files:**

- Create: `src/main/db/repos/expertRanks.ts`, `src/main/db/repos/marketValues.ts`
- Create: `tests/main/db/expertRepos.test.ts`

**Interfaces:**

- Consumes: tables from Task 2, `ScoringFormat` (Task 1).
- Produces: `ROS_WEEK = 0`; `ExpertRankRecord { playerId, rankEcr, posRank, rankAve, rankStd, rankMin, rankMax, experts, grade, projPts }`; `ExpertRankRow extends ExpertRankRecord { scoring, updatedAt }`; `replaceExpertRanks(db, season, week, scoring, records, updatedAt): number`; `listExpertRanks(db, season, week): ExpertRankRow[]` (by `rank_ecr`); `storedScoring(db, season, week): ScoringFormat | null`; `MarketValueRecord { playerId, value, overallRank, posRank, tier, trend30d }`; `MarketValueRow extends MarketValueRecord { updatedAt }`; `replaceMarketValues(db, season, records, updatedAt): number`; `listMarketValues(db, season): MarketValueRow[]` (by `overall_rank`).

- [x] **Step 1: Write the failing tests**

`tests/main/db/expertRepos.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import {
  listExpertRanks,
  replaceExpertRanks,
  ROS_WEEK,
  storedScoring,
  type ExpertRankRecord
} from '@main/db/repos/expertRanks'
import {
  listMarketValues,
  replaceMarketValues,
  type MarketValueRecord
} from '@main/db/repos/marketValues'

const TS = '2026-09-18T12:00:00.000Z'

const rank = (playerId: string, rankEcr: number, posRank: number): ExpertRankRecord => ({
  playerId,
  rankEcr,
  posRank,
  rankAve: rankEcr + 0.4,
  rankStd: null,
  rankMin: rankEcr,
  rankMax: rankEcr + 3,
  experts: 6,
  grade: null,
  projPts: null
})

describe('expert_ranks repo', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('replaces one (season, week) at a time, lists by rank_ecr with scoring and updated_at', () => {
    const ros = [rank('8259', 12, 5), rank('4866', 1, 1)]
    expect(replaceExpertRanks(db, 2026, ROS_WEEK, 'PPR', ros, TS)).toBe(2)
    expect(
      replaceExpertRanks(
        db,
        2026,
        2,
        'PPR',
        [{ ...rank('4866', 1, 1), rankStd: 0.6, grade: 'A+', projPts: 22.4 }],
        TS
      )
    ).toBe(1)

    const rows = listExpertRanks(db, 2026, ROS_WEEK)
    expect(rows.map((r) => r.playerId)).toEqual(['4866', '8259'])
    expect(rows[0]).toEqual({ ...rank('4866', 1, 1), scoring: 'PPR', updatedAt: TS })
    expect(listExpertRanks(db, 2026, 2)[0]).toMatchObject({
      rankStd: 0.6,
      grade: 'A+',
      projPts: 22.4
    })
    expect(listExpertRanks(db, 2025, ROS_WEEK)).toEqual([])

    // a later replace of the same week drops what is no longer there and can change the scoring
    expect(
      replaceExpertRanks(
        db,
        2026,
        ROS_WEEK,
        'HALF',
        [rank('8259', 3, 2)],
        '2026-09-19T00:00:00.000Z'
      )
    ).toBe(1)
    expect(listExpertRanks(db, 2026, ROS_WEEK).map((r) => [r.playerId, r.scoring])).toEqual([
      ['8259', 'HALF']
    ])
    expect(listExpertRanks(db, 2026, 2)).toHaveLength(1) // other weeks untouched
  })

  it('storedScoring reads the stored format, null when nothing is stored', () => {
    expect(storedScoring(db, 2026, ROS_WEEK)).toBeNull()
    replaceExpertRanks(db, 2026, ROS_WEEK, 'STD', [rank('4866', 1, 1)], TS)
    expect(storedScoring(db, 2026, ROS_WEEK)).toBe('STD')
    expect(storedScoring(db, 2026, 1)).toBeNull()
  })
})

describe('market_values repo', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('replaces a season and lists by overall_rank', () => {
    const records: MarketValueRecord[] = [
      { playerId: '4866', value: 9340, overallRank: 2, posRank: 1, tier: 1, trend30d: -310 },
      { playerId: '6794', value: 10512, overallRank: 1, posRank: 1, tier: null, trend30d: 120 }
    ]
    expect(replaceMarketValues(db, 2026, records, TS)).toBe(2)
    expect(listMarketValues(db, 2026)).toEqual([
      { ...records[1], updatedAt: TS },
      { ...records[0], updatedAt: TS }
    ])
    expect(replaceMarketValues(db, 2026, records.slice(0, 1), TS)).toBe(1)
    expect(listMarketValues(db, 2026).map((r) => r.playerId)).toEqual(['4866'])
    expect(listMarketValues(db, 2025)).toEqual([])
  })
})
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/db/expertRepos.test.ts`
Expected: FAIL — modules not found.

- [x] **Step 3: Write `src/main/db/repos/expertRanks.ts`**

```ts
import type { ScoringFormat } from '@shared/types'
import type { Db } from '../connection'

/** `week` of the rest-of-season rows (spec §3.4). */
export const ROS_WEEK = 0

export interface ExpertRankRecord {
  /** Sleeper id (team code for DEF). */
  playerId: string
  rankEcr: number
  posRank: number
  rankAve: number | null
  rankStd: number | null
  rankMin: number | null
  rankMax: number | null
  experts: number
  grade: string | null
  projPts: number | null
}

export interface ExpertRankRow extends ExpertRankRecord {
  scoring: ScoringFormat
  updatedAt: string
}

interface Row {
  player_id: string
  scoring: ScoringFormat
  rank_ecr: number
  pos_rank: number
  rank_ave: number | null
  rank_std: number | null
  rank_min: number | null
  rank_max: number | null
  experts: number
  grade: string | null
  proj_pts: number | null
  updated_at: string
}

/** Full replace of one (season, week). Wrap in `withTransaction`. */
export function replaceExpertRanks(
  db: Db,
  season: number,
  week: number,
  scoring: ScoringFormat,
  records: ExpertRankRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM expert_ranks WHERE season = ? AND week = ?').run(season, week)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO expert_ranks (season, week, player_id, scoring, rank_ecr, pos_rank, rank_ave, rank_std,
       rank_min, rank_max, experts, grade, proj_pts, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(
      season,
      week,
      r.playerId,
      scoring,
      r.rankEcr,
      r.posRank,
      r.rankAve,
      r.rankStd,
      r.rankMin,
      r.rankMax,
      r.experts,
      r.grade,
      r.projPts,
      updatedAt
    )
    written++
  }
  return written
}

export function listExpertRanks(db: Db, season: number, week: number): ExpertRankRow[] {
  const rows = db
    .prepare(
      `SELECT player_id, scoring, rank_ecr, pos_rank, rank_ave, rank_std, rank_min, rank_max, experts, grade, proj_pts, updated_at
       FROM expert_ranks WHERE season = ? AND week = ? ORDER BY rank_ecr, player_id`
    )
    .all(season, week) as unknown as Row[]
  return rows.map((r) => ({
    playerId: r.player_id,
    scoring: r.scoring,
    rankEcr: r.rank_ecr,
    posRank: r.pos_rank,
    rankAve: r.rank_ave,
    rankStd: r.rank_std,
    rankMin: r.rank_min,
    rankMax: r.rank_max,
    experts: r.experts,
    grade: r.grade,
    projPts: r.proj_pts,
    updatedAt: r.updated_at
  }))
}

/** Scoring format the stored (season, week) rows were fetched under; null when none are stored. */
export function storedScoring(db: Db, season: number, week: number): ScoringFormat | null {
  const row = db
    .prepare('SELECT scoring FROM expert_ranks WHERE season = ? AND week = ? LIMIT 1')
    .get(season, week) as { scoring: ScoringFormat } | undefined
  return row?.scoring ?? null
}
```

- [x] **Step 4: Write `src/main/db/repos/marketValues.ts`**

```ts
import type { Db } from '../connection'

export interface MarketValueRecord {
  /** Sleeper id. */
  playerId: string
  value: number
  overallRank: number
  posRank: number
  tier: number | null
  trend30d: number
}

export interface MarketValueRow extends MarketValueRecord {
  updatedAt: string
}

interface Row {
  player_id: string
  value: number
  overall_rank: number
  pos_rank: number
  tier: number | null
  trend_30d: number
  updated_at: string
}

/** Full replace of one season. Wrap in `withTransaction`. */
export function replaceMarketValues(
  db: Db,
  season: number,
  records: MarketValueRecord[],
  updatedAt: string
): number {
  db.prepare('DELETE FROM market_values WHERE season = ?').run(season)
  const insert = db.prepare(
    `INSERT OR REPLACE INTO market_values (season, player_id, value, overall_rank, pos_rank, tier, trend_30d, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
  let written = 0
  for (const r of records) {
    insert.run(season, r.playerId, r.value, r.overallRank, r.posRank, r.tier, r.trend30d, updatedAt)
    written++
  }
  return written
}

export function listMarketValues(db: Db, season: number): MarketValueRow[] {
  const rows = db
    .prepare(
      `SELECT player_id, value, overall_rank, pos_rank, tier, trend_30d, updated_at
       FROM market_values WHERE season = ? ORDER BY overall_rank, player_id`
    )
    .all(season) as unknown as Row[]
  return rows.map((r) => ({
    playerId: r.player_id,
    value: r.value,
    overallRank: r.overall_rank,
    posRank: r.pos_rank,
    tier: r.tier,
    trend30d: r.trend_30d,
    updatedAt: r.updated_at
  }))
}
```

- [x] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green; 269 → 272 tests.

- [x] **Step 6: Commit**

```bash
git add src/main/db/repos/expertRanks.ts src/main/db/repos/marketValues.ts tests/main/db/expertRepos.test.ts
git commit -m "feat(db): expert_ranks and market_values repos"
```

---

### Task 5: Sync steps — `expertSync.ts`, pipeline wiring, app clients

One `runStep` per unit. The join index (crosswalk `fantasypros_id` → Sleeper id, normalized name + position → Sleeper id) is built lazily, only when a FantasyPros step actually runs.

**Files:**

- Create: `src/main/sync/expertSync.ts`
- Modify: `src/main/sync/refresh.ts` (whole file, 30 lines)
- Modify: `src/main/ipc/handlers.ts:37-42` (`AppContext`), `94-104` (`syncDeps`), imports
- Modify: `src/main/index.ts:8-10` (imports), `66-71` (`ctx`)
- Create: `tests/main/sync/expertSync.test.ts`, `tests/main/sync/refresh.test.ts`

**Interfaces:**

- Consumes: `FantasyProsClient`, `FpPlayer`, `FpPosition`, `FpRankings` (Task 3); `FantasyCalcClient` (Task 3); `replaceExpertRanks`, `ROS_WEEK`, `storedScoring`, `ExpertRankRecord`, `replaceMarketValues`, `MarketValueRecord` (Task 4); `listCrosswalk`, `listPlayerIdentitySources`, `PlayerIdentitySource`, `CrosswalkRecord.fantasyprosId` (Task 2); `scoringFormat` (Task 1); `toSleeperDefId` (Task 2); `normalizeName` (`sync/identity.ts`); `runStep`, `SkipStep`, `nowOf`, `StepOutcome`, `SyncDeps`, `RefreshOptions` (`sync/step.ts`).
- Produces: `ExpertSyncDeps extends SyncDeps { fantasypros; fantasycalc }`; `FP_WEEKLY_PREFIX`, `sourceFpWeekly(season, week)`, `sourceFpRos(season)`, `sourceFantasyCalc(season)`; `FP_PAST_WEEK_FRESHNESS_MS`, `FP_CURRENT_WEEK_FRESHNESS_MS`, `FP_ROS_FRESHNESS_MS`, `FANTASYCALC_FRESHNESS_MS`; `WEEKLY_POSITIONS`; `GONE_MESSAGE`, `NOT_PUBLISHED_MESSAGE`, `OFFSEASON_MESSAGE`, `FANTASYCALC_GONE_MESSAGE`; `numQbsFor(slots): 1 | 2`; `FpJoinIndex`, `buildFpJoinIndex(crosswalk, players)`; `FpJoinResult`, `joinFantasyPros(players, experts, index)`; `refreshExperts(deps, options): Promise<SyncResult>`; `AppSyncDeps = NflverseSyncDeps & ExpertSyncDeps` (refresh.ts); `AppContext.fantasypros` / `.fantasycalc`.

- [x] **Step 1: Write the failing sync tests**

`tests/main/sync/expertSync.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, withTransaction, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { listExpertRanks, ROS_WEEK, storedScoring } from '@main/db/repos/expertRanks'
import { listMarketValues } from '@main/db/repos/marketValues'
import {
  listCrosswalk,
  listPlayerIdentitySources,
  replaceCrosswalk
} from '@main/db/repos/playerIds'
import { saveRules } from '@main/db/repos/rules'
import { setNflState } from '@main/db/repos/state'
import type { FantasyCalcClient } from '@main/sources/fantasycalc'
import { mapFcValues } from '@main/sources/fantasycalc'
import type { FantasyProsClient, FpQuery } from '@main/sources/fantasypros'
import { mapFpRankings } from '@main/sources/fantasypros'
import { parseCrosswalk } from '@main/sources/nflverse'
import type { SleeperClient } from '@main/sources/sleeper'
import {
  buildFpJoinIndex,
  FANTASYCALC_GONE_MESSAGE,
  GONE_MESSAGE,
  joinFantasyPros,
  NOT_PUBLISHED_MESSAGE,
  numQbsFor,
  OFFSEASON_MESSAGE,
  refreshExperts,
  sourceFantasyCalc,
  sourceFpRos,
  sourceFpWeekly,
  type ExpertSyncDeps
} from '@main/sync/expertSync'
import type { SyncLogEntry } from '@shared/types'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as fc from '../../fixtures/fantasycalc'
import * as fp from '../../fixtures/fantasypros'
import { crosswalkCsv } from '../../fixtures/nflverse'
import { rules } from '../../fixtures/rules'

const WEEKLY: Record<string, typeof fp.weeklyFlx> = {
  FLX: fp.weeklyFlx,
  QB: fp.weeklyQb,
  K: fp.weeklyK,
  DST: fp.weeklyDst
}

function fakeFantasyPros(overrides: Partial<FantasyProsClient> = {}): FantasyProsClient {
  return {
    getRankings: vi.fn(async (q: FpQuery) =>
      mapFpRankings(q.type === 'ros' ? fp.rosAll : (WEEKLY[q.position] ?? fp.unpublished))
    ),
    ...overrides
  }
}

function fakeFantasyCalc(overrides: Partial<FantasyCalcClient> = {}): FantasyCalcClient {
  return { getValues: vi.fn(async () => mapFcValues(fc.values)), ...overrides }
}

describe('refreshExperts', () => {
  let db: Db
  let clock: Date
  const HOUR = 3_600_000
  const state = (over: Partial<Parameters<typeof setNflState>[1]> = {}): void =>
    setNflState(db, {
      season: '2026',
      week: 2,
      displayWeek: 1,
      seasonType: 'regular',
      fetchedAt: SEED_TS,
      ...over
    })

  function deps(
    fantasypros = fakeFantasyPros(),
    fantasycalc = fakeFantasyCalc(),
    onStep?: (e: SyncLogEntry) => void
  ): ExpertSyncDeps {
    return { db, sleeper: {} as SleeperClient, fantasypros, fantasycalc, now: () => clock, onStep }
  }

  beforeEach(() => {
    db = seedLeague()
    state()
    withTransaction(db, () => replaceCrosswalk(db, parseCrosswalk(crosswalkCsv).records, SEED_TS))
    clock = new Date('2026-09-18T12:00:00.000Z')
  })

  it('runs weekly 1..current (FLX, QB, K, DST), ROS and FantasyCalc; joins by id, name and DST alias', async () => {
    const fantasypros = fakeFantasyPros()
    const fantasycalc = fakeFantasyCalc()
    const seen: string[] = []
    const { steps } = await refreshExperts(
      deps(fantasypros, fantasycalc, (e) => seen.push(e.status))
    )

    expect(steps.map((s) => [s.source, s.status, s.rowsWritten, s.message])).toEqual([
      [sourceFpWeekly(2026, 1), 'ok', 6, '6 matched, 1 unmatched'],
      [sourceFpWeekly(2026, 2), 'ok', 6, '6 matched, 1 unmatched'],
      [sourceFpRos(2026), 'ok', 6, '6 matched, 2 unmatched'],
      [sourceFantasyCalc(2026), 'ok', 3, '1 without a Sleeper id']
    ])
    expect(seen).toEqual(['ok', 'ok', 'ok', 'ok'])
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(9)
    expect(fantasypros.getRankings).toHaveBeenNthCalledWith(1, {
      type: 'weekly',
      year: 2026,
      week: 1,
      position: 'FLX',
      scoring: 'PPR'
    })
    expect(fantasypros.getRankings).toHaveBeenLastCalledWith({
      type: 'ros',
      year: 2026,
      position: 'ALL',
      scoring: 'PPR'
    })
    // league L1 has 2 rosters, no SUPER_FLEX, rec = 1
    expect(fantasycalc.getValues).toHaveBeenCalledWith({ numTeams: 2, numQbs: 1, ppr: 1 })

    const week1 = listExpertRanks(db, 2026, 1)
    expect(week1.map((r) => r.playerId)).toEqual(['4866', '6794', 'LAR', '1234', '8259', 'JAX'])
    expect(week1[0]).toEqual({
      playerId: '4866',
      scoring: 'PPR',
      rankEcr: 1,
      posRank: 1,
      rankAve: 1.4,
      rankStd: 0.6,
      rankMin: 1,
      rankMax: 3,
      experts: 153,
      grade: 'A+',
      projPts: 22.4,
      updatedAt: clock.toISOString()
    })
    expect(week1.find((r) => r.playerId === '1234')?.experts).toBe(120) // per page
    expect(listExpertRanks(db, 2026, ROS_WEEK).map((r) => r.playerId)).toEqual([
      '4866',
      '6794',
      '8259',
      '1234',
      'LAR',
      'JAX'
    ])
    expect(listExpertRanks(db, 2026, ROS_WEEK)[0]).toMatchObject({ grade: null, projPts: null })
    expect(listMarketValues(db, 2026).map((r) => [r.playerId, r.value, r.tier])).toEqual([
      ['6794', 10512, 1],
      ['4866', 9340, 1],
      ['8259', 6100, null]
    ])
  })

  it('freshness: past weeks 30 d, current week 3 h, ROS and FantasyCalc 12 h', async () => {
    const fantasypros = fakeFantasyPros()
    await refreshExperts(deps(fantasypros))
    clock = new Date(clock.getTime() + 4 * HOUR)
    const later = await refreshExperts(deps(fantasypros))
    expect(later.steps.map((s) => [s.source, s.status])).toEqual([
      [sourceFpWeekly(2026, 1), 'skipped'],
      [sourceFpWeekly(2026, 2), 'ok'],
      [sourceFpRos(2026), 'skipped'],
      [sourceFantasyCalc(2026), 'skipped']
    ])
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(9 + 4)
    clock = new Date(clock.getTime() + 9 * HOUR)
    const evenLater = await refreshExperts(deps(fantasypros))
    expect(evenLater.steps.map((s) => s.status)).toEqual(['skipped', 'ok', 'ok', 'ok'])
    expect(
      (await refreshExperts(deps(fantasypros), { force: true })).steps.map((s) => s.status)
    ).toEqual(['ok', 'ok', 'ok', 'ok'])
  })

  it('a rules change to another scoring bucket re-fetches FantasyPros inside freshness, not FantasyCalc', async () => {
    const fantasypros = fakeFantasyPros()
    await refreshExperts(deps(fantasypros))
    saveRules(db, 'L1', rules({ scoring: { ...rules().scoring, rec: 0.5 } }))
    const again = await refreshExperts(deps(fantasypros))
    expect(again.steps.map((s) => s.status)).toEqual(['ok', 'ok', 'ok', 'skipped'])
    expect(fantasypros.getRankings).toHaveBeenLastCalledWith(
      expect.objectContaining({ scoring: 'HALF' })
    )
    expect(storedScoring(db, 2026, ROS_WEEK)).toBe('HALF')
    expect(storedScoring(db, 2026, 1)).toBe('HALF')
    // same bucket again → plain freshness applies
    expect((await refreshExperts(deps(fantasypros))).steps.map((s) => s.status)).toEqual([
      'skipped',
      'skipped',
      'skipped',
      'skipped'
    ])
  })

  it('an unpublished current week costs one request and is skipped; past weeks stay', async () => {
    const fantasypros = fakeFantasyPros({
      getRankings: vi.fn(async (q: FpQuery) => {
        if (q.type === 'weekly' && q.week === 2) return mapFpRankings(fp.unpublished)
        return mapFpRankings(q.type === 'ros' ? fp.rosAll : (WEEKLY[q.position] ?? fp.unpublished))
      })
    })
    const { steps } = await refreshExperts(deps(fantasypros))
    expect(steps[1]).toMatchObject({
      source: sourceFpWeekly(2026, 2),
      status: 'skipped',
      message: NOT_PUBLISHED_MESSAGE
    })
    expect(steps.map((s) => s.status)).toEqual(['ok', 'skipped', 'ok', 'ok'])
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(4 + 1 + 1)
    expect(listExpertRanks(db, 2026, 2)).toEqual([])
  })

  it('a gone endpoint stops the weekly loop after one request and skips ROS without one; FantasyCalc still runs', async () => {
    const fantasypros = fakeFantasyPros({ getRankings: vi.fn(async () => null) })
    const { steps } = await refreshExperts(deps(fantasypros))
    expect(steps.map((s) => [s.source, s.status, s.message])).toEqual([
      [sourceFpWeekly(2026, 1), 'skipped', GONE_MESSAGE],
      [sourceFpRos(2026), 'skipped', GONE_MESSAGE],
      [sourceFantasyCalc(2026), 'ok', '1 without a Sleeper id']
    ])
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(1)
  })

  it('a failing endpoint logs an error, stops the weekly loop, but ROS and FantasyCalc still try once', async () => {
    const fantasypros = fakeFantasyPros({
      getRankings: vi.fn(async () => {
        throw new Error('FantasyPros 403 for …: forbidden')
      })
    })
    const fantasycalc = fakeFantasyCalc({ getValues: vi.fn(async () => null) })
    const { steps } = await refreshExperts(deps(fantasypros, fantasycalc))
    expect(steps.map((s) => [s.source, s.status])).toEqual([
      [sourceFpWeekly(2026, 1), 'error'],
      [sourceFpRos(2026), 'error'],
      [sourceFantasyCalc(2026), 'skipped']
    ])
    expect(steps[0].message).toContain('403')
    expect(steps[2].message).toBe(FANTASYCALC_GONE_MESSAGE)
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(2)
  })

  it('off-season: one skipped step and no requests', async () => {
    state({ seasonType: 'pre', week: 0, displayWeek: 0 })
    const fantasypros = fakeFantasyPros()
    const fantasycalc = fakeFantasyCalc()
    const { steps } = await refreshExperts(deps(fantasypros, fantasycalc))
    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({
      source: sourceFpRos(2026),
      status: 'skipped',
      message: OFFSEASON_MESSAGE
    })
    expect(fantasypros.getRankings).not.toHaveBeenCalled()
    expect(fantasycalc.getValues).not.toHaveBeenCalled()
  })

  it('does nothing without an active league or without an NFL state', async () => {
    const empty = openDatabase(':memory:')
    migrate(empty)
    const fantasypros = fakeFantasyPros()
    expect(await refreshExperts({ ...deps(fantasypros), db: empty })).toEqual({ steps: [] })
    expect(fantasypros.getRankings).not.toHaveBeenCalled()
  })

  it('clamps the weekly loop to 18 and uses the later of week / display_week', async () => {
    state({ week: 17, displayWeek: 18 })
    const fantasypros = fakeFantasyPros()
    const { steps } = await refreshExperts(deps(fantasypros))
    expect(steps.filter((s) => s.source.startsWith('fantasypros:weekly:'))).toHaveLength(18)
    expect(fantasypros.getRankings).toHaveBeenCalledTimes(18 * 4 + 1)
  })

  describe('pure helpers', () => {
    it('numQbsFor: 2 with a SUPER_FLEX slot, else 1', () => {
      expect(numQbsFor(rules().rosterSlots)).toBe(1)
      expect(numQbsFor([...rules().rosterSlots, { slot: 'SUPER_FLEX', count: 1 }])).toBe(2)
      expect(numQbsFor([{ slot: 'SUPER_FLEX', count: 0 }])).toBe(1)
    })

    it('buildFpJoinIndex: first crosswalk row wins per FP id; names are normalized with position', () => {
      const index = buildFpJoinIndex(
        [
          ...listCrosswalk(db),
          { ...listCrosswalk(db)[0], fantasyprosId: '17240', sleeperId: 'dup' }
        ],
        listPlayerIdentitySources(db)
      )
      expect(index.byFpId.get('17240')).toBe('4866')
      expect(index.byFpId.get('19236')).toBe('6794')
      expect(index.byFpId.has('30001')).toBe(false)
      expect(index.byName.get('james cook|RB')).toBe('8259')
      expect(index.byName.get('jamarr chase|WR')).toBe('7564')
      expect(index.byName.get('retired guy|QB')).toBe('1234')
    })

    it('joinFantasyPros: id, then name + position, DST by team alias; the rest counted', () => {
      const index = buildFpJoinIndex(listCrosswalk(db), listPlayerIdentitySources(db))
      const { records, matched, unmatched } = joinFantasyPros(
        mapFpRankings(fp.rosAll).players,
        6,
        index
      )
      expect(matched).toBe(6)
      expect(unmatched).toBe(2)
      expect(records.map((r) => r.playerId)).toEqual(['4866', '6794', '8259', '1234', 'LAR', 'JAX'])
      expect(records[0]).toEqual({
        playerId: '4866',
        rankEcr: 1,
        posRank: 1,
        rankAve: 1.2,
        rankStd: 0.5,
        rankMin: 1,
        rankMax: 2,
        experts: 6,
        grade: null,
        projPts: null
      })
      // a DST row without a team cannot be joined
      const noTeam = joinFantasyPros(
        [{ ...mapFpRankings(fp.weeklyDst).players[0], team: null }],
        1,
        index
      )
      expect(noTeam).toMatchObject({ matched: 0, unmatched: 1 })
    })
  })
})
```

`tests/main/sync/refresh.test.ts` (pipeline order — the expert steps come after nflverse in both entry points):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { mapFcValues, type FantasyCalcClient } from '@main/sources/fantasycalc'
import { mapFpRankings, type FantasyProsClient } from '@main/sources/fantasypros'
import { parseCrosswalk, type NflverseClient } from '@main/sources/nflverse'
import type { SleeperClient } from '@main/sources/sleeper'
import { importAll, refreshAll, type AppSyncDeps } from '@main/sync/refresh'
import * as fc from '../../fixtures/fantasycalc'
import * as fp from '../../fixtures/fantasypros'
import { crosswalkCsv } from '../../fixtures/nflverse'
import * as fx from '../../fixtures/sleeper'

describe('refreshAll / importAll', () => {
  let db: Db
  const sleeper: SleeperClient = {
    getUser: vi.fn(async () => fx.user),
    getUserLeagues: vi.fn(async () => [fx.league]),
    getLeague: vi.fn(async () => fx.league),
    getLeagueUsers: vi.fn(async () => fx.users),
    getLeagueRosters: vi.fn(async () => fx.rosters),
    getAllPlayers: vi.fn(async () => fx.players),
    getNflState: vi.fn(async () => fx.nflState),
    getProjections: vi.fn(async () => [])
  }
  const nflverse: NflverseClient = {
    getPlayerWeekStats: vi.fn(async () => null),
    getTeamWeekStats: vi.fn(async () => null),
    getSnapCounts: vi.fn(async () => null),
    getGames: vi.fn(async () => ({ records: [], skipped: 0 })),
    getCrosswalk: vi.fn(async () => parseCrosswalk(crosswalkCsv))
  }
  const fantasypros: FantasyProsClient = {
    getRankings: vi.fn(async (q) => mapFpRankings(q.type === 'ros' ? fp.rosAll : fp.weeklyFlx))
  }
  const fantasycalc: FantasyCalcClient = { getValues: vi.fn(async () => mapFcValues(fc.values)) }
  const deps = (): AppSyncDeps => ({ db, sleeper, nflverse, fantasypros, fantasycalc })

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('runs the expert steps after Sleeper and nflverse, on import and on refresh', async () => {
    const imported = await importAll(deps(), 'L1', 'u1')
    const sources = imported.steps.map((s) => s.source)
    expect(sources.slice(-4)).toEqual([
      'fantasypros:weekly:2026:1',
      'fantasypros:weekly:2026:2',
      'fantasypros:ros:2026',
      'fantasycalc:2026'
    ])
    expect(sources.indexOf('nflverse:crosswalk')).toBeLessThan(
      sources.indexOf('fantasypros:ros:2026')
    )
    expect(imported.steps.filter((s) => s.status === 'error')).toEqual([])

    const refreshed = await refreshAll(deps())
    expect(refreshed.steps.map((s) => s.source).slice(-4)).toEqual(sources.slice(-4))
  })
})
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/sync/expertSync.test.ts tests/main/sync/refresh.test.ts`
Expected: FAIL — `@main/sync/expertSync` not found; `AppSyncDeps` not exported.

- [x] **Step 3: Write `src/main/sync/expertSync.ts`**

```ts
import { withTransaction } from '@main/db/connection'
import {
  replaceExpertRanks,
  ROS_WEEK,
  storedScoring,
  type ExpertRankRecord
} from '@main/db/repos/expertRanks'
import { getLeague } from '@main/db/repos/leagues'
import { replaceMarketValues, type MarketValueRecord } from '@main/db/repos/marketValues'
import {
  listCrosswalk,
  listPlayerIdentitySources,
  type PlayerIdentitySource
} from '@main/db/repos/playerIds'
import { getRules } from '@main/db/repos/rules'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { getNflState } from '@main/db/repos/state'
import type { FantasyCalcClient } from '@main/sources/fantasycalc'
import type { FantasyProsClient, FpPlayer, FpPosition, FpRankings } from '@main/sources/fantasypros'
import type { CrosswalkRecord } from '@main/sources/nflverse-types'
import { scoringFormat, type RosterSlotCount } from '@shared/rules'
import { toSleeperDefId } from '@shared/teams'
import type { SyncLogEntry, SyncResult } from '@shared/types'
import { normalizeName } from './identity'
import {
  nowOf,
  runStep,
  SkipStep,
  type RefreshOptions,
  type StepOutcome,
  type SyncDeps
} from './step'

export interface ExpertSyncDeps extends SyncDeps {
  fantasypros: FantasyProsClient
  fantasycalc: FantasyCalcClient
}

export const FP_WEEKLY_PREFIX = 'fantasypros:weekly:'
export const sourceFpWeekly = (season: number, week: number): string =>
  `${FP_WEEKLY_PREFIX}${season}:${week}`
export const sourceFpRos = (season: number): string => `fantasypros:ros:${season}`
export const sourceFantasyCalc = (season: number): string => `fantasycalc:${season}`

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
/** Spec §3.2: past weeks never move; the current week refreshes several times a day; ROS and the market ~daily. */
export const FP_PAST_WEEK_FRESHNESS_MS = 30 * DAY
export const FP_CURRENT_WEEK_FRESHNESS_MS = 3 * HOUR
export const FP_ROS_FRESHNESS_MS = 12 * HOUR
export const FANTASYCALC_FRESHNESS_MS = 12 * HOUR
const LAST_WEEK = 18

/**
 * Weekly `position=ALL` is remapped to FLX server-side, so QB, K and DST need their own calls.
 * FLX goes first: its `count: 0` means "not published yet" and saves the other three requests.
 */
export const WEEKLY_POSITIONS: readonly FpPosition[] = ['FLX', 'QB', 'K', 'DST']

export const GONE_MESSAGE = 'rankings endpoint unavailable'
export const NOT_PUBLISHED_MESSAGE = 'not published yet'
export const OFFSEASON_MESSAGE = 'expert rankings only during the regular season'
export const FANTASYCALC_GONE_MESSAGE = 'FantasyCalc endpoint unavailable'

/** FantasyCalc's `numQbs`: 2 when the roster has a SUPER_FLEX slot, else 1 (spec §3.2). */
export function numQbsFor(slots: RosterSlotCount[]): 1 | 2 {
  return slots.some((s) => s.slot === 'SUPER_FLEX' && s.count > 0) ? 2 : 1
}

export interface FpJoinIndex {
  /** FantasyPros id → Sleeper id, from crosswalk rows carrying both. */
  byFpId: Map<string, string>
  /** `${normalizeName(name)}|${position}` → Sleeper id (the identity rule's name fallback). */
  byName: Map<string, string>
}

/** First row wins per key, so duplicates never flip a match between refreshes. */
export function buildFpJoinIndex(
  crosswalk: CrosswalkRecord[],
  players: PlayerIdentitySource[]
): FpJoinIndex {
  const byFpId = new Map<string, string>()
  for (const r of crosswalk) {
    if (r.fantasyprosId && r.sleeperId && !byFpId.has(r.fantasyprosId)) {
      byFpId.set(r.fantasyprosId, r.sleeperId)
    }
  }
  const byName = new Map<string, string>()
  for (const p of players) {
    if (!p.position) continue
    const key = `${normalizeName(p.fullName)}|${p.position}`
    if (!byName.has(key)) byName.set(key, p.playerId)
  }
  return { byFpId, byName }
}

export interface FpJoinResult {
  records: ExpertRankRecord[]
  matched: number
  unmatched: number
}

/** Spec §3.3: DST by team code alias, players by fantasypros_id then name + position; the rest are dropped and counted. */
export function joinFantasyPros(
  players: FpPlayer[],
  experts: number,
  index: FpJoinIndex
): FpJoinResult {
  const records: ExpertRankRecord[] = []
  let unmatched = 0
  for (const p of players) {
    const playerId =
      p.position === 'DST'
        ? p.team
          ? toSleeperDefId(p.team)
          : null
        : (index.byFpId.get(p.playerId) ??
          index.byName.get(`${normalizeName(p.name)}|${p.position}`) ??
          null)
    if (!playerId) {
      unmatched++
      continue
    }
    records.push({
      playerId,
      rankEcr: p.rankEcr,
      posRank: p.posRank,
      rankAve: p.rankAve,
      rankStd: p.rankStd,
      rankMin: p.rankMin,
      rankMax: p.rankMax,
      experts,
      grade: p.grade,
      projPts: p.projPts
    })
  }
  return { records, matched: records.length, unmatched }
}

/**
 * Spec §3.2: weekly 1..current week (four calls each), ROS, FantasyCalc — one step each, after
 * nflverse so the crosswalk carries `fantasypros_id`. Never throws; every outcome is a `sync_log` row.
 */
export async function refreshExperts(
  deps: ExpertSyncDeps,
  options: RefreshOptions = {}
): Promise<SyncResult> {
  const force = options.force ?? false
  const steps: SyncLogEntry[] = []
  const state = getNflState(deps.db)
  const leagueId = getSetting(deps.db, SETTING_ACTIVE_LEAGUE)
  if (!state || !leagueId) return { steps }
  const season = Number(state.season)
  if (state.seasonType !== 'regular') {
    steps.push(
      await runStep(deps, sourceFpRos(season), 0, true, async () => {
        throw new SkipStep(OFFSEASON_MESSAGE)
      })
    )
    return { steps }
  }

  const rules = getRules(deps.db, leagueId)
  const scoring = scoringFormat(rules)
  const currentWeek = Math.min(Math.max(state.week, state.displayWeek, 1), LAST_WEEK)
  const ts = (): string => nowOf(deps).toISOString()
  let index: FpJoinIndex | null = null
  const joinIndex = (): FpJoinIndex => {
    index ??= buildFpJoinIndex(listCrosswalk(deps.db), listPlayerIdentitySources(deps.db))
    return index
  }
  /** A rules change that moves the scoring bucket makes the stored rows stale whatever their age. */
  const scoringChanged = (week: number): boolean => {
    const stored = storedScoring(deps.db, season, week)
    return stored !== null && stored !== scoring
  }
  const store = (week: number, pages: FpRankings[]): StepOutcome => {
    const records: ExpertRankRecord[] = []
    let matched = 0
    let unmatched = 0
    for (const page of pages) {
      const joined = joinFantasyPros(page.players, page.totalExperts, joinIndex())
      records.push(...joined.records)
      matched += joined.matched
      unmatched += joined.unmatched
    }
    const rows = withTransaction(deps.db, () =>
      replaceExpertRanks(deps.db, season, week, scoring, records, ts())
    )
    return { rows, message: `${matched} matched, ${unmatched} unmatched` }
  }

  let gone = false
  let stop = false
  for (let week = 1; week <= currentWeek && !stop; week++) {
    const freshness = week < currentWeek ? FP_PAST_WEEK_FRESHNESS_MS : FP_CURRENT_WEEK_FRESHNESS_MS
    const entry = await runStep(
      deps,
      sourceFpWeekly(season, week),
      freshness,
      force || scoringChanged(week),
      async () => {
        const pages: FpRankings[] = []
        for (const position of WEEKLY_POSITIONS) {
          const page = await deps.fantasypros.getRankings({
            type: 'weekly',
            year: season,
            week,
            position,
            scoring
          })
          if (!page) throw new SkipStep(GONE_MESSAGE)
          if (page.count === 0 && position === 'FLX') throw new SkipStep(NOT_PUBLISHED_MESSAGE)
          pages.push(page)
        }
        return store(week, pages)
      }
    )
    steps.push(entry)
    gone = entry.status === 'skipped' && entry.message === GONE_MESSAGE
    stop = gone || entry.status === 'error'
  }

  steps.push(
    await runStep(
      deps,
      sourceFpRos(season),
      FP_ROS_FRESHNESS_MS,
      force || scoringChanged(ROS_WEEK),
      async () => {
        if (gone) throw new SkipStep(GONE_MESSAGE)
        const page = await deps.fantasypros.getRankings({
          type: 'ros',
          year: season,
          position: 'ALL',
          scoring
        })
        if (!page) throw new SkipStep(GONE_MESSAGE)
        if (page.count === 0) throw new SkipStep(NOT_PUBLISHED_MESSAGE)
        return store(ROS_WEEK, [page])
      }
    )
  )

  steps.push(
    await runStep(deps, sourceFantasyCalc(season), FANTASYCALC_FRESHNESS_MS, force, async () => {
      const values = await deps.fantasycalc.getValues({
        numTeams: getLeague(deps.db, leagueId)?.totalRosters ?? 12,
        numQbs: numQbsFor(rules?.rosterSlots ?? []),
        ppr: rules?.scoring.rec ?? 0
      })
      if (!values) throw new SkipStep(FANTASYCALC_GONE_MESSAGE)
      const records: MarketValueRecord[] = []
      for (const v of values) {
        if (!v.sleeperId) continue
        records.push({
          playerId: v.sleeperId,
          value: v.value,
          overallRank: v.overallRank,
          posRank: v.positionRank,
          tier: v.tier,
          trend30d: v.trend30Day
        })
      }
      const rows = withTransaction(deps.db, () =>
        replaceMarketValues(deps.db, season, records, ts())
      )
      const dropped = values.length - records.length
      return { rows, message: dropped ? `${dropped} without a Sleeper id` : null }
    })
  )
  return { steps }
}
```

- [x] **Step 4: Wire the pipeline — `src/main/sync/refresh.ts`**

Replace the file with:

```ts
import { pruneSyncLog } from '@main/db/repos/syncLog'
import type { SyncResult } from '@shared/types'
import { refreshExperts, type ExpertSyncDeps } from './expertSync'
import { refreshNflverse, type NflverseSyncDeps } from './nflverseSync'
import { importLeague, refreshSleeper, SOURCE_PLAYERS } from './sleeperSync'
import { nowOf, type RefreshOptions } from './step'

/** Everything the full pipeline needs: Sleeper, nflverse and the expert sources. */
export type AppSyncDeps = NflverseSyncDeps & ExpertSyncDeps

const SYNC_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

/** Refresh button / on-launch: Sleeper first (it sets the NFL season), then nflverse, then the expert layer (it needs the crosswalk). */
export async function refreshAll(
  deps: AppSyncDeps,
  options: RefreshOptions = {}
): Promise<SyncResult> {
  pruneSyncLog(deps.db, new Date(nowOf(deps).getTime() - SYNC_LOG_RETENTION_MS).toISOString())
  const sleeper = await refreshSleeper(deps, options)
  const playersChanged = sleeper.steps.some((s) => s.source === SOURCE_PLAYERS && s.status === 'ok')
  const nflverse = await refreshNflverse(deps, { ...options, playersChanged })
  const experts = await refreshExperts(deps, options)
  return { steps: [...sleeper.steps, ...nflverse.steps, ...experts.steps] }
}

/** Setup → Import: the Sleeper first import followed by the full nflverse pipeline and the expert layer. */
export async function importAll(
  deps: AppSyncDeps,
  leagueId: string,
  myUserId: string | null
): Promise<SyncResult> {
  const sleeper = await importLeague(deps, leagueId, myUserId)
  const nflverse = await refreshNflverse(deps, { playersChanged: true })
  const experts = await refreshExperts(deps)
  return { steps: [...sleeper.steps, ...nflverse.steps, ...experts.steps] }
}
```

- [x] **Step 5: Wire the app — `src/main/ipc/handlers.ts` and `src/main/index.ts`**

`handlers.ts`:

- Add imports `import type { FantasyCalcClient } from '@main/sources/fantasycalc'` and `import type { FantasyProsClient } from '@main/sources/fantasypros'`; change the nflverseSync import to `import { STATS_SOURCE_PREFIX } from '@main/sync/nflverseSync'` and the refresh import to `import { importAll, refreshAll, type AppSyncDeps } from '@main/sync/refresh'`.
- `AppContext` gains `fantasypros: FantasyProsClient` and `fantasycalc: FantasyCalcClient` after `nflverse`.
- `syncDeps` returns `AppSyncDeps` and spreads the two clients:
  ```ts
  export function syncDeps(ctx: AppContext): AppSyncDeps {
    return {
      db: ctx.db,
      sleeper: ctx.sleeper,
      nflverse: ctx.nflverse,
      fantasypros: ctx.fantasypros,
      fantasycalc: ctx.fantasycalc,
      onStep: (entry) => {
        if (entry.status === 'ok') invalidateCaches()
        ctx.getWindow()?.webContents.send(IPC.syncProgress, entry)
      }
    }
  }
  ```

`index.ts`: add `import { createFantasyCalcClient } from '@main/sources/fantasycalc'` and `import { createFantasyProsClient } from '@main/sources/fantasypros'`; in `ctx` add `fantasypros: createFantasyProsClient(),` and `fantasycalc: createFantasyCalcClient(),` after `nflverse`.

- [x] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green; 272 → 285 tests. If Prettier reflows the long `expect(...)` lines, run `npm run format` and re-run lint.

- [x] **Step 7: Commit**

```bash
git add src/main/sync/expertSync.ts src/main/sync/refresh.ts src/main/ipc/handlers.ts src/main/index.ts tests/main/sync/expertSync.test.ts tests/main/sync/refresh.test.ts
git commit -m "feat(sync): FantasyPros and FantasyCalc sync steps"
```

---

### Task 6: Read model — `value/expert.ts`, build wiring, week join

Pure attach: rows loaded once per build (`listExpertRanks(season, ROS_WEEK)` + `listMarketValues(season)`) become `PlayerValueRow.expert` / `.market` and `ValueContext.expert`; `playersWeek` joins that week's rows into `PlayerWeekRow.expert`. Past seasons simply have no rows.

**Files:**

- Create: `src/main/value/expert.ts`
- Modify: `src/main/value/build.ts` (imports; `assembleValue` signature, rows, context; `buildValueSeason`)
- Modify: `src/main/db/repos/playersWeek.ts` (imports; the `experts` map; the row literal)
- Create: `tests/main/value/expert.test.ts`
- Modify: `tests/main/value/build.test.ts`, `tests/main/db/playersWeek.test.ts`

**Interfaces:**

- Consumes: `ExpertRankRow`, `listExpertRanks`, `ROS_WEEK` (Task 4); `MarketValueRow`, `listMarketValues` (Task 4); `ExpertRos`, `MarketValue`, `ExpertWeek` (Task 1).
- Produces: `ExpertBundle { ranks: ExpertRankRow[]; market: MarketValueRow[] }`, `NO_EXPERTS`, `ExpertIndex { ranks: Map; market: Map; ecrUpdatedAt; marketUpdatedAt }`, `indexExperts(bundle)`, `ecrDelta(ecrPosRank, rosRank)`, `expertRos(rank, rosRank): ExpertRos | null`, `marketValue(row): MarketValue | null`, `expertWeek(rank): ExpertWeek | null`; `assembleValue(bundle, experts = NO_EXPERTS)`.

- [x] **Step 1: Write the failing tests**

`tests/main/value/expert.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import type { MarketValueRow } from '@main/db/repos/marketValues'
import {
  ecrDelta,
  expertRos,
  expertWeek,
  indexExperts,
  marketValue,
  NO_EXPERTS
} from '@main/value/expert'

const TS = '2026-09-18T12:00:00.000Z'
const rank = (
  playerId: string,
  posRank: number,
  over: Partial<ExpertRankRow> = {}
): ExpertRankRow => ({
  playerId,
  scoring: 'PPR',
  rankEcr: posRank * 3,
  posRank,
  rankAve: posRank + 0.5,
  rankStd: 1.5,
  rankMin: posRank - 1,
  rankMax: posRank + 4,
  experts: 6,
  grade: null,
  projPts: null,
  updatedAt: TS,
  ...over
})
const market = (playerId: string, value: number): MarketValueRow => ({
  playerId,
  value,
  overallRank: 1,
  posRank: 1,
  tier: 2,
  trend30d: -120,
  updatedAt: TS
})

describe('value/expert', () => {
  it('ecrDelta is ecrPosRank − rosRank: positive when we rank the player higher; null when either is missing', () => {
    expect(ecrDelta(12, 3)).toBe(9)
    expect(ecrDelta(2, 10)).toBe(-8)
    expect(ecrDelta(5, 5)).toBe(0)
    expect(ecrDelta(null, 3)).toBeNull()
    expect(ecrDelta(3, null)).toBeNull()
  })

  it('indexExperts maps by player and reports the stored timestamps, null when empty', () => {
    const index = indexExperts({ ranks: [rank('a', 1), rank('b', 2)], market: [market('a', 9000)] })
    expect(index.ranks.get('b')?.posRank).toBe(2)
    expect(index.market.get('a')?.value).toBe(9000)
    expect(index).toMatchObject({ ecrUpdatedAt: TS, marketUpdatedAt: TS })
    expect(indexExperts(NO_EXPERTS)).toMatchObject({ ecrUpdatedAt: null, marketUpdatedAt: null })
    expect(indexExperts({ ranks: [], market: [market('a', 1)] }).ecrUpdatedAt).toBeNull()
  })

  it('expertRos / marketValue / expertWeek build the shared blocks, null without a row', () => {
    expect(expertRos(rank('a', 4), 1)).toEqual({
      ecrRank: 12,
      ecrPosRank: 4,
      spread: 1.5,
      experts: 6,
      ecrDelta: 3
    })
    expect(expertRos(rank('a', 4, { rankStd: null }), null)).toMatchObject({
      spread: null,
      ecrDelta: null
    })
    expect(expertRos(undefined, 1)).toBeNull()
    expect(marketValue(market('a', 9000))).toEqual({
      value: 9000,
      posRank: 1,
      tier: 2,
      trend30d: -120
    })
    expect(marketValue(undefined)).toBeNull()
    expect(expertWeek(rank('a', 7, { grade: 'B+', projPts: 14.2 }))).toEqual({
      ecrPosRank: 7,
      grade: 'B+',
      projPts: 14.2,
      spread: 1.5
    })
    expect(expertWeek(undefined)).toBeNull()
  })
})
```

`tests/main/value/build.test.ts` — add to the imports `import { replaceExpertRanks, ROS_WEEK } from '@main/db/repos/expertRanks'` and `import { replaceMarketValues } from '@main/db/repos/marketValues'`, and this test inside `describe('buildValueSeason')` (after `attaches the schedule…`):

```ts
it('attaches the experts: ROS ECR with ecrDelta against rosRank, market value, and the context provenance', () => {
  const TS = '2026-09-18T15:00:00.000Z'
  const rank = {
    rankAve: null,
    rankStd: 0.5,
    rankMin: null,
    rankMax: null,
    experts: 6,
    grade: null,
    projPts: null
  }
  replaceExpertRanks(
    db,
    SEASON,
    ROS_WEEK,
    'PPR',
    [
      { playerId: '4866', rankEcr: 5, posRank: 4, ...rank },
      { playerId: '8259', rankEcr: 60, posRank: 20, ...rank, rankStd: null },
      { playerId: 'JAX', rankEcr: 160, posRank: 12, ...rank } // no players row: harmless
    ],
    TS
  )
  replaceMarketValues(
    db,
    SEASON,
    [{ playerId: '4866', value: 9340, overallRank: 2, posRank: 1, tier: 1, trend30d: -310 }],
    TS
  )
  build = buildValueSeason(db, 'L1', SEASON)
  // Barkley: our RB1 (rosRank 1) vs the experts' RB4 → +3
  expect(row('4866')).toMatchObject({
    expert: { ecrRank: 5, ecrPosRank: 4, spread: 0.5, experts: 6, ecrDelta: 3 },
    market: { value: 9340, posRank: 1, tier: 1, trend30d: -310 }
  })
  // Cook: rosRank 3 vs RB20 → +17, no spread, no market row
  expect(row('8259')).toMatchObject({
    expert: { ecrPosRank: 20, spread: null, ecrDelta: 17 },
    market: null
  })
  expect(row('6794')).toMatchObject({ expert: null, market: null })
  expect(build.context.expert).toEqual({ scoring: 'PPR', ecrUpdatedAt: TS, marketUpdatedAt: TS })
  expect(build.rows.some((r) => r.playerId === 'JAX')).toBe(false)
})
```

`tests/main/db/playersWeek.test.ts` — add `import { replaceExpertRanks } from '@main/db/repos/expertRanks'` and, inside `describe('playersWeek')`, this test:

```ts
it("joins the week's FantasyPros row as PlayerWeekRow.expert", () => {
  replaceExpertRanks(
    db,
    S,
    1,
    'PPR',
    [
      {
        playerId: '4866',
        rankEcr: 1,
        posRank: 1,
        rankAve: 1.4,
        rankStd: 0.6,
        rankMin: 1,
        rankMax: 3,
        experts: 153,
        grade: 'A+',
        projPts: 22.4
      }
    ],
    SEED_TS
  )
  const { rows } = playersWeek(db, 'L1', S, 1)
  expect(rows.find((r) => r.playerId === '4866')?.expert).toEqual({
    ecrPosRank: 1,
    grade: 'A+',
    projPts: 22.4,
    spread: 0.6
  })
  expect(rows.find((r) => r.playerId === '6794')?.expert).toBeNull()
  expect(playersWeek(db, 'L1', S, 2).rows.find((r) => r.playerId === '4866')?.expert).toBeNull()
})
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/value/expert.test.ts tests/main/value/build.test.ts tests/main/db/playersWeek.test.ts`
Expected: FAIL — module not found; `expert: null` where a block is expected.

- [x] **Step 3: Write `src/main/value/expert.ts`**

```ts
import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import type { MarketValueRow } from '@main/db/repos/marketValues'
import type { ExpertRos, ExpertWeek, MarketValue } from '@shared/types'

/** What the build loads once per season, alongside the series (spec §4.2): ROS ranks + market values. */
export interface ExpertBundle {
  ranks: ExpertRankRow[]
  market: MarketValueRow[]
}

export const NO_EXPERTS: ExpertBundle = { ranks: [], market: [] }

export interface ExpertIndex {
  ranks: Map<string, ExpertRankRow>
  market: Map<string, MarketValueRow>
  /** `updated_at` of the stored rows (one replace writes one timestamp); null when nothing is stored. */
  ecrUpdatedAt: string | null
  marketUpdatedAt: string | null
}

export function indexExperts(bundle: ExpertBundle): ExpertIndex {
  return {
    ranks: new Map(bundle.ranks.map((r) => [r.playerId, r])),
    market: new Map(bundle.market.map((m) => [m.playerId, m])),
    ecrUpdatedAt: bundle.ranks[0]?.updatedAt ?? null,
    marketUpdatedAt: bundle.market[0]?.updatedAt ?? null
  }
}

/** Spec §4.2 sign convention: ecrPosRank − rosRank, positive = we rank the player higher than the experts. */
export function ecrDelta(ecrPosRank: number | null, rosRank: number | null): number | null {
  return ecrPosRank === null || rosRank === null ? null : ecrPosRank - rosRank
}

export function expertRos(
  rank: ExpertRankRow | undefined,
  rosRank: number | null
): ExpertRos | null {
  if (!rank) return null
  return {
    ecrRank: rank.rankEcr,
    ecrPosRank: rank.posRank,
    spread: rank.rankStd,
    experts: rank.experts,
    ecrDelta: ecrDelta(rank.posRank, rosRank)
  }
}

export function marketValue(row: MarketValueRow | undefined): MarketValue | null {
  if (!row) return null
  return { value: row.value, posRank: row.posRank, tier: row.tier, trend30d: row.trend30d }
}

export function expertWeek(rank: ExpertRankRow | undefined): ExpertWeek | null {
  if (!rank) return null
  return {
    ecrPosRank: rank.posRank,
    grade: rank.grade,
    projPts: rank.projPts,
    spread: rank.rankStd
  }
}
```

- [x] **Step 4: Wire the build — `src/main/value/build.ts`**

Imports: add

```ts
import { listExpertRanks, ROS_WEEK } from '@main/db/repos/expertRanks'
import { listMarketValues } from '@main/db/repos/marketValues'
import { expertRos, indexExperts, marketValue, NO_EXPERTS, type ExpertBundle } from './expert'
```

`assembleValue` signature becomes `export function assembleValue(bundle: SeriesBundle, experts: ExpertBundle = NO_EXPERTS): ValueBuild` and, right after `const roster = rosterRelative(…)`, add `const ex = indexExperts(experts)`. In the `rows` map, hoist the ROS rank and replace the two stubs:

```ts
    const rosRank = rosRanks.get(series.base.playerId) ?? null
    …
      rosRank,
      …
      expert: expertRos(ex.ranks.get(series.base.playerId), rosRank),
      market: marketValue(ex.market.get(series.base.playerId)),
```

Context: `expert: { scoring: scoringFormat(bundle.rules), ecrUpdatedAt: ex.ecrUpdatedAt, marketUpdatedAt: ex.marketUpdatedAt }`.

`buildValueSeason`:

```ts
export function buildValueSeason(db: Db, leagueId: string, season: number): ValueBuild {
  return assembleValue(loadSeries(db, leagueId, season), {
    ranks: listExpertRanks(db, season, ROS_WEEK),
    market: listMarketValues(db, season)
  })
}
```

- [x] **Step 5: Join the week — `src/main/db/repos/playersWeek.ts`**

Add imports `import { expertWeek } from '@main/value/expert'` and `import { listExpertRanks } from './expertRanks'`. In `playersWeek`, after `const byes = teamByeWeeks(db, season)`:

```ts
const experts = new Map(listExpertRanks(db, season, week).map((r) => [r.playerId, r]))
```

and in the row literal replace `expert: null,` with `expert: expertWeek(experts.get(r.player_id)),`.

- [x] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green; 285 → 290 tests. `series.test.ts` / `roster.test.ts` / `signals.test.ts` / `schedule.test.ts` are untouched (they never call `assembleValue` with a second argument, and the default keeps the old behaviour).

- [x] **Step 7: Commit**

```bash
git add src/main/value/expert.ts src/main/value/build.ts src/main/db/repos/playersWeek.ts tests/main/value/expert.test.ts tests/main/value/build.test.ts tests/main/db/playersWeek.test.ts
git commit -m "feat(value): attach expert ranks and market values"
```

---

### Task 7: Table view model — `expert` column kind and the two Experts groups

**Files:**

- Modify: `src/renderer/src/lib/playersTableView.ts` (`ColumnKind` / new `ExpertField` ~line 19–40; groups after `SIGNALS` ~160; `columnGroups` ~190–210; `cellValue` / `cellText` ~211–245; `sortValue` ~318–335; append the expert helpers at the end)
- Modify: `tests/renderer/lib/playersTableView.test.ts`

**Interfaces:**

- Consumes: `PlayerValueRow.expert` / `.market`, `PlayerWeekRow.expert` (Task 1).
- Produces: `ColumnKind` includes `'expert'`; `CellFormat` gains `'signedInt'` (sign + integer, no decimals — `+5`, `-310`); `ExpertField = 'ecrPosRank' | 'ecrDelta' | 'spread' | 'marketValue' | 'marketTrend' | 'weekPosRank' | 'weekGrade'`; `Column.expert?: ExpertField`; keys `expert:<field>`; `GRADE_ORDER`, `gradeValue(grade)`; `ECR_DELTA_TONE = 3`; `expertValue(row, field)`, `expertText(row, col)`, `expertTone(row, col): 'pos' | 'neg' | 'warn' | null`; `columnGroups` returns the Experts group after Signals (value) / after Fantasy (proj).

- [x] **Step 1: Update and add the tests**

`tests/renderer/lib/playersTableView.test.ts`:

- Import `expertText`, `expertTone`, `expertValue`, `GRADE_ORDER`, `ECR_DELTA_TONE` and `type ExpertField` from `@/lib/playersTableView`.
- `columnGroups` test `follows the tab and hides Δ / usage outside stats mode`: the `columnGroups('FLEX', 'proj')` expectation becomes `['Fantasy', 'Experts', 'Rushing', 'Receiving', 'Passing']` and `columnGroups('DEF', 'proj')` becomes `['Fantasy', 'Experts', 'Defense', 'Allowed']`. Stats-mode expectations stay (no Experts there).
- `value mode` › `has the same three groups on every tab` → rename to `has the same four groups on every tab`, labels `['Season', 'Rest of season', 'Signals', 'Experts']`, and append to the key list:
  ```ts
  ;('expert:ecrPosRank',
    'expert:ecrDelta',
    'expert:spread',
    'expert:marketValue',
    'expert:marketTrend')
  ```
- `mine group`: the destructuring becomes `const [, , , , mineGroup] = columnGroups('ALL', 'value', true)`; in `is the fourth value-mode group…` (rename to `is the fifth…`) the two label lists gain `'Experts'` before `'Mine'` / after `'Signals'`.
- Add a new describe:

```ts
describe('experts', () => {
  const valueCols = columnGroups('ALL', 'value')
    .flatMap((g) => g.columns)
    .filter((c) => c.kind === 'expert')
  const weekCols = columnGroups('RB', 'proj')
    .flatMap((g) => g.columns)
    .filter((c) => c.kind === 'expert')
  const col = (cols: Column[], field: ExpertField): Column => {
    const c = cols.find((c) => c.expert === field)
    if (!c) throw new Error(`no column for ${field}`)
    return c
  }
  const withExperts = valueRow({
    expert: { ecrRank: 12, ecrPosRank: 4, spread: 2.5, experts: 6, ecrDelta: 5 },
    market: { value: 9340, posRank: 1, tier: 1, trend30d: -310 }
  })

  it('projection mode has ECR and GRADE after Fantasy; stats mode has no Experts group', () => {
    expect(columnGroups('QB', 'proj').map((g) => g.label)).toEqual([
      'Fantasy',
      'Experts',
      'Passing',
      'Rushing'
    ])
    expect(weekCols.map((c) => [c.key, c.label])).toEqual([
      ['expert:weekPosRank', 'ECR'],
      ['expert:weekGrade', 'GRADE']
    ])
    expect(columnGroups('QB', 'stats').map((g) => g.label)).not.toContain('Experts')
    expect(valueCols.map((c) => c.label)).toEqual(['ECR', 'Δ ECR', 'SPREAD', 'MKT', 'TREND'])
    expect(valueCols.every((c) => c.description)).toBe(true)
  })

  it('reads value-row cells through cellValue and formats them; nulls render —', () => {
    expect(valueCols.map((c) => cellValue(withExperts, c, 'value'))).toEqual([
      4, 5, 2.5, 9340, -310
    ])
    expect(valueCols.map((c) => expertText(withExperts, c))).toEqual([
      '4',
      '+5',
      '2.5',
      '9340',
      '-310'
    ])
    expect(valueCols.map((c) => expertText(valueRow(), c))).toEqual(['—', '—', '—', '—', '—'])
    expect(cellValue(row(), col(valueCols, 'ecrPosRank'), 'proj')).toBeNull()
  })

  it('reads week-row cells: ECR as a number, GRADE as a letter sorting by GRADE_ORDER', () => {
    const graded = row({ expert: { ecrPosRank: 7, grade: 'B+', projPts: 14.2, spread: 1.1 } })
    expect(expertValue(graded, 'weekPosRank')).toBe(7)
    expect(expertValue(graded, 'weekGrade')).toBe(GRADE_ORDER.indexOf('B+'))
    expect(expertText(graded, col(weekCols, 'weekGrade'))).toBe('B+')
    expect(expertText(graded, col(weekCols, 'weekPosRank'))).toBe('7')
    expect(expertText(row(), col(weekCols, 'weekGrade'))).toBe('—')
    expect(
      expertValue(
        row({ expert: { ecrPosRank: 7, grade: 'Z', projPts: null, spread: null } }),
        'weekGrade'
      )
    ).toBeNull()
    expect(expertValue(withExperts, 'weekGrade')).toBeNull()
    expect(GRADE_ORDER[0]).toBe('F')
    expect(GRADE_ORDER.at(-1)).toBe('A+')
  })

  it('tones Δ ECR: green above +3, amber below −3, none in between; TREND by sign; the rest none', () => {
    const delta = col(valueCols, 'ecrDelta')
    const tone = (ecrDelta: number | null): ReturnType<typeof expertTone> =>
      expertTone(
        valueRow({ expert: { ecrRank: 1, ecrPosRank: 1, spread: null, experts: 6, ecrDelta } }),
        delta
      )
    expect(ECR_DELTA_TONE).toBe(3)
    expect(tone(4)).toBe('pos')
    expect(tone(3)).toBeNull()
    expect(tone(0)).toBeNull()
    expect(tone(-3)).toBeNull()
    expect(tone(-4)).toBe('warn')
    expect(tone(null)).toBeNull()
    expect(expertTone(withExperts, col(valueCols, 'marketTrend'))).toBe('neg')
    expect(expertTone(withExperts, col(valueCols, 'ecrPosRank'))).toBeNull()
    expect(expertTone(withExperts, col(valueCols, 'marketValue'))).toBeNull()
    expect(expertTone(valueRow(), delta)).toBeNull()
  })

  it('sorts by an expert column with nulls last, in both modes', () => {
    const rows = [
      valueRow({ playerId: 'a', fullName: 'A' }),
      withExperts,
      valueRow({
        playerId: 'c',
        fullName: 'C',
        expert: { ecrRank: 2, ecrPosRank: 1, spread: null, experts: 6, ecrDelta: -2 }
      })
    ]
    expect(
      sortRows(rows, { key: 'expert:ecrDelta', dir: 'desc' }, 'value').map((r) => r.playerId)
    ).toEqual(['v1', 'c', 'a'])
    expect(
      sortRows(rows, { key: 'expert:ecrDelta', dir: 'asc' }, 'value').map((r) => r.playerId)
    ).toEqual(['c', 'v1', 'a'])
    const weeks = [
      row({
        playerId: 'x',
        fullName: 'X',
        expert: { ecrPosRank: 3, grade: 'C', projPts: null, spread: null }
      }),
      row({
        playerId: 'y',
        fullName: 'Y',
        expert: { ecrPosRank: 1, grade: 'A+', projPts: null, spread: null }
      }),
      row({ playerId: 'z', fullName: 'Z' })
    ]
    expect(
      sortRows(weeks, { key: 'expert:weekGrade', dir: 'desc' }, 'proj').map((r) => r.playerId)
    ).toEqual(['y', 'x', 'z'])
  })

  it('titles expert headers with their description', () => {
    expect(valueHeaderTitle(col(valueCols, 'ecrDelta'), null, ['RB'])).toContain('positive')
  })
})
```

- [x] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/renderer/lib/playersTableView.test.ts`
Expected: FAIL — group lists differ; `expertText` etc. not exported.

- [x] **Step 3: Implement in `src/renderer/src/lib/playersTableView.ts`**

Types (replace the `ColumnKind` line and extend `Column`):

```ts
export type ColumnKind =
  | 'points'
  | 'delta'
  | 'stat'
  | 'snapPct'
  | 'targetShare'
  | 'value'
  | 'signal'
  | 'droppable'
  | 'expert'
/** Value rows read `expert` (ROS) and `market`; week rows read `expert` (this week's ECR + grade). */
export type ExpertField =
  'ecrPosRank' | 'ecrDelta' | 'spread' | 'marketValue' | 'marketTrend' | 'weekPosRank' | 'weekGrade'
export type CellFormat = 'int' | 'fixed' | 'signed' | 'signedInt' | 'pct' | 'signedPct'
```

(`CellFormat` replaces the existing line — `signedInt` is for integer quantities that carry a sign; `fmtSigned` always prints one decimal.) In `Column`, after `signal?: SignalField`, add `expert?: ExpertField` and extend the `key` doc comment with `` `expert:<field>` ``.

After the `SIGNALS` group:

```ts
const expert = (
  field: ExpertField,
  label: string,
  format: CellFormat,
  description: string
): Column => ({
  key: `expert:${field}`,
  label,
  kind: 'expert',
  expert: field,
  format,
  description
})
/** Slice 5 spec §4.3: outside opinion next to our numbers; Δ ECR is the headline. */
const EXPERTS_VALUE = group('Experts', [
  expert(
    'ecrPosRank',
    'ECR',
    'int',
    'FantasyPros rest-of-season expert consensus rank within the position'
  ),
  expert(
    'ecrDelta',
    'Δ ECR',
    'signedInt',
    'ECR minus our ROS RK: positive = we rank the player higher than the experts (a buy cue above +3), negative = lower (a sell-high cue below −3)'
  ),
  expert(
    'spread',
    'SPREAD',
    'fixed',
    "Standard deviation of the experts' ROS ranks — how much they disagree"
  ),
  expert(
    'marketValue',
    'MKT',
    'int',
    'FantasyCalc trade-market value, from real redraft trades (top ~130 players only)'
  ),
  expert('marketTrend', 'TREND', 'signedInt', '30-day change of the FantasyCalc value')
])
const EXPERTS_WEEK = group('Experts', [
  expert(
    'weekPosRank',
    'ECR',
    'int',
    'FantasyPros start/sit expert consensus rank within the position for this week'
  ),
  expert(
    'weekGrade',
    'GRADE',
    'int',
    'FantasyPros start/sit grade for this week (A+ … F); sorts best first'
  )
])
```

`columnGroups`:

```ts
export function columnGroups(tabId: string, mode: TableMode, mine = false): ColumnGroup[] {
  if (mode === 'value')
    return mine
      ? [SEASON, REST_OF_SEASON, SIGNALS, EXPERTS_VALUE, MINE]
      : [SEASON, REST_OF_SEASON, SIGNALS, EXPERTS_VALUE]
  const fantasy = group('Fantasy', mode === 'stats' ? [POINTS, DELTA] : [POINTS])
  const experts = mode === 'proj' ? [EXPERTS_WEEK] : []
  const usage = (...cols: Column[]): ColumnGroup[] =>
    mode === 'stats' ? [group('Usage', cols)] : []
  switch (tabId) {
    case 'QB':
      return [fantasy, ...experts, PASSING_QB, RUSHING, ...usage(SNAP)]
    case 'K':
      return [fantasy, ...experts, FIELD_GOALS, XP]
    case 'DEF':
      return [fantasy, ...experts, DEFENSE, ALLOWED]
    default:
      return [fantasy, ...experts, RUSHING, RECEIVING, PASSING, ...usage(SNAP, TGT)]
  }
}
```

`cellValue`: add as the first line `if (col.kind === 'expert') return col.expert ? expertValue(row, col.expert) : null`.

`cellText`: change the format branch condition to `if (col.kind === 'value' || col.kind === 'signal' || col.kind === 'expert') {` and add, after the `'signed'` line inside it, `if (col.format === 'signedInt') return `${value > 0 ? '+' : ''}${value}``.

`sortValue`: after the `signal:` branch add

```ts
if (key.startsWith('expert:')) return expertValue(row, key.slice(7) as ExpertField)
```

Update the `TableSort.key` doc comment to include `` `expert:<field>` ``.

Append at the end of the file:

```ts
/** FantasyPros start/sit grades, worst to best; the GRADE column sorts by this index. */
export const GRADE_ORDER = [
  'F',
  'D-',
  'D',
  'D+',
  'C-',
  'C',
  'C+',
  'B-',
  'B',
  'B+',
  'A-',
  'A',
  'A+'
] as const

export function gradeValue(grade: string | null): number | null {
  if (grade === null) return null
  const i = (GRADE_ORDER as readonly string[]).indexOf(grade)
  return i === -1 ? null : i
}

/** Numeric value of an expert column (sorting, colouring): ROS/market fields on value rows, weekly fields on week rows. */
export function expertValue(row: TableRow, field: ExpertField): number | null {
  if (isValueRow(row)) {
    switch (field) {
      case 'ecrPosRank':
        return row.expert?.ecrPosRank ?? null
      case 'ecrDelta':
        return row.expert?.ecrDelta ?? null
      case 'spread':
        return row.expert?.spread ?? null
      case 'marketValue':
        return row.market?.value ?? null
      case 'marketTrend':
        return row.market?.trend30d ?? null
      default:
        return null
    }
  }
  if (field === 'weekPosRank') return row.expert?.ecrPosRank ?? null
  if (field === 'weekGrade') return gradeValue(row.expert?.grade ?? null)
  return null
}

/** Text of an expert cell: the grade letter for GRADE, else the formatted number; "—" for null. */
export function expertText(row: TableRow, col: Column): string {
  if (!col.expert) return '—'
  if (col.expert === 'weekGrade') return isWeekRow(row) ? (row.expert?.grade ?? '—') : '—'
  return cellText(expertValue(row, col.expert), col, 'value')
}

/** Spec §4.3: |Δ ECR| beyond this is a cue — green (we like them more: buy), amber (we like them less: sell high). */
export const ECR_DELTA_TONE = 3

/** Colour of an expert cell: Δ ECR by the cue thresholds, other signed columns (TREND) by sign, the rest none. */
export function expertTone(row: TableRow, col: Column): 'pos' | 'neg' | 'warn' | null {
  if (!col.expert) return null
  const v = expertValue(row, col.expert)
  if (v === null) return null
  if (col.expert === 'ecrDelta')
    return v > ECR_DELTA_TONE ? 'pos' : v < -ECR_DELTA_TONE ? 'warn' : null
  if (col.format === 'signed' || col.format === 'signedInt') return v >= 0 ? 'pos' : 'neg'
  return null
}
```

- [x] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green; 290 → 296 tests. (`ValueHelp.tsx` still compiles: its Signals list filters on `kind === 'signal'`.)

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/lib/playersTableView.ts tests/renderer/lib/playersTableView.test.ts
git commit -m "feat(ui): Experts column groups in the table model"
```

---

### Task 8: Players screen cells, help panel, data reference, dev-app check

**Files:**

- Modify: `src/renderer/src/screens/PlayersScreen.tsx:18-34` (imports), `~417-450` (cell tone + text)
- Modify: `src/renderer/src/components/ValueHelp.tsx` (imports; a new section between Signals and Mine; the footer line)
- Modify: `docs/reference/value-and-signals.md`

**Interfaces:**

- Consumes: `expertText`, `expertTone` (Task 7); `ValueContext.expert` (Task 1); `relativeTime` (`@/lib/format`).

- [x] **Step 1: Render expert cells in `PlayersScreen.tsx`**

Add `expertText,` and `expertTone,` to the `@/lib/playersTableView` import (alphabetically after `DEFAULT_SORT`, before `filterRows`). In the cell map:

```tsx
const tone =
  col.kind === 'signal'
    ? signalTone(p, col)
    : col.kind === 'expert'
      ? expertTone(p, col)
      : col.kind === 'droppable'
        ? value !== null
          ? 'neg'
          : null
        : signed && value !== null
          ? value >= 0
            ? 'pos'
            : 'neg'
          : null
```

and in the `<TableCell>`:

```tsx
                    className={cn(
                      'text-right tabular-nums',
                      (col.kind === 'points' || col.field === 'rosValue') && 'font-medium',
                      tone === 'pos' && 'text-pos-rb',
                      tone === 'neg' && 'text-destructive',
                      tone === 'warn' && 'text-amber-400'
                    )}
                  >
                    {col.kind === 'signal'
                      ? signalText(p, col)
                      : col.kind === 'expert'
                        ? expertText(p, col)
                        : cellText(value, col, effectiveMode)}
```

- [x] **Step 2: Add the Experts section to `ValueHelp.tsx`**

Add `import { relativeTime } from '@/lib/format'`. Between the Signals `</dl>` and `{context?.hasMyTeam && (`:

```tsx
      <h3 className="mt-5 text-sm font-semibold">Experts</h3>
      <dl className="mt-2 space-y-3 text-sm">
        {columnGroups('ALL', 'value')
          .flatMap((g) => g.columns)
          .filter((c) => c.kind === 'expert')
          .map((c) => (
            <Term key={c.key} name={c.label}>
              {c.description}
            </Term>
          ))}
        <Term name="Sources">
          FantasyPros expert consensus rankings (ECR), fetched in{' '}
          {context?.expert.scoring ?? 'PPR'} scoring because this league awards{' '}
          {context?.expert.scoring === 'PPR'
            ? 'a full point or more'
            : context?.expert.scoring === 'HALF'
              ? 'less than a point'
              : 'nothing'}{' '}
          per reception; FantasyCalc trade values, computed from real redraft trades and
          independent of scoring. In Projection mode the Experts group shows the week&apos;s
          start/sit ECR and grade from the same FantasyPros source. Neither source is fetched for
          past seasons, so their columns are empty there.
        </Term>
        <Term name="Reading Δ ECR">
          Both ranks are ordinal within the position, so +9 on an RB means the experts rank him
          nine RB spots lower than our ROS VAL does. FLEX is folded into our replacement level but
          not into ECR, so RB/WR/TE gaps deserve a second look. Above +3 reads green (a buy cue),
          below −3 amber (a sell-high cue); the experts&apos; SPREAD says how much they agree.
        </Term>
        <Term name="Freshness">
          ECR updated {relativeTime(context?.expert.ecrUpdatedAt)} · market values updated{' '}
          {relativeTime(context?.expert.marketUpdatedAt)}. Rankings refresh with the rest of the
          data: the current week&apos;s ECR every 3 h, rest-of-season ECR and market values every
          12 h; a scoring change re-fetches the rankings on the next refresh.
        </Term>
      </dl>
```

- [x] **Step 3: Update `docs/reference/value-and-signals.md`**

- Intro paragraph: "the current v0.6.0 presentation" → "the current v0.8.0 presentation"; add a sentence after the rationale line: "Slice 5 (expert layer) rationale: `docs/superpowers/specs/2026-09-18-slice5-expert-layer-design.md`."
- `## How the data reaches the renderer` table: add a row
  `| `week({ season, week })`|`PlayersWeek { rows: PlayerWeekRow[] }`| Same candidates with one week of data; since v0.8.0 each row also carries`expert: ExpertWeek \| null`— this week's FantasyPros`{ ecrPosRank, grade, projPts, spread }`. |`
- `## ValueContext` table: add `| `expert`|`{ scoring, ecrUpdatedAt, marketUpdatedAt }`: the FantasyPros scoring bucket derived from the rules' `rec` points (`PPR`≥ 1,`HALF`in (0, 1), else`STD`), and the `updated_at` of the stored ROS rankings / market values (`null` when none are stored — e.g. a past season). |`
- After `### Roster-relative (added in v0.7.0)` add:

```markdown
### Experts (added in v0.8.0)

Slice 5 spec §4; attached in `src/main/value/expert.ts` from `expert_ranks` (week 0 = rest of season) and `market_values`, both synced by `src/main/sync/expertSync.ts` from keyless endpoints (FantasyPros legacy partner API, FantasyCalc). Current season only; both blocks are `null` for past seasons.

| Field               | Definition                                                                                                                                                                                                                                                                            | `null` when                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `expert.ecrRank`    | FantasyPros rest-of-season expert consensus rank, overall across positions.                                                                                                                                                                                                           | no FP ROS row for the player (whole block `null`) |
| `expert.ecrPosRank` | The same rank within the player's position (numeric part of FP's `RB12`).                                                                                                                                                                                                             | —                                                 |
| `expert.spread`     | `rank_std`: standard deviation of the experts' ranks — disagreement.                                                                                                                                                                                                                  | FP omits it                                       |
| `expert.experts`    | Number of experts behind the consensus (ROS: ~6).                                                                                                                                                                                                                                     | —                                                 |
| `expert.ecrDelta`   | `ecrPosRank − rosRank`. **Positive = we rank the player higher than the experts** (they are cheaper than we think: buy cue); negative = lower (sell-high cue). No team-count adjustment: both ranks are ordinal within position, but FLEX is in our replacement level and not in ECR. | no `rosRank`                                      |
| `market.value`      | FantasyCalc redraft trade value (top ≈ 10 000), from real Sleeper/MFL trades; format-agnostic.                                                                                                                                                                                        | outside FantasyCalc's list (whole block `null`)   |
| `market.posRank`    | FantasyCalc rank within position.                                                                                                                                                                                                                                                     | —                                                 |
| `market.tier`       | FantasyCalc tier.                                                                                                                                                                                                                                                                     | FantasyCalc gives none                            |
| `market.trend30d`   | 30-day change of `value`.                                                                                                                                                                                                                                                             | —                                                 |

Join (spec §3.3): FP `player_id` → `crosswalk.fantasypros_id` → Sleeper id, else normalized name + position against Sleeper players, DST by team code through `FP_TO_SLEEPER_TEAM` (`JAC → JAX`); unmatched rows are dropped and counted in the step message. FantasyCalc rows join on their own `sleeperId`.
```

- `## Where each number is shown today (v0.7.0)` → `(v0.8.0)`; in the Value-mode table add after the Signals rows and before Mine:

```markdown
| Experts | ECR | `expert.ecrPosRank` | integer | — |
| | Δ ECR | `expert.ecrDelta` | signed integer | green > +3 / amber < −3 |
| | SPREAD | `expert.spread` | 1 decimal | — |
| | MKT | `market.value` | integer | — |
| | TREND | `market.trend30d` | signed integer | green ≥ 0 / red < 0 |
```

and a paragraph after the table's notes: "**Projection mode** gains an Experts group right after Fantasy on every tab: `ECR` (`PlayerWeekRow.expert.ecrPosRank`) and `GRADE` (`expert.grade`, shown as the letter, sorted by `GRADE_ORDER`). Stats mode is unchanged. Not shown: `expert.ecrRank`, `expert.experts`, `market.posRank`, `market.tier`, `ExpertWeek.projPts` / `.spread`."

- `## Constants` table: add rows
  `| `src/main/sync/expertSync.ts`|`FP_PAST_WEEK_FRESHNESS_MS = 30 d`, `FP_CURRENT_WEEK_FRESHNESS_MS = 3 h`, `FP_ROS_FRESHNESS_MS = 12 h`, `FANTASYCALC_FRESHNESS_MS = 12 h`, `WEEKLY_POSITIONS = FLX QB K DST` |`
  `| `src/shared/rules.ts`, `src/shared/teams.ts`|`scoringFormat(rules)`(rec ≥ 1 PPR / (0, 1) HALF / STD),`FP_TO_SLEEPER_TEAM = { JAC: 'JAX' }` |`
  and extend the `playersTableView.ts` row with `` `ECR_DELTA_TONE = 3`, `GRADE_ORDER` (F … A+) ``.
- `## Module map`: add rows
  `| `src/main/value/expert.ts`| Pure attach of the expert / market blocks and`ecrDelta`; `expertWeek` for the week rows. |`
  `| `src/main/sync/expertSync.ts`, `src/main/sources/{fantasypros,fantasycalc}.ts`, `src/main/db/repos/{expertRanks,marketValues}.ts`| Expert-layer sync: clients, FP → Sleeper join, one`sync_log` step per unit, replace-per-key storage. |`

- [x] **Step 4: Verify, then check in the dev app against the live endpoints**

Run: `npm run typecheck && npm run lint && npm test` — green, 296 tests.

Dev app (`npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu`, stop by PID afterwards): press Refresh and confirm in the status bar / `sync_log` that `fantasypros:weekly:2026:{1..current}`, `fantasypros:ros:2026` and `fantasycalc:2026` ran `ok` with "N matched, M unmatched" messages (note the counts in the progress notes; expect a few dozen unmatched FP rows at most — investigate any DST unmatched by extending `FP_TO_SLEEPER_TEAM`). Then:

- Value mode, ALL tab: the Experts group shows after Signals; sort by `Δ ECR` both ways; hover the `Δ ECR` header; open ⓘ and read the Experts section (scoring `PPR`, freshness "x min ago").
- Projection mode, current week, RB tab: `ECR` and `GRADE` populated after Fantasy; a past week shows the stored ranks; a future week (if any) shows `—`.
- Switch the season select to 2025: Experts cells all `—`, help says "never" for freshness.
- Record the uncached `players.value` build time from the main-process log if it is printed, else skip.

- [x] **Step 5: Commit**

```bash
git add src/renderer/src/screens/PlayersScreen.tsx src/renderer/src/components/ValueHelp.tsx docs/reference/value-and-signals.md
git commit -m "feat(ui): Experts cells, help section, data reference"
```

---

### Task 9: Version 0.8.0, Windows build, tag

Only after the user has checked Task 8 in the dev app and asked for the build.

- [x] **Step 1:** `package.json` / `package-lock.json` version `0.7.0` → `0.8.0`; `npm run typecheck && npm run lint && npm test`; commit `build: bump version to 0.8.0` (with the Co-Authored-By trailer).
- [x] **Step 2:** `npm run build:win`; copy `dist/FantasyCompanion-Setup-0.8.0.exe` to `/mnt/c/Users/habie/OneDrive/Bureau/`.
- [ ] **Step 3:** User installs over 0.7.0 — this one **migrates** (005): on first launch the crosswalk is re-downloaded (its `sync_log` rows were cleared), identity re-resolves, then the expert steps run. Check the status bar shows no error, that Value mode has the Experts group populated, and that a couple of `Δ ECR` extremes read sensibly (a big positive on a player we like more than the market; a big negative on one we like less). Record the FP match counts in the progress notes.
- [x] **Step 4:** Progress notes appended to this plan, commit `docs(plan): mark plan H complete`, tag `v0.8.0`, fast-forward `main`, delete the branch.

---

## Self-review notes

- **Spec coverage:** §1 constraint (keyless JSON, isolated steps — T3 clients, T5 one `runStep` per unit; non-goals respected: no draft snapshot, no history, no injuries, no LLM, no past-season fetch — T5 current season only, T6/T8 empty cells). §2 sources and facts: FLX remap and separate QB/K/DST calls (T5 `WEEKLY_POSITIONS`), `count: 0` before publication (T5 `NOT_PUBLISHED_MESSAGE`), string-typed `rank_*` (T3 `num`), DST team-level ids + `JAC` (T2 `FP_TO_SLEEPER_TEAM`, T5 `joinFantasyPros`), FantasyCalc `sleeperId` join + `numTeams` + `ppr` (T5). §3.1 clients (T3). §3.2 step keys, freshness buckets, regular-season gate, weekly stop on 404/410, `count: 0` → skipped, scoring format from `rec`, `numQbs` from `SUPER_FLEX`, scoring-change staleness for FP only, cache invalidation via `onStep` (T5; global constraint). §3.3 migration 005 with `fantasypros_id` + crosswalk freshness reset (T2), id → name fallback → dropped and counted with the exact "{matched} matched, {unmatched} unmatched" message (T5), DST alias (T2/T5), unknown Sleeper id stored anyway (T6 test `JAX`). §3.4 tables and replace-per-key writes in one transaction (T2, T4, T5 `withTransaction`). §4.1 shared types (T1; `spread` nullable deviation noted). §4.2 pure `value/expert.ts`, loaded once per build, `players.week` join, no new IPC, ordinal-rank note in help (T6, T8). §4.3 `Column.kind = 'expert'`, Experts groups in value (after Signals, before Mine) and proj (after Fantasy) modes, stats unchanged, `Δ ECR` tones ±3, sorting with nulls last (T7), help paragraph with sources / scoring / meaning / freshness / FLEX / past seasons (T8), data reference (T8). §6 sync side: gated/removed → error or skipped with stored rows kept and age in help (T5, T8); not published → skipped; off-season → one skip; crosswalk failure → `0 matched, N unmatched` (T5 join yields nothing without ids — covered by the name fallback only for players whose names match). Read side: `ecrDelta` null rules (T6), `market` null (T6), empty cells sorted last (T7). §7 fixtures (T3), pure units (T1 `scoringFormat`, T3 mappers, T5 `numQbsFor` / join, T6 attach + sign), sync steps with fake fetch/clients (T5: freshness, `count: 0`, 404 stop, scoring change, unmatched message, `onStep` statuses), repos (T4) and migration (T2), renderer view functions (T7), manual (T8, T9). §8 files: all created/modified as listed (`sleeperNews.ts`, `newsView.ts`, `PlayerDetailPanel` news are Plan I). §9 row H → `v0.8.0` (T9).
- **Placeholder scan:** none — the Task 1 `expert: null` / `market: null` / `ecrUpdatedAt: null` stubs are code steps replaced in Task 6; every test and implementation step shows its code; the dev-app check lists concrete things to look at.
- **Type consistency:** `ScoringFormat` (T1) is what `FpQuery.scoring` (T3), `replaceExpertRanks` / `storedScoring` / `ExpertRankRow.scoring` (T4), `scoringFormat` (T1) and `ExpertContext.scoring` (T1) use. `FpRankings.players: FpPlayer[]` + `.totalExperts` (T3) feed `joinFantasyPros(players, experts, index)` → `ExpertRankRecord[]` (T5 → T4 `replaceExpertRanks`). `FcRecord.sleeperId/positionRank/trend30Day/tier` (T3) map onto `MarketValueRecord.playerId/posRank/trend30d/tier` (T5 → T4). `listExpertRanks` returns `ExpertRankRow[]` (T4) which is `ExpertBundle.ranks` (T6) and the map values `expertRos` / `expertWeek` take; `listMarketValues` → `MarketValueRow[]` → `marketValue`. `assembleValue(bundle, experts = NO_EXPERTS)` keeps every existing caller valid. `ExpertSyncDeps extends SyncDeps` (T5) so `runStep(deps, …)` accepts it; `AppSyncDeps = NflverseSyncDeps & ExpertSyncDeps` satisfies `refreshSleeper` (`SyncDeps`), `refreshNflverse` (`NflverseSyncDeps`) and `refreshExperts`; `syncDeps(ctx)` (T5) returns it with the two clients that `AppContext` (T5) and `index.ts` (T5) provide. `Column.expert?: ExpertField` and keys `expert:<field>` (T7) are what `cellValue`, `sortValue`, `expertText`, `expertTone` (T7) and the screen (T8) switch on; `expertTone`'s `'warn'` maps to `text-amber-400` (T8); the `'signedInt'` `CellFormat` (T7) is what `cellText` renders and `expertTone` treats as signed. `columnGroups(tab, 'value', true)` now yields five groups: the test destructuring and the `ValueHelp` Mine filter (by label) both handle it (T7, T8). `ValueContext.expert.ecrUpdatedAt` / `.marketUpdatedAt` (T1, T6) are what `ValueHelp` formats with `relativeTime` (T8).

## Progress notes (2026-09-19)

- Tasks 1–9 executed inline on `feat/expert-rankings`; typecheck, lint and Vitest clean at every commit (256 → 296 tests, exactly as planned). Task 8 checked by the user in the WSL dev app: "fine".
- **Live sync (dev DB, 2026-09-19, week 2):** after migration 005 the crosswalk re-downloaded (12 502 rows, 5 000+ with both `fantasypros_id` and `sleeper_id`); `fantasypros:weekly:2026:1` → `579 matched, 1 unmatched`, `fantasypros:weekly:2026:2` → `610 matched, 1 unmatched`, `fantasypros:ros:2026` → `404 matched, 0 unmatched`, `fantasycalc:2026` → 197 rows, none without a Sleeper id. Week 1 stored 578 rows for 579 written (one FP row pair resolved to the same Sleeper id — harmless `INSERT OR REPLACE`). No DST row unmatched, so `FP_TO_SLEEPER_TEAM` stays `{ JAC: 'JAX' }`.
- **Timing:** `buildValueSeason` on the dev DB copy 180–185 ms (Plan G: 185–191 ms) — the expert attach is noise. The four expert steps take ~1.2 s of wall time on a warm network.
- **Real-data sanity read:** 828 candidates, 391 with a ROS ECR block, 197 with a market block; week 2 rows: 594 with a weekly block (grades present, e.g. Stafford ECR#15 C proj 17.6). My roster: McBride TE ros#1 / ECR#1 (Δ 0), Cook RB ros#7 / ECR#3 (Δ −4), Coker WR ros#24 / ECR#45 (Δ +21), Mevis K Δ +6, Odunze WR Δ −9, Singleton RB Δ −15. Extremes are players without projections: Tyreek Hill ros#280 vs ECR 135 (Δ −145), Charbonnet Δ −124; top positive Demarcus Robinson Δ +40. 2025: no expert rows, both timestamps `null`. Reads as intended.
- **Deviations from the task text:**
  - Task 1: the `tests/shared/rules.test.ts` helper needed an explicit `: Rules` return type and the "no `rec` entry" case uses `delete scoring.rec` (the destructuring form tripped `no-unused-vars`).
  - Task 3/5/7: Prettier re-wrapped several long test lines (`npm run format` equivalent on the touched files only).
  - Task 9: killing the dev app with a `pgrep -f` pattern that appears in the command line itself kills the harness shell (same trap as Plan G); the app was stopped by PID and the version bump re-run separately.
- Windows build: `dist/FantasyCompanion-Setup-0.8.0.exe` (94 MB), copied to `C:\Users\habie\OneDrive\Bureau`. Install over 0.7.0 (migration 005 → crosswalk re-download → expert steps on first launch) pending the user's check (Task 9 step 3).
