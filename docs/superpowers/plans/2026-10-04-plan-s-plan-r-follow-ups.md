# Plan S — Plan R follow-ups

**Status:** in progress — Tasks 0–8 Steps 1–3 done on `fix/plan-r-follow-ups`. Memory gate (Task 7; real league, 16 teams, fair, no focus, `--expose-gc`; peak = max `used_heap_size` sampled per search event): up to 3 / any team — baseline 16 MB, peak 152 MB, end 150 MB, 30 cards (full) in 25.4 s; up to 4 / any team — baseline 130 MB, peak 645 MB, end 643 MB, 30 cards (full) in 516.9 s → **passed** (≤ 1 GB). The heap grows with the run (end ≈ peak: memo and found deals), and is released when the worker ends; the 516.9 s ran alongside other agents' test runs (gate 2: 419.9 s).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven follow-ups from Plan R's final review (stale alternatives, late-snapshot controls, error text on stale, unreadable worker messages, Up-to-4 memory, Find during a refresh, a 5-team must-include test) and ship patch `v0.19.1`.

**Architecture:** Each follow-up is a small, separately reviewable change. An alternative carries its moves _with their sources_ (`DealMove[]`), so the renderer can prune it the same way it prunes a card. The run manager refuses a start while a refresh is in flight, and the renderer re-attaches to main's run after any refused start. Worker `messageerror` and out-of-memory errors get readable messages. The controls prune rule becomes a pure function the hook also applies to a late snapshot. Search results do not change.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4 + shadcn, Vitest (jsdom + Testing Library for component tests), `node:sqlite`, `node:worker_threads`.

**Spec:** `docs/superpowers/specs/2026-10-04-plan-r-follow-ups-design.md` (§1–§8). It amends the multi-team spec `docs/superpowers/specs/2026-09-30-multi-team-trades-design.md` §4.2 and §6.

## Global Constraints

- Branch `fix/plan-r-follow-ups` off `main`; one Conventional Commit per step that says "Commit", with a summary of 50 characters or fewer in the imperative mood. **No `Co-Authored-By` or "Generated with" trailers.**
- Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`**, because it reformats unrelated docs.
- Exact user-facing strings (copy them verbatim):
  - `League data is refreshing — Find again when it finishes` (`REFRESHING`, `src/main/trade/suggestRun.ts`)
  - `Background calculation sent an unreadable update` (`UNREADABLE`, `src/main/engine/runEngine.ts`)
  - `The search ran out of memory — try fewer teams or one partner` (`SEARCH_OUT_OF_MEMORY`, stream only)
  - `Background calculation ran out of memory` (`JOB_OUT_OF_MEMORY`, one-shot jobs)
  - Stale status line with an error: `Search failed: {message} · League data changed — run again`
- Search results must not change. The property and brute-force tests stay green, and `npm run test:budget` must not regress.
- Memory gate (Task 6): peak used heap **≤ 1 GB** at Up to 4 / any team on the real league. If it's above that, or the run crashes, **stop and report to the user** before choosing a remedy.
- Release: `npm version patch` → `0.19.1`. **Ask the user before pushing.**
- Not GUI-verifiable here (WSLg). Say so in the Status block rather than claiming a click-through.

---

### Task 0: Branch

- [ ] **Step 1: Branch off a clean main**

```bash
git checkout main && git status --short && git checkout -b fix/plan-r-follow-ups
```

Expected: no output from `git status --short`. Now on `fix/plan-r-follow-ups`.

---

### Task 1: An alternative keeps the teams its players leave (spec §1)

Today `TradeAlternative.proposal` holds only `{ playerId, to }` per move. After a data change, `dealFromProposal` takes each player's source from the _current_ pool, so a player traded away since the run is sent from his new team. After this task an alternative carries `moves: DealMove[]` (with `from`). Opening it builds the deal from those moves, and a `stale` list prunes the deal first, as a card already does.

**Files:**

- Modify: `src/shared/types.ts` (`TradeAlternative`)
- Modify: `src/main/trade/bridge.ts` (`dealTransfers`, `dealProposal`)
- Modify: `src/main/trade/suggest.ts` (`cardOf`)
- Modify: `tests/main/trade/suggestOracle.ts` (`cycleMoves`, oracle alternatives)
- Modify: `src/renderer/src/lib/tradeBuilder.ts` (`dealFromProposal` → `dealFromMoves`)
- Modify: `src/renderer/src/screens/TradeScreen.tsx` (`openProposal` → `openAlternative`)
- Modify: `src/renderer/src/components/TradeSuggestions.tsx` (prop, key)
- Modify: `tests/fixtures/trade.ts` (`threeTeamSuggestion` alternative)
- Test: `tests/main/trade/bridge.test.ts`, `tests/renderer/lib/tradeBuilder.test.ts`, `tests/renderer/components/TradeScreen.test.tsx`

**Interfaces:**

- Consumes: `DealMove { playerId: string; from: number; to: number }` from `src/shared/deal.ts` (exists); `pruneDeal(deal, pool)` and `dealTeams(moves)` (exist).
- Produces: `TradeAlternative.moves: DealMove[]` (replaces `proposal`); `dealTransfers(me: Team, deal: Deal): DealMove[]` in `bridge.ts`; `dealFromMoves(moves: DealMove[], me: number): BuilderDeal` in `tradeBuilder.ts`; `cycleMoves(me: number, cycle: Cycle): DealMove[]` in `suggestOracle.ts`; `TradeSuggestions` prop `onOpenAlternative: (moves: DealMove[]) => void` (replaces `onOpenProposal`).

- [ ] **Step 1: Write the failing tests**

In `tests/main/trade/bridge.test.ts`, add `dealTransfers` to the `@main/trade/bridge` import. Then, in `it('finds no 2-team deal and every bridge through Three')`, right after the existing `expect(viaC2 && dealProposal(ctx.me, viaC2)).toEqual({ … })` block, add:

```ts
// The same deal with each move's source: hop i leaves the team before it (me first).
expect(viaC2 && dealTransfers(ctx.me, viaC2)).toEqual([
  { playerId: 'a2', from: 1, to: 3 },
  { playerId: 'c2', from: 3, to: 2 },
  { playerId: 'b2', from: 2, to: 1 }
])
```

In `tests/renderer/lib/tradeBuilder.test.ts`, change the import `dealFromProposal,` to `dealFromMoves,` and replace the whole `describe('dealFromProposal (multi-team spec §5.2)', …)` block with:

```ts
describe('dealFromMoves (multi-team spec §5.2, follow-ups §1)', () => {
  it("rebuilds an alternative's deal from its moves, teams in first appearance", () => {
    const { moves } = threeTeamSuggestion().alternatives[0]
    expect(dealFromMoves(moves, 1)).toEqual({
      teams: [2, 3],
      picks: [
        { playerId: '6794', from: 1, to: 2 },
        { playerId: '9509', from: 2, to: 3 },
        { playerId: '5859', from: 3, to: 1 }
      ]
    })
  })

  it('keeps the team the search had a player on, so a stale prune drops a player who moved', () => {
    const { moves } = threeTeamSuggestion().alternatives[0]
    const before = threeTeamPool()
    // a sync moves Bijan from Rival to Tank Mode
    const after = tradePool({
      teams: [
        {
          ...before.teams[0],
          players: before.teams[0].players.filter((p) => p.playerId !== '9509')
        },
        { ...before.teams[1], players: [...before.teams[1].players, bijan] }
      ]
    })
    expect(pruneDeal(dealFromMoves(moves, 1), after).picks).toEqual([
      { playerId: '6794', from: 1, to: 2 },
      { playerId: '5859', from: 3, to: 1 }
    ])
  })
})
```

In `tests/fixtures/trade.ts`, inside `threeTeamSuggestion()`, replace the alternative's `proposal: { moves: [ … ] },` with:

```ts
        moves: [
          { playerId: '6794', from: 1, to: 2 },
          { playerId: '9509', from: 2, to: 3 },
          { playerId: '5859', from: 3, to: 1 }
        ],
