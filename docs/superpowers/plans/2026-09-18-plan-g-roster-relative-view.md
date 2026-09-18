# Plan G — Roster-relative view (slice 4, phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read every value against _my_ roster: for a free agent, how much ROS value they add over my weakest startable player at the position (`vsMine`); for my own players, whether a free agent at the position is strictly better (`droppable`, naming who and by how much) — as a `Mine` column group in Value mode, plus a _My team_ chip that filters the table to my roster in every mode.

**Architecture:** One new pure module `src/main/value/roster.ts` takes the assembled rows (id, position, owner, roster slot, ROS value) and my-team flag and returns per-player `{ vsMine, droppable }` plus my per-position baseline; `assembleValue` spreads it into `PlayerValueRow` and `ValueContext`. The only DB-facing change is two extra columns on the existing candidate query (`teams.is_me`, `roster_players.slot`) surfaced as `PlayerBaseRow.ownerIsMe` (shared with the week rows) and a main-only `PlayerSeries.rosterSlot`. The renderer adds a `droppable` column kind and the `vsMine` value field to `playersTableView.ts`, a `mine` filter, a `Mine` group that `columnGroups` returns only when a team is mine, and header/cell tooltips; `PlayersScreen.tsx` gains the chip and `ValueHelp.tsx` a _Mine_ section.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4, shadcn primitives, `node:sqlite`, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-17-slice4-value-and-signals-design.md` (§4 whole, §5.1 `ownerIsMe` / `vsMine` / `droppable` / `hasMyTeam`, §5.3 `roster.ts` row, §6.1 Mine group + tooltips, §6.3 "no team flagged as mine", §8 `roster.test.ts`, §10 row G). **Builds on:** `v0.6.0` — `src/main/value/{series,replacement,signals,schedule,build}.ts`, `listCandidates` / `baseRow` in `src/main/db/repos/playersWeek.ts`, `playersTableView.ts` (`TableRow`, `Column.kind`, `ValueField`, `columnGroups`, `filterRows`, `valueHeaderTitle`), `PlayersScreen.tsx` (chips, `teams` from `api.league.teams()`), `ValueHelp.tsx`, `tests/fixtures/{db,season}.ts` (`seedLeague`: league `L1`, 2 teams, roster 1 = me (`u1`, "Cook Book") with Barkley 4866 / Jefferson 6794 / LAR starting and Cook 8259 on IR; roster 2 = "Rival" with Chase 7564 starting and Bijan 9509 on taxi; `seedSeason`: 2026, week 3, projections weeks 3–4; **no free agent in the fixture**).

## Global Constraints

- Same as Plans C–F: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use`), `node:sqlite` only, no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`; repositories never open transactions.
- Every number behind the screen is computed in the main process. The renderer formats and filters; it never computes deltas or picks baselines.
- No new tables, no migration, no persisted computed values, no new data sources, no new IPC channels (`players:value` / `players:detail` payloads grow; `valueCache` and its invalidation are untouched — a roster change arrives through sync, which already clears it).
- **Do not saturate the window**: Value mode gains exactly two columns (`VS MINE`, `DROP?`) in one group that exists only when a team is mine; the filter row gains exactly one chip (_My team_), shown only when a team is mine. No detail-panel changes (spec §6.2 lists none for Plan G).
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits, summary ≤ 50 chars, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Branch `feat/roster-relative-view` from `main`.
- Existing `tests/**` are typechecked: when a shared type gains a required field, update the fixture literals named in the task (Task 1 lists every one).
- Spec deviations locked in here:
  - **Taxi is excluded like IR.** Spec §4 excludes IR players from "my players at pos" because they cannot be started; taxi-squad players cannot either, so `UNSTARTABLE_SLOTS = {ir, taxi}` (one exported constant in `roster.ts`). Neither exists in the user's league. Those players still show under the _My team_ chip (the chip is `ownerIsMe`, nothing else) and are never `droppable`.
  - **`ValueContext.mine`** (not in spec §5.1): per lineup position, my startable player with the lowest ROS value — `{ playerId, fullName, rosValue } | null`. It is the `vsMine` baseline, and it is what lets the renderer say "no K rostered" (spec §4 tooltip) and list the baselines in the `VS MINE` header tooltip without recomputing anything.
  - **`PlayerSeries.rosterSlot`** is main-only; `PlayerBaseRow` gains `ownerIsMe` (spec) but not the slot.
  - **Chip gating**: the chip is shown when `teams.some((t) => t.isMe)` (the `Team[]` the screen already loads for the owner select), so it works in Proj/Stats where there is no `ValueContext`; the Mine column group is gated on `ValueContext.hasMyTeam`. Both read `teams.is_me`.
  - **Ties**: equal ROS values are not `droppable` (spec: _strictly_ higher) and give `vsMine = 0`; when two of my players tie for the lowest value, or two free agents for the best, the name that sorts first wins (stable output).
  - **`DROP?` cell**: the marker is `●` in the destructive tone, blank (not "—") when unset — the same convention as the TD badge; the cell tooltip carries the free agent's name and delta, and the column sorts by that delta with nulls last.
  - `vsMine` and `delta` are rounded to two decimals like every other value field.

---

## File map

| File                                                            | Responsibility                                                                                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/types.ts` (modify)                                  | `PlayerBaseRow.ownerIsMe`; `Droppable`, `MyBaseline`; `PlayerValueRow.vsMine` / `.droppable`; `ValueContext.hasMyTeam` / `.mine`              |
| `src/main/db/repos/playersWeek.ts` (modify)                     | `CandidateRow.owner_slot` / `.owner_is_me` from the candidate query; `baseRow` sets `ownerIsMe`                                               |
| `src/main/value/series.ts` (modify)                             | `PlayerSeries.rosterSlot`; `SeriesBundle.hasMyTeam`                                                                                           |
| `src/main/value/roster.ts` (create)                             | §4 pure: `UNSTARTABLE_SLOTS`, `RosterInput`, `RosterRelative`, `RosterView`, `rosterRelative`                                                 |
| `src/main/value/build.ts` (modify)                              | wire `rosterRelative` into rows (`vsMine`, `droppable`) and context (`hasMyTeam`, `mine`)                                                     |
| `src/renderer/src/lib/playersTableView.ts` (modify)             | `droppable` column kind, `vsMine` value field, `MINE` group behind `columnGroups(…, mine)`, `TableFilters.mine`, `mineLabel`, `mineCellTitle` |
| `src/renderer/src/screens/PlayersScreen.tsx` (modify)           | _My team_ chip, `mine` filter, Mine group when `hasMyTeam`, droppable tone, cell tooltips                                                     |
| `src/renderer/src/components/ValueHelp.tsx` (modify)            | _Mine_ section (column descriptions + the same-position note)                                                                                 |
| `docs/reference/value-and-signals.md` (modify)                  | new fields, Mine group, `roster.ts`, constants                                                                                                |
| `tests/main/value/roster.test.ts` (create)                      | pure tests (spec §8)                                                                                                                          |
| `tests/main/value/build.test.ts`, `series.test.ts` (modify)     | roster-relative integration (with a free agent inserted by the test), bundle fields                                                           |
| `tests/main/db/playersWeek.test.ts` (modify)                    | `ownerIsMe` on week rows                                                                                                                      |
| `tests/main/value/signals.test.ts`, `schedule.test.ts` (modify) | fixture literals gain `ownerIsMe` / `rosterSlot`                                                                                              |
| `tests/renderer/lib/playersTableView.test.ts` (modify)          | fixture literals; Mine group, cells, sort, filter, titles                                                                                     |

---

### Task 1: `ownerIsMe`, roster slot, and the new row/context fields

Types plus the two extra columns on the candidate query. `assembleValue` fills `vsMine: null` / `droppable: null` / `mine: {…null}` until Task 3 so the app typechecks and behaves exactly as `v0.6.0`.

**Files:**

- Modify: `src/shared/types.ts:80-92` (`PlayerBaseRow`), after `ScheduleEntry` (~line 158), `PlayerValueRow` (~161), `ValueContext` (~175)
- Modify: `src/main/db/repos/playersWeek.ts:13-20` (imports), `35-48` (`CandidateRow`), `67-85` (`listCandidates`), `88-102` (`baseRow`)
- Modify: `src/main/value/series.ts:12` (imports), `50-54` (`PlayerSeries`), `56-65` (`SeriesBundle`), `~206-210` (series literal), `~226-234` (bundle literal)
- Modify: `src/main/value/build.ts` (row literal ~line 178, context literal ~line 195)
- Test: `tests/main/db/playersWeek.test.ts`, `tests/main/value/series.test.ts`
- Fixture literals to update: `tests/main/value/schedule.test.ts:29-42`, `tests/main/value/signals.test.ts:31-45`, `tests/renderer/lib/playersTableView.test.ts:23-67` (`row`, `valueRow`) and the two `ValueContext` literals (~433, ~453)

**Interfaces:**

- Produces: `PlayerBaseRow.ownerIsMe: boolean`; `Droppable { playerId; fullName; delta }`; `MyBaseline { playerId; fullName; rosValue }`; `PlayerValueRow.vsMine: number | null`, `.droppable: Droppable | null`; `ValueContext.hasMyTeam: boolean`, `.mine: Record<string, MyBaseline | null>`; `CandidateRow.owner_slot: RosterSlot | null`, `.owner_is_me: number | null`; `PlayerSeries.rosterSlot: RosterSlot | null`; `SeriesBundle.hasMyTeam: boolean`.

- [x] **Step 1: Write the failing tests**

In `tests/main/db/playersWeek.test.ts`, inside `it('rows carry both lines, points, delta, usage, owner, game and bye', …)`, add `ownerIsMe: true` to Barkley's `toMatchObject` and, right after that expectation, add:

```ts
expect(rows.find((r) => r.playerId === '7564')).toMatchObject({
  ownerName: 'Rival',
  ownerIsMe: false
})
```

In `tests/main/value/series.test.ts`, inside `it('carries the season context', …)` add:

```ts
expect(bundle.hasMyTeam).toBe(true)
```

and add a new test in the same `describe('loadSeries', …)`:

```ts
it("carries each candidate's roster slot and whether the owner is me", () => {
  expect(byId.get('4866')?.rosterSlot).toBe('starter')
  expect(byId.get('8259')?.rosterSlot).toBe('ir')
  expect(byId.get('9509')?.rosterSlot).toBe('taxi')
  expect(byId.get('4866')?.base.ownerIsMe).toBe(true)
  expect(byId.get('9509')?.base.ownerIsMe).toBe(false)
})
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/db/playersWeek.test.ts tests/main/value/series.test.ts`
Expected: 3 failures — `ownerIsMe` is `undefined` on the week rows, `bundle.hasMyTeam` is `undefined`, `rosterSlot` is `undefined`.

- [x] **Step 3: Shared types**

In `src/shared/types.ts`, `PlayerBaseRow` becomes:

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
  /** The owner is the team flagged `is_me` at import. */
  ownerIsMe: boolean
}
```

After `ScheduleEntry`, add:

```ts
/** The best free agent at my player's position when it out-values them (spec §4). */
export interface Droppable {
  playerId: string
  fullName: string
  /** The free agent's ROS value minus my player's. */
  delta: number
}

