# Stats Explore — design brief

Paste into the Claude Design "FantasyCompanion UI" project, in the `two-products` template beside the handoff (`design_handoff_companion/`). It asks for the screens Plans AD1 and AD2 build: **Compare** (players and teams), **Trends** and the **Chart explorer**, under one new **Explore** item. Spec: `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.5.

Design in the Companion Stats language exactly as the handoff draws it: the Stats tokens, Geist / Geist Mono / Barlow, the 52px toolbar, soft tone chips, pill-dot percentile bars, the heat colour (`heatColor()` in `stats-model.js`), light and dark. 1280 × 800. Invented players and teams only (the repo is public).

## Decisions already made (user, 2026-10-23)

- One **Explore** item in the Stats nav, between Teams and Games: Leaderboards · Players · Teams · **Explore** · Games · Glossary. Explore has three sub-tabs: **Chart · Compare · Trends** (a segmented control at the left of the 52px toolbar, in place of the breadcrumb).
- **Compare** keeps the handoff's `StatsCompare.dc.html` for players (3 slots, one position) and gains the same layout for **teams**.
- **Trends** and the **Chart explorer** have no mockup yet: this brief asks for them.

## 1. Compare — teams (extends `StatsCompare.dc.html`)

- Toolbar: sub-tabs, a **Players / Teams** segmented control, then for players the position segmented as today; season, week range, Totals / Per game.
- Teams: three team cards in the handoff's card style, the series swatch (`--s1/2/3`), abbreviation in Barlow 800, full name, record and division place, Elo, "Leads n of m", a swap select of the 32 teams (my fantasy team's NFL team is not special here). Empty slot: dashed card, "Add a third team…".
- Metric rows grouped **Offense · Defense · Special teams · Situational** (EPA per play, success rate, explosive rate, pass / rush EPA, sack rate, red-zone TD drive rate, third-down conversion; defense allowed; FG over expected, net punt). Percentiles vs the 32 teams; a defensive "allowed" metric is better when lower, so its colour follows the team's side.
- Chart: "EPA per play by week" (offense), the three series, the league median dashed. Optional second chart toggle: Offense / Defense.
- Entry points to show: a **Compare** button on the team dashboard header (as the player profile has), seeding that team plus the two teams nearest in Elo.

## 2. Trends (new)

A metric over seasons, 2019 → now, for one player or team, with up to two more for context.

- Toolbar: sub-tabs, Players / Teams, a **search** (player or team), a **metric** select grouped by family (Traditional, Advanced, Next Gen, Charting, Predictive), Totals / Per game, season type.
- Header strip: the entity (position chip, team, age now, seasons in the league) and "Add a comparison" (up to 3 series, `--s1/2/3`).
- **Main chart**: the metric by season, a line with dots per season (a column chart is fine if it reads better for counts); the **position's qualified median** per season as a dashed line, and a soft band from the 25th to the 75th percentile. A season he did not qualify: a hollow dot. Team changes marked on the axis (a small team abbreviation under the season). Hover: season, team, value, percentile, rank, sample.
- **Table** below: Season · Team · Age · G · value · **Δ vs prior season** (good / bad tone by the metric's better side) · percentile chip · rank ("12th of 110") · sample.
- **Career at a glance**: small multiples of the position's 6 core metrics (sparkline per metric, last value and its percentile), each clickable to make it the main metric.
- **Age context**: a thin "age curve" line for the position (typical value by age, invented) behind the player's line, toggle on / off; label his age under each season.
- Entry points: from a player or team dashboard stat line (a small trend icon on hover) opening Trends on that metric.
- States: one season only ("Trends need two seasons; he has one."); a metric that starts later ("Charted from 2022.", "Next Gen Stats from 2019"); participation metrics through the prior season ("Not published for 2026 yet."); not qualified seasons greyed in the table.

## 3. Chart explorer (new)

Any metric against any other, players or teams.

- Toolbar: sub-tabs, Players / Teams, position segmented (players), season, week range, Totals / Per game.
- Left controls column (about 280px): **X metric**, **Y metric** (each a select grouped by family, with a swap ⇄ button), **Size by** and **Colour by** (optional third metric; colour on the diverging percentile scale, or by position / team), team filter, Qualified only, My players (amber), a search that highlights and labels matched dots. Presets as chips: "Volume vs efficiency", "Targets vs air yards", "Pressure vs sack rate" (team), "Offense vs defense EPA" (team).
- **Scatter**: dots in `--accent` at medium opacity; my players with the amber ring; **quadrant lines** at the qualified mean of each axis, dashed, with corner labels in `--fg-3` ("High volume, efficient" …; for teams "Good offense, good defense"); a lower-is-better axis is flipped so up-right is always better, said in the axis label ("Sack rate ↓"). Labels on the extremes, the searched players and mine, without collisions. Teams: 32 dots labelled with abbreviations.
- Hover card: name, team, both values with percentiles, sample; **click opens the dashboard**. A lasso or shift-click to pick up to 3 and "Compare these →".
- Under the chart: the correlation (r) and the n shown, and a compact table of the plotted rows, sortable, with the two metrics (and the third).
- States: too few qualifiers, a metric not published for the season, loading.

## What to deliver

- Three screens in light and dark, each with a real-looking state and one empty / partial state: Compare (teams), Trends (a WR with a team change and a non-qualified season; a team), Chart explorer (WR volume vs efficiency; teams offense vs defense EPA).
- The Explore nav and sub-tab control.
- View-model notes in the handoff's style (`stats-trends.js`, `stats-explore.js`, the Compare teams view in `stats-compare.js`) and README sections "7. Compare" (amended), "14. Trends", "15. Chart explorer", plus the navigation table rows they add.
- Charts follow the dataviz rules: one palette system; check the series colours for colour-blind separation in both themes. Note: the app's dark `--s1` / `--s2` moved to `#5d8ff2` / `#26a092` (spec §19 F) — use those.
