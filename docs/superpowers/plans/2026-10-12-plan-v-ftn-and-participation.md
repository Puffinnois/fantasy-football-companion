# Plan V — Stats warehouse: FTN charting and participation

**Status:** written 2026-10-12, not started.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Join FTN charting (2022+) and nflverse participation (2019+) to play-by-play through a play index, store them as `ftn` and `part` player-week and team-week rows in `warehouse.db`, and ship `v0.22.0`.

**Architecture:** The existing `pbp` warehouse step becomes a three-source step (`pbp`, `ftn`, `part`). The sync now decides due-ness per source: FTN is never due before 2022, and a sealed `pbp` season is not rewritten when only a join is due. Whenever any of the three is due, the main process downloads play-by-play plus each due join file and transfers them all to the warehouse worker. The worker aggregates play-by-play as before, and every play it reads also goes into a compact `PlayIndex` keyed by `game_id` + `play_id`. FTN and participation have no player ids, so their rows are joined to that index and credited to the play's passer, rusher, target, or the players listed on the field. All aggregation is pure and testable in-process; the worker file does not change. Nothing reads the new rows yet.

**Tech Stack:** unchanged. Electron 39, TypeScript strict, `node:sqlite`, `node:worker_threads`, Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-10-09-stats-warehouse-design.md` §6.1, §6.4, §6.5, §7, §8 (Plan V), amended by this plan (Task 7 writes the amendments into the spec as §12).

## Planning findings (live data, 2026-10-12)

All code in this plan was prototyped in a scratch copy of `main` (`2c70910`) and run against the real 2019–2026 files before this plan was written: 834 tests green, typecheck and lint clean.

- **Files.** FTN is published as plain `.csv` only: `ftn_charting/ftn_charting_{2022..2026}.csv`, 7–8 MB a season. The current season is updated weekly; 2026 had weeks 1–5 on 2026-10-12. Participation is also `.csv` only: `pbp_participation/pbp_participation_{2019..2025}.csv`, 21–22 MB through 2022 and 49–50 MB from 2023. **2026 is not published** (404). The existing `.csv.gz` → `.csv` fallback of `nflverseFile` covers both.
- **Join rates.** FTN rows find their play on (`nflverse_game_id`, `nflverse_play_id`) **100 %** in every season. Participation rows find theirs on (`nflverse_game_id`, `play_id`) 100 % from 2023. Through 2022, 716–809 rows a season match no play: those plays are deleted from play-by-play. No key is duplicated in any file.
- **Snaps.** Participation lists everyone on the field for every play, special teams included. Two counting rules were tested against nflverse's `snap_counts` (PFR).
  - The `pbp` counting rule (scrimmage snaps without penalty-wiped snaps or two-point tries) matched only 30 % of player-weeks exactly.
  - Counting every play with nflverse's `pass` or `rush` flag, or a kneel or spike, **including penalty-wiped snaps and two-point tries**, matches **94–96 % exactly** and **99.0–99.98 % within one snap**, in every season 2019–2025 (amendment A).
  - The remaining one-snap gaps are snaps blown dead with no pass or run flag, such as "Defensive Too Many Men on Field". Counting those helps 2022–2025 (+2 points) but hurts 2019 (−1.4), so PFR's own rule changed between seasons. They are not counted.
- **Format change in 2023.** Participation changed in 2023 in four ways:
  - **Personnel.** Through 2022, `offense_personnel` is "1 RB, 1 TE, 3 WR" (about 100 distinct values). From 2023 it lists every position, "1 C, 2 G, 1 QB, 1 RB, 2 T, 1 TE, 3 WR" (400+ distinct values). Defense goes from "4 DL, 2 LB, 5 DB" to "3 CB, 2 DE, 2 DT, 1 FS, 2 ILB, 1 SS".
  - **Formations.** Through 2022: SHOTGUN, SINGLEBACK, I_FORM, EMPTY, PISTOL, JUMBO, WILDCAT. From 2023: SHOTGUN, UNDER CENTER, PISTOL.
  - **Routes.** HITCH becomes HITCH/CURL, and OUT splits into QUICK OUT and DEEP OUT. Coverage adds COMBO and COVER_9.
  - **Other columns.** `ngs_air_yards` is empty from 2023. `time_to_throw` is rounded to 0.1 s from 2023. From 2023, `defenders_in_box` and `number_of_pass_rushers` are 0 on special teams, and `was_pressure` is FALSE on runs.
  - **Decision (amendment C):** personnel is normalised, because the raw strings cannot be compared across seasons. The offense becomes "backs then tight ends" (`11`, `12`, `21`); the defense becomes its number of defensive backs (`4`, `5`, `6`). On every season the normalised offense groups look the same: `11` is 50–62 % of plays, `12` is 19–22 %. Formation, route and coverage are stored as published.
- **FTN quirks.**
  - Booleans are `TRUE` / `FALSE`.
  - Some cells have a leading space (" CHK", " S"), so cells are trimmed.
  - `read_thrown` is `0` on non-passes from 2023 (empty through 2022).
  - `n_defense_box` and `n_pass_rushers` are 0 where nothing was charted (special teams).
- **Kickoff sides.** On 2019–2022 kickoffs, participation's `possession_team` is the kicking team. From 2023 it is the receiving team, like play-by-play's `posteam`. Its `possession_team` also disagrees with `posteam` on about 1,100 plays of 2019. So team sides always come from play-by-play (the index), and only snaps (`isSnap`) are read. Passing the snap rule implies a scrimmage play, where `offense_players` are `posteam`'s: the dropback passer is in `offense_players` on 100 % of passes through 2022 and 99.8 % in 2025.
- **Speed, memory, size.**
  - In-process, a season takes 3.5–5 s with both joins (play-by-play alone ~3 s), with heap up to ~440 MB across a test run. The bundled `warehouseWorker.js` did the full 2025 season with both joins in 3.3 s.
  - Rows a season: `ftn` ≈ 5,400 player-weeks and 570 team-weeks, about 0.6 MB of JSON. `part` ≈ 21,700 player-weeks and 570 team-weeks, about 2.3 MB.
  - A live backfill of the `pbp` step (all three sources, 2019–2026) on a copy of the dev `warehouse.db` took it **from 587 MB to 619 MB** after `VACUUM`: `ftn` 2.6 MB and `part` 15.9 MB of JSON.
  - Downloads dominate the time: 25–45 s a season on this connection.
- **Flaky large downloads.** In the same run, the 49 MB participation downloads of 2024–2026 failed twice mid-transfer ("terminated", "fetch failed"). The step errored, earlier seasons were kept, and the next run resumed with only those seasons. That is spec §4.3 as built, and this plan does not change it.
- **Upgrade cost.** On the first run after the upgrade, every season 2019–2025 has `part` due (no state yet), and 2022+ also has `ftn` due. So the warehouse re-downloads play-by-play for every season, one time, in the background: about 140 MB of play-by-play, 280 MB of participation and 40 MB of FTN. The sealed `pbp` rows are not rewritten.

## Spec amendments (taken in this plan)

Task 7 Step 3 records each of these in the spec as §12. They follow from the data above. **Confirm them with the user before starting Task 0** if they have not been approved yet.

- **A. Participation snaps follow nflverse's snap counts, not the `pbp` counting rule.** A player gets a snap (`off_snaps`, `def_snaps`, personnel) on every play whose `pass` or `rush` flag is set, or that is a kneel or spike. Penalty-wiped snaps and two-point tries are included. Everything else in the joins follows the `pbp` rules of §11: dropbacks, targets, carries and team counts. So `off_dropbacks` (the route proxy) lines up with `pbp` `rec_targets`, and team counts line up with `pbp` `off_plays`.
- **B. Roles come from the play index.** A joined row is credited to the play's dropback passer (`passer_id`), rusher (`play_type = run`) and target, exactly where the `pbp` families count them. QB sneaks are a rusher count (`rush_qb_sneaks`), not a passer count as §6.4 lists them.
- **C. Personnel is normalised; formation, route and coverage are stored as published.**
  - The offense is stored as backs then tight ends (`11`, `12`, `21`; RB + FB count as backs).
  - The defense is stored as its number of defensive backs (`dbs`: `4` base, `5` nickel, `6` dime).
  - The other three keep their published names, which changed in 2023 (findings). Not stored: `ngs_air_yards` (gone from 2023; play-by-play has air yards), the `*_names` / `*_numbers` / `*_positions` lists, and `players_on_play`.
- **D. Per-source due-ness and writes.**
  - A step's sources are each due on their own (§4.2) and each has a first season. FTN's is 2022; seasons before it are never attempted, as §4.2 already says.
  - A step writes and records only the sources it returns, by default the due ones. So a sealed `pbp` season is not rewritten when only `part` is due.
  - A join file that is not published is noted in the step message ("part 2026 not published yet"). It is not recorded in `wh_source_state`, and the 24 h attempt rule retries it. A run with nothing to write is `skipped`.
- **E. Additions.** Dropbacks on the field are split by man and zone (`off_dropbacks_man`, `off_dropbacks_zone`), so targets per route can be read against each coverage.
- **F. Storage.**
  - A box or pass-rusher count of 0 means "not charted" and is left out of the sums.
  - FTN booleans are `TRUE` / `FALSE`, and cells are trimmed.
  - `read_thrown` 0 is not tallied.
  - Rows that match no play are counted in the step message ("part: 774 rows matched no play").
- **G. Size.** 2019–2026 adds about 32 MB to `warehouse.db` (18.5 MB of JSON, measured 2026-10-12).

## Global Constraints

- Branch `feat/stats-warehouse-v` off `main`. One Conventional Commit per "Commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- The working tree has unrelated changes that are not part of this plan: `.gitignore`, `.design-sync/`, `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts` and `tsconfig.web.tsbuildinfo`. Never stage them. Stage files by name; never run `git add -A` or `git add .`.
- Format only the files you touched: `npx prettier --write <files>` (never the `.csv` fixtures). **Never run `npm run format`.** Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
- Storage only. Core tables, `recomputePoints`, values, signals and UI do not change. Nothing outside the warehouse sync reads `wh_*`.
- In the app, files are decoded and aggregated **only in the worker** (`runPbpWorker`). `aggregateInProcess` is for tests and throwaway scripts. `src/main/warehouse/worker.ts` and `electron.vite.config.ts` do not change.
- Counting rules: spec §11 as it stands, plus amendments A–F. Sums and counts only, never rates. `data_json` drops zeros and missing values (spec §10).
- The `pbp` aggregator version stays 1, and `pbp` rows do not change: the `aggregatePbp` tests and the "matches nflverse carries and targets on a real game" test must pass unchanged. `ftn` and `part` start at version 1.
- Sync behaviour is spec §4.2 plus amendment D: logging stays `wh:pbp:<season>`, and a play-by-play 404 means skipped.
- No test touches the network. Only the throwaway live check in Task 7 does, and it is never committed.
- **Gates (Task 7):**
  - FTN rows matched to a play: 100 % in every season. Participation: ≥ 98 % in every season.
  - Participation snaps within one of nflverse's snap counts on ≥ 98.5 % of player-weeks, offense and defense, in every season with participation.
  - `warehouse.db` ≤ 675 MB after the dev backfill (about 620 MB expected).
  - If any gate fails, stop and report the numbers to the user.
- Release `v0.22.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before pushing.**
- Not GUI-verifiable here (WSLg). Say so in the Status block.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test in the task that owns the code.

1. **Joined counts that do not line up with `pbp`.** If a join credited a penalty-wiped snap or a two-point try as a dropback or target, or a kneel as a carry, its rates (targets per route, EPA under pressure) would divide by the wrong number. → Task 2, "sets a role only where the pbp families count the play"; Task 4, "dropbacks on the field, split by man and zone (the route proxy)".
2. **The 2023 participation format.** Stored as published, personnel would be ~100 groups through 2022 and 400+ from 2023, and no group could be compared across seasons. → Task 4, "names the offense by backs and tight ends, in both formats" and "counts the defensive backs, in both formats".
3. **A join that is not published yet.** Participation 2026 is a 404 today. If the step recorded `part` 2026 as fetched (or sealed an old season with no file), it would never pick the file up. → Task 5, "a source not published yet is noted and retried; nothing to write is a skip"; Task 6, "downloads play-by-play and each due join, and keeps the rows of due sources".
4. **Re-downloading play-by-play every day for nothing.** Before amendment D, a source with no state was always due. FTN for 2019–2021 would have made play-by-play for those seasons download every day, forever. → Task 5, "never makes a source due before its own first season"; Task 5, "writes only the sources a step returns; the others keep their rows and state" (a sealed `pbp` season is not rewritten).
5. **Snaps that do not match the snap counts users know.** → Task 4, "is within one snap of nflverse's snap counts on a real game"; Task 7 gate on every season.
6. **A large download failing mid-transfer.** Seen live on 49 MB participation files. The step errors and rolls back, earlier seasons are kept, and the next day's run resumes. → existing "a partial backfill resumes where it stopped" (`warehouseSync.test.ts`); recorded, not changed.
7. **The one-time upgrade download** (~460 MB in the background, findings). Recorded, not changed. The worker inside the packaged asar was confirmed for `engineWorker.js` (v0.19.0); this plan does not change how `warehouseWorker.js` is bundled. If it fails there, add `out/main/warehouseWorker.js` to `asarUnpack` in `electron-builder.yml`.

---

### Task 0: Branch

- [ ] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/stats-warehouse-v
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/stats-warehouse-v`.

---

### Task 1: Per-week bags shared by every source (spec §6.1)

The `pbp` player-week and team-week classes each key their bags by week and turn them into rows. FTN and participation need the same thing with another `source`, so this task extracts that code into `PlayerBags` / `TeamBags`. `pbp` output does not change.

**Files:**

- Create: `src/main/warehouse/weekBags.ts`
- Modify: `src/main/warehouse/play.ts`, `src/main/warehouse/pbpPlayers.ts`, `src/main/warehouse/pbpTeams.ts`
- Test: `tests/main/warehouse/weekBags.test.ts`

**Interfaces:**

- Produces (`play.ts`): `type GameWeek = Pick<Play, 'season' | 'seasonType' | 'week' | 'home' | 'away'>`. `opponentOf(p: GameWeek, team)` (was `p: Play`).
- Produces (`weekBags.ts`):
  - `class PlayerBags`: `constructor(source)`, `bag(w: GameWeek, id, team): Bag` (the first non-null team wins), `finish(): WhPlayerWeek[]` (gsis keys; rows with no non-zero value are dropped).
  - `class TeamBags`: `constructor(source)`, `both(w: GameWeek, team, opponent): Bag[]` (the team's `off_` bag and the opponent's `def_` bag), `finish(): WhTeamWeek[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/main/warehouse/weekBags.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PlayerBags, TeamBags } from '@main/warehouse/weekBags'
import { play } from '../../fixtures/pbp'

const week1 = play({})
const week2 = play({ week: 2 })

