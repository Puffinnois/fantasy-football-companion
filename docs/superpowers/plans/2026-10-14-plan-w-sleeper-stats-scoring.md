# Plan W — Scoring from Sleeper's stats

**Status:** written 2026-10-14, not started.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score actual fantasy points from Sleeper's own weekly stat lines, with nflverse as the fallback, so the app's points equal Sleeper's for every player, team defense and scoring key. Ship `v0.23.0`.

**Architecture:**

- **Sync.** A new sync, `refreshSleeperStats`, runs right after the Sleeper sync and before nflverse. It fetches one regular-season week per step from Sleeper's unofficial stats endpoint (the host projections already use) into a new `sleeper_week_stats` table, keyed by Sleeper player id.
- **Points.** `recomputePoints` scores each stored Sleeper line with the league's rules first. Player-weeks without a Sleeper line fall back to nflverse, exactly as today. The scoring engine does not change.
- **Display.** The Players week view and the value-mode series show the line that was scored.
- **Catalogue.** Every catalogue key becomes "supported", and a new `nflverse` flag keeps the fallback's contract tests honest.

**Tech Stack:** unchanged. Electron 39, TypeScript strict, `node:sqlite`, Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-10-14-sleeper-stats-scoring-design.md` (approved 2026-10-14), amended by this plan. Task 7 writes the amendments into the spec as §7.

## Planning findings (live data, 2026-10-14)

All code in this plan was prototyped in a scratch copy of `main` (`c3dedf6`). It was then replayed one task at a time from `main`: every task's commit passes typecheck, lint and the full suite (835 → 859 tests, +5 skipped). The patches below are those commits, split into tests and source.

- **Live gate, on a copy of the dev app database.**
  - `refreshSleeperStats`: 23 steps (2025 weeks 1–18, 2026 weeks 1–5) in **5.6 s**, all ok.
  - Then `recomputePoints`: the app's points equal Sleeper's matchup `players_points` for **every rostered player in every completed week**, 256 / 256, 265 / 265, 271 / 271, 274 / 274 (2026 weeks 1–4).
  - `companion.db` grows by **4.4 MB** (120.2 → 124.5 MB).
- **Rows without `gp`** (304 of 780 in 2026 week 4, filtered positions) carry no stat at all: only `pos_rank_*`, `gms_active` and team snap counts. So "keep rows with `gp ≥ 1`" is the exact rule (amendment B).
- **`pts_*` is not all Sleeper's points.** Sleeper's own point totals are exactly `pts_std`, `pts_ppr`, `pts_half_ppr` and `pts_idp`. `pts_allow` and `pts_allow_*` are real defense stats.
  - The prototype first dropped every `pts_*` key. Its hand-worked recompute test caught that: LAR scored a shutout (14) instead of 4 sacks plus the 14–20 tier (5).
  - The mapper now drops the exact names (amendment C). Task 3's test pins it.
- **The adapter contract tests tie "supported" to the nflverse adapter.** `adapters.test.ts` checks that the nflverse adapter emits every supported key and none of the unsupported ones. Making the 24 keys supported needs a separate `nflverse` flag for what the fallback computes (amendment D).
- **`statsAvailable` gates the nflverse usage signals** (`value/build.ts` builds `PlayerSignals` only when it is true). It keeps its meaning, "has an nflverse identity" (amendment E). The user's league has no unresolved rostered player, so no visible row changes.

## Spec amendments (taken in this plan)

Task 7 Step 3 records each of these in the spec as §7. They follow from the data and code above.

- **A. The stats sync is its own function.** Spec §3.3 put the steps inside `refreshNflverse`. They run as `refreshSleeperStats` in `refreshAll` / `importAll`, after the Sleeper sync and before nflverse. `refreshNflverse` takes a new `sleeperStatsChanged` option that re-runs `app:points`. The effect is the same, and nflverse's step order and its tests stay as they are.
- **B. Rows kept: `gp ≥ 1`.** Spec §3.2 said "`gp` ≥ 1, or any non-zero scoring stat". Rows without `gp` carry no stats, so the second clause never fires.
- **C. Fields dropped: `pts_std`, `pts_ppr`, `pts_half_ppr`, `pts_idp` and `pos_rank_*`.** Spec §3.2 said "`pts_*`", which would drop points allowed.
- **D. The catalogue.** `supported` is true for every catalogue key. A new `nflverse` flag marks the keys the nflverse fallback computes, and the adapter contract tests use it. The Rules screen's note becomes "Not known to this app (scored as 0)", for keys outside the catalogue.
- **E. `statsAvailable` is unchanged.** It still means "has an nflverse identity" and still gates the usage signals. A player scored only from Sleeper gets points and a stat line but no usage signals.
- **F. First sync measured:** 23 requests in 5.6 s (the spec estimated ~45 s); the app database grows by about 4.4 MB.

## Global Constraints

- **Branch and commits.**
  - Branch `feat/sleeper-stats-scoring` off `main`.
  - One Conventional Commit per "Commit" step, first line ≤ 50 characters, imperative.
  - **No `Co-Authored-By` or "Generated with" trailers.**
- **Never stage the user's unrelated changes:** `.gitignore`, `.design-sync/`, `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts` and `tsconfig.web.tsbuildinfo`. Stage files by name; never run `git add -A` or `git add .`.
- **Patches.**
  - Each code step is a patch. Save the block to a file in the plan's workspace (`.superpowers/sdd/2026-10-14-plan-w-sleeper-stats-scoring/`) and apply it with `git apply`.
  - A patch that does not apply means the tree is not where the plan expects. Stop and compare with the task's Files list; never hand-merge silently.
  - The patches are already prettier-formatted. Still run `npx prettier --write` on the touched `.ts` / `.tsx` files before committing (never on `.json` / `.sh` / `.sql`).
  - **Never run `npm run format`.**
- **Lint** with `npx eslint src tests electron.vite.config.ts`. The full-repo `npm run lint` fails on the untracked `.design-sync/` only.
- **Engine and signals.** The engine (`scoreStatLine`, `DERIVED_STATS`) does not change. Neither do usage signals (target share, snaps, WOPR), which stay on nflverse.
- **No test touches the network.** Only the throwaway live check in Task 7 does, and it is never committed.
- **Gate (Task 7):** the app's points must equal Sleeper's matchup `players_points` for every rostered player in every completed week of the current season, within 0.01. If not, stop and report the differing players.
- **Release `v0.23.0`.**
  - The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand.
  - **Ask the user before pushing.**
- Not GUI-verifiable here (WSLg). Say so in the Status block.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test in the task that owns the code.

1. **A shutout scored as no tier.** Sleeper leaves `pts_allow` out when it is 0. → Task 4, "restores the zeros Sleeper leaves out of a defense that played" and "pays a shutout from a line without pts_allow, and the special-teams keys".
2. **Points allowed thrown away with Sleeper's own points.** Dropping every `pts_*` key would silently score every defense as a shutout. → Task 3, "keeps players who played, without Sleeper points or ranks" (asserts `pts_allow` and `pts_allow_14_20` survive); Task 4, "scores a captured week by hand-worked totals".
3. **Double counting.** A player-week with both a Sleeper and an nflverse line must score once, from Sleeper. → Task 4, "a Sleeper line wins over nflverse for its week; other weeks stay on nflverse".
4. **A retired endpoint costing 23 requests a refresh, or breaking scoring.** → Task 5, "stops after one request when the endpoint is gone". Scoring then falls back to nflverse: Task 4, the fallback test, and every existing recompute test.
5. **Points that never update after the stats change.** Sleeper stats are their own sync. If a stored week did not re-run `app:points`, the points would go stale. → Task 5, "recomputes points when Sleeper stats changed, even with fresh nflverse sources"; Task 5, `refreshAll` ordering in `refresh.test.ts`.
6. **The week in progress.** Points update during the week as Sleeper's do (spec §3.1), and the two recent weeks refresh every 6 h. → Task 5, the freshness and forced-refresh tests.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/sleeper-stats-scoring
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/sleeper-stats-scoring`.

---

### Task 1: Every catalogue key is scored; `nflverse` marks the fallback's (spec §3.7; amendment D)

**Files:**

- Modify: `src/shared/statKeys.ts`, `src/renderer/src/lib/rulesView.ts`, `src/renderer/src/screens/RulesScreen.tsx`
- Test: `tests/shared/statKeys.test.ts`, `tests/renderer/lib/rulesView.test.ts`, `tests/main/scoring/adapters.test.ts`

**Interfaces:**

- Produces: `StatKeyInfo.supported` is `true` for every catalogue key. `StatKeyInfo.nflverse: boolean` is true when the nflverse adapters compute the key. `s(key, label, category, nflverse = true)`.
- `isSupported(key)` is true for every catalogue key. `unsupportedKeys(scoring)` lists only keys outside the catalogue.

- [ ] **Step 1: Apply the test patch**

```diff
diff --git a/tests/main/scoring/adapters.test.ts b/tests/main/scoring/adapters.test.ts
index 1eafbfa..68dbc8a 100644
--- a/tests/main/scoring/adapters.test.ts
+++ b/tests/main/scoring/adapters.test.ts
@@ -143,7 +143,7 @@ describe('teamStatLine', () => {
 })

 describe('adapter contract with the stat-key catalogue', () => {
-  it('emits every supported, non-derived catalogue key from a full row', () => {
+  it('emits every nflverse, non-derived catalogue key from a full row', () => {
     const one = (cols: string[]): Record<string, number> =>
       Object.fromEntries(cols.map((c) => [c, 1]))
     const playerRow = one([...Object.values(PLAYER_STAT_MAP).flat(), 'attempts', 'completions'])
@@ -152,15 +152,15 @@ describe('adapter contract with the stat-key catalogue', () => {
       ...Object.keys(playerStatLine(playerRow)),
       ...Object.keys(teamStatLine(teamRow, { pointsAllowed: 0, yardsAllowed: 0 }))
     ])
-    const expected = STAT_KEYS.filter((k) => k.supported && !(k.key in DERIVED_STATS)).map(
+    const expected = STAT_KEYS.filter((k) => k.nflverse && !(k.key in DERIVED_STATS)).map(
       (k) => k.key
     )
     const missing = expected.filter((k) => !emitted.has(k))
     expect(missing).toEqual([])
   })

-  it('never emits a key the catalogue marks unsupported', () => {
-    const unsupported = new Set(STAT_KEYS.filter((k) => !k.supported).map((k) => k.key))
+  it('never emits a key the catalogue marks as not from nflverse', () => {
+    const unsupported = new Set(STAT_KEYS.filter((k) => !k.nflverse).map((k) => k.key))
     for (const key of [
       ...Object.keys(PLAYER_STAT_MAP),
       ...Object.keys(TEAM_STAT_MAP),
diff --git a/tests/renderer/lib/rulesView.test.ts b/tests/renderer/lib/rulesView.test.ts
index 4d5ea44..e37e74b 100644
--- a/tests/renderer/lib/rulesView.test.ts
+++ b/tests/renderer/lib/rulesView.test.ts
@@ -27,6 +27,12 @@ describe('rulesView', () => {
     expect(unsupportedKeys(scoring)).toEqual(['weird_key'])
   })

+  it('scores the keys nflverse lacks, so only unknown keys are unsupported', () => {
+    expect(unsupportedKeys({ pass_td_40p: 2, st_ff: 1, def_3_and_out: 1, weird_key: 1 })).toEqual([
+      'weird_key'
+    ])
+  })
+
   it('offers catalogue keys not yet in scoring', () => {
     const keys = addableKeys(scoring).map((k) => k.key)
     expect(keys).toContain('bonus_rec_te')
diff --git a/tests/shared/statKeys.test.ts b/tests/shared/statKeys.test.ts
index b9b4d4b..63e0005 100644
--- a/tests/shared/statKeys.test.ts
+++ b/tests/shared/statKeys.test.ts
@@ -12,10 +12,12 @@ describe('stat key catalogue', () => {
     for (const k of STAT_KEYS) expect(ids.has(k.category), k.key).toBe(true)
   })

-  it('reports support', () => {
+  it('reports support: every catalogue key, and which ones nflverse can compute', () => {
     expect(STAT_KEY_INFO.get('rec')?.label).toBe('Reception')
     expect(isSupported('rec')).toBe(true)
-    expect(isSupported('pass_td_40p')).toBe(false)
+    expect(isSupported('pass_td_40p')).toBe(true)
+    expect(STAT_KEY_INFO.get('pass_td_40p')?.nflverse).toBe(false)
+    expect(STAT_KEY_INFO.get('rec')?.nflverse).toBe(true)
     expect(isSupported('totally_unknown')).toBe(false)
   })
 })
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/shared/statKeys.test.ts tests/renderer/lib/rulesView.test.ts tests/main/scoring/adapters.test.ts`
Expected: FAIL, 3 failed / 17 passed:

- "reports support: every catalogue key, and which ones nflverse can compute" (expected false to be true);
- "scores the keys nflverse lacks, so only unknown keys are unsupported";
- "never emits a key the catalogue marks as not from nflverse" (`pass_yd`: `nflverse` does not exist yet).

- [ ] **Step 3: Apply the source patch**

```diff
diff --git a/src/renderer/src/lib/rulesView.ts b/src/renderer/src/lib/rulesView.ts
index 5318ce3..0548270 100644
--- a/src/renderer/src/lib/rulesView.ts
+++ b/src/renderer/src/lib/rulesView.ts
@@ -61,7 +61,7 @@ export function scoringGroups(scoring: Record<StatKey, number>): ScoringGroup[]
   })).filter((g) => g.rows.length > 0)
 }

-/** Keys that carry points but cannot be computed from nflverse data. */
+/** Keys that carry points but are unknown to this app (scored as 0). */
 export function unsupportedKeys(scoring: Record<StatKey, number>): StatKey[] {
   return Object.entries(scoring)
     .filter(([key, points]) => points !== 0 && !(STAT_KEY_INFO.get(key)?.supported ?? false))
diff --git a/src/renderer/src/screens/RulesScreen.tsx b/src/renderer/src/screens/RulesScreen.tsx
index b0f453c..1d297ea 100644
--- a/src/renderer/src/screens/RulesScreen.tsx
+++ b/src/renderer/src/screens/RulesScreen.tsx
@@ -252,7 +252,7 @@ export function RulesScreen({ onSaved }: RulesScreenProps = {}): React.JSX.Eleme

       {unsupported.length > 0 && (
         <p className="text-sm text-muted-foreground">
-          Not computable from nflverse data (scored as 0):{' '}
+          Not known to this app (scored as 0):{' '}
           <span className="font-mono text-xs">{unsupported.join(', ')}</span>
         </p>
       )}
diff --git a/src/shared/statKeys.ts b/src/shared/statKeys.ts
index e2718aa..c43080c 100644
--- a/src/shared/statKeys.ts
+++ b/src/shared/statKeys.ts
@@ -7,8 +7,10 @@ export interface StatKeyInfo {
   key: StatKey
   label: string
   category: StatCategory
-  /** true = computable from nflverse data (Plan C adapters). false = scores 0, listed as "unsupported". */
+  /** Scored: every catalogue key, from Sleeper's stat lines (or from nflverse when Sleeper has none). */
   supported: boolean
+  /** Computable from nflverse data (Plan C adapters), the fallback when Sleeper has no line. */
+  nflverse: boolean
 }

 export const STAT_CATEGORIES: { id: StatCategory; label: string }[] = [
@@ -23,8 +25,8 @@ export const STAT_CATEGORIES: { id: StatCategory; label: string }[] = [
   { id: 'other', label: 'Other (unknown to this app)' }
 ]

-function s(key: StatKey, label: string, category: StatCategory, supported = true): StatKeyInfo {
-  return { key, label, category, supported }
+function s(key: StatKey, label: string, category: StatCategory, nflverse = true): StatKeyInfo {
+  return { key, label, category, supported: true, nflverse }
 }

 export const STAT_KEYS: StatKeyInfo[] = [
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/shared tests/renderer/lib/rulesView.test.ts tests/main/scoring && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/shared/statKeys.ts src/renderer/src/lib/rulesView.ts src/renderer/src/screens/RulesScreen.tsx tests/shared/statKeys.test.ts tests/renderer/lib/rulesView.test.ts tests/main/scoring/adapters.test.ts
git add src/shared/statKeys.ts src/renderer/src/lib/rulesView.ts src/renderer/src/screens/RulesScreen.tsx tests/shared/statKeys.test.ts tests/renderer/lib/rulesView.test.ts tests/main/scoring/adapters.test.ts
git commit -m "feat(rules): score every catalogue stat key"
```

