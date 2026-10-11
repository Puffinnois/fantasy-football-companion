# Plan U — Stats warehouse: play-by-play

**Status:** not started — written 2026-10-11. Every code block below was run before the plan was written, in a scratch copy of `main` at `d25576b`: typecheck and lint of `src` / `tests` clean, 803 tests green (+5 skipped), and a live 2019–2026 backfill of this plan's step alone (numbers under Planning findings).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggregate nflverse play-by-play for 2019 through the current season into `pbp` player-week and team-week rows in `warehouse.db`, computed in a worker thread after each refresh, and ship `v0.21.0`.

**Architecture:** A new warehouse step, `pbp`, runs once per season like the light sources. The main process downloads `play_by_play_{season}.csv.gz` as raw bytes. It transfers them to a new worker entry (`out/main/warehouseWorker.js`), which gunzips the file, reads it one row at a time (`forEachCsvRow`) and sums each play into per-player and per-team bags. The worker posts back plain rows; the existing `refreshWarehouse` writes them in one transaction and seals old seasons. The aggregation is pure and in-process testable (`aggregatePbp`). The worker file stays as thin as `engine/worker.ts`. Nothing reads the new rows yet.

**Tech Stack:** unchanged — Electron 39, TypeScript strict, `node:sqlite`, `node:worker_threads`, `node:zlib`, Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-10-09-stats-warehouse-design.md` §6.1–§6.3, §7, §8 (Plan U), amended by this plan (Task 9 writes it into the spec as §11). FTN and participation (§6.4–§6.5) are Plan V.

## Planning findings (live data, 2026-10-11)

Checked against the real 2019 and 2025 files (`play_by_play_2025.csv.gz`: 19 MB, 98 MB of CSV, 48,771 rows × 372 columns) and nflverse's own `stats_player_week_2025`.

- **Empty cells are `''`, not `NA`.** `strOrNull` / `numOrNull` already treat both as missing.
- **Scrambles have no `passer_player_id`.** All 1,149 scrambles of 2025 leave it empty and set `passer_id` (nflverse's dropback QB). The passer family reads `passer_id` (amendment C).
- **Kickoffs belong to the receiving team.** On 2,823 of 2,918 kickoffs `posteam` = `return_team`, so the kicker is on `defteam`. On punts `posteam` is the punting team.
- **Counting rules that reproduce nflverse's official counts.** On every 2025 player-week:
  - **Targets** (`pass_attempt = 1`, not a sack, penalty-wiped snaps and two-point tries left out) match nflverse `targets` on 4,533 / 4,533.
  - **Carries** (`play_type = run` plus kneels, same exclusions, **aborted plays kept**) match `carries` on 2,355 / 2,355. Dropping aborted plays, as spec §6.1 says, gives 96.4 %; counting two-point tries breaks passing attempts (88 % instead of 99.9 %).
  - Across 2019–2026, with this plan's code, targets match on 100 % of player-weeks in every season, and carries on 100 % in every season but 2024 (99.96 %).
- **Speed and size.** Char-by-char parsing of a season: 1.4 s handing rows over as arrays, 2.3 s as objects, so `forEachCsvRow` passes arrays. The whole aggregation takes ~3 s a season in-process (heap ~230 MB) and the same through the bundled worker. Live backfill of the `pbp` step alone, 2019–2026 (2026 through week 5): 8 / 8 steps ok in 71 s, **49.6 MB** on disk (~17,000 player-weeks and 534–570 team-weeks a full season, ~3.5 MB of JSON each). `warehouse.db` should land near 590 MB (it was 534 MB on the dev profile).
- **2026 is published** (`play_by_play_2026.csv.gz`, weeks 1–5 on 2026-10-11).

## Spec amendments (taken in this plan)

Each is recorded in the spec as §11 by Task 9 Step 3. They follow the data above. **Confirm them with the user before starting Task 0** if they have not been approved yet.

- **A. Aborted plays are kept.** Spec §6.1 drops `aborted_play = 1`. Those are real snaps (mostly fumbled snaps the QB runs with), and nflverse's official stats count them. Only `play_deleted = 1` is dropped.
- **B. Penalty-wiped snaps and two-point tries count only where named.** A `no_play` row counts only for penalties (player `pen_*`, team `pen_offense_*` / `pen_defense_*`). A two-point try counts only for `two_pt_att` / `two_pt_conv` (and drive points). Neither counts as a play, target, carry or dropback. As a result, team EPA sums leave out penalty-wiped snaps, unlike rbsdm's `pass == 1 | rush == 1` filter.
- **C. The passer is `passer_id`**, not `passer_player_id` (empty on scrambles). Kneels are credited through `rusher_player_id`, spikes through `passer_player_id`.
- **D. Every team metric is mirrored.** The spec's `def_*`-only metrics are stored under neutral names on both sides: `def_punts` holds forced punts, `def_fourth_failed` fourth-down stops, and `def_havoc` havoc plays. `off_havoc` is havoc allowed. Penalties are split by who committed them: `pen_offense_*` and `pen_defense_*`.
- **E. The play index moves to Plan V.** Its only readers are the FTN and participation joins (spec §6.1, §8).
- **F. Storage details.**
  - Sums are rounded to 4 decimals.
  - `cpoe` and `pass_oe` stay in nflverse's units (percentage points); `xpass` is 0–1.
  - "Long" values are maxima, not sums.
  - `pen_types` is a `{ type: count }` map.

## Global Constraints

- Branch `feat/stats-warehouse-u` off `main`. One Conventional Commit per "Commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- The working tree has unrelated changes that are not part of this plan: `.gitignore`, `.design-sync/`, `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts` and `tsconfig.web.tsbuildinfo`. Never stage them. Stage files by name; never run `git add -A` or `git add .`.
- Format only the files you touched: `npx prettier --write <files>` (never the `.csv` fixture). **Never run `npm run format`.** Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
- Storage only. Core tables, `recomputePoints`, values, signals and UI do not change. Nothing outside the warehouse sync reads `wh_*`.
- In the app, play-by-play is decoded and aggregated **only in the worker** (`runPbpWorker`). `aggregateInProcess` is for tests and throwaway scripts.
- Counting rules (spec §6 as amended):
  - Drop `play_deleted = 1` rows and any `season_type` other than REG / POST.
  - Keep aborted plays.
  - Penalty-wiped snaps (`play_type = no_play`) and two-point tries count only for penalties and two-point counts (amendment B).
- Sums and counts only, never rates. `data_json` drops zeros and missing values (spec §10).
- Sync behaviour is unchanged (spec §4.2). Logging as `wh:pbp:<season>`, a 404 → skipped, sealing and the 24 h attempt rule all come from `refreshWarehouse` as it is. The aggregator version is 1.
- Play-by-play downloads use a 120 s timeout (spec §4.3); everything else keeps 30 s.
- No test touches the network. Only the throwaway live check in Task 9 does, and it is never committed.
- **Gates (Task 9):**
  - Carries and targets must agree with nflverse on ≥ 99 % of player-weeks in **every** season.
  - `warehouse.db` must stay ≤ 650 MB.
  - If either fails, stop and report the numbers to the user.
- Release `v0.21.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before pushing.**
- Not GUI-verifiable here (WSLg). Say so in the Status block.

## Review Focus

The most likely ways for this to bite a user that the spec's test list does not pin down. Each has its test in the owning task.

1. **Inflated or missing counts from the wrong rows.** Penalty-wiped snaps, two-point tries or dropped aborted plays would quietly skew every count. → Task 6, "matches nflverse carries and targets on a real game" (an official table for a whole game); Task 4, "penalties count on wiped-out snaps, which count for nothing else".
2. **Kickoff sides.** nflverse makes the receiving team `posteam` on kickoffs. A kicker filed under the wrong team corrupts both teams' rows. → Task 4, "kickers, punters and returners, each on their own side".
3. **Scrambles.** Reading `passer_player_id` would lose every scramble dropback. → Task 4, "passer: dropbacks with sacks and scrambles, deep throws, downs".
4. **The main thread.** A season is ~100 MB of CSV and ~3 s of work; done on the main thread, it would freeze the window after every Refresh. → `aggregatePbp` is a required dependency (a missing one is a type error) and the handler passes `runPbpWorker` (Task 8). The bytes are transferred, not copied → Task 7, "transfers the bytes and resolves with the answer".
5. **Every Refresh re-runs the current season.** That is spec §4.2 as built: the button forces, and the current season is always due. Cost: a 19 MB download and ~3 s in the worker, in the background. Recorded, not changed.
6. **A current-season file with only its header, or none.** → Task 6, "accepts a header-only file and fails on a missing key column"; Task 8, "returns null for a file that is not published" (→ `skipped`).
7. **The worker inside the packaged asar.** `engineWorker.js` already runs from the asar (confirmed on Windows with v0.19.0), and this worker is bundled the same way. If it fails there, add `out/main/warehouseWorker.js` to `asarUnpack` in `electron-builder.yml`.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/stats-warehouse-u
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/stats-warehouse-u`.

---

### Task 1: `forEachCsvRow` (spec §6.1)

**Files:**

- Modify: `src/main/sources/csv.ts`
- Test: `tests/main/sources/csv.test.ts`

**Interfaces:**

- Produces: `forEachCsvRow(text, onRow: (fields: string[], header: string[]) => void): string[]` (returns the header, `[]` for empty input). `parseCsv` is rebuilt on it, with the same behaviour.

- [ ] **Step 1: Write the failing tests**

In `tests/main/sources/csv.test.ts`, change the imports to:

```ts
import { describe, expect, it, vi } from 'vitest'
import { forEachCsvRow, numOrNull, parseCsv, strOrNull } from '@main/sources/csv'
```

and add, between the `parseCsv` and `numOrNull / strOrNull` describes:

```ts
describe('forEachCsvRow', () => {
  it('passes each data row with the header and returns the header', () => {
    const seen: [string[], string[]][] = []
    const header = forEachCsvRow('a,b\n1,"x,y"\n\n3\n', (fields, h) => seen.push([fields, h]))
    expect(header).toEqual(['a', 'b'])
    expect(seen).toEqual([
      [
        ['1', 'x,y'],
        ['a', 'b']
      ],
      [['3'], ['a', 'b']]
    ])
  })

  it('returns [] for empty input and the header alone for a header-only file', () => {
    const onRow = vi.fn()
    expect(forEachCsvRow('', onRow)).toEqual([])
    expect(forEachCsvRow('a,b\r\n', onRow)).toEqual(['a', 'b'])
    expect(onRow).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/main/sources/csv.test.ts`
Expected: FAIL — `forEachCsvRow` is not exported.

- [ ] **Step 3: Implement**

In `src/main/sources/csv.ts`, replace the `parseCsv` function and its doc comment (everything above `/** R exports write missing values …`) with:

```ts
/**
 * Minimal RFC 4180 parser: quoted fields (nflverse quotes `headshot_url`, which contains commas),
 * doubled quotes inside quoted fields, LF or CRLF line ends, optional BOM. Calls `onRow` with each
 * data row's fields (a short row is passed as it is) and the header, one row at a time, so a large
 * file never becomes one object per row. Blank lines are ignored. Returns the header ([] for empty
 * input).
 */
export function forEachCsvRow(
  text: string,
  onRow: (fields: string[], header: string[]) => void
): string[] {
  let header = null as string[] | null
  let row: string[] = []
  let field = ''
  let quoted = false
  const endRow = (): void => {
    if (row.length > 1 || row[0] !== '') {
      if (header === null) header = row
      else onRow(row, header)
    }
    row = []
  }
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (text[i + 1] === '"') {
        field += '"'
        i++
      } else quoted = false
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      endRow()
    } else field += c
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    endRow()
  }
  return header ?? []
}

/** Every data row as an object keyed by the header; short rows are padded with ''. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = []
  forEachCsvRow(text, (fields, header) => {
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => {
      obj[h] = fields[idx] ?? ''
    })
    rows.push(obj)
  })
  return rows
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/sources`
Expected: PASS. Every existing `parseCsv` test and every source parser test still passes.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/sources/csv.ts tests/main/sources/csv.test.ts
git add src/main/sources/csv.ts tests/main/sources/csv.test.ts
git commit -m "feat(csv): add row-at-a-time forEachCsvRow"
```

---

### Task 2: Raw-byte downloads (spec §4.3, §6.1)

**Files:**

- Modify: `src/main/sources/http.ts`, `src/main/sources/warehouse/client.ts`, `tests/fixtures/warehouse.ts`
- Test: `tests/main/sources/warehouseClient.test.ts`

**Interfaces:**

- Produces (`http.ts`): `fetchBytes(url, options, httpError): Promise<Uint8Array | null>` and `decodeText(bytes): string` (gunzip when the magic bytes say gzip, then UTF-8). `fetchText` is rebuilt on both, with the same behaviour.
- Produces (`WarehouseClient`): `nflverseFile(tag, name): Promise<Uint8Array | null>`. It fetches the same `.csv.gz` → `.csv` file as `nflverseCsv`, returns the bytes as downloaded and uses the `largeTimeoutMs` option (default 120 s).
- Produces (`fakeWarehouse`): `nflverseFile` serves `files[<tag>/<name>]` as UTF-8 bytes and records the call.

- [ ] **Step 1: Write the failing test**

In `tests/main/sources/warehouseClient.test.ts`, add before `it('returns null when neither file exists'`:

```ts
it('downloads a file as bytes, gzip kept, with the same .csv fallback', async () => {
  const gz = gzipSync(Buffer.from('a\n1\n'))
  const { urls, client } = setup({
    [`${REL}/pbp/play_by_play_2025.csv.gz`]: () => new Response(gz),
    [`${REL}/pbp/play_by_play_2019.csv`]: () => new Response('a\n2\n')
  })
  const gzipped = await client.nflverseFile('pbp', 'play_by_play_2025')
  expect(gzipped && Buffer.from(gzipped)).toEqual(gz)
  const plain = await client.nflverseFile('pbp', 'play_by_play_2019')
  expect(plain && new TextDecoder().decode(plain)).toBe('a\n2\n')
  expect(await client.nflverseFile('pbp', 'play_by_play_2030')).toBeNull()
  expect(urls.slice(0, 3)).toEqual([
    `${REL}/pbp/play_by_play_2025.csv.gz`,
    `${REL}/pbp/play_by_play_2019.csv.gz`,
    `${REL}/pbp/play_by_play_2019.csv`
  ])
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/main/sources/warehouseClient.test.ts`
Expected: FAIL — `client.nflverseFile is not a function`.

- [ ] **Step 3: Implement**

Replace `src/main/sources/http.ts` with:

```ts
import { gunzipSync } from 'node:zlib'

export interface FetchTextOptions {
  fetchImpl: typeof fetch
  timeoutMs: number
  retryDelayMs: number
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500
}

/**
 * GETs `url` as raw bytes: follows redirects (fetch default) and retries once on 429 / 5xx.
 * Returns null on 404; any other failure status throws `httpError`.
 */
export async function fetchBytes(
  url: string,
  options: FetchTextOptions,
  httpError: (status: number, url: string) => Error
): Promise<Uint8Array | null> {
  const { fetchImpl, timeoutMs, retryDelayMs } = options
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (res.status === 404) return null
    if (res.ok) return new Uint8Array(await res.arrayBuffer())
    if (attempt === 0 && isRetryable(res.status)) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      continue
    }
    throw httpError(res.status, url)
  }
}