/** My startable player with the lowest ROS value at a position — the `vsMine` baseline. */
export interface MyBaseline {
  playerId: string
  fullName: string
  rosValue: number
}
```

In `PlayerValueRow`, between `signals` and `statsAvailable`, add:

```ts
/** Free agents only: ROS value minus my lowest-valued startable player's at the position. */
vsMine: number | null
/** My startable players only: the best free agent at the position when strictly better. */
droppable: Droppable | null
```

In `ValueContext`, after `teamCount`, add:

```ts
/** A `teams` row is flagged `is_me`; when false `vsMine`, `droppable` and every `mine` entry are null. */
hasMyTeam: boolean
/** Per lineup position; null when I roster nobody startable with a ROS value there. */
mine: Record<string, MyBaseline | null>
```

- [x] **Step 4: Candidate query and `baseRow`**

In `src/main/db/repos/playersWeek.ts`, add `RosterSlot` to the `@shared/types` type import:

```ts
import type {
  GameInfo,
  PlayerBaseRow,
  PlayersOptions,
  PlayersWeek,
  PlayerWeekRow,
  PositionTab,
  RosterSlot
} from '@shared/types'
```

`CandidateRow` becomes:

```ts
export interface CandidateRow {
  player_id: string
  full_name: string
  pos: string | null
  team: string | null
  injury_status: string | null
  years_exp: number | null
  owner_roster_id: number | null
  owner_name: string | null
  /** null for free agents. */
  owner_slot: RosterSlot | null
  /** teams.is_me of the owner; null for free agents. */
  owner_is_me: number | null
  watched: string | null
  gsis_id: string | null
  pfr_id: string | null
  nflverse_team: string | null
}
```

In `listCandidates`, change the owner line of the SELECT to:

```sql
           rp.roster_id AS owner_roster_id, rp.slot AS owner_slot, t.is_me AS owner_is_me,
           COALESCE(t.team_name, t.display_name) AS owner_name,
```

In `baseRow`, after `ownerName: r.owner_name`, add:

```ts
ownerIsMe: r.owner_is_me === 1
```

- [x] **Step 5: Series bundle fields**

In `src/main/value/series.ts`:

```ts
import type { NflState, PlayerBaseRow, RosterSlot } from '@shared/types'
```

and add the teams repo import next to the other repo imports:

```ts
import { listTeams } from '../db/repos/teams'
```

`PlayerSeries` and `SeriesBundle` become:

```ts
export interface PlayerSeries {
  base: PlayerBaseRow
  statsAvailable: boolean
  /** Roster slot on the owning team; null for free agents. */
  rosterSlot: RosterSlot | null
  /** Ascending; only weeks with a game, a projection or a points row. */
  weeks: SeriesWeek[]
}

export interface SeriesBundle {
  season: number
  currentWeek: number
  projectionsStored: boolean
  teamCount: number
  /** A `teams` row of the league is flagged `is_me`. */
  hasMyTeam: boolean
  rules: Rules | null
  /** Sleeper team → week → Sleeper opponent, regular season. */
  schedule: Map<string, Map<number, string>>
  players: PlayerSeries[]
}
```

In the `listCandidates(...).map((r): PlayerSeries => { … return { … } })` literal, add `rosterSlot: r.owner_slot,` after `statsAvailable`. In the final `return { … }` of `loadSeries`, add after `teamCount`:

```ts
    hasMyTeam: listTeams(db, leagueId).some((t) => t.isMe),
```

- [x] **Step 6: Build stubs**

In `src/main/value/build.ts`, in the row literal inside `const rows: PlayerValueRow[] = valued.map(…)`, add after `signals,`:

```ts
      vsMine: null,
      droppable: null,
```

and in the `context:` literal add after `teamCount: bundle.teamCount,`:

```ts
      hasMyTeam: bundle.hasMyTeam,
      mine: Object.fromEntries(LINEUP_POSITIONS.map((pos) => [pos, null])),