---

### Task 2: `getStats` and the captured weeks (spec §3.1)

**Files:**

- Modify: `src/main/sources/sleeper-types.ts`, `src/main/sources/sleeper.ts`, `tests/fixtures/sleeper.ts`
- Create: `tests/fixtures/sleeper/capture-stats.sh`, `tests/fixtures/sleeper/stats_2026_4.json`, `tests/fixtures/sleeper/stats_2025_7_kc.json`
- Test: `tests/main/sources/sleeper.test.ts`; `tests/main/sync/sleeperSync.test.ts` and `tests/main/sync/refresh.test.ts` (their full fake clients gain `getStats`)

**Interfaces:**

- Produces (`sleeper-types.ts`): `interface SleeperStatRow { player_id; season: string; week; season_type; team; opponent; stats: Record<string, number> | null }`.
- Produces (`SleeperClient`): `getStats(season: string, week: number, idp: boolean): Promise<SleeperStatRow[] | null>`. It calls `GET {projectionsBaseUrl}/stats/nfl/{season}/{week}?season_type=regular&position[]=QB…DEF`, adds `&position[]=DL&position[]=LB&position[]=DB` when `idp` is true, and returns null on 404 / 410.
- Produces (`tests/fixtures/sleeper.ts`): `statsWeek4` (real 2026 week-4 rows: 4866, 7564, 9509, 6794 (no `gp`), LAR, KC (special-teams forced fumble and recovery), 11261 (K), 96 (QB), 5012 (TE), 7865 (no stats)) and `statsKcShutout` (KC 2025 week 7, no `pts_allow`).

The fixture JSON is in the patch, as captured on 2026-10-14. `capture-stats.sh` re-captures it. Do not re-run the script during this plan: the hand-worked totals in Task 4 are built on these exact rows.

- [ ] **Step 1: Apply the test patch** (fixtures, fake clients, client tests)

