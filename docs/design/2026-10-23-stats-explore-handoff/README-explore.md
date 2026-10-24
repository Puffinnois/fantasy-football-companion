# Handoff additions: Stats Explore (Compare · Trends · Chart explorer)

Sections to paste into `design_handoff_companion/README.md` for Plans AD1 (Compare + Trends) and AD2 (Chart explorer). Mockups are on the "Stats Explore" Claude Design canvas; the brief is `docs/design/2026-10-23-stats-explore-brief.md`. View-model specs sit beside this file: `stats-explore.js`, `stats-trends.js`, and `stats-compare-teams.js`, which merges into `stats-compare.js`.

Unlike the earlier view-models, which aggregate demo box scores in the browser (`stats-model.js` → `aggregate`), these three call the app's real stats API, `window.api.stats.query(StatsQuery)` / `.catalogue()` / `.status()` / `.player()` / `.ownership()`. They use catalogue ids from `src/shared/stats/catalogue.ts`. Percentiles, ranks, `qualified` and `estimated` come from the engine. They need three small helpers added to `stats-model.js`:

- `fmtMetric(def, v)`: catalogue unit and decimals → `"24.1%"`, `"+0.12"`, `"2.18"`.
- `fmtDelta(def, d)`: signed delta, with pct as points (`"+2.1 pts"`).
- `ticks(lo, hi, n)`: the nice-ticks function the charts already use.

They also need `teamInfo(id)` (name and division from `nflTeams.ts`).

---

### Stats nav (all Stats screens) — amended
52px, padding 0 24px. Mark + "Companion Stats". Items: Leaderboards · Players · Teams · **Explore** · Games · Glossary (Geist 500 13.5px, active = inset 2px cobalt bottom bar). Right: "Fantasy ↗", theme toggle (7px radius).

### Explore sub-tabs (all Explore screens)
- A segmented control at the left of the 52px toolbar, replacing the breadcrumb: **Chart · Compare · Trends**. Container `--panel-2`, padding 2px, radius 7px; items 26px tall, padding 0 14px, Geist 12.5px. The active item gets `--panel`, a 1px `--line` ring, weight 600 and `--fg`. Inactive items are 500 weight in `--fg-2`.
- A 1px × 20px `--line` divider follows. Next comes a **Players / Teams** segmented control (24px items, Geist 500 12px), then that tab's own controls.
- Opening Explore from the nav lands on **Chart**. Each tab keeps its own state for the session, so switching tabs does not reset it.

### 7. Compare — `StatsCompare.dc.html` (players), `CompareTeams.dc.html` (teams) — amended
- **Toolbar 52px:** Explore sub-tabs (Compare active), Players / Teams, then for players the position segmented control (QB…DEF) as before. On the right: season, week range, and Totals / Per game (players) or Totals / Per play (teams). The default is per game / per play.
- **Players:** unchanged from the earlier section (cards, metric rows, "Fantasy points by week").
- **Teams:** the same grid, `200px repeat(3, 1fr)` with a 16px gap.
  - **Column 1:** "Head to head", the range, and "Percentiles vs all 32 teams. Allowed metrics rank lower as better. Best value in each row is bold."
  - **Team card** (radius 10, 1px `--line` ring), from top to bottom:
    - A row with the series marker (10px: `--s1` circle, `--s2` square, `--s3` diamond), the record in Geist Mono 11.5px, the division place ("North 1st"), and × remove.
    - The abbreviation in Barlow Condensed 800 34px, then the full name in Geist 14px `--fg-2`, ellipsised.
    - Elo (Geist Mono 600), with "Leads n of m" on the right.
    - A swap select of all 32 teams, A–Z by abbreviation ("HAR · Harbor City Pilots"), with teams already in a slot disabled.
  - **Empty slot:** a 1.5px dashed card holding "Add a third team…", a "Choose a team" select and an Elo hint ("KNG and MRD are nearest in Elo to HAR.").
- **Metric rows (38px), grouped:**
  - Offense: EPA per play, success rate, explosive-play rate, EPA per dropback, EPA per carry, sack rate.
  - Defense: EPA per play allowed, success rate allowed, explosive-play rate allowed, pressure rate, sack rate.
  - Special teams: FG over expected, net punting average.
  - Situational: third-down %, touchdown drive rate, third-down % allowed, points per drive allowed.