/** UTF-8 text of `bytes`, gunzipped first when they are gzip (detected by magic bytes). */
export function decodeText(bytes: Uint8Array): string {
  const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b
  return new TextDecoder().decode(gzipped ? gunzipSync(bytes) : bytes)
}

/** `fetchBytes` as text: gzip bodies are gunzipped (see `decodeText`). */
export async function fetchText(
  url: string,
  options: FetchTextOptions,
  httpError: (status: number, url: string) => Error
): Promise<string | null> {
  const bytes = await fetchBytes(url, options, httpError)
  return bytes === null ? null : decodeText(bytes)
}
```

In `src/main/sources/warehouse/client.ts`:

- Change the first import to `import { fetchBytes, fetchText } from '../http'`.
- In `WarehouseClient`, after `nflverseCsv`, add:

```ts
  /**
   * The same file as downloaded, gzip not undone, with the longer play-by-play timeout (spec §4.3);
   * the warehouse worker decodes it off the main thread. Null when neither file exists.
   */
  nflverseFile(tag: string, name: string): Promise<Uint8Array | null>
```

- In `WarehouseClientOptions`, after `timeoutMs?: number`, add:

```ts
  /** For `nflverseFile` (play-by-play, ~19 MB a season). */
  largeTimeoutMs?: number
```

- Replace the `get` constant with:

```ts
const httpError = (status: number, url: string): Error => new WarehouseHttpError(status, url)
const get = (url: string): Promise<string | null> => fetchText(url, http, httpError)
const large = { ...http, timeoutMs: options.largeTimeoutMs ?? 120_000 }
const getBytes = (url: string): Promise<Uint8Array | null> => fetchBytes(url, large, httpError)
```

- In the returned object, after `nflverseCsv`, add:

```ts
    async nflverseFile(tag, name) {
      const base = `${releasesUrl}/${tag}/${name}`
      return (await getBytes(`${base}.csv.gz`)) ?? (await getBytes(`${base}.csv`))
    },
```

In `tests/fixtures/warehouse.ts`, add to the object `fakeWarehouse` returns, after `nflverseCsv`:

```ts
    async nflverseFile(tag, name) {
      calls.push(`${tag}/${name}`)
      const file = files[`${tag}/${name}`]
      return file === undefined ? null : new TextEncoder().encode(file)
    },
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/sources tests/main/sync && npm run typecheck:node`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/sources/http.ts src/main/sources/warehouse/client.ts tests/fixtures/warehouse.ts tests/main/sources/warehouseClient.test.ts
git add src/main/sources/http.ts src/main/sources/warehouse/client.ts tests/fixtures/warehouse.ts tests/main/sources/warehouseClient.test.ts
git commit -m "feat(warehouse): download files as raw bytes"
```

---

### Task 3: The play reader, the bag and the fixtures (spec §6.1, §7)

**Files:**

- Create: `src/main/warehouse/play.ts`, `src/main/warehouse/bag.ts`, `tests/fixtures/pbp.ts`, `tests/fixtures/warehouse/pbp_2025_game.csv`
- Modify: `tests/fixtures/warehouse/capture.sh`
- Test: `tests/main/warehouse/play.test.ts`, `tests/main/warehouse/bag.test.ts`

**Interfaces:**

- Produces (`play.ts`):
  - `PBP_KEY_COLUMNS`, `PBP_COLUMNS` (every column read).
  - `interface Play` (one row, typed).
  - `playReader(header) → (fields) => Play | null | 'skip'`: null = deleted or preseason, 'skip' = no game, season or week.
  - `opponentOf(play, team)`.
  - `isScrimmage(play)`: a dropback or a run, not penalty-wiped, not a two-point try.
  - `counts(play)`: not penalty-wiped, not a two-point try.
- Produces (`bag.ts`): `class Bag` with `add(key, n = 1)` (a null `n` adds nothing), `addIf(key, condition)`, `max(key, n)`, `tally(key, entry)` and `data(prefix = ''): WhData` (no zeros, 4 decimals).
- Produces (`tests/fixtures/pbp.ts`): `pbpCsv(rows)`, `play(row)`, `run(over)`, `dropback(over)`, the ids `QB`, `RB`, `WR`, `LB`, and `type PbpRow`.

- [ ] **Step 1: Capture one real game**

```bash
base=https://github.com/nflverse/nflverse-data/releases/download
curl -sL "$base/pbp/play_by_play_2025.csv.gz" | gunzip | awk -F, 'NR == 1 || $2 == "2025_01_DAL_PHI"' > tests/fixtures/warehouse/pbp_2025_game.csv
wc -l -c tests/fixtures/warehouse/pbp_2025_game.csv
```

Expected: 164 lines (the header plus 163 plays of DAL at PHI, 2025 week 1), about 330 KB. Then record the capture in `tests/fixtures/warehouse/capture.sh`, after the `combine` line:

```bash
get "$base/pbp/play_by_play_2025.csv.gz" pbp_2025_game.csv 400 '$2 == "2025_01_DAL_PHI"'
```

- [ ] **Step 2: Write the failing tests**

Create `tests/fixtures/pbp.ts`:

```ts
import { PBP_COLUMNS, playReader, type Play } from '@main/warehouse/play'

/** A play-by-play row: nflverse column → value; unset columns are empty, as nflverse writes them. */
export type PbpRow = Record<string, string | number>

/** Week 1 of 2025, PHI with the ball at home against DAL. */
const BASE: PbpRow = {
  game_id: '2025_01_DAL_PHI',
  season: 2025,
  week: 1,
  season_type: 'REG',
  home_team: 'PHI',
  away_team: 'DAL',
  posteam: 'PHI',
  defteam: 'DAL'
}

const COLUMNS = [...new Set(PBP_COLUMNS)]

function cells(row: PbpRow): string[] {
  const full = { ...BASE, ...row }
  return COLUMNS.map((c) => (full[c] === undefined ? '' : String(full[c])))
}

/** A CSV with every column the aggregation reads. */
export function pbpCsv(rows: PbpRow[]): string {
  const quote = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = rows.map((r) => cells(r).map(quote).join(','))
  return [COLUMNS.join(','), ...lines].join('\n') + '\n'
}

/** One row, read as the aggregation reads it. */
export function play(row: PbpRow): Play {
  const p = playReader(COLUMNS)(cells(row))
  if (p === null || p === 'skip') throw new Error('not a play')
  return p
}

export const QB = '00-0036389'
export const RB = '00-0034844'
export const WR = '00-0035676'
export const LB = '00-0039000'

/** A run by RB from midfield on first down. */
export const run = (over: PbpRow = {}): PbpRow => ({
  play_type: 'run',
  rush: 1,
  rush_attempt: 1,
  rusher_player_id: RB,
  down: 1,
  yardline_100: 50,
  ...over
})

/** A pass from QB to WR from midfield on first down. */
export const dropback = (over: PbpRow = {}): PbpRow => ({
  play_type: 'pass',
  pass: 1,
  qb_dropback: 1,
  pass_attempt: 1,
  passer_id: QB,
  passer_player_id: QB,
  receiver_player_id: WR,
  down: 1,
  yardline_100: 50,
  ...over
})
```

Create `tests/main/warehouse/bag.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { Bag } from '@main/warehouse/bag'

describe('Bag', () => {
  it('sums, counts, keeps maxima and tallies; drops zeros and empty columns', () => {
    const b = new Bag()
    b.add('plays')
    b.add('plays')
    b.add('epa_sum', 0.1)
    b.add('epa_sum', 0.2)
    b.add('epa_sum', null)
    b.add('nothing', 0)
    b.addIf('stuffs', false)
    b.addIf('shotgun', true)
    b.max('long', -3)
    b.max('long', 12)
    b.max('long', 7)
    b.max('long_none', null)
    b.tally('types', 'False Start')
    b.tally('types', 'False Start')
    b.tally('types', null)
    expect(b.data('off_')).toEqual({
      off_plays: 2,
      off_epa_sum: 0.3,
      off_shotgun: 1,
      off_long: 12,
      off_types: { 'False Start': 2 }
    })
  })

  it('rounds sums to 4 decimals and drops what rounds to zero', () => {
    const b = new Bag()
    b.add('a', 1.234567)
    b.add('b', 0.00001)
    b.add('c', -0.00001)
    expect(b.data()).toEqual({ a: 1.2346 })
  })
})
```

Create `tests/main/warehouse/play.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { headerOf } from '@main/sources/warehouse/parse'
import { PBP_COLUMNS, playReader } from '@main/warehouse/play'
import { captured } from '../../fixtures/warehouse'
import { pbpCsv, play, QB } from '../../fixtures/pbp'

describe('playReader', () => {
  it('reads only columns the real file has', () => {
    const header = new Set(headerOf(captured('pbp_2025_game.csv')))
    expect(PBP_COLUMNS.filter((c) => !header.has(c))).toEqual([])
  })

  it('reads numbers, flags, ids and the drive clock', () => {
    const p = play({
      play_type: 'run',
      qb_scramble: 1,
      passer_id: QB,
      passer_player_id: '',
      yardline_100: 15,
      epa: -0.25,
      drive_time_of_possession: '3:33',
      solo_tackle_1_player_id: 'a',
      assist_tackle_2_player_id: 'b'
    })
    expect(p).toMatchObject({
      season: 2025,
      seasonType: 'REG',
      week: 1,
      posteam: 'PHI',
      playType: 'run',
      noPlay: false,
      scramble: true,
      passerId: QB,
      passPlayerId: null,
      yardline: 15,
      epa: -0.25,
      cpoe: null,
      driveSeconds: 213,
      tacklerIds: ['a', 'b']
    })
  })

  it('marks penalty-wiped snaps, two-point tries and onside kicks', () => {
    expect(play({ play_type: 'no_play' }).noPlay).toBe(true)
    expect(play({ two_point_attempt: 1, two_point_conv_result: 'success' })).toMatchObject({
      twoPoint: true,
      twoPointSuccess: true
    })
    const kick = { play_type: 'kickoff', kickoff_attempt: 1 }
    expect(play({ ...kick, desc: 'B.Aubrey kicks onside 12 yards' }).onside).toBe(true)
    expect(play({ ...kick, desc: 'B.Aubrey kicks 65 yards' }).onside).toBe(false)
    expect(play({ desc: 'onside formation' }).onside).toBe(false)
  })

  it('leaves out deleted and preseason plays and skips rows without a key', () => {
    const header = headerOf(pbpCsv([]))
    const read = playReader(header)
    const fields = (row: Record<string, string>): string[] => header.map((c) => row[c] ?? '')
    const base = { game_id: 'g', season: '2025', week: '1', season_type: 'REG' }
    expect(read(fields({ ...base, play_deleted: '1' }))).toBeNull()
    expect(read(fields({ ...base, season_type: 'PRE' }))).toBeNull()
    expect(read(fields({ ...base, week: '' }))).toBe('skip')
    expect(read(fields({ ...base, game_id: '' }))).toBe('skip')
    expect(read(fields(base))).toMatchObject({ gameId: 'g', week: 1 })
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/main/warehouse`
Expected: FAIL — `@main/warehouse/play` and `@main/warehouse/bag` do not exist.

- [ ] **Step 4: Implement**

Create `src/main/warehouse/play.ts`:

```ts
import type { WhSeasonType } from '@main/db/repos/warehouse'
import { numOrNull, strOrNull } from '@main/sources/csv'
import { seasonTypeOf } from '@main/sources/warehouse/parse'

/** Columns a play-by-play file cannot do without; a missing one fails the step (spec §4.3). */
export const PBP_KEY_COLUMNS = ['game_id', 'season', 'week', 'season_type', 'play_type']

/** One play-by-play row, reduced to what the aggregation reads. nflverse names in the comments. */
export interface Play {
  gameId: string
  season: number
  seasonType: WhSeasonType
  week: number
  home: string | null
  away: string | null
  /** The team with the ball; on kickoffs nflverse makes it the receiving team. */
  posteam: string | null
  defteam: string | null
  playType: string | null
  /** A snap wiped out by a penalty (`play_type` = no_play): no family counts it, penalties aside. */
  noPlay: boolean
  /** A two-point try (`two_point_attempt`): only the team two-point counts read it. */
  twoPoint: boolean
  twoPointSuccess: boolean
  /** `yardline_100`: yards to the opponent's end zone at the snap. */
  yardline: number | null
  down: number | null
  goalToGo: boolean
  qtr: number | null
  /** `game_seconds_remaining`. */
  clock: number | null
  wp: number | null
  epa: number | null
  qbEpa: number | null
  airEpa: number | null
  yacEpa: number | null
  wpa: number | null
  success: boolean
  cpoe: number | null
  airYards: number | null
  yardsGained: number | null
  passingYards: number | null
  rushingYards: number | null
  receivingYards: number | null
  /** `yards_after_catch`. */
  yac: number | null
  /** `xyac_mean_yardage`. */
  xyac: number | null
  xpass: number | null
  passOe: number | null
  /** nflverse `pass`: a dropback, sacks and scrambles included. */
  pass: boolean
  /** nflverse `rush`: a designed run. */
  rush: boolean
  /** `qb_dropback`. */
  dropback: boolean
  kneel: boolean
  spike: boolean
  scramble: boolean
  passAttempt: boolean
  sack: boolean
  complete: boolean
  interception: boolean
  fumbleLost: boolean
  fumbleForced: boolean
  tackledForLoss: boolean
  passTd: boolean
  rushTd: boolean
  returnTd: boolean
  touchback: boolean
  firstDownRush: boolean
  firstDownPass: boolean
  thirdConverted: boolean
  fourthConverted: boolean
  fourthFailed: boolean
  shotgun: boolean
  noHuddle: boolean
  /** nflverse `special`: a special-teams play. */
  special: boolean
  penalty: boolean
  punt: boolean
  puntInside20: boolean
  puntFairCatch: boolean
  puntBlocked: boolean
  kickoff: boolean
  kickoffFairCatch: boolean
  /** `own_kickoff_recovery`: the kicking team got the ball back. */
  ownKickoffRecovery: boolean
  /** A kickoff whose description says "onside" (nflverse has no column for it). */
  onside: boolean
  fieldGoal: boolean
  extraPoint: boolean
  /** `pass_defense_1_player_id` is set. */
  passDefended: boolean
  /** `passer_id`: the dropback QB, scrambles included (`passer_player_id` is empty on scrambles). */
  passerId: string | null
  /** `passer_player_id`, for spikes. */
  passPlayerId: string | null
  rusherId: string | null
  receiverId: string | null
  kickerId: string | null
  punterId: string | null
  kickReturnerId: string | null
  puntReturnerId: string | null
  penaltyPlayerId: string | null
  tdPlayerId: string | null
  /** Solo, assist and with-assist tacklers. */
  tacklerIds: string[]
  runLocation: string | null
  runGap: string | null
  returnTeam: string | null
  returnYards: number | null
  penaltyTeam: string | null
  penaltyYards: number | null
  penaltyType: string | null
  /** `fixed_drive`. */
  drive: number | null
  driveResult: string | null
  /** `drive_time_of_possession` ("M:SS") in seconds. */
  driveSeconds: number | null
  driveFirstDowns: number | null
  driveScored: boolean
  /** `ydsnet`: net yards of the drive so far. */
  ydsnet: number | null
  /** `posteam_score` before the play, `posteam_score_post` after it. */
  score: number | null
  scorePost: number | null
}

const TACKLER_COLUMNS = [
  'solo_tackle_1_player_id',
  'solo_tackle_2_player_id',
  'assist_tackle_1_player_id',
  'assist_tackle_2_player_id',
  'assist_tackle_3_player_id',
  'assist_tackle_4_player_id',
  'tackle_with_assist_1_player_id',
  'tackle_with_assist_2_player_id'
]

/** Every column the reader reads, so a test can check them against the real file's header. */
export const PBP_COLUMNS = [
  ...PBP_KEY_COLUMNS,
  ...TACKLER_COLUMNS,
  ...'home_team away_team posteam defteam two_point_attempt two_point_conv_result yardline_100 down goal_to_go qtr game_seconds_remaining wp epa qb_epa air_epa yac_epa wpa success cpoe air_yards yards_gained passing_yards rushing_yards receiving_yards yards_after_catch xyac_mean_yardage xpass pass_oe pass rush qb_dropback qb_kneel qb_spike qb_scramble pass_attempt sack complete_pass interception fumble_lost fumble_forced tackled_for_loss pass_touchdown rush_touchdown return_touchdown touchback first_down_rush first_down_pass third_down_converted fourth_down_converted fourth_down_failed shotgun no_huddle special penalty punt_attempt punt_inside_twenty punt_fair_catch punt_blocked kickoff_attempt kickoff_fair_catch own_kickoff_recovery desc field_goal_attempt extra_point_attempt pass_defense_1_player_id passer_id passer_player_id rusher_player_id receiver_player_id kicker_player_id punter_player_id kickoff_returner_player_id punt_returner_player_id penalty_player_id td_player_id run_location run_gap return_team return_yards penalty_team penalty_yards penalty_type fixed_drive fixed_drive_result drive_time_of_possession drive_first_downs drive_ended_with_score ydsnet posteam_score posteam_score_post play_deleted'.split(
    ' '
  )
]

/** "M:SS" → seconds. */
function minutesSeconds(raw: string): number | null {
  const m = /^(\d+):(\d{2})$/.exec(raw)
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/**
 * A reader for files with this header. It returns the play, null for a row left out on purpose
 * (deleted, preseason) or 'skip' for a row missing its game, season or week (counted).
 */
export function playReader(header: string[]): (fields: string[]) => Play | null | 'skip' {
  const index = new Map(header.map((column, i) => [column, i]))
  return (fields) => {
    const raw = (column: string): string => {
      const i = index.get(column)
      return i === undefined ? '' : (fields[i] ?? '')
    }
    const text = (column: string): string | null => strOrNull(raw(column))
    const num = (column: string): number | null => numOrNull(raw(column))
    const flag = (column: string): boolean => raw(column) === '1'

    if (flag('play_deleted')) return null
    const season = num('season')
    const week = num('week')
    const gameId = text('game_id')
    if (season === null || week === null || gameId === null) return 'skip'
    const seasonType = seasonTypeOf(raw('season_type'))
    if (seasonType === null) return null
    const playType = text('play_type')
    const kickoff = flag('kickoff_attempt')
    return {
      gameId,
      season,
      seasonType,
      week,
      home: text('home_team'),
      away: text('away_team'),
      posteam: text('posteam'),
      defteam: text('defteam'),
      playType,
      noPlay: playType === 'no_play',
      twoPoint: flag('two_point_attempt'),
      twoPointSuccess: raw('two_point_conv_result') === 'success',
      yardline: num('yardline_100'),
      down: num('down'),
      goalToGo: flag('goal_to_go'),
      qtr: num('qtr'),
      clock: num('game_seconds_remaining'),
      wp: num('wp'),
      epa: num('epa'),
      qbEpa: num('qb_epa'),
      airEpa: num('air_epa'),
      yacEpa: num('yac_epa'),
      wpa: num('wpa'),
      success: flag('success'),
      cpoe: num('cpoe'),
      airYards: num('air_yards'),
      yardsGained: num('yards_gained'),
      passingYards: num('passing_yards'),
      rushingYards: num('rushing_yards'),
      receivingYards: num('receiving_yards'),
      yac: num('yards_after_catch'),
      xyac: num('xyac_mean_yardage'),
      xpass: num('xpass'),
      passOe: num('pass_oe'),
      pass: flag('pass'),
      rush: flag('rush'),
      dropback: flag('qb_dropback'),
      kneel: flag('qb_kneel'),
      spike: flag('qb_spike'),
      scramble: flag('qb_scramble'),
      passAttempt: flag('pass_attempt'),
      sack: flag('sack'),
      complete: flag('complete_pass'),
      interception: flag('interception'),
      fumbleLost: flag('fumble_lost'),
      fumbleForced: flag('fumble_forced'),
      tackledForLoss: flag('tackled_for_loss'),
      passTd: flag('pass_touchdown'),
      rushTd: flag('rush_touchdown'),
      returnTd: flag('return_touchdown'),
      touchback: flag('touchback'),
      firstDownRush: flag('first_down_rush'),
      firstDownPass: flag('first_down_pass'),
      thirdConverted: flag('third_down_converted'),
      fourthConverted: flag('fourth_down_converted'),
      fourthFailed: flag('fourth_down_failed'),
      shotgun: flag('shotgun'),
      noHuddle: flag('no_huddle'),
      special: flag('special'),
      penalty: flag('penalty'),
      punt: flag('punt_attempt'),
      puntInside20: flag('punt_inside_twenty'),
      puntFairCatch: flag('punt_fair_catch'),
      puntBlocked: flag('punt_blocked'),
      kickoff,
      kickoffFairCatch: flag('kickoff_fair_catch'),
      ownKickoffRecovery: flag('own_kickoff_recovery'),
      onside: kickoff && /onside/i.test(raw('desc')),
      fieldGoal: flag('field_goal_attempt'),
      extraPoint: flag('extra_point_attempt'),
      passDefended: text('pass_defense_1_player_id') !== null,
      passerId: text('passer_id'),
      passPlayerId: text('passer_player_id'),
      rusherId: text('rusher_player_id'),
      receiverId: text('receiver_player_id'),
      kickerId: text('kicker_player_id'),
      punterId: text('punter_player_id'),
      kickReturnerId: text('kickoff_returner_player_id'),
      puntReturnerId: text('punt_returner_player_id'),
      penaltyPlayerId: text('penalty_player_id'),
      tdPlayerId: text('td_player_id'),
      tacklerIds: TACKLER_COLUMNS.map(text).filter((id): id is string => id !== null),
      runLocation: text('run_location'),
      runGap: text('run_gap'),
      returnTeam: text('return_team'),
      returnYards: num('return_yards'),
      penaltyTeam: text('penalty_team'),
      penaltyYards: num('penalty_yards'),
      penaltyType: text('penalty_type'),
      drive: num('fixed_drive'),
      driveResult: text('fixed_drive_result'),
      driveSeconds: minutesSeconds(raw('drive_time_of_possession')),
      driveFirstDowns: num('drive_first_downs'),
      driveScored: flag('drive_ended_with_score'),
      ydsnet: num('ydsnet'),
      score: num('posteam_score'),
      scorePost: num('posteam_score_post')
    }
  }
}

/** The other team of the play's game; null when `team` is neither side. */
export function opponentOf(p: Play, team: string | null): string | null {
  if (team === null) return null
  return team === p.home ? p.away : team === p.away ? p.home : null
}

/** A scrimmage snap that counts: a dropback or a run, not wiped out by a penalty, not a two-point try. */
export function isScrimmage(play: Play): boolean {
  return (play.pass || play.rush) && !play.noPlay && !play.twoPoint
}

/** Any play a family counts: not wiped out by a penalty, not a two-point try. */
export function counts(play: Play): boolean {
  return !play.noPlay && !play.twoPoint
}
```

Create `src/main/warehouse/bag.ts`:

```ts
import type { WhData } from '@main/db/repos/warehouse'

/** Sums are stored to 4 decimals: EPA and win probability carry no more than that. */
const round = (n: number): number => Math.round(n * 1e4) / 1e4

/**
 * Sums and counts for one player-week or team-week (spec §6.1: never rates). `data()` drops zeros
 * and missing values, as every warehouse row does (spec §10).
 */
export class Bag {
  private readonly sums = new Map<string, number>()
  private readonly maxes = new Map<string, number>()
  private readonly tallies = new Map<string, Map<string, number>>()

  /** Adds `n` (1 by default); a null `n` (the column was empty) adds nothing. */
  add(key: string, n: number | null = 1): void {
    if (n === null) return
    this.sums.set(key, (this.sums.get(key) ?? 0) + n)
  }

  /** Adds 1 when `condition` holds. */
  addIf(key: string, condition: boolean): void {
    if (condition) this.add(key)
  }

  /** Keeps the largest `n` seen (longest gains). */
  max(key: string, n: number | null): void {
    if (n === null) return
    const seen = this.maxes.get(key)
    if (seen === undefined || n > seen) this.maxes.set(key, n)
  }

  /** Counts `entry` in the `key` map (penalty types, …); a null entry counts nothing. */
  tally(key: string, entry: string | null): void {
    if (entry === null) return
    const map = this.tallies.get(key) ?? new Map<string, number>()
    map.set(entry, (map.get(entry) ?? 0) + 1)
    this.tallies.set(key, map)
  }

  /** The non-zero values, each key prefixed with `prefix`. */
  data(prefix = ''): WhData {
    const out: WhData = {}
    for (const [key, n] of [...this.sums, ...this.maxes]) {
      const value = round(n)
      if (value !== 0) out[prefix + key] = value
    }
    for (const [key, map] of this.tallies) out[prefix + key] = Object.fromEntries(map)
    return out
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/main/warehouse && npm run typecheck:node`
Expected: PASS. In particular, "reads only columns the real file has" passes against the captured header.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/main/warehouse/play.ts src/main/warehouse/bag.ts tests/fixtures/pbp.ts tests/main/warehouse/play.test.ts tests/main/warehouse/bag.test.ts
git add src/main/warehouse/play.ts src/main/warehouse/bag.ts tests/fixtures/pbp.ts tests/fixtures/warehouse/pbp_2025_game.csv tests/fixtures/warehouse/capture.sh tests/main/warehouse/play.test.ts tests/main/warehouse/bag.test.ts
git commit -m "feat(warehouse): read play-by-play rows"
```

---

### Task 4: Player-weeks (spec §6.2)

**Files:**

- Create: `src/main/warehouse/pbpPlayers.ts`
- Test: `tests/main/warehouse/pbpPlayers.test.ts`

**Interfaces:**

- Consumes: `Play`, `counts`, `opponentOf` (Task 3), `Bag` (Task 3).
- Produces: `class PlayerWeeks` with `add(play)` and `finish(): WhPlayerWeek[]`. The rows are source `pbp`, key type `gsis`, with the team the player was on and that team's opponent.

Who is credited, and for which team (amendments B and C):

| Family   | Rows                                          | Id column                             | Team                             |
| -------- | --------------------------------------------- | ------------------------------------- | -------------------------------- |
| `pass_*` | `qb_dropback = 1` (sacks, scrambles)          | `passer_id`                           | posteam                          |
| `rush_*` | `play_type = run` (scrambles too, kneels not) | `rusher_player_id`                    | posteam                          |
| `rec_*`  | `pass_attempt = 1`, not a sack                | `receiver_player_id`                  | posteam                          |
| kneels   | `qb_kneel = 1` → `pass_kneels`                | `rusher_player_id`                    | posteam                          |
| spikes   | `qb_spike = 1` → `pass_spikes`                | `passer_player_id`                    | posteam                          |
| `k_*`    | field goals and PATs (EPA); kickoffs          | `kicker_player_id`                    | posteam; **defteam** on kickoffs |
| `p_*`    | `punt_attempt = 1`                            | `punter_player_id`                    | posteam                          |
| `kr_*`   | kickoffs                                      | `kickoff_returner_player_id`          | `return_team`, else posteam      |
| `pr_*`   | punts                                         | `punt_returner_player_id`             | `return_team`, else defteam      |
| `def_*`  | runs and completions                          | solo, assist and with-assist tacklers | defteam                          |
| `pen_*`  | `penalty = 1`, **wiped-out snaps included**   | `penalty_player_id`                   | `penalty_team`                   |

Every family except `pen_*` skips penalty-wiped snaps and two-point tries.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/warehouse/pbpPlayers.test.ts` (every expected number is worked out by hand from the rows above it):

