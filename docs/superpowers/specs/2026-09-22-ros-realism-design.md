# Rest-of-season realism — Design

**Status:** approved by the user on 2026-09-22 (sections reviewed in order).
**Position in the roadmap:** an engine fix between slice 6b (trade evaluator, `v0.14.0`) and slice 6c (waiver recommendations), which keeps its name. Ships as `v0.15.0`.
**Builds on:** slice 4's value pipeline (`loadSeries` → `PlayerSeries.weeks[].projected` → `rosPoints` / `rosValue`); slice 5's FantasyPros rest-of-season ranks, already loaded by `buildValueSeason` as `listExpertRanks(db, season, ROS_WEEK)`; slice 6a's lineup engine and 6b's trade evaluator, both of which read the same per-week values.

## 1. Goal

A player's rest-of-season value is the naïve sum of Sleeper's weekly projections, which assume every player is healthy and keeps his current role for the rest of the year. Injury status is applied to the current week only, by design (6a: `injury_status` is a _today_ fact with no end date).

The result, measured on the user's league in week 3:

| Player         | Sleeper status | Sleeper wk 4 | wk 12 | FantasyPros ROS |
| -------------- | -------------- | ------------ | ----- | --------------- |
| Caleb Williams | Out            | 22.5         | 21.6  | QB5             |
| Puka Nacua     | Out            | 19.2         | 21.9  | WR2             |
| Zay Flowers    | Out            | 19.9         | 18.2  | WR11            |

Williams has no week-3 projection at all (Sleeper drops the current week for players who are out) and a full healthy baseline for every week after it. A player out for the season therefore carries a complete rest-of-season projection, which inflates his `rosPoints`, his owner's power ranking, and his price in the trade evaluator.

The other half is the players who should gain. With Nacua out, the next Rams receiver up the depth chart projects **1.9** points in week 4 — no redistribution. With Aaron Jones questionable, DeeJay Dallas goes 5.1 in week 4 decaying to 1.5 by week 12, so the projection source reacts weakly and only in the short term.

This slice makes rest-of-season values reflect who is actually going to play, so the Players table, the power ranking, the trade evaluator and — next — waiver recommendations all read one honest number.

### Decisions taken in brainstorming

| Question                | Decision                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope                   | Its own slice before 6c. A waiver tool on today's values would never suggest dropping an injured player or adding his handcuff, and the same gap already distorts 6b.                                      |
| Mechanism               | Both a status-driven shelf horizon and an expert-consensus correction; they fail in different places.                                                                                                      |
| Horizon reach           | Only formally shelved players (IR / PUP / `Injured Reserve`). `Out` keeps today's behaviour — the consensus rank already prices the expected return, and zeroing extra weeks would count the injury twice. |
| Correction shape        | Rank matching (quantile mapping) within a position: no tuning parameter, points conserved, and the values stay league-scoring-aware because only the _ordering_ is borrowed.                               |
| Reach of the correction | Weeks after the current one only; one corrected value for every consumer, rather than the table showing one truth and the engine another.                                                                  |
| Surfacing               | A marker on adjusted rows plus an explanation in the detail panel — every ROS number in the app moves, and a surprising one should explain itself rather than look like a bug.                             |

### Non-goals

- Predicting injury duration. Sleeper's `injury_start_date`, `practice_participation` and `practice_description` are empty league-wide (verified against the live endpoint), so there is no "out since week 2, expect four more" to compute.
- Hand-rolled depth-chart redistribution. `depth_chart_order` stays unused; the freed ladder rung (§3.2) does this job.
- Changing current-week start/sit behaviour. The current week keeps its weekly projection and injury flag.
- Anything waiver-specific (6c).
- Modelling how a specific injury affects a player **after** he returns — by injury type, position, age and workload. Recorded as a research task for after the app is otherwise complete; it is research first, and only then a decision about whether it becomes a model.

## 2. What the data supports

Verified against `https://api.sleeper.app/v1/players/nfl` and the user's database.

