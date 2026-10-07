# Injury recovery — should a returning player be valued differently?

Status: research only, 2026-10-05 (2026 season, week 5). No code changed. Read this before touching injury handling in `src/main/value/realism.ts` or the lineup engine.

**Update 2026-10-07:** steps 2–4 below are done — see `2026-10-07-first-game-back-study.md`. Historical projections are pre-kickoff; only WRs fall short (about −10% over games 1–2) and the effect has faded since 2023, so no value change for now.

Detail lives in two companion notes:

- `2026-10-05-injury-recovery-literature.md` — what the sports-medicine studies and fantasy analysts say, per injury type (summary table, about 65 references).
- `2026-10-05-injury-recovery-data.md` — keyless data sources, rebuilding injury episodes, double-counting, modelling options.

## The question

The app zeroes IR/PUP players for the remaining weeks (plan N), but once a player is back it values him as if nothing happened. Does injury type, position, age or workload justify discounting a returning player, and can the app do it without punishing him twice?

## What the evidence says

| Effect                                                                                | Size                                                                                                              | Evidence                                      | Relevant to an in-season redraft app?                                                                                                    |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| ACL tear — first season back                                                          | RB points per game −48% vs −16% for matched controls; WR −28% vs −6%; QB none                                     | Strong (controlled, peer-reviewed)            | **Barely.** The injury ends the season (player already shelved = 0); the first season back is next year and is priced by preseason ranks |
| Achilles / patellar tendon rupture — first season back                                | Approximate value −21% beyond aging; only 27% regain baseline                                                     | Moderate                                      | Same as ACL                                                                                                                              |
| Soft-tissue — first game back (hamstring, high ankle, calf, groin)                    | −15 to −25% fantasy points in game 1; hamstring back to baseline by game 3, RB high-ankle still −22% over 3 games | Weak to moderate (fantasy blogs, no controls) | **Yes** — this is the current week, which the consensus correction deliberately does not touch                                           |
| Hamstring re-injury                                                                   | 33–38% recur, about 12% in the same season; highest when back within 2 weeks                                      | Strong                                        | Affects games played, which the ROS consensus already has to price                                                                       |
| Concussion, core-muscle surgery, back surgery, most fractures, non-operative turf toe | No measurable effect                                                                                              | Moderate to strong null                       | Nothing to do — and a reason **not** to discount by body part blindly                                                                    |
| Age, workload before the injury                                                       | No evidence that they change the short-term effect                                                                | None                                          | Test as covariates, do not build in                                                                                                      |

Games missed does not predict the size of the post-return drop (R² = 0.005 in the one study that measured it).

## Why a rest-of-season injury table would double-count

Rest-of-season values are rank-matched to the FantasyPros ROS consensus (plan N). FantasyPros grades those rankings on **total** points over the remaining weeks, so experts already have to price missed games, a slow ramp and re-injury risk. A per-injury multiplier on ROS totals would very likely penalise the player twice — and the rank-match would partly undo it anyway.

The current week is different. It is never corrected (weakness 6 in `2026-09-22-ros-realism-open-questions.md`) and comes straight from Sleeper's weekly projections, which are **RotoWire's**. In a three-player 2024 spot check those projections moved only −8% to +5% for the first game back, while two of the players were on a snap count (47% and 60% of snaps). Actual over projected was 0.56, 0.92 and 0.46. Three players is an anecdote, not a finding — but it points at the one slot the app does not already cover.

## Data that would let us measure it ourselves (keyless)

- **nflverse `injuries_YYYY`** — official weekly injury and practice reports, 2009–2026, refreshed daily in season.
- **nflverse `roster_weekly_YYYY`** — per-week roster status, needed because IR players drop off the injury report. Has a `sleeper_id` column; the app's existing DynastyProcess crosswalk (`src/main/sync/identity.ts`) also maps gsis ids.
- **Sleeper weekly stats** — `off_snp` / `tm_off_snp` for snap share; Sleeper weekly projections for the baseline.

Injury episodes (start, games missed, return week) can be rebuilt with medium reliability. Pitfalls: labels are body part only ("knee", never "ACL"), labels drift within an episode, `week` is the report week, and the 2025 source change dropped per-row timestamps. Roughly 55–70 fantasy-relevant WR hamstring episodes exist for 2019–2025 — enough for a factor per position, too thin for position × injury type.

## Recommendation

1. **Do not** build a per-injury multiplier on rest-of-season values, and do not turn the literature into a value table. Both double-count the consensus, and the controlled evidence covers season-ending injuries that are already shelved.
2. **Check one prerequisite first:** Sleeper's stored 2024 projections were last modified after the games. Confirm that historical projections reflect what was projected before kickoff. If they don't, the study below loses its clean baseline.
3. **Run a one-off offline study** (a script, not app code): for 2019–2025 return episodes, measure actual ÷ Sleeper projection in games 1, 2 and 3 back, against the same players' other games, by position. Then split soft-tissue vs other, with shrinkage toward the position mean. Because it measures against the app's own input, it answers the double-counting question directly.
4. **Decision gate:** if the game-1 ratio is clearly below 1 (say ≤ 0.9 with a confidence interval that excludes 1), spec a **current-week "first game back" discount** in the lineup engine, by position, plus a UI mark. Leave rest-of-season totals to the consensus. If not, do nothing.
5. Optional and cheap at any point: show injury context as text (for example "hamstring — re-injury risk is high in the first weeks back") without changing any value.

## Related

- `2026-09-22-ros-realism-open-questions.md` — the ROS correction this builds on; its `ros_snapshots` backtest is separate (rest-of-season accuracy) and still due mid-season.