```ts
import { describe, expect, it } from 'vitest'
import type { WhPlayerWeek } from '@main/db/repos/warehouse'
import { PlayerWeeks } from '@main/warehouse/pbpPlayers'
import { dropback, LB, play, QB, RB, run, WR, type PbpRow } from '../../fixtures/pbp'

function weeks(rows: PbpRow[]): WhPlayerWeek[] {
  const players = new PlayerWeeks()
  for (const r of rows) players.add(play(r))
  return players.finish()
}

const dataOf = (rows: WhPlayerWeek[], key: string): WhPlayerWeek['data'] | undefined =>
  rows.find((r) => r.playerKey === key)?.data

describe('pbp player-weeks (spec §6.2)', () => {
  it('passer: dropbacks with sacks and scrambles, deep throws, downs', () => {
    const rows = weeks([
      dropback({
        complete_pass: 1,
        air_yards: 25,
        passing_yards: 40,
        receiving_yards: 40,
        yards_after_catch: 15,
        xyac_mean_yardage: 6.5,
        pass_touchdown: 1,
        first_down_pass: 1,
        yardline_100: 40,
        epa: 3.4,
        qb_epa: 3.5,
        air_epa: 2,
        yac_epa: 1.5,
        cpoe: 30,
        wpa: 0.1,
        success: 1
      }),
      dropback({ sack: 1, receiver_player_id: '', down: 3, qb_epa: -2, epa: -2 }),
      {
        ...run({ rusher_player_id: QB, qb_scramble: 1, down: 3, yardline_100: 15 }),
        pass: 1,
        rush: 0,
        qb_dropback: 1,
        passer_id: QB,
        rushing_yards: 12,
        third_down_converted: 1,
        epa: 1.2,
        qb_epa: 1.2,
        success: 1
      }
    ])
    expect(dataOf(rows, QB)).toEqual({
      pass_dropbacks: 3,
      pass_qb_epa_sum: 2.7,
      pass_success_n: 2,
      pass_wpa_sum: 0.1,
      pass_cpoe_sum: 30,
      pass_cpoe_n: 1,
      pass_scrambles: 1,
      pass_scramble_yds: 12,
      pass_early_dropbacks: 1,
      pass_early_epa_sum: 3.5,
      pass_3d_dropbacks: 2,
      pass_3d_conv: 1,
      pass_air_epa_sum: 2,
      pass_yac_epa_sum: 1.5,
      pass_long_cmp: 40,
      pass_deep_att: 1,
      pass_deep_cmp: 1,
      pass_deep_yds: 40,
      pass_deep_td: 1,
      // the scramble is a carry too
      rush_carries: 1,
      rush_epa_sum: 1.2,
      rush_success_n: 1,
      rush_10p: 1,
      rush_long: 12,
      rush_i20: 1
    })
    expect(dataOf(rows, WR)).toEqual({
      rec_targets: 1,
      hvt: 1,
      rec_air_yards_sum: 25,
      rec_epa_sum: 3.4,
      rec_success_n: 1,
      rec_wpa_sum: 0.1,
      rec_deep_tgt: 1,
      rec_xyac_sum: 6.5,
      rec_xyac_n: 1,
      rec_yac_sum: 15,
      rec_long: 40,
      rec_first_downs: 1
    })
  })

  it('rusher: thresholds, red zone, goal to go, location and gap; defenders credited', () => {
    const rows = weeks([
      run({
        yardline_100: 30,
        rushing_yards: 22,
        yards_gained: 22,
        run_location: 'left',
        run_gap: 'end',
        first_down_rush: 1,
        epa: 1.5,
        wpa: 0.05,
        success: 1
      }),
      run({
        yardline_100: 4,
        goal_to_go: 1,
        rushing_yards: -1,
        yards_gained: -1,
        run_location: 'middle',
        epa: -0.8,
        solo_tackle_1_player_id: LB
      }),
      run({
        yardline_100: 2,
        goal_to_go: 1,
        rushing_yards: 2,
        yards_gained: 2,
        rush_touchdown: 1,
        run_location: 'right',
        run_gap: 'guard',
        epa: 1.1,
        success: 1
      })
    ])
    expect(dataOf(rows, RB)).toEqual({
      rush_carries: 3,
      rush_designed: 3,
      rush_epa_sum: 1.8,
      rush_success_n: 2,
      rush_wpa_sum: 0.05,
      rush_stuffs: 1,
      rush_10p: 1,
      rush_15p: 1,
      rush_20p: 1,
      rush_long: 22,
      rush_i20: 2,
      rush_i10: 2,
      rush_i5: 2,
      rush_td_i20: 1,
      rush_td_i10: 1,
      rush_td_i5: 1,
      hvt: 2,
      rush_gtg: 2,
      rush_first_downs: 1,
      rush_left_n: 1,
      rush_left_yds: 22,
      rush_end_n: 1,
      rush_end_yds: 22,
      rush_middle_n: 1,
      rush_middle_yds: -1,
      rush_right_n: 1,
      rush_right_yds: 2,
      rush_guard_n: 1,
      rush_guard_yds: 2
    })
    expect(rows.find((r) => r.playerKey === LB)).toMatchObject({
      team: 'DAL',
      opponent: 'PHI',
      data: { def_stuffs: 1, def_tackle_depth_sum: -1, def_tackle_depth_n: 1 }
    })
    expect(rows.find((r) => r.playerKey === RB)).toMatchObject({ team: 'PHI', opponent: 'DAL' })
  })

  it('receiver: red-zone, end-zone and third-down targets', () => {
    const rows = weeks([dropback({ yardline_100: 8, air_yards: 10, down: 3, epa: -0.5 })])
    expect(dataOf(rows, WR)).toEqual({
      rec_targets: 1,
      hvt: 1,
      rec_air_yards_sum: 10,
      rec_epa_sum: -0.5,
      rec_tgt_i20: 1,
      rec_tgt_i10: 1,
      rec_ez_tgt: 1,
      rec_3d_tgt: 1
    })
    expect(dataOf(rows, QB)).toMatchObject({ pass_att_i20: 1, pass_att_i10: 1, pass_ez_att: 1 })
  })

  it('kickers, punters and returners, each on their own side', () => {
    // nflverse gives kickoffs to the receiving team: PHI receives, DAL kicks.
    const kickoff = (over: PbpRow): PbpRow => ({
      play_type: 'kickoff',
      kickoff_attempt: 1,
      special: 1,
      kicker_player_id: 'DK',
      ...over
    })
    const rows = weeks([
      kickoff({ touchback: 1 }),
      kickoff({ desc: 'B.Aubrey kicks onside 11 yards', own_kickoff_recovery: 1 }),
      kickoff({ kickoff_returner_player_id: 'KR', return_team: 'PHI', return_yards: 30 }),
      kickoff({
        kickoff_returner_player_id: 'KR',
        return_team: 'PHI',
        return_yards: 100,
        return_touchdown: 1,
        td_player_id: 'KR'
      }),
      {
        play_type: 'field_goal',
        field_goal_attempt: 1,
        special: 1,
        kicker_player_id: 'PK',
        epa: 0.9
      },
      {
        play_type: 'punt',
        punt_attempt: 1,
        special: 1,
        punter_player_id: 'PP',
        punt_returner_player_id: 'PR',
        punt_inside_twenty: 1,
        punt_fair_catch: 1,
        epa: -0.3
      }
    ])
    const of = (key: string): Partial<WhPlayerWeek> | undefined => {
      const r = rows.find((x) => x.playerKey === key)
      return r && { team: r.team, data: r.data }
    }
    expect(of('DK')).toEqual({
      team: 'DAL',
      data: { k_kickoffs: 4, k_ko_touchbacks: 1, k_onside_att: 1, k_onside_rec: 1 }
    })
    expect(of('KR')).toEqual({
      team: 'PHI',
      data: { kr_returns: 2, kr_yds: 130, kr_long: 100, kr_td: 1 }
    })
    expect(of('PK')).toEqual({ team: 'PHI', data: { k_epa_sum: 0.9 } })
    expect(of('PP')).toEqual({
      team: 'PHI',
      data: { p_punts: 1, p_epa_sum: -0.3, p_inside_20: 1, p_fair_catches: 1 }
    })
    expect(of('PR')).toEqual({ team: 'DAL', data: { pr_fair_catches: 1 } })
  })

  it('penalties count on wiped-out snaps, which count for nothing else', () => {
    const rows = weeks([
      {
        ...dropback({ complete_pass: 1, receiving_yards: 30 }),
        play_type: 'no_play',
        penalty: 1,
        penalty_player_id: 'OL',
        penalty_team: 'PHI',
        penalty_yards: 10,
        penalty_type: 'Offensive Holding'
      },
      {
        play_type: 'no_play',
        penalty: 1,
        penalty_player_id: 'OL',
        penalty_team: 'PHI',
        penalty_yards: 5,
        penalty_type: 'False Start'
      },
      dropback({ two_point_attempt: 1, down: '' }),
      { play_type: 'qb_kneel', qb_kneel: 1, rusher_player_id: QB },
      { play_type: 'qb_spike', qb_spike: 1, pass_attempt: 1, passer_player_id: QB }
    ])
    expect(rows.find((r) => r.playerKey === 'OL')).toMatchObject({
      team: 'PHI',
      data: { pen_n: 2, pen_yds: 15, pen_types: { 'Offensive Holding': 1, 'False Start': 1 } }
    })
    expect(dataOf(rows, WR)).toBeUndefined()
    expect(dataOf(rows, QB)).toEqual({ pass_kneels: 1, pass_spikes: 1 })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/main/warehouse/pbpPlayers.test.ts`
Expected: FAIL — `@main/warehouse/pbpPlayers` does not exist.

- [ ] **Step 3: Implement**

Create `src/main/warehouse/pbpPlayers.ts`:

```ts
import type { WhPlayerWeek } from '@main/db/repos/warehouse'
import { Bag } from './bag'
import { counts, opponentOf, type Play } from './play'

/** Red-zone depths (yards to the end zone) the rusher and receiver counts split by. */
const ZONES = [20, 10, 5]
const DEEP = 20

interface Entry {
  play: Play
  playerKey: string
  team: string | null
  bag: Bag
}

const inside = (p: Play, yards: number): boolean => p.yardline !== null && p.yardline <= yards
const earlyDown = (p: Play): boolean => p.down === 1 || p.down === 2

function passer(b: Bag, p: Play): void {
  const attempt = p.passAttempt && !p.sack && !p.scramble
  b.add('pass_dropbacks')
  b.add('pass_qb_epa_sum', p.qbEpa)
  b.addIf('pass_success_n', p.success)
  b.add('pass_wpa_sum', p.wpa)
  if (p.cpoe !== null) {
    b.add('pass_cpoe_sum', p.cpoe)
    b.add('pass_cpoe_n')
  }
  if (p.scramble) {
    b.add('pass_scrambles')
    b.add('pass_scramble_yds', p.rushingYards)
  }
  if (earlyDown(p)) {
    b.add('pass_early_dropbacks')
    b.add('pass_early_epa_sum', p.qbEpa)
  }
  if (p.down === 3) {
    b.add('pass_3d_dropbacks')
    b.addIf('pass_3d_conv', p.thirdConverted)
  }
  if (!attempt) return
  b.add('pass_air_epa_sum', p.airEpa)
  b.add('pass_yac_epa_sum', p.yacEpa)
  if (p.complete) b.max('pass_long_cmp', p.passingYards)
  b.addIf('pass_att_i20', inside(p, 20))
  b.addIf('pass_att_i10', inside(p, 10))
  b.addIf('pass_ez_att', p.airYards !== null && p.yardline !== null && p.airYards >= p.yardline)
  if (p.airYards !== null && p.airYards >= DEEP) {
    b.add('pass_deep_att')
    b.addIf('pass_deep_cmp', p.complete)
    if (p.complete) b.add('pass_deep_yds', p.passingYards)
    b.addIf('pass_deep_td', p.passTd)
    b.addIf('pass_deep_int', p.interception)
  }
}

function rusher(b: Bag, p: Play): void {
  const yards = p.rushingYards
  b.add('rush_carries')
  b.addIf('rush_designed', !p.scramble)
  b.add('rush_epa_sum', p.epa)
  b.addIf('rush_success_n', p.success)
  b.add('rush_wpa_sum', p.wpa)
  b.addIf('rush_stuffs', yards !== null && yards <= 0)
  for (const n of [10, 15, 20]) b.addIf(`rush_${n}p`, yards !== null && yards >= n)
  b.max('rush_long', yards)
  for (const z of ZONES) {
    if (!inside(p, z)) continue
    b.add(`rush_i${z}`)
    b.addIf(`rush_td_i${z}`, p.rushTd)
  }
  b.addIf('hvt', inside(p, 10))
  b.addIf('rush_gtg', p.goalToGo)
  b.addIf('rush_first_downs', p.firstDownRush)
  for (const where of [p.runLocation, p.runGap]) {
    if (where === null) continue
    b.add(`rush_${where}_n`)
    b.add(`rush_${where}_yds`, yards)
  }
}

function receiver(b: Bag, p: Play): void {
  b.add('rec_targets')
  b.add('hvt')
  b.add('rec_air_yards_sum', p.airYards)
  b.add('rec_epa_sum', p.epa)
  b.addIf('rec_success_n', p.success)
  b.add('rec_wpa_sum', p.wpa)
  for (const z of ZONES) b.addIf(`rec_tgt_i${z}`, inside(p, z))
  b.addIf('rec_ez_tgt', p.airYards !== null && p.yardline !== null && p.airYards >= p.yardline)
  b.addIf('rec_deep_tgt', p.airYards !== null && p.airYards >= DEEP)
  b.addIf('rec_3d_tgt', p.down === 3)
  if (!p.complete) return
  if (p.xyac !== null) {
    b.add('rec_xyac_sum', p.xyac)
    b.add('rec_xyac_n')
  }
  b.add('rec_yac_sum', p.yac)
  b.max('rec_long', p.receivingYards)
  b.addIf('rec_first_downs', p.firstDownPass)
}

function returner(b: Bag, p: Play, prefix: 'kr' | 'pr', id: string, fairCatch: boolean): void {
  if (fairCatch) {
    b.add(`${prefix}_fair_catches`)
    return
  }
  if (p.touchback) return
  b.add(`${prefix}_returns`)
  b.add(`${prefix}_yds`, p.returnYards)
  b.max(`${prefix}_long`, p.returnYards)
  b.addIf(`${prefix}_td`, p.returnTd && p.tdPlayerId === id)
}

/** Spec §6.2: `pbp` player-weeks, keyed by gsis id. */
export class PlayerWeeks {
  private readonly entries = new Map<string, Entry>()

  /** The bag of `id` in this play's week; `team` is the side the player was on. */
  private bag(p: Play, id: string, team: string | null): Bag {
    const key = `${p.season}|${p.seasonType}|${p.week}|${id}`
    const entry = this.entries.get(key)
    if (entry) {
      entry.team ??= team
      return entry.bag
    }
    const bag = new Bag()
    this.entries.set(key, { play: p, playerKey: id, team, bag })
    return bag
  }

  add(p: Play): void {
    // Penalties count on wiped-out snaps too: that is where most of them are.
    if (p.penalty && p.penaltyPlayerId) {
      const b = this.bag(p, p.penaltyPlayerId, p.penaltyTeam)
      b.add('pen_n')
      b.add('pen_yds', p.penaltyYards)
      b.tally('pen_types', p.penaltyType)
    }
    if (!counts(p)) return
    if (p.dropback && p.passerId) passer(this.bag(p, p.passerId, p.posteam), p)
    if (p.playType === 'run' && p.rusherId) rusher(this.bag(p, p.rusherId, p.posteam), p)
    if (p.receiverId && p.passAttempt && !p.sack) {
      receiver(this.bag(p, p.receiverId, p.posteam), p)
    }
    if (p.kneel && p.rusherId) this.bag(p, p.rusherId, p.posteam).add('pass_kneels')
    if (p.spike && p.passPlayerId) this.bag(p, p.passPlayerId, p.posteam).add('pass_spikes')
    if ((p.fieldGoal || p.extraPoint) && p.kickerId) {
      this.bag(p, p.kickerId, p.posteam).add('k_epa_sum', p.epa)
    }
    if (p.kickoff && p.kickerId) {
      // On kickoffs nflverse's posteam is the receiving team, so the kicker is on defteam.
      const b = this.bag(p, p.kickerId, p.defteam)
      b.add('k_kickoffs')
      b.addIf('k_ko_touchbacks', p.touchback)
      b.addIf('k_onside_att', p.onside)
      b.addIf('k_onside_rec', p.onside && p.ownKickoffRecovery)
    }
    if (p.kickoff && p.kickReturnerId) {
      const b = this.bag(p, p.kickReturnerId, p.returnTeam ?? p.posteam)
      returner(b, p, 'kr', p.kickReturnerId, p.kickoffFairCatch)
    }
    if (p.punt && p.punterId) {
      const b = this.bag(p, p.punterId, p.posteam)
      b.add('p_punts')
      b.add('p_epa_sum', p.epa)
      b.addIf('p_inside_20', p.puntInside20)
      b.addIf('p_touchbacks', p.touchback)
      b.addIf('p_fair_catches', p.puntFairCatch)
      b.addIf('p_blocked', p.puntBlocked)
    }
    if (p.punt && p.puntReturnerId) {
      const b = this.bag(p, p.puntReturnerId, p.returnTeam ?? p.defteam)
      returner(b, p, 'pr', p.puntReturnerId, p.puntFairCatch)
    }
    const run = p.playType === 'run'
    if (run || p.complete) {
      for (const id of new Set(p.tacklerIds)) {
        const b = this.bag(p, id, p.defteam)
        b.addIf('def_stuffs', run && p.yardsGained !== null && p.yardsGained <= 0)
        if (p.yardsGained !== null) {
          b.add('def_tackle_depth_sum', p.yardsGained)
          b.add('def_tackle_depth_n')
        }
      }
    }
  }

  finish(): WhPlayerWeek[] {
    const rows: WhPlayerWeek[] = []
    for (const { play, playerKey, team, bag } of this.entries.values()) {
      const data = bag.data()
      if (Object.keys(data).length === 0) continue
      rows.push({
        source: 'pbp',
        season: play.season,
        seasonType: play.seasonType,
        week: play.week,
        playerKey,
        keyType: 'gsis',
        team,
        opponent: opponentOf(play, team),
        data
      })
    }
    return rows
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/warehouse && npm run typecheck:node`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/warehouse/pbpPlayers.ts tests/main/warehouse/pbpPlayers.test.ts
git add src/main/warehouse/pbpPlayers.ts tests/main/warehouse/pbpPlayers.test.ts
git commit -m "feat(warehouse): aggregate pbp player-weeks"
```

---

### Task 5: Team-weeks and drives (spec §6.3)

**Files:**

- Create: `src/main/warehouse/pbpTeams.ts`
- Test: `tests/main/warehouse/pbpTeams.test.ts`

**Interfaces:**

- Consumes: `Play`, `counts`, `isScrimmage`, `opponentOf`, `Bag` (Task 3).
- Produces:
  - `class TeamWeeks` with `add(play)` and `finish(): WhTeamWeek[]` (source `pbp`, keyed by team). Each metric is written to the offense as `off_<m>` and to the defense as `def_<m>` (amendment D).
  - `summarizeDrive(rows: Play[]): DriveSummary | null`.

Definitions:

- **Snap metrics** (plays, EPA, success, early downs, explosives, xpass, neutral, shotgun, no-huddle, third / fourth downs, turnovers, havoc) use `isScrimmage` snaps only.
- **Neutral** = `wp` 0.20–0.80 in quarters 1–3.
- **Pace** = the seconds between two consecutive neutral snaps of the same game, drive and offense.
- **A drive** is a `fixed_drive` of one game:
  - Its team is the `posteam` of its first snap (a dropback, run, punt or field goal), and only that team's rows count.
  - `drive_plays` = its snaps; `drive_yds` = `ydsnet` of its last row; `drive_seconds` = `drive_time_of_possession`.
  - `drive_points` = the highest `posteam_score_post` minus the lowest `posteam_score` (PATs included).
  - `drive_start_sum` adds the first snap's `yardline_100`.
  - A three-and-out is a `Punt` result with `drive_first_downs = 0`. A turnover is `Turnover` or `Opp touchdown`.
  - A red-zone trip is a snap at `yardline_100 ≤ 20`; a goal-to-go drive has any `goal_to_go` row.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/warehouse/pbpTeams.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { WhData, WhTeamWeek } from '@main/db/repos/warehouse'
import { summarizeDrive, TeamWeeks } from '@main/warehouse/pbpTeams'
import { dropback, play, run, type PbpRow } from '../../fixtures/pbp'

function weeks(rows: PbpRow[]): WhTeamWeek[] {
  const teams = new TeamWeeks()
  for (const r of rows) teams.add(play(r))
  return teams.finish()
}

const dataOf = (rows: WhTeamWeek[], team: string): WhData | undefined =>
  rows.find((r) => r.team === team)?.data

/** DAL with the ball against PHI. */
const dal = (row: PbpRow): PbpRow => ({ ...row, posteam: 'DAL', defteam: 'PHI' })

describe('pbp team-weeks (spec §6.3)', () => {
  it('writes each play to the offense as off_* and to the defense as def_*', () => {
    const rows = weeks([
      dropback({
        complete_pass: 1,
        yards_gained: 25,
        epa: 0.5,
        success: 1,
        shotgun: 1,
        wp: 0.5,
        qtr: 1,
        xpass: 0.6,
        pass_oe: 40
      })
    ])
    const metrics = {
      plays: 1,
      epa_sum: 0.5,
      success_n: 1,
      pass_plays: 1,
      pass_epa_sum: 0.5,
      pass_success_n: 1,
      early_plays: 1,
      early_epa_sum: 0.5,
      explosive_pass: 1,
      xpass_sum: 0.6,
      pass_oe_sum: 40,
      xpass_n: 1,
      neutral_plays: 1,
      neutral_passes: 1,
      shotgun: 1
    }
    const prefixed = (prefix: string): WhData =>
      Object.fromEntries(Object.entries(metrics).map(([k, v]) => [prefix + k, v]))
    expect(rows.find((r) => r.team === 'PHI')).toMatchObject({
      opponent: 'DAL',
      data: prefixed('off_')
    })
    expect(dataOf(rows, 'PHI')).toEqual(prefixed('off_'))
    expect(dataOf(rows, 'DAL')).toEqual(prefixed('def_'))
  })

  it('downs, turnovers, havoc, punts, two-point tries and penalties', () => {
    const rows = weeks([
      run({ down: 3, third_down_converted: 1 }),
      run({ down: 4, fourth_down_failed: 1, tackled_for_loss: 1, yards_gained: -2 }),
      { play_type: 'punt', punt_attempt: 1, special: 1, down: 4 },
      { play_type: 'field_goal', field_goal_attempt: 1, special: 1, down: 4 },
      dropback({ down: 2, interception: 1 }),
      run({ two_point_attempt: 1, two_point_conv_result: 'success', down: '' }),
      { play_type: 'no_play', penalty: 1, penalty_team: 'DAL', penalty_yards: 15 }
    ])
    expect(dataOf(rows, 'PHI')).toEqual({
      off_plays: 3,
      off_rush_plays: 2,
      off_pass_plays: 1,
      off_early_plays: 1,
      off_third_att: 1,
      off_third_conv: 1,
      off_fourth_go: 1,
      off_fourth_failed: 1,
      off_fourth_downs: 3,
      off_punts: 1,
      off_turnovers: 1,
      off_havoc: 2,
      off_two_pt_att: 1,
      off_two_pt_conv: 1,
      off_pen_defense_n: 1,
      off_pen_defense_yds: 15
    })
    expect(dataOf(rows, 'DAL')).toMatchObject({
      def_punts: 1,
      def_fourth_failed: 1,
      def_havoc: 2,
      def_pen_defense_n: 1
    })
  })

  it('pace: seconds between consecutive neutral snaps of one drive', () => {
    const snap = (clock: number, drive: number, wp = 0.5): PbpRow =>
      run({ game_seconds_remaining: clock, fixed_drive: drive, wp, qtr: 1 })
    const rows = weeks([
      snap(3500, 1),
      snap(3470, 1),
      snap(3440, 1),
      snap(3400, 2),
      snap(3380, 2, 0.9),
      snap(3360, 2)
    ])
    expect(dataOf(rows, 'PHI')).toMatchObject({ off_pace_sum: 60, off_pace_n: 2 })
    expect(dataOf(rows, 'DAL')).toMatchObject({ def_pace_sum: 60, def_pace_n: 2 })
  })

  describe('drives', () => {
    const td: PbpRow[] = [
      {
        play_type: 'kickoff',
        kickoff_attempt: 1,
        special: 1,
        yardline_100: 35,
        posteam_score: 0,
        posteam_score_post: 0
      },
      run({ yardline_100: 75, ydsnet: 10, posteam_score: 0, posteam_score_post: 0 }),
      dropback({ yardline_100: 65, ydsnet: 72, posteam_score: 0, posteam_score_post: 0 }),
      run({
        yardline_100: 3,
        goal_to_go: 1,
        ydsnet: 75,
        rush_touchdown: 1,
        posteam_score: 0,
        posteam_score_post: 6
      }),
      {
        play_type: 'extra_point',
        extra_point_attempt: 1,
        special: 1,
        posteam_score: 6,
        posteam_score_post: 7
      }
    ].map((r) => ({
      ...r,
      fixed_drive: 1,
      fixed_drive_result: 'Touchdown',
      drive_time_of_possession: '2:30',
      drive_first_downs: 2,
      drive_ended_with_score: 1
    }))
    const threeAndOut: PbpRow[] = [
      run({ yardline_100: 80, ydsnet: 2 }),
      run({ down: 2, yardline_100: 78, ydsnet: 3 }),
      run({ down: 3, yardline_100: 77, ydsnet: 3 }),
      { play_type: 'punt', punt_attempt: 1, special: 1, down: 4, yardline_100: 77, ydsnet: 3 }
    ].map((r) => ({
      ...dal(r),
      fixed_drive: 2,
      fixed_drive_result: 'Punt',
      drive_time_of_possession: '1:40',
      drive_first_downs: 0,
      drive_ended_with_score: 0
    }))

    it('summarizes a touchdown drive from its own rows', () => {
      expect(summarizeDrive(td.map(play))).toMatchObject({
        team: 'PHI',
        opponent: 'DAL',
        plays: 3,
        yards: 75,
        seconds: 150,
        points: 7,
        threeAndOut: false,
        scored: true,
        turnover: false,
        punt: false,
        redZone: true,
        touchdown: true,
        goalToGo: true
      })
      expect(summarizeDrive(td.map(play))?.first.yardline).toBe(75)
      expect(summarizeDrive(td.slice(0, 1).map(play))).toBeNull()
    })

    it('counts a turnover for a pick six', () => {
      const pick = dropback({
        fixed_drive: 3,
        fixed_drive_result: 'Opp touchdown',
        interception: 1
      })
      expect(summarizeDrive([play(pick)])).toMatchObject({ turnover: true, points: 0 })
    })

    it('adds drives to both teams', () => {
      const rows = weeks([...td, ...threeAndOut])
      expect(dataOf(rows, 'PHI')).toMatchObject({
        off_drives: 1,
        off_drive_plays: 3,
        off_drive_yds: 75,
        off_drive_seconds: 150,
        off_drive_points: 7,
        off_drive_start_sum: 75,
        off_drive_scores: 1,
        off_rz_trips: 1,
        off_rz_tds: 1,
        off_gtg_drives: 1,
        off_gtg_tds: 1,
        def_drives: 1,
        def_three_and_outs: 1,
        def_drive_punts: 1,
        def_drive_start_sum: 80,
        def_drive_seconds: 100
      })
      expect(dataOf(rows, 'DAL')).toMatchObject({
        off_drives: 1,
        off_three_and_outs: 1,
        def_drive_points: 7
      })
    })
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/main/warehouse/pbpTeams.test.ts`
Expected: FAIL — `@main/warehouse/pbpTeams` does not exist.

- [ ] **Step 3: Implement**

Create `src/main/warehouse/pbpTeams.ts`:

```ts
import type { WhTeamWeek } from '@main/db/repos/warehouse'
import { Bag } from './bag'
import { counts, isScrimmage, opponentOf, type Play } from './play'

/** Spec §6.3: neutral script = win probability 20–80 % in quarters 1–3. */
const neutral = (p: Play): boolean =>
  p.wp !== null && p.wp >= 0.2 && p.wp <= 0.8 && p.qtr !== null && p.qtr <= 3

/** The metrics of one play, written to the offense's `off_` bag and the defense's `def_` bag. */
function record(b: Bag, p: Play): void {
  if (p.penalty && p.penaltyTeam) {
    const by = p.penaltyTeam === p.posteam ? 'offense' : 'defense'
    b.add(`pen_${by}_n`)
    b.add(`pen_${by}_yds`, p.penaltyYards)
  }
  if (p.twoPoint && !p.noPlay) {
    b.add('two_pt_att')
    b.addIf('two_pt_conv', p.twoPointSuccess)
  }
  if (!counts(p)) return
  if (p.special) b.add('st_epa_sum', p.epa)
  if (p.kickoff) b.addIf('ko_touchbacks', p.touchback)
  b.addIf('punts', p.punt)
  b.addIf('fourth_downs', p.down === 4 && (isScrimmage(p) || p.punt || p.fieldGoal))
  if (!isScrimmage(p)) return
  b.add('plays')
  b.add('epa_sum', p.epa)
  b.addIf('success_n', p.success)
  for (const [kind, is] of [
    ['pass', p.pass],
    ['rush', p.rush]
  ] as const) {
    if (!is) continue
    b.add(`${kind}_plays`)
    b.add(`${kind}_epa_sum`, p.epa)
    b.addIf(`${kind}_success_n`, p.success)
  }
  if (p.down === 1 || p.down === 2) {
    b.add('early_plays')
    b.add('early_epa_sum', p.epa)
  }
  const gained = p.yardsGained ?? 0
  b.addIf('explosive_rush', p.rush && gained >= 10)
  b.addIf('explosive_pass', p.pass && p.complete && gained >= 20)
  if (p.xpass !== null) {
    b.add('xpass_sum', p.xpass)
    b.add('pass_oe_sum', p.passOe)
    b.add('xpass_n')
  }
  if (neutral(p)) {
    b.add('neutral_plays')
    b.addIf('neutral_passes', p.pass)
  }
  b.addIf('no_huddle', p.noHuddle)
  b.addIf('shotgun', p.shotgun)
  if (p.down === 3) {
    b.add('third_att')
    b.addIf('third_conv', p.thirdConverted)
  }
  if (p.down === 4) {
    b.add('fourth_go')
    b.addIf('fourth_conv', p.fourthConverted)
    b.addIf('fourth_failed', p.fourthFailed)
  }
  b.addIf('turnovers', p.interception)
  b.addIf('turnovers', p.fumbleLost)
  b.addIf('havoc', p.tackledForLoss || p.fumbleForced || p.interception || p.passDefended)
}

export interface DriveSummary {
  /** The drive's first snap: its season, week, teams and starting field position. */
  first: Play
  team: string
  opponent: string
  plays: number
  /** Net yards (`ydsnet` of its last row). */
  yards: number | null
  seconds: number | null
  points: number
  threeAndOut: boolean
  scored: boolean
  turnover: boolean
  punt: boolean
  redZone: boolean
  touchdown: boolean
  goalToGo: boolean
}

function firstOf<T>(rows: Play[], pick: (p: Play) => T | null): T | null {
  for (const p of rows) {
    const value = pick(p)
    if (value !== null) return value
  }
  return null
}

/** One `fixed_drive`'s rows → its summary; null for a drive without a snap (a lone kickoff). */
export function summarizeDrive(rows: Play[]): DriveSummary | null {
  const first = rows.find((p) => isScrimmage(p) || (counts(p) && (p.punt || p.fieldGoal)))
  if (!first?.posteam || !first.defteam) return null
  const team = first.posteam
  const mine = rows.filter((p) => p.posteam === team)
  const result = firstOf(mine, (p) => p.driveResult)
  const scores = mine.flatMap((p) => (p.score === null ? [] : [p.score]))
  const after = mine.flatMap((p) => (p.scorePost === null ? [] : [p.scorePost]))
  return {
    first,
    team,
    opponent: first.defteam,
    plays: mine.filter(isScrimmage).length,
    yards: firstOf([...mine].reverse(), (p) => p.ydsnet),
    seconds: firstOf(mine, (p) => p.driveSeconds),
    points: scores.length > 0 && after.length > 0 ? Math.max(...after) - Math.min(...scores) : 0,
    threeAndOut: result === 'Punt' && firstOf(mine, (p) => p.driveFirstDowns) === 0,
    scored: mine.some((p) => p.driveScored),
    turnover: result === 'Turnover' || result === 'Opp touchdown',
    punt: result === 'Punt',
    redZone: mine.some((p) => isScrimmage(p) && p.yardline !== null && p.yardline <= 20),
    touchdown: result === 'Touchdown',
    goalToGo: mine.some((p) => counts(p) && p.goalToGo)
  }
}

function recordDrive(b: Bag, d: DriveSummary): void {
  b.add('drives')
  b.add('drive_plays', d.plays)
  b.add('drive_yds', d.yards)
  b.add('drive_seconds', d.seconds)
  b.add('drive_points', d.points)
  b.add('drive_start_sum', d.first.yardline)
  b.addIf('three_and_outs', d.threeAndOut)
  b.addIf('drive_scores', d.scored)
  b.addIf('drive_turnovers', d.turnover)
  b.addIf('drive_punts', d.punt)
  b.addIf('rz_trips', d.redZone)
  b.addIf('rz_tds', d.redZone && d.touchdown)
  b.addIf('gtg_drives', d.goalToGo)
  b.addIf('gtg_tds', d.goalToGo && d.touchdown)
}

interface Side {
  play: Play
  team: string
  off: Bag
  def: Bag
}

/** Spec §6.3: `pbp` team-weeks; every metric as `off_*` (the team had the ball) and `def_*`. */
export class TeamWeeks {
  private readonly sides = new Map<string, Side>()
  private readonly drives = new Map<string, Play[]>()
  /** The previous snap, for the seconds between neutral snaps (pace). */
  private last: Play | null = null

  private side(p: Play, team: string): Side {
    const key = `${p.season}|${p.seasonType}|${p.week}|${team}`
    let side = this.sides.get(key)
    if (!side) {
      side = { play: p, team, off: new Bag(), def: new Bag() }
      this.sides.set(key, side)
    }
    return side
  }

  /** The offense's `off_` bag and the defense's `def_` bag for a play between `team` and `opponent`. */
  private both(p: Play, team: string, opponent: string): Bag[] {
    return [this.side(p, team).off, this.side(p, opponent).def]
  }

  add(p: Play): void {
    if (p.drive !== null && p.posteam) {
      const key = `${p.gameId}|${p.drive}`
      const rows = this.drives.get(key)
      if (rows) rows.push(p)
      else this.drives.set(key, [p])
    }
    if (!p.posteam || !p.defteam) return
    const bags = this.both(p, p.posteam, p.defteam)
    for (const b of bags) record(b, p)
    if (!isScrimmage(p)) return
    const prev = this.last
    this.last = p
    if (
      prev &&
      prev.gameId === p.gameId &&
      prev.drive === p.drive &&
      prev.posteam === p.posteam &&
      neutral(prev) &&
      neutral(p) &&
      prev.clock !== null &&
      p.clock !== null &&
      prev.clock >= p.clock
    ) {
      for (const b of bags) {
        b.add('pace_sum', prev.clock - p.clock)
        b.add('pace_n')
      }
    }
  }

  finish(): WhTeamWeek[] {
    for (const rows of this.drives.values()) {
      const d = summarizeDrive(rows)
      if (d) for (const b of this.both(d.first, d.team, d.opponent)) recordDrive(b, d)
    }
    const rows: WhTeamWeek[] = []
    for (const { play, team, off, def } of this.sides.values()) {
      const data = { ...off.data('off_'), ...def.data('def_') }
      if (Object.keys(data).length === 0) continue
      rows.push({
        source: 'pbp',
        season: play.season,
        seasonType: play.seasonType,
        week: play.week,
        team,
        opponent: opponentOf(play, team),
        data
      })
    }
    return rows
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/warehouse && npm run typecheck:node`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/warehouse/pbpTeams.ts tests/main/warehouse/pbpTeams.test.ts
git add src/main/warehouse/pbpTeams.ts tests/main/warehouse/pbpTeams.test.ts
git commit -m "feat(warehouse): aggregate pbp team-weeks"
```

---

### Task 6: `aggregatePbp` (spec §6.1, §7)

**Files:**

- Create: `src/main/warehouse/aggregate.ts`
- Test: `tests/main/warehouse/aggregate.test.ts`

**Interfaces:**

- Consumes: `forEachCsvRow` (Task 1), `requireColumns` (existing), `playReader`, `PlayerWeeks`, `TeamWeeks` (Tasks 3–5).
- Produces: `interface PbpResult { playerWeeks; teamWeeks; skipped }` and `aggregatePbp(text): PbpResult`. A missing key column throws `pbp: column "<name>" is missing`.

The real-game test compares against nflverse's own `stats_player_week_2025` for that game (taken 2026-10-11). The rule it checks: carries = `rush_carries` + `pass_kneels`, and targets = `rec_targets`. If nflverse later revises the 2025 data and the fixture is re-captured, refresh the table from that file too.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/warehouse/aggregate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { WhValue } from '@main/db/repos/warehouse'
import { aggregatePbp } from '@main/warehouse/aggregate'
import { captured } from '../../fixtures/warehouse'
import { dropback, pbpCsv, QB, RB, run, WR } from '../../fixtures/pbp'

/** nflverse `stats_player_week` 2025 for this game: [gsis id, carries, targets]. */
const OFFICIAL: [string, number, number][] = [
  ['00-0033077', 1, 0], // Dak Prescott DAL
  ['00-0034351', 0, 7], // Dallas Goedert PHI
  ['00-0034844', 18, 5], // Saquon Barkley PHI
  ['00-0035243', 4, 1], // Miles Sanders DAL
  ['00-0035676', 0, 1], // A.J. Brown PHI
  ['00-0036265', 3, 0], // AJ Dillon PHI
  ['00-0036358', 0, 13], // CeeDee Lamb DAL
  ['00-0036389', 14, 0], // Jalen Hurts PHI
  ['00-0036876', 0, 1], // Kylen Granson PHI
  ['00-0036912', 0, 3], // DeVonta Smith PHI
  ['00-0036997', 15, 3], // Javonte Williams DAL
  ['00-0037247', 0, 4], // George Pickens DAL
  ['00-0037666', 0, 2], // Jalen Tolbert DAL
  ['00-0037741', 0, 3], // Jahan Dotson PHI
  ['00-0037801', 2, 2], // KaVontae Turpin DAL
  ['00-0038041', 0, 6], // Jake Ferguson DAL
  ['00-0038547', 0, 1], // Luke Schoonmaker DAL
  ['00-0039530', 0, 1], // Brevyn Spann-Ford DAL
  ['00-0039746', 3, 0] // Will Shipley PHI
]

const finite = (v: WhValue): boolean =>
  typeof v === 'number'
    ? Number.isFinite(v)
    : typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(finite)

describe('aggregatePbp (spec §6.1)', () => {
  it('aggregates a hand-built file, leaving out deleted, preseason and keyless rows', () => {
    const out = aggregatePbp(
      pbpCsv([
        run({ rushing_yards: 4 }),
        run({ rushing_yards: 6, week: 2 }),
        run({ play_deleted: 1 }),
        run({ season_type: 'PRE' }),
        run({ week: '' }),
        dropback({ season_type: 'POST', week: 19 })
      ])
    )
    expect(out.skipped).toBe(1)
    expect(
      out.playerWeeks.map((r) => [r.playerKey, r.seasonType, r.week, r.data.rush_carries ?? 0])
    ).toEqual([
      [RB, 'REG', 1, 1],
      [RB, 'REG', 2, 1],
      [QB, 'POST', 19, 0],
      [WR, 'POST', 19, 0]
    ])
    expect(
      out.teamWeeks.map((r) => [r.team, r.week, r.data.off_plays ?? r.data.def_plays])
    ).toEqual([
      ['PHI', 1, 1],
      ['DAL', 1, 1],
      ['PHI', 2, 1],
      ['DAL', 2, 1],
      ['PHI', 19, 1],
      ['DAL', 19, 1]
    ])
    expect(out.playerWeeks.every((r) => r.source === 'pbp' && r.keyType === 'gsis')).toBe(true)
  })

  it('accepts a header-only file and fails on a missing key column', () => {
    expect(aggregatePbp(pbpCsv([]))).toEqual({ playerWeeks: [], teamWeeks: [], skipped: 0 })
    expect(() => aggregatePbp('play_id,season,week\n1,2025,1\n')).toThrow(
      'pbp: column "game_id" is missing'
    )
  })

  it('matches nflverse carries and targets on a real game', () => {
    const out = aggregatePbp(captured('pbp_2025_game.csv'))
    expect(out.skipped).toBe(0)
    const byKey = new Map(out.playerWeeks.map((r) => [r.playerKey, r.data]))
    const counted = OFFICIAL.map(([id]) => {
      const d = byKey.get(id) ?? {}
      return [id, Number(d.rush_carries ?? 0) + Number(d.pass_kneels ?? 0), d.rec_targets ?? 0]
    })
    expect(counted).toEqual(OFFICIAL)
  })

  it('mirrors the two teams of a real game and stores only sums and counts', () => {
    const out = aggregatePbp(captured('pbp_2025_game.csv'))
    const [phi, dal] = ['PHI', 'DAL'].map((t) => out.teamWeeks.find((r) => r.team === t)?.data)
    expect(out.teamWeeks).toHaveLength(2)
    // PHI won 24–20.
    expect([phi?.off_drive_points, dal?.off_drive_points]).toEqual([24, 20])
    expect(phi?.off_plays).toBe(dal?.def_plays)
    expect(phi?.def_epa_sum).toBe(dal?.off_epa_sum)
    for (const r of [...out.playerWeeks, ...out.teamWeeks]) {
      expect(Object.values(r.data).every(finite)).toBe(true)
    }
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/main/warehouse/aggregate.test.ts`
Expected: FAIL — `@main/warehouse/aggregate` does not exist.

- [ ] **Step 3: Implement**

Create `src/main/warehouse/aggregate.ts`:

```ts
import type { WhPlayerWeek, WhTeamWeek } from '@main/db/repos/warehouse'
import { forEachCsvRow } from '@main/sources/csv'
import { requireColumns } from '@main/sources/warehouse/parse'
import { PlayerWeeks } from './pbpPlayers'
import { TeamWeeks } from './pbpTeams'
import { PBP_KEY_COLUMNS, playReader } from './play'

/** What one season of play-by-play aggregates to (spec §6.1). */
export interface PbpResult {
  playerWeeks: WhPlayerWeek[]
  teamWeeks: WhTeamWeek[]
  /** Rows without a game, season or week. */
  skipped: number
}

/** Spec §6.1–§6.3: a play-by-play CSV, one row at a time, into `pbp` player-weeks and team-weeks. */
export function aggregatePbp(text: string): PbpResult {
  requireColumns(text, 'pbp', PBP_KEY_COLUMNS)
  const players = new PlayerWeeks()
  const teams = new TeamWeeks()
  let read: ReturnType<typeof playReader> | null = null
  let skipped = 0
  forEachCsvRow(text, (fields, header) => {
    read ??= playReader(header)
    const play = read(fields)
    if (play === 'skip') skipped++
    else if (play !== null) {
      players.add(play)
      teams.add(play)
    }
  })
  return { playerWeeks: players.finish(), teamWeeks: teams.finish(), skipped }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/warehouse && npm run typecheck:node`
Expected: PASS. In particular, "matches nflverse carries and targets on a real game" matches all 19 players.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/warehouse/aggregate.ts tests/main/warehouse/aggregate.test.ts
git add src/main/warehouse/aggregate.ts tests/main/warehouse/aggregate.test.ts
git commit -m "feat(warehouse): aggregate a play-by-play file"
```

---

### Task 7: The warehouse worker (spec §6.1)

**Files:**

- Create: `src/main/warehouse/job.ts`, `src/main/warehouse/worker.ts`, `src/main/warehouse/runWorker.ts`
- Modify: `electron.vite.config.ts`
- Test: `tests/main/warehouse/runWorker.test.ts`

**Interfaces:**

- Consumes: `decodeText` (Task 2), `aggregatePbp` (Task 6).
- Produces (`job.ts`):
  - `WarehouseJob { pbp: Uint8Array }`, `WarehouseOutput`.
  - `type AggregatePbp = (bytes: Uint8Array) => Promise<PbpResult>`.
  - `runWarehouseJob(job)`, and `aggregateInProcess: AggregatePbp` (tests and scripts only).
- Produces (`runWorker.ts`): `runPbpWorker: AggregatePbp`, plus the error texts `PBP_UNREADABLE` and `PBP_OUT_OF_MEMORY`. It starts one worker per call and transfers the bytes' buffer to it.
- Produces (build): `out/main/warehouseWorker.js`.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/warehouse/runWorker.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEmitter } from 'node:events'
import { PBP_OUT_OF_MEMORY, PBP_UNREADABLE, runPbpWorker } from '@main/warehouse/runWorker'

type FakeWorker = EventEmitter & {
  terminated: boolean
  options: { workerData: unknown; transferList: unknown[] }
}

const { workers } = vi.hoisted(() => ({ workers: [] as FakeWorker[] }))

/** A worker that never runs: the test emits its events. */
vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  class Worker extends EventEmitter {
    terminated = false
    constructor(
      _path: string,
      public options: unknown
    ) {
      super()
      workers.push(this as unknown as FakeWorker)
    }
    terminate(): Promise<number> {
      this.terminated = true
      return Promise.resolve(0)
    }
  }
  return { Worker }
})

beforeEach(() => {
  workers.length = 0
})

const RESULT = { playerWeeks: [], teamWeeks: [], skipped: 2 }

describe('runPbpWorker (spec §6.1)', () => {
  it('transfers the bytes and resolves with the answer', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const done = runPbpWorker(bytes)
    expect(workers[0].options).toEqual({ workerData: { pbp: bytes }, transferList: [bytes.buffer] })
    workers[0].emit('message', { result: RESULT })
    await expect(done).resolves.toEqual(RESULT)
    expect(workers[0].terminated).toBe(true)
  })

  it('rejects with the worker’s error, wording memory and unreadable answers', async () => {
    const answers = [
      ['message', { error: 'pbp: column "game_id" is missing' }],
      ['messageerror', new Error('could not deserialize')],
      ['error', Object.assign(new Error('heap'), { code: 'ERR_WORKER_OUT_OF_MEMORY' })],
      ['exit', 1]
    ] as const
    const messages: string[] = []
    for (const [event, payload] of answers) {
      const done = runPbpWorker(new Uint8Array([1]))
      workers[workers.length - 1].emit(event, payload)
      messages.push(
        await done.then(
          () => 'resolved',
          (err: Error) => err.message
        )
      )
    }
    expect(messages).toEqual([
      'pbp: column "game_id" is missing',
      PBP_UNREADABLE,
      PBP_OUT_OF_MEMORY,
      'Play-by-play aggregation stopped unexpectedly (exit 1)'
    ])
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/main/warehouse/runWorker.test.ts`
Expected: FAIL — `@main/warehouse/runWorker` does not exist.