```

- [x] **Step 7: Fixture literals**

`tests/main/value/schedule.test.ts` — in `player(...)`: add `ownerIsMe: false` after `ownerName: null` inside `base`, and `rosterSlot: null,` after `statsAvailable: true`.

`tests/main/value/signals.test.ts` — in `series(...)`: same two additions.

`tests/renderer/lib/playersTableView.test.ts` — in `row(...)`: add `ownerIsMe: false,` after `ownerName: null,`. In `valueRow(...)`: add `ownerIsMe: false,` after `ownerName: null,` and `vsMine: null,` + `droppable: null,` after `signals: signalsFixture(),`. In both `ValueContext` literals (the `replacementLabel` and `valueHeaderTitle` tests) add `hasMyTeam: false,` and `mine: {},` after `teamCount: 16,`.

- [x] **Step 8: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean; 238 tests (237 + 1).

- [x] **Step 9: Commit**

```bash
git add src/shared/types.ts src/main/db/repos/playersWeek.ts src/main/value/series.ts src/main/value/build.ts tests
git commit -m "feat(value): surface owner-is-me and roster slot" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `roster.ts` — vsMine, droppable and my baseline (pure)

**Files:**

- Create: `src/main/value/roster.ts`
- Test: `tests/main/value/roster.test.ts`

**Interfaces:**

- Consumes: `Droppable`, `MyBaseline`, `RosterSlot` from `@shared/types` (Task 1).
- Produces: `UNSTARTABLE_SLOTS: ReadonlySet<RosterSlot>`; `RosterInput { playerId; fullName; position; ownerRosterId; ownerIsMe; rosterSlot; rosValue }`; `RosterRelative { vsMine; droppable }`; `RosterView { byPlayer: Map<string, RosterRelative>; baseline: Map<string, MyBaseline> }`; `rosterRelative(players: RosterInput[], hasMyTeam: boolean): RosterView`.

- [x] **Step 1: Write the failing tests**

Create `tests/main/value/roster.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { rosterRelative, UNSTARTABLE_SLOTS, type RosterInput } from '@main/value/roster'
import type { RosterSlot } from '@shared/types'

const player = (
  playerId: string,
  position: string | null,
  rosValue: number | null,
  owner: 'me' | 'other' | 'fa' = 'fa',
  rosterSlot: RosterSlot | null = owner === 'fa' ? null : 'starter'
): RosterInput => ({
  playerId,
  fullName: playerId,
  position,
  ownerRosterId: owner === 'fa' ? null : owner === 'me' ? 1 : 2,
  ownerIsMe: owner === 'me',
  rosterSlot,
  rosValue
})

const NONE = { vsMine: null, droppable: null }

describe('rosterRelative', () => {
  const players = [
    player('myRb1', 'RB', 12, 'me'),
    player('myRb2', 'RB', 4, 'me', 'bench'),
    player('faRb', 'RB', 9),
    player('faRb2', 'RB', 3),
    player('rivalRb', 'RB', 20, 'other'),
    player('myWr', 'WR', 6, 'me'),
    player('faWr', 'WR', 2),
    player('faK', 'K', 1)
  ]
  const view = rosterRelative(players, true)
  const rel = (id: string) => view.byPlayer.get(id)

  it('measures every free agent against my lowest-valued startable player at the position', () => {
    expect(rel('faRb')).toEqual({ vsMine: 5, droppable: null }) // 9 − 4 (myRb2, not myRb1)
    expect(rel('faRb2')).toEqual({ vsMine: -1, droppable: null })
    expect(rel('faWr')).toEqual({ vsMine: -4, droppable: null })
    expect(view.baseline.get('RB')).toEqual({ playerId: 'myRb2', fullName: 'myRb2', rosValue: 4 })
    expect(view.baseline.get('WR')).toEqual({ playerId: 'myWr', fullName: 'myWr', rosValue: 6 })
  })

  it('flags each of my players the best free agent beats, with the delta (symmetric with vsMine)', () => {
    expect(rel('myRb2')).toEqual({
      vsMine: null,
      droppable: { playerId: 'faRb', fullName: 'faRb', delta: 5 }
    })
    expect(rel('myRb2')?.droppable?.delta).toBe(rel('faRb')?.vsMine)
    expect(rel('myRb1')).toEqual(NONE) // 12 > 9
    expect(rel('myWr')).toEqual(NONE) // the best WR free agent is worse
  })

  it('leaves players rostered by other teams out on both sides', () => {
    expect(rel('rivalRb')).toEqual(NONE)
    expect(rel('faRb')?.vsMine).toBe(5) // rivalRb's 20 is not my baseline
  })

  it('is null when I roster nobody at the position', () => {
    expect(rel('faK')).toEqual(NONE)
    expect(view.baseline.has('K')).toBe(false)
  })

  it('needs a ROS value on both sides; an equal value is not droppable', () => {
    const v = rosterRelative(
      [
        player('mine', 'RB', 5, 'me'),
        player('mineNoRos', 'RB', null, 'me'),
        player('fa', 'RB', null),
        player('fa2', 'RB', 5)
      ],
      true
    )
    expect(v.byPlayer.get('fa')).toEqual(NONE)
    expect(v.byPlayer.get('fa2')).toEqual({ vsMine: 0, droppable: null })
    expect(v.byPlayer.get('mine')).toEqual(NONE)
    expect(v.byPlayer.get('mineNoRos')).toEqual(NONE)
    expect(v.baseline.get('RB')?.playerId).toBe('mine')
  })

  it('excludes my IR and taxi players from the baseline and never flags them', () => {
    expect([...UNSTARTABLE_SLOTS]).toEqual(['ir', 'taxi'])
    const v = rosterRelative(
      [
        player('ir', 'RB', 1, 'me', 'ir'),
        player('taxi', 'RB', 2, 'me', 'taxi'),
        player('bench', 'RB', 7, 'me', 'bench'),
        player('fa', 'RB', 8)
      ],
      true
    )
    expect(v.byPlayer.get('fa')?.vsMine).toBe(1) // 8 − 7, not 8 − 1
    expect(v.byPlayer.get('ir')).toEqual(NONE)
    expect(v.byPlayer.get('taxi')).toEqual(NONE)
    expect(v.byPlayer.get('bench')?.droppable?.delta).toBe(1)
    // only unstartable players at the position → no baseline
    const only = rosterRelative([player('ir', 'RB', 1, 'me', 'ir'), player('fa', 'RB', 8)], true)
    expect(only.byPlayer.get('fa')).toEqual(NONE)
    expect(only.baseline.size).toBe(0)
  })

  it('is null everywhere without a team flagged as mine', () => {
    const v = rosterRelative(players, false)
    expect(v.byPlayer.size).toBe(players.length)
    expect([...v.byPlayer.values()].every((r) => r.vsMine === null && r.droppable === null)).toBe(
      true
    )
    expect(v.baseline.size).toBe(0)
  })

  it('rounds to two decimals and breaks ties by name', () => {
    const v = rosterRelative(
      [player('b', 'RB', 1.5, 'me'), player('a', 'RB', 1.5, 'me'), player('fa', 'RB', 2.333)],
      true
    )
    expect(v.baseline.get('RB')?.playerId).toBe('a')
    expect(v.byPlayer.get('fa')?.vsMine).toBe(0.83)
    expect(v.byPlayer.get('a')?.droppable?.delta).toBe(0.83)
    expect(v.byPlayer.get('b')?.droppable?.delta).toBe(0.83) // both are beaten
  })

  it('ignores players without a position', () => {
    const v = rosterRelative([player('x', null, 9, 'me'), player('fa', null, 10)], true)
    expect(v.byPlayer.get('fa')).toEqual(NONE)
    expect(v.byPlayer.get('x')).toEqual(NONE)
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/main/value/roster.test.ts`
Expected: FAIL — `Cannot find module '@main/value/roster'`.