```diff
diff --git a/tests/fixtures/sleeper.ts b/tests/fixtures/sleeper.ts
index 0b0e028..ecf755c 100644
--- a/tests/fixtures/sleeper.ts
+++ b/tests/fixtures/sleeper.ts
@@ -1,3 +1,4 @@
+import { readFileSync } from 'node:fs'
 import type {
   SleeperLeague,
   SleeperLeagueUser,
@@ -6,6 +7,7 @@ import type {
   SleeperPlayer,
   SleeperProjection,
   SleeperRoster,
+  SleeperStatRow,
   SleeperUser
 } from '@main/sources/sleeper-types'

@@ -315,3 +317,18 @@ export const matchups = (week: number): SleeperMatchup[] => [
     points: week < 3 ? 90 + week : 0
   }
 ]
+
+const statsFile = (name: string): SleeperStatRow[] =>
+  JSON.parse(
+    readFileSync(new URL(`./sleeper/${name}`, import.meta.url), 'utf8')
+  ) as SleeperStatRow[]
+
+/**
+ * Real 2026 week-4 stat rows (see sleeper/capture-stats.sh): 4866, 7564, 9509 and LAR are fixture
+ * players; 6794 did not play (no `gp`); KC has a special-teams forced fumble and recovery; 11261 is
+ * a kicker, 96 a QB, 5012 a TE, 7865 a row with no stats.
+ */
+export const statsWeek4: SleeperStatRow[] = statsFile('stats_2026_4.json')
+
+/** KC's 2025 week-7 shutout: no `pts_allow` key (Sleeper drops zeros), `pts_allow_0: 1`. */
+export const statsKcShutout: SleeperStatRow[] = statsFile('stats_2025_7_kc.json')
diff --git a/tests/fixtures/sleeper/capture-stats.sh b/tests/fixtures/sleeper/capture-stats.sh
new file mode 100755
index 0000000..1bc9c91
--- /dev/null
+++ b/tests/fixtures/sleeper/capture-stats.sh
@@ -0,0 +1,23 @@
+#!/usr/bin/env bash
+# Re-captures the Sleeper weekly stat fixtures from the live (unofficial) endpoint: chosen rows of
+# 2026 week 4, and KC's 2025 week 7 shutout (no `pts_allow` key: Sleeper drops zeros).
+# Usage: tests/fixtures/sleeper/capture-stats.sh   (needs curl and node)
+set -eu
+dir="$(cd "$(dirname "$0")" && pwd)"
+url=https://api.sleeper.app/stats/nfl
+pos='&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF'
+pick() { # pick SEASON WEEK OUT ID...
+  local season=$1 week=$2 out=$3
+  shift 3
+  curl -s --compressed "$url/$season/$week?season_type=regular$pos" | node -e '
+let s = ""
+process.stdin.on("data", (d) => (s += d)).on("end", () => {
+  const ids = process.argv.slice(1)
+  const rows = JSON.parse(s).filter((r) => ids.includes(r.player_id))
+  rows.sort((a, b) => ids.indexOf(a.player_id) - ids.indexOf(b.player_id))
+  process.stdout.write(JSON.stringify(rows, null, 1) + "\n")
+})' "$@" > "$dir/$out"
+}
+pick 2026 4 stats_2026_4.json 4866 7564 9509 6794 LAR KC 11261 96 5012 7865
+pick 2025 7 stats_2025_7_kc.json KC
+wc -c "$dir"/stats_*.json
diff --git a/tests/fixtures/sleeper/stats_2025_7_kc.json b/tests/fixtures/sleeper/stats_2025_7_kc.json
new file mode 100644
index 0000000..a4c7f50
--- /dev/null
+++ b/tests/fixtures/sleeper/stats_2025_7_kc.json
@@ -0,0 +1,75 @@
+[
+ {
+  "status": null,
+  "date": "2025-10-19",
+  "stats": {
+   "sack": 1,
+   "qb_hit": 2,
+   "def_forced_punts": 6,
+   "pts_allow_0": 1,
+   "pos_rank_std": 999,
+   "gp": 1,
+   "def_pr_yd": 15,
+   "penalty": 5,
+   "sack_yd": 5,
+   "tkl_ast": 16,
+   "pos_rank_half_ppr": 999,
+   "def_4_and_stop": 1,
+   "def_pr": 3,
+   "def_st_tkl_solo": 3,
+   "def_pr_ypa": 5,
+   "pts_std": 13,
+   "def_pr_lng": 11,
+   "yds_allow": 95,
+   "fan_pts_allow_def": 1,
+   "pos_rank_ppr": 999,
+   "penalty_yd": 38,
+   "def_3_and_out": 3,
+   "fan_pts_allow_qb": 1.1,
+   "fan_pts_allow_wr": 11.6,
+   "tkl_loss": 1,
+   "pts_half_ppr": 13,
+   "def_pass_def": 1,
+   "fum_rec": 1,
+   "fan_pts_allow_te": 3.3,
+   "tkl": 30,
+   "tkl_solo": 14,
+   "fan_pts_allow": 23,
+   "yds_allow_0_100": 1,
+   "td": 4,
+   "pts_ppr": 13,
+   "fan_pts_allow_rb": 7
+  },
+  "category": "stat",
+  "last_modified": 1760904546681,
+  "week": 7,
+  "season": "2025",
+  "season_type": "regular",
+  "sport": "nfl",
+  "player": {
+   "fantasy_positions": [
+    "DEF"
+   ],
+   "first_name": "Kansas City",
+   "injury_body_part": null,
+   "injury_notes": null,
+   "injury_start_date": null,
+   "injury_status": null,
+   "last_name": "Chiefs",
+   "metadata": null,
+   "news_updated": null,
+   "position": "DEF",
+   "team": "KC",
+   "team_abbr": null,
+   "team_changed_at": null,
+   "years_exp": null
+  },
+  "team": "KC",
+  "player_id": "KC",
+  "opponent": "LV",
+  "updated_at": 1760904546681,
+  "game_id": "202510716",
+  "week_shard": "7_3",
+  "company": "sportradar"
+ }
+]
diff --git a/tests/fixtures/sleeper/stats_2026_4.json b/tests/fixtures/sleeper/stats_2026_4.json
new file mode 100644
index 0000000..027f45c
--- /dev/null
+++ b/tests/fixtures/sleeper/stats_2026_4.json
@@ -0,0 +1,705 @@
+[
+ {
+  "status": null,
+  "date": "2026-10-04",
+  "stats": {
+   "h1_rec_yd": 2,
+   "rush_lng": 6,
+   "pos_rank_std": 65,
+   "gp": 1,
+   "rec_0_4": 1,
+   "tm_def_snp": 84,
+   "gms_active": 1,
+   "rec_ypt": 2,
+   "pos_rank_half_ppr": 62,
+   "pass_rush_yd": 8,
+   "pts_std": 1,
+   "rec_lng": 2,
+   "tm_st_snp": 30,
+   "rec": 1,
+   "q1_rec_yd": 2,
+   "rec_yar": 1,
+   "rush_att": 2,
+   "rush_ypa": 4,
+   "q1_rush_yd": 8,
+   "gs": 1,
+   "tm_off_snp": 61,
+   "pos_rank_ppr": 62,
+   "off_snp": 4,
+   "rush_yac": 2,
+   "h1_rush_yd": 8,
+   "pts_half_ppr": 1.5,
+   "rec_air_yd": 1,
+   "rec_ypr": 2,
+   "rush_rec_yd": 10,
+   "rush_yd": 8,
+   "bonus_rec_rb": 1,
+   "rec_tgt": 1,
+   "fum": 1,
+   "pts_ppr": 2,
+   "rec_yd": 2
+  },
+  "category": "stat",
+  "last_modified": 1791245333487,
+  "week": 4,
+  "season": "2026",
+  "season_type": "regular",
+  "sport": "nfl",
+  "player": {
+   "fantasy_positions": [
+    "RB"
+   ],
+   "first_name": "Saquon",
+   "injury_body_part": "Hamstring",
+   "injury_notes": null,
+   "injury_start_date": null,
+   "injury_status": "Questionable",
+   "last_name": "Barkley",
+   "metadata": {
+    "channel_id": "1113708717460713472",
+    "genius_id": "1007964",
+    "rookie_year": "2018"
+   },
+   "news_updated": 1792006506913,
+   "position": "RB",
+   "team": "PHI",
+   "team_abbr": null,
+   "team_changed_at": null,
+   "years_exp": 8
+  },
+  "team": "PHI",
+  "player_id": "4866",
+  "opponent": "LAR",
+  "updated_at": 1791245333487,
+  "game_id": "202610426",
+  "week_shard": "4_4",
+  "company": "sportradar"
+ },
+ {
+  "status": null,
+  "date": "2026-10-04",
+  "stats": {
+   "bonus_fd_wr": 1,
+   "bonus_rec_wr": 3,
+   "gms_active": 1,
+   "gp": 1,
+   "gs": 1,
+   "h1_rec_yd": 27,
+   "off_snp": 15,
+   "pos_rank_half_ppr": 71,
+   "pos_rank_ppr": 69,
+   "pos_rank_std": 72,
+   "pts_half_ppr": 4.2,
+   "pts_ppr": 5.7,
+   "pts_std": 2.7,
+   "q1_rec_yd": 6,
+   "rec": 3,
+   "rec_0_4": 1,
+   "rec_10_19": 1,
+   "rec_5_9": 1,
+   "rec_air_yd": 12,
+   "rec_fd": 1,
+   "rec_lng": 17,
+   "rec_tgt": 3,
+   "rec_yar": 15,
+   "rec_yd": 27,
+   "rec_ypr": 9,
+   "rec_ypt": 9,
+   "rush_rec_yd": 27,
+   "tm_def_snp": 61,
+   "tm_off_snp": 76,
+   "tm_st_snp": 23
+  },
+  "category": "stat",
+  "last_modified": 1791245325725,
+  "week": 4,
+  "season": "2026",
+  "season_type": "regular",
+  "sport": "nfl",
+  "player": {
+   "fantasy_positions": [
+    "WR"
+   ],
+   "first_name": "Ja'Marr",
+   "injury_body_part": null,
+   "injury_notes": null,
+   "injury_start_date": null,
+   "injury_status": null,
+   "last_name": "Chase",
+   "metadata": {
+    "channel_id": "1113708809265639424",
+    "genius_id": "1080256",
+    "rookie_year": "2021"
+   },
+   "news_updated": 1791807328361,
+   "position": "WR",
+   "team": "CIN",
+   "team_abbr": null,
+   "team_changed_at": null,
+   "years_exp": 5
+  },
+  "team": "CIN",
+  "player_id": "7564",
+  "opponent": "JAX",
+  "updated_at": 1791245325725,
+  "game_id": "202610407",
+  "week_shard": "4_1",
+  "company": "sportradar"
+ },
+ {
+  "status": null,
+  "date": "2026-10-05",
+  "stats": {
+   "rush_lng": 59,
+   "rush_td_lng": 59,
+   "bonus_rush_yd_100": 1,
+   "pos_rank_std": 4,
+   "gp": 1,
+   "rec_0_4": 1,
+   "tm_def_snp": 74,
+   "first_td": 1,
+   "gms_active": 1,
+   "rec_ypt": 1,
+   "pos_rank_half_ppr": 5,
+   "rush_td_50p": 1,
+   "rush_td": 2,
+   "pass_rush_yd": 145,
+   "pts_std": 26.7,
+   "rec_lng": 2,
+   "tm_st_snp": 31,
+   "bonus_rush_rec_yd_100": 1,
+   "rush_fd": 4,
+   "rec": 1,
+   "rec_yar": 1,
+   "rush_att": 19,
+   "rush_ypa": 7.63,
+   "q1_rush_yd": 78,
+   "gs": 1,
+   "tm_off_snp": 57,
+   "pos_rank_ppr": 5,
+   "rec_rz_tgt": 1,
+   "off_snp": 34,
+   "rush_yac": 45,
+   "h1_rush_yd": 103,
+   "pts_half_ppr": 27.2,
+   "rec_air_yd": 1,
+   "rec_ypr": 2,
+   "rush_rz_att": 6,
+   "rush_rec_yd": 147,
+   "anytime_tds": 2,
+   "rush_yd": 145,
+   "bonus_rec_rb": 1,
+   "rush_40p": 1,
+   "rec_tgt": 2,
+   "pts_ppr": 27.7,
+   "rec_yd": 2,
+   "rush_td_40p": 1,
+   "bonus_fd_rb": 4
+  },
+  "category": "stat",
+  "last_modified": 1791317339168,
+  "week": 4,
+  "season": "2026",
+  "season_type": "regular",
+  "sport": "nfl",
+  "player": {
+   "fantasy_positions": [
+    "RB"
+   ],
+   "first_name": "Bijan",
+   "injury_body_part": null,
+   "injury_notes": null,
+   "injury_start_date": null,
+   "injury_status": null,
+   "last_name": "Robinson",
+   "metadata": {
+    "channel_id": "1113708865150545921",
+    "genius_id": "1398582",
+    "rookie_year": "2023"
+   },
+   "news_updated": 1791814829279,
+   "position": "RB",
+   "team": "ATL",
+   "team_abbr": null,
+   "team_changed_at": null,
+   "years_exp": 3
+  },
+  "team": "ATL",
+  "player_id": "9509",
+  "opponent": "NO",
+  "updated_at": 1791317339168,
+  "game_id": "202610422",
+  "week_shard": "4_0",
+  "company": "sportradar"
+ },
+ {
+  "status": null,
+  "date": "2026-10-04",
+  "stats": {
+   "pos_rank_half_ppr": 999,
+   "pos_rank_ppr": 999,
+   "pos_rank_std": 999,
+   "tm_def_snp": 39,
+   "tm_off_snp": 78,
+   "tm_st_snp": 25
+  },
+  "category": "stat",
+  "last_modified": 1791238122191,
+  "week": 4,
+  "season": "2026",
+  "season_type": "regular",
+  "sport": "nfl",
+  "player": {
+   "fantasy_positions": [
+    "WR"
+   ],
+   "first_name": "Justin",
+   "injury_body_part": null,
+   "injury_notes": null,
+   "injury_start_date": null,
+   "injury_status": null,
+   "last_name": "Jefferson",
+   "metadata": {
+    "channel_id": "1113708708145164288",
+    "genius_id": "1080267",
+    "rookie_year": "2020"
+   },
+   "news_updated": 1791772221641,
+   "position": "WR",
+   "team": "MIN",
+   "team_abbr": null,
+   "team_changed_at": null,
+   "years_exp": 6
+  },
+  "team": "MIN",
+  "player_id": "6794",
+  "opponent": "MIA",
+  "updated_at": 1791238122191,
+  "game_id": "202610420",
+  "week_shard": "4_1",
+  "company": "sportradar"
+ },
+ {
+  "status": null,
+  "date": "2026-10-04",
+  "stats": {
+   "sack": 4,
+   "qb_hit": 7,
+   "def_forced_punts": 7,
+   "pos_rank_std": 999,
+   "gp": 1,
+   "def_pr_yd": 30,
+   "penalty": 8,
+   "sack_yd": 25,
+   "tkl_ast": 21,
+   "pos_rank_half_ppr": 999,
+   "def_kr_yd": 89,
+   "pts_allow": 20,
+   "def_4_and_stop": 3,
+   "def_pr": 4,
+   "fan_pts_allow_k": 10,
+   "def_st_tkl_solo": 3,
+   "def_pr_ypa": 7.5,
+   "pts_std": 6,
+   "ff": 1,
+   "def_kr_ypa": 22.25,
+   "pts_allow_14_20": 1,
+   "def_pr_lng": 15,
+   "tkl_solo_misc": 2,
+   "yds_allow": 172,
+   "fan_pts_allow_def": 5,
+   "def_kr": 4,
+   "pos_rank_ppr": 999,
+   "def_kr_lng": 24,
+   "penalty_yd": 100,
+   "def_3_and_out": 6,
+   "fan_pts_allow_qb": 13.52,
+   "fan_pts_allow_wr": 28.8,
+   "tkl_loss": 4,
+   "pts_half_ppr": 6,
+   "def_pass_def": 3,
+   "fan_pts_allow_te": 3.3,
+   "tkl": 51,
+   "tkl_solo": 30,
+   "yds_allow_100_199": 1,
+   "fan_pts_allow": 65.42,
+   "td": 3,
+   "pts_ppr": 6,
+   "fan_pts_allow_rb": 9.8
+  },
+  "category": "stat",
+  "last_modified": 1791148105564,
+  "week": 4,
+  "season": "2026",
+  "season_type": "regular",
+  "sport": "nfl",
+  "player": {
+   "fantasy_positions": [
+    "DEF"
+   ],
+   "first_name": "Los Angeles",
+   "injury_body_part": null,
+   "injury_notes": null,
+   "injury_start_date": null,
+   "injury_status": null,
+   "last_name": "Rams",
+   "metadata": null,
+   "news_updated": null,
+   "position": "DEF",
+   "team": "LAR",
+   "team_abbr": null,
+   "team_changed_at": null,
+   "years_exp": null
+  },
+  "team": "LAR",
+  "player_id": "LAR",
+  "opponent": "PHI",
+  "updated_at": 1791148105564,
+  "game_id": "202610426",
+  "week_shard": "4_2",
+  "company": "sportradar"
+ },
+ {
+  "status": null,
+  "date": "2026-10-04",
+  "stats": {
+   "qb_hit": 10,
+   "def_forced_punts": 3,
+   "pos_rank_std": 999,
+   "gp": 1,
+   "def_pr_yd": 27,
+   "penalty": 8,
+   "yds_allow_400_449": 1,
+   "tkl_ast": 35,
+   "pos_rank_half_ppr": 999,
+   "def_kr_yd": 87,
+   "pts_allow": 27,
+   "def_4_and_stop": 1,
+   "def_pr": 2,
+   "fan_pts_allow_k": 16,
+   "def_st_tkl_solo": 5,
+   "def_pr_ypa": 13.5,
+   "pts_std": 4,
+   "int_ret_yd": 3,
+   "def_kr_ypa": 21.75,
+   "def_pr_lng": 27,
+   "int": 1,
+   "def_st_fum_rec": 1,
+   "yds_allow": 437,
+   "fan_pts_allow_def": 1,
+   "pts_allow_21_27": 1,
+   "def_kr": 4,
+   "pos_rank_ppr": 999,
+   "def_kr_lng": 27,
+   "penalty_yd": 59,
+   "fan_pts_allow_qb": 23.6,
+   "fan_pts_allow_wr": 15.9,
+   "tkl_loss": 7,
+   "pts_half_ppr": 4,
+   "def_pass_def": 8,
+   "fan_pts_allow_te": 48,
+   "tkl": 73,
+   "tkl_solo": 38,
+   "fan_pts_allow": 126.3,
+   "td": 4,
+   "pts_ppr": 4,
+   "def_st_ff": 1,
+   "fan_pts_allow_rb": 22.8
+  },
+  "category": "stat",
+  "last_modified": 1791158910558,
+  "week": 4,
+  "season": "2026",
+  "season_type": "regular",
+  "sport": "nfl",
+  "player": {
+   "fantasy_positions": [
+    "DEF"
+   ],
+   "first_name": "Kansas City",
+   "injury_body_part": null,
+   "injury_notes": null,
+   "injury_start_date": null,
+   "injury_status": null,
+   "last_name": "Chiefs",
+   "metadata": null,
+   "news_updated": null,
+   "position": "DEF",
+   "team": "KC",
+   "team_abbr": null,
+   "team_changed_at": null,
+   "years_exp": null
+  },
+  "team": "KC",
+  "player_id": "KC",
+  "opponent": "LV",
+  "updated_at": 1791158910558,
+  "game_id": "202610425",
+  "week_shard": "4_4",
+  "company": "sportradar"
+ },
+ {
+  "status": null,
+  "date": "2026-10-01",
+  "stats": {
+   "fga": 2,
+   "fgm": 2,
+   "fgm_40_49": 1,
+   "fgm_50_59": 1,
+   "fgm_50p": 1,
+   "fgm_lng": 56,
+   "fgm_pct": 100,
+   "fgm_yds": 100,
+   "fgm_yds_over_30": 40,
+   "gms_active": 1,
+   "gp": 1,
+   "kick_pts": 9,
+   "pos_rank_half_ppr": 999,
+   "pos_rank_ppr": 999,
+   "pos_rank_std": 999,
+   "pts_half_ppr": 12,
+   "pts_ppr": 12,
+   "pts_std": 12,
+   "st_snp": 11,
+   "tm_def_snp": 72,
+   "tm_off_snp": 64,
+   "tm_st_snp": 28,
+   "xpa": 3,
+   "xpm": 3
+  },
+  "category": "stat",
+  "last_modified": 1790953706968,
+  "week": 4,
+  "season": "2026",
+  "season_type": "regular",
+  "sport": "nfl",
+  "player": {
+   "fantasy_positions": [
+    "K"
+   ],
+   "first_name": "Andre",
+   "injury_body_part": null,
+   "injury_notes": null,
+   "injury_start_date": null,
+   "injury_status": null,
+   "last_name": "Szmyt",
+   "metadata": {
+    "channel_id": "1116852669667868672",
+    "genius_id": "1017617",
+    "rookie_year": "2023",
+    "years_exp_shift": "1"
+   },
+   "news_updated": 1791816928458,
+   "position": "K",
+   "team": "CLE",
+   "team_abbr": null,
+   "team_changed_at": null,
+   "years_exp": 4
+  },
+  "team": "CLE",
+  "player_id": "11261",
+  "opponent": "PIT",
+  "updated_at": 1790953706968,
+  "game_id": "202610408",
+  "week_shard": "4_5",
+  "company": "sportradar"
+ },
+ {
+  "status": null,
+  "date": "2026-10-01",
+  "stats": {
+   "h1_pass_yd": 138,
+   "pass_int": 2,
+   "pass_air_yd": 164,
+   "pos_rank_std": 3,
+   "gp": 1,
+   "tm_def_snp": 64,
+   "gms_active": 1,
+   "pass_sack_yds": 30,
+   "q1_pass_yd": 69,
+   "pos_rank_half_ppr": 3,
+   "pass_ypc": 13.59,
+   "pass_lng": 49,
+   "pass_rush_yd": 299,
+   "pts_std": 23.96,
+   "tm_st_snp": 28,
+   "pass_rtg": 83.2,
+   "pass_att": 40,
+   "pass_rz_att": 8,
+   "gs": 1,
+   "tm_off_snp": 72,
+   "pos_rank_ppr": 3,
+   "pass_sack": 5,
+   "off_snp": 72,
+   "pass_cmp": 22,
+   "cmp_pct": 55,
+   "rush_2pt": 1,
+   "pts_half_ppr": 23.96,
+   "pass_ypa": 7.47,
+   "pass_cmp_40p": 2,
+   "pass_fd": 8,
+   "pass_yd": 299,
+   "pass_td": 3,
+   "bonus_fd_qb": 8,
+   "pass_td_lng": 21,
+   "pts_ppr": 23.96,
+   "pass_inc": 18
+  },
+  "category": "stat",
+  "last_modified": 1791245325724,
+  "week": 4,
+  "season": "2026",
+  "season_type": "regular",
+  "sport": "nfl",
+  "player": {
+   "fantasy_positions": [
+    "QB"
+   ],
+   "first_name": "Aaron",
+   "injury_body_part": null,
+   "injury_notes": null,
+   "injury_start_date": null,
+   "injury_status": null,
+   "last_name": "Rodgers",
+   "metadata": {
+    "channel_id": "1113708741519241216",
+    "genius_id": "165525",
+    "rookie_year": "2005"
+   },
+   "news_updated": 1791859807202,
+   "position": "QB",
+   "team": "PIT",
+   "team_abbr": null,
+   "team_changed_at": null,
+   "years_exp": 21
+  },
+  "team": "PIT",
+  "player_id": "96",
+  "opponent": "CLE",
+  "updated_at": 1791245325724,
+  "game_id": "202610408",
+  "week_shard": "4_2",
+  "company": "sportradar"
+ },
+ {
+  "status": null,
+  "date": "2026-10-04",
+  "stats": {
+   "h1_rec_yd": 21,
+   "bonus_rec_te": 5,
+   "pos_rank_std": 11,
+   "gp": 1,
+   "rec_0_4": 1,
+   "tm_def_snp": 64,
+   "gms_active": 1,
+   "penalty": 1,
+   "rec_td": 1,
+   "rec_ypt": 4.5,
+   "pos_rank_half_ppr": 9,
+   "st_snp": 1,
+   "pts_std": 8.7,
+   "rec_lng": 7,
+   "tm_st_snp": 26,
+   "rec": 5,
+   "rec_yar": 1,
+   "rec_fd": 1,
+   "rec_5_9": 4,
+   "gs": 1,
+   "tm_off_snp": 64,
+   "pos_rank_ppr": 8,
+   "rec_rz_tgt": 2,
+   "penalty_yd": 5,
+   "off_snp": 37,
+   "pts_half_ppr": 11.2,
+   "rec_air_yd": 26,
+   "rec_ypr": 5.4,
+   "rec_td_lng": 3,
+   "rush_rec_yd": 27,
+   "anytime_tds": 1,
+   "rec_tgt": 6,
+   "pts_ppr": 13.7,
+   "rec_yd": 27,
+   "bonus_fd_te": 1
+  },
+  "category": "stat",
+  "last_modified": 1791245322100,
+  "week": 4,
+  "season": "2026",
+  "season_type": "regular",
+  "sport": "nfl",
+  "player": {
+   "fantasy_positions": [
+    "TE"
+   ],
+   "first_name": "Mark",
+   "injury_body_part": null,
+   "injury_notes": null,
+   "injury_start_date": null,
+   "injury_status": null,
+   "last_name": "Andrews",
+   "metadata": {
+    "channel_id": "1113708865469313024",
+    "genius_id": "1013950",
+    "rookie_year": "2018"
+   },
+   "news_updated": 1791813928899,
+   "position": "TE",
+   "team": "BAL",
+   "team_abbr": null,
+   "team_changed_at": null,
+   "years_exp": 8
+  },
+  "team": "BAL",
+  "player_id": "5012",
+  "opponent": "TEN",
+  "updated_at": 1791245322100,
+  "game_id": "202610403",
+  "week_shard": "4_5",
+  "company": "sportradar"
+ },
+ {
+  "status": null,
+  "date": "2026-10-01",
+  "stats": {
+   "gms_active": 1,
+   "pos_rank_half_ppr": 999,
+   "pos_rank_ppr": 999,
+   "pos_rank_std": 999
+  },
+  "category": "stat",
+  "last_modified": 1790900148314,
+  "week": 4,
+  "season": "2026",
+  "season_type": "regular",
+  "sport": "nfl",
+  "player": {
+   "fantasy_positions": [
+    "WR"
+   ],
+   "first_name": "Brandon",
+   "injury_body_part": null,
+   "injury_notes": null,
+   "injury_start_date": null,
+   "injury_status": null,
+   "last_name": "Smith",
+   "metadata": {
+    "channel_id": "1116853425632444416",
+    "genius_id": "1006841",
+    "rookie_year": "2021"
+   },
+   "news_updated": 1791864607456,
+   "position": "WR",
+   "team": "PIT",
+   "team_abbr": null,
+   "team_changed_at": null,
+   "years_exp": 5
+  },
+  "team": "PIT",
+  "player_id": "7865",
+  "opponent": "CLE",
+  "updated_at": 1790900148314,
+  "game_id": "202610408",
+  "week_shard": "4_5",
+  "company": "sportradar"
+ }
+]
diff --git a/tests/main/sources/sleeper.test.ts b/tests/main/sources/sleeper.test.ts
index df12269..1b1d702 100644
--- a/tests/main/sources/sleeper.test.ts
+++ b/tests/main/sources/sleeper.test.ts
@@ -110,6 +110,30 @@ describe('createSleeperClient', () => {
     await expect(denied.getProjections('2026', 1)).rejects.toThrow(/403/)
   })

+  it('getStats hits the projections host with the same positions, plus IDP when asked', async () => {
+    const fetchImpl = fakeFetch([
+      { status: 200, body: fx.statsWeek4 },
+      { status: 200, body: [] }
+    ])
+    const client = createSleeperClient({ fetchImpl })
+    expect(await client.getStats('2026', 4, false)).toHaveLength(fx.statsWeek4.length)
+    await client.getStats('2026', 4, true)
+    const base =
+      'https://api.sleeper.app/stats/nfl/2026/4?season_type=regular&position[]=QB&position[]=RB&position[]=WR&position[]=TE&position[]=K&position[]=DEF'
+    expect(fetchImpl).toHaveBeenNthCalledWith(1, base, expect.anything())
+    expect(fetchImpl).toHaveBeenNthCalledWith(
+      2,
+      `${base}&position[]=DL&position[]=LB&position[]=DB`,
+      expect.anything()
+    )
+  })
+
+  it('getStats returns null when the endpoint is gone (404/410)', async () => {
+    const gone = createSleeperClient({ fetchImpl: fakeFetch([{ status: 404 }, { status: 410 }]) })
+    expect(await gone.getStats('2026', 4, false)).toBeNull()
+    expect(await gone.getStats('2026', 4, false)).toBeNull()
+  })
+
   it('getMatchups hits /league/{id}/matchups/{week} and maps an empty week to []', async () => {
     const fetchImpl = fakeFetch([
       { status: 200, body: fx.matchups(3) },
diff --git a/tests/main/sync/refresh.test.ts b/tests/main/sync/refresh.test.ts
index e294699..9591681 100644
--- a/tests/main/sync/refresh.test.ts
+++ b/tests/main/sync/refresh.test.ts
@@ -22,6 +22,7 @@ describe('refreshAll / importAll', () => {
     getAllPlayers: vi.fn(async () => fx.players),
     getNflState: vi.fn(async () => fx.nflState),
     getProjections: vi.fn(async () => []),
+    getStats: vi.fn(async () => []),
     getMatchups: vi.fn(async () => []),
     getTrendingAdds: vi.fn(async () => [{ player_id: '4866', count: 12 }])
   }
diff --git a/tests/main/sync/sleeperSync.test.ts b/tests/main/sync/sleeperSync.test.ts
index 311ae19..c14b437 100644
--- a/tests/main/sync/sleeperSync.test.ts
+++ b/tests/main/sync/sleeperSync.test.ts
@@ -35,6 +35,7 @@ function fakeClient(overrides: Partial<SleeperClient> = {}): SleeperClient {
     getProjections: vi.fn(async (_season: string, week: number) =>
       week === 1 ? fx.projections : []
     ),
+    getStats: vi.fn(async () => []),
     getMatchups: vi.fn(async (_leagueId: string, week: number) => fx.matchups(week)),
     getTrendingAdds: vi.fn(async () => []),
     ...overrides
```