- **Group header (34px):** the group name in `--fg`, then "Value · percentile · rank", with a 1px `--fg-3` rule underneath.
- **Cell:** `62px value · pill-dot bar · 30px rank ("#4")`. The leader is bold `--fg`, others `--fg-2`. The bar colour is `heatColor(percentile)`. A defensive "allowed" metric is better when lower: the engine's percentile already counts that, so its colour follows the team's side.
- **Not-published row:** a participation metric (`lastSeason: 'prior'`, e.g. pressure rate) in the current season keeps its row, reads "Not published for 2026 yet." in `--fg-3`, and is left out of Leads.
- **Chart:** "EPA per play by week · offense" with an **Offense / Defense** toggle on the right. Three series lines (2.25px) in slot colours, marked with the slot shapes (9px), and the league median per week dashed `--fg-3`, with a zero line when the range spans 0. Defense is flipped so up is better: the axis reads "EPA per play allowed ↓" and the note says "Flipped so up is better · gaps are byes".
- **Defaults:** with no seed, the top three teams by Elo; my fantasy team's NFL team gets no special treatment. From the team dashboard's **Compare** button: that team plus the two teams nearest in Elo.
- **State:** `entity` (`player` | `team`), `tIds` (3 team codes, null = empty), `tSide` (`off` | `def`), season and weeks shared with players. `now` (from `stats.status()`) decides what is "not published yet".

### 14. Trends — `Trends.dc.html`, `TrendsTeamDark.dc.html`, `TrendsOneSeason.dc.html`
One metric by season, 2019 → now, for one player or team, plus up to two more for context.
- **Toolbar 52px:** sub-tabs (Trends active), Players / Teams, a 220px search (player or team), a 230px **metric** select grouped by family (Traditional, Advanced, Next Gen, Charting, Predictive; catalogue tiers core + extended, positions filtered), Totals / Per game, and season type (Regular season / Postseason / Both).
- **Header strip:**
  - Left: the position chip (players: solid position colour, `--on-pos` text; teams: `--pos-def`), the name in Geist 700 24px, and a meta line: team (mono 600) · "age 27 · 6th season · BRK 2021–23, HAR since 2024". For teams: "North Division, 1st · 5–2 · Elo 1,642".
  - Right: series pills (28px, radius 14, `--line` ring) with the series marker, comparisons with × remove. Next comes "+ Add a comparison", a 1.5px dashed pill that opens the search scoped to the position and is hidden at 3 series. For players there is also an **Age curve** checkbox.
- **Body:** a flex row with a 24px gap. The left column holds the chart (892 × 300) and the table; on the right is a 300px **Career at a glance** rail.
- **Main chart** (radius 10, `--panel`):
  - Seasons are evenly spaced. The y-axis label sits top-left ("Yards per route run · per season"); a legend runs top-right.
  - The position's qualified **median** per season is dashed `--fg-3` 1.5px, over a **25th–75th band** (`--band`: 8% of `--fg-3`).
  - The entity's line is 2.5px `--s1`. Comparisons are 2px lines in `--s2` / `--s3` with square / diamond markers.
  - **Dots:** 11px, or 14px when hovered. A season he did not qualify is a **hollow** dot (2px `--s1` ring, `--panel` fill).
  - **Axis**, per season, from top to bottom: the season (Geist Mono 11px), "age 24" (players, when the age curve is on), and a **team-change chip** (Geist Mono 600 9.5px, 1px `--line` ring) under the first season and every season the team changed. A mid-season trade reads "BRK → HAR".
  - **Hover:** a full-height hit column per season with a 1px `--line` guide. The card (208px) shows season · team, the value (Geist Mono 600 17px) with its percentile chip, "9th of 88 qualified WRs · 84th percentile" and "15 G · 512 routes". A non-qualified season reads "Not qualified: 141 routes, below the minimum". The default hover is the last full season.
  - Lower-is-better metrics are flipped so up is better, and the label gets "↓".
- **Age curve:** a thin `--fantasy` line (1.25px, 75% opacity) of the position's typical value at the age he was each season, behind his line. *Needs engine support:* `groupBy: 'age'` (age at season start from the bio table) or a curve shipped with the models. Hidden until then.
- **Table, newest first:** Season · Team (teams: Record) · Age (players) · G · value · **Δ vs prior** · Pct · Rank · Sample.
  - Δ is toned `--good` / `--bad` by the metric's better side, with pct metrics shown as points ("+2.1 pts").
  - Pct is a soft chip, "NQ" outlined for a non-qualified season or "—" outlined when there is no data.
  - Rank reads "12th of 88". Sample reads "512 routes", prefixed "Not qualified · " where it applies.
  - A non-qualified season's row is at 55% opacity. The hovered season's row gets `--hover`.
  - The value cell reads "not charted" before a metric starts and "not published" after it stops, with "est." on estimated values.
- **Career at a glance:** the position's six core metrics:
  - WR: target share, air-yards share, YPRR, separation, route participation, fantasy points per game.
  - Teams: EPA per play, success rate, explosive-play rate, EPA per dropback, EPA per carry, touchdown drive rate.
  - Each is a `<button>` card: the label, the last value with a percentile chip (plus "(2025)" when the last value is not this season), and a note in `--warn` where one applies. On the right is a 112 × 34 sparkline of the **percentile** by season, with the dotted 50th line and the last point dotted.
  - Clicking a card makes that metric the main one; the active card gets a 1.5px `--accent` ring.
