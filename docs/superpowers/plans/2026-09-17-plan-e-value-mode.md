# Plan E — Value Mode (slice 4, phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every player a league-aware value — points per game and rest-of-season projected points over the replacement level implied by the league's roster slots — shown as a third `Value` mode of the Players table and in the header of the player detail panel.

**Architecture:** A new `src/main/value/` package loads one season of per-player week series in a single pass (`series.ts`: points, scored projections, Sleeper-keyed stat lines, usage shares, opponents), computes replacement levels with greedy FLEX allocation (`replacement.ts`, pure) and assembles `PlayerValueRow`s plus a per-player detail (`build.ts`). Two IPC calls (`players.value`, `players.detail`) read a per-(league, season) cache in `handlers.ts` that is cleared with the week cache on sync and rules changes but **not** on watchlist toggles (watched is decorated at serve time). The renderer generalises `playersTableView.ts` over a shared `PlayerBaseRow`, adds `VALUE` column groups, and moves the slide-over into `PlayerDetailPanel.tsx`, which replaces `players.weeklyStats` with `players.detail` and drops the renderer-side nflverse key mapping.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4, shadcn primitives, `node:sqlite`, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-slice4-value-and-signals-design.md` (§2, §5, §6.1 Season + Rest-of-season groups, §6.2 items 1 and 6, §6.3, §7, §8, §10 row E). **Builds on:** `v0.4.0`: `playersWeek.ts` (candidate query, adapters, `scoreStatLine`), `weekCache` in `handlers.ts`, `playersTableView.ts`, `PlayersScreen.tsx`, `SlideOver`, `tests/fixtures/db.ts` (`seedLeague`, league `L1`, 2 teams), `tests/fixtures/nflverse.ts`, `tests/fixtures/rules.ts` (`rules()`: QB1 RB2 WR2 TE1 FLEX1 K1 DEF1, PPR, `rush_yd 0.1`, `rec 1`, `rec_yd 0.1`).

## Global Constraints

- Same as Plans C/D: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use`), `node:sqlite` only, no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`; repositories never open transactions.
- Every read behind the screen is SQLite-only in the main process. The renderer formats; it never computes points or values.
- No new tables, no migration, no persisted computed values (spec non-goals). Everything is rebuilt from the DB and cached in memory.
- Stat keys in the detail game log are **Sleeper's vocabulary** (`rush_att`, `rec_tgt`, …) plus the display-only keys `fga`, `xpa`, `fgm_0_39` — the same line the table shows.
- **Do not saturate the window**: Value mode adds one toggle option and the two column groups listed in Task 7, nothing else. No new buttons.
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits, summary ≤ 50 chars, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Branch `feat/value-mode` from `main`.
- Existing `tests/**` are typechecked: when a shared type gains a required field, update the fixture literals named in the task.
- Spec deviations locked in here: IPC calls take `season` only (the app has one active league, like every other handler); `ValueContext.replacement[pos]` is `{ std: ReplacementLevel | null; ros: ReplacementLevel | null }` with `starters` inside each (the greedy FLEX allocation can differ between the two metrics); `signals`, `vsMine`, `droppable`, `ownerIsMe` and `PlayerDetail.schedule` are added by Plans F/G, not here.

---

## File map

| File | Responsibility |
|---|---|
| `src/shared/rules.ts` (modify) | `LINEUP_POSITIONS`, `FLEX_ELIGIBILITY`, `asPosition` — shared by the week query, the value package and the tabs |
| `src/shared/types.ts` (modify) | `TableMode` gains `'value'`; `PlayerBaseRow`; `PlayerWeekRow extends PlayerBaseRow`; `PlayerValueRow`, `ReplacementLevel`, `ValueContext`, `PlayersValue`, `DetailWeek`, `PlayerDetail`; `WeekStats`/`WeekSnaps` removed (Task 8) |
| `src/shared/ipc.ts` (modify) | `players.value`, `players.detail`; `weeklyStats` removed (Task 8) |
| `src/preload/index.ts` (modify) | wire the two calls |
| `src/main/db/repos/playersWeek.ts` (modify) | export `listCandidates`, `baseRow`; use the shared position constants |
| `src/main/db/repos/stats.ts`, `points.ts`, `projections.ts` (modify) | season-wide list functions |
| `src/main/value/series.ts` (create) | `loadSeries` — the only value module that touches the DB |
| `src/main/value/replacement.ts` (create) | `starterCounts`, `replacementLevels` — pure |
| `src/main/value/build.ts` (create) | `assembleValue` (pure), `buildValueSeason`, `detailFor` |
| `src/main/ipc/handlers.ts` (modify) | `valueCache`, `invalidateCaches`, two handlers; `weeklyStats` handler removed |
| `src/main/db/repos/playersQuery.ts` (delete, Task 8) | superseded by `players.detail` |
| `src/renderer/src/lib/format.ts` (modify) | `fmtSigned` |
| `src/renderer/src/lib/playersTableView.ts` (modify) | `TableRow`, value columns, generic filter/sort, `DEFAULT_SORT`, `replacementLabel` |
| `src/renderer/src/components/PlayerDetailPanel.tsx` (create) | slide-over body: header strip + game log |
| `src/renderer/src/screens/PlayersScreen.tsx` (modify) | third mode, value fetch, week select hidden in Value mode, panel extraction |
| `tests/fixtures/season.ts` (create) | `seedSeason` — one 2026 season on league L1 shared by the value tests |
| `tests/main/value/replacement.test.ts`, `series.test.ts`, `build.test.ts`, `tests/main/db/seasonReads.test.ts` (create) | per-module tests |
| `tests/renderer/lib/playersTableView.test.ts`, `tests/main/db/playersQuery.test.ts` (modify) | value columns; `playerWeeklyStats` test removed |

---

### Task 1: Shared position helpers, base row, candidate query extraction

Refactor only — behaviour unchanged, existing tests must stay green.

**Files:**
- Modify: `src/shared/rules.ts`
- Modify: `src/shared/types.ts:48-104`
- Modify: `src/main/db/repos/playersWeek.ts`

**Interfaces:**
- Produces: `LINEUP_POSITIONS: readonly string[]`, `FLEX_ELIGIBILITY: Record<string, readonly string[]>`, `asPosition(value: string | null): Position | null` in `@shared/rules`; `PlayerBaseRow` in `@shared/types`; `listCandidates(db, leagueId): CandidateRow[]`, `baseRow(r: CandidateRow, byes: Map<string, number>): PlayerBaseRow`, exported `CandidateRow` in `@main/db/repos/playersWeek`.

- [ ] **Step 1: Create the branch**

```bash
git checkout -b feat/value-mode main
```

- [ ] **Step 2: Add the shared constants to `src/shared/rules.ts`** (after `export type Position = …`, line 9)

```ts
/** Positions with a dedicated lineup slot; the only ones the app scores and values. */
export const LINEUP_POSITIONS: readonly string[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

/** Positions a Sleeper flex slot accepts. Slots not listed here (BN, IR, TAXI, IDP_FLEX, …) are not lineup slots. */
export const FLEX_ELIGIBILITY: Record<string, readonly string[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR']
}

export function asPosition(value: string | null): Position | null {
  return (POSITIONS as readonly string[]).includes(value ?? '') ? (value as Position) : null
}
```

- [ ] **Step 3: Split `PlayerWeekRow` in `src/shared/types.ts`**

Replace the `PlayerWeekRow` interface (lines 80–104) with:

```ts
/** Identity and roster fields shared by the week and value rows; the renderer filters on these. */
export interface PlayerBaseRow {
  playerId: string
  fullName: string
  position: string | null
  team: string | null
  byeWeek: number | null
  injuryStatus: string | null
  rookie: boolean
  watched: boolean
  ownerRosterId: number | null
  ownerName: string | null
}

/** One candidate player for a (season, week); the renderer picks the line by mode and filters/sorts locally. */
export interface PlayerWeekRow extends PlayerBaseRow {
  /** null = bye (team known) or no team. */
  game: GameInfo | null
  points: number | null
  projected: number | null
  delta: number | null
  /** Actual stats in Sleeper keys (+ fga, xpa, fgm_0_39); {} when the week has no row. */
  actual: Record<string, number>
  /** Projection line in Sleeper keys (+ fgm_0_39); null when none is stored. */
  projection: Record<string, number> | null
  snapPct: number | null
  targetShare: number | null
  statsAvailable: boolean
}
```

- [ ] **Step 4: Refactor `src/main/db/repos/playersWeek.ts`**

Replace the imports of `POSITIONS, type Position, type RosterSlotCount` with:

```ts
import {
  asPosition,
  FLEX_ELIGIBILITY,
  LINEUP_POSITIONS,
  type RosterSlotCount
} from '@shared/rules'
```

and add `PlayerBaseRow` to the `@shared/types` import. Delete the local `ALL_POSITIONS`, `FLEX_SLOTS` and `asPosition`. Export `CandidateRow`. Replace `tabsForSlots`, and split the candidate query out of `playersWeek`:

```ts
/** ALL, one tab per scored position, then the league's flex slots in roster order. */
export function tabsForSlots(slots: RosterSlotCount[]): PositionTab[] {
  const tabs: PositionTab[] = [{ id: 'ALL', label: 'All', positions: [...LINEUP_POSITIONS] }]
  for (const p of LINEUP_POSITIONS) tabs.push({ id: p, label: p, positions: [p] })
  for (const s of slots) {
    const positions = FLEX_ELIGIBILITY[s.slot]
    if (positions && !tabs.some((t) => t.id === s.slot)) {
      tabs.push({ id: s.slot, label: s.slot.replace('_', ' '), positions: [...positions] })
    }
  }
  return tabs
}

/**
 * Every candidate player of the league: scored positions that are rostered, watched, or active on
 * an NFL team, with the owner, watchlist and nflverse identity joined in.
 */
export function listCandidates(db: Db, leagueId: string): CandidateRow[] {
  return db
    .prepare(
      `SELECT * FROM (
         SELECT p.player_id, p.full_name, CASE WHEN p.position = 'FB' THEN 'RB' ELSE p.position END AS pos,
           p.team, p.status, p.injury_status, p.years_exp,
           rp.roster_id AS owner_roster_id, COALESCE(t.team_name, t.display_name) AS owner_name,
           w.player_id AS watched, i.gsis_id, i.pfr_id, i.nflverse_team
         FROM players p
         LEFT JOIN roster_players rp ON rp.player_id = p.player_id AND rp.league_id = ?
         LEFT JOIN teams t ON t.league_id = rp.league_id AND t.roster_id = rp.roster_id
         LEFT JOIN watchlist w ON w.player_id = p.player_id
         LEFT JOIN player_ids i ON i.player_id = p.player_id
       ) WHERE pos IN (${LINEUP_POSITIONS.map(() => '?').join(', ')})
         AND (owner_roster_id IS NOT NULL OR watched IS NOT NULL
              OR (team IS NOT NULL AND COALESCE(status, '') != 'Inactive'))`
    )
    .all(leagueId, ...LINEUP_POSITIONS) as unknown as CandidateRow[]
}

/** The fields every row type shares; `byes` is `teamByeWeeks` keyed by nflverse team. */
export function baseRow(r: CandidateRow, byes: Map<string, number>): PlayerBaseRow {
  const nflverseTeam = r.team ? toNflverseTeam(r.team) : null
  return {
    playerId: r.player_id,
    fullName: r.full_name,
    position: r.pos,
    team: r.team,
    byeWeek: nflverseTeam ? (byes.get(nflverseTeam) ?? null) : null,
    injuryStatus: r.injury_status,
    rookie: r.years_exp === 0,
    watched: r.watched !== null,
    ownerRosterId: r.owner_roster_id,
    ownerName: r.owner_name
  }
}
```

In `playersWeek`, replace the inline `db.prepare(…).all(…)` with `const candidates = listCandidates(db, leagueId)` and the row literal's ten base fields with a spread:

```ts
    return {
      ...baseRow(r, byes),
      game: nflverseTeam ? (gameByTeam.get(nflverseTeam) ?? null) : null,
      points: pts,
      projected,
      delta: pts !== null && projected !== null ? round2(pts - projected) : null,
      actual: actual ? (withKickingBuckets(actual) as Record<string, number>) : {},
      projection: projLine ? (withKickingBuckets(projLine) as Record<string, number>) : null,
      snapPct,
      targetShare,
      statsAvailable: r.gsis_id !== null || r.nflverse_team !== null
    }
```

(`nflverseTeam` stays computed in the loop for `game`.)

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green (178 tests), no behaviour change.

- [ ] **Step 6: Commit**

```bash
git add src/shared/rules.ts src/shared/types.ts src/main/db/repos/playersWeek.ts
git commit -m "refactor(players): share base row and position helpers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Replacement level (pure)

**Files:**
- Create: `src/main/value/replacement.ts`
- Modify: `src/shared/types.ts` (add `ReplacementLevel`)
- Test: `tests/main/value/replacement.test.ts`

**Interfaces:**
- Consumes: `FLEX_ELIGIBILITY`, `LINEUP_POSITIONS`, `RosterSlotCount` from `@shared/rules`.
- Produces: `starterCounts(slots, teamCount, metrics: Map<string, number[]>): Map<string, number>`; `replacementLevels(slots, teamCount, metrics): Map<string, ReplacementLevel | null>`; `ReplacementLevel { level: number; starters: number }` in `@shared/types`.

- [ ] **Step 1: Add the shared type** to `src/shared/types.ts` (after `PlayerWeekRow`)

```ts
/** Metric of the (starters + 1)-th best player at a position — spec §2.2. */
export interface ReplacementLevel {
  level: number
  starters: number
}
```

- [ ] **Step 2: Write the failing tests** — `tests/main/value/replacement.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { replacementLevels, starterCounts } from '@main/value/replacement'
import type { RosterSlotCount } from '@shared/rules'

const slots: RosterSlotCount[] = [
  { slot: 'QB', count: 1 },
  { slot: 'RB', count: 1 },
  { slot: 'WR', count: 1 },
  { slot: 'FLEX', count: 1 },
  { slot: 'BN', count: 3 }
]

describe('starterCounts', () => {
  it('adds dedicated slots × teams and hands flex slots to the best next player', () => {
    const metrics = new Map([
      ['QB', [30, 25]],
      ['RB', [5, 20, 10, 15]], // unsorted on purpose
      ['WR', [18, 12, 8]]
    ])
    // base: QB 2, RB 2, WR 2; flex 1: RB next 10 vs WR next 8 → RB; flex 2: RB 5 vs WR 8 → WR
    expect(starterCounts(slots, 2, metrics)).toEqual(
      new Map([
        ['QB', 2],
        ['RB', 3],
        ['WR', 3],
        ['TE', 0],
        ['K', 0],
        ['DEF', 0]
      ])
    )
  })

  it('stops handing out flex starters when no eligible position has a player left', () => {
    const metrics = new Map([['RB', [20]]])
    expect(starterCounts(slots, 2, metrics).get('RB')).toBe(2) // 1 slot × 2 teams, flex unfilled
    expect(starterCounts(slots, 2, metrics).get('WR')).toBe(2)
  })

  it('ignores slots that are neither positions nor flex', () => {
    const counts = starterCounts([{ slot: 'BN', count: 6 }, { slot: 'IR', count: 2 }], 12, new Map())
    expect([...counts.values()].every((n) => n === 0)).toBe(true)
  })
})

describe('replacementLevels', () => {
  it('takes the (starters + 1)-th best metric, or the worst one when fewer players exist', () => {
    const metrics = new Map([
      ['QB', [30, 25, 22]],
      ['RB', [20, 15, 10, 5]],
      ['WR', [18, 12, 8]]
    ])
    const levels = replacementLevels(slots, 2, metrics)
    expect(levels.get('QB')).toEqual({ level: 22, starters: 2 })
    expect(levels.get('RB')).toEqual({ level: 5, starters: 3 }) // 4th best
    expect(levels.get('WR')).toEqual({ level: 8, starters: 3 }) // only 3 WRs → worst
  })

  it('is null for a position without players and 0 starters for positions without slots', () => {
    const levels = replacementLevels(slots, 2, new Map([['TE', [9, 7]]]))
    expect(levels.get('RB')).toBeNull()
    expect(levels.get('TE')).toEqual({ level: 9, starters: 0 })
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/main/value/replacement.test.ts`
Expected: FAIL — cannot resolve `@main/value/replacement`.

- [ ] **Step 4: Implement `src/main/value/replacement.ts`**

```ts
import { FLEX_ELIGIBILITY, LINEUP_POSITIONS, type RosterSlotCount } from '@shared/rules'
import type { ReplacementLevel } from '@shared/types'

function sortedDesc(metrics: Map<string, number[]>): Map<string, number[]> {
  return new Map([...metrics].map(([pos, values]) => [pos, [...values].sort((a, b) => b - a)]))
}

/**
 * Starters per lineup position (spec §2.2): dedicated slots × teams, then every flex slot goes to
 * whichever eligible position has the best next unallocated player. `metrics` holds each
 * position's players' metric in any order; a position with no player left never receives flex.
 */
export function starterCounts(
  slots: RosterSlotCount[],
  teamCount: number,
  metrics: Map<string, number[]>
): Map<string, number> {
  const sorted = sortedDesc(metrics)
  const starters = new Map<string, number>(LINEUP_POSITIONS.map((p) => [p, 0]))
  for (const s of slots) {
    if (starters.has(s.slot)) starters.set(s.slot, (starters.get(s.slot) ?? 0) + s.count * teamCount)
  }
  for (const s of slots) {
    const eligible = FLEX_ELIGIBILITY[s.slot]
    if (!eligible) continue
    for (let i = 0; i < s.count * teamCount; i++) {
      let best: string | null = null
      let bestValue = -Infinity
      for (const pos of eligible) {
        const next = sorted.get(pos)?.[starters.get(pos) ?? 0]
        if (next !== undefined && next > bestValue) {
          best = pos
          bestValue = next
        }
      }
      if (best === null) break
      starters.set(best, (starters.get(best) ?? 0) + 1)
    }
  }
  return starters
}

/** Replacement level per lineup position: the (starters + 1)-th best metric, the worst one when fewer players exist, null with none. */
export function replacementLevels(
  slots: RosterSlotCount[],
  teamCount: number,
  metrics: Map<string, number[]>
): Map<string, ReplacementLevel | null> {
  const sorted = sortedDesc(metrics)
  const levels = new Map<string, ReplacementLevel | null>()
  for (const [pos, starters] of starterCounts(slots, teamCount, metrics)) {
    const values = sorted.get(pos) ?? []
    levels.set(
      pos,
      values.length === 0 ? null : { level: values[Math.min(starters, values.length - 1)], starters }
    )
  }
  return levels
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/value/replacement.test.ts`
Expected: 5 passed.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/value/replacement.ts src/shared/types.ts tests/main/value/replacement.test.ts
git commit -m "feat(value): compute replacement levels with flex

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Season-wide repository reads

**Files:**
- Modify: `src/main/db/repos/stats.ts` (after `listGamesByWeek`)
- Modify: `src/main/db/repos/points.ts` (after `listPointsByWeek`)
- Modify: `src/main/db/repos/projections.ts` (after `listProjections`)
- Test: `tests/main/db/seasonReads.test.ts`

**Interfaces:**
- Produces: `listPlayerWeeksBySeason(db, season): PlayerWeekRow[]` (repo type: `gsisId, week, team, opponent, position, stats`); `listTeamWeeksBySeason(db, season): TeamWeekRow[]`; `listSnapsBySeason(db, season): { pfrId: string; week: number; offensePct: number | null }[]`; `listRegularSeasonGames(db, season): GameRow[]`; `listPointsBySeason(db, leagueId, season): { playerId: string; week: number; points: number }[]`; `listProjectionsBySeason(db, season): ProjectionRecord[]`.

- [ ] **Step 1: Write the failing tests** — `tests/main/db/seasonReads.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { listPointsBySeason, replacePoints } from '@main/db/repos/points'
import { listProjectionsBySeason, replaceProjections } from '@main/db/repos/projections'
import {
  listPlayerWeeksBySeason,
  listRegularSeasonGames,
  listSnapsBySeason,
  listTeamWeeksBySeason,
  replacePlayerWeekStats,
  replaceSnaps,
  replaceTeamWeekStats,
  upsertGames
} from '@main/db/repos/stats'
import { parsePlayerWeekStats, parseSnapCounts, parseTeamWeekStats } from '@main/sources/nflverse'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import * as nv from '../../fixtures/nflverse'

describe('season-wide reads', () => {
  it('list stats, snaps and team weeks of one season only', () => {
    const db = seedLeague()
    const reg = parsePlayerWeekStats(nv.playerStatsCsv).records.filter((r) => r.seasonType === 'REG')
    replacePlayerWeekStats(db, 2025, reg, SEED_TS)
    replacePlayerWeekStats(db, 2026, reg.map((r) => ({ ...r, season: 2026 })).slice(0, 1), SEED_TS)
    replaceTeamWeekStats(db, 2025, parseTeamWeekStats(nv.teamStatsCsv).records, SEED_TS)
    replaceSnaps(db, 2025, parseSnapCounts(nv.snapCountsCsv).records, SEED_TS)

    // ORDER BY week, gsis_id
    expect(listPlayerWeeksBySeason(db, 2025).map((r) => [r.gsisId, r.week])).toEqual([
      ['00-0025565', 1],
      ['00-0034844', 1],
      ['00-0036322', 1],
      ['00-0034844', 2]
    ])
    expect(listPlayerWeeksBySeason(db, 2026)).toHaveLength(1)
    expect(listTeamWeeksBySeason(db, 2025).map((t) => t.team)).toEqual(['DAL', 'HOU', 'LA', 'PHI'])
    expect(listTeamWeeksBySeason(db, 2026)).toEqual([])
    expect(listSnapsBySeason(db, 2025)).toEqual([
      { pfrId: 'BarkSa00', week: 1, offensePct: 0.83 },
      { pfrId: 'BarkSa00', week: 2, offensePct: 0.9 }
    ])
  })

  it('lists regular-season games, points and projections of one season', () => {
    const db = seedLeague()
    const game = (gameId: string, season: number, week: number, gameType = 'REG') => ({
      gameId,
      season,
      week,
      gameType,
      gameday: '2026-09-10',
      gametime: '13:00',
      homeTeam: 'PHI',
      awayTeam: 'DAL',
      homeScore: null,
      awayScore: null
    })
    upsertGames(db, [game('a', 2026, 1), game('b', 2026, 19, 'POST'), game('c', 2025, 1)], SEED_TS)
    expect(listRegularSeasonGames(db, 2026).map((g) => g.gameId)).toEqual(['a'])

    replacePoints(
      db,
      'L1',
      [
        { playerId: '4866', season: 2026, week: 2, points: 10 },
        { playerId: '4866', season: 2026, week: 1, points: 20 },
        { playerId: '4866', season: 2025, week: 1, points: 7 }
      ],
      SEED_TS
    )
    expect(listPointsBySeason(db, 'L1', 2026)).toEqual([
      { playerId: '4866', week: 1, points: 20 },
      { playerId: '4866', week: 2, points: 10 }
    ])

    const proj = (week: number) => ({
      playerId: '4866',
      season: 2026,
      week,
      company: null,
      team: null,
      opponent: null,
      stats: { rush_yd: 80 }
    })
    replaceProjections(db, 2026, 1, [proj(1)], SEED_TS)
    replaceProjections(db, 2026, 2, [proj(2)], SEED_TS)
    replaceProjections(db, 2025, 1, [{ ...proj(1), season: 2025 }], SEED_TS)
    expect(listProjectionsBySeason(db, 2026).map((p) => p.week)).toEqual([1, 2])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/db/seasonReads.test.ts`
Expected: FAIL — the functions are not exported.

- [ ] **Step 3: Implement**

`src/main/db/repos/stats.ts` (append):

```ts
export function listPlayerWeeksBySeason(db: Db, season: number): PlayerWeekRow[] {
  const rows = db
    .prepare(`${PLAYER_WEEK_SELECT} WHERE season = ? ORDER BY week, gsis_id`)
    .all(season) as unknown as PlayerWeekDbRow[]
  return rows.map(toPlayerWeek)
}

export function listTeamWeeksBySeason(db: Db, season: number): TeamWeekRow[] {
  const rows = db
    .prepare(
      'SELECT team, season, week, opponent, stats_json FROM team_week_stats WHERE season = ? ORDER BY week, team'
    )
    .all(season) as unknown as TeamWeekDbRow[]
  return rows.map((r) => ({
    team: r.team,
    season: r.season,
    week: r.week,
    opponent: r.opponent,
    stats: JSON.parse(r.stats_json) as Record<string, number>
  }))
}

export function listSnapsBySeason(
  db: Db,
  season: number
): { pfrId: string; week: number; offensePct: number | null }[] {
  const rows = db
    .prepare(
      'SELECT pfr_id, week, offense_pct FROM player_week_snaps WHERE season = ? ORDER BY pfr_id, week'
    )
    .all(season) as unknown as { pfr_id: string; week: number; offense_pct: number | null }[]
  return rows.map((r) => ({ pfrId: r.pfr_id, week: r.week, offensePct: r.offense_pct }))
}

export function listRegularSeasonGames(db: Db, season: number): GameRow[] {
  return listGames(db).filter((g) => g.season === season && g.gameType === 'REG')
}
```

`src/main/db/repos/points.ts` (append):

```ts
export function listPointsBySeason(
  db: Db,
  leagueId: string,
  season: number
): { playerId: string; week: number; points: number }[] {
  const rows = db
    .prepare(
      'SELECT player_id, week, points FROM player_week_points WHERE league_id = ? AND season = ? ORDER BY player_id, week'
    )
    .all(leagueId, season) as unknown as { player_id: string; week: number; points: number }[]
  return rows.map((r) => ({ playerId: r.player_id, week: r.week, points: r.points }))
}
```

`src/main/db/repos/projections.ts` (append; reuse the module's `Row` type):

```ts
export function listProjectionsBySeason(db: Db, season: number): ProjectionRecord[] {
  const rows = db
    .prepare(
      `SELECT player_id, season, week, company, team, opponent, stats_json
       FROM player_week_projections WHERE season = ? ORDER BY week, player_id`
    )
    .all(season) as unknown as Row[]
  return rows.map((r) => ({
    playerId: r.player_id,
    season: r.season,
    week: r.week,
    company: r.company,
    team: r.team,
    opponent: r.opponent,
    stats: JSON.parse(r.stats_json) as Record<string, number>
  }))
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main/db/seasonReads.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/db/repos/stats.ts src/main/db/repos/points.ts src/main/db/repos/projections.ts tests/main/db/seasonReads.test.ts
git commit -m "feat(db): add season-wide stats, points, projection reads

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Season fixture and series loader

**Files:**
- Create: `tests/fixtures/season.ts`
- Create: `src/main/value/series.ts`
- Test: `tests/main/value/series.test.ts`

**Interfaces:**
- Consumes: Task 1 (`listCandidates`, `baseRow`, `asPosition`), Task 3 reads, `scoreStatLine`, adapters, `pointsAllowedIndex` (key `${team}|${season}|${week}`), `toNflverseTeam`/`toSleeperTeam`, `getNflState`, `getLeague`, `getRules`, `teamByeWeeks`.
- Produces: `LAST_WEEK = 18`; `currentWeekFor(season, state): number`; `loadSeries(db, leagueId, season): SeriesBundle`; types `SeriesWeek`, `PlayerSeries`, `SeriesBundle` (below).

- [ ] **Step 1: Create the shared fixture** — `tests/fixtures/season.ts`

```ts
import type { Db } from '@main/db/connection'
import { replacePlayerIds, type PlayerIdRecord } from '@main/db/repos/playerIds'
import { replacePoints } from '@main/db/repos/points'
import { replaceProjections } from '@main/db/repos/projections'
import { setNflState } from '@main/db/repos/state'
import {
  replacePlayerWeekStats,
  replaceSnaps,
  replaceTeamWeekStats,
  upsertGames
} from '@main/db/repos/stats'
import { parsePlayerWeekStats, parseSnapCounts, parseTeamWeekStats } from '@main/sources/nflverse'
import type { GameRecord } from '@main/sources/nflverse-types'
import { SEED_TS } from './db'
import * as nv from './nflverse'

export const SEASON = 2026

const ids = (
  playerId: string,
  gsisId: string | null,
  pfrId: string | null = null,
  nflverseTeam: string | null = null
): PlayerIdRecord => ({
  playerId,
  gsisId,
  pfrId,
  sportradarId: null,
  espnId: null,
  nflverseTeam,
  resolution: gsisId ? 'crosswalk' : nflverseTeam ? 'team' : 'unresolved'
})

const game = (
  gameId: string,
  week: number,
  homeTeam: string,
  awayTeam: string,
  homeScore: number | null = null,
  awayScore: number | null = null
): GameRecord => ({
  gameId,
  season: SEASON,
  week,
  gameType: 'REG',
  gameday: `2026-09-${10 + week}`,
  gametime: '13:00',
  homeTeam,
  awayTeam,
  homeScore,
  awayScore
})

/**
 * Season 2026 on league L1 as of week 3 with Thursday played: Barkley (4866, PHI) has points for
 * weeks 1–3, Jefferson (6794, MIN — bye week 2) for week 1, Chase (7564) weeks 1–2, Bijan (9509)
 * week 1, LAR week 1; Cook (8259) is unmatched to nflverse. Projections stored for weeks 3 and 4.
 * nflverse stat rows come from the CSV fixtures (Barkley weeks 1–2, Jefferson week 1) mapped to 2026.
 */
export function seedSeason(db: Db): void {
  setNflState(db, {
    season: '2026',
    week: 3,
    displayWeek: 3,
    seasonType: 'regular',
    fetchedAt: SEED_TS
  })
  replacePlayerIds(
    db,
    [
      ids('4866', '00-0034844', 'BarkSa00'),
      ids('6794', '00-0036322'),
      ids('7564', '00-0036900'),
      ids('9509', '00-0039000'),
      ids('LAR', null, null, 'LA'),
      ids('8259', null)
    ],
    SEED_TS
  )
  const withSeason = <T extends { season: number }>(r: T): T => ({ ...r, season: SEASON })
  replacePlayerWeekStats(
    db,
    SEASON,
    parsePlayerWeekStats(nv.playerStatsCsv)
      .records.filter((r) => r.seasonType === 'REG')
      .map(withSeason),
    SEED_TS
  )
  replaceTeamWeekStats(db, SEASON, parseTeamWeekStats(nv.teamStatsCsv).records.map(withSeason), SEED_TS)
  replaceSnaps(db, SEASON, parseSnapCounts(nv.snapCountsCsv).records.map(withSeason), SEED_TS)
  upsertGames(
    db,
    [
      game('g1', 1, 'PHI', 'DAL', 24, 20),
      game('g2', 1, 'MIN', 'CHI', 20, 10),
      game('g3', 1, 'LA', 'HOU', 14, 9),
      game('g4', 2, 'KC', 'PHI', 17, 21),
      game('g5', 2, 'DAL', 'LA', 27, 13),
      game('g6', 3, 'PHI', 'NYG'),
      game('g7', 3, 'DET', 'MIN'),
      game('g8', 3, 'SF', 'LA'),
      game('g9', 4, 'PHI', 'WAS'),
      game('g10', 4, 'MIN', 'GB'),
      game('g11', 4, 'LA', 'ARI')
    ],
    SEED_TS
  )
  const pts = (playerId: string, week: number, points: number) => ({
    playerId,
    season: SEASON,
    week,
    points
  })
  replacePoints(
    db,
    'L1',
    [
      pts('4866', 1, 20),
      pts('4866', 2, 10),
      pts('4866', 3, 30),
      pts('6794', 1, 25),
      pts('7564', 1, 5),
      pts('7564', 2, 15),
      pts('9509', 1, 12),
      pts('LAR', 1, 8)
    ],
    SEED_TS
  )
  const proj = (playerId: string, week: number, stats: Record<string, number>, opponent: string) => ({
    playerId,
    season: SEASON,
    week,
    company: 'rotowire',
    team: null,
    opponent,
    stats
  })
  replaceProjections(
    db,
    SEASON,
    3,
    [
      proj('4866', 3, { rush_yd: 100 }, 'NYG'),
      proj('6794', 3, { rec: 5, rec_yd: 80 }, 'DET'),
      proj('7564', 3, { rec: 4, rec_yd: 50 }, 'CLE')
    ],
    SEED_TS
  )
  replaceProjections(
    db,
    SEASON,
    4,
    [
      proj('4866', 4, { rush_yd: 80 }, 'WAS'),
      proj('6794', 4, { rec: 6, rec_yd: 90 }, 'GB'),
      proj('9509', 4, { rush_yd: 70 }, 'NO')
    ],
    SEED_TS
  )
}
```

- [ ] **Step 2: Write the failing tests** — `tests/main/value/series.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { currentWeekFor, loadSeries, type PlayerSeries } from '@main/value/series'
import { seedLeague } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'

describe('currentWeekFor', () => {
  const state = { season: '2026', week: 5, displayWeek: 6, seasonType: 'regular', fetchedAt: '' }
  it('uses Sleeper week for the current season, 19 for a past one, 1 without state', () => {
    expect(currentWeekFor(2026, state)).toBe(5)
    expect(currentWeekFor(2025, state)).toBe(19)
    expect(currentWeekFor(2026, null)).toBe(1)
    expect(currentWeekFor(2026, { ...state, week: 0 })).toBe(1)
    expect(currentWeekFor(2026, { ...state, week: 22 })).toBe(18)
  })
})

describe('loadSeries', () => {
  let db: Db
  let byId: Map<string, PlayerSeries>
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
    const bundle = loadSeries(db, 'L1', SEASON)
    byId = new Map(bundle.players.map((p) => [p.base.playerId, p]))
  })

  it('carries the season context', () => {
    const bundle = loadSeries(db, 'L1', SEASON)
    expect(bundle.currentWeek).toBe(3)
    expect(bundle.projectionsStored).toBe(true)
    expect(bundle.teamCount).toBe(2)
    expect(bundle.rules?.rosterSlots.some((s) => s.slot === 'FLEX')).toBe(true)
  })

  it('builds one week per game, projection or points row with points, projection, line and usage', () => {
    const barkley = byId.get('4866')
    expect(barkley?.statsAvailable).toBe(true)
    expect(barkley?.base.byeWeek).toBeNull()
    expect(barkley?.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4])
    const [w1, , w3, w4] = barkley?.weeks ?? []
    expect(w1).toMatchObject({ opponent: 'DAL', played: true, points: 20, projected: null, snapPct: 0.83 })
    expect(w1.line.rush_yd).toBe(60)
    expect(w1.line.rush_att).toBeGreaterThan(0)
    expect(w3).toMatchObject({ opponent: 'NYG', played: true, points: 30, projected: 10, line: {} })
    expect(w4).toMatchObject({ opponent: 'WAS', played: false, points: null, projected: 8 })
  })

  it('skips weeks with nothing (bye, no projection) and keeps projection-only weeks', () => {
    const jefferson = byId.get('6794')
    expect(jefferson?.base.byeWeek).toBe(2)
    expect(jefferson?.weeks.map((w) => [w.week, w.played, w.projected])).toEqual([
      [1, true, null],
      [3, false, 13],
      [4, false, 15]
    ])
  })

  it('scores a defense from team rows with points allowed', () => {
    const lar = byId.get('LAR')
    expect(lar?.statsAvailable).toBe(true)
    expect(lar?.weeks[0]).toMatchObject({ week: 1, opponent: 'HOU', played: true, points: 8 })
    expect(lar?.weeks[0].line.pts_allow).toBe(9)
    expect(lar?.weeks[1]).toMatchObject({ week: 2, opponent: 'DAL', played: false, line: {} })
  })

  it('marks an unmatched player as unavailable with an empty series', () => {
    const cook = byId.get('8259')
    expect(cook?.statsAvailable).toBe(false)
    expect(cook?.weeks).toEqual([])
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/main/value/series.test.ts`
Expected: FAIL — cannot resolve `@main/value/series`.

- [ ] **Step 4: Implement `src/main/value/series.ts`**

```ts
import {
  offensiveYards,
  playerStatLine,
  teamStatLine,
  withDisplayStats,
  withKickingBuckets
} from '@main/scoring/adapters'
import { scoreStatLine } from '@main/scoring/engine'
import { pointsAllowedIndex } from '@main/scoring/recompute'
import { asPosition, type Rules } from '@shared/rules'
import { toNflverseTeam, toSleeperTeam } from '@shared/teams'
import type { NflState, PlayerBaseRow } from '@shared/types'
import type { Db } from '../db/connection'
import { getLeague } from '../db/repos/leagues'
import { baseRow, listCandidates } from '../db/repos/playersWeek'
import { listPointsBySeason } from '../db/repos/points'
import { listProjectionsBySeason, type ProjectionRecord } from '../db/repos/projections'
import { getRules } from '../db/repos/rules'
import { getNflState } from '../db/repos/state'
import {
  listPlayerWeeksBySeason,
  listRegularSeasonGames,
  listSnapsBySeason,
  listTeamWeeksBySeason,
  teamByeWeeks,
  type PlayerWeekRow as StatsRow,
  type TeamWeekRow
} from '../db/repos/stats'

export const LAST_WEEK = 18

export interface SeriesWeek {
  week: number
  /** Sleeper code of the opponent (schedule first, projection row as fallback); null without one. */
  opponent: string | null
  /** true when the league has a points row: the team played and the stats are in. */
  played: boolean
  points: number | null
  /** Projection scored under the league rules; null without a stored projection. */
  projected: number | null
  /** Actual line in Sleeper keys (+ display keys); {} when there is no stat row. */
  line: Record<string, number>
  snapPct: number | null
  targetShare: number | null
  rushShare: number | null
  airYardsShare: number | null
  wopr: number | null
}

export interface PlayerSeries {
  base: PlayerBaseRow
  statsAvailable: boolean
  /** Ascending; only weeks with a game, a projection or a points row. */
  weeks: SeriesWeek[]
}

export interface SeriesBundle {
  season: number
  currentWeek: number
  projectionsStored: boolean
  teamCount: number
  rules: Rules | null
  players: PlayerSeries[]
}

/** Week ROS starts from: Sleeper's week clamped to 1..18; a past season is fully played (19), a future one untouched (1). */
export function currentWeekFor(season: number, state: NflState | null): number {
  if (!state) return 1
  const stateSeason = Number(state.season)
  if (season < stateSeason) return LAST_WEEK + 1
  if (season > stateSeason) return 1
  return Math.min(Math.max(state.week, 1), LAST_WEEK)
}

function nested<T>(items: T[], outer: (t: T) => string, inner: (t: T) => number): Map<string, Map<number, T>> {
  const map = new Map<string, Map<number, T>>()
  for (const item of items) {
    const key = outer(item)
    let byWeek = map.get(key)
    if (!byWeek) {
      byWeek = new Map()
      map.set(key, byWeek)
    }
    byWeek.set(inner(item), item)
  }
  return map
}

function share(numerator: number | undefined, denominator: number | undefined): number | null {
  return numerator !== undefined && denominator ? numerator / denominator : null
}

/** One pass over the season: every candidate with its per-week points, projection, line and usage. */
export function loadSeries(db: Db, leagueId: string, season: number): SeriesBundle {
  const league = getLeague(db, leagueId)
  const rules = getRules(db, leagueId)
  const currentWeek = currentWeekFor(season, getNflState(db))
  const byes = teamByeWeeks(db, season)
  const games = listRegularSeasonGames(db, season)
  const allowed = pointsAllowedIndex(games)
  const schedule = new Map<string, Map<number, string>>()
  const addGame = (team: string, week: number, opponent: string): void => {
    if (!schedule.has(team)) schedule.set(team, new Map())
    schedule.get(team)?.set(week, opponent)
  }
  for (const g of games) {
    addGame(g.homeTeam, g.week, g.awayTeam)
    addGame(g.awayTeam, g.week, g.homeTeam)
  }
  const points = nested(listPointsBySeason(db, leagueId, season), (p) => p.playerId, (p) => p.week)
  const projectionRows = listProjectionsBySeason(db, season)
  const projections = nested<ProjectionRecord>(projectionRows, (p) => p.playerId, (p) => p.week)
  const stats = nested<StatsRow>(listPlayerWeeksBySeason(db, season), (s) => s.gsisId, (s) => s.week)
  const teamWeeks = nested<TeamWeekRow>(listTeamWeeksBySeason(db, season), (t) => t.team, (t) => t.week)
  const snaps = nested(listSnapsBySeason(db, season), (s) => s.pfrId, (s) => s.week)

  const players = listCandidates(db, leagueId).map((r): PlayerSeries => {
    const base = baseRow(r, byes)
    const position = asPosition(r.pos)
    const nflverseTeam = r.team ? toNflverseTeam(r.team) : null
    const teamSchedule = nflverseTeam ? schedule.get(nflverseTeam) : undefined
    const playerPoints = points.get(r.player_id)
    const playerProjections = projections.get(r.player_id)
    const playerStats = r.gsis_id ? stats.get(r.gsis_id) : undefined
    const playerSnaps = r.pfr_id ? snaps.get(r.pfr_id) : undefined
    const defenseWeeks = r.nflverse_team ? teamWeeks.get(r.nflverse_team) : undefined

    const weeks: SeriesWeek[] = []
    for (let week = 1; week <= LAST_WEEK; week++) {
      const scheduled = teamSchedule?.get(week) ?? null
      const projection = playerProjections?.get(week) ?? null
      const pts = playerPoints?.get(week)
      if (scheduled === null && !projection && pts === undefined) continue

      let line: Record<string, number> = {}
      let targetShare: number | null = null
      let rushShare: number | null = null
      let airYardsShare: number | null = null
      let wopr: number | null = null
      if (defenseWeeks) {
        const t = defenseWeeks.get(week)
        if (t) {
          const opp = t.opponent ? teamWeeks.get(t.opponent)?.get(week) : undefined
          line = withKickingBuckets(
            teamStatLine(t.stats, {
              pointsAllowed: allowed.get(`${t.team}|${season}|${week}`) ?? null,
              yardsAllowed: opp ? offensiveYards(opp.stats) : null
            })
          ) as Record<string, number>
        }
      } else if (playerStats) {
        const s = playerStats.get(week)
        if (s) {
          line = withKickingBuckets(withDisplayStats(playerStatLine(s.stats), s.stats)) as Record<
            string,
            number
          >
          const team = s.team ? teamWeeks.get(s.team)?.get(week)?.stats : undefined
          targetShare = s.stats.target_share ?? share(s.stats.targets, team?.attempts)
          rushShare = share(s.stats.carries, team?.carries)
          airYardsShare =
            s.stats.air_yards_share ?? share(s.stats.receiving_air_yards, team?.passing_air_yards)
          wopr =
            s.stats.wopr ??
            (targetShare !== null && airYardsShare !== null
              ? 1.5 * targetShare + 0.7 * airYardsShare
              : null)
        }
      }
      weeks.push({
        week,
        opponent: scheduled ? toSleeperTeam(scheduled) : (projection?.opponent ?? null),
        played: pts !== undefined,
        points: pts ?? null,
        projected: projection && rules ? scoreStatLine(projection.stats, rules, position) : null,
        line,
        snapPct: playerSnaps?.get(week)?.offensePct ?? null,
        targetShare,
        rushShare,
        airYardsShare,
        wopr
      })
    }
    return {
      base,
      statsAvailable: r.gsis_id !== null || r.nflverse_team !== null,
      weeks
    }
  })

  return {
    season,
    currentWeek,
    projectionsStored: projectionRows.length > 0,
    teamCount: league?.totalRosters ?? 0,
    rules,
    players
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/value/series.test.ts`
Expected: 6 passed. If `w1.line.rush_att` fails, check the fixture CSV's `carries` column for Barkley week 1 is > 0 and adjust the assertion to the key `playerStatLine` produces (`rush_att`).

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/value/series.ts tests/fixtures/season.ts tests/main/value/series.test.ts
git commit -m "feat(value): load per-player season series

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Value build and detail

**Files:**
- Modify: `src/shared/types.ts` (add `PlayerValueRow`, `ValueContext`, `PlayersValue`, `DetailWeek`, `PlayerDetail`)
- Create: `src/main/value/build.ts`
- Test: `tests/main/value/build.test.ts`

**Interfaces:**
- Consumes: `loadSeries`, `SeriesBundle`, `PlayerSeries` (Task 4); `replacementLevels` (Task 2); `round2` from `@main/db/repos/points`.
- Produces: `ValueBuild { context: ValueContext; rows: PlayerValueRow[]; series: Map<string, PlayerSeries> }`; `assembleValue(bundle: SeriesBundle): ValueBuild`; `buildValueSeason(db, leagueId, season): ValueBuild`; `detailFor(build, playerId): PlayerDetail | null`.

- [ ] **Step 1: Add the shared types** to `src/shared/types.ts` (after `ReplacementLevel`)

```ts
/** One player's season value (spec §2); ranks are 1-based within position, overall by ROS value. */
export interface PlayerValueRow extends PlayerBaseRow {
  gamesPlayed: number
  ppg: number | null
  stdValue: number | null
  stdRank: number | null
  rosPoints: number | null
  rosValue: number | null
  rosRank: number | null
  overallRank: number | null
  statsAvailable: boolean
}

export interface ValueContext {
  season: number
  /** ROS starts here (Sleeper's week; 19 for a past season). */
  currentWeek: number
  projectionsStored: boolean
  /** Per lineup position; null when no player has the metric. */
  replacement: Record<string, { std: ReplacementLevel | null; ros: ReplacementLevel | null }>
}

export interface PlayersValue {
  context: ValueContext
  rows: PlayerValueRow[]
}

export interface DetailWeek {
  week: number
  opponent: string | null
  played: boolean
  points: number | null
  projected: number | null
  snapPct: number | null
  targetShare: number | null
  rushShare: number | null
  wopr: number | null
  /** Actual line in Sleeper keys (+ fga, xpa, fgm_0_39); {} when not played. */
  stats: Record<string, number>
}

export interface PlayerDetail {
  row: PlayerValueRow
  /** Every week with a game, a projection or a points row, ascending. */
  weeks: DetailWeek[]
}
```

- [ ] **Step 2: Write the failing tests** — `tests/main/value/build.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { buildValueSeason, detailFor, type ValueBuild } from '@main/value/build'
import { seedLeague } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'

describe('buildValueSeason', () => {
  let db: Db
  let build: ValueBuild
  const row = (id: string) => build.rows.find((r) => r.playerId === id)
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
    build = buildValueSeason(db, 'L1', SEASON)
  })

  it('reports the context and replacement levels per position', () => {
    expect(build.context).toMatchObject({ season: SEASON, currentWeek: 3, projectionsStored: true })
    // 2 teams × (RB 2 + WR 2 + FLEX 1 …): RB std [20, 12] → worst; ROS [8, 7, 0] → Cook's 0
    expect(build.context.replacement.RB).toEqual({
      std: { level: 12, starters: 4 },
      ros: { level: 0, starters: 4 }
    })
    expect(build.context.replacement.WR).toEqual({
      std: { level: 10, starters: 4 },
      ros: { level: 9, starters: 4 }
    })
    expect(build.context.replacement.QB).toEqual({ std: null, ros: null })
  })

  it('computes PPG over played weeks and ROS over unplayed weeks from the current one', () => {
    // Barkley played week 3 (Thursday): his week-3 projection is out of ROS, week 4 stays
    expect(row('4866')).toMatchObject({ gamesPlayed: 3, ppg: 20, rosPoints: 8 })
    // Jefferson has not played week 3: both projections count
    expect(row('6794')).toMatchObject({ gamesPlayed: 1, ppg: 25, rosPoints: 28 })
    // no projection rows → 0 ROS, no games → null PPG
    expect(row('8259')).toMatchObject({ gamesPlayed: 0, ppg: null, rosPoints: 0, statsAvailable: false })
    expect(row('LAR')).toMatchObject({ gamesPlayed: 1, ppg: 8, rosPoints: 0 })
  })

  it('values over replacement and ranks within position and overall', () => {
    expect(row('4866')).toMatchObject({ stdValue: 8, stdRank: 1, rosValue: 8, rosRank: 1, overallRank: 2 })
    expect(row('9509')).toMatchObject({ stdValue: 0, stdRank: 2, rosValue: 7, rosRank: 2, overallRank: 3 })
    expect(row('8259')).toMatchObject({ stdValue: null, stdRank: null, rosValue: 0, rosRank: 3 })
    expect(row('6794')).toMatchObject({ stdValue: 15, stdRank: 1, rosValue: 19, rosRank: 1, overallRank: 1 })
    expect(row('7564')).toMatchObject({ stdValue: 0, stdRank: 2, rosValue: 0, rosRank: 2, overallRank: 4 })
  })

  it('serves a detail with the week series in Sleeper keys', () => {
    const detail = detailFor(build, '4866')
    expect(detail?.row.playerId).toBe('4866')
    expect(detail?.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4])
    expect(detail?.weeks[0]).toMatchObject({ played: true, points: 20, snapPct: 0.83 })
    expect(detail?.weeks[0].stats.rush_yd).toBe(60)
    expect(detail?.weeks[3]).toMatchObject({ played: false, projected: 8, stats: {} })
    expect(detailFor(build, 'nobody')).toBeNull()
  })

  it('has null ROS everywhere when no projections are stored', () => {
    const empty = buildValueSeason(db, 'L1', SEASON - 1)
    expect(empty.context.projectionsStored).toBe(false)
    expect(empty.rows.every((r) => r.rosPoints === null && r.rosValue === null)).toBe(true)
    expect(empty.context.replacement.RB.ros).toBeNull()
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/main/value/build.test.ts`
Expected: FAIL — cannot resolve `@main/value/build`.

- [ ] **Step 4: Implement `src/main/value/build.ts`**

```ts
import type { Db } from '@main/db/connection'
import { round2 } from '@main/db/repos/points'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { PlayerDetail, PlayerValueRow, ValueContext } from '@shared/types'
import { replacementLevels } from './replacement'
import { loadSeries, type PlayerSeries, type SeriesBundle } from './series'

export interface ValueBuild {
  context: ValueContext
  rows: PlayerValueRow[]
  series: Map<string, PlayerSeries>
}

interface Aggregate {
  series: PlayerSeries
  gamesPlayed: number
  ppg: number | null
  rosPoints: number | null
}

function aggregate(bundle: SeriesBundle, series: PlayerSeries): Aggregate {
  const played = series.weeks.filter((w) => w.played)
  const remaining = series.weeks.filter((w) => !w.played && w.week >= bundle.currentWeek)
  return {
    series,
    gamesPlayed: played.length,
    ppg:
      played.length === 0
        ? null
        : round2(played.reduce((sum, w) => sum + (w.points ?? 0), 0) / played.length),
    rosPoints: bundle.projectionsStored
      ? round2(remaining.reduce((sum, w) => sum + (w.projected ?? 0), 0))
      : null
  }
}

/** Position → the metric of every player that has one. */
function metricsByPosition(
  aggregates: Aggregate[],
  metric: (a: Aggregate) => number | null
): Map<string, number[]> {
  const map = new Map<string, number[]>()
  for (const a of aggregates) {
    const value = metric(a)
    const pos = a.series.base.position
    if (value === null || pos === null) continue
    if (!map.has(pos)) map.set(pos, [])
    map.get(pos)?.push(value)
  }
  return map
}

interface Ranked {
  id: string
  value: number
  raw: number
  name: string
}

/** 1-based ranks by value desc, then raw metric desc, then name. */
function ranks(entries: Ranked[]): Map<string, number> {
  const sorted = [...entries].sort(
    (a, b) => b.value - a.value || b.raw - a.raw || a.name.localeCompare(b.name)
  )
  return new Map(sorted.map((e, i) => [e.id, i + 1]))
}

/** Pure part of the build: rows and context from a loaded bundle (spec §2). */
export function assembleValue(bundle: SeriesBundle): ValueBuild {
  const aggregates = bundle.players.map((p) => aggregate(bundle, p))
  const slots = bundle.rules?.rosterSlots ?? []
  const stdLevels = replacementLevels(slots, bundle.teamCount, metricsByPosition(aggregates, (a) => a.ppg))
  const rosLevels = replacementLevels(
    slots,
    bundle.teamCount,
    metricsByPosition(aggregates, (a) => a.rosPoints)
  )

  const valued = aggregates.map((a) => {
    const pos = a.series.base.position ?? ''
    const std = stdLevels.get(pos) ?? null
    const ros = rosLevels.get(pos) ?? null
    return {
      a,
      stdValue: a.ppg !== null && std ? round2(a.ppg - std.level) : null,
      rosValue: a.rosPoints !== null && ros ? round2(a.rosPoints - ros.level) : null
    }
  })

  const byPosition = new Map<string, typeof valued>()
  for (const v of valued) {
    const pos = v.a.series.base.position ?? ''
    if (!byPosition.has(pos)) byPosition.set(pos, [])
    byPosition.get(pos)?.push(v)
  }
  const stdRanks = new Map<string, number>()
  const rosRanks = new Map<string, number>()
  for (const group of byPosition.values()) {
    const entry = (
      v: (typeof valued)[number],
      value: number | null,
      raw: number | null
    ): Ranked | null =>
      value === null
        ? null
        : { id: v.a.series.base.playerId, value, raw: raw ?? 0, name: v.a.series.base.fullName }
    const std = group.map((v) => entry(v, v.stdValue, v.a.ppg)).filter((e): e is Ranked => e !== null)
    const ros = group
      .map((v) => entry(v, v.rosValue, v.a.rosPoints))
      .filter((e): e is Ranked => e !== null)
    for (const [id, rank] of ranks(std)) stdRanks.set(id, rank)
    for (const [id, rank] of ranks(ros)) rosRanks.set(id, rank)
  }
  const overallRanks = ranks(
    valued
      .filter((v) => v.rosValue !== null)
      .map((v) => ({
        id: v.a.series.base.playerId,
        value: v.rosValue ?? 0,
        raw: v.a.rosPoints ?? 0,
        name: v.a.series.base.fullName
      }))
  )

  const rows: PlayerValueRow[] = valued.map((v) => ({
    ...v.a.series.base,
    gamesPlayed: v.a.gamesPlayed,
    ppg: v.a.ppg,
    stdValue: v.stdValue,
    stdRank: stdRanks.get(v.a.series.base.playerId) ?? null,
    rosPoints: v.a.rosPoints,
    rosValue: v.rosValue,
    rosRank: rosRanks.get(v.a.series.base.playerId) ?? null,
    overallRank: overallRanks.get(v.a.series.base.playerId) ?? null,
    statsAvailable: v.a.series.statsAvailable
  }))

  const replacement: ValueContext['replacement'] = {}
  for (const pos of LINEUP_POSITIONS) {
    replacement[pos] = { std: stdLevels.get(pos) ?? null, ros: rosLevels.get(pos) ?? null }
  }
  return {
    context: {
      season: bundle.season,
      currentWeek: bundle.currentWeek,
      projectionsStored: bundle.projectionsStored,
      replacement
    },
    rows,
    series: new Map(bundle.players.map((p) => [p.base.playerId, p]))
  }
}

export function buildValueSeason(db: Db, leagueId: string, season: number): ValueBuild {
  return assembleValue(loadSeries(db, leagueId, season))
}

/** The detail panel payload for one player of a build; null for an unknown player. */
export function detailFor(build: ValueBuild, playerId: string): PlayerDetail | null {
  const row = build.rows.find((r) => r.playerId === playerId)
  const series = build.series.get(playerId)
  if (!row || !series) return null
  return {
    row,
    weeks: series.weeks.map((w) => ({
      week: w.week,
      opponent: w.opponent,
      played: w.played,
      points: w.points,
      projected: round2(w.projected),
      snapPct: w.snapPct,
      targetShare: w.targetShare,
      rushShare: w.rushShare,
      wopr: w.wopr,
      stats: w.line
    }))
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/value/build.test.ts`
Expected: 5 passed. If `overallRank` of `7564` is not 4, check the tie-break: Chase (rosValue 0, rosPoints 9) must precede Cook and LAR (rosValue 0, rosPoints 0).

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/shared/types.ts src/main/value/build.ts tests/main/value/build.test.ts
git commit -m "feat(value): build season value rows and detail

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: IPC calls and cache

**Files:**
- Modify: `src/shared/ipc.ts:34-39, 59-75`
- Modify: `src/preload/index.ts:16-20`
- Modify: `src/main/ipc/handlers.ts`

**Interfaces:**
- Consumes: `buildValueSeason`, `detailFor`, `ValueBuild` (Task 5); `listWatched(db): string[]` from `@main/db/repos/watchlist`.
- Produces: `api.players.value(season): Promise<PlayersValue>`, `api.players.detail(season, playerId): Promise<PlayerDetail>`; `IPC.playersValue = 'players:value'`, `IPC.playersDetail = 'players:detail'`; `invalidateCaches()` in `handlers.ts`.

- [ ] **Step 1: Extend the contract** — `src/shared/ipc.ts`

In `Api.players`, after `week(...)`:

```ts
    /** Every candidate's season value (spec §2); cached in main until a sync or a rules change. */
    value(season: number): Promise<PlayersValue>
    /** One player's value row plus its week series; served from the same cache. */
    detail(season: number, playerId: string): Promise<PlayerDetail>
```

Add `PlayersValue, PlayerDetail` to the `@shared/types` import, and to `IPC`:

```ts
  playersValue: 'players:value',
  playersDetail: 'players:detail',
```

- [ ] **Step 2: Wire the preload** — `src/preload/index.ts`, in `players`:

```ts
    value: (season) => ipcRenderer.invoke(IPC.playersValue, season),
    detail: (season, playerId) => ipcRenderer.invoke(IPC.playersDetail, season, playerId),
```

- [ ] **Step 3: Cache and handlers** — `src/main/ipc/handlers.ts`

Imports: add `import { listWatched, toggleWatch } from '@main/db/repos/watchlist'` (replacing the `toggleWatch` import), `import { buildValueSeason, detailFor, type ValueBuild } from '@main/value/build'`, and `PlayerDetail, PlayersValue` to the `@shared/types` import.

After `cachedWeek`:

```ts
/**
 * Cache of season value builds (one per league + season). Cleared with the week cache on sync and
 * rules changes, but not on watchlist toggles: `watched` is decorated at serve time instead.
 */
const VALUE_CACHE_MAX = 2
const valueCache = new Map<string, ValueBuild>()

export function invalidateCaches(): void {
  invalidateWeekCache()
  valueCache.clear()
}

function cachedValue(ctx: AppContext, leagueId: string, season: number): ValueBuild {
  const key = `${leagueId}|${season}`
  const hit = valueCache.get(key)
  if (hit) return hit
  const built = buildValueSeason(ctx.db, leagueId, season)
  if (valueCache.size >= VALUE_CACHE_MAX) {
    const oldest = valueCache.keys().next().value
    if (oldest !== undefined) valueCache.delete(oldest)
  }
  valueCache.set(key, built)
  return built
}
```

Replace `invalidateWeekCache()` with `invalidateCaches()` in three places: `syncDeps` → `onStep`, `IPC.rulesUpdate`, `IPC.rulesReimport`. Leave `IPC.watchlistToggle` on `invalidateWeekCache()`.

After the `IPC.playersWeek` handler:

```ts
  ipcMain.handle(IPC.playersValue, (_event, season: number): PlayersValue => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    const build = cachedValue(ctx, id, season)
    const watched = new Set(listWatched(ctx.db))
    return {
      context: build.context,
      rows: build.rows.map((r) => ({ ...r, watched: watched.has(r.playerId) }))
    }
  })

  ipcMain.handle(IPC.playersDetail, (_event, season: number, playerId: string): PlayerDetail => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    const detail = detailFor(cachedValue(ctx, id, season), playerId)
    if (!detail) throw new Error(`Unknown player ${playerId}`)
    const watched = listWatched(ctx.db).includes(playerId)
    return { ...detail, row: { ...detail.row, watched } }
  })
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green. Then a smoke check in the dev app (`npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu` under WSL) from DevTools console:

```js
console.time('value'); await window.api.players.value(2026); console.timeEnd('value')
```

Expected: a `PlayersValue` with ~800 rows; note the uncached time (budget ≤ 500 ms) in the progress notes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts
git commit -m "feat(ipc): serve cached season value and detail

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Table view model — value columns, generic filter/sort

**Files:**
- Modify: `src/shared/types.ts:48` (`TableMode`)
- Modify: `src/renderer/src/lib/format.ts`
- Modify: `src/renderer/src/lib/playersTableView.ts`
- Test: `tests/renderer/lib/playersTableView.test.ts`

**Interfaces:**
- Produces: `TableMode = 'proj' | 'stats' | 'value'`; `fmtSigned(value): string`; `TableRow = PlayerWeekRow | PlayerValueRow`; `isValueRow`, `isWeekRow` guards; `Column.kind` gains `'value'` with `field: ValueField` and `format: 'int' | 'fixed' | 'signed'`; `columnGroups(tabId, 'value')` → Season + Rest-of-season groups; `cellValue(row: TableRow, …)`, `cellText`; `filterRows<T extends PlayerBaseRow>`; `sortRows<T extends TableRow>`; `subLabel(row: TableRow)`; `DEFAULT_SORT: Record<TableMode, TableSort>`; `replacementLabel(context, positions, kind): string`.

- [ ] **Step 1: `TableMode`** in `src/shared/types.ts`:

```ts
export type TableMode = 'proj' | 'stats' | 'value'
```

`fmtSigned` in `src/renderer/src/lib/format.ts` (after `fmtPoints`):

```ts
/** "+3.2" / "-0.8" / "—". */
export function fmtSigned(value: number | null): string {
  return value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}`
}
```

- [ ] **Step 2: Write the failing tests** — append to `tests/renderer/lib/playersTableView.test.ts`

Add to the imports: `DEFAULT_SORT, replacementLabel` from `@/lib/playersTableView`, `PlayerValueRow, ValueContext` from `@shared/types`. Add a helper next to `row`:

```ts
const valueRow = (over: Partial<PlayerValueRow> = {}): PlayerValueRow => ({
  playerId: 'v1',
  fullName: 'V',
  position: 'RB',
  team: 'PHI',
  byeWeek: 7,
  injuryStatus: null,
  rookie: false,
  watched: false,
  ownerRosterId: null,
  ownerName: null,
  gamesPlayed: 3,
  ppg: 18.4,
  stdValue: 6.28,
  stdRank: 2,
  rosPoints: 120.5,
  rosValue: -1.5,
  rosRank: 9,
  overallRank: 20,
  statsAvailable: true,
  ...over
})
```

and the cases:

```ts
describe('value mode', () => {
  it('has the same two groups on every tab', () => {
    for (const tab of ['ALL', 'QB', 'K', 'FLEX']) {
      const groups = columnGroups(tab, 'value')
      expect(groups.map((g) => g.label)).toEqual(['Season', 'Rest of season'])
      expect(groups.flatMap((g) => g.columns.map((c) => c.key))).toEqual([
        'value:gamesPlayed',
        'value:ppg',
        'value:stdValue',
        'value:stdRank',
        'value:rosPoints',
        'value:rosValue',
        'value:rosRank'
      ])
    }
  })

  it('reads and formats value cells; week columns are null on value rows and vice versa', () => {
    const [season, ros] = columnGroups('ALL', 'value')
    const r = valueRow()
    expect(season.columns.map((c) => cellText(cellValue(r, c, 'value'), c, 'value'))).toEqual([
      '3',
      '18.4',
      '+6.3',
      '2'
    ])
    expect(ros.columns.map((c) => cellText(cellValue(r, c, 'value'), c, 'value'))).toEqual([
      '120.5',
      '-1.5',
      '9'
    ])
    expect(cellText(cellValue(valueRow({ ppg: null, stdRank: null }), season.columns[1], 'value'), season.columns[1], 'value')).toBe('—')
    expect(cellValue(r, columnGroups('ALL', 'stats')[0].columns[0], 'stats')).toBeNull()
    expect(cellValue(row(), season.columns[1], 'value')).toBeNull()
  })

  it('filters and sorts value rows with nulls last', () => {
    const rows = [
      valueRow({ playerId: 'a', fullName: 'A', rosValue: 2 }),
      valueRow({ playerId: 'b', fullName: 'B', rosValue: null }),
      valueRow({ playerId: 'c', fullName: 'C', rosValue: 5, ownerRosterId: 1 })
    ]
    expect(
      filterRows(rows, undefined, { search: '', freeAgents: true, watchlist: false, rookies: false, owner: null }).map((r) => r.playerId)
    ).toEqual(['a', 'b'])
    expect(sortRows(rows, DEFAULT_SORT.value, 'value').map((r) => r.playerId)).toEqual(['c', 'a', 'b'])
    expect(sortRows(rows, { key: 'value:rosValue', dir: 'asc' }, 'value').map((r) => r.playerId)).toEqual(['a', 'c', 'b'])
    expect(DEFAULT_SORT.stats).toEqual({ key: 'points', dir: 'desc' })
  })

  it('labels a value row without a game', () => {
    expect(subLabel(valueRow())).toBe('PHI (bye 7)')
    expect(subLabel(valueRow({ team: null }))).toBe('FA')
  })

  it('describes replacement levels for the tab positions', () => {
    const context: ValueContext = {
      season: 2026,
      currentWeek: 3,
      projectionsStored: true,
      replacement: {
        RB: { std: { level: 8.36, starters: 44 }, ros: { level: 91.2, starters: 43 } },
        WR: { std: null, ros: { level: 80, starters: 45 } }
      }
    }
    expect(replacementLabel(context, ['RB', 'WR'], 'std')).toBe('Replacement PPG · RB 8.4 (44 starters) · WR —')
    expect(replacementLabel(context, ['RB'], 'ros')).toBe('Replacement ROS pts · RB 91.2 (43 starters)')
    expect(replacementLabel(null, ['RB'], 'ros')).toBe('')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/lib/playersTableView.test.ts`
Expected: FAIL — `DEFAULT_SORT` / `replacementLabel` missing, type errors on `'value'`.

- [ ] **Step 4: Implement in `src/renderer/src/lib/playersTableView.ts`**

Imports:

```ts
import { fmtPct, fmtSigned } from '@/lib/format'
import type {
  GameInfo,
  PlayerBaseRow,
  PlayerValueRow,
  PlayerWeekRow,
  PositionTab,
  TableMode,
  ValueContext
} from '@shared/types'
```

Types and guards (replace `ColumnKind` / `Column`):

```ts
export type TableRow = PlayerWeekRow | PlayerValueRow
export const isValueRow = (row: TableRow): row is PlayerValueRow => 'ppg' in row
export const isWeekRow = (row: TableRow): row is PlayerWeekRow => 'game' in row

export type ColumnKind = 'points' | 'delta' | 'stat' | 'snapPct' | 'targetShare' | 'value'
export type ValueField =
  | 'gamesPlayed'
  | 'ppg'
  | 'stdValue'
  | 'stdRank'
  | 'rosPoints'
  | 'rosValue'
  | 'rosRank'

export interface Column {
  /** Sort key (`points`, `delta`, `snapPct`, `targetShare`, `stat:<key>`, `value:<field>`). */
  key: string
  label: string
  kind: ColumnKind
  statKey?: string
  field?: ValueField
  /** Value columns only: integer, one decimal, or signed one decimal. */
  format?: 'int' | 'fixed' | 'signed'
}
```

Value groups (after `ALLOWED`):

```ts
const value = (field: ValueField, label: string, format: 'int' | 'fixed' | 'signed'): Column => ({
  key: `value:${field}`,
  label,
  kind: 'value',
  field,
  format
})
const SEASON = group('Season', [
  value('gamesPlayed', 'G', 'int'),
  value('ppg', 'PPG', 'fixed'),
  value('stdValue', 'VAL', 'signed'),
  value('stdRank', 'RK', 'int')
])
const REST_OF_SEASON = group('Rest of season', [
  value('rosPoints', 'ROS', 'fixed'),
  value('rosValue', 'VAL', 'signed'),
  value('rosRank', 'RK', 'int')
])
```

`columnGroups`: first line of the body becomes `if (mode === 'value') return [SEASON, REST_OF_SEASON]`.

`cellValue` / `cellText`:

```ts
export function cellValue(row: TableRow, col: Column, mode: TableMode): number | null {
  if (col.kind === 'value') return col.field && isValueRow(row) ? row[col.field] : null
  if (!isWeekRow(row)) return null
  switch (col.kind) {
    case 'points':
      return mode === 'proj' ? row.projected : row.points
    case 'delta':
      return row.delta
    case 'snapPct':
      return row.snapPct
    case 'targetShare':
      return row.targetShare
    case 'stat': {
      const line = mode === 'proj' ? row.projection : row.actual
      return line?.[col.statKey ?? ''] ?? null
    }
  }
}

export function cellText(value: number | null, col: Column, mode: TableMode): string {
  if (value === null) return '—'
  if (col.kind === 'value') {
    if (col.format === 'int') return String(value)
    if (col.format === 'signed') return fmtSigned(value)
    return value.toFixed(1)
  }
  if (col.kind === 'snapPct' || col.kind === 'targetShare') return fmtPct(value)
  if (col.kind === 'points') return value.toFixed(1)
  if (col.kind === 'delta') return fmtSigned(value)
  if (mode === 'proj') return value.toFixed(1)
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
```

`gameLabel` now takes the game: `export function gameLabel(g: GameInfo | null, timeZone?: string): string` (body unchanged except the first line `const g = row.game` is removed). `subLabel`:

```ts
/** Second line under the name: "PHI (bye 7) · Sun 1:00 PM vs GB"; value rows have no game: "PHI (bye 7)"; "FA" without a team. */
export function subLabel(row: TableRow, timeZone?: string): string {
  if (!row.team) return 'FA'
  const team = row.byeWeek ? `${row.team} (bye ${row.byeWeek})` : row.team
  return isWeekRow(row) ? `${team} · ${gameLabel(row.game, timeZone)}` : team
}
```

Update the existing `gameLabel` tests to pass `row(...).game` (or a `GameInfo` literal) instead of the row.

Filters, sort, defaults, replacement label:

```ts
export function filterRows<T extends PlayerBaseRow>(
  rows: T[],
  tab: PositionTab | undefined,
  f: TableFilters
): T[] {
  // body unchanged
}

function sortValue(row: TableRow, key: string, mode: TableMode): number | string | null {
  if (key === 'name') return row.fullName
  if (key.startsWith('value:')) return isValueRow(row) ? row[key.slice(6) as ValueField] : null
  if (!isWeekRow(row)) return null
  if (key === 'points') return mode === 'proj' ? row.projected : row.points
  if (key === 'delta') return row.delta
  if (key === 'snapPct') return row.snapPct
  if (key === 'targetShare') return row.targetShare
  if (key.startsWith('stat:')) {
    const line = mode === 'proj' ? row.projection : row.actual
    return line?.[key.slice(5)] ?? null
  }
  return null
}

/** Returns a sorted copy; nulls last in both directions; ties broken by name. */
export function sortRows<T extends TableRow>(rows: T[], sort: TableSort, mode: TableMode): T[] {
  // body unchanged
}

export const DEFAULT_SORT: Record<TableMode, TableSort> = {
  proj: { key: 'points', dir: 'desc' },
  stats: { key: 'points', dir: 'desc' },
  value: { key: 'value:rosValue', dir: 'desc' }
}

/** Tooltip for a VAL header: "Replacement PPG · RB 8.4 (44 starters) · WR —". */
export function replacementLabel(
  context: ValueContext | null,
  positions: string[],
  kind: 'std' | 'ros'
): string {
  if (!context) return ''
  const parts = positions.map((pos) => {
    const level = context.replacement[pos]?.[kind] ?? null
    return level ? `${pos} ${level.level.toFixed(1)} (${level.starters} starters)` : `${pos} —`
  })
  return [kind === 'std' ? 'Replacement PPG' : 'Replacement ROS pts', ...parts].join(' · ')
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/lib/playersTableView.test.ts`
Expected: all passed (existing + 5 new).

- [ ] **Step 6: Verify and commit**

`npm run typecheck` will now fail in `PlayersScreen.tsx` on `gameLabel`/`subLabel` only if the screen calls `gameLabel` directly (it calls `subLabel(p)` — fine). Fix any other typecheck fallout in the screen minimally (the full screen change is Task 9).

```bash
npm run typecheck && npm run lint && npm test
git add src/shared/types.ts src/renderer/src/lib/format.ts src/renderer/src/lib/playersTableView.ts tests/renderer/lib/playersTableView.test.ts
git commit -m "feat(ui): add value columns to the table view model

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Player detail panel on `players.detail`; remove `weeklyStats`

**Files:**
- Create: `src/renderer/src/components/PlayerDetailPanel.tsx`
- Modify: `src/renderer/src/screens/PlayersScreen.tsx` (slide-over → panel; delete `WEEK_STAT_KEYS`, `weekStatKey`, `weeks` state and its effect)
- Delete: `src/main/db/repos/playersQuery.ts`
- Modify: `src/main/ipc/handlers.ts` (remove the `playersWeeklyStats` handler and imports), `src/shared/ipc.ts` (remove `weeklyStats`, `playersWeeklyStats`), `src/preload/index.ts` (remove `weeklyStats`), `src/shared/types.ts` (remove `WeekSnaps`, `WeekStats`)
- Modify: `tests/main/db/playersQuery.test.ts` (remove the `playerWeeklyStats` test and its now-unused imports)

**Interfaces:**
- Consumes: `api.players.detail` (Task 6), `columnGroups`, `cellText`, `TableRow` (Task 7), `fmtPoints`, `fmtPct`, `fmtSigned`, `SlideOver`, `PositionBadge`.
- Produces: `<PlayerDetailPanel season={number} player={TableRow | null} onClose={() => void} />`.

- [ ] **Step 1: Create `src/renderer/src/components/PlayerDetailPanel.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PositionBadge } from '@/components/PositionBadge'
import { SlideOver } from '@/components/SlideOver'
import { api } from '@/lib/api'
import { errorMessage, fmtPct, fmtPoints, fmtSigned } from '@/lib/format'
import { cellText, columnGroups, type TableRow as PlayerRow } from '@/lib/playersTableView'
import type { PlayerDetail, PlayerValueRow } from '@shared/types'

interface PlayerDetailPanelProps {
  season: number
  /** The clicked table row (week or value); null closes the panel. */
  player: PlayerRow | null
  onClose: () => void
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }): React.JSX.Element {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{sub}</dd>
    </div>
  )
}

/** Spec §6.2 item 1: PPG · STD value (pos rank) · ROS value (rank). */
function HeaderStrip({ row }: { row: PlayerValueRow }): React.JSX.Element {
  const rank = (n: number | null): string => (n === null ? '—' : `${row.position ?? ''}${n}`)
  return (
    <dl className="grid grid-cols-3 gap-3">
      <Stat label="PPG" value={fmtPoints(row.ppg)} sub={`${row.gamesPlayed} G`} />
      <Stat label="Value · season" value={fmtSigned(row.stdValue)} sub={rank(row.stdRank)} />
      <Stat
        label="Value · ROS"
        value={fmtSigned(row.rosValue)}
        sub={row.rosPoints === null ? 'no projections' : `${rank(row.rosRank)} · ${row.rosPoints.toFixed(1)} pts`}
      />
    </dl>
  )
}

export function PlayerDetailPanel({ season, player, onClose }: PlayerDetailPanelProps): React.JSX.Element {
  const [detail, setDetail] = useState<PlayerDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const playerId = player?.playerId ?? null

  useEffect(() => {
    setDetail(null)
    setError(null)
    if (playerId === null) return
    let cancelled = false
    void api.players
      .detail(season, playerId)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [season, playerId])

  const played = detail?.weeks.filter((w) => w.played) ?? []
  const statColumns = columnGroups(player?.position ?? 'ALL', 'stats')
    .slice(1)
    .flatMap((g) => g.columns)
    .filter((c) => c.kind === 'stat')
  const showSnaps = player?.position !== 'DEF'

  return (
    <SlideOver
      open={player !== null}
      onClose={onClose}
      title={
        player && (
          <span className="flex items-center gap-2">
            <PositionBadge position={player.position} />
            {player.fullName}
            <span className="font-normal text-muted-foreground">{player.team ?? 'FA'}</span>
          </span>
        )
      }
    >
      {error && <p className="text-destructive text-sm">{error}</p>}
      {detail && <HeaderStrip row={detail.row} />}
      {player && !player.statsAvailable && (
        <p className="mt-4 text-sm text-muted-foreground">
          Stats unavailable — this player could not be matched to nflverse data.
        </p>
      )}
      {detail && player?.statsAvailable && played.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No games yet this season.</p>
      )}
      {played.length > 0 && (
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Wk</TableHead>
              <TableHead className="w-14">Opp</TableHead>
              <TableHead className="w-14 text-right">Pts</TableHead>
              {showSnaps && <TableHead className="w-14 text-right">Snap%</TableHead>}
              {statColumns.map((c) => (
                <TableHead key={c.key} className="text-right">
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {played.map((w) => (
              <TableRow key={w.week}>
                <TableCell className="tabular-nums">{w.week}</TableCell>
                <TableCell className="text-muted-foreground">{w.opponent ?? '—'}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtPoints(w.points)}</TableCell>
                {showSnaps && (
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {fmtPct(w.snapPct)}
                  </TableCell>
                )}
                {statColumns.map((c) => (
                  <TableCell key={c.key} className="text-right tabular-nums">
                    {cellText(w.stats[c.statKey ?? ''] ?? null, c, 'stats')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SlideOver>
  )
}
```

- [ ] **Step 2: Use it in `src/renderer/src/screens/PlayersScreen.tsx`**

- Imports: remove `SlideOver`, `PositionBadge` is still used by the table rows (keep), remove `Table*` imports only if the screen no longer uses them (it does — keep). Add `import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'`. Remove `WeekStats` from the types import; import `type TableRow` from `@/lib/playersTableView`.
- State: `const [selected, setSelected] = useState<TableRow | null>(null)`; delete `const [weeks, setWeeks] = useState<WeekStats[]>([])` and the `useEffect` that calls `api.players.weeklyStats`.
- Row click: `onClick={() => setSelected(p)}` (drop `setWeeks([])`).
- Replace the whole `<SlideOver …>…</SlideOver>` block with:

```tsx
      <PlayerDetailPanel season={season ?? options?.seasons[0] ?? 0} player={selected} onClose={closePanel} />
```

- Delete `WEEK_STAT_KEYS` and `weekStatKey` at the bottom of the file.

- [ ] **Step 3: Remove `weeklyStats` end to end**

- `src/shared/ipc.ts`: delete `weeklyStats(playerId: string): Promise<WeekStats[]>`, `playersWeeklyStats: 'players:weeklyStats'`, and `WeekStats` from the import.
- `src/preload/index.ts`: delete the `weeklyStats` line.
- `src/main/ipc/handlers.ts`: delete the `IPC.playersWeeklyStats` handler, the `playerWeeklyStats` import and `WeekStats` from the types import.
- `src/shared/types.ts`: delete `WeekSnaps` and `WeekStats`.
- `git rm src/main/db/repos/playersQuery.ts`.
- `tests/main/db/playersQuery.test.ts`: delete the `it('playerWeeklyStats merges stats, snaps and points for a player, team rows for a DEF', …)` block (line 162 to its closing `})`) and the `playerWeeklyStats` import; remove any other import ESLint then reports unused (`parsePlayerWeekStats`, `parseSnapCounts`, `parseTeamWeekStats`, `replace*` from `stats`, `* as fx` — only if unused by the remaining `listRoster` tests).

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green; `grep -rn "weeklyStats\|WeekStats\|WEEK_STAT_KEYS" src tests` prints nothing.

Dev-app check: click a row in Stats mode → the panel shows the header strip (PPG, values with ranks) and the game log with the same stat columns and numbers as before (Sleeper keys now come from main).

- [ ] **Step 5: Commit**

```bash
git add -A src/renderer/src/components/PlayerDetailPanel.tsx src/renderer/src/screens/PlayersScreen.tsx src/shared src/preload src/main tests/main/db/playersQuery.test.ts
git commit -m "feat(ui): player detail panel on players.detail

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Value mode on the Players screen

**Files:**
- Modify: `src/renderer/src/screens/PlayersScreen.tsx`

**Interfaces:**
- Consumes: `api.players.value` (Task 6); `DEFAULT_SORT`, `replacementLabel`, `TableRow`, `isValueRow` (Task 7); `PlayerValueRow`, `ValueContext`.

- [ ] **Step 1: State and data**

Add after `rows`:

```tsx
  const [valueRows, setValueRows] = useState<PlayerValueRow[]>([])
  const [valueContext, setValueContext] = useState<ValueContext | null>(null)
```

(`PlayerValueRow`, `ValueContext` join the `@shared/types` import; `DEFAULT_SORT`, `replacementLabel`, `isValueRow`, `type TableRow` join the `@/lib/playersTableView` import.)

After the week-fetching effect, add:

```tsx
  useEffect(() => {
    if (season === null || effectiveMode !== 'value') return
    void api.players
      .value(season)
      .then((v) => {
        setError(null)
        setValueRows(v.rows)
        setValueContext(v.context)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [season, effectiveMode, dataVersion])
```

(`effectiveMode` is declared below the effects today — move `const effectiveMode: TableMode = mode ?? 'stats'` up, right after the `useState` block, so both effects can read it.)

`toggleWatch` updates both lists:

```tsx
  async function toggleWatch(row: TableRow): Promise<void> {
    try {
      const watched = await api.watchlist.toggle(row.playerId)
      const patch = <T extends TableRow>(list: T[]): T[] =>
        list.map((r) => (r.playerId === row.playerId ? { ...r, watched } : r))
      setRows(patch)
      setValueRows(patch)
    } catch (err) {
      setError(errorMessage(err))
    }
  }
```

Mode switching resets the sort when crossing into or out of Value mode (the other modes share `points`):

```tsx
  function switchMode(next: TableMode): void {
    if ((next === 'value') !== (effectiveMode === 'value')) setSort(DEFAULT_SORT[next])
    setMode(next)
  }
```

`visible` reads from the right list:

```tsx
  const visible = useMemo(() => {
    const currentTab = options?.tabs.find((t) => t.id === tab)
    const source: TableRow[] = effectiveMode === 'value' ? valueRows : rows
    const filtered = filterRows(source, currentTab, {
      search,
      freeAgents,
      watchlist,
      rookies,
      owner: owner ? Number(owner) : null
    })
    return sortRows(filtered, sort, effectiveMode)
  }, [rows, valueRows, options, tab, search, freeAgents, watchlist, rookies, owner, sort, effectiveMode])
```

Empty message: prepend a Value-mode branch so the week-based messages never show there:

```tsx
  const empty =
    shown.length === 0
      ? effectiveMode === 'value'
        ? 'No players match.'
        : effectiveMode === 'stats' && !weekPlayed
          ? `Week ${week} hasn't been played yet — switch to Projection.`
          : effectiveMode === 'proj' && !projectionsStored
            ? `No projections stored for week ${week} (they are fetched from the current week on).`
            : 'No players match.'
      : null
```

- [ ] **Step 2: Controls**

Mode toggle — three options, calling `switchMode`:

```tsx
          {(['proj', 'stats', 'value'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cn(
                'h-7 rounded px-3 text-sm',
                effectiveMode === m
                  ? 'bg-primary/20 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {m === 'proj' ? 'Projection' : m === 'stats' ? 'Stats' : 'Value'}
            </button>
          ))}
```

Week select — wrap in `{effectiveMode !== 'value' && ( … )}`.

Under the controls row, a one-line note when ROS is empty (spec §6.3):

```tsx
      {effectiveMode === 'value' && valueContext && !valueContext.projectionsStored && (
        <p className="text-xs text-muted-foreground">
          No projections stored for {season} — rest-of-season columns are empty.
        </p>
      )}
```

- [ ] **Step 3: Table header and cells**

Column heads get the replacement tooltip on the two VAL columns (spec §6.1):

```tsx
            {columns.map((col) => (
              <TableHead
                key={col.key}
                onClick={() => sortBy(col)}
                title={
                  col.field === 'stdValue' || col.field === 'rosValue'
                    ? replacementLabel(
                        valueContext,
                        options?.tabs.find((t) => t.id === tab)?.positions ?? [],
                        col.field === 'stdValue' ? 'std' : 'ros'
                      )
                    : undefined
                }
                className={cn(
                  'w-14 cursor-pointer select-none text-right',
                  sort.key === col.key && 'text-foreground'
                )}
              >
                {col.label}
                {sort.key === col.key ? (sort.dir === 'desc' ? ' ▾' : ' ▴') : ''}
              </TableHead>
            ))}
```

Cells: unmatched players still have ROS from projections, so only Stats mode blanks them; signed value cells get the Δ colouring:

```tsx
              {columns.map((col) => {
                const value =
                  p.statsAvailable || effectiveMode !== 'stats' ? cellValue(p, col, effectiveMode) : null
                const signed = col.kind === 'delta' || col.format === 'signed'
                return (
                  <TableCell
                    key={col.key}
                    className={cn(
                      'text-right tabular-nums',
                      (col.kind === 'points' || col.field === 'rosValue') && 'font-medium',
                      signed && value !== null && (value >= 0 ? 'text-pos-rb' : 'text-destructive')
                    )}
                  >
                    {cellText(value, col, effectiveMode)}
                  </TableCell>
                )
              })}
```

`shown`'s element type is now `TableRow`; `subLabel(p)` already accepts it.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: green.

Dev-app check (WSL: `npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu`):
1. `Value` toggle appears; week select disappears; table shows `Season | Rest of season` groups on every tab, sorted by ROS VAL desc; ALL tab mixes positions.
2. Hover a VAL header → replacement tooltip lists the tab's positions.
3. Chips (Free agents / Watchlist / Rookies), owner select and search filter the value rows; the star toggles without a refetch.
4. Switching back to Stats restores the points sort; switching to Value again keeps the value rows without a refetch (same `dataVersion`).
5. Click a row in Value mode → panel header strip matches the row's numbers.
6. Sanity read: the RB and WR top-10 by ROS VAL look like real rankings (starters at the top, injured/IR players near zero or negative).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/screens/PlayersScreen.tsx
git commit -m "feat(ui): add value mode to the players table

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9b: "How value is calculated" help (added after the user's dev-app check)

User request: explain VAL / ROS in the app. Design agreed: an ⓘ button beside the mode toggle, shown in Value mode only, opening the slide-over with plain-language definitions and this league's replacement table; plus a definition in every value column's header tooltip.

**Files:**
- Modify: `src/shared/types.ts` (`ValueContext.teamCount`), `src/main/value/build.ts`, `tests/main/value/build.test.ts`
- Modify: `src/renderer/src/lib/playersTableView.ts` (`Column.description`, `valueHeaderTitle`), `tests/renderer/lib/playersTableView.test.ts`
- Create: `src/renderer/src/components/ValueHelp.tsx`
- Modify: `src/renderer/src/screens/PlayersScreen.tsx`

- [ ] **Step 1:** `ValueContext` gains `teamCount: number` (from `bundle.teamCount`); the build test asserts it (2) and the table-view context literal gets it.
- [ ] **Step 2:** Test then implement `valueHeaderTitle(col, context, positions): string | undefined` — `col.description` for value columns, joined with `replacementLabel(...)` on a second line for the two VAL columns; `undefined` for non-value columns. Descriptions: G "Games played (weeks with a points row)"; PPG "League points per game over games played"; VAL "PPG minus the position's replacement PPG"; RK "Rank within position by VAL"; ROS "Projected points for the remaining weeks under this league's rules"; VAL (ROS) "ROS minus the position's replacement ROS points"; RK "Rank within position by ROS VAL".
- [ ] **Step 3:** `ValueHelp` — `SlideOver` titled "How value is calculated": a definition list (PPG, VAL season, ROS, VAL ROS, RK, Replacement level with `teamCount`), then a table `Position | Starters (STD / ROS) | Replacement PPG | Replacement ROS pts` from `context.replacement` for the six lineup positions ("—" when null), and the current week.
- [ ] **Step 4:** Screen: `helpOpen` state; an `Info` icon button after the mode toggle when `effectiveMode === 'value'` (aria-label "How value is calculated"); header `title={valueHeaderTitle(col, valueContext, tabPositions)}`; `<ValueHelp open onClose context />`.
- [ ] **Step 5:** `npm run typecheck && npm run lint && npm test`; commit `feat(ui): explain value columns in the app`.

### Task 10: Version 0.5.0, Windows build, tag

Only after the user has checked Task 9 in the dev app and asked for the build.

- [ ] **Step 1:** `package.json` / `package-lock.json` version `0.4.0` → `0.5.0`; `npm run typecheck && npm run lint && npm test`; commit `build: bump version to 0.5.0`.
- [ ] **Step 2:** `npm run build:win`; copy `dist/FantasyCompanion-Setup-0.5.0.exe` to `/mnt/c/Users/habie/OneDrive/Bureau/`.
- [ ] **Step 3:** User installs over 0.4.0 (no migration), confirms Value mode and the detail panel on the real league; record the uncached `players.value` time from Task 6 step 4 in the progress notes.
- [ ] **Step 4:** Progress notes in this plan, commit `docs(plan): mark plan E complete`, tag `v0.5.0`, fast-forward `main`, delete the branch.

---

## Self-review notes

- **Spec coverage:** §2.1 games played / PPG / current week / per-player ROS (T4 `loadSeries` + T5 `aggregate`, mid-week case in `seedSeason`); §2.2 base slots, greedy FLEX per Sleeper slot name, (N+1)-th metric, two independent computations (T2, T5); §2.3 values, positional and overall ranks with tie-breaks (T5); §5.1 `PlayerBaseRow`, `PlayerWeekRow extends`, `PlayerValueRow`, `ValueContext`, `PlayersValue`, `DetailWeek`, `PlayerDetail` (T1, T2, T5 — `signals`/`vsMine`/`droppable`/`ownerIsMe`/`schedule` deferred per Global Constraints); §5.2 two channels, `weeklyStats` removed (T6, T8); §5.3 `series`/`replacement`/`build`, `valueCache` next to `weekCache`, cleared by sync + rules only, watched decorated at serve time, budget measured (T6); §6.1 third mode, week select hidden, groups identical on every tab, ROS VAL default sort, nulls last, header tooltip with replacement level (T7, T9; SOS/Byes/Signals/Mine columns are Plans F/G); §6.2 items 1 and 6 + `PlayerDetailPanel` extraction (T8); §6.3 no projections → "—" + note, preseason → STD "—", unmatched → message with `rosPoints` still served, no-mine cases N/A here (T5, T8, T9); §7 IPC errors surface through the existing `setError` path, no partial builds cached (T6 — a throw inside `buildValueSeason` happens before `valueCache.set`); §8 `replacement.test.ts`, `series.test.ts`, `build.test.ts`, `playersTableView.test.ts`, `seasonReads.test.ts` (T2–T5, T7); §9 files match the file map; §10 row E.
- **Placeholder scan:** none.
- **Type consistency:** `PlayerSeries.base: PlayerBaseRow` (T4) is spread into `PlayerValueRow` (T5) and reused by `baseRow` in `playersWeek` (T1); `ReplacementLevel { level, starters }` (T2) is what `ValueContext.replacement[pos].std/ros` hold (T5) and what `replacementLabel` reads (T7); `SeriesWeek.line` → `DetailWeek.stats` (T5) → `w.stats[c.statKey]` in the panel (T8); `TableRow`, `isValueRow`, `DEFAULT_SORT`, `replacementLabel` (T7) are the names the screen imports (T9); `Column.field`/`format` (T7) drive the tooltip and colouring in T9; `api.players.value(season)` / `.detail(season, playerId)` (T6) match the preload and the panel/screen calls (T8, T9); `listWatched` is the existing export of `watchlist.ts`.