- [ ] **Step 3: Implement**

Create `src/main/warehouse/job.ts`:

```ts
import { decodeText } from '@main/sources/http'
import { aggregatePbp, type PbpResult } from './aggregate'

/** What the warehouse worker is given: one season's play-by-play file as downloaded (spec §6.1). */
export interface WarehouseJob {
  pbp: Uint8Array
}

export type WarehouseOutput = { result: PbpResult; error?: undefined } | { error: string }

/** Turns a downloaded play-by-play file into its aggregates; the sync takes it as a dependency. */
export type AggregatePbp = (bytes: Uint8Array) => Promise<PbpResult>

/** The worker's job: gunzip, decode, aggregate. */
export function runWarehouseJob(job: WarehouseJob): PbpResult {
  return aggregatePbp(decodeText(job.pbp))
}

/** The same job on the calling thread, for tests and scripts. */
export const aggregateInProcess: AggregatePbp = async (bytes) => runWarehouseJob({ pbp: bytes })
```

Create `src/main/warehouse/worker.ts`:

```ts
import { parentPort, workerData } from 'node:worker_threads'
import { runWarehouseJob, type WarehouseJob, type WarehouseOutput } from './job'

/** Worker entry, bundled to `out/main/warehouseWorker.js`: one job, one answer. */
let output: WarehouseOutput
try {
  output = { result: runWarehouseJob(workerData as WarehouseJob) }
} catch (err) {
  output = { error: err instanceof Error ? err.message : String(err) }
}
parentPort?.postMessage(output)
```

Create `src/main/warehouse/runWorker.ts`:

```ts
import { join } from 'node:path'
import { Worker } from 'node:worker_threads'
import type { PbpResult } from './aggregate'
import type { AggregatePbp, WarehouseJob, WarehouseOutput } from './job'

/** Bundled beside the main entry by `electron.vite.config.ts`. */
function workerPath(): string {
  return join(__dirname, 'warehouseWorker.js')
}

export const PBP_UNREADABLE = 'Play-by-play aggregation sent an unreadable answer'
export const PBP_OUT_OF_MEMORY = 'Play-by-play aggregation ran out of memory'

/**
 * Spec §6.1: a season is ~100 MB of CSV and takes seconds to aggregate, so it runs off the main
 * thread. The bytes are transferred to the worker, not copied; one worker per season.
 */
export const runPbpWorker: AggregatePbp = (bytes) =>
  new Promise<PbpResult>((resolve, reject) => {
    const workerData: WarehouseJob = { pbp: bytes }
    const worker = new Worker(workerPath(), {
      workerData,
      transferList: [bytes.buffer as ArrayBuffer]
    })
    let answered = false
    const settle = (fn: () => void): void => {
      if (answered) return
      answered = true
      void worker.terminate()
      fn()
    }
    worker.on('message', (out: WarehouseOutput) =>
      settle(() => (out.error === undefined ? resolve(out.result) : reject(new Error(out.error))))
    )
    worker.on('messageerror', () => settle(() => reject(new Error(PBP_UNREADABLE))))
    worker.on('error', (err) =>
      settle(() =>
        reject(
          (err as NodeJS.ErrnoException).code === 'ERR_WORKER_OUT_OF_MEMORY'
            ? new Error(PBP_OUT_OF_MEMORY)
            : err
        )
      )
    )
    worker.on('exit', (code) =>
      settle(() =>
        reject(new Error(`Play-by-play aggregation stopped unexpectedly (exit ${code})`))
      )
    )
  })
```

In `electron.vite.config.ts`, replace the comment and `input` block of `main.build.rollupOptions` with:

```ts
        // The trade and waiver searches (6b / 6c spec §6) and the play-by-play aggregation
        // (stats-warehouse spec §6.1) run in worker threads, bundled beside the main entry.
        input: {
          index: resolve('src/main/index.ts'),
          engineWorker: resolve('src/main/engine/worker.ts'),
          warehouseWorker: resolve('src/main/warehouse/worker.ts')
        }
```

- [ ] **Step 4: Run the tests and check the bundle**

Run: `npx vitest run tests/main/warehouse && npm run typecheck:node && npx electron-vite build`
Expected: tests PASS; the build lists `out/main/warehouseWorker.js` (~21 kB) beside `engineWorker.js`.

Then run the built worker once on the captured game, outside Electron:

```bash
node -e "const {Worker}=require('node:worker_threads');const b=new Uint8Array(require('node:fs').readFileSync('tests/fixtures/warehouse/pbp_2025_game.csv'));const w=new Worker('./out/main/warehouseWorker.js',{workerData:{pbp:b},transferList:[b.buffer]});w.on('message',m=>{console.log(m.error??[m.result.playerWeeks.length,m.result.teamWeeks.length,m.result.skipped],'transferred:',b.byteLength===0);w.terminate()})"
```

Expected: `[ <players>, 2, 0 ] transferred: true`, with no error.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/warehouse/job.ts src/main/warehouse/worker.ts src/main/warehouse/runWorker.ts electron.vite.config.ts tests/main/warehouse/runWorker.test.ts
git add src/main/warehouse/job.ts src/main/warehouse/worker.ts src/main/warehouse/runWorker.ts electron.vite.config.ts tests/main/warehouse/runWorker.test.ts
git commit -m "feat(warehouse): run pbp in a worker thread"
```

---

### Task 8: The `pbp` step and its wiring (spec §4, §6.1)

**Files:**

- Modify: `src/main/sync/warehouseSteps.ts`, `src/main/sync/warehouseSync.ts`, `src/main/ipc/handlers.ts`, `tests/fixtures/warehouse.ts`
- Test: `tests/main/sync/warehouseSteps.test.ts`, `tests/main/sync/warehouseSync.test.ts`

**Interfaces:**

- Consumes: `nflverseFile` (Task 2), `AggregatePbp`, `aggregateInProcess`, `runPbpWorker` (Task 7).
- Produces:
  - `StepContext.aggregatePbp` and `WarehouseSyncDeps.aggregatePbp` (both required).
  - A `pbp` step: sources `[{ source: 'pbp', version: 1 }]`, per season from 2019, last in `WAREHOUSE_STEPS`, logged as `wh:pbp:<season>`.

- [ ] **Step 1: Write the failing tests**

In `tests/fixtures/warehouse.ts`, add to `capturedFiles()`, after `'combine/combine'`:

```ts
    'pbp/play_by_play_2025': captured('pbp_2025_game.csv')
