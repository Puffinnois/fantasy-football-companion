# Plan N — Rest-of-season realism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make rest-of-season values reflect who is actually going to play — formally shelved players stop carrying full projections, and each position's points ladder is reassigned to the FantasyPros consensus order — so the Players table, the power ranking, the trade evaluator and (next) waiver recommendations all read one honest number; ship `v0.15.0`.

**Architecture:** One new pure module, `src/main/value/realism.ts`, rewrites `PlayerSeries.weeks[].projected` for weeks after the current one and reports what it did. It is called at the top of `assembleValue` (`src/main/value/build.ts`), where the series bundle and the expert ranks are both already in hand, so every downstream consumer — `rosPoints`, `rosValue`, replacement levels, `vsMine` / `droppable`, the lineup engine's per-week values, team strength, 6b's trade deltas — inherits the corrected numbers with no further edit. Sleeper's `status`, `injury_body_part` and `injury_notes` are newly carried through the player pipeline: `status` because the shelf rule needs it, the other two for the explanation in the detail panel.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4 + shadcn, Vitest 5 (jsdom + Testing Library for component tests), `node:sqlite`, better-sqlite3-free.

**Spec:** `docs/superpowers/specs/2026-09-22-ros-realism-design.md` — §2 (what the data supports), §3 (the two mechanisms), §4 (where it plugs in), §5 (edge cases), §6 (UI), §7 (testing), §8 (structure), §9 (`v0.15.0`).

## Global Constraints

- Same as Plans C–M: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use` if `node --version` is not 22.x), no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`. Path aliases: `@main/*`, `@shared/*`, `@/*` (renderer). Tests import fixtures relatively (`../../fixtures/...`).
- **Payload conventions** (`docs/reference/value-and-signals.md`): `null` = not computable; points display with 2 decimals (`fmtPoints`), signed with `fmtSigned`, `—` for null.
- **Shelf rule** (spec §3.1): `shelved` when `injury_status` is `IR` or `PUP`, **or** `status` is `Injured Reserve` or `Physically Unable to Perform`. Nothing else — `Out`, `Doubtful`, `Questionable`, `NA`, `Sus`, `DNR`, `COV` are deliberately excluded, because the consensus rank already prices the expected return and zeroing extra weeks would count the injury twice.
- **Correction window** (spec §3.2, §5): only weeks with `!played && week > currentWeek`. The current week and every played week are never touched — the current week keeps its own projection and the lineup engine's injury flag. Note the consequence: a shelved player's _current-week_ projection stays in `rosPoints`; Sleeper almost always omits it for players who are out, so the residue is normally zero, and this is deliberate.
- **Rank matching** (spec §3.2): per position in `LINEUP_POSITIONS`, over candidates that have a ROS rank and are not shelved — free agents included. `base(p)` = Σ future `projected`; ladder = those values sorted descending; order = the same players sorted by consensus `posRank` ascending; `corrected(order[k]) = ladder[k]`; `factor = corrected / base` applied to each future week. Invariants: points conserved within a position, corrected order matches consensus order, and re-running on the output changes nothing.
- **Fallbacks** (spec §5): no expert rows → no rank matching and `rosAdjusted: false`, but the shelf horizon still runs; a past season has no future weeks so both are no-ops; `base = 0` but ranked → spread `corrected` evenly over future weeks that have a game (`opponent !== null`); non-lineup positions (`null`, `FB`, `DB`) are never corrected.
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npx prettier --write <files>` when Prettier complains (never `npm run format` — it reformats unrelated docs that carry pre-existing drift).
- Conventional Commits, summary ≤ 50 chars, imperative, **no trailers** (no `Co-Authored-By`, no "Generated with").
- ESLint is strict: explicit return types on every named function and component, `react-hooks/set-state-in-effect` is an error, no unused vars / imports.
- Decisions locked in here (not in the spec):
  - **Shelved players get `projected = 0`, not `null`**, for future weeks. `null` reads as "no data"; 0 is the actual claim being made. Both sum identically (`w.projected ?? 0`), so only the meaning differs.
  - **Three flat fields on `PlayerBaseRow`** (`status`, `injuryBodyPart`, `injuryNotes`) rather than a nested object, matching the existing flat `injuryStatus`. The compiler finds every construction site; test literals that `toEqual` a whole row need the new keys.
  - **`projPosRank`** is the player's rank within his position by `base` descending, computed over the same pool as the consensus order, so the two ranks in the explanation are directly comparable.
  - **`ARROW_PCT = 0.1`** — the table draws a direction arrow only when `|factor − 1| > 0.1`. The one number in the spec chosen without evidence; it lives in `playersTableView.ts` beside the other display constants.

---

### Task 0: Branch

**Files:** none.

- [ ] **Step 1:** `git checkout -b feat/ros-realism` from `main` (clean, at `904746e` or later).

---

### Task 1: Carry Sleeper's status and injury detail through the player pipeline

The shelf rule needs `status`, which the candidate query selects but never surfaces; the detail panel needs the body part and notes, which are not stored at all.

**Files:**

- Create: `src/main/db/migrations/007_injury.sql`
- Modify: `src/main/db/migrations/index.ts`
- Modify: `src/main/sources/sleeper-types.ts` (`SleeperPlayer`)
- Modify: `src/main/db/repos/players.ts` (`PlayerRecord`, `upsertPlayers`)
- Modify: `src/main/sync/mappers.ts` (`mapPlayers`)
- Modify: `src/main/db/repos/playersWeek.ts` (`CandidateRow`, the `listCandidates` SELECT, `baseRow`)
- Modify: `src/shared/types.ts` (`PlayerBaseRow`)
- Test: `tests/main/sync/mappers.test.ts`, `tests/main/db/players.test.ts`

**Interfaces:**

- Produces: `PlayerBaseRow.status: string | null`, `.injuryBodyPart: string | null`, `.injuryNotes: string | null`; `PlayerRecord.status` already exists, plus `.injuryBodyPart` / `.injuryNotes`; migration version 7 named `injury`.

- [ ] **Step 1: Write the failing test**

Append to `tests/main/sync/mappers.test.ts` (inside the existing `mapPlayers` describe, or add one):

```ts
describe('mapPlayers injury detail (ROS realism spec §2)', () => {
  it('carries status, body part and notes', () => {
    const [row] = mapPlayers({
      '1': {
        player_id: '1',
        full_name: 'Jordan Mason',
        position: 'RB',
        fantasy_positions: ['RB'],
        team: 'MIN',
        status: 'Injured Reserve',
        injury_status: 'IR',
        injury_body_part: 'Thumb',
        injury_notes: 'Surgery'
      }
    })
    expect(row).toMatchObject({
      playerId: '1',
      status: 'Injured Reserve',
      injuryStatus: 'IR',
      injuryBodyPart: 'Thumb',
      injuryNotes: 'Surgery'
    })
  })

  it('defaults the new fields to null', () => {
    const [row] = mapPlayers({
      '2': {
        player_id: '2',
        full_name: 'Healthy Guy',
        position: 'WR',
        fantasy_positions: ['WR'],
        team: 'SF'
      }
    })
    expect(row).toMatchObject({ injuryBodyPart: null, injuryNotes: null })
  })
})
```

Create `tests/main/db/players.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { listCandidates } from '@main/db/repos/playersWeek'
import { upsertPlayers } from '@main/db/repos/players'
import { seedLeague, SEED_TS } from '../../fixtures/db'

