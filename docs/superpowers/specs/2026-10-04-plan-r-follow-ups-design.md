# Plan R follow-ups — design

**Date:** 2026-10-04 · **Status:** approved 2026-10-04 · **Release:** patch `v0.19.1` (Plan S)

**Source:** the follow-ups in Plan R's Status line (`docs/superpowers/plans/2026-10-02-plan-r-multi-team-search.md`), from its final review. **Amends:** the multi-team spec (`2026-09-30-multi-team-trades-design.md`) §4.2 and §6 — see §6 here (the "Find during a refresh" rule).

No new feature: seven fixes, one measurement, one test. Search results do not change.

## 1. A stale alternative keeps its original teams

**Today.** `TradeAlternative.proposal` holds only `{ playerId, to }` per move. `dealFromProposal` (renderer) looks up each player's source team in the current pool. After a data change (status `stale`), a player traded away since the run is pulled from his new team, which gives a deal the search never proposed.

**Change.**

- `src/shared/types.ts`: `TradeTransfer = TradeMove & { from: number }`. `TradeAlternative.proposal` is replaced by `moves: TradeTransfer[]`. `TradeProposal` and `trade:evaluate` stay as they are.
- `src/main/trade/bridge.ts`: a `dealTransfers(me, deal)` next to `dealProposal`, using the same hop order. Hop `i` leaves `teams[i - 1]` (hop 0 leaves me) and goes to `teams[i]` (the last hop goes to me). `suggest.ts` `cardOf` fills `moves` from it.
- Renderer: `dealFromProposal` is replaced by `dealFromTransfers(moves, me)`. Picks are the moves as they are, teams in order of first appearance, me left out. It needs no pool lookup.
- `TradeScreen.openProposal` matches `openSuggestion`: when the run is `stale` it applies `pruneDeal(deal, pool)` first. The deal is evaluated in both cases, since an alternative carries no evaluation.
- `TradeSuggestions` keys alternative rows on `moves`, not `proposal.moves`.

## 2. Controls restored from a late snapshot are pruned

**Today.** `useSuggestRun.prune(pool)` runs when the pool loads. A `suggestSnapshot()` answer that arrives later sets `controlsOf(snap.query)` without pruning. A focus player who has left my roster, or a team that is gone, can stay selected, and "Up to" can be above the league size.

**Change.** The prune rule becomes a pure `pruneControls(controls, pool)` in `src/renderer/src/lib/tradeView.ts`, which `prune` calls. The hook keeps the last pool it was given in a ref. The snapshot path sets `pruneControls(controlsOf(snap.query), pool)` when a pool is known, and `controlsOf(snap.query)` otherwise, since the later `prune` call then handles it.

## 3. An errored run keeps its error when it goes stale

**Today.** `stale()` turns an `error` run into `stale`. `applyUpdate` keeps `message`, but `suggestStatusLine('stale')` ignores it, so the error text disappears.

**Change.** Only the status line. `stale` with `message !== null` reads `Search failed: <message> · League data changed — run again`. Without a message it stays `League data changed — run again`. The run manager is unchanged.

## 4. Worker messages that cannot be read

**Today.** `runEngineStream` and `runEngine` handle `message`, `error` and `exit`, but not `messageerror`. An update that fails to deserialize is dropped, and the run stays `running`.

**Change.**

- `runEngineStream`: `messageerror` → `onUpdate({ type: 'error', message: UNREADABLE })` and end the worker, as `error` does.
- `runEngine`: `messageerror` → reject with the same text.
- `UNREADABLE` = `Background calculation sent an unreadable update`.

**Out of memory.** In both functions, a worker `error` whose `code` is `ERR_WORKER_OUT_OF_MEMORY` becomes `The search ran out of memory — try fewer teams or one partner`. Any other error keeps its own message.

## 5. Worker memory at Up to 4 (measurement)

**Method.** Same setup as Plan R gate 2: a throwaway `tests/zz-memory.test.ts` (never committed) on a fresh copy of the dev DB, the user's real league. It drains `suggestDeals` for **Up to 4 / any team** and **Up to 3 / any team** (fair stance, no focus). On every progress event it samples `v8.getHeapStatistics().used_heap_size`, then records the peak, the final value and the elapsed time. A forced GC first (`--expose-gc`, when available) gives a clean baseline, which is recorded too.

**Gate.** If the peak is **≤ 1 GB** at Up to 4, the numbers go in Plan S's Status block and the item is closed. If the peak is above 1 GB, or the run crashes, work stops and the numbers go to the user before a remedy is chosen. Possible remedies are a memo size cap, `resourceLimits` on the worker, or refusing Up to 4 on large leagues.

## 6. Find during a league refresh is refused

**Today.** Every sync step that succeeds calls `invalidateCaches()`, which marks the active run stale. A Find clicked during a refresh (for example the on-launch one) starts, then gets stopped `stale` a few seconds later.

**Change.** `SuggestRunDeps` gains `refreshing(): boolean`, which the handler wires to `startRefresh`'s `inFlight !== null`. `SuggestRuns.start` checks it **first**, before it stops anything, and throws `League data is refreshing — Find again when it finishes` (exported as `REFRESHING`). The renderer shows it through the hook's existing `startError`. The current run and its cards are left untouched. A refresh that begins while a search runs still marks it `stale`, as before.

**Spec amendment.** Multi-team spec §4.2 (run lifecycle) and the §6 error table gain the row "Find during a refresh → refused with the hint; the shown run is unchanged".

## 7. A 5-team must-include case

**Today.** The `dealsAt` brute-force test covers k = 2–4. k = 5 is the first size where the must-include team can sit in a middle bridge slot, and the `allowed` rule has a branch for exactly that.

**Change.** `searchLeague(seed, teams = 4)` gains a team count. A new brute-force case checks a 5-team league (one seed, `mustInclude` 3, k = 5, my singles against their singles) against `oracleDeals`. The test must find at least one 5-team deal with the must-include team in the middle slot, so the test can't pass while checking nothing. If the seed has none, the plan picks another seed and records which one.

## 8. Testing and delivery

- TDD per fix: a failing test first (types, `dealTransfers`, `dealFromTransfers`, the stale `openProposal`, `pruneControls` and the late snapshot, the status line, `messageerror` and OOM in a fake-worker test, the refresh refusal in `suggestRun.test.ts`, the k = 5 case).
- The full suite, `npm run typecheck`, `npm run lint` and `npm run test:budget` are green. The two-team and synthetic budgets must not regress, since search results are unchanged.
- `npm run dev` starts without main-process errors. Not GUI-verified (WSLg), as before.
- Docs: `docs/reference/value-and-signals.md`, covering the Streaming paragraph (refresh refusal, `messageerror`/OOM) and the Suggestions card (stale error line, alternatives pruned when stale).
- Released as **`v0.19.1`**. Push only after asking the user.