- [x] **Step 3: Implement `roster.ts`**

Create `src/main/value/roster.ts`:

```ts
import type { Droppable, MyBaseline, RosterSlot } from '@shared/types'

/** Roster slots that cannot be started: players there are not "my players at pos" (spec §4 IR; taxi likewise). */
export const UNSTARTABLE_SLOTS: ReadonlySet<RosterSlot> = new Set<RosterSlot>(['ir', 'taxi'])

export interface RosterInput {
  playerId: string
  fullName: string
  position: string | null
  ownerRosterId: number | null
  ownerIsMe: boolean
  /** null for free agents. */
  rosterSlot: RosterSlot | null
  rosValue: number | null
}

export interface RosterRelative {
  vsMine: number | null
  droppable: Droppable | null
}

export interface RosterView {
  byPlayer: Map<string, RosterRelative>
  /** Position → my startable player with the lowest ROS value: the vsMine baseline. */
  baseline: Map<string, MyBaseline>
}

interface Valued extends RosterInput {
  rosValue: number
}

const NONE: RosterRelative = { vsMine: null, droppable: null }
const round2 = (value: number): number => Math.round(value * 100) / 100
const hasRos = (p: RosterInput): p is Valued => p.rosValue !== null
const isFreeAgent = (p: RosterInput): boolean => p.ownerRosterId === null
const isMineStartable = (p: RosterInput): boolean =>
  p.ownerIsMe && p.rosterSlot !== null && !UNSTARTABLE_SLOTS.has(p.rosterSlot)

/** The lowest (`min`) or highest (`max`) ROS value of a group; ties go to the name that sorts first. */
function extreme(players: Valued[], pick: 'min' | 'max'): Valued | null {
  return players.reduce<Valued | null>((best, p) => {
    if (best === null) return p
    const diff = p.rosValue - best.rosValue
    if (diff !== 0) return (pick === 'min' ? diff < 0 : diff > 0) ? p : best
    return p.fullName.localeCompare(best.fullName) < 0 ? p : best
  }, null)
}

/**
 * Spec §4, same position only: a free agent's vsMine is its ROS value over my weakest startable
 * player's; my startable player is droppable when the best free agent is strictly better.
 */
export function rosterRelative(players: RosterInput[], hasMyTeam: boolean): RosterView {
  const byPlayer = new Map<string, RosterRelative>(players.map((p) => [p.playerId, NONE]))
  const baseline = new Map<string, MyBaseline>()
  if (!hasMyTeam) return { byPlayer, baseline }

  const positions = new Set(players.flatMap((p) => (p.position === null ? [] : [p.position])))
  for (const pos of positions) {
    const atPos = players.filter((p): p is Valued => p.position === pos && hasRos(p))
    const myWorst = extreme(atPos.filter(isMineStartable), 'min')
    const bestFa = extreme(atPos.filter(isFreeAgent), 'max')
    if (myWorst) {
      baseline.set(pos, {
        playerId: myWorst.playerId,
        fullName: myWorst.fullName,
        rosValue: myWorst.rosValue
      })
    }
    for (const p of atPos) {
      if (isFreeAgent(p) && myWorst) {
        byPlayer.set(p.playerId, { vsMine: round2(p.rosValue - myWorst.rosValue), droppable: null })
      } else if (isMineStartable(p) && bestFa && bestFa.rosValue > p.rosValue) {
        byPlayer.set(p.playerId, {
          vsMine: null,
          droppable: {
            playerId: bestFa.playerId,
            fullName: bestFa.fullName,
            delta: round2(bestFa.rosValue - p.rosValue)
          }
        })
      }
    }
  }
  return { byPlayer, baseline }
}
```

- [x] **Step 4: Run the tests**

Run: `npx vitest run tests/main/value/roster.test.ts`
Expected: 9 passed.

- [x] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean; 247 tests.

```bash
git add src/main/value/roster.ts tests/main/value/roster.test.ts
git commit -m "feat(value): roster-relative vsMine and droppable" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Build wiring — `vsMine` / `droppable` on the rows, `hasMyTeam` / `mine` in the context

**Files:**

- Modify: `src/main/value/build.ts` (imports; `assembleValue` before the `rows` map, the row literal, the context literal)
- Test: `tests/main/value/build.test.ts`

**Interfaces:**

- Consumes: `rosterRelative`, `RosterView` (Task 2); `PlayerSeries.rosterSlot`, `SeriesBundle.hasMyTeam` (Task 1).
- Produces: `PlayerValueRow.vsMine` / `.droppable` and `ValueContext.hasMyTeam` / `.mine` filled for real — what Tasks 4–5 render.

- [x] **Step 1: Write the failing tests**

In `tests/main/value/build.test.ts`, extend the imports:

```ts
import { upsertPlayers } from '@main/db/repos/players'
import { replaceProjections } from '@main/db/repos/projections'
import { LINEUP_POSITIONS } from '@shared/rules'
import { seedLeague, SEED_TS } from '../../fixtures/db'
```

(keep the existing `import type { Db }`, `buildValueSeason, detailFor, type ValueBuild`, `PlayerValueRow`, `seedSeason, SEASON` imports; `seedLeague` moves into the line above). Append a new `describe` at the end of the file:

```ts
describe('buildValueSeason — roster-relative view', () => {
  let db: Db
  let build: ValueBuild
  const row = (id: string): PlayerValueRow | undefined => build.rows.find((r) => r.playerId === id)
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
    // The fixture has no free agent: add an RB with one stored projection, 90 rush yards in
    // week 5 → 9 ROS points under the 0.1/yd rules. No player_ids row → statsAvailable false.
    upsertPlayers(
      db,
      [
        {
          playerId: '1111',
          fullName: 'Free Agent',
          firstName: 'Free',
          lastName: 'Agent',
          position: 'RB',
          fantasyPositions: ['RB'],
          team: 'DEN',
          status: 'Active',
          injuryStatus: null,
          age: 24,
          yearsExp: 2,
          depthChartOrder: 1,
          searchRank: 100,
          gsisId: null,
          sportradarId: null,
          espnId: null
        }
      ],
      SEED_TS
    )
    replaceProjections(
      db,
      SEASON,
      5,
      [
        {
          playerId: '1111',
          season: SEASON,
          week: 5,
          company: 'rotowire',
          team: 'DEN',
          opponent: 'LV',
          stats: { rush_yd: 90 }
        }
      ],
      SEED_TS
    )
    build = buildValueSeason(db, 'L1', SEASON)
  })

  it('scores the free agent against my lowest startable RB and ignores my IR player', () => {
    // RB ROS values: FA 9, Barkley 8 (mine, starter), Bijan 7 (Rival), Cook 0 (mine, IR);
    // four RBs for four starters → the replacement level stays at the lowest, 0
    expect(row('1111')).toMatchObject({
      ownerRosterId: null,
      ownerIsMe: false,
      rosValue: 9,
      vsMine: 1,
      droppable: null,
      signals: null
    })
    expect(row('4866')).toMatchObject({
      ownerIsMe: true,
      vsMine: null,
      droppable: { playerId: '1111', fullName: 'Free Agent', delta: 1 }
    })
    expect(row('8259')).toMatchObject({ ownerIsMe: true, vsMine: null, droppable: null }) // IR
    expect(row('9509')).toMatchObject({ ownerIsMe: false, vsMine: null, droppable: null }) // Rival's
    expect(row('6794')).toMatchObject({ vsMine: null, droppable: null }) // no WR free agent
  })

  it('reports my baseline per lineup position in the context', () => {
    expect(build.context.hasMyTeam).toBe(true)
    expect(Object.keys(build.context.mine)).toEqual([...LINEUP_POSITIONS])
    expect(build.context.mine.RB).toEqual({
      playerId: '4866',
      fullName: 'Saquon Barkley',
      rosValue: 8
    })
    expect(build.context.mine.WR).toEqual({
      playerId: '6794',
      fullName: 'Justin Jefferson',
      rosValue: 19
    })
    expect(build.context.mine.DEF?.playerId).toBe('LAR')
    expect(build.context.mine.QB).toBeNull()
  })

  it('is null everywhere when no team is flagged as mine', () => {
    db.prepare('UPDATE teams SET is_me = 0').run()
    const none = buildValueSeason(db, 'L1', SEASON)
    expect(none.context.hasMyTeam).toBe(false)
    expect(Object.values(none.context.mine).every((m) => m === null)).toBe(true)
    expect(none.rows.every((r) => r.vsMine === null && r.droppable === null)).toBe(true)
    expect(none.rows.every((r) => !r.ownerIsMe)).toBe(true)
  })
})
```

- [x] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/value/build.test.ts`
Expected: the first two new tests fail (`vsMine` is `null`, `context.mine.RB` is `null`); the third passes already (stubs). The seven existing tests still pass — the free agent is only inserted in the new `describe`.

