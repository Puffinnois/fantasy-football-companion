# First game back — does Sleeper over-project returning players?

Status: offline study, 2026-10-07. Answers step 2–4 of the recommendation in `2026-10-05-injury-recovery.md`. No app code changed. Scripts: `2026-10-07-first-game-back/` (`fetch.py` downloads the inputs, `analyze.py` builds episodes and the main tables, `robust.py` the checks). Run with Python 3 + pandas; inputs are about 125 MB, not committed.

## Verdict

Only **wide receivers** come back below their projection: about **−10% over the first two games back** (0.90, 95% CI 0.84–0.96), and about −18% after missing 4+ games. RBs, TEs and QBs show nothing usable. But the WR effect has **faded**: 0.85 in 2019–22, 0.96 (CI 0.87–1.07, not significant) in 2023–25. The decision gate (game 1 ≤ 0.9 with a CI that excludes 1) is met by the main specification for WRs only, and missed under a stricter player filter. This is not strong enough to justify changing values.

## Prerequisite: are historical Sleeper projections pre-kickoff?

Yes — they are RotoWire's **final pre-kickoff** projections, frozen at a weekly lock, with no sign of hindsight.

- Every past week carries one `last_modified` stamp at Tuesday 04:00–05:00 UTC, right after Monday Night Football (2026 weeks 1–4; 2023 and 2025 checked; 2019 and 2021 have no stamp).
- Comparing the app's own copies with the API: the week-3 revision (Tuesday copy → locked copy) zeroes players who were inactive and bumps their backups — game-day news. Players hurt **during** the game kept their full projection (an RB with 4 snaps: 16.9 → 16.4; actual 1.7). Correlation with actual points rose only 0.62 → 0.63.
- Week 4: 21 of the 24 changed players were in the Monday game that kicked off after the app's fetch, i.e. pre-kickoff updates; players who beat or missed their projection by 13–20 points were left unchanged.
- 2019–2025 (week 10): projection/actual correlation 0.57–0.62, same as 2026 live; players who played under 30% of snaps scored 0.34–0.66 of projection — the projections did not know.

Caveat: the locked projection includes inactive news, so it is slightly better informed than a midweek projection a user sets a lineup from. That makes the study conservative.

Side finding, unexplained: the app's stored past-week copies (`player_week_projections`, weeks 3–4) still held pre-lock values days after the lock, although the CDN only caches for 10 minutes (`s-maxage=600`). It does not affect the study (fresh API data) and matters little to the app (past weeks only), but it is noted.

## Method

- **Data, 2019–2025 regular season:** Sleeper weekly projections and stats (QB/RB/WR/TE, `pts_ppr`, `gp`, snaps); nflverse `injuries_YYYY` (report status, primary injury) and `roster_weekly_YYYY` (team, status, `sleeper_id`). All keyless.
- **Absence:** a team game the player did not play, with injury evidence — injury report Out/Doubtful/Questionable that week, or roster status `RES`/`PUP`. Byes, healthy scratches and suspensions do not count.
- **Episode:** a run of consecutive absences followed by a game played for the same team. Kept only if the player played at least 3 of the 6 team games before it with a mean projection of 5+ PPR, and the return is before the season's last week. **655 episodes** (WR 309, RB 174, TE 105, QB 67; 134 involved IR).
- **Effect:** Σ actual ÷ Σ projected over return game k, divided by the same ratio over the same players' other games in those seasons (control). 95% CIs bootstrapped over episodes.

## Results

Effect by return game (1.00 = performs as projected):

| Pos | Game 1               | Game 2           | Game 3           | Games 1–2 pooled     | Projection vs pre-injury (game 1) | Snaps vs pre-injury (game 1) |
| --- | -------------------- | ---------------- | ---------------- | -------------------- | --------------------------------- | ---------------------------- |
| WR  | **0.87** (0.80–0.95) | 0.93 (0.84–1.01) | 1.09 (1.00–1.20) | **0.90** (0.84–0.95) | 0.92                              | 0.97                         |
| RB  | 1.06 (0.96–1.17)     | 0.99 (0.88–1.09) | 0.96 (0.86–1.05) | 1.03 (0.95–1.11)     | **0.86**                          | 0.94                         |
| TE  | 1.01 (0.87–1.16)     | 0.94 (0.80–1.08) | 1.10 (0.94–1.28) | 0.98 (0.89–1.07)     | 0.94                              | 0.94                         |
| QB  | 0.88 (0.76–1.00)     | 1.03 (0.91–1.15) | 0.82 (0.67–0.97) | 0.95 (0.86–1.03)     | 0.98                              | 1.04                         |

What it means:

- **RBs are already handled.** RotoWire cuts a returning RB's projection by ~14% from his pre-injury level, and he then scores about as projected. A discount on top would double-count.
- **WRs are only partly handled.** The projection drops ~8%, the receiver still falls ~10% short over two games, then catches up by game 3. Snap share is nearly normal (0.97), so the shortfall is efficiency or target share, not a snap count.
- **QB and TE:** noise around 1. The QB game-3 dip has no game-2 counterpart and the sample is small (67 episodes).

WR splits (games 1–2 pooled):

| Split                     | Effect | 95% CI    | Episodes |
| ------------------------- | ------ | --------- | -------- |
| Missed 1 game             | 0.91   | 0.84–0.99 | 176      |
| Missed 2–3 games          | 0.90   | 0.79–1.00 | 93       |
| Missed 4+ games           | 0.82   | 0.68–0.98 | 40       |
| Soft tissue (game 1 only) | 0.90   | 0.77–1.05 | 97       |
| Other (game 1 only)       | 0.86   | 0.77–0.96 | 211      |
| 2019–22                   | 0.85   | 0.79–0.92 | 184      |
| 2023–25                   | 0.96   | 0.87–1.07 | 125      |

Soft-tissue vs other makes no difference, so the body-part label (46% junk in Sleeper anyway) is not needed.

## Robustness

- **Per season, WR game 1:** 0.78, 1.05, 0.86, 0.79, 0.79, 1.08, 0.88 (2019 → 2025). Below 0.9 in 5 of 7 seasons.
- **Stricter filter** (pre-injury projection 10+, control = all league games projected 10+): WR game 1 0.92 (0.83–1.02), game 2 0.89 (0.79–1.00). Same direction, CI touches 1.
- **In points** (return games projected 10+): WR game 1 −1.4 vs −0.6 league-wide, game 2 −2.3 vs −0.6 — roughly 1–1.5 points per game.
- **QB scoring mismatch:** league-wide, QBs score only 0.78–0.90 of projected `pts_ppr` every season — the projection and stats `pts_ppr` fields evidently score QBs differently. It cancels in the relative effect but makes the QB rows less trustworthy. The app scores both from stat lines with league rules, so the app itself is not affected.

## Recommendation

1. **Do not add a value discount now.** Only one position shows an effect, it is about a point per game, and the recent seasons — the ones closest to how RotoWire projects today — show it shrinking to non-significance.
2. **Optional, cheap:** a "first game back" marker on WRs in the lineup and player views, with no value change, so the user can make the marginal start/sit call.
3. **Re-check after the 2026 season** by re-running `fetch.py` / `analyze.py` with 2026 added. If 2023–26 still shows WR games 1–2 at ≤ 0.92 with a CI below 1, spec a WR-only current-week discount of about that size, larger after 4+ missed games.