**Status vocabularies.** `injury_status`: Questionable 311, Out 217, IR 213, NA 96, PUP 38, Sus 10, DNR 2, COV 2. `status`: Active 2848, Inactive 1297, Injured Reserve 86, Practice Squad 1, Physically Unable to Perform 1. Hard absences are therefore distinguishable from week-to-week ones.

**Injury detail**, over 303 injured skill players: `injury_body_part` 90 % populated, but 46 % of its values are uninformative (`Undisclosed` 95, `Coach's Decision` 42); `injury_notes` 11 % populated and high-signal when present (`Surgery`, `Strain`, `Soreness`); `injury_start_date`, `practice_participation`, `practice_description` all 0 %. Body part and notes are worth storing for display; they are not a duration model. `Coach's Decision` as a body part means the player is benched, not hurt.

**Expert ROS coverage**, 410 ranked players: 99 % of rostered players (250/253) and 24 % of free agents (134/551). Ranks run to WR140, RB109, TE67, QB47, and cover all of K (20) and DEF (27). The unranked remainder sits below the useful tier, so leaving it on raw projections is a harmless seam. The rows carry `pos_rank` and the `scoring` format they were fetched under; `proj_pts` is null for rest-of-season rows, so the feed gives ranks, not points.

## 3. The two mechanisms — `src/main/value/realism.ts`

Pure, no DB access.

### 3.1 Shelf horizon

```
shelved(p) = injury_status ∈ { IR, PUP }
           ∨ status ∈ { 'Injured Reserve', 'Physically Unable to Perform' }
```

Every week after the current one becomes 0. The current week is already handled: `UNAVAILABLE_STATUSES` in `src/main/lineup/optimal.ts` contains IR and PUP.

This is about a player's **value**, not his roster slot. 6a's `reservedNow` already benches a player sitting in his own team's IR slot, but only for that team's lineup and only in the lineup engine; the value pipeline applies neither, so a shelved free agent, or a shelved player on someone's bench, keeps a full rest-of-season projection today.

### 3.2 Rank matching

Per position in `LINEUP_POSITIONS`, over the value pipeline's candidate pool — every rostered player plus every free agent on an NFL team who is not `Inactive` — restricted to those that have a ROS rank and are not shelved. Free agents belong in the ladder: including them is what lets one climb past a rostered player, which is the signal 6c will read.

1. `base(p)` = Σ of p's projected values for weeks after the current one.
2. `ladder` = those `base` values, sorted descending.
3. `order` = the same players, sorted by consensus `pos_rank` ascending.
4. `corrected(order[k]) = ladder[k]`.
5. `factor(p) = corrected(p) / base(p)`, applied to each of p's remaining weeks.

Shelved players are excluded at step 1, so their rungs leave the ladder and every player below climbs one. That is the handcuff bump, and it falls out of the construction rather than needing depth-chart logic.

Players without a ROS rank keep their raw projections untouched.

**Why ordering only.** The ladder values come from the league's own scoring, so a TE-premium league still gets inflated TE points; all that is borrowed from the consensus is the order within a position, which moves far less across scoring formats than the levels do. The user's league is standard full PPR, matching the stored `PPR` rows.

**Invariants**, pinned in tests: the total of `corrected` over a position equals the total of `base`; the order of `corrected` matches the consensus order exactly; and re-running the correction on its own output changes nothing.

### 3.3 Output

```ts
export interface RosAdjustment {
  shelved: boolean
  /** The scale applied to each remaining week; null when there was no scale to apply. */
  factor: number | null
  /** Rank within position by raw projection, and by consensus. */
  projPosRank: number | null
  expertPosRank: number | null
}
```

`factor` is null in three cases: a shelved player, an unranked one, and a ranked one whose `base` was 0 and whose corrected total was therefore spread evenly (§5) rather than scaled. The two ranks carry the explanation in every case, and the table's arrow (§6) is drawn only when `factor` is present.

## 4. Where it plugs in

`realism.ts` is called from `buildValueSeason` immediately after `loadSeries` and the expert indexing that already happen there — the ROS ranks are loaded at that point, so no new query. It rewrites `PlayerSeries.weeks[].projected` for weeks after the current one and returns `Map<playerId, RosAdjustment>`.

