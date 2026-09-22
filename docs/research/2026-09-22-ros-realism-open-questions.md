# Rest-of-season realism — open questions and how to revisit them

Status as of `v0.15.0` (2026-09-22). Read this before reworking `src/main/value/realism.ts`.

## What shipped

Spec `docs/superpowers/specs/2026-09-22-ros-realism-design.md`, plan N. Two corrections over the weeks **after** the current one (details in `docs/reference/value-and-signals.md`, "Rest-of-season realism"):

1. **Shelf horizon** — IR / PUP players get 0 for every remaining week.
2. **Rank matching** — per position, the raw rest-of-season points ladder is reassigned to the FantasyPros ROS consensus order, each player's remaining weeks scaled by the resulting factor, **clamped to [×0.5, ×2]** (`ROS_FACTOR_CAP`).

## Why the cap exists (found on real data, not in the spec)

The uncapped design broke on the first real-data check (week 3, 2026):

| Player           | Sleeper raw | Uncapped | Capped | What went wrong                                                                        |
| ---------------- | ----------- | -------- | ------ | -------------------------------------------------------------------------------------- |
| Kirk Cousins     | 46          | 195      | 76     | QB34 by projection, QB30 by consensus: a 4-rung move across the starter/backup cliff   |
| Marcus Mariota   | 14          | 100      | 14     | Projected for the current week only (fill-in); the `base = 0` spread gave him a season |
| Shedeur Sanders  | 86          | 0        | 43     | Ranked players with 0 projected held the bottom rungs, so the ladder ended in zeros    |
| Demond Claiborne | 16          | 32       | 29     | Legitimate handcuff bump (starter on IR) — the cap barely touches it                   |
| T. Ferguson      | 62          | 123      | 120    | Legitimate TE promotion — same                                                         |

Fixes: the cap; the spread fallback removed; ranked players with nothing projected after the current week kept off the ladder. 51 of 350 corrected players hit the cap. The ×2 value was chosen because the legitimate moves on that data clustered near ×2 — **it is a judgement from one week of one league, not a fitted number.**

## Known weaknesses (not fixed)

1. **No evidence the correction improves accuracy.** It is plausible (consensus ROS ranks price role changes and injuries that Sleeper's weekly projections do not), but untested. This is the main open question.
2. **Cliff sensitivity inside the cap.** A one-rung disagreement where the ladder is steep still moves a player a lot: Michael Penix went ×0.55 for QB31 → QB32. The cap only bounds it.
3. **Expert disagreement is ignored.** FantasyPros gives `rank_std`, `rank_min`, `rank_max` per player. Cousins' spread was 39 overall ranks, Penix's 63, Ferguson's 5.5 — the correction treats all three consensus ranks as equally certain.
4. **Deep-tier noise.** Below the startable tier ranks are close to arbitrary and projections are near zero, so factors there are meaningless (Tutu Atwell raw ×10.6 before the cap). Harmless to values (below replacement) but noisy in the UI marks.
5. **Rank ≠ points.** The ladder assumes the k-th ranked player should score the k-th highest total. Consensus ranks mix ceiling, floor and risk; a boom/bust player can be ranked above a steadier one who is projected more.
6. **Current week excluded.** A player's current-week projection is never corrected (by design: the lineup engine and injury flag own it).

## The data to decide with: `ros_snapshots`

Added right after the cap (migration 8, `src/main/sync/snapshotSync.ts`, last step of every sync). One row per player per week — the last sync while that week is current wins:

`season, week, player_id, position, scoring, raw_ros, corrected_ros, factor, capped, shelved, pos_rank, rank_ecr, rank_std, rank_min, rank_max, experts, taken_at`

`raw_ros` / `corrected_ros` are the Sleeper projected points for weeks **after** `week`, scored with the league rules, before and after the correction. Nothing else in the DB keeps this history: Sleeper future-week projections and FantasyPros ROS ranks are overwritten on every sync. Roughly 520 rows per week.

**Backtest recipe** (once several weeks have been played after a snapshot): for snapshot week `w`, the actual rest-of-season points are the league-scored points for weeks `w+1 … W` (the value build's `SeriesWeek.points` for played weeks, i.e. what the Players table shows). Compare, per position and per tier (starters vs deep):

- error of `raw_ros` vs error of `corrected_ros` (MAE and rank correlation against actual);
- the same restricted to `capped = 1` rows — did the cap help or hurt?;
- error vs `rank_std` — does high expert disagreement predict where the correction is wrong?

A fair comparison uses snapshots from early weeks (3–8) scored against the rest of the season, so the result is not available until mid-season at the earliest. Actual points must be over the same weeks the snapshot covered (a snapshot's ROS is weeks after `w`, capped at the league's last week).

## Candidate improvements, in the order worth trying

1. **Confidence shrinkage** — blend toward the raw projection by expert agreement: `final = raw + w·(ladder − raw)` with `w` falling as `rank_std` rises. Directly targets weaknesses 2 and 3. Needs `rank_std` converted to position scale (it is on the overall rank).
2. **Expected-value ladder** — instead of the single rung at `posRank`, average the ladder over the rank range the experts span (`rank_min … rank_max` mapped to position ranks). Smooths the cliff (weakness 2) and is principled; more work.
3. **Starter-relevant window** — only correct within the top `starters × teams × 1.5` of each position; below it keep raw. Kills weakness 4 cheaply.
4. **Per-position caps** — fit a cap per position from the backtest instead of one global ×2.
5. **Drop rank matching entirely** if the backtest shows raw projections are as good; keep only the shelf horizon, which is uncontroversial.

## Decision rule

Keep the current design until the backtest exists. Change it only when a variant beats both `raw_ros` and the current `corrected_ros` on the snapshot data — measured, not argued. If the correction does not beat raw, fall back to option 5.