describe('players repo injury detail', () => {
  it('round-trips status, body part and notes into the candidate rows', () => {
    const db = seedLeague()
    upsertPlayers(
      db,
      [
        {
          playerId: '4866',
          fullName: 'Saquon Barkley',
          firstName: 'Saquon',
          lastName: 'Barkley',
          position: 'RB',
          fantasyPositions: ['RB'],
          team: 'PHI',
          status: 'Injured Reserve',
          injuryStatus: 'IR',
          injuryBodyPart: 'Knee - ACL',
          injuryNotes: 'Surgery',
          age: null,
          yearsExp: null,
          depthChartOrder: null,
          searchRank: null,
          gsisId: null,
          sportradarId: null,
          espnId: null
        }
      ],
      SEED_TS
    )
    const row = listCandidates(db, 'L1').find((r) => r.player_id === '4866')
    expect(row).toMatchObject({
      status: 'Injured Reserve',
      injury_status: 'IR',
      injury_body_part: 'Knee - ACL',
      injury_notes: 'Surgery'
    })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/db/players.test.ts tests/main/sync/mappers.test.ts`
Expected: FAIL — `injuryBodyPart` is not a known property of `PlayerRecord`, and the candidate row has no `injury_body_part`.

- [ ] **Step 3: Add the migration**

Create `src/main/db/migrations/007_injury.sql`:

```sql
ALTER TABLE players ADD COLUMN injury_body_part TEXT;
ALTER TABLE players ADD COLUMN injury_notes TEXT;
```

In `src/main/db/migrations/index.ts`, add the import beside the others and the entry at the end of the array:

```ts
import injurySql from './007_injury.sql?raw'
```

```ts
  { version: 7, name: 'injury', sql: injurySql }
```

- [ ] **Step 4: Widen the source type and the record**

In `src/main/sources/sleeper-types.ts`, inside `SleeperPlayer`, after `injury_status`:

```ts
  /** ~90 % populated, but "Undisclosed" and "Coach's Decision" are common non-answers. */
  injury_body_part?: string | null
  /** ~11 % populated; "Surgery" / "Strain" / "Soreness" when present. */
  injury_notes?: string | null
```

In `src/main/db/repos/players.ts`, inside `PlayerRecord`, after `injuryStatus`:

```ts
injuryBodyPart: string | null
injuryNotes: string | null
```

In the same file, `upsertPlayers`: add the two columns to the INSERT list and the `VALUES` placeholders, add them to the `DO UPDATE SET` list, and bind them after `p.injuryStatus`:

```ts
;`INSERT INTO players (player_id, full_name, first_name, last_name, position, fantasy_positions, team, status,
       injury_status, injury_body_part, injury_notes, age, years_exp, depth_chart_order, search_rank, gsis_id,
       sportradar_id, espn_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET full_name = excluded.full_name, first_name = excluded.first_name,
       last_name = excluded.last_name, position = excluded.position, fantasy_positions = excluded.fantasy_positions,
       team = excluded.team, status = excluded.status, injury_status = excluded.injury_status,
       injury_body_part = excluded.injury_body_part, injury_notes = excluded.injury_notes, age = excluded.age,
       years_exp = excluded.years_exp, depth_chart_order = excluded.depth_chart_order, search_rank = excluded.search_rank,
       gsis_id = excluded.gsis_id, sportradar_id = excluded.sportradar_id, espn_id = excluded.espn_id,
       updated_at = excluded.updated_at`
```

```ts
      p.injuryStatus,
      p.injuryBodyPart,
      p.injuryNotes,
```

In `src/main/sync/mappers.ts`, in `mapPlayers`, beside `injuryStatus: p.injury_status ?? null`:

```ts
      injuryBodyPart: p.injury_body_part ?? null,
      injuryNotes: p.injury_notes ?? null,
```

- [ ] **Step 5: Surface them on the candidate row**

In `src/main/db/repos/playersWeek.ts`, add to `CandidateRow` after `injury_status`:

```ts
/** Sleeper roster status: 'Active', 'Injured Reserve', 'Physically Unable to Perform', … */
status: string | null
injury_body_part: string | null
injury_notes: string | null
```

In the `listCandidates` SELECT, extend the projected columns (`status` is already selected for the WHERE clause; the two new ones are not):

```sql
           p.team, p.status, p.injury_status, p.injury_body_part, p.injury_notes, p.years_exp,
```

In `baseRow`, after `injuryStatus: r.injury_status`:

```ts
    status: r.status,
    injuryBodyPart: r.injury_body_part,
    injuryNotes: r.injury_notes,
```

In `src/shared/types.ts`, inside `PlayerBaseRow`, after `injuryStatus`:

```ts
/** Sleeper roster status: 'Active', 'Injured Reserve', 'Physically Unable to Perform', … */
status: string | null
/** Sleeper injury detail: body part is ~90 % populated, notes ~11 %. Display only. */
injuryBodyPart: string | null
injuryNotes: string | null
```

- [ ] **Step 6: Run the tests and fix the fallout**

Run: `npm run typecheck`
Expected: errors at every place that builds a `PlayerRecord` or a `PlayerBaseRow` literal. Add `status: 'Active', injuryBodyPart: null, injuryNotes: null` (or the values the case needs) at each one — the fixtures under `tests/fixtures/` and any test that `toEqual`s a whole row.

Run: `npm test`
Expected: PASS. Where a test compares a full row with `toEqual`, add the three new keys to the expectation.

- [ ] **Step 7: Commit**

```bash
git add src/main/db/migrations/007_injury.sql src/main/db/migrations/index.ts src/main/sources/sleeper-types.ts src/main/db/repos/players.ts src/main/db/repos/playersWeek.ts src/main/sync/mappers.ts src/shared/types.ts tests/
git commit -m "feat(sync): store Sleeper status and injury detail"
```

---

### Task 2: `realism.ts` — the shelf horizon and rank matching

**Files:**

- Create: `src/main/value/realism.ts`
- Modify: `src/shared/types.ts` (`RosAdjustment`)
- Test: `tests/main/value/realism.test.ts`

**Interfaces:**

- Consumes: `PlayerSeries`, `SeriesWeek` (`@main/value/series`); `ExpertRankRow` (`@main/db/repos/expertRanks`); `LINEUP_POSITIONS` (`@shared/rules`); `PlayerBaseRow.status` (Task 1).
- Produces: `RosAdjustment` (shared type); `SHELF_INJURY`, `SHELF_STATUS`, `shelved(base): boolean`; `applyRosRealism(players: PlayerSeries[], currentWeek: number, ranks: Map<string, ExpertRankRow>): RealismResult` where `RealismResult = { players: PlayerSeries[]; adjustments: Map<string, RosAdjustment>; adjusted: boolean }`.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/value/realism.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import type { PlayerSeries, SeriesWeek } from '@main/value/series'
import { applyRosRealism, shelved } from '@main/value/realism'

const CURRENT = 3

function week(w: number, projected: number | null, over: Partial<SeriesWeek> = {}): SeriesWeek {
  return {
    week: w,
    opponent: 'DAL',
    played: w < CURRENT,
    points: null,
    projected,
    line: {},
    snapPct: null,
    targetShare: null,
    rushShare: null,
    airYardsShare: null,
    wopr: null,
    ...over
  }
}

/** A player with the same projection in weeks 3–6; week 3 is the current week. */
function player(
  id: string,
  position: string | null,
  perWeek: number | null,
  over: { injuryStatus?: string | null; status?: string | null; weeks?: SeriesWeek[] } = {}
): PlayerSeries {
  return {
    base: {
      playerId: id,
      fullName: `Player ${id}`,
      position,
      team: 'PHI',
      byeWeek: null,
      injuryStatus: over.injuryStatus ?? null,
      status: over.status ?? 'Active',
      injuryBodyPart: null,
      injuryNotes: null,
      rookie: false,
      watched: false,
      ownerRosterId: null,
      ownerName: null,
      ownerIsMe: false
    },
    statsAvailable: true,
    rosterSlot: null,
    weeks: over.weeks ?? [3, 4, 5, 6].map((w) => week(w, perWeek))
  }
}

function rank(id: string, posRank: number): [string, ExpertRankRow] {
  return [
    id,
    {
      playerId: id,
      rankEcr: posRank,
      posRank,
      rankAve: null,
      rankStd: null,
      rankMin: null,
      rankMax: null,
      experts: 10,
      grade: null,
      projPts: null,
      scoring: 'PPR',
      updatedAt: '2026-09-22T00:00:00.000Z'
    }
  ]
}

/** Σ of the weeks the correction may touch: unplayed and after the current week. */
const future = (s: PlayerSeries): number =>
  s.weeks.filter((w) => !w.played && w.week > CURRENT).reduce((t, w) => t + (w.projected ?? 0), 0)
const byId = (list: PlayerSeries[]): Map<string, PlayerSeries> =>
  new Map(list.map((s) => [s.base.playerId, s]))

describe('shelved (spec §3.1)', () => {
  const base = (
    injuryStatus: string | null,
    status: string | null
  ): Parameters<typeof shelved>[0] => ({
    injuryStatus,
    status
  })
  it.each([
    ['IR', 'Active', true],
    [null, 'Injured Reserve', true],
    ['PUP', 'Active', true],
    [null, 'Physically Unable to Perform', true],
    ['Out', 'Active', false],
    ['Doubtful', 'Active', false],
    ['Questionable', 'Active', false],
    ['Sus', 'Active', false],
    ['NA', 'Active', false],
    [null, 'Active', false],
    [null, null, false]
  ])('injury=%s status=%s → %s', (injury, status, expected) => {
    expect(shelved(base(injury, status))).toBe(expected)
  })
})

describe('applyRosRealism (spec §3.2)', () => {
  it('zeroes the weeks after the current one for a shelved player and leaves the rest alone', () => {
    const shelf = player('shelf', 'RB', 10, { injuryStatus: 'IR' })
    const { players, adjustments } = applyRosRealism([shelf], CURRENT, new Map())
    const out = byId(players).get('shelf')
    if (!out) throw new Error('missing')
    expect(out.weeks.map((w) => [w.week, w.projected])).toEqual([
      [3, 10], // the current week is never touched
      [4, 0],
      [5, 0],
      [6, 0]
    ])
    expect(adjustments.get('shelf')).toEqual({
      shelved: true,
      factor: null,
      projPosRank: null,
      expertPosRank: null
    })
  })

  it('never touches a played week', () => {
    const weeks = [week(2, 9, { played: true, points: 14 }), week(4, 10), week(5, 10)]
    const s = player('p', 'RB', null, { injuryStatus: 'IR', weeks })
    const { players } = applyRosRealism([s], CURRENT, new Map())
    expect(players[0].weeks[0]).toMatchObject({ week: 2, projected: 9, points: 14 })
  })

  it('reassigns the position ladder to the consensus order', () => {
    // projections say A(60) > B(40) > C(20); the consensus says C, A, B.
    const a = player('a', 'RB', 20)
    const b = player('b', 'RB', 13.3333)
    const c = player('c', 'RB', 6.6667)
    const ranks = new Map([rank('c', 1), rank('a', 2), rank('b', 3)])
    const { players, adjustments, adjusted } = applyRosRealism([a, b, c], CURRENT, ranks)
    expect(adjusted).toBe(true)
    const out = byId(players)
    const got = (id: string): number => Math.round(future(out.get(id) as PlayerSeries))
    expect([got('c'), got('a'), got('b')]).toEqual([60, 40, 20])
    expect(adjustments.get('c')).toMatchObject({ shelved: false, projPosRank: 3, expertPosRank: 1 })
    expect(adjustments.get('a')).toMatchObject({ projPosRank: 1, expertPosRank: 2 })
    // c was worth 20 and is now worth 60
    expect(adjustments.get('c')?.factor).toBeCloseTo(3, 4)
  })

  it('conserves the position total and is idempotent', () => {
    const list = [player('a', 'WR', 20), player('b', 'WR', 12), player('c', 'WR', 5)]
    const ranks = new Map([rank('b', 1), rank('c', 2), rank('a', 3)])
    const before = list.reduce((t, s) => t + future(s), 0)
    const once = applyRosRealism(list, CURRENT, ranks)
    expect(once.players.reduce((t, s) => t + future(s), 0)).toBeCloseTo(before, 4)
    const twice = applyRosRealism(once.players, CURRENT, ranks)
    expect(twice.players.map(future)).toEqual(once.players.map(future))
    for (const [id, adj] of twice.adjustments) expect([id, adj.factor]).toEqual([id, 1])
  })

  it('frees a shelved player’s rung for the players below him', () => {
    // A is shelved; the ladder is then B(40), C(20) handed to the consensus order C, B.
    const a = player('a', 'TE', 20, { injuryStatus: 'IR' })
    const b = player('b', 'TE', 13.3333)
    const c = player('c', 'TE', 6.6667)
    const ranks = new Map([rank('a', 1), rank('c', 2), rank('b', 3)])
    const { players } = applyRosRealism([a, b, c], CURRENT, ranks)
    const out = byId(players)
    expect(Math.round(future(out.get('a') as PlayerSeries))).toBe(0)
    expect(Math.round(future(out.get('c') as PlayerSeries))).toBe(40)
    expect(Math.round(future(out.get('b') as PlayerSeries))).toBe(20)
  })

  it('leaves unranked players and non-lineup positions untouched', () => {
    const ranked = player('r', 'RB', 10)
    const unranked = player('u', 'RB', 30)
    const fullback = player('f', 'FB', 25)
    const noPosition = player('n', null, 25)
    const ranks = new Map([rank('r', 1), rank('f', 1), rank('n', 1)])
    const { players } = applyRosRealism([ranked, unranked, fullback, noPosition], CURRENT, ranks)
    const out = byId(players)
    // r is the only ranked RB, so his own ladder value comes back unchanged
    expect(future(out.get('r') as PlayerSeries)).toBeCloseTo(30, 4)
    expect(future(out.get('u') as PlayerSeries)).toBeCloseTo(90, 4)
    expect(future(out.get('f') as PlayerSeries)).toBeCloseTo(75, 4)
    expect(future(out.get('n') as PlayerSeries)).toBeCloseTo(75, 4)
  })

  it('spreads the corrected total when a ranked player has nothing projected', () => {
    // b has no projections at all but the consensus ranks him first, so he takes a's ladder rung.
    const a = player('a', 'QB', 10)
    const b = player('b', 'QB', null, {
      weeks: [week(4, null), week(5, null), week(6, null, { opponent: null })]
    })
    const ranks = new Map([rank('b', 1), rank('a', 2)])
    const { players, adjustments } = applyRosRealism([a, b], CURRENT, ranks)
    const out = byId(players)
    expect(future(out.get('b') as PlayerSeries)).toBeCloseTo(30, 4)
    // spread over the two weeks with a game, not the bye
    expect((out.get('b') as PlayerSeries).weeks.map((w) => w.projected)).toEqual([15, 15, null])
    expect(future(out.get('a') as PlayerSeries)).toBeCloseTo(0, 4)
    expect(adjustments.get('b')?.factor).toBeNull()
  })

  it('does nothing without expert ranks, and reports it', () => {
    const list = [player('a', 'RB', 20), player('b', 'RB', 5)]
    const { players, adjusted, adjustments } = applyRosRealism(list, CURRENT, new Map())
    expect(adjusted).toBe(false)
    expect(players.map(future)).toEqual([60, 15])
    expect(adjustments.get('a')).toEqual({
      shelved: false,
      factor: null,
      projPosRank: null,
      expertPosRank: null
    })
  })

  it('is a no-op for a past season, where no week is ahead', () => {
    const past = player('a', 'RB', 10, {
      weeks: [week(17, 10, { played: true }), week(18, 10, { played: true })]
    })
    const { players } = applyRosRealism([past], 19, new Map([rank('a', 1)]))
    expect(players[0].weeks.map((w) => w.projected)).toEqual([10, 10])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/value/realism.test.ts`
Expected: FAIL — `Failed to resolve import "@main/value/realism"`.

- [ ] **Step 3: Add the shared type**

In `src/shared/types.ts`, before `PlayerValueRow`:

```ts
/** Rest-of-season realism spec §3.3: what the correction did to one player. */
export interface RosAdjustment {
  /** IR / PUP / Injured Reserve: every week after the current one is 0. */
  shelved: boolean
  /** The scale applied to each remaining week; null when there was no scale to apply. */
  factor: number | null
  /** Rank within position by raw projection, and by consensus. */
  projPosRank: number | null
  expertPosRank: number | null
}
```

- [ ] **Step 4: Implement `src/main/value/realism.ts`**

```ts
import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { RosAdjustment } from '@shared/types'
import type { PlayerSeries, SeriesWeek } from './series'

/** Spec §3.1: `injury_status` values that mean the player is formally shelved. */
export const SHELF_INJURY: ReadonlySet<string> = new Set(['IR', 'PUP'])
/** Spec §3.1: `status` values that mean the same. */
export const SHELF_STATUS: ReadonlySet<string> = new Set([
  'Injured Reserve',
  'Physically Unable to Perform'
])

export function shelved(base: { injuryStatus: string | null; status: string | null }): boolean {
  return SHELF_INJURY.has(base.injuryStatus ?? '') || SHELF_STATUS.has(base.status ?? '')
}

export interface RealismResult {
  players: PlayerSeries[]
  adjustments: Map<string, RosAdjustment>
  /** False when no expert ranks were available: the shelf horizon ran, the correction did not. */
  adjusted: boolean
}

const NONE: RosAdjustment = {
  shelved: false,
  factor: null,
  projPosRank: null,
  expertPosRank: null
}

/** Spec §3.2 / §5: the weeks the correction may touch — unplayed, and after the current week. */
function isFuture(w: SeriesWeek, currentWeek: number): boolean {
  return !w.played && w.week > currentWeek
}

function futureTotal(s: PlayerSeries, currentWeek: number): number {
  return s.weeks.reduce((t, w) => (isFuture(w, currentWeek) ? t + (w.projected ?? 0) : t), 0)
}

/** A copy of the player whose future weeks are rewritten by `next`; other weeks are shared. */
function rewrite(
  s: PlayerSeries,
  currentWeek: number,
  next: (w: SeriesWeek) => number | null
): PlayerSeries {
  return {
    ...s,
    weeks: s.weeks.map((w) => (isFuture(w, currentWeek) ? { ...w, projected: next(w) } : w))
  }
}

/**
 * Rest-of-season realism spec §3: shelved players stop carrying future projections, and each
 * position's points ladder is reassigned to the consensus order, so the rungs freed by shelved
 * players pass down to the players below them.
 */
export function applyRosRealism(
  players: PlayerSeries[],
  currentWeek: number,
  ranks: Map<string, ExpertRankRow>
): RealismResult {
  const adjustments = new Map<string, RosAdjustment>(players.map((s) => [s.base.playerId, NONE]))

  // §3.1 shelf horizon, first: it decides who is in the ladder below.
  const shelfed = players.map((s) => {
    if (!shelved(s.base)) return s
    adjustments.set(s.base.playerId, { ...NONE, shelved: true })
    return rewrite(s, currentWeek, () => 0)
  })
  if (ranks.size === 0) return { players: shelfed, adjustments, adjusted: false }

  // §3.2 rank matching, per lineup position, over ranked and unshelved players.
  const corrected = new Map<string, PlayerSeries>()
  for (const position of LINEUP_POSITIONS) {
    const pool = shelfed.filter(
      (s) =>
        s.base.position === position &&
        !adjustments.get(s.base.playerId)?.shelved &&
        ranks.has(s.base.playerId)
    )
    if (pool.length === 0) continue
    const base = new Map(pool.map((s) => [s.base.playerId, futureTotal(s, currentWeek)]))
    const value = (s: PlayerSeries): number => base.get(s.base.playerId) ?? 0
    const ladder = [...pool].sort((a, b) => value(b) - value(a))
    const order = [...pool].sort(
      (a, b) =>
        (ranks.get(a.base.playerId)?.posRank ?? 0) - (ranks.get(b.base.playerId)?.posRank ?? 0)
    )
    const projRank = new Map(ladder.map((s, i) => [s.base.playerId, i + 1]))

    order.forEach((s, i) => {
      const id = s.base.playerId
      const target = value(ladder[i])
      const from = value(s)
      const common = {
        shelved: false,
        projPosRank: projRank.get(id) ?? null,
        expertPosRank: ranks.get(id)?.posRank ?? null
      }
      if (from > 0) {
        const factor = target / from
        adjustments.set(id, { ...common, factor })
        corrected.set(
          id,
          rewrite(s, currentWeek, (w) => (w.projected === null ? null : w.projected * factor))
        )
        return
      }
      // §5: nothing to scale, so spread the corrected total over the weeks that have a game.
      adjustments.set(id, { ...common, factor: null })
      const playable = s.weeks.filter((w) => isFuture(w, currentWeek) && w.opponent !== null)
      if (playable.length === 0 || target === 0) return
      const each = target / playable.length
      const ids = new Set(playable.map((w) => w.week))
      corrected.set(
        id,
        rewrite(s, currentWeek, (w) => (ids.has(w.week) ? each : w.projected))
      )
    })
  }
  return {
    players: shelfed.map((s) => corrected.get(s.base.playerId) ?? s),
    adjustments,
    adjusted: true
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/value/realism.test.ts`
Expected: PASS (all cases). If the ladder test fails by a rounding hair, check that the test's `future()` helper and the module both sum only unplayed weeks after `currentWeek`. Then `npm run typecheck && npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/main/value/realism.ts src/shared/types.ts tests/main/value/realism.test.ts
git commit -m "feat(value): shelf injured players, match ROS ranks"
```

---

### Task 3: Wire the correction into the value build

**Files:**

- Modify: `src/main/value/build.ts:99-220` (`assembleValue`)
- Modify: `src/shared/types.ts` (`ValueContext.rosAdjusted`, `PlayerValueRow.rosAdjust`)
- Test: `tests/main/value/realismBuild.test.ts`

**Interfaces:**

- Consumes: `applyRosRealism`, `RealismResult` (Task 2); `indexExperts` (`@main/value/expert`, already imported in `build.ts`).
- Produces: `ValueContext.rosAdjusted: boolean`; `PlayerValueRow.rosAdjust: RosAdjustment | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/main/value/realismBuild.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { replaceExpertRanks, ROS_WEEK, type ExpertRankRecord } from '@main/db/repos/expertRanks'
import { upsertPlayers } from '@main/db/repos/players'
import { buildValueSeason } from '@main/value/build'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'
import * as fx from '../../fixtures/sleeper'
import { mapPlayers } from '@main/sync/mappers'

/** Barkley (4866) and Bijan (9509) are the fixture's RBs; Jefferson (6794) and Chase (7564) the WRs. */
function rankRow(playerId: string, posRank: number): ExpertRankRecord {
  return {
    playerId,
    rankEcr: posRank,
    posRank,
    rankAve: null,
    rankStd: null,
    rankMin: null,
    rankMax: null,
    experts: 12,
    grade: null,
    projPts: null
  }
}

describe('rest-of-season realism in the value build', () => {
  let db: Db
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
  })

  it('reports no adjustment without expert ranks', () => {
    const build = buildValueSeason(db, 'L1', SEASON)
    expect(build.context.rosAdjusted).toBe(false)
    expect(build.rows.every((r) => r.rosAdjust?.factor == null)).toBe(true)
  })

  it('zeroes a shelved player and hands his rung to the player below', () => {
    const before = buildValueSeason(db, 'L1', SEASON)
    const barkleyBefore = before.rows.find((r) => r.playerId === '4866')?.rosPoints ?? 0
    const bijanBefore = before.rows.find((r) => r.playerId === '9509')?.rosPoints ?? 0
    expect(barkleyBefore).toBeGreaterThan(bijanBefore)

    // Shelve Barkley and rank the two RBs: Barkley first (ignored, he is shelved), Bijan second.
    upsertPlayers(
      db,
      mapPlayers({
        ...fx.players,
        '4866': { ...fx.players['4866'], injury_status: 'IR', status: 'Injured Reserve' }
      }),
      SEED_TS
    )
    replaceExpertRanks(
      db,
      SEASON,
      ROS_WEEK,
      'PPR',
      [rankRow('4866', 1), rankRow('9509', 2)],
      SEED_TS
    )

    const after = buildValueSeason(db, 'L1', SEASON)
    expect(after.context.rosAdjusted).toBe(true)
    const barkley = after.rows.find((r) => r.playerId === '4866')
    const bijan = after.rows.find((r) => r.playerId === '9509')
    expect(barkley?.rosAdjust).toMatchObject({ shelved: true, factor: null })
    expect(barkley?.rosPoints).toBe(0)
    // Bijan is the only unshelved ranked RB, so he keeps his own rung — but Barkley's is gone.
    expect(bijan?.rosPoints).toBeCloseTo(bijanBefore, 2)
    expect(bijan?.rosAdjust).toMatchObject({ shelved: false, expertPosRank: 2 })
  })

  it('swaps two players’ rest-of-season points when the consensus disagrees with the projections', () => {
    const before = buildValueSeason(db, 'L1', SEASON)
    const jeffersonBefore = before.rows.find((r) => r.playerId === '6794')?.rosPoints ?? 0
    const chaseBefore = before.rows.find((r) => r.playerId === '7564')?.rosPoints ?? 0
    expect(jeffersonBefore).toBeGreaterThan(chaseBefore)

    // The consensus puts Chase first.
    replaceExpertRanks(
      db,
      SEASON,
      ROS_WEEK,
      'PPR',
      [rankRow('7564', 1), rankRow('6794', 2)],
      SEED_TS
    )
    const after = buildValueSeason(db, 'L1', SEASON)
    expect(after.rows.find((r) => r.playerId === '7564')?.rosPoints).toBeCloseTo(jeffersonBefore, 2)
    expect(after.rows.find((r) => r.playerId === '6794')?.rosPoints).toBeCloseTo(chaseBefore, 2)
    expect(after.rows.find((r) => r.playerId === '7564')?.rosAdjust).toMatchObject({
      projPosRank: 2,
      expertPosRank: 1
    })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/main/value/realismBuild.test.ts`
Expected: FAIL — `rosAdjusted` and `rosAdjust` do not exist.

- [ ] **Step 3: Add the shared fields**

In `src/shared/types.ts`, inside `ValueContext`, after `projectionsStored`:

```ts
/** Rest-of-season realism spec §4: false when no expert ranks were available to match against. */
rosAdjusted: boolean
```

Inside `PlayerValueRow`, after `rosValue`:

```ts
/** What the rest-of-season correction did to this player; null outside the corrected pool. */
rosAdjust: RosAdjustment | null
```

- [ ] **Step 4: Call it from `assembleValue`**

In `src/main/value/build.ts`, add the import beside the other `./` imports:

```ts
import { applyRosRealism } from './realism'
```

Then rework the top of `assembleValue`. The existing body starts with `const aggregates = bundle.players.map(...)` at line 103 and calls `const ex = indexExperts(experts)` further down at line 157; move that call up and correct the series before anything reads them:

```ts
export function assembleValue(
  bundle: SeriesBundle,
  experts: ExpertBundle = NO_EXPERTS
): ValueBuild {
  const ex = indexExperts(experts)
  // Spec §4: correct the series before anything reads them, so every consumer inherits it.
  const realism = applyRosRealism(bundle.players, bundle.currentWeek, ex.ranks)
  const players = realism.players
  const aggregates = players.map((p) => aggregate(bundle, p))
```

Delete the later `const ex = indexExperts(experts)` line so it is not declared twice.

Replace the three remaining reads of `bundle.players` inside `assembleValue` with `players`:

```ts
const totals = positionTotals(players)
const defense = defenseRanks(players)
```

```ts
    series: new Map(players.map((p) => [p.base.playerId, p])),
```

In the row object, after `rosValue: v.rosValue,`:

```ts
      rosAdjust: realism.adjustments.get(series.base.playerId) ?? null,
```

In the returned `context`, after `projectionsStored: bundle.projectionsStored,`:

```ts
      rosAdjusted: realism.adjusted,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/value/realismBuild.test.ts`
Expected: PASS.

Run: `npm run typecheck && npm test`
Expected: the compiler flags every `ValueContext` literal in the tests (`tests/renderer/lib/playersTableView.test.ts` has several) — add `rosAdjusted: false`. Where a test asserts a whole `PlayerValueRow` with `toEqual`, add `rosAdjust: null` or the value the case produces. Any test that seeds FantasyPros ROS ranks **and** asserts `rosPoints` now sees corrected numbers: recompute the expectation by hand from the ladder rather than pasting whatever the run prints.

- [ ] **Step 6: Commit**

```bash
git add src/main/value/build.ts src/shared/types.ts tests/
git commit -m "feat(value): apply ROS realism in the value build"
```

---

### Task 4: Surface the adjustment in the UI

**Files:**

- Modify: `src/renderer/src/lib/playersTableView.ts` (`ARROW_PCT`, `rosAdjustMark`, `rosAdjustLine`)
- Modify: `src/renderer/src/components/PlayerDetailPanel.tsx` (the "Rest of season" line)
- Test: `tests/renderer/lib/playersTableView.test.ts`

**Interfaces:**

- Consumes: `PlayerValueRow.rosAdjust`, `PlayerBaseRow.injuryBodyPart` / `.injuryNotes` (Tasks 1 and 3).
- Produces: `ARROW_PCT = 0.1`; `rosAdjustMark(row): '↑' | '↓' | 'IR' | null`; `rosAdjustLine(row): string | null`.

- [ ] **Step 1: Write the failing test**

Append to `tests/renderer/lib/playersTableView.test.ts` (add `ARROW_PCT`, `rosAdjustMark` and `rosAdjustLine` to the `@/lib/playersTableView` import, and build rows with the file's existing `valueRow(over)` helper at line 56):

```ts
describe('rest-of-season adjustment (realism spec §6)', () => {
  const row = (
    rosAdjust: PlayerValueRow['rosAdjust'],
    over: Partial<PlayerValueRow> = {}
  ): PlayerValueRow => ({ ...valueRow(), rosAdjust, ...over })

  it('marks a shelved player and explains why', () => {
    const shelved = row(
      { shelved: true, factor: null, projPosRank: null, expertPosRank: null },
      { injuryStatus: 'IR', injuryBodyPart: 'Knee - ACL', injuryNotes: 'Surgery' }
    )
    expect(rosAdjustMark(shelved)).toBe('IR')
    expect(rosAdjustLine(shelved)).toBe('IR (Knee - ACL, Surgery) — remaining weeks zeroed')
  })

  it('falls back to the status alone when Sleeper gives no detail', () => {
    const bare = row(
      { shelved: true, factor: null, projPosRank: null, expertPosRank: null },
      { injuryStatus: 'PUP', injuryBodyPart: null, injuryNotes: null }
    )
    expect(rosAdjustLine(bare)).toBe('PUP — remaining weeks zeroed')
  })

  it('draws an arrow only past the threshold', () => {
    const down = row({ shelved: false, factor: 0.62, projPosRank: 8, expertPosRank: 24 })
    const up = row({ shelved: false, factor: 1.4, projPosRank: 30, expertPosRank: 12 })
    const flat = row({ shelved: false, factor: 1.05, projPosRank: 5, expertPosRank: 5 })
    expect(rosAdjustMark(down)).toBe('↓')
    expect(rosAdjustMark(up)).toBe('↑')
    expect(rosAdjustMark(flat)).toBeNull()
    expect(ARROW_PCT).toBe(0.1)
  })

  it('explains a scaled player with both ranks', () => {
    const down = row(
      { shelved: false, factor: 0.62, projPosRank: 8, expertPosRank: 24 },
      { position: 'RB' }
    )
    expect(rosAdjustLine(down)).toBe('projection RB8 → consensus RB24 · scaled ×0.62')
  })

  it('says nothing for an untouched player', () => {
    expect(rosAdjustMark(row(null))).toBeNull()
    expect(rosAdjustLine(row(null))).toBeNull()
    const spread = row(
      { shelved: false, factor: null, projPosRank: 4, expertPosRank: 2 },
      { position: 'QB' }
    )
    expect(rosAdjustMark(spread)).toBeNull()
    expect(rosAdjustLine(spread)).toBe('projection QB4 → consensus QB2')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/renderer/lib/playersTableView.test.ts`
Expected: FAIL — `rosAdjustMark is not a function`.

- [ ] **Step 3: Implement the helpers**

Append to `src/renderer/src/lib/playersTableView.ts`:

```ts
/** Spec §6: the table marks a correction only when it moved the value by more than this. */
export const ARROW_PCT = 0.1

/** '↑' / '↓' past the threshold, 'IR' for a shelved player, null when nothing worth showing. */
export function rosAdjustMark(row: PlayerValueRow): '↑' | '↓' | 'IR' | null {
  const adj = row.rosAdjust
  if (!adj) return null
  if (adj.shelved) return 'IR'
  if (adj.factor === null || Math.abs(adj.factor - 1) <= ARROW_PCT) return null
  return adj.factor > 1 ? '↑' : '↓'
}

/** The detail panel's one-line explanation; null when the player was untouched. */
export function rosAdjustLine(row: PlayerValueRow): string | null {
  const adj = row.rosAdjust
  if (!adj) return null
  if (adj.shelved) {
    const detail = [row.injuryBodyPart, row.injuryNotes].filter((v) => v !== null).join(', ')
    const status = row.injuryStatus ?? 'Shelved'
    return `${status}${detail ? ` (${detail})` : ''} — remaining weeks zeroed`
  }
  if (adj.projPosRank === null || adj.expertPosRank === null) return null
  const pos = row.position ?? ''
  const ranks = `projection ${pos}${adj.projPosRank} → consensus ${pos}${adj.expertPosRank}`
  return adj.factor === null ? ranks : `${ranks} · scaled ×${adj.factor.toFixed(2)}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/renderer/lib/playersTableView.test.ts`
Expected: PASS.

- [ ] **Step 5: Show it in the detail panel and the table**

In `src/renderer/src/components/PlayerDetailPanel.tsx`, import `rosAdjustLine` from `@/lib/playersTableView` and render it under the player's headline numbers, using the file's existing muted-text pattern:

```tsx
{
  rosAdjustLine(detail.row) && (
    <p className="text-xs text-muted-foreground">{rosAdjustLine(detail.row)}</p>
  )
}
```

In the Players table's ROS cell, append the mark after the number, following the column's existing cell renderer:

```tsx
{
  rosAdjustMark(row) && (
    <span className="ml-1 text-xs text-muted-foreground" title={rosAdjustLine(row) ?? undefined}>
      {rosAdjustMark(row)}
    </span>
  )
}
```

Read the surrounding renderer first and match its structure; if the ROS column renders a bare string rather than JSX, add the mark to the string instead and drop the `title`.

- [ ] **Step 6: Say when the correction did not run**

`ValueContext.rosAdjusted` is false when no FantasyPros ROS ranks are stored, which is a real state the user should be able to tell from "adjusted by ×1.00" — otherwise missing expert data looks like the feature silently not working. In the Players screen, beside the existing expert freshness text (`context.expert.ecrUpdatedAt`), render:

```tsx
{
  !value.context.rosAdjusted && (
    <span className="text-xs text-muted-foreground">
      Rest-of-season values not adjusted — no expert ranks synced yet
    </span>
  )
}
```

Match the surrounding element's structure; if that header renders plain strings, append the sentence to the existing one instead.

- [ ] **Step 7: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test` — all green.

```bash
git add src/renderer/src/lib/playersTableView.ts src/renderer/src/components/PlayerDetailPanel.tsx src/renderer/src/screens tests/renderer
git commit -m "feat(ui): mark and explain adjusted ROS values"
```

---

### Task 5: Data reference, real-data check, release `v0.15.0`

**Files:**

- Modify: `docs/reference/value-and-signals.md`
- Modify: `package.json`, `package-lock.json` (via `npm version`)

- [ ] **Step 1: Document**

In `docs/reference/value-and-signals.md`:

1. `## ValueContext` table — add a row: `` `rosAdjusted` `` | false when no FantasyPros ROS ranks were stored, so the consensus correction did not run (the shelf horizon always does) | never null.
2. New section before `## Constants (single sources)`:

```markdown
## Rest-of-season realism (added in v0.15.0)

Spec `docs/superpowers/specs/2026-09-22-ros-realism-design.md`; pure module `src/main/value/realism.ts`, applied at the top of `assembleValue` so every consumer inherits it.

Sleeper's weekly projections assume every player is healthy and keeps his role all year, and injury status applied only to the current week. Two corrections run over the weeks **after** the current one (played weeks and the current week are never touched):

1. **Shelf horizon** — `injury_status` of `IR` or `PUP`, or `status` of `Injured Reserve` or `Physically Unable to Perform`, zeroes every remaining week. `Out`, `Doubtful` and `Questionable` are deliberately excluded: the consensus rank already prices the expected return.
2. **Rank matching** — per lineup position, over ranked and unshelved candidates (free agents included), the existing rest-of-season points ladder is reassigned to the FantasyPros ROS order: the k-th best total goes to the k-th ranked player, and each player's remaining weeks are scaled by the resulting factor. Points are conserved within the position, the corrected order matches the consensus exactly, and re-running changes nothing. Shelved players leave the ladder, so their rungs pass down — that is the handcuff bump.

Players without a ROS rank keep their raw projections; the feed covers 99 % of rostered players and the top ~134 free agents, which is the whole useful tier. Without any stored ranks the correction is skipped and `ValueContext.rosAdjusted` is false. `base = 0` for a ranked player means there is nothing to scale, so his corrected total is spread evenly over his remaining weeks that have a game and `factor` stays null.

`PlayerValueRow.rosAdjust` carries `{ shelved, factor, projPosRank, expertPosRank }`. The Players table marks a row when `|factor − 1| > ARROW_PCT` (↑ / ↓) or the player is shelved (IR), and the detail panel explains it: `projection RB8 → consensus RB24 · scaled ×0.62`, or `IR (Knee - ACL, Surgery) — remaining weeks zeroed`. The body part and notes come from Sleeper's `injury_body_part` (~90 % populated) and `injury_notes` (~11 %); Sleeper supplies no injury start date or practice data, so duration is never inferred.
```

3. `## Constants (single sources)` — add `src/main/value/realism.ts` | `SHELF_INJURY = {IR, PUP}`, `SHELF_STATUS = {Injured Reserve, Physically Unable to Perform}` and extend the `playersTableView.ts` row with `ARROW_PCT = 0.1`.
4. `## Module map` — add `src/main/value/realism.ts` | Shelf horizon and consensus rank matching over the rest-of-season weeks.

- [ ] **Step 2: Verify and commit the docs**

Run: `npx prettier --check docs/reference/value-and-signals.md` (run `npx prettier --write` on that file if it complains).

```bash
git add docs/reference/value-and-signals.md
git commit -m "docs: document rest-of-season realism"
```

- [ ] **Step 3: Final verification and the real-data check**

Run: `npm run typecheck && npm run lint && npm test && npm run test:budget` — all green.

Then on a copy of the dev DB (`cp ~/.config/FantasyCompanion/companion.db /tmp/.../real.db`) a throwaway `tests/zz-realism.test.ts` that builds the value season for the real league before and after the change and prints, for Caleb Williams, Puka Nacua, Zay Flowers and the Rams / Vikings depth charts: `rosPoints`, `rosAdjust`, and the power ranking from `teamStrengths`. Confirm that shelved players fall to 0, that the consensus order now drives each position, and that no team's strength moves in a direction you cannot explain. Delete the file (never commit it).

Also run the app once (`npm run dev`) and check the Players table shows the marks and the detail panel the explanation.

- [ ] **Step 4: Merge and release**

```bash
git checkout main && git merge --no-ff feat/ros-realism -m "merge: feat/ros-realism (plan N)"
npm version minor -m "build: bump version to %s"
```

Expected: `package.json` at `0.15.0`, tag `v0.15.0`. Pushing (`git push --follow-tags`) triggers the Windows release workflow into a draft release — the user's call, as in earlier plans; then mark the plan complete in a `docs(plan): mark plan N complete` commit.

---

## Self-review against the spec

- §2 (data): the shelf vocabulary and the injury detail fields are Tasks 1–2; the coverage figures inform the "unranked players keep their projections" rule tested in Task 2.
- §3.1 shelf horizon → Task 2 (`shelved`, the zeroing) with the full status table tested.
- §3.2 rank matching → Task 2: ladder, consensus order, freed rungs, conservation, idempotence, unranked and non-lineup positions.
- §3.3 `RosAdjustment` → Task 2 (type) and Task 3 (carried onto the row).
- §4 plug-in point → Task 3, including the three `bundle.players` reads that must switch to the corrected array.
- §5 edge cases → Task 2 (no ranks, past season, `base = 0`, non-lineup positions, current/played weeks untouched) and Task 3 (`rosAdjusted`).
- §6 UI → Task 4 (mark, explanation, body part and notes, and the notice when `rosAdjusted` is false).
- §7 testing → Tasks 2–4 plus the real-data check in Task 5.
- §8 structure → every path appears in a task's **Files**.
- §9 phasing → Task 5 releases `v0.15.0`.

## Execution notes (2026-09-22)

- Task 3's swap test used Jefferson/Chase, but the fixture projects Chase for the current week only, which the correction never touches; the test swaps the RBs Barkley/Bijan instead.
- The "not adjusted" notice sits on the Players screen beside the "No projections stored" notice, shown only when projections exist.
- **Factor cap added after the real-data check.** Uncapped rank matching gave Kirk Cousins (a backup, QB34 → consensus QB30) ×5.9, zeroed Shedeur Sanders, and the `base = 0` spread fallback handed Marcus Mariota (projected for the current week only, as a fill-in) 86 points he will not score. Changes: `ROS_FACTOR_CAP = 2` clamps the factor to [×0.5, ×2] and `RosAdjustment.capped` reports it; the spread fallback is removed, and ranked players with nothing projected after the current week are kept off the ladder. Within the cap, conservation and consensus order still hold; clamped players give up both, and idempotence no longer holds in general (the correction only runs once, on raw projections).