- [x] **Step 3: Wire `rosterRelative` into `assembleValue`**

In `src/main/value/build.ts`, add the import:

```ts
import { rosterRelative } from './roster'
```

In `assembleValue`, right after `const schedules = new Map<string, ScheduleEntry[]>()`, add:

```ts
const roster = rosterRelative(
  valued.map((v) => ({
    ...v.a.series.base,
    rosterSlot: v.a.series.rosterSlot,
    rosValue: v.rosValue
  })),
  bundle.hasMyTeam
)
```

In the `rows` map, replace the Task 1 stubs `vsMine: null, droppable: null,` with:

```ts
      vsMine: roster.byPlayer.get(series.base.playerId)?.vsMine ?? null,
      droppable: roster.byPlayer.get(series.base.playerId)?.droppable ?? null,
```

Replace the replacement/context tail of the function with:

```ts
const replacement: ValueContext['replacement'] = {}
const mine: ValueContext['mine'] = {}
for (const pos of LINEUP_POSITIONS) {
  replacement[pos] = { std: stdLevels.get(pos) ?? null, ros: rosLevels.get(pos) ?? null }
  mine[pos] = roster.baseline.get(pos) ?? null
}
return {
  context: {
    season: bundle.season,
    currentWeek: bundle.currentWeek,
    projectionsStored: bundle.projectionsStored,
    teamCount: bundle.teamCount,
    hasMyTeam: bundle.hasMyTeam,
    mine,
    replacement
  },
  rows,
  series: new Map(bundle.players.map((p) => [p.base.playerId, p])),
  schedules
}
```

- [x] **Step 4: Run the tests**

Run: `npx vitest run tests/main/value/build.test.ts`
Expected: 10 passed.

- [x] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: clean; 250 tests.

```bash
git add src/main/value/build.ts tests/main/value/build.test.ts
git commit -m "feat(value): roster-relative fields in the build" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Table view model — Mine group, `droppable` kind, `mine` filter, tooltips

**Files:**

- Modify: `src/renderer/src/lib/playersTableView.ts` (`ColumnKind`, `ValueField`, new `DROPPABLE` / `MINE` after `SIGNALS`, `columnGroups`, `cellValue`, `cellText`, `TableFilters`, `filterRows`, `sortValue`, `valueHeaderTitle`; new `mineLabel`, `mineCellTitle`)
- Test: `tests/renderer/lib/playersTableView.test.ts`

**Interfaces:**

- Consumes: `PlayerValueRow.vsMine` / `.droppable`, `ValueContext.hasMyTeam` / `.mine` (Task 1).
- Produces: `columnGroups(tabId, mode, mine = false)`; `Column.kind = 'droppable'` with `key: 'droppable'`; `ValueField` includes `'vsMine'`; `TableFilters.mine: boolean`; `mineLabel(context, positions): string`; `mineCellTitle(row, col, context): string | undefined`. Task 5 calls all of these.

- [x] **Step 1: Write the failing tests**

In `tests/renderer/lib/playersTableView.test.ts`, add `mineCellTitle` and `mineLabel` to the `@/lib/playersTableView` import (alphabetical: after `kickoffLabel`). Append a new `describe` at the end of the file:

```ts
describe('mine group', () => {
  const [, , , mineGroup] = columnGroups('ALL', 'value', true)
  const [vsMine, droppable] = mineGroup.columns
  const context: ValueContext = {
    season: 2026,
    currentWeek: 3,
    projectionsStored: true,
    teamCount: 16,
    hasMyTeam: true,
    mine: { RB: { playerId: 'm', fullName: 'Saquon Barkley', rosValue: 8 }, K: null },
    replacement: {}
  }
  const filters = {
    search: '',
    freeAgents: false,
    watchlist: false,
    rookies: false,
    mine: true,
    owner: null
  }

  it('is the fourth value-mode group, only when a team is mine', () => {
    expect(columnGroups('ALL', 'value').map((g) => g.label)).toEqual([
      'Season',
      'Rest of season',
      'Signals'
    ])
    expect(columnGroups('K', 'value', true).map((g) => g.label)).toEqual([
      'Season',
      'Rest of season',
      'Signals',
      'Mine'
    ])
    expect(mineGroup.columns.map((c) => [c.key, c.label, c.kind])).toEqual([
      ['value:vsMine', 'VS MINE', 'value'],
      ['droppable', 'DROP?', 'droppable']
    ])
    expect(columnGroups('ALL', 'stats', true).map((g) => g.label)).not.toContain('Mine')
  })

  it('renders vs mine as a signed number and droppable as a marker that sorts by its delta', () => {
    const fa = valueRow({ vsMine: 1.25 })
    expect(cellText(cellValue(fa, vsMine, 'value'), vsMine, 'value')).toBe('+1.3')
    expect(cellValue(fa, droppable, 'value')).toBeNull()
    expect(cellText(null, droppable, 'value')).toBe('')
    const mine = valueRow({
      ownerRosterId: 1,
      ownerIsMe: true,
      droppable: { playerId: 'f', fullName: 'Free Agent', delta: 2.5 }
    })
    expect(cellValue(mine, droppable, 'value')).toBe(2.5)
    expect(cellText(2.5, droppable, 'value')).toBe('●')
    expect(cellText(cellValue(mine, vsMine, 'value'), vsMine, 'value')).toBe('—')
    expect(cellValue(row(), droppable, 'value')).toBeNull()
  })

  it('sorts by vs mine and by the droppable delta with nulls last', () => {
    const rows = [
      valueRow({ playerId: 'a', fullName: 'A', vsMine: 1 }),
      valueRow({
        playerId: 'b',
        fullName: 'B',
        droppable: { playerId: 'x', fullName: 'X', delta: 3 }
      }),
      valueRow({ playerId: 'c', fullName: 'C', vsMine: 4 })
    ]
    const ids = (sort: { key: string; dir: 'asc' | 'desc' }): string[] =>
      sortRows(rows, sort, 'value').map((r) => r.playerId)
    expect(ids({ key: 'value:vsMine', dir: 'desc' })).toEqual(['c', 'a', 'b'])
    expect(ids({ key: 'value:vsMine', dir: 'asc' })).toEqual(['a', 'c', 'b'])
    expect(ids({ key: 'droppable', dir: 'desc' })).toEqual(['b', 'a', 'c'])
  })

  it('filters to my roster with the My team chip, in week rows too', () => {
    const rows = [
      valueRow({ playerId: 'a', ownerRosterId: 1, ownerIsMe: true }),
      valueRow({ playerId: 'b', ownerRosterId: 2 }),
      valueRow({ playerId: 'c' })
    ]
    expect(filterRows(rows, undefined, filters).map((r) => r.playerId)).toEqual(['a'])
    expect(filterRows(rows, undefined, { ...filters, mine: false }).length).toBe(3)
    const week = [row({ playerId: 'w', ownerRosterId: 1, ownerIsMe: true }), row({ playerId: 'x' })]
    expect(filterRows(week, undefined, filters).map((r) => r.playerId)).toEqual(['w'])
  })

  it('titles the VS MINE header with my baselines and the droppable header with its definition', () => {
    expect(mineLabel(context, ['RB', 'K'])).toBe('My lowest ROS VAL · RB Saquon Barkley +8.0 · K —')
    expect(mineLabel({ ...context, hasMyTeam: false }, ['RB'])).toBe('')
    expect(mineLabel(null, ['RB'])).toBe('')
    expect(valueHeaderTitle(vsMine, context, ['RB'])).toBe(
      `${vsMine.description}\nMy lowest ROS VAL · RB Saquon Barkley +8.0`
    )
    expect(valueHeaderTitle(vsMine, null, ['RB'])).toBe(vsMine.description)
    expect(valueHeaderTitle(droppable, context, ['RB'])).toBe(droppable.description)
  })

  it('titles a droppable cell with the free agent, an empty vs-mine cell with the missing position', () => {
    const mine = valueRow({
      ownerRosterId: 1,
      ownerIsMe: true,
      droppable: { playerId: 'f', fullName: 'Free Agent', delta: 2.5 }
    })
    expect(mineCellTitle(mine, droppable, context)).toBe('Free agent Free Agent: +2.5 ROS VAL')
    expect(mineCellTitle(valueRow(), droppable, context)).toBeUndefined()
    expect(mineCellTitle(valueRow({ position: 'K' }), vsMine, context)).toBe('no K rostered')
    expect(mineCellTitle(valueRow({ position: 'RB' }), vsMine, context)).toBeUndefined() // baseline exists: a ROS value is missing instead
    expect(
      mineCellTitle(valueRow({ position: 'K', ownerRosterId: 2 }), vsMine, context)
    ).toBeUndefined()
    expect(mineCellTitle(valueRow({ position: 'K', vsMine: 1 }), vsMine, context)).toBeUndefined()
    expect(
      mineCellTitle(valueRow({ position: 'K' }), vsMine, { ...context, projectionsStored: false })
    ).toBeUndefined()
    expect(mineCellTitle(valueRow({ position: 'K' }), vsMine, null)).toBeUndefined()
    expect(mineCellTitle(row(), vsMine, context)).toBeUndefined()
  })
})
```

- [x] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/renderer/lib/playersTableView.test.ts`
Expected: the file fails to compile / the new tests fail — `mineLabel` and `mineCellTitle` are not exported, `columnGroups(…, true)` returns three groups, `TableFilters` has no `mine`.

