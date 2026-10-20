# Stats screens — reference

Added in v0.28.0 (Plan AA; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.1–§9.2, amended in §18); the team dashboard in v0.29.0 (Plan AB; §9.3, amended in §19). Companion Stats is the app's second product: its own shell and cobalt palette (design handoff 2026-10-16, "Companion Stats"), reachable from the Fantasy nav ("Stats ↗"), and where the app opens when no league is imported. Every number comes from the query engine (`stats.query`, data reference: `docs/reference/stats-database.md`).

## Shell

- **Nav:** Leaderboards · Players · Teams (the team dashboard) · Games (later) · Glossary; "Data through 2026 week 6 · updated 2 h ago" from `stats.status()` ("updating…" while a refresh runs); "Fantasy ↗" (Setup without a league); the theme toggle.
- **Scope** (every screen, kept for the session): season (2019 → latest), Regular season / Postseason / Both, the regular season's week range, and the fantasy scoring (My league once a league is imported, else PPR, Half PPR, Standard).
- A finished rebuild (`stats:changed`) re-reads the status and the catalogue and runs every query on screen again.

## Leaderboards (home)

Eight boards, the top six of each: QB passing yards and yards per attempt, RB rushing yards and touches, WR receiving yards and target share, TE receiving yards, team takeaways (`def_turnovers`). A row needs the metric's own qualification and half the regular-season games in range (one in the postseason). Totals or per game. With a league, "My players" marks my players with an amber dot and adds my best one under a dashed line when he ranks outside the top six. "All →" or a row opens the full leaderboard sorted by that metric (the row selected). Saved views are listed above the boards.

## Players and Teams

The Ledger table: one tab per position group (All offense, QB, RB, WR, TE, K, P, DL, LB, DB) or team unit (Offense, Defense, Ratings & odds), each with default columns in named groups (`src/renderer/src/lib/stats/leaderboard.ts`).

| Shown            | From                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Value            | The metric's value after Totals / Per game (`perGame` divides counts by games)                                                                                                                                                                                                                                                                                  |
| Shading          | Its percentile among the rows the tab qualifies (NQ below), of the same position, and above the metric's own sample (teams: the league): ≥ 90 / 75 / 60 green, ≤ 10 / 25 / 40 red; neutral metrics (pass rate, pace) unshaded                                                                                                                                   |
| Hover on a value | Percentile, rank, the sample in words (`MetricInfo.sampleLabel`), "below the qualifying sample", "estimated"                                                                                                                                                                                                                                                    |
| `est`            | Routes and the shares built on them in the current season (participation is published after the season)                                                                                                                                                                                                                                                         |
| Column head      | Short label, reliability marker (three bars: high, medium, low year-to-year stability); hover: the catalogue entry (description, family, positions, sample and minimum, seasons, sources, reliability)                                                                                                                                                          |
| G                | The row's games                                                                                                                                                                                                                                                                                                                                                 |
| NQ               | Below the tab's qualifier: QB dropbacks (`qb_epa_db`, 200), RB carries (`carry_share`, 50), WR / TE targets (`target_share`, 30), K field-goal attempts (20), P punts (30), defenders' defensive snaps (200), All offense's offensive snaps (200); each per 17 games, scaled to the weeks in range. "Qualified only" (default) hides them. Teams always qualify |
| Owner mark       | With a league: amber dot for my players (my defense), a hollow ring for another team's, its name on hover                                                                                                                                                                                                                                                       |