```

In `tests/main/sync/warehouseSteps.test.ts`:

- Import `vi` from `vitest`. Add:

```ts
import type { PbpResult } from '@main/warehouse/aggregate'
import { aggregateInProcess, type AggregatePbp } from '@main/warehouse/job'
```

- In the `ctx` helper, add `aggregatePbp: aggregateInProcess,` before `...over`.
- Add `['pbp', 2025]` to the `it.each` list of captured files.
- In `it('returns null for a file that is not published'`, add:

```ts
expect(await step('pbp').fetch(ctx(fakeWarehouse()), 2026)).toBeNull()
```

- After that test, add:

```ts
it('hands the downloaded play-by-play file to the aggregator and keeps its rows', async () => {
  const result: PbpResult = { playerWeeks: [], teamWeeks: [], skipped: 3 }
  const aggregatePbp = vi.fn<AggregatePbp>(async () => result)
  const client = fakeWarehouse({ 'pbp/play_by_play_2024': 'play_id\n1\n' })
  const out = await step('pbp').fetch(ctx(client, { aggregatePbp }), 2024)
  expect(client.calls).toEqual(['pbp/play_by_play_2024'])
  expect(new TextDecoder().decode(aggregatePbp.mock.calls[0][0])).toBe('play_id\n1\n')
  expect(out).toMatchObject({ playerWeeks: [], teamWeeks: [], skipped: 3 })
})
```

In `tests/main/sync/warehouseSync.test.ts`:

- Add `import { aggregateInProcess } from '@main/warehouse/job'`.
- In the `deps` helper, add `aggregatePbp: aggregateInProcess,` after `state: STATE,`.
- In "runs every registered step against the captured files without an error", add `'pbp',` to the expected source list between `'ngs_rush'` and `'pfr_def'`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/main/sync`
Expected: FAIL — `no step pbp`, and `pbp` is missing from the filled sources.

- [ ] **Step 3: Implement**

In `src/main/sync/warehouseSteps.ts`:

- Add `import type { AggregatePbp } from '@main/warehouse/job'` after the `parseSleeperStats` import.
- In `StepContext`, after `stateSeasonType: string`, add:

```ts
/** Aggregates a downloaded play-by-play file; the warehouse worker in the app. */
aggregatePbp: AggregatePbp
```

- Before the `WAREHOUSE_STEPS` doc comment, add:

```ts
/** Spec §6.1–§6.3: one season of play-by-play, aggregated off the main thread. */
const pbpStep: WarehouseStep = {
  id: 'pbp',
  sources: v1('pbp'),
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season) {
    const bytes = await ctx.client.nflverseFile('pbp', `play_by_play_${season}`)
    if (bytes === null) return null
    return stepRows(await ctx.aggregatePbp(bytes))
  }
}
```

- Change that doc comment to `/** Spec §5 and §6, in sync order (the schedule before depth charts, which map snapshots to its kickoffs). */`, and append `pbpStep` after `combineStep` in `WAREHOUSE_STEPS`.

In `src/main/sync/warehouseSync.ts`:

- Add `import type { AggregatePbp } from '@main/warehouse/job'` after the `WarehouseClient` import.
- In `WarehouseSyncDeps`, after `state`, add:

```ts
/** The warehouse worker in the app (spec §6.1); `aggregateInProcess` in tests. */
aggregatePbp: AggregatePbp
```

- In `refreshWarehouse`, add `aggregatePbp: deps.aggregatePbp` to the `ctx` object, after `stateSeasonType`.

In `src/main/ipc/handlers.ts`:

- Add `import { runPbpWorker } from '@main/warehouse/runWorker'` after the `refreshWarehouse` import.
- In `startWarehouse`, pass:

```ts
          {
            db: ctx.warehouseDb,
            warehouse: ctx.warehouse,
            state: getNflState(ctx.db),
            aggregatePbp: runPbpWorker
          },
```

- [ ] **Step 4: Run everything**

Run: `npm run typecheck && npx eslint src tests electron.vite.config.ts && npm test`
Expected: all green (about 803 tests, 5 skipped).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/sync/warehouseSteps.ts src/main/sync/warehouseSync.ts src/main/ipc/handlers.ts tests/fixtures/warehouse.ts tests/main/sync/warehouseSteps.test.ts tests/main/sync/warehouseSync.test.ts
git add src/main/sync/warehouseSteps.ts src/main/sync/warehouseSync.ts src/main/ipc/handlers.ts tests/fixtures/warehouse.ts tests/main/sync/warehouseSteps.test.ts tests/main/sync/warehouseSync.test.ts
git commit -m "feat(warehouse): sync play-by-play seasons"
```

---

### Task 9: Live check, docs, verification, release

**Files:**

- Modify: `docs/reference/stats-warehouse.md`, `docs/superpowers/specs/2026-10-09-stats-warehouse-design.md`, this plan (Status block)
- Throwaway (never committed): `tests/zz-pbp-live.test.ts`

- [ ] **Step 1: Live backfill and agreement gate**

Get the Sleeper state with `curl -s https://api.sleeper.app/v1/state/nfl` and note `season` and `week`. Create `tests/zz-pbp-live.test.ts` with those values filled in:

```ts
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { openWarehouseDatabase } from '@main/db/warehouseDb'
import { createWarehouseClient } from '@main/sources/warehouse/client'
import { WAREHOUSE_STEPS } from '@main/sync/warehouseSteps'
import { refreshWarehouse } from '@main/sync/warehouseSync'
import { aggregateInProcess } from '@main/warehouse/job'

it('live play-by-play backfill (throwaway; never commit)', { timeout: 3_600_000 }, async () => {
  const path = join(mkdtempSync(join(tmpdir(), 'ffc-pbp-')), 'wh.db')
  const db = openWarehouseDatabase(path)
  const state = {
    season: '2026', // ← state season
    week: 5, // ← state week
    displayWeek: 5,
    seasonType: 'regular',
    fetchedAt: new Date().toISOString()
  }
  const steps = WAREHOUSE_STEPS.filter((s) => s.id === 'pbp' || s.id === 'nflverse_player')
  const start = Date.now()
  const result = await refreshWarehouse(
    { db, warehouse: createWarehouseClient(), state, aggregatePbp: aggregateInProcess },
    {},
    steps
  )
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  console.log({ seconds: (Date.now() - start) / 1000 })
  console.log(
    result.steps.map((s) => `${s.source}=${s.status} ${s.rowsWritten} ${s.message ?? ''}`)
  )
  console.log(
    db
      .prepare(
        `SELECT source, COUNT(*) AS rows, ROUND(SUM(LENGTH(data_json)) / 1e6, 1) AS mb FROM (
           SELECT source, data_json FROM wh_player_week UNION ALL SELECT source, data_json FROM wh_team_week)
         WHERE source = 'pbp' GROUP BY source`
      )
      .all()
  )
  // Spec §11 B: carries = rush_carries + pass_kneels, targets = rec_targets, on every player-week.
  const share = (official: string, ours: string): unknown =>
    db
      .prepare(
        `SELECT n.season, COUNT(*) AS weeks,
           ROUND(AVG(${ours} = json_extract(n.data_json, '$.${official}')), 4) AS agree
         FROM wh_player_week n LEFT JOIN wh_player_week p
           ON p.source = 'pbp' AND p.season = n.season AND p.season_type = n.season_type
          AND p.week = n.week AND p.player_key = n.player_key
         WHERE n.source = 'nflverse_player' AND json_extract(n.data_json, '$.${official}') > 0
         GROUP BY n.season ORDER BY n.season`
      )
      .all()
  const v = (key: string): string => `COALESCE(json_extract(p.data_json, '$.${key}'), 0)`
  console.log('carries', share('carries', `${v('rush_carries')} + ${v('pass_kneels')}`))
  console.log('targets', share('targets', v('rec_targets')))
  db.close()
  console.log({ pbpOnlyMegabytes: statSync(path).size / 1e6 })
})
```

Run: `npx vitest run tests/zz-pbp-live.test.ts --reporter=verbose`

Expected:

- Every `wh:pbp:<season>` and `wh:nflverse_player:<season>` step is `ok`.
- About 70–90 s for the `pbp` steps.
- `pbp` JSON is about 30 MB; `pbpOnlyMegabytes` includes `nflverse_player`.
- **Gate:** `agree` must be ≥ 0.99 for carries and for targets in every season. If not, stop here and report the per-season numbers to the user.

Record the numbers for the Status block. Then `rm tests/zz-pbp-live.test.ts` and do not commit it.

- [ ] **Step 2: Document the play-by-play rows**

In `docs/reference/stats-warehouse.md`:

- In the opening paragraph, change "(about 540 MB with every light source, measured 2026-10-11)" to "(about 540 MB with every light source, measured 2026-10-11, plus about 50 MB of play-by-play since v0.21.0)".
- Add this row at the end of the Sources table:

```md
| `pbp` | nflverse `pbp/play_by_play_{season}`, aggregated per player-week and team-week (below) | gsis / team | player-week, team-week |
```

- Add this section before `## Sync`:

```md
## Play-by-play (`pbp`, since v0.21.0)

One step per season (`wh:pbp:<season>`) downloads nflverse play-by-play (~19 MB) and aggregates it in a worker thread. No play-level rows are stored.

Counting rules. They reproduce nflverse's own counts: carries = `rush_carries` + `pass_kneels`, targets = `rec_targets`, on ≥ 99.9 % of player-weeks in every season 2019–2026.

- Deleted plays and preseason rows are dropped; aborted plays are kept.
- Penalty-wiped snaps (`no_play`) count only for penalties; two-point tries only for the two-point counts.
- Every value is a sum or a count, or a maximum for `*_long`. Rates are computed when read (`pass_qb_epa_sum / pass_dropbacks`). Sums are rounded to 4 decimals.

**Player-weeks** (`player_key` = gsis id):

| Prefix       | Rows                                                     | Keys                                                                                                                                                                                                                                                                                                                                                                            |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pass_`      | dropbacks (sacks and scrambles), credited to `passer_id` | `dropbacks`, `qb_epa_sum`, `success_n`, `wpa_sum`, `cpoe_sum` / `cpoe_n` (percentage points), `scrambles`, `scramble_yds`, `early_dropbacks` / `early_epa_sum` (downs 1–2), `3d_dropbacks`, `3d_conv`; on attempts `air_epa_sum`, `yac_epa_sum`, `long_cmp`, `att_i20`, `att_i10`, `ez_att`, `deep_att` / `_cmp` / `_yds` / `_td` / `_int` (air yards ≥ 20); `kneels`, `spikes` |
| `rush_`      | runs (`play_type = run`: scrambles included, kneels not) | `carries`, `designed`, `epa_sum`, `success_n`, `wpa_sum`, `stuffs` (≤ 0 yards), `10p` / `15p` / `20p`, `long`, `i20` / `i10` / `i5` and `td_i20` / `td_i10` / `td_i5` (yards to the end zone at the snap), `gtg`, `first_downs`, `<left, middle, right, end, tackle, guard>_n` and `_yds`                                                                                       |
| `rec_`       | targets (pass attempts that are not sacks)               | `targets`, `air_yards_sum`, `epa_sum`, `success_n`, `wpa_sum`, `tgt_i20` / `tgt_i10` / `tgt_i5`, `ez_tgt` (air yards reach the end zone), `deep_tgt`, `3d_tgt`; on catches `xyac_sum` / `xyac_n`, `yac_sum`, `long`, `first_downs`                                                                                                                                              |
| `hvt`        |                                                          | high-value touches: carries inside the 10 plus targets                                                                                                                                                                                                                                                                                                                          |
| `k_`         | field goals, PATs, kickoffs                              | `epa_sum` (field goals and PATs), `kickoffs`, `ko_touchbacks`, `onside_att`, `onside_rec`                                                                                                                                                                                                                                                                                       |
| `p_`         | punts                                                    | `punts`, `epa_sum`, `inside_20`, `touchbacks`, `fair_catches`, `blocked`                                                                                                                                                                                                                                                                                                        |
| `kr_`, `pr_` | kick and punt returns                                    | `returns`, `yds`, `long`, `td`, `fair_catches`                                                                                                                                                                                                                                                                                                                                  |
| `def_`       | runs and catches, each credited tackler                  | `stuffs`, `tackle_depth_sum` / `tackle_depth_n` (yards gained at the tackle)                                                                                                                                                                                                                                                                                                    |
| `pen_`       | every accepted penalty, wiped-out snaps included         | `n`, `yds`, `types` (`{ type: count }`)                                                                                                                                                                                                                                                                                                                                         |

**Team-weeks** store every metric twice: `off_<m>` for the team's own snaps, and `def_<m>` for its opponents' snaps against it. `def_` values are not negated: `def_epa_sum` is EPA allowed, `def_punts` forced punts, `def_fourth_failed` fourth-down stops, `def_havoc` havoc plays.

- **Snaps:**
  - Volume and EPA: `plays`, `epa_sum`, `success_n`, the same three for `pass_` and `rush_`, `early_plays`, `early_epa_sum`.
  - Explosives: `explosive_rush` (10+), `explosive_pass` (20+).
  - Pass rate over expected: `xpass_sum`, `pass_oe_sum` (percentage points), `xpass_n`.
  - Neutral script and pace: `neutral_plays`, `neutral_passes` (win probability 20–80 %, quarters 1–3), `pace_sum` / `pace_n` (seconds between neutral snaps of a drive).
  - Formation: `no_huddle`, `shotgun`.
  - Downs: `third_att`, `third_conv`, `fourth_downs` (punts and field goals included), `fourth_go`, `fourth_conv`, `fourth_failed`.
  - `turnovers`, and `havoc` (a TFL, forced fumble, interception or pass defended).
- **Drives:** `drives`, `drive_plays`, `drive_yds`, `drive_seconds`, `drive_points`, `drive_start_sum` (yards to the end zone at the first snap), `three_and_outs`, `drive_scores`, `drive_turnovers`, `drive_punts`, `rz_trips`, `rz_tds`, `gtg_drives`, `gtg_tds`.
- **Other:**
  - `two_pt_att`, `two_pt_conv`, `punts`, `st_epa_sum`.
  - `ko_touchbacks`: nflverse gives kickoffs to the receiving team, so `off_ko_touchbacks` are touchbacks received.
  - Penalties on the play's offense (`pen_offense_n`, `pen_offense_yds`) and on its defense (`pen_defense_n`, `pen_defense_yds`).
```

- In `## Reading it`, add a second example after the existing one:

````md
```sql
-- EPA per dropback and success rate for one passer, 2025 regular season
SELECT SUM(json_extract(data_json, '$.pass_qb_epa_sum')) / SUM(json_extract(data_json, '$.pass_dropbacks')) AS epa_per_db,
       1.0 * SUM(json_extract(data_json, '$.pass_success_n')) / SUM(json_extract(data_json, '$.pass_dropbacks')) AS success
FROM wh_player_week
WHERE source = 'pbp' AND season = 2025 AND season_type = 'REG' AND player_key = '00-0036389';
```
````

Then:

```bash
npx prettier --write docs/reference/stats-warehouse.md
git add docs/reference/stats-warehouse.md
git commit -m "docs: document play-by-play in the warehouse"
```

- [ ] **Step 3: Write the amendments into the spec**

In `docs/superpowers/specs/2026-10-09-stats-warehouse-design.md`:

- Change the header's status to `approved 2026-10-09, amended 2026-10-11 (§10: size; §11: play-by-play counting)`.
- In §6.1, change "Plays with `play_deleted = 1` or `aborted_play = 1` are dropped." to "Plays with `play_deleted = 1` are dropped (aborted plays are kept, §11)."
- Append:

```md
## 11. Amendment 2026-10-11: play-by-play counting (Plan U)

Plan U was planned against the real 2019 and 2025 files and nflverse's own `stats_player_week`. That changed §6.1–§6.3 as follows. With these rules, a 2019–2026 backfill matches nflverse's targets (`rec_targets`) on 100 % of player-weeks in every season, and its carries (`rush_carries` + `pass_kneels`) on 100 % in every season but 2024 (99.96 %).

- **Aborted plays are kept.** They are real snaps (mostly fumbled snaps), and official stats count them. Dropping them, as §6.1 said, left 3.6 % of 2025 player-weeks short on carries. Only `play_deleted = 1` is dropped.
- **Penalty-wiped snaps and two-point tries count only where named.** A `play_type = no_play` row counts only for penalties; a `two_point_attempt = 1` row only for the two-point counts and drive points. Counting two-point tries broke passing attempts (88 % agreement instead of 99.9 %). As a result, team EPA sums leave out penalty-wiped snaps.
- **The passer is `passer_id`** (nflverse's dropback QB): `passer_player_id` is empty on every scramble. Kneels are credited through `rusher_player_id`, spikes through `passer_player_id`.
- **Kickoffs belong to the receiving team** in nflverse (`posteam`), so kickers count for `defteam`.
- **Every team metric is mirrored.** The `def_*`-only metrics of §6.3 are stored under neutral names on both sides: `def_punts` = forced punts, `def_fourth_failed` = fourth-down stops, `def_havoc`. Penalties are split by who committed them (`pen_offense_*`, `pen_defense_*`).
- **The play index moves to Plan V**, where the FTN and participation joins read it.
- **Storage:**
  - Sums are rounded to 4 decimals.
  - `cpoe` and `pass_oe` stay in percentage points.
  - `*_long` values are maxima.
  - `pen_types` is a `{ type: count }` map.
  - `forEachCsvRow` hands rows over as arrays (1.4 s a season, against 2.3 s as objects).
- **Size:** 2019–2026 adds about 50 MB to `warehouse.db` (27 MB of JSON, measured 2026-10-11).
```

Then:

```bash
npx prettier --write docs/superpowers/specs/2026-10-09-stats-warehouse-design.md
git add docs/superpowers/specs/2026-10-09-stats-warehouse-design.md
git commit -m "docs(spec): amend warehouse spec for plan U"
```

- [ ] **Step 4: Final verification**

Run: `npm run typecheck && npx eslint src tests electron.vite.config.ts && npm test`
Expected: all green. Note the test count.

Note the size of `~/.config/FantasyCompanion/warehouse.db` (534 MB before this plan). Then run `npm run dev` with the Bash tool's `run_in_background`. The launch refresh runs first, then the warehouse in the background. Every `pbp` season is due on the first run, so this backfills 2019 → current through the worker.

Watch the log for main-process errors. Wait until the warehouse log shows the last `wh:pbp:<current>` row finished (query below), then stop the app (kill by PID from `ps -eo pid,args | grep '[e]lectron/dist/electron'`). Check:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(db.prepare(\"SELECT source,status,rows_written,message,started_at,finished_at FROM sync_log WHERE source LIKE 'wh:pbp:%' ORDER BY id DESC LIMIT 12\").all())" ~/.config/FantasyCompanion/warehouse.db
ls -la ~/.config/FantasyCompanion/warehouse.db ~/.config/FantasyCompanion/companion.db
```

Expected:

- Every `wh:pbp:<season>` is `ok`.
- `companion.db` is unchanged (~116 MB).
- **Gate:** `warehouse.db` ≤ 650 MB (about 590 expected). If it is larger, stop and report.
- If WSLg can't show the window, say so in the Status block. The window keeps painting during the backfill only because the work is in the worker; this cannot be checked visually here.

- [ ] **Step 5: Merge and tag**

```bash
git checkout main && git merge --no-ff feat/stats-warehouse-u -m "merge: feat/stats-warehouse-u (plan U)"
npm version minor --no-git-tag-version
git add package.json package-lock.json
git commit -m "build: bump version to 0.21.0"
git tag -a v0.21.0 -m "build: bump version to 0.21.0"
```

Expected: `package.json` at `0.21.0`, annotated tag `v0.21.0`. `npm version` refuses the dirty tree (the unrelated `.gitignore`) without `--no-git-tag-version`. **Ask the user before** `git push --follow-tags`, which triggers the Windows release workflow.

- [ ] **Step 6: Status block**

Replace this plan's `**Status:**` line with:

- the completion date;
- the merge and tag hashes;
- the test count;
- the Step 1 numbers (seconds, `pbp` MB, per-season agreement);
- the Step 4 numbers (`warehouse.db` size, backfill time);
- any upstream skips seen;
- what was not verified (GUI; the packaged asar worker until the user runs the Windows build).

Then:

```bash
npx prettier --write docs/superpowers/plans/2026-10-11-plan-u-play-by-play.md
git add docs/superpowers/plans/2026-10-11-plan-u-play-by-play.md
git commit -m "docs(plan): mark plan U complete"
```

---

## Self-review against the spec

| Spec                                                                                                      | Where                                    |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| §6.1 one step per season `wh:pbp:<season>`, due under §4.2, per-source state                              | Task 8 (existing `refreshWarehouse`)     |
| §6.1 main process downloads, transfers the bytes to `src/main/warehouse/worker.ts` → `warehouseWorker.js` | Tasks 2, 7                               |
| §6.1 the worker gunzips, reads rows one at a time, posts `{ playerWeeks, teamWeeks, skipped }`            | Tasks 1, 6, 7                            |
| §6.1 `forEachCsvRow`, `parseCsv` rebuilt on it, existing tests unchanged                                  | Task 1                                   |
| §6.1 deleted plays dropped, REG / POST only; aborted plays (amended: kept)                                | Task 3; amendment A                      |
| §6.1 sums and counts only; aggregator version                                                             | Tasks 3–6 (`Bag`); Task 8 (`version: 1`) |
| §6.1 play index for FTN / participation                                                                   | Plan V (amendment E)                     |
| §6.2 passer, rusher, receiver, high-value touches, kicker, punter, returners, defenders, penalties        | Task 4                                   |
| §6.3 every team metric off / def, drives, red zone, pace, neutral, downs, havoc                           | Task 5 (amendment D)                     |
| §4.3 120 s timeout for play-by-play, 404 → skipped, missing key column fails                              | Tasks 2, 6, 8                            |
| §7 hand-built rows with hand-worked aggregates; mirroring; deleted plays; sums not rates                  | Tasks 3–6                                |
| §7 manual check: first-sync time and size in the Status block                                             | Task 9                                   |
| §8 Plan U ends with a release                                                                             | Task 9 (`v0.21.0`)                       |
| §6.4–§6.5 FTN and participation                                                                           | Plan V (not here)                        |
