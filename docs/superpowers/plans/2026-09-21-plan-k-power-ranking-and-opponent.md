# Plan K — Power ranking and Opponent section (slice 6a, phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the rest-of-season team strength Plan J already computes (`lineup.strength`) as a power ranking on the League screen team cards with a Record / ROS strength sort toggle, and add the collapsed Opponent section (their slot table and swaps) to the Lineup screen — then ship `v0.12.0` through the in-app updater.

**Architecture:** Renderer-only. A new pure module `src/renderer/src/lib/leagueView.ts` owns the card's ROS line, the two sort orders and the basis note; `LeagueScreen.tsx` fetches `api.lineup.strength(ctx.season)` next to its existing calls and renders through those helpers. On the Lineup screen the existing `SlotTable` is reused for the opponent inside a collapsed card (`useState` toggle, `aria-expanded`), the swaps list is extracted into a `SwapsList` component shared by both teams, and `swapsEmptyText` learns whose lineup it describes. No main-process or IPC change — both payloads already exist.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4 + shadcn, Vitest 5 (jsdom + Testing Library for component tests), lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md` — §5.1 item 5 (Opponent section), §5.2 (League screen), §5.3 (data reference), §9 phasing (Plan K = v0.12.0).

## Global Constraints

- Same as Plans C–J: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use` if `node --version` is not 22.x), no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`. Path aliases: `@main/*`, `@shared/*`, `@/*` (renderer). Tests import fixtures relatively (`../../fixtures/...`).
- **Payload conventions** (`docs/reference/value-and-signals.md`): `null` = not computable; points display with 2 decimals (`fmtPoints`), `—` for null.
- **Card line** (spec §5.2): `ROS {rosTotal} · #{rank}`, `—` when null. **Toggle**: Record / ROS strength, default Record. **Note** (verbatim, spec §5.2): "Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks".
- **Opponent section** (spec §5.1 item 5): collapsed by default; the opponent's slot table (their current vs their optimal) and their swaps.
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits, summary ≤ 50 chars, imperative, **no trailers** (the user's global git conventions forbid `Co-Authored-By`; recent history follows that).
- ESLint is strict: explicit return types on every named function and component, `react-hooks/set-state-in-effect` is an error (state may only be set inside promise callbacks / event handlers, never synchronously in an effect body), no unused vars.
- Decisions locked in here (not in the spec):
  - **Record sort is strict standings order in the renderer** — wins desc, ties desc, points-for desc, then team label. Today the cards follow the repo's `is_me DESC, wins DESC, fpts DESC` order, i.e. my team is always first; under a toggle labelled *Record* that would read as a bug. My card keeps its `You` badge, and the default selected team stays mine because the selection is taken from the API list (which still leads with `is_me`), not from the sorted list.
  - **ROS strength sort**: `rank` ascending; teams with `rank === null` (no projections / season over) go last and keep record order among themselves.
  - **The basis note is rendered only while ROS strength is selected**, and is also the `title` tooltip of every card's ROS line so it is discoverable in Record mode.
  - **Strength fetch failure** uses the screen's existing single error line; the cards show `ROS —`. The strength call is keyed on `PointsContext.season` (a number — `League.season` is a string), which the screen already loads.
  - **`swapsEmptyText`** returns `Their lineup is optimal` for a non-`isMe` team; `Lineup not set on Sleeper yet` is unchanged for both. The slot-table header reads `Your starter` / `Their starter` from `TeamLineup.isMe`.
  - The Opponent card's open/closed state is plain component state (not keyed by week): a user comparing several weeks keeps it open.

## File map

| File | Change |
| --- | --- |
| `src/renderer/src/lib/leagueView.ts` (create) | `TeamSort`, `TEAM_SORTS`, `STRENGTH_NOTE`, `teamLabel` (moved from the screen), `rosLine`, `sortTeams` |
| `tests/fixtures/league.ts` (create) | `team(over)` fixture (`Team`) |
| `tests/fixtures/lineup.ts` (modify) | `teamStrength(over)` fixture (`TeamStrength`) |
| `tests/renderer/lib/leagueView.test.ts` (create) | pure tests |
| `src/renderer/src/screens/LeagueScreen.tsx` (modify) | strength fetch, sort toggle + note, ROS card line, imports `teamLabel` |
| `tests/renderer/components/LeagueScreen.test.tsx` (create) | DOM test: ROS lines, default order, toggle, note, failure |
| `src/renderer/src/lib/lineupView.ts` (modify) | `swapsEmptyText` is `isMe`-aware |
| `tests/renderer/lib/lineupView.test.ts` (modify) | opponent empty-state text |
| `src/renderer/src/screens/LineupScreen.tsx` (modify) | `SlotTable` header label, `SwapsList`, `OpponentCard`, render the opponent |
| `tests/renderer/components/LineupScreen.test.tsx` (modify) | collapsed/expanded opponent test |
| `docs/reference/value-and-signals.md` (modify) | v0.12.0 presentation: League cards, Opponent section, "not shown" list |
| `package.json`, `package-lock.json` | `0.11.1` → `0.12.0` via `npm version minor` |

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout -b feat/power-ranking` from `main` (clean, at `e5d9ac5` or later).

---

### Task 1: `lib/leagueView.ts` — sort orders, ROS line, note (pure, TDD)

**Files:**
- Create: `src/renderer/src/lib/leagueView.ts`
- Create: `tests/fixtures/league.ts`
- Modify: `tests/fixtures/lineup.ts` (append `teamStrength`)
- Test: `tests/renderer/lib/leagueView.test.ts`

**Interfaces:**
- Consumes: `Team`, `TeamStrength` from `@shared/types`; `fmtPoints` from `@/lib/format`.
- Produces (Task 2 relies on these exact names):
  - `type TeamSort = 'record' | 'strength'`
  - `const TEAM_SORTS: { key: TeamSort; label: string }[]` — `[{ record, 'Record' }, { strength, 'ROS strength' }]`
  - `const STRENGTH_NOTE: string`
  - `function teamLabel(t: Team): string`
  - `function rosLine(s: TeamStrength | undefined): string`
  - `function sortTeams(teams: Team[], strengths: TeamStrength[], sort: TeamSort): Team[]`

- [ ] **Step 1: Add the fixtures**

Create `tests/fixtures/league.ts`:

```ts
import type { Team } from '@shared/types'

export function team(over: Partial<Team> = {}): Team {
  const rosterId = over.rosterId ?? 1
  return {
    leagueId: 'L1',
    rosterId,
    ownerId: `u${rosterId}`,
    displayName: `owner${rosterId}`,
    teamName: `Team ${rosterId}`,
    avatar: null,
    wins: 0,
    losses: 0,
    ties: 0,
    fpts: 0,
    fptsAgainst: 0,
    isMe: false,
    ...over
  }
}
```

Append to `tests/fixtures/lineup.ts` (and add `TeamStrength` to its `@shared/types` import):

```ts
export function teamStrength(over: Partial<TeamStrength> = {}): TeamStrength {
  const rosterId = over.rosterId ?? 1
  return {
    rosterId,
    name: `Team ${rosterId}`,
    isMe: false,
    thisWeek: 120,
    rosTotal: 1800,
    rosPerWeek: 112.5,
    rank: 1,
    ...over
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/renderer/lib/leagueView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  rosLine,
  sortTeams,
  STRENGTH_NOTE,
  teamLabel,
  TEAM_SORTS
} from '@/lib/leagueView'
import { team } from '../../fixtures/league'
import { teamStrength } from '../../fixtures/lineup'

const unranked = { thisWeek: null, rosTotal: null, rosPerWeek: null, rank: null }

describe('leagueView', () => {
  it('labels a team by its team name, else by its owner', () => {
    expect(teamLabel(team({ teamName: 'Cook Book', displayName: 'puffinn' }))).toBe('Cook Book')
    expect(teamLabel(team({ teamName: null, displayName: 'puffinn' }))).toBe('puffinn')
  })

  it('writes the ROS line with two decimals and the rank, or a dash', () => {
    expect(rosLine(teamStrength({ rosTotal: 1234.5, rank: 3 }))).toBe('ROS 1234.50 · #3')
    expect(rosLine(teamStrength(unranked))).toBe('ROS —')
    expect(rosLine(undefined)).toBe('ROS —')
  })

  it('sorts by record: wins, then ties, then points for, whoever is me', () => {
    const me = team({ rosterId: 1, teamName: 'Me', wins: 1, losses: 1, fpts: 250, isMe: true })
    const top = team({ rosterId: 2, teamName: 'Top', wins: 2, losses: 0, fpts: 240 })
    const tied = team({ rosterId: 3, teamName: 'Tied', wins: 1, losses: 1, fpts: 260 })
    const tie1 = team({ rosterId: 4, teamName: 'Tie', wins: 1, losses: 0, ties: 1, fpts: 100 })
    const order = sortTeams([me, top, tied, tie1], [], 'record').map((t) => t.teamName)
    expect(order).toEqual(['Top', 'Tie', 'Tied', 'Me'])
  })

  it('sorts by ROS rank with unranked teams last, in record order', () => {
    const a = team({ rosterId: 1, teamName: 'A', wins: 2 })
    const b = team({ rosterId: 2, teamName: 'B', wins: 1 })
    const c = team({ rosterId: 3, teamName: 'C', wins: 0 })
    const d = team({ rosterId: 4, teamName: 'D', wins: 3 })
    const strengths = [
      teamStrength({ rosterId: 1, rank: 2 }),
      teamStrength({ rosterId: 2, rank: 1 }),
      teamStrength({ rosterId: 3, ...unranked }),
      teamStrength({ rosterId: 4, ...unranked })
    ]
    const order = sortTeams([a, b, c, d], strengths, 'strength').map((t) => t.teamName)
    expect(order).toEqual(['B', 'A', 'D', 'C'])
    expect(sortTeams([a, b, c, d], [], 'strength').map((t) => t.teamName)).toEqual([
      'D',
      'A',
      'B',
      'C'
    ])
  })

  it('does not mutate the input list', () => {
    const teams = [team({ rosterId: 1, wins: 0 }), team({ rosterId: 2, wins: 1 })]
    sortTeams(teams, [], 'record')
    expect(teams.map((t) => t.rosterId)).toEqual([1, 2])
  })

  it('exposes the two sorts and the basis note', () => {
    expect(TEAM_SORTS).toEqual([
      { key: 'record', label: 'Record' },
      { key: 'strength', label: 'ROS strength' }
    ])
    expect(STRENGTH_NOTE).toBe(
      'Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks'
    )
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/renderer/lib/leagueView.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/leagueView"`.

- [ ] **Step 4: Implement `src/renderer/src/lib/leagueView.ts`**

```ts
import type { Team, TeamStrength } from '@shared/types'
import { fmtPoints } from './format'

export type TeamSort = 'record' | 'strength'

export const TEAM_SORTS: { key: TeamSort; label: string }[] = [
  { key: 'record', label: 'Record' },
  { key: 'strength', label: 'ROS strength' }
]

/** Basis of the ROS number (spec §5.2): under the toggle while ROS strength is selected, and every card line's tooltip. */
export const STRENGTH_NOTE =
  'Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks'

export function teamLabel(t: Team): string {
  return t.teamName ?? t.displayName
}

/** Third card line: "ROS 1234.50 · #3", or "ROS —" when strength is not computable (no projections, season over). */
export function rosLine(s: TeamStrength | undefined): string {
  return s && s.rosTotal !== null && s.rank !== null
    ? `ROS ${fmtPoints(s.rosTotal)} · #${s.rank}`
    : 'ROS —'
}

function byRecord(a: Team, b: Team): number {
  return (
    b.wins - a.wins ||
    b.ties - a.ties ||
    b.fpts - a.fpts ||
    teamLabel(a).localeCompare(teamLabel(b))
  )
}

/**
 * Record: standings order (wins, ties, points for). ROS strength: `rank` ascending, unranked
 * teams last; ties keep record order (Array.prototype.sort is stable). Never mutates `teams`.
 */
export function sortTeams(teams: Team[], strengths: TeamStrength[], sort: TeamSort): Team[] {
  const sorted = [...teams].sort(byRecord)
  if (sort === 'record') return sorted
  const rank = new Map(strengths.map((s) => [s.rosterId, s.rank]))
  return sorted.sort((a, b) => {
    const ra = rank.get(a.rosterId) ?? null
    const rb = rank.get(b.rosterId) ?? null
    if (ra === rb) return 0
    if (ra === null) return 1
    if (rb === null) return -1
    return ra - rb
  })
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tests/renderer/lib/leagueView.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/renderer/src/lib/leagueView.ts tests/fixtures/league.ts tests/fixtures/lineup.ts tests/renderer/lib/leagueView.test.ts
git commit -m "feat(ui): league card sort and ROS line helpers"
```

---

### Task 2: League screen — ROS line and Record / ROS strength toggle (DOM test)

**Files:**
- Modify: `src/renderer/src/screens/LeagueScreen.tsx`
- Test: `tests/renderer/components/LeagueScreen.test.tsx`

**Interfaces:**
- Consumes: Task 1's `rosLine`, `sortTeams`, `STRENGTH_NOTE`, `teamLabel`, `TEAM_SORTS`, `TeamSort`; `api.lineup.strength(season: number): Promise<TeamStrength[]>` (exists since Plan J); `api.league.pointsContext(): Promise<PointsContext>` (`{ season: number; lastWeek: number | null }`).
- Produces: nothing new for later tasks. `LeagueScreen` keeps its prop-less signature (App mounts it with `key={dataVersion}`, so a sync remounts it and refetches strength).

- [ ] **Step 1: Write the failing DOM test**

Create `tests/renderer/components/LeagueScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LeagueScreen } from '@/screens/LeagueScreen'
import { api } from '@/lib/api'
import type { League } from '@shared/types'
import { team } from '../../fixtures/league'
import { teamStrength } from '../../fixtures/lineup'

vi.mock('@/lib/api', () => ({
  api: {
    league: { get: vi.fn(), teams: vi.fn(), roster: vi.fn(), pointsContext: vi.fn() },
    lineup: { strength: vi.fn() }
  }
}))
const getMock = vi.mocked(api.league.get)
const teamsMock = vi.mocked(api.league.teams)
const rosterMock = vi.mocked(api.league.roster)
const ctxMock = vi.mocked(api.league.pointsContext)
const strengthMock = vi.mocked(api.lineup.strength)

const league: League = {
  leagueId: 'L1',
  name: 'Emoney',
  season: '2026',
  status: 'in_season',
  totalRosters: 3,
  syncedAt: null
}
// API order: me first, then by record — the screen must not rely on it.
const teams = [
  team({ rosterId: 1, teamName: 'Cook Book', wins: 1, losses: 1, fpts: 250, isMe: true }),
  team({ rosterId: 2, teamName: 'Rival', wins: 2, losses: 0, fpts: 260 }),
  team({ rosterId: 3, teamName: 'Third', wins: 0, losses: 2, fpts: 200 })
]
const strengths = [
  teamStrength({ rosterId: 1, name: 'Cook Book', isMe: true, rosTotal: 1900.5, rank: 1 }),
  teamStrength({ rosterId: 2, name: 'Rival', rosTotal: 1850, rank: 2 }),
  teamStrength({
    rosterId: 3,
    name: 'Third',
    thisWeek: null,
    rosTotal: null,
    rosPerWeek: null,
    rank: null
  })
]

/** Team cards are the buttons that carry an ROS line ("ROS 12.00 · #1" / "ROS —"), in DOM order — not the "ROS strength" toggle. */
function cards(): string[] {
  return screen
    .getAllByRole('button')
    .filter((b) => /ROS (\d|—)/.test(b.textContent ?? ''))
    .map((b) => b.textContent ?? '')
}

beforeEach(() => {
  vi.resetAllMocks()
  getMock.mockResolvedValue(league)
  teamsMock.mockResolvedValue(teams)
  rosterMock.mockResolvedValue([])
  ctxMock.mockResolvedValue({ season: 2026, lastWeek: 2 })
  strengthMock.mockResolvedValue(strengths)
})
afterEach(cleanup)

describe('LeagueScreen', () => {
  it('shows an ROS line on every card and sorts by record by default', async () => {
    render(<LeagueScreen />)
    expect(await screen.findByText('ROS 1900.50 · #1')).toBeTruthy()
    expect(strengthMock).toHaveBeenCalledWith(2026)
    const order = cards()
    expect(order).toHaveLength(3)
    expect(order[0]).toMatch(/^Rival/)
    expect(order[0]).toContain('ROS 1850.00 · #2')
    expect(order[1]).toMatch(/^Cook Book/)
    expect(order[2]).toMatch(/^Third/)
    expect(order[2]).toContain('ROS —')
    expect(screen.getByRole('button', { name: 'Record', pressed: true })).toBeTruthy()
    expect(
      screen.queryByText(
        'Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks'
      )
    ).toBeNull()
    // The selected roster panel still opens on my team.
    expect(screen.getAllByText('Cook Book')).toHaveLength(2)
  })

  it('sorts by ROS strength on the toggle, unranked last, with the basis note', async () => {
    render(<LeagueScreen />)
    await screen.findByText('ROS 1900.50 · #1')
    fireEvent.click(screen.getByRole('button', { name: 'ROS strength' }))
    expect(screen.getByRole('button', { name: 'ROS strength', pressed: true })).toBeTruthy()
    expect(
      screen.getByText(
        'Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks'
      )
    ).toBeTruthy()
    let order = cards()
    expect(order[0]).toMatch(/^Cook Book/)
    expect(order[1]).toMatch(/^Rival/)
    expect(order[2]).toMatch(/^Third/)
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    order = cards()
    expect(order[0]).toMatch(/^Rival/)
  })

  it('shows dashes and the error line when the strength call fails', async () => {
    strengthMock.mockRejectedValue(new Error('boom'))
    render(<LeagueScreen />)
    expect(await screen.findByText('boom')).toBeTruthy()
    expect(screen.getAllByText('ROS —')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/renderer/components/LeagueScreen.test.tsx`
Expected: FAIL — `Unable to find an element with the text: ROS 1900.50 · #1`.

- [ ] **Step 3: Rewrite `src/renderer/src/screens/LeagueScreen.tsx`**

Replace the whole file with:

```tsx
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { PositionBadge } from '@/components/PositionBadge'
import { api } from '@/lib/api'
import { errorMessage, fmtPoints } from '@/lib/format'
import {
  rosLine,
  sortTeams,
  STRENGTH_NOTE,
  teamLabel,
  TEAM_SORTS,
  type TeamSort
} from '@/lib/leagueView'
import { cn } from '@/lib/utils'
import type { League, PointsContext, RosterPlayer, Team, TeamStrength } from '@shared/types'

const SLOT_ORDER = ['starter', 'bench', 'ir', 'taxi'] as const
const SLOT_LABEL: Record<RosterPlayer['slot'], string> = {
  starter: 'Starters',
  bench: 'Bench',
  ir: 'IR',
  taxi: 'Taxi'
}

export function LeagueScreen(): React.JSX.Element {
  const [league, setLeague] = useState<League | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [strengths, setStrengths] = useState<TeamStrength[]>([])
  const [sort, setSort] = useState<TeamSort>('record')
  const [selected, setSelected] = useState<number | null>(null)
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ctx, setCtx] = useState<PointsContext | null>(null)

  useEffect(() => {
    void api.league
      .pointsContext()
      .then(setCtx)
      .catch((err) => setError(errorMessage(err)))
    void api.league
      .get()
      .then((l) => {
        setError(null)
        setLeague(l)
      })
      .catch((err) => setError(errorMessage(err)))
    void api.league
      .teams()
      .then((list) => {
        setError(null)
        setTeams(list)
        setSelected((current) => current ?? list[0]?.rosterId ?? null)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [])

  // Strength is keyed on the season the value build runs on (a number; `League.season` is a string).
  const season = ctx?.season ?? null
  useEffect(() => {
    if (season === null) return
    let cancelled = false
    void api.lineup
      .strength(season)
      .then((list) => {
        if (!cancelled) setStrengths(list)
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [season])

  useEffect(() => {
    if (selected === null) return
    void api.league
      .roster(selected)
      .then((r) => {
        setError(null)
        setRoster(r)
      })
      .catch((err) => setError(errorMessage(err)))
  }, [selected])

  const selectedTeam = teams.find((t) => t.rosterId === selected) ?? null
  const groups = SLOT_ORDER.map((slot) => ({
    slot,
    players: roster.filter((p) => p.slot === slot)
  })).filter((g) => g.players.length > 0)
  const strengthById = new Map(strengths.map((s) => [s.rosterId, s]))
  const ordered = sortTeams(teams, strengths, sort)

  return (
    <div className="space-y-6">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{league?.name ?? 'League'}</h1>
          <p className="text-sm text-muted-foreground">
            {league ? `${league.season} · ${league.totalRosters} teams` : ''}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex rounded-md border p-0.5">
            {TEAM_SORTS.map((s) => (
              <button
                key={s.key}
                type="button"
                aria-pressed={sort === s.key}
                onClick={() => setSort(s.key)}
                className={cn(
                  'h-7 rounded px-3 text-sm',
                  sort === s.key
                    ? 'bg-primary/20 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          {sort === 'strength' && (
            <p className="text-xs text-muted-foreground">{STRENGTH_NOTE}</p>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="grid content-start gap-3 sm:grid-cols-2">
          {ordered.map((t) => (
            <button
              key={t.rosterId}
              type="button"
              onClick={() => setSelected(t.rosterId)}
              className={cn(
                'rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent/40',
                selected === t.rosterId && 'border-primary/60 bg-accent/60'
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate font-medium">{teamLabel(t)}</div>
                {t.isMe && <Badge variant="secondary">You</Badge>}
              </div>
              <div className="truncate text-xs text-muted-foreground">{t.displayName}</div>
              <div className="mt-3 flex items-baseline justify-between text-sm">
                <span className="font-semibold tabular-nums">
                  {t.wins}-{t.losses}
                  {t.ties ? `-${t.ties}` : ''}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  PF {fmtPoints(t.fpts)} · PA {fmtPoints(t.fptsAgainst)}
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground tabular-nums" title={STRENGTH_NOTE}>
                {rosLine(strengthById.get(t.rosterId))}
              </div>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selectedTeam ? teamLabel(selectedTeam) : 'Select a team'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {groups.map((g) => (
              <div key={g.slot}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {SLOT_LABEL[g.slot]}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Pos</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="w-14">Team</TableHead>
                      <TableHead className="w-12 text-right">Bye</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-16 text-right">Pts</TableHead>
                      <TableHead className="w-16 text-right">
                        {ctx?.lastWeek ? `Wk ${ctx.lastWeek}` : 'Last'}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.players.map((p) => (
                      <TableRow key={p.playerId}>
                        <TableCell>
                          <PositionBadge position={p.position} />
                        </TableCell>
                        <TableCell className="font-medium">{p.fullName}</TableCell>
                        <TableCell className="text-muted-foreground">{p.team ?? 'FA'}</TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {p.byeWeek ?? '—'}
                        </TableCell>
                        <TableCell className={cn('text-xs', p.injuryStatus && 'text-destructive')}>
                          {p.injuryStatus ?? ''}
                        </TableCell>
                        {p.statsAvailable ? (
                          <>
                            <TableCell className="text-right font-medium tabular-nums">
                              {fmtPoints(p.seasonPoints)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground tabular-nums">
                              {fmtPoints(p.lastWeekPoints)}
                            </TableCell>
                          </>
                        ) : (
                          <TableCell
                            colSpan={2}
                            className="text-right text-xs text-muted-foreground"
                            title="This player could not be matched to nflverse data"
                          >
                            stats unavailable
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ))}
            {selectedTeam && groups.length === 0 && (
              <p className="text-sm text-muted-foreground">No players on this roster.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

What changed vs. the current file: the local `teamLabel` moved to `leagueView.ts`; new `strengths` / `sort` state; the strength effect (cancellation flag, keyed on `season`); the header is now a `flex … justify-between` row with the toggle and the conditional note; cards iterate `ordered` and carry the third line. The roster panel is untouched (spec §5.2).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/renderer/components/LeagueScreen.test.tsx`
Expected: PASS, 3 tests. If the third test's `boom` is not found, check that the strength rejection is not being cleared by a later `setError(null)` — the `get`/`teams` promises resolve in the first microtask flush, before the `season` effect fires; `mockRejectedValue` on `strength` therefore lands last.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/renderer/src/screens/LeagueScreen.tsx tests/renderer/components/LeagueScreen.test.tsx
git commit -m "feat(ui): power ranking on the League screen cards"
```

---

### Task 3: Opponent section on the Lineup screen

**Files:**
- Modify: `src/renderer/src/lib/lineupView.ts:118-120` (`swapsEmptyText`)
- Modify: `tests/renderer/lib/lineupView.test.ts:101-113`
- Modify: `src/renderer/src/screens/LineupScreen.tsx`
- Modify: `tests/renderer/components/LineupScreen.test.tsx`

**Interfaces:**
- Consumes: `TeamLineup.isMe`, `.name`, `.swaps`, `.current` (Plan J types); `swapLine`, `swapsEmptyText` from `@/lib/lineupView`; `ChevronDown` from `lucide-react`.
- Produces: `swapsEmptyText(t: TeamLineup): string` now returns `'Their lineup is optimal'` when `!t.isMe`; screen-local `SwapsList({ team })` and `OpponentCard({ team, onOpen })` components (not exported).

- [ ] **Step 1: Extend the pure test**

In `tests/renderer/lib/lineupView.test.ts`, replace the two `swapsEmptyText` expectations at the end of `'writes swap lines and the empty-state text'` with:

```ts
    expect(swapsEmptyText(teamLineup())).toBe('Your lineup is optimal')
    expect(swapsEmptyText(teamLineup({ isMe: false }))).toBe('Their lineup is optimal')
    expect(swapsEmptyText(teamLineup({ current: null }))).toBe('Lineup not set on Sleeper yet')
    expect(swapsEmptyText(teamLineup({ isMe: false, current: null }))).toBe(
      'Lineup not set on Sleeper yet'
    )
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/renderer/lib/lineupView.test.ts`
Expected: FAIL — `expected 'Your lineup is optimal' to be 'Their lineup is optimal'`.

- [ ] **Step 3: Update `swapsEmptyText` in `src/renderer/src/lib/lineupView.ts`**

Replace the function body:

```ts
/** Empty state of a swaps list, for my team or the opponent's. */
export function swapsEmptyText(t: TeamLineup): string {
  if (t.current === null) return 'Lineup not set on Sleeper yet'
  return t.isMe ? 'Your lineup is optimal' : 'Their lineup is optimal'
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/renderer/lib/lineupView.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing DOM test**

In `tests/renderer/components/LineupScreen.test.tsx`, append inside `describe('LineupScreen', …)`:

```tsx
  it('keeps the opponent collapsed and expands to their slot table and swaps', async () => {
    const wr2 = lineupPlayer({
      playerId: 'wr2',
      fullName: 'Puka Nacua',
      position: 'WR',
      team: 'LAR',
      value: 14
    })
    const wr3 = lineupPlayer({
      playerId: 'wr3',
      fullName: 'Jauan Jennings',
      position: 'WR',
      team: 'SF',
      value: 9.5
    })
    weekMock.mockResolvedValue(
      lineupWeek({
        opponent: teamLineup({
          rosterId: 2,
          name: 'Rival',
          isMe: false,
          optimal: [slotEntry('WR', wr2)],
          optimalTotal: 14,
          current: [slotEntry('WR', wr3)],
          currentTotal: 9.5,
          bench: [wr3],
          swaps: [{ slot: 'WR', out: wr3, in: wr2, delta: 4.5 }]
        })
      })
    )
    render(<LineupScreen dataVersion={0} />)
    const toggle = await screen.findByRole('button', { name: 'Opponent · Rival', expanded: false })
    expect(screen.getByText('Your starter')).toBeTruthy()
    expect(screen.queryByText('Their starter')).toBeNull()
    expect(screen.queryByText('Puka Nacua')).toBeNull()
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Opponent · Rival', expanded: true })).toBeTruthy()
    expect(screen.getByText('Their starter')).toBeTruthy()
    expect(screen.getByText('Puka Nacua')).toBeTruthy()
    expect(screen.getByText('Start Puka Nacua over Jauan Jennings (WR, +4.50)')).toBeTruthy()
    fireEvent.click(toggle)
    expect(screen.queryByText('Their starter')).toBeNull()
  })

  it('shows the opponent optimal state and hides the section without a matchup', async () => {
    weekMock.mockResolvedValueOnce(lineupWeek())
    render(<LineupScreen dataVersion={0} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Opponent · Rival' }))
    expect(screen.getByText('Their lineup is optimal')).toBeTruthy()
    weekMock.mockResolvedValueOnce(lineupWeek({ week: 6, opponent: null, matchupId: null }))
    fireEvent.change(screen.getByLabelText('Week'), { target: { value: '6' } })
    expect(await screen.findByText('No matchup this week')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Opponent/ })).toBeNull()
  })
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run tests/renderer/components/LineupScreen.test.tsx`
Expected: the two new tests FAIL — `Unable to find role="button" and name "Opponent · Rival"`; the four existing tests still pass.

- [ ] **Step 7: Modify `src/renderer/src/screens/LineupScreen.tsx`**

(a) Add the icon import after the `react` import:

```tsx
import { ChevronDown } from 'lucide-react'
```

(b) In `SlotTable`, replace the header cell `<TableHead>Your starter</TableHead>` with:

```tsx
          <TableHead>{team.isMe ? 'Your starter' : 'Their starter'}</TableHead>
```

(c) Insert after the `SlotTable` function (before `interface LineupScreenProps`):

```tsx
function SwapsList({ team }: { team: TeamLineup }): React.JSX.Element {
  if (team.swaps.length === 0) {
    return <p className="text-sm text-muted-foreground">{swapsEmptyText(team)}</p>
  }
  return (
    <ul className="space-y-1 text-sm">
      {team.swaps.map((s) => (
        <li key={`${s.slot}:${s.in.playerId}`}>{swapLine(s)}</li>
      ))}
    </ul>
  )
}

/** Spec §5.1 item 5: the opponent's current-vs-optimal table and swaps, collapsed by default. */
function OpponentCard({
  team,
  onOpen
}: {
  team: TeamLineup
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <CardHeader>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          {/* A span, not CardTitle: a div may not sit inside a button. */}
          <span className="text-base leading-none font-semibold">Opponent · {team.name}</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <SlotTable team={team} onOpen={onOpen} />
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Their swaps
            </div>
            <SwapsList team={team} />
          </div>
        </CardContent>
      )}
    </Card>
  )
}
```

(d) In `LineupScreen`'s JSX, replace the Swaps card's `<CardContent>…</CardContent>` (the `me.swaps.length === 0 ? … : <ul>…</ul>` block) with:

```tsx
            <CardContent>
              <SwapsList team={me} />
            </CardContent>
```

(e) Insert the opponent card after the closing `)}` of the `{me && (…)}` block and before `<PlayerDetailPanel …/>`:

```tsx
      {data?.opponent && <OpponentCard team={data.opponent} onOpen={setSelected} />}
```

- [ ] **Step 8: Run the DOM tests to verify they pass**

Run: `npx vitest run tests/renderer/components/LineupScreen.test.tsx`
Expected: PASS, 6 tests. `getByRole('button', { name: 'Opponent · Rival' })` resolves because the `svg` is `aria-hidden` and contributes nothing to the accessible name; if Testing Library reports the name with trailing whitespace, keep the title `span` text on one line as shown.

- [ ] **Step 9: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/renderer/src/lib/lineupView.ts tests/renderer/lib/lineupView.test.ts src/renderer/src/screens/LineupScreen.tsx tests/renderer/components/LineupScreen.test.tsx
git commit -m "feat(ui): opponent lineup section on the Lineup screen"
```

---

### Task 4: Data reference and dev-app check

**Files:**
- Modify: `docs/reference/value-and-signals.md`

No main-process code changed in this plan, so the spec §7 real-data step is the dev-app check itself (the strength numbers were already read on the dev DB in Plan J: 16 teams in 30 ms, my roster #10).

- [ ] **Step 1: Document.** Edits to `docs/reference/value-and-signals.md` (exact old → new):

1. Line 3, intro: `the current v0.10.0 presentation` → `the current v0.12.0 presentation`.
2. Table "How the data reaches the renderer", the `lineup.strength(season)` row: replace the trailing sentence `Not shown yet (Plan K puts it on the League cards).` with:

```
Shown on the League screen cards (`ROS {rosTotal} · #{rank}`) and drives their *ROS strength* sort.
```

3. Heading `### Where it is shown (v0.10.0) — Lineup screen` → `### Where it is shown (v0.12.0) — Lineup screen`, and append a fifth item after item 4 (`**Bench** / **Unavailable** …`):

```markdown
5. **Opponent** — a collapsed card `Opponent · {name}` (`aria-expanded` toggle) with the opponent's slot table (`Their starter` · Pts · Optimal · Pts · Δ, same tinting and close calls) and **Their swaps** (`Start A over B (SLOT, +Δ)`; empty states `Their lineup is optimal` / `Lineup not set on Sleeper yet`). Hidden when `opponent` is null.
```

4. Replace the line `Not shown yet: `TeamStrength` (Plan K), the opponent's slot table (Plan K), `expert` on bench players (in the payload).` with:

```markdown
### Where it is shown (v0.12.0) — League screen

Each team card's third line is `ROS {rosTotal} · #{rank}` (`ROS —` when null; tooltip = the basis note). The header toggle **Record / ROS strength** (default Record) orders the cards by standings (wins, ties, points for) or by `rank` ascending with unranked teams last; while ROS strength is selected the note "Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks" is shown under the toggle. Helpers: `lib/leagueView.ts` (`rosLine`, `sortTeams`, `STRENGTH_NOTE`).

Not shown yet: `TeamStrength.thisWeek` / `rosPerWeek` (in the payload), `expert` on bench players (in the payload).
```

5. Heading `## Where each number is shown today (v0.10.0)` → `## Where each number is shown today (v0.12.0)`.

Run `npm run format` (Prettier reflows the markdown tables), then `git diff --stat docs/reference/value-and-signals.md` to confirm only that file changed.

- [ ] **Step 2: Commit**

```bash
git add docs/reference/value-and-signals.md
git commit -m "docs: document power ranking and opponent section"
```

- [ ] **Step 3: Dev-app check (user)**

```bash
npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu & echo "DEV_PID=$!"
```

Record the PID; stop the app later with `kill <PID>` only (never `pkill -f` — it kills the harness shell). Check with the user:

- League screen: every card shows `ROS … · #n`; my card (#10 on the dev DB) is no longer pinned first under *Record*; *ROS strength* reorders the cards and shows the note; the roster panel still opens on my team.
- Lineup screen, current week: the `Opponent · {name}` card is collapsed; expanding shows their table with `Their starter`, their swaps or `Their lineup is optimal`; a name in their table opens the detail panel; a week with no matchup hides the card.

- [ ] **Step 4: Tick this plan's tasks 0–4 and commit** `docs(plan): mark plan K tasks 0-4 done`.

---

### Task 5: Release `v0.12.0`

Run by the user with Claude driving the commands. This is the first release delivered through the new in-app flow on the user's installed `0.11.1` (pill → popup → silent install).

- [ ] **Step 1: Merge to main and bump**

```bash
git checkout main && git merge --ff-only feat/power-ranking && git branch -d feat/power-ranking
git status --short          # must be empty
npm version minor           # → 0.12.0: commit "build: bump version to 0.12.0" + tag v0.12.0
git push --follow-tags
```

If no `Release` run appears within ~20 s (`gh run list --workflow=release.yml --limit 1`), re-push the tag alone: `git push origin :refs/tags/v0.12.0 && git push origin v0.12.0`.

- [ ] **Step 2: Watch the run and check the draft**

```bash
gh run watch --exit-status $(gh run list --workflow=release.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh api repos/Puffinnois/fantasy-football-companion/releases -q '.[] | "\(.tag_name) draft=\(.draft) assets=\([.assets[].name] | join(","))"'
```

Expected: the run succeeds; `v0.12.0 draft=true assets=FantasyCompanion-Setup-0.12.0.exe,FantasyCompanion-Setup-0.12.0.exe.blockmap,latest.yml` and no duplicate `v0.12.0` entry.

- [ ] **Step 3: Publish (user — Claude cannot publish under auto mode)**

Release notes (these feed the in-app popup):

```bash
gh release edit v0.12.0 --draft=false --notes "Power ranking: every team's rest-of-season strength on the League screen cards (optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks), with a Record / ROS strength sort. Lineup screen: the opponent's lineup and swaps in a collapsible section."
```

Verify with the updater's own request (GitHub's REST API and download URLs lag a publish by minutes): `curl -sL -H "Accept: application/json" https://github.com/Puffinnois/fantasy-football-companion/releases/latest | grep -o '"tag_name":"[^"]*"'` prints `"tag_name":"v0.12.0"`.

- [ ] **Step 4: Observe on Windows (user)**

Launch the installed 0.11.1 (or wait for its hourly check): green **Update to 0.12.0** pill → popup with the notes above → **Update & restart** → silent install → relaunch. Expected: sidebar footer shows `v0.12.0`, no pill; League cards show the ROS line; the Opponent card is on the Lineup screen.

- [ ] **Step 5: Close out**

Tick this plan, append progress notes at the end (deviations, test count, timings), commit `docs(plan): mark plan K complete`, push `main`, and update the project-status memory: slice 6a complete (`v0.12.0`), next is brainstorming 6b (trade evaluator) against the lineup engine.

---

## Self-review notes

- **Spec coverage:** §5.2 third card line `ROS {rosTotal} · #{rank}` with `—` (T1 `rosLine`, T2 card), sort toggle Record / ROS strength default Record (T1 `TEAM_SORTS`/`sortTeams`, T2 toggle with `aria-pressed`), the verbatim basis note (T1 `STRENGTH_NOTE`, T2 under the toggle + card tooltip), roster panel unchanged (T2 keeps it byte-identical); §5.1 item 5 collapsed Opponent section with their slot table and swaps (T3 `OpponentCard`, `SlotTable` reuse, `SwapsList`); §5.3 data reference (T4); §6 renderer errors → the screen's error line (T2 failure test); §7 pure helpers tested + one DOM test per state (T1, T2, T3); §9 Plan K → v0.12.0 (T5).
- **Placeholders:** none — every code step shows the code, every run step its command and expected outcome.
- **Type consistency:** `TeamSort` / `TEAM_SORTS` / `STRENGTH_NOTE` / `rosLine` / `sortTeams` / `teamLabel` are defined in T1 with the signatures T2 imports; `teamStrength` (T1 fixture, `tests/fixtures/lineup.ts`) and `team` (T1 fixture, `tests/fixtures/league.ts`) are what T1 and T2 tests import; `swapsEmptyText(t: TeamLineup)` keeps its signature (T3) so the existing call sites compile; `SwapsList` / `OpponentCard` are local to `LineupScreen.tsx` and take `TeamLineup` / `DetailTarget` from Plan J's types.
- **Behaviour change to flag to the user:** the League cards no longer pin my team first (strict standings under *Record*); the `You` badge and the default roster selection are unchanged.