- **A team row** (on the team leaderboard, or a home board's) opens that team's dashboard. The team leaderboard is under the dashboard's "Team leaderboards →" and the home's "All →".
- **Filters:** Totals / Per game, Qualified only, team (players), with a league All / My team / Free agents, search by name. Ownership and search filter the engine's rows, so percentiles stay among the whole position.
- **Columns:** "Columns: this tab" or one family's core metrics on the tab (Traditional, Advanced, Next Gen, Charting, Predictive; extended ones fill in to 12); the column picker adds any core or extended metric of the tab (at most 40) or removes one; Reset.
- **Sort:** a column head (best first, then the other way), or the name. The engine sorts; the table shows 50 rows at a time.
- **Views:** a named board saved in `companion.db` (`stats_views`): entity, tab, columns, sort, per game, qualified only, team, owner filter. The season, weeks and scoring stay the screen's. Saving under an existing name (any case) replaces it.
- **CSV:** every row the filters keep (not only the 50 shown): rank, name, team, position and gsis id (players), games, then each column unformatted, percentages in percent. Saved where the dialog says (Downloads by default), UTF-8 with a byte-order mark so Excel reads accents.

## Team dashboard

Teams in the nav opens it on the team viewed last; the first time, on the team of my top fantasy scorer in range (with a league), else ARI. ‹ › and the select move between the 32 teams.

- **Header** (every tab; handoff "8. Team"): the team's name, its place in the division (regular season: win %, then point margin), the abbreviation, four tiles (record, points and points allowed per game, the margin per game in its tone), a results strip with one card per week of the range (W/L and the score, byes, postseason rounds WC / DIV / CONF / SB), and the scope bar. With a league, who rosters the team's defense.
- **Stat lines** (Offense, Defense, Special teams, Situational, Tendencies, Forecast, the Overview's ratings): the value; a percentile pill and the rank among the teams that qualify ("3rd of 32", ties "T-3rd" with their percentile at the middle); the league's mean; the catalogue entry and reliability on the label. A metric with no better side (pass rate, pace, blitz rate) reads "11th highest" and stays grey. A line the season lacks says why ("Not published for 2026 yet.", "Charted from 2022."). Each line comes from one query over every team, one more per split.

| Tab           | Shows                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview      | Who gets the targets and the carries (share of the team's total in range, bars against the leader, FP/G under the scoring), who throws; the next game (Elo and the market's win probability and spread, total, weather); ratings; EPA per play by week                  |
| Offense       | Efficiency, passing, rushing (line yards, stuffs), red zone (EPA and success inside the 20) and third / fourth down, ball security                                                                                                                                      |
| Defense       | Efficiency allowed, pass rush (pressure through the prior season, sacks, blitz, rushers), coverage (man rate, EPA in man and zone, through the prior season), run defense, havoc and red zone, fantasy points allowed by position under the scoring                     |
| Special teams | Field goals and FG over expected, net punting, returns and touchdowns, starting field position; the kickers and punters                                                                                                                                                 |
| Situational   | Drives, third and fourth down; a table of splits (all plays, red zone, two-minute, leading by 9+, within 8, trailing by 9+, each quarter): plays, EPA and success for the offense and allowed by the defense, shaded and ranked among the 32 in the same split          |
| Tendencies    | Play calling (PROE, neutral pass rate and pace, no-huddle), offensive looks (shotgun, play action, RPO, screens, motion, personnel), defensive looks (blitz, rushers, man rate, box); personnel groupings with plays, share, EPA and success (through the prior season) |
| Players       | Snap, route, target, carry or air-yards share of every QB, RB, WR and TE with one, in range and week by week                                                                                                                                                            |
| Schedule      | Every game: date, opponent, result, Elo and market win probability, the line, the opponent's Elo before it (red from 1550, green to 1450), weather; schedule strength played and left                                                                                   |
| Forecast      | Playoff and division odds by week, adjusted EPA by week, the next game, season odds, ratings, schedule strength, luck                                                                                                                                                   |

Charts: one line per series (cobalt, teal; colour-blind safe in both themes), gaps for byes, end labels, and a hover that lists every series that week.

## Glossary

Every core and extended metric, players or teams, by family or search, with the same entry as the column hover.

## IPC

`stats.games({ season, team })` for the dashboard's header, next game and schedule; `stats.ownership()` (the league's rosters keyed by gsis id and nflverse team code, from `player_ids`), `stats.views()`, `stats.saveView(name, board)`, `stats.deleteView(id)`, `stats.exportCsv(fileName, csv)`; and Plan Y's `stats.query`, `stats.catalogue`, `stats.status`, `stats.onChanged`.

## Speed

Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms. The team dashboard: Teams 140 ms from click to the Overview, a tab 65–150 ms, Situational (eleven queries) 275 ms.