Then `chmod +x tests/fixtures/sleeper/capture-stats.sh`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/main/sources/sleeper.test.ts tests/main/sync`
Expected: FAIL, 2 failed: "getStats hits the projections host with the same positions, plus IDP when asked" and "getStats returns null when the endpoint is gone (404/410)" (`client.getStats is not a function`). `npm run typecheck:node` reports 7 errors (`getStats` / `SleeperStatRow` do not exist).

- [ ] **Step 3: Apply the source patch**

```diff
diff --git a/src/main/sources/sleeper-types.ts b/src/main/sources/sleeper-types.ts
index cc3a814..40ff015 100644
--- a/src/main/sources/sleeper-types.ts
+++ b/src/main/sources/sleeper-types.ts
@@ -103,6 +103,20 @@ export interface SleeperProjection {
   stats: Record<string, number> | null
 }

+/**
+ * `GET /stats/nfl/{season}/{week}` (unofficial): one player-week of actual stats in Sleeper's own
+ * keys. Team defenses have the team code as `player_id`. `stats` leaves out every zero.
+ */
+export interface SleeperStatRow {
+  player_id: string
+  season: string
+  week: number
+  season_type: string
+  team: string | null
+  opponent: string | null
+  stats: Record<string, number> | null
+}
+
 /** `GET /players/nfl/trending/add`: most-added players across all Sleeper leagues over the lookback. */
 export interface SleeperTrendingPlayer {
   player_id: string
diff --git a/src/main/sources/sleeper.ts b/src/main/sources/sleeper.ts
index 6b1f7ae..99672fb 100644
--- a/src/main/sources/sleeper.ts
+++ b/src/main/sources/sleeper.ts
@@ -6,6 +6,7 @@ import type {
   SleeperPlayer,
   SleeperProjection,
   SleeperRoster,
+  SleeperStatRow,
   SleeperTrendingPlayer,
   SleeperUser
 } from './sleeper-types'
@@ -20,6 +21,11 @@ export interface SleeperClient {
   getNflState(): Promise<SleeperNflState>
   /** Unofficial weekly projections; `null` when the endpoint is gone (404/410). */
   getProjections(season: string, week: number): Promise<SleeperProjection[] | null>
+  /**
+   * Unofficial weekly actual stats (Sleeper stats scoring spec §3.1), same host and positions as
+   * projections, plus DL / LB / DB when `idp`; `null` when the endpoint is gone (404/410).
+   */
+  getStats(season: string, week: number, idp: boolean): Promise<SleeperStatRow[] | null>
   /** Weekly matchups (documented endpoint); `[]` for a week Sleeper has none for yet (playoffs before the bracket). */
   getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]>
   /** Most-added players across all Sleeper leagues over the last 24 h (slice 6c spec §5.1). */
@@ -46,9 +52,10 @@ export interface SleeperClientOptions {
   retryDelayMs?: number
 }

-const PROJECTION_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
-  .map((p) => `&position[]=${p}`)
-  .join('')
+const positionFilter = (positions: string[]): string =>
+  positions.map((p) => `&position[]=${p}`).join('')
+const PROJECTION_POSITIONS = positionFilter(['QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
+const IDP_POSITIONS = positionFilter(['DL', 'LB', 'DB'])

 const TRENDING_LOOKBACK_HOURS = 24
 const TRENDING_LIMIT = 100
@@ -103,6 +110,11 @@ export function createSleeperClient(options: SleeperClientOptions = {}): Sleeper
         `/projections/nfl/${encodeURIComponent(season)}/${week}?season_type=regular${PROJECTION_POSITIONS}`,
         projectionsBaseUrl
       ),
+    getStats: (season, week, idp) =>
+      getJson<SleeperStatRow[]>(
+        `/stats/nfl/${encodeURIComponent(season)}/${week}?season_type=regular${PROJECTION_POSITIONS}${idp ? IDP_POSITIONS : ''}`,
+        projectionsBaseUrl
+      ),
     getMatchups: async (leagueId, week) =>
       (await getJson<SleeperMatchup[]>(
         `/league/${encodeURIComponent(leagueId)}/matchups/${week}`
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/sources/sleeper.test.ts tests/main/sync && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/sources/sleeper-types.ts src/main/sources/sleeper.ts tests/fixtures/sleeper.ts tests/main/sources/sleeper.test.ts tests/main/sync/sleeperSync.test.ts tests/main/sync/refresh.test.ts
git add src/main/sources/sleeper-types.ts src/main/sources/sleeper.ts tests/fixtures/sleeper.ts tests/fixtures/sleeper/capture-stats.sh tests/fixtures/sleeper/stats_2026_4.json tests/fixtures/sleeper/stats_2025_7_kc.json tests/main/sources/sleeper.test.ts tests/main/sync/sleeperSync.test.ts tests/main/sync/refresh.test.ts
git commit -m "feat(sleeper): fetch weekly stat lines"
```

---

### Task 3: `sleeper_week_stats` and the mapper (spec §3.2; amendments B, C)

**Files:**

- Create: `src/main/db/migrations/010_sleeper_stats.sql`, `src/main/db/repos/sleeperStats.ts`
- Modify: `src/main/db/migrations/index.ts`, `src/main/sync/mappers.ts`
- Test: `tests/main/db/sleeperStatsRepo.test.ts`, `tests/main/db/migrate.test.ts`, `tests/main/sync/mappers.test.ts`

**Interfaces:**

- Consumes: `SleeperStatRow`, `fx.statsWeek4` (Task 2).
- Produces (`repos/sleeperStats.ts`):
  - `interface SleeperStatsRecord { playerId; season; week; team; opponent; stats: Record<string, number> }`;
  - `replaceSleeperStats(db, season, week, records, updatedAt): number` (full replace of one week; wrap in `withTransaction`);
  - `listSleeperStats(db)`, `listSleeperStatsByWeek(db, season, week)`, `listSleeperStatsBySeason(db, season)`.
- Produces (`mappers.ts`): `mapSleeperStats(items, season, week): { records: SleeperStatsRecord[]; skipped: number }`.
  - It keeps regular-season rows of exactly (season, week) with `gp ≥ 1`.
  - It drops `pts_std`, `pts_ppr`, `pts_half_ppr`, `pts_idp` and `pos_rank_*`, plus any value that is not a number.
  - `skipped` counts rows of another week, season or season type, or without `stats`.
- Migration version 10 (`sleeper_stats`).

- [ ] **Step 1: Apply the test patch**

```diff
diff --git a/tests/main/db/migrate.test.ts b/tests/main/db/migrate.test.ts
index 9111dad..e783c2d 100644
--- a/tests/main/db/migrate.test.ts
+++ b/tests/main/db/migrate.test.ts
@@ -12,7 +12,7 @@ describe('migrate', () => {
         name: string
       }[]
     ).map((r) => r.name)
-    expect(version).toBe(9)
+    expect(version).toBe(10)
     expect(tables).toEqual(
       expect.arrayContaining([
         'app_settings',
@@ -37,6 +37,7 @@ describe('migrate', () => {
         'expert_ranks',
         'market_values',
         'trending_adds',
+        'sleeper_week_stats',
         'schema_version'
       ])
     )
@@ -47,7 +48,7 @@ describe('migrate', () => {
     migrate(db)
     expect(() => migrate(db)).not.toThrow()
     const row = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number }
-    expect(row.n).toBe(9)
+    expect(row.n).toBe(10)
   })

   it('005 adds crosswalk.fantasypros_id and forgets the crosswalk step so it is re-downloaded', () => {
@@ -69,7 +70,7 @@ describe('migrate', () => {
        VALUES ('nflverse:crosswalk', 't', 't', 'ok', NULL, 10), ('nflverse:games', 't', 't', 'ok', NULL, 1)`
     ).run()

-    expect(migrate(db)).toBe(9)
+    expect(migrate(db)).toBe(10)
     const columns = (db.prepare('PRAGMA table_info(crosswalk)').all() as { name: string }[]).map(
       (c) => c.name
     )
diff --git a/tests/main/db/sleeperStatsRepo.test.ts b/tests/main/db/sleeperStatsRepo.test.ts
new file mode 100644
index 0000000..68dcfa3
--- /dev/null
+++ b/tests/main/db/sleeperStatsRepo.test.ts
@@ -0,0 +1,40 @@
+import { beforeEach, describe, expect, it } from 'vitest'
+import { openDatabase, type Db } from '@main/db/connection'
+import { migrate } from '@main/db/migrate'
+import {
+  listSleeperStats,
+  listSleeperStatsBySeason,
+  listSleeperStatsByWeek,
+  replaceSleeperStats,
+  type SleeperStatsRecord
+} from '@main/db/repos/sleeperStats'
+
+const line = (playerId: string, season: number, week: number, rec: number): SleeperStatsRecord => ({
+  playerId,
+  season,
+  week,
+  team: 'PHI',
+  opponent: 'DAL',
+  stats: { gp: 1, rec }
+})
+
+describe('sleeper_week_stats repo', () => {
+  let db: Db
+  beforeEach(() => {
+    db = openDatabase(':memory:')
+    migrate(db)
+  })
+
+  it('replaces one week at a time and reads by week, season or all', () => {
+    replaceSleeperStats(db, 2026, 1, [line('a', 2026, 1, 1), line('b', 2026, 1, 2)], 't')
+    replaceSleeperStats(db, 2026, 2, [line('a', 2026, 2, 3)], 't')
+    replaceSleeperStats(db, 2025, 1, [line('a', 2025, 1, 4)], 't')
+    expect(replaceSleeperStats(db, 2026, 1, [line('b', 2026, 1, 5)], 't')).toBe(1)
+    expect(listSleeperStatsByWeek(db, 2026, 1)).toEqual([line('b', 2026, 1, 5)])
+    expect(listSleeperStatsBySeason(db, 2026).map((r) => [r.playerId, r.week])).toEqual([
+      ['b', 1],
+      ['a', 2]
+    ])
+    expect(listSleeperStats(db)).toHaveLength(3)
+  })
+})
diff --git a/tests/main/sync/mappers.test.ts b/tests/main/sync/mappers.test.ts
index 1c57a98..31a430f 100644
--- a/tests/main/sync/mappers.test.ts
+++ b/tests/main/sync/mappers.test.ts
@@ -5,6 +5,7 @@ import {
   mapNflState,
   mapPlayers,
   mapProjections,
+  mapSleeperStats,
   mapRosterPlayers,
   mapRules,
   mapTeams
@@ -238,6 +239,53 @@ describe('mapProjections', () => {
   })
 })

+describe('mapSleeperStats (Sleeper stats scoring spec §3.2)', () => {
+  it('keeps players who played, without Sleeper points or ranks', () => {
+    const { records, skipped } = mapSleeperStats(fx.statsWeek4, 2026, 4)
+    expect(skipped).toBe(0)
+    // 6794 (did not play) and 7865 (no stats) have no `gp`
+    expect(records.map((r) => r.playerId)).toEqual([
+      '4866',
+      '7564',
+      '9509',
+      'LAR',
+      'KC',
+      '11261',
+      '96',
+      '5012'
+    ])
+    const barkley = records[0]
+    expect(barkley).toMatchObject({ season: 2026, week: 4, team: 'PHI', opponent: 'LAR' })
+    expect(barkley.stats).toMatchObject({ gp: 1, rush_att: 2, rush_yd: 8, rec: 1, rec_0_4: 1 })
+    const dropped = /^(pts_(std|ppr|half_ppr|idp)|pos_rank_)/
+    for (const r of records) expect(Object.keys(r.stats).filter((k) => dropped.test(k))).toEqual([])
+    // points allowed is a real stat, not one of Sleeper's point totals
+    expect(records.find((r) => r.playerId === 'LAR')?.stats).toMatchObject({
+      pts_allow: 20,
+      pts_allow_14_20: 1
+    })
+    expect(records.find((r) => r.playerId === 'KC')?.stats).toMatchObject({
+      def_st_ff: 1,
+      def_st_fum_rec: 1
+    })
+  })
+
+  it('skips rows of another week, season or season type', () => {
+    const row = fx.statsWeek4[0]
+    const { records, skipped } = mapSleeperStats(
+      [
+        { ...row, week: 3 },
+        { ...row, season: '2025' },
+        { ...row, season_type: 'post' },
+        { ...row, stats: null }
+      ],
+      2026,
+      4
+    )
+    expect([records, skipped]).toEqual([[], 4])
+  })
+})
+
 describe('mapPlayers injury detail (ROS realism spec §2)', () => {
   it('carries status, body part and notes', () => {
     const [row] = mapPlayers({
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/main/db tests/main/sync/mappers.test.ts`
Expected: FAIL.

- `sleeperStatsRepo.test.ts` cannot find `@main/db/repos/sleeperStats`.
- `mapSleeperStats` is not exported: "keeps players who played, without Sleeper points or ranks" and "skips rows of another week, season or season type" fail.
- `migrate.test.ts` expected 9 to be 10, in three tests.

- [ ] **Step 3: Apply the source patch**

```diff
diff --git a/src/main/db/migrations/010_sleeper_stats.sql b/src/main/db/migrations/010_sleeper_stats.sql
new file mode 100644
index 0000000..94548ab
--- /dev/null
+++ b/src/main/db/migrations/010_sleeper_stats.sql
@@ -0,0 +1,13 @@
+-- Sleeper stats scoring spec §3.2: one Sleeper stat line per player-week, as Sleeper publishes it
+-- (zeros are absent upstream). Team defenses use the team code, their `players.player_id`.
+CREATE TABLE sleeper_week_stats (
+  player_id TEXT NOT NULL,
+  season INTEGER NOT NULL,
+  week INTEGER NOT NULL,
+  team TEXT,
+  opponent TEXT,
+  stats_json TEXT NOT NULL,
+  updated_at TEXT NOT NULL,
+  PRIMARY KEY (player_id, season, week)
+);
+CREATE INDEX idx_sleeper_week_stats_week ON sleeper_week_stats(season, week);
diff --git a/src/main/db/migrations/index.ts b/src/main/db/migrations/index.ts
index 976d71e..17b020a 100644
--- a/src/main/db/migrations/index.ts
+++ b/src/main/db/migrations/index.ts
@@ -7,6 +7,7 @@ import matchupsSql from './006_matchups.sql?raw'
 import injurySql from './007_injury.sql?raw'
 import rosSnapshotsSql from './008_ros_snapshots.sql?raw'
 import waiversSql from './009_waivers.sql?raw'
+import sleeperStatsSql from './010_sleeper_stats.sql?raw'

 export interface Migration {
   version: number
@@ -23,5 +24,6 @@ export const migrations: Migration[] = [
   { version: 6, name: 'matchups', sql: matchupsSql },
   { version: 7, name: 'injury', sql: injurySql },
   { version: 8, name: 'ros_snapshots', sql: rosSnapshotsSql },
-  { version: 9, name: 'waivers', sql: waiversSql }
+  { version: 9, name: 'waivers', sql: waiversSql },
+  { version: 10, name: 'sleeper_stats', sql: sleeperStatsSql }
 ]
diff --git a/src/main/db/repos/sleeperStats.ts b/src/main/db/repos/sleeperStats.ts
new file mode 100644
index 0000000..2914bc4
--- /dev/null
+++ b/src/main/db/repos/sleeperStats.ts
@@ -0,0 +1,75 @@
+import type { Db } from '../connection'
+
+/** One player-week of Sleeper's actual stats (Sleeper stats scoring spec §3.2). */
+export interface SleeperStatsRecord {
+  /** Sleeper player id; team defenses use the team code. */
+  playerId: string
+  season: number
+  week: number
+  team: string | null
+  opponent: string | null
+  /** Sleeper stat keys → value; zeros are absent, as Sleeper publishes them. */
+  stats: Record<string, number>
+}
+
+interface Row {
+  player_id: string
+  season: number
+  week: number
+  team: string | null
+  opponent: string | null
+  stats_json: string
+}
+
+const SELECT = 'SELECT player_id, season, week, team, opponent, stats_json FROM sleeper_week_stats'
+
+const toRecord = (r: Row): SleeperStatsRecord => ({
+  playerId: r.player_id,
+  season: r.season,
+  week: r.week,
+  team: r.team,
+  opponent: r.opponent,
+  stats: JSON.parse(r.stats_json) as Record<string, number>
+})
+
+/** Full replace of one week. Wrap in `withTransaction`. */
+export function replaceSleeperStats(
+  db: Db,
+  season: number,
+  week: number,
+  records: SleeperStatsRecord[],
+  updatedAt: string
+): number {
+  db.prepare('DELETE FROM sleeper_week_stats WHERE season = ? AND week = ?').run(season, week)
+  const insert = db.prepare(
+    `INSERT OR REPLACE INTO sleeper_week_stats (player_id, season, week, team, opponent, stats_json, updated_at)
+     VALUES (?, ?, ?, ?, ?, ?, ?)`
+  )
+  for (const r of records) {
+    insert.run(r.playerId, season, week, r.team, r.opponent, JSON.stringify(r.stats), updatedAt)
+  }
+  return records.length
+}
+
+/** Every stored line, for `recomputePoints`. */
+export function listSleeperStats(db: Db): SleeperStatsRecord[] {
+  return (db.prepare(`${SELECT} ORDER BY season, week, player_id`).all() as unknown as Row[]).map(
+    toRecord
+  )
+}
+
+export function listSleeperStatsByWeek(db: Db, season: number, week: number): SleeperStatsRecord[] {
+  return (
+    db
+      .prepare(`${SELECT} WHERE season = ? AND week = ? ORDER BY player_id`)
+      .all(season, week) as unknown as Row[]
+  ).map(toRecord)
+}
+
+export function listSleeperStatsBySeason(db: Db, season: number): SleeperStatsRecord[] {
+  return (
+    db
+      .prepare(`${SELECT} WHERE season = ? ORDER BY week, player_id`)
+      .all(season) as unknown as Row[]
+  ).map(toRecord)
+}
diff --git a/src/main/sync/mappers.ts b/src/main/sync/mappers.ts
index 2db4d6d..92642d6 100644
--- a/src/main/sync/mappers.ts
+++ b/src/main/sync/mappers.ts
@@ -1,6 +1,7 @@
 import type { LeagueRecord } from '@main/db/repos/leagues'
 import type { PlayerRecord } from '@main/db/repos/players'
 import type { ProjectionRecord } from '@main/db/repos/projections'
+import type { SleeperStatsRecord } from '@main/db/repos/sleeperStats'
 import type { RosterPlayerRecord } from '@main/db/repos/teams'
 import type {
   SleeperLeague,
@@ -8,7 +9,8 @@ import type {
   SleeperNflState,
   SleeperPlayer,
   SleeperProjection,
-  SleeperRoster
+  SleeperRoster,
+  SleeperStatRow
 } from '@main/sources/sleeper-types'
 import {
   canonicalIrStatuses,
@@ -211,3 +213,51 @@ export function mapProjections(
   }
   return { records, skipped }
 }
+
+/**
+ * Sleeper's own fantasy points and ranks: the league's rules decide, so they are not stored.
+ * Exact names: `pts_allow` and its tiers are real stats.
+ */
+const SLEEPER_POINT_FIELDS = new Set(['pts_std', 'pts_ppr', 'pts_half_ppr', 'pts_idp'])
+const isDerivedFromScoring = (key: string): boolean =>
+  SLEEPER_POINT_FIELDS.has(key) || key.startsWith('pos_rank_')
+
+/**
+ * Sleeper stats scoring spec §3.2: keeps regular-season rows of exactly (season, week) for players
+ * who played (`gp` ≥ 1; a row without `gp` carries only ranks and team snap counts). Drops
+ * Sleeper's own points and ranks and anything that is not a number.
+ */
+export function mapSleeperStats(
+  items: SleeperStatRow[],
+  season: number,
+  week: number
+): { records: SleeperStatsRecord[]; skipped: number } {
+  const records: SleeperStatsRecord[] = []
+  let skipped = 0
+  for (const it of items) {
+    if (
+      !it.player_id ||
+      !it.stats ||
+      it.season_type !== 'regular' ||
+      Number(it.season) !== season ||
+      it.week !== week
+    ) {
+      skipped++
+      continue
+    }
+    if (!((it.stats.gp ?? 0) >= 1)) continue
+    const stats: Record<string, number> = {}
+    for (const [key, value] of Object.entries(it.stats)) {
+      if (typeof value === 'number' && !isDerivedFromScoring(key)) stats[key] = value
+    }
+    records.push({
+      playerId: it.player_id,
+      season,
+      week,
+      team: it.team ?? null,
+      opponent: it.opponent ?? null,
+      stats
+    })
+  }
+  return { records, skipped }
+}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/db tests/main/sync && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/db/repos/sleeperStats.ts src/main/db/migrations/index.ts src/main/sync/mappers.ts tests/main/db/sleeperStatsRepo.test.ts tests/main/db/migrate.test.ts tests/main/sync/mappers.test.ts
git add src/main/db/migrations/010_sleeper_stats.sql src/main/db/repos/sleeperStats.ts src/main/db/migrations/index.ts src/main/sync/mappers.ts tests/main/db/sleeperStatsRepo.test.ts tests/main/db/migrate.test.ts tests/main/sync/mappers.test.ts
git commit -m "feat(stats): store Sleeper's weekly stat lines"
```

---

### Task 4: Score Sleeper lines first (spec §3.4, §3.5)

**Files:**

- Modify: `src/main/scoring/adapters.ts`, `src/main/scoring/recompute.ts`, `src/main/db/repos/players.ts`
- Test: `tests/main/scoring/adapters.test.ts`, `tests/main/scoring/recompute.test.ts`

**Interfaces:**

- Consumes: `listSleeperStats`, `replaceSleeperStats`, `SleeperStatsRecord`, `mapSleeperStats` (Task 3); `fx.statsWeek4`, `fx.statsKcShutout` (Task 2).
- Produces (`adapters.ts`): `sleeperStatLine(stats, position: Position | null): StatLine`. It copies the keys. On a DEF line with `gp ≥ 1`, a missing `pts_allow` / `yds_allow` becomes 0.
- Produces (`players.ts`): `listPlayerPositions(db): Map<playerId, position | null>`.
- Produces (`recompute.ts`): `recomputePoints` scores every `sleeper_week_stats` row of a known player first. It then scores nflverse player-weeks and team-weeks only for (player, season, week) without a Sleeper row. Rows of ids that are not in `players` (for example `KC` when only `LAR` exists) are ignored.

- [ ] **Step 1: Apply the test patch**

```diff
diff --git a/tests/main/scoring/adapters.test.ts b/tests/main/scoring/adapters.test.ts
index 68dbc8a..09d5248 100644
--- a/tests/main/scoring/adapters.test.ts
+++ b/tests/main/scoring/adapters.test.ts
@@ -3,6 +3,7 @@ import {
   offensiveYards,
   PLAYER_STAT_MAP,
   playerStatLine,
+  sleeperStatLine,
   TEAM_STAT_MAP,
   teamStatLine,
   withDisplayStats,
@@ -98,6 +99,32 @@ describe('playerStatLine', () => {
   })
 })

+describe('sleeperStatLine (Sleeper stats scoring spec §3.4)', () => {
+  it('copies the keys as Sleeper publishes them', () => {
+    const stats = { gp: 1, rec: 3, rec_yd: 27, rec_0_4: 1 }
+    expect(sleeperStatLine(stats, 'WR')).toEqual(stats)
+  })
+
+  it('restores the zeros Sleeper leaves out of a defense that played', () => {
+    expect(sleeperStatLine({ gp: 1, sack: 1, pts_allow_0: 1 }, 'DEF')).toEqual({
+      gp: 1,
+      sack: 1,
+      pts_allow_0: 1,
+      pts_allow: 0,
+      yds_allow: 0
+    })
+    expect(sleeperStatLine({ gp: 1, pts_allow: 20, yds_allow: 172 }, 'DEF')).toMatchObject({
+      pts_allow: 20,
+      yds_allow: 172
+    })
+  })
+
+  it('restores nothing on a player line or a defense that did not play', () => {
+    expect(sleeperStatLine({ gp: 1, rec: 2 }, 'RB')).toEqual({ gp: 1, rec: 2 })
+    expect(sleeperStatLine({ sack: 1 }, 'DEF')).toEqual({ sack: 1 })
+  })
+})
+
 describe('teamStatLine', () => {
   it('maps the team row plus points/yards allowed from context', () => {
     const line = teamStatLine(
diff --git a/tests/main/scoring/recompute.test.ts b/tests/main/scoring/recompute.test.ts
index 352713b..1e91d30 100644
--- a/tests/main/scoring/recompute.test.ts
+++ b/tests/main/scoring/recompute.test.ts
@@ -3,11 +3,14 @@ import { withTransaction, type Db } from '@main/db/connection'
 import { replacePlayerIds } from '@main/db/repos/playerIds'
 import { countPoints, latestPointsWeek, listWeekPoints, replacePoints } from '@main/db/repos/points'
 import { saveRules } from '@main/db/repos/rules'
+import { replaceSleeperStats, type SleeperStatsRecord } from '@main/db/repos/sleeperStats'
 import { replacePlayerWeekStats, replaceTeamWeekStats, upsertGames } from '@main/db/repos/stats'
 import { pointsAllowedIndex, recomputePoints } from '@main/scoring/recompute'
 import { parseGames, parsePlayerWeekStats, parseTeamWeekStats } from '@main/sources/nflverse'
+import { mapSleeperStats } from '@main/sync/mappers'
 import { seedLeague, SEED_TS } from '../../fixtures/db'
 import * as fx from '../../fixtures/nflverse'
+import * as sl from '../../fixtures/sleeper'
 import { rules } from '../../fixtures/rules'

 const defRules = rules({
@@ -117,6 +120,75 @@ describe('recomputePoints', () => {
     expect(countPoints(db, 'L1')).toBe(1)
   })

+  describe('Sleeper stat lines first (Sleeper stats scoring spec §3.5)', () => {
+    const sleeperLine = (
+      playerId: string,
+      season: number,
+      week: number,
+      stats: Record<string, number>
+    ): SleeperStatsRecord => ({ playerId, season, week, team: null, opponent: null, stats })
+    /** Stores each (season, week) of `records` in one replace. */
+    const store = (records: SleeperStatsRecord[]): void => {
+      const weeks = new Map<string, SleeperStatsRecord[]>()
+      for (const r of records)
+        weeks.set(`${r.season}|${r.week}`, [...(weeks.get(`${r.season}|${r.week}`) ?? []), r])
+      for (const list of weeks.values()) {
+        replaceSleeperStats(db, list[0].season, list[0].week, list, SEED_TS)
+      }
+    }
+    const recompute = (): number => withTransaction(db, () => recomputePoints(db, 'L1', SEED_TS))
+
+    it('a Sleeper line wins over nflverse for its week; other weeks stay on nflverse', () => {
+      store([sleeperLine('4866', 2025, 1, { gp: 1, rec: 10 })])
+      recompute()
+      expect(listWeekPoints(db, 'L1', '4866', 2025)).toEqual([
+        { week: 1, points: 10 },
+        { week: 2, points: 11.8 }
+      ])
+    })
+
+    it('scores a player nflverse never matched, and ignores ids that are not players', () => {
+      store([
+        sleeperLine('8259', 2025, 3, { gp: 1, rush_yd: 50 }),
+        sleeperLine('KC', 2025, 3, { gp: 1, sack: 3 })
+      ])
+      recompute()
+      expect(listWeekPoints(db, 'L1', '8259', 2025)).toEqual([{ week: 3, points: 5 }])
+      expect(listWeekPoints(db, 'L1', 'KC', 2025)).toEqual([])
+    })
+
+    it('scores a captured week by hand-worked totals', () => {
+      const { records } = mapSleeperStats(sl.statsWeek4, 2026, 4)
+      replaceSleeperStats(db, 2026, 4, records, SEED_TS)
+      recompute()
+      const week4 = (id: string): number | undefined =>
+        listWeekPoints(db, 'L1', id, 2026).find((p) => p.week === 4)?.points
+      // 8*0.1 + 1 + 2*0.1 ; 3 + 27*0.1 ; 145*0.1 + 2*6 + 1 + 2*0.1
+      expect([week4('4866'), week4('7564'), week4('9509')]).toEqual([2, 5.7, 27.7])
+      // 4 sacks + 20 points allowed (14-20 tier = 1)
+      expect(week4('LAR')).toBe(5)
+      // did not play (no `gp`), and no nflverse row in 2026
+      expect(week4('6794')).toBeUndefined()
+    })
+
+    it('pays a shutout from a line without pts_allow, and the special-teams keys', () => {
+      saveRules(db, 'L1', {
+        ...defRules,
+        scoring: { ...defRules.scoring, def_st_ff: 1, def_st_fum_rec: 1 }
+      })
+      const asLar = (row: SleeperStatsRecord): SleeperStatsRecord => ({ ...row, playerId: 'LAR' })
+      store([
+        asLar(mapSleeperStats(sl.statsKcShutout, 2025, 7).records[0]),
+        asLar(mapSleeperStats(sl.statsWeek4, 2026, 4).records.find((r) => r.playerId === 'KC')!)
+      ])
+      recompute()
+      // KC 2025 wk7: 1 sack + shutout (10)
+      expect(listWeekPoints(db, 'L1', 'LAR', 2025).find((p) => p.week === 7)?.points).toBe(11)
+      // KC 2026 wk4: 1 int * 2 + 27 allowed (no tier) + ST forced fumble 1 + ST recovery 1
+      expect(listWeekPoints(db, 'L1', 'LAR', 2026)).toEqual([{ week: 4, points: 4 }])
+    })
+  })
+
   it('pointsAllowedIndex reads both sides of a played game and skips unplayed ones', () => {
     const idx = pointsAllowedIndex(parseGames(fx.gamesCsv).records)
     expect(idx.get('PHI|2025|1')).toBe(20)
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/main/scoring`
Expected: FAIL, 7 failed:

- the three `sleeperStatLine` tests (not exported);
- the four "Sleeper stat lines first" tests (Sleeper rows are ignored, so `8259` has no points, LAR's week-4 line is missing, and 4866 week 1 stays 18.4).

- [ ] **Step 3: Apply the source patch**

```diff
diff --git a/src/main/db/repos/players.ts b/src/main/db/repos/players.ts
index 41602d5..8e65be2 100644
--- a/src/main/db/repos/players.ts
+++ b/src/main/db/repos/players.ts
@@ -66,3 +66,12 @@ export function upsertPlayers(db: Db, players: PlayerRecord[], updatedAt: string
 export function countPlayers(db: Db): number {
   return (db.prepare('SELECT COUNT(*) AS n FROM players').get() as { n: number }).n
 }
+
+/** Every player's Sleeper position (null when Sleeper has none), for scoring Sleeper stat lines. */
+export function listPlayerPositions(db: Db): Map<string, string | null> {
+  const rows = db.prepare('SELECT player_id, position FROM players').all() as unknown as {
+    player_id: string
+    position: string | null
+  }[]
+  return new Map(rows.map((r) => [r.player_id, r.position]))
+}
diff --git a/src/main/scoring/adapters.ts b/src/main/scoring/adapters.ts
index 986e8ff..30e9be5 100644
--- a/src/main/scoring/adapters.ts
+++ b/src/main/scoring/adapters.ts
@@ -1,4 +1,4 @@
-import type { StatKey } from '@shared/rules'
+import type { Position, StatKey } from '@shared/rules'
 import type { StatLine } from './engine'

 type Stats = Record<string, number>
@@ -113,6 +113,20 @@ export function playerStatLine(stats: Stats): StatLine {
   return line
 }

+/**
+ * Sleeper stats scoring spec §3.4: a stored Sleeper row as a stat line. Sleeper's keys are the
+ * app's keys, so they are copied. Sleeper leaves zeros out, so a defense that played and has no
+ * `pts_allow` / `yds_allow` allowed 0: restoring them lets the derived tiers fire on a shutout.
+ */
+export function sleeperStatLine(stats: Stats, position: Position | null): StatLine {
+  const line: StatLine = { ...stats }
+  if (position === 'DEF' && (stats.gp ?? 0) >= 1) {
+    line.pts_allow ??= 0
+    line.yds_allow ??= 0
+  }
+  return line
+}
+
 export interface TeamContext {
   /** Opponent's score from `games`; null when the game is not in the table yet. */
   pointsAllowed: number | null
diff --git a/src/main/scoring/recompute.ts b/src/main/scoring/recompute.ts
index 5960c37..707aa5a 100644
--- a/src/main/scoring/recompute.ts
+++ b/src/main/scoring/recompute.ts
@@ -1,10 +1,12 @@
 import type { Db } from '@main/db/connection'
 import { listScoringIdentities } from '@main/db/repos/playerIds'
+import { listPlayerPositions } from '@main/db/repos/players'
 import { replacePoints, type PointsRecord } from '@main/db/repos/points'
 import { getRules } from '@main/db/repos/rules'
+import { listSleeperStats } from '@main/db/repos/sleeperStats'
 import { listAllPlayerWeeks, listGames, listTeamWeeks, type GameRow } from '@main/db/repos/stats'
 import { POSITIONS, type Position } from '@shared/rules'
-import { offensiveYards, playerStatLine, teamStatLine } from './adapters'
+import { offensiveYards, playerStatLine, sleeperStatLine, teamStatLine } from './adapters'
 import { scoreStatLine } from './engine'

 function asPosition(value: string | null): Position | null {
@@ -27,9 +29,11 @@ export function pointsAllowedIndex(
 }

 /**
- * Rebuilds `player_week_points` for the league from every stored stats row (spec §7): players
- * via `player_ids.gsis_id`, team defenses via `player_ids.nflverse_team` with points/yards allowed
- * from `games` / the opponent's team row. Returns the number of rows written. Wrap in `withTransaction`.
+ * Rebuilds `player_week_points` for the league from every stored stats row. Sleeper's own stat
+ * lines come first (Sleeper stats scoring spec §3.5), keyed by Sleeper id. A player-week without
+ * one falls back to nflverse (spec §7): players via `player_ids.gsis_id`, team defenses via
+ * `player_ids.nflverse_team` with points/yards allowed from `games` / the opponent's team row.
+ * Returns the number of rows written. Wrap in `withTransaction`.
  */
 export function recomputePoints(db: Db, leagueId: string, updatedAt: string): number {
   const rules = getRules(db, leagueId)
@@ -48,11 +52,26 @@ export function recomputePoints(db: Db, leagueId: string, updatedAt: string): nu
   }

   const out: PointsRecord[] = []
+  const scored = new Set<string>()
+  const positions = listPlayerPositions(db)
+  for (const s of listSleeperStats(db)) {
+    if (!positions.has(s.playerId)) continue
+    const position = asPosition(positions.get(s.playerId) ?? null)
+    out.push({
+      playerId: s.playerId,
+      season: s.season,
+      week: s.week,
+      points: scoreStatLine(sleeperStatLine(s.stats, position), rules, position)
+    })
+    scored.add(key(s.playerId, s.season, s.week))
+  }
+
   for (const row of listAllPlayerWeeks(db)) {
     const owners = byGsis.get(row.gsisId)
     if (!owners) continue
     const line = playerStatLine(row.stats)
     for (const o of owners) {
+      if (scored.has(key(o.playerId, row.season, row.week))) continue
       out.push({
         playerId: o.playerId,
         season: row.season,
@@ -74,6 +93,7 @@ export function recomputePoints(db: Db, leagueId: string, updatedAt: string): nu
       yardsAllowed: opponent ? offensiveYards(opponent.stats) : null
     })
     for (const playerId of owners) {
+      if (scored.has(key(playerId, t.season, t.week))) continue
       out.push({
         playerId,
         season: t.season,
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main && npm run typecheck`
Expected: PASS, no type errors. Every earlier recompute test passes unchanged: they store no Sleeper rows.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/scoring/adapters.ts src/main/scoring/recompute.ts src/main/db/repos/players.ts tests/main/scoring/adapters.test.ts tests/main/scoring/recompute.test.ts
git add src/main/scoring/adapters.ts src/main/scoring/recompute.ts src/main/db/repos/players.ts tests/main/scoring/adapters.test.ts tests/main/scoring/recompute.test.ts
git commit -m "feat(scoring): score Sleeper stat lines first"
```

---

### Task 5: The weekly stats sync (spec §3.3; amendment A)

**Files:**

- Create: `src/main/sync/sleeperStatsSync.ts`
- Modify: `src/main/sync/nflverseSync.ts`, `src/main/sync/refresh.ts`
- Test: `tests/main/sync/sleeperStatsSync.test.ts`, `tests/main/sync/nflverseSync.test.ts`, `tests/main/sync/refresh.test.ts`

**Interfaces:**

- Consumes: `getStats` (Task 2); `mapSleeperStats`, `replaceSleeperStats` (Task 3).
- Produces (`sleeperStatsSync.ts`):
  - `sourceSleeperStats(season, week)` → `sleeper:stats:<season>:<week>`.
  - `statsWeeks(season, state)`:
    - past season: weeks 1–18;
    - current season, `regular`: 1 through the state week (capped at 18);
    - current season, `post` / `off`: 1–18;
    - current season, `pre`: none.
  - `scoresIdp(rules)`: base or position scoring pays any `idp_*` key.
  - `refreshSleeperStats(deps: SyncDeps, options?)`: prior season then current, one step a week.
    - Freshness: `RECENT_STATS_FRESHNESS_MS` = 6 h for the state week and the one before it (regular season only), `SEASON_STATS_FRESHNESS_MS` = 7 days for the rest of the current season, `PAST_STATS_FRESHNESS_MS` = 30 days for the prior season.
    - `force` re-runs only the two recent weeks.
    - A `null` / non-array answer is `SkipStep(STATS_UNAVAILABLE)` and stops the loop.
- Produces (`nflverseSync.ts`): `NflverseRefreshOptions.sleeperStatsChanged`, which re-runs `app:points`.
- Produces (`refresh.ts`):
  - `refreshAll` runs `refreshSleeperStats` after `refreshSleeper` and passes `sleeperStatsChanged` (any ok stats step) to `refreshNflverse`.
  - `importAll` runs it after `importLeague`; its nflverse run always recomputes on import.
  - The stats steps are listed between the Sleeper and nflverse steps.

- [ ] **Step 1: Apply the test patch**

```diff
diff --git a/tests/main/sync/nflverseSync.test.ts b/tests/main/sync/nflverseSync.test.ts
index f12a93c..688e104 100644
--- a/tests/main/sync/nflverseSync.test.ts
+++ b/tests/main/sync/nflverseSync.test.ts
@@ -194,6 +194,13 @@ describe('refreshNflverse', () => {
     expect(again.steps).toHaveLength(8)
   })

+  it('recomputes points when Sleeper stats changed, even with fresh nflverse sources', async () => {
+    await refreshNflverse(deps())
+    clock = new Date(clock.getTime() + HOUR)
+    const again = await refreshNflverse(deps(), { sleeperStatsChanged: true })
+    expect(again.steps.find((s) => s.source === SOURCE_POINTS)?.status).toBe('ok')
+  })
+
   it('skips points when no league is active', async () => {
     db.prepare("DELETE FROM app_settings WHERE key = 'active_league_id'").run()
     const result = await refreshNflverse(deps())
diff --git a/tests/main/sync/refresh.test.ts b/tests/main/sync/refresh.test.ts
index 9591681..9ed931e 100644
--- a/tests/main/sync/refresh.test.ts
+++ b/tests/main/sync/refresh.test.ts
@@ -62,5 +62,14 @@ describe('refreshAll / importAll', () => {

     const refreshed = await refreshAll(deps())
     expect(refreshed.steps.map((s) => s.source).slice(-6)).toEqual(sources.slice(-6))
+    // Sleeper stats run after the Sleeper steps (they need the NFL state) and before nflverse
+    const refreshedSources = refreshed.steps.map((s) => s.source)
+    expect(refreshedSources.indexOf('sleeper:stats:2025:1')).toBeGreaterThan(
+      refreshedSources.indexOf('sleeper:state')
+    )
+    expect(refreshedSources.indexOf('sleeper:stats:2026:2')).toBeLessThan(
+      refreshedSources.indexOf('nflverse:crosswalk')
+    )
+    expect(sources).toContain('sleeper:stats:2026:2')
   })
 })
diff --git a/tests/main/sync/sleeperStatsSync.test.ts b/tests/main/sync/sleeperStatsSync.test.ts
new file mode 100644
index 0000000..c46ee1b
--- /dev/null
+++ b/tests/main/sync/sleeperStatsSync.test.ts
@@ -0,0 +1,141 @@
+import { beforeEach, describe, expect, it, vi } from 'vitest'
+import type { Db } from '@main/db/connection'
+import { saveRules } from '@main/db/repos/rules'
+import { listSleeperStatsByWeek } from '@main/db/repos/sleeperStats'
+import { setNflState } from '@main/db/repos/state'
+import type { SyncDeps } from '@main/sync/step'
+import type { SleeperClient } from '@main/sources/sleeper'
+import type { SleeperStatRow } from '@main/sources/sleeper-types'
+import {
+  refreshSleeperStats,
+  scoresIdp,
+  sourceSleeperStats,
+  STATS_UNAVAILABLE,
+  statsWeeks
+} from '@main/sync/sleeperStatsSync'
+import type { NflState } from '@shared/types'
+import { seedLeague } from '../../fixtures/db'
+import { rules } from '../../fixtures/rules'
+import * as fx from '../../fixtures/sleeper'
+
+const HOUR = 3_600_000
+const DAY = 24 * HOUR
+
+const state = (over: Partial<NflState> = {}): NflState => ({
+  season: '2026',
+  week: 4,
+  displayWeek: 4,
+  seasonType: 'regular',
+  fetchedAt: '2026-10-01T12:00:00.000Z',
+  ...over
+})
+
+describe('statsWeeks (Sleeper stats scoring spec §3.1)', () => {
+  const all = Array.from({ length: 18 }, (_, i) => i + 1)
+  it('a past season has every week; the current one runs through the state week', () => {
+    expect(statsWeeks(2025, state())).toEqual(all)
+    expect(statsWeeks(2026, state())).toEqual([1, 2, 3, 4])
+    expect(statsWeeks(2026, state({ week: 22 }))).toEqual(all)
+  })
+  it('every week after the regular season, none before it', () => {
+    expect(statsWeeks(2026, state({ seasonType: 'post', week: 1 }))).toEqual(all)
+    expect(statsWeeks(2026, state({ seasonType: 'off', week: 1 }))).toEqual(all)
+    expect(statsWeeks(2026, state({ seasonType: 'pre', week: 0 }))).toEqual([])
+  })
+})
+
+describe('scoresIdp', () => {
+  it('is true when base or position scoring pays an idp_ key', () => {
+    expect(scoresIdp(null)).toBe(false)
+    expect(scoresIdp(rules())).toBe(false)
+    expect(scoresIdp(rules({ scoring: { ...rules().scoring, idp_tkl: 0 } }))).toBe(false)
+    expect(scoresIdp(rules({ scoring: { ...rules().scoring, idp_sack: 2 } }))).toBe(true)
+    expect(scoresIdp(rules({ positionOverrides: { DEF: { idp_tkl: 1 } } }))).toBe(true)
+  })
+})
+
+describe('refreshSleeperStats (spec §3.3)', () => {
+  let db: Db
+  let clock: Date
+  let getStats: ReturnType<typeof vi.fn<SleeperClient['getStats']>>
+
+  /** Week 4 of 2026 is the captured week; every other week answers with no rows. */
+  const answer = async (season: string, week: number): Promise<SleeperStatRow[] | null> =>
+    season === '2026' && week === 4 ? fx.statsWeek4 : []
+  const deps = (): SyncDeps => ({
+    db,
+    sleeper: { getStats } as unknown as SleeperClient,
+    now: () => clock
+  })
+  const ran = (steps: { source: string; status: string }[]): string[] =>
+    steps.filter((s) => s.status === 'ok').map((s) => s.source)
+
+  beforeEach(() => {
+    db = seedLeague()
+    clock = new Date('2026-10-01T12:00:00.000Z')
+    setNflState(db, state())
+    getStats = vi.fn(answer)
+  })
+
+  it('fetches the prior season, then the current one through the state week, and stores the rows', async () => {
+    const result = await refreshSleeperStats(deps())
+    expect(result.steps.map((s) => s.source)).toEqual([
+      ...Array.from({ length: 18 }, (_, i) => sourceSleeperStats(2025, i + 1)),
+      ...[1, 2, 3, 4].map((w) => sourceSleeperStats(2026, w))
+    ])
+    expect(result.steps.every((s) => s.status === 'ok')).toBe(true)
+    expect(getStats).toHaveBeenCalledWith('2026', 4, false)
+    expect(listSleeperStatsByWeek(db, 2026, 4).map((r) => r.playerId)).toContain('LAR')
+    expect(result.steps.at(-1)).toMatchObject({ rowsWritten: 8 })
+  })
+
+  it('asks for IDP rows when the league scores an idp_ key', async () => {
+    saveRules(db, 'L1', rules({ scoring: { ...rules().scoring, idp_sack: 2 } }))
+    await refreshSleeperStats(deps())
+    expect(getStats).toHaveBeenCalledWith('2026', 4, true)
+  })
+
+  it('re-runs the state week and the one before after 6 h, the season after 7 days, the prior season after 30', async () => {
+    await refreshSleeperStats(deps())
+    clock = new Date(clock.getTime() + HOUR)
+    expect(ran((await refreshSleeperStats(deps())).steps)).toEqual([])
+    clock = new Date(clock.getTime() + 6 * HOUR)
+    expect(ran((await refreshSleeperStats(deps())).steps)).toEqual([
+      sourceSleeperStats(2026, 3),
+      sourceSleeperStats(2026, 4)
+    ])
+    clock = new Date(clock.getTime() + 7 * DAY)
+    expect(ran((await refreshSleeperStats(deps())).steps)).toEqual(
+      [1, 2, 3, 4].map((w) => sourceSleeperStats(2026, w))
+    )
+    clock = new Date(clock.getTime() + 30 * DAY)
+    expect(ran((await refreshSleeperStats(deps())).steps)).toHaveLength(22)
+  })
+
+  it('a forced refresh re-runs only the two recent weeks', async () => {
+    await refreshSleeperStats(deps())
+    clock = new Date(clock.getTime() + 60_000)
+    expect(ran((await refreshSleeperStats(deps(), { force: true })).steps)).toEqual([
+      sourceSleeperStats(2026, 3),
+      sourceSleeperStats(2026, 4)
+    ])
+  })
+
+  it('stops after one request when the endpoint is gone', async () => {
+    getStats = vi.fn(async () => null)
+    const result = await refreshSleeperStats(deps())
+    expect(result.steps).toEqual([
+      expect.objectContaining({
+        source: sourceSleeperStats(2025, 1),
+        status: 'skipped',
+        message: STATS_UNAVAILABLE
+      })
+    ])
+    expect(getStats).toHaveBeenCalledTimes(1)
+  })
+
+  it('does nothing without an NFL state', async () => {
+    db.exec('DELETE FROM nfl_state')
+    expect((await refreshSleeperStats(deps())).steps).toEqual([])
+  })
+})
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/main/sync`
Expected: FAIL.

- `sleeperStatsSync.test.ts` cannot find `@main/sync/sleeperStatsSync`.
- "recomputes points when Sleeper stats changed, even with fresh nflverse sources": expected undefined to be 'ok'.
- `refresh.test.ts`: no `sleeper:stats:*` steps (expected -1 to be greater than 0).

- [ ] **Step 3: Apply the source patch**

```diff
diff --git a/src/main/sync/nflverseSync.ts b/src/main/sync/nflverseSync.ts
index 16ea35c..521d4d3 100644
--- a/src/main/sync/nflverseSync.ts
+++ b/src/main/sync/nflverseSync.ts
@@ -44,6 +44,8 @@ export interface NflverseSyncDeps extends SyncDeps {
 export interface NflverseRefreshOptions extends RefreshOptions {
   /** The Sleeper players DB was re-fetched this run: re-resolve identities even if the crosswalk is fresh. */
   playersChanged?: boolean
+  /** A Sleeper stats week was stored this run (Sleeper stats scoring spec §3.3): recompute points. */
+  sleeperStatsChanged?: boolean
 }

 const ok = (entry: SyncLogEntry): boolean => entry.status === 'ok'
@@ -142,7 +144,12 @@ export async function refreshNflverse(

   if (
     leagueId &&
-    (force || identityChanged || statsChanged || ok(games) || countPoints(deps.db, leagueId) === 0)
+    (force ||
+      identityChanged ||
+      statsChanged ||
+      options.sleeperStatsChanged ||
+      ok(games) ||
+      countPoints(deps.db, leagueId) === 0)
   ) {
     steps.push(
       await runStep(deps, SOURCE_POINTS, 0, true, async () =>
diff --git a/src/main/sync/refresh.ts b/src/main/sync/refresh.ts
index 4417df1..764289b 100644
--- a/src/main/sync/refresh.ts
+++ b/src/main/sync/refresh.ts
@@ -4,6 +4,7 @@ import { refreshExperts, type ExpertSyncDeps } from './expertSync'
 import { refreshNflverse, type NflverseSyncDeps } from './nflverseSync'
 import { snapshotRos } from './snapshotSync'
 import { importLeague, refreshSleeper, SOURCE_PLAYERS } from './sleeperSync'
+import { refreshSleeperStats } from './sleeperStatsSync'
 import { nowOf, type RefreshOptions } from './step'
 import { refreshTrending } from './trendingSync'

@@ -13,8 +14,9 @@ export type AppSyncDeps = NflverseSyncDeps & ExpertSyncDeps
 const SYNC_LOG_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

 /**
- * Refresh button / on-launch: Sleeper first (it sets the NFL season), then nflverse, then the
- * expert layer (it needs the crosswalk), then trending adds and the weekly snapshot that records them.
+ * Refresh button / on-launch: Sleeper first (it sets the NFL season), then Sleeper's weekly stats,
+ * then nflverse (which recomputes points when either stats source changed), then the expert layer
+ * (it needs the crosswalk), then trending adds and the weekly snapshot that records them.
  */
 export async function refreshAll(
   deps: AppSyncDeps,
@@ -23,13 +25,16 @@ export async function refreshAll(
   pruneSyncLog(deps.db, new Date(nowOf(deps).getTime() - SYNC_LOG_RETENTION_MS).toISOString())
   const sleeper = await refreshSleeper(deps, options)
   const playersChanged = sleeper.steps.some((s) => s.source === SOURCE_PLAYERS && s.status === 'ok')
-  const nflverse = await refreshNflverse(deps, { ...options, playersChanged })
+  const stats = await refreshSleeperStats(deps, options)
+  const sleeperStatsChanged = stats.steps.some((s) => s.status === 'ok')
+  const nflverse = await refreshNflverse(deps, { ...options, playersChanged, sleeperStatsChanged })
   const experts = await refreshExperts(deps, options)
   const trending = await refreshTrending(deps)
   const snapshot = await snapshotRos(deps)
   return {
     steps: [
       ...sleeper.steps,
+      ...stats.steps,
       ...nflverse.steps,
       ...experts.steps,
       ...trending.steps,
@@ -45,6 +50,7 @@ export async function importAll(
   myUserId: string | null
 ): Promise<SyncResult> {
   const sleeper = await importLeague(deps, leagueId, myUserId)
+  const stats = await refreshSleeperStats(deps)
   const nflverse = await refreshNflverse(deps, { playersChanged: true })
   const experts = await refreshExperts(deps)
   const trending = await refreshTrending(deps)
@@ -52,6 +58,7 @@ export async function importAll(
   return {
     steps: [
       ...sleeper.steps,
+      ...stats.steps,
       ...nflverse.steps,
       ...experts.steps,
       ...trending.steps,
diff --git a/src/main/sync/sleeperStatsSync.ts b/src/main/sync/sleeperStatsSync.ts
new file mode 100644
index 0000000..873b9bc
--- /dev/null
+++ b/src/main/sync/sleeperStatsSync.ts
@@ -0,0 +1,93 @@
+import { withTransaction } from '@main/db/connection'
+import { getRules } from '@main/db/repos/rules'
+import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
+import { replaceSleeperStats } from '@main/db/repos/sleeperStats'
+import { getNflState } from '@main/db/repos/state'
+import type { Rules } from '@shared/rules'
+import type { NflState, SyncLogEntry, SyncResult } from '@shared/types'
+import { mapSleeperStats } from './mappers'
+import { nowOf, runStep, SkipStep, type RefreshOptions, type SyncDeps } from './step'
+
+export const SOURCE_SLEEPER_STATS_PREFIX = 'sleeper:stats:'
+export const sourceSleeperStats = (season: number, week: number): string =>
+  `${SOURCE_SLEEPER_STATS_PREFIX}${season}:${week}`
+
+const HOUR = 60 * 60 * 1000
+const DAY = 24 * HOUR
+/** Sleeper stats scoring spec §3.3: corrections land during the week after a game. */
+export const RECENT_STATS_FRESHNESS_MS = 6 * HOUR
+export const SEASON_STATS_FRESHNESS_MS = 7 * DAY
+export const PAST_STATS_FRESHNESS_MS = 30 * DAY
+export const STATS_UNAVAILABLE = 'stats endpoint unavailable'
+const REGULAR_SEASON_WEEKS = 18
+
+const weeks = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1)
+
+/**
+ * Spec §3.1: the weeks of `season` with games to fetch. A past season: all of them. The current
+ * season: weeks 1 through the state week during the regular season (the week in progress included),
+ * all of them in the postseason or offseason, none in the preseason.
+ */
+export function statsWeeks(season: number, state: NflState): number[] {
+  const current = Number(state.season)
+  if (season < current) return weeks(REGULAR_SEASON_WEEKS)
+  if (season > current) return []
+  if (state.seasonType === 'regular') {
+    return weeks(Math.min(Math.max(state.week, 0), REGULAR_SEASON_WEEKS))
+  }
+  return state.seasonType === 'pre' ? [] : weeks(REGULAR_SEASON_WEEKS)
+}
+
+/** The league scores an IDP key, so Sleeper's DL / LB / DB rows are fetched too. */
+export function scoresIdp(rules: Rules | null): boolean {
+  if (!rules) return false
+  const tables = [rules.scoring, ...Object.values(rules.positionOverrides)]
+  return tables.some((t) => Object.entries(t ?? {}).some(([k, p]) => k.startsWith('idp_') && p))
+}
+
+/**
+ * Spec §3.3: one step per week, prior season then current. Freshness: the state week and the week
+ * before it 6 h, older weeks of the current season 7 days, the prior season 30 days. A forced
+ * refresh re-runs only the two recent weeks. A gone endpoint stops the loop after one request.
+ */
+export async function refreshSleeperStats(
+  deps: SyncDeps,
+  options: RefreshOptions = {}
+): Promise<SyncResult> {
+  const steps: SyncLogEntry[] = []
+  const state = getNflState(deps.db)
+  if (!state) return { steps }
+  const current = Number(state.season)
+  const leagueId = getSetting(deps.db, SETTING_ACTIVE_LEAGUE)
+  const idp = scoresIdp(leagueId ? getRules(deps.db, leagueId) : null)
+  for (const season of [current - 1, current]) {
+    for (const week of statsWeeks(season, state)) {
+      const recent = season === current && state.seasonType === 'regular' && week >= state.week - 1
+      const freshness = recent
+        ? RECENT_STATS_FRESHNESS_MS
+        : season === current
+          ? SEASON_STATS_FRESHNESS_MS
+          : PAST_STATS_FRESHNESS_MS
+      const force = (options.force ?? false) && recent
+      const entry = await runStep(
+        deps,
+        sourceSleeperStats(season, week),
+        freshness,
+        force,
+        async () => {
+          const rows = await deps.sleeper.getStats(String(season), week, idp)
+          if (!Array.isArray(rows)) throw new SkipStep(STATS_UNAVAILABLE)
+          const { records, skipped } = mapSleeperStats(rows, season, week)
+          const ts = nowOf(deps).toISOString()
+          const written = withTransaction(deps.db, () =>
+            replaceSleeperStats(deps.db, season, week, records, ts)
+          )
+          return { rows: written, message: skipped ? `${skipped} rows skipped` : null }
+        }
+      )
+      steps.push(entry)
+      if (entry.status === 'skipped' && entry.message === STATS_UNAVAILABLE) return { steps }
+    }
+  }
+  return { steps }
+}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main && npm run typecheck`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/sync/sleeperStatsSync.ts src/main/sync/nflverseSync.ts src/main/sync/refresh.ts tests/main/sync/sleeperStatsSync.test.ts tests/main/sync/nflverseSync.test.ts tests/main/sync/refresh.test.ts
git add src/main/sync/sleeperStatsSync.ts src/main/sync/nflverseSync.ts src/main/sync/refresh.ts tests/main/sync/sleeperStatsSync.test.ts tests/main/sync/nflverseSync.test.ts tests/main/sync/refresh.test.ts
git commit -m "feat(sync): sync Sleeper stats weekly"
```

---

### Task 6: Show the line that was scored (spec §3.6; amendment E)

**Files:**

- Modify: `src/main/db/repos/playersWeek.ts`, `src/main/value/series.ts`
- Test: `tests/main/db/playersWeek.test.ts`, `tests/main/value/series.test.ts`

**Interfaces:**

- Consumes: `listSleeperStatsByWeek`, `listSleeperStatsBySeason` (Task 3); `sleeperStatLine` (Task 4).
- Produces:
  - `PlayerWeekRow.actual` and `SeriesWeek.line` are the Sleeper line (through `sleeperStatLine`, then `withKickingBuckets`) when the player-week has one, and the nflverse line otherwise.
  - `snapPct`, `targetShare` and the other shares stay on nflverse.
  - `statsAvailable` is unchanged.

- [ ] **Step 1: Apply the test patch**

```diff
diff --git a/tests/main/db/playersWeek.test.ts b/tests/main/db/playersWeek.test.ts
index 02a8334..25464ef 100644
--- a/tests/main/db/playersWeek.test.ts
+++ b/tests/main/db/playersWeek.test.ts
@@ -5,6 +5,7 @@ import { replacePlayerIds } from '@main/db/repos/playerIds'
 import { playersOptions, playersWeek, tabsForSlots } from '@main/db/repos/playersWeek'
 import { replacePoints } from '@main/db/repos/points'
 import { replaceProjections } from '@main/db/repos/projections'
+import { replaceSleeperStats, type SleeperStatsRecord } from '@main/db/repos/sleeperStats'
 import { setNflState } from '@main/db/repos/state'
 import {
   replacePlayerWeekStats,
@@ -15,6 +16,7 @@ import {
 import { toggleWatch } from '@main/db/repos/watchlist'
 import { parsePlayerWeekStats, parseSnapCounts, parseTeamWeekStats } from '@main/sources/nflverse'
 import { mapProjections } from '@main/sync/mappers'
+import type { PlayerWeekRow } from '@shared/types'
 import { seedLeague, SEED_TS } from '../../fixtures/db'
 import * as nv from '../../fixtures/nflverse'
 import * as fx from '../../fixtures/sleeper'
@@ -245,6 +247,41 @@ describe('playersWeek', () => {
     expect(playersWeek(db, 'L1', S, 1).rows.find((r) => r.playerId === '7564')?.watched).toBe(true)
   })

+  it('shows the Sleeper line that was scored; usage stays on nflverse (Sleeper stats scoring spec §3.6)', () => {
+    const line = (playerId: string, stats: Record<string, number>): SleeperStatsRecord => ({
+      playerId,
+      season: S,
+      week: 1,
+      team: null,
+      opponent: null,
+      stats
+    })
+    replaceSleeperStats(
+      db,
+      S,
+      1,
+      [
+        line('4866', { gp: 1, rush_att: 19, rush_yd: 61, rec_0_4: 2 }),
+        line('8259', { gp: 1, rush_yd: 40 }),
+        line('LAR', { gp: 1, sack: 5, pts_allow_0: 1 })
+      ],
+      SEED_TS
+    )
+    const { rows } = playersWeek(db, 'L1', S, 1)
+    const byId = (id: string): PlayerWeekRow => rows.find((r) => r.playerId === id)!
+    expect(byId('4866').actual).toEqual({ gp: 1, rush_att: 19, rush_yd: 61, rec_0_4: 2 })
+    expect(byId('4866').snapPct).toBe(0.83)
+    expect(byId('8259').actual).toEqual({ gp: 1, rush_yd: 40 })
+    expect(byId('LAR').actual).toEqual({
+      gp: 1,
+      sack: 5,
+      pts_allow_0: 1,
+      pts_allow: 0,
+      yds_allow: 0
+    })
+    expect(byId('6794').actual).toMatchObject({ rec: 4 }) // no Sleeper row: nflverse as before
+  })
+
   it('a future week has no stats but keeps the upcoming game or bye', () => {
     const bye = playersWeek(db, 'L1', S, 2).rows.find((r) => r.playerId === '4866')
     expect(bye).toMatchObject({ points: null, actual: {}, game: null, byeWeek: 2 })
diff --git a/tests/main/value/series.test.ts b/tests/main/value/series.test.ts
index 5067c24..b2d7078 100644
--- a/tests/main/value/series.test.ts
+++ b/tests/main/value/series.test.ts
@@ -1,5 +1,6 @@
 import { beforeEach, describe, expect, it } from 'vitest'
 import type { Db } from '@main/db/connection'
+import { replaceSleeperStats } from '@main/db/repos/sleeperStats'
 import { currentWeekFor, loadSeries, type PlayerSeries } from '@main/value/series'
 import { seedLeague } from '../../fixtures/db'
 import { seedSeason, SEASON } from '../../fixtures/season'
@@ -61,6 +62,30 @@ describe('loadSeries', () => {
     expect(w4).toMatchObject({ opponent: 'WAS', played: false, points: null, projected: 8 })
   })

+  it('shows the Sleeper line that was scored; usage stays on nflverse (Sleeper stats scoring spec §3.6)', () => {
+    replaceSleeperStats(
+      db,
+      SEASON,
+      1,
+      [
+        {
+          playerId: '4866',
+          season: SEASON,
+          week: 1,
+          team: 'PHI',
+          opponent: 'DAL',
+          stats: { gp: 1, rush_yd: 61, fgm_20_29: 1 }
+        }
+      ],
+      'x'
+    )
+    const w1 = loadSeries(db, 'L1', SEASON)
+      .players.find((p) => p.base.playerId === '4866')
+      ?.weeks.find((w) => w.week === 1)
+    expect(w1?.line).toEqual({ gp: 1, rush_yd: 61, fgm_20_29: 1, fgm_0_39: 1 })
+    expect(w1?.snapPct).toBe(0.83)
+  })
+
   it('skips weeks with nothing (bye, no projection) and keeps projection-only weeks', () => {
     const jefferson = byId.get('6794')
     expect(jefferson?.base.byeWeek).toBe(2)
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `npx vitest run tests/main/db/playersWeek.test.ts tests/main/value/series.test.ts`
Expected: FAIL, 2 failed: both "shows the Sleeper line that was scored; usage stays on nflverse" tests (the nflverse line is shown).

- [ ] **Step 3: Apply the source patch**

```diff
diff --git a/src/main/db/repos/playersWeek.ts b/src/main/db/repos/playersWeek.ts
index dcfb3ef..30cf174 100644
--- a/src/main/db/repos/playersWeek.ts
+++ b/src/main/db/repos/playersWeek.ts
@@ -1,6 +1,7 @@
 import {
   offensiveYards,
   playerStatLine,
+  sleeperStatLine,
   teamStatLine,
   withDisplayStats,
   withKickingBuckets
@@ -26,6 +27,7 @@ import { getLeague } from './leagues'
 import { latestPointsWeek, listPointsByWeek, round2 } from './points'
 import { listProjections, listProjectionWeeks } from './projections'
 import { getRules } from './rules'
+import { listSleeperStatsByWeek } from './sleeperStats'
 import { getNflState } from './state'
 import {
   listGamesByWeek,
@@ -156,6 +158,9 @@ export function playersWeek(db: Db, leagueId: string, season: number, week: numb
     gameByTeam.set(g.awayTeam, { ...shared, opponent: toSleeperTeam(g.homeTeam), home: false })
   }
   const points = listPointsByWeek(db, leagueId, season, week)
+  const sleeperLines = new Map(
+    listSleeperStatsByWeek(db, season, week).map((s) => [s.playerId, s.stats])
+  )
   const projections = new Map(listProjections(db, season, week).map((p) => [p.playerId, p.stats]))
   const snaps = listSnapsByWeek(db, season, week)
   const byes = teamByeWeeks(db, season)
@@ -185,6 +190,9 @@ export function playersWeek(db: Db, leagueId: string, season: number, week: numb
       }
       if (r.pfr_id) snapPct = snaps.get(r.pfr_id) ?? null
     }
+    // Sleeper stats scoring spec §3.6: show the line that was scored; usage stays on nflverse.
+    const sleeperLine = sleeperLines.get(r.player_id)
+    if (sleeperLine) actual = sleeperStatLine(sleeperLine, position)
     const pts = points.get(r.player_id) ?? null
     const nflverseTeam = r.team ? toNflverseTeam(r.team) : null
     return {
diff --git a/src/main/value/series.ts b/src/main/value/series.ts
index ce1098c..035b79a 100644
--- a/src/main/value/series.ts
+++ b/src/main/value/series.ts
@@ -1,6 +1,7 @@
 import {
   offensiveYards,
   playerStatLine,
+  sleeperStatLine,
   teamStatLine,
   withDisplayStats,
   withKickingBuckets
@@ -16,6 +17,7 @@ import { baseRow, listCandidates } from '../db/repos/playersWeek'
 import { listPointsBySeason } from '../db/repos/points'
 import { listProjectionsBySeason, type ProjectionRecord } from '../db/repos/projections'
 import { getRules } from '../db/repos/rules'
+import { listSleeperStatsBySeason, type SleeperStatsRecord } from '../db/repos/sleeperStats'
 import { getNflState } from '../db/repos/state'
 import { listTeams } from '../db/repos/teams'
 import {
@@ -141,6 +143,11 @@ export function loadSeries(db: Db, leagueId: string, season: number): SeriesBund
     (t) => t.team,
     (t) => t.week
   )
+  const sleeperLines = nested<SleeperStatsRecord>(
+    listSleeperStatsBySeason(db, season),
+    (s) => s.playerId,
+    (s) => s.week
+  )
   const snaps = nested(
     listSnapsBySeason(db, season),
     (s) => s.pfrId,
@@ -156,6 +163,7 @@ export function loadSeries(db: Db, leagueId: string, season: number): SeriesBund
     const playerProjections = projections.get(r.player_id)
     const playerStats = r.gsis_id ? stats.get(r.gsis_id) : undefined
     const playerSnaps = r.pfr_id ? snaps.get(r.pfr_id) : undefined
+    const playerSleeper = sleeperLines.get(r.player_id)
     const defenseWeeks = r.nflverse_team ? teamWeeks.get(r.nflverse_team) : undefined

     const weeks: SeriesWeek[] = []
@@ -200,6 +208,14 @@ export function loadSeries(db: Db, leagueId: string, season: number): SeriesBund
               : null)
         }
       }
+      // Sleeper stats scoring spec §3.6: show the line that was scored; usage stays on nflverse.
+      const sleeper = playerSleeper?.get(week)
+      if (sleeper) {
+        line = withKickingBuckets(sleeperStatLine(sleeper.stats, position)) as Record<
+          string,
+          number
+        >
+      }
       weeks.push({
         week,
         opponent: scheduled ? toSleeperTeam(scheduled) : (projection?.opponent ?? null),
```

- [ ] **Step 4: Run the tests**

Run: `npm run typecheck && npx eslint src tests electron.vite.config.ts && npm test`
Expected: all green, 859 tests (+5 skipped).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/db/repos/playersWeek.ts src/main/value/series.ts tests/main/db/playersWeek.test.ts tests/main/value/series.test.ts
git add src/main/db/repos/playersWeek.ts src/main/value/series.ts tests/main/db/playersWeek.test.ts tests/main/value/series.test.ts
git commit -m "feat(players): show the Sleeper line that scored"
```

---

### Task 7: Live gate, docs, verification, release

**Files:**

- Modify: `docs/reference/value-and-signals.md`, `docs/superpowers/specs/2026-10-14-sleeper-stats-scoring-design.md`, this plan (Status block)
- Throwaway (never committed): `tests/zz-w-live.test.ts`

- [ ] **Step 1: Live gate**

Create `tests/zz-w-live.test.ts`:

```ts
import { copyFileSync, mkdtempSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { openDatabase, withTransaction } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { listWeekPoints } from '@main/db/repos/points'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { getNflState } from '@main/db/repos/state'
import { recomputePoints } from '@main/scoring/recompute'
import { createSleeperClient } from '@main/sources/sleeper'
import { refreshSleeperStats } from '@main/sync/sleeperStatsSync'

it('live Sleeper stats scoring gate (throwaway; never commit)', { timeout: 900_000 }, async () => {
  // A copy of the dev app database: the real league, rules and players; nothing is written back.
  const path = join(mkdtempSync(join(tmpdir(), 'ffc-w-')), 'companion.db')
  copyFileSync(join(homedir(), '.config/FantasyCompanion/companion.db'), path)
  const db = openDatabase(path)
  migrate(db)
  const before = statSync(path).size
  const sleeper = createSleeperClient()
  const start = Date.now()
  const result = await refreshSleeperStats({ db, sleeper })
  console.log({
    seconds: (Date.now() - start) / 1000,
    steps: result.steps.length
  })
  console.log(
    result.steps.filter((s) => s.status !== 'ok').map((s) => `${s.source}=${s.status} ${s.message}`)
  )
  const leagueId = getSetting(db, SETTING_ACTIVE_LEAGUE)!
  withTransaction(db, () => recomputePoints(db, leagueId, new Date().toISOString()))
  const state = getNflState(db)!
  const season = Number(state.season)
  // Gate: every rostered player in every completed week equals Sleeper's matchup points.
  for (let week = 1; week < state.week; week++) {
    let n = 0
    const diffs: string[] = []
    for (const team of await sleeper.getMatchups(leagueId, week)) {
      for (const [playerId, sleeperPoints] of Object.entries(team.players_points ?? {})) {
        n++
        const ours =
          listWeekPoints(db, leagueId, playerId, season).find((p) => p.week === week)?.points ?? 0
        if (Math.abs(ours - sleeperPoints) >= 0.01) {
          diffs.push(`${playerId}: app ${ours}, Sleeper ${sleeperPoints}`)
        }
      }
    }
    console.log(`week ${week}: ${n - diffs.length}/${n} equal`, diffs.slice(0, 10))
  }
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  db.close()
  console.log({
    megabytesBefore: before / 1e6,
    megabytesAfter: statSync(path).size / 1e6
  })
})
```

Run: `npx vitest run tests/zz-w-live.test.ts --reporter=verbose`

Expected (measured 2026-10-14 on the dev database):

- 23 steps in about 6 s, and no step that is not ok.
- Every `week N` line says `n/n equal`.
- The database grows by about 4 MB.

**Gate:** any differing player stops the plan. Report the `diffs` to the user. Record the numbers for the Status block, then `rm tests/zz-w-live.test.ts` and do not commit it.

- [ ] **Step 2: Document the points source**

In `docs/reference/value-and-signals.md`, under `### Conventions used throughout`:

- Change "(the team played and the player was matched to nflverse)" to "(Sleeper has a stat line for the player that week or, failing that, the player was matched to nflverse)".
- Change "Points are league points under the league's own scoring rules." to:

```md
Points are league points under the league's own scoring rules, scored from Sleeper's own weekly stat lines (`sleeper_week_stats`, synced by `refreshSleeperStats`), so they equal Sleeper's. A player-week Sleeper has no line for falls back to nflverse. Usage shares (target share, snaps, WOPR) always come from nflverse.
```

Then:

```bash
npx prettier --write docs/reference/value-and-signals.md
git add docs/reference/value-and-signals.md
git commit -m "docs: document Sleeper stats as the points source"
```

- [ ] **Step 3: Write the amendments into the spec**

In `docs/superpowers/specs/2026-10-14-sleeper-stats-scoring-design.md`:

- Change the header's status to `approved 2026-10-14, amended 2026-10-14 (§7: Plan W)`.
- Append:

```md
## 7. Amendment 2026-10-14: Plan W

Plan W was built against Sleeper's live stats for the user's league. With these changes, the app's points equal Sleeper's matchup points for every rostered player in every completed 2026 week (1,066 of 1,066 player-weeks, weeks 1–4), measured 2026-10-14.

- **The stats sync is its own function** (§3.3).
  - `refreshSleeperStats` runs in `refreshAll` and `importAll`, after the Sleeper sync and before nflverse.
  - A stored week sets `refreshNflverse`'s `sleeperStatsChanged`, which re-runs `app:points`.
  - nflverse's own steps keep their order.
- **Rows kept: `gp ≥ 1`** (§3.2). A row without `gp` carries only ranks, `gms_active` and team snap counts (304 of 780 rows in 2026 week 4).
- **Fields dropped: exactly `pts_std`, `pts_ppr`, `pts_half_ppr`, `pts_idp` and `pos_rank_*`** (§3.2). `pts_allow` and its tiers are defense stats; dropping every `pts_*` key scored every defense as a shutout.
- **The catalogue** (§3.7).
  - Every catalogue key is `supported`.
  - A new `nflverse` flag marks the keys the nflverse fallback computes; the adapter contract tests check it.
  - The Rules screen's note lists only keys outside the catalogue: "Not known to this app (scored as 0)".
- **`statsAvailable` keeps its meaning** (§3.6). It still means "has an nflverse identity" and still gates the usage signals. A player scored only from Sleeper gets points and a stat line but no usage signals.
- **First sync:** 23 requests in 5.6 s; the app database grows by about 4.4 MB.
```

Then:

```bash
npx prettier --write docs/superpowers/specs/2026-10-14-sleeper-stats-scoring-design.md
git add docs/superpowers/specs/2026-10-14-sleeper-stats-scoring-design.md
git commit -m "docs(spec): amend Sleeper stats spec for plan W"
```

- [ ] **Step 4: Final verification and dev run**

Run: `npm run typecheck && npx eslint src tests electron.vite.config.ts && npm test`
Expected: all green. Note the test count.

Note the size of `~/.config/FantasyCompanion/companion.db`. Then run `npm run dev` with the Bash tool's `run_in_background`. The launch refresh runs the 23 stats steps and recomputes points. Wait until `app:points` has a row newer than the launch, using this query:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(db.prepare(\"SELECT source,status,rows_written,message,started_at FROM sync_log WHERE source LIKE 'sleeper:stats:%' OR source = 'app:points' ORDER BY id DESC LIMIT 6\").all());console.log(db.prepare('SELECT COUNT(*) AS n FROM sleeper_week_stats').get())" ~/.config/FantasyCompanion/companion.db
```

Stop the app: kill by PID from `ps -eo pid,args | grep '[e]lectron/dist/electron'`, and then the `electron-vite dev` parent if it is still alive.

Expected:

- `sleeper:stats:*` steps ok, `app:points` ok.
- `sleeper_week_stats` holds about 10,000 rows (two seasons).
- `companion.db` grows by about 4–5 MB.
- No main-process errors other than the GPU / zygote lines printed on shutdown.
- If WSLg can't show the window, say so in the Status block.

- [ ] **Step 5: Merge and tag**

```bash
git checkout main && git merge --no-ff feat/sleeper-stats-scoring -m "merge: feat/sleeper-stats-scoring (plan W)"
npm version minor --no-git-tag-version
git add package.json package-lock.json
git commit -m "build: bump version to 0.23.0"
git tag -a v0.23.0 -m "build: bump version to 0.23.0"
```

Expected: `package.json` at `0.23.0`, with an annotated tag `v0.23.0`. **Ask the user before** `git push --follow-tags`, which triggers the Windows release workflow.

- [ ] **Step 6: Status block**

Replace this plan's `**Status:**` line with:

- the completion date;
- the merge and tag hashes;
- the test count;
- the Step 1 numbers (seconds, per-week agreement, size);
- the Step 4 numbers (row count, `companion.db` size);
- what was not verified (GUI).

Then:

```bash
npx prettier --write docs/superpowers/plans/2026-10-14-plan-w-sleeper-stats-scoring.md
git add docs/superpowers/plans/2026-10-14-plan-w-sleeper-stats-scoring.md
git commit -m "docs(plan): mark plan W complete"
```

---

## Self-review against the spec

| Spec                                                                                                               | Where                                                      |
| ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| §3.1 `getStats` on the projections host, position filter, IDP when scored, null when gone                          | Task 2; `scoresIdp` in Task 5                              |
| §3.1 seasons and weeks (prior 1–18; current through the state week; post / off all; pre none)                      | Task 5 (`statsWeeks`)                                      |
| §3.2 `sleeper_week_stats`, replace by week, rows kept, fields dropped                                              | Task 3 (amendments B, C)                                   |
| §3.3 one step a week, freshness 6 h / 7 days / 30 days, forced recent weeks, gone endpoint stops, points recompute | Task 5 (amendment A)                                       |
| §3.4 `sleeperStatLine`, zeros restored on a DEF that played                                                        | Task 4                                                     |
| §3.5 Sleeper first, nflverse fallback, unresolved players scored, unknown ids ignored                              | Task 4                                                     |
| §3.6 display the scored line; usage on nflverse                                                                    | Task 6 (amendment E)                                       |
| §3.7 the 24 keys supported, Rules note                                                                             | Task 1 (amendment D)                                       |
| §4 fixture, client, mapper, line, scoring, sync, display tests                                                     | Tasks 1–6                                                  |
| §5 points gate, DEF agreement, first-sync time and size                                                            | Task 7 Step 1 (DEF agreement is part of the per-week gate) |
| §6 out of scope respected (engine, projections, warehouse, signals)                                                | Global Constraints                                         |