- **States:**
  - **One season:** the chart is replaced by a dashed panel: "Trends need two seasons; he has one.", a line on that season ("2026 so far: 1.74 yards per route run, 63rd percentile (28th).") and links "Compare with other rookies" and "Open his profile". The table and rail still show the one season.
  - **Metric starts later:** "Charted from 2022." (charting) or "Next Gen Stats from 2019." (ngs), in `--warn` in the chart legend. Earlier seasons stay on the axis with no point.
  - **Prior-season metrics** (`lastSeason: 'prior'`, e.g. YPRR vs man): "Not published for 2026 yet." The line ends at the prior season.
  - **Estimated current season** (routes, so YPRR and route participation): the value carries "est." and the engine's note shows under the table.
- **Entry points:** a dashboard stat line shows a 26px trend icon button on hover or focus, which opens Trends for that player or team on that metric. Seed: `{ entity, id, metric }`.

### 15. Chart explorer — `Main.dc.html`, `ChartTeamsDark.dc.html`, `ChartFew.dc.html`
Any metric against any other, players or teams.
- **Toolbar 52px:** sub-tabs (Chart active), Players / Teams, the position segmented control (players: QB RB WR TE), season, week range, Totals / Per game.
- **Left controls column (280px,** padding 20px, 1px `--line` right border, scrolls; section labels in Geist Mono 11px uppercase `--fg-3`):
  - **Presets:** 26px pill chips. The active one is `--accent` text, a 1px `--accent` ring and a 10% accent fill. Players: "Volume vs efficiency" (targets per game × YPRR), "Targets vs air yards". Teams: "Pressure vs sack rate", "Offense vs defense EPA". Choosing an axis by hand clears the active preset.
  - **Axes:** X and Y selects grouped by family, with lower-is-better options suffixed "↓". A 30 × 68px swap button with an up/down arrows icon spans both rows.
  - **Size by** and **Colour by**, side by side (None or any metric). Colour uses the diverging percentile scale (`heatColor`), with a 6px gradient key underneath ("0 · 50th · 100").
  - **Filter:** a team select; "Qualified only" (on by default); "My players" with an amber dot (players only); and a search with an icon that highlights and labels matching dots.
  - A footnote states the qualifying rule and the count.
- **Scatter (952 × 430,** radius 10, `--panel`):
  - **Gridlines** in `--line-2`; the y-axis label sits top-left ("↑ Yards per route run"), the x-axis label bottom-right ("Targets per game →").
  - **Dots:** `--accent` at 50% opacity for players and 62% for teams, 10px (13px for teams), with a 1px `--panel` ring.
  - **Rings:**
    - Mine: a 3.5px `--fantasy` ring outside a 2px `--panel` gap.
    - Searched: the same in `--fg`.
    - Hovered: the same in `--accent`.
    - Picked: 4px in `--s1/2/3`.
    - Special dots are opaque and paint last.
  - **Size by:** radius 3.5 + 6.5 × percentile.
  - **Quadrant lines:** at the qualified mean of each axis, dashed 4 4 in `--fg-3` at 70%. Corner labels in Geist 11px `--fg-3`: "High volume, efficient" (top right, weight 500), "Low volume, efficient", "High volume, inefficient", "Low volume, inefficient". For teams: "Good offense, good defense"…
  - **Lower-is-better axes are flipped** so up and right is always better, and the axis label says so ("Sack rate ↓").
  - **Labels:** searched and picked dots (600 `--fg`), mine (500 `--fg`), then the 6 most extreme dots (`--fg-3`). Teams label all 32 with abbreviations (Geist Mono 600 10.5px). Placement is greedy (right, left, above, below), skipping any label that would collide, with a 3px `--panel` text shadow.
- **Hover card (236px):** name, "HAR · WR", X and Y (and the third metric) each with value and percentile chip, then "7 G · 312 routes" and "Click to open ↗". It flips to the left of the dot in the right 40% of the plot.
- **Click** opens the player or team dashboard. **Shift-click** (or lasso) picks up to 3: the chart header then shows the series swatches, "Clear" and a cobalt "**Compare these →**" button that opens Compare seeded with them. With no picks, the header shows "Click a dot to open the dashboard · Shift-click up to 3 to compare".
- **Under the chart:** "r +0.58 as plotted" (axes oriented, so positive means better on both), "n 54 qualified WRs shown", and on the right "Dashed lines: qualified mean, 6.8 and 1.71".
- **Table (34px rows):** # · Player / Team · Team · X · Y · third metric. Headers are sort buttons ↓/↑ ordered by percentile (Player sorts A–Z), defaulting to Y, best first. Cells show the value plus a percentile chip, "est." where estimated, an amber dot on my players and an accent-tinted row for search matches.
- **States:**
  - **Too few qualifiers** (< 10): a dashed panel, "Too few qualifiers to chart", "6 TEs meet the 12-route minimum in week 1…", with "Use weeks 1–7" (primary) and "Show all 31 TEs".
  - **Metric not published for the season:** "Pressure rate is not published for 2026 yet." / "Contested catch rate starts in 2022."
  - **Loading:** the centred caps line.

