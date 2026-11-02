# Plan AF1 — Ask: the analyst tools, resolver and semantic model

**Status:** written 2026-11-02 from a prototype; not started. The spec amendments below (spec §15, written by Task 10) need the user's approval before Task 1.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the tool layer of Ask (spec §2–§5, §7): everything the MCP server (Plan AF2) and the agent loop (Plan AG) share, testable without any model.

- **The semantic model:** aliases for every shown metric, a definition for every dimension, the glossary, and the model as YAML for AF2's MCP resource.
- **The resolver:** reads a question before any model does — players and namesakes, teams and opponents, metric candidates, time, the slots its words name — and picks the question type and the compact tool, declining advice and out-of-range seasons.
- **The analyst tools:** `find`, `leaderboard`, `player_stats`, `team_stats`, `compare`, `trend`, `outlook`, `games`, `league`, `describe`, `query`, over the engine (never SQL), with errors that teach, splits against their base with a noise interval, an exact cache, compact text for the model and cards for the screen.
- **The compact profile** for small local models, the **briefs**, the **answer checks**, **traces** and the **example library** table.
- **The evaluation questions** and the AF1 gate on a frozen copy of the warehouse.
- Ship `v0.37.0`.

**Architecture:**

- **Main process**, new `src/main/analyst/`: `resolve.ts` (with `players`, `teams`, `metrics`, `time`, `slots`, `classify`, `text`), `tools.ts` (with `schema`, `format`, `splits`, `league`), `compact.ts`, `brief.ts` + `brief/*.md`, `checks.ts`, `trace.ts`. Nothing calls it yet: AF2 puts it behind MCP, AG behind the loop.
- **Shared:** `src/shared/ask.ts` (tool results and cards); `src/shared/stats/aliases.ts`, `dimensions.ts`, `glossary.ts`, `semanticModel.ts`; `querySchema.ts` takes the warehouse's seasons and gives bounded numbers as enums.
- **Stats worker:** one new read, `people` (the resolver's player index). No engine, catalogue, derived-table or model change, no `DERIVED_VERSION` bump.
- **`companion.db`:** migration 012, `ask_examples`.
- **Tests:** `tests/main/analyst/` (a fake engine that records each query; a small player index with namesakes), `tests/ask/` (the questions and the gate).

**Tech Stack:** Electron 39, TypeScript strict, Vitest, DuckDB (`@duckdb/node-api`) in the stats worker, `node:sqlite` for `companion.db`. No new dependency.

**Spec:** `docs/superpowers/specs/2026-11-01-ask-analyst-design.md` (approved 2026-11-02): §2, §3, §4, §5.3, §7, §9, §10, the AF1 row of §11. Amended by this plan: Task 10 writes the amendments into the spec as §15. Research behind it: `docs/research/2026-11-01-ask-analyst-state-of-the-art.md` (decisions D1–D12, probes P1–P4).

## Decisions (user, 2026-11-02)

- **AF is split:** AF1 (this plan, `v0.37.0`) is the tool layer; AF2 (`v0.38.0`) the MCP server, bridge and Settings › Ask; AG `v0.39.0`; AH `v0.40.0`.
- **The spec is approved as written**, its open points included (spec §14).
- **Newer models** (user, 2026-11-01): the Gemma 3 models are old; AG re-tests on current light and larger models. AF1's measurements use the installed ones only to check that the tools work end to end.

## Planning findings (live data, 2026-11-02)

Measured on a copy of the Windows app's `stats.duckdb` (v0.36.0, derived 3, models 1; 2019 – 2026 week 7) with the code of this plan, and on this laptop (i7-13620H, RTX 4060 Laptop 8 GB, Ollama 0.16.2).

- **The warehouse copy must be current.** The dev copy in WSL (built 2026-10-24) has older derived tables: the service refuses its reads ("the stats are still being built"). The gate runs on a copy of the Windows app's database, named by `FFC_ASK_DB` and copied again before it is opened (opening writes).
- **People:** 4,972 with a regular-season game since 2019; the read takes 84–128 ms and the index 12–20 ms. Namesakes are real: two Lamar Jacksons (QB, DB), two Justin Jeffersons (WR, LB), three Chris Joneses, and, both active, two Byron Youngs, Jaylon Joneses, Jordan Phillipses, Marcus Harrises and Jonah Williamses (the must-ask questions).
- **The resolver** takes 40–50 ms a question (the misspelt-full-name pass is most of it). On the 163 questions: the right compact tool for 140 of 140, the named metric in the top 5 for 107 of 107, the players for 64 of 64, and all 12 must-ask or must-decline questions it can see (namesakes, advice, seasons out of range). On the probe's 40 phrasings: 40 of 40 (the probe measured 0.93 before aliases). Writing the questions found six resolver gaps (Task 9 Step 1).
- **The tools:** every one of 141 reference calls runs and returns rows: 16 ms median, 44 ms at the 90th percentile, under 0.2 s at most (a player's line reads a league query of up to 5,000 rows: 100–200 ms); a cache hit is 0 ms.
- **Splits:** Ja'Marr Chase's 2025 yards per route against man, 1.79 on 210 routes against 2.26 on 626, is within noise (±0.72); against zone, 2.49 on 416, within noise too. Josh Allen's 2025 EPA per dropback on 4th down, +0.625 on 21 dropbacks against +0.190, is within noise.
- **End to end** (resolver → compact schema → model through Ollama `format` → compact answer → tool), the probe's 20 questions on AC power: `qwen3:4b` 20 of 20 right at 2.0 s median (2.2 s at the 90th percentile), `gemma3:4b` 19 of 20 at 1.4 s (a game log answered `other`; offering `default` first fixed it for `qwen3:4b`). On battery the GPU stays in its low power state (P8, 5 W): 25–30 tokens a second against 60–70, a call 3–4× as long. AG's evaluation must record the power state and gate on AC.
- **`bge-m3` in Ollama** returned NaN for 12 of 326 catalogue entries (report P1): embeddings stay out of AF1 (amendment C).

## Spec amendments (taken in this plan)

Task 10 Step 1 records these in the spec as §15. **Confirm them with the user before starting Task 1** if they have not been approved yet.

- **A. Aliases beside the catalogue (§4.2):** `src/shared/stats/aliases.ts`, keyed by metric id, not a `MetricDef.aliases` field. `MetricInfo` does not change.
- **B. The YAML export is a function (§4.2):** `semanticModelYaml()`, served by AF2's MCP server. No committed file, no script.
- **C. The resolver in AF1 (§4.1):** lexical matching with aliases, light stemming and the entity / position filter. Embeddings come in AG with the local-server detection, behind the same `Retriever`; thread state with the loop (AG); screen context with Ctrl+K (AH).
- **D. The exact cache lives in the analyst layer (§5.3)**, keyed on the query and cleared when the warehouse's `through` or `updatedAt` changes; the worker gains only the `people` read.
- **E. Splits and empty results are explained in the analyst layer (§3.3):** a line from a league query (rank and percentile among the position or the 32), a split from a second query, the interval SE = √(k·σ²_t·(1/n − 1/N)) with σ²_t = σ²_obs / (1 + k/n̄), within noise when |diff| < 1.96·SE; an empty ranking re-runs without qualification to say why.
- **F. The compact profile (§3.2)** also offers `outlook`, and a line's metrics offer `default` first.
- **G. `open_in_app` moves to Plan AH** (it needs the renderer's navigation).
- **H. The answer checks are one module** (`checks.ts`), not a folder.
- **I. The questions (§7):** 163 in 16 categories, 116 dev and 47 held out; paraphrases in AG; the frozen database is a copy of `stats.duckdb` through 2026 week 7 named by `FFC_ASK_DB`; league questions wait for AG's league fixture.
- **J. Tool text (§3.3):** a line per row; at most 15 rows and the first metric plus 4 (`concise`), 50 and 12 (`full`).
- **K. Measured:** the findings above.

## Global Constraints

- **Branch** `feat/analyst-af1` off `main`.
- **Commits.** One Conventional Commit per "Check and commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- **Never stage these.** The working tree has unrelated changes that are not part of this plan:
  - `.gitignore`, `.design-sync/`, `docs/design/FantasyCompanion UI/`;
  - `docs/research/nfl_predictive_metrics.md:Zone.Identifier`;
  - `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts`;
  - `tsconfig.node.tsbuildinfo`, `tsconfig.web.tsbuildinfo`.

  Stage files by name; never run `git add -A` or `git add .`.

- **Formatting and lint.**
  - Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`** (it rewrites the Sleeper fixtures).
  - Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
  - Typecheck with `npm run typecheck`.
- **Copy the code exactly.** Every new file is given whole. Every change to an existing file is a diff that `git apply` takes as written: save it to a file and run `git apply <file>`, or make the same edit by hand. The tasks were replayed in order on a clean copy of `main`, with typecheck, lint and the full suite green after each, and the final tree is byte-identical to the prototype.
- **Test counts** are those of a clean checkout (`main`: 1,187 passed, 5 skipped). In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3. One existing test is flaky under the full suite and unrelated to this plan: `tests/renderer/components/DevTools.test.tsx` › "snip shows the frozen capture, and Esc cancels it without closing anything else" failed in about one run of four during the replay, at commits that change no renderer code; re-run the suite when it is the only failure.
- **Scope.**
  - No screen, IPC, preload or renderer change: nothing calls the analyst layer until AF2.
  - The stats worker gains the `people` read only; the engine, catalogue, derived tables and models do not change.
  - No network in any test. The gate (Task 11) reads a local copy of the warehouse; the optional end-to-end check talks to Ollama on `localhost`.
- **Gates.**
  - **Task 11:** `npm run test:ask` with `FFC_ASK_DB` passes: every reference call runs and returns rows; the tool ≥ 90 %, metric recall@5 ≥ 95 %, players ≥ 95 %, every must-ask or must-decline question the resolver can see.
  - **Task 12 Step 2:** the Windows suite and self-test on the Package check workflow.
  - If a gate fails, stop and report the numbers to the user.
- **Release** `v0.37.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push**: `check/plan-af1` in Task 12, then `main` and the tag.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **A number that is not in the data.** Examples: a percentage shown as a fraction, a rounding the number check cannot read back, a split's difference without its unit.
   - Task 5: the leaderboard and split texts, value by value. Task 7: the checks accept the results' numbers (percentages, samples, ranks, differences) and flag the others.
2. **The wrong player.** Examples: the cornerback Lamar Jackson, "goal line" read as Zach Line, the Steelers read as two players named Steele, a misspelt name lost.
   - Task 4: namesakes, everyday and football words, near spellings, team words excluded. Task 11: players 64 of 64 on the whole set.
3. **Noise read as signal, or signal as noise.** Examples: a split on 21 dropbacks called a weakness; a count given an interval.
   - Task 5: `splitStat` against the formula, counts without an interval, the split counter from the third split.
4. **A call the tools accept and the engine refuses.** Examples: a season out of range, a team metric with a position, a player metric in `team_stats`, a default metric that cannot be split by situation.
   - Task 1 (enum bounds), Task 5 (each refusal in words), Task 11 (all 141 reference calls run).
5. **A small model stuck.** Examples: an array repeated until the token limit, an optional choice with no neutral value, a game log with no metric to pick.
   - Task 6: bounds, neutral defaults, `default` and `other`.
6. **A stale answer.** Examples: a cached result after a refresh, a player index from last week.
   - Task 5: the cache and the index are read again when the warehouse's state changes.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/analyst-af1
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/analyst-af1`.

---

### Task 1: Bounded numbers as enums in the query schema (spec §3.2 rule 7)

The probe (report P4) found that grammar-constrained decoding turned `minimum: 2019` into seasons like 2600 and 2126: no query ran. `statsQuerySchema` takes the warehouse's seasons and gives seasons, weeks, downs and quarters as enums; `lastNGames` and `limit` lose their bounds (the engine still checks them).

**Files:**

- Modify: `src/shared/stats/querySchema.ts`, `tests/shared/stats/catalogue.test.ts`

- [ ] **Step 1: Write the tests**

Modify `tests/shared/stats/catalogue.test.ts`:

```diff
diff --git a/tests/shared/stats/catalogue.test.ts b/tests/shared/stats/catalogue.test.ts
index deed2d0..fe5e6f1 100644
--- a/tests/shared/stats/catalogue.test.ts
+++ b/tests/shared/stats/catalogue.test.ts
@@ -57,7 +57,10 @@ describe('the metric catalogue (stats-analysis spec §6)', () => {
   })

   it('lists its ids as the metric enum of the query schema (spec §10)', () => {
-    const schema = statsQuerySchema(CATALOGUE.map((m) => m.id)) as {
+    const schema = statsQuerySchema(
+      CATALOGUE.map((m) => m.id),
+      [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]
+    ) as {
       required: string[]
       properties: Record<
         string,
@@ -69,6 +72,16 @@ describe('the metric catalogue (stats-analysis spec §6)', () => {
     expect(Object.keys(schema.properties.situation.properties ?? {})).toContain('withOnField')
   })

+  it('gives bounded numbers as enums, never minimum or maximum (Ask spec §3.2)', () => {
+    const schema = statsQuerySchema(['targets'], [2025, 2026])
+    const text = JSON.stringify(schema)
+    expect(text).not.toMatch(/"minimum"|"maximum"/)
+    const scope = (schema as { properties: { scope: { properties: Record<string, unknown> } } })
+      .properties.scope.properties
+    expect(scope.seasons).toMatchObject({ items: { enum: [2025, 2026] } })
+    expect(scope.weeks).toMatchObject({ items: { enum: expect.arrayContaining([1, 22]) } })
+  })
+
   it('reads a defense’s sacks and pressures as its own, red-zone drives both ways', () => {
     const m = (id: string): (typeof CATALOGUE)[number] => CATALOGUE.find((x) => x.id === id)!
     // A defense's sack and pressure rates are what it does to the passer: higher is better.
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/shared/stats/catalogue.test.ts
```

Expected: FAIL — the new test fails: the schema still has `minimum` / `maximum`, and `statsQuerySchema` takes one argument.

- [ ] **Step 3: Implement**

Modify `src/shared/stats/querySchema.ts`:

```diff
diff --git a/src/shared/stats/querySchema.ts b/src/shared/stats/querySchema.ts
index d16248b..33e818d 100644
--- a/src/shared/stats/querySchema.ts
+++ b/src/shared/stats/querySchema.ts
@@ -6,6 +6,10 @@ import { POSITION_GROUPS, type GroupBy, type StatsQuery, type Transform } from '
  * natural-language feature will hand an LLM, with the catalogue's ids as the metric enum. Every
  * `properties` object is typed `Record<keyof …, Schema>`, so the compiler fails when the type gains
  * or loses a field the schema does not.
+ *
+ * Bounded numbers are enums, never `minimum` / `maximum` (Ask spec §3.2 rule 7): a local model under
+ * grammar-constrained decoding wrote seasons like 2600 and 2126 that met `minimum: 2019`. The engine
+ * still validates every value.
  */
 const GROUP_BY: Record<GroupBy, true> = {
   season: true,
@@ -44,14 +48,19 @@ const list = (items: Schema, description: string): Schema => ({
   description
 })
 const team = { type: 'string', pattern: '^[A-Z]{2,3}$' }
+/** 1 … n as an enum. */
+const upTo = (n: number): Schema => ({ enum: Array.from({ length: n }, (_, i) => i + 1) })
+/** The regular season and the postseason: weeks 1–22. */
+const WEEKS = 22
 const gsis = { type: 'string', pattern: '^00-[0-9]{7}$' }

-export function statsQuerySchema(metricIds: string[]): Schema {
+/** `seasons`: the seasons the warehouse holds, oldest first (2019 to the current one). */
+export function statsQuerySchema(metricIds: string[], seasons: number[]): Schema {
   const scope: Record<keyof StatsQuery['scope'], Schema> = {
-    seasons: list({ type: 'integer', minimum: 2019 }, 'Seasons, 2019 to the current one.'),
+    seasons: list({ enum: seasons }, 'Seasons.'),
     seasonType: { enum: ['REG', 'POST', 'ALL'], description: 'Default REG.' },
-    weeks: range('First and last week, inclusive.'),
-    lastNGames: { type: 'integer', minimum: 1, description: 'Each row’s last N games in scope.' },
+    weeks: { ...range('First and last week, inclusive.'), items: upTo(WEEKS) },
+    lastNGames: { type: 'integer', description: 'Each row’s last N games in scope (1 or more).' },
     positions: list({ enum: [...POSITION_GROUPS] }, 'Position groups (players).'),
     teams: list(team, 'Team codes (nflverse: LA, LV, WAS, …).'),
     opponents: list(team, 'Opponent team codes.'),
@@ -63,9 +72,9 @@ export function statsQuerySchema(metricIds: string[]): Schema {
     qualifiedOnly: { type: 'boolean', description: 'Only rows over the metric’s minimum sample.' }
   }
   const situation: Record<keyof NonNullable<StatsQuery['situation']>, Schema> = {
-    down: list({ type: 'integer', minimum: 1, maximum: 4 }, 'Downs.'),
+    down: list(upTo(4), 'Downs.'),
     distance: range('Yards to go.'),
-    quarter: list({ type: 'integer', minimum: 1, maximum: 5 }, 'Quarters; 5 is overtime.'),
+    quarter: list(upTo(5), 'Quarters; 5 is overtime.'),
     fieldZone: { enum: ['redzone', 'inside10', 'inside5', 'own20'] },
     scoreMargin: range('Offense score minus defense score.'),
     winProbability: range('Offense win probability, 0–1.'),
@@ -126,7 +135,7 @@ export function statsQuerySchema(metricIds: string[]): Schema {
       required: ['metric', 'dir'],
       additionalProperties: false
     },
-    limit: { type: 'integer', minimum: 1, maximum: 5000 },
+    limit: { type: 'integer', description: 'Rows, 1–5000.' },
     scoring: {
       enum: [...SCORINGS],
       description: 'Fantasy scoring; league needs an imported league.'
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/shared/stats/catalogue.test.ts
```

Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/shared/stats/querySchema.ts tests/shared/stats/catalogue.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/shared/stats/querySchema.ts tests/shared/stats/catalogue.test.ts
git commit -m "fix(stats): give query schema bounds as enums"
```

Expected: typecheck and lint clean; the suite at 1,188 passed, 5 skipped (a clean checkout).

---

### Task 2: The semantic model: metric aliases, dimensions, glossary (spec §4.2; amendments A, B)

Aliases for all 294 core and extended metrics in their own file, keyed by id; a `DimensionDef` for every situation filter and `groupBy` value (and home, opponent, recent games); the glossary built from them; the semantic model and its YAML (block style, quoting what needs it) for AF2's MCP resource. Tests: every core and extended metric has an alias, no alias names two metrics, every situation filter and split has a dimension, no synonym names two.

**Files:**

- Create: `src/shared/stats/aliases.ts`, `src/shared/stats/dimensions.ts`, `src/shared/stats/glossary.ts`, `src/shared/stats/semanticModel.ts`, `tests/shared/stats/semanticModel.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/shared/stats/semanticModel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { METRIC_ALIASES, phraseKey } from '@shared/stats/aliases'
import { CATALOGUE, METRICS } from '@shared/stats/catalogue'
import { DIMENSIONS } from '@shared/stats/dimensions'
import { GLOSSARY, glossaryText } from '@shared/stats/glossary'
import { semanticModel, semanticModelYaml } from '@shared/stats/semanticModel'
import type { GroupBy, StatsQuery } from '@shared/stats/types'

describe('metric aliases (Ask spec §4.2)', () => {
  it('names only catalogue metrics, and every core and extended one', () => {
    for (const id of Object.keys(METRIC_ALIASES)) expect(METRICS.has(id), id).toBe(true)
    const missing = CATALOGUE.filter(
      (m) => m.tier !== 'stored' && (METRIC_ALIASES[m.id]?.length ?? 0) === 0
    ).map((m) => m.id)
    expect(missing).toEqual([])
  })

  it('never points one alias at two metrics', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const [id, aliases] of Object.entries(METRIC_ALIASES)) {
      for (const a of aliases) {
        const key = phraseKey(a)
        const other = seen.get(key)
        if (other && other !== id) clashes.push(`"${a}": ${other} and ${id}`)
        seen.set(key, id)
      }
    }
    expect(clashes).toEqual([])
  })

  it('compares phrases without case, apostrophes or punctuation', () => {
    expect(phraseKey("His Team's  Targets!")).toBe('his teams targets')
    expect(phraseKey('ANY/A')).toBe('any a')
  })
})

describe('dimensions (Ask spec §4.2)', () => {
  it('cover every situation filter and every groupBy of StatsQuery', () => {
    const situation: (keyof NonNullable<StatsQuery['situation']>)[] = [
      'down',
      'distance',
      'quarter',
      'fieldZone',
      'scoreMargin',
      'winProbability',
      'neutral',
      'twoMinute',
      'pressure',
      'blitz',
      'playAction',
      'coverage',
      'formation',
      'personnel',
      'box',
      'airYards',
      'withOnField',
      'withoutOnField'
    ]
    const groupBy: GroupBy[] = [
      'season',
      'week',
      'team',
      'opponent',
      'down',
      'quarter',
      'personnel',
      'coverage',
      'formation'
    ]
    const has = (q: object): boolean =>
      DIMENSIONS.some((d) => JSON.stringify(d.query) === JSON.stringify(q))
    for (const s of situation) expect(has({ situation: s }), s).toBe(true)
    for (const g of groupBy) expect(has({ groupBy: g }), g).toBe(true)
  })

  it('have unique ids, a description and synonyms, and no synonym shared by two', () => {
    expect(new Set(DIMENSIONS.map((d) => d.id)).size).toBe(DIMENSIONS.length)
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const d of DIMENSIONS) {
      expect(d.description.length, d.id).toBeGreaterThan(10)
      expect(d.synonyms.length, d.id).toBeGreaterThan(0)
      for (const s of [...d.synonyms, ...(d.values ?? []).flatMap((v) => v.synonyms)]) {
        const key = phraseKey(s)
        const other = seen.get(key)
        if (other && other !== d.id) clashes.push(`"${s}": ${other} and ${d.id}`)
        seen.set(key, d.id)
      }
    }
    expect(clashes).toEqual([])
  })

  it('say which seasons have them: FTN from 2022, participation through the prior season', () => {
    const d = (id: string): (typeof DIMENSIONS)[number] => DIMENSIONS.find((x) => x.id === id)!
    expect(d('blitz')).toMatchObject({ firstSeason: 2022 })
    expect(d('pressure')).toMatchObject({ lastSeason: 'prior' })
    expect(d('down').lastSeason).toBeUndefined()
  })
})

describe('the glossary and the semantic model (Ask spec §4.2)', () => {
  it('takes dimension terms from their definitions', () => {
    const pressure = GLOSSARY.find((g) => g.term === 'Pressure')
    expect(pressure?.text).toBe(DIMENSIONS.find((d) => d.id === 'pressure')?.description)
    expect(glossaryText()).toContain('- Qualified: ')
  })

  it('lists datasets, the shown metrics with synonyms, and the dimensions', () => {
    const model = semanticModel(
      new Map([
        ['yprr', { yearToYear: 0.6, pairs: 9, splitHalf: 0.7, prior: 120, reliability: 'high' }]
      ])
    )
    expect(model.datasets.map((d) => d.name)).toEqual(['players', 'teams'])
    expect(model.metrics.length).toBe(CATALOGUE.filter((m) => m.tier !== 'stored').length)
    expect(model.metrics.find((m) => m.name === 'yprr')).toMatchObject({
      dataset: 'players',
      synonyms: expect.arrayContaining(['yards per route run']),
      stability: { yearToYear: 0.6, reliability: 'high' }
    })
    expect(model.dimensions.find((d) => d.name === 'personnel')?.values).toContain('11')
  })

  it('writes block YAML, quoting what needs it', () => {
    const yaml = semanticModelYaml()
    expect(yaml).toMatch(/^name: FantasyCompanion stats\n/)
    expect(yaml).toContain('\n  - name: yprr\n')
    expect(yaml).toContain('    synonyms:\n      - yards per route run\n')
    // "11" would read as a number, and ": " would break the line: both are quoted.
    expect(yaml).toContain('      - "11"\n')
    const unquoted = yaml.split('\n').filter((line) => {
      const value = /^\s*(?:- )?[A-Za-z_]+: (.*)$/.exec(line)?.[1]
      return value !== undefined && !value.startsWith('"') && value.includes(': ')
    })
    expect(unquoted).toEqual([])
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/shared/stats/semanticModel.test.ts
```

Expected: FAIL — the test file cannot import `@shared/stats/aliases`, `dimensions`, `glossary`, `semanticModel`.

- [ ] **Step 3: Implement**

Create `src/shared/stats/aliases.ts`:

```ts
/**
 * The words people use for each metric (Ask spec §4.2): abbreviations, slang and paraphrases the
 * catalogue's label, short name and description do not already contain. The resolver matches them
 * before the words of the description. Keyed by catalogue id, every `core` and `extended` metric
 * has at least one; no alias names two metrics (tests/shared/stats/aliases.test.ts).
 *
 * Kept beside the catalogue rather than in each `MetricDef`, so the catalogue stays the formulas and
 * this file stays the vocabulary.
 */
export const METRIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  // Passing
  pass_att: ['pass attempts', 'throws', 'attempts'],
  pass_cmp: ['completions', 'completed passes'],
  pass_cmp_pct: ['completion percentage', 'comp pct', 'completion rate'],
  pass_yds: ['passing yards', 'pass yards', 'yards through the air'],
  pass_td: ['passing touchdowns', 'touchdown passes', 'td passes'],
  pass_int: ['interceptions thrown', 'picks thrown', 'ints thrown'],
  pass_ypa: ['yards per pass attempt', 'ypa'],
  pass_nya: ['net yards per pass attempt', 'nya'],
  pass_anya: ['adjusted net yards per attempt', 'anya', 'any/a'],
  passer_rating: ['qb rating', 'nfl passer rating'],
  pass_td_rate: ['touchdown pass rate', 'td percentage'],
  pass_int_rate: ['interception rate', 'pick rate', 'int percentage'],
  sacks_taken: ['times sacked', 'sacks taken'],
  sack_rate: ['sacked rate', 'how often he gets sacked', 'sack percentage'],
  qb_epa_db: ['qb epa', 'epa per dropback', 'quarterback epa'],
  qb_success: ['qb success rate', 'passing success rate'],
  cpoe: [
    'completion percentage over expected',
    'completion pct over expectation',
    'accuracy over expected',
    'accurate relative to expectation'
  ],
  xcmp_pct: ['expected completion percentage', 'xcomp'],
  qbr: ['espn qbr', 'total qbr'],
  time_to_throw: ['time to throw', 'gets rid of the ball', 'release time', 'how quickly he throws'],
  aggressiveness: ['tight window throws', 'throws into tight windows'],
  pass_adot: ['qb adot', 'qb average depth of target', 'how far downfield he throws'],
  air_to_sticks: ['air yards to the sticks', 'throws short of the sticks', 'ayts'],
  deep_rate: ['deep ball rate', 'how often he throws deep', 'deep attempts'],
  deep_epa: ['deep ball epa', 'deep passing epa'],
  bad_throw_pct: ['bad throws', 'inaccurate throws', 'off target throws'],
  int_worthy_rate: ['turnover worthy throws', 'interception worthy plays'],
  qb_pressured_pct: ['how often he is pressured', 'qb pressure rate'],
  qb_pressure_pfr: ['pfr pressure rate', 'pressure rate pfr'],
  p2s_rate: ['pressure to sack', 'pressures turned into sacks'],
  pressured_epa: ['epa under pressure', 'epa when pressured', 'under pressure'],
  clean_epa: ['clean pocket epa', 'epa from a clean pocket', 'kept clean'],
  play_action_rate: ['qb play action rate', 'play action usage'],
  play_action_epa: ['qb play action epa', 'epa on play action'],
  blitz_epa: ['epa vs blitz', 'against the blitz', 'blitz beater'],
  scrambles: ['qb scrambles', 'scramble attempts'],
  scramble_yds: ['scramble yards', 'yards scrambling'],
  designed_runs: ['designed qb runs', 'called runs'],
  // Rushing
  carries: ['rush attempts', 'rushes', 'attempts on the ground'],
  rush_yds: ['rushing yards', 'yards on the ground', 'ground yards'],
  rush_td: ['rushing touchdowns', 'rushing tds'],
  rush_ypc: ['yards per carry', 'ypc', 'yards per rush', 'yards a carry'],
  rush_epa: ['rushing epa', 'epa per rush'],
  rush_success: ['rushing success', 'run success rate'],
  explosive_run_rate: ['explosive runs', 'big runs', 'ten yard runs'],
  breakaway_pct: ['breakaway runs', 'long runs', 'breakaway rate'],
  stuff_rate: ['stuffed runs', 'runs stopped at the line', 'stuffed rate'],
  rz_carries: ['red zone carries', 'red zone rushes', 'red zone attempts'],
  i10_carries: ['carries inside the ten', 'inside the 10 carries'],
  i5_carries: ['goal line carries', 'carries inside the five', 'goal line work'],
  ryoe: [
    'rushing yards over expected',
    'yards over expected',
    'beyond what blocking gives',
    'beat their blocking'
  ],
  ryoe_att: ['rushing yards over expected per carry', 'ryoe per carry', 'ryoe per attempt'],
  rush_pct_over_expected: ['rush percent over expected', 'ngs rush over expected'],
  box8_rate: ['stacked boxes', 'eight man boxes', 'loaded box'],
  ybc_att: ['yards before contact', 'ybc per carry'],
  yac_att: ['yards after contact', 'yards after contact per carry', 'yaco'],
  broken_tackles_touch: ['broken tackles', 'missed tackles forced', 'elusiveness'],
  // Receiving
  targets: ['looks', 'times targeted', 'target count'],
  receptions: ['catches', 'balls caught'],
  rec_yds: ['receiving yards', 'yards receiving'],
  rec_td: ['receiving touchdowns', 'receiving tds', 'touchdown catches'],
  catch_rate: ['catch percentage', 'catches per target'],
  rec_ypr: ['yards per catch', 'yards per reception', 'ypr'],
  rec_ypt: ['yards per target', 'ypt'],
  target_share: [
    'share of team targets',
    'share of the targets',
    "share of his team's targets",
    'tgt share'
  ],
  air_yards_share: ['share of air yards', 'ay share'],
  wopr: ['weighted opportunity rating', 'wopr score'],
  rec_adot: ['receiver adot', 'average depth of target', 'adot', 'how deep he is targeted'],
  racr: ['receiver air conversion ratio', 'air conversion'],
  routes: ['routes run', 'route count'],
  route_participation: ['route share', 'route rate', 'running a route on dropbacks'],
  yprr: ['yards per route run', 'yards per route', 'yprr'],
  tprr: [
    'targets per route run',
    'targets per route',
    'target rate per route',
    'earns a target on his routes'
  ],
  fd_per_route: ['first downs per route', 'first downs per route run'],
  yac_rec: ['yards after catch', 'yac per catch', 'yac'],
  yacoe: ['yards after catch over expected', 'yac over expected'],
  separation: ['separation from defenders', 'gets open', 'getting open'],
  cushion: ['defender cushion', 'off coverage cushion'],
  drops: ['dropped passes', 'drops'],
  drop_rate: ['drop percentage', 'drops catchable passes'],
  catchable_pct: ['catchable targets', 'catchable balls'],
  contested_targets: ['contested looks', 'jump balls'],
  contested_catch_rate: ['contested catches', '50 50 balls', 'contested catch percentage'],
  ez_targets: ['end zone targets', 'end zone looks'],
  i10_targets: ['targets inside the ten', 'inside the 10 targets'],
  rec_epa: ['receiving epa', 'epa per target'],
  tprr_man: ['targets per route vs man', 'tprr against man'],
  tprr_zone: ['targets per route vs zone', 'tprr against zone'],
  yprr_man: ['yards per route vs man', 'yprr against man'],
  yprr_zone: ['yards per route vs zone', 'yprr against zone'],
  // Usage
  games: ['games played', 'appearances'],
  off_snaps: ['offensive snaps played', 'snap count'],
  snap_share: ['snap percentage', 'snap rate', 'share of snaps', 'plays the most snaps'],
  def_snaps: ['defensive snaps played', 'defensive snap count'],
  def_snap_share: ['defensive snap percentage', 'defensive snap rate'],
  st_snaps: ['special teams snaps', 'teams snaps'],
  carry_share: ['share of team carries', 'rushing share', 'backfield share'],
  opportunity_share: ['share of rb opportunities', 'rb opportunity share'],
  rz_opportunity_share: ['red zone share', 'share of red zone opportunities'],
  high_value_touches: ['hvt', 'high value touches', 'goal line and catches'],
  touches: ['total touches', 'carries plus catches'],
  scrimmage_yds: ['yards from scrimmage', 'total yards'],
  total_td: ['total touchdowns', 'scrimmage touchdowns', 'tds scored'],
  weighted_opportunities: ['weighted opportunity', 'weighted touches'],
  on_field_epa: ['epa with him on the field', 'on field epa'],
  on_field_def_epa: ['epa allowed with him on the field', 'on field defensive epa'],
  fumbles: ['fumbles total', 'put the ball on the ground'],
  fumbles_lost: ['lost fumbles', 'fumbles lost'],
  kr_avg: ['kick return average', 'yards per kick return'],
  pr_avg: ['punt return average', 'yards per punt return'],
  // Fantasy
  fantasy_points: ['fantasy points scored', 'total fantasy points', 'points scored'],
  fantasy_ppg: ['fantasy points per game', 'ppg', 'points per game', 'scores the most per game'],
  expected_points: ['expected fantasy points', 'xfp', 'opportunity based points'],
  expected_ppg: ['expected points per game', 'xfp per game'],
  fpoe: ['fantasy points over expected', 'points over expected'],
  xtd: ['expected touchdowns', 'expected tds'],
  td_over_expected: ['touchdowns over expected', 'td regression', 'tds above expected'],
  expected_receptions: ['expected catches', 'xrec'],
  // Defense (players)
  tackles: ['total tackles', 'tackle count'],
  solo_tackles: ['solo stops', 'unassisted tackles'],
  assisted_tackles: ['assists', 'shared tackles'],
  tfl: ['tackles for loss', 'tfl count'],
  def_stuffs: ['run stuffs', 'stops at the line'],
  sacks: ['sack total', 'quarterback sacks', 'edge rushers by sacks'],
  qb_hits: ['quarterback hits', 'hits on the qb'],
  pressures: ['qb pressures', 'pressure generated', 'pressure on the quarterback'],
  hurries: ['qb hurries', 'hurries'],
  pressure_rate: ['pass rush win rate', 'pass rush pressure rate', 'pressure per rush'],
  blitz_rate: ['how often he blitzes', 'blitz frequency'],
  missed_tackle_pct: ['missed tackles', 'missed tackle rate'],
  tackle_depth: ['depth of tackle', 'tackle distance'],
  coverage_targets: ['times targeted in coverage', 'targets allowed'],
  coverage_cmp_pct: ['completions allowed', 'completion rate allowed'],
  coverage_ypt: ['yards per target allowed', 'yards allowed per target'],
  coverage_rating: ['passer rating allowed', 'qb rating allowed', 'rating when targeted'],
  coverage_adot: ['depth of target allowed', 'adot allowed'],
  coverage_yac: ['yac allowed', 'yards after catch allowed'],
  coverage_td: ['touchdowns allowed in coverage', 'tds allowed'],
  coverage_int: ['picks in coverage', 'interceptions as the defender'],
  def_ints: ['defensive interceptions', 'picks', 'ints'],
  pass_defended: ['passes defended', 'pass breakups', 'pbus'],
  forced_fumbles: ['fumbles forced', 'strips'],
  fumble_recoveries: ['fumbles recovered', 'recoveries'],
  def_tds: ['defensive touchdowns', 'pick sixes'],
  // Kicking and punting
  fg_made: ['field goals made', 'made field goals'],
  fg_att: ['field goal attempts', 'fg tries'],
  fg_pct: ['field goal percentage', 'fg accuracy', 'kicker accuracy'],
  fg_pct_0_39: ['short field goals', 'chip shot field goals'],
  fg_pct_40_49: ['field goals from the 40s', '40 yard field goals'],
  fg_pct_50p: ['long field goals', 'long distance kicker', '50 yard field goals', 'from 50 plus'],
  fg_made_50p: ['50 yarders made', 'made from 50'],
  pat_pct: ['extra point percentage', 'pat percentage', 'extra points'],
  kicker_epa: ['kicker epa', 'field goal epa'],
  kickoff_tb_pct: ['kickoff touchbacks', 'touchback rate on kickoffs'],
  punts: ['number of punts', 'punt count'],
  punt_avg: ['gross punting', 'punting average', 'yards per punt'],
  punt_net_avg: ['net punting', 'net punt average'],
  punt_in20_rate: ['punts inside the 20', 'pinned inside the 20'],
  punt_tb_rate: ['punt touchbacks', 'touchback rate on punts'],
  punter_epa: ['punter epa', 'epa per punt'],
  // Teams: results
  games_played: ['team games', 'games for the team'],
  wins: ['win total', 'victories'],
  losses: ['loss total', 'defeats'],
  win_pct: ['winning percentage', 'win percentage', 'win rate'],
  points_for: ['points scored by the team', 'team points', 'scoring offense'],
  points_against: ['points allowed', 'scoring defense', 'points given up'],
  point_diff: ['point differential', 'margin of victory', 'plus minus'],
  // Teams: efficiency
  off_epa_play: ['offensive epa', 'offensive epa per play', 'offense efficiency'],
  def_epa_play: ['defensive epa', 'defensive epa per play', 'epa allowed', 'defense efficiency'],
  off_success_rate: ['offensive success rate', 'team success rate'],
  def_success_rate: ['defensive success rate', 'success rate allowed by the defense'],
  off_pass_epa: ['team passing epa', 'pass offense epa', 'passing offense'],
  def_pass_epa: ['pass defense epa', 'passing epa allowed', 'pass defense'],
  off_rush_epa: ['team rushing epa', 'run offense epa', 'rushing offense'],
  def_rush_epa: ['run defense epa', 'rushing epa allowed', 'run defense', 'rush defense'],
  off_pass_success: ['team dropback success', 'pass offense success rate'],
  def_pass_success: ['pass defense success rate', 'dropback success allowed'],
  off_rush_success: ['team rushing success', 'run offense success rate'],
  def_rush_success: ['run defense success rate', 'rushing success allowed'],
  off_early_down_epa: ['early down epa', 'first and second down epa'],
  def_early_down_epa: ['early down epa allowed', 'early down defense'],
  off_third_down_pct: ['third down conversion rate', 'third down offense', '3rd down conversions'],
  def_third_down_pct: ['third down defense', 'third downs allowed', '3rd down stops'],
  off_fourth_down_pct: ['fourth down conversion rate', 'fourth down offense'],
  def_fourth_down_pct: ['fourth down defense', 'fourth downs allowed'],
  off_explosive_rate: ['explosive plays', 'big plays', 'explosive offense'],
  def_explosive_rate: ['explosive plays allowed', 'big plays allowed'],
  off_havoc_rate: ['havoc allowed by the offense', 'offensive havoc'],
  def_havoc_rate: ['defensive havoc', 'havoc rate', 'disruptive defense'],
  off_line_yards: ['line yards', 'offensive line run blocking', 'run blocking'],
  def_line_yards: ['line yards allowed', 'run stopping front', 'defensive line run defense'],
  off_stuff_rate: ['team runs stuffed', 'offense stuffed rate'],
  def_stuff_rate: ['runs stuffed by the defense', 'defensive stuff rate'],
  off_sack_rate: ['sacks allowed rate', 'pass protection', 'offensive line pass blocking'],
  def_sack_rate: ['defensive sack rate', 'sacks per dropback', 'pass rush sacks'],
  off_pressure_rate: ['pressure allowed', 'pressure rate allowed', 'pass blocking pressure'],
  def_pressure_rate: [
    'defensive pressure rate',
    'team pass rush',
    'pressure generated by the defense'
  ],
  off_turnovers: ['giveaways', 'turnovers committed', 'offensive turnovers'],
  def_turnovers: ['takeaways', 'turnovers forced', 'defensive turnovers'],
  off_pass_yds_game: ['passing yards per game', 'pass yards per game'],
  def_pass_yds_game: ['passing yards allowed per game', 'pass yards allowed'],
  off_rush_yds_game: ['rushing yards per game', 'rush yards per game'],
  def_rush_yds_game: ['rushing yards allowed per game', 'rush yards allowed'],
  turnover_margin: ['turnover differential', 'takeaway giveaway'],
  points_per_drive: ['points per possession', 'scoring per drive'],
  def_points_per_drive: ['points per drive allowed', 'points per possession allowed'],
  td_drive_rate: ['touchdown drives', 'drives ending in touchdowns'],
  off_rz_td_pct: ['red zone touchdown rate', 'red zone efficiency', 'red zone offense'],
  def_rz_td_pct: ['red zone defense', 'red zone touchdowns allowed'],
  three_and_out_rate: ['three and outs', 'three and out rate', '3 and outs'],
  start_field_position: ['starting field position', 'field position'],
  // Teams: tendencies
  proe: ['pass rate over expected', 'passes more than expected', 'pass happy'],
  neutral_proe: ['neutral pass rate over expected', 'neutral situation proe'],
  neutral_pass_rate: ['neutral pass rate', 'pass rate in neutral situations'],
  neutral_pace: ['pace of play', 'seconds per play', 'plays fastest', 'tempo'],
  no_huddle_rate: ['no huddle', 'hurry up rate'],
  shotgun_rate: ['shotgun usage', 'shotgun snaps'],
  team_play_action_rate: ['team play action rate', 'play action usage by the offense'],
  team_play_action_epa: ['team play action epa', 'play action efficiency'],
  rpo_rate: ['run pass options', 'rpo usage'],
  screen_rate: ['screen passes', 'screen usage'],
  motion_rate: ['pre snap motion', 'motion usage'],
  personnel_11_rate: ['11 personnel', 'three wide sets', 'three receiver sets'],
  personnel_12_rate: ['12 personnel', 'two tight end sets'],
  def_blitz_rate: ['team blitz rate', 'defenses blitz', 'blitz the most'],
  def_pass_rushers: ['pass rushers sent', 'rushers per dropback'],
  def_man_rate: ['man coverage rate', 'how often they play man', 'play the most man'],
  def_man_epa: ['epa allowed in man coverage', 'man coverage defense'],
  def_zone_epa: ['epa allowed in zone coverage', 'zone coverage defense'],
  def_box: ['box count', 'defenders in the box on average'],
  // Teams: special teams
  team_fg_pct: ['team field goal percentage', 'team kicking'],
  team_punt_net_avg: ['team net punting', 'team punting'],
  team_kr_avg: ['team kick return average', 'kick return unit'],
  team_pr_avg: ['team punt return average', 'punt return unit'],
  team_st_tds: ['special teams touchdowns', 'return touchdowns'],
  // Teams: market
  implied_points: ['implied team total', 'implied total', 'vegas team total'],
  spread: ['point spread', 'betting spread', 'expected margin'],
  total_line: ['over under', 'game total', 'betting total'],
  fpa_qb: ['fantasy points allowed to quarterbacks', 'qb matchup', 'points allowed to qbs'],
  fpa_rb: ['fantasy points allowed to running backs', 'rb matchup', 'points allowed to rbs'],
  fpa_wr: ['fantasy points allowed to receivers', 'wr matchup', 'points allowed to wrs'],
  fpa_te: ['fantasy points allowed to tight ends', 'te matchup', 'points allowed to tes'],
  fpa_k: ['fantasy points allowed to kickers', 'kicker matchup'],
  // Teams: models
  elo: ['elo rating', 'power rating'],
  srs: ['simple rating system', 'srs rating'],
  adj_off_epa: ['adjusted offensive epa', 'opponent adjusted offense'],
  adj_def_epa: ['adjusted defensive epa', 'opponent adjusted defense'],
  adj_net_epa: ['adjusted net epa', 'adjusted epa margin', 'best team overall'],
  adj_off_pass_epa: ['adjusted passing offense', 'adjusted pass epa'],
  adj_off_rush_epa: ['adjusted rushing offense', 'adjusted rush epa'],
  adj_def_pass_epa: ['adjusted pass defense', 'adjusted pass epa allowed'],
  adj_def_rush_epa: ['adjusted run defense', 'adjusted rush epa allowed'],
  adj_recent_off_epa: ['recent form offense', 'recent adjusted offense'],
  adj_recent_def_epa: ['recent form defense', 'recent adjusted defense'],
  pythag_win_pct: ['pythagorean win percentage', 'pythag'],
  pythag_wins: ['pythagorean wins', 'expected wins from points'],
  luck_wins: ['lucky teams', 'wins over pythagorean', 'close game luck'],
  elo_xwins: ['elo expected wins', 'expected wins from elo'],
  elo_luck: ['wins over elo', 'elo luck'],
  vegas_xwins: ['vegas expected wins', 'market expected wins'],
  sos_elo: ['strength of schedule', 'schedule played', 'sos'],
  sos_adj: ['strength of schedule by epa', 'adjusted strength of schedule'],
  sos_left_elo: ['remaining schedule', 'easiest remaining schedule', 'schedule left'],
  sos_left_adj: ['remaining schedule by epa', 'adjusted remaining schedule'],
  proj_wins: ['projected wins', 'win projection'],
  proj_losses: ['projected losses', 'loss projection'],
  playoff_pct: ['playoff odds', 'playoff chances', 'chance to make the playoffs'],
  division_pct: ['division odds', 'chance to win the division'],
  bye_pct: ['bye odds', 'first round bye chances'],
  conference_pct: ['conference odds', 'chance to win the conference'],
  sb_pct: ['super bowl odds', 'title odds', 'championship chances'],
  fumble_recovery_pct: ['fumble recovery rate', 'recovering fumbles'],
  fumble_luck: ['fumble luck', 'lucky with fumbles'],
  int_luck: ['interception luck', 'lucky with picks'],
  turnover_luck: ['turnover luck', 'lucky with turnovers'],
  team_fgoe: ['team field goals over expected', 'team fgoe'],
  fgoe: ['field goals over expected', 'kicker fgoe'],
  fgoe_pct: ['field goal percentage over expected', 'fgoe percentage'],
  fg_expected_pct: ['expected field goal percentage', 'xfg'],
  // Players: models and profile
  epa_cpoe_composite: ['epa cpoe composite', 'best quarterback overall', 'qb composite'],
  fp_ceiling: ['ceiling', 'upside', 'best case weeks'],
  fp_floor: ['floor', 'safe weeks', 'worst case weeks'],
  boom_rate: ['boom weeks', 'boom percentage', 'top 12 weeks'],
  bust_rate: ['bust weeks', 'bust percentage', 'duds'],
  ras: ['relative athletic score', 'athleticism', 'athletic score'],
  speed_score: ['speed score', 'size adjusted speed'],
  height: ['how tall', 'height in inches'],
  weight: ['how heavy', 'weight in pounds'],
  forty: ['40 yard dash', 'forty time', '40 time'],
  bench: ['bench press reps', 'bench reps'],
  vertical: ['vertical jump', 'vert'],
  broad_jump: ['broad jump', 'standing broad'],
  cone: ['three cone', '3 cone drill'],
  shuttle: ['short shuttle', '20 yard shuttle']
}

/** How phrases compare: lower case, apostrophes dropped, anything else not a letter or digit a space. */
export function phraseKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
```

Create `src/shared/stats/dimensions.ts`:

```ts
import type { GroupBy, StatsQuery } from './types'

/**
 * The dimensions a question can filter or split by (Ask spec §4.2): every situation filter and
 * `groupBy` value of `StatsQuery`, and the scope filters people name in words (home, opponent,
 * recent games). Each says what it means, the words people use for it, its values, the grain it
 * needs and which seasons have it. The resolver matches the synonyms; the glossary and the brief
 * read the descriptions.
 */
export interface DimensionValue {
  /** The value `StatsQuery` takes. */
  id: string
  label: string
  synonyms: string[]
}

export interface DimensionDef {
  id: string
  label: string
  description: string
  synonyms: string[]
  /** Where it goes in a `StatsQuery`. */
  query:
    | { situation: keyof NonNullable<StatsQuery['situation']> }
    | { groupBy: GroupBy }
    | { scope: keyof StatsQuery['scope'] }
  /** A fixed set of values, when it has one. */
  values?: DimensionValue[]
  /** `play`: only metrics computed from plays accept it. */
  grain: 'play' | 'week' | 'season'
  firstSeason: number
  /** `prior`: published through the prior season only (participation). */
  lastSeason?: 'prior'
  sources: string[]
}

const PBP = ['nflverse play-by-play']
const PART = ['NFL participation (nflverse)']
const FTN = ['FTN charting (nflverse)']
const SCHEDULE = ['nflverse schedules']

const PERSONNEL_VALUES: DimensionValue[] = [
  {
    id: '11',
    label: '11 personnel (1 RB, 1 TE)',
    synonyms: ['three wide', '3 wide', 'three receivers']
  },
  { id: '12', label: '12 personnel (1 RB, 2 TE)', synonyms: ['two tight ends', '2 te sets'] },
  { id: '13', label: '13 personnel (1 RB, 3 TE)', synonyms: ['three tight ends'] },
  { id: '21', label: '21 personnel (2 RB, 1 TE)', synonyms: ['two backs', 'fullback sets'] },
  { id: '22', label: '22 personnel (2 RB, 2 TE)', synonyms: ['heavy personnel'] },
  { id: '10', label: '10 personnel (1 RB, 0 TE)', synonyms: ['four wide', '4 wide'] },
  { id: '00', label: 'Empty (0 RB, 0 TE)', synonyms: ['five wide'] }
]

const COVERAGE_VALUES: DimensionValue[] = [
  { id: 'man', label: 'Man coverage', synonyms: ['man', 'man to man', 'vs man', 'against man'] },
  { id: 'zone', label: 'Zone coverage', synonyms: ['zone', 'vs zone', 'against zone'] }
]

const FORMATION_VALUES: DimensionValue[] = [
  { id: 'SHOTGUN', label: 'Shotgun', synonyms: ['shotgun', 'gun'] },
  { id: 'SINGLEBACK', label: 'Singleback', synonyms: ['singleback', 'single back'] },
  { id: 'EMPTY', label: 'Empty', synonyms: ['empty backfield', 'empty set'] },
  { id: 'I_FORM', label: 'I-formation', synonyms: ['i formation', 'i form'] },
  { id: 'PISTOL', label: 'Pistol', synonyms: ['pistol'] },
  { id: 'UNDER CENTER', label: 'Under center', synonyms: ['under center'] }
]

export const DIMENSIONS: DimensionDef[] = [
  {
    id: 'down',
    label: 'Down',
    description: 'The down of the play, 1 to 4.',
    synonyms: ['first down', 'second down', 'third down', 'fourth down', '3rd down', 'on third'],
    query: { situation: 'down' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'distance',
    label: 'Distance',
    description: 'Yards to go for a first down.',
    synonyms: ['yards to go', 'third and long', 'third and short', 'short yardage'],
    query: { situation: 'distance' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'quarter',
    label: 'Quarter',
    description: 'The quarter of the play; 5 is overtime.',
    synonyms: ['first quarter', 'fourth quarter', 'second half', 'overtime'],
    query: { situation: 'quarter' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'field_zone',
    label: 'Field zone',
    description:
      'Where the ball is: the red zone (inside the opponent’s 20), inside the 10, inside the 5 (goal line), or backed up inside the own 20.',
    synonyms: ['field position of the play'],
    query: { situation: 'fieldZone' },
    values: [
      { id: 'redzone', label: 'Red zone', synonyms: ['red zone', 'redzone', 'inside the 20'] },
      { id: 'inside10', label: 'Inside the 10', synonyms: ['inside the 10', 'inside the ten'] },
      {
        id: 'inside5',
        label: 'Inside the 5',
        synonyms: ['goal line', 'inside the 5', 'inside the five']
      },
      { id: 'own20', label: 'Backed up', synonyms: ['backed up', 'own 20', 'own territory'] }
    ],
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'score_margin',
    label: 'Score margin',
    description: 'The offense’s score minus the defense’s when the play starts.',
    synonyms: ['when leading', 'when trailing', 'tied games', 'blowouts'],
    query: { situation: 'scoreMargin' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'win_probability',
    label: 'Win probability',
    description: 'The offense’s win probability when the play starts (nflverse’s model), 0 to 1.',
    synonyms: ['garbage time', 'close games', 'win probability'],
    query: { situation: 'winProbability' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'neutral',
    label: 'Neutral situations',
    description:
      'Plays with a win probability of 20–80 % outside the last two minutes of a half: where play-calling reflects tendency, not the score.',
    synonyms: ['neutral', 'neutral situations', 'neutral game script'],
    query: { situation: 'neutral' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'two_minute',
    label: 'Two-minute drill',
    description: 'The last two minutes of either half (2nd and 4th quarters).',
    synonyms: ['two minute drill', 'two minute', 'end of half', 'hurry up situations'],
    query: { situation: 'twoMinute' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'pressure',
    label: 'Pressure',
    description:
      'The quarterback was pressured (hurried, hit or sacked) on the dropback, from participation data.',
    synonyms: ['under pressure', 'pressured', 'when pressured', 'facing pressure'],
    query: { situation: 'pressure' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'blitz',
    label: 'Blitz',
    description: 'The defense sent a blitz (more than the usual four rushers), from FTN charting.',
    synonyms: ['blitz', 'blitzed', 'against the blitz', 'vs the blitz'],
    query: { situation: 'blitz' },
    grain: 'play',
    firstSeason: 2022,
    sources: FTN
  },
  {
    id: 'play_action',
    label: 'Play-action',
    description: 'The pass had a play-action fake, from FTN charting.',
    synonyms: ['play action', 'play-action', 'off play action'],
    query: { situation: 'playAction' },
    grain: 'play',
    firstSeason: 2022,
    sources: FTN
  },
  {
    id: 'coverage',
    label: 'Coverage',
    description:
      'The defense’s coverage on the play: man or zone, or a shell (Cover 1, Cover 3 …), from participation data.',
    synonyms: ['coverage', 'man or zone'],
    query: { situation: 'coverage' },
    values: COVERAGE_VALUES,
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'formation',
    label: 'Formation',
    description: 'The offense’s formation (shotgun, singleback, empty …), from participation data.',
    synonyms: ['formation', 'offensive formation'],
    query: { situation: 'formation' },
    values: FORMATION_VALUES,
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'personnel',
    label: 'Personnel',
    description:
      'The offense’s personnel grouping: the first digit is running backs, the second tight ends ("11" = 1 RB, 1 TE, 3 WR), from participation data.',
    synonyms: ['personnel', 'personnel grouping'],
    query: { situation: 'personnel' },
    values: PERSONNEL_VALUES,
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'box',
    label: 'Defenders in the box',
    description: 'How many defenders were in the box at the snap, from participation data.',
    synonyms: ['stacked box', 'light box', 'defenders in the box', 'eight in the box'],
    query: { situation: 'box' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'air_yards',
    label: 'Depth of target',
    description: 'How far past the line of scrimmage the pass travelled in the air.',
    synonyms: ['deep passes', 'short passes', 'behind the line', 'intermediate'],
    query: { situation: 'airYards' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'with_on_field',
    label: 'With a player on the field',
    description: 'Only plays with all these players on the field, from participation data.',
    synonyms: ['with him on the field', 'when he plays', 'with'],
    query: { situation: 'withOnField' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'without_on_field',
    label: 'Without a player on the field',
    description:
      'Only plays without any of these players on the field (plays participation covers), from participation data.',
    synonyms: ['without him', 'when he sits', 'without', 'when he is out'],
    query: { situation: 'withoutOnField' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'home',
    label: 'Home or road',
    description: 'Home games or road games, as the schedule lists the home team.',
    synonyms: ['at home', 'on the road', 'home games', 'road games', 'away games'],
    query: { scope: 'home' },
    grain: 'week',
    firstSeason: 2019,
    sources: SCHEDULE
  },
  {
    id: 'opponent',
    label: 'Opponent',
    description: 'Games against these teams.',
    synonyms: ['against', 'versus', 'vs'],
    query: { scope: 'opponents' },
    grain: 'week',
    firstSeason: 2019,
    sources: SCHEDULE
  },
  {
    id: 'recent_games',
    label: 'Recent games',
    description: 'Each row’s last N games in the scope.',
    synonyms: ['last few games', 'recently', 'lately', 'last n games'],
    query: { scope: 'lastNGames' },
    grain: 'week',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_season',
    label: 'By season',
    description: 'One row per season.',
    synonyms: ['by season', 'each season', 'per season', 'year by year'],
    query: { groupBy: 'season' },
    grain: 'season',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_week',
    label: 'By week (game log)',
    description: 'One row per week: a game log.',
    synonyms: ['game log', 'by week', 'week by week', 'weekly', 'each week', 'every game'],
    query: { groupBy: 'week' },
    grain: 'week',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_team',
    label: 'By team',
    description: 'One row per team the player played for.',
    synonyms: ['by team', 'with each team'],
    query: { groupBy: 'team' },
    grain: 'week',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_opponent',
    label: 'By opponent',
    description: 'One row per opponent.',
    synonyms: ['by opponent', 'against each team', 'each opponent'],
    query: { groupBy: 'opponent' },
    grain: 'week',
    firstSeason: 2019,
    sources: SCHEDULE
  },
  {
    id: 'by_down',
    label: 'By down',
    description: 'One row per down.',
    synonyms: ['by down', 'each down', 'down by down'],
    query: { groupBy: 'down' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_quarter',
    label: 'By quarter',
    description: 'One row per quarter.',
    synonyms: ['by quarter', 'each quarter'],
    query: { groupBy: 'quarter' },
    grain: 'play',
    firstSeason: 2019,
    sources: PBP
  },
  {
    id: 'by_personnel',
    label: 'By personnel',
    description: 'One row per personnel grouping.',
    synonyms: ['by personnel', 'split by personnel'],
    query: { groupBy: 'personnel' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'by_coverage',
    label: 'By coverage',
    description: 'One row for man and one for zone.',
    synonyms: ['man vs zone', 'man versus zone', 'by coverage', 'split by coverage'],
    query: { groupBy: 'coverage' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  },
  {
    id: 'by_formation',
    label: 'By formation',
    description: 'One row per formation.',
    synonyms: ['by formation', 'split by formation'],
    query: { groupBy: 'formation' },
    grain: 'play',
    firstSeason: 2019,
    lastSeason: 'prior',
    sources: PART
  }
]

export const DIMENSION_BY_ID: ReadonlyMap<string, DimensionDef> = new Map(
  DIMENSIONS.map((d) => [d.id, d])
)
```

Create `src/shared/stats/glossary.ts`:

```ts
import { DIMENSION_BY_ID } from './dimensions'

/**
 * The glossary (Ask spec §4.2): the terms an answer leans on, in one place. The analyst brief and
 * the `describe` tool read it; dev note N-007 (stat explanations in the app) can too. Dimension
 * terms take their text from `dimensions.ts`, so a definition is written once.
 */
export interface GlossaryEntry {
  term: string
  text: string
}

const fromDimension = (id: string, term: string): GlossaryEntry => {
  const d = DIMENSION_BY_ID.get(id)
  if (!d) throw new Error(`glossary: unknown dimension ${id}`)
  return { term, text: d.description }
}

export const GLOSSARY: GlossaryEntry[] = [
  {
    term: 'EPA',
    text: 'Expected points added: how much a play changed the offense’s expected points, from nflverse’s model. Per play, per dropback or per carry.'
  },
  {
    term: 'Success rate',
    text: 'The share of plays with positive EPA.'
  },
  {
    term: 'CPOE',
    text: 'Completion percentage over expected: completions above what nflverse’s model expects for each throw’s depth, location and situation, in percentage points.'
  },
  {
    term: 'Route',
    text: 'A dropback the player was on the field for (blocking snaps count). In the current season, before participation is published, routes are estimated as team dropbacks × his offensive snap share.'
  },
  {
    term: 'est.',
    text: 'A value built on estimated routes (current season): treat it as approximate.'
  },
  {
    term: 'Qualified',
    text: 'A row with at least the metric’s minimum sample, scaled to the weeks in scope (150 routes over 17 games is about 45 over 5). Ranks and percentiles are among qualified rows of the same position.'
  },
  {
    term: 'Shrunk',
    text: 'A rate pulled toward the league mean by its sample: the smaller the sample, the closer to the mean. The pull is the sample at which half the rate is signal, measured from odd and even weeks.'
  },
  {
    term: 'Stability',
    text: 'How much a metric carries over: the correlation of a player’s qualified seasons one year to the next (high ≥ 0.6, medium ≥ 0.35, low below).'
  },
  fromDimension('pressure', 'Pressure'),
  fromDimension('neutral', 'Neutral situations'),
  fromDimension('field_zone', 'Red zone'),
  fromDimension('personnel', 'Personnel'),
  fromDimension('coverage', 'Coverage'),
  {
    term: 'Scoring',
    text: 'Fantasy metrics use PPR unless asked otherwise; half-PPR, standard and the imported league’s own scoring are available.'
  },
  {
    term: 'Seasons',
    text: '2019 to the current season, regular season unless the postseason is asked for. Participation (pressure, coverage, personnel, routes) is published through the prior season; FTN charting (blitz, play-action) starts in 2022; Next Gen Stats cover players over its weekly minimum.'
  }
]

/** The glossary as plain text, one term per line, for the analyst brief. */
export function glossaryText(): string {
  return GLOSSARY.map((g) => `- ${g.term}: ${g.text}`).join('\n')
}
```

Create `src/shared/stats/semanticModel.ts`:

```ts
import { METRIC_ALIASES } from './aliases'
import { CATALOGUE } from './catalogue'
import { DIMENSIONS } from './dimensions'
import { GLOSSARY } from './glossary'
import type { MetricStability } from './types'

/**
 * The semantic model in one document (Ask spec §4.2): the metrics with their aliases, the dimensions
 * and the glossary, in an OSI-like shape (datasets, metrics, dimensions) that an outside tool can
 * read. The MCP server serves it as a resource (Plan AF2). TypeScript stays the source of truth;
 * this is generated from it.
 */
export interface SemanticModel {
  name: string
  datasets: { name: string; description: string; entity: 'player' | 'team' }[]
  metrics: {
    name: string
    label: string
    description: string
    dataset: string
    synonyms: string[]
    unit: string
    direction: string
    positions: string[] | 'all'
    sample: string
    minSample: number | null
    firstSeason: number
    stability: { yearToYear: number | null; reliability: string | null } | null
  }[]
  dimensions: {
    name: string
    label: string
    description: string
    synonyms: string[]
    values: string[]
    grain: string
    firstSeason: number
    throughPriorSeason: boolean
  }[]
  glossary: { term: string; text: string }[]
}

export function semanticModel(
  stability: ReadonlyMap<string, MetricStability> = new Map()
): SemanticModel {
  return {
    name: 'FantasyCompanion stats',
    datasets: [
      {
        name: 'players',
        description: 'NFL players, by season, week or play, 2019 to the current season.',
        entity: 'player'
      },
      {
        name: 'teams',
        description: 'NFL teams, by season, week or play, 2019 to the current season.',
        entity: 'team'
      }
    ],
    metrics: CATALOGUE.filter((m) => m.tier !== 'stored').map((m) => {
      const s = stability.get(m.id)
      return {
        name: m.id,
        label: m.label,
        description: m.description,
        dataset: m.entity === 'player' ? 'players' : 'teams',
        synonyms: [...(METRIC_ALIASES[m.id] ?? [])],
        unit: m.unit,
        direction: m.direction,
        positions: m.positions,
        sample: m.sample,
        minSample: m.minSample ?? null,
        firstSeason: m.firstSeason,
        stability: s ? { yearToYear: s.yearToYear, reliability: s.reliability } : null
      }
    }),
    dimensions: DIMENSIONS.map((d) => ({
      name: d.id,
      label: d.label,
      description: d.description,
      synonyms: d.synonyms,
      values: (d.values ?? []).map((v) => v.id),
      grain: d.grain,
      firstSeason: d.firstSeason,
      throughPriorSeason: d.lastSeason === 'prior'
    })),
    glossary: GLOSSARY
  }
}

/** A YAML scalar: plain when it is safe, double-quoted (JSON escapes) otherwise. */
function scalar(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  const s = String(v)
  return /^[A-Za-z][A-Za-z0-9 _./()-]*$/.test(s) && !/^(true|false|null|yes|no|on|off)$/i.test(s)
    ? s
    : JSON.stringify(s)
}

function emit(value: unknown, indent: string): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${indent}[]`]
    return value.flatMap((item) => {
      if (item !== null && typeof item === 'object') {
        const [first, ...rest] = emit(item, `${indent}  `)
        return [`${indent}- ${first.trimStart()}`, ...rest]
      }
      return [`${indent}- ${scalar(item)}`]
    })
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => {
      if (Array.isArray(v) && v.length === 0) return [`${indent}${k}: []`]
      if (v !== null && typeof v === 'object') return [`${indent}${k}:`, ...emit(v, `${indent}  `)]
      return [`${indent}${k}: ${scalar(v)}`]
    })
  }
  return [`${indent}${scalar(value)}`]
}

/** The model as YAML (block style; strings quoted when they need it). */
export function semanticModelYaml(
  stability: ReadonlyMap<string, MetricStability> = new Map()
): string {
  return `${emit(semanticModel(stability), '').join('\n')}\n`
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/shared/stats/semanticModel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/shared/stats/aliases.ts src/shared/stats/dimensions.ts src/shared/stats/glossary.ts src/shared/stats/semanticModel.ts tests/shared/stats/semanticModel.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/shared/stats/aliases.ts src/shared/stats/dimensions.ts src/shared/stats/glossary.ts src/shared/stats/semanticModel.ts tests/shared/stats/semanticModel.test.ts
git commit -m "feat(stats): metric aliases, dimensions, glossary"
```

Expected: typecheck and lint clean; the suite at 1,197 passed, 5 skipped (a clean checkout).

---

### Task 3: The worker's `people` read (spec §4.1; amendment D)

Everyone with a regular-season game since 2019 (4,972 on the live warehouse), with his latest position and team, seasons, games, and games and PPR points in the current and prior season: what tells namesakes apart. A read like the others (its own connection, refused while the derived tables are stale).

**Files:**

- Create: `src/main/stats/engine/people.ts`, `tests/main/stats/engine/people.test.ts`
- Modify: `src/main/stats/client.ts`, `src/main/stats/protocol.ts`, `src/main/stats/service.ts`, `src/main/stats/worker.ts`, `src/shared/stats/types.ts`

- [ ] **Step 1: Write the tests**

Create `tests/main/stats/engine/people.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { people } from '@main/stats/engine/people'
import { openTestDb } from '../../../fixtures/stats'
import { seedTable, type Row } from '../../../fixtures/statsDerived'

const QB = '00-0034796'
const CB = '00-0037000'
const OLD = '00-0020000'

async function seeded(): Promise<Awaited<ReturnType<typeof openTestDb>>> {
  const db = await openTestDb()
  await seedTable(db, 'games', [{ season: 2026 }, { season: 2025 }])
  await seedTable(db, 'players', [
    { gsis_id: QB, name: 'Lamar Jackson', first_name: 'Lamar', last_name: 'Jackson' },
    { gsis_id: CB, name: 'Lamar Jackson', first_name: 'Lamar', last_name: 'Jackson' },
    { gsis_id: OLD, name: 'Old Timer', first_name: 'Old', last_name: 'Timer' }
  ])
  const season = (
    gsis_id: string,
    season: number,
    games: number,
    position: string,
    team: string
  ): Row => ({
    gsis_id,
    season,
    season_type: 'REG',
    games,
    position,
    team
  })
  await seedTable(db, 'player_season', [
    season(QB, 2025, 17, 'QB', 'BAL'),
    season(QB, 2026, 7, 'QB', 'BAL'),
    season(CB, 2025, 3, 'DB', 'CHI'),
    season(CB, 2026, 0, 'DB', 'CHI'),
    season(OLD, 2019, 16, 'WR', 'NYJ'),
    { ...season(QB, 2025, 1, 'QB', 'BAL'), season_type: 'POST' }
  ])
  await seedTable(db, 'fantasy_week', [
    { gsis_id: QB, season: 2026, season_type: 'REG', week: 1, scoring: 'ppr', points: 25.45 },
    { gsis_id: QB, season: 2025, season_type: 'REG', week: 1, scoring: 'ppr', points: 20 },
    { gsis_id: QB, season: 2025, season_type: 'REG', week: 1, scoring: 'std', points: 99 },
    { gsis_id: OLD, season: 2019, season_type: 'REG', week: 1, scoring: 'ppr', points: 30 }
  ])
  return db
}

describe('people (Ask spec §4.1)', () => {
  it('lists everyone with a regular-season game, with what tells two namesakes apart', async () => {
    const db = await seeded()
    const all = await people(db)
    expect(all).toEqual([
      {
        id: OLD,
        name: 'Old Timer',
        firstName: 'Old',
        lastName: 'Timer',
        position: 'WR',
        team: 'NYJ',
        firstSeason: 2019,
        lastSeason: 2019,
        games: 16,
        recentGames: 0,
        recentPoints: 0
      },
      {
        id: QB,
        name: 'Lamar Jackson',
        firstName: 'Lamar',
        lastName: 'Jackson',
        position: 'QB',
        team: 'BAL',
        firstSeason: 2025,
        lastSeason: 2026,
        games: 24,
        recentGames: 24,
        recentPoints: 45.5
      },
      {
        id: CB,
        name: 'Lamar Jackson',
        firstName: 'Lamar',
        lastName: 'Jackson',
        position: 'DB',
        team: 'CHI',
        firstSeason: 2025,
        lastSeason: 2025,
        games: 3,
        recentGames: 3,
        recentPoints: 0
      }
    ])
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/stats/engine/people.test.ts
```

Expected: FAIL — `@main/stats/engine/people` does not exist.

- [ ] **Step 3: Implement**

Modify `src/main/stats/client.ts`:

```diff
diff --git a/src/main/stats/client.ts b/src/main/stats/client.ts
index ea76328..668f794 100644
--- a/src/main/stats/client.ts
+++ b/src/main/stats/client.ts
@@ -7,6 +7,7 @@ import type {
   GamesQuery,
   MetricInfo,
   OutlookQuery,
+  Person,
   PlayerBio,
   PlayerBioQuery,
   PlayerOutlook,
@@ -41,6 +42,8 @@ export interface StatsClient {
   outlook(query: OutlookQuery): Promise<PlayerOutlook>
   /** Spec §9.4: a player's identity and status now. */
   player(query: PlayerBioQuery): Promise<PlayerBio>
+  /** Ask spec §4.1: everyone with a game since 2019, for the resolver. */
+  people(): Promise<Person[]>
   /** Stops a running refresh, closes the database and ends the worker (after `CLOSE_TIMEOUT_MS` at most). */
   close(): Promise<void>
 }
@@ -104,6 +107,7 @@ export function startStatsWorker(
     games: (query) => request<GameForecast[]>((id) => ({ id, kind: 'games', query })),
     outlook: (query) => request<PlayerOutlook>((id) => ({ id, kind: 'outlook', query })),
     player: (query) => request<PlayerBio>((id) => ({ id, kind: 'player', query })),
+    people: () => request<Person[]>((id) => ({ id, kind: 'people' })),
     async close() {
       if (!dead) {
         let timer: NodeJS.Timeout | undefined
```

Create `src/main/stats/engine/people.ts`:

```ts
import type { Person } from '@shared/stats/types'
import type { StatsDb } from '../db'

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/**
 * Ask spec §4.1: everyone with a regular-season game since 2019, as the resolver matches names. Each
 * person's latest position group and team, the seasons they played, their games, and their games
 * and PPR points in the current and prior season: the resolver prefers the player people mean when
 * two share a name (Lamar Jackson the quarterback, not the cornerback).
 */
export async function people(db: StatsDb): Promise<Person[]> {
  const rows = await db.all(
    `WITH cur AS (SELECT max(season) AS season FROM games),
     seasons AS (
       SELECT gsis_id, min(season) AS first_season, max(season) AS last_season,
              arg_max(position, season) AS position, arg_max(team, season) AS team,
              sum(games) AS games,
              sum(games) FILTER (WHERE season >= (SELECT season FROM cur) - 1) AS recent_games
       FROM player_season WHERE season_type = 'REG' AND games > 0 GROUP BY gsis_id),
     points AS (
       SELECT gsis_id, sum(points) AS recent_points FROM fantasy_week
       WHERE scoring = 'ppr' AND season_type = 'REG' AND gsis_id IS NOT NULL
         AND season >= (SELECT season FROM cur) - 1
       GROUP BY gsis_id)
     SELECT s.*, p.name, p.first_name, p.last_name, pt.recent_points
     FROM seasons s JOIN players p USING (gsis_id) LEFT JOIN points pt USING (gsis_id)
     ORDER BY s.gsis_id`
  )
  return rows.map((r) => ({
    id: String(r.gsis_id),
    name: String(r.name),
    firstName: text(r.first_name),
    lastName: text(r.last_name),
    position: text(r.position),
    team: text(r.team),
    firstSeason: num(r.first_season),
    lastSeason: num(r.last_season),
    games: num(r.games),
    recentGames: num(r.recent_games),
    recentPoints: Math.round(num(r.recent_points) * 10) / 10
  }))
}
```

Modify `src/main/stats/protocol.ts`:

```diff
diff --git a/src/main/stats/protocol.ts b/src/main/stats/protocol.ts
index 599c119..66fa706 100644
--- a/src/main/stats/protocol.ts
+++ b/src/main/stats/protocol.ts
@@ -46,7 +46,7 @@ export interface SelfTestResult {

 /**
  * Requests to the worker. `refresh`, `setLeague`, `selfTest` and `close` run one after another;
- * `query`, `catalogue`, `status`, `games`, `outlook` and `player` are reads and run at once, each on its own
+ * `query`, `catalogue`, `status`, `games`, `outlook`, `player` and `people` are reads and run at once, each on its own
  * connection (spec §2).
  */
 export type StatsRequest =
@@ -60,6 +60,7 @@ export type StatsRequest =
   | { id: number; kind: 'games'; query: GamesQuery }
   | { id: number; kind: 'outlook'; query: OutlookQuery }
   | { id: number; kind: 'player'; query: PlayerBioQuery }
+  | { id: number; kind: 'people' }

 /** The kinds that run at once instead of in turn. */
 export const READ_REQUESTS: ReadonlySet<StatsRequest['kind']> = new Set([
@@ -68,7 +69,8 @@ export const READ_REQUESTS: ReadonlySet<StatsRequest['kind']> = new Set([
   'status',
   'games',
   'outlook',
-  'player'
+  'player',
+  'people'
 ])

 export type StatsReply =
```

Modify `src/main/stats/service.ts`:

```diff
diff --git a/src/main/stats/service.ts b/src/main/stats/service.ts
index d6edf5f..dd0afac 100644
--- a/src/main/stats/service.ts
+++ b/src/main/stats/service.ts
@@ -8,6 +8,7 @@ import type {
   GamesQuery,
   MetricInfo,
   OutlookQuery,
+  Person,
   PlayerBio,
   PlayerBioQuery,
   PlayerOutlook,
@@ -21,6 +22,7 @@ import { createDownloads } from './download'
 import { StatsQueryError, type CompileContext } from './engine/compile'
 import { gameForecasts } from './engine/games'
 import { playerOutlook } from './engine/outlook'
+import { people } from './engine/people'
 import { playerBio } from './engine/player'
 import { catalogueInfo, MODEL_SUMS, QUANTILES } from './engine/registry'
 import { runQuery } from './engine/run'
@@ -58,6 +60,8 @@ export interface StatsService {
   outlook(query: OutlookQuery): Promise<PlayerOutlook>
   /** Spec §9.4: a player's identity and status now. */
   player(query: PlayerBioQuery): Promise<PlayerBio>
+  /** Ask spec §4.1: everyone with a game since 2019, for the resolver. */
+  people(): Promise<Person[]>
   /**
    * Stops a refresh now: aborts its download, interrupts its statement, and starts no other step.
    * A process must not exit while DuckDB runs a statement (Electron aborts), so closing cancels first.
@@ -287,6 +291,11 @@ export async function openStatsService(
       })
     },
     player: (query) => read((conn) => playerBio(conn, query)),
+    people: () =>
+      read(async (conn) => {
+        if (await derivedStale(conn)) throw new StatsQueryError(BUILDING)
+        return people(conn)
+      }),
     status: () =>
       read(async (reader) => {
         const built = !(await derivedStale(reader))
```

Modify `src/main/stats/worker.ts`:

```diff
diff --git a/src/main/stats/worker.ts b/src/main/stats/worker.ts
index c0d2579..d363444 100644
--- a/src/main/stats/worker.ts
+++ b/src/main/stats/worker.ts
@@ -36,6 +36,8 @@ async function handle(request: StatsRequest): Promise<unknown> {
       return service.outlook(request.query)
     case 'player':
       return service.player(request.query)
+    case 'people':
+      return service.people()
     case 'close':
       await service.close()
       service = null
```

Modify `src/shared/stats/types.ts`:

```diff
diff --git a/src/shared/stats/types.ts b/src/shared/stats/types.ts
index 053ceb6..081934f 100644
--- a/src/shared/stats/types.ts
+++ b/src/shared/stats/types.ts
@@ -351,6 +351,29 @@ export interface PlayerBio {
   status: PlayerStatus | null
 }

+/**
+ * Ask spec §4.1: a person the resolver can name, from everyone with a regular-season game since
+ * 2019 (`stats.people`).
+ */
+export interface Person {
+  /** gsis id */
+  id: string
+  name: string
+  firstName: string | null
+  lastName: string | null
+  /** The latest position group (QB, RB, WR, TE, K, P, DL, LB, DB, OL). */
+  position: string | null
+  /** The latest team. */
+  team: string | null
+  firstSeason: number
+  lastSeason: number
+  /** Regular-season games since 2019. */
+  games: number
+  /** Games and PPR points in the current and prior season. */
+  recentGames: number
+  recentPoints: number
+}
+
 /**
  * The same player in both products (spec §9.4): his Sleeper id in Fantasy; his gsis id in Stats, or
  * the team's nflverse code for a team defense.
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/stats/engine/people.test.ts
```

Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/stats/client.ts src/main/stats/engine/people.ts src/main/stats/protocol.ts src/main/stats/service.ts src/main/stats/worker.ts src/shared/stats/types.ts tests/main/stats/engine/people.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/stats/client.ts src/main/stats/engine/people.ts src/main/stats/protocol.ts src/main/stats/service.ts src/main/stats/worker.ts src/shared/stats/types.ts tests/main/stats/engine/people.test.ts
git commit -m "feat(stats): people read for the resolver"
```

Expected: typecheck and lint clean; the suite at 1,198 passed, 5 skipped (a clean checkout).

---

### Task 4: The resolver and the question classifier (spec §4.1; amendment C)

Pure functions over the question: players (full names, short forms, a distinctive first name, surnames — in a lower-case question not one that is an everyday or football word — and near spellings), teams (names, nicknames, slang, codes in capitals; an opponent after "vs" / "against"), metric candidates (BM25 over label, short name, id, aliases and description, a bonus for an alias said whole, then the entity / position filter), time ("this season", "since week 5", "last 4 games", "2022–24", the playoffs), the slots the words name (situation flags unless the metric itself names them, splits, rostered, a row count, the bottom of a ranking) and the question type, which picks the compact tool and declines advice and out-of-range seasons. The test fixture is a small player index with namesakes. Three aliases are added for phrasings the tests use.

**Files:**

- Create: `src/main/analyst/classify.ts`, `src/main/analyst/metrics.ts`, `src/main/analyst/players.ts`, `src/main/analyst/resolve.ts`, `src/main/analyst/slots.ts`, `src/main/analyst/teams.ts`, `src/main/analyst/text.ts`, `src/main/analyst/time.ts`, `tests/fixtures/analyst.ts`, `tests/main/analyst/resolve.test.ts`
- Modify: `src/shared/stats/aliases.ts`

- [ ] **Step 1: Write the tests**

Create `tests/fixtures/analyst.ts`:

```ts
import type { Person } from '@shared/stats/types'

const person = (id: string, name: string, over: Partial<Person> = {}): Person => {
  const [first, ...rest] = name.split(' ')
  return {
    id,
    name,
    firstName: first,
    lastName: rest.join(' '),
    position: 'WR',
    team: 'BUF',
    firstSeason: 2019,
    lastSeason: 2026,
    games: 60,
    recentGames: 20,
    recentPoints: 200,
    ...over
  }
}

/** A small player index: namesakes, short forms, everyday surnames, a retired player. */
export const PEOPLE: Person[] = [
  person('00-0034796', 'Lamar Jackson', { position: 'QB', team: 'BAL', recentPoints: 600 }),
  person('00-0037000', 'Lamar Jackson', {
    position: 'DB',
    team: 'CHI',
    recentPoints: 0,
    games: 3,
    recentGames: 3
  }),
  person('00-0036322', 'Justin Jefferson', { position: 'WR', team: 'MIN', recentPoints: 400 }),
  person('00-0041075', 'Justin Jefferson', {
    position: 'LB',
    team: 'CLE',
    recentPoints: 0,
    recentGames: 7
  }),
  person('00-0038542', 'Bijan Robinson', { position: 'RB', team: 'ATL', recentPoints: 500 }),
  person('00-0039139', 'Jahmyr Gibbs', { position: 'RB', team: 'DET', recentPoints: 480 }),
  person('00-0033280', 'Christian McCaffrey', { position: 'RB', team: 'SF', recentPoints: 300 }),
  person('00-0039075', 'Puka Nacua', { position: 'WR', team: 'LA', recentPoints: 350 }),
  person('00-0038543', 'Jaxon Smith-Njigba', { position: 'WR', team: 'SEA', recentPoints: 360 }),
  person('00-0034857', 'Josh Allen', { position: 'QB', team: 'BUF', recentPoints: 650 }),
  person('00-0029000', 'Zach Line', {
    position: 'RB',
    team: 'NO',
    lastSeason: 2019,
    recentGames: 0,
    recentPoints: 0
  }),
  person('00-0037200', 'Chase Brown', { position: 'RB', team: 'CIN', recentPoints: 250 }),
  person('00-0036900', "Ja'Marr Chase", { position: 'WR', team: 'CIN', recentPoints: 420 }),
  person('00-0037750', 'Mike Williams', { position: 'WR', team: 'PIT', recentPoints: 60 }),
  person('00-0037751', 'Mike Williams', {
    position: 'LB',
    team: 'NYG',
    recentPoints: 0,
    recentGames: 9
  }),
  person('00-0031000', 'Jordan Love', { position: 'QB', team: 'GB', recentPoints: 380 }),
  person('00-0032000', 'Chris Jones', {
    position: 'DL',
    team: 'KC',
    games: 100,
    recentPoints: 0
  }),
  person('00-0032001', 'Chris Jones', { position: 'DB', team: 'ARI', games: 30, recentPoints: 0 })
]

export const NOW = { season: 2026, week: 7, seasonType: 'REG' as const }
```

Create `tests/main/analyst/resolve.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classify } from '@main/analyst/classify'
import { lexicalRetriever } from '@main/analyst/metrics'
import { playerIndex, positionsIn } from '@main/analyst/players'
import { contextText, resolve } from '@main/analyst/resolve'
import { detectSlots } from '@main/analyst/slots'
import { findTeams } from '@main/analyst/teams'
import { distance, words } from '@main/analyst/text'
import { resolveTime } from '@main/analyst/time'
import { NOW, PEOPLE } from '../../fixtures/analyst'

const index = playerIndex(PEOPLE)
const ids = (q: string, hints = {}): string[][] =>
  index.find(q, hints).map((m) => m.people.map((p) => p.id))

describe('the resolver’s text (Ask spec §4.1)', () => {
  it('splits words, keeping how they were written', () => {
    expect(words("Ja'Marr Chase's YPRR, since week 5")).toEqual([
      { raw: "Ja'Marr", key: 'jamarr' },
      { raw: 'Chase', key: 'chase' },
      { raw: 'YPRR', key: 'yprr' },
      { raw: 'since', key: 'since' },
      { raw: 'week', key: 'week' },
      { raw: '5', key: '5' }
    ])
  })

  it('measures spelling distance, transpositions as one', () => {
    expect(distance('mccaffery', 'mccaffrey', 2)).toBe(1)
    expect(distance('steelers', 'steele', 2)).toBe(2)
    expect(distance('abcdef', 'uvwxyz', 2)).toBe(3)
  })
})

describe('teams', () => {
  it('reads names, nicknames, slang and codes in capitals; an opponent after vs or against', () => {
    expect(findTeams('Who do the Niners play next week?')).toEqual([
      { code: 'SF', mention: 'Niners', role: 'subject' }
    ])
    expect(findTeams('RB yards against the Ravens').map((t) => [t.code, t.role])).toEqual([
      ['BAL', 'opponent']
    ])
    expect(findTeams('Kansas City vs NO').map((t) => [t.code, t.role])).toEqual([
      ['KC', 'subject'],
      ['NO', 'opponent']
    ])
    // "no" and "la" in a sentence are words; Los Angeles needs the nickname.
    expect(findTeams('no one in los angeles')).toEqual([])
  })
})

describe('players', () => {
  it('reads full names, short forms and a distinctive first name', () => {
    expect(ids('Christian McCaffrey yards after contact')).toEqual([['00-0033280']])
    expect(ids('cmc rushing yards')).toEqual([['00-0033280']])
    expect(ids('Puka or JSN?')).toEqual([['00-0039075'], ['00-0038543']])
    expect(ids('bijan vs gibbs')).toEqual([['00-0038542'], ['00-0039139']])
  })

  it('tells namesakes apart by position, then by who has played lately', () => {
    // The quarterback has points; the cornerback has none.
    expect(ids('Lamar Jackson rushing yards')).toEqual([['00-0034796']])
    expect(ids('Lamar Jackson tackles', { positions: ['DB'] })).toEqual([['00-0037000']])
    // Both Justin Jeffersons played lately; the receiver has the points.
    expect(ids('Justin Jefferson catch rate')).toEqual([['00-0036322']])
    // The receiver scored fantasy points; the linebacker none.
    expect(ids('Mike Williams targets')).toEqual([['00-0037750']])
    // Neither Chris Jones clearly leads: the question goes back.
    expect(ids('Chris Jones sacks')).toEqual([['00-0032000', '00-0032001']])
  })

  it('takes a surname in capitals, not an everyday or football word in lower case', () => {
    expect(ids('How is Love doing')).toEqual([['00-0031000']])
    expect(ids('goal line work: most carries inside the 5')).toEqual([])
    expect(ids('Chase Brown carries in the red zone')).toEqual([['00-0037200']])
  })

  it('reads a name one or two letters off, and never a team word', () => {
    expect(ids('Christian McCaffery yards after contact')).toEqual([['00-0033280']])
    expect(ids('How did Lamar Jackson do against the Steelers', { exclude: ['Steelers'] })).toEqual(
      [['00-0034796']]
    )
  })

  it('reads position words, not one after "on the" or "against"', () => {
    expect(positionsIn('best TE by target share')).toEqual(['TE'])
    expect(positionsIn('who generates the most pressure on the quarterback')).toEqual([])
    expect(positionsIn('receivers vs man')).toEqual(['WR', 'TE', 'RB'])
  })
})

describe('time', () => {
  const t = (q: string): ReturnType<typeof resolveTime> => resolveTime(q, NOW)
  it('resolves seasons, weeks and games against now', () => {
    expect(t('this season')).toMatchObject({ seasons: [2026], said: ["'this season' = 2026"] })
    expect(t('last year')).toMatchObject({ seasons: [2025] })
    expect(t('since week 5')).toMatchObject({ seasons: [2026], weeks: [5, 7] })
    expect(t('over the last 3 weeks')).toMatchObject({ weeks: [5, 7] })
    expect(t('his last four games')).toMatchObject({ lastNGames: 4, seasons: [2026] })
    expect(t('weeks 3-6 of 2025')).toMatchObject({ seasons: [2025], weeks: [3, 6] })
    expect(t('from 2022 to 24')).toMatchObject({ seasons: [2022, 2023, 2024] })
    expect(t('since 2023')).toMatchObject({ seasons: [2023, 2024, 2025, 2026] })
    expect(t('last 3 seasons')).toMatchObject({ seasons: [2024, 2025, 2026] })
    expect(t('next week')).toMatchObject({ weeks: [8, 8] })
  })

  it('reads the postseason, but not in playoff odds, and flags seasons out of range', () => {
    expect(t('in the playoffs').seasonType).toBe('POST')
    expect(t('best playoff odds').seasonType).toBeUndefined()
    expect(t('Barry Sanders in 1997').outOfRange).toBe(1997)
    expect(t('EPA by week 2025')).toMatchObject({ seasons: [2025] })
    expect(t('EPA by week 2025').weeks).toBeUndefined()
  })
})

describe('slots', () => {
  it('detects situations, but not one the metric itself names', () => {
    expect(detectSlots('Henry yards per carry in the red zone').flags).toEqual(['red_zone'])
    expect(detectSlots('most red-zone carries').flags).toEqual([])
    expect(detectSlots('Chase against man coverage').flags).toEqual(['man_coverage'])
    expect(detectSlots('which defenses blitz the most').flags).toEqual([])
    expect(detectSlots('EPA when pressured on third down').flags).toEqual([
      'third_down',
      'pressure'
    ])
  })

  it('detects groupings, rostered, a row count and the bottom of a ranking', () => {
    expect(detectSlots('Bijan game log').groupings).toEqual(['week'])
    expect(detectSlots('man vs zone splits for Garrett Wilson')).toMatchObject({
      groupings: ['coverage'],
      flags: []
    })
    expect(detectSlots('best free-agent TE').rostered).toBe('free')
    expect(detectSlots('targets on my team').rostered).toBe('mine')
    expect(detectSlots('worst 5 defenses')).toMatchObject({ limit: 5, ascending: true })
  })
})

describe('the question type', () => {
  const r = {
    players: 0,
    ambiguous: 0,
    teams: 0,
    opponents: 0,
    metricHint: true,
    outOfRange: false,
    rostered: null
  }
  it('declines advice and seasons out of range before anything else', () => {
    expect(classify('Should I start Bijan or Gibbs?', { ...r, players: 2 })).toBe('advice')
    expect(classify('Barry Sanders 1997', { ...r, outOfRange: true })).toBe('out_of_range')
  })

  it('picks a definition, games, league, outlook, compare, player, team or leaderboard', () => {
    expect(classify('What does WOPR mean?', r)).toBe('definition')
    expect(classify('What is Josh Allen’s EPA?', { ...r, players: 1 })).toBe('player')
    expect(classify('Who do the Niners play next week?', { ...r, teams: 1 })).toBe('games')
    expect(classify('which teams have the easiest remaining schedule', r)).toBe('leaderboard')
    expect(classify('Who owns Puka Nacua?', { ...r, players: 1 })).toBe('league')
    expect(classify('best free agent TE by target share', { ...r, rostered: 'free' })).toBe(
      'leaderboard'
    )
    expect(classify('Is Jordan Love due for regression?', { ...r, players: 1 })).toBe('outlook')
    expect(classify('Puka or JSN?', { ...r, players: 2 })).toBe('compare')
    expect(classify('Ravens and Bengals offenses', { ...r, teams: 2 })).toBe('compare')
    expect(classify('How good is the Ravens’ run defense', { ...r, teams: 1 })).toBe('team')
    expect(classify('which defenses rank best, Ravens included', { ...r, teams: 1 })).toBe(
      'leaderboard'
    )
    expect(classify('Who leads WRs in YPRR?', r)).toBe('leaderboard')
  })
})

describe('resolve (Ask spec §4.1)', () => {
  const deps = { people: index, now: NOW }

  it('builds the context block a model reads', () => {
    const b = resolve('How does Ja’Marr Chase do against man coverage this year?', deps)
    expect(b).toMatchObject({
      type: 'player',
      tool: 'player_stats',
      players: [{ id: '00-0036900', name: "Ja'Marr Chase", position: 'WR', team: 'CIN' }],
      time: { seasons: [2026] },
      slots: { flags: ['man_coverage'] },
      decline: null
    })
    expect(b.metrics.slice(0, 2).map((m) => m.id)).toEqual(['tprr_man', 'yprr_man'])
    const text = contextText(b)
    expect(text).toContain("- Player: Ja'Marr Chase = 00-0036900 (WR, CIN)")
    expect(text).toContain("- Time: 'this year' = 2026")
    expect(text).toContain('- Situations named: man_coverage')
    expect(text).toContain('  - tprr_man: TPRR vs man (player) — ')
  })

  it('asks back when a name matches several players, and declines advice', () => {
    const b = resolve('Chris Jones sacks this season', deps)
    expect(b.tool).toBeNull()
    expect(b.ambiguous[0].options.map((o) => o.position)).toEqual(['DL', 'DB'])
    expect(contextText(b)).toContain('"Chris Jones" matches several players: ')
    const a = resolve('Should I start Bijan or Gibbs this week?', deps)
    expect(a).toMatchObject({ type: 'advice', tool: null })
    expect(a.decline).toMatch(/does not give advice/)
  })

  it('separates an opponent from the subject team', () => {
    const b = resolve('Which RBs have the most yards against the Ravens since 2023?', deps)
    expect(b).toMatchObject({ type: 'leaderboard', teams: [], opponents: [{ code: 'BAL' }] })
  })
})

describe('metric candidates (Ask spec §4.1: recall@5 ≥ 95 %)', () => {
  // The probe's 40 phrasings (report P1), before which aliases did not exist.
  const PHRASINGS: [string, string[]][] = [
    ['who leads WRs in yards per route run since week 5?', ['yprr']],
    ['best YPRR among tight ends this year', ['yprr']],
    ['which receivers earn a target on the highest share of their routes', ['tprr']],
    ['TPRR leaders at TE', ['tprr']],
    ['who has the deepest aDOT among wide receivers', ['rec_adot']],
    ['how far downfield does Josh Allen throw on average', ['pass_adot']],
    ['QBs ranked by completion percentage over expected', ['cpoe']],
    ['who is the most accurate passer relative to expectation', ['cpoe']],
    ['RBs with the most rushing yards over expected per carry', ['ryoe_att', 'ryoe']],
    [
      'which running backs gain the most beyond what their blocking gives them',
      ['ryoe', 'ryoe_att']
    ],
    ['WOPR leaders', ['wopr']],
    ["who gets the biggest share of his team's targets", ['target_share']],
    ['air yards share top 10', ['air_yards_share']],
    ['best quarterback by EPA per dropback', ['qb_epa_db']],
    ['which QB gets sacked the most often', ['sack_rate', 'sacks_taken']],
    ['top edge rushers by sacks', ['sacks']],
    ['who generates the most pressure on the quarterback', ['pressures', 'pressure_rate']],
    ['cornerbacks with the lowest passer rating allowed', ['coverage_rating']],
    ['which teams pass more than expected', ['proe', 'neutral_proe']],
    ['which defenses blitz the most', ['def_blitz_rate']],
    ['playoff chances for every team', ['playoff_pct']],
    ['highest fantasy points per game among RBs', ['fantasy_ppg']],
    ['who scores the most PPG at tight end', ['fantasy_ppg']],
    ['expected fantasy points leaders', ['expected_points', 'expected_ppg']],
    ['which receivers have the most boom weeks', ['boom_rate']],
    ['on what share of dropbacks is Puka running a route', ['route_participation']],
    ['yards after contact per carry leaders', ['yac_att']],
    ['who plays the most snaps at RB', ['snap_share', 'off_snaps']],
    ['goal line work: most carries inside the 5', ['i5_carries', 'i10_carries']],
    ['red zone carries leaders', ['rz_carries']],
    ['best long-distance kicker', ['fg_pct_50p', 'fg_made_50p']],
    ['kickers ranked by field goals over expected', ['fgoe', 'fgoe_pct']],
    ['which teams have the easiest remaining schedule', ['sos_left_elo', 'sos_left_adj']],
    ['QBs who get rid of the ball fastest', ['time_to_throw']],
    ['which defenses play the most man coverage', ['def_man_rate']],
    ['who gets the most separation from defenders', ['separation']],
    ['high value touches for running backs', ['high_value_touches']],
    ['who drops the most catchable passes', ['drop_rate', 'drops']],
    ['which offenses play fastest in neutral situations', ['neutral_pace']],
    ['teams with the highest implied team total', ['implied_points']]
  ]

  it('puts the right metric in the top 5 for at least 95 % of the probe phrasings', () => {
    const misses = PHRASINGS.filter(([q, gold]) => {
      const top = resolve(q, { people: index, now: NOW }).metrics.map((m) => m.id)
      return !gold.some((g) => top.includes(g))
    })
    expect(misses.length / PHRASINGS.length).toBeLessThanOrEqual(0.05)
  })

  it('ranks aliases said whole above loose word matches', () => {
    const top = lexicalRetriever().rank('who gets rid of the ball fastest', 3)
    expect(top[0].id).toBe('time_to_throw')
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/resolve.test.ts
```

Expected: FAIL — `@main/analyst/*` does not exist.

- [ ] **Step 3: Implement**

Create `src/main/analyst/classify.ts`:

```ts
import { padded } from './text'

/**
 * The question type (Ask spec §4.1, report R7), from the resolver's output and a few words. It picks
 * the compact profile's tool, and declines advice and out-of-range questions before a model is
 * called. On the probe's 20 questions the rule picked the right tool every time; the models choosing
 * for themselves were wrong on a third to half of them.
 */
export type QuestionType =
  | 'advice'
  | 'out_of_range'
  | 'definition'
  | 'games'
  | 'league'
  | 'outlook'
  | 'compare'
  | 'player'
  | 'team'
  | 'leaderboard'

export type CompactTool =
  | 'leaderboard'
  | 'player_stats'
  | 'team_stats'
  | 'compare'
  | 'outlook'
  | 'games'
  | 'league'
  | 'describe'

export const TOOL_OF: Record<QuestionType, CompactTool | null> = {
  advice: null,
  out_of_range: null,
  definition: 'describe',
  games: 'games',
  league: 'league',
  outlook: 'outlook',
  compare: 'compare',
  player: 'player_stats',
  team: 'team_stats',
  leaderboard: 'leaderboard'
}

const ADVICE =
  / (should i|start or sit|who do i start|who should i start|who to start|sit or start|drop or|trade for|trade away|should i trade|worth a pick up|pick up or|is it worth starting|bench or) /
const DEFINITION = / (what is|what are|what does|whats|define|definition of|explain|meaning of) /
const GAMES =
  / (schedule|who do they play|who does .* play|play next|playing next|kickoff|final score|box score|game preview|preview of|result of|won the game|elo vs vegas) /
const SCHEDULE_METRIC = / (remaining|easiest|hardest|toughest|strength of|softest) schedule /
const LEAGUE =
  / (who owns|who has .* (rostered|on their team|on his team)|rostered by|my roster|show my team|my lineup|scoring settings|league scoring|how is .* scored|points per reception in my league) /
const OUTLOOK =
  / (outlook|regression|due for|running hot|running cold|bounce back|forecast for|ceiling and floor|buy low|sell high) /
const RANKING =
  / (who|which|rank|ranked|ranking|leaders?|leads|top|best|worst|most|fewest|highest|lowest) /

export function classify(
  question: string,
  r: {
    players: number
    ambiguous: number
    teams: number
    opponents: number
    metricHint: boolean
    outOfRange: boolean
    rostered: 'mine' | 'free' | null
  }
): QuestionType {
  const t = padded(question)
  if (ADVICE.test(t)) return 'advice'
  if (r.outOfRange) return 'out_of_range'
  const named = r.players + r.ambiguous
  if (named === 0 && r.teams === 0 && DEFINITION.test(t)) return 'definition'
  if (LEAGUE.test(t) && !(r.rostered === 'free' && r.metricHint)) return 'league'
  // "Easiest remaining schedule" and "strength of schedule" are rankings of a metric.
  if (GAMES.test(t) && !SCHEDULE_METRIC.test(t)) return 'games'
  if (named === 1 && OUTLOOK.test(t)) return 'outlook'
  if (named >= 2) return 'compare'
  if (named === 1) return 'player'
  if (r.teams >= 2) return 'compare'
  if (r.teams === 1 && !(RANKING.test(t) && / (teams|defenses|offenses) /.test(t))) return 'team'
  return 'leaderboard'
}
```

Create `src/main/analyst/metrics.ts`:

```ts
import { METRIC_ALIASES, phraseKey } from '@shared/stats/aliases'
import { CATALOGUE } from '@shared/stats/catalogue'
import type { MetricDef } from '@shared/stats/types'
import { padded } from './text'

/**
 * Metric candidates for a question (Ask spec §4.1, report P1): lexical matching over each metric's
 * label, short name, id, aliases and description (BM25), with a bonus for an alias or label said
 * whole, then reordered so metrics that fit the question's entity and positions come first.
 * Embeddings can be added as a second `Retriever` (Plan AG); this one needs no model.
 */
export interface MetricCandidate {
  id: string
  score: number
}

export interface Retriever {
  rank(question: string, limit: number): MetricCandidate[]
}

const STOP = new Set(
  'a an the of in on at by for to and or is are was were be who which what how most best top highest lowest leaders leader ranked rank among this that year season his her their my me every per does do did get gets with from than more show give tell list players player team teams so far since last week weeks game games'.split(
    ' '
  )
)

const tokens = (text: string): string[] =>
  phraseKey(text)
    .split(' ')
    .filter((t) => t.length > 0 && !STOP.has(t))

/** Whole phrases worth a bonus when the question says them: aliases, labels, short names. */
interface Phrase {
  key: string
  id: string
  bonus: number
}

const SHOWN = CATALOGUE.filter((m) => m.tier !== 'stored')

function documentOf(m: MetricDef): string[] {
  const aliases = METRIC_ALIASES[m.id] ?? []
  return tokens(
    [
      m.label,
      m.label,
      m.short,
      m.short,
      m.id.replace(/_/g, ' '),
      ...aliases,
      ...aliases,
      m.description
    ].join(' ')
  )
}

export function lexicalRetriever(metrics: MetricDef[] = SHOWN): Retriever {
  const docs = metrics.map(documentOf)
  const n = docs.length
  const avg = docs.reduce((s, d) => s + d.length, 0) / n
  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
  const phrases: Phrase[] = metrics.flatMap((m) => [
    ...(METRIC_ALIASES[m.id] ?? []).map((a) => ({ key: phraseKey(a), id: m.id, bonus: 6 })),
    { key: phraseKey(m.label), id: m.id, bonus: 5 },
    ...(m.short.length >= 3 ? [{ key: phraseKey(m.short), id: m.id, bonus: 3 }] : [])
  ])
  const index = new Map(metrics.map((m, i) => [m.id, i]))
  return {
    rank(question, limit) {
      const q = tokens(question)
      const scores = docs.map((d) => {
        let s = 0
        for (const t of q) {
          let f = 0
          for (const x of d) if (x === t) f++
          if (f === 0) continue
          const idf = Math.log(1 + (n - df.get(t)! + 0.5) / (df.get(t)! + 0.5))
          s += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.length) / avg))
        }
        return s
      })
      const text = padded(question)
      // The longest phrase said whole wins its bonus once per metric.
      const best = new Map<string, number>()
      for (const p of phrases) {
        if (p.key.length > 0 && text.includes(` ${p.key} `)) {
          best.set(p.id, Math.max(best.get(p.id) ?? 0, p.bonus + p.key.split(' ').length))
        }
      }
      for (const [id, bonus] of best) scores[index.get(id)!] += bonus
      return metrics
        .map((m, i) => ({ id: m.id, score: Math.round(scores[i] * 100) / 100 }))
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
    }
  }
}

/** Questions about teams as a whole: "which defenses", "teams with", "offenses". */
const TEAM_QUESTION = /\b(teams|defenses|offenses|offensive lines|units)\b/

/**
 * Metrics that fit what the question is about first: team metrics for a team question (or a team
 * subject and no player), player metrics at the named positions otherwise. A position after "on
 * the", "against" or "allowed to" is an object ("pressure on the quarterback"), not the subject.
 */
export function fits(
  question: string,
  ctx: { positions: string[]; players: number; teams: number }
): (m: MetricDef) => boolean {
  // "His team's targets" is about a player: the possessive is dropped before "teams" is looked for.
  const t = padded(question.replace(/['’]s\b/g, '')).replace(
    / (on the|against the|against|allowed to) \w+/g,
    ' '
  )
  const team =
    TEAM_QUESTION.test(t) || (ctx.teams > 0 && ctx.players === 0 && ctx.positions.length === 0)
  return (m) => {
    if (team) return m.entity === 'team'
    if (ctx.players > 0 || ctx.positions.length > 0) {
      if (m.entity !== 'player') return false
      if (ctx.positions.length === 0 || m.positions === 'all') return true
      return m.positions.some((p) => ctx.positions.includes(p))
    }
    return true
  }
}

/** The candidates: matches that fit first, then the rest, `limit` in all. */
export function metricCandidates(
  retriever: Retriever,
  question: string,
  fit: (m: MetricDef) => boolean,
  byId: ReadonlyMap<string, MetricDef>,
  limit: number
): MetricCandidate[] {
  const ranked = retriever.rank(question, 60)
  const ok = ranked.filter((c) => fit(byId.get(c.id)!))
  const rest = ranked.filter((c) => !fit(byId.get(c.id)!))
  return [...ok, ...rest].slice(0, limit)
}
```

Create `src/main/analyst/players.ts`:

```ts
import { METRIC_ALIASES, phraseKey } from '@shared/stats/aliases'
import { CATALOGUE } from '@shared/stats/catalogue'
import { DIMENSIONS } from '@shared/stats/dimensions'
import type { Person } from '@shared/stats/types'
import { distance, lowerCase, type Word, words } from './text'

/**
 * Players by the names people use (Ask spec §4.1): the full name, a distinctive first name
 * ("Bijan"), a surname, a common short form ("CMC"), and a misspelt surname or full name one or two
 * letters off. Two players who share a name are told apart by a position or team in the question,
 * then by who has played lately; when that does not settle it, the question goes back to the user.
 */
const SHORT_FORMS: Record<string, string> = {
  cmc: 'christian mccaffrey',
  arsb: 'amon ra st brown',
  'amon ra': 'amon ra st brown',
  'st brown': 'amon ra st brown',
  jsn: 'jaxon smith njigba',
  mhj: 'marvin harrison',
  btj: 'brian thomas',
  ajb: 'a j brown',
  'aj brown': 'a j brown',
  dk: 'dk metcalf',
  jt: 'jonathan taylor',
  obj: 'odell beckham',
  hollywood: 'marquise brown',
  'tank dell': 'tank dell',
  kw3: 'kenneth walker',
  'ken walker': 'kenneth walker',
  'kyren williams': 'kyren williams',
  'tj hockenson': 't j hockenson',
  bijan: 'bijan robinson',
  saquon: 'saquon barkley',
  puka: 'puka nacua',
  ceedee: 'ceedee lamb',
  lamar: 'lamar jackson',
  mahomes: 'patrick mahomes'
}

/** Surnames that are everyday words: in a lower-case question they are not taken for players. */
const COMMON_WORDS = new Set([
  'love',
  'cook',
  'rice',
  'hill',
  'white',
  'brown',
  'green',
  'wood',
  'field',
  'price',
  'mack',
  'james',
  'will',
  'more',
  'moore',
  'young',
  'king',
  'long',
  'best',
  'hunt',
  'mason',
  'baker',
  'gay',
  'early',
  'little',
  'lock',
  'jones',
  'smith',
  'johnson',
  'williams',
  'davis',
  'allen',
  'carter',
  'thomas',
  'jackson',
  'harris',
  'wilson',
  'taylor',
  'walker',
  'lewis',
  'robinson',
  'chase',
  'pitts',
  'ward',
  'reed',
  'bell',
  'cole',
  'mills',
  'lane',
  'golden',
  'sweat',
  'pickens',
  'nix',
  'adams',
  'evans',
  'hall',
  'barnes',
  'ridley',
  'diggs'
])

/**
 * Words of the stats vocabulary (every metric's label, short name, aliases and description, every
 * dimension's synonyms): in a lower-case question they are read as football, not as a surname
 * ("goal line work" is not Zach Line, "carries" is not a near spelling of Carlies).
 */
const FOOTBALL_WORDS: ReadonlySet<string> = new Set(
  [
    ...CATALOGUE.flatMap((m) => [m.label, m.short, m.description, ...(METRIC_ALIASES[m.id] ?? [])]),
    ...DIMENSIONS.flatMap((d) => [d.label, ...d.synonyms])
  ].flatMap((text) => phraseKey(text).split(' '))
)

const everyday = (key: string): boolean => COMMON_WORDS.has(key) || FOOTBALL_WORDS.has(key)

/** Position words in a question: "the QB", "receivers". */
const POSITION_WORDS: [RegExp, string[]][] = [
  [/\b(qbs?|quarterbacks?)\b/, ['QB']],
  [/\b(rbs?|running ?backs?|backs?)\b/, ['RB']],
  [/\b(wrs?|wide ?receivers?|wideouts?)\b/, ['WR']],
  [/\b(tes?|tight ?ends?)\b/, ['TE']],
  [/\b(receivers?|pass catchers?)\b/, ['WR', 'TE', 'RB']],
  [/\b(kickers?)\b/, ['K']],
  [/\b(punters?)\b/, ['P']],
  [/\b(edges?|edge rushers?|pass rushers?|defensive ends?|tackles)\b/, ['DL', 'LB']],
  [/\b(linebackers?|lbs?)\b/, ['LB']],
  [/\b(cornerbacks?|cbs?|corners?|safet(y|ies)|dbs?)\b/, ['DB']]
]

export function positionsIn(question: string): string[] {
  // A position after "on the", "against" or "allowed to" is the object ("pressure on the quarterback").
  const t = ` ${phraseKey(question)} `.replace(/ (on the|against the|against|allowed to) \w+/g, ' ')
  return [...new Set(POSITION_WORDS.filter(([rx]) => rx.test(t)).flatMap(([, p]) => p))]
}

export interface PlayerMatch {
  /** The words as written. */
  mention: string
  /** One player when it is settled, several when the question must ask which. */
  people: Person[]
  /** How it matched: a full name, a short form, a first name, a surname or a near spelling. */
  how: 'name' | 'short' | 'first' | 'last' | 'fuzzy'
}

export interface FindHints {
  positions?: string[]
  teams?: string[]
  /** Words already taken (team names): never read as a player. */
  exclude?: string[]
}

export interface PlayerIndex {
  find(question: string, hints?: FindHints): PlayerMatch[]
  byId(id: string): Person | undefined
  size: number
}

const push = (map: Map<string, Person[]>, key: string, p: Person): void => {
  if (!key) return
  const list = map.get(key)
  if (list) list.push(p)
  else map.set(key, [p])
}

/** Who people mean among namesakes: played lately, then fantasy points, then games. */
function prominence(a: Person, b: Person): number {
  return (
    Number(b.recentGames > 0) - Number(a.recentGames > 0) ||
    b.recentPoints - a.recentPoints ||
    b.games - a.games
  )
}

/**
 * Narrows namesakes: a position or team the question names, then prominence. One left, or one that
 * clearly leads (played lately when the others did not, or twice the points of the next with at
 * least 20), settles it.
 */
function settle(people: Person[], hints: FindHints): Person[] {
  let pool = [...people].sort(prominence)
  if (hints.positions?.length) {
    const fit = pool.filter((p) => p.position && hints.positions!.includes(p.position))
    if (fit.length > 0) pool = fit
  }
  if (hints.teams?.length) {
    const fit = pool.filter((p) => p.team && hints.teams!.includes(p.team))
    if (fit.length > 0) pool = fit
  }
  if (pool.length <= 1) return pool
  const [first, second] = pool
  if (first.recentGames > 0 && second.recentGames === 0) return [first]
  if (first.recentPoints >= 20 && first.recentPoints >= 2 * second.recentPoints) return [first]
  return pool.slice(0, 3)
}

export function playerIndex(all: Person[]): PlayerIndex {
  const full = new Map<string, Person[]>()
  const last = new Map<string, Person[]>()
  const first = new Map<string, Person[]>()
  const ids = new Map<string, Person>()
  for (const p of all) {
    ids.set(p.id, p)
    // Suffixes are dropped, so "Marvin Harrison Jr." is "marvin harrison".
    const name = phraseKey(p.name).replace(/ (jr|sr|ii|iii|iv|v)$/, '')
    push(full, name, p)
    const lastName = phraseKey(p.lastName ?? '').replace(/ (jr|sr|ii|iii|iv|v)$/, '')
    push(last, lastName, p)
    push(first, phraseKey(p.firstName ?? ''), p)
  }
  // A first name names one player when one recent player has it ("bijan", "puka").
  const distinctFirst = new Map<string, Person>()
  for (const [key, people] of first) {
    const recent = people.filter((p) => p.recentGames > 0)
    if (recent.length === 1 && key.length >= 4) distinctFirst.set(key, recent[0])
  }

  // Recent players' full names, for a misspelt full name.
  const recentNames = [...full].filter(
    ([key, people]) => key.includes(' ') && people.some((p) => p.recentGames > 0)
  )

  function find(question: string, hints: FindHints = {}): PlayerMatch[] {
    const ws: Word[] = words(question)
    const lower = lowerCase(question)
    const used = new Set<number>()
    for (const phrase of hints.exclude ?? []) {
      const keys = words(phrase).map((w) => w.key)
      for (let i = 0; i + keys.length <= ws.length; i++) {
        if (keys.every((k, j) => ws[i + j].key === k)) keys.forEach((_, j) => used.add(i + j))
      }
    }
    const found: PlayerMatch[] = []
    const take = (i: number, n: number, people: Person[], how: PlayerMatch['how']): void => {
      const settled = settle(people, hints)
      if (settled.length === 0) return
      if (found.some((m) => m.people.length === 1 && m.people[0].id === settled[0].id)) return
      found.push({
        mention: ws
          .slice(i, i + n)
          .map((w) => w.raw)
          .join(' '),
        people: settled,
        how
      })
      for (let k = 0; k < n; k++) used.add(i + k)
    }
    const free = (i: number, n: number): boolean =>
      ![...Array(n).keys()].some((k) => used.has(i + k))
    // Full names and short forms, longest first.
    for (let n = 5; n >= 1; n--) {
      for (let i = 0; i + n <= ws.length; i++) {
        if (!free(i, n)) continue
        const key = ws
          .slice(i, i + n)
          .map((w) => w.key)
          .join(' ')
        const short = SHORT_FORMS[key]
        if (n >= 2 && full.has(key)) take(i, n, full.get(key)!, 'name')
        else if (short && full.has(short)) take(i, n, full.get(short)!, 'short')
      }
    }
    // A full name one or two letters off ("Christian McCaffery").
    for (let n = 3; n >= 2; n--) {
      for (let i = 0; i + n <= ws.length; i++) {
        if (!free(i, n)) continue
        const slice = ws.slice(i, i + n)
        if (!lower && !slice.every((w) => /^[A-Z]/.test(w.raw))) continue
        const key = slice.map((w) => w.key).join(' ')
        if (key.length < 9) continue
        const near = recentNames.filter(([name]) => distance(key, name, 2) <= 2)
        if (near.length > 0)
          take(
            i,
            n,
            near.flatMap(([, people]) => people),
            'fuzzy'
          )
      }
    }
    // A first name or a surname alone.
    for (let i = 0; i < ws.length; i++) {
      if (!free(i, 1)) continue
      const w = ws[i]
      if (w.key.length < 3) continue
      const capital = /^[A-Z]/.test(w.raw)
      if (distinctFirst.has(w.key) && (capital || lower)) {
        take(i, 1, [distinctFirst.get(w.key)!], 'first')
        continue
      }
      const byLast = last.get(w.key)
      if (byLast && (capital || (lower && !everyday(w.key)))) {
        // In mixed case, a capital at the start of the sentence is not a name by itself.
        if (!lower && i === 0 && !/^[A-Z][a-z]+[A-Z]/.test(w.raw) && byLast.length > 3) continue
        take(i, 1, byLast, 'last')
      }
    }
    // A surname one or two letters off ("McCaffery"), recent players only.
    for (let i = 0; i < ws.length; i++) {
      if (!free(i, 1)) continue
      const w = ws[i]
      if (w.key.length < 6 || !(/^[A-Z]/.test(w.raw) || lower)) continue
      if (lower && everyday(w.key)) continue
      const max = w.key.length >= 8 ? 2 : 1
      const near: Person[] = []
      for (const [key, people] of last) {
        if (key.length < 5 || COMMON_WORDS.has(key) || key === w.key) continue
        if (distance(w.key, key, max) <= max) near.push(...people.filter((p) => p.recentGames > 0))
      }
      if (near.length > 0) take(i, 1, near, 'fuzzy')
    }
    return found
  }

  return { find, byId: (id) => ids.get(id), size: all.length }
}
```

Create `src/main/analyst/resolve.ts`:

```ts
import { METRICS } from '@shared/stats/catalogue'
import { TEAM_NAMES } from '@shared/stats/nflTeams'
import type { Person } from '@shared/stats/types'
import { classify, type CompactTool, TOOL_OF, type QuestionType } from './classify'
import { fits, lexicalRetriever, metricCandidates, type Retriever } from './metrics'
import { type PlayerIndex, positionsIn } from './players'
import { detectSlots, type Slots } from './slots'
import { findTeams } from './teams'
import { type Now, resolveTime, type ResolvedTime } from './time'

/**
 * The resolver (Ask spec §4.1): deterministic code that reads the question before any model does and
 * attaches a context block — players, teams, metric candidates, time, the slots its words name and
 * the question type. A strong model may ignore it; a small one copies ids from it, and the compact
 * profile builds its schema from it (§3.2).
 */
export interface NamedPlayer {
  id: string
  name: string
  position: string | null
  team: string | null
  mention: string
}

export interface NamedTeam {
  code: string
  name: string
  mention: string
}

export interface MetricHint {
  id: string
  label: string
  entity: 'player' | 'team'
  description: string
}

export interface ContextBlock {
  question: string
  now: Now
  type: QuestionType
  /** The compact profile's tool; null when the question is declined or must be asked back. */
  tool: CompactTool | null
  players: NamedPlayer[]
  /** Names that match several players: the question goes back to the user. */
  ambiguous: { mention: string; options: NamedPlayer[] }[]
  teams: NamedTeam[]
  opponents: NamedTeam[]
  /** Position words in the question. */
  positions: string[]
  time: ResolvedTime
  slots: Slots
  metrics: MetricHint[]
  /** Why the question is declined before any model is called. */
  decline: string | null
}

export interface ResolveDeps {
  people: PlayerIndex
  now: Now
  retriever?: Retriever
  /** Metric candidates to keep (Ask spec §3.2: 5 for the compact profile, 10 on a retry). */
  k?: number
}

const DEFAULT_RETRIEVER = lexicalRetriever()

const named = (p: Person, mention: string): NamedPlayer => ({
  id: p.id,
  name: p.name,
  position: p.position,
  team: p.team,
  mention
})

const team = (code: string, mention: string): NamedTeam => ({
  code,
  name: TEAM_NAMES[code] ?? code,
  mention
})

const DECLINE: Partial<Record<QuestionType, string>> = {
  advice:
    'This is a fantasy decision (start, sit, trade, add or drop). Ask does not give advice yet; it can show the stats behind the choice.',
  out_of_range: 'The data starts in 2019 and ends with the current season.'
}

export function resolve(question: string, deps: ResolveDeps): ContextBlock {
  const positions = positionsIn(question)
  const teamsFound = findTeams(question)
  const subjectTeams = teamsFound.filter((t) => t.role === 'subject').map((t) => t.code)
  const matches = deps.people.find(question, {
    positions,
    teams: subjectTeams,
    exclude: teamsFound.map((t) => t.mention)
  })
  const players = matches
    .filter((m) => m.people.length === 1)
    .map((m) => named(m.people[0], m.mention))
  const ambiguous = matches
    .filter((m) => m.people.length > 1)
    .map((m) => ({ mention: m.mention, options: m.people.map((p) => named(p, m.mention)) }))
  // A team word inside a matched player's name is not a team ("Chase Brown" is not the Browns).
  const mentioned = matches.map((m) => m.mention.toLowerCase())
  const teams = teamsFound.filter(
    (t) => !mentioned.some((m) => m.includes(t.mention.toLowerCase()))
  )
  const time = resolveTime(question, deps.now)
  const slots = detectSlots(question)
  const playerPositions = [
    ...new Set(players.map((p) => p.position).filter((p): p is string => !!p))
  ]
  const fit = fits(question, {
    positions: positions.length > 0 ? positions : playerPositions,
    players: players.length + ambiguous.length,
    teams: teams.filter((t) => t.role === 'subject').length
  })
  const candidates = metricCandidates(
    deps.retriever ?? DEFAULT_RETRIEVER,
    question,
    fit,
    METRICS,
    deps.k ?? 5
  )
  const type = classify(question, {
    players: players.length,
    ambiguous: ambiguous.length,
    teams: teams.filter((t) => t.role === 'subject').length,
    opponents: teams.filter((t) => t.role === 'opponent').length,
    metricHint: candidates.length > 0 && candidates[0].score >= 5,
    outOfRange: time.outOfRange !== undefined,
    rostered: slots.rostered
  })
  const decline = DECLINE[type] ?? null
  return {
    question,
    now: deps.now,
    type,
    tool: decline || ambiguous.length > 0 ? null : TOOL_OF[type],
    players,
    ambiguous,
    teams: teams.filter((t) => t.role === 'subject').map((t) => team(t.code, t.mention)),
    opponents: teams.filter((t) => t.role === 'opponent').map((t) => team(t.code, t.mention)),
    positions,
    time,
    slots,
    metrics: candidates.map((c) => {
      const m = METRICS.get(c.id)!
      return { id: m.id, label: m.label, entity: m.entity, description: m.description }
    }),
    decline
  }
}

/** The context block as the model reads it. */
export function contextText(b: ContextBlock): string {
  const lines = ['Context (resolved by the app):']
  lines.push(
    `- Now: the ${b.now.season} ${b.now.seasonType === 'POST' ? 'postseason' : 'regular season'}, played through week ${b.now.week}.`
  )
  for (const p of b.players) {
    lines.push(`- Player: ${p.name} = ${p.id} (${[p.position, p.team].filter(Boolean).join(', ')})`)
  }
  for (const a of b.ambiguous) {
    const options = a.options.map(
      (p) => `${p.name} ${p.id} (${[p.position, p.team].filter(Boolean).join(', ')})`
    )
    lines.push(`- "${a.mention}" matches several players: ${options.join('; ')}`)
  }
  for (const t of b.teams) lines.push(`- Team: ${t.name} = ${t.code}`)
  for (const t of b.opponents) lines.push(`- Opponent: ${t.name} = ${t.code}`)
  for (const s of b.time.said) lines.push(`- Time: ${s}`)
  if (b.positions.length > 0) lines.push(`- Positions named: ${b.positions.join(', ')}`)
  if (b.slots.flags.length > 0) lines.push(`- Situations named: ${b.slots.flags.join(', ')}`)
  if (b.slots.groupings.length > 0) lines.push(`- Split by: ${b.slots.groupings.join(', ')}`)
  if (b.slots.rostered) {
    lines.push(`- Rostered: ${b.slots.rostered === 'free' ? 'free agents only' : 'my team only'}`)
  }
  if (b.metrics.length > 0) {
    lines.push('- Metric candidates:')
    for (const m of b.metrics) {
      lines.push(`  - ${m.id}: ${m.label} (${m.entity}) — ${m.description.slice(0, 110)}`)
    }
  }
  return lines.join('\n')
}
```

Create `src/main/analyst/slots.ts`:

```ts
import { padded } from './text'

/**
 * Slots the question's words name (Ask spec §4.1, §3.2 rule 3): situation filters, a grouping,
 * who is rostered, how many rows, and which end of a ranking. The compact profile shows a slot only
 * when it is detected here.
 */
export type Flag =
  | 'red_zone'
  | 'inside_10'
  | 'goal_line'
  | 'third_down'
  | 'fourth_down'
  | 'early_downs'
  | 'pressure'
  | 'blitz'
  | 'play_action'
  | 'man_coverage'
  | 'zone_coverage'
  | 'neutral'
  | 'two_minute'
  | 'home'
  | 'road'

export type Grouping =
  'week' | 'season' | 'opponent' | 'down' | 'quarter' | 'personnel' | 'coverage' | 'formation'

export interface Slots {
  flags: Flag[]
  groupings: Grouping[]
  rostered: 'mine' | 'free' | null
  limit: number | null
  /** "worst", "lowest", "fewest": the bottom of a ranking. */
  ascending: boolean
}

const FLAGS: [RegExp, Flag][] = [
  [/ (red zone|redzone|inside the 20) /, 'red_zone'],
  [/ (inside the 10|inside the ten) /, 'inside_10'],
  [/ (goal line|inside the 5|inside the five) /, 'goal_line'],
  [/ (third down|3rd down|on third|third downs) /, 'third_down'],
  [/ (fourth down|4th down|fourth downs) /, 'fourth_down'],
  [/ (early down|early downs|first and second down) /, 'early_downs'],
  [/ (under pressure|pressured|when pressured|facing pressure) /, 'pressure'],
  [/ (blitz|blitzed|blitzes|the blitz) /, 'blitz'],
  [/ (play action|playaction) /, 'play_action'],
  [/ (man coverage|vs man|against man|man to man) /, 'man_coverage'],
  [/ (zone coverage|vs zone|against zone) /, 'zone_coverage'],
  [/ (neutral|neutral situations|neutral game script) /, 'neutral'],
  [/ (two minute|2 minute|end of half) /, 'two_minute'],
  [/ (at home|home games) /, 'home'],
  [/ (on the road|road games|away games|away from home) /, 'road']
]

const GROUPINGS: [RegExp, Grouping][] = [
  [/ (game log|gamelog|by week|week by week|weekly|each week|every game|game by game) /, 'week'],
  [/ (by season|each season|per season|year by year|season by season|each year) /, 'season'],
  [/ (by opponent|each opponent|against each team) /, 'opponent'],
  [/ (by down|each down|down by down) /, 'down'],
  [/ (by quarter|each quarter) /, 'quarter'],
  [/ (by personnel|split by personnel) /, 'personnel'],
  [/ (man vs zone|man versus zone|man and zone|by coverage|split by coverage) /, 'coverage'],
  [/ (by formation) /, 'formation']
]

/** A metric whose name carries the situation ("red-zone carries", "man coverage rate"): no filter. */
const NAMED_IN_METRIC: [RegExp, Flag][] = [
  [
    / red zone (carries|targets|touchdowns?|td|share|opportunit|efficiency|offense|defense)/,
    'red_zone'
  ],
  [/ (man coverage rate|play the most man|play man|in man coverage)/, 'man_coverage'],
  [/ (blitz rate|blitz the most|blitz most|blitz frequency|how often they blitz)/, 'blitz'],
  [/ (play action rate|play action usage)/, 'play_action'],
  [/ (third down conversion|third down defense|third down offense)/, 'third_down'],
  [
    / (pressure rate|pressures|pressure on the|generates pressure|pressure generated|pressure allowed)/,
    'pressure'
  ],
  [/ (neutral pass rate|neutral pace|neutral proe|neutral situation proe)/, 'neutral']
]

export function detectSlots(question: string): Slots {
  const t = padded(question)
  const named = new Set(NAMED_IN_METRIC.filter(([rx]) => rx.test(t)).map(([, f]) => f))
  const flags = FLAGS.filter(([rx, f]) => rx.test(t) && !named.has(f)).map(([, f]) => f)
  const groupings = GROUPINGS.filter(([rx]) => rx.test(t)).map(([, g]) => g)
  // "man vs zone" is a split, not a filter.
  const split = groupings.includes('coverage')
  const rostered =
    / (free agents?|on waivers|waiver wire|available|unrostered|unowned|not rostered) /.test(t)
      ? 'free'
      : / (my team|my roster|my players|on my team|i have|mine) /.test(t)
        ? 'mine'
        : null
  const top = t.match(/ (?:top|best|first|worst|bottom) (\d{1,2}) /)
  return {
    flags: split ? flags.filter((f) => f !== 'man_coverage' && f !== 'zone_coverage') : flags,
    groupings,
    rostered,
    limit: top ? Number(top[1]) : null,
    ascending: / (worst|lowest|least|fewest|bottom) /.test(t)
  }
}
```

Create `src/main/analyst/teams.ts`:

```ts
import { phraseKey } from '@shared/stats/aliases'
import { TEAM_NAMES } from '@shared/stats/nflTeams'
import { type Word, words } from './text'

/**
 * Teams by the names people use (Ask spec §4.1): the full name, the nickname, the city where it is
 * one team's, and common slang (none that is also an everyday or betting word: no "vegas", "pack"). Codes count only in capitals ("NO", "NE"), so "no" and "ne" in a
 * sentence are not teams.
 */
const SLANG: Record<string, string[]> = {
  ARI: ['cards', 'zona'],
  ATL: ['dirty birds'],
  CIN: ['cincy'],
  DAL: ['americas team'],
  GB: ['green bay', 'cheeseheads'],
  JAX: ['jags'],
  KC: ['kansas city', 'kc'],
  LA: ['la rams', 'lar'],
  LAC: ['bolts', 'la chargers'],
  LV: ['las vegas'],
  MIA: ['fins'],
  NE: ['pats', 'new england'],
  NO: ['new orleans', 'nola'],
  NYG: ['g men', 'gmen', 'big blue'],
  NYJ: ['gang green'],
  PHI: ['philly'],
  SF: ['niners', '9ers', 'san francisco', 'sf'],
  TB: ['bucs', 'tampa', 'tampa bay'],
  WAS: ['commies']
}

/** Cities two teams share are left out: "Los Angeles" and "New York" need the nickname. */
const SHARED_CITIES = new Set(['los angeles', 'new york'])

const ALIASES: Map<string, string> = (() => {
  const map = new Map<string, string>()
  for (const [code, name] of Object.entries(TEAM_NAMES)) {
    const parts = name.split(' ')
    const nickname = parts[parts.length - 1]
    const city = parts.slice(0, -1).join(' ')
    map.set(phraseKey(name), code)
    map.set(phraseKey(nickname), code)
    if (!SHARED_CITIES.has(phraseKey(city))) map.set(phraseKey(city), code)
  }
  for (const [code, slang] of Object.entries(SLANG)) {
    for (const s of slang) map.set(phraseKey(s), code)
  }
  // Two-word nicknames.
  map.set('49ers', 'SF')
  return map
})()

const CODES = new Set(Object.keys(TEAM_NAMES))
const OPPONENT_WORDS = new Set(['vs', 'versus', 'against', 'facing', 'v'])

export interface TeamMention {
  code: string
  /** The words as written. */
  mention: string
  /** `opponent` after "vs", "against", "facing". */
  role: 'subject' | 'opponent'
}

/** Teams named in the question, longest phrase first, each once. */
export function findTeams(question: string): TeamMention[] {
  const ws: Word[] = words(question)
  const found: TeamMention[] = []
  const used = new Set<number>()
  for (let n = 3; n >= 1; n--) {
    for (let i = 0; i + n <= ws.length; i++) {
      if ([...Array(n).keys()].some((k) => used.has(i + k))) continue
      const slice = ws.slice(i, i + n)
      const key = slice.map((w) => w.key).join(' ')
      let code = ALIASES.get(key)
      if (!code && n === 1 && CODES.has(slice[0].raw)) code = slice[0].raw
      // A lower-case two-letter code is a word ("no", "la"); "kc" and "sf" are in the slang.
      if (code && n === 1 && /^[a-z]{2}$/.test(slice[0].raw) && !SLANG[code]?.includes(key)) {
        continue
      }
      if (!code || found.some((t) => t.code === code)) continue
      // "against the Ravens": the word before "the" says it.
      const before = ws[i - 1]?.key === 'the' ? ws[i - 2]?.key : ws[i - 1]?.key
      found.push({
        code,
        mention: slice.map((w) => w.raw).join(' '),
        role: before && OPPONENT_WORDS.has(before) ? 'opponent' : 'subject'
      })
      for (let k = 0; k < n; k++) used.add(i + k)
    }
  }
  return found
}
```

Create `src/main/analyst/text.ts`:

```ts
import { phraseKey } from '@shared/stats/aliases'

/**
 * Words of a question as the resolver reads them (Ask spec §4.1): `key` is the phrase key (lower
 * case, no apostrophes or punctuation), `raw` the word as written, so a team code or a surname in
 * capitals can count where the same word in lower case would not ("NO", "Love").
 */
export interface Word {
  key: string
  raw: string
}

export function words(question: string): Word[] {
  return question
    .replace(/['’]s\b/g, '')
    .split(/[^A-Za-z0-9'’.-]+/)
    .map((raw) => raw.replace(/^[.'’-]+|[.'’-]+$/g, ''))
    .filter((raw) => raw.length > 0)
    .map((raw) => ({ raw, key: phraseKey(raw) }))
    .filter((w) => w.key.length > 0)
}

/** The question as one phrase key, padded with spaces so `has(' red zone ')` matches whole words. */
export function padded(question: string): string {
  return ` ${phraseKey(question)} `
}

/** Whether the phrase occurs as whole words. */
export function has(question: string, phrase: string): boolean {
  return padded(question).includes(` ${phraseKey(phrase)} `)
}

/** The question is written all in lower case (no capitals to lean on). */
export function lowerCase(question: string): boolean {
  return question === question.toLowerCase()
}

/** Damerau–Levenshtein distance up to `max`: higher means "more than max". */
export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  )
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      }
      rowMin = Math.min(rowMin, d[i][j])
    }
    if (rowMin > max) return max + 1
  }
  return d[a.length][b.length]
}
```

Create `src/main/analyst/time.ts`:

```ts
import { padded } from './text'

/**
 * Time in words (Ask spec §4.1): "this season", "last year", "since week 5", "last 4 games",
 * "2022–24", "the playoffs". "Now" is the latest week with plays (`StatsStatus.through`). What it
 * resolved goes back to the model as a line ("'since week 5' = weeks 5–7 of 2026").
 */
export interface Now {
  /** The current season (the latest in the warehouse). */
  season: number
  /** The latest week with plays, and whether it is a postseason week. */
  week: number
  seasonType: 'REG' | 'POST'
}

export interface ResolvedTime {
  seasons?: number[]
  weeks?: [number, number]
  lastNGames?: number
  seasonType?: 'POST' | 'ALL'
  /** Lines for the context block. */
  said: string[]
  /** A season before 2019 or after the current one was asked for. */
  outOfRange?: number
}

const FIRST = 2019
const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
}
const n = (s: string): number => NUMBER_WORDS[s] ?? Number(s)
const span = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i)
/** "22" → 2022, "2022" → 2022. */
const year = (s: string): number => (s.length === 2 ? 2000 + Number(s) : Number(s))

export function resolveTime(question: string, now: Now): ResolvedTime {
  const t = padded(question)
  const out: ResolvedTime = { said: [] }
  const latestWeek = now.seasonType === 'REG' ? now.week : 18
  const say = (phrase: string, meaning: string): void => {
    out.said.push(`'${phrase}' = ${meaning}`)
  }
  const num = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)'

  // Seasons.
  let m: RegExpMatchArray | null
  if ((m = t.match(/ (?:from )?(20\d\d) (?:to|through|thru|and|) ?(20\d\d|\d\d) /))) {
    const a = year(m[1])
    const b = year(m[2])
    if (b > a) {
      out.seasons = span(a, b)
      say(m[0].trim(), `seasons ${a}–${b}`)
    }
  }
  if (!out.seasons && (m = t.match(/ since (20\d\d) /))) {
    out.seasons = span(Number(m[1]), now.season)
    say(m[0].trim(), `seasons ${m[1]}–${now.season}`)
  }
  if (!out.seasons && (m = t.match(new RegExp(` (?:last|past) ${num} (?:seasons|years) `)))) {
    const k = n(m[1])
    out.seasons = span(now.season - k + 1, now.season)
    say(m[0].trim(), `seasons ${now.season - k + 1}–${now.season}`)
  }
  if (!out.seasons && / (career|all time|every season|since 2019) /.test(t)) {
    out.seasons = span(FIRST, now.season)
    say(
      t.match(/ (career|all time|every season|since 2019) /)![1],
      `seasons ${FIRST}–${now.season}`
    )
  }
  if (!out.seasons && / (last|previous|prior) (season|year) /.test(t)) {
    out.seasons = [now.season - 1]
    say(t.match(/ (last|previous|prior) (season|year) /)![0].trim(), `${now.season - 1}`)
  }
  if (!out.seasons) {
    const years = [...t.matchAll(/ (19\d\d|20\d\d) /g)].map((x) => Number(x[1]))
    const inRange = years.filter((y) => y >= FIRST && y <= now.season)
    const outside = years.find((y) => y < FIRST || y > now.season)
    if (outside !== undefined) out.outOfRange = outside
    if (inRange.length > 0) {
      out.seasons = [...new Set(inRange)].sort()
      say(out.seasons.join(', '), out.seasons.length === 1 ? `${out.seasons[0]}` : 'those seasons')
    }
  }
  if (!out.seasons && / (this|current) (season|year) | so far /.test(t)) {
    out.seasons = [now.season]
    say(t.match(/ (this|current) (season|year) | so far /)![0].trim(), `${now.season}`)
  }
  // "Playoff odds" and "make the playoffs" are about the regular season's forecast.
  const post = t.match(/ (in the playoffs|playoff games?|postseason|post season|playoff run) /)
  if (post && !/ playoff (odds|chances|probability|picture|race) /.test(t)) {
    out.seasonType = 'POST'
    say(post[1], 'the postseason')
  }

  // Weeks and games, in the current season unless another one was named.
  const inSeason = out.seasons?.length === 1 ? out.seasons[0] : now.season
  const through = inSeason === now.season ? latestWeek : 18
  if ((m = t.match(new RegExp(` (?:last|past) ${num} (?:games|game) `)))) {
    out.lastNGames = n(m[1])
    say(m[0].trim(), `each player's last ${out.lastNGames} games`)
  } else if ((m = t.match(new RegExp(` (?:last|past) ${num} weeks `)))) {
    const k = n(m[1])
    out.weeks = [Math.max(1, through - k + 1), through]
    say(m[0].trim(), `weeks ${out.weeks[0]}–${out.weeks[1]} of ${inSeason}`)
  } else if ((m = t.match(/ (?:since|after|from) week (\d+) /))) {
    const from = Number(m[1])
    out.weeks = [from, Math.max(from, through)]
    say(m[0].trim(), `weeks ${out.weeks[0]}–${out.weeks[1]} of ${inSeason}`)
  } else if ((m = t.match(/ weeks? (\d{1,2}) (?:to|through|thru|and|) ?(\d{1,2}) /))) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (b >= a) {
      out.weeks = [a, b]
      say(m[0].trim(), `weeks ${a}–${b} of ${inSeason}`)
    }
  } else if ((m = t.match(/ week (\d{1,2}) /)) && Number(m[1]) >= 1 && Number(m[1]) <= 22) {
    const w = Number(m[1])
    out.weeks = [w, w]
    say(m[0].trim(), `week ${w} of ${inSeason}`)
  } else if (/ next week /.test(t)) {
    const w = Math.min(22, latestWeek + 1)
    out.weeks = [w, w]
    say('next week', `week ${w} of ${now.season}`)
  } else if (/ (last|this) week /.test(t)) {
    out.weeks = [latestWeek, latestWeek]
    say(t.match(/ (last|this) week /)![0].trim(), `week ${latestWeek} of ${now.season}`)
  }
  if ((out.weeks || out.lastNGames) && !out.seasons) out.seasons = [now.season]
  return out
}
```

Modify `src/shared/stats/aliases.ts`:

```diff
diff --git a/src/shared/stats/aliases.ts b/src/shared/stats/aliases.ts
index facde4e..0e0397b 100644
--- a/src/shared/stats/aliases.ts
+++ b/src/shared/stats/aliases.ts
@@ -209,9 +209,16 @@ export const METRIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
   off_success_rate: ['offensive success rate', 'team success rate'],
   def_success_rate: ['defensive success rate', 'success rate allowed by the defense'],
   off_pass_epa: ['team passing epa', 'pass offense epa', 'passing offense'],
-  def_pass_epa: ['pass defense epa', 'passing epa allowed', 'pass defense'],
+  def_pass_epa: ['pass defense epa', 'passing epa allowed', 'pass defense', 'against the pass'],
   off_rush_epa: ['team rushing epa', 'run offense epa', 'rushing offense'],
-  def_rush_epa: ['run defense epa', 'rushing epa allowed', 'run defense', 'rush defense'],
+  def_rush_epa: [
+    'run defense epa',
+    'rushing epa allowed',
+    'run defense',
+    'rush defense',
+    'against the run',
+    'stopping the run'
+  ],
   off_pass_success: ['team dropback success', 'pass offense success rate'],
   def_pass_success: ['pass defense success rate', 'dropback success allowed'],
   off_rush_success: ['team rushing success', 'run offense success rate'],
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/resolve.test.ts
```

Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/classify.ts src/main/analyst/metrics.ts src/main/analyst/players.ts src/main/analyst/resolve.ts src/main/analyst/slots.ts src/main/analyst/teams.ts src/main/analyst/text.ts src/main/analyst/time.ts src/shared/stats/aliases.ts tests/fixtures/analyst.ts tests/main/analyst/resolve.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/classify.ts src/main/analyst/metrics.ts src/main/analyst/players.ts src/main/analyst/resolve.ts src/main/analyst/slots.ts src/main/analyst/teams.ts src/main/analyst/text.ts src/main/analyst/time.ts src/shared/stats/aliases.ts tests/fixtures/analyst.ts tests/main/analyst/resolve.test.ts
git commit -m "feat(analyst): resolver and question classifier"
```

Expected: typecheck and lint clean; the suite at 1,217 passed, 5 skipped (a clean checkout).

---

### Task 5: The analyst tools (spec §3; amendments D, E, G, J)

`createAnalyst({ stats, league })`: `turn()` reads now, the catalogue and the player index once per warehouse state; `run(name, args, turn)` checks the arguments against the tool's schema and answers what is wrong and what was probably meant, builds `StatsQuery`s (never SQL), reads the rows through an exact cache, and returns compact text for the model and cards for the screen. A player's or team's line comes from a league query (rank and percentile among his position, or the 32); a split adds the split query and compares each row with the base (`splits.ts`); an empty ranking says why. `league` reads `companion.db` through a `LeagueReader`. The tests use a fake engine that records each query.

**Files:**

- Create: `src/main/analyst/format.ts`, `src/main/analyst/league.ts`, `src/main/analyst/schema.ts`, `src/main/analyst/splits.ts`, `src/main/analyst/tools.ts`, `src/shared/ask.ts`, `tests/main/analyst/tools.test.ts`
- Modify: `tests/fixtures/analyst.ts`

- [ ] **Step 1: Write the tests**

Modify `tests/fixtures/analyst.ts`:

```diff
diff --git a/tests/fixtures/analyst.ts b/tests/fixtures/analyst.ts
index 6d77c99..7b0c98b 100644
--- a/tests/fixtures/analyst.ts
+++ b/tests/fixtures/analyst.ts
@@ -1,4 +1,4 @@
-import type { Person } from '@shared/stats/types'
+import type { Person, StatsResult, StatsRow } from '@shared/stats/types'

 const person = (id: string, name: string, over: Partial<Person> = {}): Person => {
   const [first, ...rest] = name.split(' ')
@@ -68,3 +68,48 @@ export const PEOPLE: Person[] = [
 ]

 export const NOW = { season: 2026, week: 7, seasonType: 'REG' as const }
+
+/** A stats row for a fake engine answer. */
+export function statsRow(
+  id: string,
+  name: string,
+  values: Record<
+    string,
+    {
+      raw: number | null
+      sample?: number | null
+      qualified?: boolean
+      percentile?: number | null
+      rank?: number | null
+    }
+  >,
+  over: Partial<StatsRow> = {}
+): StatsRow {
+  return {
+    id,
+    name,
+    team: 'CIN',
+    position: 'WR',
+    group: {},
+    games: 7,
+    values: Object.fromEntries(
+      Object.entries(values).map(([k, v]) => [
+        k,
+        {
+          value: v.raw,
+          raw: v.raw,
+          sample: v.sample ?? null,
+          qualified: v.qualified ?? true,
+          percentile: v.percentile ?? null,
+          rank: v.rank ?? null,
+          estimated: false
+        }
+      ])
+    ),
+    ...over
+  }
+}
+
+export function statsResult(rows: StatsRow[], notes: string[] = []): StatsResult {
+  return { grain: 'season', columns: [], rows, total: rows.length, notes, ms: 1 }
+}
```

Create `tests/main/analyst/tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { StatsCard, ToolError, ToolResult } from '@shared/ask'
import type { Rules } from '@shared/rules'
import type { GameForecast, StatsQuery, StatsRow } from '@shared/stats/types'
import type { LeagueReader } from '@main/analyst/league'
import { splitStat, spreadOf } from '@main/analyst/splits'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { PEOPLE, statsResult, statsRow } from '../../fixtures/analyst'

const CHASE = '00-0036900'
const BIJAN = '00-0038542'

/** A fake engine: records each query and answers from `answer`. */
function fake(answer: (q: StatsQuery) => StatsRow[] = () => []): {
  stats: AnalystStats
  queries: StatsQuery[]
} {
  const queries: StatsQuery[] = []
  const stability = new Map([
    [
      'yprr',
      { yearToYear: 0.6, pairs: 9, splitHalf: 0.7, prior: 300, reliability: 'high' as const }
    ]
  ])
  const game = (week: number, home: string, away: string): GameForecast => ({
    gameId: `2026_${week}_${away}_${home}`,
    season: 2026,
    seasonType: 'REG',
    week,
    gameday: null,
    kickoff: null,
    home,
    away,
    neutral: false,
    homeScore: null,
    awayScore: null,
    homeElo: 1550,
    awayElo: 1500,
    homeWinProb: 0.62,
    eloSpread: -3,
    vegasHomeWinProb: null,
    spread: 3.5,
    total: 47.5,
    roof: null,
    temp: null,
    wind: null
  })
  const stats: AnalystStats = {
    status: async () => ({
      available: true,
      through: { season: 2026, seasonType: 'REG', week: 7 },
      updatedAt: '2026-10-27T00:00:00Z',
      busy: false
    }),
    catalogue: async () => catalogueInfo(stability),
    people: async () => PEOPLE,
    query: async (q) => {
      queries.push(q)
      return statsResult(answer(q))
    },
    games: async (q) => [game(q.weeks?.[0] ?? 1, 'GB', 'CAR')],
    outlook: async () => {
      throw new Error('not in this test')
    },
    player: async () => {
      throw new Error('not in this test')
    }
  }
  return { stats, queries }
}

const run = async (
  name: string,
  args: unknown,
  stats = fake(),
  league: LeagueReader | null = null
): Promise<{ out: ToolResult | ToolError; queries: StatsQuery[] }> => {
  const analyst = createAnalyst({ stats: stats.stats, league: () => league })
  const turn = await analyst.turn()
  return { out: await analyst.run(name, args, turn), queries: stats.queries }
}
const ok = (o: ToolResult | ToolError): ToolResult => {
  if (!o.ok) throw new Error(o.error)
  return o
}
const err = (o: ToolResult | ToolError): string => {
  if (o.ok) throw new Error('expected an error')
  return o.error
}

describe('errors teach (Ask spec §3.3)', () => {
  it('says what is wrong and what was probably meant', async () => {
    expect(err((await run('leaderboard', { metric: 'yards per route' })).out)).toMatch(
      /did you mean yprr \(Yards per route run\)/
    )
    expect(err((await run('player_stats', { player: 'Bijan' })).out)).toBe(
      'arguments.player is not valid ("Bijan"). "Bijan" matched 00-0038542 Bijan Robinson (RB, ATL).'
    )
    expect(err((await run('leaderboard', { metric: 'yprr', position: 'QB' })).out)).toBe(
      'yprr applies to RB, WR, TE, not QB; did you mean position: WR?'
    )
    expect(err((await run('leaderboard', { metric: 'yprr', player: CHASE })).out)).toMatch(
      /arguments.player is not an argument; the arguments are metric, also, position/
    )
    expect(err((await run('chart', {})).out)).toMatch(
      /^there is no tool "chart"; the tools are find,/
    )
    expect(err((await run('team_stats', { team: 'Ravens' })).out)).toMatch(
      /"Ravens" is the team BAL/
    )
  })
})

describe('leaderboard', () => {
  it('builds one query with the app’s defaults, and reads its rows best first', async () => {
    const stats = fake(() => [
      statsRow(CHASE, "Ja'Marr Chase", {
        yprr: { raw: 2.45, sample: 210, percentile: 97, rank: 1 }
      }),
      statsRow(
        '00-0036358',
        'CeeDee Lamb',
        { yprr: { raw: 2.1, sample: 180, percentile: 90, rank: 2 } },
        { team: 'DAL' }
      )
    ])
    const { out, queries } = await run(
      'leaderboard',
      { metric: 'yprr', position: 'WR', weeks: [5, 7], third_down: true, red_zone: true },
      stats
    )
    expect(queries).toEqual([
      {
        entity: 'player',
        metrics: ['yprr'],
        scope: { seasons: [2026], weeks: [5, 7], positions: ['WR'], qualifiedOnly: true },
        situation: { down: [3], fieldZone: 'redzone' },
        limit: 10
      }
    ])
    const r = ok(out)
    expect(r.text.split('\n')).toEqual([
      'Yards per route run (yprr), WR, 2026 weeks 5–7, down 3, red zone: best first, qualified only.',
      "1. Ja'Marr Chase (00-0036900, WR, CIN) — YPRR 2.45 on 210 routes, 97th pct",
      '2. CeeDee Lamb (00-0036358, WR, DAL) — YPRR 2.10 on 180 routes, 90th pct'
    ])
    expect((r.cards[0] as StatsCard).chart).toBe('bar')
    expect(r.queries).toEqual(queries)
  })

  it('reads the postseason when asked', async () => {
    const { out, queries } = await run('leaderboard', {
      metric: 'rush_yds',
      season_type: 'POST',
      seasons: [2025]
    })
    expect(queries[0].scope).toEqual({ seasons: [2025], seasonType: 'POST', qualifiedOnly: true })
    expect(ok(out).title).toBe(
      'Rushing yards (rush_yds), 2025 postseason: best first, qualified only.'
    )
  })

  it('sorts the other way for the worst, and refuses a position on a team metric', async () => {
    const { queries } = await run('leaderboard', { metric: 'def_rush_epa', order: 'worst' })
    expect(queries[0]).toMatchObject({
      entity: 'team',
      sort: { metric: 'def_rush_epa', dir: 'desc' }
    })
    expect(err((await run('leaderboard', { metric: 'def_rush_epa', position: 'DL' })).out)).toBe(
      'def_rush_epa is a team metric; leave out position'
    )
  })

  it('explains an empty ranking from the rows below the minimum', async () => {
    const stats = fake((q) =>
      q.scope.qualifiedOnly
        ? []
        : [statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 3, sample: 12, qualified: false } })]
    )
    const r = ok((await run('leaderboard', { metric: 'yprr', weeks: [7, 7] }, stats)).out)
    expect(r.notes.at(-1)).toMatch(
      /^No qualified rows: 1 below the minimum sample \(150 routes over 17 games, scaled to the weeks in scope\)\. The best unqualified: Ja'Marr Chase on 12 routes\./
    )
  })

  it('keeps only free agents, or my players, with a league; refuses either without one', async () => {
    const league: LeagueReader = {
      teams: () => [],
      roster: () => [],
      ownership: () => ({
        players: {
          [CHASE]: { name: 'Mine', mine: true },
          '00-0036358': { name: 'Other', mine: false }
        },
        teams: {}
      }),
      rules: () => null
    }
    const rows = [
      statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2.4, rank: 1 } }),
      statsRow('00-0036358', 'CeeDee Lamb', { yprr: { raw: 2.2, rank: 2 } }),
      statsRow('00-0039075', 'Puka Nacua', { yprr: { raw: 2.0, rank: 3 } })
    ]
    const free = await run(
      'leaderboard',
      { metric: 'yprr', rostered: 'free' },
      fake(() => rows),
      league
    )
    expect(free.queries[0].limit).toBe(300)
    expect((ok(free.out).cards[0] as StatsCard).result.rows.map((r) => r.id)).toEqual([
      '00-0039075'
    ])
    const mine = await run(
      'leaderboard',
      { metric: 'yprr', rostered: 'mine' },
      fake(() => rows),
      league
    )
    expect(mine.queries[0].scope.players).toEqual([CHASE])
    expect(err((await run('leaderboard', { metric: 'yprr', rostered: 'free' })).out)).toBe(
      'no league is imported, so rostered cannot be used'
    )
  })
})

describe('player_stats and team_stats', () => {
  it('reads a line from the league query, so its percentiles are among his position', async () => {
    const stats = fake(() => [
      statsRow('00-0036358', 'CeeDee Lamb', { targets: { raw: 50, percentile: 90 } }),
      statsRow(CHASE, "Ja'Marr Chase", { targets: { raw: 61, percentile: 99 } })
    ])
    const { out, queries } = await run(
      'player_stats',
      { player: CHASE, metrics: ['targets'], seasons: [2025] },
      stats
    )
    expect(queries).toEqual([
      {
        entity: 'player',
        metrics: ['targets'],
        scope: { seasons: [2025], positions: ['WR'], qualifiedOnly: false },
        limit: 5000
      }
    ])
    expect(ok(out).text.split('\n')[1]).toBe(
      'Tgt 61, 99th pct (percentiles among WRs, qualified rows only)'
    )
  })

  it('splits against the base: a difference, and whether it is beyond noise', async () => {
    const qualified = Array.from({ length: 10 }, (_, i) =>
      statsRow(`00-00400${10 + i}`, `WR ${i}`, { yprr: { raw: 1.5 + i * 0.1, sample: 400 } })
    )
    const stats = fake((q) =>
      q.groupBy
        ? [
            statsRow(
              CHASE,
              "Ja'Marr Chase",
              { yprr: { raw: 1.8, sample: 210 } },
              { group: { coverage: 'man' } }
            ),
            statsRow(
              CHASE,
              "Ja'Marr Chase",
              { yprr: { raw: 2.4, sample: 416 } },
              { group: { coverage: 'zone' } }
            ),
            statsRow(
              CHASE,
              "Ja'Marr Chase",
              { yprr: { raw: null, sample: 0 } },
              { group: { coverage: null } }
            )
          ]
        : [...qualified, statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2.26, sample: 626 } })]
    )
    const { out, queries } = await run(
      'player_stats',
      { player: CHASE, metrics: ['yprr'], by: 'coverage', seasons: [2025] },
      stats
    )
    expect(queries.map((q) => q.groupBy ?? null)).toEqual([null, ['coverage']])
    const r = ok(out)
    expect(r.text.split('\n').slice(1)).toEqual([
      'All: YPRR 2.26 on 626 routes',
      'vs man: YPRR 1.80 on 210 routes (-0.46 vs all, beyond noise)',
      'vs zone: YPRR 2.40 on 416 routes (+0.14 vs all, within noise)'
    ])
    const card = r.cards[0] as StatsCard
    expect(card.base?.values.yprr.raw).toBe(2.26)
    expect(card.splits?.man.yprr.withinNoise).toBe(false)
    expect(card.result.rows).toHaveLength(2)
  })

  it('counts the splits of a turn and says so from the third', async () => {
    const stats = fake((q) =>
      q.groupBy
        ? [statsRow('BAL', 'BAL', { off_epa_play: { raw: 0.1 } }, { group: { week: 1 } })]
        : []
    )
    const analyst = createAnalyst({ stats: stats.stats, league: () => null })
    const turn = await analyst.turn()
    let last: ToolResult | null = null
    for (let i = 0; i < 3; i++) {
      last = ok(
        await analyst.run(
          'team_stats',
          { team: 'BAL', metrics: ['off_epa_play'], by: 'week', weeks: [1, i + 1] },
          turn
        )
      )
    }
    expect(last!.notes.at(-1)).toBe(
      'This is split 3 looked at in this answer; with many splits, one will look unusual by chance.'
    )
  })

  it('defaults to his position’s metrics that can be split by situation', async () => {
    const { queries } = await run('player_stats', { player: BIJAN, red_zone: true })
    expect(queries[0].metrics).toEqual(['carries', 'rush_yds', 'rush_ypc', 'targets', 'rec_yds'])
    expect(err((await run('player_stats', { player: BIJAN, metrics: ['def_rush_epa'] })).out)).toBe(
      'def_rush_epa is a team metric; use team_stats'
    )
  })
})

describe('the split statistics (report D5)', () => {
  it('give an interval from the prior, the qualified spread and the two samples', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      statsRow(`p${i}`, `p${i}`, { m: { raw: i, sample: 100 } })
    )
    const spread = spreadOf(rows, 'm')!
    expect(spread).toEqual({ variance: 3.5, meanSample: 100 })
    const value = (raw: number, sample: number): StatsRow['values'][string] =>
      statsRow('x', 'x', { m: { raw, sample } }).values.m
    // σ²_t = 3.5 / (1 + 100/100) = 1.75; σ²_u = 175; SE = sqrt(175 · (1/50 − 1/200)) ≈ 1.62.
    const s = splitStat(
      {
        kind: 'rate',
        stability: { yearToYear: 0.5, pairs: 5, splitHalf: 0.5, prior: 100, reliability: 'medium' }
      },
      value(5, 50),
      value(2, 200),
      spread
    )
    expect(s.diff).toBe(3)
    expect(s.interval![0]).toBeCloseTo(3 - 1.96 * Math.sqrt(175 * (1 / 50 - 1 / 200)), 6)
    expect(s.withinNoise).toBe(true)
    expect(
      splitStat({ kind: 'count', stability: null }, value(5, 50), value(2, 200), spread)
    ).toEqual({
      diff: 3,
      interval: null,
      withinNoise: null
    })
  })
})

describe('compare, trend, games, describe, league, find', () => {
  it('compare reads the players from one query among their positions, in the order asked', async () => {
    const stats = fake(() => [
      statsRow('00-0039075', 'Puka Nacua', { yprr: { raw: 2.6, percentile: 98 } }, { team: 'LA' }),
      statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2.3, percentile: 90 } })
    ])
    const { out, queries } = await run(
      'compare',
      { ids: [CHASE, '00-0039075'], metrics: ['yprr'] },
      stats
    )
    expect(queries[0]).toEqual({
      entity: 'player',
      metrics: ['yprr'],
      scope: { seasons: [2026], positions: ['WR'], qualifiedOnly: false },
      limit: 5000
    })
    expect((ok(out).cards[0] as StatsCard).result.rows.map((r) => r.id)).toEqual([
      CHASE,
      '00-0039075'
    ])
    expect(err((await run('compare', { ids: [CHASE, 'BAL'] })).out)).toBe(
      'ids must be all player ids or all team codes'
    )
  })

  it('trend splits one id by season from his first season, as a line', async () => {
    const { out, queries } = await run('trend', { id: '00-0034857', metric: 'qb_epa_db' })
    expect(queries[0]).toEqual({
      entity: 'player',
      metrics: ['qb_epa_db'],
      scope: {
        seasons: [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
        players: ['00-0034857'],
        qualifiedOnly: false
      },
      groupBy: ['season'],
      limit: 50
    })
    expect((ok(out).cards[0] as StatsCard).chart).toBe('line')
  })

  it('games default to next week', async () => {
    const r = ok((await run('games', {})).out)
    expect(r.text.split('\n')).toEqual([
      'Games, 2026 week 8.',
      'Week 8: CAR @ GB. Elo: GB 62%, spread GB −3.5, total 47.5.'
    ])
  })

  it('describe reads a metric or a dimension, and suggests ids for anything else', async () => {
    const m = ok((await run('describe', { metric: 'yprr' })).out)
    expect(m.text).toContain('Stability: year-to-year r 0.60 (high), half signal at 300 routes.')
    const d = ok((await run('describe', { metric: 'pressure' })).out)
    expect(d.text).toContain('Seasons: 2019 to the prior season.')
    expect(err((await run('describe', { metric: 'yards per route' })).out)).toMatch(
      /^"yards per route" is not a metric id; did you mean yprr/
    )
  })

  it('league reads the scoring, an owner and my roster; without a league it says so', async () => {
    const rules = {
      scoring: {
        rec: 0.5,
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -2,
        rush_yd: 0.1,
        rush_td: 6,
        rec_yd: 0.1,
        rec_td: 6,
        fum_lost: -2
      },
      positionOverrides: { TE: { rec: 1 } }
    } as unknown as Rules
    const league: LeagueReader = {
      teams: () => [{ rosterId: 1, name: 'Puffins', mine: true }],
      roster: () => [
        { name: "Ja'Marr Chase", position: 'WR', team: 'CIN', slot: 'starter', gsis: CHASE }
      ],
      ownership: () => ({ players: { [CHASE]: { name: 'Puffins', mine: true } }, teams: {} }),
      rules: () => rules
    }
    expect(
      ok((await run('league', { what: 'scoring' }, fake(), league)).out).text.split('\n')
    ).toEqual([
      'League scoring.',
      'Format: HALF (0.5 per reception)',
      'Passing: 1 per 25 yards, 4 per TD, -2 per interception',
      'Rushing: 1 per 10 yards, 6 per TD',
      'Receiving: 1 per 10 yards, 6 per TD',
      'Fumbles lost: -2',
      'TE premium: 1 per reception'
    ])
    expect(
      ok((await run('league', { what: 'owner_of', player: CHASE }, fake(), league)).out).text
    ).toContain("Ja'Marr Chase is on Puffins (your team).")
    expect(ok((await run('league', { what: 'my_roster' }, fake(), league)).out).text).toContain(
      "starter: Ja'Marr Chase (00-0036900), WR, CIN"
    )
    expect(err((await run('league', { what: 'scoring' })).out)).toBe(
      'no league is imported; league data is not available'
    )
  })

  it('find names players, teams and metrics', async () => {
    const r = ok((await run('find', { text: 'Niners CMC yards after contact' })).out)
    expect(r.text).toContain('Player: Christian McCaffrey = 00-0033280 (RB, SF)')
    expect(r.text).toContain('Team: San Francisco 49ers = SF')
    expect(r.text).toContain('Metric: yac_att = Yards after contact per carry')
  })
})

describe('the analyst (Ask spec §5.3)', () => {
  it('answers a repeated query from its cache', async () => {
    const stats = fake(() => [statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2, rank: 1 } })])
    const analyst = createAnalyst({ stats: stats.stats, league: () => null })
    const turn = await analyst.turn()
    const first = ok(await analyst.run('leaderboard', { metric: 'yprr' }, turn))
    const second = ok(await analyst.run('leaderboard', { metric: 'yprr' }, turn))
    expect([first.cached, second.cached]).toEqual([false, true])
    expect(stats.queries).toHaveLength(1)
  })

  it('reads the warehouse again, and forgets its cache, when the warehouse changes', async () => {
    const stats = fake(() => [statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2, rank: 1 } })])
    let updatedAt = '2026-10-27T00:00:00Z'
    let people = 0
    const status = stats.stats.status
    stats.stats.status = async () => ({ ...(await status()), updatedAt })
    const read = stats.stats.people
    stats.stats.people = async () => {
      people++
      return read()
    }
    const analyst = createAnalyst({ stats: stats.stats, league: () => null })
    await analyst.run('leaderboard', { metric: 'yprr' }, await analyst.turn())
    await analyst.run('leaderboard', { metric: 'yprr' }, await analyst.turn())
    expect([people, stats.queries.length]).toEqual([1, 1])
    updatedAt = '2026-11-03T00:00:00Z'
    const after = ok(await analyst.run('leaderboard', { metric: 'yprr' }, await analyst.turn()))
    expect([people, stats.queries.length, after.cached]).toEqual([2, 2, false])
  })

  it('needs a built warehouse', async () => {
    const stats = fake()
    stats.stats.status = async () => ({
      available: true,
      through: null,
      updatedAt: null,
      busy: true
    })
    await expect(createAnalyst({ stats: stats.stats, league: () => null }).turn()).rejects.toThrow(
      'the stats are still being built'
    )
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/tools.test.ts
```

Expected: FAIL — `@main/analyst/tools`, `splits`, `league` and `@shared/ask` do not exist.

- [ ] **Step 3: Implement**

Create `src/main/analyst/format.ts`:

```ts
import type { MetricUnit } from '@shared/stats/types'

/** Units whose values sit around zero: written with their sign. */
const SIGNED: MetricUnit[] = ['pp', 'epa']

/**
 * A value as the model reads it (Ask spec §3.3): rounded to the catalogue's decimals, a fraction as
 * a percentage, EPA and percentage points signed. Plain digits, an ASCII minus and no thousands
 * separator, so the number check (§4.3) reads back exactly what the model was shown.
 */
export function fmt(value: number | null, unit: MetricUnit, decimals: number): string {
  if (value === null || !Number.isFinite(value)) return '—'
  const shown = unit === 'pct' ? value * 100 : value
  const text = shown.toFixed(decimals)
  const zero = Number(Math.abs(shown).toFixed(decimals)) === 0
  const signed =
    SIGNED.includes(unit) && shown > 0 && !zero ? `+${text}` : zero ? (0).toFixed(decimals) : text
  return unit === 'pct' ? `${signed}%` : signed
}
```

Create `src/main/analyst/league.ts`:

```ts
import type { Db } from '@main/db/connection'
import { leagueOwnership, playerLink } from '@main/db/repos/ownership'
import { getRules } from '@main/db/repos/rules'
import { listRoster, listTeams } from '@main/db/repos/teams'
import { scoringFormat, type Rules } from '@shared/rules'
import type { StatsOwnership } from '@shared/stats/types'

/**
 * The imported league, read only (Ask spec §1 "Reach"): rosters, who rosters whom and the league's
 * scoring. The `league` tool and the `rostered` filter read it; nothing writes.
 */
export interface LeagueTeam {
  rosterId: number
  name: string
  mine: boolean
}

export interface LeagueRosterEntry {
  name: string
  position: string | null
  /** The NFL team, as Sleeper lists it. */
  team: string | null
  slot: string
  /** Its gsis id, when the stats know the player. */
  gsis: string | null
}

export interface LeagueReader {
  teams(): LeagueTeam[]
  roster(rosterId: number): LeagueRosterEntry[]
  ownership(): StatsOwnership
  rules(): Rules | null
}

export function companionLeague(db: Db, leagueId: string): LeagueReader {
  return {
    teams: () =>
      listTeams(db, leagueId).map((t) => ({
        rosterId: t.rosterId,
        name: t.teamName ?? t.displayName,
        mine: t.isMe
      })),
    roster: (rosterId) =>
      listRoster(db, leagueId, rosterId).map((p) => ({
        name: p.fullName,
        position: p.position,
        team: p.team,
        slot: p.slot,
        gsis: playerLink(db, { sleeper: p.playerId })?.gsis ?? null
      })),
    ownership: () => leagueOwnership(db, leagueId),
    rules: () => getRules(db, leagueId)
  }
}

/** The league's scoring in a few lines a model can quote. */
export function scoringSummary(rules: Rules): string[] {
  const s = rules.scoring as Record<string, number | undefined>
  const per = (key: string, unit: number): string | null =>
    s[key] ? `${Math.round(s[key]! * unit * 100) / 100} per ${unit} ` : null
  const lines = [
    `Format: ${scoringFormat(rules)} (${s.rec ?? 0} per reception)`,
    `Passing: ${per('pass_yd', 25) ?? '0 '}yards, ${s.pass_td ?? 0} per TD, ${s.pass_int ?? 0} per interception`,
    `Rushing: ${per('rush_yd', 10) ?? '0 '}yards, ${s.rush_td ?? 0} per TD`,
    `Receiving: ${per('rec_yd', 10) ?? '0 '}yards, ${s.rec_td ?? 0} per TD`,
    `Fumbles lost: ${s.fum_lost ?? 0}`
  ]
  for (const [position, over] of Object.entries(rules.positionOverrides)) {
    const rec = (over as Record<string, number> | undefined)?.rec
    if (rec !== undefined) lines.push(`${position} premium: ${rec} per reception`)
  }
  return lines
}
```

Create `src/main/analyst/schema.ts`:

```ts
/**
 * A small JSON Schema checker for tool arguments (Ask spec §3.3): the subset the analyst tools use —
 * type, enum, required, properties, additionalProperties, items, minItems, maxItems, maxLength,
 * pattern. It answers the first problem in words a model can act on, or null when the value fits.
 */
export type Schema = {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean'
  enum?: readonly (string | number | boolean)[]
  properties?: Record<string, Schema>
  required?: readonly string[]
  additionalProperties?: boolean
  items?: Schema
  minItems?: number
  maxItems?: number
  maxLength?: number
  pattern?: string
  description?: string
}

const show = (v: unknown): string => JSON.stringify(v)

export function check(schema: Schema, value: unknown, path = 'arguments'): string | null {
  if (schema.enum) {
    if (!schema.enum.includes(value as never)) {
      const list =
        schema.enum.length <= 12 ? schema.enum.map(show).join(', ') : `${schema.enum.length} values`
      return `${path} must be one of ${list}, not ${show(value)}`
    }
    return null
  }
  switch (schema.type) {
    case 'object': {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return `${path} must be an object`
      }
      const obj = value as Record<string, unknown>
      for (const key of schema.required ?? []) {
        if (obj[key] === undefined) return `${path}.${key} is required`
      }
      for (const [key, v] of Object.entries(obj)) {
        const sub = schema.properties?.[key]
        if (!sub) {
          if (schema.additionalProperties === false) {
            const known = Object.keys(schema.properties ?? {}).join(', ')
            return `${path}.${key} is not an argument; the arguments are ${known}`
          }
          continue
        }
        if (v === undefined || v === null) continue
        const err = check(sub, v, `${path}.${key}`)
        if (err) return err
      }
      return null
    }
    case 'array': {
      if (!Array.isArray(value)) return `${path} must be a list`
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        return `${path} needs at least ${schema.minItems} item(s)`
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        return `${path} takes at most ${schema.maxItems} item(s)`
      }
      for (let i = 0; i < value.length; i++) {
        const err = schema.items ? check(schema.items, value[i], `${path}[${i}]`) : null
        if (err) return err
      }
      return null
    }
    case 'string':
      if (typeof value !== 'string') return `${path} must be text`
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        return `${path} is longer than ${schema.maxLength} characters`
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        return `${path} is not valid (${show(value)})`
      }
      return null
    case 'integer':
      return Number.isInteger(value) ? null : `${path} must be a whole number`
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? null : `${path} must be a number`
    case 'boolean':
      return typeof value === 'boolean' ? null : `${path} must be true or false`
    default:
      return null
  }
}
```

Create `src/main/analyst/splits.ts`:

```ts
import type { SplitStat } from '@shared/ask'
import type { MetricInfo, StatsRow } from '@shared/stats/types'

/**
 * A split compared with its base (Ask spec §3.3, report D5). For a rate with a stability estimate,
 * the noise in a split of `n` against its base of `N` (the split is part of the base) is
 *
 *   SE(diff) = sqrt(σ²_u · (1/n − 1/N)),  σ²_u = k · σ²_t,  σ²_t = σ²_obs / (1 + k / n̄)
 *
 * where `k` is the metric's prior (the sample at which half of it is signal, from odd and even
 * weeks), σ²_obs the variance of the qualified rows it is ranked among and n̄ their mean sample. The
 * interval is diff ± 1.96 · SE; inside it, the split is within noise. Counts and metrics without a
 * stability estimate get no interval.
 */
export interface Spread {
  /** Variance of the qualified rows' raw values. */
  variance: number
  /** Their mean sample. */
  meanSample: number
}

export function spreadOf(rows: StatsRow[], metric: string): Spread | null {
  const xs = rows
    .map((r) => r.values[metric])
    .filter((v) => v && v.qualified && v.raw !== null && v.sample !== null)
  if (xs.length < 5) return null
  const mean = xs.reduce((s, v) => s + v.raw!, 0) / xs.length
  const variance = xs.reduce((s, v) => s + (v.raw! - mean) ** 2, 0) / (xs.length - 1)
  const meanSample = xs.reduce((s, v) => s + v.sample!, 0) / xs.length
  return variance > 0 && meanSample > 0 ? { variance, meanSample } : null
}

export function splitStat(
  info: Pick<MetricInfo, 'kind' | 'stability'>,
  split: StatsRow['values'][string] | undefined,
  base: StatsRow['values'][string] | undefined,
  spread: Spread | null
): SplitStat {
  const diff =
    split?.raw !== null && split?.raw !== undefined && base?.raw !== null && base?.raw !== undefined
      ? split.raw - base.raw
      : null
  const k = info.stability?.prior ?? null
  const n = split?.sample ?? null
  const total = base?.sample ?? null
  if (diff === null || info.kind !== 'rate' || k === null || k <= 0 || !spread || !n || !total) {
    return { diff, interval: null, withinNoise: null }
  }
  const trueVariance = spread.variance / (1 + k / spread.meanSample)
  const unitVariance = k * trueVariance
  const share = Math.max(0, 1 / n - 1 / total)
  const se = Math.sqrt(unitVariance * share)
  if (!Number.isFinite(se) || se === 0) return { diff, interval: null, withinNoise: null }
  const half = 1.96 * se
  return { diff, interval: [diff - half, diff + half], withinNoise: Math.abs(diff) < half }
}
```

Create `src/main/analyst/tools.ts`:

```ts
import type {
  ChartKind,
  ResultCard,
  SplitStat,
  StatsCard,
  ToolError,
  ToolName,
  ToolOutcome,
  ToolResult
} from '@shared/ask'
import { METRIC_ALIASES } from '@shared/stats/aliases'
import { CATALOGUE, METRICS } from '@shared/stats/catalogue'
import { DIMENSION_BY_ID } from '@shared/stats/dimensions'
import { STATS_TEAMS, TEAM_NAMES } from '@shared/stats/nflTeams'
import {
  POSITION_GROUPS,
  type GroupBy,
  type MetricInfo,
  type StatsQuery,
  type StatsResult,
  type StatsRow
} from '@shared/stats/types'
import type { StatsClient } from '../stats/client'
import { fmt } from './format'
import { type LeagueReader, scoringSummary } from './league'
import { lexicalRetriever } from './metrics'
import { playerIndex, type PlayerIndex } from './players'
import { check, type Schema } from './schema'
import { splitStat, spreadOf } from './splits'
import { findTeams } from './teams'
import type { Now } from './time'

/**
 * The analyst tools (Ask spec §3): few, each the shape of a question, with flat arguments and
 * defaults filled by the app. Each builds `StatsQuery`s for the engine (never SQL), reads the rows,
 * and returns compact text for the model and cards for the screen. An invalid call returns why and
 * how to fix it.
 */
export type AnalystStats = Pick<
  StatsClient,
  'query' | 'catalogue' | 'status' | 'games' | 'outlook' | 'player' | 'people'
>

export interface TurnContext {
  now: Now
  /** The seasons the warehouse holds, oldest first. */
  seasons: number[]
  catalogue: ReadonlyMap<string, MetricInfo>
  people: PlayerIndex
  league: LeagueReader | null
  /** Splits shown in this turn (Ask spec §3.3: the split counter). */
  splits: number
}

export interface ToolDef {
  name: ToolName
  description: string
  schema: Schema
}

export interface AnalystDeps {
  stats: AnalystStats
  /** The imported league, or null without one. */
  league: () => LeagueReader | null
  /** Exact results kept (Ask spec §5.3). */
  cacheSize?: number
}

export interface Analyst {
  /** What a turn needs, read once: now, the catalogue, the player index, the league. */
  turn(): Promise<TurnContext>
  definitions(turn: TurnContext): ToolDef[]
  run(name: string, args: unknown, turn: TurnContext): Promise<ToolOutcome>
}

// ---------------------------------------------------------------------------------------------
// Schemas (the full profile; the compact profile is built from the resolver's output, compact.ts)

const GSIS = '^00-[0-9]{7}$'
const TEAM = { type: 'string', enum: STATS_TEAMS } as const satisfies Schema
const upTo = (n: number): Schema => ({ enum: Array.from({ length: n }, (_, i) => i + 1) })
const SHOWN = CATALOGUE.filter((m) => m.tier !== 'stored').map((m) => m.id)
const METRIC: Schema = { type: 'string', enum: SHOWN }
const METRIC_LIST = (max: number): Schema => ({
  type: 'array',
  items: METRIC,
  minItems: 1,
  maxItems: max
})
const BY: GroupBy[] = [
  'week',
  'season',
  'opponent',
  'team',
  'down',
  'quarter',
  'personnel',
  'coverage',
  'formation'
]
const DETAIL: Schema = {
  enum: ['concise', 'full'],
  description: 'concise (default): up to 15 rows and 6 columns; full: everything.'
}
const CHART: Schema = {
  enum: ['table', 'bar', 'line', 'scatter'],
  description: 'A hint; the app decides.'
}

function timeProps(seasons: number[]): Record<string, Schema> {
  return {
    seasons: {
      type: 'array',
      items: { enum: seasons },
      minItems: 1,
      maxItems: 8,
      description: 'Default: the current season.'
    },
    weeks: {
      type: 'array',
      items: upTo(22),
      minItems: 2,
      maxItems: 2,
      description: 'First and last week, inclusive.'
    },
    last_games: { type: 'integer', description: 'Each row’s last N games.' },
    season_type: { enum: ['REG', 'POST', 'ALL'], description: 'Default REG.' }
  }
}

const SITUATION: Record<string, Schema> = {
  down: { type: 'array', items: upTo(4), minItems: 1, maxItems: 4 },
  third_down: { type: 'boolean' },
  red_zone: { type: 'boolean', description: 'Inside the opponent’s 20.' },
  inside_10: { type: 'boolean' },
  goal_line: { type: 'boolean', description: 'Inside the opponent’s 5.' },
  pressure: { type: 'boolean', description: 'QB pressured (through the prior season).' },
  blitz: { type: 'boolean', description: 'Defense blitzed (2022+).' },
  play_action: { type: 'boolean', description: '2022+.' },
  coverage: { enum: ['man', 'zone'], description: 'Through the prior season.' },
  neutral: { type: 'boolean', description: 'Win probability 20–80 %, not the last two minutes.' },
  two_minute: { type: 'boolean' },
  personnel: { type: 'array', items: { type: 'string', pattern: '^[0-9]{2}$' }, maxItems: 4 },
  with_player: { type: 'array', items: { type: 'string', pattern: GSIS }, maxItems: 3 },
  without_player: { type: 'array', items: { type: 'string', pattern: GSIS }, maxItems: 3 },
  home: { type: 'boolean', description: 'true: home games; false: road games.' },
  opponent: TEAM
}

const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false
})

export function toolDefinitions(seasons: number[]): ToolDef[] {
  const time = timeProps(seasons)
  const view = { detail: DETAIL, chart: CHART }
  return [
    {
      name: 'find',
      description:
        'Ids for names: players, teams or metrics ("Bijan", "Niners", "yards per route").',
      schema: object(
        { text: { type: 'string', maxLength: 100 }, kind: { enum: ['player', 'team', 'metric'] } },
        ['text']
      )
    },
    {
      name: 'leaderboard',
      description:
        'Rankings: who leads in a metric. Qualified rows only; ranks and percentiles among the same position.',
      schema: object(
        {
          metric: METRIC,
          also: { type: 'array', items: METRIC, maxItems: 5, description: 'More metrics to show.' },
          position: { enum: [...POSITION_GROUPS] },
          ...time,
          team: TEAM,
          rostered: {
            enum: ['any', 'mine', 'free'],
            description: 'With a league: my players, or free agents only.'
          },
          ...SITUATION,
          order: { enum: ['best', 'worst'] },
          per_game: { type: 'boolean', description: 'Counts per game.' },
          limit: { type: 'integer', description: '1–50, default 10.' },
          ...view
        },
        ['metric']
      )
    },
    {
      name: 'player_stats',
      description: 'A player’s line, game log (by: week) or splits, with his rank at his position.',
      schema: object(
        {
          player: { type: 'string', pattern: GSIS },
          metrics: METRIC_LIST(6),
          ...time,
          by: { enum: BY },
          ...SITUATION,
          ...view
        },
        ['player']
      )
    },
    {
      name: 'team_stats',
      description: 'A team’s line, by week or split, with its rank among the 32.',
      schema: object(
        {
          team: TEAM,
          side: { enum: ['offense', 'defense'] },
          metrics: METRIC_LIST(6),
          ...time,
          by: { enum: BY.filter((b) => b !== 'team') },
          ...SITUATION,
          ...view
        },
        ['team']
      )
    },
    {
      name: 'compare',
      description: '2–4 players or 2–4 teams side by side.',
      schema: object(
        {
          ids: {
            type: 'array',
            items: { type: 'string', pattern: `${GSIS}|^[A-Z]{2,3}$` },
            minItems: 2,
            maxItems: 4
          },
          metrics: METRIC_LIST(6),
          ...time,
          ...view
        },
        ['ids']
      )
    },
    {
      name: 'trend',
      description: 'A metric across seasons for one player or team.',
      schema: object(
        {
          id: { type: 'string', pattern: `${GSIS}|^[A-Z]{2,3}$` },
          metric: METRIC,
          from: { enum: seasons },
          to: { enum: seasons },
          ...view
        },
        ['id', 'metric']
      )
    },
    {
      name: 'outlook',
      description:
        'A player’s forecast signals: ceiling, floor, boom and bust, role trend, regression.',
      schema: object({ player: { type: 'string', pattern: GSIS }, season: { enum: seasons } }, [
        'player'
      ])
    },
    {
      name: 'games',
      description:
        'Schedule and results with Elo and the betting market; a team’s games or a week’s.',
      schema: object({ season: { enum: seasons }, week: upTo(22), team: TEAM })
    },
    {
      name: 'league',
      description:
        'The imported league, read only: my roster, a team’s roster, who rosters a player, the scoring.',
      schema: object(
        {
          what: { enum: ['my_roster', 'roster', 'owner_of', 'scoring'] },
          team: { type: 'string', maxLength: 60, description: 'A fantasy team’s name (roster).' },
          player: { type: 'string', pattern: GSIS }
        },
        ['what']
      )
    },
    {
      name: 'describe',
      description:
        'What a metric (or a filter such as "pressure") means: its sample, seasons and stability.',
      schema: object({ metric: { type: 'string', maxLength: 60 } }, ['metric'])
    },
    {
      name: 'query',
      description: 'Anything StatsQuery can express (the engine validates it).',
      schema: object({ query: { type: 'object' } }, ['query'])
    }
  ]
}

// ---------------------------------------------------------------------------------------------
// Arguments → StatsQuery

type Args = Record<string, unknown>

class ToolFailure extends Error {}
const fail = (message: string): never => {
  throw new ToolFailure(message)
}

const PLAY_DIMS: GroupBy[] = ['down', 'quarter', 'personnel', 'coverage', 'formation']

function situationOf(a: Args): {
  situation: NonNullable<StatsQuery['situation']>
  scope: Partial<StatsQuery['scope']>
} {
  const s: NonNullable<StatsQuery['situation']> = {}
  const scope: Partial<StatsQuery['scope']> = {}
  const downs = new Set<number>((a.down as number[] | undefined) ?? [])
  if (a.third_down) downs.add(3)
  if (downs.size > 0) s.down = [...downs].sort()
  if (a.red_zone) s.fieldZone = 'redzone'
  if (a.inside_10) s.fieldZone = 'inside10'
  if (a.goal_line) s.fieldZone = 'inside5'
  for (const [arg, key] of [
    ['pressure', 'pressure'],
    ['blitz', 'blitz'],
    ['play_action', 'playAction'],
    ['neutral', 'neutral'],
    ['two_minute', 'twoMinute']
  ] as const) {
    if (typeof a[arg] === 'boolean') s[key] = a[arg] as boolean
  }
  if (a.coverage) s.coverage = a.coverage as 'man' | 'zone'
  if (a.personnel) s.personnel = a.personnel as string[]
  if (a.with_player) s.withOnField = a.with_player as string[]
  if (a.without_player) s.withoutOnField = a.without_player as string[]
  if (typeof a.home === 'boolean') scope.home = a.home
  if (a.opponent) scope.opponents = [a.opponent as string]
  return { situation: s, scope }
}

function scopeOf(a: Args, turn: TurnContext): StatsQuery['scope'] {
  return {
    seasons: (a.seasons as number[] | undefined) ?? [turn.now.season],
    ...(a.weeks ? { weeks: a.weeks as [number, number] } : {}),
    ...(a.last_games ? { lastNGames: Math.max(1, a.last_games as number) } : {}),
    ...(a.season_type && a.season_type !== 'REG'
      ? { seasonType: a.season_type as 'POST' | 'ALL' }
      : {})
  }
}

/** A player's default line: what his position is read by. */
const DEFAULT_PLAYER: Record<string, string[]> = {
  QB: ['pass_yds', 'pass_td', 'pass_int', 'qb_epa_db', 'cpoe', 'rush_yds', 'fantasy_ppg'],
  RB: ['carries', 'rush_yds', 'rush_ypc', 'targets', 'rec_yds', 'fantasy_ppg'],
  WR: ['targets', 'receptions', 'rec_yds', 'yprr', 'target_share', 'fantasy_ppg'],
  TE: ['targets', 'receptions', 'rec_yds', 'yprr', 'target_share', 'fantasy_ppg'],
  K: ['fg_made', 'fg_att', 'fg_pct', 'fg_pct_50p'],
  P: ['punts', 'punt_net_avg', 'punt_in20_rate'],
  DL: ['tackles', 'sacks', 'pressures', 'qb_hits', 'tfl'],
  LB: ['tackles', 'sacks', 'pressures', 'tfl', 'coverage_rating'],
  DB: ['tackles', 'coverage_targets', 'coverage_rating', 'def_ints', 'pass_defended'],
  OL: ['off_snaps', 'snap_share']
}
const DEFAULT_TEAM: Record<'offense' | 'defense', string[]> = {
  offense: [
    'off_epa_play',
    'off_success_rate',
    'points_per_drive',
    'off_pass_epa',
    'off_rush_epa',
    'proe'
  ],
  defense: [
    'def_epa_play',
    'def_success_rate',
    'def_points_per_drive',
    'def_pass_epa',
    'def_rush_epa',
    'def_pressure_rate'
  ]
}

function defaultsFor(ids: string[], turn: TurnContext, plays: boolean): string[] {
  return ids.filter((id) => {
    const info = turn.catalogue.get(id)
    return info !== undefined && (!plays || info.grains.includes('play'))
  })
}

function metricOf(id: string): NonNullable<ReturnType<typeof METRICS.get>> {
  return METRICS.get(id) ?? fail(`unknown metric "${id}"`)
}

function checkPosition(metric: string, position: string | undefined): void {
  const m = metricOf(metric)
  if (!position || m.positions === 'all' || m.positions.includes(position as never)) return
  const fits = m.positions.join(', ')
  fail(
    `${metric} applies to ${fits}, not ${position}; did you mean position: ${m.positions[m.positions.length > 1 ? 1 : 0]}?`
  )
}

// ---------------------------------------------------------------------------------------------
// Text for the model

const ROWS = { concise: 15, full: 50 }
const COLUMNS = { concise: 4, full: 12 }

function seasonsText(scope: StatsQuery['scope']): string {
  const s = [...scope.seasons].sort()
  const years =
    s.length > 2 && s[s.length - 1] - s[0] === s.length - 1
      ? `${s[0]}–${s[s.length - 1]}`
      : s.join(', ')
  const weeks = scope.weeks ? ` weeks ${scope.weeks[0]}–${scope.weeks[1]}` : ''
  const last = scope.lastNGames ? `, last ${scope.lastNGames} games` : ''
  const type =
    scope.seasonType === 'POST'
      ? ' postseason'
      : scope.seasonType === 'ALL'
        ? ' incl. postseason'
        : ''
  return `${years}${type}${weeks}${last}`
}

function situationText(q: StatsQuery): string {
  const s = q.situation ?? {}
  const parts: string[] = []
  if (s.down) parts.push(`down ${s.down.join('/')}`)
  if (s.fieldZone) {
    parts.push(
      { redzone: 'red zone', inside10: 'inside the 10', inside5: 'goal line', own20: 'own 20' }[
        s.fieldZone
      ]
    )
  }
  if (s.pressure !== undefined) parts.push(s.pressure ? 'under pressure' : 'not pressured')
  if (s.blitz !== undefined) parts.push(s.blitz ? 'vs the blitz' : 'no blitz')
  if (s.playAction !== undefined) parts.push(s.playAction ? 'play-action' : 'no play-action')
  if (s.coverage) parts.push(`vs ${Array.isArray(s.coverage) ? s.coverage.join('/') : s.coverage}`)
  if (s.neutral) parts.push('neutral situations')
  if (s.twoMinute) parts.push('two-minute')
  if (s.personnel) parts.push(`${s.personnel.join('/')} personnel`)
  if (q.scope.home !== undefined) parts.push(q.scope.home ? 'home' : 'road')
  if (q.scope.opponents) parts.push(`vs ${q.scope.opponents.join('/')}`)
  if (s.withOnField) parts.push(`with ${s.withOnField.join(', ')} on the field`)
  if (s.withoutOnField) parts.push(`without ${s.withoutOnField.join(', ')}`)
  return parts.length > 0 ? `, ${parts.join(', ')}` : ''
}

const ordinal = (n: number): string => {
  const r = Math.round(n)
  const suffix =
    r % 100 >= 11 && r % 100 <= 13
      ? 'th'
      : (({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[r % 10] ?? 'th')
  return `${r}${suffix}`
}

function who(row: StatsRow, player: boolean): string {
  if (!player) return `${TEAM_NAMES[row.id] ?? row.name} (${row.id})`
  return `${row.name} (${row.id}${row.position ? `, ${row.position}` : ''}${row.team ? `, ${row.team}` : ''})`
}

function valueText(
  row: StatsRow,
  id: string,
  turn: TurnContext,
  opts: { sample?: boolean; percentile?: boolean } = {}
): string {
  const info = turn.catalogue.get(id)
  const v = row.values[id]
  if (!info || !v) return ''
  let text = `${info.short} ${fmt(v.value, info.unit, info.decimals)}${v.estimated ? ' (est.)' : ''}`
  if (opts.sample && info.kind === 'rate' && v.sample !== null) {
    text += ` on ${Math.round(v.sample)} ${info.sampleLabel}${v.qualified ? '' : ' (not qualified)'}`
  }
  if (opts.percentile && v.percentile !== null) text += `, ${ordinal(v.percentile)} pct`
  return text
}

function groupText(row: StatsRow, by: GroupBy): string {
  const g = row.group[by]
  if (by === 'week') return `Week ${g}`
  if (by === 'season') return `${g}`
  if (by === 'opponent') return `vs ${g}`
  if (by === 'down') return `Down ${g}`
  if (by === 'quarter') return g === 5 ? 'OT' : `Q${g}`
  if (by === 'coverage') return `vs ${g ?? 'unknown'}`
  return `${by} ${g ?? 'unknown'}`
}

// ---------------------------------------------------------------------------------------------
// Cards

function chartOf(
  hint: unknown,
  shape: { by?: GroupBy; metrics: number; rows: number; ranked: boolean }
): ChartKind {
  const time = shape.by === 'week' || shape.by === 'season'
  const natural: ChartKind = time ? 'line' : shape.ranked && shape.metrics === 1 ? 'bar' : 'table'
  if (hint === 'table') return 'table'
  if (hint === 'line' && time) return 'line'
  if (hint === 'bar' && shape.metrics >= 1 && !time) return 'bar'
  if (hint === 'scatter' && shape.metrics >= 2 && shape.rows >= 5) return 'scatter'
  return natural
}

function statsCard(
  title: string,
  result: StatsResult,
  chart: ChartKind,
  base: StatsRow | null = null,
  splits: Record<string, Record<string, SplitStat>> | null = null
): StatsCard {
  return { kind: 'stats', title, result, base, splits, chart }
}

// ---------------------------------------------------------------------------------------------
// The analyst

export function createAnalyst(deps: AnalystDeps): Analyst {
  const cacheSize = deps.cacheSize ?? 64
  const cache = new Map<string, StatsResult>()
  let stamp = ''
  let catalogue: ReadonlyMap<string, MetricInfo> = new Map()
  let people: PlayerIndex = playerIndex([])
  const retriever = lexicalRetriever()

  async function turn(): Promise<TurnContext> {
    const status = await deps.stats.status()
    if (!status.through)
      throw new Error('the stats are still being built; try again in a few minutes')
    const now: Now = {
      season: status.through.season,
      week: status.through.week,
      seasonType: status.through.seasonType
    }
    const next = `${status.through.season}|${status.through.seasonType}|${status.through.week}|${status.updatedAt}`
    if (next !== stamp) {
      const [info, all] = await Promise.all([deps.stats.catalogue(), deps.stats.people()])
      catalogue = new Map(info.map((m) => [m.id, m]))
      people = playerIndex(all)
      cache.clear()
      stamp = next
    }
    const seasons = Array.from({ length: now.season - 2019 + 1 }, (_, i) => 2019 + i)
    return { now, seasons, catalogue, people, league: deps.league(), splits: 0 }
  }

  /** Ask spec §5.3: an exact cache keyed on the query; cleared when the warehouse changes. */
  async function query(q: StatsQuery, used: { hits: number; total: number }): Promise<StatsResult> {
    const key = JSON.stringify(q)
    used.total++
    const hit = cache.get(key)
    if (hit) {
      used.hits++
      cache.delete(key)
      cache.set(key, hit)
      return hit
    }
    const result = await deps.stats.query(q)
    if (cache.size >= cacheSize) cache.delete(cache.keys().next().value!)
    cache.set(key, result)
    return result
  }

  /** "Errors teach": the problem, then what the arguments probably meant. */
  function teach(message: string, args: unknown, turn: TurnContext): string {
    const hints: string[] = []
    const a = (args ?? {}) as Args
    const values = (key: string): string[] =>
      ([] as unknown[]).concat(a[key] ?? []).filter((v): v is string => typeof v === 'string')
    for (const key of ['metric', 'metrics', 'also']) {
      for (const v of values(key)) {
        if (METRICS.has(v)) continue
        const near = retriever
          .rank(v.replace(/_/g, ' '), 3)
          .map((c) => `${c.id} (${METRICS.get(c.id)!.label})`)
        if (near.length > 0)
          hints.push(`"${v}" is not a metric id; did you mean ${near.join(', ')}?`)
      }
    }
    for (const key of ['player', 'ids', 'with_player', 'without_player', 'id']) {
      for (const v of values(key)) {
        if (/^00-[0-9]{7}$/.test(v) || /^[A-Z]{2,3}$/.test(v)) continue
        const found = turn.people.find(v)
        for (const f of found) {
          const list = f.people.map(
            (p) => `${p.id} ${p.name} (${[p.position, p.team].filter(Boolean).join(', ')})`
          )
          hints.push(`"${f.mention}" matched ${list.join('; ')}`)
        }
        for (const t of findTeams(v)) hints.push(`"${t.mention}" is the team ${t.code}`)
      }
    }
    for (const key of ['team', 'opponent']) {
      for (const v of values(key)) {
        if (STATS_TEAMS.includes(v)) continue
        for (const t of findTeams(v)) hints.push(`"${v}" is the team ${t.code}`)
      }
    }
    return hints.length > 0 ? `${message}. ${hints.join('. ')}.` : message
  }

  async function run(name: string, args: unknown, turn: TurnContext): Promise<ToolOutcome> {
    const started = Date.now()
    const def = toolDefinitions(turn.seasons).find((d) => d.name === name)
    const error = (message: string): ToolError => ({
      ok: false,
      tool: name,
      error: message,
      ms: Date.now() - started
    })
    if (!def)
      return error(
        `there is no tool "${name}"; the tools are ${toolDefinitions(turn.seasons)
          .map((d) => d.name)
          .join(', ')}`
      )
    const problem = check(def.schema, args)
    if (problem) return error(teach(problem, args, turn))
    const used = { hits: 0, total: 0 }
    try {
      const result = await HANDLERS[def.name](args as Args, turn, {
        query: (q) => query(q, used),
        deps
      })
      return {
        ...result,
        ms: Date.now() - started,
        cached: used.total > 0 && used.hits === used.total
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return error(teach(message, args, turn))
    }
  }

  return { turn, definitions: (t) => toolDefinitions(t.seasons), run }
}

// ---------------------------------------------------------------------------------------------
// Handlers

interface Io {
  query(q: StatsQuery): Promise<StatsResult>
  deps: AnalystDeps
}

type Done = Omit<ToolResult, 'ms' | 'cached'>
type Handler = (a: Args, turn: TurnContext, io: Io) => Promise<Done>

const done = (
  tool: ToolName,
  title: string,
  text: string[],
  cards: ResultCard[],
  notes: string[],
  queries: StatsQuery[]
): Done => ({
  ok: true,
  tool,
  title,
  text: [title, ...text, ...(notes.length > 0 ? [`Notes: ${notes.join(' ')}`] : [])].join('\n'),
  cards,
  notes,
  queries
})

const detailOf = (a: Args): 'concise' | 'full' => (a.detail === 'full' ? 'full' : 'concise')

/** Why a ranking is empty, and what to change (Ask spec §3.3). */
async function explainEmpty(q: StatsQuery, io: Io, turn: TurnContext): Promise<string> {
  const loose = await io.query({ ...q, scope: { ...q.scope, qualifiedOnly: false }, limit: 3 })
  const metric = turn.catalogue.get(q.metrics[0])
  if (loose.rows.length === 0) {
    return `No rows: nothing in this scope has ${metric?.label ?? q.metrics[0]}. Try another season, fewer filters or another position.`
  }
  const best = loose.rows[0]
  const v = best.values[q.metrics[0]]
  return `No qualified rows: ${loose.total} below the minimum sample${metric?.minSample ? ` (${metric.minSample} ${metric.sampleLabel} over 17 games, scaled to the weeks in scope)` : ''}. The best unqualified: ${best.name} on ${Math.round(v?.sample ?? 0)} ${metric?.sampleLabel ?? ''}. Ask for more weeks, or without qualification.`
}

const leaderboard: Handler = async (a, turn, io) => {
  const id = a.metric as string
  const m = metricOf(id)
  const position = a.position as string | undefined
  if (m.entity === 'team' && position) fail(`${id} is a team metric; leave out position`)
  checkPosition(id, position)
  const also = ((a.also as string[] | undefined) ?? []).filter((x) => x !== id)
  for (const x of also) {
    if (metricOf(x).entity !== m.entity)
      fail(`${x} is a ${metricOf(x).entity} metric and ${id} a ${m.entity} one; list one kind`)
  }
  const { situation, scope: extra } = situationOf(a)
  const limit = Math.min(50, Math.max(1, (a.limit as number | undefined) ?? 10))
  const rostered = (a.rostered as string | undefined) ?? 'any'
  const owned =
    rostered !== 'any'
      ? (turn.league?.ownership() ?? fail('no league is imported, so rostered cannot be used'))
      : null
  const mine = owned
    ? Object.entries(m.entity === 'player' ? owned.players : owned.teams)
        .filter(([, o]) => o.mine)
        .map(([k]) => k)
    : []
  const worst = a.order === 'worst'
  const best = m.direction === 'lower' ? 'asc' : 'desc'
  const q: StatsQuery = {
    entity: m.entity,
    metrics: [id, ...also],
    scope: {
      ...scopeOf(a, turn),
      ...extra,
      ...(position ? { positions: [position as never] } : {}),
      ...(a.team ? { teams: [a.team as string] } : {}),
      ...(rostered === 'mine'
        ? {
            [m.entity === 'player' ? 'players' : 'teams']:
              mine.length > 0 ? mine : fail('your roster has no player the stats know')
          }
        : {}),
      qualifiedOnly: true
    },
    ...(Object.keys(situation).length > 0 ? { situation } : {}),
    ...(worst ? { sort: { metric: id, dir: best === 'asc' ? 'desc' : 'asc' } } : {}),
    ...(a.per_game ? { transform: 'perGame' as const } : {}),
    limit: rostered === 'free' ? 300 : limit
  }
  let result = await io.query(q)
  if (rostered === 'free' && owned) {
    const taken = m.entity === 'player' ? owned.players : owned.teams
    const rows = result.rows.filter((r) => !taken[r.id]).slice(0, limit)
    result = { ...result, rows, total: rows.length }
  }
  const info = turn.catalogue.get(id)
  const title = `${info?.label ?? id} (${id})${position ? `, ${position}` : ''}, ${seasonsText(q.scope)}${situationText(q)}${rostered === 'free' ? ', free agents' : rostered === 'mine' ? ', my team' : ''}: ${worst ? 'worst' : 'best'} first, qualified only.`
  const notes = [...result.notes]
  if (result.rows.length === 0) notes.push(await explainEmpty(q, io, turn))
  const detail = detailOf(a)
  const player = m.entity === 'player'
  const lines = result.rows.slice(0, ROWS[detail]).map((r) => {
    const v = r.values[id]
    const rest = also
      .slice(0, COLUMNS[detail] - 1)
      .map((x) => valueText(r, x, turn))
      .filter(Boolean)
    return `${v?.rank ?? '–'}. ${who(r, player)} — ${[valueText(r, id, turn, { sample: true, percentile: true }), ...rest].join(' · ')}`
  })
  const card = statsCard(
    title,
    result,
    chartOf(a.chart, { metrics: 1 + also.length, rows: result.rows.length, ranked: true })
  )
  return done('leaderboard', title, lines, [card], notes, [q])
}

/** The league query a player's or team's line is read from: his rank among his position (or the 32). */
function leagueQuery(base: StatsQuery, position: string | null): StatsQuery {
  const scope = { ...base.scope }
  delete scope.players
  delete scope.teams
  return {
    ...base,
    groupBy: undefined,
    scope: {
      ...scope,
      ...(position ? { positions: [position as never] } : {}),
      qualifiedOnly: false
    },
    limit: 5000
  }
}

async function lineAndSplits(
  tool: 'player_stats' | 'team_stats',
  a: Args,
  turn: TurnContext,
  io: Io,
  subject: { id: string; label: string; position: string | null; entity: 'player' | 'team' },
  metrics: string[]
): Promise<Done> {
  const { situation, scope: extra } = situationOf(a)
  const by = a.by as GroupBy | undefined
  const q: StatsQuery = {
    entity: subject.entity,
    metrics,
    scope: {
      ...scopeOf(a, turn),
      ...extra,
      [subject.entity === 'player' ? 'players' : 'teams']: [subject.id],
      qualifiedOnly: false
    },
    ...(Object.keys(situation).length > 0 ? { situation } : {}),
    ...(by ? { groupBy: [by] } : {}),
    limit: 200
  }
  const league = leagueQuery(q, subject.entity === 'player' ? subject.position : null)
  const [leagueResult, splitResult] = await Promise.all([
    io.query(league),
    by ? io.query(q) : Promise.resolve(null)
  ])
  const own = leagueResult.rows.find((r) => r.id === subject.id) ?? null
  const detail = detailOf(a)
  const shown = metrics.slice(0, COLUMNS[detail] + 2)
  const title = `${subject.label}, ${seasonsText(q.scope)}${situationText(q)}${by ? `, by ${by}` : ''}.`
  const notes = [...leagueResult.notes, ...(splitResult?.notes ?? [])].filter(
    (n, i, all) => all.indexOf(n) === i
  )
  const queries = by ? [q, league] : [league]
  if (!by) {
    const rows = own ? [own] : []
    if (!own)
      notes.push(
        'No rows: nothing in this scope for this player or team (no game, or the metric starts later).'
      )
    const result = { ...leagueResult, rows, total: rows.length }
    const among =
      subject.entity === 'player' ? `among ${subject.position ?? 'his position'}s` : 'among the 32'
    const lines = own
      ? [
          `${shown
            .map((x) => valueText(own, x, turn, { sample: true, percentile: true }))
            .filter(Boolean)
            .join(' · ')} (percentiles ${among}, qualified rows only)`
        ]
      : []
    const card = statsCard(
      title,
      result,
      chartOf(a.chart, { metrics: metrics.length, rows: 1, ranked: false })
    )
    return done(tool, title, lines, [card], notes, queries)
  }
  // Rows with no value for the split (a play participation did not chart) are left out, and time
  // and down splits read in order.
  const ordered = ['week', 'season', 'down', 'quarter'].includes(by)
  const splitRows = splitResult!.rows
    .filter((r) => r.group[by] !== null && r.group[by] !== undefined)
    .sort((x, y) => (ordered ? Number(x.group[by]) - Number(y.group[by]) : 0))
  const split = { ...splitResult!, rows: splitRows, total: splitRows.length }
  turn.splits++
  const stats: Record<string, Record<string, SplitStat>> = {}
  const spreads = new Map(metrics.map((x) => [x, spreadOf(leagueResult.rows, x)]))
  for (const row of split.rows) {
    const key = String(row.group[by])
    stats[key] = Object.fromEntries(
      metrics.map((x) => [
        x,
        splitStat(
          turn.catalogue.get(x) ?? { kind: 'count', stability: null },
          row.values[x],
          own?.values[x],
          spreads.get(x) ?? null
        )
      ])
    )
  }
  const lines: string[] = []
  if (own)
    lines.push(
      `All: ${shown
        .map((x) => valueText(own, x, turn, { sample: true }))
        .filter(Boolean)
        .join(' · ')}`
    )
  for (const row of split.rows.slice(0, by === 'week' || by === 'season' ? 25 : ROWS[detail])) {
    const key = String(row.group[by])
    const parts = shown.map((x) => {
      const t = valueText(row, x, turn, { sample: by !== 'week' })
      const s = stats[key][x]
      if (!t || s.diff === null || s.withinNoise === null || by === 'week' || by === 'season')
        return t
      const info = turn.catalogue.get(x)!
      const diff = `${s.diff >= 0 ? '+' : ''}${fmt(s.diff, info.unit, info.decimals).replace(/^\+/, '')}`
      return `${t} (${diff} vs all, ${s.withinNoise ? 'within noise' : 'beyond noise'})`
    })
    lines.push(`${groupText(row, by)}: ${parts.filter(Boolean).join(' · ')}`)
  }
  if (split.rows.length === 0)
    notes.push(
      'No rows: nothing in this split (the filter or split may need participation or FTN seasons).'
    )
  if (turn.splits >= 3) {
    notes.push(
      `This is split ${turn.splits} looked at in this answer; with many splits, one will look unusual by chance.`
    )
  }
  const card = statsCard(
    title,
    split,
    chartOf(a.chart, { by, metrics: metrics.length, rows: split.rows.length, ranked: false }),
    own,
    stats
  )
  return done(tool, title, lines, [card], notes, queries)
}

const playerStats: Handler = async (a, turn, io) => {
  const person =
    turn.people.byId(a.player as string) ??
    fail(`no player with id ${a.player as string}; call find with his name`)
  const plays =
    Object.keys(situationOf(a).situation).length > 0 || PLAY_DIMS.includes(a.by as GroupBy)
  const asked = a.metrics as string[] | undefined
  for (const x of asked ?? []) {
    if (metricOf(x).entity !== 'player') fail(`${x} is a team metric; use team_stats`)
    checkPosition(x, person.position ?? undefined)
  }
  const metrics =
    asked ?? defaultsFor(DEFAULT_PLAYER[person.position ?? ''] ?? DEFAULT_PLAYER.WR, turn, plays)
  if (metrics.length === 0)
    fail('none of this player’s default metrics can be split by situation; name the metrics')
  return lineAndSplits(
    'player_stats',
    a,
    turn,
    io,
    {
      id: person.id,
      label: `${person.name} (${person.id}, ${[person.position, person.team].filter(Boolean).join(', ')})`,
      position: person.position,
      entity: 'player'
    },
    metrics
  )
}

const teamStats: Handler = async (a, turn, io) => {
  const team = a.team as string
  const plays =
    Object.keys(situationOf(a).situation).length > 0 || PLAY_DIMS.includes(a.by as GroupBy)
  const asked = a.metrics as string[] | undefined
  for (const x of asked ?? []) {
    if (metricOf(x).entity !== 'team')
      fail(`${x} is a player metric; use player_stats or leaderboard with team: ${team}`)
  }
  const side = (a.side as 'offense' | 'defense' | undefined) ?? 'offense'
  const metrics = asked ?? defaultsFor(DEFAULT_TEAM[side], turn, plays)
  if (metrics.length === 0)
    fail('none of the default metrics can be split by situation; name the metrics')
  return lineAndSplits(
    'team_stats',
    a,
    turn,
    io,
    { id: team, label: `${TEAM_NAMES[team]} (${team})`, position: null, entity: 'team' },
    metrics
  )
}

const compare: Handler = async (a, turn, io) => {
  const ids = [...new Set(a.ids as string[])]
  const teams = ids.every((x) => STATS_TEAMS.includes(x))
  const players = ids.every((x) => /^00-[0-9]{7}$/.test(x))
  if (!teams && !players) fail('ids must be all player ids or all team codes')
  if (ids.length < 2) fail('compare needs 2–4 different ids')
  const people = players
    ? ids.map((x) => turn.people.byId(x) ?? fail(`no player with id ${x}; call find with his name`))
    : []
  const positions = [...new Set(people.map((p) => p.position).filter((p): p is string => !!p))]
  const metrics =
    (a.metrics as string[] | undefined) ??
    (players
      ? defaultsFor(DEFAULT_PLAYER[positions[0] ?? 'WR'] ?? DEFAULT_PLAYER.WR, turn, false)
      : DEFAULT_TEAM.offense)
  for (const x of metrics) {
    if (metricOf(x).entity !== (players ? 'player' : 'team'))
      fail(`${x} is a ${metricOf(x).entity} metric`)
  }
  const q: StatsQuery = {
    entity: players ? 'player' : 'team',
    metrics,
    scope: {
      ...scopeOf(a, turn),
      ...(positions.length > 0 ? { positions: positions as never[] } : {}),
      qualifiedOnly: false
    },
    limit: 5000
  }
  const all = await io.query(q)
  const rows = ids.map((x) => all.rows.find((r) => r.id === x)).filter((r): r is StatsRow => !!r)
  const result = { ...all, rows, total: rows.length }
  const title = `${players ? people.map((p) => p.name).join(' vs ') : ids.join(' vs ')}, ${seasonsText(q.scope)}.`
  const detail = detailOf(a)
  const lines = rows.map(
    (r) =>
      `${who(r, players)}: ${metrics
        .slice(0, COLUMNS[detail] + 2)
        .map((x) => valueText(r, x, turn, { sample: true, percentile: true }))
        .filter(Boolean)
        .join(' · ')}`
  )
  const notes = [...all.notes]
  const missing = ids.filter((x) => !rows.some((r) => r.id === x))
  if (missing.length > 0) notes.push(`No rows for ${missing.join(', ')} in this scope.`)
  if (players && positions.length > 1)
    notes.push('Percentiles are among each player’s own position.')
  const card = statsCard(
    title,
    result,
    chartOf(a.chart, { metrics: metrics.length, rows: rows.length, ranked: false })
  )
  return done('compare', title, lines, [card], notes, [q])
}

const trend: Handler = async (a, turn, io) => {
  const id = a.id as string
  const player = /^00-[0-9]{7}$/.test(id)
  const metric = a.metric as string
  if (metricOf(metric).entity !== (player ? 'player' : 'team'))
    fail(`${metric} is a ${metricOf(metric).entity} metric`)
  const person = player
    ? (turn.people.byId(id) ?? fail(`no player with id ${id}; call find with his name`))
    : null
  const from = (a.from as number | undefined) ?? Math.max(2019, person?.firstSeason ?? 2019)
  const to = (a.to as number | undefined) ?? turn.now.season
  if (to < from) fail('from must be before to')
  const seasons = Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const q: StatsQuery = {
    entity: player ? 'player' : 'team',
    metrics: [metric],
    scope: { seasons, [player ? 'players' : 'teams']: [id], qualifiedOnly: false },
    groupBy: ['season'],
    limit: 50
  }
  const result = await io.query(q)
  const info = turn.catalogue.get(metric)
  const title = `${person?.name ?? TEAM_NAMES[id] ?? id} (${id}): ${info?.label ?? metric} (${metric}) by season, ${from}–${to}.`
  const rows = [...result.rows].sort((x, y) => Number(x.group.season) - Number(y.group.season))
  const lines = rows.map(
    (r) => `${r.group.season}: ${valueText(r, metric, turn, { sample: true })}`
  )
  const notes = [...result.notes]
  if (rows.length === 0) notes.push('No rows: no season in this range has this metric for this id.')
  return done('trend', title, lines, [statsCard(title, { ...result, rows }, 'line')], notes, [q])
}

const outlook: Handler = async (a, turn, io) => {
  const person =
    turn.people.byId(a.player as string) ??
    fail(`no player with id ${a.player as string}; call find with his name`)
  const season = (a.season as number | undefined) ?? turn.now.season
  const o = await io.deps.stats.outlook({ player: person.id, season })
  const pts = (x: number | null): string => (x === null ? '—' : x.toFixed(1))
  const pct = (x: number | null): string => (x === null ? '—' : `${(x * 100).toFixed(0)}%`)
  const title = `${person.name} (${person.id}) outlook, ${season}, ${o.scoring.toUpperCase()} scoring, ${o.games} games.`
  const lines = [
    `Ceiling (80th pct week) ${pts(o.ceiling.season)} this season, ${pts(o.ceiling.last16)} over his last 16 games; floor (20th) ${pts(o.floor.season)} / ${pts(o.floor.last16)}.`,
    `Boom rate ${pct(o.boomRate)}, bust rate ${pct(o.bustRate)}.`,
    ...o.trend
      .filter((t) => t.change !== null)
      .map(
        (t) =>
          `Role: ${METRICS.get(t.metric)?.label ?? t.metric} ${t.change! >= 0 ? 'up' : 'down'} over his last 4 games${t.roleChange ? ' (beyond noise)' : ' (within noise)'}.`
      ),
    ...o.regression
      .filter((r) => r.signal)
      .map(
        (r) =>
          `Regression: ${METRICS.get(r.metric)?.label ?? r.metric} is running ${r.signal} (expected to move back toward the position mean).`
      ),
    o.schedule.easierBy !== null
      ? `Rest of season: ${o.schedule.opponents.length} games, opponents allow ${o.schedule.easierBy >= 0 ? '+' : ''}${o.schedule.easierBy.toFixed(1)} points per game to his position vs average.`
      : ''
  ].filter(Boolean)
  return done('outlook', title, lines, [{ kind: 'outlook', title, outlook: o }], [], [])
}

const games: Handler = async (a, turn, io) => {
  const season = (a.season as number | undefined) ?? turn.now.season
  const team = a.team as string | undefined
  const nextWeek = turn.now.seasonType === 'REG' ? Math.min(22, turn.now.week + 1) : turn.now.week
  const week =
    (a.week as number | undefined) ?? (team ? undefined : season === turn.now.season ? nextWeek : 1)
  const all = await io.deps.stats.games({
    season,
    ...(team ? { team } : {}),
    ...(week ? { weeks: [week, week] as [number, number] } : {})
  })
  const title = `Games, ${season}${week ? ` week ${week}` : ''}${team ? `, ${TEAM_NAMES[team]}` : ''}.`
  const lines = all.slice(0, 25).map((g) => {
    const score =
      g.homeScore !== null
        ? `${g.away} ${g.awayScore} @ ${g.home} ${g.homeScore}`
        : `${g.away} @ ${g.home}${g.kickoff ? ` (${g.kickoff})` : ''}`
    const elo = `Elo: ${g.home} ${(g.homeWinProb * 100).toFixed(0)}%`
    const market =
      g.spread !== null
        ? `, spread ${g.home} ${g.spread > 0 ? '−' : '+'}${Math.abs(g.spread).toFixed(1)}, total ${g.total?.toFixed(1) ?? '—'}`
        : ''
    return `Week ${g.week}: ${score}. ${elo}${market}.`
  })
  const notes = all.length === 0 ? ['No games in this scope.'] : []
  return done('games', title, lines, [{ kind: 'games', title, games: all }], notes, [])
}

const league: Handler = async (a, turn) => {
  const reader = turn.league ?? fail('no league is imported; league data is not available')
  const what = a.what as string
  if (what === 'scoring') {
    const rules = reader.rules() ?? fail('the league has no scoring rules yet; sync the league')
    const lines = scoringSummary(rules)
    return done(
      'league',
      'League scoring.',
      lines,
      [{ kind: 'list', title: 'League scoring', columns: ['Rule'], rows: lines.map((l) => [l]) }],
      [],
      []
    )
  }
  if (what === 'owner_of') {
    const id = (a.player as string | undefined) ?? fail('owner_of needs player (an id)')
    const owner = reader.ownership().players[id]
    const person = turn.people.byId(id)
    const name = person?.name ?? id
    const line = owner
      ? `${name} is on ${owner.name}${owner.mine ? ' (your team)' : ''}.`
      : `${name} is not rostered in the league (a free agent).`
    return done(
      'league',
      `Who rosters ${name}.`,
      [line],
      [
        {
          kind: 'list',
          title: 'Owner',
          columns: ['Player', 'Team'],
          rows: [[name, owner?.name ?? 'Free agent']]
        }
      ],
      [],
      []
    )
  }
  const teams = reader.teams()
  const wanted =
    what === 'my_roster'
      ? teams.find((t) => t.mine)
      : teams.find(
          (t) => t.name.toLowerCase().includes(String(a.team ?? '').toLowerCase()) && a.team
        )
  if (!wanted) {
    fail(
      what === 'my_roster'
        ? 'the league has no team marked as yours'
        : `no fantasy team named "${String(a.team ?? '')}"; the teams are ${teams.map((t) => t.name).join(', ')}`
    )
  }
  const team = wanted!
  const roster = reader.roster(team.rosterId)
  const lines = roster.map(
    (p) =>
      `${p.slot}: ${p.name}${p.gsis ? ` (${p.gsis})` : ''}, ${[p.position, p.team].filter(Boolean).join(', ')}`
  )
  return done(
    'league',
    `${team.name}${team.mine ? ' (your team)' : ''}: roster.`,
    lines,
    [
      {
        kind: 'list',
        title: `${team.name} roster`,
        columns: ['Slot', 'Player', 'Pos', 'Team'],
        rows: roster.map((p) => [p.slot, p.name, p.position, p.team])
      }
    ],
    [],
    []
  )
}

const describe: Handler = async (a, turn) => {
  const text = (a.metric as string).trim()
  const dim = DIMENSION_BY_ID.get(text)
  if (dim) {
    const seasons = `${dim.firstSeason}${dim.lastSeason === 'prior' ? ' to the prior season' : ' on'}`
    const lines = [
      dim.description,
      `Seasons: ${seasons}. Grain: ${dim.grain}. Sources: ${dim.sources.join(', ')}.`
    ]
    return done(
      'describe',
      `${dim.label} (${dim.id}).`,
      lines,
      [{ kind: 'list', title: dim.label, columns: ['About'], rows: lines.map((l) => [l]) }],
      [],
      []
    )
  }
  const info =
    turn.catalogue.get(text) ??
    (() => {
      const near = lexicalRetriever().rank(text, 3)
      return fail(
        near.length > 0
          ? `"${text}" is not a metric id; did you mean ${near.map((c) => `${c.id} (${METRICS.get(c.id)!.label})`).join(', ')}?`
          : `"${text}" is not a metric id`
      )
    })()
  const s = info.stability
  const stability =
    s?.yearToYear !== null && s?.yearToYear !== undefined
      ? `Stability: year-to-year r ${s.yearToYear.toFixed(2)} (${s.reliability}), half signal at ${s.prior ? Math.round(s.prior) : '—'} ${info.sampleLabel}.`
      : 'Stability: not measured.'
  const lines = [
    info.description,
    `Unit: ${info.unit}; ${info.direction === 'lower' ? 'lower is better' : info.direction === 'higher' ? 'higher is better' : 'neither better nor worse'}. Sample: ${info.sampleLabel}${info.minSample ? `, qualified at ${info.minSample} over 17 games` : ''}.`,
    `${info.entity === 'player' ? `Positions: ${info.positions === 'all' ? 'all' : info.positions.join(', ')}. ` : ''}Seasons: ${info.firstSeason}${info.lastSeason === 'prior' ? ' to the prior season' : ' on'}. Sources: ${info.sources.join(', ')}.`,
    stability
  ]
  return done(
    'describe',
    `${info.label} (${info.id}).`,
    lines,
    [
      {
        kind: 'describe',
        title: info.label,
        metric: info,
        aliases: [...(METRIC_ALIASES[info.id] ?? [])]
      }
    ],
    [],
    []
  )
}

const find: Handler = async (a, turn) => {
  const text = a.text as string
  const kind = a.kind as string | undefined
  const lines: string[] = []
  if (!kind || kind === 'player') {
    for (const m of turn.people.find(text)) {
      for (const p of m.people)
        lines.push(
          `Player: ${p.name} = ${p.id} (${[p.position, p.team].filter(Boolean).join(', ')}), last played ${p.lastSeason}`
        )
    }
  }
  if (!kind || kind === 'team')
    for (const t of findTeams(text)) lines.push(`Team: ${TEAM_NAMES[t.code]} = ${t.code}`)
  if (!kind || kind === 'metric') {
    for (const c of lexicalRetriever().rank(text, 5))
      lines.push(`Metric: ${c.id} = ${METRICS.get(c.id)!.label}`)
  }
  if (lines.length === 0) lines.push('Nothing matched; try other words.')
  return done(
    'find',
    `Matches for "${text}".`,
    lines,
    [{ kind: 'list', title: 'Matches', columns: ['Match'], rows: lines.map((l) => [l]) }],
    [],
    []
  )
}

const query: Handler = async (a, turn, io) => {
  const q = a.query as StatsQuery
  const result = await io.query(q)
  const player = q.entity === 'player'
  const title = `${q.metrics.map((x) => turn.catalogue.get(x)?.label ?? x).join(', ')}, ${seasonsText(q.scope)}${situationText(q)}.`
  const detail = detailOf(a)
  const by = q.groupBy?.[0]
  const lines = result.rows.slice(0, ROWS[detail]).map((r) => {
    const g = q.groupBy?.map((x) => groupText(r, x)).join(', ')
    return `${r.values[q.metrics[0]]?.rank ?? '–'}. ${who(r, player)}${g ? ` [${g}]` : ''} — ${q.metrics
      .slice(0, COLUMNS[detail])
      .map((x) => valueText(r, x, turn, { sample: true }))
      .filter(Boolean)
      .join(' · ')}`
  })
  const notes = [...result.notes]
  if (result.rows.length === 0) notes.push('No rows in this scope.')
  return done(
    'query',
    title,
    lines,
    [
      statsCard(
        title,
        result,
        chartOf(undefined, { by, metrics: q.metrics.length, rows: result.rows.length, ranked: !by })
      )
    ],
    notes,
    [q]
  )
}

const HANDLERS: Record<ToolName, Handler> = {
  find,
  leaderboard,
  player_stats: playerStats,
  team_stats: teamStats,
  compare,
  trend,
  outlook,
  games,
  league,
  describe,
  query
}

export { ToolFailure }
```

Create `src/shared/ask.ts`:

```ts
import type {
  GameForecast,
  MetricInfo,
  PlayerOutlook,
  StatsQuery,
  StatsResult
} from './stats/types'

/**
 * Ask (Ask spec §3.3, §8): what an analyst tool returns. The model reads `text`, compact and
 * rounded; the screen renders `cards` from the engine's rows, never from the model's prose; "Show
 * query" lists `queries`. The same shape is the MCP tools' `outputSchema` (Plan AF2).
 */
export type ToolName =
  | 'find'
  | 'leaderboard'
  | 'player_stats'
  | 'team_stats'
  | 'compare'
  | 'trend'
  | 'outlook'
  | 'games'
  | 'league'
  | 'describe'
  | 'query'

export type ChartKind = 'table' | 'bar' | 'line' | 'scatter'

/** A split row's comparison with its base row (Ask spec §3.3, report D5). */
export interface SplitStat {
  /** The split's value minus the base's (raw values). */
  diff: number | null
  /** A 95 % interval for that difference; null for counts or without a stability estimate. */
  interval: [number, number] | null
  /** The difference is inside its interval's noise band. */
  withinNoise: boolean | null
}

export interface StatsCard {
  kind: 'stats'
  title: string
  result: StatsResult
  /** For a split: the row of the whole scope, and each split row's comparison by metric. */
  base: StatsResult['rows'][number] | null
  splits: Record<string, Record<string, SplitStat>> | null
  chart: ChartKind
}

export type ResultCard =
  | StatsCard
  | { kind: 'games'; title: string; games: GameForecast[] }
  | { kind: 'outlook'; title: string; outlook: PlayerOutlook }
  | { kind: 'describe'; title: string; metric: MetricInfo; aliases: string[] }
  | { kind: 'list'; title: string; columns: string[]; rows: (string | number | null)[][] }

export interface ToolResult {
  ok: true
  tool: ToolName
  title: string
  /** What the model reads (Ask spec §3.3: at most 15 rows × 6 columns unless `detail: full`). */
  text: string
  cards: ResultCard[]
  notes: string[]
  queries: StatsQuery[]
  ms: number
  /** Every query came from the cache. */
  cached: boolean
}

/** An invalid call: why, and how to fix it (Ask spec §3.3, "errors teach"). Never a stack trace. */
export interface ToolError {
  ok: false
  tool: string
  error: string
  ms: number
}

export type ToolOutcome = ToolResult | ToolError
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/tools.test.ts
```

Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/format.ts src/main/analyst/league.ts src/main/analyst/schema.ts src/main/analyst/splits.ts src/main/analyst/tools.ts src/shared/ask.ts tests/fixtures/analyst.ts tests/main/analyst/tools.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/format.ts src/main/analyst/league.ts src/main/analyst/schema.ts src/main/analyst/splits.ts src/main/analyst/tools.ts src/shared/ask.ts tests/fixtures/analyst.ts tests/main/analyst/tools.test.ts
git commit -m "feat(analyst): analyst tools over the engine"
```

Expected: typecheck and lint clean; the suite at 1,237 passed, 5 skipped (a clean checkout).

---

### Task 6: The compact profile (spec §3.2; amendment F)

`compactCall(block)` builds `{thought, args}` for the classifier's tool with only the slots the resolver left open and detected: neutral defaults (`any`, `none`, `default`), filters as one bounded list, `maxItems` everywhere, `thought` capped. `compactAnswer()` maps the model's answer back to the full tool's arguments, filling time, ids, opponent, rostered and the row count from the resolver; `other` asks for more candidates.

**Files:**

- Create: `src/main/analyst/compact.ts`, `tests/main/analyst/compact.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/main/analyst/compact.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { compactAnswer, compactCall, THOUGHT_MAX } from '@main/analyst/compact'
import { playerIndex } from '@main/analyst/players'
import { resolve } from '@main/analyst/resolve'
import { NOW, PEOPLE } from '../../fixtures/analyst'

const block = (q: string): ReturnType<typeof resolve> =>
  resolve(q, { people: playerIndex(PEOPLE), now: NOW })

describe('the compact profile (Ask spec §3.2)', () => {
  it('shows only the open slots the question names, with neutral defaults and bounds', () => {
    const b = block('Who leads WRs in yards per route run since week 5?')
    const call = compactCall(b)!
    expect(call.tool).toBe('leaderboard')
    expect(call.schema).toEqual({
      type: 'object',
      properties: {
        thought: { type: 'string', maxLength: THOUGHT_MAX },
        args: {
          type: 'object',
          properties: {
            metric: { enum: [...b.metrics.map((m) => m.id), 'other'] },
            position: { enum: ['any', 'WR'] }
          },
          required: ['metric', 'position'],
          additionalProperties: false
        }
      },
      required: ['thought', 'args'],
      additionalProperties: false
    })
    // Time came from the resolver: it is not a slot.
    expect(compactAnswer(b, call, { metric: 'yprr', position: 'WR' })).toEqual({
      kind: 'call',
      name: 'leaderboard',
      args: { metric: 'yprr', seasons: [2026], weeks: [5, 7], position: 'WR' }
    })
    expect(compactAnswer(b, call, { metric: 'yprr', position: 'any' })).toMatchObject({
      args: { metric: 'yprr', seasons: [2026], weeks: [5, 7] }
    })
  })

  it('gives a split and the detected filters as bounded lists, and maps them back', () => {
    const b = block('Josh Allen EPA per dropback under pressure by down in 2025')
    const call = compactCall(b)!
    expect(call.tool).toBe('player_stats')
    const args = (call.schema.properties!.args as { properties: Record<string, unknown> })
      .properties
    expect(args.metrics).toMatchObject({ type: 'array', minItems: 1, maxItems: 3 })
    expect(args.by).toEqual({ enum: ['none', 'down'] })
    expect(args.filters).toEqual({ type: 'array', items: { enum: ['pressure'] }, maxItems: 1 })
    expect(
      compactAnswer(b, call, { metrics: ['qb_epa_db'], by: 'down', filters: ['pressure'] })
    ).toEqual({
      kind: 'call',
      name: 'player_stats',
      args: {
        player: '00-0034857',
        metrics: ['qb_epa_db'],
        seasons: [2025],
        pressure: true,
        by: 'down'
      }
    })
  })

  it('fills ids, opponents, rostered and the row count from the resolver', () => {
    const c = block('Puka or JSN: yards per route run this season')
    expect(compactAnswer(c, compactCall(c)!, { metrics: ['yprr'] })).toEqual({
      kind: 'call',
      name: 'compare',
      args: { ids: ['00-0039075', '00-0038543'], metrics: ['yprr'], seasons: [2026] }
    })
    const l = block('worst 5 free agent RBs by yards after contact against the Ravens')
    expect(compactAnswer(l, compactCall(l)!, { metric: 'yac_att', position: 'RB' })).toMatchObject({
      args: {
        metric: 'yac_att',
        position: 'RB',
        opponent: 'BAL',
        rostered: 'free',
        limit: 5,
        order: 'worst'
      }
    })
  })

  it('needs no model slots for an outlook or a team’s games, and none at all when declined', () => {
    const o = block('Is Jordan Love due for regression?')
    const call = compactCall(o)!
    expect((call.schema.properties!.args as { properties: object }).properties).toEqual({})
    expect(compactAnswer(o, call, {})).toEqual({
      kind: 'call',
      name: 'outlook',
      args: { player: '00-0031000' }
    })
    const g = block('Who do the Niners play next week?')
    expect(compactAnswer(g, compactCall(g)!, {})).toEqual({
      kind: 'call',
      name: 'games',
      args: { season: 2026, week: 8, team: 'SF' }
    })
    expect(compactCall(block('Should I start Bijan or Gibbs this week?'))).toBeNull()
    expect(compactCall(block('Chris Jones sacks'))).toBeNull()
  })

  it('offers the position’s usual line first, and leaves the metrics to the tool for it', () => {
    const b = block('Show me Bijan Robinson’s game log this season')
    const call = compactCall(b)!
    const metrics = (
      call.schema.properties!.args as { properties: Record<string, { items: { enum: string[] } }> }
    ).properties.metrics
    expect(metrics.items.enum[0]).toBe('default')
    expect(compactAnswer(b, call, { metrics: ['default'], by: 'week' })).toEqual({
      kind: 'call',
      name: 'player_stats',
      args: { player: '00-0038542', seasons: [2026], by: 'week' }
    })
    expect(compactAnswer(b, call, { metrics: ['default', 'rush_yds'], by: 'none' })).toMatchObject({
      args: { metrics: ['rush_yds'] }
    })
  })

  it('answers `other` by asking for more candidates', () => {
    const b = block('How many yards per carry does Bijan average?')
    expect(compactAnswer(b, compactCall(b)!, { metrics: ['other'] })).toEqual({ kind: 'other' })
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/compact.test.ts
```

Expected: FAIL — `@main/analyst/compact` does not exist.

- [ ] **Step 3: Implement**

Create `src/main/analyst/compact.ts`:

```ts
import type { ToolName } from '@shared/ask'
import { POSITION_GROUPS } from '@shared/stats/types'
import type { CompactTool } from './classify'
import type { ContextBlock } from './resolve'
import type { Schema } from './schema'
import type { Flag } from './slots'

/**
 * The compact profile (Ask spec §3.2, report P2/P3): for a small local model, the app picks the tool
 * and builds a schema with only the slots still open, then maps the model's answer back to the full
 * tool's arguments. The rules, each measured on this laptop:
 *
 *   1. The classifier picks the tool; the model fills `{thought, args}` for it.
 *   2. No slot the resolver fills (seasons, weeks, player, team, ids, opponent, rostered, limit).
 *   3. A slot appears only when the resolver detected words for it, with only those options;
 *      situation flags are one `filters` list.
 *   4. Every optional enum starts with a neutral value (`any`, `none`).
 *   5. Metric enums are the top candidates plus `other` (the loop re-resolves with more); a line's
 *      metrics also offer `default`, the position's usual line.
 *   6. Every array has `maxItems`; `thought` has `maxLength`.
 *   7. Bounded numbers are enums (there are none left to fill here).
 */
export const THOUGHT_MAX = 300

export interface CompactCall {
  tool: CompactTool
  /** What the model fills: `{ thought, args }`, `thought` first. */
  schema: Schema
  /** The tool's one-line description and the argument names, for the prompt. */
  description: string
}

/** The model's answer mapped back: a full tool call, or a request to re-resolve with more metrics. */
export type CompactAnswer =
  { kind: 'call'; name: ToolName; args: Record<string, unknown> } | { kind: 'other' }

const DESCRIPTIONS: Record<CompactTool, string> = {
  leaderboard: 'Rank players or teams by one metric.',
  player_stats: 'One player’s line, game log or splits.',
  team_stats: 'One team’s line, by week or split.',
  compare: 'Two to four players or teams side by side.',
  outlook: 'A player’s forecast signals: ceiling, floor, boom and bust, regression.',
  games: 'Schedule and results with Elo and the betting market.',
  league: 'The imported league: my roster, a team’s roster, who rosters a player, the scoring.',
  describe: 'What a metric means, its sample and stability.'
}

/** A flag as the full tools' arguments say it. */
const FLAG_ARGS: Record<Flag, Record<string, unknown>> = {
  red_zone: { red_zone: true },
  inside_10: { inside_10: true },
  goal_line: { goal_line: true },
  third_down: { third_down: true },
  fourth_down: { down: [4] },
  early_downs: { down: [1, 2] },
  pressure: { pressure: true },
  blitz: { blitz: true },
  play_action: { play_action: true },
  man_coverage: { coverage: 'man' },
  zone_coverage: { coverage: 'zone' },
  neutral: { neutral: true },
  two_minute: { two_minute: true },
  home: { home: true },
  road: { home: false }
}

const metricEnum = (b: ContextBlock): Schema => ({ enum: [...b.metrics.map((m) => m.id), 'other'] })
/** A line's metrics: `default` (the position's usual line) first, then the candidates. */
const metricList = (b: ContextBlock): Schema => ({
  type: 'array',
  items: { enum: ['default', ...b.metrics.map((m) => m.id), 'other'] },
  minItems: 1,
  maxItems: 3
})

/** The compact schema for the question, or null when no model call is needed (declined, ask back). */
export function compactCall(b: ContextBlock): CompactCall | null {
  if (!b.tool) return null
  const args: Record<string, Schema> = {}
  const positions = b.positions.filter((p) => (POSITION_GROUPS as readonly string[]).includes(p))
  const filters = b.slots.flags
  const by = b.slots.groupings
  switch (b.tool) {
    case 'leaderboard':
      args.metric = metricEnum(b)
      if (positions.length > 0) args.position = { enum: ['any', ...positions] }
      break
    case 'player_stats':
    case 'team_stats':
      args.metrics = metricList(b)
      if (by.length > 0) args.by = { enum: ['none', ...by] }
      break
    case 'compare':
      args.metrics = metricList(b)
      break
    case 'describe':
      args.metric = metricEnum(b)
      break
    case 'league':
      args.what = {
        enum:
          b.players.length > 0
            ? ['owner_of', 'my_roster', 'scoring']
            : ['my_roster', 'roster', 'scoring']
      }
      break
    case 'outlook':
    case 'games':
      break
  }
  if (
    filters.length > 0 &&
    (b.tool === 'leaderboard' || b.tool === 'player_stats' || b.tool === 'team_stats')
  ) {
    args.filters = { type: 'array', items: { enum: filters }, maxItems: filters.length }
  }
  return {
    tool: b.tool,
    description: DESCRIPTIONS[b.tool],
    schema: {
      type: 'object',
      properties: {
        thought: { type: 'string', maxLength: THOUGHT_MAX },
        args: {
          type: 'object',
          properties: args,
          required: Object.keys(args),
          additionalProperties: false
        }
      },
      required: ['thought', 'args'],
      additionalProperties: false
    }
  }
}

/** Leaves out the arguments nobody filled. */
const filled = (args: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined))

/** The model's `args` and the resolver's slots, as the full tool's arguments. */
export function compactAnswer(
  b: ContextBlock,
  call: CompactCall,
  given: Record<string, unknown>
): CompactAnswer {
  const a = { ...given }
  const metrics = ([] as unknown[]).concat(a.metric ?? [], a.metrics ?? [])
  if (metrics.includes('other')) return { kind: 'other' }
  // `default` alone leaves the line to the tool; beside named metrics it is dropped.
  if (Array.isArray(a.metrics)) {
    const named = (a.metrics as string[]).filter((m) => m !== 'default')
    if (named.length > 0) a.metrics = named
    else delete a.metrics
  }
  const out: Record<string, unknown> = {}
  const t = b.time
  const time = {
    ...(t.seasons ? { seasons: t.seasons } : {}),
    ...(t.weeks ? { weeks: t.weeks } : {}),
    ...(t.lastNGames ? { last_games: t.lastNGames } : {}),
    ...(t.seasonType ? { season_type: t.seasonType } : {})
  }
  const flags = ((a.filters as Flag[] | undefined) ?? []).reduce<Record<string, unknown>>(
    (acc, f) => ({ ...acc, ...FLAG_ARGS[f] }),
    {}
  )
  const opponent = b.opponents[0] ? { opponent: b.opponents[0].code } : {}
  switch (call.tool) {
    case 'leaderboard':
      Object.assign(out, { metric: a.metric }, time, flags, opponent)
      if (a.position && a.position !== 'any') out.position = a.position
      if (b.teams[0]) out.team = b.teams[0].code
      if (b.slots.rostered) out.rostered = b.slots.rostered
      if (b.slots.limit) out.limit = b.slots.limit
      if (b.slots.ascending) out.order = 'worst'
      return { kind: 'call', name: 'leaderboard', args: filled(out) }
    case 'player_stats':
      Object.assign(out, { player: b.players[0].id, metrics: a.metrics }, time, flags, opponent)
      if (a.by && a.by !== 'none') out.by = a.by
      return { kind: 'call', name: 'player_stats', args: filled(out) }
    case 'team_stats':
      Object.assign(out, { team: b.teams[0].code, metrics: a.metrics }, time, flags, opponent)
      if (a.by && a.by !== 'none') out.by = a.by
      return { kind: 'call', name: 'team_stats', args: filled(out) }
    case 'compare': {
      const ids = b.players.length >= 2 ? b.players.map((p) => p.id) : b.teams.map((x) => x.code)
      return {
        kind: 'call',
        name: 'compare',
        args: filled({ ids: ids.slice(0, 4), metrics: a.metrics, ...time })
      }
    }
    case 'outlook':
      return {
        kind: 'call',
        name: 'outlook',
        args: {
          player: b.players[0].id,
          ...(t.seasons?.length === 1 ? { season: t.seasons[0] } : {})
        }
      }
    case 'games': {
      const week = t.weeks && t.weeks[0] === t.weeks[1] ? { week: t.weeks[0] } : {}
      const season = t.seasons?.length === 1 ? { season: t.seasons[0] } : {}
      const team = b.teams[0] ?? b.opponents[0]
      return {
        kind: 'call',
        name: 'games',
        args: { ...season, ...week, ...(team ? { team: team.code } : {}) }
      }
    }
    case 'league':
      return {
        kind: 'call',
        name: 'league',
        args: { what: a.what, ...(b.players[0] ? { player: b.players[0].id } : {}) }
      }
    case 'describe':
      return { kind: 'call', name: 'describe', args: { metric: a.metric } }
  }
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/compact.test.ts
```

Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/compact.ts tests/main/analyst/compact.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/compact.ts tests/main/analyst/compact.test.ts
git commit -m "feat(analyst): compact profile for small models"
```

Expected: typecheck and lint clean; the suite at 1,243 passed, 5 skipped (a clean checkout).

---

### Task 7: The analyst brief and the answer checks (spec §4.3, §4.4; amendment H)

Three versioned brief templates (`?raw` imports, like the migrations) filled with the data range, the week and the glossary, and hashed for traces. `checkAnswer()`: a number no result, question or context contains (small prose numbers aside), an unqualified rate quoted without its sample, a split quoted without its base, causal words (soft).

**Files:**

- Create: `src/main/analyst/brief.ts`, `src/main/analyst/brief/analyst.md`, `src/main/analyst/brief/compact-answer.md`, `src/main/analyst/brief/compact-call.md`, `src/main/analyst/checks.ts`, `tests/main/analyst/checks.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/main/analyst/checks.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { StatsCard, ToolResult } from '@shared/ask'
import { briefHash, briefText } from '@main/analyst/brief'
import { checkAnswer } from '@main/analyst/checks'
import { catalogueInfo } from '@main/stats/engine/registry'
import { NOW, statsResult, statsRow } from '../../fixtures/analyst'

const CATALOGUE = new Map(catalogueInfo().map((m) => [m.id, m]))
const CHASE = '00-0036900'

const result = (card: Partial<StatsCard>, text = ''): ToolResult => ({
  ok: true,
  tool: 'player_stats',
  title: '',
  text,
  cards: [
    {
      kind: 'stats',
      title: '',
      result: statsResult([]),
      base: null,
      splits: null,
      chart: 'table',
      ...card
    }
  ],
  notes: [],
  queries: [],
  ms: 1,
  cached: false
})

describe('the answer checks (Ask spec §4.3)', () => {
  const leaders = result(
    {
      result: statsResult([
        statsRow(CHASE, "Ja'Marr Chase", {
          yprr: { raw: 2.45, sample: 210, percentile: 97, rank: 1 },
          target_share: { raw: 0.285, sample: 80 }
        })
      ])
    },
    "1. Ja'Marr Chase (00-0036900, WR, CIN) — YPRR 2.45 on 210 routes, 97th pct"
  )

  it('accepts numbers from the results, the question and small prose numbers', () => {
    const answer =
      "Ja'Marr Chase leads WRs since week 5 with 2.45 yards per route on 210 routes (97th percentile), a 28.5% target share; the top 3 are close."
    expect(
      checkAnswer(answer, [leaders], CATALOGUE, { question: 'Who leads WRs since week 5?' })
    ).toEqual([])
  })

  it('flags a number no result has', () => {
    const checks = checkAnswer(
      'Chase has 2.61 yards per route and 1,203 yards.',
      [leaders],
      CATALOGUE,
      { question: '' }
    )
    expect(checks.map((c) => [c.kind, c.text])).toEqual([
      ['number', '2.61'],
      ['number', '1,203']
    ])
  })

  it('flags an unqualified rate given without its sample', () => {
    const thin = result({
      result: statsResult([
        statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 3.1, sample: 41, qualified: false } })
      ])
    })
    expect(
      checkAnswer('Chase is at 3.10 yards per route.', [thin], CATALOGUE, { question: '' })
    ).toMatchObject([
      {
        kind: 'sample',
        text: '3.10',
        message: expect.stringMatching(/on 41 routes, below the qualified sample/)
      }
    ])
    expect(
      checkAnswer('Chase is at 3.10 yards per route on 41 routes.', [thin], CATALOGUE, {
        question: ''
      })
    ).toEqual([])
  })

  it('flags a split without its base, and a cause softly', () => {
    const split = result({
      result: statsResult([
        statsRow(
          CHASE,
          "Ja'Marr Chase",
          { yprr: { raw: 1.8, sample: 210 } },
          { group: { coverage: 'man' } }
        )
      ]),
      base: statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2.26, sample: 626 } }),
      splits: { man: { yprr: { diff: -0.46, interval: [-0.9, -0.02], withinNoise: false } } }
    })
    expect(
      checkAnswer('Against man he drops to 1.80 because of press coverage.', [split], CATALOGUE, {
        question: ''
      }).map((c) => [c.kind, c.text, c.severity])
    ).toEqual([
      ['base', '1.80', 'flag'],
      ['causal', 'because of', 'soft']
    ])
    expect(
      checkAnswer(
        'He is at 2.26 overall and 1.80 against man (0.46 lower, beyond noise).',
        [split],
        CATALOGUE,
        { question: '' }
      )
    ).toEqual([])
  })
})

describe('the analyst brief (Ask spec §4.4)', () => {
  it('fills the data range, the week and the glossary; hashes the template', () => {
    const text = briefText('analyst', NOW)
    expect(text).toContain(
      'Data: NFL seasons 2019–2026. The current season is 2026, played through week 7 (regular season).'
    )
    expect(text).toContain('- Qualified: ')
    expect(text).not.toMatch(/\{\{/)
    expect(briefHash('analyst')).toMatch(/^[0-9a-f]{12}$/)
    expect(briefHash('analyst')).not.toBe(briefHash('compact-call'))
  })

  it('names the tool the app chose in the compact call brief', () => {
    const text = briefText('compact-call', NOW, {
      tool: 'leaderboard',
      description: 'Rank players or teams by one metric.'
    })
    expect(text).toMatch(
      /^You are FantasyCompanion's NFL data analyst\. The app has read the question and chosen the tool: leaderboard — Rank players/
    )
    expect(text).toContain('"default" for the usual line')
  })
})
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/checks.test.ts
```

Expected: FAIL — `@main/analyst/brief` and `checks` do not exist.

- [ ] **Step 3: Implement**

Create `src/main/analyst/brief.ts`:

```ts
import { createHash } from 'node:crypto'
import { glossaryText } from '@shared/stats/glossary'
import analyst from './brief/analyst.md?raw'
import compactAnswer from './brief/compact-answer.md?raw'
import compactCall from './brief/compact-call.md?raw'
import type { Now } from './time'

/**
 * The analyst brief (Ask spec §4.4): one text for the full profile (the MCP server's instructions
 * and the agent loop), and two short ones for the compact profile (the call, then the answer).
 * They are versioned files; every trace records the hash of the one it used (§5.3), so an
 * evaluation can tell briefs apart.
 */
export type BriefKind = 'analyst' | 'compact-call' | 'compact-answer'

const TEMPLATES: Record<BriefKind, string> = {
  analyst,
  'compact-call': compactCall,
  'compact-answer': compactAnswer
}

/** The first 12 hex digits of the template's SHA-256. */
export function briefHash(kind: BriefKind): string {
  return createHash('sha256').update(TEMPLATES[kind]).digest('hex').slice(0, 12)
}

export function briefText(
  kind: BriefKind,
  now: Now,
  fill: { tool?: string; description?: string } = {}
): string {
  const values: Record<string, string> = {
    season: String(now.season),
    week: String(now.week),
    seasonType: now.seasonType === 'POST' ? 'postseason' : 'regular season',
    glossary: glossaryText(),
    tool: fill.tool ?? '',
    description: fill.description ?? ''
  }
  return TEMPLATES[kind].replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? '').trim()
}
```

Create `src/main/analyst/brief/analyst.md`:

```markdown
You are FantasyCompanion's NFL data analyst. You answer questions about NFL stats from the app's data by calling its tools, then say briefly what the rows show.

Data: NFL seasons 2019–{{season}}. The current season is {{season}}, played through week {{week}} ({{seasonType}}). Regular season unless the postseason is asked for. Team codes are nflverse's (LA = Rams, LV = Raiders, WAS = Commanders).

How to work:

- Read the context block first: copy player ids, team codes and metric ids from it. When a name matches several players, ask which one before calling a tool.
- Prefer the task tools (leaderboard, player_stats, team_stats, compare, trend, outlook, games, league, describe). Use query only for what they cannot express.
- When a call fails, read the error: it says what to change.

How to answer:

- Every number you write must come from a tool result in this conversation. Do not compute new numbers or recall stats from memory.
- For a rate from a row that is not qualified, give its sample ("on 61 routes"). Pass on the caveats in the notes ("2026 routes are estimated").
- For a split, give the overall line first, then the split, and say whether the difference is within noise when the result says so.
- Do not claim causes ("because", "due to") unless a result compares the two situations directly.
- Call a metric with low stability noisy.
- No fantasy advice yet (start, sit, trade, add, drop): say so, and offer the stats behind the choice.
- When the data cannot answer (before 2019, a stat the app does not have), say so and why.
- Keep it short: a sentence or two per result; the table shows the rest.

Glossary:
{{glossary}}
```

Create `src/main/analyst/brief/compact-answer.md`:

```markdown
You are FantasyCompanion's NFL data analyst. Answer the question in two or three sentences from the tool result below.

- Use only numbers that are in the result.
- For a rate marked "not qualified", give its sample.
- For a split, give the overall line first, and say "within noise" when the result does.
- Pass on the notes' caveats. Do not claim causes. No fantasy advice.
```

Create `src/main/analyst/brief/compact-call.md`:

```markdown
You are FantasyCompanion's NFL data analyst. The app has read the question and chosen the tool: {{tool}} — {{description}}
Fill its arguments from the question and the context block.

- Use only the ids in the context.
- Pick the metric candidate that fits; "default" for the usual line of a player or team (a game log, "how is he doing"); "other" if none fits.
- Add a filter or a split only when the question asks for it; "any" and "none" mean no choice.

Data: 2019–{{season}}, through week {{week}} of {{season}}.
Reply with one JSON object: {"thought": "...", "args": {...}}. Keep the thought short.
```

Create `src/main/analyst/checks.ts`:

```ts
import type { StatsCard, ToolResult } from '@shared/ask'
import type { MetricInfo } from '@shared/stats/types'
import { fmt } from './format'

/**
 * Answers that can be checked (Ask spec §4.3, report D6): code reads the answer against the results
 * of its turn. No second model pass — a model reviewing itself does not improve answers and can make
 * them worse; checks against the data are reliable.
 *
 *   number — a number that no result (nor the question or the context) contains;
 *   sample — a rate from a row that is not qualified, given without its sample;
 *   base   — a split's value given without the overall line;
 *   causal — "because", "due to" … (soft: underlined, not blocked).
 */
export interface AnswerCheck {
  kind: 'number' | 'sample' | 'base' | 'causal'
  /** The words it is about, and where they are in the answer. */
  text: string
  at: [number, number]
  message: string
  severity: 'flag' | 'soft'
}

const NUMBER = /[-−+]?\d[\d,]*(?:\.\d+)?%?/g

interface Num {
  value: number
  decimals: number
  pct: boolean
}

function parse(token: string): Num {
  const pct = token.endsWith('%')
  const clean = token.replace(/[,%+]/g, '').replace('−', '-')
  const decimals = clean.includes('.') ? clean.split('.')[1].length : 0
  return { value: Number(clean), decimals, pct }
}

/** `a` (as written) is a rounding of `b`. */
const rounds = (a: Num, b: number): boolean =>
  Math.abs(a.value - b) <= 0.5 * 10 ** -a.decimals + 1e-9

/** Every number the answer may use: in the results' text, their rows, the question and the context. */
function allowed(
  results: ToolResult[],
  extra: string[],
  catalogue: ReadonlyMap<string, MetricInfo>
): number[] {
  const values: number[] = []
  const texts = [...results.map((r) => r.text), ...extra]
  for (const t of texts) {
    for (const m of t.matchAll(NUMBER)) {
      const n = parse(m[0])
      values.push(n.value)
    }
  }
  for (const r of results) {
    for (const card of r.cards) {
      if (card.kind !== 'stats') continue
      const rows = [...card.result.rows, ...(card.base ? [card.base] : [])]
      for (const row of rows) {
        values.push(row.games)
        for (const [id, v] of Object.entries(row.values)) {
          // A fraction is written as a percentage.
          const scale = catalogue.get(id)?.unit === 'pct' ? 100 : 1
          for (const x of [v.value, v.raw]) if (x !== null) values.push(x * scale)
          for (const x of [v.sample, v.percentile, v.rank]) if (x !== null) values.push(x)
        }
      }
      for (const split of Object.values(card.splits ?? {})) {
        for (const [id, s] of Object.entries(split)) {
          const scale = catalogue.get(id)?.unit === 'pct' ? 100 : 1
          if (s.diff !== null) values.push(s.diff * scale, Math.abs(s.diff) * scale)
        }
      }
    }
  }
  return values
}

const CAUSAL =
  /\b(because( of)?|due to|caused by|causes?|thanks to|as a result of|led to|leads to|which is why|the reason)\b/gi

export function checkAnswer(
  answer: string,
  results: ToolResult[],
  catalogue: ReadonlyMap<string, MetricInfo>,
  extra: { question: string; context?: string }
): AnswerCheck[] {
  const checks: AnswerCheck[] = []
  const ok = allowed(results, [extra.question, extra.context ?? ''], catalogue)
  for (const m of answer.matchAll(NUMBER)) {
    const n = parse(m[0])
    if (!Number.isFinite(n.value)) continue
    // Small whole numbers are prose ("the top 3", "2 of them").
    if (n.decimals === 0 && !n.pct && Math.abs(n.value) <= 10) continue
    if (ok.some((b) => rounds(n, b))) continue
    checks.push({
      kind: 'number',
      text: m[0],
      at: [m.index!, m.index! + m[0].length],
      message: 'not from the data',
      severity: 'flag'
    })
  }

  const cards = results.flatMap((r) => r.cards.filter((c): c is StatsCard => c.kind === 'stats'))
  for (const card of cards) {
    // Sample: an unqualified rate quoted without its sample.
    for (const row of card.result.rows) {
      for (const [id, v] of Object.entries(row.values)) {
        const info = catalogue.get(id)
        if (!info || info.kind !== 'rate' || v.qualified || v.value === null || v.sample === null)
          continue
        const shown = fmt(v.value, info.unit, info.decimals).replace(/^\+/, '')
        const at = answer.indexOf(shown)
        if (at < 0) continue
        if (answer.includes(String(Math.round(v.sample)))) continue
        checks.push({
          kind: 'sample',
          text: shown,
          at: [at, at + shown.length],
          message: `${info.label} for ${row.name} is on ${Math.round(v.sample)} ${info.sampleLabel}, below the qualified sample: say so`,
          severity: 'flag'
        })
      }
    }
    // Base: a split value quoted without the overall line.
    if (card.base) {
      const splitShown: [string, number][] = []
      const baseShown: string[] = []
      for (const [id, v] of Object.entries(card.base.values)) {
        const info = catalogue.get(id)
        if (!info || v.value === null) continue
        baseShown.push(fmt(v.value, info.unit, info.decimals).replace(/^\+/, ''))
        for (const row of card.result.rows) {
          const sv = row.values[id]
          if (!sv || sv.value === null) continue
          const s = fmt(sv.value, info.unit, info.decimals).replace(/^\+/, '')
          const at = answer.indexOf(s)
          if (at >= 0) splitShown.push([s, at])
        }
      }
      if (splitShown.length > 0 && !baseShown.some((b) => answer.includes(b))) {
        const [text, at] = splitShown[0]
        checks.push({
          kind: 'base',
          text,
          at: [at, at + text.length],
          message: 'a split without the overall line: give the base first',
          severity: 'flag'
        })
      }
    }
  }

  for (const m of answer.matchAll(CAUSAL)) {
    checks.push({
      kind: 'causal',
      text: m[0],
      at: [m.index!, m.index! + m[0].length],
      message: 'a cause the data does not show',
      severity: 'soft'
    })
  }
  return checks.sort((a, b) => a.at[0] - b.at[0])
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/checks.test.ts
```

Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/brief.ts src/main/analyst/brief/analyst.md src/main/analyst/brief/compact-answer.md src/main/analyst/brief/compact-call.md src/main/analyst/checks.ts tests/main/analyst/checks.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/brief.ts src/main/analyst/brief/analyst.md src/main/analyst/brief/compact-answer.md src/main/analyst/brief/compact-call.md src/main/analyst/checks.ts tests/main/analyst/checks.test.ts
git commit -m "feat(analyst): brief and answer checks"
```

Expected: typecheck and lint clean; the suite at 1,249 passed, 5 skipped (a clean checkout).

---

### Task 8: Traces and the example library (spec §5.3)

The trace of a turn (resolver output, each call with its queries' hashes, checks, tokens, time, the brief's hash), appended as a line of `log.jsonl`; `maskQuestion()` for the examples; migration 012 `ask_examples` and its repo.

**Files:**

- Create: `src/main/analyst/trace.ts`, `src/main/db/migrations/012_ask_examples.sql`, `src/main/db/repos/askExamples.ts`, `tests/main/analyst/trace.test.ts`
- Modify: `src/main/db/migrations/index.ts`, `tests/main/db/migrate.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/main/analyst/trace.test.ts`:

```ts
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { addAskExample, deleteAskExample, listAskExamples } from '@main/db/repos/askExamples'
import { playerIndex } from '@main/analyst/players'
import { resolve } from '@main/analyst/resolve'
import {
  appendTrace,
  maskQuestion,
  queryHash,
  resolverTrace,
  traceCall,
  type Trace
} from '@main/analyst/trace'
import { NOW, PEOPLE } from '../../fixtures/analyst'

const block = (q: string): ReturnType<typeof resolve> =>
  resolve(q, { people: playerIndex(PEOPLE), now: NOW })

describe('traces (Ask spec §5.3)', () => {
  it('record a call by its queries’ hashes, and an error by its message', () => {
    const q = { entity: 'player' as const, metrics: ['yprr'], scope: { seasons: [2026] } }
    expect(queryHash(q)).toMatch(/^[0-9a-f]{12}$/)
    expect(
      traceCall(
        'leaderboard',
        { metric: 'yprr' },
        {
          ok: true,
          tool: 'leaderboard',
          title: '',
          text: '',
          cards: [],
          notes: [],
          queries: [q],
          ms: 9,
          cached: true
        }
      )
    ).toEqual({
      tool: 'leaderboard',
      args: { metric: 'yprr' },
      ok: true,
      ms: 9,
      cached: true,
      queries: [queryHash(q)],
      rows: 0
    })
    expect(
      traceCall('leaderboard', {}, { ok: false, tool: 'leaderboard', error: 'no', ms: 1 })
    ).toMatchObject({ ok: false, error: 'no' })
  })

  it('append one line per turn to log.jsonl', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ask-'))
    const trace: Trace = {
      at: '2026-11-02T10:00:00Z',
      question: 'Puka or JSN?',
      brief: 'abc123abc123',
      profile: 'compact',
      model: 'qwen3:4b',
      mode: 'structured',
      resolver: resolverTrace(block('Puka or JSN?')),
      calls: [],
      checks: [],
      tokens: { input: 900, output: 60 },
      ms: 2100
    }
    appendTrace(dir, trace)
    appendTrace(dir, trace)
    const lines = readFileSync(join(dir, 'log.jsonl'), 'utf8').trim().split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).resolver).toMatchObject({
      type: 'compare',
      players: ['00-0039075', '00-0038543']
    })
  })

  it('mask a question to its shape', () => {
    expect(maskQuestion(block('Who leads WRs in yards per route run since week 5?'))).toBe(
      'who leads {position} in {metric} since week {n}'
    )
    expect(maskQuestion(block('How does Ja’Marr Chase do against the Ravens in 2025?'))).toBe(
      'how does {player} do against the {opponent} in {season}'
    )
  })
})

describe('ask_examples (Ask spec §5.3)', () => {
  it('keeps each masked question and call once, newest first', () => {
    const db = openDatabase(':memory:')
    migrate(db)
    const e = {
      question: 'Who leads WRs in YPRR?',
      masked: 'who leads {position} in {metric}',
      tool: 'leaderboard',
      args: { metric: 'yprr', position: 'WR' },
      resultHash: null,
      source: 'user' as const,
      verifiedAt: '2026-11-02T10:00:00Z'
    }
    addAskExample(db, e)
    addAskExample(db, e)
    addAskExample(db, {
      ...e,
      args: { metric: 'tprr', position: 'TE' },
      verifiedAt: '2026-11-02T11:00:00Z'
    })
    const all = listAskExamples(db)
    expect(all.map((x) => x.args.metric)).toEqual(['tprr', 'yprr'])
    deleteAskExample(db, all[0].id)
    expect(listAskExamples(db)).toHaveLength(1)
  })
})
```

Modify `tests/main/db/migrate.test.ts`:

```diff
diff --git a/tests/main/db/migrate.test.ts b/tests/main/db/migrate.test.ts
index 75d54e6..54aca6b 100644
--- a/tests/main/db/migrate.test.ts
+++ b/tests/main/db/migrate.test.ts
@@ -12,7 +12,7 @@ describe('migrate', () => {
         name: string
       }[]
     ).map((r) => r.name)
-    expect(version).toBe(11)
+    expect(version).toBe(12)
     expect(tables).toEqual(
       expect.arrayContaining([
         'app_settings',
@@ -39,6 +39,7 @@ describe('migrate', () => {
         'trending_adds',
         'sleeper_week_stats',
         'stats_views',
+        'ask_examples',
         'schema_version'
       ])
     )
@@ -49,7 +50,7 @@ describe('migrate', () => {
     migrate(db)
     expect(() => migrate(db)).not.toThrow()
     const row = db.prepare('SELECT COUNT(*) AS n FROM schema_version').get() as { n: number }
-    expect(row.n).toBe(11)
+    expect(row.n).toBe(12)
   })

   it('005 adds crosswalk.fantasypros_id and forgets the crosswalk step so it is re-downloaded', () => {
@@ -71,7 +72,7 @@ describe('migrate', () => {
        VALUES ('nflverse:crosswalk', 't', 't', 'ok', NULL, 10), ('nflverse:games', 't', 't', 'ok', NULL, 1)`
     ).run()

-    expect(migrate(db)).toBe(11)
+    expect(migrate(db)).toBe(12)
     const columns = (db.prepare('PRAGMA table_info(crosswalk)').all() as { name: string }[]).map(
       (c) => c.name
     )
```

- [ ] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/main/analyst/trace.test.ts tests/main/db/migrate.test.ts
```

Expected: FAIL — `@main/analyst/trace` and `@main/db/repos/askExamples` do not exist, and the migration count is 11.

- [ ] **Step 3: Implement**

Create `src/main/analyst/trace.ts`:

```ts
import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ToolOutcome } from '@shared/ask'
import { METRIC_ALIASES, phraseKey } from '@shared/stats/aliases'
import { CATALOGUE } from '@shared/stats/catalogue'
import type { StatsQuery } from '@shared/stats/types'
import type { AnswerCheck } from './checks'
import type { ContextBlock } from './resolve'

/**
 * A trace per turn (Ask spec §5.3): what the resolver saw, each tool call and its queries, the
 * answer checks, the tokens and the time, with the hash of the brief used. Threads keep a summary;
 * in Dev mode the whole trace goes to `<userData>/ask/log.jsonl`, the corpus of real questions the
 * evaluation set and the example library grow from.
 */
export interface TraceCall {
  tool: string
  args: unknown
  ok: boolean
  error?: string
  ms: number
  cached: boolean
  /** Each engine query as a hash: the replay re-runs them (Plan AG). */
  queries: string[]
  rows: number
}

export interface Trace {
  at: string
  question: string
  /** The brief's hash. */
  brief: string
  profile: 'full' | 'compact'
  model: string | null
  mode: 'native' | 'structured' | null
  resolver: {
    type: string
    tool: string | null
    players: string[]
    ambiguous: number
    teams: string[]
    opponents: string[]
    metrics: string[]
    time: string[]
  }
  calls: TraceCall[]
  checks: { kind: AnswerCheck['kind']; text: string }[]
  tokens: { input: number; output: number } | null
  ms: number
}

export const queryHash = (q: StatsQuery): string =>
  createHash('sha256').update(JSON.stringify(q)).digest('hex').slice(0, 12)

export function traceCall(tool: string, args: unknown, outcome: ToolOutcome): TraceCall {
  if (!outcome.ok)
    return {
      tool,
      args,
      ok: false,
      error: outcome.error,
      ms: outcome.ms,
      cached: false,
      queries: [],
      rows: 0
    }
  const rows = outcome.cards.reduce(
    (n, c) => n + (c.kind === 'stats' ? c.result.rows.length : 0),
    0
  )
  return {
    tool,
    args,
    ok: true,
    ms: outcome.ms,
    cached: outcome.cached,
    queries: outcome.queries.map(queryHash),
    rows
  }
}

export function resolverTrace(b: ContextBlock): Trace['resolver'] {
  return {
    type: b.type,
    tool: b.tool,
    players: b.players.map((p) => p.id),
    ambiguous: b.ambiguous.length,
    teams: b.teams.map((t) => t.code),
    opponents: b.opponents.map((t) => t.code),
    metrics: b.metrics.map((m) => m.id),
    time: b.time.said
  }
}

/** Appends one trace as a line of `log.jsonl` in `dir`. */
export function appendTrace(dir: string, trace: Trace): void {
  mkdirSync(dir, { recursive: true })
  appendFileSync(join(dir, 'log.jsonl'), `${JSON.stringify(trace)}\n`)
}

/** Metric phrases, longest first, for masking. */
const METRIC_PHRASES = CATALOGUE.flatMap((m) => [m.label, ...(METRIC_ALIASES[m.id] ?? [])])
  .map(phraseKey)
  .filter((p) => p.length >= 3)
  .sort((a, b) => b.length - a.length)

/**
 * A question with its specifics masked (report D9, DAIL-SQL): players, teams, metrics, seasons and
 * numbers, so "who leads WRs in YPRR since week 5" finds "who leads TEs in target share since week 3".
 */
export function maskQuestion(b: ContextBlock): string {
  let t = ` ${phraseKey(b.question)} `
  for (const p of b.players) t = t.replace(` ${phraseKey(p.mention)} `, ' {player} ')
  for (const x of b.teams) t = t.replace(` ${phraseKey(x.mention)} `, ' {team} ')
  for (const x of b.opponents) t = t.replace(` ${phraseKey(x.mention)} `, ' {opponent} ')
  for (const phrase of METRIC_PHRASES) {
    if (t.includes(` ${phrase} `)) {
      t = t.replace(` ${phrase} `, ' {metric} ')
      break
    }
  }
  t = t.replace(
    / (wrs?|rbs?|tes?|qbs?|wide receivers?|running backs?|tight ends?|quarterbacks?|receivers?) /g,
    ' {position} '
  )
  t = t.replace(/ 20\d\d /g, ' {season} ').replace(/ \d+ /g, ' {n} ')
  return t.trim().replace(/\s+/g, ' ')
}
```

Create `src/main/db/migrations/012_ask_examples.sql`:

```sql
-- Ask spec §5.3 (report D9): verified question → tool-call pairs, for few-shot examples in Plan AG.
-- A question is stored masked ("who leads {position} in {metric} since week {n}") beside the call
-- that answered it; evaluation questions never enter it.
CREATE TABLE ask_examples (
  id INTEGER PRIMARY KEY,
  question TEXT NOT NULL,
  masked TEXT NOT NULL,
  tool TEXT NOT NULL,
  args_json TEXT NOT NULL,
  result_hash TEXT,
  source TEXT NOT NULL CHECK (source IN ('user', 'seed')),
  verified_at TEXT NOT NULL,
  UNIQUE (masked, tool, args_json)
);
```

Modify `src/main/db/migrations/index.ts`:

```diff
diff --git a/src/main/db/migrations/index.ts b/src/main/db/migrations/index.ts
index 42c94ab..4ff1bd0 100644
--- a/src/main/db/migrations/index.ts
+++ b/src/main/db/migrations/index.ts
@@ -9,6 +9,7 @@ import rosSnapshotsSql from './008_ros_snapshots.sql?raw'
 import waiversSql from './009_waivers.sql?raw'
 import sleeperStatsSql from './010_sleeper_stats.sql?raw'
 import statsViewsSql from './011_stats_views.sql?raw'
+import askExamplesSql from './012_ask_examples.sql?raw'

 export interface Migration {
   version: number
@@ -27,5 +28,6 @@ export const migrations: Migration[] = [
   { version: 8, name: 'ros_snapshots', sql: rosSnapshotsSql },
   { version: 9, name: 'waivers', sql: waiversSql },
   { version: 10, name: 'sleeper_stats', sql: sleeperStatsSql },
-  { version: 11, name: 'stats_views', sql: statsViewsSql }
+  { version: 11, name: 'stats_views', sql: statsViewsSql },
+  { version: 12, name: 'ask_examples', sql: askExamplesSql }
 ]
```

Create `src/main/db/repos/askExamples.ts`:

```ts
import type { Db } from '../connection'

/** Ask spec §5.3: a verified question → tool-call pair (`ask_examples`). */
export interface AskExample {
  id: number
  question: string
  masked: string
  tool: string
  args: Record<string, unknown>
  resultHash: string | null
  source: 'user' | 'seed'
  verifiedAt: string
}

interface ExampleRow {
  id: number
  question: string
  masked: string
  tool: string
  args_json: string
  result_hash: string | null
  source: 'user' | 'seed'
  verified_at: string
}

/** Adds a pair; the same masked question answered by the same call is kept once. */
export function addAskExample(db: Db, e: Omit<AskExample, 'id'>): void {
  db.prepare(
    `INSERT OR IGNORE INTO ask_examples (question, masked, tool, args_json, result_hash, source, verified_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(e.question, e.masked, e.tool, JSON.stringify(e.args), e.resultHash, e.source, e.verifiedAt)
}

/** Every pair, newest first; a row whose arguments do not parse is left out. */
export function listAskExamples(db: Db): AskExample[] {
  const rows = db
    .prepare('SELECT * FROM ask_examples ORDER BY verified_at DESC, id DESC')
    .all() as unknown as ExampleRow[]
  return rows.flatMap((r) => {
    try {
      const args = JSON.parse(r.args_json) as Record<string, unknown>
      return [
        {
          id: r.id,
          question: r.question,
          masked: r.masked,
          tool: r.tool,
          args,
          resultHash: r.result_hash,
          source: r.source,
          verifiedAt: r.verified_at
        }
      ]
    } catch {
      return []
    }
  })
}

export function deleteAskExample(db: Db, id: number): void {
  db.prepare('DELETE FROM ask_examples WHERE id = ?').run(id)
}
```

- [ ] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/trace.test.ts tests/main/db/migrate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Check and commit**

```bash
npx prettier --write src/main/analyst/trace.ts src/main/db/migrations/index.ts src/main/db/repos/askExamples.ts tests/main/analyst/trace.test.ts tests/main/db/migrate.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/trace.ts src/main/db/migrations/012_ask_examples.sql src/main/db/migrations/index.ts src/main/db/repos/askExamples.ts tests/main/analyst/trace.test.ts tests/main/db/migrate.test.ts
git commit -m "feat(analyst): traces and the example library"
```

Expected: typecheck and lint clean; the suite at 1,253 passed, 5 skipped (a clean checkout).

---

### Task 9: The evaluation questions and the AF1 gate (spec §7, §10; amendment I)

163 questions in 16 categories (116 dev, 47 held out), each with what the app must do and a reference call; a structural test in `npm test`, and the gate `npm run test:ask` that runs every reference call on a copy of the frozen database and measures the resolver on the whole set. Writing the set found six resolver gaps, fixed first (Step 1): plurals ("touchdown"), "Bills vs Chiefs" as a comparison, a position after "allow to", "tackles" read as a position, three classifier phrasings ("games in week 8", "who won", "scoring set up in my league"), EPA under pressure as its own metric, and "lately" as the last 4 games.

**Files:**

- Create: `tests/ask/questions.json`, `tests/ask/questions.test.ts`, `tests/ask/questions.ts`, `tests/ask/references.live.test.ts`
- Modify: `package.json`, `src/main/analyst/classify.ts`, `src/main/analyst/metrics.ts`, `src/main/analyst/players.ts`, `src/main/analyst/slots.ts`, `src/main/analyst/teams.ts`, `src/main/analyst/time.ts`, `tests/main/analyst/resolve.test.ts`

- [ ] **Step 1: Write the tests**

Modify `tests/main/analyst/resolve.test.ts`:

```diff
diff --git a/tests/main/analyst/resolve.test.ts b/tests/main/analyst/resolve.test.ts
index 8205e15..ff2392a 100644
--- a/tests/main/analyst/resolve.test.ts
+++ b/tests/main/analyst/resolve.test.ts
@@ -40,10 +40,15 @@ describe('teams', () => {
     expect(findTeams('RB yards against the Ravens').map((t) => [t.code, t.role])).toEqual([
       ['BAL', 'opponent']
     ])
-    expect(findTeams('Kansas City vs NO').map((t) => [t.code, t.role])).toEqual([
+    expect(findTeams('How do the Chiefs play against NO?').map((t) => [t.code, t.role])).toEqual([
       ['KC', 'subject'],
       ['NO', 'opponent']
     ])
+    // Two teams around "vs" are both the subject of a comparison.
+    expect(findTeams('Bills vs Chiefs: playoff odds').map((t) => [t.code, t.role])).toEqual([
+      ['BUF', 'subject'],
+      ['KC', 'subject']
+    ])
     // "no" and "la" in a sentence are words; Los Angeles needs the nickname.
     expect(findTeams('no one in los angeles')).toEqual([])
   })
@@ -119,10 +124,12 @@ describe('slots', () => {
     expect(detectSlots('most red-zone carries').flags).toEqual([])
     expect(detectSlots('Chase against man coverage').flags).toEqual(['man_coverage'])
     expect(detectSlots('which defenses blitz the most').flags).toEqual([])
-    expect(detectSlots('EPA when pressured on third down').flags).toEqual([
+    expect(detectSlots('completion rate when pressured on third down').flags).toEqual([
       'third_down',
       'pressure'
     ])
+    // EPA under pressure is a metric of its own.
+    expect(detectSlots('best EPA under pressure').flags).toEqual([])
   })

   it('detects groupings, rostered, a row count and the bottom of a ranking', () => {
```

- [ ] **Step 2: Implement**

Modify `src/main/analyst/classify.ts`:

```diff
diff --git a/src/main/analyst/classify.ts b/src/main/analyst/classify.ts
index e657358..45489c4 100644
--- a/src/main/analyst/classify.ts
+++ b/src/main/analyst/classify.ts
@@ -45,10 +45,10 @@ const ADVICE =
   / (should i|start or sit|who do i start|who should i start|who to start|sit or start|drop or|trade for|trade away|should i trade|worth a pick up|pick up or|is it worth starting|bench or) /
 const DEFINITION = / (what is|what are|what does|whats|define|definition of|explain|meaning of) /
 const GAMES =
-  / (schedule|who do they play|who does .* play|play next|playing next|kickoff|final score|box score|game preview|preview of|result of|won the game|elo vs vegas) /
+  / (schedule|who do they play|who does .* play|play next|playing next|kickoff|final score|box score|game preview|preview of|result of|who won|won the game|elo vs vegas|(games|matchups) (in|this|next) week|week \d+ (games|matchups)) /
 const SCHEDULE_METRIC = / (remaining|easiest|hardest|toughest|strength of|softest) schedule /
 const LEAGUE =
-  / (who owns|who has .* (rostered|on their team|on his team)|rostered by|my roster|show my team|my lineup|scoring settings|league scoring|how is .* scored|points per reception in my league) /
+  / (who owns|who has .* (rostered|on their team|on his team)|rostered by|my roster|show my team|my lineup|scoring settings|scoring set up|scoring rules|league scoring|how is .* scored|in my league) /
 const OUTLOOK =
   / (outlook|regression|due for|running hot|running cold|bounce back|forecast for|ceiling and floor|buy low|sell high) /
 const RANKING =
@@ -70,7 +70,7 @@ export function classify(
   if (ADVICE.test(t)) return 'advice'
   if (r.outOfRange) return 'out_of_range'
   const named = r.players + r.ambiguous
-  if (named === 0 && r.teams === 0 && DEFINITION.test(t)) return 'definition'
+  if (named === 0 && r.teams === 0 && DEFINITION.test(t) && !GAMES.test(t)) return 'definition'
   if (LEAGUE.test(t) && !(r.rostered === 'free' && r.metricHint)) return 'league'
   // "Easiest remaining schedule" and "strength of schedule" are rankings of a metric.
   if (GAMES.test(t) && !SCHEDULE_METRIC.test(t)) return 'games'
```

Modify `src/main/analyst/metrics.ts`:

```diff
diff --git a/src/main/analyst/metrics.ts b/src/main/analyst/metrics.ts
index f52b33a..7b8aef1 100644
--- a/src/main/analyst/metrics.ts
+++ b/src/main/analyst/metrics.ts
@@ -24,10 +24,21 @@ const STOP = new Set(
   )
 )

+/** A light stem: plurals to singular ("touchdowns", "carries"), so either form matches. */
+export const stem = (t: string): string =>
+  t.length > 4 && t.endsWith('ies')
+    ? `${t.slice(0, -3)}y`
+    : t.length > 3 && t.endsWith('s') && !t.endsWith('ss')
+      ? t.slice(0, -1)
+      : t
+
+const stemmed = (key: string): string => key.split(' ').map(stem).join(' ')
+
 const tokens = (text: string): string[] =>
   phraseKey(text)
     .split(' ')
     .filter((t) => t.length > 0 && !STOP.has(t))
+    .map(stem)

 /** Whole phrases worth a bonus when the question says them: aliases, labels, short names. */
 interface Phrase {
@@ -61,9 +72,13 @@ export function lexicalRetriever(metrics: MetricDef[] = SHOWN): Retriever {
   const df = new Map<string, number>()
   for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)
   const phrases: Phrase[] = metrics.flatMap((m) => [
-    ...(METRIC_ALIASES[m.id] ?? []).map((a) => ({ key: phraseKey(a), id: m.id, bonus: 6 })),
-    { key: phraseKey(m.label), id: m.id, bonus: 5 },
-    ...(m.short.length >= 3 ? [{ key: phraseKey(m.short), id: m.id, bonus: 3 }] : [])
+    ...(METRIC_ALIASES[m.id] ?? []).map((a) => ({
+      key: stemmed(phraseKey(a)),
+      id: m.id,
+      bonus: 6
+    })),
+    { key: stemmed(phraseKey(m.label)), id: m.id, bonus: 5 },
+    ...(m.short.length >= 3 ? [{ key: stemmed(phraseKey(m.short)), id: m.id, bonus: 3 }] : [])
   ])
   const index = new Map(metrics.map((m, i) => [m.id, i]))
   return {
@@ -80,7 +95,7 @@ export function lexicalRetriever(metrics: MetricDef[] = SHOWN): Retriever {
         }
         return s
       })
-      const text = padded(question)
+      const text = ` ${stemmed(phraseKey(question))} `
       // The longest phrase said whole wins its bonus once per metric.
       const best = new Map<string, number>()
       for (const p of phrases) {
@@ -112,7 +127,7 @@ export function fits(
 ): (m: MetricDef) => boolean {
   // "His team's targets" is about a player: the possessive is dropped before "teams" is looked for.
   const t = padded(question.replace(/['’]s\b/g, '')).replace(
-    / (on the|against the|against|allowed to) \w+/g,
+    / (on the|against the|against|allowed to|allows? to|allowing to) \w+/g,
     ' '
   )
   const team =
```

Modify `src/main/analyst/players.ts`:

```diff
diff --git a/src/main/analyst/players.ts b/src/main/analyst/players.ts
index 441b936..721e86f 100644
--- a/src/main/analyst/players.ts
+++ b/src/main/analyst/players.ts
@@ -123,14 +123,18 @@ const POSITION_WORDS: [RegExp, string[]][] = [
   [/\b(receivers?|pass catchers?)\b/, ['WR', 'TE', 'RB']],
   [/\b(kickers?)\b/, ['K']],
   [/\b(punters?)\b/, ['P']],
-  [/\b(edges?|edge rushers?|pass rushers?|defensive ends?|tackles)\b/, ['DL', 'LB']],
+  [/\b(edges?|edge rushers?|pass rushers?|defensive ends?)\b/, ['DL', 'LB']],
+  [/\b(dts?|defensive tackles?|d line|defensive line(men|man)?)\b/, ['DL']],
   [/\b(linebackers?|lbs?)\b/, ['LB']],
   [/\b(cornerbacks?|cbs?|corners?|safet(y|ies)|dbs?)\b/, ['DB']]
 ]

 export function positionsIn(question: string): string[] {
   // A position after "on the", "against" or "allowed to" is the object ("pressure on the quarterback").
-  const t = ` ${phraseKey(question)} `.replace(/ (on the|against the|against|allowed to) \w+/g, ' ')
+  const t = ` ${phraseKey(question)} `.replace(
+    / (on the|against the|against|allowed to|allows? to|allowing to) \w+/g,
+    ' '
+  )
   return [...new Set(POSITION_WORDS.filter(([rx]) => rx.test(t)).flatMap(([, p]) => p))]
 }

```

Modify `src/main/analyst/slots.ts`:

```diff
diff --git a/src/main/analyst/slots.ts b/src/main/analyst/slots.ts
index 8fff208..acf71cf 100644
--- a/src/main/analyst/slots.ts
+++ b/src/main/analyst/slots.ts
@@ -74,7 +74,7 @@ const NAMED_IN_METRIC: [RegExp, Flag][] = [
   [/ (play action rate|play action usage)/, 'play_action'],
   [/ (third down conversion|third down defense|third down offense)/, 'third_down'],
   [
-    / (pressure rate|pressures|pressure on the|generates pressure|pressure generated|pressure allowed)/,
+    / (pressure rate|pressures|pressure on the|generates pressure|pressure generated|pressure allowed|epa (under|when) pressure)/,
     'pressure'
   ],
   [/ (neutral pass rate|neutral pace|neutral proe|neutral situation proe)/, 'neutral']
```

Modify `src/main/analyst/teams.ts`:

```diff
diff --git a/src/main/analyst/teams.ts b/src/main/analyst/teams.ts
index 79c8812..4aab994 100644
--- a/src/main/analyst/teams.ts
+++ b/src/main/analyst/teams.ts
@@ -61,10 +61,14 @@ export interface TeamMention {
   role: 'subject' | 'opponent'
 }

-/** Teams named in the question, longest phrase first, each once. */
+/**
+ * Teams named in the question, longest phrase first, each once. A team after "vs", "against" or
+ * "facing" is an opponent ("RB yards against the Ravens"), except in "Bills vs Chiefs", where both
+ * teams are the subject of a comparison.
+ */
 export function findTeams(question: string): TeamMention[] {
   const ws: Word[] = words(question)
-  const found: TeamMention[] = []
+  const found: (TeamMention & { start: number; end: number; marker: string | null })[] = []
   const used = new Set<number>()
   for (let n = 3; n >= 1; n--) {
     for (let i = 0; i + n <= ws.length; i++) {
@@ -73,20 +77,29 @@ export function findTeams(question: string): TeamMention[] {
       const key = slice.map((w) => w.key).join(' ')
       let code = ALIASES.get(key)
       if (!code && n === 1 && CODES.has(slice[0].raw)) code = slice[0].raw
-      // A lower-case two-letter code is a word ("no", "la"); "kc" and "sf" are in the slang.
-      if (code && n === 1 && /^[a-z]{2}$/.test(slice[0].raw) && !SLANG[code]?.includes(key)) {
-        continue
-      }
       if (!code || found.some((t) => t.code === code)) continue
       // "against the Ravens": the word before "the" says it.
-      const before = ws[i - 1]?.key === 'the' ? ws[i - 2]?.key : ws[i - 1]?.key
+      const at = ws[i - 1]?.key === 'the' ? i - 2 : i - 1
+      const marker = ws[at] && OPPONENT_WORDS.has(ws[at].key) ? ws[at].key : null
       found.push({
         code,
         mention: slice.map((w) => w.raw).join(' '),
-        role: before && OPPONENT_WORDS.has(before) ? 'opponent' : 'subject'
+        role: marker ? 'opponent' : 'subject',
+        start: i,
+        end: i + n - 1,
+        marker: marker ? String(at) : null
       })
       for (let k = 0; k < n; k++) used.add(i + k)
     }
   }
+  // "Bills vs Chiefs": a team right before "vs" makes the one after it a second subject.
+  for (const t of found) {
+    if (t.role !== 'opponent' || t.marker === null) continue
+    const at = Number(t.marker)
+    if (!['vs', 'versus', 'v'].includes(ws[at].key)) continue
+    if (found.some((o) => o !== t && o.end === at - 1)) t.role = 'subject'
+  }
   return found
+    .sort((a, b) => a.start - b.start)
+    .map(({ code, mention, role }) => ({ code, mention, role }))
 }
```

Modify `src/main/analyst/time.ts`:

```diff
diff --git a/src/main/analyst/time.ts b/src/main/analyst/time.ts
index bae9348..7dbb61b 100644
--- a/src/main/analyst/time.ts
+++ b/src/main/analyst/time.ts
@@ -131,6 +131,9 @@ export function resolveTime(question: string, now: Now): ResolvedTime {
     const w = Math.min(22, latestWeek + 1)
     out.weeks = [w, w]
     say('next week', `week ${w} of ${now.season}`)
+  } else if (/ (lately|recently|of late) /.test(t)) {
+    out.lastNGames = 4
+    say(t.match(/ (lately|recently|of late) /)![1], "each player's last 4 games")
   } else if (/ (last|this) week /.test(t)) {
     out.weeks = [latestWeek, latestWeek]
     say(t.match(/ (last|this) week /)![0].trim(), `week ${latestWeek} of ${now.season}`)
```

- [ ] **Step 3: Run them and see them pass**

```bash
npx vitest run tests/main/analyst/resolve.test.ts
```

Expected: PASS.

- [ ] **Step 4: Check and commit**

```bash
npx prettier --write src/main/analyst/classify.ts src/main/analyst/metrics.ts src/main/analyst/players.ts src/main/analyst/slots.ts src/main/analyst/teams.ts src/main/analyst/time.ts tests/main/analyst/resolve.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add src/main/analyst/classify.ts src/main/analyst/metrics.ts src/main/analyst/players.ts src/main/analyst/slots.ts src/main/analyst/teams.ts src/main/analyst/time.ts tests/main/analyst/resolve.test.ts
git commit -m "fix(analyst): resolver fixes from the question set"
```

Expected: typecheck and lint clean; the suite at 1,253 passed, 5 skipped (a clean checkout).

- [ ] **Step 5: Write the tests**

Create `tests/ask/questions.json`:

```json
{
  "about": "Ask spec §7: the evaluation questions. Each has a category, what the app must do (answer, ask, decline, answer_or_ask), and a reference tool call that answers it on the frozen database. Dev questions tune the brief and the profiles; held-out ones only gate (never tuned on). Paraphrases are added in Plan AG.",
  "frozen": {
    "season": 2026,
    "through": 7,
    "seasonType": "REG",
    "note": "A copy of stats.duckdb through 2026 week 7 (v0.36.0, derived 3, models 1); its path comes from FFC_ASK_DB."
  },
  "questions": [
    {
      "category": "leaderboard",
      "question": "Who leads WRs in yards per route run since week 5?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "yprr",
          "position": "WR",
          "seasons": [2026],
          "weeks": [5, 7]
        }
      },
      "id": "leaderboard-01",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Best tight end by targets per route run this season",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "tprr",
          "position": "TE",
          "seasons": [2026]
        }
      },
      "id": "leaderboard-02",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Which QBs had the best CPOE in 2025?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "cpoe",
          "position": "QB",
          "seasons": [2025]
        }
      },
      "id": "leaderboard-03",
      "split": "heldout"
    },
    {
      "category": "leaderboard",
      "question": "Top 5 running backs in rush yards over expected per carry",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "ryoe_att",
          "position": "RB",
          "limit": 5
        }
      },
      "id": "leaderboard-04",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Which defenses blitz the most?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "def_blitz_rate"
        }
      },
      "id": "leaderboard-05",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Which teams have the best playoff odds right now?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "playoff_pct"
        }
      },
      "id": "leaderboard-06",
      "split": "heldout"
    },
    {
      "category": "leaderboard",
      "question": "Most red-zone carries among running backs last season",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "rz_carries",
          "position": "RB",
          "seasons": [2025]
        }
      },
      "id": "leaderboard-07",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Who has the highest target share among WRs over the last 3 weeks?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "target_share",
          "position": "WR",
          "seasons": [2026],
          "weeks": [5, 7]
        }
      },
      "id": "leaderboard-08",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Most receiving yards this season",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "rec_yds",
          "seasons": [2026]
        }
      },
      "id": "leaderboard-09",
      "split": "heldout"
    },
    {
      "category": "leaderboard",
      "question": "Rushing touchdown leaders in 2025",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "rush_td",
          "seasons": [2025]
        }
      },
      "id": "leaderboard-10",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Which QB gets sacked the most often?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "sack_rate",
          "position": "QB"
        }
      },
      "id": "leaderboard-11",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Best quarterbacks by EPA per dropback since week 4",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "qb_epa_db",
          "position": "QB",
          "seasons": [2026],
          "weeks": [4, 7]
        }
      },
      "id": "leaderboard-12",
      "split": "heldout"
    },
    {
      "category": "leaderboard",
      "question": "Who gets the most separation from defenders?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "separation"
        }
      },
      "id": "leaderboard-13",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Which receivers have the most boom weeks this year?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "boom_rate",
          "position": "WR",
          "seasons": [2026]
        }
      },
      "id": "leaderboard-14",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Highest fantasy points per game among RBs",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "fantasy_ppg",
          "position": "RB"
        }
      },
      "id": "leaderboard-15",
      "split": "heldout"
    },
    {
      "category": "leaderboard",
      "question": "Who scores the most PPG at tight end?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "fantasy_ppg",
          "position": "TE"
        }
      },
      "id": "leaderboard-16",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Expected fantasy points leaders at WR in 2025",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "expected_points",
          "position": "WR",
          "seasons": [2025]
        }
      },
      "id": "leaderboard-17",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Who drops the most catchable passes?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "drop_rate"
        }
      },
      "id": "leaderboard-18",
      "split": "heldout"
    },
    {
      "category": "leaderboard",
      "question": "Which offenses play fastest in neutral situations?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "neutral_pace"
        }
      },
      "id": "leaderboard-19",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Teams with the highest implied team total",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "implied_points"
        }
      },
      "id": "leaderboard-20",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Which teams pass more than expected?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "proe"
        }
      },
      "id": "leaderboard-21",
      "split": "heldout"
    },
    {
      "category": "leaderboard",
      "question": "Best pass defenses by EPA per dropback allowed in 2025",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "def_pass_epa",
          "seasons": [2025]
        }
      },
      "id": "leaderboard-22",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Who are the worst 5 defenses against the run?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "def_rush_epa",
          "order": "worst",
          "limit": 5
        }
      },
      "id": "leaderboard-23",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Edge rushers with the most sacks in 2025",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "sacks",
          "seasons": [2025]
        }
      },
      "id": "leaderboard-24",
      "split": "heldout"
    },
    {
      "category": "leaderboard",
      "question": "Cornerbacks with the lowest passer rating allowed last season",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "coverage_rating",
          "position": "DB",
          "seasons": [2025]
        }
      },
      "id": "leaderboard-25",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Best long-distance kicker in 2025",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "fg_pct_50p",
          "position": "K",
          "seasons": [2025]
        }
      },
      "id": "leaderboard-26",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Kickers ranked by field goals over expected",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "fgoe"
        }
      },
      "id": "leaderboard-27",
      "split": "heldout"
    },
    {
      "category": "leaderboard",
      "question": "Which teams have the easiest remaining schedule?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "sos_left_elo"
        }
      },
      "id": "leaderboard-28",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "QBs who get rid of the ball fastest",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "time_to_throw",
          "position": "QB"
        }
      },
      "id": "leaderboard-29",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Which defenses play the most man coverage in 2025?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "def_man_rate",
          "seasons": [2025]
        }
      },
      "id": "leaderboard-30",
      "split": "heldout"
    },
    {
      "category": "leaderboard",
      "question": "High value touches leaders at running back",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "high_value_touches",
          "position": "RB"
        }
      },
      "id": "leaderboard-31",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Yards after contact per carry leaders in 2025",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "yac_att",
          "position": "RB",
          "seasons": [2025]
        }
      },
      "id": "leaderboard-32",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "WOPR leaders this season",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "wopr",
          "seasons": [2026]
        }
      },
      "id": "leaderboard-33",
      "split": "heldout"
    },
    {
      "category": "leaderboard",
      "question": "Who leads the league in air yards share?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "air_yards_share"
        }
      },
      "id": "leaderboard-34",
      "split": "dev"
    },
    {
      "category": "leaderboard",
      "question": "Best free-agent TE by target share",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "target_share",
          "position": "TE",
          "rostered": "free"
        }
      },
      "needsLeague": true,
      "id": "leaderboard-35",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "How many passing TDs did Josh Allen throw in 2025?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0034857",
          "metrics": ["pass_td"],
          "seasons": [2025]
        }
      },
      "id": "lookup-01",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "Bijan Robinson's rushing yards this season",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0038542",
          "metrics": ["rush_yds"],
          "seasons": [2026]
        }
      },
      "id": "lookup-02",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "How many receptions did CeeDee Lamb have in 2025?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0036358",
          "metrics": ["receptions"],
          "seasons": [2025]
        }
      },
      "id": "lookup-03",
      "split": "heldout"
    },
    {
      "category": "lookup",
      "question": "Lamar Jackson's rushing yards in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0034796",
          "metrics": ["rush_yds"],
          "seasons": [2025]
        }
      },
      "id": "lookup-04",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "Brock Bowers' yards per route run in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0039338",
          "metrics": ["yprr"],
          "seasons": [2025]
        }
      },
      "id": "lookup-05",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "What is Puka Nacua's target share this year?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0039075",
          "metrics": ["target_share"],
          "seasons": [2026]
        }
      },
      "id": "lookup-06",
      "split": "heldout"
    },
    {
      "category": "lookup",
      "question": "How is Jahmyr Gibbs doing this season?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0039139",
          "seasons": [2026]
        }
      },
      "id": "lookup-07",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "Drake Maye's CPOE in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0039851",
          "metrics": ["cpoe"],
          "seasons": [2025]
        }
      },
      "id": "lookup-08",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "How many targets does Trey McBride have?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0037744",
          "metrics": ["targets"]
        }
      },
      "id": "lookup-09",
      "split": "heldout"
    },
    {
      "category": "lookup",
      "question": "Saquon Barkley's yards per carry last season",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0034844",
          "metrics": ["rush_ypc"],
          "seasons": [2025]
        }
      },
      "id": "lookup-10",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "cmc rushing yards last 4 games",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0033280",
          "metrics": ["rush_yds"],
          "last_games": 4,
          "seasons": [2026]
        }
      },
      "id": "lookup-11",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "Justin Jefferson's catch rate this season",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0036322",
          "metrics": ["catch_rate"],
          "seasons": [2026]
        }
      },
      "id": "lookup-12",
      "split": "heldout"
    },
    {
      "category": "lookup",
      "question": "How many sacks does T.J. Watt have this year?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0033886",
          "metrics": ["sacks"],
          "seasons": [2026]
        }
      },
      "id": "lookup-13",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "Brandon Aubrey's field goal percentage in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0037692",
          "metrics": ["fg_pct"],
          "seasons": [2025]
        }
      },
      "id": "lookup-14",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "Jaxon Smith-Njigba's receiving yards this season",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0038543",
          "metrics": ["rec_yds"],
          "seasons": [2026]
        }
      },
      "id": "lookup-15",
      "split": "heldout"
    },
    {
      "category": "lookup",
      "question": "Jayden Daniels' rushing yards in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0039910",
          "metrics": ["rush_yds"],
          "seasons": [2025]
        }
      },
      "id": "lookup-16",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "Derrick Henry's rushing touchdowns since 2023",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0032764",
          "metrics": ["rush_td"],
          "seasons": [2023, 2024, 2025, 2026]
        }
      },
      "id": "lookup-17",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "Josh Allen EPA per dropback this year",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0034857",
          "metrics": ["qb_epa_db"],
          "seasons": [2026]
        }
      },
      "id": "lookup-18",
      "split": "heldout"
    },
    {
      "category": "lookup",
      "question": "Christian McCaffery yards after contact in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0033280",
          "metrics": ["yac_att"],
          "seasons": [2025]
        }
      },
      "id": "lookup-19",
      "split": "dev"
    },
    {
      "category": "lookup",
      "question": "Ashton Jeanty's snap share this season",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0040122",
          "metrics": ["snap_share"],
          "seasons": [2026]
        }
      },
      "id": "lookup-20",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "How does Ja'Marr Chase do against man coverage in 2025?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0036900",
          "seasons": [2025],
          "coverage": "man"
        }
      },
      "id": "split-01",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Show me Bijan Robinson's game log this season",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0038542",
          "seasons": [2026],
          "by": "week"
        }
      },
      "id": "split-02",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "What is Josh Allen's EPA per dropback when he's pressured in 2025?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0034857",
          "metrics": ["qb_epa_db"],
          "seasons": [2025],
          "pressure": true
        }
      },
      "id": "split-03",
      "split": "heldout"
    },
    {
      "category": "split",
      "question": "How many yards per carry does Derrick Henry average in the red zone?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0032764",
          "metrics": ["rush_ypc"],
          "red_zone": true
        }
      },
      "id": "split-04",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Puka Nacua's target share by week",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0039075",
          "metrics": ["target_share"],
          "by": "week"
        }
      },
      "id": "split-05",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "man vs zone splits for Garrett Wilson in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0037740",
          "seasons": [2025],
          "by": "coverage"
        }
      },
      "id": "split-06",
      "split": "heldout"
    },
    {
      "category": "split",
      "question": "Josh Allen EPA per dropback by down in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0034857",
          "metrics": ["qb_epa_db"],
          "seasons": [2025],
          "by": "down"
        }
      },
      "id": "split-07",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Justin Jefferson catch rate on third down in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0036322",
          "metrics": ["catch_rate"],
          "seasons": [2025],
          "third_down": true
        }
      },
      "id": "split-08",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Chase Brown carries in the red zone this season",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0038597",
          "metrics": ["carries"],
          "seasons": [2026],
          "red_zone": true
        }
      },
      "id": "split-09",
      "split": "heldout"
    },
    {
      "category": "split",
      "question": "How does Patrick Mahomes play against the blitz in 2025?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0033873",
          "seasons": [2025],
          "blitz": true
        }
      },
      "id": "split-10",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Jalen Hurts' EPA on play action in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0036389",
          "metrics": ["qb_epa_db"],
          "seasons": [2025],
          "play_action": true
        }
      },
      "id": "split-11",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Amon-Ra St. Brown's game log in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0036963",
          "seasons": [2025],
          "by": "week"
        }
      },
      "id": "split-12",
      "split": "heldout"
    },
    {
      "category": "split",
      "question": "How does Lamar Jackson do at home vs on the road this season?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0034796",
          "seasons": [2026],
          "home": true
        }
      },
      "id": "split-13",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Kyren Williams' carries inside the 5 in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0037840",
          "metrics": ["carries"],
          "seasons": [2025],
          "goal_line": true
        }
      },
      "id": "split-14",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Travis Kelce targets by season since 2022",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0030506",
          "metrics": ["targets"],
          "seasons": [2022, 2023, 2024, 2025, 2026],
          "by": "season"
        }
      },
      "id": "split-15",
      "split": "heldout"
    },
    {
      "category": "split",
      "question": "Detroit offensive EPA per play by week",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "DET",
          "metrics": ["off_epa_play"],
          "by": "week"
        }
      },
      "id": "split-16",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Baltimore's defense on third down in 2025",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "BAL",
          "side": "defense",
          "seasons": [2025],
          "third_down": true
        }
      },
      "id": "split-17",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Chiefs offense in the red zone this year",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "KC",
          "side": "offense",
          "seasons": [2026],
          "red_zone": true
        }
      },
      "id": "split-18",
      "split": "heldout"
    },
    {
      "category": "split",
      "question": "Ja'Marr Chase yards per route run against the Ravens since 2022",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0036900",
          "metrics": ["yprr"],
          "seasons": [2022, 2023, 2024, 2025, 2026],
          "opponent": "BAL"
        }
      },
      "id": "split-19",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Which RBs have the most rushing yards against the Ravens since 2023?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "rush_yds",
          "position": "RB",
          "seasons": [2023, 2024, 2025, 2026],
          "opponent": "BAL"
        }
      },
      "id": "split-20",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Best WRs by yards per route run against zone coverage in 2025",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "yprr",
          "position": "WR",
          "seasons": [2025],
          "coverage": "zone"
        }
      },
      "id": "split-21",
      "split": "heldout"
    },
    {
      "category": "split",
      "question": "Which QBs have the best EPA under pressure in 2025?",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "pressured_epa",
          "position": "QB",
          "seasons": [2025]
        }
      },
      "id": "split-22",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Most red zone targets among tight ends this year",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "targets",
          "position": "TE",
          "seasons": [2026],
          "red_zone": true
        }
      },
      "id": "split-23",
      "split": "dev"
    },
    {
      "category": "split",
      "question": "Best rushing success rate on third down in 2025",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "rush_success",
          "seasons": [2025],
          "third_down": true
        }
      },
      "id": "split-24",
      "split": "heldout"
    },
    {
      "category": "split",
      "question": "Sam LaPorta targets in two-minute situations in 2025",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0039065",
          "metrics": ["targets"],
          "seasons": [2025],
          "two_minute": true
        }
      },
      "id": "split-25",
      "split": "dev"
    },
    {
      "category": "compare",
      "question": "Compare Ja'Marr Chase and CeeDee Lamb in yards per route run",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["00-0036900", "00-0036358"],
          "metrics": ["yprr"]
        }
      },
      "id": "compare-01",
      "split": "dev"
    },
    {
      "category": "compare",
      "question": "Bijan vs Gibbs: fantasy points per game this season",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["00-0038542", "00-0039139"],
          "metrics": ["fantasy_ppg"],
          "seasons": [2026]
        }
      },
      "id": "compare-02",
      "split": "dev"
    },
    {
      "category": "compare",
      "question": "Who has more yards per route run, Puka or JSN?",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["00-0039075", "00-0038543"],
          "metrics": ["yprr"]
        }
      },
      "id": "compare-03",
      "split": "heldout"
    },
    {
      "category": "compare",
      "question": "Compare the Ravens and Bengals offenses by EPA per play",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["BAL", "CIN"],
          "metrics": ["off_epa_play"]
        }
      },
      "id": "compare-04",
      "split": "dev"
    },
    {
      "category": "compare",
      "question": "Kyren Williams vs Bijan Robinson yards after contact over the last 3 weeks",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["00-0037840", "00-0038542"],
          "metrics": ["yac_att"],
          "seasons": [2026],
          "weeks": [5, 7]
        }
      },
      "id": "compare-05",
      "split": "dev"
    },
    {
      "category": "compare",
      "question": "Josh Allen or Lamar Jackson: who has the better EPA per dropback in 2025?",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["00-0034857", "00-0034796"],
          "metrics": ["qb_epa_db"],
          "seasons": [2025]
        }
      },
      "id": "compare-06",
      "split": "heldout"
    },
    {
      "category": "compare",
      "question": "Compare Brock Bowers, Trey McBride and George Kittle by target share in 2025",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["00-0039338", "00-0037744", "00-0033288"],
          "metrics": ["target_share"],
          "seasons": [2025]
        }
      },
      "id": "compare-07",
      "split": "dev"
    },
    {
      "category": "compare",
      "question": "Eagles vs Cowboys defense: EPA per play allowed this year",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["PHI", "DAL"],
          "metrics": ["def_epa_play"],
          "seasons": [2026]
        }
      },
      "id": "compare-08",
      "split": "dev"
    },
    {
      "category": "compare",
      "question": "Saquon Barkley and Derrick Henry rushing yards in 2025",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["00-0034844", "00-0032764"],
          "metrics": ["rush_yds"],
          "seasons": [2025]
        }
      },
      "id": "compare-09",
      "split": "heldout"
    },
    {
      "category": "compare",
      "question": "Malik Nabers vs Garrett Wilson targets per route run",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["00-0039337", "00-0037740"],
          "metrics": ["tprr"]
        }
      },
      "id": "compare-10",
      "split": "dev"
    },
    {
      "category": "compare",
      "question": "Compare Jordan Love and Drake Maye in CPOE last season",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["00-0036264", "00-0039851"],
          "metrics": ["cpoe"],
          "seasons": [2025]
        }
      },
      "id": "compare-11",
      "split": "dev"
    },
    {
      "category": "compare",
      "question": "Bills vs Chiefs: playoff odds",
      "expect": "answer",
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["BUF", "KC"],
          "metrics": ["playoff_pct"]
        }
      },
      "id": "compare-12",
      "split": "heldout"
    },
    {
      "category": "trend",
      "question": "Josh Allen's EPA per dropback over the years",
      "expect": "answer",
      "reference": {
        "tool": "trend",
        "args": {
          "id": "00-0034857",
          "metric": "qb_epa_db"
        }
      },
      "id": "trend-01",
      "split": "dev"
    },
    {
      "category": "trend",
      "question": "Travis Kelce's yards per route run by season since 2019",
      "expect": "answer",
      "reference": {
        "tool": "trend",
        "args": {
          "id": "00-0030506",
          "metric": "yprr",
          "from": 2019
        }
      },
      "id": "trend-02",
      "split": "dev"
    },
    {
      "category": "trend",
      "question": "Derrick Henry's yards per carry trend",
      "expect": "answer",
      "reference": {
        "tool": "trend",
        "args": {
          "id": "00-0032764",
          "metric": "rush_ypc"
        }
      },
      "id": "trend-03",
      "split": "heldout"
    },
    {
      "category": "trend",
      "question": "The Chiefs' offensive EPA per play year by year",
      "expect": "answer",
      "reference": {
        "tool": "trend",
        "args": {
          "id": "KC",
          "metric": "off_epa_play"
        }
      },
      "id": "trend-04",
      "split": "dev"
    },
    {
      "category": "trend",
      "question": "Aaron Rodgers' CPOE across his seasons since 2019",
      "expect": "answer",
      "reference": {
        "tool": "trend",
        "args": {
          "id": "00-0023459",
          "metric": "cpoe"
        }
      },
      "id": "trend-05",
      "split": "dev"
    },
    {
      "category": "trend",
      "question": "Davante Adams' target share career trend",
      "expect": "answer",
      "reference": {
        "tool": "trend",
        "args": {
          "id": "00-0031381",
          "metric": "target_share"
        }
      },
      "id": "trend-06",
      "split": "heldout"
    },
    {
      "category": "trend",
      "question": "Ravens' rushing EPA since 2020",
      "expect": "answer",
      "reference": {
        "tool": "trend",
        "args": {
          "id": "BAL",
          "metric": "off_rush_epa",
          "from": 2020
        }
      },
      "id": "trend-07",
      "split": "dev"
    },
    {
      "category": "trend",
      "question": "Alvin Kamara's yards after contact over time",
      "expect": "answer",
      "reference": {
        "tool": "trend",
        "args": {
          "id": "00-0033906",
          "metric": "yac_att"
        }
      },
      "id": "trend-08",
      "split": "dev"
    },
    {
      "category": "team",
      "question": "How good is the Ravens' run defense this year?",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "BAL",
          "side": "defense",
          "metrics": ["def_rush_epa"],
          "seasons": [2026]
        }
      },
      "id": "team-01",
      "split": "dev"
    },
    {
      "category": "team",
      "question": "How is the Lions' offense this season?",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "DET",
          "side": "offense",
          "seasons": [2026]
        }
      },
      "id": "team-02",
      "split": "dev"
    },
    {
      "category": "team",
      "question": "Bills defense in 2025",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "BUF",
          "side": "defense",
          "seasons": [2025]
        }
      },
      "id": "team-03",
      "split": "heldout"
    },
    {
      "category": "team",
      "question": "What's the Eagles' pass rate over expected?",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "PHI",
          "metrics": ["proe"]
        }
      },
      "id": "team-04",
      "split": "dev"
    },
    {
      "category": "team",
      "question": "Niners' Elo rating right now",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "SF",
          "metrics": ["elo"]
        }
      },
      "id": "team-05",
      "split": "dev"
    },
    {
      "category": "team",
      "question": "How often do the Steelers blitz?",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "PIT",
          "metrics": ["def_blitz_rate"]
        }
      },
      "id": "team-06",
      "split": "heldout"
    },
    {
      "category": "team",
      "question": "The Packers' points per drive in 2025",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "GB",
          "metrics": ["points_per_drive"],
          "seasons": [2025]
        }
      },
      "id": "team-07",
      "split": "dev"
    },
    {
      "category": "team",
      "question": "Jets' third down conversion rate this year",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "NYJ",
          "metrics": ["off_third_down_pct"],
          "seasons": [2026]
        }
      },
      "id": "team-08",
      "split": "dev"
    },
    {
      "category": "team",
      "question": "What are the Chargers' playoff odds?",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "LAC",
          "metrics": ["playoff_pct"]
        }
      },
      "id": "team-09",
      "split": "heldout"
    },
    {
      "category": "team",
      "question": "How many fantasy points do the Cowboys allow to WRs?",
      "expect": "answer",
      "reference": {
        "tool": "team_stats",
        "args": {
          "team": "DAL",
          "metrics": ["fpa_wr"]
        }
      },
      "id": "team-10",
      "split": "dev"
    },
    {
      "category": "games",
      "question": "Who do the Packers play next week?",
      "expect": "answer",
      "reference": {
        "tool": "games",
        "args": {
          "season": 2026,
          "week": 8,
          "team": "GB"
        }
      },
      "id": "games-01",
      "split": "dev"
    },
    {
      "category": "games",
      "question": "What are the games in week 8?",
      "expect": "answer",
      "reference": {
        "tool": "games",
        "args": {
          "season": 2026,
          "week": 8
        }
      },
      "id": "games-02",
      "split": "dev"
    },
    {
      "category": "games",
      "question": "Who won the Bills game in week 3?",
      "expect": "answer",
      "reference": {
        "tool": "games",
        "args": {
          "season": 2026,
          "week": 3,
          "team": "BUF"
        }
      },
      "id": "games-03",
      "split": "heldout"
    },
    {
      "category": "games",
      "question": "Show the Chiefs' schedule this season",
      "expect": "answer",
      "reference": {
        "tool": "games",
        "args": {
          "season": 2026,
          "team": "KC"
        }
      },
      "id": "games-04",
      "split": "dev"
    },
    {
      "category": "games",
      "question": "Box score of the Lions game in week 5",
      "expect": "answer",
      "reference": {
        "tool": "games",
        "args": {
          "season": 2026,
          "week": 5,
          "team": "DET"
        }
      },
      "id": "games-05",
      "split": "dev"
    },
    {
      "category": "outlook",
      "question": "Is Jordan Love due for regression?",
      "expect": "answer",
      "reference": {
        "tool": "outlook",
        "args": {
          "player": "00-0036264"
        }
      },
      "id": "outlook-01",
      "split": "dev"
    },
    {
      "category": "outlook",
      "question": "What's Bijan Robinson's ceiling and floor this season?",
      "expect": "answer",
      "reference": {
        "tool": "outlook",
        "args": {
          "player": "00-0038542"
        }
      },
      "id": "outlook-02",
      "split": "dev"
    },
    {
      "category": "outlook",
      "question": "Is Puka Nacua running hot?",
      "expect": "answer",
      "reference": {
        "tool": "outlook",
        "args": {
          "player": "00-0039075"
        }
      },
      "id": "outlook-03",
      "split": "heldout"
    },
    {
      "category": "outlook",
      "question": "What's the outlook for Breece Hall?",
      "expect": "answer",
      "reference": {
        "tool": "outlook",
        "args": {
          "player": "00-0038120"
        }
      },
      "id": "outlook-04",
      "split": "dev"
    },
    {
      "category": "outlook",
      "question": "Is Mike Evans a sell high?",
      "expect": "answer",
      "reference": {
        "tool": "outlook",
        "args": {
          "player": "00-0031408"
        }
      },
      "id": "outlook-05",
      "split": "dev"
    },
    {
      "category": "league",
      "question": "Who owns Puka Nacua?",
      "expect": "answer",
      "reference": {
        "tool": "league",
        "args": {
          "what": "owner_of",
          "player": "00-0039075"
        }
      },
      "needsLeague": true,
      "id": "league-01",
      "split": "dev"
    },
    {
      "category": "league",
      "question": "Show my roster",
      "expect": "answer",
      "reference": {
        "tool": "league",
        "args": {
          "what": "my_roster"
        }
      },
      "needsLeague": true,
      "id": "league-02",
      "split": "dev"
    },
    {
      "category": "league",
      "question": "How is scoring set up in my league?",
      "expect": "answer",
      "reference": {
        "tool": "league",
        "args": {
          "what": "scoring"
        }
      },
      "needsLeague": true,
      "id": "league-03",
      "split": "heldout"
    },
    {
      "category": "league",
      "question": "Who has Ja'Marr Chase rostered?",
      "expect": "answer",
      "reference": {
        "tool": "league",
        "args": {
          "what": "owner_of",
          "player": "00-0036900"
        }
      },
      "needsLeague": true,
      "id": "league-04",
      "split": "dev"
    },
    {
      "category": "league",
      "question": "Best free agent running backs by fantasy points per game",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "fantasy_ppg",
          "position": "RB",
          "rostered": "free"
        }
      },
      "needsLeague": true,
      "id": "league-05",
      "split": "dev"
    },
    {
      "category": "league",
      "question": "Yards per route run of the receivers on my team",
      "expect": "answer",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "yprr",
          "rostered": "mine"
        }
      },
      "needsLeague": true,
      "id": "league-06",
      "split": "heldout"
    },
    {
      "category": "definition",
      "question": "What does WOPR mean?",
      "expect": "answer",
      "reference": {
        "tool": "describe",
        "args": {
          "metric": "wopr"
        }
      },
      "id": "definition-01",
      "split": "dev"
    },
    {
      "category": "definition",
      "question": "What is RYOE?",
      "expect": "answer",
      "reference": {
        "tool": "describe",
        "args": {
          "metric": "ryoe"
        }
      },
      "id": "definition-02",
      "split": "dev"
    },
    {
      "category": "definition",
      "question": "What does PROE mean?",
      "expect": "answer",
      "reference": {
        "tool": "describe",
        "args": {
          "metric": "proe"
        }
      },
      "id": "definition-03",
      "split": "heldout"
    },
    {
      "category": "definition",
      "question": "Define yards per route run",
      "expect": "answer",
      "reference": {
        "tool": "describe",
        "args": {
          "metric": "yprr"
        }
      },
      "id": "definition-04",
      "split": "dev"
    },
    {
      "category": "definition",
      "question": "What is CPOE?",
      "expect": "answer",
      "reference": {
        "tool": "describe",
        "args": {
          "metric": "cpoe"
        }
      },
      "id": "definition-05",
      "split": "dev"
    },
    {
      "category": "definition",
      "question": "Explain air yards share",
      "expect": "answer",
      "reference": {
        "tool": "describe",
        "args": {
          "metric": "air_yards_share"
        }
      },
      "id": "definition-06",
      "split": "heldout"
    },
    {
      "category": "ambiguous",
      "question": "How many sacks does Byron Young have this season?",
      "expect": "ask",
      "reference": null,
      "id": "ambiguous-01",
      "split": "dev"
    },
    {
      "category": "ambiguous",
      "question": "Jaylon Jones passer rating allowed in 2025",
      "expect": "ask",
      "reference": null,
      "id": "ambiguous-02",
      "split": "dev"
    },
    {
      "category": "ambiguous",
      "question": "Jordan Phillips pressures last season",
      "expect": "ask",
      "reference": null,
      "id": "ambiguous-03",
      "split": "heldout"
    },
    {
      "category": "ambiguous",
      "question": "Marcus Harris tackles this year",
      "expect": "ask",
      "reference": null,
      "id": "ambiguous-04",
      "split": "dev"
    },
    {
      "category": "ambiguous",
      "question": "Jonah Williams snaps this season",
      "expect": "ask",
      "reference": null,
      "id": "ambiguous-05",
      "split": "dev"
    },
    {
      "category": "vague",
      "question": "Who has been good lately at WR?",
      "expect": "answer_or_ask",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "fantasy_ppg",
          "position": "WR",
          "seasons": [2026],
          "last_games": 4
        }
      },
      "id": "vague-01",
      "split": "dev"
    },
    {
      "category": "vague",
      "question": "Best running back this year?",
      "expect": "answer_or_ask",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "fantasy_ppg",
          "position": "RB",
          "seasons": [2026]
        }
      },
      "id": "vague-02",
      "split": "dev"
    },
    {
      "category": "vague",
      "question": "Which defense is good?",
      "expect": "answer_or_ask",
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "def_epa_play"
        }
      },
      "id": "vague-03",
      "split": "heldout"
    },
    {
      "category": "vague",
      "question": "Is Breece Hall good?",
      "expect": "answer_or_ask",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0038120"
        }
      },
      "id": "vague-04",
      "split": "dev"
    },
    {
      "category": "leading",
      "question": "Isn't Bijan Robinson declining lately?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0038542",
          "by": "week",
          "seasons": [2026]
        }
      },
      "id": "leading-01",
      "split": "dev"
    },
    {
      "category": "leading",
      "question": "Mahomes is washed, right? Look at his EPA per dropback",
      "expect": "answer",
      "reference": {
        "tool": "trend",
        "args": {
          "id": "00-0033873",
          "metric": "qb_epa_db"
        }
      },
      "id": "leading-02",
      "split": "dev"
    },
    {
      "category": "leading",
      "question": "Ja'Marr Chase struggles against man coverage, doesn't he?",
      "expect": "answer",
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0036900",
          "by": "coverage",
          "seasons": [2025]
        }
      },
      "id": "leading-03",
      "split": "heldout"
    },
    {
      "category": "leading",
      "question": "Derrick Henry is slowing down, isn't he?",
      "expect": "answer",
      "reference": {
        "tool": "trend",
        "args": {
          "id": "00-0032764",
          "metric": "rush_ypc"
        }
      },
      "id": "leading-04",
      "split": "dev"
    },
    {
      "category": "unanswerable",
      "question": "How many rushing yards did Barry Sanders have in 1997?",
      "expect": "decline",
      "reference": null,
      "id": "unanswerable-01",
      "split": "dev"
    },
    {
      "category": "unanswerable",
      "question": "What was Tom Brady's passer rating in 2015?",
      "expect": "decline",
      "reference": null,
      "id": "unanswerable-02",
      "split": "dev"
    },
    {
      "category": "unanswerable",
      "question": "What is Josh Allen's salary?",
      "expect": "decline",
      "reference": null,
      "id": "unanswerable-03",
      "split": "heldout"
    },
    {
      "category": "unanswerable",
      "question": "Who will win the Super Bowl in 2030?",
      "expect": "decline",
      "reference": null,
      "id": "unanswerable-04",
      "split": "dev"
    },
    {
      "category": "unanswerable",
      "question": "How fast does CeeDee Lamb run in practice?",
      "expect": "decline",
      "reference": null,
      "id": "unanswerable-05",
      "split": "dev"
    },
    {
      "category": "advice",
      "question": "Should I start Bijan or Gibbs this week?",
      "expect": "decline",
      "reference": null,
      "id": "advice-01",
      "split": "dev"
    },
    {
      "category": "advice",
      "question": "Should I trade Puka for Brock Bowers?",
      "expect": "decline",
      "reference": null,
      "id": "advice-02",
      "split": "dev"
    },
    {
      "category": "advice",
      "question": "Who should I pick up off waivers?",
      "expect": "decline",
      "reference": null,
      "id": "advice-03",
      "split": "heldout"
    },
    {
      "category": "advice",
      "question": "Start or sit Jordan Love?",
      "expect": "decline",
      "reference": null,
      "id": "advice-04",
      "split": "dev"
    },
    {
      "category": "advice",
      "question": "Should I drop Tee Higgins?",
      "expect": "decline",
      "reference": null,
      "id": "advice-05",
      "split": "dev"
    },
    {
      "category": "followup",
      "question": "now 2024",
      "expect": "answer",
      "previous": {
        "question": "Who leads WRs in yards per route run this season?",
        "reference": {
          "tool": "leaderboard",
          "args": {
            "metric": "yprr",
            "position": "WR",
            "seasons": [2026]
          }
        }
      },
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "yprr",
          "position": "WR",
          "seasons": [2024]
        }
      },
      "id": "followup-01",
      "split": "dev"
    },
    {
      "category": "followup",
      "question": "only in the red zone",
      "expect": "answer",
      "previous": {
        "question": "Who leads WRs in targets this season?",
        "reference": {
          "tool": "leaderboard",
          "args": {
            "metric": "targets",
            "position": "WR",
            "seasons": [2026]
          }
        }
      },
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "targets",
          "position": "WR",
          "seasons": [2026],
          "red_zone": true
        }
      },
      "id": "followup-02",
      "split": "dev"
    },
    {
      "category": "followup",
      "question": "and Gibbs?",
      "expect": "answer",
      "previous": {
        "question": "Bijan Robinson's rushing yards this season",
        "reference": {
          "tool": "player_stats",
          "args": {
            "player": "00-0038542",
            "metrics": ["rush_yds"],
            "seasons": [2026]
          }
        }
      },
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0039139",
          "metrics": ["rush_yds"],
          "seasons": [2026]
        }
      },
      "id": "followup-03",
      "split": "heldout"
    },
    {
      "category": "followup",
      "question": "what about against the run?",
      "expect": "answer",
      "previous": {
        "question": "Best pass defenses by EPA allowed in 2025",
        "reference": {
          "tool": "leaderboard",
          "args": {
            "metric": "def_pass_epa",
            "seasons": [2025]
          }
        }
      },
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "def_rush_epa",
          "seasons": [2025]
        }
      },
      "id": "followup-04",
      "split": "dev"
    },
    {
      "category": "followup",
      "question": "by week",
      "expect": "answer",
      "previous": {
        "question": "Josh Allen's EPA per dropback in 2025",
        "reference": {
          "tool": "player_stats",
          "args": {
            "player": "00-0034857",
            "metrics": ["qb_epa_db"],
            "seasons": [2025]
          }
        }
      },
      "reference": {
        "tool": "player_stats",
        "args": {
          "player": "00-0034857",
          "metrics": ["qb_epa_db"],
          "seasons": [2025],
          "by": "week"
        }
      },
      "id": "followup-05",
      "split": "dev"
    },
    {
      "category": "followup",
      "question": "just the top 3",
      "expect": "answer",
      "previous": {
        "question": "Top 10 TEs by target share this year",
        "reference": {
          "tool": "leaderboard",
          "args": {
            "metric": "target_share",
            "position": "TE",
            "seasons": [2026]
          }
        }
      },
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "target_share",
          "position": "TE",
          "seasons": [2026],
          "limit": 3
        }
      },
      "id": "followup-06",
      "split": "heldout"
    },
    {
      "category": "followup",
      "question": "add Justin Jefferson",
      "expect": "answer",
      "previous": {
        "question": "Compare Chase and Lamb in yards per route run",
        "reference": {
          "tool": "compare",
          "args": {
            "ids": ["00-0036900", "00-0036358"],
            "metrics": ["yprr"]
          }
        }
      },
      "reference": {
        "tool": "compare",
        "args": {
          "ids": ["00-0036900", "00-0036358", "00-0036322"],
          "metrics": ["yprr"]
        }
      },
      "id": "followup-07",
      "split": "dev"
    },
    {
      "category": "followup",
      "question": "and which blitz the least?",
      "expect": "answer",
      "previous": {
        "question": "Which defenses blitz the most?",
        "reference": {
          "tool": "leaderboard",
          "args": {
            "metric": "def_blitz_rate"
          }
        }
      },
      "reference": {
        "tool": "leaderboard",
        "args": {
          "metric": "def_blitz_rate",
          "order": "worst"
        }
      },
      "id": "followup-08",
      "split": "dev"
    }
  ]
}
```

Create `tests/ask/questions.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { check } from '@main/analyst/schema'
import { toolDefinitions } from '@main/analyst/tools'
import { QUESTION_SET } from './questions'

const SEASONS = Array.from({ length: QUESTION_SET.frozen.season - 2019 + 1 }, (_, i) => 2019 + i)
const TOOLS = new Map(toolDefinitions(SEASONS).map((d) => [d.name, d.schema]))
const { questions } = QUESTION_SET

describe('the evaluation questions (Ask spec §7)', () => {
  it('have unique ids, known categories and expectations', () => {
    expect(new Set(questions.map((q) => q.id)).size).toBe(questions.length)
    expect(questions.length).toBeGreaterThanOrEqual(150)
    for (const q of questions) {
      expect(['answer', 'ask', 'decline', 'answer_or_ask'], q.id).toContain(q.expect)
      expect(q.question.length, q.id).toBeGreaterThan(3)
    }
  })

  it('give every question that has an answer a reference call the tools accept', () => {
    const problems: string[] = []
    for (const q of questions) {
      const refs = [q.reference, q.previous?.reference].filter((r) => r !== null && r !== undefined)
      if ((q.expect === 'answer' || q.expect === 'answer_or_ask') && !q.reference) {
        problems.push(`${q.id}: no reference`)
      }
      for (const r of refs) {
        const schema = TOOLS.get(r!.tool as never)
        if (!schema) problems.push(`${q.id}: no tool ${r!.tool}`)
        else {
          const error = check(schema, r!.args)
          if (error) problems.push(`${q.id}: ${error}`)
        }
      }
    }
    expect(problems).toEqual([])
  })

  it('hold out about a third of each category, never tuned on', () => {
    const held = questions.filter((q) => q.split === 'heldout').length / questions.length
    expect(held).toBeGreaterThan(0.25)
    expect(held).toBeLessThan(0.4)
    const categories = new Set(questions.map((q) => q.category))
    for (const c of categories) {
      const items = questions.filter((q) => q.category === c)
      if (items.length >= 3)
        expect(
          items.some((q) => q.split === 'heldout'),
          c
        ).toBe(true)
    }
  })
})
```

Create `tests/ask/questions.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The evaluation questions (Ask spec §7), as `questions.json` stores them. */
export interface AskQuestion {
  id: string
  category: string
  question: string
  expect: 'answer' | 'ask' | 'decline' | 'answer_or_ask'
  reference: { tool: string; args: Record<string, unknown> } | null
  split: 'dev' | 'heldout'
  needsLeague?: boolean
  note?: string
  /** A follow-up: the turn before it. */
  previous?: { question: string; reference: { tool: string; args: Record<string, unknown> } }
}

export interface AskQuestionSet {
  about: string
  frozen: { season: number; through: number; seasonType: 'REG' | 'POST'; note: string }
  questions: AskQuestion[]
}

export const QUESTION_SET: AskQuestionSet = JSON.parse(
  readFileSync(join(__dirname, 'questions.json'), 'utf8')
) as AskQuestionSet
```

Create `tests/ask/references.live.test.ts`:

```ts
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ToolResult } from '@shared/ask'
import { resolve } from '@main/analyst/resolve'
import { createAnalyst, type TurnContext } from '@main/analyst/tools'
import { openStatsService } from '@main/stats/service'
import { QUESTION_SET } from './questions'

/**
 * Ask spec §10 (Plan AF1's gate): on the frozen database, every reference call runs and returns rows,
 * and the resolver finds the question's tool, metric and players. Run with
 * `FFC_ASK_DB=<copy of stats.duckdb> npm run test:ask`; the file is copied first, never opened in place.
 */
const DB = process.env.FFC_ASK_DB

const COMPACT: Record<string, string[]> = {
  leaderboard: ['leaderboard'],
  player_stats: ['player_stats'],
  team_stats: ['team_stats'],
  compare: ['compare'],
  trend: ['player_stats', 'team_stats'],
  outlook: ['outlook'],
  games: ['games'],
  league: ['league'],
  describe: ['describe']
}

const rowsOf = (r: ToolResult): number =>
  r.cards.reduce(
    (n, c) =>
      n + (c.kind === 'stats' ? c.result.rows.length : c.kind === 'games' ? c.games.length : 1),
    0
  )

describe.skipIf(!DB || !existsSync(DB))(
  'the reference calls and the resolver on the frozen database',
  () => {
    it('pass the gates', { timeout: 600_000 }, async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ffc-ask-'))
      copyFileSync(DB!, join(dir, 'stats.duckdb'))
      if (existsSync(`${DB}.wal`)) copyFileSync(`${DB}.wal`, join(dir, 'stats.duckdb.wal'))
      const service = await openStatsService(
        { path: join(dir, 'stats.duckdb'), tempDir: join(dir, 'tmp') },
        () => {},
        async () => {
          throw new Error('offline')
        }
      )
      const analyst = createAnalyst({ stats: service, league: () => null })
      const report: Record<string, unknown>[] = []
      let ran = 0
      let runnable = 0
      let tools = 0
      let toolsAsked = 0
      let metricHits = 0
      let metricsAsked = 0
      let playerHits = 0
      let playersAsked = 0
      let handled = 0
      let mustHandle = 0
      const ms: number[] = []
      try {
        for (const q of QUESTION_SET.questions) {
          const turn: TurnContext = await analyst.turn()
          const entry: Record<string, unknown> = { id: q.id }
          if (q.reference && !q.needsLeague) {
            runnable++
            const out = await analyst.run(q.reference.tool, q.reference.args, turn)
            const ok = out.ok && rowsOf(out) > 0
            if (ok) ran++
            ms.push(out.ms)
            Object.assign(entry, { ran: ok, ms: out.ms, error: out.ok ? undefined : out.error })
          }
          if (q.previous) {
            report.push(entry)
            continue
          }
          const b = resolve(q.question, { people: turn.people, now: turn.now })
          if (q.expect === 'ask' || q.expect === 'decline') {
            // The resolver catches what it can: namesakes, advice and seasons out of range.
            const caught = q.expect === 'ask' ? b.ambiguous.length > 0 : b.decline !== null
            if (
              q.category === 'ambiguous' ||
              q.category === 'advice' ||
              /\b(19\d\d|2030)\b/.test(q.question)
            ) {
              mustHandle++
              if (caught) handled++
            }
            entry.caught = caught
          } else if (q.reference) {
            const accept = COMPACT[q.reference.tool] ?? []
            toolsAsked++
            if (b.tool && accept.includes(b.tool)) tools++
            const gold = ([] as unknown[]).concat(
              q.reference.args.metric ?? [],
              q.reference.args.metrics ?? []
            )
            // A vague or leading question names no metric: the model chooses (Plan AG grades it).
            if (gold.length > 0 && q.category !== 'vague' && q.category !== 'leading') {
              metricsAsked++
              if (gold.some((m) => b.metrics.some((c) => c.id === m))) metricHits++
            }
            const players = ([] as unknown[])
              .concat(
                q.reference.args.player ?? [],
                q.reference.args.ids ?? [],
                q.reference.args.id ?? []
              )
              .filter((x): x is string => typeof x === 'string' && x.startsWith('00-'))
            if (players.length > 0) {
              playersAsked++
              if (players.every((p) => b.players.some((x) => x.id === p))) playerHits++
            }
            Object.assign(entry, {
              tool: b.tool,
              metrics: b.metrics.map((m) => m.id),
              players: b.players.map((p) => p.id)
            })
          }
          report.push(entry)
        }
      } finally {
        await service.close()
      }
      ms.sort((a, b) => a - b)
      const summary = {
        references: `${ran}/${runnable}`,
        tool: `${tools}/${toolsAsked}`,
        metricRecall5: `${metricHits}/${metricsAsked}`,
        players: `${playerHits}/${playersAsked}`,
        askOrDecline: `${handled}/${mustHandle}`,
        toolMs: {
          p50: ms[Math.floor(ms.length / 2)],
          p90: ms[Math.floor(ms.length * 0.9)],
          max: ms[ms.length - 1]
        }
      }
      if (process.env.FFC_ASK_REPORT)
        writeFileSync(process.env.FFC_ASK_REPORT, JSON.stringify({ summary, report }, null, 1))
      console.log(JSON.stringify(summary))
      expect(ran).toBe(runnable)
      expect(tools / toolsAsked).toBeGreaterThanOrEqual(0.9)
      expect(metricHits / metricsAsked).toBeGreaterThanOrEqual(0.95)
      expect(playerHits / playersAsked).toBeGreaterThanOrEqual(0.95)
      expect(handled).toBe(mustHandle)
    })
  }
)
```

- [ ] **Step 6: Write the questions and the gate**

Modify `package.json`:

```diff
diff --git a/package.json b/package.json
index 0193e13..192a64b 100644
--- a/package.json
+++ b/package.json
@@ -22,6 +22,7 @@
     "build:linux": "electron-vite build && electron-builder --linux --publish never",
     "test": "vitest run",
     "test:budget": "FFC_BUDGET=1 vitest run Budget",
+    "test:ask": "vitest run tests/ask",
     "test:watch": "vitest"
   },
   "engines": {
```

- [ ] **Step 7: Run them and see them pass**

```bash
npx vitest run tests/ask/questions.test.ts tests/ask/references.live.test.ts
```

Expected: PASS.

- [ ] **Step 8: Check and commit**

```bash
npx prettier --write package.json tests/ask/questions.json tests/ask/questions.test.ts tests/ask/questions.ts tests/ask/references.live.test.ts
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add package.json tests/ask/questions.json tests/ask/questions.test.ts tests/ask/questions.ts tests/ask/references.live.test.ts
git commit -m "test(ask): evaluation questions and the AF1 gate"
```

Expected: typecheck and lint clean; the suite at 1,256 passed, 6 skipped (a clean checkout).

---

### Task 10: Docs

The spec amendments (§15) and `docs/reference/analyst.md`.

**Files:**

- Create: `docs/reference/analyst.md`
- Modify: `docs/superpowers/specs/2026-11-01-ask-analyst-design.md`

- [ ] **Step 1: Write the docs**

Create `docs/reference/analyst.md`:

```markdown
# The analyst layer

What Plan AF1 built for Ask (spec `docs/superpowers/specs/2026-11-01-ask-analyst-design.md`): the tools the MCP server (AF2) and the agent loop (AG) share. Everything lives in main, in `src/main/analyst/`, and reads the stats worker; nothing writes.

## Modules

| File                                                                                    | What it does                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolve.ts`                                                                            | Reads a question before any model: players, teams (subject or opponent), metric candidates, time, the slots its words name, the question type and the compact tool. `contextText()` renders the context block.                                                                                                                           |
| `players.ts`, `teams.ts`, `metrics.ts`, `time.ts`, `slots.ts`, `classify.ts`, `text.ts` | The resolver's parts: names and namesakes, team names and slang, lexical metric retrieval (aliases, stemming, entity / position filter), time phrases, situation flags and splits, the question type.                                                                                                                                    |
| `tools.ts`                                                                              | The tools (`find`, `leaderboard`, `player_stats`, `team_stats`, `compare`, `trend`, `outlook`, `games`, `league`, `describe`, `query`), their JSON Schemas (full profile), the argument checks that teach, the exact cache, and the text and cards each returns. `createAnalyst({ stats, league })` → `turn()`, `run(name, args, turn)`. |
| `compact.ts`                                                                            | The compact profile: `compactCall(block)` builds `{thought, args}` for the classifier's tool with only the open, detected slots; `compactAnswer()` maps the model's answer back to the full tool's arguments.                                                                                                                            |
| `splits.ts`                                                                             | A split against its base: difference, 95 % interval, within noise (spec §15 E).                                                                                                                                                                                                                                                          |
| `checks.ts`                                                                             | The answer checks: numbers not from the data, an unqualified rate without its sample, a split without its base, causal words (soft).                                                                                                                                                                                                     |
| `brief.ts`, `brief/*.md`                                                                | The analyst brief (full), and the compact call and answer briefs; `briefHash()` for traces.                                                                                                                                                                                                                                              |
| `trace.ts`                                                                              | A trace per turn, `appendTrace()` to `log.jsonl`, `maskQuestion()` for the example library.                                                                                                                                                                                                                                              |
| `league.ts`                                                                             | The imported league, read only (`LeagueReader` over `companion.db`).                                                                                                                                                                                                                                                                     |
| `schema.ts`, `format.ts`                                                                | The argument checker; values as the model reads them.                                                                                                                                                                                                                                                                                    |

Shared: `src/shared/ask.ts` (tool results and cards), `src/shared/stats/aliases.ts`, `dimensions.ts`, `glossary.ts`, `semanticModel.ts`. The worker's `people` read (`src/main/stats/engine/people.ts`) feeds the player index. `companion.db` has `ask_examples` (migration 012, `src/main/db/repos/askExamples.ts`).

## Checking it

- `npm test` runs the unit tests (`tests/main/analyst/`, `tests/ask/questions.test.ts`).
- `FFC_ASK_DB=<copy of stats.duckdb> npm run test:ask` runs every reference call of `tests/ask/questions.json` on that database (copied first) and measures the resolver on the whole set: the AF1 gate.
```

Modify `docs/superpowers/specs/2026-11-01-ask-analyst-design.md`:

```diff
diff --git a/docs/superpowers/specs/2026-11-01-ask-analyst-design.md b/docs/superpowers/specs/2026-11-01-ask-analyst-design.md
index 2e03c11..b0c5a5e 100644
--- a/docs/superpowers/specs/2026-11-01-ask-analyst-design.md
+++ b/docs/superpowers/specs/2026-11-01-ask-analyst-design.md
@@ -353,3 +353,22 @@ The open points were approved as written:
 3. Evaluation gates (§7): Claude 90 % pass^1 / 85 % pass^3; the recommended local model 70 % / 60 % and p50 ≤ 15 s.
 4. Free cloud presets (§6.2): Gemini, Groq and OpenRouter.
 5. AF is split into AF1 and AF2 (§11).
+
+## 15. Plan AF1 amendments (2026-11-02)
+
+Taken in Plan AF1 (`docs/superpowers/plans/2026-11-02-plan-af1-analyst-tools.md`), from its prototype and measurements:
+
+- **A. Aliases beside the catalogue (§4.2).** `src/shared/stats/aliases.ts` maps each metric id to its aliases, rather than a `MetricDef.aliases` field: the catalogue stays the formulas, this file the vocabulary. `MetricInfo` does not change.
+- **B. The YAML export is a function (§4.2).** `semanticModelYaml()` builds it from the TypeScript; the MCP server (AF2) serves it as a resource. No committed file and no script.
+- **C. The resolver in AF1 (§4.1).** Lexical matching with aliases, light stemming and the entity / position filter; embeddings (`bge-m3`) come with the local-server detection of Plan AG behind the same `Retriever`. Thread state (follow-ups) comes with the loop (AG); screen context with Ctrl+K (AH).
+- **D. The exact cache lives in the analyst layer (§5.3)**, in main, keyed on the query and cleared when the warehouse's `through` or `updatedAt` changes. The worker gains one read, `people` (the resolver's player index), and nothing else.
+- **E. Splits and empty results are explained in the analyst layer (§3.3)**, not the engine. A player's or team's line is read from a league query, so its rank and percentile are among his position (or the 32); a split adds the split query. A split's interval uses the metric's prior `k`, the variance and mean sample of the qualified rows of the league query, and both samples: SE = √(k·σ²_t·(1/n − 1/N)), σ²_t = σ²_obs / (1 + k/n̄); within noise when |diff| < 1.96·SE. An empty ranking runs once more without qualification to say why.
+- **F. The compact profile (§3.2)** also offers `outlook` (one slot, filled by the resolver), and a line's metrics offer `default` first (the position's usual line): without it, small models answered a game log with `other`.
+- **G. `open_in_app` moves to Plan AH**: it needs the renderer's navigation.
+- **H. The answer checks are one module (§9)**, `checks.ts`, a function per check.
+- **I. The question set (§7)**: 163 questions in 16 categories, 116 dev and 47 held out; paraphrases are generated and verified by execution in AG. The frozen database is a copy of `stats.duckdb` through 2026 week 7 (v0.36.0), named by `FFC_ASK_DB`; league questions wait for AG's league fixture.
+- **J. Tool text (§3.3)**: a line per row, at most 15 rows and the first metric plus 4 more (`concise`), 50 rows and 12 (`full`).
+- **K. Measured (2026-11-02, the frozen database and this laptop):**
+  - The resolver: the right tool for 140 of 140 questions, the named metric in the top 5 for 107 of 107, the players for 64 of 64, and every must-ask or must-decline question it can see (namesakes, advice, out-of-range seasons) caught; 40–50 ms a question.
+  - The tools: every one of 141 reference calls runs and returns rows; 16 ms median, 44 ms 90th percentile, under 0.2 s at most; a cache hit 0 ms.
+  - End to end (resolver → compact schema → model → tool), the probe's 20 questions on AC power: `qwen3:4b` 20 of 20 at 2.0 s median, `gemma3:4b` 19 of 20 at 1.4 s. On battery the GPU drops to its low power state and a call takes 3–4× as long: the evaluation (AG) records the power state and gates on AC.
```

- [ ] **Step 2: Check and commit**

```bash
npx prettier --write docs/reference/analyst.md docs/superpowers/specs/2026-11-01-ask-analyst-design.md
npm run typecheck && npx eslint src tests electron.vite.config.ts
npx vitest run
git add docs/reference/analyst.md docs/superpowers/specs/2026-11-01-ask-analyst-design.md
git commit -m "docs: plan AF1 spec amendments and the analyst reference"
```

Expected: typecheck and lint clean; the suite at 1,256 passed, 6 skipped (a clean checkout).

---

### Task 11: The AF1 gate on the frozen database (spec §10)

The gate needs a current warehouse (a stale one refuses reads). It is a copy of the Windows app's `stats.duckdb`, through 2026 week 7 when this plan was written; the test copies it again before opening it, because opening writes.

- [ ] **Step 1: Freeze a copy of the warehouse**

Close the app (or leave it idle), then copy the database and its WAL from `%APPDATA%\FantasyCompanion\`. From WSL:

```bash
mkdir -p ~/ffc-ask && cp /mnt/c/Users/<you>/AppData/Roaming/FantasyCompanion/stats.duckdb* ~/ffc-ask/
```

Expected: `~/ffc-ask/stats.duckdb` (about 400 MB), and `stats.duckdb.wal` when there is one. A warehouse past week 7 is fine: every reference call names its seasons and weeks.

- [ ] **Step 2: Run the gate**

```bash
FFC_ASK_DB=~/ffc-ask/stats.duckdb FFC_ASK_REPORT=/tmp/ask-gate.json npm run test:ask
```

Expected: PASS, and a summary line like the planning findings: `{"references":"141/141","tool":"140/140","metricRecall5":"107/107","players":"64/64","askOrDecline":"12/12","toolMs":{"p50":16,"p90":44,"max":179}}`. Without `FFC_ASK_DB` the gate is skipped and `npm test` stays offline.

- [ ] **Step 3 (optional): End to end with a local model**

With Ollama running and `qwen3:4b` pulled, the research harness reproduces the end-to-end numbers: `bash docs/research/ask-probes/run.sh` (P2 / P3). Plan AG replaces it with the evaluation runner.

---

### Task 12: Verify, merge, release

- [ ] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 1,256 passed, 6 skipped (3 more with the untracked `playerImage` tests); the build succeeds. Nothing imports `src/main/analyst/` yet, so the bundle is unchanged apart from the worker's `people` read.

- [ ] **Step 2: The Windows suite and self-test**

**Ask the user before pushing.** Then:

```bash
git push origin feat/analyst-af1:check/plan-af1
gh run watch "$(gh run list --branch check/plan-af1 --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
git push origin --delete check/plan-af1
```

Expected: green. The log shows `"query":true`; the Windows suite runs the new tests (the gate is skipped there).

- [ ] **Step 3: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/analyst-af1`. It reviews against the spec (§2–§5, §7, §9–§11), the amendments (§15), the research report's decisions D1–D12 and the Review Focus list. Fix Critical and Important findings, each in its own commit, test first. Re-run Step 1 and Task 11 after them.

- [ ] **Step 4: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/analyst-af1 -m "merge: feat/analyst-af1 (plan AF1)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.37.0" && git tag v0.37.0
git branch -d feat/analyst-af1
```

- [ ] **Step 5: Status block**

Replace this plan's Status line with the outcome:

- the merge commit and the tag;
- the Task 11 numbers;
- the review fixes and anything deferred.

Then commit, staging this file only: `git commit -m "docs(plan): mark plan AF1 complete"`.

- [ ] **Step 6: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.37.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests and the packaged self-test, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.37.0 --draft=false`). The release notes should say:

- Groundwork for Ask, the personal data analyst: the tools that answer stats questions from the app's data, ready for Claude (next release) and local models.
- No visible change yet, and no stats rebuild on first launch.

---

## Self-review against the spec

| Spec                                                                                                                                    | Where                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| §2 One tool layer, read only, the model never writes SQL                                                                                | Task 5 (`tools.ts`: `StatsQuery`s only; `league` reads); Global Constraints (no IPC yet)                                     |
| §3.1 The tools and situation fields                                                                                                     | Task 5 (`open_in_app` moved to AH: amendment G)                                                                              |
| §3.2 Two profiles and the seven rules                                                                                                   | Task 1 (rule 7), Task 6 (rules 1–6; amendment F)                                                                             |
| §3.3 What the tools return: names with ids, compact text, splits with base and noise, stability, split counter, why empty, errors teach | Task 5 (amendments E, J); `describe` gives stability                                                                         |
| §4.1 The resolver and classifier                                                                                                        | Task 3 (`people`), Task 4, Task 9 Step 1 (amendment C)                                                                       |
| §4.2 Semantic model, aliases, dimensions, glossary, YAML                                                                                | Task 2 (amendments A, B)                                                                                                     |
| §4.3 Answers that can be checked                                                                                                        | Task 7 (amendment H)                                                                                                         |
| §4.4 The brief, versioned and hashed                                                                                                    | Task 7                                                                                                                       |
| §5.3 Traces, the exact cache, `ask_examples`                                                                                            | Task 5 (cache, amendment D), Task 8                                                                                          |
| §7 The question set, dev and held-out, the frozen database                                                                              | Task 9, Task 11 (amendment I; paraphrases, the runner and the matrix are Plan AG)                                            |
| §9 Code layout                                                                                                                          | `src/main/analyst/`, `src/shared/ask.ts`, `src/shared/stats/dimensions.ts`; `scripts/` waits for AG (the runner, the replay) |
| §10 Testing                                                                                                                             | Unit tests per task; the gate (Task 11); the packaged Windows check (Task 12)                                                |
| §11 The AF1 row                                                                                                                         | Every item above; AF2 serves the tools over MCP                                                                              |