describe('PlayerBags', () => {
  it('keeps one bag per player and week, with the first team seen and its opponent', () => {
    const bags = new PlayerBags('part')
    bags.bag(week1, 'a', null).add('off_snaps')
    bags.bag(week1, 'a', 'PHI').add('off_snaps')
    bags.bag(week2, 'a', 'DAL').add('off_snaps')
    bags.bag(week2, 'b', 'PHI').add('nothing', 0)
    expect(bags.finish()).toEqual([
      {
        source: 'part',
        season: 2025,
        seasonType: 'REG',
        week: 1,
        playerKey: 'a',
        keyType: 'gsis',
        team: 'PHI',
        opponent: 'DAL',
        data: { off_snaps: 2 }
      },
      {
        source: 'part',
        season: 2025,
        seasonType: 'REG',
        week: 2,
        playerKey: 'a',
        keyType: 'gsis',
        team: 'DAL',
        opponent: 'PHI',
        data: { off_snaps: 1 }
      }
    ])
  })
})

describe('TeamBags', () => {
  it('writes to the offense’s off_ bag and the defense’s def_ bag', () => {
    const bags = new TeamBags('ftn')
    for (const b of bags.both(week1, 'PHI', 'DAL')) b.add('motion')
    for (const b of bags.both(week1, 'DAL', 'PHI')) b.add('rpo')
    expect(bags.finish()).toEqual([
      {
        source: 'ftn',
        season: 2025,
        seasonType: 'REG',
        week: 1,
        team: 'PHI',
        opponent: 'DAL',
        data: { off_motion: 1, def_rpo: 1 }
      },
      {
        source: 'ftn',
        season: 2025,
        seasonType: 'REG',
        week: 1,
        team: 'DAL',
        opponent: 'PHI',
        data: { off_rpo: 1, def_motion: 1 }
      }
    ])
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/main/warehouse/weekBags.test.ts`
Expected: FAIL. `@main/warehouse/weekBags` does not exist.

- [ ] **Step 3: Implement**

In `src/main/warehouse/play.ts`, replace

```ts
/** The other team of the play's game; null when `team` is neither side. */
export function opponentOf(p: Play, team: string | null): string | null {
```

with

```ts
/** What a warehouse row needs of a play: its week and the game's two teams. */
export type GameWeek = Pick<Play, 'season' | 'seasonType' | 'week' | 'home' | 'away'>

/** The other team of the play's game; null when `team` is neither side. */
export function opponentOf(p: GameWeek, team: string | null): string | null {
```

Create `src/main/warehouse/weekBags.ts`:

```ts
import type { WhPlayerWeek, WhTeamWeek } from '@main/db/repos/warehouse'
import { Bag } from './bag'
import { opponentOf, type GameWeek } from './play'

interface PlayerEntry {
  week: GameWeek
  playerKey: string
  team: string | null
  bag: Bag
}

/** One bag per player and week for `source` (gsis ids), turned into player-week rows. */
export class PlayerBags {
  private readonly entries = new Map<string, PlayerEntry>()

  constructor(private readonly source: string) {}

  /** The bag of `id` in this week; `team` is the side the player was on (the first one seen wins). */
  bag(w: GameWeek, id: string, team: string | null): Bag {
    const key = `${w.season}|${w.seasonType}|${w.week}|${id}`
    const entry = this.entries.get(key)
    if (entry) {
      entry.team ??= team
      return entry.bag
    }
    const bag = new Bag()
    this.entries.set(key, { week: w, playerKey: id, team, bag })
    return bag
  }

  /** Rows with at least one non-zero value. */
  finish(): WhPlayerWeek[] {
    const rows: WhPlayerWeek[] = []
    for (const { week, playerKey, team, bag } of this.entries.values()) {
      const data = bag.data()
      if (Object.keys(data).length === 0) continue
      rows.push({
        source: this.source,
        season: week.season,
        seasonType: week.seasonType,
        week: week.week,
        playerKey,
        keyType: 'gsis',
        team,
        opponent: opponentOf(week, team),
        data
      })
    }
    return rows
  }
}

interface Side {
  week: GameWeek
  team: string
  off: Bag
  def: Bag
}

/** One `off_` and one `def_` bag per team and week for `source`, turned into team-week rows. */
export class TeamBags {
  private readonly sides = new Map<string, Side>()

  constructor(private readonly source: string) {}

  private side(w: GameWeek, team: string): Side {
    const key = `${w.season}|${w.seasonType}|${w.week}|${team}`
    let side = this.sides.get(key)
    if (!side) {
      side = { week: w, team, off: new Bag(), def: new Bag() }
      this.sides.set(key, side)
    }
    return side
  }

  /** The offense's `off_` bag and the defense's `def_` bag for a play between `team` and `opponent`. */
  both(w: GameWeek, team: string, opponent: string): Bag[] {
    return [this.side(w, team).off, this.side(w, opponent).def]
  }

  finish(): WhTeamWeek[] {
    const rows: WhTeamWeek[] = []
    for (const { week, team, off, def } of this.sides.values()) {
      const data = { ...off.data('off_'), ...def.data('def_') }
      if (Object.keys(data).length === 0) continue
      rows.push({
        source: this.source,
        season: week.season,
        seasonType: week.seasonType,
        week: week.week,
        team,
        opponent: opponentOf(week, team),
        data
      })
    }
    return rows
  }
}
```

In `src/main/warehouse/pbpPlayers.ts`:

- Replace the three import lines with:

```ts
import type { WhPlayerWeek } from '@main/db/repos/warehouse'
import type { Bag } from './bag'
import { counts, type Play } from './play'
import { PlayerBags } from './weekBags'
```

- Delete `interface Entry { … }`.
- In `class PlayerWeeks`, replace the `entries` field and the `bag` method with:

```ts
  private readonly bags = new PlayerBags('pbp')

  /** The bag of `id` in this play's week; `team` is the side the player was on. */
  private bag(p: Play, id: string, team: string | null): Bag {
    return this.bags.bag(p, id, team)
  }
```

- Replace the body of `finish()` with `return this.bags.finish()`.

In `src/main/warehouse/pbpTeams.ts`:

- Replace the three import lines with:

```ts
import type { WhTeamWeek } from '@main/db/repos/warehouse'
import type { Bag } from './bag'
import { counts, isScrimmage, type Play } from './play'
import { TeamBags } from './weekBags'
```

- Delete `interface Side { … }`.
- In `class TeamWeeks`, replace the `sides` field with `private readonly bags = new TeamBags('pbp')`. Delete the `side` method, and replace the body of `both` with `return this.bags.both(p, team, opponent)`.
- In `finish()`, keep the drive loop and replace everything after it (from `const rows: WhTeamWeek[] = []` to the end of the method) with `return this.bags.finish()`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/warehouse && npm run typecheck:node`
Expected: PASS, no type errors. Every existing `pbp` test passes unchanged; that is the check that the refactor kept `pbp` rows as they were.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/warehouse/play.ts src/main/warehouse/weekBags.ts src/main/warehouse/pbpPlayers.ts src/main/warehouse/pbpTeams.ts tests/main/warehouse/weekBags.test.ts
git add src/main/warehouse/play.ts src/main/warehouse/weekBags.ts src/main/warehouse/pbpPlayers.ts src/main/warehouse/pbpTeams.ts tests/main/warehouse/weekBags.test.ts
git commit -m "refactor(warehouse): share per-week bags"
```

---

### Task 2: Play ids, snaps and the play index (spec §6.1; amendments A, B)

**Files:**

- Create: `src/main/warehouse/playIndex.ts`
- Modify: `src/main/warehouse/play.ts`, `src/main/warehouse/aggregate.ts`, `tests/fixtures/pbp.ts`
- Test: `tests/main/warehouse/play.test.ts`, `tests/main/warehouse/playIndex.test.ts`

**Interfaces:**

- Consumes: `GameWeek` (Task 1), `counts`, `isScrimmage` (`play.ts`).
- Produces (`play.ts`):
  - `Play.playId: number | null` (`play_id`); `play_id` is added to `PBP_COLUMNS`.
  - `isSnap(play): boolean`: `pass || rush || kneel || spike`. Penalty-wiped snaps and two-point tries are included.
- Produces (`playIndex.ts`):
  - `interface IndexedPlay extends GameWeek`, with:
    - `posteam`, `defteam`;
    - `snap`, `scrimmage`;
    - `passerId`, `rusherId`, `receiverId` (set only where the `pbp` families count the play);
    - `epa`, `qbEpa`, `receivingYards`, `complete`.
  - `class PlayIndex`: `add(p: Play)` (a play without a play id is left out), `get(gameId, playId: number): IndexedPlay | undefined`, `size`.
- Produces (`aggregate.ts`): `aggregatePbp(text, index?: PlayIndex)` adds every play it reads to `index`.
- Produces (`tests/fixtures/pbp.ts`): `playIndex(rows: PbpRow[]): PlayIndex`. Each row's `play_id` is its position, from 1, unless the row sets one.

- [ ] **Step 1: Write the failing tests**

In `tests/main/warehouse/play.test.ts`:

- Change the imports to:

```ts
import { isSnap, PBP_COLUMNS, playReader } from '@main/warehouse/play'
import { captured } from '../../fixtures/warehouse'
import { dropback, pbpCsv, play, QB, run, type PbpRow } from '../../fixtures/pbp'
```

- In "reads numbers, flags, ids and the drive clock", add `playId: null,` as the first property of the `toMatchObject` object.
- Add as the last `it` of `describe('playReader')`:

```ts
it('reads the play id, the join key', () => {
  expect(play({ play_id: 40 }).playId).toBe(40)
})
```

- Append:

```ts
describe('isSnap (spec §12)', () => {
  it('counts passes, runs, kneels and spikes, penalty-wiped and two-point ones too', () => {
    const snaps = [
      dropback(),
      run(),
      { play_type: 'qb_kneel', qb_kneel: 1 },
      { play_type: 'qb_spike', qb_spike: 1 },
      run({ play_type: 'no_play' }),
      dropback({ two_point_attempt: 1 })
    ]
    expect(snaps.map((r) => isSnap(play(r)))).toEqual([true, true, true, true, true, true])
  })

  it('leaves out kicks and snaps blown dead without a pass or run', () => {
    const notSnaps: PbpRow[] = [
      { play_type: 'kickoff', kickoff_attempt: 1 },
      { play_type: 'punt', punt_attempt: 1 },
      { play_type: 'field_goal', field_goal_attempt: 1 },
      { play_type: 'no_play', penalty: 1, penalty_type: 'False Start' }
    ]
    expect(notSnaps.map((r) => isSnap(play(r)))).toEqual([false, false, false, false])
  })
})
```

In `tests/fixtures/pbp.ts`, add `import { PlayIndex } from '@main/warehouse/playIndex'` after the `@main/warehouse/play` import, and before `export const QB`:

```ts
/** The play index of `rows`; each row's `play_id` is its position, from 1, unless it sets one. */
export function playIndex(rows: PbpRow[]): PlayIndex {
  const index = new PlayIndex()
  rows.forEach((r, i) => index.add(play({ play_id: i + 1, ...r })))
  return index
}
```

Create `tests/main/warehouse/playIndex.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { PlayIndex } from '@main/warehouse/playIndex'
import { dropback, LB, play, playIndex, QB, RB, run, WR } from '../../fixtures/pbp'

const GAME = '2025_01_DAL_PHI'

describe('PlayIndex (spec §6.1)', () => {
  it('finds a play by game and play id, with its week, teams and figures', () => {
    const index = playIndex([
      dropback({ complete_pass: 1, receiving_yards: 12, epa: 0.8, qb_epa: 0.9 })
    ])
    expect(index.size).toBe(1)
    expect(index.get(GAME, 1)).toEqual({
      season: 2025,
      seasonType: 'REG',
      week: 1,
      home: 'PHI',
      away: 'DAL',
      posteam: 'PHI',
      defteam: 'DAL',
      snap: true,
      scrimmage: true,
      passerId: QB,
      rusherId: null,
      receiverId: WR,
      epa: 0.8,
      qbEpa: 0.9,
      receivingYards: 12,
      complete: true
    })
    expect(index.get(GAME, 2)).toBeUndefined()
    expect(index.get('2025_01_KC_LAC', 1)).toBeUndefined()
  })

  it('sets a role only where the pbp families count the play', () => {
    const index = playIndex([
      run(),
      dropback({ sack: 1, receiver_player_id: '' }),
      run({ play_type: 'no_play' }),
      dropback({ two_point_attempt: 1 }),
      { play_type: 'qb_kneel', qb_kneel: 1, rusher_player_id: QB },
      { play_type: 'kickoff', kickoff_attempt: 1, kicker_player_id: LB }
    ])
    const roles = [1, 2, 3, 4, 5, 6].map((id) => {
      const p = index.get(GAME, id)
      return [p?.snap, p?.scrimmage, p?.passerId, p?.rusherId, p?.receiverId]
    })
    expect(roles).toEqual([
      [true, true, null, RB, null],
      [true, true, QB, null, null],
      [true, false, null, null, null],
      [true, false, null, null, null],
      [true, false, null, null, null],
      [false, false, null, null, null]
    ])
  })

  it('leaves out a play without a play id', () => {
    const index = new PlayIndex()
    index.add(play(run()))
    expect(index.size).toBe(0)
  })
})
```

In `tests/main/warehouse/aggregate.test.ts`, add `import { PlayIndex } from '@main/warehouse/playIndex'` after the `@main/warehouse/aggregate` import, and add to `describe('aggregatePbp (spec §6.1)')`:

```ts
it('adds every play it reads to the play index', () => {
  const index = new PlayIndex()
  aggregatePbp(captured('pbp_2025_game.csv'), index)
  expect(index.size).toBe(163)
  expect(index.get('2025_01_DAL_PHI', 71)).toMatchObject({ posteam: 'DAL', snap: true })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/main/warehouse`
Expected: FAIL. `isSnap` is not exported and `@main/warehouse/playIndex` does not exist.

- [ ] **Step 3: Implement**

In `src/main/warehouse/play.ts`:

- In `interface Play`, after `gameId: string`, add:

```ts
/** `play_id`: with `gameId`, the key FTN and participation join on. */
playId: number | null
```

- In `PBP_COLUMNS`, change the start of the long string from `'home_team away_team posteam` to `'play_id home_team away_team posteam`.
- In `playReader`'s returned object, after `gameId,`, add `playId: num('play_id'),`.
- Append:

```ts
/**
 * A snap the players on the field are credited with, as nflverse's snap counts count them: a pass,
 * run, kneel or spike, penalty-wiped snaps and two-point tries included (spec §12).
 */
export function isSnap(play: Play): boolean {
  return play.pass || play.rush || play.kneel || play.spike
}
```

Create `src/main/warehouse/playIndex.ts`:

```ts
import { counts, isScrimmage, isSnap, type GameWeek, type Play } from './play'

/**
 * What the FTN and participation joins need of a play (spec §6.1). The roles are set only where the
 * `pbp` player families count the play, so a joined count lines up with its `pbp` total.
 */
export interface IndexedPlay extends GameWeek {
  posteam: string | null
  defteam: string | null
  /** The players on the field get a snap (`isSnap`, spec §12). */
  snap: boolean
  /** A counting scrimmage snap (`isScrimmage`): the plays the team counts are over. */
  scrimmage: boolean
  /** The dropback QB (`passer_id`) on a counting dropback, sacks and scrambles included. */
  passerId: string | null
  /** The rusher on a counting carry (`play_type` = run). */
  rusherId: string | null
  /** The target on a counting pass attempt (not a sack). */
  receiverId: string | null
  epa: number | null
  qbEpa: number | null
  receivingYards: number | null
  complete: boolean
}

/** The play index: every REG / POST play of a season by `game_id` + `play_id`. */
export class PlayIndex {
  private readonly plays = new Map<string, IndexedPlay>()

  get size(): number {
    return this.plays.size
  }

  add(p: Play): void {
    if (p.playId === null) return
    const counted = counts(p)
    this.plays.set(`${p.gameId}|${p.playId}`, {
      season: p.season,
      seasonType: p.seasonType,
      week: p.week,
      home: p.home,
      away: p.away,
      posteam: p.posteam,
      defteam: p.defteam,
      snap: isSnap(p),
      scrimmage: isScrimmage(p),
      passerId: counted && p.dropback ? p.passerId : null,
      rusherId: counted && p.playType === 'run' ? p.rusherId : null,
      receiverId: counted && p.passAttempt && !p.sack ? p.receiverId : null,
      epa: p.epa,
      qbEpa: p.qbEpa,
      receivingYards: p.receivingYards,
      complete: p.complete
    })
  }

  /** The play `playId` of `gameId`; ids are compared as numbers ("40" = "40.0"). */
  get(gameId: string, playId: number): IndexedPlay | undefined {
    return this.plays.get(`${gameId}|${playId}`)
  }
}
```

In `src/main/warehouse/aggregate.ts`:

- Add `import { PlayIndex } from './playIndex'` after the `./play` import. It must be a value import: Task 6 constructs one.
- Replace the doc comment and signature of `aggregatePbp` with:

```ts
/**
 * Spec §6.1–§6.3: a play-by-play CSV, one row at a time, into `pbp` player-weeks and team-weeks.
 * Every play read also goes into `index`, when one is given, for the FTN and participation joins.
 */
export function aggregatePbp(text: string, index?: PlayIndex): PbpResult {
```

- After `teams.add(play)`, add `index?.add(play)`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/warehouse && npm run typecheck:node`
Expected: PASS (the captured game has 163 plays, none deleted). No type errors.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/warehouse/play.ts src/main/warehouse/playIndex.ts src/main/warehouse/aggregate.ts tests/fixtures/pbp.ts tests/main/warehouse/play.test.ts tests/main/warehouse/playIndex.test.ts tests/main/warehouse/aggregate.test.ts
git add src/main/warehouse/play.ts src/main/warehouse/playIndex.ts src/main/warehouse/aggregate.ts tests/fixtures/pbp.ts tests/main/warehouse/play.test.ts tests/main/warehouse/playIndex.test.ts tests/main/warehouse/aggregate.test.ts
git commit -m "feat(warehouse): index plays for the joins"
```

---

### Task 3: FTN charting (spec §6.4; amendments B, F)

**Files:**

- Create: `src/main/warehouse/join.ts`, `src/main/warehouse/ftn.ts`, `tests/fixtures/warehouse/ftn_2025_game.csv`
- Modify: `tests/fixtures/pbp.ts`, `tests/fixtures/warehouse/capture.sh`
- Test: `tests/main/warehouse/ftn.test.ts`

**Interfaces:**

- Consumes: `PlayIndex`, `IndexedPlay` (Task 2); `PlayerBags`, `TeamBags` (Task 1); `aggregatePbp(text, index)` (Task 2).
- Produces (`join.ts`):
  - `interface JoinResult { playerWeeks; teamWeeks; skipped; unmatched }`.
  - `interface Cells { text(column); num(column); flag(column) }`. Cells are trimmed; `TRUE` or `1` is a set flag.
  - `forEachJoinedRow(text, source, index, keys: { gameColumn, playColumn, required }, onRow: (cells, play) => void): { skipped, unmatched }`.
- Produces (`ftn.ts`): `FTN_COLUMNS`, `aggregateFtn(text, index): JoinResult` (source `ftn`).
- Produces (`tests/fixtures/pbp.ts`): `ftnCsv(rows)`, an FTN CSV for the fixture game with every `FTN_COLUMNS` column.

**Keys written.** Player-weeks, gsis:

- **Passer**, on counting dropbacks:
  - `pass_pa_dropbacks` / `pass_pa_epa_sum` (play action) and `pass_blitz_dropbacks` / `pass_blitz_epa_sum` (`n_blitzers > 0`), both EPA sums of `qb_epa`;
  - `pass_rpo`, `pass_screens`, `pass_out_of_pocket`, `pass_int_worthy`, `pass_throwaways`, `pass_qb_fault_sacks`;
  - `pass_read` (`{ read_thrown: count }`, 0 left out).
- **Rusher**, on counting carries: `rush_box_sum` / `rush_box_n` and `rush_box_8p` (charted boxes only), `rush_rpo`, `rush_qb_sneaks`.
- **Target**: `rec_catchable`, `rec_contested`, `rec_contested_catches`, `rec_created`, `rec_drops`, `rec_screen_tgt`.

Team-weeks, mirrored `off_` / `def_`, over scrimmage snaps:

- `motion`, `play_action`, `rpo`, `screens`, `trick_plays`, `no_huddle`;
- `box_sum` / `box_n`;
- on dropbacks: `blitzes`, `rushers_sum` / `rushers_n`.

- [ ] **Step 1: Capture the real game's FTN rows**

```bash
base=https://github.com/nflverse/nflverse-data/releases/download
curl -sL "$base/ftn_charting/ftn_charting_2025.csv" | awk -F, 'NR == 1 || $2 == "2025_01_DAL_PHI"' > tests/fixtures/warehouse/ftn_2025_game.csv
wc -l -c tests/fixtures/warehouse/ftn_2025_game.csv
```

Expected: 157 lines (the header plus the 156 charted plays of DAL at PHI, 2025 week 1), about 27 KB. The file is ~8 MB, so the download can take a minute. Then record the capture in `tests/fixtures/warehouse/capture.sh`, after the `pbp_2025_game.csv` line:

```bash
get "$base/ftn_charting/ftn_charting_2025.csv" ftn_2025_game.csv 400 '$2 == "2025_01_DAL_PHI"'
```

- [ ] **Step 2: Write the failing tests**

In `tests/fixtures/pbp.ts`, add `import { FTN_COLUMNS } from '@main/warehouse/ftn'` as the first import. Then replace `pbpCsv` with:

```ts
const quote = (s: string): string => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

/** A CSV of `columns`; a row's unset columns are empty. */
function csv(columns: string[], rows: PbpRow[]): string {
  const line = (r: PbpRow): string =>
    columns.map((c) => quote(r[c] === undefined ? '' : String(r[c]))).join(',')
  return [columns.join(','), ...rows.map(line)].join('\n') + '\n'
}

/** A CSV with every column the aggregation reads. */
export function pbpCsv(rows: PbpRow[]): string {
  return csv(
    COLUMNS,
    rows.map((r) => ({ ...BASE, ...r }))
  )
}

/** An FTN CSV for BASE's game: give each row the `nflverse_play_id` of its play. */
export function ftnCsv(rows: PbpRow[]): string {
  return csv(
    FTN_COLUMNS,
    rows.map((r) => ({ nflverse_game_id: BASE.game_id, ...r }))
  )
}
```

Create `tests/main/warehouse/ftn.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { headerOf } from '@main/sources/warehouse/parse'
import { aggregatePbp } from '@main/warehouse/aggregate'
import { aggregateFtn, FTN_COLUMNS } from '@main/warehouse/ftn'
import { PlayIndex } from '@main/warehouse/playIndex'
import { captured } from '../../fixtures/warehouse'
import { dropback, ftnCsv, playIndex, QB, RB, run, WR, type PbpRow } from '../../fixtures/pbp'

const T = 'TRUE'

/** FTN rows joined to `plays`; FTN row i charts play i + 1 unless it sets `nflverse_play_id`. */
function ftn(plays: PbpRow[], charts: PbpRow[]): ReturnType<typeof aggregateFtn> {
  const rows = charts.map((c, i) => ({ nflverse_play_id: i + 1, ...c }))
  return aggregateFtn(ftnCsv(rows), playIndex(plays))
}

const dataOf = (out: ReturnType<typeof aggregateFtn>, id: string): unknown =>
  out.playerWeeks.find((r) => r.playerKey === id)?.data

describe('aggregateFtn (spec §6.4)', () => {
  it('passer: play action, blitzes, RPOs, screens, pocket, throws and reads', () => {
    const out = ftn(
      [
        dropback({ complete_pass: 1, qb_epa: 0.5 }),
        dropback({ qb_epa: -0.25 }),
        dropback({ sack: 1, receiver_player_id: '', qb_epa: -2 }),
        dropback({ receiver_player_id: '', qb_epa: -0.5 })
      ],
      [
        { is_play_action: T, n_blitzers: 2, read_thrown: '1', is_qb_out_of_pocket: T },
        { is_rpo: T, is_screen_pass: T, read_thrown: ' CHK', is_interception_worthy: T },
        { is_qb_fault_sack: T, read_thrown: '0' },
        { is_throw_away: T }
      ]
    )
    expect(dataOf(out, QB)).toEqual({
      pass_pa_dropbacks: 1,
      pass_pa_epa_sum: 0.5,
      pass_blitz_dropbacks: 1,
      pass_blitz_epa_sum: 0.5,
      pass_rpo: 1,
      pass_screens: 1,
      pass_out_of_pocket: 1,
      pass_int_worthy: 1,
      pass_throwaways: 1,
      pass_qb_fault_sacks: 1,
      pass_read: { '1': 1, CHK: 1 }
    })
  })

  it('receiver: catchable, contested, created, drops and screen targets', () => {
    const out = ftn(
      [dropback({ complete_pass: 1 }), dropback()],
      [
        { is_catchable_ball: T, is_contested_ball: T, is_created_reception: T },
        { is_catchable_ball: T, is_contested_ball: T, is_drop: T, is_screen_pass: T }
      ]
    )
    expect(dataOf(out, WR)).toEqual({
      rec_catchable: 2,
      rec_contested: 2,
      rec_contested_catches: 1,
      rec_created: 1,
      rec_drops: 1,
      rec_screen_tgt: 1
    })
  })

  it('rusher: box counts, 8-man boxes, RPO carries and QB sneaks', () => {
    const out = ftn(
      [run(), run(), run(), run({ rusher_player_id: QB })],
      [
        { n_defense_box: 8, is_rpo: T },
        { n_defense_box: 6 },
        { n_defense_box: 0 },
        { n_defense_box: 9, is_qb_sneak: T }
      ]
    )
    expect(dataOf(out, RB)).toEqual({
      rush_box_sum: 14,
      rush_box_n: 2,
      rush_box_8p: 1,
      rush_rpo: 1
    })
    expect(dataOf(out, QB)).toEqual({
      rush_box_sum: 9,
      rush_box_n: 1,
      rush_box_8p: 1,
      rush_qb_sneaks: 1
    })
  })

  it('team: every count as off_* for the offense and def_* for the defense', () => {
    const out = ftn(
      [dropback(), run({ posteam: 'DAL', defteam: 'PHI' })],
      [
        {
          is_motion: T,
          is_play_action: T,
          is_no_huddle: T,
          n_blitzers: 1,
          n_pass_rushers: 5,
          n_defense_box: 6
        },
        { is_trick_play: T, is_motion: T, n_defense_box: 7, n_blitzers: 1, n_pass_rushers: 0 }
      ]
    )
    expect(out.teamWeeks.map((r) => [r.team, r.data])).toEqual([
      [
        'PHI',
        {
          off_motion: 1,
          off_play_action: 1,
          off_no_huddle: 1,
          off_box_sum: 6,
          off_box_n: 1,
          off_blitzes: 1,
          off_rushers_sum: 5,
          off_rushers_n: 1,
          def_motion: 1,
          def_trick_plays: 1,
          def_box_sum: 7,
          def_box_n: 1
        }
      ],
      [
        'DAL',
        {
          def_motion: 1,
          def_play_action: 1,
          def_no_huddle: 1,
          def_box_sum: 6,
          def_box_n: 1,
          def_blitzes: 1,
          def_rushers_sum: 5,
          def_rushers_n: 1,
          off_motion: 1,
          off_trick_plays: 1,
          off_box_sum: 7,
          off_box_n: 1
        }
      ]
    ])
  })

  it('counts only plays the pbp families count; misses and keyless rows are counted', () => {
    const out = ftn(
      [
        run({ play_type: 'no_play' }),
        dropback({ two_point_attempt: 1 }),
        { play_type: 'kickoff', kickoff_attempt: 1 }
      ],
      [
        { is_motion: T, n_defense_box: 7 },
        { is_play_action: T },
        { is_motion: T },
        { nflverse_play_id: 99, is_motion: T },
        { nflverse_play_id: '', is_motion: T }
      ]
    )
    expect(out).toEqual({ playerWeeks: [], teamWeeks: [], skipped: 1, unmatched: 1 })
  })

  it('fails on a missing column and accepts a header-only file', () => {
    const header = FTN_COLUMNS.filter((c) => c !== 'is_drop').join(',')
    expect(() => aggregateFtn(`${header}\n`, playIndex([]))).toThrow(
      'ftn: column "is_drop" is missing'
    )
    expect(aggregateFtn(ftnCsv([]), playIndex([]))).toEqual({
      playerWeeks: [],
      teamWeeks: [],
      skipped: 0,
      unmatched: 0
    })
  })

  it('reads only columns the real file has', () => {
    const header = new Set(headerOf(captured('ftn_2025_game.csv')))
    expect(FTN_COLUMNS.filter((c) => !header.has(c))).toEqual([])
  })

  it('joins every charted play of a real game', () => {
    const index = new PlayIndex()
    aggregatePbp(captured('pbp_2025_game.csv'), index)
    const out = aggregateFtn(captured('ftn_2025_game.csv'), index)
    expect(out).toMatchObject({ skipped: 0, unmatched: 0 })
    const lamb = out.playerWeeks.find((r) => r.playerKey === '00-0036358')
    expect(lamb?.data).toEqual({ rec_catchable: 11, rec_drops: 4, rec_contested: 1 })
    const phi = out.teamWeeks.find((r) => r.team === 'PHI')?.data
    const hurts = out.playerWeeks.find((r) => r.playerKey === QB)?.data
    expect(phi?.off_play_action).toBe(hurts?.pass_pa_dropbacks)
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/main/warehouse/ftn.test.ts`
Expected: FAIL. `@main/warehouse/ftn` does not exist.

- [ ] **Step 4: Implement**

Create `src/main/warehouse/join.ts`:

```ts
import type { WhPlayerWeek, WhTeamWeek } from '@main/db/repos/warehouse'
import { forEachCsvRow, numOrNull } from '@main/sources/csv'
import { requireColumns } from '@main/sources/warehouse/parse'
import type { IndexedPlay, PlayIndex } from './playIndex'

/** What one joined file (FTN or participation) aggregates to (spec §6.1). */
export interface JoinResult {
  playerWeeks: WhPlayerWeek[]
  teamWeeks: WhTeamWeek[]
  /** Rows without a game or play id. */
  skipped: number
  /** Rows whose play is not in the index (deleted, preseason or not in play-by-play). */
  unmatched: number
}

/** One row of a joined file. Cells are trimmed (FTN writes " CHK"); empty and NA are null. */
export interface Cells {
  text(column: string): string | null
  num(column: string): number | null
  /** TRUE / 1. */
  flag(column: string): boolean
}

/**
 * Reads `text` one row at a time and hands every row that finds its play to `onRow`. `gameColumn`
 * and `playColumn` are the join key (spec §6.1); a missing key column fails the step.
 */
export function forEachJoinedRow(
  text: string,
  source: string,
  index: PlayIndex,
  keys: { gameColumn: string; playColumn: string; required: string[] },
  onRow: (cells: Cells, play: IndexedPlay) => void
): { skipped: number; unmatched: number } {
  requireColumns(text, source, [keys.gameColumn, keys.playColumn, ...keys.required])
  let skipped = 0
  let unmatched = 0
  let at: Map<string, number> | null = null
  let fields: string[] = []
  const raw = (column: string): string => {
    const i = at?.get(column)
    return i === undefined ? '' : (fields[i] ?? '').trim()
  }
  const cells: Cells = {
    text: (column) => {
      const v = raw(column)
      return v === '' || v === 'NA' ? null : v
    },
    num: (column) => numOrNull(raw(column)),
    flag: (column) => {
      const v = raw(column)
      return v === 'TRUE' || v === '1'
    }
  }
  forEachCsvRow(text, (row, header) => {
    at ??= new Map(header.map((column, i) => [column, i]))
    fields = row
    const gameId = cells.text(keys.gameColumn)
    const playId = cells.num(keys.playColumn)
    if (gameId === null || playId === null) {
      skipped++
      return
    }
    const play = index.get(gameId, playId)
    if (play) onRow(cells, play)
    else unmatched++
  })
  return { skipped, unmatched }
}
```

Create `src/main/warehouse/ftn.ts`:

```ts
import type { Bag } from './bag'
import { forEachJoinedRow, type Cells, type JoinResult } from './join'
import type { IndexedPlay, PlayIndex } from './playIndex'
import { PlayerBags, TeamBags } from './weekBags'

/** FTN's charting flags and counts, by FTN column name. */
const FTN_FLAGS = [
  'is_no_huddle',
  'is_motion',
  'is_play_action',
  'is_screen_pass',
  'is_rpo',
  'is_trick_play',
  'is_qb_out_of_pocket',
  'is_interception_worthy',
  'is_throw_away',
  'is_catchable_ball',
  'is_contested_ball',
  'is_created_reception',
  'is_drop',
  'is_qb_sneak',
  'is_qb_fault_sack'
]

/** Every column the FTN aggregation reads; a missing one fails the step. */
export const FTN_COLUMNS = [
  'nflverse_game_id',
  'nflverse_play_id',
  'n_defense_box',
  'n_blitzers',
  'n_pass_rushers',
  'read_thrown',
  ...FTN_FLAGS
]

/** A box or rusher count; FTN writes 0 where it did not chart one (special teams). */
const charted = (n: number | null): number | null => (n !== null && n > 0 ? n : null)

function passer(b: Bag, c: Cells, p: IndexedPlay): void {
  if (c.flag('is_play_action')) {
    b.add('pass_pa_dropbacks')
    b.add('pass_pa_epa_sum', p.qbEpa)
  }
  if ((c.num('n_blitzers') ?? 0) > 0) {
    b.add('pass_blitz_dropbacks')
    b.add('pass_blitz_epa_sum', p.qbEpa)
  }
  b.addIf('pass_rpo', c.flag('is_rpo'))
  b.addIf('pass_screens', c.flag('is_screen_pass'))
  b.addIf('pass_out_of_pocket', c.flag('is_qb_out_of_pocket'))
  b.addIf('pass_int_worthy', c.flag('is_interception_worthy'))
  b.addIf('pass_throwaways', c.flag('is_throw_away'))
  b.addIf('pass_qb_fault_sacks', c.flag('is_qb_fault_sack'))
  const read = c.text('read_thrown')
  if (read !== '0') b.tally('pass_read', read)
}

function rusher(b: Bag, c: Cells): void {
  const box = charted(c.num('n_defense_box'))
  if (box !== null) {
    b.add('rush_box_sum', box)
    b.add('rush_box_n')
    b.addIf('rush_box_8p', box >= 8)
  }
  b.addIf('rush_rpo', c.flag('is_rpo'))
  b.addIf('rush_qb_sneaks', c.flag('is_qb_sneak'))
}

function receiver(b: Bag, c: Cells, p: IndexedPlay): void {
  b.addIf('rec_catchable', c.flag('is_catchable_ball'))
  b.addIf('rec_contested', c.flag('is_contested_ball'))
  b.addIf('rec_contested_catches', c.flag('is_contested_ball') && p.complete)
  b.addIf('rec_created', c.flag('is_created_reception'))
  b.addIf('rec_drops', c.flag('is_drop'))
  b.addIf('rec_screen_tgt', c.flag('is_screen_pass'))
}

function team(b: Bag, c: Cells, p: IndexedPlay): void {
  b.addIf('motion', c.flag('is_motion'))
  b.addIf('play_action', c.flag('is_play_action'))
  b.addIf('rpo', c.flag('is_rpo'))
  b.addIf('screens', c.flag('is_screen_pass'))
  b.addIf('trick_plays', c.flag('is_trick_play'))
  b.addIf('no_huddle', c.flag('is_no_huddle'))
  const box = charted(c.num('n_defense_box'))
  if (box !== null) {
    b.add('box_sum', box)
    b.add('box_n')
  }
  if (p.passerId === null) return
  b.addIf('blitzes', (c.num('n_blitzers') ?? 0) > 0)
  const rushers = charted(c.num('n_pass_rushers'))
  if (rushers !== null) {
    b.add('rushers_sum', rushers)
    b.add('rushers_n')
  }
}

/** Spec §6.4: FTN charting (2022+), joined to play-by-play, into `ftn` player-weeks and team-weeks. */
export function aggregateFtn(text: string, index: PlayIndex): JoinResult {
  const players = new PlayerBags('ftn')
  const teams = new TeamBags('ftn')
  const counted = forEachJoinedRow(
    text,
    'ftn',
    index,
    { gameColumn: 'nflverse_game_id', playColumn: 'nflverse_play_id', required: FTN_COLUMNS },
    (c, p) => {
      if (!p.scrimmage || !p.posteam || !p.defteam) return
      if (p.passerId) passer(players.bag(p, p.passerId, p.posteam), c, p)
      if (p.rusherId) rusher(players.bag(p, p.rusherId, p.posteam), c)
      if (p.receiverId) receiver(players.bag(p, p.receiverId, p.posteam), c, p)
      for (const b of teams.both(p, p.posteam, p.defteam)) team(b, c, p)
    }
  )
  return { playerWeeks: players.finish(), teamWeeks: teams.finish(), ...counted }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/main/warehouse && npm run typecheck:node`
Expected: PASS, no type errors. The real game joins with no misses. The Lamb and Hurts numbers in "joins every charted play of a real game" are the prototype's output on the captured rows; they pin the join, not an outside source.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/main/warehouse/join.ts src/main/warehouse/ftn.ts tests/fixtures/pbp.ts tests/main/warehouse/ftn.test.ts
git add src/main/warehouse/join.ts src/main/warehouse/ftn.ts tests/fixtures/pbp.ts tests/fixtures/warehouse/capture.sh tests/fixtures/warehouse/ftn_2025_game.csv tests/main/warehouse/ftn.test.ts
git commit -m "feat(warehouse): aggregate FTN charting"
```

---

### Task 4: Participation (spec §6.5; amendments A, C, E, F)

**Files:**

- Create: `src/main/warehouse/participation.ts`, `tests/fixtures/warehouse/part_2025_game.csv`
- Modify: `tests/fixtures/pbp.ts`, `tests/fixtures/warehouse/capture.sh`
- Test: `tests/main/warehouse/participation.test.ts`

**Interfaces:**

- Consumes: `forEachJoinedRow`, `Cells`, `JoinResult` (Task 3); `PlayIndex`, `IndexedPlay` (Task 2); `PlayerBags`, `TeamBags` (Task 1).
- Produces (`participation.ts`):
  - `PART_COLUMNS`;
  - `offensePersonnel(raw): string | null` (`"11"`);
  - `defensiveBacks(raw): string | null` (`"5"`);
  - `aggregateParticipation(text, index): JoinResult` (source `part`).
- Produces (`tests/fixtures/pbp.ts`): `partCsv(rows)`.

**Keys written.** Player-weeks, gsis:

- **Everyone in `offense_players`**, on snaps: `off_snaps`, `off_personnel` (`{ group: count }`). On counting dropbacks: `off_dropbacks` (the route proxy), `off_dropbacks_man` / `off_dropbacks_zone`.
- **Everyone in `defense_players`**, on snaps: `def_snaps`.
- **Target**: `rec_routes` (`{ route: count }`), `rec_tgt_man` / `rec_tgt_zone`, and on catches `rec_yds_man` / `rec_yds_zone`.
- **Passer**: `pass_ttt_sum` / `pass_ttt_n`, `pass_pressured`, `pass_pressured_epa_sum`.

Team-weeks, mirrored `off_` / `def_`, over scrimmage snaps:

- `personnel`, `dbs`, `formation` (maps);
- `box_sum` / `box_n`;
- on dropbacks: `rushers_sum` / `rushers_n`, `man`, `zone`, `coverage` (map), `pressures`.

`off_personnel` is the offense's group; `def_personnel` is the group the defense faced. `off_dbs` is the number of defensive backs the offense faced; `def_dbs` is the defense's own.

- [ ] **Step 1: Capture the real game's participation rows**

```bash
base=https://github.com/nflverse/nflverse-data/releases/download
curl -sL "$base/pbp_participation/pbp_participation_2025.csv" | awk -F, 'NR == 1 || $1 == "2025_01_DAL_PHI"' > tests/fixtures/warehouse/part_2025_game.csv
wc -l -c tests/fixtures/warehouse/part_2025_game.csv
```

Expected: 148 lines, about 159 KB. The file is ~49 MB, so the download can take a few minutes. Then add to `tests/fixtures/warehouse/capture.sh`, after the `ftn_2025_game.csv` line:

```bash
get "$base/pbp_participation/pbp_participation_2025.csv" part_2025_game.csv 400 '$1 == "2025_01_DAL_PHI"'
```

- [ ] **Step 2: Write the failing tests**

In `tests/fixtures/pbp.ts`, add `import { PART_COLUMNS } from '@main/warehouse/participation'` after the `@main/warehouse/ftn` import, and after `ftnCsv`:

```ts
/** A participation CSV for BASE's game: give each row the `play_id` of its play. */
export function partCsv(rows: PbpRow[]): string {
  return csv(
    PART_COLUMNS,
    rows.map((r) => ({ nflverse_game_id: BASE.game_id, ...r }))
  )
}
```

Create `tests/main/warehouse/participation.test.ts`. `OFFICIAL` is copied from nflverse `snap_counts_2025` for the game, with PFR ids mapped to gsis through nflverse's `players.csv`:

```ts
import { describe, expect, it } from 'vitest'
import { headerOf } from '@main/sources/warehouse/parse'
import { aggregatePbp } from '@main/warehouse/aggregate'
import {
  aggregateParticipation,
  defensiveBacks,
  offensePersonnel,
  PART_COLUMNS
} from '@main/warehouse/participation'
import { PlayIndex } from '@main/warehouse/playIndex'
import { captured } from '../../fixtures/warehouse'
import { dropback, LB, partCsv, playIndex, QB, RB, run, WR, type PbpRow } from '../../fixtures/pbp'

/** Participation rows joined to `plays`; row i is play i + 1 unless it sets `play_id`. */
function part(plays: PbpRow[], rows: PbpRow[]): ReturnType<typeof aggregateParticipation> {
  const withIds = rows.map((r, i) => ({ play_id: i + 1, ...r }))
  return aggregateParticipation(partCsv(withIds), playIndex(plays))
}

const dataOf = (out: ReturnType<typeof aggregateParticipation>, id: string): unknown =>
  out.playerWeeks.find((r) => r.playerKey === id)?.data

const ON_FIELD = { offense_players: `${QB};${RB};${WR}`, defense_players: LB }

/** nflverse `snap_counts` for 2025 week 1, DAL at PHI: [gsis id, offense snaps, defense snaps]. */
const OFFICIAL: [string, number, number][] = [
  ['00-0036389', 63, 0], // Jalen Hurts PHI
  ['00-0034844', 50, 0], // Saquon Barkley PHI
  ['00-0035676', 55, 0], // A.J. Brown PHI
  ['00-0036912', 56, 0], // DeVonta Smith PHI
  ['00-0034351', 52, 0], // Dallas Goedert PHI
  ['00-0039841', 3, 61], // Cooper DeJean PHI
  ['00-0036418', 0, 61], // Zack Baun PHI
  ['00-0033077', 61, 0], // Dak Prescott DAL
  ['00-0036358', 56, 0], // CeeDee Lamb DAL
  ['00-0037247', 56, 0], // George Pickens DAL
  ['00-0036997', 47, 0], // Javonte Williams DAL
  ['00-0038041', 47, 0], // Jake Ferguson DAL
  ['00-0037242', 0, 63], // Kaiir Elam DAL
  ['00-0036942', 0, 41] // Osa Odighizuwa DAL
]

describe('personnel groups (spec §12)', () => {
  it('names the offense by backs and tight ends, in both formats', () => {
    expect(offensePersonnel('1 RB, 1 TE, 3 WR')).toBe('11')
    expect(offensePersonnel('6 OL, 1 RB, 2 TE, 1 WR')).toBe('12')
    expect(offensePersonnel('1 C, 2 G, 1 QB, 1 FB, 1 RB, 2 T, 1 TE, 2 WR')).toBe('21')
    expect(offensePersonnel('1 C, 2 G, 1 QB, 2 T, 5 WR')).toBe('00')
    expect(offensePersonnel(null)).toBeNull()
  })

  it('counts the defensive backs, in both formats', () => {
    expect(defensiveBacks('4 DL, 2 LB, 5 DB')).toBe('5')
    expect(defensiveBacks('3 CB, 2 DE, 2 DT, 1 FS, 2 ILB, 1 SS')).toBe('5')
    expect(defensiveBacks('2 CB, 2 DE, 2 DT, 3 LB, 1 S, 1 SS')).toBe('4')
    expect(defensiveBacks(null)).toBeNull()
  })
})

describe('aggregateParticipation (spec §6.5)', () => {
  it('snaps for everyone on the field, penalty-wiped snaps and two-point tries included', () => {
    const out = part(
      [
        run(),
        run({ play_type: 'no_play' }),
        dropback({ two_point_attempt: 1 }),
        { play_type: 'kickoff', kickoff_attempt: 1 },
        { play_type: 'no_play', penalty: 1, penalty_type: 'False Start' }
      ],
      Array.from({ length: 5 }, () => ({ ...ON_FIELD, offense_personnel: '1 RB, 1 TE, 3 WR' }))
    )
    expect(dataOf(out, RB)).toEqual({ off_snaps: 3, off_personnel: { '11': 3 } })
    expect(dataOf(out, LB)).toEqual({ def_snaps: 3 })
    expect(out.playerWeeks.map((r) => [r.playerKey, r.team, r.opponent])).toEqual([
      [QB, 'PHI', 'DAL'],
      [RB, 'PHI', 'DAL'],
      [WR, 'PHI', 'DAL'],
      [LB, 'DAL', 'PHI']
    ])
  })

  it('dropbacks on the field, split by man and zone (the route proxy)', () => {
    const out = part(
      [dropback(), dropback(), dropback({ sack: 1, receiver_player_id: '' }), run()],
      [
        { ...ON_FIELD, defense_man_zone_type: 'MAN_COVERAGE' },
        { ...ON_FIELD, defense_man_zone_type: 'ZONE_COVERAGE' },
        ON_FIELD,
        ON_FIELD
      ]
    )
    expect(dataOf(out, RB)).toEqual({
      off_snaps: 4,
      off_dropbacks: 3,
      off_dropbacks_man: 1,
      off_dropbacks_zone: 1
    })
  })

  it('the target: routes, and targets and yards against man and zone', () => {
    const out = part(
      [
        dropback({ complete_pass: 1, receiving_yards: 15 }),
        dropback(),
        dropback({ complete_pass: 1, receiving_yards: 8 })
      ],
      [
        { ...ON_FIELD, route: 'SLANT', defense_man_zone_type: 'MAN_COVERAGE' },
        { ...ON_FIELD, route: 'GO', defense_man_zone_type: 'ZONE_COVERAGE' },
        { ...ON_FIELD, route: 'SLANT', defense_man_zone_type: 'ZONE_COVERAGE' }
      ]
    )
    expect(dataOf(out, WR)).toMatchObject({
      rec_routes: { SLANT: 2, GO: 1 },
      rec_tgt_man: 1,
      rec_yds_man: 15,
      rec_tgt_zone: 2,
      rec_yds_zone: 8
    })
  })

  it('the passer: time to throw and pressured dropbacks', () => {
    const out = part(
      [
        dropback({ qb_epa: -1 }),
        dropback({ qb_epa: 0.5 }),
        dropback({ sack: 1, receiver_player_id: '', qb_epa: -2 })
      ],
      [
        { ...ON_FIELD, time_to_throw: 2.5, was_pressure: 'TRUE' },
        { ...ON_FIELD, time_to_throw: 3.1, was_pressure: 'FALSE' },
        { ...ON_FIELD, was_pressure: 'TRUE' }
      ]
    )
    expect(dataOf(out, QB)).toMatchObject({
      pass_ttt_sum: 5.6,
      pass_ttt_n: 2,
      pass_pressured: 2,
      pass_pressured_epa_sum: -3
    })
  })

  it('team: personnel, defensive backs, formation, box, rushers, coverage and pressure', () => {
    const out = part(
      [dropback(), run()],
      [
        {
          ...ON_FIELD,
          offense_personnel: '1 RB, 1 TE, 3 WR',
          defense_personnel: '4 DL, 2 LB, 5 DB',
          offense_formation: 'SHOTGUN',
          defenders_in_box: 6,
          number_of_pass_rushers: 4,
          defense_man_zone_type: 'ZONE_COVERAGE',
          defense_coverage_type: 'COVER_3',
          was_pressure: 'TRUE'
        },
        {
          ...ON_FIELD,
          offense_personnel: '2 RB, 1 TE, 2 WR',
          defense_personnel: '4 DL, 3 LB, 4 DB',
          offense_formation: 'I_FORM',
          defenders_in_box: 8,
          number_of_pass_rushers: 0
        }
      ]
    )
    const phi = {
      personnel: { '11': 1, '21': 1 },
      dbs: { '5': 1, '4': 1 },
      formation: { SHOTGUN: 1, I_FORM: 1 },
      box_sum: 14,
      box_n: 2,
      rushers_sum: 4,
      rushers_n: 1,
      zone: 1,
      coverage: { COVER_3: 1 },
      pressures: 1
    }
    const prefixed = (prefix: string): Record<string, unknown> =>
      Object.fromEntries(Object.entries(phi).map(([k, v]) => [prefix + k, v]))
    expect(out.teamWeeks.map((r) => [r.team, r.data])).toEqual([
      ['PHI', prefixed('off_')],
      ['DAL', prefixed('def_')]
    ])
  })

  it('counts misses and keyless rows, and fails on a missing column', () => {
    const out = part(
      [run()],
      [ON_FIELD, { ...ON_FIELD, play_id: 99 }, { ...ON_FIELD, play_id: '' }]
    )
    expect(out).toMatchObject({ skipped: 1, unmatched: 1 })
    const header = PART_COLUMNS.filter((c) => c !== 'offense_players').join(',')
    expect(() => aggregateParticipation(`${header}\n`, playIndex([]))).toThrow(
      'part: column "offense_players" is missing'
    )
  })

  it('reads only columns the real file has', () => {
    const header = new Set(headerOf(captured('part_2025_game.csv')))
    expect(PART_COLUMNS.filter((c) => !header.has(c))).toEqual([])
  })

  it('is within one snap of nflverse’s snap counts on a real game', () => {
    const index = new PlayIndex()
    aggregatePbp(captured('pbp_2025_game.csv'), index)
    const out = aggregateParticipation(captured('part_2025_game.csv'), index)
    expect(out).toMatchObject({ skipped: 0, unmatched: 0 })
    const byKey = new Map(out.playerWeeks.map((r) => [r.playerKey, r.data]))
    const off = OFFICIAL.map(([id, o, d]) => {
      const data = byKey.get(id) ?? {}
      return [
        id,
        Math.abs(Number(data.off_snaps ?? 0) - o),
        Math.abs(Number(data.def_snaps ?? 0) - d)
      ]
    })
    // PHI's offense (and DAL's defense) is one short: "Defensive Too Many Men on Field" at the snap
    // has no pass or run flag, so it is not a snap here (spec §12).
    expect(off.every(([, o, d]) => Number(o) <= 1 && Number(d) <= 1)).toBe(true)
    expect(off.filter(([, o, d]) => o === 0 && d === 0).length).toBeGreaterThanOrEqual(7)
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/main/warehouse/participation.test.ts`
Expected: FAIL. `@main/warehouse/participation` does not exist.

- [ ] **Step 4: Implement**

Create `src/main/warehouse/participation.ts`:

```ts
import type { Bag } from './bag'
import { forEachJoinedRow, type Cells, type JoinResult } from './join'
import type { IndexedPlay, PlayIndex } from './playIndex'
import { PlayerBags, TeamBags } from './weekBags'

/** Every column the participation aggregation reads; a missing one fails the step. */
export const PART_COLUMNS = [
  'nflverse_game_id',
  'play_id',
  'offense_players',
  'defense_players',
  'offense_personnel',
  'defense_personnel',
  'offense_formation',
  'defenders_in_box',
  'number_of_pass_rushers',
  'time_to_throw',
  'was_pressure',
  'route',
  'defense_man_zone_type',
  'defense_coverage_type'
]

const DEFENSIVE_BACKS = new Set(['DB', 'CB', 'S', 'FS', 'SS', 'SAF'])

/** "1 RB, 2 TE, 2 WR" → [[1, 'RB'], [2, 'TE'], [2, 'WR']]. */
function personnelCounts(raw: string | null): [number, string][] {
  if (raw === null) return []
  return [...raw.matchAll(/(\d+)\s+([A-Z]+)/g)].map((m) => [Number(m[1]), m[2]])
}

/**
 * The offense's personnel group as football names it: backs (RB + FB) then tight ends, "11", "12",
 * "21". Until 2022 nflverse lists "1 RB, 1 TE, 3 WR"; from 2023 every position ("1 C, 2 G, 1 QB,
 * 1 RB, 2 T, 1 TE, 3 WR"), so the group is counted rather than stored as published (spec §12).
 */
export function offensePersonnel(raw: string | null): string | null {
  const counts = personnelCounts(raw)
  if (counts.length === 0) return null
  let backs = 0
  let ends = 0
  for (const [n, position] of counts) {
    if (position === 'RB' || position === 'FB') backs += n
    if (position === 'TE') ends += n
  }
  return `${backs}${ends}`
}

/** The number of defensive backs ("4" base, "5" nickel, "6" dime), from either format. */
export function defensiveBacks(raw: string | null): string | null {
  const counts = personnelCounts(raw)
  if (counts.length === 0) return null
  return String(
    counts.reduce((sum, [n, position]) => sum + (DEFENSIVE_BACKS.has(position) ? n : 0), 0)
  )
}

function ids(raw: string | null): string[] {
  return raw === null ? [] : raw.split(';').filter((id) => id !== '')
}

/** A box or rusher count; participation writes 0 where it has none (special teams, from 2023). */
const charted = (n: number | null): number | null => (n !== null && n > 0 ? n : null)

/** `MAN_COVERAGE` / `ZONE_COVERAGE` → man / zone. */
function manZone(c: Cells): 'man' | 'zone' | null {
  const raw = c.text('defense_man_zone_type')
  return raw === 'MAN_COVERAGE' ? 'man' : raw === 'ZONE_COVERAGE' ? 'zone' : null
}

function onOffense(b: Bag, c: Cells, p: IndexedPlay, personnel: string | null): void {
  b.add('off_snaps')
  b.tally('off_personnel', personnel)
  if (p.passerId === null) return
  b.add('off_dropbacks')
  const coverage = manZone(c)
  if (coverage) b.add(`off_dropbacks_${coverage}`)
}

function receiver(b: Bag, c: Cells, p: IndexedPlay): void {
  b.tally('rec_routes', c.text('route'))
  const coverage = manZone(c)
  if (coverage === null) return
  b.add(`rec_tgt_${coverage}`)
  if (p.complete) b.add(`rec_yds_${coverage}`, p.receivingYards)
}

function passer(b: Bag, c: Cells, p: IndexedPlay): void {
  const ttt = charted(c.num('time_to_throw'))
  if (ttt !== null) {
    b.add('pass_ttt_sum', ttt)
    b.add('pass_ttt_n')
  }
  if (c.flag('was_pressure')) {
    b.add('pass_pressured')
    b.add('pass_pressured_epa_sum', p.qbEpa)
  }
}

function team(b: Bag, c: Cells, p: IndexedPlay, personnel: string | null): void {
  b.tally('personnel', personnel)
  b.tally('dbs', defensiveBacks(c.text('defense_personnel')))
  b.tally('formation', c.text('offense_formation'))
  const box = charted(c.num('defenders_in_box'))
  if (box !== null) {
    b.add('box_sum', box)
    b.add('box_n')
  }
  if (p.passerId === null) return
  const rushers = charted(c.num('number_of_pass_rushers'))
  if (rushers !== null) {
    b.add('rushers_sum', rushers)
    b.add('rushers_n')
  }
  const coverage = manZone(c)
  if (coverage) b.add(coverage)
  b.tally('coverage', c.text('defense_coverage_type'))
  b.addIf('pressures', c.flag('was_pressure'))
}

/** Spec §6.5: participation, joined to play-by-play, into `part` player-weeks and team-weeks. */
export function aggregateParticipation(text: string, index: PlayIndex): JoinResult {
  const players = new PlayerBags('part')
  const teams = new TeamBags('part')
  const counted = forEachJoinedRow(
    text,
    'part',
    index,
    { gameColumn: 'nflverse_game_id', playColumn: 'play_id', required: PART_COLUMNS },
    (c, p) => {
      if (!p.snap || !p.posteam || !p.defteam) return
      const personnel = offensePersonnel(c.text('offense_personnel'))
      for (const id of ids(c.text('offense_players'))) {
        onOffense(players.bag(p, id, p.posteam), c, p, personnel)
      }
      for (const id of ids(c.text('defense_players'))) {
        players.bag(p, id, p.defteam).add('def_snaps')
      }
      if (!p.scrimmage) return
      if (p.receiverId) receiver(players.bag(p, p.receiverId, p.posteam), c, p)
      if (p.passerId) passer(players.bag(p, p.passerId, p.posteam), c, p)
      for (const b of teams.both(p, p.posteam, p.defteam)) team(b, c, p, personnel)
    }
  )
  return { playerWeeks: players.finish(), teamWeeks: teams.finish(), ...counted }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/main/warehouse && npm run typecheck:node`
Expected: PASS, no type errors. On the real game, 13 of the 14 listed players match nflverse exactly. The rest of PHI's offense and DAL's defense are one short: play 3101 is "Defensive Too Many Men on Field" with no pass or run flag (findings).

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/main/warehouse/participation.ts tests/fixtures/pbp.ts tests/main/warehouse/participation.test.ts
git add src/main/warehouse/participation.ts tests/fixtures/pbp.ts tests/fixtures/warehouse/capture.sh tests/fixtures/warehouse/part_2025_game.csv tests/main/warehouse/participation.test.ts
git commit -m "feat(warehouse): aggregate participation"
```

---

### Task 5: Due and write each source on its own (spec §4.2; amendment D)

**Files:**

- Modify: `src/main/sync/warehouseSteps.ts`, `src/main/sync/warehouseSync.ts`
- Test: `tests/main/sync/warehouseSync.test.ts`

**Interfaces:**

- Produces (`warehouseSteps.ts`):
  - `interface StepSource { source; version; firstSeason? }`. `WarehouseStep.sources: StepSource[]`.
  - `WarehouseStep.fetch(ctx, season, due?: string[])`: `due` lists the step's sources due this run (default: all of them).
  - `StepRows.sources: string[] | null`: the sources the rows replace (null = every due source).
  - `StepRows.notes: string[]`: extra parts of the step message.
  - `stepRows()` defaults: `sources: null`, `notes: []`.
- Produces (`warehouseSync.ts`):
  - `refreshWarehouse` computes due sources per source. A source is never due before its own first season (default: the step's).
  - It passes `due` to `fetch`, and writes and records only `rows.sources ?? due`.
  - The step message is the unparseable count plus `notes`, joined with `; `.
  - `rows.sources` empty → `SkipStep(notes)`.
  - No other step changes: they ignore `due` and return `sources: null`.

- [ ] **Step 1: Write the failing tests**

In `tests/main/sync/warehouseSync.test.ts`, replace `interface FakeStepOptions` and `function fakeStep` with:

```ts
interface FakeStepOptions {
  version?: number
  firstSeason?: number
  allSeasons?: boolean
  sources?: string[]
  /** Per-source first seasons and versions, over `firstSeason` / `version`. */
  sourceFirstSeason?: Record<string, number>
  sourceVersion?: Record<string, number>
  fetch?: (season: number, due: string[]) => Promise<StepRows | null>
}

function fakeStep(
  id: string,
  options: FakeStepOptions = {}
): WarehouseStep & { calls: number[]; due: string[][] } {
  const calls: number[] = []
  const due: string[][] = []
  const sources = options.sources ?? [id]
  return {
    id,
    calls,
    due,
    sources: sources.map((source) => ({
      source,
      version: options.sourceVersion?.[source] ?? options.version ?? 1,
      firstSeason: options.sourceFirstSeason?.[source]
    })),
    firstSeason: options.firstSeason ?? 2024,
    allSeasons: options.allSeasons ?? false,
    async fetch(_ctx, season, dueSources = sources) {
      calls.push(season)
      due.push(dueSources)
      if (options.fetch) return options.fetch(season, dueSources)
      return stepRows({ playerWeeks: sources.map((s) => rowFor(s, season === 0 ? 2025 : season)) })
    }
  }
}
```

and add before `it('runs every registered step against the captured files without an error'`:

```ts
it('never makes a source due before its own first season', async () => {
  const multi = fakeStep('multi', { sources: ['x', 'late'], sourceFirstSeason: { late: 2025 } })
  await run([multi])
  expect(multi.due).toEqual([['x'], ['x', 'late'], ['x', 'late']])
  expect(getWhSourceState(db, 'late', 2024)).toBeNull()
  later(DAY)
  expect(ran(await run([multi]))).toEqual(['wh:multi:2026=ok'])
})

it('writes only the sources a step returns; the others keep their rows and state', async () => {
  const write = (sources: string[]) => async (season: number) =>
    stepRows({ playerWeeks: sources.map((s) => rowFor(s, season)), sources })
  await run([
    fakeStep('multi', { sources: ['x', 'y'], firstSeason: 2024, fetch: write(['x', 'y']) })
  ])
  const before = getWhSourceState(db, 'x', 2024)
  later(DAY)
  const bumped = fakeStep('multi', {
    sources: ['x', 'y'],
    sourceVersion: { y: 2 },
    fetch: async (season, due) => write(due)(season)
  })
  expect(ran(await run([bumped]))).toEqual([
    'wh:multi:2024=ok',
    'wh:multi:2025=ok',
    'wh:multi:2026=ok'
  ])
  expect(bumped.due.slice(0, 2)).toEqual([['y'], ['y']])
  expect(getWhSourceState(db, 'x', 2024)).toEqual(before)
  expect(getWhSourceState(db, 'y', 2024)).toMatchObject({ version: 2, sealed: true })
})

it('a source not published yet is noted and retried; nothing to write is a skip', async () => {
  const pending = fakeStep('multi', {
    sources: ['x', 'y'],
    firstSeason: 2025,
    fetch: async (season, due) =>
      stepRows({
        playerWeeks: due.includes('x') ? [rowFor('x', season)] : [],
        sources: due.filter((s) => s === 'x'),
        notes: due.includes('y') ? [`y ${season} not published yet`] : []
      })
  })
  expect(ran(await run([pending]))).toEqual(['wh:multi:2025=ok', 'wh:multi:2026=ok'])
  expect(getLastSync(db, 'wh:multi:2025')?.message).toBe('y 2025 not published yet')
  expect(getWhSourceState(db, 'y', 2025)).toBeNull()
  later(DAY)
  expect(ran(await run([pending]))).toEqual(['wh:multi:2025=skipped', 'wh:multi:2026=ok'])
  expect(getLastSync(db, 'wh:multi:2025')?.message).toBe('y 2025 not published yet')
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/main/sync/warehouseSync.test.ts`
Expected: FAIL. Type errors, and the three new tests fail: `fetch` gets no `due`, every source of a step is written, `sources` and `notes` do not exist.

- [ ] **Step 3: Implement**

In `src/main/sync/warehouseSteps.ts`:

- In `interface StepRows`, after `skipped: number`, add:

```ts
  /** The sources these rows replace, each recorded in `wh_source_state`; null = every due source. */
  sources: string[] | null
  /** Extra parts of the step message (join misses, a source not published yet). */
  notes: string[]
```

- In `stepRows`, after `skipped: 0,`, add `sources: null,` and `notes: [],`.
- Replace `export interface WarehouseStep { … }` and the `v1` helper with:

```ts
/** A source a step writes, with the adapter version that writes it. */
export interface StepSource {
  source: string
  version: number
  /** Seasons before it are never due for this source (FTN starts in 2022); default the step's. */
  firstSeason?: number
}

export interface WarehouseStep {
  /** `wh:<id>` (all-seasons) or `wh:<id>:<season>` in sync_log. */
  id: string
  sources: StepSource[]
  /** First season fetched (never before WAREHOUSE_FIRST_SEASON); unused for all-seasons steps. */
  firstSeason: number
  /** One file holding every season; fetched with season 0. */
  allSeasons: boolean
  /**
   * The rows for `season`, or null when the file is not published. May throw `SkipStep`. `due` lists
   * the step's sources due this run (default: all of them); a step may fetch only those.
   */
  fetch(ctx: StepContext, season: number, due?: string[]): Promise<StepRows | null>
}

const v1 = (...sources: string[]): StepSource[] => sources.map((source) => ({ source, version: 1 }))
```

In `src/main/sync/warehouseSync.ts`, replace `interface DueInput` and `function isDue` with:

```ts
interface DueInput {
  season: number
  current: number
  force: boolean
  now: number
  lastAttemptAt: string | null
  states: { source: string; version: number; firstSeason: number; state: WhSourceState | null }[]
}

/** Spec §4.2: the step's sources due for `season`; none within a day of the step's last attempt. */
function dueSources(input: DueInput): string[] {
  const { season, current, now } = input
  const recent = season === 0 || season >= current - 1
  const attemptedRecently =
    input.lastAttemptAt !== null && now - Date.parse(input.lastAttemptAt) < ATTEMPT_INTERVAL_MS
  if (attemptedRecently && !(input.force && recent)) return []
  const due = ({ version, state }: DueInput['states'][number]): boolean => {
    if (!state || state.version < version) return true
    if (season === 0 || season === current) return true
    if (season === current - 1) {
      return now - Date.parse(state.fetchedAt) >= PRIOR_SEASON_FRESHNESS_MS
    }
    return !state.sealed
  }
  return input.states
    .filter((s) => (season === 0 || season >= s.firstSeason) && due(s))
    .map((s) => s.source)
}
```

Replace the doc comment and signature of `writeStepRows` with:

```ts
/** Writes the rows of each source the step returned (default: the due ones) and records its state. */
function writeStepRows(
  db: Db,
  step: WarehouseStep,
  season: number,
  due: string[],
  rows: StepRows,
  updatedAt: string,
  sealed: boolean
): number {
```

and add, as the first line inside its `step.sources.forEach(({ source, version }, index) => {`:

```ts
if (!(rows.sources ?? due).includes(source)) return
```

Replace `runWarehouseStep` with:

```ts
async function runWarehouseStep(
  deps: WarehouseSyncDeps,
  ctx: StepContext,
  step: WarehouseStep,
  season: number,
  due: string[]
): Promise<StepOutcome> {
  const rows = await step.fetch(ctx, season, due)
  if (rows === null) {
    throw new SkipStep(
      season === 0 ? `${step.id} not published yet` : `${step.id} ${season} not published yet`
    )
  }
  const notes = [
    ...(rows.skipped ? [`${rows.skipped} unparseable rows skipped`] : []),
    ...rows.notes
  ]
  if (rows.sources?.length === 0) throw new SkipStep(notes.join('; '))
  const updatedAt = nowOf(deps).toISOString()
  const sealed = season !== 0 && season <= ctx.current - 2
  const written = withTransaction(deps.db, () =>
    writeStepRows(deps.db, step, season, due, rows, updatedAt, sealed)
  )
  return { rows: written, message: notes.length > 0 ? notes.join('; ') : null }
}
```

In `refreshWarehouse`, replace everything from `const due = isDue({` through the `log.push(…)` line with:

```ts
const due = dueSources({
  season,
  current,
  force,
  now: nowOf(deps).getTime(),
  lastAttemptAt: getLastFinishedSync(deps.db, name)?.startedAt ?? null,
  states: step.sources.map(({ source, version, firstSeason }) => ({
    source,
    version,
    firstSeason: firstSeason ?? step.firstSeason,
    state: getWhSourceState(deps.db, source, season)
  }))
})
if (due.length === 0) continue
log.push(await runStep(deps, name, 0, true, () => runWarehouseStep(deps, ctx, step, season, due)))
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/sync tests/main/warehouse && npm run typecheck:node`
Expected: PASS, no type errors. Every earlier `refreshWarehouse` test passes unchanged.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/main/sync/warehouseSteps.ts src/main/sync/warehouseSync.ts tests/main/sync/warehouseSync.test.ts
git add src/main/sync/warehouseSteps.ts src/main/sync/warehouseSync.ts tests/main/sync/warehouseSync.test.ts
git commit -m "feat(warehouse): due and write sources one by one"
```

---

### Task 6: Join FTN and participation in the play-by-play step (spec §6.1; amendment D)

**Files:**

- Modify: `src/main/warehouse/aggregate.ts`, `src/main/warehouse/job.ts`, `src/main/warehouse/runWorker.ts`, `src/main/sync/warehouseSteps.ts`, `tests/fixtures/warehouse.ts`
- Test: `tests/main/warehouse/aggregate.test.ts`, `tests/main/warehouse/runWorker.test.ts`, `tests/main/sync/warehouseSteps.test.ts`, `tests/main/sync/warehouseSync.test.ts`

**Interfaces:**

- Consumes: `aggregatePbp(text, index)`, `PlayIndex` (Task 2); `aggregateFtn` (Task 3); `aggregateParticipation` (Task 4); `JoinResult` (Task 3); `StepSource`, `due`, `StepRows.sources` / `notes` (Task 5).
- Produces (`aggregate.ts`): `SeasonTexts { pbp; ftn | null; part | null }`, `SeasonResult { pbp: PbpResult; ftn: JoinResult | null; part: JoinResult | null }`, `aggregateSeason(texts): SeasonResult`.
- Produces (`job.ts`):
  - `WarehouseJob { pbp: Uint8Array; ftn: Uint8Array | null; part: Uint8Array | null }`;
  - `WarehouseOutput` carries a `SeasonResult`;
  - `AggregatePbp = (job: WarehouseJob) => Promise<SeasonResult>` (the name is kept; `runPbpWorker` and the IPC wiring do not change).
- Produces (`runWorker.ts`): `runPbpWorker(job)` transfers every non-null file.
- Produces (`warehouseSteps.ts`):
  - `FTN_FIRST_SEASON = 2022`.
  - The `pbp` step has sources `pbp` v1, `ftn` v1 (first season 2022) and `part` v1.
  - It downloads play-by-play, plus `ftn_charting/ftn_charting_{season}` and `pbp_participation/pbp_participation_{season}` when they are due.
  - It returns the rows of each due source that was found, and notes every due join not published and every join miss.

- [ ] **Step 1: Write the failing tests**

In `tests/main/warehouse/aggregate.test.ts`:

- Change the imports to:

```ts
import { aggregatePbp, aggregateSeason } from '@main/warehouse/aggregate'
```

and

```ts
import { dropback, ftnCsv, partCsv, pbpCsv, QB, RB, run, WR } from '../../fixtures/pbp'
```

- Append:

```ts
describe('aggregateSeason (spec §6.1)', () => {
  const pbp = pbpCsv([run({ play_id: 10 }), dropback({ play_id: 20 })])

  it('joins FTN and participation to the plays play-by-play indexed', () => {
    const out = aggregateSeason({
      pbp,
      ftn: ftnCsv([{ nflverse_play_id: 10, n_defense_box: 7 }]),
      part: partCsv([{ play_id: 20, offense_players: WR }])
    })
    expect(out.pbp).toEqual(aggregatePbp(pbp))
    expect(out.ftn?.playerWeeks.map((r) => [r.source, r.playerKey, r.data])).toEqual([
      ['ftn', RB, { rush_box_sum: 7, rush_box_n: 1 }]
    ])
    expect(out.part?.playerWeeks.map((r) => [r.source, r.playerKey, r.data])).toEqual([
      ['part', WR, { off_snaps: 1, off_dropbacks: 1 }]
    ])
  })

  it('leaves out a join it was not given', () => {
    expect(aggregateSeason({ pbp, ftn: null, part: null })).toMatchObject({ ftn: null, part: null })
  })
})
```

In `tests/main/warehouse/runWorker.test.ts`:

- Add `import type { WarehouseJob } from '@main/warehouse/job'` before the `runWorker` import.
- Replace everything from `const RESULT` through the end of the first `it` with:

```ts
const RESULT = { pbp: { playerWeeks: [], teamWeeks: [], skipped: 2 }, ftn: null, part: null }

const job = (): WarehouseJob => ({ pbp: new Uint8Array([1]), ftn: null, part: null })

describe('runPbpWorker (spec §6.1)', () => {
  it('transfers the files and resolves with the answer', async () => {
    const pbp = new Uint8Array([1, 2, 3])
    const part = new Uint8Array([4, 5])
    const done = runPbpWorker({ pbp, ftn: null, part })
    expect(workers[0].options).toEqual({
      workerData: { pbp, ftn: null, part },
      transferList: [pbp.buffer, part.buffer]
    })
    workers[0].emit('message', { result: RESULT })
    await expect(done).resolves.toEqual(RESULT)
    expect(workers[0].terminated).toBe(true)
  })
```

- In "rejects with the worker's error…", change `runPbpWorker(new Uint8Array([1]))` to `runPbpWorker(job())`.

In `tests/main/sync/warehouseSteps.test.ts`:

- Change the imports:
  - `import { replaceWhGames, type WhKeyType, type WhPlayerWeek } from '@main/db/repos/warehouse'`
  - replace `import type { PbpResult } from '@main/warehouse/aggregate'` with `import type { SeasonResult } from '@main/warehouse/aggregate'` and `import type { JoinResult } from '@main/warehouse/join'`
  - add `captured,` to the `../../fixtures/warehouse` import.
- Replace the test "hands the downloaded play-by-play file to the aggregator and keeps its rows" with:

```ts
it('downloads play-by-play and each due join, and keeps the rows of due sources', async () => {
  const row = (source: string): WhPlayerWeek => ({
    source,
    season: 2024,
    seasonType: 'REG',
    week: 1,
    playerKey: '00-0034844',
    keyType: 'gsis',
    team: 'PHI',
    opponent: 'DAL',
    data: { n: 1 }
  })
  const joined = (source: string): JoinResult => ({
    playerWeeks: [row(source)],
    teamWeeks: [],
    skipped: 0,
    unmatched: 2
  })
  const result: SeasonResult = {
    pbp: { playerWeeks: [row('pbp')], teamWeeks: [], skipped: 3 },
    ftn: null,
    part: joined('part')
  }
  const aggregatePbp = vi.fn<AggregatePbp>(async () => result)
  const client = fakeWarehouse({
    'pbp/play_by_play_2024': 'pbp',
    'pbp_participation/pbp_participation_2024': 'part'
  })
  const out = await step('pbp').fetch(ctx(client, { aggregatePbp }), 2024, ['ftn', 'part'])
  expect(client.calls).toEqual([
    'pbp/play_by_play_2024',
    'ftn_charting/ftn_charting_2024',
    'pbp_participation/pbp_participation_2024'
  ])
  const job = aggregatePbp.mock.calls[0][0]
  const text = (b: Uint8Array | null): string | null => b && new TextDecoder().decode(b)
  expect([text(job.pbp), job.ftn, text(job.part)]).toEqual(['pbp', null, 'part'])
  expect(out).toMatchObject({
    sources: ['part'],
    playerWeeks: [row('part')],
    skipped: 0,
    notes: ['ftn 2024 not published yet', 'part: 2 rows matched no play']
  })
})

it('fetches every join by default and does not download one that is not due', async () => {
  const client = fakeWarehouse({ 'pbp/play_by_play_2024': captured('pbp_2025_game.csv') })
  const all = await step('pbp').fetch(ctx(client), 2024)
  expect(all?.sources).toEqual(['pbp'])
  expect(all?.notes).toEqual(['ftn 2024 not published yet', 'part 2024 not published yet'])
  client.calls.length = 0
  await step('pbp').fetch(ctx(client), 2024, ['pbp'])
  expect(client.calls).toEqual(['pbp/play_by_play_2024'])
})
```

In `tests/fixtures/warehouse.ts`, add to `capturedFiles`, after the `pbp/play_by_play_2025` entry:

```ts
    'ftn_charting/ftn_charting_2025': captured('ftn_2025_game.csv'),
    'pbp_participation/pbp_participation_2025': captured('part_2025_game.csv')
```

In `tests/main/sync/warehouseSync.test.ts`, in "runs every registered step against the captured files without an error", add `'ftn',` after `'ff_opportunity',` and `'part',` before `'pbp',` in the expected list.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/main/warehouse tests/main/sync`
Expected: FAIL. `aggregateSeason` is not exported, the worker gets bytes rather than a job, the step downloads no join, and `ftn` / `part` are not filled.

- [ ] **Step 3: Implement**

In `src/main/warehouse/aggregate.ts`:

- Add, after the existing imports from `./`:

```ts
import { aggregateFtn } from './ftn'
import type { JoinResult } from './join'
import { aggregateParticipation } from './participation'
```

(keep them sorted by path: `./ftn`, `./join`, `./participation`, `./pbpPlayers`, …).

- Append:

```ts
/** One season's files as text; FTN and participation are null when not fetched. */
export interface SeasonTexts {
  pbp: string
  ftn: string | null
  part: string | null
}

/** What one season aggregates to: `pbp`, and each joined source that was given. */
export interface SeasonResult {
  pbp: PbpResult
  ftn: JoinResult | null
  part: JoinResult | null
}

/** Spec §6.1: play-by-play first (it builds the play index), then the FTN and participation joins. */
export function aggregateSeason(texts: SeasonTexts): SeasonResult {
  const index = new PlayIndex()
  const pbp = aggregatePbp(texts.pbp, index)
  return {
    pbp,
    ftn: texts.ftn === null ? null : aggregateFtn(texts.ftn, index),
    part: texts.part === null ? null : aggregateParticipation(texts.part, index)
  }
}
```

Replace `src/main/warehouse/job.ts` with:

```ts
import { decodeText } from '@main/sources/http'
import { aggregateSeason, type SeasonResult } from './aggregate'

/**
 * What the warehouse worker is given: one season's files as downloaded (spec §6.1). FTN and
 * participation are null when they are not due or not published.
 */
export interface WarehouseJob {
  pbp: Uint8Array
  ftn: Uint8Array | null
  part: Uint8Array | null
}

export type WarehouseOutput = { result: SeasonResult; error?: undefined } | { error: string }

/** Turns a season's downloaded files into their aggregates; the sync takes it as a dependency. */
export type AggregatePbp = (job: WarehouseJob) => Promise<SeasonResult>

const decoded = (bytes: Uint8Array | null): string | null =>
  bytes === null ? null : decodeText(bytes)

/** The worker's job: gunzip, decode, aggregate. */
export function runWarehouseJob(job: WarehouseJob): SeasonResult {
  return aggregateSeason({
    pbp: decodeText(job.pbp),
    ftn: decoded(job.ftn),
    part: decoded(job.part)
  })
}

/** The same job on the calling thread, for tests and scripts. */
export const aggregateInProcess: AggregatePbp = async (job) => runWarehouseJob(job)
```

In `src/main/warehouse/runWorker.ts`:

- Change `import type { PbpResult } from './aggregate'` to `import type { SeasonResult } from './aggregate'`.
- Replace the doc comment and `runPbpWorker` up to `let answered = false` with:

```ts
/**
 * Spec §6.1: a season is ~100 MB of CSV (plus FTN and participation) and takes seconds to
 * aggregate, so it runs off the main thread. The files are transferred to the worker, not copied;
 * one worker per season.
 */
export const runPbpWorker: AggregatePbp = (job) =>
  new Promise<SeasonResult>((resolve, reject) => {
    const files = [job.pbp, job.ftn, job.part].filter((b): b is Uint8Array => b !== null)
    const worker = new Worker(workerPath(), {
      workerData: job satisfies WarehouseJob,
      transferList: files.map((b) => b.buffer as ArrayBuffer)
    })
```

In `src/main/sync/warehouseSteps.ts`, replace the `pbp` step (its doc comment and `const pbpStep`) with:

```ts
/** FTN charting starts in 2022 (spec §6.1). */
export const FTN_FIRST_SEASON = 2022

/** The files the play-by-play step joins to play-by-play: source → nflverse release tag and name. */
const JOINED_FILES: Record<string, (season: number) => [string, string]> = {
  ftn: (season) => ['ftn_charting', `ftn_charting_${season}`],
  part: (season) => ['pbp_participation', `pbp_participation_${season}`]
}

const PBP_SOURCES: StepSource[] = [
  { source: 'pbp', version: 1 },
  { source: 'ftn', version: 1, firstSeason: FTN_FIRST_SEASON },
  { source: 'part', version: 1 }
]

/**
 * Spec §6.1–§6.5: one season of play-by-play, with FTN and participation joined to it, aggregated off
 * the main thread. Play-by-play is downloaded whenever any of the three is due (the joins need its
 * play index) but replaces its rows only when it is due itself.
 */
const pbpStep: WarehouseStep = {
  id: 'pbp',
  sources: PBP_SOURCES,
  firstSeason: WAREHOUSE_FIRST_SEASON,
  allSeasons: false,
  async fetch(ctx, season, due = PBP_SOURCES.map((s) => s.source)) {
    const pbp = await ctx.client.nflverseFile('pbp', `play_by_play_${season}`)
    if (pbp === null) return null
    const joined = async (source: string): Promise<Uint8Array | null> =>
      due.includes(source) ? ctx.client.nflverseFile(...JOINED_FILES[source](season)) : null
    const ftn = await joined('ftn')
    const part = await joined('part')
    const result = await ctx.aggregatePbp({ pbp, ftn, part })
    const out = stepRows({ sources: due.filter((s) => s === 'pbp') })
    if (due.includes('pbp')) {
      out.playerWeeks.push(...result.pbp.playerWeeks)
      out.teamWeeks.push(...result.pbp.teamWeeks)
      out.skipped += result.pbp.skipped
    }
    for (const [source, rows] of [
      ['ftn', result.ftn],
      ['part', result.part]
    ] as const) {
      if (!due.includes(source)) continue
      if (rows === null) {
        out.notes.push(`${source} ${season} not published yet`)
        continue
      }
      out.sources?.push(source)
      out.playerWeeks.push(...rows.playerWeeks)
      out.teamWeeks.push(...rows.teamWeeks)
      out.skipped += rows.skipped
      if (rows.unmatched > 0) out.notes.push(`${source}: ${rows.unmatched} rows matched no play`)
    }
    return out
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm run typecheck && npx vitest run tests/main/warehouse tests/main/sync`
Expected: PASS, no type errors. `src/main/ipc/handlers.ts` still passes `runPbpWorker` as `aggregatePbp` and needs no change.

- [ ] **Step 5: Check the bundled worker on a real season**

```bash
npx electron-vite build
mkdir -p /tmp/ffc-v && cd /tmp/ffc-v
base=https://github.com/nflverse/nflverse-data/releases/download
curl -sL -o pbp.csv.gz "$base/pbp/play_by_play_2025.csv.gz"
curl -sL -o ftn.csv "$base/ftn_charting/ftn_charting_2025.csv"
curl -sL -o part.csv "$base/pbp_participation/pbp_participation_2025.csv"
cd - && node -e '
const { readFileSync } = require("node:fs"); const { Worker } = require("node:worker_threads")
const f = (n) => new Uint8Array(readFileSync("/tmp/ffc-v/" + n))
const job = { pbp: f("pbp.csv.gz"), ftn: f("ftn.csv"), part: f("part.csv") }
const t = Date.now()
const w = new Worker("./out/main/warehouseWorker.js", { workerData: job, transferList: [job.pbp.buffer, job.ftn.buffer, job.part.buffer] })
w.on("message", (o) => { console.log(o.error ?? [o.result.pbp.playerWeeks.length, o.result.ftn.playerWeeks.length, o.result.part.playerWeeks.length, o.result.ftn.unmatched, o.result.part.unmatched, Date.now() - t]); w.terminate() })'
rm -rf /tmp/ffc-v
```

Expected: about `[ 17320, 5408, 21654, 0, 0, 3300 ]`: player-weeks per source, no misses, and roughly 3 s. An `error` instead means the bundle is broken: stop and report.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/main/warehouse/aggregate.ts src/main/warehouse/job.ts src/main/warehouse/runWorker.ts src/main/sync/warehouseSteps.ts tests/fixtures/warehouse.ts tests/main/warehouse/aggregate.test.ts tests/main/warehouse/runWorker.test.ts tests/main/sync/warehouseSteps.test.ts tests/main/sync/warehouseSync.test.ts
git add src/main/warehouse/aggregate.ts src/main/warehouse/job.ts src/main/warehouse/runWorker.ts src/main/sync/warehouseSteps.ts tests/fixtures/warehouse.ts tests/main/warehouse/aggregate.test.ts tests/main/warehouse/runWorker.test.ts tests/main/sync/warehouseSteps.test.ts tests/main/sync/warehouseSync.test.ts
git commit -m "feat(warehouse): join FTN and participation"
```

---

### Task 7: Live check, docs, verification, release

**Files:**

- Modify: `docs/reference/stats-warehouse.md`, `docs/superpowers/specs/2026-10-09-stats-warehouse-design.md`, this plan (Status block)
- Throwaway (never committed): `tests/zz-v-live.test.ts`

- [ ] **Step 1: Live backfill and gates**

Get the Sleeper state with `curl -s https://api.sleeper.app/v1/state/nfl` and note `season` and `week`. Create `tests/zz-v-live.test.ts` with those values filled in:

```ts
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'vitest'
import { openWarehouseDatabase } from '@main/db/warehouseDb'
import { parseCsv } from '@main/sources/csv'
import { createWarehouseClient } from '@main/sources/warehouse/client'
import { WAREHOUSE_STEPS } from '@main/sync/warehouseSteps'
import { refreshWarehouse } from '@main/sync/warehouseSync'
import { aggregateInProcess } from '@main/warehouse/job'

it(
  'live FTN and participation backfill (throwaway; never commit)',
  { timeout: 3_600_000 },
  async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'ffc-v-')), 'wh.db')
    const db = openWarehouseDatabase(path)
    const client = createWarehouseClient()
    const state = {
      season: '2026', // ← state season
      week: 5, // ← state week
      displayWeek: 5,
      seasonType: 'regular',
      fetchedAt: new Date().toISOString()
    }
    const steps = WAREHOUSE_STEPS.filter((s) => s.id === 'pbp' || s.id === 'snaps')
    const deps = { db, warehouse: client, state, aggregatePbp: aggregateInProcess }
    const start = Date.now()
    const result = await refreshWarehouse(deps, {}, steps)
    console.log({ seconds: (Date.now() - start) / 1000 })
    console.log(result.steps.map((s) => `${s.source}=${s.status} ${s.message ?? ''}`))
    console.log(
      db
        .prepare(
          `SELECT source, COUNT(*) AS rows, ROUND(SUM(LENGTH(data_json)) / 1e6, 1) AS mb FROM (
           SELECT source, data_json FROM wh_player_week UNION ALL SELECT source, data_json FROM wh_team_week)
         WHERE source IN ('pbp', 'ftn', 'part') GROUP BY source`
        )
        .all()
    )
    // Spec §12 A: participation snaps against nflverse's snap counts, through nflverse's id table.
    const players = parseCsv((await client.nflverseCsv('players', 'players')) ?? '')
    db.exec('CREATE TEMP TABLE ids (gsis TEXT PRIMARY KEY, pfr TEXT)')
    const insert = db.prepare('INSERT OR IGNORE INTO ids VALUES (?, ?)')
    for (const p of players)
      if (p.gsis_id && p.pfr_id && p.pfr_id !== 'NA') insert.run(p.gsis_id, p.pfr_id)
    for (const side of ['offense', 'defense']) {
      const key = side === 'offense' ? 'off_snaps' : 'def_snaps'
      console.log(
        side,
        db
          .prepare(
            `SELECT s.season, COUNT(*) AS weeks,
             ROUND(AVG(ABS(COALESCE(json_extract(p.data_json, '$.${key}'), 0) - json_extract(s.data_json, '$.${side}_snaps')) = 0), 4) AS exact,
             ROUND(AVG(ABS(COALESCE(json_extract(p.data_json, '$.${key}'), 0) - json_extract(s.data_json, '$.${side}_snaps')) <= 1), 4) AS within1
           FROM wh_player_week s JOIN ids ON ids.pfr = s.player_key
           LEFT JOIN wh_player_week p ON p.source = 'part' AND p.season = s.season
             AND p.season_type = s.season_type AND p.week = s.week AND p.player_key = ids.gsis
           WHERE s.source = 'snaps' AND json_extract(s.data_json, '$.${side}_snaps') > 0
             AND EXISTS (SELECT 1 FROM wh_source_state w WHERE w.source = 'part' AND w.season = s.season)
           GROUP BY s.season ORDER BY s.season`
          )
          .all()
      )
    }
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    db.close()
    console.log({ megabytes: statSync(path).size / 1e6 })
  }
)
```

Run: `npx vitest run tests/zz-v-live.test.ts --reporter=verbose`

Expected (measured 2026-10-12, state season 2026, week 5: 16 steps in 147 s, the whole script about 4 min):

- Every `wh:pbp:<season>` and `wh:snaps:<season>` step is `ok`. Exception: `wh:pbp:<current>` notes "part <current> not published yet".
- 2019–2022 note "part: 716–809 rows matched no play" (deleted plays). No step notes FTN misses.
- `ftn` ≈ 2.6 MB and `part` ≈ 16 MB of JSON; `pbp` ≈ 27 MB as before.
- **Gates:**
  - No `ftn` misses.
  - Participation misses ≤ 2 % of a season's rows (2019 has 774 of 48,034).
  - `within1` ≥ 0.985 for offense and defense in every season.
  - If any gate fails, stop here and report the per-season numbers to the user.
- A step that fails with "terminated" or "fetch failed" is a dropped download. Re-run the file, or the step, before judging the gates.

Record the numbers for the Status block. Then `rm tests/zz-v-live.test.ts` and do not commit it.

- [ ] **Step 2: Document the FTN and participation rows**

In `docs/reference/stats-warehouse.md`:

- In the opening paragraph, change "plus about 50 MB of play-by-play since v0.21.0)" to "plus about 50 MB of play-by-play since v0.21.0 and about 32 MB of FTN and participation since v0.22.0)".
- Add these rows at the end of the Sources table:

```md
| `ftn` | nflverse `ftn_charting/ftn_charting_{season}` (2022+), joined to play-by-play (below) | gsis / team | player-week, team-week |
| `part` | nflverse `pbp_participation/pbp_participation_{season}` (through the prior season), joined to play-by-play (below) | gsis / team | player-week, team-week |
```

- Add this section before `## Sync`:

```md
## FTN charting and participation (`ftn`, `part`, since v0.22.0)

The play-by-play step also downloads FTN charting (2022+) and nflverse participation (2019 through the prior season; the current season is not published) and joins them to play-by-play on `game_id` + `play_id`. Neither file has player ids, so each row is credited to the play's passer, rusher and target (where `pbp` counts them) or, for participation, to the players listed on the field. Team sides always come from play-by-play.

- **Snaps** (`off_snaps`, `def_snaps`, personnel) count every play with a pass or run flag, a kneel or a spike, penalty-wiped snaps and two-point tries included. That matches nflverse's `snap_counts` exactly on 94–96 % of player-weeks and within one snap on ≥ 99 %. The rest are snaps blown dead with no pass or run flag (too many men on the field).
- **Everything else** follows the `pbp` rules: `off_dropbacks` lines up with `pass_dropbacks` / `rec_targets`, team counts with `off_plays`.
- **Format change in 2023.** Personnel is normalised: offense = backs then tight ends (`11`, `12`, `21`), defense = defensive backs (`4`, `5`, `6`). Formation, route and coverage are stored as published, and their names changed: formations SHOTGUN / SINGLEBACK / I_FORM / EMPTY / PISTOL / JUMBO / WILDCAT through 2022, SHOTGUN / UNDER CENTER / PISTOL from 2023; HITCH → HITCH/CURL, OUT → QUICK OUT / DEEP OUT; COMBO and COVER_9 coverages from 2023. `time_to_throw` is rounded to 0.1 s from 2023.

**`ftn` player-weeks:**

| Prefix  | Rows                       | Keys                                                                                                                                                                                                                        |
| ------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pass_` | dropbacks, the dropback QB | `pa_dropbacks` / `pa_epa_sum` (play action), `blitz_dropbacks` / `blitz_epa_sum` (EPA sums of `qb_epa`), `rpo`, `screens`, `out_of_pocket`, `int_worthy`, `throwaways`, `qb_fault_sacks`, `read` (`{ read_thrown: count }`) |
| `rush_` | carries                    | `box_sum` / `box_n`, `box_8p` (8+ in the box), `rpo`, `qb_sneaks`                                                                                                                                                           |
| `rec_`  | targets                    | `catchable`, `contested`, `contested_catches`, `created`, `drops`, `screen_tgt`                                                                                                                                             |

**`ftn` team-weeks** (`off_` / `def_`, scrimmage snaps): `motion`, `play_action`, `rpo`, `screens`, `trick_plays`, `no_huddle`, `box_sum` / `box_n`; on dropbacks `blitzes`, `rushers_sum` / `rushers_n`.

**`part` player-weeks:**

| Prefix  | Rows                          | Keys                                                                                                        |
| ------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `off_`  | everyone on offense, on snaps | `snaps`, `personnel` (`{ group: count }`), `dropbacks` (the route proxy), `dropbacks_man`, `dropbacks_zone` |
| `def_`  | everyone on defense, on snaps | `snaps`                                                                                                     |
| `rec_`  | targets                       | `routes` (`{ route: count }`), `tgt_man`, `tgt_zone`, `yds_man`, `yds_zone`                                 |
| `pass_` | dropbacks, the dropback QB    | `ttt_sum` / `ttt_n` (time to throw), `pressured`, `pressured_epa_sum`                                       |

**`part` team-weeks** (`off_` / `def_`, scrimmage snaps): `personnel`, `dbs`, `formation` (maps), `box_sum` / `box_n`; on dropbacks `rushers_sum` / `rushers_n`, `man`, `zone`, `coverage` (map), `pressures`. `off_personnel` is the team's own group and `def_personnel` the group its defense faced; `off_dbs` is the defensive backs its offense faced and `def_dbs` its own.

A box or pass-rusher count of 0 means not charted and is left out of the sums. Rows that match no play (deleted plays, 716–809 a season of participation through 2022) are counted in the step message.
```

- In `## Sync`, add a last bullet:

```md
- The play-by-play step writes three sources, each due on its own: `pbp`, `ftn` (from 2022) and `part`. A join that is not published yet (participation for the current season) is noted in the step message and retried daily.
```

- In `## Reading it`, add after the last example:

````md
```sql
-- targets per route run (dropbacks on the field), 2025 regular season, receivers with 200+ routes
SELECT r.player_key,
       SUM(json_extract(r.data_json, '$.off_dropbacks')) AS routes,
       1.0 * SUM(COALESCE(json_extract(t.data_json, '$.rec_targets'), 0)) / SUM(json_extract(r.data_json, '$.off_dropbacks')) AS tprr
FROM wh_player_week r
LEFT JOIN wh_player_week t ON t.source = 'pbp' AND t.season = r.season AND t.season_type = r.season_type
  AND t.week = r.week AND t.player_key = r.player_key
WHERE r.source = 'part' AND r.season = 2025 AND r.season_type = 'REG'
GROUP BY r.player_key HAVING routes >= 200 ORDER BY tprr DESC LIMIT 20;
```
````

Then:

```bash
npx prettier --write docs/reference/stats-warehouse.md
git add docs/reference/stats-warehouse.md
git commit -m "docs: document FTN and participation"
```

- [ ] **Step 3: Write the amendments into the spec**

In `docs/superpowers/specs/2026-10-09-stats-warehouse-design.md`:

- Change the header's status to `approved 2026-10-09, amended 2026-10-11 (§10: size; §11: play-by-play counting) and 2026-10-12 (§12: FTN and participation)`.
- In §6.1, change "`ftn` (first season 2022) and `part` (participation, published for 2016–2025 today)" to "`ftn` (first season 2022) and `part` (participation, published for 2016–2025 today; each due on its own, §12)".
- Append:

```md
## 12. Amendment 2026-10-12: FTN and participation (Plan V)

Plan V was planned against the real 2019–2026 files and nflverse's own `snap_counts`. That changed §4.2 and §6.1, §6.4–§6.5 as follows. With these rules, FTN rows find their play 100 % in every season, participation rows 100 % from 2023 (through 2022, the 716–809 a season that miss are deleted plays), and participation snaps are within one of nflverse's snap counts on 98.98–99.98 % of player-weeks in every season.

- **Snaps follow nflverse's snap counts.** A player gets a snap on every play with a `pass` or `rush` flag, a kneel or a spike, penalty-wiped snaps and two-point tries included (94–96 % exact; the `pbp` rule of §11 gave 30 %). Snaps blown dead with no pass or run flag ("too many men on the field") are not counted: counting them helps 2022–2025 and hurts 2019. Everything else in the joins follows §11, so dropbacks on the field line up with `pbp` dropbacks and targets, and team counts with `off_plays`.
- **Roles come from the play index:** the dropback passer, the rusher and the target exactly where the `pbp` families count them. Team sides always come from play-by-play (participation's `possession_team` flips on kickoffs before 2023 and disagrees on ~1,100 plays of 2019). QB sneaks are a rusher count (`rush_qb_sneaks`).
- **Personnel is normalised.** From 2023 participation lists every position ("1 C, 2 G, 1 QB, 1 RB, 2 T, 1 TE, 3 WR") instead of "1 RB, 1 TE, 3 WR". The offense is stored as backs then tight ends (`11`), the defense as its number of defensive backs (`dbs`). Formation, route and coverage are stored as published; their names changed in 2023. `ngs_air_yards` (empty from 2023), the name / number / position lists and `players_on_play` are not stored.
- **Each source of a step is due on its own** under §4.2, from its own first season (FTN: 2022), and a step writes and records only the sources it returns, by default the due ones. Play-by-play is downloaded whenever one of the three is due, but its rows are rewritten only when `pbp` is due. A join file that is not published is noted in the message, not recorded, and retried after 24 h; a run with nothing to write is `skipped`.
- **Additions:** dropbacks on the field split by man and zone (`off_dropbacks_man`, `off_dropbacks_zone`).
- **Storage:** a box or pass-rusher count of 0 means not charted and is left out of the sums; FTN booleans are `TRUE` / `FALSE` and cells are trimmed; `read_thrown` 0 is not tallied.
- **Size:** 2019–2026 adds about 32 MB to `warehouse.db` (18.5 MB of JSON, measured 2026-10-12). The first run after the upgrade downloads play-by-play again for every season, once (~460 MB in all, in the background).
```

Then:

```bash
npx prettier --write docs/superpowers/specs/2026-10-09-stats-warehouse-design.md
git add docs/superpowers/specs/2026-10-09-stats-warehouse-design.md
git commit -m "docs(spec): amend warehouse spec for plan V"
```

- [ ] **Step 4: Final verification**

Run: `npm run typecheck && npx eslint src tests electron.vite.config.ts && npm test`
Expected: all green, about 834 tests (+5 skipped). Note the count.

Note the size of `~/.config/FantasyCompanion/warehouse.db` (587 MB before this plan). Then run `npm run dev` with the Bash tool's `run_in_background`. The launch refresh runs first, then the warehouse in the background. On this first run every season 2019 → prior season has `part` due, and 2022+ also has `ftn`, so the warehouse downloads play-by-play plus the joins for each season through the worker. Expect ~25–45 s a season on this connection.

Watch the log for main-process errors. Wait until the warehouse log shows the last `wh:pbp:<current>` row finished (query below), then stop the app. Kill it by PID from `ps -eo pid,args | grep '[e]lectron/dist/electron'`. Check:

```bash
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1],{readOnly:true});console.log(db.prepare(\"SELECT source,status,rows_written,message,started_at,finished_at FROM sync_log WHERE source LIKE 'wh:pbp:%' ORDER BY id DESC LIMIT 12\").all());console.log(db.prepare(\"SELECT source,season,rows,sealed FROM wh_source_state WHERE source IN ('ftn','part') ORDER BY source,season\").all())" ~/.config/FantasyCompanion/warehouse.db
ls -la ~/.config/FantasyCompanion/warehouse.db ~/.config/FantasyCompanion/companion.db
```

Expected:

- Every `wh:pbp:<season>` is `ok`, and the current season notes "part <season> not published yet".
- `ftn` has state for 2022 → current, and `part` for 2019 → prior, with 2019 → current − 2 sealed.
- If only the current and prior seasons ran, the older `wh:pbp:*` steps were attempted less than 24 h ago (Plan U's backfill). Re-run the app a day later rather than forcing; this is spec §4.2.
- A step that errored with "terminated" or "fetch failed" is a dropped download. It is retried on the next day's run; note it in the Status block.
- `companion.db` is unchanged (~116 MB).
- **Gate:** `warehouse.db` ≤ 675 MB (about 620 expected). If it is larger, stop and report.
- If WSLg can't show the window, say so in the Status block.

- [ ] **Step 5: Merge and tag**

```bash
git checkout main && git merge --no-ff feat/stats-warehouse-v -m "merge: feat/stats-warehouse-v (plan V)"
npm version minor --no-git-tag-version
git add package.json package-lock.json
git commit -m "build: bump version to 0.22.0"
git tag -a v0.22.0 -m "build: bump version to 0.22.0"
```

Expected: `package.json` at `0.22.0`, with an annotated tag `v0.22.0`. Without `--no-git-tag-version`, `npm version` refuses the dirty tree (the unrelated `.gitignore`). **Ask the user before** `git push --follow-tags`, which triggers the Windows release workflow.

- [ ] **Step 6: Status block**

Replace this plan's `**Status:**` line with:

- the completion date;
- the merge and tag hashes;
- the test count;
- the Step 1 numbers (seconds, MB per source, misses, per-season snap agreement);
- the Step 4 numbers (`warehouse.db` size, backfill time, any dropped downloads);
- what was not verified (GUI; the packaged asar worker until the user runs the Windows build).

Then:

```bash
npx prettier --write docs/superpowers/plans/2026-10-12-plan-v-ftn-and-participation.md
git add docs/superpowers/plans/2026-10-12-plan-v-ftn-and-participation.md
git commit -m "docs(plan): mark plan V complete"
```

---

## Self-review against the spec

| Spec                                                                                                                                                              | Where                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| §6.1 one step per season producing `pbp`, `ftn` (first season 2022), `part`; due if any is due; per-source state                                                  | Task 5 (per-source due and writes), Task 6 (the step) |
| §6.1 downloads play-by-play plus each due source's file; a 404 for FTN or participation is a per-source skip, retried daily                                       | Task 6; Task 5 (noted, not recorded); amendment D     |
| §6.1 the worker posts rows per source; one transaction per step                                                                                                   | Task 6 (`SeasonResult`); `refreshWarehouse` as is     |
| §6.1 play index keyed by `game_id` + `play_id`; FTN on (`nflverse_game_id`, `nflverse_play_id`), participation on (`nflverse_game_id`, `play_id`); misses counted | Tasks 2, 3, 4 (`forEachJoinedRow`); Task 6 notes      |
| §6.1 sums and counts only; per-source aggregator versions                                                                                                         | Tasks 3–4 (`Bag`); Task 6 (`ftn` v1, `part` v1)       |
| §6.4 passer, receiver, rusher, team                                                                                                                               | Task 3 (QB sneaks on the rusher, amendment B)         |
| §6.5 player snaps, dropbacks on the field, personnel, routes, man / zone; passer; defender; team                                                                  | Task 4 (amendments A, C, E)                           |
| §4.2 first season per source, never attempted before it                                                                                                           | Task 5                                                |
| §4.3 120 s timeout, `.csv` fallback, missing key column fails                                                                                                     | `nflverseFile` as is; Tasks 3–4 (`requireColumns`)    |
| §7 hand-built rows with matching FTN and participation rows, worked by hand; join misses; sums not rates                                                          | Tasks 2–4, 6                                          |
| §7 manual check: first-sync time and size in the Status block                                                                                                     | Task 7                                                |
| §8 Plan V ends with a release                                                                                                                                     | Task 7 (`v0.22.0`)                                    |