Because the series are corrected before anything reads them, every consumer inherits the change with no further edit: `rosPoints` and `rosValue`, replacement levels, `vsMine` / `droppable`, the lineup engine's per-week values, team strength and the power ranking, and 6b's trade deltas.

- `PlayerValueRow` gains `rosAdjust: RosAdjustment | null`.
- `ValueContext` gains `rosAdjusted: boolean`, so the UI can tell "not adjusted" from "adjusted by ×1.00".
- `invalidateCaches()` already clears the value and lineup caches on sync; nothing goes stale.

## 5. Edge cases

- **No expert rows** (never synced, or a past season) — no rank matching, `rosAdjusted: false`. The shelf horizon still runs; it needs no external data.
- **Past seasons** — the current week is 19, so there are no remaining weeks and both mechanisms are no-ops.
- **`base(p) = 0` but ranked** (no stored projections, or only byes ahead) — the factor is undefined, so spread `corrected(p)` evenly across the player's remaining weeks that have a game.
- **Non-lineup positions in the feed** — the ROS rows include one FB and one DB; only `LINEUP_POSITIONS` are corrected.
- **Shelved and ranked** — excluded from the pool entirely; the value is 0 and the rung passes down.
- **Current and played weeks** — never touched; the correction starts at `currentWeek + 1`.
- **Scoring-format drift** — the rows carry the format they were fetched under, and the next sync refetches if the league's scoring changed. Until then the stored order is used.

## 6. UI

- **Players table** — ROS cells carry a marker: a direction arrow when the factor moves the value by more than 10 %, and a distinct marker for shelved players. Fits the existing `playersTableView.ts` helpers.
- **Player detail panel** — one "Rest of season" line explaining the adjustment: `projection RB8 → consensus RB24 · scaled ×0.62`, or `IR (Knee – ACL) — remaining weeks zeroed`.
- **New stored data** — `players` gains `injury_body_part` and `injury_notes` (migration plus one mapper line), display only, feeding that line.
- No new UI on the Lineup or Trade screens; their numbers are simply corrected.

## 7. Testing

- `realism.ts` unit tests: the shelf vocabulary against the real `status` / `injury_status` values; ladder reassignment; points conserved within a position; corrected order matches consensus exactly; unranked players untouched; the `base = 0` additive path; idempotence.
- Fixture integration: a league where a shelved star's `rosPoints` falls to 0, the player below inherits his rung, and team strength moves accordingly.
- Regression: the standard fixtures seed no expert ranks, so no correction runs and most existing expectations are insulated; the tests that do seed FantasyPros data need their numbers updated.
- Real-data check on a copy of the dev DB before the build: Williams, Nacua and Mumpfield before and after, plus the league's power ranking.

## 8. Structure

| Path                                                                                                                      | Role                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/main/value/realism.ts`                                                                                               | `shelved`, rank matching, `RosAdjustment`                               |
| `src/main/value/build.ts`                                                                                                 | calls it after `loadSeries`; carries `rosAdjust` onto `PlayerValueRow`  |
| `src/shared/types.ts`                                                                                                     | `RosAdjustment`, `PlayerValueRow.rosAdjust`, `ValueContext.rosAdjusted` |
| `src/main/db/migrate.ts`, `src/main/db/repos/players.ts`, `src/main/sync/mappers.ts`, `src/main/sources/sleeper-types.ts` | `injury_body_part`, `injury_notes`                                      |
| `src/renderer/src/lib/playersTableView.ts`, `components/PlayerDetailPanel.tsx`                                            | marker and explanation                                                  |
| `docs/reference/value-and-signals.md`                                                                                     | a Rest-of-season realism section                                        |

## 9. Phasing

One plan (Plan N) → `v0.15.0`. Then slice 6c, waiver recommendations, brainstormed against a corrected engine — with the two modes the user has already chosen for it: rest-of-season adds and week-specific streaming, on one screen.