## Interactions & navigation — rows to add
| From | Action | To |
|---|---|---|
| Stats nav | Explore | Explore › Chart (or the last Explore tab this session) |
| Explore | Chart / Compare / Trends | that tab, its state kept |
| Explore › Chart | dot click | player or team dashboard |
| Explore › Chart | shift-click up to 3 › Compare these → | Explore › Compare seeded with them (players: that position) |
| Explore › Chart | preset chip | that X / Y pair (and position) |
| Team dashboard | Compare | Explore › Compare › Teams: that team + the two nearest in Elo |
| Player profile | Compare | Explore › Compare › Players: that player + the top 2 others (was Players / Compare) |
| Player or team dashboard | stat line trend icon (hover / focus) | Explore › Trends on that entity and metric |
| Explore › Trends | Career at a glance card | that metric as the main one |
| Explore › Trends (one season) | Compare with other rookies | Explore › Compare seeded with him |

## State & data — lines to add
- Explore › Chart: `stats.query({ entity, metrics: [x, y, third?], scope: { seasons: [season], weeks, positions? }, transform })`, one request per axis change. Qualified only is applied client-side. My players come from `stats.ownership()`.
- Explore › Trends: the series rows (`groupBy: ['season', 'team']`), the position's qualified rows per season (p25 / median / p75 computed client-side), the bio (`stats.player`) for age, and the six core metrics for the rail.
- Explore › Compare › Teams: all row metrics plus `elo`, `wins`, `losses` for the 32 teams, and the weekly EPA (`groupBy: ['week']`) for the chart and its league median.
- Local UI state: Explore tab; Chart entity / pos / x / y / size / colour / team / qualified / mine / search / picks / sort; Trends entity / id / comparisons / metric / age toggle / hovered season; Compare `entity` and `tIds` / `tSide`.

## Files — add
Explore: `ExploreNav`, `Main` (chart), `ChartTeamsDark`, `ChartFew`, `Trends`, `TrendsTeamDark`, `TrendsOneSeason`, `CompareTeams`, `CompareTeamsDark`, `CompareTeamsOpen` (all `.dc.html`) · view-model specs: `stats-explore.js`, `stats-trends.js`, `stats-compare-teams.js` (merges into `stats-compare.js`).

## Decisions (user, 2026-10-24)
- **Red zone:** AD1 adds `off_rz_td_pct` / `def_rz_td_pct` (touchdown drives ÷ drives reaching the opponent's 20) to `catalogue.ts`; Compare › Teams shows them in Situational in place of touchdown drive rate and points per drive allowed.
- **Labels:** `def_sack_rate` → "Sack rate (defense)", `def_pressure_rate` → "Pressure rate (defense)"; ids unchanged.
- **Age curve:** later. Trends ships with the age under each season and no curve or toggle.
- **Colours:** shapes only. `--s1/2/3` stay; every series carries its marker shape (circle, square, diamond).

## Open points found while writing these
1. **No team red-zone TD rate** in `catalogue.ts`; the brief asked for "red-zone TD drive rate". Touchdown drive rate and points per drive allowed stand in. Add `off_rz_td_pct` / `def_rz_td_pct` if wanted.
2. **`def_sack_rate` and `def_pressure_rate` are labelled "… allowed"** but measure what the defense *generates* (direction higher). The label reads backwards next to the offense rows; "Sack rate (defense)" would be clearer.
3. **Pressure rate is prior-season only** (`lastSeason: 'prior'`, both sides), so the "Pressure vs sack rate" preset lands on the not-published state for the current season. Either default it to the prior season or swap in a current-season pair.
4. **Route participation is estimated, not unpublished**, in the current season. The Trends mockup now matches: route participation shows "est." for 2026, "Not published for 2026 yet." sits on YPRR vs man, and the WR glance has air-yards share in place of contested catch rate, which stays in the metric select.
5. **Age curve** needs `groupBy: 'age'` or a model-shipped curve (see §14).
6. **Colour-blind separation:** `--s1` (blue) and `--s2` (teal) are close in lightness in both themes (dark `#5d8ff2` / `#26a092`). Series also differ by marker shape (circle / square / diamond), which the specs require everywhere a series appears. A lighter or darker `--s2` would fix it in colour too.
