# Stats section — design brief

Paste into the Claude Design "FantasyCompanion UI" project when designing the Stats section. The global overhaul shipped as the Edition redesign (v0.24.0, fantasy screens, `TopNav` shell); the Stats screens are designed in the same Edition language, and this brief lists what they need from its shell and components. Full content of the section: `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §9.

## What is coming

The app gains a second way to use it: a standalone **football statistics analysis** section (players and teams, offense and defense, 2019 → today), usable even without a fantasy league. It has leaderboards, a full-page dashboard per player and per team with 7–9 tabs, a chart explorer, side-by-side comparisons, multi-season trends and matchup previews. Later, a conversational "ask a question about the data" panel.

## What the shell and components must support

1. **Navigation with two workspaces.** The `TopNav` fantasy screens (League, Rules, Players, Lineup, Trade, Waivers) and a Stats workspace with its own sub-navigation (Players, Teams, Explore, Matchups, Saved views). The Stats entry is always enabled; fantasy entries can be disabled when no league is imported.
2. **Full-page detail views** with a header (photo or team logo, identity, a few key numbers), a **tab bar of 7–9 tabs**, and a back control that returns to where you came from (a leaderboard, a chart, a fantasy screen).
3. **Global filter bar** for analysis screens: season, season type, week range, scoring preset (My league / PPR / Half / Standard), position, team. Compact, sticky, always visible.
4. **Dense data tables**: many numeric columns, sortable, sticky first column and header, column picker, tabular numerals, per-cell secondary content (a percentile bar, a small sample-size or "est." marker), row hover, export action. Comfortable at 1280×800.
5. **Stat card**: label, value, unit, percentile bar (0–100, coloured on a diverging scale), rank ("WR 7th of 82"), a reliability marker (high / medium / low), and a tooltip with a one-to-two-sentence definition and a family badge (Traditional / Advanced / Next Gen / Charting / Predictive).
6. **Chart language**: line (weekly trends), bar (distributions, shares), scatter with quadrant lines and labels (explorer), small multiples, sparkline. One palette system: categorical (up to ~8 series), sequential, diverging (for percentiles and over/under-expected), all legible in light and dark.
7. **States**: loading skeletons for tables and charts, "not enough sample" (greyed value), "estimated" (marked), "not available for this season" (e.g. participation data only through last season), and "data through week N, updated <time>".
8. **Side-by-side layouts** for compare (2–4 columns) and matchups (two teams, mirrored).
9. **Team identity**: room for team colours as accents on team pages without breaking the theme.

## Demo data

Invented players and teams only (the repo is public), as in the existing design sync.