- [x] **Step 3: Kinds, fields, the Mine group**

In `src/renderer/src/lib/playersTableView.ts`:

```ts
export type ColumnKind =
  'points' | 'delta' | 'stat' | 'snapPct' | 'targetShare' | 'value' | 'signal' | 'droppable'
export type ValueField =
  'gamesPlayed' | 'ppg' | 'stdValue' | 'stdRank' | 'rosPoints' | 'rosValue' | 'rosRank' | 'vsMine'
```

Update the `Column.key` doc comment to list `droppable`:

```ts
/** Sort key (`points`, `delta`, `snapPct`, `targetShare`, `stat:<key>`, `value:<field>`, `signal:<field>`, `droppable`). */
```

After the `SIGNALS` group, add:

```ts
const DROPPABLE: Column = {
  key: 'droppable',
  label: 'DROP?',
  kind: 'droppable',
  description:
    'A free agent at the same position has a higher ROS VAL than this player of mine — hover for who and by how much; sorts by that gap'
}
/** Spec §4: same-position comparisons against my roster; only offered when a team is mine. */
const MINE = group('Mine', [
  value(
    'vsMine',
    'VS MINE',
    'signed',
    'Free agents only: ROS VAL minus the ROS VAL of my lowest-valued startable player at the same position (IR and taxi excluded; FLEX is not modelled)'
  ),
  DROPPABLE
])
```

`columnGroups` becomes:

```ts
/** Sleeper's column groups per tab; Δ and usage only exist for played weeks (stats mode); Mine only when a team is mine. */
export function columnGroups(tabId: string, mode: TableMode, mine = false): ColumnGroup[] {
  if (mode === 'value')
    return mine ? [SEASON, REST_OF_SEASON, SIGNALS, MINE] : [SEASON, REST_OF_SEASON, SIGNALS]
```

(the rest of the function is unchanged).

- [x] **Step 4: Cells, sort, filter**

`cellValue`: add as the first line of the body:

```ts
if (col.kind === 'droppable') return isValueRow(row) ? (row.droppable?.delta ?? null) : null
```

`cellText`: add as the first line of the body, **before** the `value === null` dash:

```ts
if (col.kind === 'droppable') return value === null ? '' : '●'
```

`TableFilters` gains `mine`:

```ts
export interface TableFilters {
  search: string
  freeAgents: boolean
  watchlist: boolean
  rookies: boolean
  /** The My team chip: rows whose owner is me, IR and taxi included. */
  mine: boolean
  owner: number | null
}
```

`filterRows`: add the condition after `(!f.rookies || r.rookie) &&`:

```ts
      (!f.mine || r.ownerIsMe) &&
```

`sortValue`: add after the `signal:` branch:

```ts
if (key === 'droppable') return isValueRow(row) ? (row.droppable?.delta ?? null) : null
```

Update the `TableSort.key` doc comment to include `'droppable'`.

- [x] **Step 5: Header and cell tooltips**

Replace `valueHeaderTitle` and add the two helpers after it:

```ts
/** Header tooltip of a described column: its definition, plus the replacement line for VAL and my baselines for VS MINE. */
export function valueHeaderTitle(
  col: Column,
  context: ValueContext | null,
  positions: string[]
): string | undefined {
  if (!col.description) return undefined
  const line =
    col.field === 'stdValue' || col.field === 'rosValue'
      ? replacementLabel(context, positions, col.field === 'stdValue' ? 'std' : 'ros')
      : col.field === 'vsMine'
        ? mineLabel(context, positions)
        : ''
  return line ? `${col.description}\n${line}` : col.description
}

/** "My lowest ROS VAL · RB Saquon Barkley +8.0 · K —"; empty without a team of mine. */
export function mineLabel(context: ValueContext | null, positions: string[]): string {
  if (!context?.hasMyTeam) return ''
  const parts = positions.map((pos) => {
    const m = context.mine[pos] ?? null
    return m ? `${pos} ${m.fullName} ${fmtSigned(m.rosValue)}` : `${pos} —`
  })
  return ['My lowest ROS VAL', ...parts].join(' · ')
}

/** Cell tooltip: the free agent behind a DROP? marker; "no K rostered" behind an empty VS MINE cell (spec §4). */
export function mineCellTitle(
  row: TableRow,
  col: Column,
  context: ValueContext | null
): string | undefined {
  if (!isValueRow(row) || !context?.hasMyTeam) return undefined
  if (col.kind === 'droppable') {
    return row.droppable
      ? `Free agent ${row.droppable.fullName}: ${fmtSigned(row.droppable.delta)} ROS VAL`
      : undefined
  }
  if (
    col.field === 'vsMine' &&
    row.vsMine === null &&
    row.ownerRosterId === null &&
    row.position !== null &&
    context.projectionsStored &&
    (context.mine[row.position] ?? null) === null
  )
    return `no ${row.position} rostered`
  return undefined
}
```