```

In `tests/renderer/components/TradeScreen.test.tsx`, in `it('shows a 3-team card with its path, every other team and the other ways')`, replace the expectation

```ts
await waitFor(() =>
  expect(evaluateMock).toHaveBeenCalledWith(2026, threeTeamSuggestion().alternatives[0].proposal)
)
```

with

```ts
await waitFor(() =>
  expect(evaluateMock).toHaveBeenCalledWith(2026, {
    moves: [
      { playerId: '6794', to: 2 },
      { playerId: '9509', to: 3 },
      { playerId: '5859', to: 1 }
    ]
  })
)
```

and add this test right after `it('drops a stale card’s player who left the roster before evaluating it')`:

```tsx
it('drops a stale alternative’s player who left the team it came from', async () => {
  poolMock.mockResolvedValue(threeTeamPool())
  evaluateMock.mockRejectedValue(new Error('Tank Mode gets nobody'))
  openSpotMock.mockResolvedValue({ sides: [null, null, null] })
  const { rerender } = render(<TradeScreen dataVersion={0} />)
  await screen.findByLabelText('Add to I send')
  fireEvent.click(screen.getByText('Find'))
  await flush()
  send({ runId: 7, type: 'cards', cards: [threeTeamSuggestion()] })
  send({ runId: 7, type: 'done', reason: 'complete', progress: { ...PROGRESS, found: 1 } })

  // a sync moves Bijan from Rival to Tank Mode; the same event marks the list stale
  const before = threeTeamPool()
  poolMock.mockResolvedValue(
    tradePool({
      teams: [
        {
          ...before.teams[0],
          players: before.teams[0].players.filter((p) => p.playerId !== '9509')
        },
        { ...before.teams[1], players: [...before.teams[1].players, bijan] }
      ]
    })
  )
  rerender(<TradeScreen dataVersion={1} />)
  await screen.findByLabelText('Add to I send')
  send({ runId: 7, type: 'done', reason: 'stale', progress: { ...PROGRESS, found: 1 } })

  fireEvent.click(screen.getByText('+1 other way ▸'))
  fireEvent.click(screen.getAllByText('Open in builder')[1])
  // not re-homed onto Tank Mode (from = to): Bijan leaves the deal
  expect(evaluateMock).toHaveBeenLastCalledWith(2026, {
    moves: [
      { playerId: '6794', to: 2 },
      { playerId: '5859', to: 1 }
    ]
  })
  expect(await screen.findByText('Tank Mode gets nobody')).toBeTruthy()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/trade/bridge.test.ts tests/renderer/lib/tradeBuilder.test.ts tests/renderer/components/TradeScreen.test.tsx`
Expected: FAIL. `dealTransfers` and `dealFromMoves` are not exported; the fixture's `moves` does not type-check against `TradeAlternative` (vitest still runs; the screen tests fail because `a.proposal` is undefined).

- [ ] **Step 3: Implement**

`src/shared/types.ts`: add `import type { DealMove } from './deal'` below the existing `import type { WaiverType } from './rules'`. Then replace the `proposal` field of `TradeAlternative`:

```ts
export interface TradeAlternative {
  /** The deal hop by hop, each move with the team it leaves — a stale list prunes it (follow-ups §1). */
  moves: DealMove[]
  /** "via Gridiron Gang: James Cook" — the bridge teams and what each sends. */
  label: string
  /** The least happy other team's Δ/week. */
  worstDeltaPerWeek: number
}
```

`src/main/trade/bridge.ts`: add `import type { DealMove } from '@shared/deal'`. Then replace `dealProposal` (and its doc comment) with:

```ts
/** The deal as moves, hop by hop: hop i leaves `teams[i − 1]` (hop 0 leaves me) for `teams[i]` (the last hop comes to me). */
export function dealTransfers(me: Team, deal: Deal): DealMove[] {
  const last = deal.hops.length - 1
  return deal.hops.flatMap((hop, i) =>
    hop.map((s) => ({
      playerId: s.base.playerId,
      from: i === 0 ? me.rosterId : deal.teams[i - 1].rosterId,
      to: i === last ? me.rosterId : deal.teams[i].rosterId
    }))
  )
}

/** The deal as a proposal: its moves without their sources. */
export function dealProposal(me: Team, deal: Deal): TradeProposal {
  return { moves: dealTransfers(me, deal).map(({ playerId, to }) => ({ playerId, to })) }
}
```

`src/main/trade/suggest.ts`: add `dealTransfers` to the `./bridge` import. In `cardOf`, replace `proposal: dealProposal(ctx.me, d),` with `moves: dealTransfers(ctx.me, d),`.

`tests/main/trade/suggestOracle.ts`: add `import type { DealMove } from '@shared/deal'`. Below `cycleProposal`, add:

```ts
/** `cycleProposal` with each move's source: hop i leaves the team before it, hop 0 leaves me. */
export function cycleMoves(me: number, cycle: Cycle): DealMove[] {
  const last = cycle.hops.length - 1
  return cycle.hops.flatMap((hop, i) =>
    hop.map((s) => ({
      playerId: s.base.playerId,
      from: i === 0 ? me : cycle.teams[i - 1].rosterId,
      to: i === last ? me : cycle.teams[i].rosterId
    }))
  )
}
```

Then, in `oracleSuggest`'s alternatives, replace `proposal: cycleProposal(me.rosterId, d),` with `moves: cycleMoves(me.rosterId, d),`.

`src/renderer/src/lib/tradeBuilder.ts`: replace `dealFromProposal` (and its doc comment) with:

```ts
/** An alternative's deal (spec §5.2 "Open in builder"): its moves as picks, teams in first appearance. */
export function dealFromMoves(moves: DealMove[], me: number): BuilderDeal {
  return {
    teams: dealTeams(moves).filter((t) => t !== me),
    picks: moves.map(({ playerId, from, to }) => ({ playerId, from, to }))
  }
}
```

(`DealMove` and `dealTeams` are already imported from `@shared/deal`.)

`src/renderer/src/screens/TradeScreen.tsx`: change the `dealFromProposal,` import to `dealFromMoves,`. Remove `TradeProposal,` from the `@shared/types` import if nothing else uses it, and add `import type { DealMove } from '@shared/deal'` (or add `type DealMove` to the existing `@shared/deal` import of `proposalOf`). Replace `openProposal` with:

```tsx
/** Multi-team spec §5.2: an alternative carries only its moves, so it is evaluated on opening. */
const openAlternative = (moves: DealMove[]): void => {
  if (!pool) return
  const built = dealFromMoves(moves, pool.me.rosterId)
  // Follow-ups §1: on a stale list, drop a player who has left the team the search had him on.
  const d = suggest.run?.status === 'stale' ? pruneDeal(built, pool) : built
  changeDeal(d)
  void evaluate(d)
  scrollToBuilder()
}
```

Then change `onOpenProposal={openProposal}` to `onOpenAlternative={openAlternative}`.

`src/renderer/src/components/TradeSuggestions.tsx`: replace `TradeProposal,` in the `@shared/types` import with nothing if it becomes unused, and add `import type { DealMove } from '@shared/deal'`. Rename the prop in both places (`SuggestionRow`'s props and `TradeSuggestionsProps`), together with its destructuring and its pass-through at the `<SuggestionRow … />` call:

```tsx
  onOpenAlternative: (moves: DealMove[]) => void
```

The button becomes `onClick={() => onOpenAlternative(a.moves)}`, and the key:

```ts
/** An alternative is its moves; labels can repeat when two players share a name. */
function alternativeKey(a: TradeAlternative): string {
  return a.moves.map((m) => `${m.playerId}>${m.to}`).join('+')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main/trade tests/renderer && npm run typecheck`
Expected: PASS, including `suggestProperty.test.ts` (the search and the oracle build the same `moves`), and typecheck clean. `grep -rn "dealFromProposal\|onOpenProposal\|a\.proposal\|alternatives\[0\]\.proposal" src tests` prints nothing.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/shared/types.ts src/main/trade/bridge.ts src/main/trade/suggest.ts tests/main/trade/suggestOracle.ts src/renderer/src/lib/tradeBuilder.ts src/renderer/src/screens/TradeScreen.tsx src/renderer/src/components/TradeSuggestions.tsx tests/fixtures/trade.ts tests/main/trade/bridge.test.ts tests/renderer/lib/tradeBuilder.test.ts tests/renderer/components/TradeScreen.test.tsx
git add -A src tests
git commit -m "fix(trade): keep an alternative's original teams"
```

---

### Task 2: Controls restored from a late snapshot are pruned (spec §2)

**Files:**

- Modify: `src/renderer/src/lib/tradeView.ts` (`pruneControls`)
- Modify: `src/renderer/src/lib/useSuggestRun.ts`
- Test: `tests/renderer/lib/tradeView.test.ts`, `tests/renderer/components/TradeScreen.test.tsx`

**Interfaces:**

- Consumes: `SuggestControls`, `DEFAULT_CONTROLS`, `controlsOf` (exist in `tradeView.ts`).
- Produces: `pruneControls(controls: SuggestControls, pool: TradePool): SuggestControls` in `tradeView.ts`.

- [ ] **Step 1: Write the failing tests**

In `tests/renderer/lib/tradeView.test.ts`, add `pruneControls` to the `@/lib/tradeView` import and `tradePool` to the `../../fixtures/trade` import. Then add inside `describe('suggestion controls (multi-team spec §5.2)', …)`:

```ts
it('forgets a focus player or team that is gone and caps Up to at the league size', () => {
  // tradePool(): me holds Barkley (4866); one other team, Rival (2)
  const gone = {
    ...DEFAULT_CONTROLS,
    focusKind: 'give' as const,
    focusGive: 'gone',
    maxTeams: 4,
    mustInclude: 9
  }
  expect(pruneControls(gone, tradePool())).toEqual({
    ...gone,
    focusGive: '',
    maxTeams: 2,
    mustInclude: null
  })
  const kept = { ...gone, focusGive: '4866', maxTeams: 2, mustInclude: 2 }
  expect(pruneControls(kept, tradePool())).toEqual(kept)
})
```

In `tests/renderer/components/TradeScreen.test.tsx`, add `SuggestSnapshot` to the `@shared/types` type import. Then add this test next to the existing re-attach test (the one with `snapshotMock.mockResolvedValue({ runId: 3, … })`):

```tsx
it('prunes controls restored from a snapshot that answers after the pool', async () => {
  let answer: (snap: SuggestSnapshot | null) => void = () => undefined
  snapshotMock.mockReturnValue(
    new Promise<SuggestSnapshot | null>((resolve) => {
      answer = resolve
    })
  )
  render(<TradeScreen dataVersion={0} />)
  await screen.findByLabelText('Add to I send') // the pool is in, and pruned what it could
  await act(async () =>
    answer({
      runId: 3,
      query: {
        season: 2026,
        focus: { give: 'gone' },
        stance: 'overpay',
        maxTeams: 4,
        mustInclude: 9
      },
      cards: [],
      progress: PROGRESS,
      status: 'stopped',
      message: null
    })
  )
  expect((screen.getByLabelText('Stance') as HTMLSelectElement).value).toBe('overpay')
  fireEvent.click(screen.getByText('Find'))
  expect(startMock).toHaveBeenLastCalledWith({
    season: 2026,
    focus: null,
    stance: 'overpay',
    maxTeams: 2,
    mustInclude: null
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/lib/tradeView.test.ts tests/renderer/components/TradeScreen.test.tsx`
Expected: FAIL. `pruneControls` is not exported; the screen test's start carries `focus: { give: 'gone' }`, `maxTeams: 4`, `mustInclude: 9`.

- [ ] **Step 3: Implement**

`src/renderer/src/lib/tradeView.ts`: add `TradePool` to the `@shared/types` type import if it is not there. Below `controlsOf`, add:

```ts
/** After a pool reload: forget a focus player or team that is gone; cap "Up to" at the league size. */
export function pruneControls(c: SuggestControls, pool: TradePool): SuggestControls {
  return {
    ...c,
    focusGive: pool.me.players.some((p) => p.playerId === c.focusGive) ? c.focusGive : '',
    mustInclude:
      c.mustInclude !== null && pool.teams.some((t) => t.rosterId === c.mustInclude)
        ? c.mustInclude
        : null,
    maxTeams: Math.max(2, Math.min(c.maxTeams, pool.teams.length + 1))
  }
}
```

`src/renderer/src/lib/useSuggestRun.ts`: add `pruneControls` to the `@/lib/tradeView` import. Below the `starts` ref, add:

```ts
/** The pool `prune` last saw: a snapshot that answers after it is pruned against it too. */
const lastPool = useRef<TradePool | null>(null)
```

In the snapshot `.then`, replace `setControls(controlsOf(snap.query))` with:

```ts
const restored = controlsOf(snap.query)
setControls(lastPool.current === null ? restored : pruneControls(restored, lastPool.current))
```

Replace `prune` with:

```ts
const prune = useCallback((pool: TradePool): void => {
  lastPool.current = pool
  setControls((c) => pruneControls(c, pool))
}, [])
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer && npm run typecheck:web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/src/lib/tradeView.ts src/renderer/src/lib/useSuggestRun.ts tests/renderer/lib/tradeView.test.ts tests/renderer/components/TradeScreen.test.tsx
git add src/renderer/src/lib/tradeView.ts src/renderer/src/lib/useSuggestRun.ts tests/renderer/lib/tradeView.test.ts tests/renderer/components/TradeScreen.test.tsx
git commit -m "fix(trade): prune controls from a late snapshot"
```

---

### Task 3: An errored run keeps its error when it goes stale (spec §3)

**Files:**

- Modify: `src/renderer/src/lib/tradeView.ts` (`suggestStatusLine`)
- Test: `tests/renderer/lib/tradeView.test.ts`, `tests/main/trade/suggestRun.test.ts`

**Interfaces:**

- Consumes: `SuggestSnapshot.message` (kept by `applyUpdate` on `done`).
- Produces: nothing new.

- [ ] **Step 1: Write the tests**

In `tests/renderer/lib/tradeView.test.ts`, in `it('reads each state')`, right after the existing `stale` expectation, add:

```ts
// an errored run that went stale keeps its error
expect(suggestStatusLine(snap({ status: 'stale', message: 'boom' }))).toBe(
  'Search failed: boom · League data changed — run again'
)
```

In `tests/main/trade/suggestRun.test.ts`, add inside the top-level `describe`:

```ts
it('keeps an errored run’s message when it goes stale', () => {
  const { runs, streams } = setup()
  runs.start(QUERY)
  streams[0].push({ type: 'error', message: 'boom' })
  runs.stale()
  expect(runs.snapshot()).toMatchObject({ status: 'stale', message: 'boom' })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run tests/renderer/lib/tradeView.test.ts tests/main/trade/suggestRun.test.ts`
Expected: the status line test FAILS (it reads `League data changed — run again`). The run-manager test PASSES already; it pins the rule the status line relies on.

- [ ] **Step 3: Implement**

In `suggestStatusLine`, replace the `stale` case:

```ts
    case 'stale':
      return snap.message === null
        ? 'League data changed — run again'
        : `Search failed: ${snap.message} · League data changed — run again`
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/lib/tradeView.test.ts tests/main/trade/suggestRun.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/renderer/src/lib/tradeView.ts tests/renderer/lib/tradeView.test.ts tests/main/trade/suggestRun.test.ts
git add src/renderer/src/lib/tradeView.ts tests/renderer/lib/tradeView.test.ts tests/main/trade/suggestRun.test.ts
git commit -m "fix(trade): keep the error on a stale search line"
```

---

### Task 4: Find during a league refresh is refused; the list stays (spec §6)

Every sync step that succeeds marks the run stale, so a Find during a refresh gets stopped a few seconds later. Main now refuses the start **before** it stops anything. Today the renderer clears the shown run on any failed start, so it now re-attaches to main's run instead.

**Files:**

- Modify: `src/main/trade/suggestRun.ts`
- Modify: `src/main/ipc/handlers.ts` (wire `refreshing`)
- Modify: `src/renderer/src/lib/useSuggestRun.ts` (`find`'s catch)
- Test: `tests/main/trade/suggestRun.test.ts`, `tests/renderer/components/TradeScreen.test.tsx`

**Interfaces:**

- Consumes: `inFlight` in `handlers.ts` (the module-level refresh promise, `null` when idle).
- Produces: `SuggestRunDeps.refreshing(): boolean`; `export const REFRESHING` in `suggestRun.ts`.

- [ ] **Step 1: Write the failing tests**

In `tests/main/trade/suggestRun.test.ts`, change the import to `import { REFRESHING, suggestRuns } from '@main/trade/suggestRun'`. Change `function setup(): {` to `function setup(refreshing: () => boolean = () => false): {`, and add `refreshing,` to the deps object passed to `suggestRuns({ … })` (next to `send`). Then add:

```ts
it('refuses a start while league data refreshes, before stopping anything', () => {
  let refreshing = false
  const { runs, streams, sent } = setup(() => refreshing)
  const first = runs.start(QUERY)
  streams[0].push({ type: 'cards', cards: [tradeSuggestion()] })
  refreshing = true
  expect(() => runs.start({ ...QUERY, maxTeams: 2 })).toThrow(REFRESHING)
  expect(streams).toHaveLength(1)
  expect(streams[0].stopped).toBe(false)
  expect(runs.snapshot()).toMatchObject({ runId: first, query: QUERY, status: 'running' })
  expect(runs.snapshot()?.cards).toHaveLength(1)
  expect(sent.some((e) => e.type === 'done')).toBe(false)
  refreshing = false
  expect(runs.start(QUERY)).toBe(first + 1)
})
```

In `tests/renderer/components/TradeScreen.test.tsx`, add:

```tsx
it('keeps the shown list when a start is refused during a refresh', async () => {
  render(<TradeScreen dataVersion={0} />)
  await screen.findByLabelText('Add to I send')
  fireEvent.click(screen.getByText('Find'))
  await flush()
  send({ runId: 7, type: 'cards', cards: [tradeSuggestion()] })
  send({ runId: 7, type: 'done', reason: 'complete', progress: { ...PROGRESS, found: 1 } })

  startMock.mockRejectedValueOnce(
    new Error(
      "Error invoking remote method 'trade:suggestStart': Error: League data is refreshing — Find again when it finishes"
    )
  )
  // main still holds run 7 — by now marked stale by the refresh
  snapshotMock.mockResolvedValue({
    runId: 7,
    query: { season: 2026, focus: null, stance: 'fair', maxTeams: 3, mustInclude: null },
    cards: [tradeSuggestion()],
    progress: { ...PROGRESS, found: 1 },
    status: 'stale',
    message: null
  })
  fireEvent.click(screen.getByText('Find'))
  expect(
    await screen.findByText('League data is refreshing — Find again when it finishes')
  ).toBeTruthy()
  expect(await screen.findByText('with Rival')).toBeTruthy()
  expect(screen.getByText('League data changed — run again')).toBeTruthy()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/trade/suggestRun.test.ts tests/renderer/components/TradeScreen.test.tsx`
Expected: FAIL. `REFRESHING` is not exported (the refusal is never thrown), and the screen shows no `with Rival` after the refused start.

- [ ] **Step 3: Implement**

`src/main/trade/suggestRun.ts`, below the imports:

```ts
/** Follow-ups §6: every sync step marks the run stale, so a start during a refresh is refused. */
export const REFRESHING = 'League data is refreshing — Find again when it finishes'
```

Add to `SuggestRunDeps`:

```ts
  /** A league refresh is in flight: its steps would mark a new run stale at once. */
  refreshing(): boolean
```

At the top of `start(query)`, before `end('stopped')`:

```ts
// Refused before anything stops: the shown run and its cards stay as they are.
if (deps.refreshing()) throw new Error(REFRESHING)
```

Update the `start` doc in `SuggestRuns` to: `/** Starts a run, stopping the active one (\`stopped\`); returns the new run's id. Throws \`REFRESHING\` during a refresh. */`

`src/main/ipc/handlers.ts`: in `suggestRuns({ … })`, add after `send`:

```ts
    refreshing: () => inFlight !== null,
```

`src/renderer/src/lib/useSuggestRun.ts`: replace the `.catch` of `find` with:

```ts
      .catch((err) => {
        if (token !== starts.current) return
        setStartError(errorMessage(err))
        // Follow-ups §6: a refused start leaves main's run as it was — show and follow it again.
        following.current = null
        setRun(null)
        void api.trade
          .suggestSnapshot()
          .then((snap) => {
            if (token !== starts.current || snap === null) return
            following.current = snap.runId
            setRun(snap)
          })
          .catch(() => undefined)
      })
```

(The controls are not touched: they stay what the user set.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main tests/renderer && npm run typecheck`
Expected: PASS. The existing "a start that fails shows under the controls" behavior is unchanged when main has no run (`snapshotMock` resolves `null` by default).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/trade/suggestRun.ts src/main/ipc/handlers.ts src/renderer/src/lib/useSuggestRun.ts tests/main/trade/suggestRun.test.ts tests/renderer/components/TradeScreen.test.tsx
git add src/main/trade/suggestRun.ts src/main/ipc/handlers.ts src/renderer/src/lib/useSuggestRun.ts tests/main/trade/suggestRun.test.ts tests/renderer/components/TradeScreen.test.tsx
git commit -m "fix(trade): refuse Find while league data refreshes"
```

---

### Task 5: Unreadable worker messages and out-of-memory workers (spec §4)

**Files:**

- Modify: `src/main/engine/runEngine.ts`
- Create: `tests/main/engine/runEngine.test.ts`

**Interfaces:**

- Produces: `export const UNREADABLE`, `SEARCH_OUT_OF_MEMORY`, `JOB_OUT_OF_MEMORY` in `runEngine.ts`.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/engine/runEngine.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEmitter } from 'node:events'
import {
  JOB_OUT_OF_MEMORY,
  runEngine,
  runEngineStream,
  SEARCH_OUT_OF_MEMORY,
  UNREADABLE
} from '@main/engine/runEngine'
import type { SuggestUpdate, TradeSuggestQuery } from '@shared/types'

type FakeWorker = EventEmitter & { terminated: boolean }

const { workers } = vi.hoisted(() => ({ workers: [] as FakeWorker[] }))

/** A worker that never runs: the test emits its events. */
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  class Worker extends EventEmitter {
    terminated = false
    constructor() {
      super()
      workers.push(this)
    }
    terminate(): Promise<number> {
      this.terminated = true
      return Promise.resolve(0)
    }
  }
  return { Worker }
})

const QUERY: TradeSuggestQuery = {
  season: 2026,
  focus: null,
  stance: 'fair',
  maxTeams: 3,
  mustInclude: null
}

const outOfMemory = (): Error =>
  Object.assign(
    new Error('Worker terminated due to reaching memory limit: JS heap out of memory'),
    {
      code: 'ERR_WORKER_OUT_OF_MEMORY'
    }
  )

beforeEach(() => {
  workers.length = 0
})

describe('runEngineStream on a failing worker (follow-ups §4)', () => {
  const start = (): SuggestUpdate[] => {
    const updates: SuggestUpdate[] = []
    runEngineStream('db', 'L', { kind: 'tradeSuggest', query: QUERY }, (u) => updates.push(u))
    return updates
  }

  it('turns an unreadable message into an error and ends the worker', () => {
    const updates = start()
    workers[0].emit('messageerror', new Error('could not deserialize'))
    expect(updates).toEqual([{ type: 'error', message: UNREADABLE }])
    expect(workers[0].terminated).toBe(true)
    workers[0].emit('exit', 1) // nothing more after the end
    expect(updates).toHaveLength(1)
  })

  it('words a worker that ran out of memory', () => {
    const updates = start()
    workers[0].emit('error', outOfMemory())
    expect(updates).toEqual([{ type: 'error', message: SEARCH_OUT_OF_MEMORY }])
    expect(workers[0].terminated).toBe(true)
  })

  it('keeps any other worker error as it is', () => {
    const updates = start()
    workers[0].emit('error', new Error('boom'))
    expect(updates).toEqual([{ type: 'error', message: 'boom' }])
  })
})

describe('runEngine on a failing worker (follow-ups §4)', () => {
  it('rejects on an unreadable message and ends the worker', async () => {
    const result = runEngine('db', 'L', { kind: 'waiverAdds', season: 2026 })
    workers[0].emit('messageerror', new Error('could not deserialize'))
    await expect(result).rejects.toThrow(UNREADABLE)
    expect(workers[0].terminated).toBe(true)
  })

  it('words a worker that ran out of memory', async () => {
    const result = runEngine('db', 'L', { kind: 'waiverAdds', season: 2026 })
    workers[0].emit('error', outOfMemory())
    await expect(result).rejects.toThrow(JOB_OUT_OF_MEMORY)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/engine/runEngine.test.ts`
Expected: FAIL. The constants are not exported; on `messageerror` nothing happens.

- [ ] **Step 3: Implement**

In `src/main/engine/runEngine.ts`, below `workerPath()`:

```ts
/** Follow-ups §4: a worker update that failed to deserialize. */
export const UNREADABLE = 'Background calculation sent an unreadable update'
/** The suggestion search hit the worker's heap limit; it is the only search sized by the user. */
export const SEARCH_OUT_OF_MEMORY = 'The search ran out of memory — try fewer teams or one partner'
export const JOB_OUT_OF_MEMORY = 'Background calculation ran out of memory'

function outOfMemory(err: Error): boolean {
  return (err as NodeJS.ErrnoException).code === 'ERR_WORKER_OUT_OF_MEMORY'
}
```

In `runEngine`, replace the `error` handler and add `messageerror`:

```ts
worker.on('messageerror', () => settle(() => reject(new Error(UNREADABLE))))
worker.on('error', (err) =>
  settle(() => reject(outOfMemory(err) ? new Error(JOB_OUT_OF_MEMORY) : err))
)
```

In `runEngineStream`, replace the `error` handler with a shared `fail` and add `messageerror`:

```ts
const fail = (message: string): void => {
  if (over) return
  onUpdate({ type: 'error', message })
  end()
}
worker.on('messageerror', () => fail(UNREADABLE))
worker.on('error', (err) => fail(outOfMemory(err) ? SEARCH_OUT_OF_MEMORY : err.message))
```

Update the `runEngineStream` doc comment's second sentence to: `A worker error, an unreadable message or an unexpected exit becomes an \`error\` update; after \`stop()\` nothing more is delivered.`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main/engine && npm run typecheck:node`
Expected: PASS (`jobs.test.ts` included).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/engine/runEngine.ts tests/main/engine/runEngine.test.ts
git add src/main/engine/runEngine.ts tests/main/engine/runEngine.test.ts
git commit -m "fix(engine): report unreadable and out-of-memory workers"
```

---

### Task 6: A 5-team must-include case against the brute force (spec §7)

k = 5 is the first size where the must-include team can sit in the middle bridge slot. The code is already correct there: a prototype on 2026-10-04 found seeds 1–5 all equal to the brute force. This test guards it. It takes about 3 s: closing team 2, my singles against their singles.

**Files:**

- Modify: `tests/fixtures/synthetic.ts` (`searchLeague` team count)
- Test: `tests/main/trade/bridge.test.ts`

**Interfaces:**

- Produces: `searchLeague(seed: number, teamCount = 4): SyntheticLeague`.

- [ ] **Step 1: Give `searchLeague` a team count**

In `tests/fixtures/synthetic.ts`, change `export function searchLeague(seed: number): SyntheticLeague {` to `export function searchLeague(seed: number, teamCount = 4): SyntheticLeague {`, `generateLeague(seed, 4)` to `generateLeague(seed, teamCount)`, and `numTeams: 4` to `numTeams: teamCount` (leave `playoffTeams: 4`). Add a sentence to its doc comment: `\`teamCount\` 5 lets a test reach a 5-team deal.`

- [ ] **Step 2: Write the test**

In `tests/main/trade/bridge.test.ts`, add after the `describe('dealsAt equals a brute force (prunes are exact)', …)` block:

```ts
describe('dealsAt with the must-include team in any bridge slot (follow-ups §7)', () => {
  it('equals the brute force on 5-team deals', () => {
    const { build } = syntheticBuild(searchLeague(1, 5))
    const cache: EvalCache = new Map()
    const ctx = searchContext(build, 3)
    const c = ctx.others.find((t) => t.rosterId === 2)
    if (!c) throw new Error('no team 2')
    const mine = build.rosters.get(ctx.me.rosterId) ?? []
    const theirs = build.rosters.get(c.rosterId) ?? []
    /** Deals with team 3 in bridge slot 0, 1 (the middle) and 2. */
    const slots = [0, 0, 0]
    for (const x of mine) {
      for (const z of theirs) {
        const side: MySide = { x: [x], z: [z], c, key: mySideKey([x], [z], c) }
        const deals = drain(dealsAt(ctx, side, 5))
        for (const d of deals) slots[d.teams.findIndex((t) => t.rosterId === 3)]++
        expect({ side: side.key, deals: deals.map(cycleKey).sort() }).toEqual({
          side: side.key,
          deals: oracleDeals(build, side, 5, 3, cache)
        })
      }
    }
    // The test reaches every slot, the middle one included — it cannot pass by checking nothing.
    expect(slots.every((n) => n > 0)).toBe(true)
  }, 120_000)
})
```

- [ ] **Step 3: Run it**

Run: `npx vitest run tests/main/trade/bridge.test.ts`
Expected: PASS in a few seconds. If the `slots` assertion fails (seed 1 has a deal-free slot after the fixture change), try seeds 2, 3, 5 in that order. Use the first one that passes and change the `searchLeague(1, 5)` call to match. An equality failure is a real bug in `dealsAt`: stop and report it.

- [ ] **Step 4: Confirm the other synthetic tests are unchanged**

Run: `npx vitest run tests/main/trade`
Expected: PASS. The default `teamCount` 4 keeps every existing league identical.

- [ ] **Step 5: Commit**

```bash
npx prettier --write tests/fixtures/synthetic.ts tests/main/trade/bridge.test.ts
git add tests/fixtures/synthetic.ts tests/main/trade/bridge.test.ts
git commit -m "test(trade): check 5-team must-include deals"
```

---

### Task 7: Worker memory at Up to 4 — measurement gate (spec §5)

**Files:**

- Create (throwaway, never committed): `tests/zz-memory.test.ts`
- Modify: this plan (Status block)

- [ ] **Step 1: Copy the dev DB**

(`$SCRATCH` = your scratchpad directory.)

```bash
mkdir -p "$SCRATCH" && cp ~/.config/FantasyCompanion/companion.db "$SCRATCH/real.db"
```

- [ ] **Step 2: Write the throwaway measurement**

Create `tests/zz-memory.test.ts`:

```ts
import { appendFileSync } from 'node:fs'
import { getHeapStatistics } from 'node:v8'
import { it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { lineupBuildFromDb } from '@main/engine/lineupFromDb'
import { suggestDeals } from '@main/trade/suggest'
import type { TradeSuggestQuery } from '@shared/types'

const mb = (bytes: number): string => `${Math.round(bytes / 2 ** 20)} MB`
const used = (): number => getHeapStatistics().used_heap_size
const gc = (globalThis as { gc?: () => void }).gc

it('measures the heap of the N-team search on the real league', () => {
  const db = openDatabase(`${process.env.SCRATCH}/real.db`)
  migrate(db)
  const leagueId = getSetting(db, SETTING_ACTIVE_LEAGUE)
  if (!leagueId) throw new Error('no active league in the copy')
  const build = lineupBuildFromDb(db, leagueId, 2026)
  db.close()
  for (const maxTeams of [3, 4]) {
    const query: TradeSuggestQuery = {
      season: 2026,
      focus: null,
      stance: 'fair',
      maxTeams,
      mustInclude: null
    }
    gc?.()
    const base = used()
    let peak = base
    let cards = 0
    let end = 'unfinished'
    const t0 = performance.now()
    const search = suggestDeals(build, query)
    for (let step = search.next(); ; step = search.next()) {
      peak = Math.max(peak, used())
      if (step.done) {
        end = step.value
        break
      }
      if (step.value.type === 'card') cards++
    }
    const final = used()
    // vitest hides console output of passing tests: write the line to a file instead.
    appendFileSync(
      `${process.env.SCRATCH}/memory.txt`,
      `up to ${maxTeams}, any team: baseline ${mb(base)} · peak ${mb(peak)} · end ${mb(final)} · ` +
        `${cards} cards (${end}) in ${((performance.now() - t0) / 1000).toFixed(1)} s · gc ${gc ? 'on' : 'off'}\n`
    )
  }
}, 3_600_000)
```

- [ ] **Step 3: Run it**

Run in the background (Up to 4 took ~420 s at gate 2):

```bash
NODE_OPTIONS=--expose-gc SCRATCH=<scratchpad> npx vitest run tests/zz-memory.test.ts
```

Read the two lines from `<scratchpad>/memory.txt`, then `rm tests/zz-memory.test.ts`. `git status --short` must not list it.

- [ ] **Step 4: The gate**

- **Peak at Up to 4 ≤ 1 GB**: write both lines into this plan's Status block, then commit:

```bash
npx prettier --write docs/superpowers/plans/2026-10-04-plan-s-plan-r-follow-ups.md
git add docs/superpowers/plans/2026-10-04-plan-s-plan-r-follow-ups.md
git commit -m "docs(plan): record up-to-4 search memory"
```

- **Peak above 1 GB, or the run crashes**: stop. Report the two lines to the user with the candidate remedies from spec §5 (a memo size cap, `resourceLimits` on the worker, refusing Up to 4 on large leagues), and wait for their decision.

---

### Task 8: Docs, spec amendment, verification, release

**Files:**

- Modify: `docs/reference/value-and-signals.md`
- Modify: `docs/superpowers/specs/2026-09-30-multi-team-trades-design.md` (§4.2, §6)
- Modify: this plan (Status block)

- [ ] **Step 1: Amend the multi-team spec**

In §4.2's channel table, change the `trade:suggestStart(query) → runId` row's "Does" cell to `Starts a run; stops the previous one (\`stopped\`). Refused during a league refresh (amended 2026-10-04).` Below the **Stale data.** bullet, add:

```md
- **During a refresh** (amended 2026-10-04, Plan S): `trade:suggestStart` is refused while a league refresh is in flight — "League data is refreshing — Find again when it finishes" — before anything stops; the renderer then re-attaches to main's run (snapshot), so the shown list stays.
```

In the §6 error table, add a row after `Sync during or after a run`:

```md
| Find during a refresh | Refused with "League data is refreshing — Find again when it finishes"; the shown run is unchanged (§4.2). |
```

- [ ] **Step 2: Update the reference doc**

In `docs/reference/value-and-signals.md`:

- **Streaming** paragraph (the one starting `**Streaming** (v0.19.0, the suggestion run; multi-team spec §4)`): replace `or \`error { message }\` (a search error, a worker error or an unexpected exit; the cards stay)`with`or \`error { message }\` (a search error, a worker error, an unreadable worker message or an unexpected exit; a worker out of memory reads "The search ran out of memory — try fewer teams or one partner"; the cards stay)`. After the sentence ending `instead of showing the card's verdict.`, add: `A start during a league refresh is refused ("League data is refreshing — Find again when it finishes", v0.19.1) before anything stops, and the screen re-attaches to main's run, so the shown list stays.`
- **Suggestions** item (`5. **Suggestions**`): replace `` `stale` — `League data changed — run again` `` with `` `stale` — `League data changed — run again` (an errored run that went stale: `Search failed: {message} · League data changed — run again`) ``. Replace `an alternative carries only its proposal, so it is evaluated on opening, and on a \`stale\` list the card's deal is pruned to the current rosters and evaluated afresh too`with`an alternative carries only its moves (each with the team it leaves), so it is evaluated on opening; on a \`stale\` list a card's or an alternative's deal is pruned to the current rosters first — a player who left the team the search had him on drops out — and evaluated afresh`. Also add, after `The card re-attaches to the run after a tab switch (see Streaming).`: `Controls restored that way are pruned like a pool reload's (a focus player or team that is gone is forgotten, Up to capped at the league size).`

```bash
npx prettier --write docs/reference/value-and-signals.md docs/superpowers/specs/2026-09-30-multi-team-trades-design.md
git add docs/reference/value-and-signals.md docs/superpowers/specs/2026-09-30-multi-team-trades-design.md
git commit -m "docs: document the plan R follow-ups"
```

- [ ] **Step 3: Final verification**

Run: `npm run typecheck && npm run lint && npm test && npm run test:budget`
Expected: all green. Note the test count and the budget lines. The two-team budgets stay under 1 s and the synthetic "up to 3" first card stays under `FIRST_CARD_MS` (8 000).

Run `npm run dev` with the Bash tool's `run_in_background`, check the log for main-process errors, then stop it. If WSLg can't show the window, say so in the Status block. Find-during-refresh, stale alternatives and the late snapshot are then covered by tests only.

- [ ] **Step 4: Merge and tag**

```bash
git checkout main && git merge --no-ff fix/plan-r-follow-ups -m "merge: fix/plan-r-follow-ups (plan S)"
npm version patch -m "build: bump version to %s"
```

Expected: `package.json` at `0.19.1`, tag `v0.19.1`. **Ask the user before** `git push --follow-tags`, which triggers the Windows release workflow into a draft release.

- [ ] **Step 5: Status block**

Replace this plan's `**Status:**` line with: completion date, merge and tag hashes, the test count, the budget lines, the Task 7 memory lines, and what was not verified (GUI). Then:

```bash
npx prettier --write docs/superpowers/plans/2026-10-04-plan-s-plan-r-follow-ups.md
git add docs/superpowers/plans/2026-10-04-plan-s-plan-r-follow-ups.md
git commit -m "docs(plan): mark plan S complete"
```

---

## Self-review against the spec

| Spec                                                                                                                    | Where         |
| ----------------------------------------------------------------------------------------------------------------------- | ------------- |
| §1 alternatives keep their original teams (`moves: DealMove[]`, `dealTransfers`, `dealFromMoves`, stale prune, row key) | Task 1        |
| §2 late-snapshot controls pruned (`pruneControls`, last pool ref)                                                       | Task 2        |
| §3 stale line keeps the error                                                                                           | Task 3        |
| §4 `messageerror` in both runners; out-of-memory wording (search vs one-shot)                                           | Task 5        |
| §5 memory at Up to 4, 1 GB gate, stop and report above it                                                               | Task 7        |
| §6 refresh refusal in the run manager (before any stop), handler wiring, renderer re-attach                             | Task 4        |
| §6 spec amendment (multi-team §4.2, §6)                                                                                 | Task 8 Step 1 |
| §7 5-team must-include brute-force case reaching every bridge slot                                                      | Task 6        |
| §8 TDD per fix, full suite + typecheck + lint + budget, dev start, docs, `v0.19.1`, ask before push                     | Tasks 1–6, 8  |