- [x] **Step 6: Run the tests**

Run: `npx vitest run tests/renderer/lib/playersTableView.test.ts`
Expected: all pass, including the pre-existing `'has the same three groups on every tab'` (the default is still three groups) and the value-header title test (`!col.description` is the same guard for stat columns).

- [x] **Step 7: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck fails in `PlayersScreen.tsx` on the `filterRows` call — `mine` is missing from the filters object. Fix it minimally now (Task 5 wires the chip): in `src/renderer/src/screens/PlayersScreen.tsx`, add `mine: false,` to the `filterRows(source, currentTab, { … })` object. Re-run; expected clean, 256 tests.

```bash
git add src/renderer/src/lib/playersTableView.ts src/renderer/src/screens/PlayersScreen.tsx tests/renderer/lib/playersTableView.test.ts
git commit -m "feat(ui): Mine column group and my-team filter model" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Players screen chip and cells, help panel, data reference

No unit tests (components are not tested in this repo); the user checks it in the dev app before Task 6.

**Files:**

- Modify: `src/renderer/src/screens/PlayersScreen.tsx` (imports ~18-33, state ~86-96, filter memo ~173-196, `groups` ~198, chips ~300-309, cell ~407-436)
- Modify: `src/renderer/src/components/ValueHelp.tsx` (after the Signals `</dl>`)
- Modify: `docs/reference/value-and-signals.md`

**Interfaces:**

- Consumes: `columnGroups(tab, mode, mine)`, `TableFilters.mine`, `mineCellTitle`, `Column.kind = 'droppable'` (Task 4); `ValueContext.hasMyTeam` (Task 1); `Team.isMe` (existing).

- [x] **Step 1: Screen — state, filter, groups, chip**

In `src/renderer/src/screens/PlayersScreen.tsx`, add `mineCellTitle` to the `@/lib/playersTableView` import. Add state after `const [rookies, setRookies] = useState(false)`:

```tsx
const [mine, setMine] = useState(false)
```

After the `useEffect` blocks (before `const closePanel`), add:

```tsx
const hasMyTeam = teams.some((t) => t.isMe)
```

In the `visible` memo, replace the Task 4 placeholder `mine: false,` with `mine,` and add `mine` to the dependency array (after `rookies`). Change the groups line to:

```tsx
const groups = columnGroups(tab, effectiveMode, valueContext?.hasMyTeam ?? false)
```

After the Rookies chip, add:

```tsx
{
  hasMyTeam && (
    <Chip active={mine} onClick={() => setMine((v) => !v)}>
      My team
    </Chip>
  )
}
```

- [x] **Step 2: Screen — droppable tone and cell tooltips**

In the `columns.map((col) => { … })` cell renderer, replace the `tone` expression with:

```tsx
const tone =
  col.kind === 'signal'
    ? signalTone(p, col)
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

and give the cell its tooltip:

```tsx
                  <TableCell
                    key={col.key}
                    title={mineCellTitle(p, col, valueContext)}
                    className={cn(
```

(the `className` body and the `signalText` / `cellText` child are unchanged — `cellText` already renders `●` / blank for the droppable kind through `cellValue`.)

- [x] **Step 3: Help panel**

In `src/renderer/src/components/ValueHelp.tsx`, after the Signals `</dl>` and before `{context && (<Table …`, add:

```tsx
{
  context?.hasMyTeam && (
    <>
      <h3 className="mt-5 text-sm font-semibold">Mine</h3>
      <dl className="mt-2 space-y-3 text-sm">
        {columnGroups('ALL', 'value', true)
          .filter((g) => g.label === 'Mine')
          .flatMap((g) => g.columns)
          .map((c) => (
            <Term key={c.key} name={c.label}>
              {c.description}
            </Term>
          ))}
        <Term name="Same position only">
          FLEX is already in the replacement level, so ROS VAL compares across positions — but a
          cross-position swap (drop a WR to add this RB) needs a lineup model and is not suggested.
          Players on IR or the taxi squad are not counted as my players at the position; the My team
          chip still lists them.
        </Term>
      </dl>
    </>
  )
}
```

- [x] **Step 4: Verify in the dev app**

Run: `npm run typecheck && npm run lint && npm test` — expected clean, 256 tests. Then `npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu` and ask the user to check, on the Players screen:

1. Value mode shows a fourth group **Mine** with `VS MINE` / `DROP?`; Proj/Stats do not.
2. Free agents show a signed `VS MINE`; hover a `—` on a position they roster nobody at (K, if any) reads "no K rostered"; hover the `VS MINE` header lists their weakest player per position.
3. Their own players show `●` in `DROP?` where a better free agent exists; hover names the free agent and delta; the `▾` sort on `DROP?` puts the marked rows first.
4. The **My team** chip appears next to Rookies in all three modes and filters to their roster; combined with the Free agents chip the table is empty (expected).
5. ⓘ shows the Mine section.

Also record the uncached `players.value` time from the main-process log for the progress notes (expected: within noise of `v0.6.0`'s 79–85 ms).

- [x] **Step 5: Data reference**

In `docs/reference/value-and-signals.md`:

1. `## ValueContext` table — add two rows after `teamCount`:

```markdown
| `hasMyTeam` | A `teams` row is flagged `is_me` (set at import from the Sleeper user). When `false`, `vsMine`, `droppable` and every `mine[pos]` are `null`, and the UI hides the Mine group and the My team chip. |
| `mine[pos]` | `{ playerId, fullName, rosValue } \| null` per lineup position: my startable player (not IR / taxi) with the lowest `rosValue` — the `vsMine` baseline. `null` when I roster nobody startable with a ROS value there. |
```

2. `### Identity and roster` paragraph — after `ownerName`, insert `ownerIsMe` so the list reads:

```markdown
`ownerRosterId`, `ownerName`, `ownerIsMe` (the owner is the `is_me` team), and `statsAvailable` (…unchanged…)
```

3. After the `### Value (added in v0.5.0)` table, add:

```markdown
### Roster-relative (added in v0.7.0)

Spec §4; computed in `src/main/value/roster.ts`, same position only (FLEX is in the replacement level but cross-position drops need a lineup model — slice 6).

| Field       | Definition                                                                                                                                                                                                                                                                         | `null` when                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `vsMine`    | Free agents only: `rosValue − mine[pos].rosValue`. Can be negative; 0 when equal.                                                                                                                                                                                                  | rostered by anyone (mine or not), no `mine[pos]`, no `rosValue` on either side, no team mine |
| `droppable` | My startable players only: `{ playerId, fullName, delta }` of the best free agent at the position when its `rosValue` is **strictly** higher; `delta` = its `rosValue − mine`. Several of my players can carry it; the one on my weakest player equals that free agent's `vsMine`. | not mine, IR / taxi, no better free agent, no `rosValue` on either side, no team mine        |
```

4. `## Constants (single sources)` table — add a row:

```markdown
| `src/main/value/roster.ts` | `UNSTARTABLE_SLOTS = {ir, taxi}` — roster slots that never count as "my players at the position" |
```

5. `## Where each number is shown today (v0.6.0)` → `(v0.7.0)`; in the Value-mode table add after the `VS PROJ` row:

```markdown
| Mine | VS MINE | `vsMine` | signed | green ≥ 0 / red < 0 |
| | DROP? | `droppable` as a marker `●` (red) with the free agent's name and delta in the cell tooltip; blank otherwise; sorts by `delta` | marker | red |
```

and append this sentence to the "Default sort…" paragraph below the table:

```markdown
The Mine group exists only when `context.hasMyTeam`; the VS MINE header tooltip lists `mine[pos]` for the tab positions, and an empty VS MINE cell of a free agent reads "no K rostered" when `mine[pos]` is null. The **My team** chip (all modes, shown when a team is mine) filters on `ownerIsMe`.
```

6. `## Module map` — add a row after `schedule.ts`:

```markdown
| `src/main/value/roster.ts` | Roster-relative view: `vsMine`, `droppable`, my per-position baseline. |
```

Run `npm run format` so Prettier re-aligns the tables.

- [x] **Step 6: Commit**

Run: `npm run typecheck && npm run lint && npm test` — expected clean, 256 tests.

```bash
git add src/renderer/src/screens/PlayersScreen.tsx src/renderer/src/components/ValueHelp.tsx
git commit -m "feat(ui): My team chip and Mine cells in Value mode" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git add docs/reference/value-and-signals.md
git commit -m "docs: roster-relative fields in the data reference" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Version 0.7.0, Windows build, tag

Only after the user has checked Task 5 in the dev app and asked for the build.

- [x] **Step 1:** `package.json` / `package-lock.json` version `0.6.0` → `0.7.0`; `npm run typecheck && npm run lint && npm test`; commit `build: bump version to 0.7.0` (with the Co-Authored-By trailer).
- [x] **Step 2:** `npm run build:win`; copy `dist/FantasyCompanion-Setup-0.7.0.exe` to `/mnt/c/Users/habie/OneDrive/Bureau/`.
- [ ] **Step 3:** User installs over 0.6.0 (no migration), checks in Value mode that the `VS MINE` numbers for the top free-agent RB/WR read sensibly against their own roster and that the `DROP?` markers land on the players they would expect; record the uncached `players.value` time in the progress notes.
- [x] **Step 4:** Progress notes appended to this plan, commit `docs(plan): mark plan G complete`, tag `v0.7.0`, fast-forward `main`, delete the branch.

---

## Self-review notes

- **Spec coverage:** §4 "my team" = `teams.is_me` (`SeriesBundle.hasMyTeam` via `listTeams`, T1); fields null and UI hidden without one (T2 early return, T3 context, T4 `columnGroups(…, mine)`, T5 chip gate, §6.3 last bullet); `vsMine` = `rosValue − min(my rostered at pos)` for players rostered by nobody, null when I roster nobody at pos (tooltip "no K rostered", T4 `mineCellTitle`) or a side has no ROS value, null for other teams' players (T2 `isFreeAgent` / `NONE`); `droppable` on my players when the best free agent is strictly higher, carrying `{ playerId, fullName, delta }`, symmetric with `vsMine` (T2 test "symmetric"); FLEX same-position only, stated in the UI (T4 descriptions, T5 help term); IR excluded from "my players at pos" (T2 `UNSTARTABLE_SLOTS`, T3 Cook on IR); My team chip as a fourth chip, all three modes (T4 `TableFilters.mine` over `PlayerBaseRow`, T5). §5.1 `ownerIsMe` on `PlayerBaseRow` (week rows unaffected otherwise — T1 `playersWeek.test.ts`), `vsMine` / `droppable` on `PlayerValueRow`, `hasMyTeam` on `ValueContext` (T1; `mine` recorded as a deviation). §5.3 `roster.ts` pure, no DB (T2); cache untouched. §6.1 Mine group `vs mine · droppable` identical on every tab (T4 test over ALL / K), both columns sortable with nulls last (T4), `droppable` as a marker with name + delta in the tooltip, `vs mine` as a signed number (T4/T5). §8 `roster.test.ts` symmetry / no player at position / no `is_me` team / IR exclusion (T2) plus the build integration with a free agent (T3) and `playersTableView.test.ts` chips over `PlayerBaseRow` (T4). §9 `roster.ts` + the listed renderer files. §10 row G → v0.7.0 (T6). Windows verification with a sanity read (T6 step 3).
- **Placeholder scan:** none — the Task 1 `vsMine: null` / `droppable: null` / `mine: {…null}` stubs are code steps replaced in Task 3; the Task 4 `mine: false` in the screen is replaced in Task 5.
- **Type consistency:** `RosterInput` (T2) is satisfied by `{ ...PlayerBaseRow, rosterSlot: PlayerSeries.rosterSlot, rosValue }` (T1 fields, T3 call); `RosterView.byPlayer` values are `RosterRelative = { vsMine; droppable: Droppable | null }` matching `PlayerValueRow` (T1); `RosterView.baseline: Map<string, MyBaseline>` fills `ValueContext.mine: Record<string, MyBaseline | null>` (T1, T3) which `mineLabel` / `mineCellTitle` read (T4) and `ValueHelp` gates on via `hasMyTeam` (T5); `columnGroups(tabId, mode, mine)` (T4) is called with `valueContext?.hasMyTeam ?? false` in the screen and `true` in the help (T5); `Column.kind = 'droppable'` with `key: 'droppable'` is what `cellValue`, `cellText`, `sortValue`, `mineCellTitle` (T4) and the screen's tone branch (T5) switch on; `TableFilters.mine` (T4) is the screen's `mine` state (T5); `ValueField` includes `'vsMine'` so `cellValue`'s `row[col.field]` stays `number | null` (T1 `vsMine: number | null`).

## Progress notes (2026-09-18)

- Tasks 1–6 executed inline on `feat/roster-relative-view`; typecheck, lint and Vitest clean at every commit (237 → 256 tests, as planned). Task 5 checked by the user in the WSL dev app: "fine".
- **Timing** (one-off vitest script against DB copies, three warm runs): the WSL dev DB (825–828 candidates, projections stored) builds in 185–191 ms; the Windows DB copy (no projections stored yet — the app there has not synced them) in 92–105 ms, vs Plan F's 79–85 ms on the same DB. The roster pass itself is negligible; the difference is the extra `listTeams` query plus noise.
- **Real-data sanity read (dev DB, week 2):** my weakest startable players — QB Bryce Young −26.5, RB Nicholas Singleton −112, WR Barion Brown −112.5, TE Hunter Henry +26.3, K Harrison Mevis +8.6, DEF Tampa Bay +1.6. 566 free agents get a `vsMine`; top: George Holani +93.5, Cooper Kupp +92.6. `droppable` lands on Jacobs (← Holani +10.2), Mevis (← Matt Gay +7.7), Singleton, Emmett Johnson, Barion Brown; Cook, McBride, McConkey, Odunze, Coker, Stafford and both defenses are not flagged. Reads as intended.
- **Deviations from the task text:**
  - Task 4: the two pre-existing `TableFilters` literals in `playersTableView.test.ts` (`none`, `filters`) also needed `mine: false` — the plan only listed the screen's call.
  - Task 5: the screen's `playersTableView` import block has no `kickoffLabel`; `mineCellTitle` went after `filterRows`.
  - Task 6: `pkill -f electron` kills the invoking shell under this harness; processes were stopped by PID.
- Windows build: `dist/FantasyCompanion-Setup-0.7.0.exe` (94 MB), copied to `C:\Users\habie\OneDrive\Bureau`. Install over 0.6.0 (no migration) pending the user's check (Task 6 step 3).
